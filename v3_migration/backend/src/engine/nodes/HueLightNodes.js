/**
 * HueLightNodes.js - Backend implementations for Philips Hue control
 * 
 * Direct Hue Bridge API calls without browser dependencies.
 */

const registry = require('../BackendNodeRegistry');

// Use native fetch (Node 18+) or node-fetch
const fetch = globalThis.fetch || require('node-fetch');

/**
 * Helper to get Hue config from environment
 */
function getHueConfig() {
  return {
    bridgeIp: process.env.HUE_BRIDGE_IP || '',
    username: process.env.HUE_USERNAME || ''
  };
}

/**
 * HueLightNode - Controls Philips Hue lights directly
 */
class HueLightNode {
  constructor() {
    this.id = null;
    this.label = 'Hue Light';
    this.properties = {
      lightIds: [],          // Array of light IDs to control
      transitionTime: 1000,  // ms
      lastState: {}
    };
    this.lastTrigger = null;
    this.lastHsv = null;
  }

  restore(data) {
    if (data.properties) {
      Object.assign(this.properties, data.properties);
    }
    // Handle old format with selectedDeviceIds
    if (data.selectedDeviceIds) {
      this.properties.lightIds = data.selectedDeviceIds.map(id => 
        id.replace('hue_', '')
      );
    }
  }

  async setLightState(lightId, state) {
    const config = getHueConfig();
    if (!config.bridgeIp || !config.username) {
      console.error('[HueLightNode] No Hue bridge configured');
      return { success: false };
    }

    const url = `http://${config.bridgeIp}/api/${config.username}/lights/${lightId}/state`;

    try {
      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state)
      });

      const result = await response.json();
      return { success: !result.error, result };
    } catch (error) {
      console.error(`[HueLightNode] Error setting light ${lightId}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  async setAllLights(on, hsv = null) {
    const results = [];
    
    for (const lightId of this.properties.lightIds) {
      if (!lightId) continue;
      
      const state = { on };
      
      if (on && hsv) {
        // Convert HSV to Hue API format
        // Hue uses: hue (0-65535), sat (0-254), bri (1-254)
        const hue = hsv.hue <= 1 ? hsv.hue : hsv.hue / 360;
        const sat = hsv.saturation <= 1 ? hsv.saturation : hsv.saturation / 100;
        const bri = hsv.brightness <= 1 ? hsv.brightness * 254 :
                    hsv.brightness <= 254 ? hsv.brightness : 254;
        
        state.hue = Math.round(hue * 65535);
        state.sat = Math.round(sat * 254);
        state.bri = Math.round(Math.max(1, Math.min(254, bri)));
        state.transitiontime = Math.round(this.properties.transitionTime / 100);
      }
      
      const result = await this.setLightState(lightId, state);
      results.push({ lightId, ...result });
    }
    
    return results;
  }

  async data(inputs) {
    const trigger = inputs.trigger?.[0];
    const hsv = inputs.hsv_info?.[0];

    // Handle trigger changes
    if (trigger !== undefined && trigger !== this.lastTrigger) {
      this.lastTrigger = trigger;
      await this.setAllLights(!!trigger, hsv);
    }

    // Handle HSV changes while on
    if (this.lastTrigger && hsv) {
      const hsvChanged = !this.lastHsv ||
        Math.abs((hsv.hue || 0) - (this.lastHsv.hue || 0)) > 0.01 ||
        Math.abs((hsv.saturation || 0) - (this.lastHsv.saturation || 0)) > 0.01 ||
        Math.abs((hsv.brightness || 0) - (this.lastHsv.brightness || 0)) > 1;

      if (hsvChanged) {
        this.lastHsv = { ...hsv };
        await this.setAllLights(true, hsv);
      }
    }

    return { 
      is_on: !!this.lastTrigger,
      light_count: this.properties.lightIds.length
    };
  }
}

// Register node
registry.register('HueLightNode', HueLightNode);

module.exports = { HueLightNode, getHueConfig };
