/**
 * DelayNode.js - Backend implementation of delay/timer nodes
 * 
 * Pure Node.js implementation without browser dependencies.
 */

const registry = require('../BackendNodeRegistry');

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
 * InjectNode - Periodically injects a value (like a cron job)
 */
class InjectNode {
  constructor() {
    this.id = null;
    this.label = 'Inject';
    this.properties = {
      interval: 60000,   // ms between injections
      value: true,
      enabled: true
    };
    this.lastInjection = 0;
    this.outputValue = undefined;
  }

  restore(data) {
    if (data.properties) {
      Object.assign(this.properties, data.properties);
    }
  }

  data(inputs) {
    if (!this.properties.enabled) {
      return { output: undefined };
    }

    const now = Date.now();
    
    // Check if it's time to inject
    if (now - this.lastInjection >= this.properties.interval) {
      this.lastInjection = now;
      this.outputValue = this.properties.value;
    }

    return { output: this.outputValue };
  }
}

// Register nodes
registry.register('DelayNode', DelayNode);
registry.register('TriggerNode', TriggerNode);
registry.register('InjectNode', InjectNode);

module.exports = { DelayNode, TriggerNode, InjectNode };
