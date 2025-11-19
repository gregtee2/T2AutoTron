const logger = require('../logging/logger');
const { fetchWeatherData } = require('../weather/weatherService');
const { fetchForecastData } = require('../weather/forecastService');
const { normalizeState } = require('../utils/normalizeState');

module.exports = (deviceService) => (socket) => {
  logger.log(`Socket.IO client connected: ${socket.id}`, 'info', false, `socket:connect:${socket.id}`);
  socket.emit('server-ready', { ready: true, lastStates: deviceService.getLastStates() });

  // Emit initial device list
  const emitDeviceList = () => {
    const allDevices = deviceService.getAllDevices();
    const simplifiedDevices = {
      hue: (allDevices['hue_'] || []).map(light => ({
        id: `hue_${light.id}`,
        name: light.name,
        type: light.type,
        modelId: light.modelid || light.modelId,
        state: light.state,
        vendor: light.manufacturername === 'OSRAM' ? 'Osram' : 'Hue',
      })),
      kasa: (allDevices['kasa_'] || []).map(device => ({
        id: `kasa_${device.light_id || device.deviceId}`,
        name: device.alias,
        host: device.host,
        type: device.deviceType,
        state: device.state,
        vendor: 'Kasa',
      })),
      shelly: (allDevices['shellyplus1-'] || []).map(device => ({
        id: `shellyplus1-${device.mac}`,
        name: device.name || 'Shelly Plus 1',
        ip: device.ip,
        type: 'ShellyPlus1',
        state: device.state,
        vendor: 'Shelly',
      })),
      ha: (allDevices['ha_'] || []).map(device => {
        if (!device.entity_id || typeof device.entity_id !== 'string') {
          logger.log(`Invalid HA device: ${JSON.stringify(device)}`, 'error', false, 'ha:invalid_device');
          return null;
        }
        return {
          id: `ha_${device.entity_id}`,
          name: device.attributes?.friendly_name || device.entity_id.split('.')[1] || device.entity_id,
          type: device.entity_id.split('.')[0],
          state: { on: device.state === 'on' },
          vendor: 'HomeAssistant',
        };
      }).filter(device => device !== null),
    };
    socket.emit('device-list-update', simplifiedDevices);
  };
  emitDeviceList();

  // Initial weather/forecast
  fetchWeatherData().then(weatherData => {
    if (weatherData) socket.emit('weather-update', weatherData);
  });
  fetchForecastData().then(forecastData => {
    if (forecastData) socket.emit('forecast-update', forecastData);
  });

  // Handle device control
  socket.on('device-control', async (data) => {
    const { id, on, brightness, hue, saturation, transitiontime, hs_color } = data;
    if (!id || typeof on !== 'boolean') {
      logger.log(`Invalid device-control data: ${JSON.stringify(data)}`, 'error', false, 'error:device-control');
      socket.emit('control-error', { id, error: 'Invalid data' });
      return;
    }

    try {
      const state = {
        on,
        brightness: brightness ?? deviceService.getLastStates()[id]?.brightness,
        hue: hue ?? deviceService.getLastStates()[id]?.hue,
        saturation: saturation ?? deviceService.getLastStates()[id]?.saturation,
        transitiontime: transitiontime ?? deviceService.getLastStates()[id]?.transitiontime,
        hs_color: hs_color || (hue && saturation ? [hue, saturation] : deviceService.getLastStates()[id]?.hs_color),
      };
      let result;
      if (id.startsWith('ha_')) {
        const rawId = id.replace('ha_', '');
        const service = on ? 'light/turn_on' : 'light/turn_off';
        const payload = { entity_id: rawId };
        if (on) {
          if (state.brightness) payload.brightness_pct = Math.round(state.brightness);
          if (state.hs_color) payload.hs_color = state.hs_color;
          if (state.transitiontime) payload.transition = state.transitiontime / 1000;
        }
        result = await deviceService.controlDevice(id, { service, payload });
      } else {
        result = await deviceService.controlDevice(id, state);
      }

      if (result.success) {
        const updatedState = { ...deviceService.getLastStates()[id], ...state, id, timestamp: new Date().toISOString() };
        deviceService.updateLastStates(id, updatedState);
        socket.emit('device-state-update', updatedState);
        logger.log(`Device ${id} controlled successfully`, 'info', false, `device:success:${id}`);
      } else {
        throw new Error(result.error || 'Control failed');
      }
    } catch (error) {
      logger.log(`Failed to control device ${id}: ${error.message}`, 'error', false, `error:device:${id}`);
      socket.emit('control-error', { id, error: error.message });
    }
  });

  // Handle device toggle
  socket.on('device-toggle', async (data, callback) => {
    const { deviceId, vendor, action, transition, brightness, hue, saturation } = data;
    try {
      const state = {
        on: action === 'on',
        ...(brightness !== undefined ? { brightness } : {}),
        ...(hue !== undefined ? { hue } : {}),
        ...(saturation !== undefined ? { saturation } : {}),
        ...(transition !== undefined ? { transitiontime: transition } : {}),
      };
      const result = await deviceService.controlDevice(deviceId, state);
      if (result.success) {
        const updatedState = { ...deviceService.getLastStates()[deviceId], ...state, id: deviceId, timestamp: new Date().toISOString() };
        deviceService.updateLastStates(deviceId, updatedState);
        socket.emit('device-state-update', updatedState);
        logger.log(`Device ${deviceId} toggled to ${action}`, 'info', false, `device:toggle:${deviceId}`);
        callback({ success: true });
      } else {
        throw new Error(result.error || 'Toggle failed');
      }
    } catch (error) {
      logger.log(`Failed to toggle device ${deviceId}: ${error.message}`, 'error', false, `error:toggle:${deviceId}`);
      callback({ success: false, error: error.message });
    }
  });

  // Handle device list request
  socket.on('request-device-list', () => {
    emitDeviceList();
  });

  // Handle weather/forecast updates
  socket.on('request-weather-update', async () => {
    const weatherData = await fetchWeatherData(true);
    const forecastData = await fetchForecastData(true);
    if (weatherData) socket.emit('weather-update', weatherData);
    if (forecastData) socket.emit('forecast-update', forecastData);
  });

  socket.on('disconnect', (reason) => {
    logger.log(`Socket.IO client disconnected: ${socket.id}, Reason: ${reason}`, 'warn', false, `socket:disconnect:${socket.id}`);
  });

  socket.on('error', (err) => {
    logger.log(`Socket.IO error for client ${socket.id}: ${err.message}`, 'error', false, `error:socket:${socket.id}`);
  });
};