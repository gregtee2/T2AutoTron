/**
 * commandTracker.js
 * 
 * Tracks ALL device commands and state changes with full origin context.
 * Answers: "What changed?" + "Who did it?" + "Why?"
 * 
 * 🦴 CAVEMAN VERSION:
 * Every time a light/lock/switch changes, we write down:
 * - What device changed
 * - Who told it to change (us, HA automation, manual, the device itself)
 * - Why (what triggered the command - time schedule, input change, etc.)
 * 
 * This creates a "crime scene log" so when something weird happens,
 * we can trace back exactly what happened.
 */

const fs = require('fs');
const path = require('path');

// Log file location
const IS_HA_ADDON = !!process.env.SUPERVISOR_TOKEN;
const LOG_DIR = IS_HA_ADDON ? '/data' : path.join(__dirname, '..', '..', '..', 'crashes');
const COMMAND_LOG = path.join(LOG_DIR, 'command_history.log');
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB max

// Recent commands cache for correlation
// entityId → { timestamp, source, reason, payload }
const recentCommands = new Map();
const CORRELATION_WINDOW = 10000; // 10 seconds - if we sent a command, expect state change within this

// In-memory history for API access (last 1000 events)
const commandHistory = [];
const MAX_HISTORY = 1000;

let logStream = null;

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function rotateIfNeeded() {
  try {
    if (fs.existsSync(COMMAND_LOG)) {
      const stats = fs.statSync(COMMAND_LOG);
      if (stats.size > MAX_LOG_SIZE) {
        const backupFile = COMMAND_LOG + '.old';
        if (fs.existsSync(backupFile)) {
          fs.unlinkSync(backupFile);
        }
        fs.renameSync(COMMAND_LOG, backupFile);
      }
    }
  } catch (err) {
    // Ignore rotation errors
  }
}

function initLogger() {
  ensureLogDir();
  rotateIfNeeded();
  
  try {
    logStream = fs.createWriteStream(COMMAND_LOG, { flags: 'a' });
  } catch (err) {
    console.error('[CommandTracker] Failed to open log file:', err.message);
  }
}

function writeLog(entry) {
  if (!logStream) {
    initLogger();
  }
  
  const line = JSON.stringify(entry);
  if (logStream) {
    logStream.write(line + '\n');
  }
  
  // Also keep in memory
  commandHistory.push(entry);
  if (commandHistory.length > MAX_HISTORY) {
    commandHistory.shift();
  }
}

/**
 * Log a command WE are sending
 * Call this from HADeviceNodes before sending API request
 * 
 * @param {object} params
 * @param {string} params.entityId - e.g., "light.living_room"
 * @param {string} params.action - e.g., "turn_on", "turn_off", "lock", "unlock"
 * @param {object} params.payload - The full payload being sent
 * @param {string} params.nodeId - The node ID that initiated this
 * @param {string} params.nodeType - The node type (e.g., "HAGenericDeviceNode")
 * @param {string} params.reason - Why this was triggered (e.g., "TimeRangeNode output=true")
 * @param {object} params.inputs - The input values that led to this decision
 */
function logOutgoingCommand({ entityId, action, payload, nodeId, nodeType, reason, inputs }) {
  const timestamp = new Date().toISOString();
  const rawEntityId = entityId.replace('ha_', '');
  
  const entry = {
    timestamp,
    type: 'OUTGOING',
    entityId: rawEntityId,
    action,
    source: 'T2AutoTron',
    nodeId,
    nodeType,
    reason: reason || 'Manual trigger',
    payload,
    inputs: inputs ? summarizeInputs(inputs) : null
  };
  
  // Store for correlation with incoming state changes
  recentCommands.set(rawEntityId, {
    timestamp: Date.now(),
    ...entry
  });
  
  writeLog(entry);
  
  // Console log for visibility
  const shortEntity = rawEntityId.split('.').pop();
  console.log(`[CMD→] ${shortEntity}: ${action} (${nodeType || 'unknown'}) - ${reason || 'triggered'}`);
}

/**
 * Log a state change we RECEIVED from HA
 * Call this from homeAssistantManager when processing state_changed events
 * 
 * @param {object} params
 * @param {string} params.entityId - e.g., "light.living_room"
 * @param {string} params.oldState - Previous state
 * @param {string} params.newState - New state
 * @param {object} params.context - HA's context object (user_id, parent_id, id)
 * @param {object} params.attributes - New attributes
 */
