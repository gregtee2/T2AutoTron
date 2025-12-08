// LogicGates.js - Testable logic gate functions
// Extracted from AND, OR, XOR node plugins for testing

const LogicGates = {
    /**
     * AND gate - all inputs must be true
     * @param {boolean[]} inputs 
     * @returns {boolean}
     */
    and: (inputs) => {
        if (!inputs || inputs.length === 0) return false;
        return inputs.every(v => !!v);
    },

    /**
     * OR gate - at least one input must be true
     * @param {boolean[]} inputs 
     * @returns {boolean}
     */
    or: (inputs) => {
        if (!inputs || inputs.length === 0) return false;
        return inputs.some(v => !!v);
    },

    /**
     * XOR gate - exactly one input must be true
     * @param {boolean[]} inputs 
     * @returns {boolean}
     */
    xor: (inputs) => {
        if (!inputs || inputs.length === 0) return false;
        const trueCount = inputs.filter(v => !!v).length;
        return trueCount === 1;
    },

    /**
     * NOT gate - invert input
     * @param {boolean} input 
     * @returns {boolean}
     */
    not: (input) => {
        return !input;
    },

    /**
     * NAND gate - NOT AND
     * @param {boolean[]} inputs 
     * @returns {boolean}
     */
    nand: (inputs) => {
        return !LogicGates.and(inputs);
    },

    /**
     * NOR gate - NOT OR
     * @param {boolean[]} inputs 
     * @returns {boolean}
     */
    nor: (inputs) => {
        return !LogicGates.or(inputs);
    },

    /**
     * Comparison operations
     */
    compare: {
        equal: (a, b) => a === b,
        notEqual: (a, b) => a !== b,
        greater: (a, b) => a > b,
        greaterOrEqual: (a, b) => a >= b,
        less: (a, b) => a < b,
        lessOrEqual: (a, b) => a <= b
    }
};

module.exports = LogicGates;
