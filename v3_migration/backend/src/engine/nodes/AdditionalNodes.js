/**
 * AdditionalNodes.js
 * 
 * Backend engine implementations for additional frontend plugins.
 * Includes: AllInOneColor, ColorGradient, Comparison, Conditional nodes,
 * Date/DayOfWeek comparisons, Logic nodes, and Pushbutton.
 */

// ============================================================================
// COLOR UTILITIES (simplified version for backend)
// ============================================================================
const ColorUtils = {
  rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const v = max;
    const d = max - min;
    const s = max === 0 ? 0 : d / max;
    let h = 0;
    if (max !== min) {
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return { hue: h, sat: s, val: v };
  },
  
  hsvToRgb(h, s, v) {
    let r, g, b;
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    switch (i % 6) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      case 5: r = v; g = p; b = q; break;
    }
    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
  }
};

// ============================================================================
// ALL-IN-ONE COLOR NODE
// ============================================================================
class AllInOneColorNode {
  static type = 'AllInOneColorNode';
  
  constructor(id, properties = {}) {
    this.id = id;
    this.type = AllInOneColorNode.type;
    this.properties = {
      hueShift: 10,
      saturation: 20,
      brightness: 128,
      colorTemp: 4150,
      transitionTime: 0,
      activeMode: 'color',
      ...properties
    };
    this.inputs = ['hsv_in', 'scene_hsv'];
    this.outputs = ['hsv_out'];
  }
  
  process(inputs) {
    // Pass through scene if connected (unwrap array if needed)
    const sceneRaw = inputs.scene_hsv;
    const scene = Array.isArray(sceneRaw) ? sceneRaw[0] : sceneRaw;
    if (scene) {
      return { hsv_out: scene };
    }
    
    return {
      hsv_out: {
        hue: this.properties.hueShift / 360,
        saturation: this.properties.saturation / 100,
        brightness: this.properties.brightness,
        transition: this.properties.transitionTime,
        colorTemp: this.properties.colorTemp,
        mode: this.properties.activeMode,
        on: this.properties.brightness > 0
      }
    };
  }
  
  restore(state) {
    if (state.properties) Object.assign(this.properties, state.properties);
  }
}

// ============================================================================
// COLOR GRADIENT NODE (Simplified)
// ============================================================================
const WEDGE_PRESETS = {
  'warm': { startHue: 0, startSat: 100, startBri: 100, endHue: 60, endSat: 80, endBri: 90 },
  'cool': { startHue: 180, startSat: 90, startBri: 90, endHue: 240, endSat: 80, endBri: 90 },
  'warm-to-cool': { startHue: 0, startSat: 100, startBri: 100, endHue: 240, endSat: 80, endBri: 90 }
};

function parseTimeString(hours, minutes, period) {
  const now = new Date();
  let parsedHours = parseInt(hours, 10);
  const parsedMinutes = parseInt(minutes, 10);
  const isPM = period.toUpperCase() === "PM";
  if (isNaN(parsedHours) || isNaN(parsedMinutes)) return null;
  if (isPM && parsedHours < 12) parsedHours += 12;
  if (!isPM && parsedHours === 12) parsedHours = 0;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), parsedHours, parsedMinutes, 0);
}

/**
 * Parse time input from connected node to Date object
 * Supports formats: "08:30" (24h), "5:30 PM" (12h), "17:30" (24h)
 */
function parseTimeInput(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null;
  
  const now = new Date();
  
  // Check for 12-hour format with AM/PM (e.g., "5:30 PM" or "10:00 AM")
  const ampmMatch = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampmMatch) {
    let h = parseInt(ampmMatch[1], 10);
    const m = parseInt(ampmMatch[2], 10);
    const period = ampmMatch[3].toUpperCase();
    
    // Convert 12-hour to 24-hour
    if (period === 'AM' && h === 12) h = 0;
    else if (period === 'PM' && h !== 12) h += 12;
    
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0);
  }
  
  // Try 24-hour format (e.g., "08:30" or "17:30")
  const [h, m] = timeStr.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0);
}

class ColorGradientNode {
  static type = 'ColorGradientNode';
  
