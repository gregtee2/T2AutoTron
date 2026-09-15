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

    const DEVICE_COMMAND_PHASES = Object.freeze({
        IDLE: 'idle',
        PENDING: 'pending',
        CONFIRMED: 'confirmed',
        RETRYING: 'retrying',
        DELEGATED: 'delegated',
        FAILED: 'failed'
    });

    function createDeviceCommandState() {
        return {
            desiredState: null,
            observedState: null,
            pendingCommand: null,
            phase: DEVICE_COMMAND_PHASES.IDLE,
            attempt: 0,
            lastError: null,
            confirmationDueAt: null,
            nextRetryAt: null,
            intentVersion: 0,
            activeCommand: null,
            mustCompensate: false,
            observedAt: null,
            updatedAt: null
        };
    }

    function setDesiredDeviceState(state, desiredState, now = Date.now()) {
        const next = { ...(state || createDeviceCommandState()) };
        if (desiredState === undefined || desiredState === null) {
            if (next.desiredState !== null) next.intentVersion = (next.intentVersion || 0) + 1;
            next.desiredState = null;
            next.pendingCommand = null;
            next.phase = DEVICE_COMMAND_PHASES.IDLE;
            next.attempt = 0;
            next.lastError = null;
            next.confirmationDueAt = null;
            next.nextRetryAt = null;
            next.mustCompensate = false;
            next.updatedAt = now;
            return next;
        }

        const desired = !!desiredState;
        const desiredChanged = next.desiredState !== desired;
        const supersedesCommand = desiredChanged && (
            next.activeCommand?.desiredState !== undefined && next.activeCommand.desiredState !== desired ||
            next.pendingCommand !== null && next.pendingCommand !== desired
        );
        if (desiredChanged) next.intentVersion = (next.intentVersion || 0) + 1;
        next.desiredState = desired;
        if (supersedesCommand) next.mustCompensate = true;
        next.updatedAt = now;

        if (next.observedState === desired && !next.mustCompensate) {
            next.pendingCommand = null;
            next.phase = DEVICE_COMMAND_PHASES.CONFIRMED;
            next.attempt = 0;
            next.confirmationDueAt = null;
            next.nextRetryAt = null;
        } else if (
            desiredChanged ||
            next.phase === DEVICE_COMMAND_PHASES.IDLE ||
            next.phase === DEVICE_COMMAND_PHASES.CONFIRMED
        ) {
            next.pendingCommand = desired;
            next.phase = DEVICE_COMMAND_PHASES.PENDING;
            next.attempt = 0;
            next.lastError = null;
            next.confirmationDueAt = null;
            next.nextRetryAt = null;
        }
        return next;
    }

    function recordObservedDeviceState(state, observedState, now = Date.now()) {
        const next = { ...(state || createDeviceCommandState()) };
        if (observedState === undefined || observedState === null) return next;

        const observed = !!observedState;
        next.observedState = observed;
        next.observedAt = now;
        next.updatedAt = now;
        const activeOpposesDesired = next.activeCommand && next.activeCommand.desiredState !== next.desiredState;
        const pendingOpposesDesired = next.pendingCommand !== null && next.pendingCommand !== next.desiredState;
        if (next.desiredState === observed && !next.mustCompensate && !activeOpposesDesired && !pendingOpposesDesired) {
            next.pendingCommand = null;
            next.phase = DEVICE_COMMAND_PHASES.CONFIRMED;
            next.attempt = 0;
            next.lastError = null;
            next.confirmationDueAt = null;
            next.nextRetryAt = null;
        } else if (
            next.desiredState !== null &&
            (next.phase === DEVICE_COMMAND_PHASES.IDLE || next.phase === DEVICE_COMMAND_PHASES.CONFIRMED)
        ) {
            next.pendingCommand = next.desiredState;
            next.phase = DEVICE_COMMAND_PHASES.PENDING;
            next.confirmationDueAt = null;
            next.nextRetryAt = null;
        }
        return next;
    }

    function isExternalDeviceOverride(state, observedState) {
        const observed = normalizeObservedPowerState(observedState);
        if (!state || observed === null || state.activeCommand) return false;
        return state.phase === DEVICE_COMMAND_PHASES.CONFIRMED &&
            state.desiredState !== null &&
            state.observedState === state.desiredState &&
            observed !== state.desiredState;
    }

    function adoptObservedDeviceState(state, observedState, now = Date.now()) {
        const observed = normalizeObservedPowerState(observedState);
        if (observed === null) return { ...(state || createDeviceCommandState()) };
        const observedStateResult = recordObservedDeviceState(state, observed, now);
        return setDesiredDeviceState(observedStateResult, undefined, now);
    }

    function beginDeviceCommand(state, now = Date.now()) {
        const next = { ...(state || createDeviceCommandState()) };
        if (next.desiredState === null || next.desiredState === undefined) {
            return { state: next, command: null };
        }

        const command = {
            intentVersion: next.intentVersion || 0,
            desiredState: next.desiredState,
            issuedAt: now
        };
        next.activeCommand = command;
        next.pendingCommand = next.desiredState;
        next.phase = DEVICE_COMMAND_PHASES.PENDING;
        next.confirmationDueAt = null;
        next.nextRetryAt = null;
        next.updatedAt = now;
        return { state: next, command };
    }

    function rearmDeviceCommandState(state, now = Date.now()) {
        const next = { ...(state || createDeviceCommandState()) };
        if (next.desiredState === null || next.desiredState === undefined) return next;

        next.updatedAt = now;
        next.lastError = null;
        next.attempt = 0;
        next.confirmationDueAt = null;
        next.nextRetryAt = null;
        if (next.observedState === next.desiredState) {
            next.pendingCommand = null;
            next.phase = DEVICE_COMMAND_PHASES.CONFIRMED;
        } else {
            next.pendingCommand = next.desiredState;
            next.phase = DEVICE_COMMAND_PHASES.PENDING;
        }
        return next;
    }

    function normalizeDeviceCommandResult(result) {
        const success = result?.success === true;
        const skipped = result?.skipped === true;
        const retryable = result?.retryable !== false && !skipped;
        return {
            success,
            skipped,
            retryable: success ? false : retryable,
            reason: result?.reason || result?.error || (success ? null : 'command_failed')
        };
    }

    function isRetryableHttpStatus(status) {
        const code = Number(status);
        return code === 408 || code === 409 || code === 425 || code === 429 || code >= 500;
    }

    function normalizeObservedPowerState(value) {
        if (value === undefined || value === null) return null;
        if (typeof value === 'boolean') return value;

        const rawState = typeof value === 'object' ? value.state : value;
        if (typeof rawState === 'string') {
            const state = rawState.trim().toLowerCase();
            if (state === 'unavailable' || state === 'unknown' || state === '') return null;
            if (state === 'on' || state === 'open' || state === 'opening' || state === 'playing') return true;
            if (
                state === 'off' || state === 'closed' || state === 'closing' ||
                state === 'idle' || state === 'paused' || state === 'standby'
            ) return false;
        }

        if (typeof value === 'object' && typeof value.on === 'boolean') return value.on;
        return null;
    }

    function recordDeviceCommandResult(state, result, now = Date.now()) {
        const next = { ...(state || createDeviceCommandState()) };
        const normalized = normalizeDeviceCommandResult(result);
        const command = result?.commandToken || next.activeCommand;
        next.updatedAt = now;

        const staleCommand = command && (
            command.intentVersion !== next.intentVersion ||
            command.desiredState !== next.desiredState
        );
        if (staleCommand) {
            if (
                next.activeCommand?.intentVersion === command.intentVersion &&
                next.activeCommand?.desiredState === command.desiredState
            ) next.activeCommand = null;
            if (normalized.success && next.desiredState !== null) {
                next.mustCompensate = true;
                next.pendingCommand = next.desiredState;
                next.phase = DEVICE_COMMAND_PHASES.PENDING;
                next.confirmationDueAt = null;
                next.nextRetryAt = null;
            }
            return next;
        }

        if (command) next.activeCommand = null;

        if (
            next.desiredState !== null &&
            next.desiredState !== undefined &&
            next.observedState === next.desiredState &&
            (!command || (next.observedAt !== null && next.observedAt >= command.issuedAt))
        ) {
            next.pendingCommand = null;
            next.phase = DEVICE_COMMAND_PHASES.CONFIRMED;
            next.attempt = 0;
            next.confirmationDueAt = null;
            next.nextRetryAt = null;
            next.lastError = null;
            next.mustCompensate = false;
        } else if (normalized.skipped) {
            next.pendingCommand = null;
            next.phase = DEVICE_COMMAND_PHASES.DELEGATED;
            next.confirmationDueAt = null;
            next.nextRetryAt = null;
            next.lastError = normalized.reason || 'delegated';
        } else if (normalized.success) {
            next.mustCompensate = false;
            next.pendingCommand = next.desiredState;
            next.phase = DEVICE_COMMAND_PHASES.PENDING;
            next.confirmationDueAt = now + (result?.confirmAfterMs ?? 2500);
            next.nextRetryAt = null;
            next.lastError = null;
        } else if (normalized.retryable) {
            next.pendingCommand = next.desiredState;
            next.phase = DEVICE_COMMAND_PHASES.RETRYING;
            next.attempt = (next.attempt || 0) + 1;
            const retryDelay = result?.retryAfterMs ?? Math.min(2000 * (2 ** (next.attempt - 1)), 60000);
            next.confirmationDueAt = null;
            next.nextRetryAt = now + retryDelay;
            next.lastError = normalized.reason;
        } else {
            next.pendingCommand = null;
            next.phase = DEVICE_COMMAND_PHASES.FAILED;
            next.confirmationDueAt = null;
            next.nextRetryAt = null;
            next.lastError = normalized.reason;
        }
        return next;
    }

    function shouldIssueDeviceCommand(state, now = Date.now()) {
        if (!state || state.desiredState === null || state.desiredState === undefined) return false;
        if (state.phase === DEVICE_COMMAND_PHASES.DELEGATED || state.phase === DEVICE_COMMAND_PHASES.FAILED) return false;
        if (state.activeCommand) return false;
        if (state.mustCompensate) return true;
        if (state.phase === DEVICE_COMMAND_PHASES.RETRYING) return now >= (state.nextRetryAt || 0);
        if (state.phase === DEVICE_COMMAND_PHASES.PENDING) {
            return state.confirmationDueAt === null || state.confirmationDueAt === undefined || now >= state.confirmationDueAt;
        }
        return state.observedState !== state.desiredState;
    }

    // Export for both Node.js and browser
    exports.normalizeHSVInput = normalizeHSVInput;
    exports.convertBrightness = convertBrightness;
    exports.determineTriggerAction = determineTriggerAction;
    exports.buildHAPayload = buildHAPayload;
    exports.DEVICE_COMMAND_PHASES = DEVICE_COMMAND_PHASES;
    exports.createDeviceCommandState = createDeviceCommandState;
    exports.setDesiredDeviceState = setDesiredDeviceState;
    exports.recordObservedDeviceState = recordObservedDeviceState;
    exports.isExternalDeviceOverride = isExternalDeviceOverride;
    exports.adoptObservedDeviceState = adoptObservedDeviceState;
    exports.rearmDeviceCommandState = rearmDeviceCommandState;
    exports.beginDeviceCommand = beginDeviceCommand;
    exports.normalizeDeviceCommandResult = normalizeDeviceCommandResult;
    exports.isRetryableHttpStatus = isRetryableHttpStatus;
    exports.normalizeObservedPowerState = normalizeObservedPowerState;
    exports.recordDeviceCommandResult = recordDeviceCommandResult;
    exports.shouldIssueDeviceCommand = shouldIssueDeviceCommand;

})(typeof exports !== 'undefined' ? exports : (window.T2SharedLogic = window.T2SharedLogic || {}));
