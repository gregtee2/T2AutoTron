/**
 * SplineTimelineColor.node.js - Unified Node Definition
 * 
 * Time-based color output with spline-controlled brightness and saturation.
 * 
 * 🦴 Caveman Summary:
 * This node is like a smart color painter that changes colors over time.
 * You tell it:
 * - A time range (e.g., 6am to 10pm, or a 30-minute timer)
 * - A brightness curve (when should lights be bright/dim)
 * - A saturation curve (how vivid should colors be)
 * - A color scheme (rainbow or custom colors)
 * 
 * As time moves through the range, the node outputs the appropriate
 * HSV color values. Connect this to lights for automatic color transitions!
 * 
 * DESIGN: This is a pure calculation node. Given the current time/position,
 * it calculates the HSV output by:
 * 1. Determining position (0-1) based on range mode
 * 2. Evaluating brightness curve at that position
 * 3. Evaluating saturation curve at that position
 * 4. Calculating hue from position (rainbow) or color stops (custom)
 * 5. Returning the final HSV values
 * 
 * NOTE: This depends on T2Spline's evaluate() function for curve calculations.
 * The spline library handles catmull-rom and linear interpolation.
 */

module.exports = {
  // === IDENTITY ===
  id: 'SplineTimelineColorNode',
  version: '1.0.0',
  
  // === POC FLAG ===
  hidden: true,
  
  // === UI METADATA ===
  label: 'Timeline Color',
  category: 'Color',
  icon: '🎨',
  color: '#e91e63',
  width: 420,
  height: 500,
  helpText: `Time-based color output with spline control.

Modes:
• Numerical: Position from input value (0-100 → 0-1)
• Time: Position from wall clock (start time → end time)
• Timer: Position from triggered timer duration

Edit the brightness and saturation curves to control how the output changes over time.`,

  // === INPUTS ===
  inputs: {
    value: {
      type: 'number',
      label: 'Value',
      description: 'Numerical input for position (used in numerical mode)'
    },
    trigger: {
      type: 'boolean',
      label: 'Trigger',
      description: 'Start/stop timer (used in timer mode)'
    },
    timerDuration: {
      type: 'number',
      label: 'Timer Duration',
      description: 'Override timer duration (used in timer mode)'
    },
    startTime: {
      type: 'string',
      label: 'Start Time',
      description: 'Override start time as "H:MM AM/PM" (used in time mode)'
    },
    endTime: {
      type: 'string',
      label: 'End Time',
      description: 'Override end time as "H:MM AM/PM" (used in time mode)'
    }
  },

  // === OUTPUTS ===
  outputs: {
    hsvInfo: {
      type: 'object',
      label: 'HSV Info',
      description: '{ hue: 0-1, saturation: 0-1, brightness: 0-254, rgb: {r,g,b} }'
    }
  },

  // === CONFIGURABLE PROPERTIES ===
  properties: {
    // Spline curves
    points: {
      type: 'array',
      default: [{ x: 0, y: 0.8 }, { x: 0.5, y: 1 }, { x: 1, y: 0.8 }],
      label: 'Brightness Points',
      description: 'Spline control points for brightness curve'
    },
    saturationPoints: {
      type: 'array',
      default: [{ x: 0, y: 1 }, { x: 0.5, y: 1 }, { x: 1, y: 1 }],
      label: 'Saturation Points',
      description: 'Spline control points for saturation curve'
    },
    interpolation: {
      type: 'select',
      default: 'catmull-rom',
      options: ['catmull-rom', 'linear'],
      label: 'Interpolation',
      description: 'Curve interpolation type'
    },
    
    // Range mode
    rangeMode: {
      type: 'select',
      default: 'time',
      options: ['numerical', 'time', 'timer'],
      label: 'Range Mode',
      description: 'How position is calculated'
    },
    
    // Numerical mode settings
    startValue: {
      type: 'number',
      default: 0,
      label: 'Start Value',
      description: 'Minimum input value (maps to position 0)'
    },
    endValue: {
      type: 'number',
      default: 100,
      label: 'End Value',
      description: 'Maximum input value (maps to position 1)'
    },
    
    // Time mode settings
    startTimeHours: { type: 'number', default: 8, label: 'Start Hour' },
    startTimeMinutes: { type: 'number', default: 0, label: 'Start Minute' },
    startTimePeriod: { type: 'select', default: 'AM', options: ['AM', 'PM'], label: 'Start AM/PM' },
    endTimeHours: { type: 'number', default: 6, label: 'End Hour' },
    endTimeMinutes: { type: 'number', default: 0, label: 'End Minute' },
    endTimePeriod: { type: 'select', default: 'PM', options: ['AM', 'PM'], label: 'End AM/PM' },
    
    // Timer mode settings
    timerDurationValue: {
      type: 'number',
      default: 1,
      label: 'Timer Duration',
      description: 'Default timer duration'
    },
    timerUnit: {
      type: 'select',
      default: 'hours',
      options: ['seconds', 'minutes', 'hours'],
      label: 'Timer Unit'
    },
    timerLoopMode: {
      type: 'select',
      default: 'none',
      options: ['none', 'loop', 'ping-pong'],
      label: 'Loop Mode',
      description: 'What happens when timer completes'
    },
    
    // Color settings
    colorMode: {
      type: 'select',
      default: 'rainbow',
      options: ['rainbow', 'custom'],
      label: 'Color Mode'
    },
    colorStops: {
      type: 'array',
      default: [
        { position: 0, rgb: { r: 255, g: 100, b: 0 } },
        { position: 1, rgb: { r: 0, g: 100, b: 255 } }
      ],
      label: 'Color Stops',
      description: 'Custom color gradient stops'
    },
    
    // Preview mode
    previewMode: {
      type: 'boolean',
      default: false,
      label: 'Preview Mode'
    },
    previewPosition: {
      type: 'number',
      default: 0,
      label: 'Preview Position'
    },
    
    // Output throttling
    outputStepInterval: {
      type: 'number',
      default: 1000,
      label: 'Output Interval (ms)',
      description: 'Minimum time between output updates'
    }
  },

  // === INTERNAL STATE ===
  internalState: {
    timerStart: null,
    pingPongDirection: 1,
    lastOutputTime: 0,
    lastOutputHsv: null,
    position: 0,
    isInRange: false
  },

  // === HELPER: Clamp value to range ===
  _clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  },

  // === HELPER: Parse time string "H:MM AM/PM" ===
  _parseTimeInput(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return null;
    const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!match) return null;
    return {
      hours: parseInt(match[1], 10),
      minutes: parseInt(match[2], 10),
      period: match[3].toUpperCase()
    };
  },

  // === HELPER: Parse time to Date ===
  _parseTimeString(hours, minutes, period) {
    const now = new Date();
    let parsedHours = parseInt(hours, 10);
    const parsedMinutes = parseInt(minutes, 10);
    const isPM = period.toUpperCase() === 'PM';
    if (isNaN(parsedHours) || isNaN(parsedMinutes)) return null;
    if (parsedHours < 1 || parsedHours > 12 || parsedMinutes < 0 || parsedMinutes > 59) return null;
    if (isPM && parsedHours < 12) parsedHours += 12;
    if (!isPM && parsedHours === 12) parsedHours = 0;
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), parsedHours, parsedMinutes, 0);
  },

  // === HELPER: Hue to RGB ===
  _hueToRgb(hue) {
    const h = hue / 360;
    const s = 0.8, l = 0.5;
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return {
      r: Math.round(hue2rgb(p, q, h + 1/3) * 255),
      g: Math.round(hue2rgb(p, q, h) * 255),
      b: Math.round(hue2rgb(p, q, h - 1/3) * 255)
    };
  },

  // === HELPER: RGB to HSV ===
  _rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
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
    return { hue: h, sat: s, val: max };
  },

  // === HELPER: Evaluate spline (simplified linear fallback) ===
  // The real implementation uses T2Spline.evaluate() but we need a fallback
  _evaluateSpline(points, x, interpolation) {
    if (!points || points.length === 0) return 0.5;
    if (points.length === 1) return points[0].y;
    
    // Sort points by x
    const sorted = [...points].sort((a, b) => a.x - b.x);
    
    // Clamp x to range
    if (x <= sorted[0].x) return sorted[0].y;
    if (x >= sorted[sorted.length - 1].x) return sorted[sorted.length - 1].y;
    
    // Find surrounding points
    for (let i = 0; i < sorted.length - 1; i++) {
      if (x >= sorted[i].x && x <= sorted[i + 1].x) {
        const t = (x - sorted[i].x) / (sorted[i + 1].x - sorted[i].x);
        // Linear interpolation (catmull-rom would need more complex calculation)
        return sorted[i].y + t * (sorted[i + 1].y - sorted[i].y);
      }
    }
    
    return sorted[sorted.length - 1].y;
  },

  // === THE ACTUAL LOGIC ===
  /**
   * Execute function - calculates HSV output based on current position
   * 
   * @param {Object} inputs - Input values
   * @param {Object} properties - Current property values
   * @param {Object} context - Runtime context with:
   *   - context.now() - current time as Date
   *   - context.splineEvaluate - optional: T2Spline.evaluate function
   * @param {Object} state - Internal state that persists across executions
   * @returns {Object} - Output values { hsvInfo }
   */
  execute(inputs, properties, context, state) {
    // Get current time
    const now = context?.now ? context.now() : new Date();
    const currentMs = now.getTime();
    
    // Get inputs (handle array format from Rete)
    const inputValue = inputs.value?.[0] ?? inputs.value;
    const trigger = inputs.trigger?.[0] ?? inputs.trigger;
    const timerDurationInput = inputs.timerDuration?.[0] ?? inputs.timerDuration;
    const startTimeInput = inputs.startTime?.[0] ?? inputs.startTime;
    const endTimeInput = inputs.endTime?.[0] ?? inputs.endTime;
    
    let position = 0;
    state.isInRange = false;
    
    // Use preview position if in preview mode
    if (properties.previewMode && typeof properties.previewPosition === 'number') {
      position = this._clamp(properties.previewPosition, 0, 1);
      state.isInRange = true;
    } else {
      // Calculate position based on range mode
      switch (properties.rangeMode) {
        case 'numerical': {
          if (inputValue !== undefined) {
            const startVal = properties.startValue || 0;
            const endVal = properties.endValue || 100;
            const clamped = Math.max(startVal, Math.min(endVal, inputValue));
            position = (clamped - startVal) / (endVal - startVal);
            state.isInRange = true;
          } else {
            position = 0;
            state.isInRange = false;
          }
          break;
        }
        
        case 'time': {
          // Parse start/end times (allow input override)
          let startProps = {
            hours: properties.startTimeHours,
            minutes: properties.startTimeMinutes,
            period: properties.startTimePeriod
          };
          let endProps = {
            hours: properties.endTimeHours,
            minutes: properties.endTimeMinutes,
            period: properties.endTimePeriod
          };
          
          if (startTimeInput) {
            const parsed = this._parseTimeInput(startTimeInput);
            if (parsed) startProps = parsed;
          }
          if (endTimeInput) {
            const parsed = this._parseTimeInput(endTimeInput);
            if (parsed) endProps = parsed;
          }
          
          const startTime = this._parseTimeString(startProps.hours, startProps.minutes, startProps.period);
          let endTime = this._parseTimeString(endProps.hours, endProps.minutes, endProps.period);
          
          if (!startTime || !endTime) {
            position = 0;
            state.isInRange = false;
          } else {
            let startMs = startTime.getTime();
            let endMs = endTime.getTime();
            
            // Handle overnight spans
            if (endMs <= startMs) {
              endTime.setDate(endTime.getDate() + 1);
              endMs = endTime.getTime();
            }
            
            if (currentMs >= startMs && currentMs <= endMs) {
              position = (currentMs - startMs) / (endMs - startMs);
              state.isInRange = true;
            } else if (currentMs > endMs) {
              position = 1;
              state.isInRange = false;
            } else {
              position = 0;
              state.isInRange = false;
            }
          }
          break;
        }
        
        case 'timer': {
          // Timer mode: triggered by boolean input
          if (trigger && !state.timerStart) {
            state.timerStart = currentMs;
            state.pingPongDirection = 1;
          }
          
          if (!state.timerStart) {
            position = 0;
            state.isInRange = false;
          } else if (!trigger) {
            // Timer stopped
            state.timerStart = null;
            state.pingPongDirection = 1;
            position = 0;
            state.isInRange = false;
          } else {
            // Calculate unit multiplier
            let unitMultiplier;
            switch (properties.timerUnit) {
              case 'hours': unitMultiplier = 3600000; break;
              case 'minutes': unitMultiplier = 60000; break;
              default: unitMultiplier = 1000; break;
            }
            
            const timerDuration = (timerDurationInput !== undefined && !isNaN(timerDurationInput) && timerDurationInput > 0)
              ? timerDurationInput
              : (properties.timerDurationValue || 1);
            
            const durationMs = timerDuration * unitMultiplier;
            const elapsed = currentMs - state.timerStart;
            const loopMode = properties.timerLoopMode || 'none';
            
            if (elapsed >= durationMs) {
              // Timer completed
              state.isInRange = true;
              
              if (loopMode === 'loop') {
                state.timerStart = currentMs;
                position = 0;
              } else if (loopMode === 'ping-pong') {
                state.pingPongDirection *= -1;
                state.timerStart = currentMs;
                position = state.pingPongDirection === 1 ? 0 : 1;
              } else {
                position = 1;
                state.timerStart = null;
              }
            } else {
              const rawPosition = elapsed / durationMs;
              position = state.pingPongDirection === 1 ? rawPosition : (1 - rawPosition);
              state.isInRange = true;
            }
          }
          break;
        }
      }
      
      position = this._clamp(position, 0, 1);
    }
    
    state.position = position;
    
    // Get spline evaluate function (prefer context-provided one)
    const evaluate = context?.splineEvaluate || this._evaluateSpline.bind(this);
    
    // Calculate brightness from curve
    const curveValue = evaluate(properties.points || [], position, properties.interpolation);
    const brightness = Math.round(this._clamp(curveValue, 0, 1) * 254);
    
    // Calculate saturation from curve
    const satCurveValue = properties.saturationPoints
      ? evaluate(properties.saturationPoints, position, properties.interpolation)
      : 1;
    const saturation = this._clamp(satCurveValue, 0, 1);
    
    // Calculate color
    let rgb, hue;
    const colorStops = properties.colorStops || [];
    
    if (properties.colorMode === 'custom' && Array.isArray(colorStops) && colorStops.length >= 2) {
      // Custom color stops - interpolate in RGB space
      const stops = [...colorStops].sort((a, b) => a.position - b.position);
      
      if (position <= stops[0].position) {
        rgb = stops[0].rgb || this._hueToRgb(stops[0].hue || 0);
      } else if (position >= stops[stops.length - 1].position) {
        rgb = stops[stops.length - 1].rgb || this._hueToRgb(stops[stops.length - 1].hue || 0);
      } else {
        // Find and interpolate between stops
        for (let i = 0; i < stops.length - 1; i++) {
          if (position >= stops[i].position && position <= stops[i + 1].position) {
            const t = (position - stops[i].position) / (stops[i + 1].position - stops[i].position);
            const rgb1 = stops[i].rgb || this._hueToRgb(stops[i].hue || 0);
            const rgb2 = stops[i + 1].rgb || this._hueToRgb(stops[i + 1].hue || 0);
            rgb = {
              r: Math.round(rgb1.r + t * (rgb2.r - rgb1.r)),
              g: Math.round(rgb1.g + t * (rgb2.g - rgb1.g)),
              b: Math.round(rgb1.b + t * (rgb2.b - rgb1.b))
            };
            break;
          }
        }
        if (!rgb) {
          rgb = stops[stops.length - 1].rgb || this._hueToRgb(stops[stops.length - 1].hue || 0);
        }
      }
    } else {
      // Rainbow mode - hue from position
      hue = position;
      rgb = this._hueToRgb(position * 360);
    }
    
    // Compute HSV from RGB
    const hsv = this._rgbToHsv(rgb.r, rgb.g, rgb.b);
    
    // Apply saturation curve to HSV saturation
    const finalSaturation = hsv.sat * saturation;
    
    // Scale RGB by brightness
    const brightnessScale = brightness / 255;
    
    // Desaturate RGB based on saturation curve
    const gray = (rgb.r + rgb.g + rgb.b) / 3;
    const desaturatedRgb = {
      r: Math.round((rgb.r * saturation + gray * (1 - saturation)) * brightnessScale),
      g: Math.round((rgb.g * saturation + gray * (1 - saturation)) * brightnessScale),
      b: Math.round((rgb.b * saturation + gray * (1 - saturation)) * brightnessScale)
    };
    
    // Build output
    const newHsv = {
      hue: hsv.hue,
      saturation: finalSaturation,
      brightness: brightness,
      rgb: desaturatedRgb
    };
    
    // Throttling - check if we should update
    const stepInterval = properties.outputStepInterval || 1000;
    const timeSinceLastOutput = currentMs - (state.lastOutputTime || 0);
    
    const hsvChanged = !state.lastOutputHsv ||
      Math.abs(newHsv.hue - state.lastOutputHsv.hue) > 0.01 ||
      Math.abs(newHsv.saturation - state.lastOutputHsv.saturation) > 0.01 ||
      Math.abs(newHsv.brightness - state.lastOutputHsv.brightness) > 2;
    
    if (timeSinceLastOutput >= stepInterval || !state.lastOutputHsv) {
      state.lastOutputTime = currentMs;
      state.lastOutputHsv = { ...newHsv };
      return { hsvInfo: newHsv };
    } else if (hsvChanged && timeSinceLastOutput >= 100) {
      // Allow faster updates if values changed significantly
      state.lastOutputTime = currentMs;
      state.lastOutputHsv = { ...newHsv };
      return { hsvInfo: newHsv };
    } else {
      // Return last output to avoid flooding
      return { hsvInfo: state.lastOutputHsv || newHsv };
    }
  },

  // === OPTIONAL: Validation ===
  validate(properties) {
    const errors = [];
    
    if (!properties.points || properties.points.length < 2) {
      errors.push('Brightness curve needs at least 2 points');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
};