  constructor(id, properties = {}) {
    this.id = id;
    this.type = ColorGradientNode.type;
    this.properties = {
      colorMode: 'custom',
      predefinedWedge: 'warm-to-cool',
      directMode: false,
      colorBias: 0.5,
      fromColor: { r: 255, g: 0, b: 0 },
      toColor: { r: 0, g: 0, b: 255 },
      fromBrightness: 254,
      toBrightness: 254,
      startHue: 0,
      startSaturation: 100,
      startBrightness: 100,
      endHue: 240,
      endSaturation: 80,
      endBrightness: 90,
      rangeMode: 'time',
      startValue: 20,
      endValue: 30,
      startTimeHours: 10,
      startTimeMinutes: 0,
      startTimePeriod: 'AM',
      endTimeHours: 2,
      endTimeMinutes: 0,
      endTimePeriod: 'PM',
      useBrightnessOverride: false,
      brightnessOverride: 254,
      ...properties
    };
    this.inputs = ['value', 'trigger', 'timerDuration', 'startTime', 'endTime'];
    this.outputs = ['hsvInfo'];
    this.timerStart = null;
  }
  
  process(inputs) {
    const inputValue = inputs.value;
    const now = new Date();
    let position = 0;
    // Debug disabled after confirming fix works - set VERBOSE_LOGGING=true in .env to re-enable
    const debugThis = false; // this.properties.debug || false;
    
    if (this.properties.rangeMode === 'numerical') {
      if (inputValue !== undefined) {
        const clamped = Math.max(this.properties.startValue, Math.min(this.properties.endValue, inputValue));
        position = (clamped - this.properties.startValue) / (this.properties.endValue - this.properties.startValue);
      }
    } else if (this.properties.rangeMode === 'time') {
      // Use connected inputs (startTime/endTime) if available, otherwise fall back to properties
      // Extract value from array wrapper (backend engine wraps inputs in arrays)
      const externalStart = Array.isArray(inputs.startTime) ? inputs.startTime[0] : inputs.startTime;
      const externalEnd = Array.isArray(inputs.endTime) ? inputs.endTime[0] : inputs.endTime;
      
      if (debugThis) {
        console.log(`[ColorGradient ${this.id.slice(0,8)}] Raw inputs: startTime=${JSON.stringify(inputs.startTime)}, endTime=${JSON.stringify(inputs.endTime)}`);
        console.log(`[ColorGradient ${this.id.slice(0,8)}] Extracted: externalStart="${externalStart}", externalEnd="${externalEnd}"`);
      }
      
      let startTime, endTime;
      
      // Check if we have valid external input (not undefined/null)
      if (externalStart && typeof externalStart === 'string') {
        // Use input from connected node (e.g., Sunrise/Sunset Trigger outputs "HH:MM")
        startTime = parseTimeInput(externalStart);
      } else {
        // Fall back to internal properties (Hours/Minutes/Period format)
        startTime = parseTimeString(this.properties.startTimeHours, this.properties.startTimeMinutes, this.properties.startTimePeriod);
      }
      
      if (externalEnd && typeof externalEnd === 'string') {
        endTime = parseTimeInput(externalEnd);
      } else {
        endTime = parseTimeString(this.properties.endTimeHours, this.properties.endTimeMinutes, this.properties.endTimePeriod);
      }
      
      if (debugThis) {
        console.log(`[ColorGradient ${this.id.slice(0,8)}] Parsed times: start=${startTime?.toLocaleTimeString()}, end=${endTime?.toLocaleTimeString()}, now=${now.toLocaleTimeString()}`);
      }
      
      if (!startTime || !endTime) return { hsvInfo: null };
      
      let startMs = startTime.getTime();
      let endMs = endTime.getTime();
      if (endMs <= startMs) {
        endTime.setDate(endTime.getDate() + 1);
        endMs = endTime.getTime();
      }
      
      const currentMs = now.getTime();
      if (currentMs < startMs) {
        position = 0;
      } else if (currentMs > endMs) {
        position = 1;
      } else {
        position = (currentMs - startMs) / (endMs - startMs);
      }
      
      if (debugThis) {
        console.log(`[ColorGradient ${this.id.slice(0,8)}] Position calc: startMs=${startMs}, endMs=${endMs}, currentMs=${currentMs}, position=${position.toFixed(4)}`);
      }
    }
    
    // Apply color bias
    const bias = this.properties.colorBias !== undefined ? this.properties.colorBias : 0.5;
    let biasedPosition = position;
    if (bias !== 0.5 && position > 0 && position < 1) {
      const power = bias < 0.5 ? 1 + (0.5 - bias) * 6 : 1 / (1 + (bias - 0.5) * 6);
      biasedPosition = Math.pow(position, power);
    }
    
    // Calculate output color
    if (this.properties.directMode) {
      const from = this.properties.fromColor;
      const to = this.properties.toColor;
      const r = Math.round(from.r + biasedPosition * (to.r - from.r));
      const g = Math.round(from.g + biasedPosition * (to.g - from.g));
      const b = Math.round(from.b + biasedPosition * (to.b - from.b));
      const hsv = ColorUtils.rgbToHsv(r, g, b);
      const brightness = this.properties.useBrightnessOverride 
        ? this.properties.brightnessOverride 
        : Math.round(this.properties.fromBrightness + biasedPosition * (this.properties.toBrightness - this.properties.fromBrightness));
      
      return {
        hsvInfo: {
          hue: hsv.hue,
          saturation: hsv.sat,
          brightness,
          rgb: { r, g, b }
        }
      };
    } else {
      const hue = this.properties.startHue + biasedPosition * (this.properties.endHue - this.properties.startHue);
      const sat = this.properties.startSaturation + biasedPosition * (this.properties.endSaturation - this.properties.startSaturation);
      const bri = this.properties.startBrightness + biasedPosition * (this.properties.endBrightness - this.properties.startBrightness);
      
      return {
        hsvInfo: {
          hue: hue / 360,
          saturation: sat / 100,
          brightness: Math.round(bri * 2.54)
        }
      };
    }
  }
  
