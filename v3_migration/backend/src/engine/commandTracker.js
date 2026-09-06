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
 * we can trace what happened. Timing suggests an origin; it does not prove it.
 */

const path = require('path');
const BoundedLogWriter = require('../logging/BoundedLogWriter');

// Verbose logging flag
const VERBOSE = process.env.VERBOSE_LOGGING === 'true';

// Log file location
const IS_HA_ADDON = !!process.env.SUPERVISOR_TOKEN;
const LOG_DIR = IS_HA_ADDON ? '/data' : path.join(__dirname, '..', '..', '..', 'crashes');
const COMMAND_LOG = path.join(LOG_DIR, 'command_history.log');
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB max

// Recent commands cache for correlation
// entityId → { sentAt (numeric milliseconds), timestamp (ISO), source, reason, payload }
const recentCommands = new Map();
const CORRELATION_WINDOW = 10000; // 10 seconds - if we sent a command, expect state change within this

// Console deduplication - prevent spam for same device in quick succession
// entityId → lastConsoleLogTime
const lastConsoleLogs = new Map();
const CONSOLE_DEDUP_WINDOW = 2000; // 2 seconds - don't log same device to console within this window

// In-memory history for API access (last 1000 events)
const commandHistory = [];
const MAX_HISTORY = 1000;

const logWriter = new BoundedLogWriter({ filePath: COMMAND_LOG, maxFileBytes: MAX_LOG_SIZE });

function writeLog(entry) {
  logWriter.write(`${JSON.stringify(entry)}\n`);
  
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
  // Note: Use a different key name to avoid collision with entry.timestamp (ISO string)
  recentCommands.set(rawEntityId, {
    sentAt: Date.now(),  // Numeric timestamp for correlation window check
    ...entry
  });
  
  writeLog(entry);
  
  // Console log for visibility - only when VERBOSE is enabled
  if (VERBOSE) {
    const now = Date.now();
    const lastLog = lastConsoleLogs.get(rawEntityId);
    if (!lastLog || (now - lastLog) > CONSOLE_DEDUP_WINDOW) {
      const shortEntity = rawEntityId.split('.').pop();
      console.log(`[CMD→] ${shortEntity}: ${action} (${nodeType || 'unknown'}) - ${reason || 'triggered'}`);
      lastConsoleLogs.set(rawEntityId, now);
    }
  }
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
  const now = Date.now();
  const timeSinceCommand = ourCommand ? (now - ourCommand.sentAt) : null;
  // Keep the legacy wasUs return field for callers, but it means only a timing
  // match, not proof of causation. A backwards clock jump is not a match.
  const wasUs = Boolean(ourCommand && timeSinceCommand >= 0 && timeSinceCommand < CORRELATION_WINDOW);
  
  // Determine source based on context and correlation
  let source = 'External (no context)';  // Default when HA doesn't provide context
  let sourceDetails = null;
  
  if (wasUs) {
    source = 'T2AutoTron (probable)';
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
  
  // Console log for visibility - only when VERBOSE or for probable T2 changes
  // Transient state flaps (off→unavailable→off) are noisy, keep in log file only
  if (oldState !== newState) {
    const isTransient = (oldState === 'unavailable' || newState === 'unavailable');
    const isT2Probable = source.includes('T2AutoTron');
    
    if (VERBOSE || (isT2Probable && !isTransient)) {
      const shortEntity = rawEntityId.split('.').pop();
      const emoji = getStateEmoji(rawEntityId, newState);
      console.log(`[←STATE] ${emoji} ${shortEntity}: ${oldState} → ${newState} | Source: ${source}`);
    }
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
    const age = now - cmd.sentAt;
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
 * Drain accepted records and close the file; always resolves to writer status.
 * Terminal operation: later file entries are rejected and counted.
 */
function close() {
  clearInterval(cacheCleanupTimer);
  process.removeListener('beforeExit', close);
  return logWriter.close();
}

function getWriterStatus() {
  return logWriter.getStatus();
}

const cacheCleanupTimer = setInterval(() => {
  const cutoff = Date.now() - CORRELATION_WINDOW * 2;
  for (const [entityId, command] of recentCommands) {
    if (command.sentAt < cutoff) recentCommands.delete(entityId);
  }
  for (const [entityId, loggedAt] of lastConsoleLogs) {
    if (loggedAt < cutoff) lastConsoleLogs.delete(entityId);
  }
}, 60000);
cacheCleanupTimer.unref?.();

// Natural exit only; explicit shutdown must await close() before process.exit().
process.once('beforeExit', close);

module.exports = {
  logOutgoingCommand,
  logIncomingStateChange,
  getHistory,
  getPendingCommands,
  close,
  getWriterStatus,
  COMMAND_LOG
};
