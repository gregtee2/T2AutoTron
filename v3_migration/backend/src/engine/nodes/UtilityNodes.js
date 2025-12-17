/**
 * UtilityNodes.js - Backend implementation of utility nodes
 * 
 * Counter, Random, State Machine, and other utility nodes.
 * Pure Node.js implementation - no React/browser dependencies.
 */

const registry = require('../BackendNodeRegistry');

/**
 * CounterNode - Counts trigger events
 */
class CounterNode {
  constructor() {
    this.id = null;
    this.label = 'Counter';
    this.properties = {
      count: 0,
      initial: 0,
      step: 1,
      threshold: 10,
      autoReset: false
    };
    this._lastTrigger = false;
    this._lastReset = false;
  }

  restore(data) {
    if (data.properties) {
      Object.assign(this.properties, data.properties);
    }
  }

  data(inputs) {
    const trigger = inputs.trigger?.[0];
    const reset = inputs.reset?.[0];
    
    // Handle reset
    if (reset && !this._lastReset) {
      this.properties.count = this.properties.initial;
    }
    this._lastReset = !!reset;
    
    // Handle trigger (edge detection)
    let thresholdReached = false;
    if (trigger && !this._lastTrigger) {
      this.properties.count += this.properties.step;
      
      // Check threshold
      if (this.properties.count >= this.properties.threshold) {
        thresholdReached = true;
        if (this.properties.autoReset) {
          this.properties.count = this.properties.initial;
        }
      }
    }
    this._lastTrigger = !!trigger;
    
    return {
      count: this.properties.count,
      threshold: thresholdReached
    };
  }
}

/**
 * RandomNode - Generates random numbers
 */
class RandomNode {
  constructor() {
    this.id = null;
    this.label = 'Random';
    this.properties = {
      min: 0,
      max: 100,
      integer: true,
      continuous: false,
      currentValue: null
    };
    this._lastTrigger = false;
  }

  restore(data) {
    if (data.properties) {
      Object.assign(this.properties, data.properties);
    }
  }

  _generate() {
    const { min, max, integer } = this.properties;
    let value = min + Math.random() * (max - min);
    if (integer) {
      value = Math.round(value);
    }
    this.properties.currentValue = value;
    return value;
  }

  data(inputs) {
    const trigger = inputs.trigger?.[0];
    
    // Generate new value on trigger edge or in continuous mode
    if (this.properties.continuous || (trigger && !this._lastTrigger)) {
      this._generate();
    }
    this._lastTrigger = !!trigger;
    
    // First run - generate initial value
    if (this.properties.currentValue === null) {
      this._generate();
    }
    
    const value = this.properties.currentValue;
    const { min, max } = this.properties;
    const normalized = max > min ? (value - min) / (max - min) : 0;
    
    return {
      value,
      normalized
    };
  }
}

/**
 * StateMachineNode - Named states with transitions
 */
class StateMachineNode {
  constructor() {
    this.id = null;
    this.label = 'State Machine';
    this.properties = {
      states: 'idle,armed,triggered,cooldown',
      transitions: 'idle→armed:true\narmed→triggered:true\ntriggered→cooldown:true\ncooldown→idle:true',
      currentState: 'idle',
      previousState: null
    };
    this._lastTrigger = false;
    this._lastReset = false;
  }

  restore(data) {
    if (data.properties) {
      Object.assign(this.properties, data.properties);
    }
  }

  _getStates() {
    return this.properties.states.split(',').map(s => s.trim()).filter(s => s);
  }

  _parseTransitions() {
    const lines = this.properties.transitions.split('\n');
    const transitions = [];
    
    for (const line of lines) {
      const match = line.match(/(\w+)→(\w+):?(\w*)/);
      if (match) {
        transitions.push({
          from: match[1],
          to: match[2],
          condition: match[3] || 'true'
        });
      }
    }
    
    return transitions;
  }