  restore(state) {
    if (state.properties) Object.assign(this.properties, state.properties);
  }
}

// ============================================================================
// COMPARISON NODE
// ============================================================================
class ComparisonNode {
  static type = 'ComparisonNode';
  
  constructor(id, properties = {}) {
    this.id = id;
    this.type = ComparisonNode.type;
    this.properties = {
      operator: "=",
      compareValue: "",
      ...properties
    };
    this.inputs = ['in'];
    this.outputs = ['result'];
  }
  
  process(inputs) {
    const inputVal = inputs.in;
    const compareVal = this.properties.compareValue;
    const operator = this.properties.operator;
    
    if (inputVal === undefined) return { result: false };
    
    let result = false;
    const numInput = parseFloat(inputVal);
    const numCompare = parseFloat(compareVal);
    
    if (!isNaN(numInput) && !isNaN(numCompare)) {
      switch (operator) {
        case "=":  result = numInput === numCompare; break;
        case "!=": result = numInput !== numCompare; break;
        case ">":  result = numInput > numCompare; break;
        case "<":  result = numInput < numCompare; break;
        case ">=": result = numInput >= numCompare; break;
        case "<=": result = numInput <= numCompare; break;
      }
    } else {
      const strInput = String(inputVal);
      const strCompare = String(compareVal);
      switch (operator) {
        case "=":  result = strInput === strCompare; break;
        case "!=": result = strInput !== strCompare; break;
        case ">":  result = strInput > strCompare; break;
        case "<":  result = strInput < strCompare; break;
        case ">=": result = strInput >= strCompare; break;
        case "<=": result = strInput <= strCompare; break;
      }
    }
    
    return { result };
  }
  
  restore(state) {
    if (state.properties) Object.assign(this.properties, state.properties);
  }
}

// ============================================================================
// CONDITIONAL INTEGER OUTPUT NODE
// ============================================================================
class ConditionalIntegerOutputNode {
  static type = 'ConditionalIntegerOutputNode';
  
  constructor(id, properties = {}) {
    this.id = id;
    this.type = ConditionalIntegerOutputNode.type;
    this.properties = { ...properties };
    this.inputs = ['a', 'b'];
    this.outputs = ['out'];
  }
  
  process(inputs) {
    // Unwrap arrays from backend engine
    const A = Array.isArray(inputs.a) ? inputs.a[0] : inputs.a;
    const B = Array.isArray(inputs.b) ? inputs.b[0] : inputs.b;
    
    if (A === true) {
      const intValue = typeof B === "number" ? Math.floor(B) : parseInt(B, 10) || 0;
      return { out: intValue };
    }
    return { out: false };
  }
  
