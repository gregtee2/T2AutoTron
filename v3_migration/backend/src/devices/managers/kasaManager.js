const { Client: KasaClient } = require('tplink-smarthome-api');
const logger = require('../../logging/logger');

// Create Kasa client with error handling options
const kasaClient = new KasaClient({
  logLevel: 'error', // Only log errors from the library
  timeout: 5000,     // 5 second timeout for device communication
});

// Handle any errors from the client itself
kasaClient.on('error', (err) => {
  logger.log(`Kasa client error: ${err.message}`, 'error', false, 'kasa:client-error');
});

const devices = new Map();
const discoveredIds = new Set();

function addDevice(device) {
    try {
        if (!device || typeof device.getSysInfo !== 'function') {
            logger.log(`Invalid device ignored: ${JSON.stringify(device)}`, 'warn', false, 'kasa:warn');
            return;
        }
        devices.set(device.deviceId, device);
        logger.log(`Added device: ${device.alias} (ID: ${device.deviceId}, Type: ${device.deviceType})`, 'info', false, `kasa:device:${device.deviceId}`);
    } catch (err) {
        logger.log(`Error adding device ${device?.alias || 'unknown'}: ${err.message}`, 'error', false, 'kasa:error');
    }
}

function getDevices() {
    const deviceList = Array.from(devices.values());
    logger.log(`Returning ${deviceList.length} Kasa devices (Bulbs: ${deviceList.filter(d => d.deviceType === 'bulb').length}, Plugs: ${deviceList.filter(d => d.deviceType === 'plug').length})`, 'info', false, 'kasa:devices');
    return deviceList;
}

function getDeviceById(id) {
    const device = devices.get(id);
    logger.log('info', `Fetching device by ID ${id}: ${device ? 'Found' : 'Not found'}`, null, `kasa:device:${id}`);
    return device;
}

async function refreshDeviceStatus(device, io, notificationEmitter) {
    try {
        if (!device || typeof device.getSysInfo !== 'function') {
            await logger.log(`Skipping invalid device in refresh`, 'warn', false, 'kasa:warn');
            return;
        }
        const sysInfo = await device.getSysInfo();
        let state = { on: sysInfo.relay_state === 1 };
        if (device.deviceType === 'bulb') {
            const lightState = await device.lighting.getLightState();
            state = {
                on: lightState.on_off === 1,
                brightness: lightState.brightness || null,
                hue: lightState.hue || 0,
                saturation: lightState.saturation || 0
            };
        }
        let energy = null;
        if (device.deviceType === 'plug' && device.supportsEmeter && device.emeter?.getRealtime) {
            try {
                const energyUsage = await device.emeter.getRealtime();
                energy = {
                    power: energyUsage.power_mw / 1000,
                    voltage: energyUsage.voltage_mv / 1000,
                    current: energyUsage.current_ma / 1000,
                    total: energyUsage.total_wh / 1000
                };
                await logger.log('info', `Fetched energy for ${device.alias}: ${JSON.stringify(energy)}`, null, `kasa:energy:${device.deviceId}`);
            } catch (err) {
                await logger.log('error', `Error fetching energy for ${device.alias}: ${err.message}`, null, `kasa:energy:error:${device.deviceId}`);
            }
        } else if (device.deviceType === 'plug') {
            await logger.log('warn', `Device ${device.alias} does not support energy metering`, null, `kasa:energy:unsupported:${device.deviceId}`);
        }
        
        // Check if state actually changed before notifying
        const oldState = device.state;
        const stateChanged = !oldState || 
            oldState.on !== state.on || 
            oldState.brightness !== state.brightness;
        
        device.state = state;
        device.energy = energy;
        await logger.log('info', `🔄 Refreshed: ${device.alias} - State: ${JSON.stringify(state)}, Energy: ${JSON.stringify(energy)}`, null, `kasa:refresh:${device.deviceId}`);
        if (io && notificationEmitter) {
            const stateToEmit = {
                id: `kasa_${device.deviceId}`,
                name: device.alias,
                type: device.deviceType,
                on: state.on,
                ...(state.brightness !== null && { brightness: state.brightness }),
                ...(state.hue !== 0 && { hue: state.hue }),
                ...(state.saturation !== 0 && { saturation: state.saturation }),
                ...(energy && { energyUsage: energy })
            };
            // Always emit socket update for UI
            io.emit('device-state-update', stateToEmit);
            // Only notify Telegram on actual state changes
            if (stateChanged) {
                notificationEmitter.emit('notify', `🔄 Kasa Update: ${device.alias} is ${state.on ? 'ON' : 'OFF'}${state.brightness ? `, Brightness: ${state.brightness}` : ''}${energy ? `, Power: ${energy.power.toFixed(2)} W` : ''}`);
            }
        }
    } catch (err) {
        await logger.log(`Refresh error for ${device?.alias || 'unknown'}: ${err.message}`, 'error', false, `kasa:error:${device?.deviceId || 'unknown'}`);
    }
}

