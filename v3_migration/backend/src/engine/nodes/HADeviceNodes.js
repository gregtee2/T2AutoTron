/**
 * HADeviceNodes.js - Backend implementations of Home Assistant device nodes
 * 
 * These use Node.js fetch to communicate with Home Assistant API.
 * No browser dependencies - runs purely on the server.
 */

const registry = require('../BackendNodeRegistry');
const engineLogger = require('../engineLogger');

// Lazy-load engine to avoid circular dependency
let _engine = null;
function getEngine() {
  if (!_engine) {
    _engine = require('../BackendEngine');
  }
  return _engine;
}

// Use native fetch (Node 18+) or node-fetch
const fetch = globalThis.fetch || require('node-fetch');

/**
 * Helper to get HA config from environment
 */
function getHAConfig() {
  return {
    host: process.env.HA_HOST || 'http://homeassistant.local:8123',
    token: process.env.HA_TOKEN || ''
  };
}

/**
 * Extract entity ID from device ID (strips ha_ prefix if present)
 */
function normalizeEntityId(deviceId) {
  if (!deviceId) return null;
  // Remove ha_ prefix if present
  return deviceId.startsWith('ha_') ? deviceId.slice(3) : deviceId;
}

/**
 * Get all entity IDs from properties (supports multiple formats)
 */
function getEntityIds(properties) {
  const ids = [];
  
  // Format 1: selectedDeviceIds array (HAGenericDeviceNode)
  if (Array.isArray(properties.selectedDeviceIds)) {
    properties.selectedDeviceIds.forEach(id => {
      const normalized = normalizeEntityId(id);
      if (normalized) ids.push(normalized);
    });
  }
  
  // Format 2: deviceId single value
  if (properties.deviceId) {
    const normalized = normalizeEntityId(properties.deviceId);
    if (normalized) ids.push(normalized);
  }
  
  // Format 3: entityId single value
  if (properties.entityId) {
    const normalized = normalizeEntityId(properties.entityId);
    if (normalized) ids.push(normalized);
  }
  
  return ids;
}

/**
 * HADeviceStateNode - Monitors a Home Assistant entity and outputs its state
 */
class HADeviceStateNode {
  constructor() {
    this.id = null;
    this.label = 'HA Device State';
    this.properties = {
      entityId: '',
      pollInterval: 5000,  // ms between polls
      lastState: null
    };
    this.lastPollTime = 0;
    this.cachedState = null;
  }

  restore(data) {
    if (data.properties) {
      Object.assign(this.properties, data.properties);
    }
  }

  async fetchState() {
    const config = getHAConfig();
    if (!config.token || !this.properties.entityId) {
      return null;
    }

    try {
      const url = `${config.host}/api/states/${this.properties.entityId}`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${config.token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        console.error(`[HADeviceStateNode] HTTP ${response.status} for ${this.properties.entityId}`);
        return null;
      }

      const data = await response.json();
      return {
        entity_id: data.entity_id,
        state: data.state,
        attributes: data.attributes,
        last_changed: data.last_changed,
        last_updated: data.last_updated
      };
    } catch (error) {
      console.error(`[HADeviceStateNode] Error fetching ${this.properties.entityId}:`, error.message);
      return null;
    }
  }

  async data(inputs) {
    const now = Date.now();
    
    // Poll at configured interval
    if (now - this.lastPollTime >= this.properties.pollInterval) {
      this.lastPollTime = now;
      this.cachedState = await this.fetchState();
    }

    if (!this.cachedState) {
      return { state: null, device_state: null };
    }

    // Extract common values
    const state = this.cachedState.state;
    const isOn = state === 'on' || state === 'playing' || state === 'home';
    
    return {
      state: state,
      is_on: isOn,
      device_state: this.cachedState,
      brightness: this.cachedState.attributes?.brightness,
      temperature: this.cachedState.attributes?.temperature,
      humidity: this.cachedState.attributes?.humidity,
      power: this.cachedState.attributes?.power
    };
  }
}

/**
 * HAServiceCallNode - Calls a Home Assistant service
 */
class HAServiceCallNode {
  constructor() {
    this.id = null;
    this.label = 'HA Service Call';
    this.properties = {
      domain: 'light',
      service: 'turn_on',
      entityId: '',
      data: {}
    };
    this.lastTrigger = null;
  }

  restore(data) {
    if (data.properties) {
      Object.assign(this.properties, data.properties);
    }
  }