  restore(state) {
    if (state.properties) Object.assign(this.properties, state.properties);
  }
}

// ============================================================================
// CONDITIONAL SWITCH NODE
// ============================================================================
class ConditionalSwitchNode {
  static type = 'ConditionalSwitchNode';
  
  constructor(id, properties = {}) {
    this.id = id;
    this.type = ConditionalSwitchNode.type;
    this.properties = {
      numberOfInputs: 4,
      clampSelect: true,
      ...properties
    };
    this.inputs = ['select'];
    this.outputs = ['out'];
    
    // Add dynamic data inputs
    for (let i = 0; i < this.properties.numberOfInputs; i++) {
      this.inputs.push(`data_${i}`);
    }
  }
  
  process(inputs) {
    // Unwrap array if needed (backend engine wraps inputs)
    let selectVal = Array.isArray(inputs.select) ? inputs.select[0] : inputs.select;
    if (typeof selectVal !== "number") selectVal = 0;
    
    if (this.properties.clampSelect) {
      selectVal = Math.max(0, Math.min(this.properties.numberOfInputs - 1, selectVal));
    }
    
    const chosenIndex = Math.floor(selectVal);
    // Unwrap array from chosen data input
    const rawData = inputs[`data_${chosenIndex}`];
    const outData = Array.isArray(rawData) ? rawData[0] : rawData;
    
    return { out: outData !== undefined ? outData : null };
  }
  
  restore(state) {
    if (state.properties) {
      Object.assign(this.properties, state.properties);
      // Rebuild inputs
      this.inputs = ['select'];
      for (let i = 0; i < this.properties.numberOfInputs; i++) {
        this.inputs.push(`data_${i}`);
      }
    }
  }
}

// ============================================================================
// DATE COMPARISON NODE
// ============================================================================
// ============================================================================
// INTEGER SELECTOR NODE
// ============================================================================
class IntegerSelectorNode {
  static type = 'IntegerSelectorNode';
  
  constructor(id, properties = {}) {
    this.id = id;
    this.type = IntegerSelectorNode.type;
    this.properties = {
      value: 0,
      min: 0,
      max: 10,
      ...properties
    };
    this.inputs = [];
    this.outputs = ['value'];
  }
  
  process() {
    // Just output the configured value (clamped to min/max)
    const value = Math.max(
      this.properties.min,
      Math.min(this.properties.max, this.properties.value)
    );
    return { value };
  }
  
  restore(state) {
    if (state.properties) Object.assign(this.properties, state.properties);
  }
}

// ============================================================================
// DATE COMPARISON NODE
// ============================================================================
class DateComparisonNode {
  static type = 'DateComparisonNode';
  
  constructor(id, properties = {}) {
    this.id = id;
    this.type = DateComparisonNode.type;
    this.properties = {
      useRange: false,
      month: 4,
      day: 17,
      startMonth: 4,
      startDay: 10,
      endMonth: 4,
      endDay: 20,
      ...properties
    };
    this.inputs = [];
    this.outputs = ['isInRange'];
  }
  
  process() {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentDay = now.getDate();
    
    let isInRange = false;
    
    if (!this.properties.useRange) {
      isInRange = currentMonth === this.properties.month && currentDay === this.properties.day;
    } else {
      const currentYear = now.getFullYear();
      let startDate = new Date(currentYear, this.properties.startMonth - 1, this.properties.startDay);
      let endDate = new Date(currentYear, this.properties.endMonth - 1, this.properties.endDay);
      if (startDate > endDate) [startDate, endDate] = [endDate, startDate];
      const todayMidnight = new Date(currentYear, currentMonth - 1, currentDay);
      isInRange = todayMidnight >= startDate && todayMidnight <= endDate;
    }
    
    return { isInRange };
  }
  
  restore(state) {
    if (state.properties) Object.assign(this.properties, state.properties);
  }
}

// ============================================================================
// DAY OF WEEK COMPARISON NODE
// ============================================================================
class DayOfWeekComparisonNode {
  static type = 'DayOfWeekComparisonNode';
  
  constructor(id, properties = {}) {
    this.id = id;
    this.type = DayOfWeekComparisonNode.type;
    this.properties = {
      mode: "single",
      singleDay: 1,
      startDay: 1,
      endDay: 5,
      ...properties
    };
    this.inputs = [];
    this.outputs = ['isInRange'];
  }
  
