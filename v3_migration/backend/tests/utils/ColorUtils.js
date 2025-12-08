// ColorUtils.js - Testable version of color conversion utilities
// This is a Node.js-compatible export of the same logic in 00_ColorUtilsPlugin.js

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
     */
    hsvToRgbDegrees: (hDegrees, sPercent, vPercent) => {
        const [r, g, b] = ColorUtils.hsvToRgb(hDegrees / 360, sPercent / 100, vPercent / 100);
        return { r, g, b };
    },

    /**
     * Kelvin color temperature to RGB
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
     */
    kelvinToHSV: (k) => {
        const { r, g, b } = ColorUtils.kelvinToRGB(k);
        const { hue, sat } = ColorUtils.rgbToHsv(r, g, b);
        return { 
            hue: Math.round(hue * 360), 
            saturation: Math.round(sat * 100),
            brightness: 254
        };
    },

    /**
     * Hex color string to RGB
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
     */
    rgbToHex: (r, g, b) => {
        return '#' + [r, g, b].map(x => {
            const hex = Math.round(x).toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        }).join('');
    },

    /**
     * Linear interpolation helper
     */
    interpolate: (v, minV, maxV, start, end) => {
        return start + ((v - minV) / (maxV - minV)) * (end - start);
    },

    /**
     * Clamp a value between min and max
     */
    clamp: (value, min, max) => {
        return Math.max(min, Math.min(max, value));
    }
};

module.exports = ColorUtils;
