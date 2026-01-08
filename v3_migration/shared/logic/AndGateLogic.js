/**
 * AndGateLogic.js
 * 
 * Shared logic for AND Gate node - used by both frontend and backend.
 * This file contains ONLY the pure calculation logic, no UI code.
 */

(function(exports) {
    'use strict';

    /**
     * Calculate AND gate result
     * 
     * @param {boolean[]} inputValues - Array of boolean input values
     * @param {object} state - Mutable state for pulse mode tracking
     * @param {boolean} pulseMode - Whether pulse mode is enabled
     * @returns {boolean} - The gate result
     */
    function calculateAndGate(inputValues, state = {}, pulseMode = false) {
        // AND logic: all inputs must be true
        const rawResult = inputValues.every(v => !!v);
        
        if (!pulseMode) {
            return rawResult;
        }

        // Pulse mode: only output true for one cycle on rising edge
        if (rawResult && !state.lastOutput) {
            state.lastOutput = true;
            state.needsReset = true;
            return true;
        }

        if (!rawResult) {
            state.lastOutput = false;
        }
        
        if (state.needsReset) {
            state.needsReset = false;
            return false;
        }
        
        return false;
    }

    /**
     * Get input values from Rete inputs object
     * 
     * @param {object} inputs - Rete inputs object
     * @param {number} inputCount - Number of inputs to read
     * @returns {boolean[]} - Array of boolean values
     */
    function getInputValues(inputs, inputCount) {
        const values = [];
        for (let i = 0; i < inputCount; i++) {
            const val = inputs[`in${i}`]?.[0];
            values.push(!!val);
        }
        return values;
    }

    // Export for both Node.js and browser
    exports.calculateAndGate = calculateAndGate;
    exports.getInputValues = getInputValues;

})(typeof exports !== 'undefined' ? exports : (window.T2SharedLogic = window.T2SharedLogic || {}));
