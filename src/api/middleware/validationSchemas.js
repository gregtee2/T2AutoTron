const Joi = require('joi');

/**
 * Validation schemas for Socket.IO events
 * Prevents malicious payloads and ensures data integrity
 */

// Device ID must start with a valid prefix
const deviceIdSchema = Joi.string()
    .pattern(/^(ha_|kasa_|hue_|shellyplus1-)/)
    .max(200)
    .required()
    .messages({
        'string.pattern.base': 'Invalid device ID format',
        'string.max': 'Device ID too long',
        'any.required': 'Device ID is required'
    });

// Device toggle/control schema
const deviceToggleSchema = Joi.object({
    deviceId: deviceIdSchema,
    vendor: Joi.string()
        .valid('ha', 'hue', 'kasa', 'shelly')
        .optional(),
    action: Joi.string()
        .valid('on', 'off', 'toggle')
        .required()
        .messages({
            'any.only': 'Action must be "on", "off", or "toggle"'
        }),
    brightness: Joi.number()
        .min(0)
        .max(100)
        .optional(),
    hue: Joi.number()
        .min(0)
        .max(360)
        .optional(),
    saturation: Joi.number()
        .min(0)
        .max(100)
        .optional(),
    transition: Joi.number()
        .min(0)
        .max(10000)
        .optional()
        .messages({
            'number.max': 'Transition time cannot exceed 10 seconds'
        })
});

// Home Assistant token schema
const haTokenSchema = Joi.string()
    .min(10)
    .max(500)
    .required()
    .messages({
        'string.min': 'Token too short',
        'string.max': 'Token too long',
        'any.required': 'Token is required'
    });

// Log event schema
const logEventSchema = Joi.object({
    message: Joi.string()
        .max(1000)
        .required(),
    level: Joi.string()
        .valid('info', 'warn', 'error', 'debug')
        .default('info'),
    timestamp: Joi.date()
        .optional()
});

// Authentication schema
const authSchema = Joi.object({
    pin: Joi.string()
        .pattern(/^\d{4,6}$/)
        .required()
        .messages({
            'string.pattern.base': 'PIN must be 4-6 digits',
            'any.required': 'PIN is required'
        })
});

/**
 * Validate data against a schema
 * @param {Object} data - Data to validate
 * @param {Joi.Schema} schema - Joi schema
 * @returns {Object} { valid: boolean, value?: any, error?: string }
 */
function validate(data, schema) {
    const { error, value } = schema.validate(data, {
        abortEarly: false, // Return all errors
        stripUnknown: true // Remove unknown fields
    });

    if (error) {
        const errorMessage = error.details.map(d => d.message).join('; ');
        return {
            valid: false,
            error: errorMessage
        };
    }

    return {
        valid: true,
        value
    };
}

module.exports = {
    deviceToggleSchema,
    haTokenSchema,
    logEventSchema,
    authSchema,
    validate
};
