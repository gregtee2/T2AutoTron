const fetch = require('node-fetch');
const WebSocket = require('ws');
const logger = require('../../logging/logger');

class HomeAssistantManager {
  constructor() {
    this.devices = [];
    this.config = {
      host: process.env.HA_HOST || 'http://localhost:8123',
      token: process.env.HA_TOKEN,
    };
    this.ws = null;
    // Performance caching
    this.stateCache = new Map();
    this.deviceCache = null;
    this.STATE_CACHE_TTL = 5000; // 5 seconds for state cache
    this.DEVICE_CACHE_TTL = 30000; // 30 seconds for device list cache
  }

  async initialize(io, notificationEmitter, log) {
    try {
      await log('Initializing Home Assistant...', 'info', false, 'ha:init');
      const response = await fetch(`${this.config.host}/api/states`, {
        headers: { Authorization: `Bearer ${this.config.token}` },
      });
      if (!response.ok) throw new Error(`HA API error: ${response.status}: ${response.statusText}`);
      const states = await response.json();
      this.devices = states.filter(s => {
        const domain = s.entity_id.split('.')[0];
        return ['light', 'switch', 'sensor', 'binary_sensor', 'media_player', 'fan', 'cover', 'weather'].includes(domain);
      });

      // Initialize device cache
      this.deviceCache = {
        data: this.getDevices(),
        expiry: Date.now() + this.DEVICE_CACHE_TTL
      };

      await log(`Initialized ${this.devices.length} HA devices`, 'info', false, 'ha:initialized');

      if (io && notificationEmitter) {
        this.devices.forEach(device => {
          const state = {
            id: `ha_${device.entity_id}`,
            name: device.attributes.friendly_name || device.entity_id,
            type: device.entity_id.split('.')[0],
            state: device.state,
            on: device.state === 'on' || device.state === 'open' || device.state === 'playing',
            brightness: device.attributes.brightness ? Math.round((device.attributes.brightness / 255) * 100) : (device.state === 'on' ? 100 : 0),
            hs_color: device.attributes.hs_color || [0, 0],
            attributes: device.attributes // Include attributes for power data
          };
          io.emit('device-state-update', state);
          notificationEmitter.emit('notify', `🔄 HA Update: ${state.name} is ${state.on ? 'ON' : 'OFF'}`);
        });

        // Initialize WebSocket for real-time updates
        this.ws = new WebSocket(`${this.config.host.replace('http', 'ws')}/api/websocket`);
        this.ws.on('open', () => {
          this.ws.send(JSON.stringify({ type: 'auth', access_token: this.config.token }));
          this.ws.send(JSON.stringify({ id: 1, type: 'subscribe_events', event_type: 'state_changed' }));
          log(' HA WebSocket connected', 'info', false, 'ha:websocket');
        });
        this.ws.on('message', (data) => {
          try {
            const msg = JSON.parse(data);
            if (msg.type === 'event' && msg.event.event_type === 'state_changed') {
              const entity = msg.event.data.new_state;
              if (!entity) return;
              const domain = entity.entity_id.split('.')[0];
              if (!['light', 'switch', 'sensor', 'binary_sensor', 'media_player', 'fan', 'cover', 'weather'].includes(domain)) return;

              // Invalidate cache on state change
              const cacheKey = `ha_${entity.entity_id}`;
              this.stateCache.delete(cacheKey);

              const state = {
                id: cacheKey,
                state: entity.state,
                on: entity.state === 'on' || entity.state === 'open' || entity.state === 'playing',
                brightness: entity.attributes.brightness ? Math.round((entity.attributes.brightness / 255) * 100) : (entity.state === 'on' ? 100 : 0),
                hs_color: entity.attributes.hs_color || [0, 0],
                power: entity.attributes.power || entity.attributes.current_power_w || entity.attributes.load_power || null,
                energy: entity.attributes.energy || entity.attributes.energy_kwh || entity.attributes.total_energy_kwh || null,
                attributes: entity.attributes // Include attributes for power data
              };
              io.emit('device-state-update', state);
              log(`HA state update: ${state.id} - ${entity.state}`, 'info', false, `ha:state:${state.id}`);
            }
          } catch (err) {
            log(`HA WebSocket message error: ${err.message}`, 'error', false, 'ha:websocket:message');
          }
        });
        this.ws.on('error', (err) => log(`HA WebSocket error: ${err.message}`, 'error', false, 'ha:websocket:error'));
        this.ws.on('close', () => log('HA WebSocket closed', 'warn', false, 'ha:websocket:close'));
      }
      return this.devices;
    } catch (error) {
      await log(`HA initialization failed: ${error.message}`, 'error', false, 'ha:error');
      return [];
    }
  }

