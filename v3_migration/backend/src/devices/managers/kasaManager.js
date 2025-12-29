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
// Track offline devices with backoff - don't poll them as often
const offlineDevices = new Map(); // deviceId -> { failCount, lastAttempt }
// Track which devices successfully responded during current session
const respondedThisSession = new Set(); // deviceId
// Startup grace period - don't log offline until we've had time to poll everything
let startupComplete = false;
let startupOfflineSummaryLogged = false;
const STARTUP_GRACE_PERIOD_MS = 90000; // 90 seconds to let all devices respond
const MAX_BACKOFF_MINUTES = 5; // Max time between retries for offline devices

function addDevice(device) {
    try {
        if (!device || typeof device.getSysInfo !== 'function') {
            logger.log(`Invalid device ignored: ${JSON.stringify(device)}`, 'warn', false, 'kasa:warn');
            return;
        }
        devices.set(device.deviceId, device);
        // Clear offline status when device is added/rediscovered
        offlineDevices.delete(device.deviceId);
        logger.log(`Added device: ${device.alias} (ID: ${device.deviceId}, Type: ${device.deviceType})`, 'info', false, `kasa:device:${device.deviceId}`);
    } catch (err) {
        logger.log(`Error adding device ${device?.alias || 'unknown'}: ${err.message}`, 'error', false, 'kasa:error');
    }
}

function getDevices() {
    const deviceList = Array.from(devices.values());
    // Only log this occasionally to reduce log spam
    // logger.log(`Returning ${deviceList.length} Kasa devices`, 'info', false, 'kasa:devices');
    return deviceList;
}

function getDeviceById(id) {
    const device = devices.get(id);
    // Only log when device not found (reduce noise)
    if (!device) {
        logger.log(`Device not found by ID ${id}`, 'warn', false, `kasa:device:${id}`);
    }
    return device;
}

// Check if we should skip polling an offline device (backoff logic)
function shouldSkipOfflineDevice(deviceId) {
    const offlineInfo = offlineDevices.get(deviceId);
    if (!offlineInfo) return false;
    
    const backoffMs = Math.min(offlineInfo.failCount * 30000, MAX_BACKOFF_MINUTES * 60000); // 30s per fail, max 5 min
    const timeSinceLastAttempt = Date.now() - offlineInfo.lastAttempt;
    return timeSinceLastAttempt < backoffMs;
}

// Mark device as offline with backoff
function markDeviceOffline(deviceId) {
    const existing = offlineDevices.get(deviceId) || { failCount: 0, logged: false };
    offlineDevices.set(deviceId, {
        failCount: existing.failCount + 1,
        lastAttempt: Date.now(),
        logged: existing.logged  // PRESERVE the logged flag!
    });
}

// Mark device as online (clear backoff) - called when TCP polling succeeds
function markDeviceOnline(deviceId, deviceAlias, deviceHost) {
    const wasOffline = offlineDevices.get(deviceId);
    if (wasOffline && wasOffline.logged && startupComplete) {
        // Device was logged as offline, now it's back - log recovery
        logger.log(`🟢 Device online: ${deviceAlias || deviceId} (IP: ${deviceHost || 'unknown'}) - recovered after ${wasOffline.failCount} failed polls`, 'info', false, `kasa:online:${deviceId}`);
    }
    offlineDevices.delete(deviceId);
}

