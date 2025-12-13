/**
 * Get the base URL for API calls.
 * Handles Home Assistant ingress where the app is served from a subpath.
 * 
 * When running normally: returns ''
 * When running in HA ingress: returns '/api/hassio_ingress/<token>'
 */

// Cache the base URL after first detection
let cachedBaseUrl = null;

export function getApiBase() {
    if (cachedBaseUrl !== null) {
        return cachedBaseUrl;
    }

    // Check if we're running in HA ingress
    const path = window.location.pathname;
    const ingressMatch = path.match(/^(\/api\/hassio_ingress\/[^/]+)/);
    
    if (ingressMatch) {
        cachedBaseUrl = ingressMatch[1];
        console.log('[API] Running in HA ingress, base:', cachedBaseUrl);
    } else {
        cachedBaseUrl = '';
        console.log('[API] Running standalone, no base path');
    }
    
    return cachedBaseUrl;
}

/**
 * Build a full URL from a relative API path.
 * @param {string} path - API path like '/api/plugins' or '/plugins/MyNode.js'
 * @returns {string} Full URL with ingress base if needed
 */
export function apiUrl(path) {
    const base = getApiBase();
    // Ensure path starts with /
    const normalizedPath = path.startsWith('/') ? path : '/' + path;
    return base + normalizedPath;
}

// Auto-detect on load
getApiBase();