  process() {
    const currentDayOfWeek = new Date().getDay();
    let isInRange = false;
    
    switch (this.properties.mode) {
      case "all":
        isInRange = true;
        break;
      case "single":
        isInRange = currentDayOfWeek === this.properties.singleDay;
        break;
      case "range":
        let s = this.properties.startDay;
        let e = this.properties.endDay;
        if (s > e) [s, e] = [e, s];
        isInRange = currentDayOfWeek >= s && currentDayOfWeek <= e;
        break;
    }
    
    return { isInRange };
  }
  
  restore(state) {
    if (state.properties) Object.assign(this.properties, state.properties);
  }
}

// ============================================================================
// LOGIC CONDITION NODE
// ============================================================================
class LogicConditionNode {
  static type = 'LogicConditionNode';
  
  constructor(id, properties = {}) {
    this.id = id;
    this.type = LogicConditionNode.type;
    this.properties = {
      selectedDeviceId: "",
      conditionOperator: "=",
      conditionValue: "",
      actionType: "None",
      setValue: 0,
      ...properties
    };
    this.inputs = ['trigger'];
    this.outputs = ['condition_met', 'action'];
    this.deviceState = null;
  }
  
  process(inputs) {
    const trigger = inputs.trigger;
    
    if (!trigger) {
      return { condition_met: false, action: null };
    }
    
    // In backend mode, we'd need to fetch device state via the device managers
    // For now, return based on last known state
    const stateValue = this.deviceState;
    const compareVal = this.properties.conditionValue;
    const operator = this.properties.conditionOperator;
    
    let conditionMet = false;
    if (stateValue !== null) {
      const numState = parseFloat(stateValue);
      const numCompare = parseFloat(compareVal);
      
      if (!isNaN(numState) && !isNaN(numCompare)) {
        switch (operator) {
          case "=":  conditionMet = numState === numCompare; break;
          case "!=": conditionMet = numState !== numCompare; break;
          case ">":  conditionMet = numState > numCompare; break;
          case "<":  conditionMet = numState < numCompare; break;
          case ">=": conditionMet = numState >= numCompare; break;
          case "<=": conditionMet = numState <= numCompare; break;
        }
      }
    }
    
    const action = conditionMet ? {
      type: this.properties.actionType,
      deviceId: this.properties.selectedDeviceId,
      value: this.properties.setValue
    } : null;
    
    return { condition_met: conditionMet, action };
  }
  
  restore(state) {
    if (state.properties) Object.assign(this.properties, state.properties);
  }
}

// ============================================================================
// LOGIC OPERATIONS NODE
// ============================================================================
class LogicOperationsNode {
  static type = 'LogicOperationsNode';
  
  constructor(id, properties = {}) {
    this.id = id;
    this.type = LogicOperationsNode.type;
    this.properties = {
      mode: "AND",
      inputCount: 2,
      compareInputIndex: -1,
      compareOperator: ">",
      compareThreshold: 80,
      setVariable: "",
      ...properties
    };
    this.inputs = [];
    this.outputs = ['result', 'inverse', 'value', 'variable'];
    this.previousA = null;
    
    // Build inputs
    for (let i = 0; i < this.properties.inputCount; i++) {
      this.inputs.push(`in${i}`);
    }
  }
  
  translateInput(value) {
    if (value === undefined || value === null) return false;
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    if (typeof value === "string") {
      const lower = value.toLowerCase();
      return lower === "true" || lower === "on" || lower === "1";
    }
    return !!value;
  }
  
