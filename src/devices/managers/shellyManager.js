// src/shellyManager.js
const { Shellies } = require('shellies-ng');
const fetch = require('node-fetch');
const chalk = require('chalk');

let shellies = new Shellies();
let shellyDevices = [];

async function scanSubnet(subnet = '192.168.1', wrappedLog = () => { }) {
    const devices = [];
    const promises = [];

    await wrappedLog(`Scanning subnet ${subnet}.0/24...`, 'info');
    for (let i = 1; i <= 254; i++) {
        const ip = `${subnet}.${i}`;
        promises.push(
            (async () => {
                const maxRetries = 2;
                for (let attempt = 1; attempt <= maxRetries; attempt++) {
                    try {
                        const configRes = await fetch(`http://${ip}/rpc/Sys.GetConfig`, {
                            timeout: 5000, // Increased to 5 seconds
                            headers: { 'User-Agent': 'T2AutoTron/1.0' }
                        });
                        if (!configRes.ok) {
                            // await wrappedLog(`No config response from ${ip}: HTTP ${configRes.status}`, 'warn', false, `scan:${ip}`);
                            continue;
                        }
                        const config = await configRes.json();
                        const mac = config.device?.mac?.toLowerCase() || `manual_${ip.replace(/\./g, '_')}`;
                        const name = config.device?.name || "Shelly Plus 1";
                        await wrappedLog(`Fetched config for ${ip}: MAC=${mac}, Name="${name}"`, 'info', false, `scan:config:${ip}`);

                        const statusRes = await fetch(`http://${ip}/rpc/Switch.GetStatus?id=0`, {
                            timeout: 5000,
                            headers: { 'User-Agent': 'T2AutoTron/1.0' }
                        });
                        if (!statusRes.ok) {
                            // await wrappedLog(`No status response from ${ip}: HTTP ${statusRes.status}`, 'warn', false, `scan:status:${ip}`);
                            continue;
                        }
                        const status = await statusRes.json();

                        return { ip, mac, name, state: { on: status.output, offline: false }, online: true };
                    } catch (err) {
                        if (attempt === maxRetries) {
                            // await wrappedLog(`Error scanning ${ip}: ${err.message}`, 'warn', false, `scan:error:${ip}`);
                            return null;
                        }
                        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                    }
                }
                return null;
            })()
        );
    }

    const results = await Promise.all(promises);
    results.forEach(device => {
        if (device && !devices.some(d => d.mac === device.mac)) {
            devices.push(device);
            wrappedLog(`Found Shelly device "${device.name}" at ${device.ip} with MAC ${device.mac}`, 'info', false, `scan:found:${device.mac}`);
        }
    });
    await wrappedLog(`Scan completed, found ${devices.length} devices`, 'info');
    return devices;
}

