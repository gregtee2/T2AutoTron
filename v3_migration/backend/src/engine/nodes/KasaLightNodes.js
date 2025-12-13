/**
 * KasaLightNodes.js - Backend implementations for TP-Link Kasa control
 * 
 * Uses the internal API endpoints for Kasa device control.
 */

const registry = require('../BackendNodeRegistry');

// Use native fetch (Node 18+) or node-fetch
const fetch = globalThis.fetch || require('node-fetch');

/**
 * Get the API base URL (for internal calls within the same server)
 */
function getApiBaseUrl() {
  const port = process.env.PORT || 3000;
  return `http://localhost:${port}`;
}

/**
 * KasaLightNode - Controls TP-Link Kasa smart bulbs
 */
class KasaLightNode {
  constructor() {
    this.id = null;
    this.label = 'Kasa Light';
    this.properties = {
      deviceIds: [],        // Array of Kasa device IDs
      transitionTime: 1000  // ms
    };
    this.lastTrigger = null;
    this.lastHsv = null;
  }

  restore(data) {
    if (data.properties) {
      Object.assign(this.properties, data.properties);
    }
    // Handle old format
    if (data.selectedDeviceIds) {
      this.properties.deviceIds = data.selectedDeviceIds.map(id => 
        id.replace('kasa_', '')
      );
    }
  }

  async setDeviceState(deviceId, state) {
    const baseUrl = getApiBaseUrl();
    const endpoint = state.on ? 'on' : 'off';
    
    try {
      // For simple on/off
      if (!state.hsv) {
        const response = await fetch(`${baseUrl}/api/lights/kasa/${deviceId}/${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transition: this.properties.transitionTime })
        });
        return { success: response.ok };
      }
      
      // For color/brightness control
      const response = await fetch(`${baseUrl}/api/lights/kasa/${deviceId}/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          on: state.on,
          hsv: state.hsv,
          transition: this.properties.transitionTime
        })
      });
      
      return { success: response.ok };
    } catch (error) {
      console.error(`[KasaLightNode] Error setting device ${deviceId}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  async setAllDevices(on, hsv = null) {
    const results = [];
    
    for (const deviceId of this.properties.deviceIds) {
      if (!deviceId) continue;
      
      const state = { on };
      
      if (on && hsv) {
        // Convert HSV to Kasa format
        // Kasa expects: hue 0-360, saturation 0-100, brightness 1-100
        const hue = hsv.hue <= 1 ? Math.round(hsv.hue * 360) : Math.round(hsv.hue);
        const sat = hsv.saturation <= 1 ? Math.round(hsv.saturation * 100) : Math.round(hsv.saturation);
        const bri = hsv.brightness <= 1 ? Math.round(hsv.brightness * 100) :
                    hsv.brightness <= 100 ? Math.round(hsv.brightness) :
                    Math.round((hsv.brightness / 254) * 100);
        
        state.hsv = {
          hue: Math.max(0, Math.min(360, hue)),
          saturation: Math.max(0, Math.min(100, sat)),
          brightness: Math.max(1, Math.min(100, bri))
        };
      }
      
      const result = await this.setDeviceState(deviceId, state);
      results.push({ deviceId, ...result });
    }
    
    return results;
  }

  async data(inputs) {
    const trigger = inputs.trigger?.[0];
    const hsv = inputs.hsv_info?.[0];

    // Handle trigger changes
    if (trigger !== undefined && trigger !== this.lastTrigger) {
      this.lastTrigger = trigger;
      await this.setAllDevices(!!trigger, hsv);
    }

    // Handle HSV changes while on
    if (this.lastTrigger && hsv) {
      const hsvChanged = !this.lastHsv ||
        Math.abs((hsv.hue || 0) - (this.lastHsv.hue || 0)) > 0.01 ||
        Math.abs((hsv.saturation || 0) - (this.lastHsv.saturation || 0)) > 0.01 ||
        Math.abs((hsv.brightness || 0) - (this.lastHsv.brightness || 0)) > 1;

      if (hsvChanged) {
        this.lastHsv = { ...hsv };
        await this.setAllDevices(true, hsv);
      }
    }

    return { 
      is_on: !!this.lastTrigger,
      device_count: this.properties.deviceIds.length
    };
  }
}

/**
 * KasaPlugNode - Controls TP-Link Kasa smart plugs (on/off only)
 */
class KasaPlugNode {
  constructor() {
    this.id = null;
    this.label = 'Kasa Plug';
    this.properties = {
      deviceIds: []
    };
    this.lastTrigger = null;
  }

  restore(data) {
    if (data.properties) {
      Object.assign(this.properties, data.properties);
    }
  }

  async setPlugState(deviceId, on) {
    const baseUrl = getApiBaseUrl();
    const endpoint = on ? 'on' : 'off';
    
    try {
      const response = await fetch(`${baseUrl}/api/lights/kasa/${deviceId}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      return { success: response.ok };
    } catch (error) {
      console.error(`[KasaPlugNode] Error:`, error.message);
      return { success: false };
    }
  }

  async data(inputs) {
    const trigger = inputs.trigger?.[0];

    if (trigger !== undefined && trigger !== this.lastTrigger) {
      this.lastTrigger = trigger;
      
      for (const deviceId of this.properties.deviceIds) {
        if (deviceId) {
          await this.setPlugState(deviceId, !!trigger);
        }
      }
    }

    return { is_on: !!this.lastTrigger };
  }
}

// Register nodes
registry.register('KasaLightNode', KasaLightNode);
registry.register('KasaPlugNode', KasaPlugNode);

module.exports = { KasaLightNode, KasaPlugNode, getApiBaseUrl };
