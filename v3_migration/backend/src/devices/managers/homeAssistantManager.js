const fetch = require('node-fetch');
const WebSocket = require('ws');
const logger = require('../../logging/logger');

// Lazy-load commandTracker to avoid circular dependencies
let commandTracker = null;
function getCommandTracker() {
  if (!commandTracker) {
    try {
      commandTracker = require('../../engine/commandTracker');
    } catch (e) {
      // Engine not available (e.g., during startup)
    }
  }
  return commandTracker;
}

class HomeAssistantManager {
  constructor() {
    this.devices = [];
    this.config = {
      host: process.env.HA_HOST || 'http://localhost:8123',
      token: process.env.HA_TOKEN,
    };
    this.ws = null;
    this.io = null;
    this.notificationEmitter = null;  // Store for lock state change notifications
    this.isConnected = false;
    this.wsConnected = false;
    // Performance caching
    this.stateCache = new Map();
    this.deviceCache = null;
    this.STATE_CACHE_TTL = 5000; // 5 seconds for state cache
    this.DEVICE_CACHE_TTL = 30000; // 30 seconds for device list cache
  }

  broadcastConnectionStatus() {
    if (this.io) {
      this.io.emit('ha-connection-status', {
        connected: this.isConnected,
        wsConnected: this.wsConnected,
        deviceCount: this.devices.length,
        host: this.config.host
      });
    }
  }

