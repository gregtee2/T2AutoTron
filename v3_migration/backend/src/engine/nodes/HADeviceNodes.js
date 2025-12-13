/**
 * HADeviceNodes.js - Backend implementations of Home Assistant device nodes
 * 
 * These use Node.js fetch to communicate with Home Assistant API.
 * No browser dependencies - runs purely on the server.
 */

const registry = require('../BackendNodeRegistry');

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

// Register nodes
registry.register('HADeviceStateNode', HADeviceStateNode);
registry.register('HADeviceStateOutputNode', HADeviceStateNode);  // Alias
registry.register('HAServiceCallNode', HAServiceCallNode);
registry.register('HALightControlNode', HALightControlNode);
registry.register('HADeviceAutomationNode', HALightControlNode);  // Simplified alias

module.exports = { 
  HADeviceStateNode, 
  HAServiceCallNode, 
  HALightControlNode,
  getHAConfig
};
