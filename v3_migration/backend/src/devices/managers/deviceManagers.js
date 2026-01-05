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

/**
 * Get a flat array of ALL devices from all sources
 * @returns {Array} - All devices with their prefixed IDs
 */
function getAllDevicesFlat() {
  const byPrefix = getAllDevices();
  const flat = [];
  for (const devices of Object.values(byPrefix)) {
    flat.push(...devices);
  }
  return flat;
}

/**
 * Find a device by ID, handling prefix mismatches
 * @param {string} id - Device ID in any format (with or without prefix)
 * @returns {object|null} - Device object or null if not found
 */
function findDeviceById(id) {
  if (!id) return null;
  const normalizedId = normalizeDeviceId(id);
  const strippedId = stripDevicePrefix(id);
  
  const allDevices = getAllDevicesFlat();
  return allDevices.find(d => 
    d.id === id || 
    d.id === normalizedId || 
    d.id === strippedId ||
    stripDevicePrefix(d.id) === strippedId
  ) || null;
}

// =========================================================================
// DEVICE ID NORMALIZATION UTILITIES
// These are the canonical functions for handling device IDs across the app
// =========================================================================

/**
 * Normalize device ID to internal format (with prefix)
 * @param {string} id - Device ID in any format
 * @returns {string} - Normalized ID with appropriate prefix
 */
function normalizeDeviceId(id) {
  if (!id || typeof id !== 'string') return id;
  // Already has a recognized prefix
  if (id.startsWith('ha_') || id.startsWith('kasa_') || id.startsWith('hue_') || id.startsWith('shelly_')) {
    return id;
  }
  // Assume HA entity if it looks like one (has a dot like "light.xxx")
  if (id.includes('.')) {
    return `ha_${id}`;
  }
  // Otherwise return as-is (might be a direct IP or unknown format)
  return id;
}

/**
 * Strip device ID prefix for API calls
 * @param {string} id - Device ID with or without prefix
 * @returns {string} - Raw ID for API calls
 */
function stripDevicePrefix(id) {
  if (!id || typeof id !== 'string') return id;
  if (id.startsWith('ha_')) return id.slice(3);
  if (id.startsWith('kasa_')) return id.slice(5);
  if (id.startsWith('hue_')) return id.slice(4);
  if (id.startsWith('shelly_')) return id.slice(7);
  return id;
}

/**
 * Check if two device IDs refer to the same device
 * @param {string} id1 - First device ID
 * @param {string} id2 - Second device ID
 * @returns {boolean} - True if same device
 */
function isSameDevice(id1, id2) {
  if (!id1 || !id2) return false;
  return stripDevicePrefix(id1) === stripDevicePrefix(id2);
}

/**
 * Get the device source type from ID
 * @param {string} id - Device ID
 * @returns {string} - Source type: 'ha', 'kasa', 'hue', 'shelly', or 'unknown'
 */
function getDeviceSource(id) {
  if (!id || typeof id !== 'string') return 'unknown';
  if (id.startsWith('ha_')) return 'ha';
  if (id.startsWith('kasa_')) return 'kasa';
  if (id.startsWith('hue_')) return 'hue';
  if (id.startsWith('shelly_')) return 'shelly';
  // Infer from format
  if (id.includes('.')) return 'ha'; // HA entities have dots
  return 'unknown';
}

/**
 * Get the API endpoint info for a device
 * @param {string} id - Device ID
 * @returns {object} - { endpoint, cleanId, source }
 */
function getDeviceApiInfo(id) {
  const source = getDeviceSource(id);
  const cleanId = stripDevicePrefix(id);
  const endpoints = {
    ha: '/api/lights/ha',
    kasa: '/api/lights/kasa',
    hue: '/api/lights/hue',
    shelly: '/api/lights/shelly',
    unknown: '/api/lights/ha' // Default to HA
  };
  return { endpoint: endpoints[source], cleanId, source };
}

function getManager(prefix) {
  return managers[prefix] || null;
}

module.exports = { 
  // Initialization
  initializeDevices, 
  
  // Device access
  getAllDevices,
  getAllDevicesFlat,
  findDeviceById,
  getManager,
  
  // Device control
  controlDevice, 
  
  // ID utilities (CANONICAL - use these everywhere!)
  normalizeDeviceId,
  stripDevicePrefix,
  isSameDevice,
  getDeviceSource,
  getDeviceApiInfo
};