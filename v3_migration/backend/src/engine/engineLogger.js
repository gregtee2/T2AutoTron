/**
 * engineLogger.js
 * 
 * Dedicated logger for backend engine debugging.
 * Writes all engine activity to a timestamped log file for analysis.
 * 
 * LOG LEVELS:
 *   0 = QUIET   - Only errors and device commands
 *   1 = NORMAL  - State changes, trigger flips, device commands (DEFAULT)
 *   2 = VERBOSE - All buffer activity, every tick (huge logs!)
 * 
 * Set via ENGINE_LOG_LEVEL env var or engine.setLogLevel()
 * 
 * TIMEZONE:
 *   Set ENGINE_TIMEZONE env var (e.g., "America/Los_Angeles") for local time
 *   Default: America/Los_Angeles (Pacific)
 * 
 * LOG LOCATION:
 *   - HA Add-on: /data/engine_debug.log (persists across restarts)
 *   - Local dev: crashes/engine_debug.log
 * 
 * API ENDPOINTS:
 *   - GET /api/engine/logs - Retrieve parsed log entries
 *   - GET /api/engine/logs/device-history - Device command history
 */

const fs = require('fs');
const path = require('path');

// Determine log directory based on environment
// In HA add-on, /data is a persistent volume that survives container restarts
const IS_HA_ADDON = !!process.env.SUPERVISOR_TOKEN;
const LOG_DIR = IS_HA_ADDON ? '/data' : path.join(__dirname, '..', '..', '..', 'crashes');
const LOG_FILE = path.join(LOG_DIR, 'engine_debug.log');
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB max

// Timezone for human-readable timestamps - reads from user's Control Panel settings
// LOCATION_TIMEZONE is set via Settings > Location in the UI
const TIMEZONE = process.env.LOCATION_TIMEZONE || process.env.ENGINE_TIMEZONE || 'America/Los_Angeles';

// Log level: 0=quiet, 1=normal (default), 2=verbose
let LOG_LEVEL = parseInt(process.env.ENGINE_LOG_LEVEL || '1', 10);

let logStream = null;
let sessionStart = null;

// Track last values to detect changes
const lastBufferValues = new Map();
const lastTriggerStates = new Map();

// Hourly summary tracking
const hourlySummary = {
  hour: null,
  turnOn: 0,
  turnOff: 0,
  colorChanges: 0,
  triggers: 0,
  errors: 0
};

/**
 * Format a timestamp in local timezone with human-readable format
 * e.g., "Jan 2, 8:13 AM" or "Jan 2, 8:13:45 PM" (with seconds)
 */
function formatLocalTime(date = new Date(), includeSeconds = false) {
  const options = {
    timeZone: TIMEZONE,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  };
  if (includeSeconds) {
    options.second = '2-digit';
  }
  return date.toLocaleString('en-US', options);
}

/**
 * Get just the time portion for log lines (e.g., "8:13 AM")
 */