  data(inputs) {
    const trigger = inputs.trigger?.[0];
    const reset = inputs.reset?.[0];
    const setState = inputs.setState?.[0];
    
    const states = this._getStates();
    let changed = false;
    
    // Handle reset
    if (reset && !this._lastReset) {
      this.properties.previousState = this.properties.currentState;
      this.properties.currentState = states[0] || 'idle';
      changed = this.properties.previousState !== this.properties.currentState;
    }
    this._lastReset = !!reset;
    
    // Handle direct setState
    if (setState && typeof setState === 'string' && states.includes(setState)) {
      if (this.properties.currentState !== setState) {
        this.properties.previousState = this.properties.currentState;
        this.properties.currentState = setState;
        changed = true;
      }
    }
    
    // Handle trigger-based transitions (edge detection)
    if (trigger && !this._lastTrigger && !reset && !setState) {
      const transitions = this._parseTransitions();
      const currentTransitions = transitions.filter(t => t.from === this.properties.currentState);
      
      for (const t of currentTransitions) {
        // Evaluate condition
        let shouldTransition = false;
        if (t.condition === 'true' || t.condition === '') {
          shouldTransition = true;
        } else if (t.condition === 'false') {
          shouldTransition = false;
        }
        // Could add more complex condition evaluation here
        
        if (shouldTransition) {
          this.properties.previousState = this.properties.currentState;
          this.properties.currentState = t.to;
          changed = true;
          break;
        }
      }
    }
    this._lastTrigger = !!trigger;
    
    const stateIndex = states.indexOf(this.properties.currentState);
    
    return {
      state: this.properties.currentState,
      stateIndex: stateIndex >= 0 ? stateIndex : 0,
      changed
    };
  }
}

/**
 * SwitchRouterNode - Route input to one of multiple outputs based on condition
 */
class SwitchRouterNode {
  constructor() {
    this.id = null;
    this.label = 'Switch Router';
    this.properties = {
      mode: 'value',  // 'value', 'index', 'condition'
      routes: 4
    };
  }

  restore(data) {
    if (data.properties) {
      Object.assign(this.properties, data.properties);
    }
  }

  data(inputs) {
    const input = inputs.input?.[0];
    const selector = inputs.selector?.[0] ?? 0;
    
    const outputs = {};
    const numRoutes = this.properties.routes || 4;
    
    // Initialize all outputs to null
    for (let i = 0; i < numRoutes; i++) {
      outputs[`out${i + 1}`] = null;
    }
    
    // Route based on selector
    const routeIndex = Math.floor(Number(selector)) % numRoutes;
    if (routeIndex >= 0 && routeIndex < numRoutes) {
      outputs[`out${routeIndex + 1}`] = input;
    }
    
    return outputs;
  }
}

/**
 * HysteresisNode - Schmitt trigger / thermostat-style logic
 */
class HysteresisNode {
  constructor() {
    this.id = null;
    this.label = 'Hysteresis';
    this.properties = {
      high: 75,
      low: 65,
      inverted: false
    };
    this._state = false;
  }

  restore(data) {
    if (data.properties) {
      Object.assign(this.properties, data.properties);
    }
  }

  data(inputs) {
    const value = inputs.value?.[0] ?? 0;
    const { high, low, inverted } = this.properties;
    
    // Schmitt trigger logic
    if (this._state) {
      // Currently ON - turn off when below low threshold
      if (value < low) {
        this._state = false;
      }
    } else {
      // Currently OFF - turn on when above high threshold
      if (value > high) {
        this._state = true;
      }
    }
    
    const output = inverted ? !this._state : this._state;
    
    return {
      output,
      state: this._state,
      inRange: value >= low && value <= high
    };
  }
}

/**
 * ChangeNode - Detect value changes
 */
class ChangeNode {
  constructor() {
    this.id = null;
    this.label = 'Change';
    this.properties = {
      threshold: 0,  // Minimum change to trigger
      mode: 'any'    // 'any', 'increase', 'decrease'
    };
    this._lastValue = null;
  }

  restore(data) {
    if (data.properties) {
      Object.assign(this.properties, data.properties);
    }
  }

  data(inputs) {
    const value = inputs.value?.[0];
    const { threshold, mode } = this.properties;
    
    let changed = false;
    let delta = 0;
    
    if (this._lastValue !== null && value !== undefined) {
      delta = value - this._lastValue;
      const absDelta = Math.abs(delta);
      
      if (absDelta > threshold) {
        switch (mode) {
          case 'increase':
            changed = delta > 0;
            break;
          case 'decrease':
            changed = delta < 0;
            break;
          default:
            changed = true;
        }
      }
    }
    
    this._lastValue = value;
    
    return {
      changed,
      delta,
      value
    };
  }
}

/**
 * FilterNode - Pass-through filter based on conditions
 */
class FilterNode {
  constructor() {
    this.id = null;
    this.label = 'Filter';
    this.properties = {
      mode: 'truthy',  // 'truthy', 'falsy', 'equals', 'range'
      compareValue: 0,
      rangeMin: 0,
      rangeMax: 100
    };
  }

  restore(data) {
    if (data.properties) {
      Object.assign(this.properties, data.properties);
    }
  }

