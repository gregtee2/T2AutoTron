// C:\X_T2_AutoTron2.0\preload.js
const { contextBridge, ipcRenderer } = require('electron');

console.log("Preload script loaded");

try {
    const ALLOWED_SEND_CHANNELS = new Set(['log']);
    const ALLOWED_RECEIVE_CHANNELS = new Set([
        'server-ready',
        'device-list-update',
        'device-state-update',
        'weather-update',
        'forecast-update',
        'editor-delete-key',
        'log-message'
    ]);

    contextBridge.exposeInMainWorld('api', {
        fetchSunTimes: async (coords) => {
            try {
                console.log('Preload: Invoking fetch-sun-times with coords:', coords);
                const response = await ipcRenderer.invoke('fetch-sun-times', coords);
                console.log('Preload: Received sun times:', response);
                return response;
            } catch (error) {
                console.error('Preload: Error fetching sun times via IPC:', error);
                throw error;
            }
        },
        fetchHueDevices: async () => {
            try {
                const response = await ipcRenderer.invoke('fetch-hue-devices');
                return response;
            } catch (error) {
                console.error('Preload: Error fetching Hue devices:', error);
                throw error;
            }
        },
        controlKasaDevice: async (deviceId, action) => {
            try {
                const response = await ipcRenderer.invoke('control-kasa-device', { deviceId, action });
                return response;
            } catch (error) {
                console.error('Preload: Error controlling Kasa device:', error);
                throw error;
            }
        },
        // Avoid exposing arbitrary IPC channels to the renderer.
        send: (channel, data) => {
            if (!ALLOWED_SEND_CHANNELS.has(channel)) {
                throw new Error(`Blocked IPC send channel: ${channel}`);
            }
            ipcRenderer.send(channel, data);
        },
        receive: (channel, func) => {
            if (!ALLOWED_RECEIVE_CHANNELS.has(channel)) {
                throw new Error(`Blocked IPC receive channel: ${channel}`);
            }
            const subscription = (event, ...args) => func(...args);
            ipcRenderer.on(channel, subscription);
            return () => ipcRenderer.removeListener(channel, subscription);
        },
        log: (level, message) => ipcRenderer.send('log', { level, message }),
        crash: () => ipcRenderer.invoke('crash-main'),
        onServerReady: (callback) => ipcRenderer.on('server-ready', (event, data) => callback(data)),
        onDeviceListUpdate: (callback) => ipcRenderer.on('device-list-update', (event, devices) => callback(devices)),
        onDeviceStateUpdate: (callback) => ipcRenderer.on('device-state-update', (event, state) => callback(state)),
        onWeatherUpdate: (callback) => ipcRenderer.on('weather-update', (event, weatherData) => callback(weatherData)),
        onForecastUpdate: (callback) => ipcRenderer.on('forecast-update', (event, forecastData) => callback(forecastData)),
        // Clipboard methods
        copyToClipboard: async (text) => {
            console.log("Preload - copyToClipboard called with text length:", text.length);
            return await ipcRenderer.invoke('copy-to-clipboard', text);
        },
        readFromClipboard: async () => {
            console.log("Preload - readFromClipboard called");
            const result = await ipcRenderer.invoke('read-from-clipboard');
            console.log("Preload - readFromClipboard result length:", result.text ? result.text.length : 0);
            return result;
        },
        saveTempFile: async (filename, content) => {
            console.log("Preload - saveTempFile called with filename:", filename);
            return await ipcRenderer.invoke('save-temp-file', filename, content);
        },
        readTempFile: async (filename) => {
            console.log("Preload - readTempFile called with filename:", filename);
            const result = await ipcRenderer.invoke('read-temp-file', filename);
            console.log("Preload - readTempFile result length:", result.content ? result.content.length : 0);
            return result;
        },
        onDeleteKey: (callback) => {
            ipcRenderer.on('editor-delete-key', () => callback());
            return () => ipcRenderer.removeAllListeners('editor-delete-key');
        }
    });
    console.log("Preload - Successfully exposed api object");
} catch (err) {
    console.error("Preload - Failed to expose api object:", err);
}

ipcRenderer.on('do-crash', () => {
    console.log('Preload: Received do-crash, crashing renderer');
    process.crash();
});