async function controlKasaDevice(deviceId, state) {
    try {
        const id = deviceId.replace('kasa_', '');
        const device = getDeviceById(id);
        if (!device) throw new Error(`Kasa device ${id} not found`);
        if (device.deviceType === 'bulb') {
            const lightState = {
                on_off: state.on ? 1 : 0,
                ...(state.brightness !== undefined && { brightness: state.brightness }),
                ...(state.hue !== undefined && { hue: state.hue }),
                ...(state.saturation !== undefined && { saturation: state.saturation })
            };
            await device.lighting.setLightState(lightState);
        } else {
            await device.setPowerState(state.on);
        }
        await refreshDeviceStatus(device, null, null);
        await logger.log(`Controlled Kasa device ${deviceId}: ${JSON.stringify(state)}`, 'info', false, `kasa:control:${deviceId}`);
        return { success: true, state: device.state };
    } catch (error) {
        await logger.log(`Failed to control Kasa device ${deviceId}: ${error.message}`, 'error', false, `kasa:error:${deviceId}`);
        return { success: false, error: error.message };
    }
}

async function setupKasa(io, notificationEmitter) {
    try {
        await logger.log('Starting Kasa discovery...', 'info', false, 'kasa:init');
        devices.clear();
        discoveredIds.clear();
        kasaClient.startDiscovery({
            discoveryInterval: 1000,
            broadcast: process.env.KASA_BROADCAST_ADDRESS
        })
            .on('device-new', async (device) => {
                if (discoveredIds.has(device.deviceId)) {
                    await logger.log('info', `Ignoring already discovered device: ${device.alias} (ID: ${device.deviceId})`, null, `kasa:device:${device.deviceId}`);
                    return;
                }
                discoveredIds.add(device.deviceId);
                
                // Attach error handler to device to prevent uncaught socket errors
                if (device && typeof device.on === 'function') {
                    device.on('error', (err) => {
                        logger.log(`Device ${device.alias} socket error: ${err.message}`, 'warn', false, `kasa:device-error:${device.deviceId}`);
                    });
                }
                
                await logger.log(`🔍 Discovered: ${device.alias} (ID: ${device.deviceId}, Type: ${device.deviceType}, IP: ${device.host}, Model: ${device.model})`, 'info', false, `kasa:device:${device.deviceId}`);
                addDevice(device);
                await refreshDeviceStatus(device, io, notificationEmitter);
                const kasaDevices = getDevices();
                io.emit('device-list-update', {
                    kasa: kasaDevices.map(d => ({
                        id: `kasa_${d.deviceId}`,
                        name: d.alias,
                        host: d.host,
                        type: d.deviceType,
                        state: d.state,
                        energy: d.energy,
                        vendor: 'Kasa'
                    }))
                });
                await logger.log(`Emitted device-list-update with ${kasaDevices.length} devices`, 'info', false, 'kasa:devices');
            })
            .on('device-online', (device) => logger.log(`🟢 Device online: ${device.alias} (ID: ${device.deviceId}, IP: ${device.host})`, 'info', false, `kasa:online:${device.deviceId}`))
            .on('device-offline', (device) => logger.log(`🔴 Device offline: ${device.alias} (ID: ${device.deviceId}, IP: ${device.host})`, 'warn', false, `kasa:offline:${device.deviceId}`))
            .on('error', (err) => logger.log(`Discovery error: ${err.message}`, 'error', false, 'kasa:error'));
        const baseInterval = parseInt(process.env.KASA_POLLING_INTERVAL, 10) || 5000;
        setInterval(async () => {
            const deviceList = getDevices();
            const activeDevices = deviceList.filter(d => d.state?.on).length;
            const interval = baseInterval + (activeDevices * 1000);
            await logger.log(`🔄 Polling Kasa devices (interval: ${interval}ms, Total: ${deviceList.length}, Bulbs: ${deviceList.filter(d => d.deviceType === 'bulb').length}, Plugs: ${deviceList.filter(d => d.deviceType === 'plug').length})`, 'info', false, 'kasa:poll');
            await Promise.all(deviceList.map(device => refreshDeviceStatus(device, io, notificationEmitter)));
        }, baseInterval);
        const initialDevices = getDevices();
        await logger.log(`Initial Kasa discovery started: ${initialDevices.length} devices (Bulbs: ${initialDevices.filter(d => d.deviceType === 'bulb').length}, Plugs: ${initialDevices.filter(d => d.deviceType === 'plug').length})`, 'info', false, 'kasa:init');
        return initialDevices;
    } catch (err) {
        await logger.log(`Kasa setup failed: ${err.message}`, 'error', false, 'kasa:error');
        throw err;
    }
}

async function rescanKasaDevices(io, notificationEmitter) {
    try {
        await logger.log('Forcing Kasa device rescan...', 'info', false, 'kasa:rescan');
        devices.clear();
        discoveredIds.clear();
        kasaClient.stopDiscovery();
        await new Promise(resolve => setTimeout(resolve, 1000));
        return await setupKasa(io, notificationEmitter);
    } catch (err) {
        await logger.log(`Kasa rescan failed: ${err.message}`, 'error', false, 'kasa:error');
        throw err;
    }
}

async function forceRescan(io, notificationEmitter) {
    await logger.log('info', 'Forcing Kasa rescan...', null, 'kasa:force-rescan');
    return await rescanKasaDevices(io, notificationEmitter);
}

const kasaManager = {
    addDevice,
    getDevices,
    getDeviceById,
    supportsBrightness: (device) => device.deviceType === 'bulb' && 'brightness' in (device.state || {}),
    supportsColor: (device) => device.deviceType === 'bulb' && 'hue' in (device.state || {}),
    controlKasaDevice
};

module.exports = {
    setupKasa,
    rescanKasaDevices,
    forceRescan,
    kasaManager,
    // Export these directly for pluginLoader.js
    controlKasaDevice,
    getDevices
};