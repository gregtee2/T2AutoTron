const express = require('express');
const router = express.Router();
const logger = require('../../logging/logger');
const requireLocalOrPin = require('../middleware/requireLocalOrPin');

module.exports = (io, deviceService) => {
  router.get('/', async (req, res) => {
    try {
      const allDevices = deviceService.getAllDevices();
      logger.log(
        `Raw devices: ${Object.entries(allDevices).map(([prefix, devices]) => `${prefix}=${devices.length}`).join(', ')}`,
        'info',
        false,
        'devices:raw'
      );

      const formattedDevices = {};
      for (const [prefix, devices] of Object.entries(allDevices)) {
        const manager = deviceService.managers[prefix];
        if (!manager) {
          logger.log(
            `No manager found for prefix ${prefix}`,
            'warn',
            false,
            `devices:manager:${prefix}`
          );
          formattedDevices[prefix] = [];
          continue;
        }
        // Ensure devices is always an array (some managers may return undefined/object)
        const deviceArray = Array.isArray(devices) ? devices : [];
        formattedDevices[prefix] = deviceArray.map(device => {
          const id = device.id || `${prefix}${device.entity_id || device.deviceId || device.mac || device.id}`;
          // For HA devices, extract type from entity_id (e.g., "light.kitchen" -> "light")
          // For other managers, use manager.type or device.type
          const entityType = device.entity_id?.split('.')[0] || device.type || device.deviceType || manager.type || 'unknown';
          return {
            id,
            name: device.name || device.attributes?.friendly_name || device.alias || device.entity_id?.split('.')[1] || id,
            type: entityType,
            state: device.state || { on: device.state === 'on' },
            capabilities: {
              brightness: !!(
                device.state?.brightness !== undefined ||
                device.attributes?.brightness !== undefined ||
                (device.attributes?.supported_features & 1)
              ),
              color: !!(
                device.state?.hue !== undefined ||
                device.attributes?.hs_color !== undefined
              ),
              relay: device.type === 'ShellyPlus1'
            },
            vendor: manager.name || (device.manufacturername === 'OSRAM' ? 'Osram' : device.vendor || prefix.split('_')[0].toUpperCase()),
            modelId: device.modelId || device.model || (prefix === 'ha_' ? 'HomeAssistant' : undefined),
            ...(device.ip && { ip: device.ip }),
            ...(device.host && { host: device.host }),
            energy: device.energy || device.attributes?.energy || 0
          };
        });
      }

      logger.log(
        `Formatted devices: ${Object.entries(formattedDevices).map(([prefix, devices]) => `${prefix}=${devices.length}`).join(', ')}`,
        'info',
        false,
        'devices:formatted'
      );
      res.json({ success: true, devices: formattedDevices });
    } catch (error) {
      logger.log(
        `Error in /api/devices: ${error.message}`,
        'error',
        false,
        'error:devices',
        { stack: error.stack }
      );
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Device control is sensitive: restrict to localhost or valid PIN
  // (GET /api/devices remains readable for UI convenience)
  router.post('/', requireLocalOrPin, async (req, res) => {
    const { deviceId, state } = req.body;
    logger.log(
      `REST device control received: ${deviceId}`,
      'info',
      false,
      `rest:device:${deviceId}`,
      { state }
    );
    try {
      const result = await deviceService.controlDevice(deviceId, state);
      if (result.success) {
        logger.log(
          `REST control for ${deviceId} succeeded`,
          'info',
          false,
          `rest:success:${deviceId}`
        );
        io.emit('device-state-update', { id: deviceId, ...state });
        res.json({ success: true });
      } else {
        throw new Error(result.error || 'Control failed');
      }
    } catch (error) {
      logger.log(
        `REST control failed for ${deviceId}: ${error.message}`,
        'error',
        false,
        `error:rest:${deviceId}`,
        { stack: error.stack }
      );
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
};