  async callService(serviceData = {}) {
    const config = getHAConfig();
    if (!config.token) {
      console.error('[HAServiceCallNode] No HA_TOKEN configured');
      return { success: false, error: 'No token' };
    }

    const { domain, service, entityId } = this.properties;
    const url = `${config.host}/api/services/${domain}/${service}`;
    
    const payload = {
      entity_id: entityId,
      ...this.properties.data,
      ...serviceData
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        console.error(`[HAServiceCallNode] HTTP ${response.status} calling ${domain}.${service}`);
        return { success: false, error: `HTTP ${response.status}` };
      }

      return { success: true };
    } catch (error) {
      console.error(`[HAServiceCallNode] Error calling ${domain}.${service}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  async data(inputs) {
    const trigger = inputs.trigger?.[0];
    const hsv = inputs.hsv_info?.[0];

    // Only call service on trigger change (rising edge)
    if (trigger !== undefined && trigger !== this.lastTrigger) {
      this.lastTrigger = trigger;
      
      if (trigger) {
        // Build service data from inputs
        const serviceData = {};
        
        if (hsv) {
          // Convert HSV to HA format
          serviceData.hs_color = [
            Math.round((hsv.hue <= 1 ? hsv.hue : hsv.hue / 360) * 360),
            Math.round((hsv.saturation <= 1 ? hsv.saturation : hsv.saturation / 100) * 100)
          ];
          serviceData.brightness = Math.round(
            hsv.brightness <= 1 ? hsv.brightness * 255 :
            hsv.brightness <= 255 ? hsv.brightness : 255
          );
        }
        
        const result = await this.callService(serviceData);
        return { success: result.success, result };
      } else {
        // Trigger went false - call turn_off if this is a light
        if (this.properties.domain === 'light' || this.properties.domain === 'switch') {
          const originalService = this.properties.service;
          this.properties.service = 'turn_off';
          const result = await this.callService();
          this.properties.service = originalService;
          return { success: result.success, result };
        }
      }
    }

    return { success: null };
  }
}

/**
 * HALightControlNode - Simplified light control node
 */
class HALightControlNode {
  constructor() {
    this.id = null;
    this.label = 'HA Light Control';
    this.properties = {
      entityId: '',
      transitionTime: 1000
    };
    this.lastTrigger = null;
    this.lastHsv = null;
  }

  restore(data) {
    if (data.properties) {
      Object.assign(this.properties, data.properties);
    }
  }

  async setLight(on, hsv = null) {
    const config = getHAConfig();
    if (!config.token || !this.properties.entityId) {
      return { success: false };
    }

    const service = on ? 'turn_on' : 'turn_off';
    const url = `${config.host}/api/services/light/${service}`;
    
    const payload = {
      entity_id: this.properties.entityId,
      transition: this.properties.transitionTime / 1000
    };

    if (on && hsv) {
      payload.hs_color = [
        Math.round((hsv.hue <= 1 ? hsv.hue : hsv.hue / 360) * 360),
        Math.round((hsv.saturation <= 1 ? hsv.saturation : hsv.saturation / 100) * 100)
      ];
      payload.brightness = Math.round(
        hsv.brightness <= 1 ? hsv.brightness * 255 :
        hsv.brightness <= 255 ? hsv.brightness : 255
      );
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      return { success: response.ok };
    } catch (error) {
      console.error(`[HALightControlNode] Error:`, error.message);
      return { success: false };
    }
  }

  async data(inputs) {
    const trigger = inputs.trigger?.[0];
    const hsv = inputs.hsv_info?.[0];

    // Handle trigger changes
    if (trigger !== undefined && trigger !== this.lastTrigger) {
      this.lastTrigger = trigger;
      await this.setLight(!!trigger, hsv);
    }

    // Handle HSV changes while on
    if (this.lastTrigger && hsv) {
      const hsvChanged = !this.lastHsv ||
        Math.abs((hsv.hue || 0) - (this.lastHsv.hue || 0)) > 0.01 ||
        Math.abs((hsv.saturation || 0) - (this.lastHsv.saturation || 0)) > 0.01 ||
        Math.abs((hsv.brightness || 0) - (this.lastHsv.brightness || 0)) > 1;

      if (hsvChanged) {
        this.lastHsv = { ...hsv };
        await this.setLight(true, hsv);
      }
    }

    return { is_on: !!this.lastTrigger };
  }
}

/**
 * HAGenericDeviceNode - Controls multiple HA devices
 * This matches the frontend HAGenericDeviceNode which uses selectedDeviceIds array
 */
class HAGenericDeviceNode {
  constructor() {
    this.id = null;
    this.label = 'HA Generic Device';
    this.properties = {
      selectedDeviceIds: [],
      selectedDeviceNames: [],
      transitionTime: 1000,
      triggerMode: 'Follow'  // Follow, Toggle, On, Off
    };
    this.lastTrigger = null;
    this.lastHsv = null;
    this.deviceStates = {};  // Track on/off state per device for Toggle mode
  }

  restore(data) {
    if (data.properties) {
      Object.assign(this.properties, data.properties);
    }
  }

  async controlDevice(entityId, turnOn, hsv = null) {
    // Check if frontend is active - if so, skip device commands to avoid conflict
    const engine = getEngine();
    if (engine && engine.shouldSkipDeviceCommands()) {
      engineLogger.log('HA-DEVICE-SKIP', `Frontend active, skipping command for ${entityId}`, { turnOn });
      return { success: true, skipped: true };
    }

    const config = getHAConfig();
    if (!config.token || !entityId) {
      console.error('[HAGenericDeviceNode] No token or entityId');
      return { success: false };
    }

    // Determine domain from entity_id
    const domain = entityId.split('.')[0] || 'light';
    const service = turnOn ? 'turn_on' : 'turn_off';
    const url = `${config.host}/api/services/${domain}/${service}`;
    
    const payload = {
      entity_id: entityId
    };

    // Add transition time for lights
    if (domain === 'light') {
      payload.transition = (this.properties.transitionTime || 1000) / 1000;
      
      // Add color info if turning on with HSV
      if (turnOn && hsv) {
        payload.hs_color = [
          Math.round((hsv.hue <= 1 ? hsv.hue : hsv.hue / 360) * 360),
          Math.round((hsv.saturation <= 1 ? hsv.saturation : hsv.saturation / 100) * 100)
        ];
        payload.brightness = Math.round(
          hsv.brightness <= 1 ? hsv.brightness * 255 :
          hsv.brightness <= 255 ? hsv.brightness : 255
        );
      }
    }

    try {
      // Log the device command
      engineLogger.logDeviceCommand(entityId, `${domain}.${service}`, payload);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        engineLogger.log('HA-DEVICE-ERROR', `HTTP ${response.status}`, { entityId, service });
      } else {
        engineLogger.log('HA-DEVICE-SUCCESS', `${entityId} ${service}`, { payload });
      }
      return { success: response.ok };
    } catch (error) {
      engineLogger.log('HA-DEVICE-ERROR', `${entityId}: ${error.message}`);
      return { success: false };
    }
  }

  async data(inputs) {
    const trigger = inputs.trigger?.[0];
    const hsv = inputs.hsv_info?.[0];
    
    // Debug: Log what inputs we're receiving
    const hasHsv = hsv !== undefined && hsv !== null;
    if (hasHsv || (this.tickCount && this.tickCount % 100 === 0)) {
      engineLogger.log('HA-INPUTS', 'Received inputs', { 
        trigger, 
        hsv: hasHsv ? hsv : 'none',
        allInputKeys: Object.keys(inputs)
      });
    }
    
    const entityIds = getEntityIds(this.properties);
    
    if (entityIds.length === 0) {
      return { is_on: false };
    }

    // Track ticks for warmup period - don't control devices until engine stabilizes
    if (this.tickCount === undefined) {
      this.tickCount = 0;
    }
    this.tickCount++;
    
    // Log every tick only in verbose mode (level 2) - too noisy otherwise
    if (engineLogger.getLogLevel() >= 2) {
      engineLogger.log('HA-DEVICE-TICK', `tick=${this.tickCount}`, { 
        trigger, 
        lastTrigger: this.lastTrigger, 
        entities: entityIds,
        mode: this.properties.triggerMode || 'Follow'
      });
    }
    
    // Skip first 3 ticks to let buffers populate
    // This prevents turning off devices when engine starts
    if (this.tickCount <= 3) {
      engineLogger.logWarmup(this.id || 'HAGenericDevice', this.tickCount, trigger, this.lastTrigger);
      // Initialize lastTrigger to current value without taking action
      if (trigger !== undefined) {
        this.lastTrigger = trigger;
      }
      return { is_on: !!trigger || !!this.lastTrigger };
    }

    // Skip if trigger is still undefined (no connection)
    if (trigger === undefined) {
      // Only log this in verbose mode - it fires every tick for disconnected nodes
      if (engineLogger.getLogLevel() >= 2) {
        engineLogger.log('HA-DEVICE', 'trigger undefined, skipping', { lastTrigger: this.lastTrigger });
      }
      return { is_on: !!this.lastTrigger };
    }

    // Handle trigger changes based on mode
    if (trigger !== this.lastTrigger) {
      engineLogger.logTriggerChange(this.id || 'HAGenericDevice', this.lastTrigger, trigger, 'CHANGE DETECTED');
      const wasTriggered = this.lastTrigger;
      this.lastTrigger = trigger;
      
      const mode = this.properties.triggerMode || 'Follow';
      
      for (const entityId of entityIds) {
        let shouldTurnOn = false;
        let reason = '';
        
        switch (mode) {
          case 'Follow':
            // Follow trigger state
            shouldTurnOn = !!trigger;
            reason = `Follow mode: trigger=${trigger} → shouldTurnOn=${shouldTurnOn}`;
            break;
          case 'Toggle':
            // Toggle on rising edge only
            if (trigger && !wasTriggered) {
              this.deviceStates[entityId] = !this.deviceStates[entityId];
              shouldTurnOn = this.deviceStates[entityId];
              reason = `Toggle mode: rising edge → ${shouldTurnOn ? 'ON' : 'OFF'}`;
              engineLogger.log('HA-DECISION', reason, { entityId });
              await this.controlDevice(entityId, shouldTurnOn, hsv);
            } else {
              reason = `Toggle mode: no rising edge (trigger=${trigger}, was=${wasTriggered})`;
              engineLogger.log('HA-DECISION', reason, { entityId });
            }
            continue;  // Skip normal control
          case 'On':
            // Only turn on, never off
            if (trigger) {
              shouldTurnOn = true;
              reason = 'On mode: trigger is true → turning ON';
            } else {
              reason = 'On mode: trigger is false → ignoring';
              engineLogger.log('HA-DECISION', reason, { entityId });
              continue;  // Don't do anything on false
            }
            break;
          case 'Off':
            // Only turn off, never on
            if (trigger) {
              shouldTurnOn = false;
              reason = 'Off mode: trigger is true → turning OFF';
            } else {
              reason = 'Off mode: trigger is false → ignoring';
              engineLogger.log('HA-DECISION', reason, { entityId });
              continue;  // Don't do anything on false
            }
            break;
        }
        
        engineLogger.log('HA-DECISION', reason, { entityId, shouldTurnOn });
        await this.controlDevice(entityId, shouldTurnOn, shouldTurnOn ? hsv : null);
        this.deviceStates[entityId] = shouldTurnOn;
      }
    } else {
      // No trigger change - log this for debugging
      if (this.tickCount % 50 === 0) {  // Only log every 50 ticks to avoid spam
        engineLogger.log('HA-NO-CHANGE', `trigger=${trigger} (unchanged)`, { 
          tick: this.tickCount, 
          entities: entityIds 
        });
      }
    }

    // Handle HSV changes while on (for Follow mode)
    if (this.lastTrigger && hsv && this.properties.triggerMode !== 'Toggle') {
      const hsvChanged = !this.lastHsv ||
        Math.abs((hsv.hue || 0) - (this.lastHsv.hue || 0)) > 0.01 ||
        Math.abs((hsv.saturation || 0) - (this.lastHsv.saturation || 0)) > 0.01 ||
        Math.abs((hsv.brightness || 0) - (this.lastHsv.brightness || 0)) > 1;

      if (hsvChanged) {
        this.lastHsv = { ...hsv };
        for (const entityId of entityIds) {
          await this.controlDevice(entityId, true, hsv);
        }
      }
    }

    return { is_on: !!this.lastTrigger };
  }
}

// Register nodes
registry.register('HADeviceStateNode', HADeviceStateNode);
registry.register('HADeviceStateOutputNode', HADeviceStateNode);  // Alias
registry.register('HAServiceCallNode', HAServiceCallNode);
registry.register('HALightControlNode', HALightControlNode);
registry.register('HAGenericDeviceNode', HAGenericDeviceNode);
registry.register('HADeviceAutomationNode', HAGenericDeviceNode);  // Use full implementation

module.exports = { 
  HADeviceStateNode, 
  HAServiceCallNode, 
  HALightControlNode,
  HAGenericDeviceNode,
  getHAConfig
};
