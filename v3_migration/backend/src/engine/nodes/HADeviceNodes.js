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

// Debug mode - only log verbose info when enabled
const VERBOSE = process.env.VERBOSE_LOGGING === 'true';

// ============================================================================
// HSV Update Tracker - Periodic summary logging (every 60s) - only when VERBOSE
// ============================================================================
const hsvUpdateTracker = {
  updates: new Map(),  // entityId -> { oldHsv, newHsv, count, lastTime }
  lastSummaryTime: 0,
  SUMMARY_INTERVAL: 60000,  // 60 seconds
  
  track(entityId, oldHsv, newHsv) {
    const now = Date.now();
    const existing = this.updates.get(entityId);
    if (existing) {
      existing.newHsv = newHsv;
      existing.count++;
      existing.lastTime = now;
    } else {
      this.updates.set(entityId, { oldHsv, newHsv, count: 1, lastTime: now });
    }
    
    // Check if it's time for a summary
    if (now - this.lastSummaryTime >= this.SUMMARY_INTERVAL) {
      this.logSummary();
    }
  },
  
  logSummary() {
    if (this.updates.size === 0) {
      // Only log "no updates" in verbose mode
      if (VERBOSE) console.log('[HSV-SUMMARY] No updates to report');
      return;
    }
    
    const now = Date.now();
    this.lastSummaryTime = now;
    
    // Build compact summary
    const lines = [];
    for (const [entityId, data] of this.updates) {
      const shortName = entityId.replace('light.', '');
      const oldH = data.oldHsv?.hue?.toFixed(3) || '?';
      const newH = data.newHsv?.hue?.toFixed(3) || '?';
      const newS = (data.newHsv?.saturation * 100)?.toFixed(0) || '?';
      const newB = data.newHsv?.brightness?.toFixed(0) || '?';
      lines.push(`${shortName}: H:${oldH}→${newH} S:${newS}% B:${newB}`);
    }
    
    // Only log to console in verbose mode
    if (VERBOSE) {
      console.log('');
      console.log('═══════════════════════════════════════════════════════════════');
      console.log(`[HSV-SUMMARY] ${this.updates.size} lights updated in last 60s:`);
      for (const line of lines) {
        console.log(`  • ${line}`);
      }
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('');
    }
    
    // Also log to file
    engineLogger.log('HSV-SUMMARY', `${this.updates.size} lights updated`, {
      lights: lines.join(' | ')
    });
    
    // Clear for next interval
    this.updates.clear();
  }
};

/**
 * Helper to get HA config from environment
 */
function getHAConfig() {
  return {
    host: process.env.HA_HOST || 'http://homeassistant.local:8123',
    token: process.env.HA_TOKEN || ''
  };
}

