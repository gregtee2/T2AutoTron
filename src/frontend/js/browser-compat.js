// Browser Compatibility Shim for Electron APIs
// This file provides no-op implementations of Electron APIs when running in a browser

console.log('browser-compat.js loaded');

// Check if running in Electron
const isElectron = navigator.userAgent.toLowerCase().indexOf(' electron/') > -1;

if (!isElectron && !window.api) {
    console.log('Running in browser mode - creating window.api shim');

    //  Provide no-op implementations for all Electron IPC operations
    window.api = {
        send: function (channel, ...args) {
            // No-op in browser - Electron-only functionality
            console.debug(`[Browser Mode] Skipped window.api.send('${channel}')`, args);
        },
        receive: function (channel, callback) {
            // No-op in browser - Electron-only functionality  
            console.debug(`[Browser Mode] Skipped window.api.receive('${channel}')`);
        }
    };

    console.log('✅ window.api shim created for browser compatibility');
} else if (isElectron) {
    console.log('✅ Running in Electron - window.api provided by preload script');
} else {
    console.log('✅ window.api already exists');
}