async function setupShelly(io, notificationEmitter, wrappedLog = () => { }) {
    if (!io || !notificationEmitter) {
        await wrappedLog('Invalid Socket.IO or notification emitter in setupShelly', 'error', true, 'error:setupShelly');
        throw new Error('Socket.IO or notification emitter is null');
    }

    shellyDevices = await scanSubnet('192.168.1', wrappedLog);
    if (shellyDevices.length === 0) {
        await wrappedLog('No devices found, adding test device', 'warn', false, 'scan:noDevices');
        shellyDevices = [{ ip: '192.168.1.100', mac: 'test1234', name: 'Test Shelly', state: { on: false, offline: false }, online: true }];
    }
    await wrappedLog('Starting Shelly device discovery via subnet scan...', 'info');

    shellyDevices.length = 0;
    shellyDevices = await scanSubnet('192.168.1', wrappedLog);
    console.log('Initial shellyDevices after scan:', JSON.stringify(shellyDevices, null, 2));

    if (shellyDevices.length === 0) {
        await wrappedLog('No Shelly devices found on initial scan', 'warn', false, 'scan:noDevices');
    } else {
        await wrappedLog(`Initialized ${shellyDevices.length} Shelly devices`, 'info', false, 'scan:initialized');
    }

    setInterval(async () => {
        try {
            await wrappedLog('🔄 Refreshing Shelly statuses...', 'info', false, 'refresh:shelly');
            for (const deviceInfo of shellyDevices) {
                const deviceId = `shellyplus1-${deviceInfo.mac}`;
                const maxRetries = 2;
                let success = false;
                for (let attempt = 1; attempt <= maxRetries; attempt++) {
                    try {
                        const response = await fetch(`http://${deviceInfo.ip}/rpc/Switch.GetStatus?id=0`, {
                            timeout: 5000,
                            headers: { 'User-Agent': 'T2AutoTron/1.0' }
                        });
                        if (response.ok) {
                            const data = await response.json();
                            deviceInfo.state = { on: data.output, offline: false };
                            deviceInfo.online = true;
                            if (io) {
                                io.emit('device-state-update', { id: deviceId, on: deviceInfo.state.on, vendor: "Shelly" });
                                await wrappedLog(`Shelly "${deviceInfo.name}" (${deviceId}) state polled: ${data.output ? 'ON' : 'OFF'}`, 'info', false, `refresh:${deviceId}`);
                            } else {
                                await wrappedLog(`Socket.IO unavailable for ${deviceId} state update`, 'warn', false, `refresh:io:${deviceId}`);
                            }
                            success = true;
                            break;
                        } else {
                            await wrappedLog(`Failed to poll Shelly ${deviceId}: HTTP ${response.status}`, 'warn', false, `offline:${deviceId}`, { offline: true, ip: deviceInfo.ip });
                        }
                    } catch (err) {
                        if (attempt === maxRetries) {
                            await wrappedLog(`Refresh error for "${deviceInfo.name}" (${deviceId}): ${err.message}`, 'error', true, `error:refresh:${deviceId}`, { offline: true, ip: deviceInfo.ip });
                            deviceInfo.state = { ...deviceInfo.state, offline: true };
                            deviceInfo.online = false;
                        }
                    }
                    if (!success && attempt < maxRetries) {
                        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                    }
                }
            }
        } catch (err) {
            await wrappedLog(`Shelly refresh error: ${err.message}`, 'error', true, 'error:refresh:shelly');
        }
    }, 10000);

    setInterval(async () => {
        await wrappedLog('🔄 Rescanning network for Shelly devices...', 'info', false, 'rescan:shelly');
        const newDevices = await scanSubnet('192.168.1', wrappedLog);
        newDevices.forEach(newDevice => {
            const existingDevice = shellyDevices.find(d => d.mac === newDevice.mac);
            if (existingDevice) {
                if (existingDevice.name !== newDevice.name || existingDevice.ip !== newDevice.ip) {
                    wrappedLog(`Updating Shelly device ${newDevice.mac}: Name "${existingDevice.name}" -> "${newDevice.name}", IP ${existingDevice.ip} -> ${newDevice.ip}`, 'info', false, `rescan:update:${newDevice.mac}`);
                    existingDevice.name = newDevice.name;
                    existingDevice.ip = newDevice.ip;
                }
                existingDevice.state = newDevice.state;
                existingDevice.online = newDevice.online;
            } else {
                shellyDevices.push(newDevice);
                wrappedLog(`New Shelly device discovered: "${newDevice.name}" at ${newDevice.ip} with MAC ${newDevice.mac}`, 'info', false, `rescan:new:${newDevice.mac}`);
                if (io) {
                    io.emit('device-state-update', {
                        id: `shellyplus1-${newDevice.mac}`,
                        on: newDevice.state.on,
                        vendor: "Shelly"
                    });
                }
            }
        });
        console.log('shellyDevices after rescan:', JSON.stringify(shellyDevices, null, 2));
        await wrappedLog(`Now tracking ${shellyDevices.length} Shelly devices`, 'info', false, 'rescan:complete');
    }, 300000);

    async function rescanShellyDevices() {
        await wrappedLog('Manual rescan triggered...', 'info', false, 'rescan:manual');
        shellyDevices.length = 0;
        shellyDevices = await scanSubnet('192.168.1', wrappedLog);
        console.log('shellyDevices after manual rescan:', JSON.stringify(shellyDevices, null, 2));
        await wrappedLog(`Manual rescan completed, now tracking ${shellyDevices.length} Shelly devices`, 'info', false, 'rescan:manual:complete');
        return shellyDevices;
    }

    async function controlShellyDevice(deviceId, state) {
        try {
            const mac = deviceId.replace('shellyplus1-', '');
            const device = shellyDevices.find(d => d.mac === mac);
            if (!device) {
                throw new Error(`Shelly device ${deviceId} not found`);
            }
            const response = await fetch(`http://${device.ip}/rpc/Switch.Set?id=0&on=${state.on}`, {
                timeout: 5000,
                headers: { 'User-Agent': 'T2AutoTron/1.0' }
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            device.state.on = state.on;
            device.online = true;
            await wrappedLog(`Controlled Shelly ${deviceId}: ${state.on ? 'ON' : 'OFF'}`, 'info', false, `control:${deviceId}`);
            if (io) {
                io.emit('device-state-update', { id: deviceId, on: state.on, vendor: "Shelly" });
            }
            return { success: true };
        } catch (err) {
            await wrappedLog(`Failed to control Shelly ${deviceId}: ${err.message}`, 'error', true, `error:control:${deviceId}`);
            return { success: false, error: err.message };
        }
    }

    return { devices: shellyDevices, rescan: rescanShellyDevices, controlShellyDevice };
}

function getShellyDevices() {
    console.log('getShellyDevices called, returning:', JSON.stringify(shellyDevices, null, 2));
    return shellyDevices;
}

module.exports = { setupShelly, getShellyDevices, shellies };