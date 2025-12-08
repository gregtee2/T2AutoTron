// ColorUtils.test.js - Tests for color conversion utilities

const ColorUtils = require('./utils/ColorUtils');

describe('ColorUtils', () => {
    
    // =========================================================================
    // RGB to HSV
    // =========================================================================
    describe('rgbToHsv', () => {
        test('converts pure red correctly', () => {
            const result = ColorUtils.rgbToHsv(255, 0, 0);
            expect(result.hue).toBeCloseTo(0, 2);
            expect(result.sat).toBeCloseTo(1, 2);
            expect(result.val).toBeCloseTo(1, 2);
        });

        test('converts pure green correctly', () => {
            const result = ColorUtils.rgbToHsv(0, 255, 0);
            expect(result.hue).toBeCloseTo(0.333, 2);
            expect(result.sat).toBeCloseTo(1, 2);
            expect(result.val).toBeCloseTo(1, 2);
        });

        test('converts pure blue correctly', () => {
            const result = ColorUtils.rgbToHsv(0, 0, 255);
            expect(result.hue).toBeCloseTo(0.666, 2);
            expect(result.sat).toBeCloseTo(1, 2);
            expect(result.val).toBeCloseTo(1, 2);
        });

        test('converts white correctly (no saturation)', () => {
            const result = ColorUtils.rgbToHsv(255, 255, 255);
            expect(result.sat).toBe(0);
            expect(result.val).toBe(1);
        });

        test('converts black correctly (no value)', () => {
            const result = ColorUtils.rgbToHsv(0, 0, 0);
            expect(result.val).toBe(0);
        });

        test('converts gray correctly (no saturation)', () => {
            const result = ColorUtils.rgbToHsv(128, 128, 128);
            expect(result.sat).toBe(0);
            expect(result.val).toBeCloseTo(0.502, 2);
        });
    });

    // =========================================================================
    // HSV to RGB
    // =========================================================================
    describe('hsvToRgb', () => {
        test('converts pure red correctly', () => {
            const [r, g, b] = ColorUtils.hsvToRgb(0, 1, 1);
            expect(r).toBe(255);
            expect(g).toBe(0);
            expect(b).toBe(0);
        });

        test('converts pure green correctly', () => {
            // Use exact 1/3 for green (120°)
            const [r, g, b] = ColorUtils.hsvToRgb(1/3, 1, 1);
            expect(r).toBe(0);
            expect(g).toBe(255);
            expect(b).toBe(0);
        });

        test('converts pure blue correctly', () => {
            // Use exact 2/3 for blue (240°)
            const [r, g, b] = ColorUtils.hsvToRgb(2/3, 1, 1);
            expect(r).toBe(0);
            expect(g).toBe(0);
            expect(b).toBe(255);
        });

        test('converts white correctly', () => {
            const [r, g, b] = ColorUtils.hsvToRgb(0, 0, 1);
            expect(r).toBe(255);
            expect(g).toBe(255);
            expect(b).toBe(255);
        });

        test('converts black correctly', () => {
            const [r, g, b] = ColorUtils.hsvToRgb(0, 0, 0);
            expect(r).toBe(0);
            expect(g).toBe(0);
            expect(b).toBe(0);
        });
    });

    // =========================================================================
    // HSV to RGB (Degrees/Percent)
    // =========================================================================
    describe('hsvToRgbDegrees', () => {
        test('converts 0° red correctly', () => {
            const { r, g, b } = ColorUtils.hsvToRgbDegrees(0, 100, 100);
            expect(r).toBe(255);
            expect(g).toBe(0);
            expect(b).toBe(0);
        });

        test('converts 120° green correctly', () => {
            const { r, g, b } = ColorUtils.hsvToRgbDegrees(120, 100, 100);
            expect(r).toBe(0);
            expect(g).toBe(255);
            expect(b).toBe(0);
        });

        test('converts 240° blue correctly', () => {
            const { r, g, b } = ColorUtils.hsvToRgbDegrees(240, 100, 100);
            expect(r).toBe(0);
            expect(g).toBe(0);
            expect(b).toBe(255);
        });

        test('handles 50% brightness', () => {
            const { r, g, b } = ColorUtils.hsvToRgbDegrees(0, 100, 50);
            expect(r).toBe(128);
            expect(g).toBe(0);
            expect(b).toBe(0);
        });
    });

    // =========================================================================
    // Hex Conversion
    // =========================================================================
    describe('hexToRgb', () => {
        test('converts #ff0000 to red', () => {
            const { r, g, b } = ColorUtils.hexToRgb('#ff0000');
            expect(r).toBe(255);
            expect(g).toBe(0);
            expect(b).toBe(0);
        });

        test('converts without # prefix', () => {
            const { r, g, b } = ColorUtils.hexToRgb('00ff00');
            expect(r).toBe(0);
            expect(g).toBe(255);
            expect(b).toBe(0);
        });

        test('converts #ffffff to white', () => {
            const { r, g, b } = ColorUtils.hexToRgb('#ffffff');
            expect(r).toBe(255);
            expect(g).toBe(255);
            expect(b).toBe(255);
        });
    });

    describe('rgbToHex', () => {
        test('converts red to #ff0000', () => {
            expect(ColorUtils.rgbToHex(255, 0, 0)).toBe('#ff0000');
        });

        test('converts green to #00ff00', () => {
            expect(ColorUtils.rgbToHex(0, 255, 0)).toBe('#00ff00');
        });

        test('converts blue to #0000ff', () => {
            expect(ColorUtils.rgbToHex(0, 0, 255)).toBe('#0000ff');
        });

        test('pads single digit values', () => {
            expect(ColorUtils.rgbToHex(0, 0, 0)).toBe('#000000');
        });
    });

    // =========================================================================
    // Round-trip conversion
    // =========================================================================
    describe('round-trip conversions', () => {
        test('RGB -> HSV -> RGB preserves values', () => {
            const originalR = 128, originalG = 64, originalB = 200;
            const hsv = ColorUtils.rgbToHsv(originalR, originalG, originalB);
            const [r, g, b] = ColorUtils.hsvToRgb(hsv.hue, hsv.sat, hsv.val);
            
            expect(r).toBeCloseTo(originalR, 0);
            expect(g).toBeCloseTo(originalG, 0);
            expect(b).toBeCloseTo(originalB, 0);
        });

        test('Hex -> RGB -> Hex preserves values', () => {
            const originalHex = '#3a7bd5';
            const { r, g, b } = ColorUtils.hexToRgb(originalHex);
            const resultHex = ColorUtils.rgbToHex(r, g, b);
            expect(resultHex).toBe(originalHex);
        });
    });

    // =========================================================================
    // Kelvin to RGB
    // =========================================================================
    describe('kelvinToRGB', () => {
        test('warm light (2700K) is orange-ish', () => {
            const { r, g, b } = ColorUtils.kelvinToRGB(2700);
            expect(r).toBe(255);
            expect(g).toBeLessThan(200);
            expect(b).toBeLessThan(150);
        });

        test('daylight (5000K) is white-ish', () => {
            const { r, g, b } = ColorUtils.kelvinToRGB(5000);
            expect(r).toBe(255);
            expect(g).toBeGreaterThan(200);
            expect(b).toBeGreaterThan(200);
        });

        test('cool light (6500K) has blue tint', () => {
            const { r, g, b } = ColorUtils.kelvinToRGB(6500);
            expect(r).toBe(255);
            expect(b).toBeGreaterThan(240); // Blue is high but not quite 255
        });

        test('clamps below 1000K', () => {
            const { r } = ColorUtils.kelvinToRGB(500);
            expect(r).toBe(255); // Same as 1000K
        });

        test('clamps above 40000K', () => {
            const result = ColorUtils.kelvinToRGB(50000);
            expect(result.r).toBeGreaterThan(0); // Should not crash
        });
    });

    // =========================================================================
    // Utility functions
    // =========================================================================
    describe('clamp', () => {
        test('clamps value below min', () => {
            expect(ColorUtils.clamp(-10, 0, 100)).toBe(0);
        });

        test('clamps value above max', () => {
            expect(ColorUtils.clamp(150, 0, 100)).toBe(100);
        });

        test('returns value within range', () => {
            expect(ColorUtils.clamp(50, 0, 100)).toBe(50);
        });
    });

    describe('interpolate', () => {
        test('interpolates at start', () => {
            expect(ColorUtils.interpolate(0, 0, 100, 0, 255)).toBe(0);
        });

        test('interpolates at end', () => {
            expect(ColorUtils.interpolate(100, 0, 100, 0, 255)).toBe(255);
        });

        test('interpolates at midpoint', () => {
            expect(ColorUtils.interpolate(50, 0, 100, 0, 255)).toBe(127.5);
        });
    });
});
