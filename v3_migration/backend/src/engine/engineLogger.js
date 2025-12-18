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

// Log level: 0=quiet, 1=normal (default), 2=verbose
let LOG_LEVEL = parseInt(process.env.ENGINE_LOG_LEVEL || '1', 10);

let logStream = null;
let sessionStart = null;

// Track last values to detect changes
const lastBufferValues = new Map();
const lastTriggerStates = new Map();

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
  
  sessionStart = new Date().toISOString();
  
  // Open in append mode
  try {
    logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
  } catch (err) {
    // Silent failure - engine will work without logging
    return;
  }
  
  // Write session header
  const header = `
================================================================================
ENGINE DEBUG SESSION STARTED: ${sessionStart}
================================================================================
`;
  logStream.write(header);
}

function log(category, message, data = null) {
  if (!logStream) {
    initLogger();
  }
  
  const timestamp = new Date().toISOString();
  let line = `[${timestamp}] [${category}] ${message}`;
  
  if (data !== null && data !== undefined) {
    try {
      const dataStr = typeof data === 'object' ? JSON.stringify(data) : String(data);
      line += ` | ${dataStr}`;
    } catch (e) {
      line += ` | [unserializable data]`;
    }
  }
  
  logStream.write(line + '\n');
  // Note: To see engine logs in console, check the engine_debug.log file
}

function logNodeExecution(nodeId, nodeType, inputs, outputs) {
  // Only log node execution in verbose mode
  if (LOG_LEVEL >= 2) {
    log('NODE', `${nodeType} (${nodeId})`, { inputs, outputs });
  }
}

function logTriggerChange(nodeId, from, to, action) {
  // Always log trigger changes - these are important state transitions
  log('TRIGGER', `${nodeId}: ${from} → ${to}`, { action });
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

function logDeviceCommand(entityId, command, payload) {
  log('DEVICE-CMD', `${entityId}: ${command}`, payload);
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
    const footer = `
================================================================================
ENGINE DEBUG SESSION ENDED: ${new Date().toISOString()}
Session duration: ${sessionStart ? Math.round((Date.now() - new Date(sessionStart).getTime()) / 1000) : 0}s
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
  logWarmup,
  setLogLevel,
  getLogLevel,
  close,
  LOG_FILE
};
