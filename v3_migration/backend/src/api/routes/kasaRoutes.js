// src/api/routes/kasaRoutes.js
const express = require('express');
const { kasaManager } = require('../../devices/managers/kasaManager');
const logger = require('../../logging/logger');

const router = express.Router();

module.exports = function (io) {
  router.get('/', async (req, res) => {
    await logger.log('GET /api/lights/kasa called', 'info', false, 'kasa:fetch');
    try {
      const devices = kasaManager.getDevices();
      if (!Array.isArray(devices)) {
        throw new Error('kasaManager.getDevices() did not return an array');
      }

      await logger.log(`Kasa devices available: ${devices.length}`, 'info', false, 'kasa:devices');
      const lights = devices.map(device => ({
        id: `kasa_${device.deviceId}`,
        name: device.alias,
        type: device.deviceType,
        supportsBrightness: kasaManager.supportsBrightness(device),
        supportsColor: kasaManager.supportsColor(device)
      })).filter(light => light.id);
      res.json({ success: true, lights });
    } catch (error) {
      await logger.log(`Error fetching Kasa lights: ${error.message}`, 'error', false, 'kasa:error');
      console.error('Kasa GET error:', error);
      res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
    }
  });

  router.get('/:id/state', async (req, res) => {
    const { id } = req.params;
    await logger.log(`Fetching state for device kasa_${id}`, 'info', false, `kasa:state:${id}`);
    try {
      const device = kasaManager.getDeviceById(id);
      if (!device) {
        await logger.log(`Device kasa_${id} not found in kasaManager`, 'warn', false, `kasa:warn:${id}`);
        return res.status(404).json({ success: false, message: 'Device not found' });
      }
      const state = device.state || { on: false };
      res.json({ success: true, state });
    } catch (error) {
      await logger.log(`Error fetching state for kasa_${id}: ${error.message}`, 'error', false, `kasa:error:${id}`);
      console.error('Kasa state GET error:', error);
      res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
    }
  });

  router.post('/:id/toggle', async (req, res) => {
    const { id } = req.params;
    try {
      await logger.log(`Toggling device kasa_${id}`, 'info', false, `kasa:toggle:${id}`);
      const device = kasaManager.getDeviceById(id);
      if (!device) {
        await logger.log(`Device kasa_${id} not found in kasaManager`, 'warn', false, `kasa:warn:${id}`);
        return res.status(404).json({ success: false, message: 'Device not found' });
      }
      const currentState = device.state || { on: false };
      const newState = { on: !currentState.on };
      const result = await kasaManager.controlKasaDevice(`kasa_${id}`, newState);
      if (!result.success) {
        throw new Error(result.error || 'Failed to toggle device');
      }
      await logger.log(`Toggled device: ${device.alias} (ID: kasa_${id}) to ${newState.on ? 'ON' : 'OFF'}`, 'info', false, `kasa:toggle:${id}`);
      if (io) {
        io.emit('device-state-update', {
          id: `kasa_${id}`,
          name: device.alias,
          on: newState.on,
          brightness: result.state?.brightness || null,
          hue: result.state?.hue || null,
          saturation: result.state?.saturation || null
        });
      }
      res.json({ success: true, message: 'Device toggled successfully' });
    } catch (error) {
      await logger.log(`Error toggling kasa_${id}: ${error.message}`, 'error', false, `kasa:error:${id}`);
      console.error('Kasa toggle error:', error);
      res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
    }
  });

  router.post('/:id/on', async (req, res) => {
    const { id } = req.params;
    const { hsv, transition } = req.body;
    try {
      await logger.log(`Attempting to turn on device kasa_${id} with transition ${transition}ms`, 'info', false, `kasa:on:${id}`);
      const device = kasaManager.getDeviceById(id);
      if (!device) {
        await logger.log(`Device kasa_${id} not found in kasaManager`, 'warn', false, `kasa:warn:${id}`);
        return res.status(404).json({ success: false, message: `Device kasa_${id} not found` });
      }
      const state = { on: true };
      if (hsv && typeof hsv.hue === 'number' && typeof hsv.saturation === 'number' && typeof hsv.brightness === 'number') {
        if (kasaManager.supportsColor(device)) {
          state.hue = hsv.hue;
          state.saturation = hsv.saturation;
          state.brightness = hsv.brightness;
        } else {
          await logger.log(`Device ${device.alias} does not support color`, 'warn', false, `kasa:warn:${id}`);
        }
      }
      if (transition) {
        state.transitiontime = transition;
      }
      const result = await kasaManager.controlKasaDevice(`kasa_${id}`, state);
      if (!result.success) {
        throw new Error(result.error || 'Failed to turn on device');
      }
      await logger.log(`Turned on ${device.alias} (ID: kasa_${id})${hsv ? ` with HSV(${hsv.hue}, ${hsv.saturation}, ${hsv.brightness})` : ''} with transition ${transition || 0}ms`, 'info', false, `kasa:on:${id}`);
      if (io) {
        io.emit('device-state-update', {
          id: `kasa_${id}`,
          name: device.alias,
          on: true,
          brightness: result.state?.brightness || null,
          hue: result.state?.hue || null,
          saturation: result.state?.saturation || null
        });
      }
      res.json({ success: true, message: 'Device turned on successfully' });
    } catch (error) {
      await logger.log(`Error turning on kasa_${id}: ${error.message}`, 'error', false, `kasa:error:${id}`);
      console.error('Kasa on error:', error);
      res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
    }
  });

  router.post('/:id/off', async (req, res) => {
    const { id } = req.params;
    const { transition } = req.body;
    try {
      await logger.log(`Attempting to turn off device kasa_${id} with transition ${transition}ms`, 'info', false, `kasa:off:${id}`);
      const device = kasaManager.getDeviceById(id);
      if (!device) {
        await logger.log(`Device kasa_${id} not found in kasaManager`, 'warn', false, `kasa:warn:${id}`);
        return res.status(404).json({ success: false, message: `Device kasa_${id} not found` });
      }
      const offState = { on: false };
      if (typeof transition === 'number') {
        offState.transitiontime = transition;
      }
      const result = await kasaManager.controlKasaDevice(`kasa_${id}`, offState);
      if (!result.success) {
        throw new Error(result.error || 'Failed to turn off device');
      }
      await logger.log(`Turned off ${device.alias} (ID: kasa_${id}) with transition ${transition || 0}ms`, 'info', false, `kasa:off:${id}`);
      if (io) {
        io.emit('device-state-update', {
          id: `kasa_${id}`,
          name: device.alias,
          on: false,
          brightness: result.state?.brightness || null,
          hue: result.state?.hue || null,
          saturation: result.state?.saturation || null
        });
      }
      res.json({ success: true, message: 'Device turned off successfully' });
    } catch (error) {
      await logger.log(`Error turning off kasa_${id}: ${error.message}`, 'error', false, `kasa:error:${id}`);
      console.error('Kasa off error:', error);
      res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
    }
  });

  router.post('/:id/brightness', async (req, res) => {
    const { id } = req.params;
    const { brightness, transition } = req.body;
    if (typeof brightness !== 'number' || brightness < 1 || brightness > 100) {
      return res.status(400).json({ success: false, message: 'Brightness must be a number between 1 and 100' });
    }
    try {
      await logger.log(`Setting brightness for device kasa_${id} to ${brightness} with transition ${transition}ms`, 'info', false, `kasa:brightness:${id}`);
      const device = kasaManager.getDeviceById(id);
      if (!device) {
        await logger.log(`Device kasa_${id} not found in kasaManager`, 'warn', false, `kasa:warn:${id}`);
        return res.status(404).json({ success: false, message: `Device kasa_${id} not found` });
      }
      if (!kasaManager.supportsBrightness(device)) {
        return res.status(400).json({ success: false, message: 'Brightness not supported' });
      }
      const result = await kasaManager.controlKasaDevice(`kasa_${id}`, { brightness, transitiontime: transition });
      if (!result.success) {
        throw new Error(result.error || 'Failed to set brightness');
      }
      await logger.log(`Set brightness for ${device.alias} (ID: kasa_${id}) to ${brightness} with transition ${transition || 0}ms`, 'info', false, `kasa:brightness:${id}`);
      if (io) {
        io.emit('device-state-update', {
          id: `kasa_${id}`,
          name: device.alias,
          brightness: result.state?.brightness || brightness
        });
      }
      res.json({ success: true, message: 'Brightness set successfully' });
    } catch (error) {
      await logger.log(`Error setting brightness for kasa_${id}: ${error.message}`, 'error', false, `kasa:error:${id}`);
      console.error('Kasa brightness error:', error);
      res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
    }
  });

  router.post('/:id/color', async (req, res) => {
    const { id } = req.params;
    const { hsv, transition } = req.body;
    if (!hsv || typeof hsv.hue !== 'number' || typeof hsv.saturation !== 'number' || typeof hsv.brightness !== 'number') {
      return res.status(400).json({ success: false, message: 'HSV values are required and must be numbers' });
    }
    try {
      await logger.log(`Setting color for device kasa_${id} to HSV(${hsv.hue}, ${hsv.saturation}, ${hsv.brightness}) with transition ${transition}ms`, 'info', false, `kasa:color:${id}`);
      const device = kasaManager.getDeviceById(id);
      if (!device) {
        await logger.log(`Device kasa_${id} not found in kasaManager`, 'warn', false, `kasa:warn:${id}`);
        return res.status(404).json({ success: false, message: `Device kasa_${id} not found` });
      }
      if (!kasaManager.supportsColor(device)) {
        return res.status(400).json({ success: false, message: 'Color not supported' });
      }
      const result = await kasaManager.controlKasaDevice(`kasa_${id}`, {
        hue: hsv.hue,
        saturation: hsv.saturation,
        brightness: hsv.brightness,
        transitiontime: transition
      });
      if (!result.success) {
        throw new Error(result.error || 'Failed to set color');
      }
      await logger.log(`Set color for ${device.alias} (ID: kasa_${id}) to HSV(${hsv.hue}, ${hsv.saturation}, ${hsv.brightness}) with transition ${transition || 0}ms`, 'info', false, `kasa:color:${id}`);
      if (io) {
        io.emit('device-state-update', {
          id: `kasa_${id}`,
          name: device.alias,
          hue: result.state?.hue || hsv.hue,
          saturation: result.state?.saturation || hsv.saturation,
          brightness: result.state?.brightness || hsv.brightness
        });
      }
      res.json({ success: true, message: 'Color set successfully' });
    } catch (error) {
      await logger.log(`Error setting color for kasa_${id}: ${error.message}`, 'error', false, `kasa:error:${id}`);
      console.error('Kasa color error:', error);
      res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
    }
  });

  router.get('/:id/energy', async (req, res) => {
    const { id } = req.params;
    await logger.log(`Fetching energy for device kasa_${id}`, 'info', false, `kasa:energy:${id}`);
    try {
      const device = kasaManager.getDeviceById(id);
      if (!device) {
        await logger.log(`Device kasa_${id} not found in kasaManager`, 'warn', false, `kasa:warn:${id}`);
        return res.status(404).json({ success: false, message: 'Device not found' });
      }
      if (!device.supportsEmeter || !device.emeter?.getRealtime) {
        return res.status(400).json({ success: false, message: 'Energy data not supported for this device' });
      }
      const energyUsage = await device.emeter.getRealtime();
      const energyData = {
        power: energyUsage.power_mw / 1000,
        voltage: energyUsage.voltage_mv / 1000,
        current: energyUsage.current_ma / 1000,
        total: energyUsage.total_wh / 1000
      };
      res.json({ success: true, energyData });
      await logger.log(`Fetched energy for ${device.alias} (ID: kasa_${id})`, 'info', false, `kasa:energy:${id}`);
    } catch (error) {
      await logger.log(`Error fetching energy for kasa_${id}: ${error.message}`, 'error', false, `kasa:error:${id}`);
      console.error('Kasa energy error:', error);
      res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
    }
  });

  router.post('/:id/state', async (req, res) => {
    const { id } = req.params;
    const { on, hsv, transition } = req.body;
    try {
      await logger.log(`Setting state for device kasa_${id}: ${JSON.stringify({ on, hsv, transition })}`, 'info', false, `kasa:state:${id}`);
      const device = kasaManager.getDeviceById(id);
      if (!device) {
        await logger.log(`Device kasa_${id} not found in kasaManager`, 'warn', false, `kasa:warn:${id}`);
        return res.status(404).json({ success: false, message: `Device kasa_${id} not found` });
      }
      if (typeof on !== 'boolean') {
        return res.status(400).json({ success: false, message: "'on' must be a boolean" });
      }
      const state = { on };
      if (hsv && typeof hsv.hue === 'number' && typeof hsv.saturation === 'number' && typeof hsv.brightness === 'number' && kasaManager.supportsColor(device)) {
        state.hue = hsv.hue;
        state.saturation = hsv.saturation;
        state.brightness = hsv.brightness;
      }
      if (transition) {
        state.transitiontime = transition;
      }
      const result = await kasaManager.controlKasaDevice(`kasa_${id}`, state);
      if (!result.success) {
        throw new Error(result.error || 'Failed to set device state');
      }
      await logger.log(`Set state for ${device.alias} (ID: kasa_${id}) to ${JSON.stringify(state)} with transition ${transition || 0}ms`, 'info', false, `kasa:state:${id}`);
      if (io) {
        io.emit('device-state-update', {
          id: `kasa_${id}`,
          name: device.alias,
          on: result.state?.on || on,
          brightness: result.state?.brightness || null,
          hue: result.state?.hue || null,
          saturation: result.state?.saturation || null
        });
      }
      res.json({ success: true, message: 'State updated successfully' });
    } catch (error) {
      await logger.log(`Error updating state for kasa_${id}: ${error.message}`, 'error', false, `kasa:error:${id}`);
      console.error('Kasa state error:', error);
      res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
    }
  });

  return router;
};