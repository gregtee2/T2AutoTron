const { app, BrowserWindow, ipcMain, session, crashReporter, dialog, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs'); // For synchronous operations
const fsPromises = require('fs').promises; // For asynchronous operations
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const v3 = require('node-hue-api').v3;
const api = v3.api;
const io = require('socket.io-client');

// Adjusted crashDir for 2.1 structure (v3_migration/crashes)
const crashDir = path.join(__dirname, '..', '..', '..', '..', 'crashes');
if (!fs.existsSync(crashDir)) fs.mkdirSync(crashDir, { recursive: true });

crashReporter.start({
    productName: 'T2AutoTron',
    companyName: 'YourName',
    submitURL: '',
    uploadToServer: false,
    compress: true,
    directory: crashDir
});

let mainWindow;
let socket;

// Throttle log messages to avoid overloading the renderer
let lastLogTime = 0;
const LOG_THROTTLE_MS = 100; // Throttle logs to 100ms intervals

const sendLogToRenderer = (message, fromRenderer = false) => {
    const now = Date.now();
    if (now - lastLogTime < LOG_THROTTLE_MS) return; // Skip if too frequent
    lastLogTime = now;

    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('log-message', { message, fromRenderer });
    }
};

// Override console.log and console.error to send logs to renderer and terminal
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
console.log = (...args) => {
    const message = args.join(' ');
    sendLogToRenderer(`Main: ${message}`, false);
    process.stdout.write(`${new Date().toISOString()} - Main: ${message}\n`);
    fsPromises.appendFile(path.join(crashDir, 'main.log'), `${new Date().toISOString()} - INFO: ${message}\n`).catch(err => {
        process.stderr.write(`Failed to write to main.log: ${err.message}\n`);
    });
};
console.error = (...args) => {
    const message = args.join(' ');
    sendLogToRenderer(`Main: ERROR: ${message}`, false);
    process.stderr.write(`${new Date().toISOString()} - Main: ERROR: ${message}\n`);
    fsPromises.appendFile(path.join(crashDir, 'main.log'), `${new Date().toISOString()} - ERROR: ${message}\n`).catch(err => {
        process.stderr.write(`Failed to write to main.log: ${err.message}\n`);
    });
};

console.log('Starting main process...');

// Initialize Socket.IO client
function initializeSocketIO() {
    socket = io('http://localhost:3000', {
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 500,
        reconnectionDelayMax: 2000,
        timeout: 5000
    });

    socket.on('connect', () => {
        console.log('Socket.IO connected to server');
    });

    socket.on('server-ready', (data) => {
        console.log('Server ready:', data);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('server-ready', data);
        }
    });

    socket.on('device-list-update', (devices) => {
        console.log('Device list updated:', devices);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('device-list-update', devices);
        }
    });

    socket.on('device-state-update', (state) => {
        console.log('Device state updated:', state);
        if (mainWindow && !mainWindow.isDestroyed()) {
            const sendStart = Date.now();
            mainWindow.webContents.send('device-state-update', state);
            console.log(`Main: Sent device-state-update to renderer in ${Date.now() - sendStart}ms`);
        }
    });

    socket.on('weather-update', (weatherData) => {
        console.log('Weather updated:', weatherData);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('weather-update', weatherData);
        }
    });

    socket.on('forecast-update', (forecastData) => {
        console.log('Forecast updated:', forecastData);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('forecast-update', forecastData);
        }
    });

    socket.on('connect_error', (error) => {
        console.error('Socket.IO connection error:', error.message);
    });

    socket.on('disconnect', (reason) => {
        console.log('Socket.IO disconnected:', reason);
    });
}

async function clearCache() {
    try {
        // Clear HTTP cache
        await session.defaultSession.clearCache();
        
        // Clear storage data that can cause stale code issues
        // Note: NOT clearing 'localstorage' as it contains saved graphs
        await session.defaultSession.clearStorageData({
            storages: ['cachestorage', 'shadercache', 'serviceworkers']
        });
        
        console.log('Cache and storage cleared successfully!');
    } catch (err) {
        console.error('Error clearing cache:', err);
    }
}