  process(inputs) {
    const rawValues = [];
    const booleanValues = [];
    let numericValue = null;
    
    for (let i = 0; i < this.properties.inputCount; i++) {
      // Inputs are arrays from gatherInputs() - extract first value
      const inputArray = inputs[`in${i}`];
      const val = Array.isArray(inputArray) ? inputArray[0] : inputArray;
      rawValues.push(val);
      if (numericValue === null && typeof val === 'number') {
        numericValue = val;
      }
    }
    
    // Handle comparison
    const compareIndex = this.properties.compareInputIndex;
    let comparisonResult = true;
    
    if (compareIndex >= 0 && compareIndex < rawValues.length) {
      const val = rawValues[compareIndex];
      const threshold = parseFloat(this.properties.compareThreshold);
      const numVal = parseFloat(val);
      
      if (!isNaN(numVal) && !isNaN(threshold)) {
        switch (this.properties.compareOperator) {
          case ">": comparisonResult = numVal > threshold; break;
          case "<": comparisonResult = numVal < threshold; break;
          case "=": comparisonResult = numVal === threshold; break;
          case ">=": comparisonResult = numVal >= threshold; break;
          case "<=": comparisonResult = numVal <= threshold; break;
          case "!=": comparisonResult = numVal !== threshold; break;
        }
      } else {
        comparisonResult = false;
      }
    }
    
    // Convert to booleans
    for (let i = 0; i < rawValues.length; i++) {
      if (i === compareIndex) {
        booleanValues.push(comparisonResult);
      } else {
        booleanValues.push(this.translateInput(rawValues[i]));
      }
    }
    
    // Execute logic
    let result = false;
    const A = booleanValues[0];
    const B = booleanValues[1];
    
    switch (this.properties.mode) {
      case "AND": result = booleanValues.every(v => v); break;
      case "OR": result = booleanValues.some(v => v); break;
      case "NAND": result = !booleanValues.every(v => v); break;
      case "NOR": result = !booleanValues.some(v => v); break;
      case "XOR": result = booleanValues.filter(v => v).length % 2 === 1; break;
      case "XNOR": result = booleanValues.filter(v => v).length % 2 === 0; break;
      case "IMPLIES": result = !A || B; break;
      case "BICOND": result = A === B; break;
      case "RisingEdge":
        if (this.previousA !== null) result = !this.previousA && A;
        this.previousA = A;
        break;
      case "FallingEdge":
        if (this.previousA !== null) result = this.previousA && !A;
        this.previousA = A;
        break;
    }
    
    return {
      result,
      inverse: !result,
      value: numericValue,
      variable: result && this.properties.setVariable ? result : null
    };
  }
  
  restore(state) {
    if (state.properties) {
      Object.assign(this.properties, state.properties);
      this.inputs = [];
      for (let i = 0; i < this.properties.inputCount; i++) {
        this.inputs.push(`in${i}`);
      }
    }
  }
}

// ============================================================================
// PUSHBUTTON / TOGGLE NODE
// ============================================================================
class PushbuttonNode {
  static type = 'PushbuttonNode';
  
  constructor(id, properties = {}) {
    this.id = id;
    this.type = PushbuttonNode.type;
    this.properties = {
      state: false,
      pulseMode: false,
      ...properties
    };
    this.inputs = [];
    this.outputs = ['state'];
  }
  
  process() {
    return { state: this.properties.state };
  }
  
  restore(state) {
    if (state.properties) Object.assign(this.properties, state.properties);
  }
}

// ============================================================================
// REGISTER ALL NODES
// ============================================================================
function register(registry) {
  registry.register('AllInOneColorNode', AllInOneColorNode);
  registry.register('ColorGradientNode', ColorGradientNode);
  registry.register('ComparisonNode', ComparisonNode);
  registry.register('ConditionalIntegerOutputNode', ConditionalIntegerOutputNode);
  registry.register('ConditionalSwitchNode', ConditionalSwitchNode);
  registry.register('DateComparisonNode', DateComparisonNode);
  registry.register('DayOfWeekComparisonNode', DayOfWeekComparisonNode);
  registry.register('IntegerSelectorNode', IntegerSelectorNode);
  // Also register as "Integer Selector" (label alias)
  registry.register('Integer Selector', IntegerSelectorNode);
  registry.register('LogicConditionNode', LogicConditionNode);
  registry.register('LogicOperationsNode', LogicOperationsNode);
  registry.register('PushbuttonNode', PushbuttonNode);
  // Also register as "Toggle" alias
  registry.register('Toggle', PushbuttonNode);
}

module.exports = {
  register,
  AllInOneColorNode,
  ColorGradientNode,
  ComparisonNode,
  ConditionalIntegerOutputNode,
  ConditionalSwitchNode,
  DateComparisonNode,
  DayOfWeekComparisonNode,
  IntegerSelectorNode,
  LogicConditionNode,
  LogicOperationsNode,
  PushbuttonNode,
  ColorUtils
};
