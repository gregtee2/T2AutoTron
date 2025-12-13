/**
 * TimeNodes.js - Backend implementations of time-based nodes
 * 
 * These are pure logic implementations without React/browser dependencies.
 * They can run in Node.js on the server.
 */

const registry = require('../BackendNodeRegistry');

/**
 * TimeOfDayNode - Outputs true when current time is within a specified range
 */
class TimeOfDayNode {
  constructor() {
    this.id = null;
    this.label = 'Time of Day';
    this.properties = {
      startTime: '08:00',
      endTime: '18:00',
      mode: 'state'  // 'state' (continuous) or 'pulse' (trigger once)
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
    
    const [startH, startM] = this.properties.startTime.split(':').map(Number);
    const [endH, endM] = this.properties.endTime.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    
    let inRange;
    if (startMinutes <= endMinutes) {
      // Normal range (e.g., 08:00 to 18:00)
      inRange = currentMinutes >= startMinutes && currentMinutes < endMinutes;
    } else {
      // Overnight range (e.g., 22:00 to 06:00)
      inRange = currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }

    // Handle pulse mode - only trigger on state change
    if (this.properties.mode === 'pulse') {
      const trigger = inRange && this.lastState !== true;
      this.lastState = inRange;
      return { active: trigger };
    }

    return { active: inRange };
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
