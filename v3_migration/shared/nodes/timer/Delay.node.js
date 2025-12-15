/**
 * Delay.node.js - Unified Node Definition
 * 
 * Delay, Debounce, Throttle, and Retriggerable timer modes.
 * 
 * 🦴 Caveman Summary:
 * This node is like a traffic light timer. When something goes in:
 * - Delay: Wait X seconds, then pass it through
 * - Debounce: Keep resetting timer while input changes, fire after silence
 * - Throttle: Let first one through, block others for X seconds
 * - Retriggerable: Turn ON immediately, stay ON for X seconds after last trigger
 * 
 * Key Concept: Unlike setTimeout-based frontend, this uses tick-based timing.
 * Every engine tick (~100ms), we check elapsed time and update accordingly.
 */

module.exports = {
  // === IDENTITY ===
  id: 'DelayNode',
  version: '1.0.0',
  
  // === UI METADATA ===
  label: 'Delay',
  category: 'Timer/Event',
  icon: '⏱️',
  color: '#ce93d8',
  width: 260,
  height: 280,
  helpText: `Time-based signal control for automations.

Modes:
• Delay: Wait, then pass value through
• Debounce: Reset timer on each input, fire after silence
• Throttle: Allow one message per time period
• Retriggerable: ON immediately, restart off-timer on each trigger`,

  // === INPUTS ===
  inputs: {
    trigger: {
      type: 'boolean',
      label: 'Trigger',
      description: 'Input signal to delay/process'
    },
    value: {
      type: 'any',
      label: 'Value',
      description: 'Optional value to pass through (if not connected, trigger value is used)'
    }
  },

  // === OUTPUTS ===
  outputs: {
    delayed: {
      type: 'boolean',
      label: 'Delayed',
      description: 'Processed output signal'
    },
    passthrough: {
      type: 'any',
      label: 'Passthrough',
      description: 'The value that was passed through'
    }
  },

  // === CONFIGURABLE PROPERTIES ===
  properties: {
    mode: {
      type: 'select',
      default: 'delay',
      options: ['delay', 'debounce', 'throttle', 'retriggerable'],
      label: 'Mode',
      description: 'Delay: wait then pass. Debounce: fire after silence. Throttle: limit rate. Retriggerable: ON immediately, restart off-timer.',
      uiType: 'select'
    },
    delayValue: {
      type: 'number',
      default: 1,
      label: 'Delay',
      min: 0,
      uiType: 'number'
    },
    delayUnit: {
      type: 'select',
      default: 'seconds',
      options: ['ms', 'seconds', 'minutes', 'hours'],
      label: 'Unit',
      uiType: 'select'
    },
    randomPercent: {
      type: 'number',
      default: 0,
      label: 'Random ±%',
      min: 0,
      max: 100,
      description: 'Add random variation to delay (0 = exact, 50 = ±50%)',
      uiType: 'slider'
    }
  },

  // === INTERNAL STATE (managed by runtime) ===
  internalState: {
    lastTriggerValue: undefined,
    pendingValue: undefined,
    pendingPassthrough: undefined,
    timerStartedAt: null,      // Timestamp when timer started
    timerDurationMs: 0,        // How long the timer should run
    outputValue: false,
    passthroughValue: null,
    throttleLastFire: 0,       // For throttle mode
    isActive: false
  },

  // === HELPER: Convert delayValue + delayUnit to milliseconds ===
  _getDelayMs(properties) {
    const value = properties.delayValue || 1;
    const unit = properties.delayUnit || 'seconds';
    
    const multipliers = {
      'ms': 1,
      'seconds': 1000,
      'minutes': 60000,
      'hours': 3600000
    };
    
    return value * (multipliers[unit] || 1000);
  },

  // === HELPER: Apply random variation to delay ===
  _getRandomizedDelay(baseDelayMs, randomPercent) {
    if (!randomPercent || randomPercent === 0) {
      return baseDelayMs;
    }
    
    // ±randomPercent variation
    const variation = (Math.random() - 0.5) * 2 * (randomPercent / 100);
    const actualDelay = Math.round(baseDelayMs * (1 + variation));
    
    // Minimum 10ms
    return Math.max(10, actualDelay);
  },

  // === THE ACTUAL LOGIC ===
  /**
   * Execute function - works in both frontend preview and backend engine
   * 
   * IMPORTANT: This is tick-based, not setTimeout-based.
   * Each call checks elapsed time and updates state accordingly.
   */
  execute(inputs, properties, context, state) {
    const now = context?.now ? context.now().getTime() : Date.now();
    
    // Get input values
    const trigger = inputs.trigger?.[0] ?? inputs.trigger;
    const valueInput = inputs.value?.[0] ?? inputs.value;
    
    // Value to pass through: use valueInput if provided, otherwise use trigger
    const valueToPass = valueInput !== undefined ? valueInput : trigger;
    
    // Detect state changes
    const triggerChanged = trigger !== state.lastTriggerValue;
    const isRisingEdge = trigger && !state.lastTriggerValue;
    const isFallingEdge = !trigger && state.lastTriggerValue;
    
    // Calculate delay
    const baseDelayMs = this._getDelayMs(properties);
    const delayMs = this._getRandomizedDelay(baseDelayMs, properties.randomPercent || 0);
    
    // Check if timer has elapsed
    const timerElapsed = state.timerStartedAt && 
      (now - state.timerStartedAt >= state.timerDurationMs);
    
    const mode = properties.mode || 'delay';
    
    // Process based on mode
    switch (mode) {
      case 'delay':
        // Node-RED style: wait, then pass the value through
        if (triggerChanged) {
          // Start timer with new value
          state.timerStartedAt = now;
          state.timerDurationMs = delayMs;
          state.pendingValue = trigger;
          state.pendingPassthrough = valueToPass;
          state.isActive = true;
        }
        
        if (timerElapsed && state.isActive) {
          // Timer completed - fire the output
          state.outputValue = state.pendingValue;
          state.passthroughValue = state.pendingPassthrough;
          state.isActive = false;
          state.timerStartedAt = null;
        }
        break;

      case 'debounce':
        // Reset timer on each change, fire after silence period
        if (triggerChanged) {
          // Reset timer
          state.timerStartedAt = now;
          state.timerDurationMs = delayMs;
          state.pendingValue = trigger;
          state.pendingPassthrough = valueToPass;
          state.isActive = true;
        }
        
        if (timerElapsed && state.isActive) {
          // Silence period over - fire
          state.outputValue = state.pendingValue;
          state.passthroughValue = state.pendingPassthrough;
          state.isActive = false;
          state.timerStartedAt = null;
        }
        break;

      case 'throttle':
        // Immediate pass-through, then block for delay period
        if (triggerChanged) {
          if (now - state.throttleLastFire >= delayMs) {
            // Enough time passed, allow through
            state.throttleLastFire = now;
            state.outputValue = trigger;
            state.passthroughValue = valueToPass;
          }
          // Otherwise blocked (throttled)
        }
        break;

      case 'retriggerable':
        // Output ON immediately on trigger, restart off-timer
        if (triggerChanged) {
          if (trigger) {
            // Rising edge: turn ON immediately
            state.outputValue = true;
            state.passthroughValue = valueToPass;
          }
          
          // Start/restart the off-timer (on any change)
          state.timerStartedAt = now;
          state.timerDurationMs = delayMs;
          state.isActive = true;
        }
        
        if (timerElapsed && state.isActive) {
          // Timer expired - turn OFF
          state.outputValue = false;
          state.passthroughValue = null;
          state.isActive = false;
          state.timerStartedAt = null;
        }
        break;
    }
    
    // Update last trigger value for next tick
    state.lastTriggerValue = trigger;
    
    return {
      delayed: state.outputValue,
      passthrough: state.passthroughValue
    };
  },

  // === OPTIONAL: Validation ===
  validate(properties) {
    const errors = [];
    
    if (properties.delayValue < 0) {
      errors.push('Delay must be non-negative');
    }
    if (properties.randomPercent < 0 || properties.randomPercent > 100) {
      errors.push('Random percent must be between 0 and 100');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
};
