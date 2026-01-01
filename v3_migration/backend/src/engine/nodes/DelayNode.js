/**
 * DelayNode.js - Backend implementation of delay/timer nodes
 * 
 * Pure Node.js implementation without browser dependencies.
 */

const registry = require('../BackendNodeRegistry');

// Debug mode - only log verbose info when enabled
const VERBOSE = process.env.VERBOSE_LOGGING === 'true';

/**
 * DelayNode - Delays passing a value through
 */
class DelayNode {
  constructor() {
    this.id = null;
    this.label = 'Delay';
    this.properties = {
      delay: 1000,      // ms
      unit: 'ms'        // ms, s, m
    };
    this.pendingValue = undefined;
    this.pendingTimeout = null;
    this.outputValue = undefined;
  }

  restore(data) {
    if (data.properties) {
      Object.assign(this.properties, data.properties);
    }
  }

  getDelayMs() {
    const value = this.properties.delay || 1000;
    switch (this.properties.unit) {
      case 's': return value * 1000;
      case 'm': return value * 60 * 1000;
      default: return value;
    }
  }

  data(inputs) {
    const inputValues = inputs.input || inputs.trigger || [];
    const inputValue = inputValues[0];

    // If we have a new input and it's different from pending
    if (inputValue !== undefined && inputValue !== this.pendingValue) {
      this.pendingValue = inputValue;
      
      // Clear any existing timeout
      if (this.pendingTimeout) {
        clearTimeout(this.pendingTimeout);
      }
      
      // Schedule the output
      this.pendingTimeout = setTimeout(() => {
        this.outputValue = this.pendingValue;
        this.pendingTimeout = null;
      }, this.getDelayMs());
    }

    return { output: this.outputValue };
  }

  // Cleanup when node is removed
  destroy() {
    if (this.pendingTimeout) {
      clearTimeout(this.pendingTimeout);
    }
  }
}

/**
 * TriggerNode - Fires once when input goes true, with optional reset delay
 */
class TriggerNode {
  constructor() {
    this.id = null;
    this.label = 'Trigger';
    this.properties = {
      resetDelay: 1000,
      autoReset: true
    };
    this.lastInput = false;
    this.triggered = false;
    this.resetTimeout = null;
  }

  restore(data) {
    if (data.properties) {
      Object.assign(this.properties, data.properties);
    }
  }

  data(inputs) {
    const inputValues = inputs.input || inputs.trigger || [];
    const inputValue = Boolean(inputValues[0]);

    // Detect rising edge
    if (inputValue && !this.lastInput) {
      this.triggered = true;
      
      // Auto-reset after delay
      if (this.properties.autoReset) {
        if (this.resetTimeout) {
          clearTimeout(this.resetTimeout);
        }
        this.resetTimeout = setTimeout(() => {
          this.triggered = false;
          this.resetTimeout = null;
        }, this.properties.resetDelay);
      }
    }
    
    // Reset when input goes false (if not auto-reset)
    if (!inputValue && this.lastInput && !this.properties.autoReset) {
      this.triggered = false;
    }
    
    this.lastInput = inputValue;
    
    return { output: this.triggered };
  }

  destroy() {
    if (this.resetTimeout) {
      clearTimeout(this.resetTimeout);
    }
  }
}

/**
 * InjectNode - Full-featured trigger node with schedule support and pulse mode
 * Matches frontend plugin capabilities for headless 24/7 operation
 */
class InjectNode {
  constructor() {
    this.id = null;
    this.label = 'Inject';
    this.properties = {
      // Payload settings
      payloadType: 'boolean',   // 'boolean', 'timestamp', 'number', 'string', 'object'
      payloadValue: true,
      
      // Repeat mode (legacy interval-based)
      repeatMs: 0,              // 0 = no repeat, otherwise interval in ms
      
      // Pulse mode - output briefly then return to undefined
      pulseMode: false,
      pulseDurationMs: 500,
      
      // Schedule settings (cron-like)
      scheduleEnabled: false,
      scheduleTime: '',         // HH:MM format (24-hour)
      scheduleDays: [true, true, true, true, true, true, true], // Sun-Sat
      
      // Runtime state
      lastTriggerTime: null,
      isPulsing: false,
      pulsePending: false       // Latch: pulse waits to be delivered via data()
    };
    
    this._repeatTimer = null;
    this._pulseTimer = null;
    this._scheduleCheckInterval = null;
    this._lastScheduleMinute = -1; // Track to prevent duplicate triggers in same minute
  }

  restore(data) {
    if (VERBOSE) console.log(`[InjectNode] restore() called with:`, JSON.stringify(data.properties || {}, null, 2));
    
    if (data.properties) {
      // Restore all properties from saved graph
      this.properties.payloadType = data.properties.payloadType || 'boolean';
      this.properties.payloadValue = data.properties.payloadValue ?? true;
      this.properties.repeatMs = data.properties.repeatMs || 0;
      this.properties.pulseMode = data.properties.pulseMode || false;
      this.properties.pulseDurationMs = data.properties.pulseDurationMs || 500;
      this.properties.scheduleEnabled = data.properties.scheduleEnabled || false;
      this.properties.scheduleTime = data.properties.scheduleTime || '';
      this.properties.scheduleDays = data.properties.scheduleDays || [true, true, true, true, true, true, true];
      
      // Legacy support: map old 'interval' to repeatMs
      if (data.properties.interval && !data.properties.repeatMs) {
        this.properties.repeatMs = data.properties.interval;
      }
      // Legacy support: map old 'value' to payloadValue
      if (data.properties.value !== undefined && data.properties.payloadValue === undefined) {
        this.properties.payloadValue = data.properties.value;
      }
    }
    
    if (VERBOSE) console.log(`[InjectNode ${this.id}] restore - type: ${this.properties.payloadType}, value: "${this.properties.payloadValue}", pulse: ${this.properties.pulseMode}, schedule: ${this.properties.scheduleEnabled} @ ${this.properties.scheduleTime}`);
    
    // Start schedule checker if enabled
    this._startScheduleChecker();
    
    // Start repeat timer if configured
    if (this.properties.repeatMs > 0) {
      this._startRepeat();
    }
  }

