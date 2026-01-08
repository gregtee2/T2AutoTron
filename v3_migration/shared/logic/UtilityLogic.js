/**
 * UtilityLogic.js
 * 
 * Shared utility functions for Counter, Random, Math operations.
 * Used by both frontend and backend.
 */

(function(exports) {
    'use strict';

    /**
     * Counter logic
     * @param {object} state - Mutable state { count, lastTrigger, lastReset }
     * @param {object} props - { initial, step, threshold, autoReset }
     * @param {boolean} trigger - Trigger input (rising edge increments)
     * @param {boolean} reset - Reset input (rising edge resets)
     * @returns {object} { count, thresholdReached }
     */
    function processCounter(state, props, trigger, reset) {
        const { initial = 0, step = 1, threshold = 10, autoReset = false } = props;
        
        // Handle reset (rising edge)
        if (reset && !state.lastReset) {
            state.count = initial;
        }
        state.lastReset = !!reset;
        
        // Handle trigger (rising edge)
        let thresholdReached = false;
        if (trigger && !state.lastTrigger) {
            state.count = (state.count || initial) + step;
            
            if (state.count >= threshold) {
                thresholdReached = true;
                if (autoReset) {
                    state.count = initial;
                }
            }
        }
        state.lastTrigger = !!trigger;
        
        return {
            count: state.count || initial,
            thresholdReached
        };
    }

    /**
     * Generate random number
     * @param {number} min - Minimum value
     * @param {number} max - Maximum value
     * @param {boolean} integer - Round to integer
     * @returns {number}
     */
    function generateRandom(min, max, integer = true) {
        let value = min + Math.random() * (max - min);
        if (integer) {
            value = Math.round(value);
        }
        return value;
    }

    /**
     * Math operations
     */
    const mathOps = {
        add: (a, b) => a + b,
        subtract: (a, b) => a - b,
        multiply: (a, b) => a * b,
        divide: (a, b) => b !== 0 ? a / b : 0,
        modulo: (a, b) => b !== 0 ? a % b : 0,
        power: (a, b) => Math.pow(a, b),
        min: (a, b) => Math.min(a, b),
        max: (a, b) => Math.max(a, b),
        abs: (a) => Math.abs(a),
        floor: (a) => Math.floor(a),
        ceil: (a) => Math.ceil(a),
        round: (a) => Math.round(a),
        sqrt: (a) => Math.sqrt(a),
        sin: (a) => Math.sin(a),
        cos: (a) => Math.cos(a),
        tan: (a) => Math.tan(a)
    };

    /**
     * Perform math operation
     * @param {string} operation - Operation name
     * @param {number} a - First operand
     * @param {number} [b] - Second operand (for binary ops)
     * @returns {number}
     */
    function performMath(operation, a, b = 0) {
        const op = mathOps[operation];
        if (!op) return a;
        return op(a, b);
    }

    /**
     * Scale/map a value from one range to another
     * @param {number} value - Input value
     * @param {number} inMin - Input range minimum
     * @param {number} inMax - Input range maximum
     * @param {number} outMin - Output range minimum
     * @param {number} outMax - Output range maximum
     * @param {boolean} clamp - Clamp output to range
     * @returns {number}
     */
    function scaleValue(value, inMin, inMax, outMin, outMax, clamp = true) {
        if (inMax === inMin) return outMin;
        let result = ((value - inMin) / (inMax - inMin)) * (outMax - outMin) + outMin;
        if (clamp) {
            result = Math.min(Math.max(result, Math.min(outMin, outMax)), Math.max(outMin, outMax));
        }
        return result;
    }

    /**
     * Toggle logic with latch
     * @param {object} state - Mutable state { value, lastTrigger }
     * @param {boolean} trigger - Toggle trigger
     * @param {boolean} [setValue] - Optional explicit set value
     * @returns {boolean} Current toggle state
     */
    function processToggle(state, trigger, setValue = undefined) {
        if (setValue !== undefined) {
            state.value = Boolean(setValue);
        } else if (trigger && !state.lastTrigger) {
            state.value = !state.value;
        }
        state.lastTrigger = !!trigger;
        return state.value || false;
    }

    // Export for both Node.js and browser
    exports.processCounter = processCounter;
    exports.generateRandom = generateRandom;
    exports.mathOps = mathOps;
    exports.performMath = performMath;
    exports.scaleValue = scaleValue;
    exports.processToggle = processToggle;

})(typeof exports !== 'undefined' ? exports : (window.T2SharedLogic = window.T2SharedLogic || {}));
