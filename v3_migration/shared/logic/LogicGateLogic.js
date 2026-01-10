/**
 * LogicGateLogic.js
 * 
 * Shared logic for logic gate nodes - AND, OR, NOT, XOR, NAND, NOR
 * Used by both frontend and backend.
 */

(function(exports) {
    'use strict';

    /**
     * AND gate - all inputs must be true
     * @param {boolean[]} values - Array of boolean values
     * @returns {boolean}
     */
    function calculateAnd(values) {
        if (!values || values.length === 0) return false;
        return values.every(v => Boolean(v));
    }

    /**
     * OR gate - at least one input must be true
     * @param {boolean[]} values - Array of boolean values
     * @returns {boolean}
     */
    function calculateOr(values) {
        if (!values || values.length === 0) return false;
        return values.some(v => Boolean(v));
    }

    /**
     * NOT gate - inverts the input
     * @param {boolean} value - Input value
     * @returns {boolean}
     */
    function calculateNot(value) {
        return !Boolean(value);
    }

    /**
     * XOR gate - true if odd number of inputs are true
     * @param {boolean[]} values - Array of boolean values
     * @returns {boolean}
     */
    function calculateXor(values) {
        if (!values || values.length === 0) return false;
        const truthyCount = values.filter(v => Boolean(v)).length;
        return truthyCount % 2 === 1;
    }

    /**
     * NAND gate - NOT AND (false only when all true)
     * @param {boolean[]} values - Array of boolean values
     * @returns {boolean}
     */
    function calculateNand(values) {
        return !calculateAnd(values);
    }

    /**
     * NOR gate - NOT OR (true only when all false)
     * @param {boolean[]} values - Array of boolean values
     * @returns {boolean}
     */
    function calculateNor(values) {
        return !calculateOr(values);
    }

    /**
     * XNOR gate - true if even number of inputs are true (inverse of XOR)
     * @param {boolean[]} values - Array of boolean values
     * @returns {boolean}
     */
    function calculateXnor(values) {
        return !calculateXor(values);
    }

    /**
     * IMPLIES - logical implication (A → B = NOT A OR B)
     * @param {boolean} a - Antecedent
     * @param {boolean} b - Consequent
     * @returns {boolean}
     */
    function calculateImplies(a, b) {
        return !Boolean(a) || Boolean(b);
    }

    /**
     * BICOND - biconditional (A ↔ B, true when both same)
     * @param {boolean} a - First value
     * @param {boolean} b - Second value
     * @returns {boolean}
     */
    function calculateBicond(a, b) {
        return Boolean(a) === Boolean(b);
    }

    /**
     * Compare two values using an operator
     * @param {*} a - First value
     * @param {string} operator - Comparison operator (==, !=, >, <, >=, <=, =)
     * @param {*} b - Second value
     * @returns {boolean}
     */
    function compare(a, operator, b) {
        // Normalize '=' to '==' for convenience
        if (operator === '=') operator = '==';
        
        switch (operator) {
            case '==': return a == b;
            case '===': return a === b;
            case '!=': return a != b;
            case '!==': return a !== b;
            case '>': return a > b;
            case '<': return a < b;
            case '>=': return a >= b;
            case '<=': return a <= b;
            default: return false;
        }
    }

    /**
     * Smart compare - tries numeric first, falls back to string
     * Used by ComparisonNode to handle mixed inputs
     * @param {*} a - First value
     * @param {string} operator - Comparison operator
     * @param {*} b - Second value
     * @returns {boolean}
     */
    function smartCompare(a, operator, b) {
        // Normalize '=' to '=='
        if (operator === '=') operator = '==';
        
        // Try numeric comparison first
        const numA = parseFloat(a);
        const numB = parseFloat(b);
        
        if (!isNaN(numA) && !isNaN(numB)) {
            return compare(numA, operator, numB);
        }
        
        // Fall back to string comparison
        return compare(String(a), operator, String(b));
    }

    /**
     * Threshold check - true when value crosses threshold
     * @param {number} value - Current value
     * @param {number} threshold - Threshold to check
     * @param {string} direction - 'above', 'below', 'both'
     * @param {object} state - State object with lastValue property
     * @returns {boolean}
     */
    function checkThreshold(value, threshold, direction, state = {}) {
        const lastValue = state.lastValue;
        state.lastValue = value;
        
        if (lastValue === undefined) return false;
        
        switch (direction) {
            case 'above':
                return lastValue < threshold && value >= threshold;
            case 'below':
                return lastValue >= threshold && value < threshold;
            case 'both':
                return (lastValue < threshold && value >= threshold) ||
                       (lastValue >= threshold && value < threshold);
            default:
                return false;
        }
    }

    // Export for both Node.js and browser
    exports.calculateAnd = calculateAnd;
    exports.calculateOr = calculateOr;
    exports.calculateNot = calculateNot;
    exports.calculateXor = calculateXor;
    exports.calculateNand = calculateNand;
    exports.calculateNor = calculateNor;
    exports.calculateXnor = calculateXnor;
    exports.calculateImplies = calculateImplies;
    exports.calculateBicond = calculateBicond;
    exports.compare = compare;
    exports.smartCompare = smartCompare;
    exports.checkThreshold = checkThreshold;

})(typeof exports !== 'undefined' ? exports : (window.T2SharedLogic = window.T2SharedLogic || {}));