function formatTime(date = new Date()) {
  return date.toLocaleString('en-US', {
    timeZone: TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

/**
 * Check if we've rolled into a new hour and should log a summary
 */
function checkHourlySummary() {
  const now = new Date();
  const currentHour = now.toLocaleString('en-US', {
    timeZone: TIMEZONE,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    hour12: true
  });
  
  if (hourlySummary.hour && hourlySummary.hour !== currentHour) {
    // New hour - log summary of the previous hour
    const summary = [];
    if (hourlySummary.turnOn > 0) summary.push(`${hourlySummary.turnOn} ON`);
    if (hourlySummary.turnOff > 0) summary.push(`${hourlySummary.turnOff} OFF`);
    if (hourlySummary.colorChanges > 0) summary.push(`${hourlySummary.colorChanges} color changes`);
    if (hourlySummary.triggers > 0) summary.push(`${hourlySummary.triggers} triggers`);
    if (hourlySummary.errors > 0) summary.push(`${hourlySummary.errors} errors`);
    
    if (summary.length > 0) {
      writeLog(`\n📊 HOURLY SUMMARY (${hourlySummary.hour}): ${summary.join(', ')}\n`);
    }
    
    // Reset counters
    hourlySummary.turnOn = 0;
    hourlySummary.turnOff = 0;
    hourlySummary.colorChanges = 0;
    hourlySummary.triggers = 0;
    hourlySummary.errors = 0;
  }
  
  hourlySummary.hour = currentHour;
}

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function rotateIfNeeded() {
  try {
    if (fs.existsSync(LOG_FILE)) {
      const stats = fs.statSync(LOG_FILE);
      if (stats.size > MAX_LOG_SIZE) {
        const backupFile = LOG_FILE + '.old';
        if (fs.existsSync(backupFile)) {
          fs.unlinkSync(backupFile);
        }
        fs.renameSync(LOG_FILE, backupFile);
      }
    }
  } catch (err) {
    // Ignore rotation errors
  }
}

function initLogger() {
  ensureLogDir();
  rotateIfNeeded();
  
  sessionStart = new Date();
  
  // Open in append mode
  try {
    logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
  } catch (err) {
    // Silent failure - engine will work without logging
    return;
  }
  
  // Write session header with local time
  const header = `
================================================================================
🚀 ENGINE SESSION STARTED: ${formatLocalTime(sessionStart)}
   Timezone: ${TIMEZONE}
================================================================================
`;
  logStream.write(header);
}

/**
 * Low-level write to log file
 */
function writeLog(line) {
  if (!logStream) {
    initLogger();
  }
  logStream.write(line + '\n');
}

/**
 * Main log function - writes with local timestamp
 */
function log(category, message, data = null) {
  if (!logStream) {
    initLogger();
  }
  
  checkHourlySummary();
  
  const time = formatTime();
  let line = `[${time}] [${category}] ${message}`;
  
  if (data !== null && data !== undefined) {
    try {
      const dataStr = typeof data === 'object' ? JSON.stringify(data) : String(data);
      line += ` | ${dataStr}`;
    } catch (e) {
      line += ` | [unserializable data]`;
    }
  }
  
  logStream.write(line + '\n');
}

function logNodeExecution(nodeId, nodeType, inputs, outputs) {
  // Only log node execution in verbose mode
  if (LOG_LEVEL >= 2) {
    log('NODE', `${nodeType} (${nodeId})`, { inputs, outputs });
  }
}

function logTriggerChange(nodeId, from, to, action) {
  // Always log trigger changes - these are important state transitions
  hourlySummary.triggers++;
  const emoji = to ? '🟢' : '🔴';
  log('TRIGGER', `${emoji} ${nodeId}: ${from} → ${to}`, { action });
}

function logBufferSet(bufferName, value) {
  // Only log if value actually changed, or in verbose mode
  const key = bufferName;
  const lastValue = lastBufferValues.get(key);
  const valueStr = JSON.stringify(value);
  const lastValueStr = JSON.stringify(lastValue);
  
  if (LOG_LEVEL >= 2) {
    // Verbose: log everything
    log('BUFFER-SET', bufferName, value);
  } else if (valueStr !== lastValueStr) {
    // Normal: only log changes
    log('BUFFER-CHANGE', bufferName, { from: lastValue, to: value });
  }
  lastBufferValues.set(key, value);
}

function logBufferGet(bufferName, value) {
  // Only log buffer reads in verbose mode (too noisy otherwise)
  if (LOG_LEVEL >= 2) {
    log('BUFFER-GET', bufferName, value);
  }
}

function logEngineEvent(event, details = null) {
  log('ENGINE', event, details);
}

/**
 * Log a device command with human-readable format
 * Also updates hourly summary counters
 */
function logDeviceCommand(entityId, command, payload) {
  // Extract friendly device name (remove domain prefix)
  const friendlyName = entityId.replace(/^(light|switch|fan|cover|climate)\./, '').replace(/_/g, ' ');
  
  // Determine if this is ON, OFF, or color change
  if (command.includes('turn_on')) {
    hourlySummary.turnOn++;
    
    // Check if this includes color info
    if (payload.hs_color || payload.brightness) {
      hourlySummary.colorChanges++;
      const brightness = payload.brightness ? ` (${Math.round(payload.brightness / 2.55)}%)` : '';
      log('💡 ON', `${friendlyName}${brightness}`);
    } else {
      log('💡 ON', friendlyName);
    }
  } else if (command.includes('turn_off')) {
    hourlySummary.turnOff++;
    log('🔌 OFF', friendlyName);
  } else {
    // Other commands (set color, etc.)
    hourlySummary.colorChanges++;
    log('🎨 CMD', `${friendlyName}: ${command}`, payload);
  }
}

/**
 * Log HSV color change - only logs significant changes
 */
function logHSVChange(entityId, reason, hsvData) {
  hourlySummary.colorChanges++;
  const friendlyName = entityId.replace(/^light\./, '').replace(/_/g, ' ');
  const hue = hsvData.newHue ? `H:${(hsvData.newHue * 360).toFixed(0)}°` : '';
  const sat = hsvData.satDiff ? `S:${(hsvData.satDiff * 100).toFixed(0)}%` : '';
  const bri = hsvData.briDiff ? `B:${hsvData.briDiff}` : '';
  
  log('🎨 HSV', `${friendlyName} ${hue} ${sat} ${bri}`.trim());
}

function logWarmup(nodeId, tick, trigger, lastTrigger) {
  // Only log warmup in verbose mode
  if (LOG_LEVEL >= 2) {
    log('WARMUP', `${nodeId} tick ${tick}/3`, { trigger, lastTrigger });
  }
}

function setLogLevel(level) {
  LOG_LEVEL = Math.max(0, Math.min(2, parseInt(level, 10) || 1));
  log('CONFIG', `Log level set to ${LOG_LEVEL} (${['QUIET', 'NORMAL', 'VERBOSE'][LOG_LEVEL]})`);
}

function getLogLevel() {
  return LOG_LEVEL;
}

function close() {
  if (logStream) {
    const endTime = new Date();
    const durationMs = sessionStart ? endTime.getTime() - sessionStart.getTime() : 0;
    const hours = Math.floor(durationMs / 3600000);
    const minutes = Math.floor((durationMs % 3600000) / 60000);
    
    const footer = `
================================================================================
🛑 ENGINE SESSION ENDED: ${formatLocalTime(endTime)}
   Duration: ${hours}h ${minutes}m
================================================================================

`;
    logStream.write(footer);
    logStream.end();
    logStream = null;
  }
}

// Auto-close on process exit
process.on('exit', close);
// Don't call process.exit() here - let the main server handle graceful shutdown
// process.on('SIGINT', () => { close(); process.exit(); });
// process.on('SIGTERM', () => { close(); process.exit(); });

module.exports = {
  log,
  logNodeExecution,
  logTriggerChange,
  logBufferSet,
  logBufferGet,
  logEngineEvent,
  logDeviceCommand,
  logHSVChange,
  logWarmup,
  setLogLevel,
  getLogLevel,
  close,
  LOG_FILE,
  formatLocalTime,
  formatTime
};