  data(inputs) {
    const value = inputs.value?.[0];
    const { mode, compareValue, rangeMin, rangeMax } = this.properties;
    
    let pass = false;
    
    switch (mode) {
      case 'truthy':
        pass = !!value;
        break;
      case 'falsy':
        pass = !value;
        break;
      case 'equals':
        pass = value === compareValue;
        break;
      case 'range':
        pass = value >= rangeMin && value <= rangeMax;
        break;
    }
    
    return {
      output: pass ? value : null,
      pass,
      blocked: !pass
    };
  }
}

/**
 * SmoothNode - Smooth/average values over time
 */
class SmoothNode {
  constructor() {
    this.id = null;
    this.label = 'Smooth';
    this.properties = {
      samples: 10,
      mode: 'average'  // 'average', 'ema' (exponential moving average)
    };
    this._history = [];
  }

  restore(data) {
    if (data.properties) {
      Object.assign(this.properties, data.properties);
    }
  }

  data(inputs) {
    const value = inputs.value?.[0];
    const { samples, mode } = this.properties;
    
    if (value !== undefined && value !== null) {
      this._history.push(value);
      if (this._history.length > samples) {
        this._history.shift();
      }
    }
    
    if (this._history.length === 0) {
      return { output: 0, raw: value };
    }
    
    let output;
    if (mode === 'ema' && this._history.length > 1) {
      // Exponential moving average
      const alpha = 2 / (samples + 1);
      output = this._history.reduce((acc, val, i) => {
        if (i === 0) return val;
        return alpha * val + (1 - alpha) * acc;
      });
    } else {
      // Simple moving average
      output = this._history.reduce((a, b) => a + b, 0) / this._history.length;
    }
    
    return {
      output,
      raw: value
    };
  }
}

/**
 * CombineNode - Combine multiple inputs into one output
 */
class CombineNode {
  constructor() {
    this.id = null;
    this.label = 'Combine';
    this.properties = {
      mode: 'first'  // 'first', 'last', 'sum', 'average', 'min', 'max', 'array'
    };
  }

  restore(data) {
    if (data.properties) {
      Object.assign(this.properties, data.properties);
    }
  }

  data(inputs) {
    // Collect all input values
    const values = [];
    for (const key of Object.keys(inputs)) {
      const inputArray = inputs[key];
      if (Array.isArray(inputArray)) {
        values.push(...inputArray.filter(v => v !== undefined && v !== null));
      }
    }
    
    if (values.length === 0) {
      return { output: null };
    }
    
    const numericValues = values.filter(v => typeof v === 'number');
    
    let output;
    switch (this.properties.mode) {
      case 'first':
        output = values[0];
        break;
      case 'last':
        output = values[values.length - 1];
        break;
      case 'sum':
        output = numericValues.reduce((a, b) => a + b, 0);
        break;
      case 'average':
        output = numericValues.length > 0 
          ? numericValues.reduce((a, b) => a + b, 0) / numericValues.length 
          : 0;
        break;
      case 'min':
        output = numericValues.length > 0 ? Math.min(...numericValues) : 0;
        break;
      case 'max':
        output = numericValues.length > 0 ? Math.max(...numericValues) : 0;
        break;
      case 'array':
        output = values;
        break;
      default:
        output = values[0];
    }
    
    return { output };
  }
}

/**
 * SplineCurveNode - Maps input through a spline curve
 * 
 * Takes a 0-1 input value and maps it through an editable curve,
 * useful for non-linear brightness curves, easing, etc.
 */
class SplineCurveNode {
  constructor() {
    this.id = null;
    this.label = 'Spline Curve';
    this.properties = {
      points: [
        { x: 0, y: 0 },
        { x: 0.25, y: 0.25 },
        { x: 0.75, y: 0.75 },
        { x: 1, y: 1 }
      ],
      interpolation: 'catmull-rom',  // 'linear', 'step', 'catmull-rom', 'bezier'
      inputMin: 0,
      inputMax: 1,
      outputMin: 0,
      outputMax: 1,
      lastInput: 0,
      lastOutput: 0
    };
  }

  restore(data) {
    if (data.properties) {
      Object.assign(this.properties, data.properties);
    }
  }

