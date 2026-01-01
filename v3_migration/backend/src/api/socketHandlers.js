// Note: emitHueStatus is used by hueManager for broadcast, here we emit directly to socket
const logger = require('../logging/logger');
const { fetchWeatherData } = require('../weather/weatherService');
const { fetchForecastData } = require('../weather/forecastService');
const { deviceToggleSchema, validate } = require('./middleware/validationSchemas');
const authManager = require('./middleware/authMiddleware');

module.exports = (deviceService) => (socket) => {
    // Helper to get Hue connection status (used in multiple places)
    const getHueStatus = () => {
      let connected = false;
      let bridgeIp = process.env.HUE_BRIDGE_IP || null;
      let deviceCount = 0;
      try {
        const allDevices = deviceService.getAllDevices();
        const hueLights = allDevices['hue_'] || [];
        deviceCount = hueLights.length;
        connected = deviceCount > 0;
      } catch (e) {
        // fallback: not connected
      }
      return { connected, bridgeIp, deviceCount };
    };

    // Handle request for Hue connection status
    socket.on('request-hue-status', () => {
      socket.emit('hue-connection-status', getHueStatus());
    });

  // Note: Connect is also logged in server.js - don't duplicate

  // Automatically emit Hue status to the newly connected client
  socket.emit('hue-connection-status', getHueStatus());

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
        energyUsage: device.energy // Plugs use this
      })),
      shelly: (allDevices['shellyplus1-'] || []).map(device => ({
        id: `shellyplus1-${device.mac}`,
        name: device.name || 'Shelly Plus 1',
        ip: device.ip,
        type: 'ShellyPlus1',
        state: device.state,
        vendor: 'Shelly',
      })),
      // HA devices are already transformed by homeAssistantManager.getDevices()
      // They come with: id, name, type, state, attributes
      ha: (allDevices['ha_'] || []).map(device => {
        // Validate the pre-transformed device format
        if (!device.id || typeof device.id !== 'string') {
          // This should rarely happen - only log if truly malformed
          logger.log(`Malformed HA device (missing id): ${JSON.stringify(device).slice(0, 100)}`, 'warn', false, 'ha:malformed_device');
          return null;
        }

        // EXTRACT ENERGY DATA FROM HA ATTRIBUTES AND PROMOTE TO TOP LEVEL
        let energyUsage = null;
        const attrs = device.attributes || {};

        // Kasa bulbs in HA: emeter is nested in attributes
        if (attrs.emeter?.power != null) {
          energyUsage = { power: Number(attrs.emeter.power) };
        }
        // Some forks flatten it
        else if (attrs.power != null) {
          energyUsage = { power: Number(attrs.power) };
        }
        // Also check state.power if available
        else if (device.state?.power != null) {
          energyUsage = { power: Number(device.state.power) };
        }

        return {
          id: device.id,  // Already prefixed with 'ha_'
          name: device.name || attrs.friendly_name || device.id.replace('ha_', '').split('.')[1] || device.id,
          type: device.type || device.id.replace('ha_', '').split('.')[0],
          state: device.state || { on: false },
          vendor: 'HomeAssistant',
          attributes: attrs,
          energyUsage: energyUsage,
          emeter: attrs.emeter
        };
      }).filter(device => device !== null),
    };
    socket.emit('device-list-update', simplifiedDevices);
  };

  // Authentication event - must be called before any other events
  socket.on('authenticate', (pin) => {
    if (authManager.verifyPin(pin)) {
      authManager.authenticate(socket);
      socket.emit('auth-success', { authenticated: true });
      logger.log(`Socket ${socket.id} authenticated successfully`, 'info', false, `auth:success:${socket.id}`);

      // Send initial data after authentication
      socket.emit('server-ready', { ready: true, lastStates: deviceService.getLastStates() });
      emitDeviceList();

      // Send weather/forecast
      fetchWeatherData(true).then(weatherData => {
        if (weatherData) socket.emit('weather-update', weatherData);
      });
      fetchForecastData(true).then(forecastData => {
        if (forecastData) socket.emit('forecast-update', forecastData);
      });
    } else {
      socket.emit('auth-failed', { error: 'Invalid PIN' });
      logger.log(`Socket ${socket.id} authentication failed`, 'warn', false, `auth:failed:${socket.id}`);
    }
  });

  // Handle device control (requires authentication)
  socket.on('device-control', async (data) => {
    if (!authManager.isAuthenticated(socket)) {
      socket.emit('control-error', { error: 'Authentication required' });
      return;
    }

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

  // Handle device toggle (requires authentication + validation)
  socket.on('device-toggle', async (data, callback) => {
    if (!authManager.isAuthenticated(socket)) {
      callback({ success: false, error: 'Authentication required' });
      return;
    }

    const validation = validate(data, deviceToggleSchema);
    if (!validation.valid) {
      logger.log(`Invalid device-toggle data: ${validation.error}`, 'warn', false, 'validation:device-toggle');
      callback({ success: false, error: validation.error });
      return;
    }

    const { deviceId, vendor, action, transition, brightness, hue, saturation } = validation.value;
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

  // Handle device list request (requires authentication)
  // Supports both 'request-device-list' (legacy) and 'request-devices' (new)
  const handleDeviceListRequest = () => {
    if (!authManager.isAuthenticated(socket)) {
      socket.emit('error', { message: 'Authentication required' });
      return;
    }
    emitDeviceList();
  };
  socket.on('request-device-list', handleDeviceListRequest);
  socket.on('request-devices', handleDeviceListRequest);
  // Note: request-forecast and request-weather-update handlers are defined in server.js
  // to ensure they're available before auth. Don't duplicate here.

  // Handle request for upcoming scheduled events from backend engine
  socket.on('request-upcoming-events', () => {
    const engine = global.backendEngine;
    if (engine && typeof engine.getUpcomingEvents === 'function') {
      const events = engine.getUpcomingEvents();
      socket.emit('upcoming-events', events);
    } else {
      socket.emit('upcoming-events', []);
    }
  });

  socket.on('disconnect', (reason) => {
    authManager.deauthenticate(socket);
    // Note: Disconnect is also logged in server.js - don't duplicate
  });

  socket.on('error', (err) => {
    logger.log(`Socket.IO error for client ${socket.id}: ${err.message}`, 'error', false, `error:socket:${socket.id}`);
  });
};