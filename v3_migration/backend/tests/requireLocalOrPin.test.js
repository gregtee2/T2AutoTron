/**
 * requireLocalOrPin.test.js — Tests for the Express requireLocalOrPin middleware
 *
 * Covers: loopback bypass, Docker/HA bypass, PIN via header, PIN via Bearer,
 * rejection of unauthenticated remote requests.
 */

process.env.APP_PIN = 'testpin99';

// Suppress default-PIN warning
const origWarn = console.warn;
console.warn = () => {};
const requireLocalOrPin = require('../src/api/middleware/requireLocalOrPin');
console.warn = origWarn;

// Helper to build a fake Express req/res/next
function buildReqRes(overrides = {}) {
  const req = {
    ip: overrides.ip || '8.8.8.8',
    socket: { remoteAddress: overrides.ip || '8.8.8.8' },
    get: jest.fn((header) => {
      const headers = overrides.headers || {};
      return headers[header] || headers[header.toLowerCase()];
    }),
    ...overrides
  };
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn()
  };
  const next = jest.fn();
  return { req, res, next };
}

describe('requireLocalOrPin', () => {
  const savedSupervisor = process.env.SUPERVISOR_TOKEN;

  afterEach(() => {
    // Reset HA add-on env
    if (savedSupervisor !== undefined) {
      process.env.SUPERVISOR_TOKEN = savedSupervisor;
    } else {
      delete process.env.SUPERVISOR_TOKEN;
    }
    process.env.APP_PIN = 'testpin99';
  });

  // ---------------------------------------------------------------------------
  // Loopback bypass
  // ---------------------------------------------------------------------------
  describe('loopback bypass', () => {
    const loopbackIps = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];

    test.each(loopbackIps)('allows %s without PIN', (ip) => {
      const { req, res, next } = buildReqRes({ ip });
      requireLocalOrPin(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Remote access — no PIN → 403
  // ---------------------------------------------------------------------------
  describe('remote access without PIN', () => {
    test('rejects external IP with no PIN', () => {
      const { req, res, next } = buildReqRes({ ip: '203.0.113.5' });
      requireLocalOrPin(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  // ---------------------------------------------------------------------------
  // PIN via X-APP-PIN header
  // ---------------------------------------------------------------------------
  describe('X-APP-PIN header', () => {
    test('allows correct PIN from remote IP', () => {
      const { req, res, next } = buildReqRes({
        ip: '203.0.113.5',
        headers: { 'X-APP-PIN': 'testpin99' }
      });
      requireLocalOrPin(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test('rejects wrong PIN', () => {
      const { req, res, next } = buildReqRes({
        ip: '203.0.113.5',
        headers: { 'X-APP-PIN': 'wrong' }
      });
      requireLocalOrPin(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  // ---------------------------------------------------------------------------
  // PIN via Authorization: Bearer header
  // ---------------------------------------------------------------------------
  describe('Bearer token', () => {
    test('allows correct PIN via Bearer header', () => {
      const { req, res, next } = buildReqRes({
        ip: '203.0.113.5',
        headers: { 'Authorization': 'Bearer testpin99' }
      });
      requireLocalOrPin(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test('rejects wrong Bearer PIN', () => {
      const { req, res, next } = buildReqRes({
        ip: '203.0.113.5',
        headers: { 'Authorization': 'Bearer badpin' }
      });
      requireLocalOrPin(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  // ---------------------------------------------------------------------------
  // HA add-on Docker bypass
  // ---------------------------------------------------------------------------
  describe('HA add-on Docker bypass', () => {
    beforeEach(() => {
      process.env.SUPERVISOR_TOKEN = 'fake_supervisor_token';
    });

    const dockerIps = [
      '172.30.32.2',
      '::ffff:172.30.32.2',
      '192.168.1.50',
      '::ffff:192.168.1.50',
      '10.0.0.5',
      '::ffff:10.0.0.5'
    ];

    test.each(dockerIps)('allows Docker-internal IP %s in HA mode', (ip) => {
      // Re-require the module so IS_HA_ADDON picks up the env change
      jest.resetModules();
      process.env.APP_PIN = 'testpin99';
      process.env.SUPERVISOR_TOKEN = 'fake_supervisor_token';
      const middleware = require('../src/api/middleware/requireLocalOrPin');
      const { req, res, next } = buildReqRes({ ip });
      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test('rejects Docker-internal IP when NOT in HA mode', () => {
      delete process.env.SUPERVISOR_TOKEN;
      jest.resetModules();
      process.env.APP_PIN = 'testpin99';
      const middleware = require('../src/api/middleware/requireLocalOrPin');
      const { req, res, next } = buildReqRes({ ip: '172.30.32.2' });
      middleware(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  // ---------------------------------------------------------------------------
  // Response body shape
  // ---------------------------------------------------------------------------
  test('403 response has expected JSON shape', () => {
    const { req, res, next } = buildReqRes({ ip: '8.8.8.8' });
    requireLocalOrPin(req, res, next);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.any(String)
      })
    );
  });
});