  /**
   * Evaluate the spline at position x (0-1)
   */
  _evaluate(x) {
    const { points, interpolation } = this.properties;
    if (!points || points.length < 2) return x;
    
    // Clamp x to 0-1
    x = Math.max(0, Math.min(1, x));
    
    // Find segment
    let segIdx = 0;
    for (let i = 0; i < points.length - 1; i++) {
      if (x >= points[i].x && x <= points[i + 1].x) {
        segIdx = i;
        break;
      }
      if (x > points[i].x) segIdx = i;
    }
    
    const p1 = points[segIdx];
    const p2 = points[Math.min(segIdx + 1, points.length - 1)];
    
    const segmentWidth = p2.x - p1.x;
    if (segmentWidth === 0) return p1.y;
    
    const t = (x - p1.x) / segmentWidth;
    
    switch (interpolation) {
      case 'linear':
        return p1.y + (p2.y - p1.y) * t;
      case 'step':
        return t < 0.5 ? p1.y : p2.y;
      case 'catmull-rom':
      default:
        // Catmull-Rom spline interpolation
        const p0 = points[Math.max(0, segIdx - 1)];
        const p3 = points[Math.min(points.length - 1, segIdx + 2)];
        const t2 = t * t;
        const t3 = t2 * t;
        return 0.5 * (
          (2 * p1.y) +
          (-p0.y + p2.y) * t +
          (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
          (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
        );
    }
  }

  data(inputs) {
    // Get input value
    let inputValue = inputs.value?.[0] ?? 0;
    
    // Normalize to 0-1 range
    const { inputMin, inputMax, outputMin, outputMax } = this.properties;
    const normalizedInput = (inputValue - inputMin) / (inputMax - inputMin);
    const clampedInput = Math.max(0, Math.min(1, normalizedInput));
    
    // Evaluate curve
    const curveOutput = this._evaluate(clampedInput);
    
    // Scale to output range
    const output = outputMin + curveOutput * (outputMax - outputMin);
    
    // Store for reference
    this.properties.lastInput = inputValue;
    this.properties.lastOutput = output;
    
    return { output };
  }
}

/**
 * WatchdogNode - Alert when no input received within timeout period
 * 
 * Monitors an input and triggers alert if nothing received within timeout.
 * Useful for detecting device disconnections or stale data.
 */
class WatchdogNode {
  constructor() {
    this.id = null;
    this.label = 'Watchdog';
    this.properties = {
      timeout: 60,         // seconds
      mode: 'alert',       // 'alert' = fire once, 'repeat' = continuous
      lastInputTime: null,
      isTimedOut: false,
      alertFired: false
    };
  }

  restore(data) {
    if (data.properties) {
      Object.assign(this.properties, data.properties);
    }
  }

  data(inputs) {
    const inputVal = inputs.input?.[0];
    const resetVal = inputs.reset?.[0];
    const now = Date.now();

    // Handle reset
    if (resetVal === true) {
      this.properties.isTimedOut = false;
      this.properties.alertFired = false;
      this.properties.lastInputTime = now;
      return { alert: false, lastSeen: 0, passthrough: null };
    }

    // Handle input received
    if (inputVal !== undefined) {
      this.properties.lastInputTime = now;
      this.properties.isTimedOut = false;
      this.properties.alertFired = false;
      return { alert: false, lastSeen: 0, passthrough: inputVal };
    }

    // Check for timeout
    if (this.properties.lastInputTime) {
      const elapsed = (now - this.properties.lastInputTime) / 1000;
      const timedOut = elapsed >= this.properties.timeout;

      if (timedOut) {
        this.properties.isTimedOut = true;
        
        // In 'alert' mode, only fire once
        if (this.properties.mode === 'alert') {
          if (!this.properties.alertFired) {
            this.properties.alertFired = true;
            return { alert: true, lastSeen: elapsed, passthrough: null };
          }
          return { alert: false, lastSeen: elapsed, passthrough: null };
        }
        
        // In 'repeat' mode, keep firing
        return { alert: true, lastSeen: elapsed, passthrough: null };
      }

      return { alert: false, lastSeen: elapsed, passthrough: null };
    }

    // No input ever received
    return { alert: false, lastSeen: 0, passthrough: null };
  }
}

// Register all nodes
registry.register('CounterNode', CounterNode);
registry.register('RandomNode', RandomNode);
registry.register('StateMachineNode', StateMachineNode);
registry.register('SwitchRouterNode', SwitchRouterNode);
registry.register('HysteresisNode', HysteresisNode);
registry.register('ChangeNode', ChangeNode);
registry.register('FilterNode', FilterNode);
registry.register('SmoothNode', SmoothNode);
registry.register('CombineNode', CombineNode);
registry.register('SplineCurveNode', SplineCurveNode);
registry.register('WatchdogNode', WatchdogNode);

module.exports = {
  CounterNode,
  RandomNode,
  StateMachineNode,
  SwitchRouterNode,
  HysteresisNode,
  ChangeNode,
  FilterNode,
  SmoothNode,
  CombineNode,
  SplineCurveNode,
  WatchdogNode
};
