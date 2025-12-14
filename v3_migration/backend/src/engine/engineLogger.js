/**
 * engineLogger.js
 * 
 * Dedicated logger for backend engine debugging.
 * Writes all engine activity to a timestamped log file for analysis.
 */

const fs = require('fs');
const path = require('path');

// Log to crashes folder alongside other logs
// Path: backend/src/engine -> backend/src -> backend -> crashes (which is in v3_migration/)
const LOG_DIR = path.join(__dirname, '..', '..', '..', 'crashes');
const LOG_FILE = path.join(LOG_DIR, 'engine_debug.log');
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB max

let logStream = null;
let sessionStart = null;

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
  logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
  
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
  
  // Also write to console for real-time visibility
  console.log(line);
}

function logNodeExecution(nodeId, nodeType, inputs, outputs) {
  log('NODE', `${nodeType} (${nodeId})`, { inputs, outputs });
}

function logTriggerChange(nodeId, from, to, action) {
  log('TRIGGER', `${nodeId}: ${from} → ${to}`, { action });
}

function logBufferSet(bufferName, value) {
  log('BUFFER-SET', bufferName, value);
}

function logBufferGet(bufferName, value) {
  log('BUFFER-GET', bufferName, value);
}

function logEngineEvent(event, details = null) {
  log('ENGINE', event, details);
}

function logDeviceCommand(entityId, command, payload) {
  log('DEVICE-CMD', `${entityId}: ${command}`, payload);
}

function logWarmup(nodeId, tick, trigger, lastTrigger) {
  log('WARMUP', `${nodeId} tick ${tick}/3`, { trigger, lastTrigger });
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
process.on('SIGINT', () => { close(); process.exit(); });
process.on('SIGTERM', () => { close(); process.exit(); });

module.exports = {
  log,
  logNodeExecution,
  logTriggerChange,
  logBufferSet,
  logBufferGet,
  logEngineEvent,
  logDeviceCommand,
  logWarmup,
  close,
  LOG_FILE
};
