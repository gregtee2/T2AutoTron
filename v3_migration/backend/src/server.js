const path = require('path');

// Identify this server instance clearly (helps when multiple servers are accidentally running)
console.log(`[Startup] PID=${process.pid} CWD=${process.cwd()}`);

// ============================================
// CRITICAL: Start keep-alive IMMEDIATELY to prevent premature exit
// This must be BEFORE any async operations
// ============================================
const startTime = Date.now();
let keepAliveCounter = 0;
const KEEP_ALIVE = setInterval(() => {
  keepAliveCounter++;
  // Log every minute to show server is still running
  if (keepAliveCounter % 60 === 0) {
    const uptimeMinutes = Math.floor((Date.now() - startTime) / 60000);
    console.log(`[Server] Uptime: ${uptimeMinutes} minutes`);
  }
}, 1000);
KEEP_ALIVE.ref(); // Explicitly keep this interval referenced
console.log('[Startup] Keep-alive interval started');

// Detect Home Assistant add-on environment
const IS_HA_ADDON = !!process.env.SUPERVISOR_TOKEN;
// Use absolute path relative to this file, not working directory
const ENV_PATH = IS_HA_ADDON ? '/data/.env' : path.join(__dirname, '..', '.env');

console.log(`[Startup] ENV_PATH=${ENV_PATH}`);

// ALWAYS log this so we can diagnose addon detection issues
console.log(`[Startup] IS_HA_ADDON=${IS_HA_ADDON}, SUPERVISOR_TOKEN=${process.env.SUPERVISOR_TOKEN ? 'present' : 'missing'}`);

require('dotenv').config({ path: ENV_PATH });

// Debug mode - set VERBOSE_LOGGING=true in .env to enable detailed console output
const DEBUG = process.env.VERBOSE_LOGGING === 'true';
const debug = (...args) => DEBUG && console.log('[DEBUG]', ...args);

// Global error handlers to catch crash causes
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err);
  // Don't exit - let the server try to continue
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit - let the server try to continue  
});

process.on('beforeExit', (code) => {
  console.log('[EXIT] Process beforeExit with code:', code);
  // Prevent exit by scheduling more work
  if (code === 0) {
    console.log('[EXIT] Preventing clean exit - server should stay running');
    setImmediate(() => {});
  }
});

process.on('exit', (code) => {
  console.log('[EXIT] Process exit with code:', code);
  console.log('[EXIT] Stack trace:', new Error().stack);
});

debug('Starting server.js...');
debug('Running as HA add-on:', IS_HA_ADDON);
debug('ENV_PATH:', ENV_PATH);
debug('OPENWEATHERMAP_API_KEY:', process.env.OPENWEATHERMAP_API_KEY ? 'Set' : 'Not set');
debug('HA_TOKEN:', process.env.HA_TOKEN ? 'Loaded' : 'Not set');

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const figlet = require('figlet');
const chalk = require('chalk');
const config = require('./config/env');
const { connectMongoDB } = require('./config/database');
const logger = require('./logging/logger');
const DeviceService = require('./devices/services/deviceService');
const { setupNotifications } = require('./notifications/notificationService');
const { fetchWeatherData } = require('./weather/weatherService');
const { fetchForecastData } = require('./weather/forecastService');
const { normalizeState } = require('./utils/normalizeState');
const { loadManagers, loadRoutes } = require('./devices/pluginLoader');
const deviceManagers = require('./devices/managers/deviceManagers');
const mongoose = require('mongoose');
const fs = require('fs').promises;
const requireLocalOrPin = require('./api/middleware/requireLocalOrPin');

debug('Weather imports:', {
  fetchWeatherData: typeof fetchWeatherData,
  fetchForecastData: typeof fetchForecastData
});

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    // Allow all origins in add-on mode since ingress uses dynamic paths
    origin: IS_HA_ADDON ? true : ['http://localhost:3000', 'http://localhost:8080', 'file://', 'http://localhost:5173'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-APP-PIN', 'X-Ingress-Path'],
    credentials: true
  },
  maxHttpBufferSize: 1e8,
  pingTimeout: 60000,      // Increased from 30s to 60s for ingress environments
  pingInterval: 25000,     // Increased from 10s to 25s (must be less than ingress timeout)
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  // Allow upgrades from polling to websocket
  allowUpgrades: true
});

// Log Socket.IO errors
io.on('error', (error) => {
  logger.log('Socket.IO server error: ' + error.message, 'error', false, 'socket:error', { stack: error.stack });
  console.error('Socket.IO server error:', error.message);
});

// Update service for checking updates
const updateService = require('./services/updateService');

// Backend engine for server-side automation
let backendEngine = null;
try {
  backendEngine = require('./engine/BackendEngine');
} catch (err) {
  console.log('[Server] Backend engine not available:', err.message);
}

// Track active frontend editors (for engine coordination)
const activeEditors = new Set();

