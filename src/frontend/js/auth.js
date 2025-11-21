// Authentication Module
// Handles session management and logout functionality
console.log('auth.js loaded');

(function () {
    'use strict';

    function initAuth() {
        const isElectron = navigator.userAgent.toLowerCase().includes('electron');

        if (isElectron) {
            // Electron doesn't need authentication
            window.logout = function () {
                console.log('Logout not needed in Electron');
            };
            return;
        }

        // Browser mode - check authentication
        const authenticated = sessionStorage.getItem('authenticated');
        const authTime = sessionStorage.getItem('authTime');
        const SESSION_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours

        if (!authenticated || !authTime || Date.now() - parseInt(authTime) > SESSION_TIMEOUT) {
            // Clear expired session and redirect to login
            sessionStorage.removeItem('authenticated');
            sessionStorage.removeItem('authTime');
            window.location.href = '/login.html';
            return;
        }

        // Set up logout function
        window.logout = function () {
            sessionStorage.removeItem('authenticated');
            sessionStorage.removeItem('authTime');
            window.location.href = '/login.html';
        };

        console.log('✅ Authentication initialized');
    }

    // Make initAuth available globally
    window.initAuth = initAuth;

    // Auto-initialize if DOM is already loaded, otherwise wait
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAuth);
    } else {
        initAuth();
    }
})();
