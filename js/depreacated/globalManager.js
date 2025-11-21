// File: globals/globalManager.js
import { setGlobal, getGlobal } from './globals.js';

// Function to initialize the global variables
export function initializeGlobals() {
    // Retrieve the API Key from the stored configuration if available
    const storedApiKey = localStorage.getItem('apiKey');
    if (storedApiKey) {
        setGlobal('apiKey', storedApiKey);
        console.log(`Loaded stored API Key: ${storedApiKey}`);
    }

    // Retrieve the Bridge IP from the stored configuration if available
    const storedBridgeIp = localStorage.getItem('bridgeIp');
    if (storedBridgeIp) {
        setGlobal('bridgeIp', storedBridgeIp);
        console.log(`Loaded stored Bridge IP: ${storedBridgeIp}`);
    }
}

// Function to store the global variables into localStorage
export function saveGlobals() {
    const apiKey = getGlobal('apiKey');
    if (apiKey) {
        localStorage.setItem('apiKey', apiKey);
        console.log(`Saved API Key: ${apiKey}`);
    }

    const bridgeIp = getGlobal('bridgeIp');
    if (bridgeIp) {
        localStorage.setItem('bridgeIp', bridgeIp);
        console.log(`Saved Bridge IP: ${bridgeIp}`);
    }
}