// === PERIODIC UPDATE CHECK (every 5 minutes) ===
// Skip update checks in HA add-on - updates come from HA Supervisor, not git
let lastNotifiedVersion = null;
if (!IS_HA_ADDON) {
  setInterval(async () => {
    try {
      const updateInfo = await updateService.checkForUpdates(true); // Force check
      if (updateInfo.hasUpdate && updateInfo.newVersion !== lastNotifiedVersion) {
        lastNotifiedVersion = updateInfo.newVersion;
        io.emit('update-available', updateInfo); // Broadcast to ALL connected clients
        debug(`[Update] Broadcast update notification: ${updateInfo.currentVersion} → ${updateInfo.newVersion}`);
      }
    } catch (err) {
      debug('[Update] Periodic check failed:', err.message);
    }
  }, 5 * 60 * 1000); // Check every 5 minutes
} else {
  debug('[Update] Skipping update checks - HA add-on updates via Supervisor');
}

// Log client connections/disconnections
io.on('connection', (socket) => {
  logger.log(`Socket.IO client connected: ${socket.id}`, 'info', false, 'socket:connect');
  debug(`Socket.IO client connected: ${socket.id}`);

  // === CHECK FOR UPDATES ON CONNECTION ===
  // Skip in HA add-on - updates come from HA Supervisor, not git
  if (!IS_HA_ADDON) {
    (async () => {
      try {
        const updateInfo = await updateService.checkForUpdates();
        if (updateInfo.hasUpdate) {
          socket.emit('update-available', updateInfo);
          debug(`[Update] Notified client of update: ${updateInfo.currentVersion} → ${updateInfo.newVersion}`);
        }
      } catch (err) {
        debug('[Update] Check failed:', err.message);
      }
    })();
  }

  // === CLIENT LOGGING ===
  socket.on('log', ({ message, level, timestamp }) => {
    logger.log(message, level, false, 'node:log', { timestamp });
  });

  socket.on('subscribe-logs', () => {
    const logListener = (message, level) => {
      socket.emit('log', { message, level, timestamp: new Date() });
    };
    logger.on('log', logListener);
    socket.on('disconnect', () => logger.off('log', logListener));
  });

  // === HA TOKEN FROM CLIENT ===
  let clientHAToken = null;
  socket.on('set-ha-token', (token) => {
    clientHAToken = token;
    logger.log('HA token received from client', 'info');
  });

  // === HA CONNECTION STATUS REQUEST ===
  socket.on('request-ha-status', () => {
    debug('[HA Status] Request received');
    const haManager = deviceManagers.getManager('ha_');
    debug('[HA Status] haManager type:', typeof haManager);
    
    if (haManager && typeof haManager.getConnectionStatus === 'function') {
      const status = haManager.getConnectionStatus();
      debug('[HA Status] getConnectionStatus returned:', status);
      socket.emit('ha-connection-status', {
        connected: status.isConnected,
        wsConnected: status.wsConnected,
        deviceCount: status.deviceCount,
        host: status.host
      });
    } else {
      debug('[HA Status] getConnectionStatus not available, checking direct props');
      // Try direct access as fallback
      if (haManager) {
        debug('[HA Status] Direct isConnected:', haManager.isConnected);
        debug('[HA Status] Direct devices length:', haManager.devices?.length);
      }
      socket.emit('ha-connection-status', {
        connected: false,
        wsConnected: false,
        deviceCount: 0,
        host: 'Manager issue'
      });
    }
  });

  // === 5-DAY FORECAST REQUEST ===
  socket.on('request-forecast', async () => {
    try {
      const forecast = await fetchForecastData(true, clientHAToken);
      if (Array.isArray(forecast) && forecast.length > 0) {
        socket.emit('forecast-update', forecast);
        logger.log('Sent forecast to client', 'info');
      } else {
        logger.log('No forecast data to send', 'warn');
      }
    } catch (err) {
      logger.log(`Forecast request failed: ${err.message}`, 'error');
      console.error('Forecast request failed:', err);
    }
  });

  // === WEATHER REQUEST ===
  socket.on('request-weather-update', async () => {
    try {
      const weather = await fetchWeatherData(true);
      if (weather) {
        socket.emit('weather-update', weather);
        logger.log('Sent weather to client', 'info');
      } else {
        logger.log('No weather data to send', 'warn');
      }
    } catch (err) {
      logger.log(`Weather request failed: ${err.message}`, 'error');
      console.error('Weather request failed:', err);
    }
  });

  // === DISCONNECT ===
  socket.on('disconnect', (reason) => {
    logger.log(`Socket.IO client disconnected: ${socket.id}, Reason: ${reason}`, 'warn', false, 'socket:disconnect');
    debug(`Socket.IO client disconnected: ${socket.id}, Reason: ${reason}`);
    
    // Remove from active editors and update engine
    if (activeEditors.has(socket.id)) {
      activeEditors.delete(socket.id);
      debug(`[Editor] Editor disconnected: ${socket.id}, active editors: ${activeEditors.size}`);
      
      // If no more editors, tell engine to resume device control
      if (activeEditors.size === 0 && backendEngine) {
        backendEngine.setFrontendActive(false);
      }
    }
  });

  // === EDITOR ACTIVE/INACTIVE (for engine coordination) ===
  // Frontend emits this when editor becomes active
  socket.on('editor-active', () => {
    activeEditors.add(socket.id);
    debug(`[Editor] Editor active: ${socket.id}, total active: ${activeEditors.size}`);
    
    // Tell engine to pause device commands while frontend is active
    if (backendEngine) {
      backendEngine.setFrontendActive(true);
    }
    
    // Acknowledge
    socket.emit('editor-active-ack', { activeEditors: activeEditors.size });
  });

  // Frontend sends heartbeat every 30 seconds to keep frontend-active status alive
  socket.on('editor-heartbeat', () => {
    if (activeEditors.has(socket.id) && backendEngine) {
      backendEngine.frontendHeartbeat();
    }
  });

  // Frontend emits this when user explicitly wants engine to take over
  socket.on('editor-inactive', () => {
    activeEditors.delete(socket.id);
    debug(`[Editor] Editor inactive: ${socket.id}, remaining active: ${activeEditors.size}`);
    
    // If no more active editors, resume engine device control
    if (activeEditors.size === 0 && backendEngine) {
      backendEngine.setFrontendActive(false);
    }
    
    socket.emit('editor-inactive-ack', { activeEditors: activeEditors.size });
  });
});