  async getState(id) {
    const cacheKey = id;
    const cached = this.stateCache.get(cacheKey);

    // Check cache first
    if (cached && Date.now() < cached.expiry) {
      await logger.log(`[CACHE HIT] Returning cached state for ${id}`, 'info', false, `ha:cache:${id}`);
      return { success: true, state: cached.state };
    }

    // Cache miss - fetch from API
    try {
      const rawId = id.replace('ha_', '');
      const response = await fetch(`${this.config.host}/api/states/${rawId}`, {
        headers: { Authorization: `Bearer ${this.config.token}` },
        timeout: 5000
      });
      if (!response.ok) throw new Error(`HA API error: ${response.status}: ${response.statusText}`);
      const data = await response.json();
      const state = {
        state: data.state,
        on: data.state === 'on' || data.state === 'open' || data.state === 'playing',
        brightness: data.attributes.brightness ? Math.round((data.attributes.brightness / 255) * 100) : (data.state === 'on' ? 100 : 0),
        hs_color: data.attributes.hs_color || [0, 0],
        // Include power data if available
        power: data.attributes.power || data.attributes.current_power_w || data.attributes.load_power || null,
        energy: data.attributes.energy || data.attributes.energy_kwh || data.attributes.total_energy_kwh || null,
        attributes: data.attributes
      };

      // Store in cache
      this.stateCache.set(cacheKey, {
        state,
        expiry: Date.now() + this.STATE_CACHE_TTL
      });

      await logger.log(`[CACHE MISS] Fetched state for HA device ${rawId}: on=${state.on}, brightness=${state.brightness}, hs_color=${JSON.stringify(state.hs_color)}`, 'info', false, `ha:state:${rawId}`);
      return { success: true, state };
    } catch (error) {
      await logger.log(`Failed to fetch state for HA device ${id}: ${error.message}`, 'error', false, `ha:state:${id}`);
      return { success: false, error: error.message };
    }
  }

  async updateState(id, update) {
    try {
      const rawId = id.replace('ha_', '');
      const entityType = rawId.split('.')[0];
      const service = entityType;
      const payload = { entity_id: rawId };

      let action = update.on ? 'turn_on' : 'turn_off';

      if (entityType === 'cover') {
        action = update.on ? 'open_cover' : 'close_cover';
        if (update.position !== undefined) {
          action = 'set_cover_position';
          payload.position = update.position;
        }
      } else if (entityType === 'media_player') {
        if (update.volume_level !== undefined) {
          action = 'volume_set';
          payload.volume_level = update.volume_level;
        }
      }

      if (update.on || action === 'turn_on') {
        if (update.brightness !== undefined) payload.brightness = Math.round(update.brightness); // Use 0-255 brightness
        if (update.hs_color) payload.hs_color = update.hs_color;
        if (update.color_temp) payload.color_temp = update.color_temp;
        if (update.color_temp_kelvin) payload.color_temp_kelvin = update.color_temp_kelvin;
        if (update.transition !== undefined) payload.transition = update.transition / 1000;
        if (update.percentage !== undefined && entityType === 'fan') payload.percentage = update.percentage;
      }

      await logger.log(`Sending HA state update for ${id}: ${JSON.stringify(payload)}`, 'info', false, `ha:state:${id}`);
      const response = await fetch(`${this.config.host}/api/services/${service}/${action}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        timeout: 5000
      });
      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`HA API error: ${response.status}: ${response.statusText}, Body: ${errorBody}`);
      }

      // Invalidate cache after update
      this.stateCache.delete(id);

      await logger.log(`HA state update succeeded for ${id}: ${JSON.stringify(payload)}`, 'info', false, `ha:state:${id}`);
      return { success: true };
    } catch (error) {
      await logger.log(`HA state update failed for ${id}: ${error.message}`, 'error', false, `ha:state:${id}`);
      return { success: false, error: error.message };
    }
  }

  async controlDevice(id, state) {
    return this.updateState(id, state);
  }

  getDevices() {
    // Check cache first
    if (this.deviceCache && Date.now() < this.deviceCache.expiry) {
      logger.log('[CACHE HIT] Returning cached device list', 'info', false, 'ha:cache:devices').catch(() => { });
      return this.deviceCache.data;
    }

    // Cache miss - generate new device list
    const deviceList = this.devices.map(device => ({
      id: `ha_${device.entity_id}`,
      name: device.attributes.friendly_name || device.entity_id,
      type: device.entity_id.split('.')[0],
      state: {
        state: device.state,
        on: device.state === 'on' || device.state === 'open' || device.state === 'playing',
        brightness: device.attributes.brightness ? Math.round((device.attributes.brightness / 255) * 100) : (device.state === 'on' ? 100 : 0),
        hs_color: device.attributes.hs_color || [0, 0],
        power: device.attributes.power || device.attributes.current_power_w || device.attributes.load_power || null,
        energy: device.attributes.energy || device.attributes.energy_kwh || device.attributes.total_energy_kwh || null
      },
      attributes: device.attributes // Include attributes for power data
    }));

    // Update cache
    this.deviceCache = {
      data: deviceList,
      expiry: Date.now() + this.DEVICE_CACHE_TTL
    };

    logger.log('[CACHE MISS] Generated fresh device list', 'info', false, 'ha:cache:devices').catch(() => { });
    return deviceList;
  }

  // Cleanup WebSocket on shutdown
  shutdown() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    // Clear caches
    this.stateCache.clear();
    this.deviceCache = null;
  }
}

// Create singleton instance
const instance = new HomeAssistantManager();

// Export with plugin interface
module.exports = {
  name: 'HomeAssistant',
  type: 'device',
  prefix: 'ha_',
  initialize: (io, notificationEmitter, log) => instance.initialize(io, notificationEmitter, log),
  getState: (id) => instance.getState(id),
  updateState: (id, update) => instance.updateState(id, update),
  controlDevice: (deviceId, state) => instance.controlDevice(deviceId, state),
  getDevices: () => instance.getDevices(),
  shutdown: () => instance.shutdown()
};