  _getPayload() {
    switch (this.properties.payloadType) {
      case 'boolean':
        return Boolean(this.properties.payloadValue);
      case 'timestamp':
        return Date.now();
      case 'number':
        return Number(this.properties.payloadValue) || 0;
      case 'string':
        return String(this.properties.payloadValue || '');
      case 'object':
        try {
          if (typeof this.properties.payloadValue === 'string') {
            return JSON.parse(this.properties.payloadValue);
          }
          return this.properties.payloadValue || {};
        } catch (e) {
          return { error: 'Invalid JSON', raw: this.properties.payloadValue };
        }
      default:
        return this.properties.payloadValue;
    }
  }

  trigger() {
    if (VERBOSE) console.log(`[InjectNode ${this.id}] TRIGGER! type: ${this.properties.payloadType}, pulseMode: ${this.properties.pulseMode}`);
    this.properties.lastTriggerTime = Date.now();
    
    if (this.properties.pulseMode) {
      // Set pending latch - will be cleared when data() reads it
      this.properties.pulsePending = true;
      this.properties.isPulsing = true;  // Visual indicator
      if (VERBOSE) console.log(`[InjectNode ${this.id}] Pulse LATCHED, value: "${this._getPayload()}"`);
      
      // Clear any existing pulse timer
      if (this._pulseTimer) {
        clearTimeout(this._pulseTimer);
      }
      
      // End visual indicator after duration (pulsePending stays until read)
      this._pulseTimer = setTimeout(() => {
        this.properties.isPulsing = false;
        this._pulseTimer = null;
        if (VERBOSE) console.log(`[InjectNode ${this.id}] Pulse visual ended (pulsePending: ${this.properties.pulsePending})`);
      }, this.properties.pulseDurationMs || 500);
    }
  }

  _startRepeat() {
    this._stopRepeat();
    if (this.properties.repeatMs > 0) {
      this._repeatTimer = setInterval(() => {
        this.trigger();
      }, this.properties.repeatMs);
    }
  }

  _stopRepeat() {
    if (this._repeatTimer) {
      clearInterval(this._repeatTimer);
      this._repeatTimer = null;
    }
  }

  _startScheduleChecker() {
    this._stopScheduleChecker();
    
    if (!this.properties.scheduleEnabled || !this.properties.scheduleTime) {
      return;
    }

    if (VERBOSE) console.log(`[InjectNode] Starting schedule checker for ${this.properties.scheduleTime}`);
    
    // Check every 1 second for precise triggering
    this._scheduleCheckInterval = setInterval(() => {
      this._checkSchedule();
    }, 1000);

    // Also check immediately
    this._checkSchedule();
  }

  _stopScheduleChecker() {
    if (this._scheduleCheckInterval) {
      clearInterval(this._scheduleCheckInterval);
      this._scheduleCheckInterval = null;
    }
  }

  _checkSchedule() {
    if (!this.properties.scheduleEnabled || !this.properties.scheduleTime) {
      return;
    }

    const now = new Date();
    const [hours, minutes] = this.properties.scheduleTime.split(':').map(Number);
    
    if (isNaN(hours) || isNaN(minutes)) return;

    const currentDay = now.getDay(); // 0 = Sunday
    
    // Check if today is enabled
    if (!this.properties.scheduleDays[currentDay]) {
      return;
    }

    const currentHours = now.getHours();
    const currentMinutes = now.getMinutes();
    const currentSeconds = now.getSeconds();

    // Trigger at exactly the start of the minute (within first 2 seconds)
    if (currentHours === hours && currentMinutes === minutes && currentSeconds < 2) {
      // Only trigger if we haven't triggered recently (within 60 seconds)
      const lastTrigger = this.properties.lastTriggerTime;
      if (!lastTrigger || (Date.now() - lastTrigger) > 60000) {
        if (VERBOSE) console.log(`[InjectNode] Schedule triggered at ${this.properties.scheduleTime} (${currentHours}:${currentMinutes}:${currentSeconds})`);
        this.trigger();
      }
    }
  }

  data(inputs) {
    // Pulse mode: only output when pulsePending is true, then clear it
    if (this.properties.pulseMode) {
      if (this.properties.pulsePending) {
        const output = this._getPayload();
        if (VERBOSE) console.log(`[InjectNode ${this.id}] data() DELIVERING pulse: "${output}"`);
        // Clear the latch - pulse has been delivered
        this.properties.pulsePending = false;
        return { output };
      }
      return { output: undefined };
    }
    
    // Non-pulse mode: always return the payload value (original behavior)
    return { output: this._getPayload() };
  }

  destroy() {
    this._stopRepeat();
    this._stopScheduleChecker();
    if (this._pulseTimer) {
      clearTimeout(this._pulseTimer);
      this._pulseTimer = null;
    }
  }
}

// Register nodes
registry.register('DelayNode', DelayNode);
registry.register('TriggerNode', TriggerNode);
registry.register('InjectNode', InjectNode);

module.exports = { DelayNode, TriggerNode, InjectNode };