function logIncomingStateChange({ entityId, oldState, newState, context, attributes }) {
  const timestamp = new Date().toISOString();
  const rawEntityId = entityId.replace('ha_', '');
  
  // Check if WE recently sent a command to this entity
  const ourCommand = recentCommands.get(rawEntityId);
  const wasUs = ourCommand && (Date.now() - ourCommand.timestamp) < CORRELATION_WINDOW;
  
  // Determine source based on context and correlation
  let source = 'Unknown';
  let sourceDetails = null;
  
  if (wasUs) {
    source = 'T2AutoTron (confirmed)';
    sourceDetails = {
      nodeId: ourCommand.nodeId,
      nodeType: ourCommand.nodeType,
      reason: ourCommand.reason
    };
    // Clean up correlation cache
    recentCommands.delete(rawEntityId);
  } else if (context) {
    if (context.user_id) {
      source = 'HA User';
      sourceDetails = { userId: context.user_id };
    } else if (context.parent_id) {
      source = 'HA Automation/Script';
      sourceDetails = { parentId: context.parent_id, contextId: context.id };
    } else {
      source = 'External (device/integration)';
      sourceDetails = { contextId: context.id };
    }
  }
  
  const entry = {
    timestamp,
    type: 'INCOMING',
    entityId: rawEntityId,
    oldState,
    newState,
    source,
    sourceDetails,
    haContext: context,
    significantAttributes: extractSignificantAttributes(attributes)
  };
  
  writeLog(entry);
  
  // Console log for visibility (only state changes, not attribute-only updates)
  if (oldState !== newState) {
    const shortEntity = rawEntityId.split('.').pop();
    const emoji = getStateEmoji(rawEntityId, newState);
    console.log(`[←STATE] ${emoji} ${shortEntity}: ${oldState} → ${newState} | Source: ${source}`);
  }
  
  return { wasUs, source, sourceDetails };
}

/**
 * Get command history for an entity
 */
function getHistory(entityId = null, limit = 100) {
  let filtered = commandHistory;
  
  if (entityId) {
    const rawId = entityId.replace('ha_', '');
    filtered = commandHistory.filter(e => e.entityId === rawId || e.entityId?.includes(rawId));
  }
  
  return filtered.slice(-limit);
}

/**
 * Get recent commands that haven't been correlated yet
 * (Commands we sent but haven't seen state changes for)
 */
function getPendingCommands() {
  const now = Date.now();
  const pending = [];
  
  for (const [entityId, cmd] of recentCommands) {
    const age = now - cmd.timestamp;
    pending.push({
      entityId,
      action: cmd.action,
      ageMs: age,
      ageSeconds: Math.round(age / 1000),
      nodeType: cmd.nodeType,
      reason: cmd.reason
    });
  }
  
  return pending;
}

/**
 * Helper to summarize inputs for logging (avoid huge logs)
 */
function summarizeInputs(inputs) {
  const summary = {};
  for (const [key, value] of Object.entries(inputs)) {
    if (Array.isArray(value)) {
      summary[key] = value.length === 1 ? value[0] : `[${value.length} items]`;
    } else if (typeof value === 'object' && value !== null) {
      summary[key] = '{object}';
    } else {
      summary[key] = value;
    }
  }
  return summary;
}

/**
 * Extract significant attributes (skip noisy ones)
 */
function extractSignificantAttributes(attrs) {
  if (!attrs) return null;
  
  const significant = {};
  const keepKeys = ['brightness', 'hs_color', 'color_temp', 'effect', 'position', 'temperature', 'current_temperature'];
  
  for (const key of keepKeys) {
    if (attrs[key] !== undefined) {
      significant[key] = attrs[key];
    }
  }
  
  return Object.keys(significant).length > 0 ? significant : null;
}

/**
 * Get emoji for state (visual log clarity)
 */
function getStateEmoji(entityId, state) {
  const domain = entityId.split('.')[0];
  
  if (domain === 'lock') {
    return state === 'locked' ? '🔒' : state === 'unlocked' ? '🔓' : '🔐';
  } else if (domain === 'light') {
    return state === 'on' ? '💡' : '⚫';
  } else if (domain === 'switch') {
    return state === 'on' ? '🔌' : '⭕';
  } else if (domain === 'cover') {
    return state === 'open' ? '🚪' : '📦';
  }
  return '📍';
}

/**
 * Close log stream
 */
function close() {
  if (logStream) {
    logStream.end();
    logStream = null;
  }
}

// Auto-close on exit
process.on('exit', close);

module.exports = {
  logOutgoingCommand,
  logIncomingStateChange,
  getHistory,
  getPendingCommands,
  close,
  COMMAND_LOG
};