async function refreshDeviceStatus(device, io, notificationEmitter) {
    try {
        if (!device || typeof device.getSysInfo !== 'function') {
            return; // Silently skip invalid devices
        }
        
        // Skip polling for devices in backoff period
        if (shouldSkipOfflineDevice(device.deviceId)) {
            return;
        }
        
        const sysInfo = await device.getSysInfo();
        
        // Device responded! Track it as responsive this session
        respondedThisSession.add(device.deviceId);
        markDeviceOnline(device.deviceId, device.alias, device.host);
        
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
                // Reduce log noise - only log energy in verbose mode
            } catch (err) {
                // Silently ignore energy fetch errors for devices that may not support it
            }
        }
        
        // Check if state actually changed before notifying
        const oldState = device.state;
        const stateChanged = !oldState || 
            oldState.on !== state.on || 
            oldState.brightness !== state.brightness;
        
        // Track ON/OFF change separately for Telegram (don't spam on brightness changes)
        const onOffChanged = !oldState || oldState.on !== state.on;
        
        device.state = state;
        device.energy = energy;
        // Only log state changes, not every refresh
        if (stateChanged && io) {
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
            io.emit('device-state-update', stateToEmit);
            
            // Only send Telegram on ON/OFF changes, not brightness/color changes
            if (onOffChanged && notificationEmitter) {
                const status = state.on ? 'ON' : 'OFF';
                // Use 💡 for bulbs OR devices with lighting capability (some bulbs report as 'plug')
                const isBulb = device.deviceType === 'bulb' || (device.lighting && typeof device.lighting.getLightState === 'function');
                const emoji = isBulb ? '💡' : '🔌';
                notificationEmitter.emit('notify', `${emoji} *${device.alias}* turned *${status}*`);
            }
        }
    } catch (err) {
        // TCP polling failed - THIS is the reliable offline detection
        const existingInfo = offlineDevices.get(device.deviceId);
        const wasResponding = respondedThisSession.has(device.deviceId);
        
        if (existingInfo) {
            // Already tracked as offline - increment fail count silently
            existingInfo.lastAttempt = Date.now();
            existingInfo.failCount++;
        } else {
            // First failure - start tracking
            offlineDevices.set(device.deviceId, {
                failCount: 1,
                lastAttempt: Date.now(),
                logged: false
            });
        }
        
        // Only log ONCE after startup if device was previously responding
        const offlineInfo = offlineDevices.get(device.deviceId);
        if (startupComplete && wasResponding && !offlineInfo.logged && offlineInfo.failCount >= 3) {
            // Device WAS working, has now failed 3+ polls - this is truly offline
            offlineInfo.logged = true;
            respondedThisSession.delete(device.deviceId);
            logger.log(`🔴 Device offline: ${device.alias} (ID: ${device.deviceId}, IP: ${device.host}) - failed ${offlineInfo.failCount} polls`, 'warn', false, `kasa:offline:${device.deviceId}`);
        }
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
                    await logger.log(`Ignoring already discovered device: ${device.alias} (ID: ${device.deviceId})`, 'info', false, `kasa:device:${device.deviceId}`);
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
            .on('device-offline', (device) => {
                // COMPLETELY IGNORE this event - it's unreliable (UDP-based)
                // The library fires this repeatedly even for devices that respond to TCP polling fine
                // We rely ONLY on refreshDeviceStatus TCP polling failures to detect true offline state
                // DO NOT LOG ANYTHING HERE - this is the source of the spam!
            })
            .on('device-online', (device) => {
                // Just track internally - don't log (we log in refreshDeviceStatus on recovery)
                markDeviceOnline(device.deviceId);
                respondedThisSession.add(device.deviceId);
            })
            .on('error', (err) => logger.log(`Discovery error: ${err.message}`, 'error', false, 'kasa:error'));
        
        // Schedule startup summary after grace period
        setTimeout(() => {
            startupComplete = true;
            if (!startupOfflineSummaryLogged) {
                startupOfflineSummaryLogged = true;
                const allDevices = getDevices();
                const unreachable = allDevices.filter(d => !respondedThisSession.has(d.deviceId));
                if (unreachable.length > 0) {
                    const names = unreachable.map(d => d.alias).join(', ');
                    logger.log(`📊 Kasa startup summary: ${unreachable.length}/${allDevices.length} devices unreachable: ${names}`, 'warn', false, 'kasa:startup-summary');
                } else {
                    logger.log(`📊 Kasa startup summary: All ${allDevices.length} devices responding`, 'info', false, 'kasa:startup-summary');
                }
            }
        }, STARTUP_GRACE_PERIOD_MS);
        
        const baseInterval = parseInt(process.env.KASA_POLLING_INTERVAL, 10) || 10000; // Increased default to 10s
        let pollCount = 0;
        setInterval(async () => {
            pollCount++;
            const deviceList = getDevices();
            const onlineCount = deviceList.length - offlineDevices.size;
            // Only log every 12th poll (once per minute at 5s interval, or every 2min at 10s)
            if (pollCount % 12 === 1) {
                await logger.log(`🔄 Kasa poll: ${onlineCount}/${deviceList.length} online, ${offlineDevices.size} in backoff`, 'info', false, 'kasa:poll');
            }
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
    await logger.log('Forcing Kasa rescan...', 'info', false, 'kasa:force-rescan');
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