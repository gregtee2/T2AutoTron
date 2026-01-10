/**
 * ColorLogic.js
 * 
 * Shared color conversion and manipulation functions.
 * Used by both frontend and backend.
 */

(function(exports) {
    'use strict';

    /**
     * Clamp a value between min and max
     */
    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    /**
     * Linear interpolation
     */
    function lerp(a, b, t) {
        return a + (b - a) * t;
    }

    /**
     * Convert HSV to RGB
     * @param {number} h - Hue (0-360)
     * @param {number} s - Saturation (0-1)
     * @param {number} v - Value/Brightness (0-1)
     * @returns {object} { r, g, b } each 0-255
     */
    function hsvToRgb(h, s, v) {
        h = ((h % 360) + 360) % 360; // Normalize to 0-360
        s = clamp(s, 0, 1);
        v = clamp(v, 0, 1);

        const c = v * s;
        const x = c * (1 - Math.abs((h / 60) % 2 - 1));
        const m = v - c;

        let r, g, b;
        if (h < 60) { r = c; g = x; b = 0; }
        else if (h < 120) { r = x; g = c; b = 0; }
        else if (h < 180) { r = 0; g = c; b = x; }
        else if (h < 240) { r = 0; g = x; b = c; }
        else if (h < 300) { r = x; g = 0; b = c; }
        else { r = c; g = 0; b = x; }

        return {
            r: Math.round((r + m) * 255),
            g: Math.round((g + m) * 255),
            b: Math.round((b + m) * 255)
        };
    }

    /**
     * Convert RGB to HSV
     * @param {number} r - Red (0-255)
     * @param {number} g - Green (0-255)
     * @param {number} b - Blue (0-255)
     * @returns {object} { h, s, v, hue, sat, val } where:
     *   - h is 0-360 (degrees), s and v are 0-1
     *   - hue is 0-1 (normalized), sat and val are 0-1 (aliases for backwards compatibility)
     */
    function rgbToHsv(r, g, b) {
        r /= 255;
        g /= 255;
        b /= 255;

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const d = max - min;

        let h = 0;
        const s = max === 0 ? 0 : d / max;
        const v = max;

        if (d !== 0) {
            switch (max) {
                case r: h = ((g - b) / d + (g < b ? 6 : 0)) * 60; break;
                case g: h = ((b - r) / d + 2) * 60; break;
                case b: h = ((r - g) / d + 4) * 60; break;
            }
        }

        // Return both formats for backwards compatibility:
        // - h/s/v: standard format (h in degrees 0-360)
        // - hue/sat/val: legacy format used by some nodes (hue normalized 0-1)
        return { 
            h, s, v,
            hue: h / 360,  // Normalized 0-1 for nodes expecting this format
            sat: s,
            val: v
        };
    }

    /**
     * Mix two colors
     * @param {object} color1 - { r, g, b } or { h, s, v }
     * @param {object} color2 - { r, g, b } or { h, s, v }
     * @param {number} ratio - Mix ratio (0 = color1, 1 = color2)
     * @param {string} mode - 'rgb' or 'hsv'
     * @returns {object} Mixed color in same format as input
     */
    function mixColors(color1, color2, ratio, mode = 'rgb') {
        ratio = clamp(ratio, 0, 1);

        if (mode === 'hsv') {
            // Mix in HSV space (better for hue transitions)
            return {
                h: lerp(color1.h || 0, color2.h || 0, ratio),
                s: lerp(color1.s || 0, color2.s || 0, ratio),
                v: lerp(color1.v || 0, color2.v || 0, ratio)
            };
        }

        // Mix in RGB space
        return {
            r: Math.round(lerp(color1.r || 0, color2.r || 0, ratio)),
            g: Math.round(lerp(color1.g || 0, color2.g || 0, ratio)),
            b: Math.round(lerp(color1.b || 0, color2.b || 0, ratio))
        };
    }

    /**
     * Convert HSV object to CSS color string
     * @param {object} hsv - { h, s, v } or { hue, saturation, brightness }
     * @returns {string} CSS color string
     */
    function hsvToCss(hsv) {
        const h = hsv.h ?? hsv.hue ?? 0;
        const s = hsv.s ?? hsv.saturation ?? 1;
        const v = hsv.v ?? (hsv.brightness !== undefined ? hsv.brightness / 255 : 1);
        const rgb = hsvToRgb(h, s, v);
        return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
    }

    /**
     * Parse a color string to RGB
     * @param {string} colorStr - hex (#fff, #ffffff) or rgb(r,g,b)
     * @returns {object} { r, g, b }
     */
    function parseColor(colorStr) {
        if (!colorStr) return { r: 0, g: 0, b: 0 };
        
        // Hex format
        if (colorStr.startsWith('#')) {
            let hex = colorStr.slice(1);
            if (hex.length === 3) {
                hex = hex.split('').map(c => c + c).join('');
            }
            return {
                r: parseInt(hex.slice(0, 2), 16),
                g: parseInt(hex.slice(2, 4), 16),
                b: parseInt(hex.slice(4, 6), 16)
            };
        }
        
        // RGB format
        const match = colorStr.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (match) {
            return {
                r: parseInt(match[1]),
                g: parseInt(match[2]),
                b: parseInt(match[3])
            };
        }
        
        return { r: 0, g: 0, b: 0 };
    }

    // =========================================================================
    // OKLAB COLOR SPACE - Perceptually Uniform Color Interpolation
    // =========================================================================
    // Oklab (2020) produces smoother, more natural color gradients than RGB/HSV.
    // Red → Green goes through vibrant yellows instead of muddy browns.
    // Reference: https://bottosson.github.io/posts/oklab/

    /**
     * Convert sRGB to linear RGB (remove gamma correction)
     */
    function srgbToLinear(c) {
        return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }

    /**
     * Convert linear RGB to sRGB (apply gamma correction)
     */
    function linearToSrgb(c) {
        return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    }

    /**
     * Convert RGB (0-255) to Oklab
     * @param {number} r - Red (0-255)
     * @param {number} g - Green (0-255)
     * @param {number} b - Blue (0-255)
     * @returns {object} { L, a, b } where L is 0-1, a and b are roughly -0.4 to 0.4
     */
    function rgbToOklab(r, g, b) {
        // Normalize and linearize
        const lr = srgbToLinear(r / 255);
        const lg = srgbToLinear(g / 255);
        const lb = srgbToLinear(b / 255);

        // RGB to LMS (cone response)
        const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
        const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
        const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

        // Cube root
        const l_ = Math.cbrt(l);
        const m_ = Math.cbrt(m);
        const s_ = Math.cbrt(s);

        // LMS to Oklab
        return {
            L: 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
            a: 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
            b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
        };
    }

    /**
     * Convert Oklab to RGB (0-255)
     * @param {number} L - Lightness (0-1)
     * @param {number} a - Green-red axis (roughly -0.4 to 0.4)
     * @param {number} b - Blue-yellow axis (roughly -0.4 to 0.4)
     * @returns {object} { r, g, b } each 0-255
     */
    function oklabToRgb(L, a, b) {
        // Oklab to LMS
        const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
        const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
        const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

        // Cube
        const l = l_ * l_ * l_;
        const m = m_ * m_ * m_;
        const s = s_ * s_ * s_;

        // LMS to linear RGB
        const lr = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
        const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
        const lb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

        // Apply gamma and scale to 0-255
        return {
            r: Math.round(clamp(linearToSrgb(lr), 0, 1) * 255),
            g: Math.round(clamp(linearToSrgb(lg), 0, 1) * 255),
            b: Math.round(clamp(linearToSrgb(lb), 0, 1) * 255)
        };
    }

    /**
     * Interpolate between two RGB colors in Oklab space (perceptually uniform)
     * This produces much smoother gradients than RGB or HSV interpolation.
     * @param {object} color1 - { r, g, b } each 0-255
     * @param {object} color2 - { r, g, b } each 0-255
     * @param {number} t - Interpolation factor (0 = color1, 1 = color2)
     * @returns {object} { r, g, b } each 0-255
     */
    function mixColorsOklab(color1, color2, t) {
        t = clamp(t, 0, 1);
        
        // Convert to Oklab
        const lab1 = rgbToOklab(color1.r || 0, color1.g || 0, color1.b || 0);
        const lab2 = rgbToOklab(color2.r || 0, color2.g || 0, color2.b || 0);
        
        // Linear interpolation in Oklab space
        const L = lerp(lab1.L, lab2.L, t);
        const a = lerp(lab1.a, lab2.a, t);
        const b = lerp(lab1.b, lab2.b, t);
        
        // Convert back to RGB
        return oklabToRgb(L, a, b);
    }

    // Export for both Node.js and browser
    exports.clamp = clamp;
    exports.lerp = lerp;
    exports.hsvToRgb = hsvToRgb;
    exports.rgbToHsv = rgbToHsv;
    exports.mixColors = mixColors;
    exports.hsvToCss = hsvToCss;
    exports.parseColor = parseColor;
    // Oklab functions
    exports.rgbToOklab = rgbToOklab;
    exports.oklabToRgb = oklabToRgb;
    exports.mixColorsOklab = mixColorsOklab;

})(typeof exports !== 'undefined' ? exports : (window.T2SharedLogic = window.T2SharedLogic || {}));
