const crypto = require('crypto');

/**
 * Simple PIN-based authentication middleware for Socket.IO
 * Suitable for local network use with single user
 */

class AuthManager {
    constructor() {
        this.authenticatedSockets = new Map(); // socketId -> { authenticated: true, timestamp }
        this.sessionTimeout = 24 * 60 * 60 * 1000; // 24 hours
        this.correctPin = process.env.APP_PIN || '1234'; // Default PIN (user should change)

        if (this.correctPin === '1234') {
            console.warn('⚠️  WARNING: Using default PIN "1234". Please set APP_PIN in .env file!');
        }
    }

    /**
     * Verify PIN code
     * @param {string} pin - User-provided PIN
     * @returns {boolean}
     */
    verifyPin(pin) {
        // Constant-time comparison to prevent timing attacks
        const correctBuffer = Buffer.from(this.correctPin);
        const providedBuffer = Buffer.from(pin || '');

        if (correctBuffer.length !== providedBuffer.length) {
            return false;
        }

        return crypto.timingSafeEqual(correctBuffer, providedBuffer);
    }

    /**
     * Authenticate a socket connection
     * @param {Socket} socket - Socket.IO socket
     * @returns {boolean}
     */
    authenticate(socket) {
        this.authenticatedSockets.set(socket.id, {
            authenticated: true,
            timestamp: Date.now()
        });
        return true;
    }

    /**
     * Check if socket is authenticated
     * @param {Socket} socket - Socket.IO socket
     * @returns {boolean}
     */
    isAuthenticated(socket) {
        const session = this.authenticatedSockets.get(socket.id);

        if (!session) {
            return false;
        }

        // Check if session expired
        if (Date.now() - session.timestamp > this.sessionTimeout) {
            this.authenticatedSockets.delete(socket.id);
            return false;
        }

        return session.authenticated;
    }

    /**
     * Deauthenticate a socket
     * @param {Socket} socket - Socket.IO socket
     */
    deauthenticate(socket) {
        this.authenticatedSockets.delete(socket.id);
    }

    /**
     * Middleware to require authentication
     * @param {Socket} socket - Socket.IO socket
     * @param {Function} next - Next middleware
     */
    requireAuth(socket, next) {
        if (this.isAuthenticated(socket)) {
            next();
        } else {
            next(new Error('Authentication required'));
        }
    }

    /**
     * Clean up expired sessions (call periodically)
     */
    cleanupExpiredSessions() {
        const now = Date.now();
        for (const [socketId, session] of this.authenticatedSockets.entries()) {
            if (now - session.timestamp > this.sessionTimeout) {
                this.authenticatedSockets.delete(socketId);
            }
        }
    }
}

// Singleton instance
const authManager = new AuthManager();

// Clean up expired sessions every hour
setInterval(() => {
    authManager.cleanupExpiredSessions();
}, 60 * 60 * 1000);

module.exports = authManager;
