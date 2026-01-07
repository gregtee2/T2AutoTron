/**
 * debugRoutes.js - Debug Dashboard API endpoints
 * 
 * Simple read-only endpoints for LAN monitoring.
 * No auth required - just for debugging.
 * Extracted from server.js for better separation of concerns.
 */

const express = require('express');
const router = express.Router();

// GET /api/debug/lights - Get HA lights via cached manager
router.get('/lights', async (req, res) => {
  try {
    const haManager = require('../../devices/managers/homeAssistantManager');
    const devices = await haManager.getDevices();
    const lights = devices.filter(d => d.id && d.id.startsWith('ha_light.'));
    res.json({ success: true, lights });
  } catch (err) {
    res.json({ success: false, error: err.message, lights: [] });
  }
});

// GET /api/debug/all - Get comprehensive debug info (fresh from HA API)
router.get('/all', async (req, res) => {
  try {
    // Get engine status
    let engineStatus = { running: false };
    try {
      const { engine } = require('../../engine');
      engineStatus = engine.getStatus();
    } catch (e) {}
    
    // Get buffers
    let buffers = {};
    try {
      const { AutoTronBuffer } = require('../../engine/nodes/BufferNodes');
      for (const key of AutoTronBuffer.keys()) {
        buffers[key] = AutoTronBuffer.get(key);
      }
    } catch (e) {}
    
    // Get lights, switches AND locks FRESH from HA API (bypass cache for debugging)
    let lights = [];
    let switches = [];
    let locks = [];
    let haError = null;
    try {
      // Fetch fresh states directly from HA instead of using cached getDevices()
      const haHost = process.env.HA_HOST || 'http://supervisor/core';
      const haToken = process.env.HA_TOKEN || process.env.SUPERVISOR_TOKEN;
      
      if (haToken) {
        const response = await fetch(`${haHost}/api/states`, {
          headers: { 'Authorization': `Bearer ${haToken}` }
        });
        
        if (response.ok) {
          const states = await response.json();
          
          // Transform to match expected format
          states.forEach(device => {
            const domain = device.entity_id.split('.')[0];
            if (domain === 'light' || domain === 'switch') {
              const transformed = {
                id: `ha_${device.entity_id}`,
                name: device.attributes?.friendly_name || device.entity_id,
                type: domain,
                state: {
                  state: device.state,
                  on: device.state === 'on',
                  brightness: device.attributes?.brightness ? Math.round((device.attributes.brightness / 255) * 100) : (device.state === 'on' ? 100 : 0),
                  hs_color: device.attributes?.hs_color || [0, 0]
                },
                // Include attributes for dashboard to check color support
                attributes: {
                  supported_color_modes: device.attributes?.supported_color_modes || [],
                  color_mode: device.attributes?.color_mode || null
                }
              };
              if (domain === 'light') lights.push(transformed);
              if (domain === 'switch') switches.push(transformed);
            }
            // Handle locks separately - they use locked/unlocked states
            if (domain === 'lock') {
              locks.push({
                id: `ha_${device.entity_id}`,
                name: device.attributes?.friendly_name || device.entity_id,
                type: 'lock',
                state: {
                  state: device.state,  // "locked" or "unlocked"
                  is_locked: device.state === 'locked'
                }
              });
            }
          });
        } else {
          haError = `HA API returned ${response.status}`;
        }
      } else {
        haError = 'No HA token available';
      }
    } catch (e) {
      haError = e.message;
    }
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      engine: engineStatus,
      buffers,
      lights,
      switches,  // Include switches for dashboard state comparison
      locks,     // Include locks for dashboard state comparison
      haError    // Include any HA fetch error for debugging
    });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// GET /api/debug/unhealthy - Get list of unhealthy devices being skipped
router.get('/unhealthy', async (req, res) => {
  try {
    const haManager = require('../../devices/managers/homeAssistantManager');
    const unhealthy = haManager.getUnhealthyDevices();
    res.json({
      success: true,
      count: unhealthy.length,
      devices: unhealthy,
      retryInterval: haManager.UNHEALTHY_RETRY_INTERVAL,
      failureThreshold: haManager.FAILURE_THRESHOLD
    });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// POST /api/debug/reset-health - Reset health status for all devices
router.post('/reset-health', async (req, res) => {
  try {
    const haManager = require('../../devices/managers/homeAssistantManager');
    const count = haManager.deviceHealth.size;
    haManager.deviceHealth.clear();
    res.json({ success: true, message: `Cleared health status for ${count} devices` });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

module.exports = router;
