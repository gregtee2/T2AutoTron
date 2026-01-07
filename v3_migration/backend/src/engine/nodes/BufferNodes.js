/**
 * BufferNodes.js
 * 
 * Backend engine implementations of Sender/Receiver nodes.
 * These provide "wireless" connections between nodes via a shared buffer.
 */

const engineLogger = require('../engineLogger');

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
      bufferName: properties.bufferName || 'Default',
      registeredName: null,
      ...properties
    };
    this.inputs = ['in'];  // Match frontend input name
    this.outputs = [];      // No outputs (frontend returns {})
  }
  
  data(inputs) {
    // Frontend uses 'in' as input name
    const inputData = inputs.in?.[0];
    
    // Auto-detect type and prefix (matching frontend logic)
    let prefix = "[Unknown]";
    if (typeof inputData === "boolean") prefix = "[Trigger]";
    else if (typeof inputData === "number") prefix = "[Number]";
    else if (typeof inputData === "string") prefix = "[String]";
    else if (typeof inputData === "object" && inputData) {
      if ('hue' in inputData && 'saturation' in inputData) prefix = "[HSV]";
      else if (Array.isArray(inputData)) prefix = "[Array]";
      else prefix = "[Object]";
    }
    
    // Clean existing prefix from buffer name
    let baseName = (this.properties.bufferName || 'Default').replace(/^\[.+\]/, "");
    const finalName = `${prefix}${baseName}`;
    
    // Update Buffer
    if (inputData !== undefined) {
      // Cleanup old name if it changed
      if (this.properties.registeredName && this.properties.registeredName !== finalName) {
        AutoTronBuffer.delete(this.properties.registeredName);
      }
      
      // Log buffer set operation
      engineLogger.logBufferSet(finalName, inputData);
      AutoTronBuffer.set(finalName, inputData);
      this.properties.registeredName = finalName;
    }
    
    return {};
  }
  
  // Keep process() as alias for backwards compatibility
  process(inputs) {
    return this.data(inputs);
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
      selectedBuffer: properties.selectedBuffer || '',  // Frontend uses this name
      lastValue: null,
      ...properties
    };
    this.inputs = [];
    this.outputs = ['out', 'change'];  // Match frontend output names
  }
  
  data(inputs) {
    // Support both property names (bufferName for backend, selectedBuffer for frontend)
    const bufferName = this.properties.selectedBuffer || this.properties.bufferName;
    const value = bufferName ? AutoTronBuffer.get(bufferName) : undefined;
    
    // Log buffer read
    engineLogger.logBufferGet(bufferName, value);
    
    // Track changes
    const oldValue = this.properties.lastValue;
    const hasChanged = JSON.stringify(value) !== JSON.stringify(oldValue);
    if (hasChanged) {
      this.properties.lastValue = value;
      engineLogger.log('BUFFER-CHANGE', bufferName, { oldValue, newValue: value });
    }
    
    return {
      out: value,      // Match frontend output name
      change: hasChanged
    };
  }
  
  // Keep process() as alias for backwards compatibility
  process(inputs) {
    return this.data(inputs);
  }
  
  restore(state) {
    if (state.properties) {
      Object.assign(this.properties, state.properties);
    }
  }
}

/**
 * HSVModifierNode - Modifies HSV values from buffer
 * 
 * Supports two modes:
 * 1. Direct input via hsv_in socket (applies slider modifications)
 * 2. Buffer override via selectedHsvBuffer (bypasses sliders, outputs buffer directly)
 * 
 * Enable control priority: selectedBuffer (trigger buffer) > enable socket > enabled checkbox
 */
class HSVModifierNode {
  static type = 'HSVModifierNode';
  static label = 'HSV Modifier';
  
  constructor(id, properties = {}) {
    this.id = id;
    this.type = HSVModifierNode.type;
    this.properties = {
      // Legacy property name
      bufferName: properties.bufferName || '',
      // Frontend property names (match HSVModifierNode.js plugin)
      selectedBuffer: properties.selectedBuffer || '',      // Enable trigger buffer
      selectedHsvBuffer: properties.selectedHsvBuffer || '', // HSV source buffer
      enabled: properties.enabled !== false,                 // Checkbox default
      // Slider values
      hueShift: properties.hueShift || 0,
      saturationScale: properties.saturationScale ?? 1.0,
      brightnessScale: properties.brightnessScale ?? 254,
      // Legacy names (for backwards compat)
      hueOffset: properties.hueOffset || 0,
      saturationMultiplier: properties.saturationMultiplier || 1,
      brightnessMultiplier: properties.brightnessMultiplier || 1,
      ...properties
    };
    this.inputs = ['hsv_in', 'enable', 'hueOffset', 'satMult', 'briMult'];
    this.outputs = ['hsv_out'];
  }
  
  process(inputs) {
    // Get HSV input from socket
    const hsvIn = inputs.hsv_in?.[0];
    const enableIn = inputs.enable?.[0];
    
    // 1. Determine if node is enabled
    // Priority: Enable Buffer > Socket input > Checkbox
    let isEnabled = this.properties.enabled;
    if (enableIn !== undefined) {
      isEnabled = !!enableIn;
    }
    if (this.properties.selectedBuffer) {
      const bufferVal = AutoTronBuffer.get(this.properties.selectedBuffer);
      if (bufferVal !== undefined) {
        isEnabled = !!bufferVal;
      }
    }
    
    // If disabled, output null
    if (!isEnabled) {
      return { hsv_out: null };
    }
    
    // 2. Check for HSV Buffer override (bypasses sliders entirely)
    const hsvBufferName = this.properties.selectedHsvBuffer || this.properties.bufferName;
    if (hsvBufferName) {
      const bufferVal = AutoTronBuffer.get(hsvBufferName);
      if (bufferVal && typeof bufferVal === 'object' && 'hue' in bufferVal) {
        // Output HSV buffer directly (bypass slider modifications)
        return { hsv_out: bufferVal };
      }
    }
    
    // 3. No input? Return default
    if (!hsvIn || typeof hsvIn !== 'object') {
      return { hsv_out: { hue: 0, saturation: 0, brightness: 0 } };
    }
    
    // 4. Apply slider modifications to socket input
    // Get modifiers from inputs or properties (support both old and new names)
    const hueOffset = inputs.hueOffset?.[0] ?? this.properties.hueShift ?? this.properties.hueOffset ?? 0;
    const satMult = inputs.satMult?.[0] ?? this.properties.saturationScale ?? this.properties.saturationMultiplier ?? 1;
    const briMult = inputs.briMult?.[0] ?? this.properties.brightnessScale ?? this.properties.brightnessMultiplier ?? 254;
    
    // Apply hue shift (input is 0-1, shift is in degrees on frontend but stored as 0-360)
    let hue = ((hsvIn.hue || 0) * 360 + hueOffset) % 360;
    if (hue < 0) hue += 360;
    hue = hue / 360; // Convert back to 0-1 range
    
    // Saturation and brightness use scale values directly
    const saturation = Math.max(0, Math.min(1, satMult));
    const brightness = Math.max(0, Math.min(254, briMult));
    
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