  async initialize(io, notificationEmitter, log) {
    this.io = io;
    this.notificationEmitter = notificationEmitter;  // Store for lock notifications
    try {
      // Always refresh config from current environment before connecting.
      // This prevents stale host/token if the module was loaded before dotenv
      // or if settings were updated at runtime.
      this.updateConfig();

      await log('Initializing Home Assistant...', 'info', false, 'ha:init');
      await log(
        `HA config: host=${this.config.host} token=${this.config.token ? 'set' : 'missing'}`,
        'info',
        false,
        'ha:config'
      );
      const response = await fetch(`${this.config.host}/api/states`, {
        headers: { Authorization: `Bearer ${this.config.token}` },
      });
      if (!response.ok) throw new Error(`HA API error: ${response.status}: ${response.statusText}`);
      const states = await response.json();
      this.devices = states.filter(s => {
        const domain = s.entity_id.split('.')[0];
        return ['light', 'switch', 'sensor', 'binary_sensor', 'media_player', 'fan', 'cover', 'weather', 'device_tracker', 'person', 'lock', 'climate', 'vacuum', 'camera'].includes(domain);
      });

      this.isConnected = true;

      // Initialize device cache
      this.deviceCache = {
        data: this.getDevices(),
        expiry: Date.now() + this.DEVICE_CACHE_TTL
      };

      await log(`Initialized ${this.devices.length} HA devices`, 'info', false, 'ha:initialized');
      this.broadcastConnectionStatus();

      if (io && notificationEmitter) {
        // Emit device state updates to frontend (socket.io) but NOT to Telegram
        // This prevents spam on server startup - only real state changes should notify
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
          // REMOVED: notificationEmitter.emit - no Telegram spam on init
        });

        // Initialize WebSocket for real-time updates
        // Close existing WebSocket if reconnecting to prevent memory leak
        if (this.ws) {
          try {
            this.ws.close();
          } catch (e) {
            // Ignore close errors
          }
          this.ws = null;
        }
        this.ws = new WebSocket(`${this.config.host.replace('http', 'ws')}/api/websocket`);
        this.ws.on('open', () => {
          this.ws.send(JSON.stringify({ type: 'auth', access_token: this.config.token }));
          this.ws.send(JSON.stringify({ id: 1, type: 'subscribe_events', event_type: 'state_changed' }));
          this.wsConnected = true;
          log(' HA WebSocket connected', 'info', false, 'ha:websocket');
          this.broadcastConnectionStatus();
        });
        this.ws.on('message', (data) => {
          try {
            const msg = JSON.parse(data);
            if (msg.type === 'event' && msg.event.event_type === 'state_changed') {
              const entity = msg.event.data.new_state;
              const oldEntity = msg.event.data.old_state;
              const context = msg.event.data.context; // HA's context: user_id, parent_id, id
              if (!entity) return;
              const domain = entity.entity_id.split('.')[0];
              if (!['light', 'switch', 'sensor', 'binary_sensor', 'media_player', 'fan', 'cover', 'weather', 'device_tracker', 'person', 'lock', 'climate', 'vacuum', 'camera'].includes(domain)) return;

              // Track state change origin for debugging
              const tracker = getCommandTracker();
              if (tracker && ['light', 'switch', 'lock', 'cover', 'fan', 'climate'].includes(domain)) {
                tracker.logIncomingStateChange({
                  entityId: entity.entity_id,
                  oldState: oldEntity?.state,
                  newState: entity.state,
                  context,
                  attributes: entity.attributes
                });
              }

              // Invalidate cache on state change
              const cacheKey = `ha_${entity.entity_id}`;
              this.stateCache.delete(cacheKey);
              
              // Also invalidate device list cache so getDevices() returns fresh data
              this.deviceCache = null;
              
              // Update the devices array with new state/attributes, or ADD if new entity
              const deviceIndex = this.devices.findIndex(d => d.entity_id === entity.entity_id);
              if (deviceIndex >= 0) {
                this.devices[deviceIndex].state = entity.state;
                this.devices[deviceIndex].attributes = entity.attributes;
              } else {
                // NEW ENTITY - add it to the devices array
                this.devices.push({
                  entity_id: entity.entity_id,
                  state: entity.state,
                  attributes: entity.attributes
                });
                log(`New HA entity discovered: ${entity.entity_id}`, 'info', false, 'ha:new-entity');
              }

              const state = {
                id: cacheKey,
                name: entity.attributes.friendly_name || entity.entity_id,
                type: domain,
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
              
              // Send Telegram notification for lock state changes
              if (domain === 'lock' && this.notificationEmitter) {
                const oldState = oldEntity?.state;
                const newState = entity.state;
                const lockName = entity.attributes.friendly_name || entity.entity_id;
                
                // Only notify if state actually changed (not just attribute update)
                // ALSO: Skip transitional states (locking/unlocking) - only notify on final states
                if (oldState && oldState !== newState) {
                  let emoji = '🔒';
                  let action = newState;
                  let shouldNotify = true;
                  
                  if (newState === 'locked') {
                    emoji = '🔒';
                    action = 'LOCKED';
                  } else if (newState === 'unlocked') {
                    emoji = '🔓';
                    action = 'UNLOCKED';
                  } else if (newState === 'locking' || newState === 'unlocking') {
                    // Skip transitional states - too spammy
                    shouldNotify = false;
                    log(`Lock transitional state skipped: ${lockName} -> ${newState}`, 'info', false, `ha:lock:${entity.entity_id}`);
                  }
                  
                  if (shouldNotify) {
                    const message = `${emoji} *${lockName}* ${action}`;
                    // Use priority flag for security-critical lock notifications
                    this.notificationEmitter.emit('notify', message, { priority: true });
                    log(`Lock notification: ${message}`, 'info', false, `ha:lock:${entity.entity_id}`);
                  }
                }
              }
            }
          } catch (err) {
            log(`HA WebSocket message error: ${err.message}`, 'error', false, 'ha:websocket:message');
          }
        });
        this.ws.on('error', (err) => {
          this.wsConnected = false;
          log(`HA WebSocket error: ${err.message}`, 'error', false, 'ha:websocket:error');
          this.broadcastConnectionStatus();
        });
        this.ws.on('close', () => {
          this.wsConnected = false;
          log('HA WebSocket closed', 'warn', false, 'ha:websocket:close');
          this.broadcastConnectionStatus();
        });
      }
      return this.devices;
    } catch (error) {
      this.isConnected = false;
      this.wsConnected = false;

      // Include as much actionable detail as we can
      const errCode = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      const hint =
        (errCode === 'ENOTFOUND' || errCode === 'EAI_AGAIN') &&
        typeof this.config.host === 'string' &&
        this.config.host.includes('.local')
          ? ' (Hint: Windows sometimes cannot resolve *.local; try setting HA_HOST to a fixed IP like http://192.168.x.x:8123)'
          : '';

      await log(
        `HA initialization failed (host=${this.config.host}, token=${this.config.token ? 'set' : 'missing'}${errCode ? `, code=${errCode}` : ''}): ${error.message}${hint}`,
        'error',
        false,
        'ha:error'
      );
      this.broadcastConnectionStatus();
      return [];
    }
  }

  async getState(id) {
    // Keep config current in case settings were updated at runtime
    this.updateConfig();

    const cacheKey = id;
    const cached = this.stateCache.get(cacheKey);

    // Check cache first
    if (cached && Date.now() < cached.expiry) {
      logger.log(`[CACHE HIT] Returning cached state for HA device ${cacheKey}`, 'info', false, `ha:state:${cacheKey}`).catch(() => { });
      return { success: true, state: cached.state };
    }

    try {
      const rawId = id.replace('ha_', '');
      const response = await fetch(`${this.config.host}/api/states/${rawId}`, {
        headers: { Authorization: `Bearer ${this.config.token}` },
        timeout: 5000
      });
      if (!response.ok) throw new Error(`HA API error: ${response.status}: ${response.statusText}`);
      const data = await response.json();

      const entityType = rawId.split('.')[0];
      const state = {
        state: data.state,
        on: data.state === 'on' || data.state === 'open' || data.state === 'playing',
        brightness: data.attributes?.brightness !== undefined
          ? Math.round((Number(data.attributes.brightness) / 255) * 100)
          : (data.state === 'on' ? 100 : 0),
        hs_color: data.attributes?.hs_color || [0, 0],
        percentage: data.attributes?.percentage,
        position: data.attributes?.current_position,
        volume_level: data.attributes?.volume_level,
        source: data.attributes?.source,
        media_title: data.attributes?.media_title,
        power: data.attributes?.power || data.attributes?.current_power_w || data.attributes?.load_power || null,
        energy: data.attributes?.energy || data.attributes?.energy_kwh || data.attributes?.total_energy_kwh || null,
        attributes: data.attributes
      };

      // Store in cache
      this.stateCache.set(cacheKey, {
        state,
        expiry: Date.now() + this.STATE_CACHE_TTL
      });

      await logger.log(
        `[CACHE MISS] Fetched state for HA device ${rawId} (${entityType}): state=${state.state} on=${state.on} brightness=${state.brightness}`,
        'info',
        false,
        `ha:state:${rawId}`
      );

      return { success: true, state };
    } catch (error) {
      await logger.log(`Failed to fetch state for HA device ${id}: ${error.message}`, 'error', false, `ha:state:${id}`);
      return { success: false, error: error.message };
    }
  }

  async updateState(id, update) {
    try {
      // Keep config current in case settings were updated at runtime
      this.updateConfig();

      const rawId = id.replace('ha_', '');
      const entityType = rawId.split('.')[0];
      const service = entityType;
      const payload = { entity_id: rawId };

      const coerceBoolean = (value) => {
        if (value === true || value === false) return value;
        if (typeof value === 'number') {
          if (value === 1) return true;
          if (value === 0) return false;
        }
        if (typeof value === 'string') {
          const normalized = value.trim().toLowerCase();
          if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
          if (['false', '0', 'no', 'off'].includes(normalized)) return false;
        }
        return undefined;
      };

      const on = coerceBoolean(update.on);

      let action;

      if (entityType === 'cover') {
        if (update.position !== undefined) {
          action = 'set_cover_position';
          payload.position = update.position;
        } else if (on === true) {
          action = 'open_cover';
        } else if (on === false) {
          action = 'close_cover';
        } else {
          action = 'close_cover';
        }
      } else if (entityType === 'media_player') {
        if (update.volume_level !== undefined) {
          action = 'volume_set';
          payload.volume_level = update.volume_level;
        } else if (update.source !== undefined) {
          action = 'select_source';
          payload.source = update.source;
        } else if (typeof update.state === 'string') {
          const normalized = update.state.trim().toLowerCase();
          if (normalized === 'playing') action = 'media_play';
          else if (normalized === 'paused') action = 'media_pause';
          else if (normalized === 'off') action = 'turn_off';
          else if (normalized === 'on') action = 'turn_on';
          else action = 'turn_off';
        } else if (on === true) {
          action = 'turn_on';
        } else if (on === false) {
          action = 'turn_off';
        } else {
          action = 'turn_off';
        }
      } else {
        if (on === true) action = 'turn_on';
        else if (on === false) action = 'turn_off';
        else {
          const hasOnFields =
            update.brightness !== undefined ||
            !!update.hs_color ||
            update.color_temp !== undefined ||
            update.color_temp_kelvin !== undefined ||
            update.transition !== undefined ||
            (entityType === 'fan' && update.percentage !== undefined);
          action = hasOnFields ? 'turn_on' : 'turn_off';
        }
      }

      if (action === 'turn_on') {
        if (update.brightness !== undefined) payload.brightness = Math.round(update.brightness); // Use 0-255 brightness
        if (update.hs_color) payload.hs_color = update.hs_color;
        if (update.color_temp) payload.color_temp = update.color_temp;
        if (update.color_temp_kelvin) payload.color_temp_kelvin = update.color_temp_kelvin;
        if (update.transition !== undefined) payload.transition = update.transition / 1000;
        if (update.percentage !== undefined && entityType === 'fan') payload.percentage = update.percentage;
      }

      await logger.log(
        `Sending HA state update for ${id}: service=${service}.${action} payload=${JSON.stringify(payload)}`,
        'info',
        false,
        `ha:state:${id}`
      );
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

  // Update config from process.env (called after settings are saved)
  updateConfig() {
    const oldHost = this.config.host;
    const oldToken = this.config.token;
    
    this.config.host = process.env.HA_HOST || 'http://localhost:8123';
    this.config.token = process.env.HA_TOKEN;
    
    // Clear caches when config changes
    if (oldHost !== this.config.host || oldToken !== this.config.token) {
      this.stateCache.clear();
      this.deviceCache = null;
      logger.log('HA config updated from environment', 'info', false, 'ha:config:update');
      return true; // Config changed
    }
    return false; // No change
  }

  /**
   * Send TTS announcement to a media_player entity
   * @param {string} entityId - The media_player entity (e.g., 'media_player.homepod_living_room')
   * @param {string} message - The text to speak
   * @param {object} options - Optional: { volume, language, tts_service }
   */
  async speakTTS(entityId, message, options = {}) {
    if (!this.config.token) {
      logger.log('Cannot send TTS: No HA token configured', 'error');
      return { success: false, error: 'No HA token configured' };
    }

    // Strip 'ha_' prefix if present
    const cleanEntityId = entityId.startsWith('ha_') ? entityId.slice(3) : entityId;

    try {
      // Try services in order of preference:
      // 1. tts.cloud_say (Nabu Casa)
      // 2. tts.google_translate_say
      // 3. tts.speak (generic)
      
      const ttsServices = [
        { service: 'tts/cloud_say', payload: { entity_id: cleanEntityId, message, language: options.language || 'en-US' } },
        { service: 'tts/google_translate_say', payload: { entity_id: cleanEntityId, message } },
        { service: 'tts/speak', payload: { entity_id: cleanEntityId, media_player_entity_id: cleanEntityId, message } }
      ];

      logger.log(`Sending TTS to ${cleanEntityId}: "${message}"`, 'info', false, 'ha:tts');

      for (const { service, payload } of ttsServices) {
        try {
          const response = await fetch(`${this.config.host}/api/services/${service}`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${this.config.token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
            timeout: 10000
          });

          if (response.ok) {
            logger.log(`TTS sent successfully via ${service} to ${cleanEntityId}`, 'info', false, 'ha:tts');
            return { success: true, service };
          } else {
            const errorText = await response.text();
            logger.log(`${service} failed (${response.status}): ${errorText}`, 'warn', false, 'ha:tts');
          }
        } catch (err) {
          logger.log(`${service} error: ${err.message}`, 'warn', false, 'ha:tts');
        }
      }

      throw new Error('All TTS services failed');
    } catch (error) {
      logger.log(`TTS failed for ${cleanEntityId}: ${error.message}`, 'error', false, 'ha:tts');
      return { success: false, error: error.message };
    }
  }

  /**
   * Get all media_player entities (for TTS target selection)
   */
  async getMediaPlayers() {
    const devices = await this.getDevices();
    // Device IDs have 'ha_' prefix, so look for 'ha_media_player.'
    const players = devices.filter(d => d.id && d.id.includes('media_player.'));
    logger.log(`Found ${players.length} media players: ${players.map(p => p.id).join(', ')}`, 'info');
    return players;
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
  shutdown: () => instance.shutdown(),
  updateConfig: () => instance.updateConfig(),
  speakTTS: (entityId, message, options) => instance.speakTTS(entityId, message, options),
  getMediaPlayers: () => instance.getMediaPlayers(),
  // Expose connection status for status requests
  getConnectionStatus: () => ({
    isConnected: instance.isConnected,
    wsConnected: instance.wsConnected,
    deviceCount: instance.devices?.length || 0,
    host: instance.config?.host || 'Not configured'
  })
};