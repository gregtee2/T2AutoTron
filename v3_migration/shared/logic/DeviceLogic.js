/**
 * DeviceLogic.js
 * 
 * Shared logic for device control - HSV conversion, brightness scaling.
 * Used by HAGenericDeviceNode and backend HADeviceNodes.
 */

(function(exports) {
    'use strict';

    /**
     * Convert various HSV input formats to HA's hs_color format
     * @param {object} info - HSV input in various formats
     * @returns {object} { hs_color: [hue_degrees, saturation_percent], brightness: 0-255 }
     */
    function normalizeHSVInput(info) {
        if (!info || typeof info !== 'object') {
            return { hs_color: null, brightness: null, colorTemp: null };
        }

        let hs_color = null;
        let brightness = null;
        let colorTemp = null;

        // Color temp mode
        if (info.mode === 'temp' && info.colorTemp) {
            colorTemp = info.colorTemp;
        } else {
            // HSV mode - handle various input formats
            if (Array.isArray(info.hs_color)) {
                // Already in HA format [hue_degrees, saturation_percent]
                hs_color = info.hs_color;
            } else if (info.h !== undefined && info.s !== undefined) {
                // Shorthand format { h: degrees, s: 0-1 }
                hs_color = [info.h, (info.s ?? 0) * 100];
            } else if (info.hue !== undefined && info.saturation !== undefined) {
                // Full format { hue: 0-1, saturation: 0-1 }
                hs_color = [info.hue * 360, info.saturation * 100];
            }
        }

        // Brightness - convert various formats to HA's 0-255
        if (info.brightness !== undefined) {
            brightness = info.brightness;
        } else if (info.v !== undefined) {
            brightness = Math.round((info.v ?? 0) * 255);
        }

        // Clamp brightness - HSV should never turn off a device (min 1)
        if (brightness !== null && brightness < 1) {
            brightness = 1;
        }

        return { hs_color, brightness, colorTemp };
    }

    /**
     * Convert brightness between scales
     * @param {number} value - Brightness value
     * @param {string} from - Source scale: 'ha' (0-255), 'percent' (0-100), 'normalized' (0-1)
     * @param {string} to - Target scale
     * @returns {number}
     */
    function convertBrightness(value, from, to) {
        if (value === null || value === undefined) return null;

        // First convert to normalized (0-1)
        let normalized;
        switch (from) {
            case 'ha': normalized = value / 255; break;
            case 'percent': normalized = value / 100; break;
            case 'normalized': normalized = value; break;
            default: normalized = value / 255;
        }

        // Clamp to valid range
        normalized = Math.max(0, Math.min(1, normalized));

        // Convert to target scale
        switch (to) {
            case 'ha': return Math.round(normalized * 255);
            case 'percent': return Math.round(normalized * 100);
            case 'normalized': return normalized;
            default: return Math.round(normalized * 255);
        }
    }

    /**
     * Determine trigger action based on mode and current state
     * @param {string} mode - 'follow', 'toggle', 'on', 'off', 'pulse'
     * @param {boolean} trigger - Current trigger value
     * @param {boolean} lastTrigger - Previous trigger value
     * @param {boolean} currentlyOn - Current device state
     * @returns {object} { action: 'on'|'off'|null, isPulse: boolean }
     */
    function determineTriggerAction(mode, trigger, lastTrigger, currentlyOn) {
        const isRisingEdge = trigger && !lastTrigger;
        const isFallingEdge = !trigger && lastTrigger;

        switch (mode) {
            case 'follow':
                if (trigger && !currentlyOn) return { action: 'on', isPulse: false };
                if (!trigger && currentlyOn) return { action: 'off', isPulse: false };
                return { action: null, isPulse: false };

            case 'toggle':
                if (isRisingEdge) {
                    return { action: currentlyOn ? 'off' : 'on', isPulse: false };
                }
                return { action: null, isPulse: false };

            case 'on':
                if (isRisingEdge && !currentlyOn) return { action: 'on', isPulse: false };
                return { action: null, isPulse: false };

            case 'off':
                if (isRisingEdge && currentlyOn) return { action: 'off', isPulse: false };
                return { action: null, isPulse: false };

            case 'pulse':
                if (isRisingEdge) return { action: 'on', isPulse: true };
                return { action: null, isPulse: false };

            default:
                return { action: null, isPulse: false };
        }
    }

    /**
     * Build HA service call payload from normalized values
     * @param {object} options
     * @returns {object} HA-compatible payload
     */
    function buildHAPayload(options) {
        const { 
            action, 
            hs_color, 
            brightness, 
            colorTemp, 
            transition,
            isLight = true 
        } = options;

        const payload = {};

        if (action === 'on') {
            payload.on = true;
            payload.state = 'on';
        } else if (action === 'off') {
            payload.on = false;
            payload.state = 'off';
        }

        if (isLight) {
            if (colorTemp) {
                payload.color_temp_kelvin = colorTemp;
            } else if (hs_color) {
                payload.hs_color = hs_color;
            }
            if (brightness !== null && brightness !== undefined) {
                payload.brightness = brightness;
            }
            if (transition !== undefined) {
                payload.transition = transition / 1000; // ms to seconds
            }
        }

        return payload;
    }

    // Export for both Node.js and browser
    exports.normalizeHSVInput = normalizeHSVInput;
    exports.convertBrightness = convertBrightness;
    exports.determineTriggerAction = determineTriggerAction;
    exports.buildHAPayload = buildHAPayload;

})(typeof exports !== 'undefined' ? exports : (window.T2SharedLogic = window.T2SharedLogic || {}));
