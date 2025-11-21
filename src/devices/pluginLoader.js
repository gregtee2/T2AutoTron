const fs = require('fs').promises;
const path = require('path');

async function loadManagers() {
  const logger = require('../logging/logger');
  const managerDir = path.join(__dirname, 'managers');
  const files = await fs.readdir(managerDir);
  const managers = {};

  for (const file of files) {
    if (file.endsWith('.js') && file !== 'deviceManagers.js') {
      try {
        const manager = require(path.join(managerDir, file));
        const normalizedManager = normalizeManager(manager, file);
        if (normalizedManager.prefix && normalizedManager.initialize && normalizedManager.controlDevice && normalizedManager.getDevices) {
          managers[normalizedManager.prefix] = normalizedManager;
          await logger.log(`Loaded manager: ${normalizedManager.name} (${normalizedManager.prefix})`, 'info', false, 'plugin:manager');
        }
      } catch (error) {
        await logger.log(`Failed to load manager ${file}: ${error.message}`, 'error', false, 'plugin:manager:error');
      }
    }
  }
  return managers;
}

function normalizeManager(manager, file) {
  const fileName = path.basename(file, '.js');
  if (manager.prefix && manager.initialize && manager.controlDevice && manager.getDevices) {
    return {
      name: manager.name,
      type: manager.type,
      prefix: manager.prefix,
      initialize: manager.initialize,
      controlDevice: manager.controlDevice,
      getDevices: manager.getDevices,
      shutdown: manager.shutdown || (async () => { })
    };
  }

  if (fileName === 'hueManager') {
    return {
      name: 'Hue',
      type: 'light',
      prefix: 'hue_',
      initialize: async (io, notificationEmitter, log) => await manager.setupHue(io, notificationEmitter),
      controlDevice: async (deviceId, state) => await manager.controlHueDevice(deviceId, state),
      getDevices: () => manager.hueLights.map(light => ({
        id: `hue_${light.id}`,
        name: light.name,
        type: light.type,
        state: light.state
      })),
      shutdown: async () => { }
    };
  }
  if (fileName === 'kasaManager') {
    return {
      name: 'Kasa',
      type: 'light',
      prefix: 'kasa_',
      initialize: async (io, notificationEmitter, log) => await manager.setupKasa(io, notificationEmitter, log),
      controlDevice: async (deviceId, state) => await manager.controlKasaDevice(deviceId, state),
      getDevices: () => manager.getDevices ? manager.getDevices() : [],
      shutdown: async () => { }
    };
  }
  if (fileName === 'shellyManager') {
    return {
      name: 'Shelly',
      type: 'light',
      prefix: 'shellyplus1-',
      initialize: async (io, notificationEmitter, log) => await manager.setupShelly(io, notificationEmitter, log),
      controlDevice: async (deviceId, state) => await manager.controlShellyDevice(deviceId, state),
      getDevices: () => manager.getShellyDevices ? manager.getShellyDevices() : [],
      shutdown: async () => { }
    };
  }
  throw new Error(`Manager ${fileName} does not conform to plugin interface`);
}

async function loadRoutes(app, io, deviceService) {
  const logger = require('../logging/logger');
  const routesDir = path.join(__dirname, '../api/routes');
  const files = await fs.readdir(routesDir);

  for (const file of files) {
    if (file.endsWith('Routes.js')) {
      try {
        const route = require(path.join(routesDir, file));
        const routeConfig = normalizeRoute(route, file);
        // Fix double slash issue if type is empty
        const routePath = routeConfig.type
          ? `/api/${routeConfig.type}s/${routeConfig.prefix}`
          : `/api/${routeConfig.prefix}`;

        const routeInstance = routeConfig.legacyParams
          ? route(...routeConfig.legacyParams)
          : route(io, deviceService);
        app.use(routePath, routeInstance);
        await logger.log(`Registered route: ${routePath}`, 'info', false, 'plugin:route');
      } catch (error) {
        await logger.log(`Failed to load route ${file}: ${error.message}`, 'error', false, 'plugin:route:error');
      }
    }
  }
}

function normalizeRoute(route, file) {
  const fileName = path.basename(file, '.js');
  const routeMap = {
    haRoutes: { type: 'light', prefix: 'ha', legacyParams: null },
    hueRoutes: { type: 'light', prefix: 'hue', legacyParams: [null, require('./managers/hueManager').hueLights, null] },
    kasaRoutes: { type: 'light', prefix: 'kasa', legacyParams: [null] },
    shellyRoutes: { type: 'light', prefix: 'shelly', legacyParams: [null] },
    deviceRoutes: { type: '', prefix: 'devices', legacyParams: null }, // Mounts at /api/devices
    nodeRoutes: { type: 'node', prefix: 'nodes', legacyParams: null }
  };
  return routeMap[fileName] || { type: fileName.replace('Routes', '').toLowerCase(), prefix: fileName.replace('Routes', '').toLowerCase(), legacyParams: null };
}

module.exports = { loadManagers, loadRoutes };