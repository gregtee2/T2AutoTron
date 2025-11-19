const logger = require('../../logging/logger');

class DeviceService {
  constructor(managers, { controlDeviceBase, initializeDevices }) {
    this.managers = managers; // Keyed by prefix (e.g., 'ha_', 'hue_')
    this.controlDeviceBase = controlDeviceBase;
    this.initializeDevices = initializeDevices;
    this.lastStates = {};
    this.io = null;
  }

  setIo(io) {
    this.io = io;
  }

  getLastStates() {
    return this.lastStates;
  }

  updateLastStates(deviceId, state) {
    this.lastStates[deviceId] = state;
  }

  async initialize(io, notificationEmitter, logger) {
    const devices = await this.initializeDevices(io, notificationEmitter, logger);
    return devices;
  }

  async controlDevice(deviceId, state) {
    try {
      const result = await this.controlDeviceBase(deviceId, state, this.io);
      if (result.success) {
        this.updateLastStates(deviceId, { ...state, id: deviceId, timestamp: new Date().toISOString() });
        if (this.io) {
          this.io.emit('device-state-update', this.lastStates[deviceId]);
        }
      }
      return result;
    } catch (error) {
      logger.log('error', `Failed to control device ${deviceId}: ${error.message}`, { key: `error:device:${deviceId}`, stack: error.stack });
      return { success: false, error: error.message };
    }
  }

  getAllDevices() {
    const devices = {};
    for (const [prefix, manager] of Object.entries(this.managers)) {
      devices[prefix] = manager.getDevices ? manager.getDevices() : [];
    }
    return devices;
  }
}

module.exports = DeviceService;