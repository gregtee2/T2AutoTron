/**
 * TimeNodes.js - Backend implementations of time-based nodes
 * 
 * These are pure logic implementations without React/browser dependencies.
 * They can run in Node.js on the server.
 */

const registry = require('../BackendNodeRegistry');

/**
 * Convert frontend time format (hour, minute, ampm) to 24h minutes
 */
function timeToMinutes(hour, minute, ampm) {
  let h = parseInt(hour) || 0;
  const m = parseInt(minute) || 0;
  
  // Handle AM/PM conversion
  if (ampm === 'PM' && h !== 12) {
    h += 12;
  } else if (ampm === 'AM' && h === 12) {
    h = 0;
  }
  
  return h * 60 + m;
}

/**
 * Parse time string "HH:MM" to minutes
 */
function parseTimeString(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Convert minutes since midnight to "HH:MM" format
 */
function formatMinutesToTime(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * TimeOfDayNode - Outputs true when current time is within a specified range
 * 
 * Frontend saves: start_hour, start_minute, start_ampm, stop_hour, stop_minute, stop_ampm
 * Also supports: startTime, endTime in "HH:MM" format
 * 
 * IMPORTANT: start_enabled and stop_enabled control behavior:
 * - Both enabled: Normal range (ON from start to stop)
 * - Only stop_enabled: Always ON until stop time (used for "off at X" triggers)
 * - Only start_enabled: ON from start, never auto-off
 * - Neither enabled: Always returns current saved state
 */
class TimeOfDayNode {
  constructor() {
    this.id = null;
    this.label = 'Time of Day';
    this.properties = {
      // Frontend format
      start_hour: 8,
      start_minute: 0,
      start_ampm: 'AM',
      start_enabled: true,
      stop_hour: 6,
      stop_minute: 0,
      stop_ampm: 'PM',
      stop_enabled: true,
      // Alternative format
      startTime: null,
      endTime: null,
      // State
      mode: 'state',
      pulseMode: false,
      currentState: false
    };
    this.lastState = null;
    this.lastStateChangeTime = null;  // Track when state last changed
  }

  restore(data) {
    if (data.properties) {
      Object.assign(this.properties, data.properties);
    }
  }

  data(inputs) {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    
    const startEnabled = this.properties.start_enabled !== false;  // Default true
    const stopEnabled = this.properties.stop_enabled !== false;    // Default true
    
    // Get start/end times
    let startMinutes, endMinutes;
    
    if (this.properties.start_hour !== undefined) {
      startMinutes = timeToMinutes(
        this.properties.start_hour,
        this.properties.start_minute,
        this.properties.start_ampm
      );
      endMinutes = timeToMinutes(
        this.properties.stop_hour,
        this.properties.stop_minute,
        this.properties.stop_ampm
      );
    } else if (this.properties.startTime) {
      startMinutes = parseTimeString(this.properties.startTime);
      endMinutes = parseTimeString(this.properties.endTime);
    } else {
      startMinutes = 8 * 60;
      endMinutes = 18 * 60;
    }
    
    let inRange;
    
    // Handle different enabled combinations
    if (!startEnabled && !stopEnabled) {
      // Neither enabled - return saved currentState (no automatic changes)
      inRange = this.properties.currentState || false;
    } else if (!startEnabled && stopEnabled) {
      // Only stop enabled: "Always ON until stop time"
      // This is used for triggers like "10pm Off" - always true UNTIL stop time hits
      // After stop time, stays false until next day's stop time passes
      inRange = currentMinutes < endMinutes || currentMinutes >= endMinutes + 60;
      // Actually simpler: we're ON unless we've passed the stop time today
      // But we need to track state across days...
      // 
      // Better approach: ON until stop time, then OFF until midnight, then ON again
      // For "10pm Off" (stop at 22:30): 
      //   - 0:00-22:30 = ON (before stop)
      //   - 22:30-23:59 = OFF (after stop)
      inRange = currentMinutes < endMinutes;
    } else if (startEnabled && !stopEnabled) {
      // Only start enabled: "ON from start time, never auto-off"
      // Once past start time today, stays on
      inRange = currentMinutes >= startMinutes;
    } else {
      // Both enabled: Normal range check
      if (startMinutes <= endMinutes) {
        // Normal range (e.g., 08:00 to 18:00)
        inRange = currentMinutes >= startMinutes && currentMinutes < endMinutes;
      } else {
        // Overnight range (e.g., 22:00 to 06:00)
        inRange = currentMinutes >= startMinutes || currentMinutes < endMinutes;
      }
    }

    // Handle pulse mode - only trigger on state change
    if (this.properties.pulseMode || this.properties.mode === 'pulse') {
      const trigger = inRange && this.lastState !== true;
      this.lastState = inRange;
      return { 
        state: trigger, 
        active: trigger,
        startTime: formatMinutesToTime(startMinutes),
        endTime: formatMinutesToTime(endMinutes)
      };
    }

    // Track state changes for debugging
    if (inRange !== this.lastState) {
      this.lastStateChangeTime = now;
    }
    
    this.lastState = inRange;
    this.properties.currentState = inRange;  // Keep in sync
    
    // Return startTime and endTime outputs for downstream nodes like SplineTimelineColor
    return { 
      state: inRange, 
      active: inRange,
      startTime: formatMinutesToTime(startMinutes),
      endTime: formatMinutesToTime(endMinutes)
    };
  }
}

/**
 * TimeRangeNode - Continuous time range check
 */
class TimeRangeNode {
  constructor() {
    this.id = null;
    this.label = 'Time Range';
    this.properties = {
      startTime: '00:00',
      endTime: '23:59'
    };
  }

  restore(data) {
    if (data.properties) {
      Object.assign(this.properties, data.properties);
    }
  }

  data(inputs) {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    
    const [startH, startM] = this.properties.startTime.split(':').map(Number);
    const [endH, endM] = this.properties.endTime.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    
    let inRange;
    if (startMinutes <= endMinutes) {
      inRange = currentMinutes >= startMinutes && currentMinutes < endMinutes;
    } else {
      inRange = currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }

    return { 
      active: inRange,
      progress: this.calculateProgress(currentMinutes, startMinutes, endMinutes)
    };
  }

  calculateProgress(current, start, end) {
    if (start <= end) {
      if (current < start) return 0;
      if (current >= end) return 1;
      return (current - start) / (end - start);
    } else {
      // Overnight range
      const totalMinutes = (24 * 60 - start) + end;
      if (current >= start) {
        return (current - start) / totalMinutes;
      } else if (current < end) {
        return ((24 * 60 - start) + current) / totalMinutes;
      }
      return 0;
    }
  }
}

// Register nodes
registry.register('TimeOfDayNode', TimeOfDayNode);
registry.register('TimeRangeNode', TimeRangeNode);

module.exports = { TimeOfDayNode, TimeRangeNode };
