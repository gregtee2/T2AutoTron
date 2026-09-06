const fetch = require('node-fetch');
const WebSocket = require('ws');
const logger = require('../../logging/logger');

// node-fetch errors and HA response bodies may contain credential-bearing
// URLs. Keep error envelopes useful without forwarding those raw strings.
function safeRequestError(error) {
  if (Number.isInteger(error?.status)) return `HA API error: ${error.status}`;
  if (error?.name === 'AbortError' || ['request-timeout', 'body-timeout'].includes(error?.type)) {
    return 'HA request cancelled or timed out';
  }
  return 'Home Assistant request failed';
}

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
    this.wsReconnectTimer = null;
    this.wsReconnectAttempts = 0;
    this.wsReconnectEnabled = true;
    this.connectionGeneration = 0;
    this.active = false;
    this.initialRequest = null;
    this.wsHandshakeTimer = null;
    this.log = logger.log.bind(logger);
    this.INITIAL_REQUEST_TIMEOUT = 10000;
    this.WS_HANDSHAKE_TIMEOUT = 10000;
    this.io = null;
    this.notificationEmitter = null;  // Store for lock state change notifications
    this.isConnected = false;
    this.wsConnected = false;
    // Performance caching
    this.stateCache = new Map();
    this.deviceCache = null;
    this.STATE_CACHE_TTL = 5000; // 5 seconds for state cache
    this.DEVICE_CACHE_TTL = 30000; // 30 seconds for device list cache
    
    // Device health tracking - prevents spam from consistently failing devices
    this.deviceHealth = new Map(); // entityId -> { failures: number, lastFailure: Date, unhealthy: boolean }
    this.FAILURE_THRESHOLD = 3; // Mark unhealthy after 3 consecutive failures
    this.UNHEALTHY_RETRY_INTERVAL = 5 * 60 * 1000; // Retry unhealthy devices every 5 minutes
  }

  clearReconnectTimer() {
    clearTimeout(this.wsReconnectTimer);
    this.wsReconnectTimer = null;
  }

  closeWebSocket() {
    clearTimeout(this.wsHandshakeTimer);
    this.wsHandshakeTimer = null;
    const ws = this.ws;
    this.ws = null; // Retire it before close/error callbacks can run.
    this.wsConnected = false;
    if (ws) {
      try {
        if (typeof ws.terminate === 'function') ws.terminate();
        else ws.close();
      } catch (_) { /* Already closed. */ }
    }
  }

  cancelConnection() {
    this.connectionGeneration++;
    this.clearReconnectTimer();
    this.initialRequest?.cancel();
    this.initialRequest = null;
    this.closeWebSocket();
    this.isConnected = false;
  }

  // Bound the entire request, including response.json(). Cancellation also
  // settles the initializer when a transport/mock does not honor AbortSignal.
  async fetchInitialStates(config) {
    const controller = new AbortController();
    let cancel;
    let timer;
    const cancelled = new Promise((_, reject) => {
      cancel = () => {
        clearTimeout(timer);
        controller.abort();
        reject(new Error('HA initial request cancelled or timed out'));
      };
    });
    const request = { cancel };
    this.initialRequest = request;
    timer = setTimeout(cancel, this.INITIAL_REQUEST_TIMEOUT);
    timer.unref?.();
    try {
      return await Promise.race([
        (async () => {
          const response = await fetch(`${config.host}/api/states`, {
            headers: { Authorization: `Bearer ${config.token}` },
            signal: controller.signal,
            timeout: this.INITIAL_REQUEST_TIMEOUT
          });
          if (!response.ok) {
            throw Object.assign(new Error('HA API request failed'), { status: response.status });
          }
          return response.json();
        })(),
        cancelled
      ]);
    } finally {
      clearTimeout(timer);
      if (this.initialRequest === request) this.initialRequest = null;
    }
  }

  scheduleWebSocketReconnect(log = this.log, generation = this.connectionGeneration) {
    if (generation !== this.connectionGeneration || !this.active || !this.wsReconnectEnabled || this.wsReconnectTimer || this.ws || this.initialRequest || !this.io || !this.notificationEmitter || !this.config.token) {
      return;
    }

    const attempt = this.wsReconnectAttempts++;
    const delay = Math.min(30000, 1000 * (2 ** Math.min(attempt, 5))) + Math.floor(Math.random() * 250);
    log(`HA WebSocket reconnect scheduled in ${delay}ms (attempt ${attempt + 1})`, 'warn', false, 'ha:websocket:reconnect');

    const timer = setTimeout(() => {
      if (this.wsReconnectTimer !== timer || generation !== this.connectionGeneration || !this.wsReconnectEnabled) return;
      this.wsReconnectTimer = null;
      // Creating a socket is not a failed handshake. Only the attempt's
      // failure handlers may schedule the next retry.
      void this.initializeConnection(generation, log);
    }, delay);
    this.wsReconnectTimer = timer;
    this.wsReconnectTimer.unref?.();
  }

  /**
   * Check if a device is healthy (not marked as failing)
   * Returns true if healthy or if enough time has passed to retry
   */
  isDeviceHealthy(entityId) {
    const health = this.deviceHealth.get(entityId);
    if (!health || !health.unhealthy) return true;
    
    // Allow retry after UNHEALTHY_RETRY_INTERVAL
    const timeSinceLastFailure = Date.now() - health.lastFailure;
    if (timeSinceLastFailure > this.UNHEALTHY_RETRY_INTERVAL) {
      return true; // Time to retry
    }
    return false;
  }

  /**
   * Record a device failure - marks device unhealthy after threshold
   */
  recordDeviceFailure(entityId, error) {
    const health = this.deviceHealth.get(entityId) || { failures: 0, lastFailure: 0, unhealthy: false };
    health.failures++;
    health.lastFailure = Date.now();
    health.lastError = error;
    
    if (health.failures >= this.FAILURE_THRESHOLD && !health.unhealthy) {
      health.unhealthy = true;
      logger.log(`🔴 Device marked UNHEALTHY after ${health.failures} failures: ${entityId} (will retry in 5min)`, 'warn', false, 'ha:health');
    }
    
    this.deviceHealth.set(entityId, health);
    return health.unhealthy;
  }

  /**
   * Record a device success - resets failure counter
   */
  recordDeviceSuccess(entityId) {
    const health = this.deviceHealth.get(entityId);
    if (health && (health.failures > 0 || health.unhealthy)) {
      if (health.unhealthy) {
        logger.log(`🟢 Device recovered: ${entityId}`, 'info', false, 'ha:health');
      }
      this.deviceHealth.delete(entityId);
    }
  }

  /**
   * Get list of currently unhealthy devices (for debugging)
   */
  getUnhealthyDevices() {
    const unhealthy = [];
    for (const [entityId, health] of this.deviceHealth) {
      if (health.unhealthy) {
        unhealthy.push({ entityId, ...health });
      }
    }
    return unhealthy;
  }

  getStatusHost() {
    try {
      const url = new URL(this.config.host);
      return ['http:', 'https:'].includes(url.protocol) ? url.origin : 'Not configured';
    } catch (_) {
      return 'Not configured';
    }
  }

  broadcastConnectionStatus() {
    if (this.io) {
      this.io.emit('ha-connection-status', {
        connected: this.isConnected,
        wsConnected: this.wsConnected,
        deviceCount: this.devices.length,
        host: this.getStatusHost()
      });
    }
  }

  async initialize(io, notificationEmitter, log = this.log) {
    this.updateConfig();
    this.cancelConnection();
    this.io = io;
    this.notificationEmitter = notificationEmitter;
    this.log = log;
    this.active = true;
    this.wsReconnectEnabled = true;
    this.wsReconnectAttempts = 0;
    this.broadcastConnectionStatus();
    return this.initializeConnection(this.connectionGeneration, log);
  }

  async initializeConnection(generation, log) {
    const isCurrent = () => this.active && generation === this.connectionGeneration;
    if (!isCurrent() || !this.wsReconnectEnabled) return [];
    const { io, notificationEmitter } = this;
    const config = { ...this.config }; // Never authenticate an old socket with a new token.
    try {
      log('Initializing Home Assistant...', 'info', false, 'ha:init');
      if (!config.token) {
        this.wsReconnectEnabled = false;
        throw new Error('HA token is not configured');
      }
      const states = await this.fetchInitialStates(config);
      if (!isCurrent()) return [];
      this.devices = states.filter(s => {
        const domain = s.entity_id.split('.')[0];
        return ['light', 'switch', 'sensor', 'binary_sensor', 'media_player', 'fan', 'cover', 'weather', 'device_tracker', 'person', 'lock', 'climate', 'vacuum', 'camera'].includes(domain);
      });

      // REST-only users can read the snapshot; real-time readiness requires
      // a confirmed subscription, not just a successful REST request.
      this.isConnected = !(io && notificationEmitter);

      // Discard the previous snapshot before getDevices builds its cache.
      this.stateCache.clear();
      this.deviceCache = null;
      this.getDevices();

      log(`Initialized ${this.devices.length} HA devices`, 'info', false, 'ha:initialized');
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

        if (!isCurrent()) return [];
        const ws = new WebSocket(`${config.host.replace(/^http/, 'ws')}/api/websocket`);
        this.ws = ws;
        let phase = 'waiting-auth';
        const isCurrentSocket = () => isCurrent() && this.ws === ws;
        const fail = (message, retry = true) => {
          if (!isCurrentSocket()) return;
          this.isConnected = false;
          if (!retry) {
            this.wsReconnectEnabled = false;
          }
          this.clearReconnectTimer();
          this.closeWebSocket();
          log(message, 'warn', false, 'ha:websocket:failure');
          this.broadcastConnectionStatus();
          if (retry) this.scheduleWebSocketReconnect(log, generation);
        };
        // Covers transport open, auth_required/auth_ok, and subscription ack.
        this.wsHandshakeTimer = setTimeout(() => {
          fail('HA WebSocket authentication/subscription timed out');
        }, this.WS_HANDSHAKE_TIMEOUT);
        this.wsHandshakeTimer.unref?.();
        ws.on('open', () => {
          if (!isCurrentSocket()) return;
          log('HA WebSocket transport connected; awaiting authentication', 'info', false, 'ha:websocket');
        });
        ws.on('message', (data) => {
          if (!isCurrentSocket()) return;
          try {
            const msg = JSON.parse(data);
            if (msg.type === 'auth_required' && phase === 'waiting-auth') {
              phase = 'auth-sent';
              ws.send(JSON.stringify({ type: 'auth', access_token: config.token }));
              return;
            }
            if (msg.type === 'auth_ok' && phase === 'auth-sent') {
              phase = 'subscribing';
              ws.send(JSON.stringify({ id: 1, type: 'subscribe_events', event_type: 'state_changed' }));
              return;
            }

            if (msg.type === 'auth_invalid') {
              fail('HA WebSocket authentication rejected; update HA credentials', false);
              return;
            }

            if (msg.type === 'result' && msg.id === 1 && phase === 'subscribing') {
              if (!msg.success) {
                fail('HA WebSocket subscription failed', msg.error?.code !== 'unauthorized');
                return;
              }

              phase = 'ready';
              clearTimeout(this.wsHandshakeTimer);
              this.wsHandshakeTimer = null;
              this.clearReconnectTimer();
              this.isConnected = true;
              this.wsConnected = true;
              this.wsReconnectAttempts = 0;
              log('HA WebSocket authenticated and subscribed', 'info', false, 'ha:websocket');
              this.broadcastConnectionStatus();
              return;
            }

            if (phase === 'ready' && msg.type === 'event' && msg.event?.event_type === 'state_changed') {
              const entity = msg.event.data.new_state;
              const oldEntity = msg.event.data.old_state;
              const context = msg.event.data.context; // HA's context: user_id, parent_id, id
              const entityId = entity?.entity_id || oldEntity?.entity_id;
              if (!entityId) return;
              const domain = entityId.split('.')[0];
              if (!['light', 'switch', 'sensor', 'binary_sensor', 'media_player', 'fan', 'cover', 'weather', 'device_tracker', 'person', 'lock', 'climate', 'vacuum', 'camera'].includes(domain)) return;

              if (!entity) {
                const cacheKey = `ha_${entityId}`;
                this.stateCache.delete(entityId);
                this.stateCache.delete(cacheKey);
                this.deviceCache = null;
                this.devices = this.devices.filter(device => device.entity_id !== entityId);
                io.emit('device-state-update', {
                  id: cacheKey,
                  name: oldEntity?.attributes?.friendly_name || entityId,
                  type: domain,
                  state: 'unavailable',
                  on: false,
                  attributes: {}
                });
                log(`HA entity removed: ${entityId}`, 'warn', false, `ha:removed:${entityId}`);
                return;
              }

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
              this.stateCache.delete(entity.entity_id);
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
          } catch (_) {
            // Parser/transport errors can contain payloads or credential URLs.
            fail('HA WebSocket message processing failed');
          }
        });
        ws.on('error', () => {
          fail('HA WebSocket transport error');
        });
        ws.on('unexpected-response', (_request, response) => {
          fail('HA WebSocket upgrade rejected', ![401, 403].includes(response.statusCode));
        });
        ws.on('close', () => {
          fail('HA WebSocket closed');
        });
      }
      return this.devices;
    } catch (error) {
      if (!isCurrent()) return [];
      this.isConnected = false;
      this.closeWebSocket();
      if (error.status === 401 || error.status === 403) {
        this.wsReconnectEnabled = false;
      }

      log(
        `HA initialization failed${Number.isInteger(error.status) ? ` (HTTP ${error.status})` : ''}; check HA connection and credentials`,
        'error',
        false,
        'ha:error'
      );
      this.broadcastConnectionStatus();
      this.scheduleWebSocketReconnect(log, generation);
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
      if (!response.ok) throw Object.assign(new Error('HA API request failed'), { status: response.status });
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
      const message = safeRequestError(error);
      await logger.log(`Failed to fetch state for HA device ${id}: ${message}`, 'error', false, `ha:state:${id}`);
      return { success: false, error: message };
    }
  }

  async updateState(id, update) {
    // Extract rawId early so it's available in catch block
    const rawId = id.replace('ha_', '');
    
    try {
      // Keep config current in case settings were updated at runtime
      this.updateConfig();
      
      // Check device health before sending command
      if (!this.isDeviceHealthy(rawId)) {
        // Device is unhealthy and not ready for retry - skip silently
        return { success: false, error: 'Device marked unhealthy - skipping', skipped: true };
      }
      
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
        throw Object.assign(new Error('HA API request failed'), { status: response.status });
      }

      // Invalidate cache after update
      this.stateCache.delete(id);

      // Record success - device is healthy
      this.recordDeviceSuccess(rawId);

      await logger.log(`HA state update succeeded for ${id}: ${JSON.stringify(payload)}`, 'info', false, `ha:state:${id}`);
      return { success: true };
    } catch (error) {
      // Record failure - may mark device as unhealthy
      const message = safeRequestError(error);
      const isNowUnhealthy = this.recordDeviceFailure(rawId, message);
      
      // Only log if device just became unhealthy or is healthy (not spam for known-bad devices)
      if (!isNowUnhealthy) {
        await logger.log(`HA state update failed for ${id}: ${message}`, 'error', false, `ha:state:${id}`);
      }
      return { success: false, error: message };
    }
  }

  async controlDevice(id, state) {
    return this.updateState(id, state);
  }

  /**
   * Call any Home Assistant service
   * @param {string} domain - Service domain (e.g., 'media_player', 'light', 'switch')
   * @param {string} service - Service name (e.g., 'play_media', 'turn_on')
   * @param {object} data - Service data payload
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async callService(domain, service, data) {
    this.updateConfig();

    // Extract entity_id for health tracking (if present)
    const entityId = data?.entity_id;
    const healthKey = entityId || `${domain}.${service}`;
    
    // Check health if we have an entity_id
    if (entityId && !this.isDeviceHealthy(entityId)) {
      return { success: false, error: 'Device marked unhealthy - skipping', skipped: true };
    }

    try {
      const response = await fetch(`${this.config.host}/api/services/${domain}/${service}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
        timeout: 10000
      });

      if (!response.ok) {
        throw Object.assign(new Error('HA API request failed'), { status: response.status });
      }

      // Record success
      if (entityId) this.recordDeviceSuccess(entityId);

      await logger.log(`HA service call succeeded: ${domain}.${service}`, 'info', false, `ha:service:${domain}`);
      return { success: true };
    } catch (error) {
      // Record failure
      const message = safeRequestError(error);
      const isNowUnhealthy = entityId ? this.recordDeviceFailure(entityId, message) : false;
      
      // Only log if not already marked unhealthy (prevents spam)
      if (!isNowUnhealthy) {
        await logger.log(`HA service call failed: ${domain}.${service} - ${message}`, 'error', false, `ha:service:${domain}`);
      }
      return { success: false, error: message };
    }
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
    this.active = false;
    this.wsReconnectEnabled = false;
    this.cancelConnection();
    // Clear caches
    this.stateCache.clear();
    this.deviceCache = null;
    this.broadcastConnectionStatus();
  }

  // Update config from process.env (called after settings are saved)
  updateConfig(reconfigure = false) {
    const oldHost = this.config.host;
    const oldToken = this.config.token;
    
    this.config.host = process.env.HA_HOST || 'http://localhost:8123';
    this.config.token = process.env.HA_TOKEN;
    
    const changed = oldHost !== this.config.host || oldToken !== this.config.token;
    // An explicit reconfigure can retry rejected credentials even if the
    // values are unchanged. Ordinary REST reads do not clear that latch.
    if (changed || reconfigure) {
      this.cancelConnection();
      this.wsReconnectEnabled = this.active;
      this.wsReconnectAttempts = 0;
      this.devices = [];
      this.stateCache.clear();
      this.deviceCache = null;
      logger.log('HA config updated from environment', 'info', false, 'ha:config:update');
      this.broadcastConnectionStatus();
      this.scheduleWebSocketReconnect();
    }
    return changed;
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

    // Strip 'ha_' prefix if present (this is the media_player target)
    const cleanEntityId = entityId.startsWith('ha_') ? entityId.slice(3) : entityId;

    try {
      let ttsServices;
      if (options.tts_service) {
        // Use only the selected service
        if (options.tts_service === 'tts/speak') {
          // tts.speak requires a TTS entity as the target, and media_player as the speaker
          // The tts_entity_id is the TTS engine (e.g., 'tts.google_translate_en_com')
          const ttsEntityId = options.tts_entity_id;
          if (!ttsEntityId) {
            logger.log('tts.speak requires a TTS entity (tts_entity_id option)', 'warn');
            return { success: false, error: 'tts.speak requires selecting a TTS engine' };
          }
          ttsServices = [
            { 
              service: 'tts/speak', 
              payload: { 
                entity_id: ttsEntityId,  // The TTS engine entity
                media_player_entity_id: cleanEntityId,  // The speaker to play on
                message 
              } 
            }
          ];
        } else if (options.tts_service === 'tts/cloud_say') {
          ttsServices = [
            { service: 'tts/cloud_say', payload: { entity_id: cleanEntityId, message, language: options.language || 'en-US' } }
          ];
        } else if (options.tts_service === 'tts/google_translate_say') {
          ttsServices = [
            { service: 'tts/google_translate_say', payload: { entity_id: cleanEntityId, message } }
          ];
        } else {
          // Unknown service, fallback to all
          ttsServices = [
            { service: options.tts_service, payload: { entity_id: cleanEntityId, message } }
          ];
        }
      } else {
        // Default order
        ttsServices = [
          { service: 'tts/cloud_say', payload: { entity_id: cleanEntityId, message, language: options.language || 'en-US' } },
          { service: 'tts/google_translate_say', payload: { entity_id: cleanEntityId, message } },
          { service: 'tts/speak', payload: { entity_id: cleanEntityId, media_player_entity_id: cleanEntityId, message } }
        ];
      }

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
            logger.log(`${service} failed (HTTP ${response.status})`, 'warn', false, 'ha:tts');
          }
        } catch (err) {
          logger.log(`${service} error: ${safeRequestError(err)}`, 'warn', false, 'ha:tts');
        }
      }

      throw new Error('All TTS services failed');
    } catch (error) {
      const message = error.message === 'All TTS services failed' ? 'All TTS services failed' : safeRequestError(error);
      logger.log(`TTS failed for ${cleanEntityId}: ${message}`, 'error', false, 'ha:tts');
      return { success: false, error: message };
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

  /**
   * Get all TTS entities (e.g., tts.google_translate_en_com)
   * These are the "Target" entities shown in the HA tts.speak service UI
   */
  async getTtsEntities() {
    if (!this.config.token) {
      logger.log('Cannot get TTS entities: No HA token configured', 'error');
      return [];
    }

    try {
      const response = await fetch(`${this.config.host}/api/states`, {
        headers: { Authorization: `Bearer ${this.config.token}` },
      });
      if (!response.ok) throw Object.assign(new Error('HA API request failed'), { status: response.status });
      const states = await response.json();
      
      // Filter for TTS entities (entity_id starts with 'tts.')
      const ttsEntities = states
        .filter(s => s.entity_id.startsWith('tts.'))
        .map(s => ({
          entity_id: s.entity_id,
          friendly_name: s.attributes.friendly_name || s.entity_id.replace('tts.', '').replace(/_/g, ' ')
        }));
      
      logger.log(`Found ${ttsEntities.length} TTS entities: ${ttsEntities.map(e => e.entity_id).join(', ')}`, 'info');
      return ttsEntities;
    } catch (error) {
      logger.log(`Failed to get TTS entities: ${safeRequestError(error)}`, 'error');
      return [];
    }
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
  updateConfig: () => instance.updateConfig(true),
  speakTTS: (entityId, message, options) => instance.speakTTS(entityId, message, options),
  getMediaPlayers: () => instance.getMediaPlayers(),
  getTtsEntities: () => instance.getTtsEntities(),
  callService: (domain, service, data) => instance.callService(domain, service, data),
  // Device health tracking
  isDeviceHealthy: (entityId) => instance.isDeviceHealthy(entityId),
  recordDeviceSuccess: (entityId) => instance.recordDeviceSuccess(entityId),
  recordDeviceFailure: (entityId, error) => instance.recordDeviceFailure(entityId, error),
  getUnhealthyDevices: () => instance.getUnhealthyDevices(),
  deviceHealth: instance.deviceHealth,  // Direct access to the Map for reset
  UNHEALTHY_RETRY_INTERVAL: instance.UNHEALTHY_RETRY_INTERVAL,
  FAILURE_THRESHOLD: instance.FAILURE_THRESHOLD,
  // Expose connection status for status requests
  getConnectionStatus: () => ({
    isConnected: instance.isConnected,
    wsConnected: instance.wsConnected,
    deviceCount: instance.devices?.length || 0,
    host: instance.getStatusHost()
  })
};