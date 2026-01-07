/**
 * HADeviceNodes.js - Backend implementations of Home Assistant device nodes
 * 
 * These use Node.js fetch to communicate with Home Assistant API.
 * No browser dependencies - runs purely on the server.
 */

const registry = require('../BackendNodeRegistry');
const engineLogger = require('../engineLogger');
const deviceAudit = require('../deviceAudit');
const commandTracker = require('../commandTracker');

// Lazy-load homeAssistantManager for health tracking
let _haManager = null;
function getHAManager() {
  if (!_haManager) {
    _haManager = require('../../devices/managers/homeAssistantManager');
  }
  return _haManager;
}

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
// Utility: coerceBoolean - Convert various input types to proper boolean
// Matches frontend behavior to ensure consistent edge detection
// ============================================================================
function coerceBoolean(value) {
  if (value === undefined) return undefined;  // Preserve undefined (no connection)
  if (value === null) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const s = value.trim().toLowerCase();
    if (s === '' || s === '0' || s === 'false' || s === 'off' || s === 'no' || s === 'n') return false;
    if (s === '1' || s === 'true' || s === 'on' || s === 'yes' || s === 'y') return true;
  }
  return !!value;
}

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
        // Success logs removed - too noisy. Only log errors.
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
      // Log what we restored for debugging (only in verbose mode)
      if (VERBOSE) {
        const entityId = this.properties.entityId || this.properties.selectedDeviceId;
        if (entityId) {
          console.log(`[HADeviceStateNode ${this.id?.slice(0,8) || 'new'}] Restored with entityId: ${entityId}`);
        } else {
          console.warn(`[HADeviceStateNode ${this.id?.slice(0,8) || 'new'}] Restored but NO entityId found in properties:`, Object.keys(data.properties));
        }
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
    
    // Log on first tick to confirm node is running with correct config (only in verbose mode)
    if (!this._startupLogged) {
      this._startupLogged = true;
      if (VERBOSE) {
        const entityId = this.properties.entityId || this.properties.selectedDeviceId;
        console.log(`[HADeviceStateNode ${this.id?.slice(0,8) || 'new'}] 🚀 First tick - entityId: ${entityId || 'NOT SET'}`);
      }
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
    
    // Removed per-tick logging - too noisy for addon logs
    
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
 * HADeviceFieldNode - Extracts a specific field from a Home Assistant entity
 * 
 * 🦴 Caveman Version:
 * This is like HADeviceStateNode but simpler - you pick ONE field (like temperature)
 * and that's all that comes out. Used by Timeline Color nodes to drive color
 * based on temperature, humidity, or any sensor value.
 */
class HADeviceFieldNode {
  constructor() {
    this.id = null;
    this.label = 'HA Device Field';
    this.properties = {
      deviceId: '',          // e.g., 'ha_sensor.temperature'
      deviceName: '',        // Display name
      field: 'state',        // Which field to extract
      filterType: 'Sensor',  // For dropdown filtering
      lastValue: null
    };
    this.lastPollTime = 0;
    this.cachedValue = null;
  }

  restore(data) {
    if (data.properties) {
      Object.assign(this.properties, data.properties);
      // Log restore in verbose mode
      if (VERBOSE) {
        console.log(`[HADeviceFieldNode ${this.id?.slice(0,8) || 'new'}] Restored: ${this.properties.deviceId} field:${this.properties.field}`);
      }
    }
  }

  async data(inputs) {
    const now = Date.now();
    const pollInterval = 5000; // Poll every 5 seconds
    
    // Skip if no device configured
    if (!this.properties.deviceId) {
      return { value: null };
    }

    // Poll at interval
    if (now - this.lastPollTime >= pollInterval) {
      this.lastPollTime = now;
      
      // Strip ha_ prefix for API call
      let entityId = this.properties.deviceId;
      if (entityId.startsWith('ha_')) {
        entityId = entityId.replace('ha_', '');
      }

      // Get state from bulk cache
      const state = await bulkStateCache.getState(entityId);
      
      if (state) {
        // Extract the requested field
        const field = this.properties.field || 'state';
        let value = null;
        
        switch (field) {
          case 'state':
            value = state.state;
            // Try to convert to number if it looks like a number
            if (value && !isNaN(parseFloat(value))) {
              value = parseFloat(value);
            }
            break;
          case 'is_on':
            value = state.state === 'on' || state.state === 'playing' || state.state === 'home';
            break;
          case 'brightness':
            // Normalize to 0-100
            value = state.attributes?.brightness 
              ? Math.round((state.attributes.brightness / 255) * 100) 
              : 0;
            break;
          case 'color_temp':
            value = state.attributes?.color_temp ?? null;
            break;
          case 'temperature':
          case 'current_temperature':
            value = state.attributes?.current_temperature ?? state.attributes?.temperature ?? null;
            break;
          case 'humidity':
            value = state.attributes?.humidity ?? null;
            break;
          case 'unit':
            value = state.attributes?.unit_of_measurement ?? '';
            break;
          case 'volume':
            value = state.attributes?.volume_level 
              ? Math.round(state.attributes.volume_level * 100) 
              : 0;
            break;
          case 'is_playing':
            value = state.state === 'playing';
            break;
          case 'position':
            value = state.attributes?.current_position ?? 0;
            break;
          case 'is_open':
            value = state.state === 'open';
            break;
          case 'percentage':
            value = state.attributes?.percentage ?? 0;
            break;
          case 'zone':
            value = state.state;
            break;
          case 'is_home':
            value = state.state === 'home';
            break;
          case 'is_locked':
            value = state.state === 'locked';
            break;
          case 'is_unlocked':
            value = state.state === 'unlocked';
            break;
          case 'battery_level':
            value = state.attributes?.battery_level ?? null;
            break;
          case 'is_cleaning':
            value = state.state === 'cleaning';
            break;
          case 'is_recording':
            value = state.state === 'recording';
            break;
          default:
            // Try to get from attributes
            value = state.attributes?.[field] ?? state.state;
        }
        
        this.cachedValue = value;
        this.properties.lastValue = value;
      }
    }

    return { value: this.cachedValue };
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

  /**
   * Reconcile node state with actual HA device states before engine starts.
   * This prevents firing commands at startup for devices already in correct state.
   * Called by BackendEngine.reconcileDeviceStates() before first tick.
   * 
   * @param {Map} stateCache - bulkStateCache.states Map of entityId → state
   */
  reconcile(stateCache) {
    const entityIds = (this.properties.selectedDeviceIds || [])
      .filter(id => id)
      .map(id => id.replace('ha_', ''));
    
    if (entityIds.length === 0) {
      return { skipped: true, reason: 'no devices' };
    }

    let onCount = 0;
    let offCount = 0;
    const results = [];

    for (const entityId of entityIds) {
      const state = stateCache.get(entityId);
      if (!state) {
        results.push({ entityId, status: 'not_found' });
        continue;
      }

      // Check if device is ON
      const isOn = state.state === 'on' || state.state === 'open' || state.state === 'playing';
      
      // Pre-populate deviceStates with actual state
      this.deviceStates[`ha_${entityId}`] = isOn;
      
      if (isOn) {
        onCount++;
      } else {
        offCount++;
      }
      
      results.push({ entityId, state: state.state, isOn });
    }

    // DON'T pre-set lastTrigger from device state - let actual input establish baseline
    // This fixes bug where devices wouldn't turn off because lastTrigger was set to match device state
    // Instead, we just populate deviceStates and let the first tick establish lastTrigger from input
    const anyOn = onCount > 0;
    // this.lastTrigger stays undefined - will be set from actual input on first tick
    this.reconciled = true;  // Flag that we've seen device states
    
    // Mark warmup as complete - we've already reconciled
    this.warmupComplete = true;
    this.tickCount = 11; // Past warmup period
    
    // CRITICAL: Set hadConnection = true so first tick doesn't treat all connections as "new"
    // Without this, first tick sees hadConnection=undefined → newConnection=true → skips OFF commands
    this.hadConnection = true;

    engineLogger.log('HA-RECONCILE', `${this.label || this.id}: ${onCount} ON, ${offCount} OFF (lastTrigger left undefined for input to set)`, {
      nodeId: this.id,
      devices: results.slice(0, 5), // Log first 5 devices
      totalDevices: entityIds.length
    });

    return { 
      success: true, 
      onCount, 
      offCount, 
      lastTrigger: anyOn,
      results 
    };
  }

  async controlDevice(entityId, turnOn, hsv = null) {
    const config = getHAConfig();
    if (!config.token || !entityId) {
      console.error('[HAGenericDeviceNode] No token or entityId');
      return { success: false };
    }

    // ALWAYS update internal state tracking - this keeps engine in sync with frontend
    // Even if we skip the actual API call, we need to track what SHOULD be happening
    this.deviceStates = this.deviceStates || {};
    this.deviceStates[entityId] = turnOn;
    this.deviceStates[`ha_${entityId}`] = turnOn;  // Also track with prefix for compatibility

    // Check if frontend is active - if so, skip the API call to avoid conflict
    // But we've already updated deviceStates above, so engine stays in sync
    const engine = getEngine();
    if (engine && engine.shouldSkipDeviceCommands()) {
      engineLogger.log('HA-DEVICE-SKIP', `Frontend active, skipping API call for ${entityId} (state tracked: ${turnOn ? 'ON' : 'OFF'})`, { turnOn });
      return { success: true, skipped: true };
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
      
      // Record engine intent for audit comparison
      deviceAudit.recordEngineIntent(entityId, {
        on: turnOn,
        brightness: payload.brightness,
        hs_color: payload.hs_color,
        service
      });
      
      // Track command origin for debugging
      commandTracker.logOutgoingCommand({
        entityId,
        action: service,
        payload,
        nodeId: this.id,
        nodeType: 'HAGenericDeviceNode',
        reason: this.lastTriggerReason || 'Input trigger',
        inputs: this.lastInputs
      });
      
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
    const triggerRaw = inputs.trigger?.[0];
    const hsv = inputs.hsv_info?.[0];
    
    // Coerce trigger to proper boolean (matches frontend behavior)
    // This ensures "false" (string), 0, null are properly interpreted
    const trigger = coerceBoolean(triggerRaw);
    const hasConnection = triggerRaw !== undefined;
    
    // Store inputs for command tracking (helps answer "why did this trigger?")
    this.lastInputs = { trigger, triggerRaw, hsv: hsv ? 'present' : 'none' };
    
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
    // During warmup, QUEUE commands instead of dropping them
    const WARMUP_TICKS = 10;
    if (this.tickCount <= WARMUP_TICKS) {
      engineLogger.logWarmup(this.id || 'HAGenericDevice', this.tickCount, trigger, this.lastTrigger);
      
      // Queue any state changes during warmup (instead of ignoring them)
      if (trigger !== undefined && trigger !== this.lastTrigger) {
        this.pendingWarmupCommand = { trigger, hsv, hasConnection };
        engineLogger.log('HA-WARMUP-QUEUE', `Queued command during warmup tick ${this.tickCount}`, { 
          trigger, 
          lastTrigger: this.lastTrigger 
        });
      }
      
      // Record current trigger value for tracking
      if (trigger !== undefined) {
        this.lastTrigger = trigger;
      }
      this.hadConnection = hasConnection;
      return { is_on: !!trigger || !!this.lastTrigger };
    }
    
    // Mark warmup complete on first post-warmup tick
    if (!this.warmupComplete) {
      this.warmupComplete = true;
      
      // Process any command that was queued during warmup
      if (this.pendingWarmupCommand) {
        const cmd = this.pendingWarmupCommand;
        this.pendingWarmupCommand = null;
        engineLogger.log('HA-WARMUP-PROCESS', 'Processing queued warmup command', { 
          trigger: cmd.trigger,
          entities: entityIds 
        });
        
        // Execute the queued command
        const mode = this.properties.triggerMode || 'Follow';
        for (const entityId of entityIds) {
          if (mode === 'Follow') {
            await this.controlDevice(entityId, !!cmd.trigger, cmd.trigger ? cmd.hsv : null);
            this.deviceStates[entityId] = !!cmd.trigger;
          }
        }
      }
      
      // Record initial state
      if (trigger !== undefined) {
        this.lastTrigger = trigger;
        engineLogger.log('HA-DEVICE', 'Warmup complete, initial state recorded', { 
          trigger, 
          entities: entityIds,
          mode: this.properties.triggerMode || 'Follow'
        });
      }
      this.hadConnection = hasConnection;
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
          engineLogger.log('HA-HSV-ONLY', `No trigger connected, applying HSV to ON devices only`, { 
            entities: entityIds,
            reason: reason,
            timeSinceLastSend: Math.round(timeSinceLastSend / 1000) + 's'
          });
          
          this.lastSentHsv = { ...hsv };
          this.lastSendTime = now;
          
          for (const entityId of entityIds) {
            // Only apply HSV to devices that are ALREADY ON
            // Check device state from cache - don't turn on devices just to apply color!
            const isCurrentlyOn = this.deviceStates[`ha_${entityId}`] || this.deviceStates[entityId];
            if (isCurrentlyOn) {
              // Send turn_on with color - HA interprets this as "apply color to this already-on light"
              await this.controlDevice(entityId, true, hsv);
            }
            // If device is OFF, skip it - don't turn it on just to apply a color
          }
        }
      } else if (engineLogger.getLogLevel() >= 2) {
        // Only log this in verbose mode - it fires every tick for disconnected nodes with no HSV
        engineLogger.log('HA-DEVICE', 'trigger undefined, no HSV, skipping', { lastTrigger: this.lastTrigger });
      }
      return { is_on: !!this.lastTrigger };
    }

    // Handle trigger changes based on mode
    // Use explicit edge detection (matches frontend behavior)
    const triggerBool = !!trigger;
    const lastBool = !!this.lastTrigger;
    const risingEdge = triggerBool && !lastBool;
    const fallingEdge = !triggerBool && lastBool;
    const newConnection = hasConnection && !this.hadConnection;
    
    // Check if device is ON but trigger says OFF (mismatch after reconcile)
    // This handles the case where device was ON when graph loaded, but trigger input is FALSE
    // In this case, we need to send OFF even though there's no "falling edge" (lastTrigger was undefined)
    let deviceMismatch = false;
    if (!triggerBool && this.lastTrigger === undefined && this.reconciled) {
      // First tick after reconcile with trigger=false - check if any device is ON
      for (const entityId of entityIds) {
        const isDeviceOn = this.deviceStates[`ha_${entityId}`] || this.deviceStates[entityId];
        if (isDeviceOn) {
          deviceMismatch = true;
          engineLogger.log('HA-MISMATCH', `Device ${entityId} is ON but trigger is FALSE - will send OFF`, {});
          break;
        }
      }
    }
    
    // Track connection state for next tick
    this.hadConnection = hasConnection;
    
    // IMPORTANT: On new connection, only act if trigger is TRUE
    // This prevents the "turn everything OFF on startup" bug where:
    // 1. Graph loads, all connections are detected as "new"
    // 2. Upstream nodes haven't computed yet, so trigger = false
    // 3. Follow mode sends turn_off to all devices
    // Fix: Only act on newConnection if it's a TRUE value (turn ON, not OFF)
    const shouldActOnNewConnection = newConnection && triggerBool;
    
    // If new connection with false trigger, just record state without sending OFF command
    if (newConnection && !triggerBool) {
      engineLogger.log('HA-NEW-CONN-SKIP', `New connection with trigger=false, skipping OFF command (will act on next rising edge)`, {
        entities: entityIds,
        mode: this.properties.triggerMode || 'Follow'
      });
      this.lastTrigger = trigger;  // Record state for edge detection
      return { is_on: false };
    }
    
    if (risingEdge || fallingEdge || shouldActOnNewConnection || deviceMismatch) {
      // Log the edge detection for debugging
      const nodeLabel = this.properties.customTitle || this.label || this.id;
      console.log(`[HAGenericDevice] ${nodeLabel}: Edge detected! trigger=${trigger}, lastTrigger=${this.lastTrigger}, risingEdge=${risingEdge}, fallingEdge=${fallingEdge}`);
      
      engineLogger.logTriggerChange(this.id || 'HAGenericDevice', this.lastTrigger, trigger, 
        risingEdge ? 'RISING_EDGE' : fallingEdge ? 'FALLING_EDGE' : deviceMismatch ? 'DEVICE_MISMATCH' : 'NEW_CONNECTION');
      this.lastTrigger = trigger;
      
      const mode = this.properties.triggerMode || 'Follow';
      
      for (const entityId of entityIds) {
        let shouldTurnOn = false;
        let reason = '';
        
        switch (mode) {
          case 'Follow':
            // Follow trigger state
            shouldTurnOn = !!trigger;
            reason = `Follow mode: trigger=${trigger}`;
            this.lastTriggerReason = reason;
            break;
          case 'Toggle':
            // Toggle on rising edge only (already detected above)
            if (risingEdge) {
              this.deviceStates[entityId] = !this.deviceStates[entityId];
              shouldTurnOn = this.deviceStates[entityId];
              reason = `Toggle mode: rising edge → ${shouldTurnOn ? 'ON' : 'OFF'}`;
              this.lastTriggerReason = reason;
              engineLogger.log('HA-DECISION', reason, { entityId });
              await this.controlDevice(entityId, shouldTurnOn, hsv);
            } else {
              reason = `Toggle mode: no rising edge (fallingEdge=${fallingEdge}, newConnection=${newConnection})`;
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
      // No trigger change - only log in verbose mode to avoid spam
      // (This was logging thousands of entries per hour with no value)
      if (VERBOSE && this.tickCount % 100 === 0) {
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
    }
    // Removed noisy HA-HSV-SKIP log - not useful for normal operation

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
    if (VERBOSE) console.log(`[HADeviceAutomationNode ${this.id?.slice(0,8)}] restore() called with:`, JSON.stringify(data?.properties || {}).slice(0,200));
    if (data.properties) {
      Object.assign(this.properties, data.properties);
      // CRITICAL: Recompute outputs after restore since constructor runs before this
      this._updateOutputs();
      if (VERBOSE) console.log(`[HADeviceAutomationNode ${this.id?.slice(0,8)}] Restored with fields: [${(this.properties.selectedFields || []).join(', ')}], outputs: [${this.outputs?.join(', ')}]`);
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
    // Log on first tick to confirm node is in the engine (only in verbose mode)
    if (!this._startupLogged) {
      this._startupLogged = true;
      if (VERBOSE) {
        console.log(`[HADeviceAutomationNode ${this.id?.slice(0,8) || 'new'}] 🚀 First tick - fields: [${(this.properties.selectedFields || []).join(', ')}], outputs: [${(this.outputs || []).join(', ')}]`);
        console.log(`[HADeviceAutomationNode ${this.id?.slice(0,8) || 'new'}] 🚀 Has input: ${!!inputs.device_state?.[0]}, type: ${typeof inputs.device_state?.[0]}`);
      }
    }
    
    const inputData = inputs.device_state?.[0];
    const result = {};
    
    if (!inputData) {
      // No input is normal when node isn't connected - don't log (too spammy)
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
    
    // Removed per-tick logging - too noisy for addon logs
    
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

/**
 * HALockNode - Backend engine node for controlling locks
 * Sends lock/unlock commands when trigger input changes
 * Includes verify & retry logic for reliability
 */
class HALockNode {
  constructor() {
    this.id = null;
    this.label = 'HA Lock Control';
    this.properties = {
      deviceId: '',
      deviceName: '',
      currentState: 'unknown',
      lastTrigger: null,
      // Retry/Verify settings
      retryEnabled: true,
      retryDelay: 5000,      // 5 seconds
      maxRetries: 3,
      retryCount: 0,
      lastCommandAction: null
    };
    this.inputs = ['trigger'];
    this.outputs = ['state', 'is_locked'];
    this.lastCommandTime = 0;
    this.MIN_COMMAND_INTERVAL = 1000; // 1 second throttle
    this._retryTimer = null;
  }

  restore(data) {
    if (data.properties) {
      Object.assign(this.properties, data.properties);
      // Ensure retry settings have defaults if missing
      if (this.properties.retryEnabled === undefined) this.properties.retryEnabled = true;
      if (this.properties.retryDelay === undefined) this.properties.retryDelay = 5000;
      if (this.properties.maxRetries === undefined) this.properties.maxRetries = 3;
    }
    this.properties.retryCount = 0;
  }

  async sendLockCommand(action, isRetry = false) {
    if (!this.properties.deviceId) return;
    
    // Throttle commands (but allow retries)
    const now = Date.now();
    if (!isRetry && now - this.lastCommandTime < this.MIN_COMMAND_INTERVAL) return;
    this.lastCommandTime = now;

    // Track for retry logic
    if (!isRetry) {
      this.properties.retryCount = 0;
      this.properties.lastCommandAction = action;
    }

    const entityId = this.properties.deviceId.replace('ha_', '');
    const service = action === 'lock' ? 'lock' : 'unlock';
    const config = getHAConfig();

    console.log(`[HALockNode] Sending ${action} command to ${entityId} (attempt ${this.properties.retryCount + 1}/${this.properties.maxRetries})`);

    try {
      const response = await fetch(`${config.host}/api/services/lock/${service}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ entity_id: entityId })
      });

      if (response.ok) {
        this.properties.currentState = action === 'lock' ? 'locked' : 'unlocked';
        engineLogger.log('LOCK-CMD', entityId, { service, success: true, attempt: this.properties.retryCount + 1 });
        
        // Schedule verification if retry is enabled
        if (this.properties.retryEnabled) {
          this.scheduleVerification(action);
        }
      } else {
        engineLogger.log('LOCK-CMD', entityId, { service, success: false, status: response.status });
      }
    } catch (err) {
      engineLogger.log('LOCK-CMD', entityId, { service, success: false, error: err.message });
    }
  }

  scheduleVerification(expectedAction) {
    if (this._retryTimer) {
      clearTimeout(this._retryTimer);
    }

    this._retryTimer = setTimeout(async () => {
      this._retryTimer = null;
      await this.verifyAndRetry(expectedAction);
    }, this.properties.retryDelay);
  }

  async sendTelegramNotification(message) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
      console.log('[HALockNode] Telegram not configured, skipping notification');
      return;
    }

    try {
      const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'Markdown'
        })
      });

      if (response.ok) {
        console.log(`[HALockNode] Telegram notification sent: ${message}`);
      } else {
        const data = await response.json();
        console.error(`[HALockNode] Telegram failed: ${data.description}`);
      }
    } catch (err) {
      console.error(`[HALockNode] Telegram error: ${err.message}`);
    }
  }

  async verifyAndRetry(expectedAction) {
    if (!this.properties.deviceId) return;

    const entityId = this.properties.deviceId.replace('ha_', '');
    const config = getHAConfig();

    try {
      const response = await fetch(`${config.host}/api/states/${entityId}`, {
        headers: {
          'Authorization': `Bearer ${config.token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        const actualState = data.state || 'unknown';
        this.properties.currentState = actualState;

        const expectedState = expectedAction === 'lock' ? 'locked' : 'unlocked';
        const deviceName = this.properties.deviceName || 'Lock';
        const icon = expectedAction === 'lock' ? '🔒' : '🔓';
        const time = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

        if (actualState === expectedState) {
          console.log(`[HALockNode] ✅ Verified: Lock is ${actualState} as expected`);
          engineLogger.log('LOCK-VERIFY', entityId, { expected: expectedState, actual: actualState, success: true });
          this.properties.retryCount = 0;
          
          // Send Telegram notification on confirmed state change
          this.sendTelegramNotification(`${icon} *${deviceName}* ${actualState} at ${time}`);
        } else {
          console.log(`[HALockNode] ❌ Mismatch: Expected ${expectedState}, got ${actualState}`);
          engineLogger.log('LOCK-VERIFY', entityId, { expected: expectedState, actual: actualState, success: false });

          if (this.properties.retryCount < this.properties.maxRetries - 1) {
            this.properties.retryCount++;
            console.log(`[HALockNode] 🔄 Retrying ${expectedAction} (attempt ${this.properties.retryCount + 1}/${this.properties.maxRetries})`);
            await this.sendLockCommand(expectedAction, true);
          } else {
            console.error(`[HALockNode] ⚠️ Max retries (${this.properties.maxRetries}) exceeded. Lock stuck at ${actualState}`);
            engineLogger.log('LOCK-RETRY-FAILED', entityId, { expected: expectedState, actual: actualState, maxRetries: this.properties.maxRetries });
            this.properties.retryCount = 0;
            
            // Send warning notification that lock failed
            this.sendTelegramNotification(`⚠️ *${deviceName}* failed to ${expectedAction} after ${this.properties.maxRetries} attempts!`);
          }
        }
      }
    } catch (err) {
      console.error('[HALockNode] Error verifying state:', err.message);
    }
  }

  destroy() {
    if (this._retryTimer) {
      clearTimeout(this._retryTimer);
      this._retryTimer = null;
    }
  }

  async data(inputs) {
    const triggerInput = inputs.trigger?.[0];

    // Only act on defined trigger values (true/false), ignore undefined
    // This supports pulse mode where output goes: undefined → value → undefined
    if (triggerInput !== undefined && triggerInput !== this.properties.lastTrigger) {
      this.properties.lastTrigger = triggerInput;
      
      if (this.properties.deviceId) {
        // true = unlock, false = lock
        await this.sendLockCommand(triggerInput ? 'unlock' : 'lock');
      }
    }
    
    // Reset lastTrigger when input becomes undefined (ready for next pulse)
    if (triggerInput === undefined && this.properties.lastTrigger !== undefined) {
      this.properties.lastTrigger = undefined;
    }

    const isLocked = this.properties.currentState === 'locked';

    return {
      state: this.properties.currentState,
      is_locked: isLocked
    };
  }
}

// ============================================================================
// HueEffectNode - Backend implementation for triggering Hue light effects
// Effects like candle, fire, prism, etc. are sent via HA service calls
// ============================================================================
class HueEffectNode {
  constructor() {
    this.type = 'HueEffectNode';
    this.label = 'Hue Effect';
    
    this.properties = {
      entityIds: [],       // Array of HA entity_ids (e.g., ['light.living_room'])
      effect: 'candle',    // Selected effect name
      previousStates: {},  // Captured states before effect was applied
      debug: false
    };
    
    this.lastTrigger = null;
    this.isEffectActive = false;
  }

  restore(data) {
    if (data.properties) {
      Object.assign(this.properties, data.properties);
    }
    if (this.properties.debug) {
      console.log(`[HueEffectNode ${this.id?.slice(-8) || '???'}] Restored with ${this.properties.entityIds?.length || 0} lights, effect: ${this.properties.effect}`);
    }
  }

  async callHAService(domain, service, entityId, data = {}) {
    const config = getHAConfig();
    if (!config.token) {
      console.error('[HueEffectNode] No HA_TOKEN configured');
      return { success: false, error: 'No token' };
    }

    const url = `${config.host}/api/services/${domain}/${service}`;
    const payload = { entity_id: entityId, ...data };

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
        console.error(`[HueEffectNode] HTTP ${response.status} calling ${domain}.${service}`);
        return { success: false, error: `HTTP ${response.status}` };
      }

      return { success: true };
    } catch (error) {
      console.error(`[HueEffectNode] Error calling ${domain}.${service}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  async captureStatesAndApplyEffect() {
    const entityIds = this.properties.entityIds;
    const effect = this.properties.effect;

    if (!entityIds || entityIds.length === 0) {
      console.warn('[HueEffectNode] No lights configured');
      return;
    }

    // Capture current state for each light
    this.properties.previousStates = {};
    
    for (const entityId of entityIds) {
      try {
        // Remove ha_ prefix if present
        const cleanId = entityId.replace('ha_', '');
        const state = await bulkStateCache.getState(cleanId);
        
        if (state) {
          const attrs = state.attributes || {};
          this.properties.previousStates[entityId] = {
            on: state.state === 'on',
            brightness: attrs.brightness,
            hs_color: attrs.hs_color,
            rgb_color: attrs.rgb_color,
            color_temp: attrs.color_temp,
            effect: attrs.effect || 'none'
          };
        }
      } catch (err) {
        console.warn(`[HueEffectNode] Could not capture state for ${entityId}:`, err.message);
      }
    }

    console.log(`[HueEffectNode] Captured states for ${Object.keys(this.properties.previousStates).length} lights`);
    console.log(`[HueEffectNode] 🎨 Applying effect "${effect}" to ${entityIds.length} lights`);

    // Send effect to all lights
    let successCount = 0;
    for (const entityId of entityIds) {
      const cleanId = entityId.replace('ha_', '');
      const result = await this.callHAService('light', 'turn_on', cleanId, { effect });
      if (result.success) successCount++;
    }

    console.log(`[HueEffectNode] ✅ Effect sent to ${successCount}/${entityIds.length} lights`);
    this.isEffectActive = true;
  }

  async restorePreviousStates() {
    const entityIds = this.properties.entityIds;
    const prevStates = this.properties.previousStates;

    if (!entityIds || entityIds.length === 0 || !prevStates || Object.keys(prevStates).length === 0) {
      console.log('[HueEffectNode] No previous states to restore');
      return;
    }

    console.log(`[HueEffectNode] 🔄 Clearing effect on ${entityIds.length} lights (NOT restoring on/off state)`);

    let successCount = 0;
    for (const entityId of entityIds) {
      const prev = prevStates[entityId];
      if (!prev) continue;

      const cleanId = entityId.replace('ha_', '');

      try {
        // IMPORTANT: Do NOT turn lights on/off here!
        // The trigger-based on/off is handled by HAGenericDeviceNode.
        // We only need to clear the effect and optionally restore the color.
        //
        // If we turn lights ON here when the trigger is going FALSE, the downstream
        // HAGenericDeviceNode will try to turn them OFF, but there's a race condition
        // where our turn_on might happen AFTER their turn_off.
        //
        // Instead, just clear the effect. The downstream node handles on/off.
        
        // If light was off before effect started, leave it - downstream will handle it
        if (!prev.on) {
          console.log(`[HueEffectNode] Light ${cleanId} was OFF before effect - skipping (downstream will handle)`);
          successCount++;
          continue;
        }

        // Clear the effect only - downstream HSV input will apply the correct color
        // Don't send brightness/color here as the Timeline/HSV input will provide that
        const serviceData = { effect: 'none' };
        
        console.log(`[HueEffectNode] Clearing effect on ${cleanId} (was ON before effect)`);
        await this.callHAService('light', 'turn_on', cleanId, serviceData);
        successCount++;
      } catch (err) {
        console.error(`[HueEffectNode] Error clearing effect on ${entityId}:`, err.message);
      }
    }

    console.log(`[HueEffectNode] ✅ Cleared effect on ${successCount}/${entityIds.length} lights`);
    this.properties.previousStates = {};
    this.isEffectActive = false;
  }

  async data(inputs) {
    const trigger = inputs.trigger?.[0];
    const hsvIn = inputs.hsv_in?.[0];
    const hasLights = this.properties.entityIds && this.properties.entityIds.length > 0;
    
    // Build HSV output with exclusion metadata when effect is active
    const buildHsvOutput = (active) => {
      if (!hsvIn) return null;
      
      if (active && hasLights) {
        // Pass HSV through but tell downstream to exclude our lights
        const existingExcludes = hsvIn._excludeDevices || [];
        const ourExcludes = this.properties.entityIds || [];
        const allExcludes = [...new Set([...existingExcludes, ...ourExcludes])];
        
        return { ...hsvIn, _excludeDevices: allExcludes };
      }
      
      return hsvIn;
    };

    // Detect rising edge (false→true or null→true) - activate effect
    if (trigger === true && this.lastTrigger !== true && hasLights && this.properties.effect) {
      this.lastTrigger = trigger;
      await this.captureStatesAndApplyEffect();
      return { hsv_out: buildHsvOutput(true), applied: true, active: true };
    }
    
    // Detect falling edge (true→false) - restore previous state
    if (trigger === false && this.lastTrigger === true && hasLights) {
      this.lastTrigger = trigger;
      await this.restorePreviousStates();
      return { hsv_out: buildHsvOutput(false), applied: false, active: false };
    }

    this.lastTrigger = trigger;
    
    return { 
      hsv_out: buildHsvOutput(this.isEffectActive), 
      applied: false, 
      active: this.isEffectActive 
    };
  }
}

// ============================================================================
// WizEffectNode - Backend implementation for triggering WiZ light effects
// WiZ bulbs have 35+ built-in scenes/effects accessible via HA's effect attribute
// ============================================================================
class WizEffectNode {
  constructor() {
    this.type = 'WizEffectNode';
    this.label = 'WiZ Effect';
    
    // WiZ scene names (as exposed by HA WiZ integration)
    this.availableEffects = [
      'Ocean', 'Romance', 'Sunset', 'Party', 'Fireplace', 'Cozy', 'Forest',
      'Pastel colors', 'Wake-up', 'Bedtime', 'Warm white', 'Daylight',
      'Cool white', 'Night light', 'Focus', 'Relax', 'True colors', 'TV time',
      'Plantgrowth', 'Spring', 'Summer', 'Fall', 'Deep dive', 'Jungle',
      'Mojito', 'Club', 'Christmas', 'Halloween', 'Candlelight', 'Golden white',
      'Pulse', 'Steampunk', 'Diwali', 'White', 'Alarm', 'Snowy sky', 'Rhythm'
    ];
    
    this.properties = {
      entityIds: [],       // Array of HA entity_ids for WiZ lights
      effect: 'Fireplace', // Selected effect name (default to a nice one)
      previousStates: {},  // Captured states before effect was applied
      debug: false
    };
    
    this.lastTrigger = null;
    this.isEffectActive = false;
  }

  restore(data) {
    if (data.properties) {
      Object.assign(this.properties, data.properties);
    }
    if (this.properties.debug) {
      console.log(`[WizEffectNode ${this.id?.slice(-8) || '???'}] Restored with ${this.properties.entityIds?.length || 0} lights, effect: ${this.properties.effect}`);
    }
  }

  async callHAService(domain, service, entityId, data = {}) {
    const config = getHAConfig();
    if (!config.token) {
      console.error('[WizEffectNode] No HA_TOKEN configured');
      return { success: false, error: 'No token' };
    }

    const url = `${config.host}/api/services/${domain}/${service}`;
    const payload = { entity_id: entityId, ...data };

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
        console.error(`[WizEffectNode] HTTP ${response.status} calling ${domain}.${service}`);
        return { success: false, error: `HTTP ${response.status}` };
      }

      return { success: true };
    } catch (error) {
      console.error(`[WizEffectNode] Error calling ${domain}.${service}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  async captureStatesAndApplyEffect() {
    const entityIds = this.properties.entityIds;
    const effect = this.properties.effect;

    if (!entityIds || entityIds.length === 0) {
      console.warn('[WizEffectNode] No lights configured');
      return;
    }

    // Capture current state for each light
    this.properties.previousStates = {};
    
    for (const entityId of entityIds) {
      try {
        // Remove ha_ prefix if present
        const cleanId = entityId.replace('ha_', '');
        const state = await bulkStateCache.getState(cleanId);
        
        if (state) {
          const attrs = state.attributes || {};
          this.properties.previousStates[entityId] = {
            on: state.state === 'on',
            brightness: attrs.brightness,
            rgb_color: attrs.rgb_color,
            color_temp: attrs.color_temp,
            effect: attrs.effect || null
          };
        }
      } catch (err) {
        console.warn(`[WizEffectNode] Could not capture state for ${entityId}:`, err.message);
      }
    }

    console.log(`[WizEffectNode] Captured states for ${Object.keys(this.properties.previousStates).length} lights`);
    console.log(`[WizEffectNode] 🎨 Applying WiZ effect "${effect}" to ${entityIds.length} lights`);

    // Send effect to all lights
    let successCount = 0;
    for (const entityId of entityIds) {
      const cleanId = entityId.replace('ha_', '');
      const result = await this.callHAService('light', 'turn_on', cleanId, { effect });
      if (result.success) successCount++;
    }

    console.log(`[WizEffectNode] ✅ Effect sent to ${successCount}/${entityIds.length} lights`);
    this.isEffectActive = true;
  }

  async restorePreviousStates() {
    const entityIds = this.properties.entityIds;
    const prevStates = this.properties.previousStates;

    if (!entityIds || entityIds.length === 0 || !prevStates || Object.keys(prevStates).length === 0) {
      console.log('[WizEffectNode] No previous states to restore');
      return;
    }

    console.log(`[WizEffectNode] 🔄 Clearing effect on ${entityIds.length} lights (NOT restoring on/off state)`);

    let successCount = 0;
    for (const entityId of entityIds) {
      const prev = prevStates[entityId];
      if (!prev) continue;

      const cleanId = entityId.replace('ha_', '');

      try {
        // IMPORTANT: Do NOT turn lights on/off here!
        // The trigger-based on/off is handled by HAGenericDeviceNode downstream.
        // We only need to clear the effect.
        
        // If light was off before effect started, skip it
        if (!prev.on) {
          console.log(`[WizEffectNode] Light ${cleanId} was OFF before effect - skipping (downstream will handle)`);
          successCount++;
          continue;
        }

        // Just clear the effect - downstream HSV input will apply the correct color
        console.log(`[WizEffectNode] Clearing effect on ${cleanId} (was ON before effect)`);
        await this.callHAService('light', 'turn_on', cleanId, {});
        successCount++;
      } catch (err) {
        console.error(`[WizEffectNode] Error clearing effect on ${entityId}:`, err.message);
      }
    }

    console.log(`[WizEffectNode] ✅ Cleared effect on ${successCount}/${entityIds.length} lights`);
    this.properties.previousStates = {};
    this.isEffectActive = false;
  }

  async data(inputs) {
    const trigger = inputs.trigger?.[0];
    const hsvIn = inputs.hsv_in?.[0];
    const hasLights = this.properties.entityIds && this.properties.entityIds.length > 0;
    
    // Build HSV output with exclusion metadata when effect is active
    const buildHsvOutput = (active) => {
      if (!hsvIn) return null;
      
      if (active && hasLights) {
        // Pass HSV through but tell downstream to exclude our lights
        const existingExcludes = hsvIn._excludeDevices || [];
        const ourExcludes = this.properties.entityIds || [];
        const allExcludes = [...new Set([...existingExcludes, ...ourExcludes])];
        
        return { ...hsvIn, _excludeDevices: allExcludes };
      }
      
      return hsvIn;
    };

    // Detect rising edge (false→true or null→true) - activate effect
    if (trigger === true && this.lastTrigger !== true && hasLights && this.properties.effect) {
      this.lastTrigger = trigger;
      await this.captureStatesAndApplyEffect();
      return { hsv_out: buildHsvOutput(true), applied: true, active: true };
    }
    
    // Detect falling edge (true→false) - restore previous state
    if (trigger === false && this.lastTrigger === true && hasLights) {
      this.lastTrigger = trigger;
      await this.restorePreviousStates();
      return { hsv_out: buildHsvOutput(false), applied: false, active: false };
    }

    this.lastTrigger = trigger;
    
    return { 
      hsv_out: buildHsvOutput(this.isEffectActive), 
      applied: false, 
      active: this.isEffectActive 
    };
  }
}

// Register nodes
registry.register('HADeviceStateNode', HADeviceStateNode);
registry.register('HADeviceStateOutputNode', HADeviceStateNode);  // Alias
registry.register('HADeviceStateDisplayNode', HADeviceStateDisplayNode);  // Passthrough display
registry.register('HADeviceFieldNode', HADeviceFieldNode);  // Field extractor for Timeline Color
registry.register('HAServiceCallNode', HAServiceCallNode);
registry.register('HALightControlNode', HALightControlNode);
registry.register('HAGenericDeviceNode', HAGenericDeviceNode);
registry.register('HADeviceAutomationNode', HADeviceAutomationNode);
registry.register('HALockNode', HALockNode);
registry.register('HueEffectNode', HueEffectNode);
registry.register('WizEffectNode', WizEffectNode);

// ============================================================================
// TTSAnnouncementNode (Audio Output) - TTS + Background Streaming
// Supports multi-speaker, ElevenLabs, and internet radio streams
// ============================================================================
class TTSAnnouncementNode {
  constructor(id, properties = {}) {
    this.id = id;
    this.type = 'TTSAnnouncementNode';
    this.properties = {
      // TTS properties
      mediaPlayerIds: properties.mediaPlayerIds || [],
      mediaPlayerId: properties.mediaPlayerId || '',
      message: properties.message || 'Hello, this is an announcement',
      ttsService: properties.ttsService || 'tts/speak',
      ttsEntityId: properties.ttsEntityId || '',
      elevenLabsVoiceId: properties.elevenLabsVoiceId || '',
      
      // Streaming properties
      stations: properties.stations || [],
      selectedStation: properties.selectedStation || 0,
      customStreamUrl: properties.customStreamUrl || '',
      streamVolume: properties.streamVolume || 50,
      streamEnabled: properties.streamEnabled || false,
      resumeDelay: properties.resumeDelay || 3000,
      
      // Per-speaker settings (from frontend)
      speakerStations: properties.speakerStations || {},
      speakerCustomUrls: properties.speakerCustomUrls || {},
      speakerVolumes: properties.speakerVolumes || {},
      
      // Runtime state
      isStreaming: false,
      wasStreamingBeforeTTS: false
    };
    // Dynamic inputs include station_* for each speaker
    this.inputs = { trigger: null, message: null, streamUrl: null };
    this.outputs = { success: false, streaming: false };
    this._lastTrigger = undefined;
    this._lastSentTime = 0;
    this._resumeTimeout = null;
    this._initialized = false;
    this._lastStationInputs = {}; // Track station input values for edge detection
    
    // Settling period on graph load - prevent TTS on initial trigger
    this._initTime = Date.now();
    this._settlingMs = 2000;
  }

  getSpeakerIds() {
    if (this.properties.mediaPlayerIds && this.properties.mediaPlayerIds.length > 0) {
      return this.properties.mediaPlayerIds;
    }
    if (this.properties.mediaPlayerId) {
      return [this.properties.mediaPlayerId];
    }
    return [];
  }

  getStreamUrlForSpeaker(speakerId) {
    // Check per-speaker custom URL first
    const customUrl = this.properties.speakerCustomUrls?.[speakerId];
    if (customUrl) return customUrl;
    
    // Check per-speaker station index
    const stationIndex = this.properties.speakerStations?.[speakerId];
    if (stationIndex !== undefined && this.properties.stations[stationIndex]) {
      return this.properties.stations[stationIndex].url;
    }
    
    // Fall back to global custom URL
    if (this.properties.customStreamUrl) {
      return this.properties.customStreamUrl;
    }
    
    // Fall back to global selected station
    const station = this.properties.stations[this.properties.selectedStation];
    return station?.url || '';
  }

  getVolumeForSpeaker(speakerId) {
    // Check per-speaker volume, fall back to global
    return this.properties.speakerVolumes?.[speakerId] ?? this.properties.streamVolume ?? 50;
  }

  async playStream() {
    const speakerIds = this.getSpeakerIds();
    if (speakerIds.length === 0) return false;
    
    try {
      const { host, token } = getHAConfig();
      if (!token) {
        engineLogger.warn(`[AudioOutput] No HA token configured`);
        return false;
      }
      
      const haManager = getHAManager();
      let anySuccess = false;
      
      for (const entityId of speakerIds) {
        // Check device health before attempting command
        if (haManager && !haManager.isDeviceHealthy(entityId)) {
          engineLogger.log(`[AudioOutput] ⏭️ Skipping unhealthy speaker: ${entityId}`);
          continue;
        }
        
        const streamUrl = this.getStreamUrlForSpeaker(entityId);
        const volume = this.getVolumeForSpeaker(entityId);
        
        if (!streamUrl) {
          engineLogger.log(`[AudioOutput] No stream URL for ${entityId}, skipping`);
          continue;
        }
        
        try {
          // Set volume
          await fetch(`${host}/api/services/media_player/volume_set`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ entity_id: entityId, volume_level: volume / 100 })
          });
          
          // Play stream
          const response = await fetch(`${host}/api/services/media_player/play_media`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ entity_id: entityId, media_content_id: streamUrl, media_content_type: 'music' })
          });
          
          if (response.ok) {
            anySuccess = true;
            if (haManager) haManager.recordDeviceSuccess(entityId);
            const stationName = this.properties.stations.find(s => s.url === streamUrl)?.name || 'custom stream';
            engineLogger.log(`[AudioOutput] ▶️ ${entityId} → ${stationName} (vol: ${volume}%)`);
          } else {
            if (haManager) haManager.recordDeviceFailure(entityId, `HTTP ${response.status}`);
          }
        } catch (speakerErr) {
          // Record failure for this specific speaker
          if (haManager) haManager.recordDeviceFailure(entityId, speakerErr.message);
          engineLogger.warn(`[AudioOutput] Failed to play on ${entityId}: ${speakerErr.message}`);
        }
      }
      
      this.properties.isStreaming = anySuccess;
      return anySuccess;
    } catch (err) {
      engineLogger.warn(`[AudioOutput] Play error: ${err.message}`);
      return false;
    }
  }

  async playSingleSpeaker(speakerId, streamUrl = null, forceStop = false) {
    const url = streamUrl || this.getStreamUrlForSpeaker(speakerId);
    const volume = this.getVolumeForSpeaker(speakerId);
    
    if (!url) {
      engineLogger.log(`[AudioOutput] No stream URL for ${speakerId}`);
      return false;
    }
    
    // Check device health before attempting
    const haManager = getHAManager();
    if (haManager && !haManager.isDeviceHealthy(speakerId)) {
      engineLogger.log(`[AudioOutput] ⏭️ Skipping unhealthy speaker: ${speakerId}`);
      return false;
    }
    
    try {
      const { host, token } = getHAConfig();
      if (!token) return false;
      
      // For Apple devices, stop first to ensure stream change takes effect
      if (forceStop) {
        await fetch(`${host}/api/services/media_player/media_stop`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ entity_id: speakerId })
        });
        await new Promise(r => setTimeout(r, 500)); // Brief pause
      }
      
      // Set volume
      await fetch(`${host}/api/services/media_player/volume_set`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity_id: speakerId, volume_level: volume / 100 })
      });
      
      // Play stream
      const response = await fetch(`${host}/api/services/media_player/play_media`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity_id: speakerId, media_content_id: url, media_content_type: 'music' })
      });
      
      if (response.ok) {
        if (haManager) haManager.recordDeviceSuccess(speakerId);
        const stationName = this.properties.stations.find(s => s.url === url)?.name || 'stream';
        engineLogger.log(`[AudioOutput] ▶️ ${speakerId} → ${stationName}`);
        return true;
      } else {
        if (haManager) haManager.recordDeviceFailure(speakerId, `HTTP ${response.status}`);
      }
      return false;
    } catch (err) {
      if (haManager) haManager.recordDeviceFailure(speakerId, err.message);
      engineLogger.warn(`[AudioOutput] Play single error: ${err.message}`);
      return false;
    }
  }

  async stopStream() {
    const speakerIds = this.getSpeakerIds();
    if (speakerIds.length === 0) return;
    
    try {
      const { host, token } = getHAConfig();
      if (!token) return;
      
      for (const entityId of speakerIds) {
        await fetch(`${host}/api/services/media_player/media_stop`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ entity_id: entityId })
        });
      }
      
      this.properties.isStreaming = false;
      engineLogger.log(`[AudioOutput] ⏹️ Stopped stream`);
    } catch (err) {
      engineLogger.warn(`[AudioOutput] Stop error: ${err.message}`);
    }
  }

  setInput(name, value) {
    // Support dynamic station inputs (station_*)
    if (name in this.inputs || name.startsWith('station_')) {
      this.inputs[name] = value;
    }
  }

  async process() {
    const trigger = this.inputs.trigger;
    const dynamicMessage = this.inputs.message;
    const dynamicStreamUrl = this.inputs.streamUrl;

    // On first process tick, start streaming if streamEnabled is true
    if (!this._initialized) {
      this._initialized = true;
      if (this.properties.streamEnabled && this.getSpeakerIds().length > 0) {
        engineLogger.log(`[AudioOutput] 🚀 Initializing streams on ${this.getSpeakerIds().length} speaker(s)`);
        await this.playStream();
      }
    }

    // Handle per-speaker station inputs with edge detection
    for (const speakerId of this.getSpeakerIds()) {
      const inputKey = `station_${speakerId.replace('media_player.', '')}`;
      const stationInput = this.inputs[inputKey];
      
      if (stationInput !== undefined && stationInput !== null) {
        // Edge detection: only process if input value changed
        const lastValue = this._lastStationInputs[speakerId];
        if (stationInput === lastValue) continue;
        
        this._lastStationInputs[speakerId] = stationInput;
        
        let stationIndex = null;
        let customUrl = null;
        
        if (typeof stationInput === 'number') {
          stationIndex = Math.max(0, Math.min(this.properties.stations.length - 1, Math.floor(stationInput)));
        } else if (typeof stationInput === 'string') {
          if (stationInput.startsWith('http')) {
            customUrl = stationInput;
          } else {
            const foundIdx = this.properties.stations.findIndex(s => 
              s.name.toLowerCase() === stationInput.toLowerCase()
            );
            if (foundIdx >= 0) stationIndex = foundIdx;
          }
        }
        
        if (customUrl) {
          this.properties.speakerCustomUrls[speakerId] = customUrl;
          engineLogger.log(`[AudioOutput] 📻 Station input: custom URL for ${speakerId}`);
          if (this.properties.isStreaming) {
            await this.playSingleSpeaker(speakerId, customUrl, true);
          }
        } else if (stationIndex !== null) {
          delete this.properties.speakerCustomUrls[speakerId];
          this.properties.speakerStations[speakerId] = stationIndex;
          const stationName = this.properties.stations[stationIndex]?.name || `Station ${stationIndex}`;
          engineLogger.log(`[AudioOutput] 📻 Station input: ${speakerId} → ${stationName}`);
          if (this.properties.isStreaming) {
            await this.playSingleSpeaker(speakerId, null, true);
          }
        }
      }
    }

    // Handle dynamic stream URL input
    if (dynamicStreamUrl && dynamicStreamUrl !== this.properties.customStreamUrl) {
      this.properties.customStreamUrl = dynamicStreamUrl;
      if (this.properties.streamEnabled && this.properties.isStreaming) {
        await this.playStream();
      }
    }

    // Debounce
    const now = Date.now();
    const debounceMs = 1000;
    
    // Settling period check - skip TTS triggers during graph load
    const elapsed = now - this._initTime;
    const isSettling = elapsed < this._settlingMs;

    // Detect rising edge for TTS
    if (trigger && trigger !== this._lastTrigger && (now - this._lastSentTime) > debounceMs) {
      this._lastTrigger = trigger;
      this._lastSentTime = now;
      
      // Skip TTS during settling period (graph load)
      if (isSettling) {
        engineLogger.log(`[AudioOutput] ⏳ Backend settling: skipping TTS trigger (${elapsed}ms since init)`);
        this.outputs.streaming = this.properties.isStreaming;
        return this.outputs;
      }
      
      // Skip TTS if frontend is active (let frontend handle it)
      const engine = getEngine();
      const shouldSkip = engine && engine.shouldSkipDeviceCommands();
      console.log(`[AudioOutput-DEBUG] TTS trigger detected. engine=${!!engine}, frontendActive=${engine?.frontendActive}, shouldSkip=${shouldSkip}`);
      
      if (shouldSkip) {
        console.log(`[AudioOutput] 🖥️ Frontend active: skipping backend TTS`);
        this.outputs.streaming = this.properties.isStreaming;
        return this.outputs;
      }
      
      console.log(`[AudioOutput] 🔊 Backend TTS proceeding (frontend not active)`);

      const message = (dynamicMessage !== undefined && dynamicMessage !== null && dynamicMessage !== '')
        ? dynamicMessage 
        : this.properties.message;
      const speakerIds = this.getSpeakerIds();

      if (speakerIds.length > 0 && message) {
        // Pause stream if playing
        if (this.properties.isStreaming) {
          this.properties.wasStreamingBeforeTTS = true;
          await this.stopStream();
        }

        try {
          const { host, token } = getHAConfig();
          if (!token) {
            engineLogger.warn(`[AudioOutput] No HA token configured`);
            this.outputs.success = false;
          } else if (this.properties.ttsService === 'elevenlabs') {
            const publicUrl = process.env.PUBLIC_URL || 'http://localhost:3000';
            engineLogger.log(`[AudioOutput] Sending ElevenLabs TTS to ${speakerIds.length} speaker(s)`);
            
            const response = await fetch(`${publicUrl}/api/tts/elevenlabs`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                message: message,
                voiceId: this.properties.elevenLabsVoiceId,
                mediaPlayerIds: speakerIds
              })
            });
            
            this.outputs.success = response.ok;
          } else {
            engineLogger.log(`[AudioOutput] Sending HA TTS to ${speakerIds.length} speaker(s)`);
            
            for (const entityId of speakerIds) {
              const response = await fetch(`${host}/api/services/tts/speak`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  entity_id: this.properties.ttsEntityId || entityId,
                  media_player_entity_id: entityId,
                  message: message
                })
              });

              if (!response.ok) {
                await fetch(`${host}/api/services/tts/google_translate_say`, {
                  method: 'POST',
                  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ entity_id: entityId, message: message })
                });
              }
            }
            
            this.outputs.success = true;
          }

          // Schedule stream resume after TTS
          if (this.properties.wasStreamingBeforeTTS && this.properties.streamEnabled) {
            if (this._resumeTimeout) clearTimeout(this._resumeTimeout);
            this._resumeTimeout = setTimeout(async () => {
              await this.playStream();
              this.properties.wasStreamingBeforeTTS = false;
            }, this.properties.resumeDelay);
          }
        } catch (err) {
          engineLogger.warn(`[AudioOutput] Error: ${err.message}`);
          this.outputs.success = false;
        }
      }
    } else if (!trigger) {
      this._lastTrigger = undefined;
    }

    this.outputs.streaming = this.properties.isStreaming;
    return this.outputs;
  }
}

registry.register('TTSAnnouncementNode', TTSAnnouncementNode);

module.exports = { 
  HADeviceStateNode, 
  HADeviceFieldNode,
  HAServiceCallNode, 
  HALightControlNode,
  HAGenericDeviceNode,
  HADeviceAutomationNode,
  HADeviceStateDisplayNode,
  HALockNode,
  HueEffectNode,
  WizEffectNode,
  TTSAnnouncementNode,
  getHAConfig,
  bulkStateCache  // Exposed for engine reconciliation
};

