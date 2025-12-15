/**
 * TimeOfDay.node.js - Unified Node Definition
 * 
 * This single file defines everything about the TimeOfDayNode:
 * - Schema (inputs, outputs, properties)
 * - UI hints (icon, color, tooltips)
 * - Logic (execute function that works in both frontend and backend)
 * 
 * 🦴 Caveman Summary:
 * This node is like an alarm clock. You set a "wake up" time and a "go to sleep" time.
 * When the current time is between those two times, it outputs TRUE (lights on!).
 * When the current time is outside that window, it outputs FALSE (lights off).
 */

module.exports = {
  // === IDENTITY ===
  id: 'TimeOfDayNode',
  version: '1.0.0',
  
  // === UI METADATA ===
  label: 'Time of Day',
  category: 'Timer/Event',
  icon: '⏰',
  color: '#4a90d9',
  width: 450,
  height: 200, // Auto-calculated based on content
  helpText: `Time-based trigger that activates during specified hours.

Set start and stop times to define an active window.

Modes:
• Range Mode: TRUE during active window
• Pulse Mode: Brief pulse at start/stop times`,

  // === INPUTS ===
  inputs: {
    // TimeOfDayNode has no inputs - it reads system time
  },

  // === OUTPUTS ===
  outputs: {
    state: {
      type: 'boolean',
      label: 'State',
      description: 'TRUE when current time is within active window, FALSE otherwise.'
    },
    startTime: {
      type: 'string',
      label: 'Start Time',
      description: 'Formatted start time string (e.g., "8:00 AM")'
    },
    endTime: {
      type: 'string',
      label: 'End Time',
      description: 'Formatted stop time string (e.g., "6:00 PM")'
    }
  },

  // === CONFIGURABLE PROPERTIES ===
  properties: {
    customName: {
      type: 'string',
      default: '',
      label: 'Name',
      description: 'Optional name for this timer. Useful when you have multiple time nodes.',
      uiType: 'text' // text, textarea, hidden
    },
    start_hour: {
      type: 'number',
      default: 8,
      label: 'Start Hour',
      min: 1,
      max: 12,
      uiType: 'number'
    },
    start_minute: {
      type: 'number',
      default: 0,
      label: 'Start Minute',
      min: 0,
      max: 59,
      uiType: 'number'
    },
    start_ampm: {
      type: 'select',
      default: 'AM',
      options: ['AM', 'PM'],
      label: 'Start AM/PM',
      uiType: 'select'
    },
    start_enabled: {
      type: 'boolean',
      default: true,
      label: 'Start Enabled',
      uiType: 'toggle'
    },
    stop_hour: {
      type: 'number',
      default: 6,
      label: 'Stop Hour',
      min: 1,
      max: 12,
      uiType: 'number'
    },
    stop_minute: {
      type: 'number',
      default: 0,
      label: 'Stop Minute',
      min: 0,
      max: 59,
      uiType: 'number'
    },
    stop_ampm: {
      type: 'select',
      default: 'PM',
      options: ['AM', 'PM'],
      label: 'Stop AM/PM',
      uiType: 'select'
    },
    stop_enabled: {
      type: 'boolean',
      default: true,
      label: 'Stop Enabled',
      uiType: 'toggle'
    },
    pulseMode: {
      type: 'boolean',
      default: false,
      label: 'Pulse Mode',
      description: 'Pulse: Brief signal at start/stop times. Range: Continuous TRUE during active window.',
      uiType: 'toggle'
    },
    timezone: {
      type: 'string',
      default: 'local',
      label: 'Timezone',
      uiType: 'text'
    }
  },

  // === INTERNAL STATE (not exposed in UI) ===
  // These are managed by the runtime, not saved/restored
  internalState: {
    lastState: null,
    currentState: false
  },

  // === THE ACTUAL LOGIC ===
  /**
   * Execute function - runs in BOTH frontend preview AND backend engine
   * 
   * @param {Object} inputs - Values from connected input sockets (empty for this node)
   * @param {Object} properties - Current property values
   * @param {Object} context - Runtime context (provides now(), deviceManagers, etc.)
   * @param {Object} state - Internal state that persists across executions
   * @returns {Object} - Output values keyed by output socket name
   */
  execute(inputs, properties, context, state) {
    // Get current time - context.now() works in both browser and Node.js
    const now = context?.now ? context.now() : new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentMinutes = currentHour * 60 + currentMinute;

    // Convert 12-hour format to minutes since midnight
    const toMinutes = (hour, minute, ampm) => {
      let h = parseInt(hour) || 0;
      const m = parseInt(minute) || 0;
      
      // 12-hour to 24-hour conversion
      if (ampm === 'PM' && h !== 12) {
        h += 12;
      } else if (ampm === 'AM' && h === 12) {
        h = 0;
      }
      
      return h * 60 + m;
    };

    const startEnabled = properties.start_enabled !== false;
    const stopEnabled = properties.stop_enabled !== false;

    const startMinutes = toMinutes(
      properties.start_hour,
      properties.start_minute,
      properties.start_ampm
    );
    const endMinutes = toMinutes(
      properties.stop_hour,
      properties.stop_minute,
      properties.stop_ampm
    );

    // Determine if we're in the active range
    let inRange;

    if (!startEnabled && !stopEnabled) {
      // Neither enabled - maintain current state
      inRange = state.currentState || false;
    } else if (!startEnabled && stopEnabled) {
      // Only stop enabled: ON until stop time
      inRange = currentMinutes < endMinutes;
    } else if (startEnabled && !stopEnabled) {
      // Only start enabled: ON from start, never auto-off
      inRange = currentMinutes >= startMinutes;
    } else {
      // Both enabled: Normal range check
      if (startMinutes <= endMinutes) {
        // Same day (e.g., 08:00 to 18:00)
        inRange = currentMinutes >= startMinutes && currentMinutes < endMinutes;
      } else {
        // Overnight (e.g., 22:00 to 06:00)
        inRange = currentMinutes >= startMinutes || currentMinutes < endMinutes;
      }
    }

    // Handle pulse mode
    let outputState;
    if (properties.pulseMode) {
      // Only trigger TRUE on rising edge (when we enter the window)
      outputState = inRange && state.lastState !== true;
    } else {
      outputState = inRange;
    }

    // Update internal state
    state.lastState = inRange;
    state.currentState = inRange;

    // Format times for output
    const formatTime = (hour, minute, ampm) => {
      const m = String(minute).padStart(2, '0');
      return `${hour}:${m} ${ampm}`;
    };

    return {
      state: outputState,
      startTime: formatTime(properties.start_hour, properties.start_minute, properties.start_ampm),
      endTime: formatTime(properties.stop_hour, properties.stop_minute, properties.stop_ampm)
    };
  },

  // === OPTIONAL: Custom validation ===
  validate(properties) {
    const errors = [];
    
    if (properties.start_hour < 1 || properties.start_hour > 12) {
      errors.push('Start hour must be between 1 and 12');
    }
    if (properties.stop_hour < 1 || properties.stop_hour > 12) {
      errors.push('Stop hour must be between 1 and 12');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
};