// Simple version endpoint - returns app version from package.json
app.get('/api/version', (req, res) => {
  const packageJson = require('../package.json');
  res.json({ 
    version: packageJson.version,
    name: packageJson.name,
    isAddon: IS_HA_ADDON
  });
});

// Endpoint to list plugins - Moved before static files to ensure priority
app.get('/api/plugins', async (req, res) => {
  debug('API Request: /api/plugins');
  try {
    const pluginsDir = path.join(__dirname, '../plugins');
    debug('Looking for plugins in:', pluginsDir);
    
    // Ensure directory exists
    try {
      await fs.access(pluginsDir);
    } catch {
      debug('Plugins directory not found, creating...');
      await fs.mkdir(pluginsDir, { recursive: true });
    }

    const files = await fs.readdir(pluginsDir);
    const jsFiles = files.filter(file => file.endsWith('.js'));
    
    // Sort: 00_ infrastructure files first (alphabetically), then other files alphabetically
    jsFiles.sort((a, b) => {
      const aIsInfra = a.startsWith('00_');
      const bIsInfra = b.startsWith('00_');
      if (aIsInfra && !bIsInfra) return -1;  // a comes first
      if (!aIsInfra && bIsInfra) return 1;   // b comes first
      return a.localeCompare(b);              // alphabetical within same type
    });
    
    const pluginPaths = jsFiles.map(file => `plugins/${file}`);
    debug('Found plugins (sorted):', pluginPaths.length, 'files');
    res.json(pluginPaths);
  } catch (error) {
    logger.log(`Failed to list plugins: ${error.message}`, 'error', false, 'plugins:error', { stack: error.stack });
    console.error(`Failed to list plugins: ${error.message}`);
    res.status(500).json({ error: 'Failed to list plugin files' });
  }
});

// Serve index.html with correct base URL for HA ingress
// This must come BEFORE express.static to intercept the root path
app.get('/', async (req, res) => {
  try {
    const indexPath = path.join(__dirname, '../frontend/index.html');
    let html = await fs.readFile(indexPath, 'utf8');
    
    // Check if this is an HA ingress request
    // HA Ingress sets X-Ingress-Path header with the full path
    let ingressPath = req.headers['x-ingress-path'];
    
    // Fallback: Check X-Forwarded-Prefix (some HA versions use this)
    if (!ingressPath) {
      ingressPath = req.headers['x-forwarded-prefix'];
    }
    
    // Fallback: Check if we're in addon mode and extract from Referer
    if (!ingressPath && IS_HA_ADDON) {
      const referer = req.headers['referer'] || '';
      const match = referer.match(/\/api\/hassio_ingress\/[^/]+/);
      if (match) {
        ingressPath = match[0] + '/';
      }
    }
    
    // Log headers in addon mode for debugging (first request only)
    if (IS_HA_ADDON && !app._ingressLogged) {
      console.log('[Ingress Debug] Request headers:', JSON.stringify(req.headers, null, 2));
      app._ingressLogged = true;
    }
    
    if (ingressPath) {
      // Ensure path ends with /
      if (!ingressPath.endsWith('/')) ingressPath += '/';
      // Inject base tag for HA ingress - ensures all relative paths work
      const baseTag = `<base href="${ingressPath}">`;
      html = html.replace('<head>', `<head>\n    ${baseTag}`);
      console.log(`[Ingress] Serving index.html with base: ${ingressPath}`);
    }
    
    res.type('html').send(html);
  } catch (error) {
    console.error('Error serving index.html:', error);
    res.status(500).send('Error loading application');
  }
});

