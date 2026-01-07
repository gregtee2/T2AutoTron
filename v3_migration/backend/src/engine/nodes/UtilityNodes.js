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
 * StateMachineNode - Named states with transitions and per-state timers
 * States format: "idle,armed,triggered:120,cooldown:30" (name:seconds for auto-advance)
 * Transitions format: "state1→state2:condition" where condition can be 'true', 'false', 'timeout', or 'any'
 */
class StateMachineNode {
  constructor() {
    this.id = null;
    this.label = 'State Machine';
    this.properties = {
      states: 'idle,armed,triggered:10,cooldown:5',
      transitions: 'idle→armed:true\narmed→triggered:true\ntriggered→cooldown:timeout\ncooldown→idle:timeout',
      currentState: 'idle',
      previousState: null,
      stateEnteredAt: null
    };
    this._lastTrigger = false;
    this._lastReset = false;
    this.remainingSeconds = 0;
  }

  restore(data) {
    if (data.properties) {
      Object.assign(this.properties, data.properties);
    }
    if (!this.properties.stateEnteredAt) {
      this.properties.stateEnteredAt = Date.now();
    }
  }

  // Parse states with optional timers: "idle,armed,triggered:120,cooldown:30"
  _parseStates() {
    const stateConfigs = [];
    const parts = this.properties.states.split(',').map(s => s.trim()).filter(Boolean);
    
    for (const part of parts) {
      const match = part.match(/^(\w+)(?::(\d+))?$/);
      if (match) {
        stateConfigs.push({
          name: match[1],
          timer: match[2] ? parseInt(match[2], 10) : null
        });
      }
    }
    return stateConfigs;
  }

  _getStateNames() {
    return this._parseStates().map(s => s.name);
  }

  _getStateTimer(stateName) {
    const states = this._parseStates();
    const state = states.find(s => s.name === stateName);
    return state?.timer || null;
  }

  _parseTransitions() {
    const lines = this.properties.transitions.split('\n');
    const transitions = [];
    
    for (const line of lines) {
      const match = line.match(/(\w+)(?:→|->)(\w+):?(\w*)/);
      if (match) {
        transitions.push({
          from: match[1],
          to: match[2],
          condition: match[3] || 'any'
        });
      }
    }
    
    return transitions;
  }

  _transitionTo(newState, reason) {
    const states = this._getStateNames();
    if (!states.includes(newState)) return false;
    
    const previousState = this.properties.currentState;
    if (previousState === newState) return false;
    
    this.properties.previousState = previousState;
    this.properties.currentState = newState;
    this.properties.stateEnteredAt = Date.now();
    
    const timer = this._getStateTimer(newState);
    this.remainingSeconds = timer || 0;
    
    console.log(`[StateMachine ${this.id?.slice(-6) || '???'}] ${previousState} → ${newState} (${reason})${timer ? `, timer: ${timer}s` : ''}`);
    
    return true;
  }

  _checkTimeout() {
    const currentState = this.properties.currentState;
    const timer = this._getStateTimer(currentState);
    
    if (!timer || !this.properties.stateEnteredAt) return false;
    
    const elapsed = (Date.now() - this.properties.stateEnteredAt) / 1000;
    this.remainingSeconds = Math.max(0, Math.ceil(timer - elapsed));
    
    if (elapsed >= timer) {
      // Find timeout transition
      const transitions = this._parseTransitions();
      for (const trans of transitions) {
        if (trans.from === currentState && trans.condition === 'timeout') {
          return this._transitionTo(trans.to, 'timeout');
        }
      }
    }
    return false;
  }

