/**
 * Sanitize sensitive data from logs
 * Prevents passwords, tokens, and API keys from being logged
 */

const SENSITIVE_PATTERNS = [
    /password/i,
    /token/i,
    /key/i,
    /secret/i,
    /auth/i,
    /bearer/i,
    /api[_-]?key/i,
    /pin/i
];

/**
 * Check if a key name is sensitive
 * @param {string} key - Object key name
 * @returns {boolean}
 */
function isSensitiveKey(key) {
    if (typeof key !== 'string') return false;
    return SENSITIVE_PATTERNS.some(pattern => pattern.test(key));
}

/**
 * Recursively sanitize an object
 * @param {any} obj - Object to sanitize
 * @param {number} depth - Current recursion depth
 * @returns {any} Sanitized copy
 */
function sanitizeObject(obj, depth = 0) {
    // Prevent infinite recursion
    if (depth > 10) {
        return '[Max Depth Reached]';
    }

    // Handle null/undefined
    if (obj === null || obj === undefined) {
        return obj;
    }

    // Handle primitives
    if (typeof obj !== 'object') {
        return obj;
    }

    // Handle arrays
    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeObject(item, depth + 1));
    }

    // Handle objects
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
        if (isSensitiveKey(key)) {
            sanitized[key] = '***REDACTED***';
        } else if (typeof value === 'object' && value !== null) {
            sanitized[key] = sanitizeObject(value, depth + 1);
        } else {
            sanitized[key] = value;
        }
    }

    return sanitized;
}

/**
 * Sanitize a log message
 * @param {string|Object} message - Log message
 * @returns {string|Object} Sanitized message
 */
function sanitize(message) {
    if (typeof message === 'string') {
        // Redact common patterns in strings
        let sanitized = message;

        // Redact bearer tokens
        sanitized = sanitized.replace(/Bearer\s+[\w-]+/gi, 'Bearer ***REDACTED***');

        // Redact API keys in URLs
        sanitized = sanitized.replace(/([?&])(api[_-]?key|token|secret)=[\w-]+/gi, '$1$2=***REDACTED***');

        // Redact Authorization headers
        sanitized = sanitized.replace(/Authorization:\s*[\w\s]+/gi, 'Authorization: ***REDACTED***');

        return sanitized;
    }

    if (typeof message === 'object') {
        return sanitizeObject(message);
    }

    return message;
}

module.exports = {
    sanitize,
    sanitizeObject,
    isSensitiveKey
};