// Serve static files
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/custom_nodes', express.static(path.join(__dirname, '../frontend/custom_nodes')));
app.use('/plugins', express.static(path.join(__dirname, '../plugins')));


// Sandbox route for testing refactored index.html
app.get('/sandbox', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend', 'Index.html_Proposal', 'Index.html'));
});



// Endpoint to list custom node files
app.get('/api/custom-nodes', async (req, res) => {
  try {
    const customNodesDir = path.join(__dirname, 'frontend/custom_nodes');
    async function getJsFiles(dir, baseDir = customNodesDir) {
      let results = [];
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
        if (entry.isDirectory()) {
          if (entry.name !== 'deprecated') {
            results = results.concat(await getJsFiles(fullPath, baseDir));
          }
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
          results.push(`custom_nodes/${relativePath}`);
        }
      }
      return results;
    }
    const jsFiles = await getJsFiles(customNodesDir);
    res.json(jsFiles);
  } catch (error) {
    logger.log(`Failed to list custom nodes: ${error.message}`, 'error', false, 'custom-nodes:error', { stack: error.stack });
    console.error(`Failed to list custom nodes: ${error.message}`);
    res.status(500).json({ error: 'Failed to list custom node files' });
  }
});

// New endpoint to fetch HA token (securely)
app.get('/api/ha-token', (req, res) => {
  try {
    const token = process.env.HA_TOKEN || '';
    res.json({ success: true, token: token ? '********' : '' });
  } catch (error) {
    logger.log(`Failed to fetch HA token: ${error.message}`, 'error', false, 'ha-token:fetch');
    res.status(500).json({ success: false, error: error.message });
  }
});

// New endpoint to fetch Home Assistant config
app.get('/api/config', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '') || process.env.HA_TOKEN;
    if (!token) throw new Error('No Home Assistant token provided');
    const haHost = process.env.HA_HOST || 'http://localhost:8123';
    const response = await fetch(`${haHost}/api/config`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const config = await response.json();
    res.json({
      success: true,
      isAddon: IS_HA_ADDON,
      timezone: config.time_zone,
      latitude: config.latitude,
      longitude: config.longitude,
      locationName: config.location_name || 'Home',
      elevation: config.elevation
    });
    logger.log('Fetched HA config', 'info', false, 'config:fetch');
  } catch (error) {
    logger.log(`Failed to fetch HA config: ${error.message}`, 'error', false, 'config:fetch');
    res.status(500).json({ success: false, error: error.message, isAddon: IS_HA_ADDON });
  }
});

// ============================================================================
// EXAMPLE GRAPH API - Serve starter graph for new users
// ============================================================================
app.get('/api/examples/starter', async (req, res) => {
  try {
    const examplePath = path.join(__dirname, '..', 'examples', 'starter_graph.json');
    try {
      await fs.access(examplePath);
    } catch {
      return res.status(404).json({ success: false, error: 'Starter graph not found' });
    }
    const graphData = await fs.readFile(examplePath, 'utf8');
    res.json({ success: true, graph: JSON.parse(graphData) });
    logger.log('Served starter example graph', 'info', false, 'examples:load');
  } catch (error) {
    logger.log(`Failed to load starter graph: ${error.message}`, 'error', false, 'examples:load');
    res.status(500).json({ success: false, error: error.message });
  }
});