  data(inputs) {
    const trigger = inputs.trigger?.[0];
    const reset = inputs.reset?.[0];
    const setState = inputs.setState?.[0];
    
    const states = this._getStateNames();
    let changed = false;
    
    // Handle reset
    if (reset && !this._lastReset) {
      changed = this._transitionTo(states[0] || 'idle', 'reset');
    }
    this._lastReset = !!reset;
    
    // Handle direct setState
    if (setState && typeof setState === 'string' && states.includes(setState)) {
      if (this.properties.currentState !== setState) {
        changed = this._transitionTo(setState, 'setState');
      }
    }
    
    // Check for timeout transition first
    if (this._checkTimeout()) {
      changed = true;
    }
    
    // Handle trigger-based transitions (edge detection)
    if (trigger && !this._lastTrigger && !reset && !setState && !changed) {
      const transitions = this._parseTransitions();
      const currentTransitions = transitions.filter(t => 
        t.from === this.properties.currentState && t.condition !== 'timeout'
      );
      
      for (const t of currentTransitions) {
        // Evaluate condition
        let shouldTransition = false;
        if (t.condition === 'true' || t.condition === '' || t.condition === 'any') {
          shouldTransition = true;
        } else if (t.condition === 'false') {
          shouldTransition = false;
        }
        
        if (shouldTransition) {
          changed = this._transitionTo(t.to, `trigger=${trigger}`);
          break;
        }
      }
    }
    this._lastTrigger = !!trigger;
    
    const stateIndex = states.indexOf(this.properties.currentState);
    const currentState = this.properties.currentState;
    
    // Build output with state-specific booleans
    const output = {
      state: currentState,
      stateIndex: stateIndex >= 0 ? stateIndex : 0,
      changed,
      remaining: this.remainingSeconds
    };
    
    // Add is_<stateName> outputs for each state
    for (const state of states) {
      output[`is_${state}`] = (currentState === state);
    }
    
    return output;
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

/**
 * TextStringNode - Outputs a text string with optional trigger gating
 * 
 * Inputs:
 *   - trigger: (Optional) When connected, text only outputs when trigger is TRUE
 * 
 * Outputs:
 *   - text: The configured text string (or undefined if trigger is FALSE)
 * 
 * Behavior:
 *   - No trigger connected: Always outputs the text (backwards compatible)
 *   - Trigger connected + TRUE: Outputs the text
 *   - Trigger connected + FALSE/undefined: Outputs undefined
 */
class TextStringNode {
  constructor(id, properties = {}) {
    this.id = id;
    this.type = 'TextStringNode';
    this.properties = {
      text: properties.text || ''
    };
    this.inputs = { trigger: undefined };
    this.outputs = { text: '' };
    this.hasReceivedTrigger = false;
  }

  setInput(name, value) {
    if (name === 'trigger') {
      this.inputs.trigger = value;
      this.hasReceivedTrigger = true;
    }
  }

  process() {
    // If trigger input has been connected, only output when TRUE
    if (this.hasReceivedTrigger && this.inputs.trigger !== undefined) {
      const isTriggered = this.inputs.trigger === true;
      if (isTriggered) {
        this.outputs.text = this.properties.text || '';
      } else {
        this.outputs.text = undefined;
      }
    } else {
      // No trigger connected - always output (backwards compatible)
      this.outputs.text = this.properties.text || '';
    }
    
    return this.outputs;
  }
}

/**
 * StringConcatNode - Concatenates multiple strings with separator
 */
class StringConcatNode {
  constructor(id, properties = {}) {
    this.id = id;
    this.type = 'StringConcatNode';
    this.properties = {
      separator: properties.separator ?? ' ',
      prefix: properties.prefix || '',
      suffix: properties.suffix || '',
      skipEmpty: properties.skipEmpty !== false
    };
    this.inputs = { string1: null, string2: null, string3: null, string4: null };
    this.outputs = { result: '' };
  }

  setInput(name, value) {
    if (name in this.inputs) {
      this.inputs[name] = value;
    }
  }

  process() {
    const { separator, prefix, suffix, skipEmpty } = this.properties;
    
    // Collect all input strings
    const strings = [];
    for (let i = 1; i <= 4; i++) {
      const input = this.inputs[`string${i}`];
      if (input !== undefined && input !== null) {
        const str = String(input);
        if (!skipEmpty || str.trim() !== '') {
          strings.push(str);
        }
      }
    }

    // Concatenate with separator, add prefix/suffix
    const joined = strings.join(separator);
    this.outputs.result = prefix + joined + suffix;
    
    return this.outputs;
  }
}

/**
 * UpcomingEventsNode (Event Announcer) - Triggers announcement before scheduled events
 * Also accepts ad-hoc messages via input that jump ahead of scheduled events
 */
class UpcomingEventsNode {
  constructor(id, properties = {}) {
    this.id = id;
    this.type = 'UpcomingEventsNode';
    this.properties = {
      leadTime: properties.leadTime || 5,  // Seconds before event to announce
      template: properties.template || 'action'  // 'action' or 'passive'
    };
    this.inputs = { message: undefined };  // Ad-hoc message input
    this.outputs = { trigger: false, messageOut: '', event: null };
    this._announcedEvents = {};  // Track announced events
    this._triggerPulse = false;  // For pulse behavior
    this._lastAdHocMessage = '';  // For tracking last message
    this._previousAdHocInput = undefined;  // For rising-edge detection
    this._adHocCooldownUntil = 0;  // Timestamp when cooldown ends
    this._isAdHocActive = false;  // True when ad-hoc message is active
  }

  setInput(name, value) {
    if (name === 'message') {
      this.inputs.message = value;
    }
  }

  // Generate unique key for an event
  getEventKey(event) {
    return `${event.deviceName || event.nodeId}_${event.action}_${new Date(event.time).getTime()}`;
  }

  // Generate announcement message
  generateMessage(event, template) {
    const deviceName = event.deviceName || event.label || 'Unknown device';
    const action = event.action || 'activate';
    
    let actionWord;
    if (action === 'on') {
      actionWord = template === 'action' ? 'Turning on' : 'is turning on';
    } else if (action === 'off') {
      actionWord = template === 'action' ? 'Turning off' : 'is turning off';
    } else {
      actionWord = template === 'action' ? action : `is ${action}`;
    }
    
    return template === 'action' 
      ? `${actionWord} ${deviceName}` 
      : `${deviceName} ${actionWord}`;
  }

  process() {
    const now = Date.now();
    
    // Reset trigger after one tick (pulse behavior)
    if (this._triggerPulse) {
      this._triggerPulse = false;
      this.outputs.trigger = false;
    }

    // Check for ad-hoc message first (priority) - using rising-edge detection
    const adHocMsg = this.inputs.message;
    const prevInput = this._previousAdHocInput;
    this._previousAdHocInput = adHocMsg;  // Track for next tick
    
    if (adHocMsg && typeof adHocMsg === 'string' && adHocMsg.trim() !== '') {
      // Detect RISING EDGE: previous was empty/undefined, now has value
      const wasEmpty = !prevInput || prevInput === undefined || prevInput === '';
      
      if (wasEmpty) {
        // Rising edge detected! Trigger the ad-hoc message
        this._lastAdHocMessage = adHocMsg;
        this.outputs.messageOut = adHocMsg;
        this.outputs.event = null;
        this.outputs.trigger = true;
        this._triggerPulse = true;
        this._adHocCooldownUntil = now + 3000;  // 3 second cooldown
        this._isAdHocActive = true;
        return this.outputs;
      }
    }
    
    // If in cooldown from ad-hoc, skip scheduled events
    if (now < this._adHocCooldownUntil) {
      return this.outputs;
    }
    this._isAdHocActive = false;  // Cooldown over

    // Get events from engine's scheduled events registry
    const engine = global.backendEngine;
    if (!engine || typeof engine.getUpcomingEvents !== 'function') {
      return this.outputs;
    }

    const events = engine.getUpcomingEvents() || [];
    const leadMs = this.properties.leadTime * 1000;

    // Find events within announcement window
    for (const event of events) {
      if (!event.time) continue;
      
      const eventTime = new Date(event.time).getTime();
      const timeUntil = eventTime - now;
      
      // Is this event within our lead time window?
      if (timeUntil > 0 && timeUntil <= leadMs) {
        const key = this.getEventKey(event);
        
        // Haven't announced this one yet?
        if (!this._announcedEvents[key]) {
          this._announcedEvents[key] = true;
          
          // Generate message and trigger
          this.outputs.messageOut = this.generateMessage(event, this.properties.template);
          this.outputs.event = event;
          this.outputs.trigger = true;
          this._triggerPulse = true;
          
          // Clean up old entries (> 1 hour ago)
          const oneHourAgo = now - 3600000;
          for (const oldKey of Object.keys(this._announcedEvents)) {
            const timestamp = parseInt(oldKey.split('_').pop());
            if (timestamp < oneHourAgo) {
              delete this._announcedEvents[oldKey];
            }
          }
          
          return this.outputs;
        }
      }
    }

    return this.outputs;
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
registry.register('TextStringNode', TextStringNode);
registry.register('StringConcatNode', StringConcatNode);
registry.register('UpcomingEventsNode', UpcomingEventsNode);

/**
 * TTSMessageSchedulerNode - Queue-based TTS message scheduler
 * 
 * Each message row has a trigger input. When triggered (rising edge),
 * the message is queued and output one at a time with delay between.
 */
class TTSMessageSchedulerNode {
  constructor() {
    this.id = null;
    this.label = 'TTS Message Scheduler';
    this.properties = {
      messages: [
        { text: 'Message 1', enabled: true },
        { text: 'Message 2', enabled: true },
        { text: 'Message 3', enabled: true }
      ],
      lastTriggeredIndex: null,
      lastTriggeredText: null,
      debug: false
    };

    // Track last input states for edge detection
    this._lastInputStates = {};
    
    // Message queue
    this._messageQueue = [];
    this._isProcessingQueue = false;
    
    // Current output message
    this._currentOutputMessage = null;
    
    // Processing timeout reference
    this._processingTimeout = null;
    
    // Delay between messages (ms)
    this._messageDelay = 3000;
    
    // Settling period on graph load - prevent initial trigger spam
    this._initTime = Date.now();
    this._settlingMs = 2000;
  }

  restore(data) {
    if (data.properties) {
      if (data.properties.messages) {
        this.properties.messages = data.properties.messages;
      }
      if (data.properties.debug !== undefined) {
        this.properties.debug = data.properties.debug;
      }
    }
  }

  /**
   * Convert any value to boolean
   */
  toBoolean(value) {
    if (value === null || value === undefined) return false;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
      const lower = value.toLowerCase().trim();
      return lower === 'true' || lower === 'on' || lower === '1' || lower === 'yes';
    }
    return !!value;
  }

  /**
   * Queue a message for output
   */
  queueMessage(index, text) {
    if (this.properties.debug) {
      console.log(`[TTSMessageScheduler] Queuing message ${index + 1}: "${text}"`);
    }
    
    this._messageQueue.push({ index, text });
    this._processQueue();
  }

  /**
   * Process the message queue
   */
  _processQueue() {
    if (this._isProcessingQueue || this._messageQueue.length === 0) return;
    
    this._isProcessingQueue = true;
    
    // Get next message (first in queue = highest priority)
    const { index, text } = this._messageQueue.shift();
    
    // Set output
    this._currentOutputMessage = text;
    this.properties.lastTriggeredIndex = index;
    this.properties.lastTriggeredText = text;
    
    if (this.properties.debug) {
      console.log(`[TTSMessageScheduler] 📢 Sending: "${text}"`);
    }
    
    // Clear output after a short delay (pulse behavior)
    this._processingTimeout = setTimeout(() => {
      this._currentOutputMessage = null;
      
      // Wait before processing next message
      this._processingTimeout = setTimeout(() => {
        this._isProcessingQueue = false;
        this._processQueue(); // Process next in queue
      }, this._messageDelay);
    }, 500);
  }

  data(inputs) {
    // Settling period on graph load - skip initial triggers
    const elapsed = Date.now() - this._initTime;
    const isSettling = elapsed < this._settlingMs;
    
    // Skip if frontend is active (let frontend handle TTS)
    const engine = global.backendEngine;
    const frontendActive = engine && engine.shouldSkipDeviceCommands && engine.shouldSkipDeviceCommands();
    
    // Check each trigger for rising edge
    this.properties.messages.forEach((msg, index) => {
      const triggerKey = `trigger_${index}`;
      const rawInput = inputs[triggerKey]?.[0];
      const currentState = this.toBoolean(rawInput);
      const lastState = this._lastInputStates[index] ?? false;
      
      // Rising edge detection
      if (!lastState && currentState) {
        // Skip triggers during settling period
        if (isSettling) {
          console.log(`[TTSMessageScheduler] ⏳ Backend settling: skipping initial trigger for message #${index + 1}`);
          this._lastInputStates[index] = currentState; // Still track state
          return;
        }
        
        // Skip if frontend is handling TTS
        if (frontendActive) {
          console.log(`[TTSMessageScheduler] 🖥️ Frontend active: skipping backend TTS for message #${index + 1}`);
          this._lastInputStates[index] = currentState;
          return;
        }
        
        // Rising edge detected - queue this message
        if (msg.enabled && msg.text) {
          this.queueMessage(index, msg.text);
        }
      }
      
      // Store state for next cycle
      this._lastInputStates[index] = currentState;
    });

    return {
      message: this._currentOutputMessage
    };
  }

  destroy() {
    if (this._processingTimeout) {
      clearTimeout(this._processingTimeout);
    }
    this._messageQueue = [];
    this._isProcessingQueue = false;
  }
}

registry.register('TTSMessageSchedulerNode', TTSMessageSchedulerNode);

/**
 * DebugNode - Pass-through node for debugging
 * 
 * Frontend version displays values in the UI and logs to console.
 * Backend version simply passes values through unchanged.
 * This is needed because other nodes may wire through Debug nodes,
 * and if Debug is null (frontend-only), the data chain breaks.
 */
class DebugNode {
  constructor() {
    this.id = null;
    this.label = 'Debug';
    this.properties = {
      name: '',
      enabled: true
    };
  }

  restore(data) {
    if (data.properties) {
      Object.assign(this.properties, data.properties);
    }
  }

  data(inputs) {
    // Simply pass through the input value unchanged
    // Frontend handles display/logging, backend just needs the data to flow
    const input = inputs.input?.[0];
    return { output: input };
  }
}

registry.register('DebugNode', DebugNode);

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
  WatchdogNode,
  TextStringNode,
  StringConcatNode,
  UpcomingEventsNode,
  TTSMessageSchedulerNode,
  DebugNode
};
