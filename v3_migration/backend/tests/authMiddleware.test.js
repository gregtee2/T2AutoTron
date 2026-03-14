/**
 * authMiddleware.test.js — Tests for AuthManager (PIN auth, sessions)
 *
 * Covers: verifyPin constant-time compare, session lifecycle, expiry cleanup
 */

// Set a known PIN before requiring the module
process.env.APP_PIN = 'test9876';

// Suppress the default-PIN warning during test
const origWarn = console.warn;
console.warn = () => {};
const authManager = require('../src/api/middleware/authMiddleware');
console.warn = origWarn;

describe('AuthManager', () => {
  afterEach(() => {
    // Clear all sessions between tests
    authManager.authenticatedSockets.clear();
    process.env.APP_PIN = 'test9876';
  });

  // ---------------------------------------------------------------------------
  // verifyPin
  // ---------------------------------------------------------------------------
  describe('verifyPin', () => {
    test('returns true for correct PIN', () => {
      expect(authManager.verifyPin('test9876')).toBe(true);
    });

    test('returns false for wrong PIN', () => {
      expect(authManager.verifyPin('0000')).toBe(false);
    });

    test('returns false for empty string', () => {
      expect(authManager.verifyPin('')).toBe(false);
    });

    test('returns false for null/undefined', () => {
      expect(authManager.verifyPin(null)).toBe(false);
      expect(authManager.verifyPin(undefined)).toBe(false);
    });

    test('returns false when PIN differs in length', () => {
      expect(authManager.verifyPin('123')).toBe(false);
      expect(authManager.verifyPin('test98765extra')).toBe(false);
    });

    test('picks up runtime PIN changes from process.env', () => {
      process.env.APP_PIN = 'newpin';
      expect(authManager.verifyPin('newpin')).toBe(true);
      expect(authManager.verifyPin('test9876')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Socket session lifecycle
  // ---------------------------------------------------------------------------
  describe('session lifecycle', () => {
    const fakeSocket = { id: 'socket_abc123' };

    test('socket is not authenticated by default', () => {
      expect(authManager.isAuthenticated(fakeSocket)).toBe(false);
    });

    test('authenticate() marks socket as authenticated', () => {
      authManager.authenticate(fakeSocket);
      expect(authManager.isAuthenticated(fakeSocket)).toBe(true);
    });

    test('deauthenticate() removes session', () => {
      authManager.authenticate(fakeSocket);
      authManager.deauthenticate(fakeSocket);
      expect(authManager.isAuthenticated(fakeSocket)).toBe(false);
    });

    test('requireAuth calls next() for authenticated socket', () => {
      authManager.authenticate(fakeSocket);
      const next = jest.fn();
      authManager.requireAuth(fakeSocket, next);
      expect(next).toHaveBeenCalledWith();
    });

    test('requireAuth passes error for unauthenticated socket', () => {
      const next = jest.fn();
      authManager.requireAuth(fakeSocket, next);
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  // ---------------------------------------------------------------------------
  // Session expiry
  // ---------------------------------------------------------------------------
  describe('session expiry', () => {
    test('expired session returns false from isAuthenticated', () => {
      const fakeSocket = { id: 'socket_expired' };
      authManager.authenticate(fakeSocket);

      // Backdate the session timestamp
      const session = authManager.authenticatedSockets.get(fakeSocket.id);
      session.timestamp = Date.now() - (25 * 60 * 60 * 1000); // 25 hours ago

      expect(authManager.isAuthenticated(fakeSocket)).toBe(false);
      // Should also have been deleted
      expect(authManager.authenticatedSockets.has(fakeSocket.id)).toBe(false);
    });

    test('cleanupExpiredSessions removes old sessions', () => {
      const s1 = { id: 'fresh' };
      const s2 = { id: 'stale' };
      authManager.authenticate(s1);
      authManager.authenticate(s2);

      // Backdate s2
      authManager.authenticatedSockets.get('stale').timestamp =
        Date.now() - (25 * 60 * 60 * 1000);

      authManager.cleanupExpiredSessions();

      expect(authManager.authenticatedSockets.has('fresh')).toBe(true);
      expect(authManager.authenticatedSockets.has('stale')).toBe(false);
    });
  });
});
