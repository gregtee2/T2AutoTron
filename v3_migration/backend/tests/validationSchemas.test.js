/**
 * validationSchemas.test.js — Tests for Joi validation schemas
 *
 * Covers: deviceId format, device toggle payloads, auth PIN format,
 * log events, and the validate() helper (stripUnknown, multi-error).
 */

const {
  deviceToggleSchema,
  haTokenSchema,
  logEventSchema,
  authSchema,
  validate
} = require('../src/api/middleware/validationSchemas');

describe('validationSchemas', () => {
  // ---------------------------------------------------------------------------
  // Device ID validation (embedded in deviceToggleSchema)
  // ---------------------------------------------------------------------------
  describe('device ID in toggle payload', () => {
    const base = { action: 'on' };

    test('accepts valid HA device ID', () => {
      const { valid } = validate({ ...base, deviceId: 'ha_light.living_room' }, deviceToggleSchema);
      expect(valid).toBe(true);
    });

    test('accepts valid Kasa device ID', () => {
      const { valid } = validate({ ...base, deviceId: 'kasa_192.168.1.100' }, deviceToggleSchema);
      expect(valid).toBe(true);
    });

    test('accepts valid Hue device ID', () => {
      const { valid } = validate({ ...base, deviceId: 'hue_1' }, deviceToggleSchema);
      expect(valid).toBe(true);
    });

    test('accepts valid Shelly device ID', () => {
      const { valid } = validate({ ...base, deviceId: 'shellyplus1-abc123' }, deviceToggleSchema);
      expect(valid).toBe(true);
    });

    test('rejects device ID without valid prefix', () => {
      const { valid, error } = validate({ ...base, deviceId: 'bad_light.test' }, deviceToggleSchema);
      expect(valid).toBe(false);
      expect(error).toMatch(/Invalid device ID/i);
    });

    test('rejects missing device ID', () => {
      const { valid } = validate({ action: 'on' }, deviceToggleSchema);
      expect(valid).toBe(false);
    });

    test('rejects excessively long device ID', () => {
      const longId = 'ha_' + 'a'.repeat(200);
      const { valid } = validate({ ...base, deviceId: longId }, deviceToggleSchema);
      expect(valid).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Device toggle payload
  // ---------------------------------------------------------------------------
  describe('device toggle schema', () => {
    test('accepts valid on/off/toggle actions', () => {
      for (const action of ['on', 'off', 'toggle']) {
        const { valid } = validate({ deviceId: 'ha_light.x', action }, deviceToggleSchema);
        expect(valid).toBe(true);
      }
    });

    test('rejects invalid action', () => {
      const { valid } = validate({ deviceId: 'ha_light.x', action: 'blink' }, deviceToggleSchema);
      expect(valid).toBe(false);
    });

    test('accepts optional brightness/hue/saturation/transition', () => {
      const { valid, value } = validate({
        deviceId: 'ha_light.x',
        action: 'on',
        brightness: 80,
        hue: 120,
        saturation: 50,
        transition: 500
      }, deviceToggleSchema);
      expect(valid).toBe(true);
      expect(value.brightness).toBe(80);
    });

    test('rejects brightness > 100', () => {
      const { valid } = validate({ deviceId: 'ha_light.x', action: 'on', brightness: 255 }, deviceToggleSchema);
      expect(valid).toBe(false);
    });

    test('rejects transition > 10000ms', () => {
      const { valid } = validate({ deviceId: 'ha_light.x', action: 'on', transition: 99999 }, deviceToggleSchema);
      expect(valid).toBe(false);
    });

    test('strips unknown fields', () => {
      const { valid, value } = validate({
        deviceId: 'ha_light.x',
        action: 'on',
        malicious: '<script>alert(1)</script>'
      }, deviceToggleSchema);
      expect(valid).toBe(true);
      expect(value.malicious).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Auth schema (PIN)
  // ---------------------------------------------------------------------------
  describe('auth schema', () => {
    test('accepts 4-digit PIN', () => {
      const { valid } = validate({ pin: '1234' }, authSchema);
      expect(valid).toBe(true);
    });

    test('accepts 6-digit PIN', () => {
      const { valid } = validate({ pin: '123456' }, authSchema);
      expect(valid).toBe(true);
    });

    test('rejects 3-digit PIN', () => {
      const { valid } = validate({ pin: '123' }, authSchema);
      expect(valid).toBe(false);
    });

    test('rejects 7-digit PIN', () => {
      const { valid } = validate({ pin: '1234567' }, authSchema);
      expect(valid).toBe(false);
    });

    test('rejects non-numeric PIN', () => {
      const { valid } = validate({ pin: 'abcd' }, authSchema);
      expect(valid).toBe(false);
    });

    test('rejects missing PIN', () => {
      const { valid } = validate({}, authSchema);
      expect(valid).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Log event schema
  // ---------------------------------------------------------------------------
  describe('log event schema', () => {
    test('accepts valid log event', () => {
      const { valid } = validate({ message: 'test message' }, logEventSchema);
      expect(valid).toBe(true);
    });

    test('defaults level to info', () => {
      const { valid, value } = validate({ message: 'test' }, logEventSchema);
      expect(valid).toBe(true);
      expect(value.level).toBe('info');
    });

    test('rejects message over 1000 chars', () => {
      const { valid } = validate({ message: 'x'.repeat(1001) }, logEventSchema);
      expect(valid).toBe(false);
    });

    test('rejects invalid log level', () => {
      const { valid } = validate({ message: 'test', level: 'critical' }, logEventSchema);
      expect(valid).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // HA token schema
  // ---------------------------------------------------------------------------
  describe('HA token schema', () => {
    test('accepts valid long token', () => {
      const { valid } = validate('eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9', haTokenSchema);
      expect(valid).toBe(true);
    });

    test('rejects token shorter than 10 chars', () => {
      const { valid } = validate('short', haTokenSchema);
      expect(valid).toBe(false);
    });

    test('rejects token longer than 500 chars', () => {
      const { valid } = validate('x'.repeat(501), haTokenSchema);
      expect(valid).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // validate() helper
  // ---------------------------------------------------------------------------
  describe('validate() helper', () => {
    test('returns all errors (abortEarly: false)', () => {
      const { valid, error } = validate(
        { deviceId: 'bad', action: 'invalid', brightness: 999 },
        deviceToggleSchema
      );
      expect(valid).toBe(false);
      // Should contain multiple error messages joined by ';'
      expect(error.split(';').length).toBeGreaterThanOrEqual(2);
    });
  });
});
