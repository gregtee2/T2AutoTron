/**
 * SunriseSunset.node.js - Unified Node Definition
 * 
 * Triggers based on sunrise/sunset times with configurable offsets.
 * 
 * 🦴 Caveman Summary:
 * This node is like a smart alarm clock that knows when the sun rises and sets.
 * You tell it:
 * - Where you are (latitude/longitude)
 * - When to turn ON (e.g., 30 minutes before sunset)
 * - When to turn OFF (e.g., at sunrise, or a fixed time like 11 PM)
 * 
 * It calculates the exact ON and OFF times for today, and tells you if you're
 * currently in the "active" window (between ON and OFF times).
 * 
 * DESIGN: This is a pure calculation node. Given the inputs, it calculates:
 * 1. next_on_date - When the ON event will happen next
 * 2. next_off_date - When the OFF event will happen next
 * 3. currentState - Whether we're currently in the active window
 * 
 * The frontend/backend handle fetching sunrise/sunset times from the API separately.
 * This node just does the offset calculations.
 */

module.exports = {
  // === IDENTITY ===
  id: 'SunriseSunsetNode',
  version: '1.0.0',
  
  // === POC FLAG ===
  // Hidden from frontend context menu - frontend uses existing pretty UI plugin
  hidden: true,
  
  // === UI METADATA ===
  label: 'Sunrise/Sunset Trigger',
  category: 'Timer/Event',
  icon: '🌅',
  color: '#ff9800',
  width: 450,
  height: 800,
  helpText: `Triggers based on sunrise/sunset times for your location.

Calculate actual solar times based on latitude/longitude.
Supports offset (e.g., 30 min before sunset) and fixed override times.`,

  // === INPUTS ===
  inputs: {
    // No inputs - this node generates triggers based on time
  },

  // === OUTPUTS ===
  outputs: {
    state: {
      type: 'boolean',
      label: 'State',
      description: 'TRUE during active window, FALSE otherwise'
    },
    startTime: {
      type: 'string',
      label: 'Start Time',
      description: 'Calculated ON time as formatted string'
    },
    endTime: {
      type: 'string',
      label: 'End Time',
      description: 'Calculated OFF time as formatted string'
    }
  },

  // === CONFIGURABLE PROPERTIES ===
  properties: {
    // Location
    latitude: {
      type: 'number',
      default: 34.0522,
      label: 'Latitude',
      description: 'Your location latitude'
    },
    longitude: {
      type: 'number',
      default: -118.2437,
      label: 'Longitude',
      description: 'Your location longitude'
    },
    city: {
      type: 'string',
      default: 'Los Angeles',
      label: 'City',
      description: 'City name for display'
    },
    timezone: {
      type: 'string',
      default: 'America/Los_Angeles',
      label: 'Timezone',
      description: 'IANA timezone string'
    },
    
    // ON trigger settings (typically sunset-based)
    on_enabled: {
      type: 'boolean',
      default: true,
      label: 'Sunset Offset Enabled'
    },
    on_offset_hours: {
      type: 'number',
      default: 0,
      label: 'ON Offset Hours'
    },
    on_offset_minutes: {
      type: 'number',
      default: 30,
      label: 'ON Offset Minutes'
    },
    on_offset_direction: {
      type: 'select',
      default: 'Before',
      options: ['Before', 'After'],
      label: 'ON Offset Direction'
    },
    
    // Fixed ON time (overrides sunset offset)
    fixed_on_enabled: {
      type: 'boolean',
      default: false,
      label: 'Fixed ON Time Enabled'
    },
    fixed_on_hour: {
      type: 'number',
      default: 6,
      label: 'Fixed ON Hour (1-12)'
    },
    fixed_on_minute: {
      type: 'number',
      default: 0,
      label: 'Fixed ON Minute (0-59)'
    },
    fixed_on_ampm: {
      type: 'select',
      default: 'PM',
      options: ['AM', 'PM'],
      label: 'Fixed ON AM/PM'
    },
    
    // OFF trigger settings (typically sunrise-based)
    off_enabled: {
      type: 'boolean',
      default: true,
      label: 'Sunrise Offset Enabled'
    },
    off_offset_hours: {
      type: 'number',
      default: 0,
      label: 'OFF Offset Hours'
    },
    off_offset_minutes: {
      type: 'number',
      default: 0,
      label: 'OFF Offset Minutes'
    },
    off_offset_direction: {
      type: 'select',
      default: 'Before',
      options: ['Before', 'After'],
      label: 'OFF Offset Direction'
    },
    
    // Fixed OFF time (overrides sunrise offset)
    fixed_stop_enabled: {
      type: 'boolean',
      default: true,
      label: 'Fixed OFF Time Enabled'
    },
    fixed_stop_hour: {
      type: 'number',
      default: 10,
      label: 'Fixed OFF Hour (1-12)'
    },
    fixed_stop_minute: {
      type: 'number',
      default: 30,
      label: 'Fixed OFF Minute (0-59)'
    },
    fixed_stop_ampm: {
      type: 'select',
      default: 'PM',
      options: ['AM', 'PM'],
      label: 'Fixed OFF AM/PM'
    },
    
    // Behavior
    pulseMode: {
      type: 'boolean',
      default: true,
      label: 'Pulse Mode',
      description: 'If true, outputs brief pulse at trigger time. If false, outputs continuous state.'
    },
    
    // API-fetched values (set by frontend/backend, not user-configurable)
    sunrise_time: {
      type: 'date',
      default: null,
      uiType: 'hidden',
      description: 'Fetched sunrise time from API'
    },
    sunset_time: {
      type: 'date',
      default: null,
      uiType: 'hidden',
      description: 'Fetched sunset time from API'
    }
  },

  // === INTERNAL STATE ===
  internalState: {
    next_on_date: null,
    next_off_date: null,
    currentState: false,
    lastOnTrigger: null,
    lastOffTrigger: null
  },

  // === HELPER: Convert 12h to 24h ===
  _to24Hour(hour12, ampm) {
    let h24 = hour12 % 12;
    if (ampm === 'PM') h24 += 12;
    return h24;
  },

  // === HELPER: Format time for output ===
  _formatTime(date) {
    if (!date) return '';
    const d = date instanceof Date ? date : new Date(date);
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${hours}:${minutes} ${ampm}`;
  },

  // === HELPER: Check if current time is within active range ===
  _isInRange(now, nextOn, nextOff, props) {
    // If everything is disabled, return false
    if (!props.on_enabled && !props.fixed_on_enabled && 
        !props.off_enabled && !props.fixed_stop_enabled) {
      return false;
    }

    // If fixed stop is enabled and we're past it, force off
    if (props.fixed_stop_enabled && nextOff && now >= nextOff) {
      return false;
    }

    // If only Off is enabled (no On), we're "on" until off time
    if (!props.on_enabled && !props.fixed_on_enabled && 
        (props.off_enabled || props.fixed_stop_enabled) && nextOff) {
      return now < nextOff;
    }

    if (!nextOn) return false;

    if (nextOff) {
      if (nextOn < nextOff) {
        // On before Off (e.g., On 8am, Off 5pm)
        return now >= nextOn && now < nextOff;
      } else {
        // On after Off (overnight span - On tonight, Off tomorrow morning)
        return now >= nextOn || now < nextOff;
      }
    }

    return now >= nextOn;
  },

  // === THE ACTUAL LOGIC ===
  /**
   * Execute function - calculates trigger times and current state
   * 
   * @param {Object} inputs - Input values (none for this node)
   * @param {Object} properties - Current property values including sunrise/sunset times
   * @param {Object} context - Runtime context with:
   *   - context.now() - current time as Date (or uses new Date() if not provided)
   * @param {Object} state - Internal state that persists across executions
   * @returns {Object} - Output values { state, startTime, endTime }
   */
  execute(inputs, properties, context, state) {
    // Get current time
    const now = context?.now ? context.now() : new Date();
    const nowMs = now.getTime();
    
    // Check if we have sunrise/sunset times
    if (!properties.sunrise_time || !properties.sunset_time) {
      // No API data yet - return defaults
      return {
        state: state.currentState || false,
        startTime: '',
        endTime: ''
      };
    }
    
    // Parse sunrise/sunset times and set to today's date
    const sunrise = new Date(properties.sunrise_time);
    const sunset = new Date(properties.sunset_time);
    
    // Set to today
    const todaySunrise = new Date(now);
    todaySunrise.setHours(sunrise.getHours(), sunrise.getMinutes(), sunrise.getSeconds(), 0);
    
    const todaySunset = new Date(now);
    todaySunset.setHours(sunset.getHours(), sunset.getMinutes(), sunset.getSeconds(), 0);
    
    // Calculate next ON time
    let nextOn = null;
    if (properties.fixed_on_enabled) {
      // Fixed time
      const h24 = this._to24Hour(properties.fixed_on_hour, properties.fixed_on_ampm);
      nextOn = new Date(now);
      nextOn.setHours(h24, properties.fixed_on_minute, 0, 0);
      // If past today, move to tomorrow
      while (nextOn.getTime() <= nowMs) {
        nextOn.setDate(nextOn.getDate() + 1);
      }
    } else if (properties.on_enabled) {
      // Sunset offset
      const offsetMs = (properties.on_offset_hours * 60 + properties.on_offset_minutes) * 60 * 1000;
      const sign = properties.on_offset_direction === 'After' ? 1 : -1;
      nextOn = new Date(todaySunset.getTime() + sign * offsetMs);
      // If past today, move to tomorrow
      while (nextOn.getTime() <= nowMs) {
        nextOn.setDate(nextOn.getDate() + 1);
      }
    }
    
    // Calculate next OFF time
    let nextOff = null;
    if (properties.fixed_stop_enabled) {
      // Fixed time
      const h24 = this._to24Hour(properties.fixed_stop_hour, properties.fixed_stop_ampm);
      nextOff = new Date(now);
      nextOff.setHours(h24, properties.fixed_stop_minute, 0, 0);
      // If past today, move to tomorrow
      while (nextOff.getTime() <= nowMs) {
        nextOff.setDate(nextOff.getDate() + 1);
      }
    } else if (properties.off_enabled) {
      // Sunrise offset
      const offsetMs = (properties.off_offset_hours * 60 + properties.off_offset_minutes) * 60 * 1000;
      const sign = properties.off_offset_direction === 'After' ? 1 : -1;
      nextOff = new Date(todaySunrise.getTime() + sign * offsetMs);
      // If past today, move to tomorrow
      while (nextOff.getTime() <= nowMs) {
        nextOff.setDate(nextOff.getDate() + 1);
      }
    }
    
    // Store calculated times in state
    state.next_on_date = nextOn;
    state.next_off_date = nextOff;
    
    // Determine current state
    let currentState = state.currentState || false;
    
    if (properties.pulseMode) {
      // Pulse mode: Check if we just hit an ON or OFF trigger
      // In pulse mode, we send a brief TRUE pulse at trigger time
      
      // Check if we just passed the ON trigger
      if (nextOn && state.lastOnTrigger) {
        const wasBeforeOn = state.lastOnTrigger < nextOn.getTime();
        const isNowPastOn = nowMs >= nextOn.getTime() && nowMs < nextOn.getTime() + 1000;
        if (wasBeforeOn && isNowPastOn) {
          currentState = true; // Pulse!
        }
      }
      
      // Check if we just passed the OFF trigger
      if (nextOff && state.lastOffTrigger) {
        const wasBeforeOff = state.lastOffTrigger < nextOff.getTime();
        const isNowPastOff = nowMs >= nextOff.getTime() && nowMs < nextOff.getTime() + 1000;
        if (wasBeforeOff && isNowPastOff) {
          currentState = true; // Pulse (same as ON in pulse mode)
        }
      }
      
      // Update last trigger times
      state.lastOnTrigger = nowMs;
      state.lastOffTrigger = nowMs;
      
    } else {
      // Continuous mode: Output TRUE while in range
      currentState = this._isInRange(nowMs, nextOn?.getTime(), nextOff?.getTime(), properties);
    }
    
    state.currentState = currentState;
    
    // Format output times
    const startTime = this._formatTime(nextOn);
    const endTime = this._formatTime(nextOff);
    
    return {
      state: currentState,
      startTime: startTime,
      endTime: endTime
    };
  },

  // === OPTIONAL: Validation ===
  validate(properties) {
    const errors = [];
    
    if (properties.latitude < -90 || properties.latitude > 90) {
      errors.push('Latitude must be between -90 and 90');
    }
    if (properties.longitude < -180 || properties.longitude > 180) {
      errors.push('Longitude must be between -180 and 180');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
};
