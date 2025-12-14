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
 * TimeOfDayNode - Outputs true when current time is within a specified range
 * 
 * Frontend saves: start_hour, start_minute, start_ampm, stop_hour, stop_minute, stop_ampm
 * Also supports: startTime, endTime in "HH:MM" format
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
      stop_hour: 6,
      stop_minute: 0,
      stop_ampm: 'PM',
      // Alternative format
      startTime: null,
      endTime: null,
      // State
      mode: 'state',
      pulseMode: true
    };
    this.lastState = null;
  }

  restore(data) {
    if (data.properties) {
      Object.assign(this.properties, data.properties);
    }
  }

  data(inputs) {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    
    // Get start/end times - support both formats
    let startMinutes, endMinutes;
    
    if (this.properties.start_hour !== undefined) {
      // Frontend format: hour, minute, ampm
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
      // Simple format: "HH:MM"
      startMinutes = parseTimeString(this.properties.startTime);
      endMinutes = parseTimeString(this.properties.endTime);
    } else {
      // Defaults
      startMinutes = 8 * 60;  // 8:00 AM
      endMinutes = 18 * 60;   // 6:00 PM
    }
    
    let inRange;
    if (startMinutes <= endMinutes) {
      // Normal range (e.g., 08:00 to 18:00)
      inRange = currentMinutes >= startMinutes && currentMinutes < endMinutes;
    } else {
      // Overnight range (e.g., 22:00 to 06:00)
      inRange = currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }

    // Handle pulse mode - only trigger on state change
    if (this.properties.pulseMode || this.properties.mode === 'pulse') {
      const trigger = inRange && this.lastState !== true;
      this.lastState = inRange;
      return { state: trigger, active: trigger };
    }

    this.lastState = inRange;
    return { state: inRange, active: inRange };
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
