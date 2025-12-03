const logger = require('../../logging/logger');
const { loadManagers } = require('../pluginLoader');

let cachedDevices = null;
let managers = {};

async function initializeDevices(io, notificationEmitter, wrappedLog = logger.log.bind(logger)) {
  await wrappedLog('Initializing devices...', 'info', false, 'devices:init');
  managers = await loadManagers();
  cachedDevices = {};

  for (const [prefix, manager] of Object.entries(managers)) {
    try {
      const devices = await manager.initialize(io, notificationEmitter, wrappedLog);
      cachedDevices[prefix] = Array.isArray(devices) ? devices : [];
      await wrappedLog(`Initialized ${manager.name} devices: ${cachedDevices[prefix].length}`, 'info', false, `${prefix}:initialized`);
    } catch (err) {
      await wrappedLog(`${manager.name} setup failed: ${err.message}`, 'error', true, `error:${prefix}:setup`);
      cachedDevices[prefix] = [];
    }
  }

  await wrappedLog(
    `Devices initialized: ${Object.entries(cachedDevices).map(([k, v]) => `${k}=${v.length}`).join(', ')}`,
    'info',
    false,
    'devices:initialized'
  );
  return cachedDevices;
}

async function controlDevice(deviceId, state, io) {
  try {
    const prefix = deviceId.includes('_') ? deviceId.split('_')[0] + '_' : deviceId.split('-')[0] + '-';
    const manager = managers[prefix];
    if (!manager) {
      throw new Error(`Unknown device vendor for ID: ${deviceId}`);
    }
    return await manager.controlDevice(deviceId, state);
  } catch (error) {
    await logger.log(
      `Error controlling device ${deviceId}: ${error.message}`,
      'error',
      true,
      `error:control:${deviceId}`
    );
    return { success: false, error: error.message };
  }
}

function getAllDevices() {
  logger.log('Entering getAllDevices...', 'info', false, 'devices:getAll:start');
  const allDevices = {};

  for (const [prefix, manager] of Object.entries(managers)) {
    allDevices[prefix] = cachedDevices?.[prefix] || (manager.getDevices ? manager.getDevices() : []);
  }

  const sanitizedDevices = {};
  for (const [prefix, devices] of Object.entries(allDevices)) {
    sanitizedDevices[prefix] = Array.isArray(devices) ? devices : [];
  }

  logger.log(
    `Returning devices: ${Object.entries(sanitizedDevices).map(([k, v]) => `${k}=${v.length}`).join(', ')}`,
    'info',
    false,
    'devices:getAll:complete'
  );
  return sanitizedDevices;
}

module.exports = { initializeDevices, controlDevice, getAllDevices };