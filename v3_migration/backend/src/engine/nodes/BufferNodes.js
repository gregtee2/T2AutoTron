/**
 * BufferNodes.js
 * 
 * Backend engine implementations of Sender/Receiver nodes.
 * These provide "wireless" connections between nodes via a shared buffer.
 */

// Shared buffer storage - equivalent to window.AutoTronBuffer in frontend
const buffer = new Map();

/**
 * Buffer API - matches frontend AutoTronBuffer interface
 */
const AutoTronBuffer = {
  data: {},
  
  get(key) {
    return buffer.get(key);
  },
  
  set(key, value) {
    buffer.set(key, value);
    this.data[key] = value; // Keep sync for .keys() compatibility
  },
  
  keys() {
    return Array.from(buffer.keys());
  },
  
  has(key) {
    return buffer.has(key);
  },
  
  delete(key) {
    buffer.delete(key);
    delete this.data[key];
  },
  
  clear() {
    buffer.clear();
    this.data = {};
  }
};

/**
 * SenderNode - Writes values to the shared buffer
 */
class SenderNode {
  static type = 'SenderNode';
  static label = 'Sender';
  
  constructor(id, properties = {}) {
    this.id = id;
    this.type = SenderNode.type;
    this.properties = {
      bufferName: properties.bufferName || '[Trigger] Unnamed',
      ...properties
    };
    this.inputs = ['value'];
    this.outputs = ['passthrough'];
  }
  
  process(inputs) {
    const value = inputs.value;
    const bufferName = this.properties.bufferName;
    
    if (bufferName && value !== undefined) {
      AutoTronBuffer.set(bufferName, value);
    }
    
    // Pass through the value
    return {
      passthrough: value
    };
  }
  
  restore(state) {
    if (state.properties) {
      Object.assign(this.properties, state.properties);
    }
  }
}

/**
 * ReceiverNode - Reads values from the shared buffer
 */
class ReceiverNode {
  static type = 'ReceiverNode';
  static label = 'Receiver';
  
  constructor(id, properties = {}) {
    this.id = id;
    this.type = ReceiverNode.type;
    this.properties = {
      bufferName: properties.bufferName || '',
      ...properties
    };
    this.inputs = [];
    this.outputs = ['value'];
  }
  
  process(inputs) {
    const bufferName = this.properties.bufferName;
    const value = bufferName ? AutoTronBuffer.get(bufferName) : undefined;
    
    return {
      value: value
    };
  }
  
  restore(state) {
    if (state.properties) {
      Object.assign(this.properties, state.properties);
    }
  }
}

/**
 * HSVModifierNode - Modifies HSV values from buffer
 */
class HSVModifierNode {
  static type = 'HSVModifierNode';
  static label = 'HSV Modifier';
  
  constructor(id, properties = {}) {
    this.id = id;
    this.type = HSVModifierNode.type;
    this.properties = {
      bufferName: properties.bufferName || '',
      hueOffset: properties.hueOffset || 0,
      saturationMultiplier: properties.saturationMultiplier || 1,
      brightnessMultiplier: properties.brightnessMultiplier || 1,
      ...properties
    };
    this.inputs = ['hueOffset', 'satMult', 'briMult'];
    this.outputs = ['hsv_out'];
  }
  
  process(inputs) {
    const bufferName = this.properties.bufferName;
    const baseHSV = bufferName ? AutoTronBuffer.get(bufferName) : null;
    
    if (!baseHSV || typeof baseHSV !== 'object') {
      return { hsv_out: null };
    }
    
    // Get modifiers from inputs or properties
    const hueOffset = inputs.hueOffset ?? this.properties.hueOffset ?? 0;
    const satMult = inputs.satMult ?? this.properties.saturationMultiplier ?? 1;
    const briMult = inputs.briMult ?? this.properties.brightnessMultiplier ?? 1;
    
    // Apply modifications
    let hue = (baseHSV.hue || 0) + hueOffset;
    // Wrap hue to 0-1 range
    while (hue < 0) hue += 1;
    while (hue > 1) hue -= 1;
    
    const saturation = Math.max(0, Math.min(1, (baseHSV.saturation || 0) * satMult));
    const brightness = Math.max(0, Math.min(254, (baseHSV.brightness || 0) * briMult));
    
    return {
      hsv_out: {
        hue,
        saturation,
        brightness
      }
    };
  }
  
  restore(state) {
    if (state.properties) {
      Object.assign(this.properties, state.properties);
    }
  }
}

/**
 * Register nodes with the backend registry
 */
function register(registry) {
  registry.register('SenderNode', SenderNode);
  registry.register('ReceiverNode', ReceiverNode);
  registry.register('HSVModifierNode', HSVModifierNode);
}

module.exports = {
  register,
  AutoTronBuffer,  // Export for testing/debugging
  SenderNode,
  ReceiverNode,
  HSVModifierNode
};
