/**
 * LogicNodes.js - Backend implementations of logic gate nodes
 * 
 * These are pure logic implementations without React/browser dependencies.
 * Uses shared logic from v3_migration/shared/logic/LogicGateLogic.js
 */

const registry = require('../BackendNodeRegistry');

// Load shared logic functions
let sharedLogic;
try {
  sharedLogic = require('../../../../shared/logic/LogicGateLogic');
} catch (e) {
  console.warn('[LogicNodes] Failed to load shared logic, using inline fallback');
  sharedLogic = null;
}

// Helper to extract input values as flat array
function getInputValues(inputs) {
  const values = [];
  for (const key in inputs) {
    const inputArray = inputs[key] || [];
    values.push(...inputArray);
  }
  return values;
}

/**
 * ANDNode - Outputs true only if all inputs are true
 */
class ANDNode {
  constructor() {
    this.id = null;
    this.label = 'AND';
    this.properties = {};
  }

  restore(data) {
    if (data.properties) {
      Object.assign(this.properties, data.properties);
    }
  }

  data(inputs) {
    const values = getInputValues(inputs);
    const result = sharedLogic ? sharedLogic.calculateAnd(values) : values.every(v => Boolean(v));
    return { result };
  }
}

/**
 * ORNode - Outputs true if any input is true
 */
class ORNode {
  constructor() {
    this.id = null;
    this.label = 'OR';
    this.properties = {};
  }

  restore(data) {
    if (data.properties) {
      Object.assign(this.properties, data.properties);
    }
  }

  data(inputs) {
    const values = getInputValues(inputs);
    const result = sharedLogic ? sharedLogic.calculateOr(values) : values.some(v => Boolean(v));
    return { result };
  }
}

/**
 * NOTNode - Inverts the input
 */
class NOTNode {
  constructor() {
    this.id = null;
    this.label = 'NOT';
    this.properties = {};
  }

  restore(data) {
    if (data.properties) {
      Object.assign(this.properties, data.properties);
    }
  }

  data(inputs) {
    const inputValues = inputs.input || inputs.a || [];
    const value = inputValues[0];
    const result = sharedLogic ? sharedLogic.calculateNot(value) : !Boolean(value);
    return { result };
  }
}

/**
 * XORNode - Outputs true if exactly one input is true
 */
class XORNode {
  constructor() {
    this.id = null;
    this.label = 'XOR';
    this.properties = {};
  }

  restore(data) {
    if (data.properties) {
      Object.assign(this.properties, data.properties);
    }
  }

  data(inputs) {
    const values = getInputValues(inputs);
    if (sharedLogic) {
      return { result: sharedLogic.calculateXor(values) };
    }
    // Fallback
    const truthyCount = values.filter(v => Boolean(v)).length;
    return { result: truthyCount % 2 === 1 };
  }
}

/**
 * CompareNode - Compares two values
 */
class CompareNode {
  constructor() {
    this.id = null;
    this.label = 'Compare';
    this.properties = {
      operator: '==',  // ==, !=, >, <, >=, <=
      compareValue: 0
    };
  }

  restore(data) {
    if (data.properties) {
      Object.assign(this.properties, data.properties);
    }
  }

  data(inputs) {
    const inputValues = inputs.value || inputs.input || inputs.a || [];
    const value = inputValues[0] ?? 0;
    const compareValue = inputs.compare?.[0] ?? this.properties.compareValue;
    
    const result = sharedLogic 
      ? sharedLogic.compare(value, this.properties.operator, compareValue)
      : this._inlineCompare(value, this.properties.operator, compareValue);
    
    return { result };
  }

  _inlineCompare(a, op, b) {
    switch (op) {
      case '==': return a == b;
      case '!=': return a != b;
      case '>': return a > b;
      case '<': return a < b;
      case '>=': return a >= b;
      case '<=': return a <= b;
      default: return false;
    }
  }
}

/**
 * SwitchNode - Routes input to one of multiple outputs based on condition
 */
class SwitchNode {
  constructor() {
    this.id = null;
    this.label = 'Switch';
    this.properties = {
      rules: []  // [{value: x, output: 'out1'}, ...]
    };
  }

  restore(data) {
    if (data.properties) {
      Object.assign(this.properties, data.properties);
    }
  }

  data(inputs) {
    const inputValues = inputs.input || inputs.value || [];
    const value = inputValues[0];
    const condition = inputs.condition?.[0];
    
    // Simple true/false routing
    if (condition !== undefined) {
      return {
        true: condition ? value : undefined,
        false: !condition ? value : undefined
      };
    }
    
    // Pass through
    return { output: value };
  }
}

/**
 * EdgeDetectorNode - Detects rising and falling edges of a boolean signal
 * 
 * Perfect for triggering one-shot events when states change:
 * - Motion sensor goes active → trigger announcement
 * - Rain starts → "It's raining" TTS
 * - Rain stops → "Rain has stopped" TTS
 */
class EdgeDetectorNode {
  constructor() {
    this.id = null;
    this.label = 'Edge Detector';
    this.properties = {
      lastInputState: null,
      debug: false
    };
  }

  restore(data) {
    if (data.properties) {
      Object.assign(this.properties, data.properties);
    }
  }

  /**
   * Convert any input value to boolean
   */
  toBoolean(value) {
    if (value === undefined || value === null) return false;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
      const lower = value.toLowerCase().trim();
      return lower === 'true' || lower === 'on' || lower === '1' || lower === 'yes';
    }
    return !!value;
  }

  data(inputs) {
    // Get input value and convert to boolean
    const inputArray = inputs.input || [];
    const rawInput = inputArray[0];
    const currentState = this.toBoolean(rawInput);
    const lastState = this.properties.lastInputState;

    // Detect edges
    let risingEdge = false;
    let fallingEdge = false;

    if (lastState !== null) {
      // Rising edge: was false, now true
      risingEdge = !lastState && currentState;
      // Falling edge: was true, now false
      fallingEdge = lastState && !currentState;
    }

    // Store state for next cycle
    this.properties.lastInputState = currentState;

    if (this.properties.debug && (risingEdge || fallingEdge)) {
      console.log(`[EdgeDetector ${this.id}] ${risingEdge ? 'RISING' : 'FALLING'} edge detected`);
    }

    return {
      rising: risingEdge,
      falling: fallingEdge,
      changed: risingEdge || fallingEdge,
      state: currentState
    };
  }
}

// Register nodes
registry.register('ANDNode', ANDNode);
registry.register('ORNode', ORNode);
registry.register('NOTNode', NOTNode);
registry.register('XORNode', XORNode);
registry.register('CompareNode', CompareNode);
registry.register('SwitchNode', SwitchNode);
registry.register('EdgeDetectorNode', EdgeDetectorNode);

// Also register with alternate names used in some plugins
registry.register('ANDGateNode', ANDNode);
registry.register('ORGateNode', ORNode);
registry.register('NOTGateNode', NOTNode);
registry.register('XORGateNode', XORNode);

module.exports = { ANDNode, ORNode, NOTNode, XORNode, CompareNode, SwitchNode, EdgeDetectorNode };
