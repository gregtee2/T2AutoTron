/**
 * DelayLogic.js
 * 
 * Shared logic for Delay node - used by both frontend and backend.
 * This file contains ONLY the pure calculation logic, no UI code.
 * 
 * Supports three modes:
 * - delay: Wait X time, then pass the value through
 * - debounce: Reset timer on each input, fire after silence period
 * - retriggerable: Output ON immediately, restart off-timer on each trigger
 */

(function(exports) {
    'use strict';

    /**
     * Create a delay state manager
     * Handles all timing logic for delay/debounce/retriggerable modes
     * 
     * @returns {object} - State manager with methods
     */
    function createDelayState() {
        return {
            pendingValue: null,
            timer: null,
            outputValue: undefined,
            lastInputValue: undefined,
            lastInputTime: 0,
            
            /**
             * Process an input through the delay logic
             * @param {*} input - The input value
             * @param {string} mode - 'delay', 'debounce', or 'retriggerable'
             * @param {number} delayMs - Delay in milliseconds
             * @param {function} onOutputChange - Callback when output should change
             * @returns {*} - Current output value
             */
            process(input, mode, delayMs, onOutputChange) {
                const now = Date.now();
                const inputChanged = input !== this.lastInputValue;
                this.lastInputValue = input;
                
                switch (mode) {
                    case 'delay':
                        return this._processDelay(input, delayMs, inputChanged, now, onOutputChange);
                    case 'debounce':
                        return this._processDebounce(input, delayMs, now, onOutputChange);
                    case 'retriggerable':
                        return this._processRetriggerable(input, delayMs, inputChanged, now, onOutputChange);
                    default:
                        return this._processDelay(input, delayMs, inputChanged, now, onOutputChange);
                }
            },
            
            _processDelay(input, delayMs, inputChanged, now, onOutputChange) {
                if (inputChanged && input !== undefined && input !== null) {
                    // New input - schedule it
                    if (this.timer) clearTimeout(this.timer);
                    this.pendingValue = input;
                    this.timer = setTimeout(() => {
                        this.outputValue = this.pendingValue;
                        this.pendingValue = null;
                        this.timer = null;
                        if (onOutputChange) onOutputChange(this.outputValue);
                    }, delayMs);
                }
                return this.outputValue;
            },
            
            _processDebounce(input, delayMs, now, onOutputChange) {
                // Reset timer on every input
                if (this.timer) clearTimeout(this.timer);
                this.pendingValue = input;
                this.lastInputTime = now;
                
                this.timer = setTimeout(() => {
                    this.outputValue = this.pendingValue;
                    this.timer = null;
                    if (onOutputChange) onOutputChange(this.outputValue);
                }, delayMs);
                
                return this.outputValue;
            },
            
            _processRetriggerable(input, delayMs, inputChanged, now, onOutputChange) {
                // Truthy input = output ON immediately, restart off-timer
                if (input) {
                    if (this.timer) clearTimeout(this.timer);
                    this.outputValue = true;
                    
                    this.timer = setTimeout(() => {
                        this.outputValue = false;
                        this.timer = null;
                        if (onOutputChange) onOutputChange(this.outputValue);
                    }, delayMs);
                    
                    if (onOutputChange) onOutputChange(this.outputValue);
                    return true;
                }
                
                return this.outputValue;
            },
            
            /**
             * Clean up timers
             */
            destroy() {
                if (this.timer) {
                    clearTimeout(this.timer);
                    this.timer = null;
                }
            }
        };
    }

    /**
     * Unit multipliers constant (milliseconds per unit)
     */
    const UNIT_MULTIPLIERS = {
        'ms': 1,
        'sec': 1000,
        'seconds': 1000,
        'min': 60000,
        'minutes': 60000,
        'hours': 3600000
    };

    /**
     * Convert delay value and unit to milliseconds
     * 
     * @param {number} value - Delay value
     * @param {string} unit - 'ms', 'sec', 'seconds', 'min', 'minutes', 'hours'
     * @returns {number} - Delay in milliseconds
     */
    function toMilliseconds(value, unit) {
        const multiplier = UNIT_MULTIPLIERS[unit] || UNIT_MULTIPLIERS['seconds'];
        return Math.round(value * multiplier);
    }

    // Export for both Node.js and browser
    exports.createDelayState = createDelayState;
    exports.toMilliseconds = toMilliseconds;
    exports.UNIT_MULTIPLIERS = UNIT_MULTIPLIERS;

})(typeof exports !== 'undefined' ? exports : (window.T2SharedLogic = window.T2SharedLogic || {}));
