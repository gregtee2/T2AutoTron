// ColorUtilsPlugin.js - Shared color conversion utilities for backend plugins
// This file must be loaded BEFORE other color-related plugins
// Exposes window.ColorUtils for use by HSVControlNode, HSVModifierNode, etc.

(function() {
    // Debug: console.log("[ColorUtilsPlugin] Loading shared...");

    const ColorUtils = {
        /**
         * RGB to HSV conversion
         * @param {number} r - Red (0-255)
         * @param {number} g - Green (0-255)
         * @param {number} b - Blue (0-255)
         * @returns {{hue: number, sat: number, val: number}} - hue (0-1), sat (0-1), val (0-1)
         */
        rgbToHsv: (r, g, b) => {
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

        /**
         * HSV to RGB conversion
         * @param {number} h - Hue (0-1)
         * @param {number} s - Saturation (0-1)
         * @param {number} v - Value/Brightness (0-1)
         * @returns {number[]} - [r, g, b] each 0-255
         */
        hsvToRgb: (h, s, v) => {
            const i = Math.floor(h * 6), f = h * 6 - i;
            const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
            let r, g, b;
            switch (i % 6) {
                case 0: r = v; g = t; b = p; break;
                case 1: r = q; g = v; b = p; break;
                case 2: r = p; g = v; b = t; break;
                case 3: r = p; g = q; b = v; break;
                case 4: r = t; g = p; b = v; break;
                case 5: r = v; g = p; b = q; break;
            }
            return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
        },

        /**
         * HSV to RGB conversion with degree/percentage inputs
         * Convenience wrapper for nodes that use degrees (0-360) and percentages (0-100)
         * @param {number} hDegrees - Hue (0-360)
         * @param {number} sPercent - Saturation (0-100)
         * @param {number} vPercent - Value/Brightness (0-100)
         * @returns {{r: number, g: number, b: number}} - RGB object with values 0-255
         */
        hsvToRgbDegrees: (hDegrees, sPercent, vPercent) => {
            const [r, g, b] = ColorUtils.hsvToRgb(hDegrees / 360, sPercent / 100, vPercent / 100);
            return { r, g, b };
        },

        /**
         * Kelvin color temperature to RGB
         * @param {number} kelvin - Color temperature (1000-40000)
         * @returns {{r: number, g: number, b: number}} - RGB values 0-255
         */
        kelvinToRGB: (kelvin) => {
            kelvin = Math.max(1000, Math.min(40000, kelvin));
            const t = kelvin / 100;
            let r, g, b;
            if (t <= 66) r = 255;
            else { r = t - 60; r = 329.698727446 * Math.pow(r, -0.1332047592); r = Math.max(0, Math.min(255, r)); }
            if (t <= 66) { g = 99.4708025861 * Math.log(t) - 161.1195681661; }
            else { g = 288.1221695283 * Math.pow(t - 60, -0.0755148492); }
            g = Math.max(0, Math.min(255, g));
            if (t >= 66) b = 255;
            else if (t <= 19) b = 0;
            else { b = 138.5177312231 * Math.log(t - 10) - 305.0447927307; }
            b = Math.max(0, Math.min(255, b));
            return { r: Math.round(r), g: Math.round(g), b: Math.round(b) };
        },

        /**
         * Kelvin to HSV conversion
         * @param {number} k - Color temperature in Kelvin
         * @returns {{hue: number, saturation: number, brightness: number}} - hue (0-360), saturation (0-100), brightness (default 254)
         */
        kelvinToHSV: (k) => {
            const { r, g, b } = ColorUtils.kelvinToRGB(k);
            const { hue, sat } = ColorUtils.rgbToHsv(r, g, b);
            return { 
                hue: Math.round(hue * 360), 
                saturation: Math.round(sat * 100),
                brightness: 254 // Default brightness for Kelvin conversion
            };
        },

        /**
         * Hex color string to RGB
         * @param {string} hex - Hex color string (with or without #)
         * @returns {{r: number, g: number, b: number}}
         */
        hexToRgb: (hex) => {
            const s = hex.replace("#", "");
            return {
                r: parseInt(s.substr(0, 2), 16),
                g: parseInt(s.substr(2, 2), 16),
                b: parseInt(s.substr(4, 2), 16)
            };
        },

        /**
         * RGB to Hex color string
         * @param {number} r - Red (0-255)
         * @param {number} g - Green (0-255)
         * @param {number} b - Blue (0-255)
         * @returns {string} - Hex color string with #
         */
        rgbToHex: (r, g, b) => {
            return '#' + [r, g, b].map(x => {
                const hex = Math.round(x).toString(16);
                return hex.length === 1 ? '0' + hex : hex;
            }).join('');
        },

        /**
         * Linear interpolation helper
         * @param {number} v - Current value
         * @param {number} minV - Minimum input value
         * @param {number} maxV - Maximum input value
         * @param {number} start - Output start value
         * @param {number} end - Output end value
         * @returns {number}
         */
        interpolate: (v, minV, maxV, start, end) => {
            return start + ((v - minV) / (maxV - minV)) * (end - start);
        },

        /**
         * Clamp a value between min and max
         * @param {number} value 
         * @param {number} min 
         * @param {number} max 
         * @returns {number}
         */
        clamp: (value, min, max) => {
            return Math.max(min, Math.min(max, value));
        },

        // -------------------------------------------------------------------------
        // OKLAB COLOR SPACE - Perceptually uniform color mixing
        // Added 2026-01-09 for vibrant gradients (red→green through yellows, not browns)
        // -------------------------------------------------------------------------

        /**
         * Convert RGB to Oklab color space
         * Oklab is perceptually uniform - equal steps feel equally different to humans
         * @param {number} r - Red (0-255)
         * @param {number} g - Green (0-255)
         * @param {number} b - Blue (0-255)
         * @returns {{L: number, a: number, b: number}} - Oklab components
         */
        rgbToOklab: (r, g, b) => {
            // Normalize to 0-1
            r /= 255; g /= 255; b /= 255;
            
            // sRGB to linear RGB
            const toLinear = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
            const lr = toLinear(r), lg = toLinear(g), lb = toLinear(b);
            
            // Linear RGB to LMS
            const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
            const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
            const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;
            
            // LMS to Oklab
            const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
            return {
                L: 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
                a: 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
                b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
            };
        },

        /**
         * Convert Oklab to RGB color space
         * @param {number} L - Lightness (0-1)
         * @param {number} a - Green-red axis
         * @param {number} b - Blue-yellow axis
         * @returns {{r: number, g: number, b: number}} - RGB values 0-255
         */
        oklabToRgb: (L, a, b) => {
            // Oklab to LMS
            const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
            const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
            const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
            
            const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
            
            // LMS to linear RGB
            const lr = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
            const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
            const lb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
            
            // Linear RGB to sRGB
            const toSrgb = (c) => c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1/2.4) - 0.055;
            
            return {
                r: Math.round(Math.max(0, Math.min(255, toSrgb(lr) * 255))),
                g: Math.round(Math.max(0, Math.min(255, toSrgb(lg) * 255))),
                b: Math.round(Math.max(0, Math.min(255, toSrgb(lb) * 255)))
            };
        },

        /**
         * Mix two colors in Oklab space for perceptually uniform blending
         * Unlike RGB mixing, this produces vibrant intermediate colors
         * (red→green goes through yellow/orange, not muddy brown)
         * @param {object} color1 - First color {r, g, b}
         * @param {object} color2 - Second color {r, g, b}
         * @param {number} t - Blend factor (0 = color1, 1 = color2)
         * @returns {{r: number, g: number, b: number}} - Blended RGB color
         */
        mixColorsOklab: (color1, color2, t) => {
            const ok1 = ColorUtils.rgbToOklab(color1.r, color1.g, color1.b);
            const ok2 = ColorUtils.rgbToOklab(color2.r, color2.g, color2.b);
            
            // Linear interpolation in Oklab space
            const L = ok1.L + t * (ok2.L - ok1.L);
            const a = ok1.a + t * (ok2.a - ok1.a);
            const b = ok1.b + t * (ok2.b - ok1.b);
            
            return ColorUtils.oklabToRgb(L, a, b);
        }
    };

    // Expose globally for other plugins
    window.ColorUtils = ColorUtils;
    
    // console.log("[ColorUtilsPlugin] Shared color utilities loaded successfully");
})();