// New endpoint to fetch sunrise/sunset
app.get('/api/sun/times', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '') || process.env.HA_TOKEN;
    if (!token) throw new Error('No Home Assistant token provided');
    const haHost = process.env.HA_HOST || 'http://localhost:8123';
    const sunResponse = await fetch(`${haHost}/api/states/sun.sun`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!sunResponse.ok) throw new Error(`HTTP ${sunResponse.status}`);
    const sun = await sunResponse.json();
    const configResponse = await fetch(`${haHost}/api/config`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!configResponse.ok) throw new Error(`HTTP ${configResponse.status}`);
    const config = await configResponse.json();
    res.json({
      success: true,
      sunrise: sun.attributes.next_rising,
      sunset: sun.attributes.next_setting,
      timezone: config.time_zone || req.query.timezone || 'America/Los_Angeles',
      latitude: config.latitude || req.query.latitude || 34.0522,
      longitude: config.longitude || req.query.longitude || -118.2437,
      city: req.query.city || config.location_name || 'Los Angeles'
    });
    logger.log(`Fetched sun times for ${config.location_name || 'Los Angeles'}`, 'info', false, 'sun:fetch');
  } catch (error) {
    logger.log(`Failed to fetch sun times: ${error.message}`, 'error', false, 'sun:fetch');
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// SETTINGS API - Read/Write .env file
// ============================================================================

// Allowlist of settings that can be read/written via API
const ALLOWED_SETTINGS = [
  'PORT', 'LOG_LEVEL', 'VERBOSE_LOGGING',
  'APP_PIN',
  'HA_HOST', 'HA_TOKEN',
  'OPENWEATHERMAP_API_KEY',
  'AMBIENT_API_KEY', 'AMBIENT_APPLICATION_KEY', 'AMBIENT_MAC_ADDRESS',
  'HUE_BRIDGE_IP', 'HUE_USERNAME',
  'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID',
  'KASA_POLLING_INTERVAL',
  'LOCATION_CITY', 'LOCATION_LATITUDE', 'LOCATION_LONGITUDE', 'LOCATION_TIMEZONE'
];

const SECRET_SETTINGS = new Set([
  'APP_PIN',
  'HA_TOKEN',
  'OPENWEATHERMAP_API_KEY',
  'AMBIENT_API_KEY',
  'AMBIENT_APPLICATION_KEY',
  'HUE_USERNAME',
  'TELEGRAM_BOT_TOKEN'
]);

// Helper to get persistent env path (HA add-on uses /data/, standalone uses local .env)
const getEnvPath = () => IS_HA_ADDON ? '/data/.env' : path.join(__dirname, '../.env');

// GET current settings (masked secrets)
app.get('/api/settings', requireLocalOrPin, async (req, res) => {
  try {
    const envPath = getEnvPath();
    let envContent = '';
    try {
      envContent = await fs.readFile(envPath, 'utf-8');
    } catch (err) {
      if (err.code === 'ENOENT') {
        // First run: no .env yet
        res.json({ success: true, settings: {} });
        logger.log('Settings fetched via API (no .env found)', 'info', false, 'settings:read');
        return;
      }
      throw err;
    }
    
    const settings = {};
    const lines = envContent.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex > 0) {
          const key = trimmed.substring(0, eqIndex).trim();
          const value = trimmed.substring(eqIndex + 1).trim();
          
          // Only return allowed settings
          if (ALLOWED_SETTINGS.includes(key)) {
            // Never return secret values in plaintext
            if (SECRET_SETTINGS.has(key)) {
              settings[key] = value ? '********' : '';
            } else {
              settings[key] = value;
            }
          }
        }
      }
    }
    
    res.json({ success: true, settings });
    logger.log('Settings fetched via API', 'info', false, 'settings:read');
  } catch (error) {
    logger.log(`Failed to read settings: ${error.message}`, 'error', false, 'settings:read');
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST update settings
app.post('/api/settings', requireLocalOrPin, express.json(), async (req, res) => {
  try {
    const { settings: newSettings } = req.body;
    
    if (!newSettings || typeof newSettings !== 'object') {
      return res.status(400).json({ success: false, error: 'Invalid settings data' });
    }
    
    const envPath = getEnvPath();
    
    // Create .env if it doesn't exist (first-time setup via UI)
    let envContent = '';
    try {
      envContent = await fs.readFile(envPath, 'utf-8');
    } catch (err) {
      if (err.code === 'ENOENT') {
        logger.log('Creating new .env file for first-time setup', 'info', false, 'settings:init');
        envContent = '# T2AutoTron Environment Configuration\n# Created automatically via Settings UI\n\n';
      } else {
        throw err;
      }
    }
    
    // Process each setting update
    for (const [key, value] of Object.entries(newSettings)) {
      // Security: Only allow whitelisted keys
      if (!ALLOWED_SETTINGS.includes(key)) {
        logger.log(`Blocked attempt to set non-allowed key: ${key}`, 'warn', false, 'settings:blocked');
        continue;
      }

      // Secrets: treat masked/empty value as "no change"
      if (SECRET_SETTINGS.has(key)) {
        if (value === '********' || value === '' || value == null) {
          continue;
        }
      }
      
      // Sanitize value (prevent injection)
      const sanitizedValue = String(value).replace(/[\r\n]/g, '');
      
      // Check if key exists in file
      const regex = new RegExp(`^${key}=.*$`, 'm');
      if (regex.test(envContent)) {
        // Update existing key
        envContent = envContent.replace(regex, `${key}=${sanitizedValue}`);
      } else {
        // Append new key
        envContent = envContent.trimEnd() + `\n${key}=${sanitizedValue}\n`;
      }
    }
    
    // Write back to .env file
    await fs.writeFile(envPath, envContent, 'utf-8');
    
    // Update process.env for immediate effect (some settings)
    for (const [key, value] of Object.entries(newSettings)) {
      if (ALLOWED_SETTINGS.includes(key)) {
        if (SECRET_SETTINGS.has(key) && (value === '********' || value === '' || value == null)) {
          continue;
        }
        process.env[key] = String(value);
      }
    }
    
    // Notify managers to reload their config from updated process.env
    const homeAssistantManager = require('./devices/managers/homeAssistantManager');
    if (homeAssistantManager.updateConfig) {
      const configChanged = homeAssistantManager.updateConfig();
      if (configChanged) {
        logger.log('Home Assistant manager config refreshed, re-initializing...', 'info', false, 'settings:ha-refresh');
        // Re-initialize to establish WebSocket connection with new credentials
        try {
          await homeAssistantManager.initialize(io, null, logger.log.bind(logger));
          logger.log('Home Assistant re-initialized successfully', 'info', false, 'settings:ha-reinit');
        } catch (haError) {
          logger.log(`HA re-init failed: ${haError.message}`, 'warn', false, 'settings:ha-reinit-fail');
        }
      }
    }
    
    res.json({ success: true, message: 'Settings saved successfully' });
    logger.log('Settings updated via API', 'info', false, 'settings:write');
  } catch (error) {
    logger.log(`Failed to save settings: ${error.message}`, 'error', false, 'settings:write');
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST test connection for a service
app.post('/api/settings/test', requireLocalOrPin, express.json(), async (req, res) => {
  const { service, settings } = req.body;
  
  try {
    let result = { success: false, message: 'Unknown service' };

    const getSetting = (key) => {
      const val = settings?.[key];
      if (val === '********') return undefined;
      return val;
    };
    
    switch (service) {
      case 'ha': {
        // Test Home Assistant connection
        const host = getSetting('HA_HOST') || process.env.HA_HOST;
        const token = getSetting('HA_TOKEN') || process.env.HA_TOKEN;
        
        if (!host || !token) {
          result = { success: false, message: 'Missing HA_HOST or HA_TOKEN' };
          break;
        }
        
        try {
          const response = await fetch(`${host}/api/`, {
            headers: { Authorization: `Bearer ${token}` },
            timeout: 10000
          });
          
          if (response.ok) {
            const data = await response.json();
            result = { 
              success: true, 
              message: 'Connected to Home Assistant!',
              details: `Version: ${data.version || 'Unknown'}`
            };
          } else {
            result = { success: false, message: `HTTP ${response.status}: ${response.statusText}` };
          }
        } catch (err) {
          result = { success: false, message: `Connection failed: ${err.message}` };
        }
        break;
      }
      
      case 'weather': {
        // Test OpenWeatherMap API
        const apiKey = getSetting('OPENWEATHERMAP_API_KEY') || process.env.OPENWEATHERMAP_API_KEY;
        
        if (!apiKey) {
          result = { success: false, message: 'Missing OPENWEATHERMAP_API_KEY' };
          break;
        }
        
        try {
          const response = await fetch(
            `https://api.openweathermap.org/data/2.5/weather?q=London&appid=${apiKey}`,
            { timeout: 10000 }
          );
          
          if (response.ok) {
            const data = await response.json();
            result = { 
              success: true, 
              message: 'OpenWeatherMap API connected!',
              details: `Test location: ${data.name}, ${data.sys?.country}`
            };
          } else if (response.status === 401) {
            result = { success: false, message: 'Invalid API key' };
          } else {
            result = { success: false, message: `HTTP ${response.status}: ${response.statusText}` };
          }
        } catch (err) {
          result = { success: false, message: `Connection failed: ${err.message}` };
        }
        break;
      }
      
      case 'hue': {
        // Test Philips Hue Bridge
        const bridgeIp = getSetting('HUE_BRIDGE_IP') || process.env.HUE_BRIDGE_IP;
        const username = getSetting('HUE_USERNAME') || process.env.HUE_USERNAME;
        
        if (!bridgeIp || !username) {
          result = { success: false, message: 'Missing HUE_BRIDGE_IP or HUE_USERNAME' };
          break;
        }
        
        try {
          const response = await fetch(`http://${bridgeIp}/api/${username}/lights`, { timeout: 10000 });
          
          if (response.ok) {
            const data = await response.json();
            if (data.error || (Array.isArray(data) && data[0]?.error)) {
              const error = data.error || data[0].error;
              result = { success: false, message: `Bridge error: ${error.description}` };
            } else {
              const lightCount = Object.keys(data).length;
              result = { 
                success: true, 
                message: 'Connected to Hue Bridge!',
                details: `Found ${lightCount} light(s)`
              };
            }
          } else {
            result = { success: false, message: `HTTP ${response.status}: ${response.statusText}` };
          }
        } catch (err) {
          result = { success: false, message: `Connection failed: ${err.message}` };
        }
        break;
      }
      
      case 'telegram': {
        // Test Telegram Bot
        const botToken = getSetting('TELEGRAM_BOT_TOKEN') || process.env.TELEGRAM_BOT_TOKEN;
        const chatId = getSetting('TELEGRAM_CHAT_ID') || process.env.TELEGRAM_CHAT_ID;
        
        if (!botToken) {
          result = { success: false, message: 'Missing TELEGRAM_BOT_TOKEN' };
          break;
        }
        
        try {
          const response = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, { timeout: 10000 });
          
          if (response.ok) {
            const data = await response.json();
            if (data.ok) {
              result = { 
                success: true, 
                message: 'Telegram Bot connected!',
                details: `Bot: @${data.result.username}${chatId ? `, Chat ID: ${chatId}` : ''}`
              };
            } else {
              result = { success: false, message: 'Invalid bot token' };
            }
          } else {
            result = { success: false, message: `HTTP ${response.status}: ${response.statusText}` };
          }
        } catch (err) {
          result = { success: false, message: `Connection failed: ${err.message}` };
        }
        break;
      }
      
      default:
        result = { success: false, message: `Unknown service: ${service}` };
    }
    
    res.json(result);
    logger.log(`Settings test for ${service}: ${result.success ? 'success' : 'failed'}`, 'info', false, 'settings:test');
  } catch (error) {
    logger.log(`Settings test failed: ${error.message}`, 'error', false, 'settings:test');
    res.status(500).json({ success: false, message: error.message });
  }
});

// Increase body limit for large graphs (107+ nodes = ~2MB)
app.use(express.json({ limit: '5mb' }));
app.use(require('./api/middleware/csp'));
app.use(require('./config/cors'));
app.use(require('./api/middleware/errorHandler'));

// Update routes
const updateRoutes = require('./api/updateRoutes');
app.use('/api/update', updateRoutes);

// Camera routes
const cameraRoutes = require('./api/cameras');
app.use('/api/cameras', cameraRoutes);

// Engine routes (backend automation engine)
const engineRoutes = require('./api/routes/engineRoutes');
app.use('/api/engine', engineRoutes);

// ============================================
// Debug Dashboard API - Simple read-only endpoints
// No auth required - just for LAN monitoring
// ============================================
app.get('/api/debug/lights', async (req, res) => {
  try {
    const haManager = require('./devices/managers/homeAssistantManager');
    const devices = await haManager.getDevices();
    const lights = devices.filter(d => d.id && d.id.startsWith('ha_light.'));
    res.json({ success: true, lights });
  } catch (err) {
    res.json({ success: false, error: err.message, lights: [] });
  }
});

app.get('/api/debug/all', async (req, res) => {
  try {
    // Get engine status
    let engineStatus = { running: false };
    try {
      const { engine } = require('./engine');
      engineStatus = engine.getStatus();
    } catch (e) {}
    
    // Get buffers
    let buffers = {};
    try {
      const { AutoTronBuffer } = require('./engine/nodes/BufferNodes');
      for (const key of AutoTronBuffer.keys()) {
        buffers[key] = AutoTronBuffer.get(key);
      }
    } catch (e) {}
    
    // Get lights from HA
    let lights = [];
    try {
      const haManager = require('./devices/managers/homeAssistantManager');
      const devices = await haManager.getDevices();
      lights = devices.filter(d => d.id && d.id.startsWith('ha_light.'));
    } catch (e) {}
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      engine: engineStatus,
      buffers,
      lights
    });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Initialize DeviceService
debug('Initializing DeviceService...');
async function initializeDeviceService() {
  const managers = await loadManagers();
  const deviceService = new DeviceService(managers, {
    controlDeviceBase: deviceManagers.controlDevice,
    initializeDevices: deviceManagers.initializeDevices
  });
  debug('DeviceService initialized with managers:', Object.keys(managers));
  return deviceService;
}

// Load routes
async function setupRoutes(deviceService) {
  await loadRoutes(app, io, deviceService);
  debug('Routes set up successfully');
}

async function displayBanner() {
  const banner = figlet.textSync('T2Automations', { font: 'Slant' });
  console.log(chalk.green(banner));
  console.log(chalk.cyan('Welcome to T2Automations - Visual Node-Based Home Automation'));
  await logger.log('Server starting', 'info', false, 'banner:display');
}

async function initializeModules(deviceService) {
  debug('Setting up notifications...');
  const notificationEmitter = await setupNotifications(io);
  io.sockets.notificationEmitter = notificationEmitter;
  debug('Notifications set up');

  debug('Initializing devices...');
  try {
    const devices = await deviceService.initialize(io, notificationEmitter, logger.log.bind(logger));
    deviceService.setIo(io);
    debug(`Initialized devices: ${Object.keys(devices).length} types`);
    // Force emit Hue status after device init (for debug)
    try {
      const { emitHueStatus } = require('./devices/managers/hueManager');
      const allDevices = deviceService.getAllDevices();
      const hueLights = allDevices['hue_'] || [];
      emitHueStatus(io, hueLights.length > 0, process.env.HUE_BRIDGE_IP, hueLights.length);
    } catch (e) {
      console.log('[server.js] Could not emit initial hue status:', e.message);
    }
  } catch (error) {
    console.error('Failed to initialize devices:', error.message);
    logger.log(`Failed to initialize devices: ${error.message}`, 'error', false, 'devices:init:error', { stack: error.stack });
  }

  debug('Fetching initial weather data...');
  const initialWeather = await fetchWeatherData(true);
  debug('Initial weather data:', initialWeather ? 'received' : 'none');

  debug('Fetching initial forecast data...');
  const initialForecast = await fetchForecastData(true);
  debug('Initial forecast data:', initialForecast ? `${initialForecast.length} days` : 'none');

  if (initialWeather) {
    io.emit('weather-update', initialWeather);
    debug('Emitted initial weather-update');
    await logger.log('Emitted initial weather-update', 'info', false, 'weather-update:initial');
  }

  if (initialForecast) {
    io.emit('forecast-update', initialForecast);
    debug('Emitted initial forecast-update');
    await logger.log('Emitted initial forecast-update', 'info', false, 'forecast-update:initial');
  }

  debug('Weather data fetched');

  let lastWeatherDate = null;
  let lastForecastDate = null;

  setInterval(async () => {
    debug('Fetching periodic weather data...');
    const updatedWeather = await fetchWeatherData(true);

    debug('Fetching periodic forecast data...');
    const updatedForecast = await fetchForecastData(true);

    if (updatedWeather && (!lastWeatherDate || updatedWeather.date !== lastWeatherDate)) {
      io.emit('weather-update', updatedWeather);
      lastWeatherDate = updatedWeather.date;
      debug('Emitted periodic weather-update');
      await logger.log('Emitted weather-update with new data', 'info', false, 'weather-update:periodic');
    }

    if (updatedForecast && updatedForecast.length > 0 && (!lastForecastDate || updatedForecast[0]?.date !== lastForecastDate)) {
      io.emit('forecast-update', updatedForecast);
      lastForecastDate = updatedForecast[0]?.date;
      debug('Emitted periodic forecast-update');
      await logger.log('Emitted forecast-update with new data', 'info', false, 'forecast-update:periodic');
    }
  }, 3 * 60 * 1000);

  io.on('connection', require('./api/socketHandlers')(deviceService));

  // Initialize backend engine
  debug('Initializing backend automation engine...');
  try {
    const { initEngineSocketHandlers, autoStartEngine } = require('./api/engineSocketHandlers');
    initEngineSocketHandlers(io);
    await autoStartEngine();
    debug('Backend engine initialized');
  } catch (error) {
    console.error('[Engine] Initialization error:', error.message);
    debug('Backend engine initialization failed:', error.message);
  }
}

async function startServer() {
  try {
    debug('Starting server setup...');
    await displayBanner();
    debug('Connecting to MongoDB...');
    await connectMongoDB();
    debug('Initializing DeviceService...');
    const deviceService = await initializeDeviceService();
    debug('Setting up routes...');
    await setupRoutes(deviceService);
    debug('Initializing modules...');
    await initializeModules(deviceService);
    debug('Starting server on port...');
    const PORT = config.get('port');
    const HOST = process.env.HOST || '0.0.0.0';  // Bind to all interfaces for Docker/HA
    server.listen(PORT, HOST, () => {
      logger.log(`Server running on http://${HOST}:${PORT}`, 'info', false, 'server:start');
      console.log(chalk.cyan(`✓ Server running on http://${HOST}:${PORT}`));
    });
    
    // Note: Keep-alive is started at the very top of this file (before any async operations)
    // to ensure the process stays alive even if startup takes a while
    
    // Explicitly keep stdin open to prevent exit
    if (process.stdin.isTTY) {
      process.stdin.resume();
    }
    
    console.log('[Server] Keep-alive active, handles:', process._getActiveHandles().length);
  } catch (err) {
    console.error('Startup error:', err.message);
    logger.log(`Startup failed: ${err.message}`, 'error', false, 'error:startup');
    process.exit(1);
  }
}

startServer();

// Track if we've received a shutdown signal to prevent double-shutdown
let shuttingDown = false;

process.on('SIGINT', async () => {
  console.log('[SIGINT] Received SIGINT signal');
  // In VS Code terminal, SIGINT can be sent unexpectedly
  // Only shut down if this is a real user-initiated Ctrl+C
  if (shuttingDown) {
    console.log('[SIGINT] Already shutting down, ignoring');
    return;
  }
  
  // If server has been running less than 30 seconds, ignore SIGINT
  // This prevents premature shutdown during startup
  const uptimeMs = Date.now() - startTime;
  if (uptimeMs < 30000) {
    console.log(`[SIGINT] Server only running for ${Math.round(uptimeMs/1000)}s, ignoring signal (likely VS Code artifact)`);
    return;
  }
  
  shuttingDown = true;
  console.log('[SIGINT] Initiating graceful shutdown...');
  await logger.log('Shutting down server', 'info', false, 'shutdown');
  server.close(async () => {
    await mongoose.connection.close();
    process.exit(0);
  });
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  logger.log(`Uncaught Exception: ${err.message}`, 'error', false, 'error:uncaught', { stack: err.stack });
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  logger.log(`Unhandled Rejection: ${reason}`, 'error', false, 'error:unhandled');
});