/**
 * TimeRangeLogic.js
 * 
 * Shared logic for Time Range node - used by both frontend and backend.
 * This file contains ONLY the pure calculation logic, no UI code.
 * 
 * Usage:
 *   Frontend: const { calculateTimeRange } = require('./shared/logic/TimeRangeLogic');
 *   Backend:  const { calculateTimeRange } = require('../../../shared/logic/TimeRangeLogic');
 */

(function(exports) {
    'use strict';

    /**
     * Convert hours and minutes to total minutes since midnight
     */
    function timeToMinutes(hour, minute) {
        return (hour * 60) + minute;
    }

    /**
     * Format time as AM/PM string
     */
    function formatAmPm(hour24, minute) {
        const ampm = hour24 < 12 ? "AM" : "PM";
        let hour12 = hour24 % 12;
        if (hour12 === 0) hour12 = 12;
        const minuteStr = minute < 10 ? `0${minute}` : `${minute}`;
        return `${hour12}:${minuteStr} ${ampm}`;
    }

    /**
     * Calculate if current time is within the specified range
     * 
     * @param {object} properties - Node properties
     * @param {number} properties.startHour - Start hour (0-23)
     * @param {number} properties.startMinute - Start minute (0-59)
     * @param {number} properties.endHour - End hour (0-23)
     * @param {number} properties.endMinute - End minute (0-59)
     * @param {Date} [now] - Optional Date object for testing (defaults to current time)
     * @returns {object} - { isInRange: boolean, currentMinutes, startMinutes, endMinutes }
     */
    function calculateTimeRange(properties, now = null) {
        if (!now) now = new Date();
        
        const currentMinutes = timeToMinutes(now.getHours(), now.getMinutes());
        const startMinutes = timeToMinutes(properties.startHour, properties.startMinute);
        const endMinutes = timeToMinutes(properties.endHour, properties.endMinute);

        let isInRange = false;
        
        if (startMinutes < endMinutes) {
            // Normal case (e.g., 08:00 to 18:00)
            isInRange = (currentMinutes >= startMinutes) && (currentMinutes < endMinutes);
        } else if (startMinutes > endMinutes) {
            // Cross midnight (e.g., 22:00 to 02:00 next day)
            isInRange = (currentMinutes >= startMinutes) || (currentMinutes < endMinutes);
        } else {
            // Same start/end => entire day
            isInRange = true;
        }

        return {
            isInRange,
            currentMinutes,
            startMinutes,
            endMinutes
        };
    }

    // Export for both Node.js and browser
    exports.calculateTimeRange = calculateTimeRange;
    exports.timeToMinutes = timeToMinutes;
    exports.formatAmPm = formatAmPm;

})(typeof exports !== 'undefined' ? exports : (window.T2SharedLogic = window.T2SharedLogic || {}));
