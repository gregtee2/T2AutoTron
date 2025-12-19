/**
 * ColorNodes.js - Backend color processing nodes
 * 
 * Provides server-side color calculation for automations:
 * - SplineTimelineColorNode - Time-based color curves
 * - HSVToRGBNode - HSV to RGB conversion
 * - RGBToHSVNode - RGB to HSV conversion
 * - ColorMixerNode - Blend two colors
 */

'use strict';

// =========================================================================
// SPLINE MATH (ported from 00_SplineBasePlugin.js)
// =========================================================================

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function cubicBezier(p0, p1, p2, p3, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    const mt = 1 - t;
    const mt2 = mt * mt;
    const mt3 = mt2 * mt;
    return mt3 * p0 + 3 * mt2 * t * p1 + 3 * mt * t2 * p2 + t3 * p3;
}

function catmullRom(p0, p1, p2, p3, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    return 0.5 * (
        (2 * p1) +
        (-p0 + p2) * t +
        (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
        (-p0 + 3 * p1 - 3 * p2 + p3) * t3
    );
}

function findSegment(points, x) {
    for (let i = 0; i < points.length - 1; i++) {
        if (x >= points[i].x && x <= points[i + 1].x) {
            return i;
        }
    }
    return points.length - 2;
}

/**
 * Evaluate curve at x position
 */
function evaluate(points, x, interpolation = 'catmull-rom') {
    if (!points || points.length === 0) return x;
    if (points.length === 1) return points[0].y;

    x = clamp(x, 0, 1);
    const segIdx = findSegment(points, x);
    const p1 = points[segIdx];
    const p2 = points[segIdx + 1];

    const segmentWidth = p2.x - p1.x;
    if (segmentWidth === 0) return p1.y;
    const t = (x - p1.x) / segmentWidth;

    switch (interpolation) {
        case 'linear':
            return lerp(p1.y, p2.y, t);
        case 'step':
            return t < 0.5 ? p1.y : p2.y;
        case 'bezier':
            const h1 = p1.handleOut || { x: p1.x + segmentWidth * 0.33, y: p1.y };
            const h2 = p2.handleIn || { x: p2.x - segmentWidth * 0.33, y: p2.y };
            return cubicBezier(p1.y, h1.y, h2.y, p2.y, t);
        case 'catmull-rom':
        default:
            const p0 = points[Math.max(0, segIdx - 1)];
            const p3 = points[Math.min(points.length - 1, segIdx + 2)];
            return catmullRom(p0.y, p1.y, p2.y, p3.y, t);
    }
}

// =========================================================================
// COLOR CONVERSION UTILITIES
// =========================================================================

/**
 * Convert HSL hue to RGB
 */
function hueToRgb(hue) {
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
}

/**
 * Convert RGB to HSV
 */
function rgbToHsv(r, g, b) {
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
}

/**
 * Convert HSV to RGB
 */
function hsvToRgb(h, s, v) {
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
    
    return {
        r: Math.round(r * 255),
        g: Math.round(g * 255),
        b: Math.round(b * 255)
    };
}

/**
 * Parse time string "HH:MM" to minutes since midnight
 */
/**
 * Parse time from various formats to minutes-since-midnight
 * Supports: "17:30" (24h), "5:30 PM" (12h), frontend properties (hours/minutes/period)
 * @param {string|object} timeInput - Either "HH:MM" string, "H:MM AM/PM" string, OR { hours, minutes, period } object
 * @param {object} props - Properties object (optional) to check for startTimeHours/Minutes/Period format
 * @param {string} which - 'start' or 'end' to pick correct property keys
 * @returns {number} Minutes since midnight (0-1439)
 */
function parseTime(timeInput, props = null, which = null) {
    // If we have props and which, try frontend format first
    if (props && which) {
        const hoursKey = which === 'start' ? 'startTimeHours' : 'endTimeHours';
        const minsKey = which === 'start' ? 'startTimeMinutes' : 'endTimeMinutes';
        const periodKey = which === 'start' ? 'startTimePeriod' : 'endTimePeriod';
        
        if (props[hoursKey] !== undefined) {
            let hours = parseInt(props[hoursKey], 10) || 0;
            const minutes = parseInt(props[minsKey], 10) || 0;
            const period = (props[periodKey] || 'AM').toUpperCase();
            
            // Convert 12-hour to 24-hour
            if (period === 'PM' && hours < 12) hours += 12;
            if (period === 'AM' && hours === 12) hours = 0;
            
            return hours * 60 + minutes;
        }
    }
    
    // Fall back to string format
    if (!timeInput) return 0;
    if (typeof timeInput === 'string') {
        // Check for 12-hour format with AM/PM (e.g., "5:30 PM" or "10:00 AM")
        const ampmMatch = timeInput.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
        if (ampmMatch) {
            let h = parseInt(ampmMatch[1], 10);
            const m = parseInt(ampmMatch[2], 10);
            const period = ampmMatch[3].toUpperCase();
            
            // Convert 12-hour to 24-hour
            if (period === 'AM' && h === 12) h = 0;
            else if (period === 'PM' && h !== 12) h += 12;
            
            return h * 60 + m;
        }
        
        // 24-hour format "HH:MM"
        const [h, m] = timeInput.split(':').map(Number);
        return (h || 0) * 60 + (m || 0);
    }
    
    return 0;
}

// =========================================================================
// SPLINE TIMELINE COLOR NODE
// =========================================================================

class SplineTimelineColorNode {
    constructor() {
        this.id = null;
        this.type = 'SplineTimelineColorNode';
        this.inputs = ['trigger', 'value', 'timerDuration', 'startTime', 'endTime'];
        this.outputs = ['hsvInfo'];
        
        // Default properties
        this.properties = {
            rangeMode: 'time',           // 'numerical', 'time', 'timer'
            startTime: '06:00',
            endTime: '22:00',
            startValue: 0,               // Numerical mode start
            endValue: 100,               // Numerical mode end
            colorMode: 'rainbow',        // 'rainbow' or 'custom'
            colorStops: [],              // Array of { position, hue, rgb }
            points: [                    // Brightness curve
                { x: 0, y: 0, id: 'p0' },
                { x: 1, y: 1, id: 'p1' }
            ],
            saturationPoints: [          // Saturation curve
                { x: 0, y: 1, id: 's0' },
                { x: 1, y: 1, id: 's1' }
            ],
            interpolation: 'catmull-rom',
            outputStepInterval: 1000,
            timerDuration: 60000,        // Default 1 minute for timer mode
            position: 0,
            isInRange: false
        };
        
        // Timer state
        this.timerStart = null;
        this.timerPaused = false;
        this.lastTrigger = false;
        this.pingPongDirection = 1;
        
        // Throttle state
        this.lastOutputTime = 0;
        this.lastOutputHsv = null;
    }
    
    /**
     * Process inputs and calculate HSV output
     */
    data(inputs) {
        const currentMs = Date.now();
        let position = 0;
        
        // Get input values - inputs are arrays from gatherInputs()
        const inputValue = inputs.value?.[0] ?? null;
        const trigger = inputs.trigger?.[0] ?? false;
        const timerDuration = inputs.timerDuration?.[0] ?? this.properties.timerDuration;
        const startTimeInput = inputs.startTime?.[0] ?? this.properties.startTime;
        const endTimeInput = inputs.endTime?.[0] ?? this.properties.endTime;
        
        // Calculate position based on mode
        if (this.properties.rangeMode === 'numerical') {
            // Numerical mode: map input value from startValue-endValue range to 0-1
            if (inputValue !== null && inputValue !== undefined) {
                const startVal = this.properties.startValue ?? 0;
                const endVal = this.properties.endValue ?? 100;
                const range = endVal - startVal;
                if (range !== 0) {
                    const clamped = Math.max(startVal, Math.min(endVal, Number(inputValue)));
                    position = (clamped - startVal) / range;
                } else {
                    position = 0;
                }
                this.properties.isInRange = true;
                // Clear any previous null-input warning
                this._nullInputWarned = false;
            } else {
                position = 0;
                this.properties.isInRange = false;
                // Log warning when numerical mode has no input (but only once per null-streak to avoid spam)
                if (!this._nullInputWarned) {
                    console.warn(`[SplineTimelineColorNode ${this.id?.slice(0,8) || 'unknown'}] Numerical mode but value input is ${inputValue} - position forced to 0`);
                    this._nullInputWarned = true;
                }
            }
            
        } else if (this.properties.rangeMode === 'time') {
            // Time mode: position based on current time within range
            const now = new Date();
            const currentMinutes = now.getHours() * 60 + now.getMinutes();
            
            // Try input values first (from connected nodes), then frontend properties format, then string defaults
            const startMinutes = inputs.startTime?.[0] 
                ? parseTime(inputs.startTime[0]) 
                : parseTime(null, this.properties, 'start');
            const endMinutes = inputs.endTime?.[0] 
                ? parseTime(inputs.endTime[0]) 
                : parseTime(null, this.properties, 'end');
            
            if (startMinutes < endMinutes) {
                // Normal range (e.g., 06:00 - 22:00)
                if (currentMinutes >= startMinutes && currentMinutes <= endMinutes) {
                    position = (currentMinutes - startMinutes) / (endMinutes - startMinutes);
                    this.properties.isInRange = true;
                } else {
                    position = currentMinutes < startMinutes ? 0 : 1;
                    this.properties.isInRange = false;
                }
            } else {
                // Overnight range (e.g., 22:00 - 06:00)
                const totalSpan = (1440 - startMinutes) + endMinutes;
                if (currentMinutes >= startMinutes || currentMinutes <= endMinutes) {
                    const elapsed = currentMinutes >= startMinutes 
                        ? currentMinutes - startMinutes 
                        : (1440 - startMinutes) + currentMinutes;
                    position = elapsed / totalSpan;
                    this.properties.isInRange = true;
                } else {
                    position = 0;
                    this.properties.isInRange = false;
                }
            }
            
        } else if (this.properties.rangeMode === 'timer') {
            // Timer mode: position based on elapsed time since trigger
            const durationMs = Number(timerDuration) || 60000;
            const loopMode = this.properties.timerLoopMode || 'none';
            
            // Handle trigger edge detection
            if (trigger && !this.lastTrigger) {
                // Rising edge - start/restart timer
                this.timerStart = currentMs;
                this.timerPaused = false;
                this.pingPongDirection = 1; // Reset to forward on new trigger
            }
            this.lastTrigger = trigger;
            
            if (this.timerStart && !this.timerPaused) {
                const elapsed = currentMs - this.timerStart;
                
                if (elapsed >= durationMs) {
                    // Timer completed one cycle
                    if (loopMode === 'loop') {
                        // Loop mode: restart from beginning
                        this.timerStart = currentMs;
                        position = 0;
                        this.properties.isInRange = true;
                    } else if (loopMode === 'ping-pong') {
                        // Ping-pong mode: reverse direction and restart
                        this.pingPongDirection *= -1;
                        this.timerStart = currentMs;
                        position = this.pingPongDirection === 1 ? 0 : 1;
                        this.properties.isInRange = true;
                    } else {
                        // No loop: stay at end position
                        position = 1;
                        this.properties.isInRange = false;
                        // Only restart if trigger is still true (legacy behavior)
                        if (trigger === true) {
                            this.timerStart = currentMs;
                        }
                    }
                } else {
                    // Calculate position based on direction (for ping-pong)
                    const rawPosition = elapsed / durationMs;
                    if (this.pingPongDirection === 1) {
                        position = rawPosition;  // Forward: 0 -> 1
                    } else {
                        position = 1 - rawPosition;  // Backward: 1 -> 0
                    }
                    this.properties.isInRange = true;
                }
            }
        }
        
        position = clamp(position, 0, 1);
        this.properties.position = position;
        
        // Calculate outputs from curves
        const curveValue = evaluate(this.properties.points, position, this.properties.interpolation);
        const brightness = Math.round(clamp(curveValue, 0, 1) * 254);
        
        // Saturation from curve
        const saturationCurveValue = this.properties.saturationPoints 
            ? evaluate(this.properties.saturationPoints, position, this.properties.interpolation)
            : 1;
        const saturation = clamp(saturationCurveValue, 0, 1);
        
        // Calculate color from position
        let rgb;
        const colorStops = this.properties.colorStops || [];
        
        if (this.properties.colorMode === 'custom' && colorStops.length >= 2) {
            // Custom color stops - RGB interpolation
            const stops = [...colorStops].sort((a, b) => a.position - b.position);
            
            if (position <= stops[0].position) {
                rgb = stops[0].rgb || hueToRgb(stops[0].hue || 0);
            } else if (position >= stops[stops.length - 1].position) {
                rgb = stops[stops.length - 1].rgb || hueToRgb(stops[stops.length - 1].hue || 0);
            } else {
                // Interpolate between stops
                for (let i = 0; i < stops.length - 1; i++) {
                    if (position >= stops[i].position && position <= stops[i + 1].position) {
                        const t = (position - stops[i].position) / (stops[i + 1].position - stops[i].position);
                        const rgb1 = stops[i].rgb || hueToRgb(stops[i].hue || 0);
                        const rgb2 = stops[i + 1].rgb || hueToRgb(stops[i + 1].hue || 0);
                        rgb = {
                            r: Math.round(rgb1.r + t * (rgb2.r - rgb1.r)),
                            g: Math.round(rgb1.g + t * (rgb2.g - rgb1.g)),
                            b: Math.round(rgb1.b + t * (rgb2.b - rgb1.b))
                        };
                        break;
                    }
                }
                if (!rgb) {
                    rgb = stops[stops.length - 1].rgb || hueToRgb(stops[stops.length - 1].hue || 0);
                }
            }
        } else {
            // Rainbow mode - hue from position
            rgb = hueToRgb(position * 360);
        }
        
        // Convert to HSV
        const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
        const finalSaturation = hsv.sat * saturation;
        
        // Apply brightness and saturation to RGB
        const brightnessScale = brightness / 255;
        const gray = (rgb.r + rgb.g + rgb.b) / 3;
        const desaturatedRgb = {
            r: Math.round((rgb.r * saturation + gray * (1 - saturation)) * brightnessScale),
            g: Math.round((rgb.g * saturation + gray * (1 - saturation)) * brightnessScale),
            b: Math.round((rgb.b * saturation + gray * (1 - saturation)) * brightnessScale)
        };
        
        // Final HSV output
        const newHsv = {
            hue: hsv.hue,
            saturation: finalSaturation,
            brightness: brightness,
            rgb: desaturatedRgb
        };
        
        // Throttle output
        const stepInterval = this.properties.outputStepInterval || 1000;
        const timeSinceLastOutput = currentMs - (this.lastOutputTime || 0);
        
        const hsvChanged = !this.lastOutputHsv || 
            Math.abs(newHsv.hue - this.lastOutputHsv.hue) > 0.01 ||
            Math.abs(newHsv.saturation - this.lastOutputHsv.saturation) > 0.01 ||
            Math.abs(newHsv.brightness - this.lastOutputHsv.brightness) > 2;
        
        if (timeSinceLastOutput >= stepInterval || !this.lastOutputHsv) {
            this.lastOutputTime = currentMs;
            this.lastOutputHsv = { ...newHsv };
        } else if (hsvChanged && timeSinceLastOutput >= 100) {
            this.lastOutputTime = currentMs;
            this.lastOutputHsv = { ...newHsv };
        }
        
        return { hsvInfo: this.lastOutputHsv || newHsv };
    }
    
    restore(state) {
        // Handle both { properties: {...} } format and direct properties format
        const props = state?.properties || state;
        if (props && typeof props === 'object') {
            Object.assign(this.properties, props);
        }
        
        // Force immediate output on restore - don't wait for throttle
        this.lastOutputTime = 0;
        this.lastOutputHsv = null;
    }
}

// =========================================================================
// HSV TO RGB NODE
// =========================================================================

class HSVToRGBNode {
    constructor() {
        this.id = null;
        this.type = 'HSVToRGBNode';
        this.inputs = ['hsvInfo', 'hue', 'saturation', 'brightness'];
        this.outputs = ['rgb', 'r', 'g', 'b'];
        this.properties = {};
    }
    
    data(inputs) {
        // Accept either hsvInfo object or individual H/S/V values
        const hsvInfo = inputs.hsvInfo;
        
        let h, s, v;
        if (hsvInfo) {
            h = hsvInfo.hue ?? 0;
            s = hsvInfo.saturation ?? 1;
            v = (hsvInfo.brightness ?? 254) / 254; // Normalize 0-254 to 0-1
        } else {
            h = inputs.hue ?? 0;
            s = inputs.saturation ?? 1;
            v = inputs.brightness ?? 1;
        }
        
        const rgb = hsvToRgb(h, s, v);
        
        return {
            rgb: rgb,
            r: rgb.r,
            g: rgb.g,
            b: rgb.b
        };
    }
    
    restore(state) {}
}

// =========================================================================
// RGB TO HSV NODE
// =========================================================================

class RGBToHSVNode {
    constructor() {
        this.id = null;
        this.type = 'RGBToHSVNode';
        this.inputs = ['rgb', 'r', 'g', 'b'];
        this.outputs = ['hsvInfo', 'hue', 'saturation', 'brightness'];
        this.properties = {};
    }
    
    data(inputs) {
        let r, g, b;
        
        if (inputs.rgb) {
            r = inputs.rgb.r ?? 0;
            g = inputs.rgb.g ?? 0;
            b = inputs.rgb.b ?? 0;
        } else {
            r = inputs.r ?? 0;
            g = inputs.g ?? 0;
            b = inputs.b ?? 0;
        }
        
        const hsv = rgbToHsv(r, g, b);
        
        return {
            hsvInfo: {
                hue: hsv.hue,
                saturation: hsv.sat,
                brightness: Math.round(hsv.val * 254),
                rgb: { r, g, b }
            },
            hue: hsv.hue,
            saturation: hsv.sat,
            brightness: Math.round(hsv.val * 254)
        };
    }
    
    restore(state) {}
}

// =========================================================================
// COLOR MIXER NODE
// =========================================================================

class ColorMixerNode {
    constructor() {
        this.id = null;
        this.type = 'ColorMixerNode';
        this.inputs = ['color1', 'color2', 'mix'];
        this.outputs = ['hsvInfo'];
        this.properties = {
            mixAmount: 0.5
        };
    }
    
    data(inputs) {
        const color1 = inputs.color1 || { hue: 0, saturation: 1, brightness: 254 };
        const color2 = inputs.color2 || { hue: 0.5, saturation: 1, brightness: 254 };
        const mix = inputs.mix ?? this.properties.mixAmount;
        
        // Linear interpolation in HSV space
        // Handle hue wrapping (shortest path)
        let hueDiff = color2.hue - color1.hue;
        if (hueDiff > 0.5) hueDiff -= 1;
        if (hueDiff < -0.5) hueDiff += 1;
        
        let hue = color1.hue + hueDiff * mix;
        if (hue < 0) hue += 1;
        if (hue > 1) hue -= 1;
        
        const saturation = lerp(color1.saturation, color2.saturation, mix);
        const brightness = lerp(color1.brightness, color2.brightness, mix);
        
        // Generate RGB from mixed HSV
        const rgb = hsvToRgb(hue, saturation, brightness / 254);
        
        return {
            hsvInfo: {
                hue,
                saturation,
                brightness: Math.round(brightness),
                rgb
            }
        };
    }
    
    restore(state) {
        // Handle both { properties: {...} } format and direct properties format
        const props = state?.properties || state;
        if (props?.mixAmount !== undefined) {
            this.properties.mixAmount = props.mixAmount;
        }
    }
}

// =========================================================================
// REGISTER NODES
// =========================================================================

function register(registry) {
    registry.register('SplineTimelineColorNode', SplineTimelineColorNode);
    registry.register('HSVToRGBNode', HSVToRGBNode);
    registry.register('RGBToHSVNode', RGBToHSVNode);
    registry.register('ColorMixerNode', ColorMixerNode);
    
    console.log('[ColorNodes] Registered: SplineTimelineColorNode, HSVToRGBNode, RGBToHSVNode, ColorMixerNode');
}

module.exports = { register };