// ============================================================================
// Bulk State Cache - Fetches ALL states once, nodes read from cache
// This is MUCH more efficient than 30+ individual API calls!
// ============================================================================
const bulkStateCache = {
  states: new Map(),        // entityId → state object
  lastFetchTime: 0,
  fetchPromise: null,       // Prevents duplicate fetches
  CACHE_TTL: 2000,          // 2 seconds - fast enough for responsive updates
  
  /**
   * Get state for an entity, using cached bulk fetch
   * @param {string} entityId - e.g., "sensor.temperature" (without ha_ prefix)
   * @returns {object|null} State object or null if not found
   */
  async getState(entityId) {
    const now = Date.now();
    
    // If cache is stale, refresh it
    if (now - this.lastFetchTime > this.CACHE_TTL) {
      await this.refreshCache();
    }
    
    return this.states.get(entityId) || null;
  },
  
  /**
   * Refresh the bulk state cache with ALL states from HA
   */
  async refreshCache() {
    // If already fetching, wait for that fetch to complete
    if (this.fetchPromise) {
      return this.fetchPromise;
    }
    
    const config = getHAConfig();
    if (!config.token) {
      return;
    }
    
    // Create a promise that all waiters can share
    this.fetchPromise = (async () => {
      try {
        const url = `${config.host}/api/states`;
        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${config.token}`,
            'Content-Type': 'application/json'
          },
          signal: AbortSignal.timeout(10000)
        });
        
        if (!response.ok) {
          console.error(`[BulkStateCache] Failed to fetch states: HTTP ${response.status}`);
          return;
        }
        
        const states = await response.json();
        
        // Clear and rebuild cache
        this.states.clear();
        for (const state of states) {
          this.states.set(state.entity_id, {
            entity_id: state.entity_id,
            state: state.state,
            attributes: state.attributes,
            last_changed: state.last_changed,
            last_updated: state.last_updated
          });
        }
        
        this.lastFetchTime = Date.now();
        
        // Log cache refresh periodically (every 30 seconds)
        if (!this._lastLogTime || Date.now() - this._lastLogTime > 30000) {
          this._lastLogTime = Date.now();
          console.log(`[BulkStateCache] ✅ Cache refreshed: ${this.states.size} entities`);
        }
      } catch (error) {
        console.error(`[BulkStateCache] Error fetching states: ${error.message}`);
      } finally {
        this.fetchPromise = null;
      }
    })();
    
    return this.fetchPromise;
  }
};

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
      selectedDeviceId: '',  // Frontend uses this name
      pollInterval: 5000,  // ms between polls
      lastState: null
    };
    this.lastPollTime = 0;
    this.cachedState = null;
  }

  restore(data) {
    if (data.properties) {
      Object.assign(this.properties, data.properties);
      // Frontend uses selectedDeviceId, backend uses entityId - sync them
      if (this.properties.selectedDeviceId && !this.properties.entityId) {
        this.properties.entityId = this.properties.selectedDeviceId;
      }
      // Log what we restored for debugging
      const entityId = this.properties.entityId || this.properties.selectedDeviceId;
      if (entityId) {
        console.log(`[HADeviceStateNode ${this.id?.slice(0,8) || 'new'}] Restored with entityId: ${entityId}`);
      } else {
        console.warn(`[HADeviceStateNode ${this.id?.slice(0,8) || 'new'}] Restored but NO entityId found in properties:`, Object.keys(data.properties));
      }
    }
  }

  /**
   * Fetch state with retry logic
   * @param {number} attempt - Current retry attempt (1-based)
   * @returns {object|null} Device state or null on failure
   */
  async fetchStateWithRetry(attempt = 1) {
    const MAX_RETRIES = 3;
    const RETRY_DELAYS = [0, 1000, 3000]; // Immediate, 1s, 3s
    
    const result = await this.fetchState();
    
    if (result !== null) {
      return result;
    }
    
    // If we have more retries, wait and try again
    if (attempt < MAX_RETRIES) {
      const delay = RETRY_DELAYS[attempt] || 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
      return this.fetchStateWithRetry(attempt + 1);
    }
    
    return null;
  }

  async fetchState() {
    // Check both entityId and selectedDeviceId
    let entityId = this.properties.entityId || this.properties.selectedDeviceId;
    if (!entityId) {
      // Only log once per node to avoid spam
      if (!this._missingIdLogged) {
        this._missingIdLogged = true;
        console.warn(`[HADeviceStateNode ${this.id?.slice(0,8)}] No entityId set`);
      }
      return null;
    }

    // Strip ha_ prefix if present (frontend stores as ha_light.xxx, HA API needs light.xxx)
    if (entityId.startsWith('ha_')) {
      entityId = entityId.replace('ha_', '');
    }

    // Use bulk cache instead of individual API call - MUCH faster with many nodes!
    const state = await bulkStateCache.getState(entityId);
    
    if (!state) {
      // Only log entity not found once per entity
      if (!this._notFoundLogged) {
        this._notFoundLogged = true;
        console.warn(`[HADeviceStateNode ${this.id?.slice(0,8)}] Entity ${entityId} not found in cache`);
      }
      return null;
    }
    
    // Clear error tracking on success
    this._lastErrorType = null;
    this._lastErrorTime = null;
    this._notFoundLogged = false;  // Reset so we log again if it disappears
    
    return state;
  }

  async data(inputs) {
    const now = Date.now();
    
    // Log on first tick to confirm node is running with correct config
    if (!this._startupLogged) {
      this._startupLogged = true;
      const entityId = this.properties.entityId || this.properties.selectedDeviceId;
      console.log(`[HADeviceStateNode ${this.id?.slice(0,8) || 'new'}] 🚀 First tick - entityId: ${entityId || 'NOT SET'}`);
    }
    
    // Calculate dynamic poll interval based on failure count
    // Normal: 5s, After failures: gradually increase to reduce load on struggling HA
    const baseInterval = this.properties.pollInterval || 5000;
    const failures = this._consecutiveFailures || 0;
    const backoffMultiplier = Math.min(1 + failures * 0.5, 6); // Max 6x = 30 seconds
    const effectiveInterval = baseInterval * backoffMultiplier;
    
    // Poll at configured interval
    if (now - this.lastPollTime >= effectiveInterval) {
      this.lastPollTime = now;
      
      // Use retry logic if we've had recent failures
      const newState = failures > 0 
        ? await this.fetchStateWithRetry()
        : await this.fetchState();
      
      // Only update cachedState if we got valid data
      if (newState !== null) {
        // Success! Reset failure count and log recovery if we were failing
        if (this._consecutiveFailures > 0 && VERBOSE) {
          console.log(`[HADeviceStateNode ${this.id?.slice(0,8) || 'unknown'}] ✅ Recovered after ${this._consecutiveFailures} failures`);
        }
        this.cachedState = newState;
        this._consecutiveFailures = 0;
        this._staleDataAge = null;
      } else {
        // Track failures
        this._consecutiveFailures = (this._consecutiveFailures || 0) + 1;
        
        // Track how old our stale data is
        if (!this._staleDataAge && this.cachedState) {
          this._staleDataAge = now;
        }
        
        // Log with context about what's wrong
        if (this._consecutiveFailures === 1) {
          console.warn(`[HADeviceStateNode ${this.id?.slice(0,8) || 'unknown'}] Poll failed (${this._lastErrorType || 'UNKNOWN'}), will retry with backoff`);
        } else if (this._consecutiveFailures % 12 === 0) {
          const staleMinutes = this._staleDataAge ? Math.floor((now - this._staleDataAge) / 60000) : 0;
          console.warn(`[HADeviceStateNode ${this.id?.slice(0,8) || 'unknown'}] ${this._consecutiveFailures} consecutive failures (${this._lastErrorType}), stale data age: ${staleMinutes}min, next retry in ${Math.round(effectiveInterval/1000)}s`);
        }
        
        // After 5 minutes of failures (60 polls at 5s), try a more aggressive recovery
        if (this._consecutiveFailures === 60) {
          console.error(`[HADeviceStateNode ${this.id?.slice(0,8) || 'unknown'}] ⚠️ 5 minutes of failures - possible HA connection issue. Check HA_HOST and HA_TOKEN in .env`);
        }
      }
    }

    if (!this.cachedState) {
      return { state: null, device_state: null };
    }

    // Extract common values
    const state = this.cachedState.state;
    const isOn = state === 'on' || state === 'playing' || state === 'home';
    
    // Log output periodically to trace data flow (every 30 seconds)
    if (!this._lastOutputLog || Date.now() - this._lastOutputLog > 30000) {
      this._lastOutputLog = Date.now();
      const entityId = this.properties.entityId || this.properties.selectedDeviceId;
      console.log(`[HADeviceStateNode ${this.id?.slice(0,8)}] 📤 Output: entity=${entityId}, state=${state}`);
    }
    
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
    // Force immediate update on graph load - clear tracking state
    this.lastSentHsv = null;
    this.lastSendTime = 0;
    this.lastTrigger = null;
    this.lastHsv = null;
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
    
    // Track ticks for warmup period
    if (this.tickCount === undefined) {
      this.tickCount = 0;
      this.warmupComplete = false;
    }
    this.tickCount++;
    
    const hasHsv = hsv !== undefined && hsv !== null;
    const entityIds = getEntityIds(this.properties);
    const nodeLabel = this.properties.customTitle || this.label || this.id;
    
    // Only log HA-INPUTS every 5 minutes (3000 ticks at 10Hz) for debugging
    if (this.tickCount % 3000 === 0) {
      engineLogger.log('HA-INPUTS', `${nodeLabel} status`, { 
        trigger, 
        hasHsv,
        entityCount: entityIds.length,
        firstEntity: entityIds[0]
      });
    }
    
    if (entityIds.length === 0) {
      return { is_on: false };
    }
    
    // Log every tick only in verbose mode (level 2) - too noisy otherwise
    if (engineLogger.getLogLevel() >= 2) {
      engineLogger.log('HA-DEVICE-TICK', `tick=${this.tickCount}`, { 
        trigger, 
        lastTrigger: this.lastTrigger, 
        entities: entityIds,
        mode: this.properties.triggerMode || 'Follow'
      });
    }
    
    // Warmup period: Skip first 10 ticks (1 second at 100ms/tick)
    // This ensures all Sender→Receiver→Consumer chains have stabilized
    // During warmup, just record state without sending commands
    const WARMUP_TICKS = 10;
    if (this.tickCount <= WARMUP_TICKS) {
      engineLogger.logWarmup(this.id || 'HAGenericDevice', this.tickCount, trigger, this.lastTrigger);
      // Record current trigger value without taking action
      if (trigger !== undefined) {
        this.lastTrigger = trigger;
      }
      return { is_on: !!trigger || !!this.lastTrigger };
    }
    
    // Mark warmup complete on first post-warmup tick
    if (!this.warmupComplete) {
      this.warmupComplete = true;
      // On first real tick, DON'T treat current state as a "change"
      // Just record it and wait for actual changes
      if (trigger !== undefined) {
        this.lastTrigger = trigger;
        engineLogger.log('HA-DEVICE', 'Warmup complete, initial state recorded', { 
          trigger, 
          entities: entityIds,
          mode: this.properties.triggerMode || 'Follow'
        });
      }
      return { is_on: !!trigger };
    }

    // Handle case where trigger is undefined (no connection) but HSV is provided
    // In this case, we should apply HSV to devices that are currently ON
    // This matches the frontend behavior where HSV-only nodes still control colors
    if (trigger === undefined) {
      // If we have HSV input, apply it to devices that are currently ON
      if (hsv) {
        // Track when we last sent a command (same logic as trigger-connected nodes)
        const now = Date.now();
        if (!this.lastSendTime) this.lastSendTime = 0;
        if (!this.lastSentHsv) this.lastSentHsv = null;
        
        const hueDiff = this.lastSentHsv ? Math.abs((hsv.hue || 0) - (this.lastSentHsv.hue || 0)) : 1;
        const satDiff = this.lastSentHsv ? Math.abs((hsv.saturation || 0) - (this.lastSentHsv.saturation || 0)) : 1;
        const briDiff = this.lastSentHsv ? Math.abs((hsv.brightness || 0) - (this.lastSentHsv.brightness || 0)) : 255;
        
        const MIN_UPDATE_INTERVAL = 5000;
        const MIN_FAST_INTERVAL = 3000;
        const timeSinceLastSend = now - this.lastSendTime;
        
        const SIGNIFICANT_HUE_CHANGE = 0.05;
        const SIGNIFICANT_SAT_CHANGE = 0.10;
        const SIGNIFICANT_BRI_CHANGE = 20;
        // REMOVED 2025-12-20: Force update every 60s was causing unnecessary API spam.
        // The v3 engine is reliable and timeline colors change frequently anyway.
        // If lights get out of sync after power outage, the next natural color change fixes it.
        // TO RESTORE: Uncomment these lines and add timeForForceUpdate to shouldSend
        // const FORCE_UPDATE_INTERVAL = 60000;
        // const timeForForceUpdate = timeSinceLastSend > FORCE_UPDATE_INTERVAL;
        
        const hasSignificantChange = hueDiff > SIGNIFICANT_HUE_CHANGE || 
                                     satDiff > SIGNIFICANT_SAT_CHANGE || 
                                     briDiff > SIGNIFICANT_BRI_CHANGE;
        
        const shouldSend = !this.lastSentHsv || hasSignificantChange;
        const minInterval = hasSignificantChange ? MIN_FAST_INTERVAL : MIN_UPDATE_INTERVAL;
        
        if (shouldSend && timeSinceLastSend >= minInterval) {
          const reason = !this.lastSentHsv ? 'hsv_only_first' : 'hsv_only_significant';
          engineLogger.log('HA-HSV-ONLY', `No trigger connected, applying HSV to ON devices`, { 
            entities: entityIds,
            reason: reason,
            timeSinceLastSend: Math.round(timeSinceLastSend / 1000) + 's'
          });
          
          this.lastSentHsv = { ...hsv };
          this.lastSendTime = now;
          
          for (const entityId of entityIds) {
            // Only apply HSV if device is currently ON (uses deviceStates cache or assumes ON)
            // Note: We send turn_on with color - HA will apply color if device is on, ignore if off
            await this.controlDevice(entityId, true, hsv);
          }
        }
      } else if (engineLogger.getLogLevel() >= 2) {
        // Only log this in verbose mode - it fires every tick for disconnected nodes with no HSV
        engineLogger.log('HA-DEVICE', 'trigger undefined, no HSV, skipping', { lastTrigger: this.lastTrigger });
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
    // For slow timelines, we need to:
    // 1. Compare against LAST SENT value, not last tick
    // 2. Periodically send even if changes seem small (accumulation)
    // 3. Use time-based minimum update interval
    if (this.lastTrigger && hsv && this.properties.triggerMode !== 'Toggle') {
      // Track when we last sent a command
      const now = Date.now();
      if (!this.lastSendTime) this.lastSendTime = 0;
      if (!this.lastSentHsv) this.lastSentHsv = null;
      
      // Calculate differences from LAST SENT value (not last tick)
      const hueDiff = this.lastSentHsv ? Math.abs((hsv.hue || 0) - (this.lastSentHsv.hue || 0)) : 1;
      const satDiff = this.lastSentHsv ? Math.abs((hsv.saturation || 0) - (this.lastSentHsv.saturation || 0)) : 1;
      const briDiff = this.lastSentHsv ? Math.abs((hsv.brightness || 0) - (this.lastSentHsv.brightness || 0)) : 255;
      
      // Minimum interval between updates to avoid flooding HA / Zigbee
      // Zigbee lights can't handle more than ~1 command per 3-5 seconds without flashing/popping
      const MIN_UPDATE_INTERVAL = 5000;       // 5s minimum for normal updates
      const MIN_FAST_INTERVAL = 3000;         // 3s minimum even for "significant" changes
      const timeSinceLastSend = now - this.lastSendTime;
      
      // Thresholds: noticeable change = faster update, small change = periodic update
      // Increased thresholds to reduce command flood during color fading animations
      const SIGNIFICANT_HUE_CHANGE = 0.05;    // ~18° - larger threshold for animated color changes
      const SIGNIFICANT_SAT_CHANGE = 0.10;    // 10% saturation 
      const SIGNIFICANT_BRI_CHANGE = 20;      // ~8% brightness
      const SMALL_CHANGE_INTERVAL = 30000;    // Send every 30s if small changes accumulating
      // REMOVED 2025-12-20: Force update every 60s was causing unnecessary API spam (60+ calls/hr per device).
      // This was a workaround for v2.0 LiteGraph reliability issues - not needed in v3 Rete engine.
      // Timeline colors change frequently, so any power-outage drift self-corrects quickly.
      // TO RESTORE: Uncomment these lines and add timeForForceUpdate to shouldSend
      // const FORCE_UPDATE_INTERVAL = 60000;
      // const timeForForceUpdate = timeSinceLastSend > FORCE_UPDATE_INTERVAL;
      
      const hasSignificantChange = hueDiff > SIGNIFICANT_HUE_CHANGE || 
                                   satDiff > SIGNIFICANT_SAT_CHANGE || 
                                   briDiff > SIGNIFICANT_BRI_CHANGE;
      
      const hasSmallChange = hueDiff > 0.001 || satDiff > 0.001 || briDiff > 0.5;
      const timeForSmallUpdate = hasSmallChange && timeSinceLastSend > SMALL_CHANGE_INTERVAL;
      
      // First send ever, or significant change, or periodic small change update
      const shouldSend = !this.lastSentHsv || hasSignificantChange || timeForSmallUpdate;
      
      // Significant changes can update faster but still need 3s minimum to avoid Zigbee flooding
      // Small/periodic changes use MIN_UPDATE_INTERVAL (5s) for smooth operation
      const minInterval = hasSignificantChange ? MIN_FAST_INTERVAL : MIN_UPDATE_INTERVAL;
      
      if (shouldSend && timeSinceLastSend >= minInterval) {
        const reason = !this.lastSentHsv ? 'first_send' 
                     : hasSignificantChange ? 'significant' 
                     : 'periodic_small';
        engineLogger.log('HA-HSV-CHANGE', `HSV changed, sending command`, { 
          entities: entityIds,
          reason: reason,
          minInterval: minInterval + 'ms',
          hueDiff: hueDiff.toFixed(4),
          satDiff: satDiff.toFixed(4),
          briDiff: briDiff.toFixed(1),
          newHue: hsv.hue?.toFixed(4),
          lastHue: this.lastSentHsv?.hue?.toFixed(4),
          timeSinceLastSend: Math.round(timeSinceLastSend / 1000) + 's'
        });
        const oldHsv = this.lastSentHsv ? { ...this.lastSentHsv } : null;
        this.lastSentHsv = { ...hsv };
        this.lastSendTime = now;
        for (const entityId of entityIds) {
          // Track for periodic summary log
          hsvUpdateTracker.track(entityId, oldHsv, hsv);
          await this.controlDevice(entityId, true, hsv);
        }
      }
      // Removed HA-HSV-WAITING log - summary tracker provides periodic updates
    } else if (!this.lastTrigger && this.tickCount % 600 === 0 && hsv) {
      // Log every 60 seconds when we have HSV but trigger is off
      engineLogger.log('HA-HSV-SKIP', `HSV available but trigger=${this.lastTrigger}`, { 
        entities: entityIds,
        triggerMode: this.properties.triggerMode
      });
    }

    return { is_on: !!this.lastTrigger };
  }
}

/**
 * HADeviceAutomationNode - Extracts fields from device state
 * 
 * Takes device state as input and outputs selected fields (brightness, hue, temperature, etc).
 * Used for reading device values for logic/comparison in automation flows.
 */
class HADeviceAutomationNode {
  static type = 'HADeviceAutomationNode';
  static label = 'HA Device Automation';
  
  constructor(id, properties = {}) {
    this.id = id;
    this.type = HADeviceAutomationNode.type;
    this.properties = {
      selectedFields: properties.selectedFields || [],
      lastEntityType: 'unknown',
      lastOutputValues: {},
      ...properties
    };
    this.inputs = ['device_state'];
    // Outputs are dynamic based on selectedFields
    this._updateOutputs();
  }
  
  /**
   * Update the outputs array based on selectedFields
   */
  _updateOutputs() {
    this.outputs = (this.properties.selectedFields || [])
      .filter(f => f && f !== 'Select Field')
      .map(f => `out_${f}`);
  }
  
  /**
   * Restore properties from saved graph and recompute outputs
   */
  restore(data) {
    console.log(`[HADeviceAutomationNode ${this.id?.slice(0,8)}] restore() called with:`, JSON.stringify(data?.properties || {}).slice(0,200));
    if (data.properties) {
      Object.assign(this.properties, data.properties);
      // CRITICAL: Recompute outputs after restore since constructor runs before this
      this._updateOutputs();
      console.log(`[HADeviceAutomationNode ${this.id?.slice(0,8)}] Restored with fields: [${(this.properties.selectedFields || []).join(', ')}], outputs: [${this.outputs?.join(', ')}]`);
    }
  }

  /**
   * Get field value from device state
   */
  getFieldValue(device, field) {
    if (!device) return null;
    
    const entityType = device.entity_type?.toLowerCase() || 
                       device.entityType?.toLowerCase() ||
                       device.entity_id?.split('.')[0] || 
                       'unknown';

    switch (field) {
      case 'state':
        if (entityType === 'media_player') {
          return device.status || device.state || null;
        } else {
          const status = (device.status || device.state)?.toLowerCase?.();
          if (status === 'on') return true;
          if (status === 'off') return false;
          if (status === 'open') return true;
          if (status === 'closed') return false;
          return status || null;
        }
        
      case 'hue':
      case 'saturation':
      case 'brightness':
      case 'position':
      case 'latitude':
      case 'longitude':
      case 'percentage':
        return typeof device[field] === 'number' ? device[field] : null;
        
      case 'volume_level':
        return typeof device.volume === 'number' ? device.volume : 
               device.attributes?.volume_level || null;
               
      case 'value':
        // For sensors, value is the main reading
        if (device.value !== undefined) {
          const numVal = parseFloat(device.value);
          return !isNaN(numVal) ? numVal : device.value;
        }
        if (device.state !== undefined) {
          const numVal = parseFloat(device.state);
          return !isNaN(numVal) ? numVal : device.state;
        }
        return device.attributes?.value || null;
        
      case 'temperature':
      case 'pressure':
      case 'humidity':
      case 'wind_speed':
      case 'battery_level':
        if (typeof device[field] === 'number') return device[field];
        if (typeof device.attributes?.[field] === 'number') return device.attributes[field];
        // For sensors, check if this IS the sensor type
        if (entityType === 'sensor') {
          const entityId = device.entity_id || '';
          if (entityId.toLowerCase().includes(field.toLowerCase())) {
            if (device.value !== undefined) {
              const numVal = parseFloat(device.value);
              return !isNaN(numVal) ? numVal : null;
            }
            if (device.state !== undefined) {
              const numVal = parseFloat(device.state);
              return !isNaN(numVal) ? numVal : null;
            }
          }
        }
        return null;
        
      case 'media_title':
      case 'media_content_type':
      case 'media_artist':
      case 'repeat':
      case 'battery':
      case 'unit':
      case 'zone':
      case 'condition':
        return device[field] !== undefined ? device[field] : 
               device.attributes?.[field] || null;
               
      case 'shuffle':
        return typeof device[field] === 'boolean' ? device[field] : 
               typeof device.attributes?.shuffle === 'boolean' ? device.attributes.shuffle : null;
               
      case 'supported_features':
        return typeof device[field] === 'number' ? device[field] : 
               typeof device.attributes?.supported_features === 'number' ? 
               device.attributes.supported_features : null;
               
      case 'on':
      case 'open':
        const status = (device.status || device.state)?.toLowerCase?.();
        return status === 'on' || status === 'open';
        
      default:
        return device[field] !== undefined ? device[field] : 
               device.attributes?.[field] || null;
    }
  }

  data(inputs) {
    // Log on first tick to confirm node is in the engine
    if (!this._startupLogged) {
      this._startupLogged = true;
      console.log(`[HADeviceAutomationNode ${this.id?.slice(0,8) || 'new'}] 🚀 First tick - fields: [${(this.properties.selectedFields || []).join(', ')}], outputs: [${(this.outputs || []).join(', ')}]`);
      console.log(`[HADeviceAutomationNode ${this.id?.slice(0,8) || 'new'}] 🚀 Has input: ${!!inputs.device_state?.[0]}, type: ${typeof inputs.device_state?.[0]}`);
    }
    
    const inputData = inputs.device_state?.[0];
    const result = {};
    
    if (!inputData) {
      // Log warning when input goes null (but only once per null-streak)
      if (!this._nullInputWarned) {
        console.warn(`[HADeviceAutomationNode ${this.id?.slice(0,8) || 'unknown'}] No device_state input - returning nulls for all fields`);
        this._nullInputWarned = true;
      }
      // Return null for all outputs when no input
      this.outputs.forEach(outputKey => {
        result[outputKey] = null;
      });
      return result;
    }
    
    // Clear warning flag when we get valid input
    this._nullInputWarned = false;
    
    // Handle both array and object formats
    let devices = [];
    if (Array.isArray(inputData)) {
      devices = inputData;
    } else if (inputData.lights && Array.isArray(inputData.lights)) {
      devices = inputData.lights;
    } else if (typeof inputData === 'object') {
      devices = [inputData];
    }
    
    if (devices.length === 0) {
      this.outputs.forEach(outputKey => {
        result[outputKey] = null;
      });
      return result;
    }
    
    const device = devices[0];
    const entityType = device.entity_type?.toLowerCase() || 
                       device.entityType?.toLowerCase() || 
                       device.entity_id?.split('.')[0] || 
                       'unknown';
    this.properties.lastEntityType = entityType;
    
    // Extract values for each selected field
    const activeFields = this.properties.selectedFields.filter(f => f && f !== 'Select Field');
    
    activeFields.forEach(field => {
      const value = this.getFieldValue(device, field);
      const outputKey = `out_${field}`;
      result[outputKey] = value;
      this.properties.lastOutputValues[field] = value;
    });
    
    // Log output periodically to trace data flow (every 30 seconds)
    if (!this._lastOutputLog || Date.now() - this._lastOutputLog > 30000) {
      this._lastOutputLog = Date.now();
      console.log(`[HADeviceAutomationNode ${this.id?.slice(0,8)}] 📤 Output: ${JSON.stringify(result)}`);
    }
    
    // Ensure all dynamic outputs have a value
    this.outputs.forEach(outputKey => {
      if (result[outputKey] === undefined) {
        result[outputKey] = null;
      }
    });
    
    return result;
  }
}

/**
 * HADeviceStateDisplayNode - Pass-through display node (UI-only visualization)
 * Just passes device_state input to output without modification
 */
class HADeviceStateDisplayNode {
  constructor() {
    this.id = null;
    this.label = 'HA Device State Display';
    this.properties = {};
    this.inputs = ['device_state'];
    this.outputs = ['device_state'];
  }

  restore(data) {
    if (data.properties) {
      Object.assign(this.properties, data.properties);
    }
  }

  data(inputs) {
    // Pure passthrough - just forward the input to output
    const inputData = inputs.device_state?.[0];
    return { device_state: inputData || null };
  }
}

// Register nodes
registry.register('HADeviceStateNode', HADeviceStateNode);
registry.register('HADeviceStateOutputNode', HADeviceStateNode);  // Alias
registry.register('HADeviceStateDisplayNode', HADeviceStateDisplayNode);  // Passthrough display
registry.register('HAServiceCallNode', HAServiceCallNode);
registry.register('HALightControlNode', HALightControlNode);
registry.register('HAGenericDeviceNode', HAGenericDeviceNode);
registry.register('HADeviceAutomationNode', HADeviceAutomationNode);

module.exports = { 
  HADeviceStateNode, 
  HAServiceCallNode, 
  HALightControlNode,
  HAGenericDeviceNode,
  HADeviceAutomationNode,
  HADeviceStateDisplayNode,
  getHAConfig
};
