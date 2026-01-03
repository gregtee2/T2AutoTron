const express = require('express');
const Joi = require('joi');
const homeAssistantMediaPlayerManager = require('../../devices/managers/homeAssistantMediaPlayerManager');
const logWithTimestamp = require('../../logging/logWithTimestamp');

module.exports = function (io) {
  const router = express.Router();

  router.use((req, res, next) => {
    const devices = homeAssistantMediaPlayerManager.getDevices();
    if (!devices || devices.length === 0) {
      logWithTimestamp('Home Assistant media players not initialized yet.', 'error');
      return res.status(503).json({ success: false, error: 'Home Assistant media players not initialized yet.' });
    }
    next();
  });

  const stateSchema = Joi.object({
    on: Joi.boolean().optional(),
    volume_level: Joi.number().min(0).max(1).optional(),
    source: Joi.string().optional()
  }).unknown(false);

  router.get('/', (req, res) => {
    try {
      const devices = homeAssistantMediaPlayerManager.getDevices();
      logWithTimestamp(`Fetched ${devices.length} HA media player devices`, 'info');
      res.json({ success: true, devices });
    } catch (error) {
      logWithTimestamp(`Error fetching HA media player devices: ${error.message}`, 'error');
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.get('/:id/state', async (req, res) => {
    const { id } = req.params;
    logWithTimestamp(`Fetching state of HA media player ${id}`, 'info');
    try {
      const result = await homeAssistantMediaPlayerManager.getMediaPlayerState(id);
      if (!result.success) {
        logWithTimestamp(`HA media player ${id} not found or error: ${result.error}`, 'error');
        return res.status(404).json({ success: false, error: result.error || 'Device not found' });
      }
      logWithTimestamp(`Fetched state for HA media player ${id}: ${JSON.stringify(result.state)}`, 'info');
      res.json(result);
    } catch (error) {
      logWithTimestamp(`Error fetching HA media player ${id}: ${error.message}`, 'error');
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.put('/:id/state', async (req, res) => {
    const { id } = req.params;
    const body = req.body;
    logWithTimestamp(`Updating state of HA media player ${id}: ${JSON.stringify(body)}`, 'info');
    const { error } = stateSchema.validate(body);
    if (error) {
      logWithTimestamp(`Validation error for HA media player ${id}: ${error.details[0].message}`, 'error');
      return res.status(400).json({ success: false, error: error.details[0].message });
    }
    try {
      const result = await homeAssistantMediaPlayerManager.updateMediaPlayerState(id, body);
      if (!result.success) {
        logWithTimestamp(`Error updating HA media player ${id}: ${result.error}`, 'error');
        return res.status(500).json({ success: false, error: result.error });
      }
      const stateResult = await homeAssistantMediaPlayerManager.getMediaPlayerState(id);
      if (stateResult.success) {
        if (io) {
          const state = {
            id,
            on: stateResult.state.on,
            volume_level: stateResult.state.volume_level,
            source: stateResult.state.source,
            source_list: stateResult.state.source_list,
            sound_mode: stateResult.state.sound_mode,
            vendor: 'HomeAssistant'
          };
          io.emit('device-state-update', state);
          logWithTimestamp(`Emitted device-state-update for ${id}: ${JSON.stringify(state)}`, 'info');
        }
        logWithTimestamp(`Successfully updated HA media player ${id} to ${stateResult.state.on ? 'ON' : 'OFF'}, volume=${stateResult.state.volume_level}`, 'info');
      } else {
        logWithTimestamp(`State verification failed for HA media player ${id}: ${stateResult.error}`, 'error');
      }
      res.json({ success: true, message: 'State updated successfully' });
    } catch (error) {
      logWithTimestamp(`Error updating HA media player ${id}: ${error.message}`, 'error');
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
};