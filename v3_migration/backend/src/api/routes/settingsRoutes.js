/**
 * settingsRoutes.js - Settings API endpoints
 * 
 * Handles reading/writing .env configuration and testing service connections.
 * Extracted from server.js for better separation of concerns.
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const logger = require('../../logging/logger');
const requireLocalOrPin = require('../middleware/requireLocalOrPin');

// Detect Home Assistant add-on environment
const IS_HA_ADDON = !!process.env.SUPERVISOR_TOKEN;

// Allowlist of settings that can be read/written via API
const ALLOWED_SETTINGS = [
  'PORT', 'LOG_LEVEL', 'VERBOSE_LOGGING',
  'APP_PIN',
  'HA_HOST', 'HA_TOKEN',
  'OPENWEATHERMAP_API_KEY',
  'AMBIENT_API_KEY', 'AMBIENT_APPLICATION_KEY', 'AMBIENT_MAC_ADDRESS',
  'HUE_BRIDGE_IP', 'HUE_USERNAME',
  'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID',
  'ELEVENLABS_API_KEY', 'PUBLIC_URL',
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
  'TELEGRAM_BOT_TOKEN',
  'ELEVENLABS_API_KEY'
]);

// Helper to get persistent env path (HA add-on uses /data/, standalone uses local .env)
const getEnvPath = () => IS_HA_ADDON ? '/data/.env' : path.join(__dirname, '../../../.env');

// ============================================================================
// GET /api/settings - Read current settings (masked secrets)
// ============================================================================
router.get('/', requireLocalOrPin, async (req, res) => {
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

// ============================================================================
// POST /api/settings - Update settings
// ============================================================================
router.post('/', requireLocalOrPin, express.json(), async (req, res) => {
  // io is passed via req.app.get('io') - set in server.js
  const io = req.app.get('io');
  
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
    const homeAssistantManager = require('../../devices/managers/homeAssistantManager');
    if (homeAssistantManager.updateConfig) {
      const configChanged = homeAssistantManager.updateConfig();
      if (configChanged) {
        logger.log('Home Assistant manager config refreshed, re-initializing...', 'info', false, 'settings:ha-refresh');
        // Re-initialize to establish WebSocket connection with new credentials
        try {
          // Pass the stored notificationEmitter so lock state changes still get Telegram notifications
          const notificationEmitter = io?.sockets?.notificationEmitter || null;
          await homeAssistantManager.initialize(io, notificationEmitter, logger.log.bind(logger));
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

// ============================================================================
// POST /api/settings/test - Test connection for a service
// ============================================================================
router.post('/test', requireLocalOrPin, express.json(), async (req, res) => {
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
      
      case 'ambient': {
        // Test Ambient Weather API
        const mac = getSetting('AMBIENT_MAC_ADDRESS') || process.env.AMBIENT_MAC_ADDRESS;
        const apiKey = getSetting('AMBIENT_API_KEY') || process.env.AMBIENT_API_KEY;
        const appKey = getSetting('AMBIENT_APPLICATION_KEY') || process.env.AMBIENT_APPLICATION_KEY;
        
        if (!mac || !apiKey || !appKey) {
          const missing = [];
          if (!mac) missing.push('MAC Address');
          if (!apiKey) missing.push('API Key');
          if (!appKey) missing.push('Application Key');
          result = { success: false, message: `Missing: ${missing.join(', ')}` };
          break;
        }
        
        try {
          const response = await fetch(
            `https://rt.ambientweather.net/v1/devices/${mac}?apiKey=${apiKey}&applicationKey=${appKey}`,
            { timeout: 10000, headers: { 'User-Agent': 'T2AutoTron/1.0' } }
          );
          
          if (response.ok) {
            const data = await response.json();
            if (data && data.length > 0) {
              const latest = data[0];
              result = { 
                success: true, 
                message: 'Ambient Weather connected!',
                details: `Temp: ${latest.tempf?.toFixed(1) || 'N/A'}°F, Humidity: ${latest.humidity || 'N/A'}%`
              };
            } else {
              result = { success: false, message: 'No data returned from weather station' };
            }
          } else if (response.status === 401) {
            result = { success: false, message: 'Invalid API key or Application key' };
          } else if (response.status === 404) {
            result = { success: false, message: 'Device not found - check MAC address' };
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

module.exports = router;
