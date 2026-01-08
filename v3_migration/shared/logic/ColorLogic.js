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
     * @returns {object} { h, s, v } where h is 0-360, s and v are 0-1
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

        return { h, s, v };
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

    // Export for both Node.js and browser
    exports.clamp = clamp;
    exports.lerp = lerp;
    exports.hsvToRgb = hsvToRgb;
    exports.rgbToHsv = rgbToHsv;
    exports.mixColors = mixColors;
    exports.hsvToCss = hsvToCss;
    exports.parseColor = parseColor;

})(typeof exports !== 'undefined' ? exports : (window.T2SharedLogic = window.T2SharedLogic || {}));
