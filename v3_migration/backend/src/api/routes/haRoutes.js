const express = require('express');
const Joi = require('joi');
const chalk = require('chalk');
const homeAssistantManager = require('../../devices/managers/homeAssistantManager');

// In-memory cache for device states
const stateCache = new Map();
const CACHE_TTL = 5000; // 5 seconds

// Only log errors/warnings by default. Set VERBOSE_LOGGING=true for detailed output.
const VERBOSE = process.env.VERBOSE_LOGGING === 'true';

const logWithTimestamp = (message, level = 'info') => {
  // Only log info/debug when VERBOSE_LOGGING is enabled
  if (level === 'info' && !VERBOSE) return;
  
  const timestamp = `[${new Date().toISOString()}]`;
  let formattedMessage = `${timestamp} `;
  switch (level) {
    case 'error':
      formattedMessage += `${chalk.red('❌ ' + message)}`;
      break;
    case 'warn':
      formattedMessage += `${chalk.yellow('⚠️ ' + message)}`;
      break;
    case 'info':
    default:
      formattedMessage += `${chalk.green('✅ ' + message)}`;
      break;
  }
  console.log(formattedMessage);
};

module.exports = function (io) {
  const router = express.Router();

  // Middleware to check if devices are initialized
  router.use((req, res, next) => {
    const devices = homeAssistantManager.getDevices();
    // Removed verbose logging - devices are checked on every request
    if (!devices || devices.length === 0) {
      logWithTimestamp('Home Assistant devices not initialized yet.', 'error');
      return res.status(503).json({ success: false, error: 'Home Assistant devices not initialized yet.' });
    }
    next();
  });

  // Validation schema for all entity types
  const stateSchema = Joi.object({
    on: Joi.boolean().optional(),
    state: Joi.string().optional(), // For media_player state (e.g., 'on', 'off', 'playing')
    brightness: Joi.number().min(0).max(255).optional(), // Allow 0-255 for brightness
    hs_color: Joi.array().items(Joi.number().min(0).max(360), Joi.number().min(0).max(100)).length(2).optional(),
    color_temp: Joi.number().min(1).optional(), // Mireds
    color_temp_kelvin: Joi.number().min(1000).max(10000).optional(), // Kelvin
    transition: Joi.number().min(0).optional(),
    percentage: Joi.number().min(0).max(100).optional(),
    position: Joi.number().min(0).max(100).optional(),
    volume_level: Joi.number().min(0).max(1).optional(), // For media_player volume (0-1)
    source: Joi.string().optional() // For media_player input source
  }).unknown(true);

  // GET / - Fetch all devices
  router.get('/', (req, res) => {
    try {
      const devices = homeAssistantManager.getDevices();
      logWithTimestamp(`Fetched ${devices.length} HA devices`, 'info');
      res.json({ success: true, devices });
    } catch (error) {
      logWithTimestamp(`Error fetching HA devices: ${error.message}`, 'error');
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // GET /:id/state - Fetch state of a specific device
  router.get('/:id/state', async (req, res) => {
    const { id } = req.params;
    const cacheKey = `ha_state_${id}`;
    const cached = stateCache.get(cacheKey);

    if (cached && Date.now() < cached.expiry) {
      // Cache hit - no logging needed
      return res.json({ success: true, state: cached.state });
    }

    // Fetching state - logging done in manager layer
    try {
      const result = await homeAssistantManager.getState(id);
      if (!result.success) {
        logWithTimestamp(`HA device ${id} not found or error: ${result.error}`, 'error');
        return res.status(404).json({ success: false, error: result.error || 'Device not found' });
      }
      // State fetched successfully - logging done in manager layer
      stateCache.set(cacheKey, { state: result.state, expiry: Date.now() + CACHE_TTL });
      res.json(result);
    } catch (error) {
      logWithTimestamp(`Error fetching HA device ${id}: ${error.message}`, 'error');
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // PUT /:id/state - Update state of a specific device
  router.put('/:id/state', async (req, res) => {
    const { id } = req.params;
    const body = req.body;
    
    // Debug: Log incoming request details
    logWithTimestamp(`PUT /${id}/state - Body: ${JSON.stringify(body)}, Content-Type: ${req.headers['content-type']}`, 'info');
    
    // Check if body is empty (common issue with body parsing)
    if (!body || Object.keys(body).length === 0) {
      logWithTimestamp(`Empty body received for HA device ${id}. Headers: ${JSON.stringify(req.headers)}`, 'error');
      return res.status(400).json({ success: false, error: 'Empty request body. Ensure Content-Type is application/json.' });
    }
    
    const { error } = stateSchema.validate(body);
    if (error) {
      logWithTimestamp(`Validation error for HA device ${id}: ${error.details[0].message}`, 'error');
      return res.status(400).json({ success: false, error: error.details[0].message });
    }
    const entityType = id.replace('ha_', '').split('.')[0];
    if (['weather', 'sensor', 'binary_sensor'].includes(entityType)) {
      logWithTimestamp(`HA device ${id} is read-only`, 'error');
      return res.status(403).json({ success: false, error: 'Weather, sensor, and binary sensor entities are read-only' });
    }
    try {
      const update = {
        on: body.on,
        state: body.state,
        brightness: body.brightness,
        hs_color: body.hs_color,
        color_temp: body.color_temp,
        color_temp_kelvin: body.color_temp_kelvin,
        transition: body.transition,
        percentage: body.percentage,
        position: body.position,
        volume_level: body.volume_level,
        source: body.source
      };
      if (entityType === 'switch') {
        // Switches don't support brightness/color - silently ignore these fields
        update.brightness = undefined;
        update.hs_color = undefined;
        update.color_temp = undefined;
        update.color_temp_kelvin = undefined;
        update.transition = undefined;
        update.percentage = undefined;
        update.position = undefined;
        update.volume_level = undefined;
        update.source = undefined;
        update.state = undefined;
      } else if (entityType === 'media_player') {
        // Ensure only relevant fields for media_player
        update.brightness = undefined;
        update.hs_color = undefined;
        update.color_temp = undefined;
        update.color_temp_kelvin = undefined;
        update.transition = undefined;
        update.percentage = undefined;
        update.position = undefined;
      }
      logWithTimestamp(`Cleaned update for HA device ${id}: ${JSON.stringify(update)}`, 'info');
      const result = await homeAssistantManager.updateState(id, update);
      if (!result.success) {
        logWithTimestamp(`Error updating HA device ${id}: ${result.error}`, 'error');
        return res.status(400).json({ success: false, error: result.error });
      }
      const stateResult = await homeAssistantManager.getState(id);
      if (stateResult.success) {
        if (io) {
          const state = {
            id,
            ...(entityType === 'light' ? {
              on: stateResult.state.on,
              brightness: stateResult.state.brightness,
              hs_color: stateResult.state.hs_color
            } : entityType === 'fan' ? {
              on: stateResult.state.on,
              percentage: stateResult.state.percentage
            } : entityType === 'cover' ? {
              on: stateResult.state.on,
              position: stateResult.state.position
            } : entityType === 'switch' ? {
              on: stateResult.state.on,
              brightness: stateResult.state.brightness,
              hs_color: stateResult.state.hs_color,
              power: stateResult.state.power,
              energy: stateResult.state.energy,
              attributes: stateResult.state.attributes
            } : entityType === 'media_player' ? {
              state: stateResult.state.state,
              volume_level: stateResult.state.volume_level,
              source: stateResult.state.source,
              media_title: stateResult.state.media_title
            } : {})
          };
          io.emit('device-state-update', state);
          logWithTimestamp(`Emitted device-state-update for ${id}: ${JSON.stringify(state)}`, 'info');
        }
        logWithTimestamp(`Successfully updated HA device ${id} to ${stateResult.state.on || stateResult.state.state}`, 'info');
      } else {
        logWithTimestamp(`State verification failed for HA device ${id}: ${stateResult.error}`, 'error');
      }
      stateCache.delete(`ha_state_${id}`);
      res.json({ success: true, message: 'State updated successfully' });
    } catch (error) {
      logWithTimestamp(`Error updating HA device ${id}: ${error.message}`, 'error');
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // POST /service - Call any HA service (light.turn_on, switch.toggle, etc.)
  router.post('/service', async (req, res) => {
    const { domain, service, entity_id, data } = req.body;
    
    if (!domain || !service) {
      return res.status(400).json({ success: false, error: 'Missing domain or service' });
    }

    logWithTimestamp(`Service call: ${domain}.${service} for ${entity_id || 'no entity'}`, 'info');

    try {
      const haHost = homeAssistantManager.getConfig?.()?.host || process.env.HA_HOST;
      const haToken = homeAssistantManager.getConfig?.()?.token || process.env.HA_TOKEN;

      if (!haHost || !haToken) {
        return res.status(500).json({ success: false, error: 'HA not configured' });
      }

      const payload = {
        ...(entity_id && { entity_id }),
        ...data
      };

      const response = await fetch(`${haHost}/api/services/${domain}/${service}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${haToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errText = await response.text();
        logWithTimestamp(`HA service call failed: ${response.status} - ${errText}`, 'error');
        return res.status(response.status).json({ success: false, error: errText });
      }

      const result = await response.json();
      logWithTimestamp(`Service call ${domain}.${service} succeeded`, 'info');
      res.json({ success: true, result });
    } catch (error) {
      logWithTimestamp(`Service call error: ${error.message}`, 'error');
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
};