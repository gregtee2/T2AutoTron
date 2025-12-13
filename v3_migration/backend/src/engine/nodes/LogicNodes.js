/**
 * LogicNodes.js - Backend implementations of logic gate nodes
 * 
 * These are pure logic implementations without React/browser dependencies.
 */

const registry = require('../BackendNodeRegistry');

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
    // Get all input values, flatten arrays
    const values = [];
    for (const key in inputs) {
      const inputArray = inputs[key] || [];
      values.push(...inputArray);
    }
    
    // If no inputs, return false
    if (values.length === 0) {
      return { result: false };
    }
    
    // AND: all must be truthy
    const result = values.every(v => Boolean(v));
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
    const values = [];
    for (const key in inputs) {
      const inputArray = inputs[key] || [];
      values.push(...inputArray);
    }
    
    if (values.length === 0) {
      return { result: false };
    }
    
    // OR: at least one must be truthy
    const result = values.some(v => Boolean(v));
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
    return { result: !Boolean(value) };
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
    const values = [];
    for (const key in inputs) {
      const inputArray = inputs[key] || [];
      values.push(...inputArray);
    }
    
    if (values.length === 0) {
      return { result: false };
    }
    
    // XOR: count truthy values, result is true if count is odd
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
    
    let result = false;
    switch (this.properties.operator) {
      case '==': result = value == compareValue; break;
      case '===': result = value === compareValue; break;
      case '!=': result = value != compareValue; break;
      case '!==': result = value !== compareValue; break;
      case '>': result = value > compareValue; break;
      case '<': result = value < compareValue; break;
      case '>=': result = value >= compareValue; break;
      case '<=': result = value <= compareValue; break;
    }
    
    return { result };
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

// Register nodes
registry.register('ANDNode', ANDNode);
registry.register('ORNode', ORNode);
registry.register('NOTNode', NOTNode);
registry.register('XORNode', XORNode);
registry.register('CompareNode', CompareNode);
registry.register('SwitchNode', SwitchNode);

// Also register with alternate names used in some plugins
registry.register('ANDGateNode', ANDNode);
registry.register('ORGateNode', ORNode);
registry.register('NOTGateNode', NOTNode);
registry.register('XORGateNode', XORNode);

module.exports = { ANDNode, ORNode, NOTNode, XORNode, CompareNode, SwitchNode };