function createWindow() {
    const preloadPath = path.join(__dirname, 'preload.js');
    console.log(`Preload script path: ${preloadPath}`);
    // Verify preload file exists
    if (!fs.existsSync(preloadPath)) {
        console.error(`Preload script not found at: ${preloadPath}`);
    } else {
        console.log(`Preload script found at: ${preloadPath}`);
    }

    mainWindow = new BrowserWindow({
        width: 2400,
        height: 1200,
        webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            nodeIntegration: false,
            enableRemoteModule: false,
            webSecurity: false, // Often needed for local dev with mixed content or CORS
            devTools: true
        },
        autoHideMenuBar: true
    });

    // Load Vite dev server URL
    const devUrl = 'http://localhost:5173';
    console.log(`Loading URL: ${devUrl}`);
    mainWindow.loadURL(devUrl).catch(err => {
        console.error('Failed to load URL:', err);
    });

    // Don't auto-open DevTools - use F12 or Ctrl+Shift+I to open manually
    // mainWindow.webContents.openDevTools();

    // Register keyboard shortcuts
    mainWindow.webContents.on('before-input-event', async (event, input) => {
        // Ctrl+Shift+R for hard refresh (clear cache and reload)
        if (input.control && input.shift && input.key.toLowerCase() === 'r') {
            event.preventDefault();
            console.log('Hard refresh triggered (Ctrl+Shift+R)');
            await clearCache();
            mainWindow.webContents.reloadIgnoringCache();
            return;
        }
        
        // Send Delete/Backspace to renderer via IPC for reliable node deletion
        if ((input.key === 'Delete' || input.key === 'Backspace') && input.type === 'keyDown') {
            if (!input.control && !input.alt && !input.meta) {
                // Send to renderer process
                mainWindow.webContents.send('editor-delete-key');
            }
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

async function fetchData(url, options = {}) {
    const response = await fetch(url, options);
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text}`);
    }
    return response.json();
}

ipcMain.handle('fetch-devices', async () => {
    try {
        const data = await fetchData('http://localhost:3000/api/devices');
        if (!data.success) throw new Error(data.error || 'Failed to fetch devices');
        console.log('Fetched devices:', data.devices);
        return { success: true, devices: data.devices };
    } catch (error) {
        console.error('Error fetching devices:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('control-kasa-device', async (_, { deviceId, action }) => {
    try {
        const validActions = ['toggle', 'on', 'off'];
        if (!validActions.includes(action)) throw new Error(`Invalid action: ${action}`);
        const data = await fetchData(`http://localhost:3000/api/lights/kasa/${encodeURIComponent(deviceId)}/${action}`, { method: 'POST' });
        if (!data.success) throw new Error(data.message || `Failed to ${action} device ${deviceId}`);
        console.log(`${action} successful for Kasa device ${deviceId}`);
        return { success: true, message: data.message };
    } catch (error) {
        console.error(`Error controlling Kasa device ${deviceId}:`, error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('fetch-sun-times', async (_, { latitude, longitude }) => {
    try {
        const SunCalc = require('suncalc');
        const now = new Date();
        const sunTimes = SunCalc.getTimes(now, latitude, longitude);
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        console.log("Sun times fetched:", sunTimes);
        return {
            success: true,
            sunrise: sunTimes.sunrise.toISOString(),
            sunset: sunTimes.sunset.toISOString(),
            timezone
        };
    } catch (error) {
        console.error('Error fetching sun times:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('copy-to-clipboard', async (event, text) => {
    try {
        const { clipboard } = require('electron');
        if (typeof text !== 'string') {
            throw new Error('Clipboard text must be a string');
        }
        clipboard.writeText(text);
        console.log('Main Process - Copied to clipboard:', text.substring(0, 100) + (text.length > 100 ? '...' : ''));
        console.log('Main Process - Clipboard data length:', text.length);
        console.log('Main Process - Clipboard write timestamp:', new Date().toISOString());
        return { success: true };
    } catch (err) {
        console.error('Main Process - Failed to copy to clipboard:', err);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('read-from-clipboard', async () => {
    try {
        const { clipboard } = require('electron');
        const text = clipboard.readText();
        console.log('Main Process - Read from clipboard:', text.substring(0, 100) + (text.length > 100 ? '...' : ''));
        console.log('Main Process - Clipboard data length:', text.length);
        console.log('Main Process - Clipboard read timestamp:', new Date().toISOString());
        return { success: true, text };
    } catch (err) {
        console.error('Main Process - Failed to read from clipboard:', err);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('save-temp-file', async (event, filename, content) => {
    try {
        const tempDir = app.getPath('temp');
        const tempPath = path.join(tempDir, filename);
        await fsPromises.mkdir(tempDir, { recursive: true }); // Ensure temp directory exists
        await fsPromises.writeFile(tempPath, content);
        console.log(`Main Process - Saved temp file: ${tempPath}`);
        console.log('Main Process - Temp file write timestamp:', new Date().toISOString());
        return { success: true, filePath: tempPath };
    } catch (err) {
        console.error(`Main Process - Failed to save temp file: ${err}`);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('read-temp-file', async (event, filename) => {
    try {
        const tempPath = path.join(app.getPath('temp'), filename);
        const content = await fsPromises.readFile(tempPath, 'utf8');
        console.log(`Main Process - Read temp file: ${tempPath}`);
        console.log('Main Process - Temp file read timestamp:', new Date().toISOString());
        return { success: true, content };
    } catch (err) {
        console.error(`Main Process - Failed to read temp file: ${err}`);
        return { success: false, error: err.message };
    }
});

ipcMain.on('save-graph', async (event, graphData) => {
    try {
        const { canceled, filePath } = await dialog.showSaveDialog({
            title: 'Save Graph',
            defaultPath: path.join(app.getPath('downloads'), `graph_${new Date().toISOString().replace(/[:.]/g, '-')}.json`),
            filters: [{ name: 'JSON Files', extensions: ['json'] }],
        });
        if (!canceled && filePath) {
            await fsPromises.writeFile(filePath, JSON.stringify(graphData, null, 2));
            event.reply('graph-saved', filePath);
            console.log(`Graph saved to ${filePath}`);
        }
    } catch (error) {
        console.error('Error saving graph:', error);
        event.reply('save-error', error.message);
    }
});

ipcMain.on('save-logic', async (event, logicData) => {
    try {
        const { canceled, filePath } = await dialog.showSaveDialog({
            title: 'Save Logic',
            defaultPath: path.join(app.getPath('downloads'), `logic_${new Date().toISOString().replace(/[:.]/g, '-')}.json`),
            filters: [{ name: 'JSON Files', extensions: ['json'] }],
        });
        if (!canceled && filePath) {
            await fsPromises.writeFile(filePath, JSON.stringify(logicData, null, 2));
            event.reply('logic-saved', filePath);
            console.log(`Logic saved to ${filePath}`);
        }
    } catch (error) {
        console.error('Error saving logic:', error);
        event.reply('save-error', error.message);
    }
});

ipcMain.on('save-api-keys', (event, keys) => {
    // Adjusted .env path for 2.1 structure (v3_migration/backend/.env)
    const envPath = path.join(__dirname, '..', '..', '..', '.env');
    try {
        console.log('Received save-api-keys with keys:', keys);
        const envContent = [
            '# Hue Bridge settings',
            `HUE_BRIDGE_IP=${keys.hueBridgeIp || ''}`,
            `HUE_USERNAME=${keys.hue || ''}`,
            `TELEGRAM_API_KEY=${keys.telegram || ''}`,
            `OPENWEATHER_API_KEY=${keys.openweather || ''}`,
            `AMBIENTWEATHER_API_KEY=${keys.ambientweather || ''}`
        ].join('\n') + '\n';

        console.log('Writing to .env file:', envContent);
        fs.writeFileSync(envPath, envContent);
        event.reply('api-keys-saved', 'API keys saved successfully!');
        console.log('API keys saved to .env');
    } catch (error) {
        console.error('Error saving API keys:', error);
        event.reply('api-keys-saved', `Error saving keys: ${error.message}`);
    }
});

ipcMain.on('fetch-hue-key', async (event) => {
    console.log('Received fetch-hue-key IPC');
    try {
        console.log('Requesting IP from renderer...');
        mainWindow.webContents.send('request-hue-ip');

        const bridgeIp = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                console.log('Timeout waiting for IP response from renderer');
                reject(new Error('Timeout waiting for IP response'));
            }, 60000);

            ipcMain.once('fetch-hue-key-response', (event, ip) => {
                console.log('Received fetch-hue-key-response event');
                clearTimeout(timeout);
                console.log('Received fetch-hue-key-response with IP:', ip);
                resolve(ip);
            });

            console.log('Waiting for fetch-hue-key-response...');
        });

        console.log('Bridge IP resolved:', bridgeIp);

        if (!bridgeIp) {
            console.log('No IP provided');
            event.sender.send('hue-key-fetched', { success: false, error: 'No IP provided' });
            return;
        }

        console.log('Showing button press dialog...');
        await dialog.showMessageBox(mainWindow, {
            type: 'info',
            buttons: ['OK'],
            title: 'Press Hue Bridge Button',
            message: 'Press the link button on your Hue Bridge now. You have 30 seconds.'
        });

        console.log('Attempting to fetch Hue key...');
        const hueApi = await api.createLocal(bridgeIp).connect();
        const key = await hueApi.users.createUser('t2autotron', 'T2AutoTron App');
        console.log('Hue API key fetched:', key.username);

        event.sender.send('hue-key-fetched', { success: true, key: key.username });
    } catch (error) {
        console.error('Error fetching Hue key:', error);
        event.sender.send('hue-key-fetched', { success: false, error: error.message });
    }
});

ipcMain.on('log', (event, { level, message }) => {
    const logMessage = `${new Date().toISOString()} - ${level.toUpperCase()}: ${message}`;
    fsPromises.appendFile(path.join(crashDir, 'renderer.log'), logMessage + '\n').catch(err => {
        process.stderr.write(`Failed to write to renderer.log: ${err.message}\n`);
    });
    if (level === 'error') {
        originalConsoleError(logMessage);
        sendLogToRenderer(`Renderer: ${logMessage}`, true);
    } else {
        originalConsoleLog(logMessage);
        sendLogToRenderer(`Renderer: ${logMessage}`, true);
    }
});

ipcMain.on('crash-main', () => {
    console.log('Forcing main process crash for testing');
    process.crash();
});

ipcMain.on('crash-renderer', () => {
    console.log('Received crash-renderer IPC from renderer');
    fsPromises.appendFile(path.join(crashDir, 'main.log'), `${new Date().toISOString()} - INFO: Forcing renderer crash for testing\n`).catch(err => {
        process.stderr.write(`Failed to write to main.log: ${err.message}\n`);
    });
    if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('do-crash');
    } else {
        console.error('Cannot force renderer crash: mainWindow or webContents unavailable');
    }
});

app.whenReady().then(async () => {
    // Ensure temp directory exists at startup
    try {
        await fsPromises.mkdir(app.getPath('temp'), { recursive: true });
        console.log(`Main Process - Temp directory ensured: ${app.getPath('temp')}`);
    } catch (err) {
        console.error('Main Process - Failed to create temp directory:', err);
    }

    await clearCache();

    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
        if (permission === 'geolocation') callback(true);
        else callback(false);
    });

    createWindow();
    initializeSocketIO();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
            initializeSocketIO();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        socket?.disconnect();
        app.quit();
    }
});

process.on('uncaughtException', (error) => {
    const errorMsg = `Main process uncaught exception: ${error.message}\nStack: ${error.stack}`;
    console.error(errorMsg);
    fsPromises.appendFile(path.join(crashDir, 'main.log'), `${new Date().toISOString()} - ${errorMsg}\n`).catch(err => {
        process.stderr.write(`Failed to write to main.log: ${err.message}\n`);
    });
});
