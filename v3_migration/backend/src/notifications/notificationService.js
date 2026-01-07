// src/notificationService.js - SPAM-PROOF NOTIFICATIONS
const TelegramBot = require('node-telegram-bot-api');
const EventEmitter = require('events');
const chalk = require('chalk');

// Timezone for local timestamps - reads from user's Control Panel settings
// LOCATION_TIMEZONE is set via Settings > Location in the UI
const TIMEZONE = process.env.LOCATION_TIMEZONE || process.env.ENGINE_TIMEZONE || 'America/Los_Angeles';

// Console logger with LOCAL time
const log = (msg, level = 'info') => {
  const localTime = new Date().toLocaleString('en-US', {
    timeZone: TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
  const timestamp = `[${localTime}]`;
  const colors = { error: 'red', warn: 'yellow', info: 'green' };
  console.log(chalk[colors[level] || 'white'](`${timestamp} ${msg}`));
};

// State & rate limiting
const deviceStates = new Map();        // last known state per device
const lastSent = new Map();            // last message per device + timestamp
let queue = [];
let lastGlobalSend = 0;
const MIN_GLOBAL_MS = 5000;            // 5 sec between ANY messages
const MIN_PER_DEVICE_MS = 10000;       // 10 sec between same message

// Batching mode for startup/reconciliation
// Uses "settling" approach: waits until no new changes for BATCH_SETTLE_MS
let batchMode = false;
let batchedChanges = { on: [], off: [] };
let batchTimeout = null;
let batchSettleTimeout = null;
const BATCH_MAX_MS = 180000;           // Max 3 minutes of batching (safety limit)
const BATCH_SETTLE_MS = 15000;         // Flush after 15 seconds of no new changes

// Startup quiet period - suppress ALL individual device messages during startup
let startupQuietUntil = 0;             // Timestamp when quiet period ends
const STARTUP_QUIET_MS = 120000;       // 2 minutes of quiet after server start

function setupNotifications(io) {
  const emitter = new EventEmitter();

  const bot = process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID
    ? new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false })
    : null;

  if (bot) log('Telegram bot ready', 'info');
  else log('Telegram disabled (no token/chat_id)', 'warn');

  // Queue drain interval - ensures queued messages don't get stuck
  let drainScheduled = false;
  const scheduleDrain = () => {
    if (drainScheduled) return;
    if (queue.length === 0) return;
    drainScheduled = true;
    const timeUntilNextSend = Math.max(0, MIN_GLOBAL_MS - (Date.now() - lastGlobalSend));
    setTimeout(() => {
      drainScheduled = false;
      if (queue.length > 0) {
        // If batch mode is now active, move queue items to batch instead of sending
        const inQuietPeriod = Date.now() < startupQuietUntil;
        if (batchMode || inQuietPeriod) {
          // Move all queued device messages to batch
          while (queue.length > 0) {
            const item = queue.shift();
            const turnedMatch = item.msg.match(/\*?(.+?)\*?\s+turned\s+\*?(ON|OFF)\*?/i);
            if (turnedMatch) {
              const [_, rawName, state] = turnedMatch;
              const name = rawName.replace(/_/g, ' ').replace(/[*[\]`]/g, '').trim();
              const isOn = state.toUpperCase() === 'ON';
              if (isOn) {
                if (!batchedChanges.on.includes(name)) batchedChanges.on.push(name);
              } else {
                if (!batchedChanges.off.includes(name)) batchedChanges.off.push(name);
              }
              log(`[Batch] Moved queued message to batch: ${name}`, 'info');
            }
          }
          return;
        }
        const next = queue.shift();
        sendImmediate(next.msg, next.deviceId);
      }
    }, timeUntilNextSend + 100);
  };

  // Internal send function that bypasses rate limit (called when rate limit has passed)
  const sendImmediate = async (msg, deviceId = 'system') => {
    if (!bot) return;
    const now = Date.now();
    lastGlobalSend = now;
    try {
      await bot.sendMessage(process.env.TELEGRAM_CHAT_ID, msg, { parse_mode: 'Markdown' });
      log(`Telegram: ${msg}`, 'info');
      lastSent.set(deviceId, { text: msg, time: now });
    } catch (err) {
      log(`Telegram failed: ${err.message}`, 'error');
    } finally {
      // Schedule next queue drain
      scheduleDrain();
    }
  };

  const send = async (msg, deviceId = 'system') => {
    if (!bot) return;

    const now = Date.now();

    // 1. Deduplicate identical message per device
    const last = lastSent.get(deviceId);
    if (last?.text === msg && now - last.time < MIN_PER_DEVICE_MS) {
      // Silently skip duplicate messages
      return;
    }

    // 2. Global rate limit
    if (now - lastGlobalSend < MIN_GLOBAL_MS) {
      queue.push({ msg, deviceId });
      // Queue silently - too noisy to log every queued message
      scheduleDrain();  // Ensure queue gets processed
      return;
    }

    // Send immediately
    await sendImmediate(msg, deviceId);
  };

  emitter.on('notify', (message, options = {}) => {
    // Always show in UI
    io.emit('notification', message);
    
    // Priority messages (e.g., security events like locks) bypass rate limiting
    const isPriority = options.priority === true;

    // 1. Device ON/OFF messages
    const turnedMatch = message.match(/\*?(.+?)\*?\s+turned\s+\*?(ON|OFF)\*?/i);
    if (turnedMatch) {
      const [_, rawName, state] = turnedMatch;
      const name = rawName.replace(/_/g, ' ').replace(/[*[\]`]/g, '').trim();
      const deviceId = name.toLowerCase().replace(/\s+/g, '_');
      const newState = { on: state.toUpperCase() === 'ON' };
      const oldState = deviceStates.get(deviceId);
      
      // Check if we're in batch/quiet mode
      const inQuietPeriod = Date.now() < startupQuietUntil;
      
      if (!oldState || oldState.on !== newState.on) {
        // During startup quiet period OR batch mode, collect instead of sending
        if (batchMode || inQuietPeriod) {
          const isOn = state.toUpperCase() === 'ON';
          if (isOn) {
            if (!batchedChanges.on.includes(name)) batchedChanges.on.push(name);
          } else {
            if (!batchedChanges.off.includes(name)) batchedChanges.off.push(name);
          }
          deviceStates.set(deviceId, newState);
          
          // Reset settle timer - but only flush AFTER quiet period ends
          if (batchSettleTimeout) clearTimeout(batchSettleTimeout);
          const timeUntilQuietEnds = Math.max(0, startupQuietUntil - Date.now());
          const flushDelay = Math.max(BATCH_SETTLE_MS, timeUntilQuietEnds + 5000);
          batchSettleTimeout = setTimeout(() => {
            log('[Notifications] Device changes settled - flushing batch', 'info');
            flushBatch();
          }, flushDelay);
          
          return;  // Don't send individual message
        }
        send(message, deviceId);
        deviceStates.set(deviceId, newState);
      }
      // Duplicate - silently skip (deduplication working)
      return;
    }

    // 2. Lock state messages (e.g. "🔒 *Front Door* LOCKED")
    // Only final states: LOCKED or UNLOCKED (transitional states filtered at source)
    const lockMatch = message.match(/(🔒|🔓)\s*\*([^*]+)\*\s+(LOCKED|UNLOCKED)/i);
    if (lockMatch) {
      const [_, emoji, lockName, action] = lockMatch;
      const deviceId = `lock_${lockName.toLowerCase().replace(/\s+/g, '_')}`;
      const newState = { state: action.toUpperCase() };
      const oldState = deviceStates.get(deviceId);
      log(`🔐 Lock notification: ${lockName} -> ${action} (old: ${oldState?.state || 'none'})`, 'info');
      if (!oldState || oldState.state !== newState.state) {
        // Lock events are priority - send immediately (bypass rate limit queue)
        if (isPriority) {
          sendImmediate(message, deviceId);
        } else {
          send(message, deviceId);
        }
        deviceStates.set(deviceId, newState);
      }
      // Duplicate lock state - silently skip
      return;
    }

    // 3. Legacy ON/OFF format
    const legacyMatch = message.match(/(?:🔄\s*)?(?:HA|Kasa|Hue)?\s*Update:\s*(.*?)\s+is\s+(ON|OFF)/i);
    if (legacyMatch) {
      const [_, rawName, state] = legacyMatch;
      const name = rawName.replace(/_/g, ' ').replace(/[*[\]`]/g, '');
      const deviceId = name.toLowerCase().replace(/\s+/g, '_');
      const newState = { on: state === 'ON' };
      const oldState = deviceStates.get(deviceId);
      if (!oldState) {
        send(`Device online: ${name} is ${state}`, deviceId);
        deviceStates.set(deviceId, newState);
        return;
      }
      if (oldState.on !== newState.on) {
        send(message, deviceId);
        deviceStates.set(deviceId, newState);
      } else {
        log(`No ON/OFF change: ${name}`, 'info');
      }
      return;
    }

    // 4. Non-device messages: only send errors/warnings
    if (message.includes('ERROR') || message.includes('Failed') || message.includes('WARNING')) {
      send(message, 'system');
      return;
    }
    
    // 5. Debug: log unmatched messages to help diagnose issues
    log(`Unmatched notification (no Telegram): ${message.substring(0, 100)}`, 'info');
  });

  // Flush batched changes and send summary
  const flushBatch = () => {
    // During quiet period, don't actually flush yet
    const inQuietPeriod = Date.now() < startupQuietUntil;
    if (inQuietPeriod) {
      log('[Notifications] Still in quiet period - deferring flush', 'info');
      return;
    }
    
    // Clear batch mode
    batchMode = false;
    
    if (batchTimeout) {
      clearTimeout(batchTimeout);
      batchTimeout = null;
    }
    if (batchSettleTimeout) {
      clearTimeout(batchSettleTimeout);
      batchSettleTimeout = null;
    }
    
    const onCount = batchedChanges.on.length;
    const offCount = batchedChanges.off.length;
    
    if (onCount === 0 && offCount === 0) {
      log('[Notifications] Batch complete - no device changes', 'info');
      return;
    }
    
    // Build summary message with all device names
    // Telegram has a 4096 char limit, so we'll list all devices in a readable format
    const lines = ['🔄 *Startup Sync Complete*', ''];
    
    if (onCount > 0) {
      lines.push(`💡 *${onCount} devices turned ON:*`);
      // Group into rows of 3 for readability
      for (let i = 0; i < batchedChanges.on.length; i += 3) {
        const row = batchedChanges.on.slice(i, i + 3).join(', ');
        lines.push(`  ${row}`);
      }
      lines.push('');
    }
    
    if (offCount > 0) {
      lines.push(`🔌 *${offCount} devices turned OFF:*`);
      for (let i = 0; i < batchedChanges.off.length; i += 3) {
        const row = batchedChanges.off.slice(i, i + 3).join(', ');
        lines.push(`  ${row}`);
      }
    }
    
    const summary = lines.join('\n');
    sendImmediate(summary, 'batch_summary');
    
    log(`[Notifications] Batch sent: ${onCount} ON, ${offCount} OFF`, 'info');
    
    // Reset
    batchedChanges = { on: [], off: [] };
  };

  // Start batching mode (call at startup/reconciliation)
  const startBatch = () => {
    batchMode = true;
    batchedChanges = { on: [], off: [] };
    
    // Set startup quiet period - ALL device ON/OFF messages will be batched
    startupQuietUntil = Date.now() + STARTUP_QUIET_MS;
    log(`[Notifications] Startup quiet period active for ${STARTUP_QUIET_MS / 1000}s`, 'info');
    
    // Move any already-queued messages into the batch
    if (queue.length > 0) {
      log(`[Notifications] Moving ${queue.length} queued messages to batch`, 'info');
      while (queue.length > 0) {
        const item = queue.shift();
        const turnedMatch = item.msg.match(/\*?(.+?)\*?\s+turned\s+\*?(ON|OFF)\*?/i);
        if (turnedMatch) {
          const [_, rawName, state] = turnedMatch;
          const name = rawName.replace(/_/g, ' ').replace(/[*[\]`]/g, '').trim();
          const isOn = state.toUpperCase() === 'ON';
          if (isOn) {
            if (!batchedChanges.on.includes(name)) batchedChanges.on.push(name);
          } else {
            if (!batchedChanges.off.includes(name)) batchedChanges.off.push(name);
          }
        }
      }
    }
    
    // Safety max timeout - flush after 3 minutes no matter what
    if (batchTimeout) clearTimeout(batchTimeout);
    batchTimeout = setTimeout(() => {
      log('[Notifications] Batch max time reached - flushing', 'info');
      flushBatch();
    }, BATCH_MAX_MS);
    log('[Notifications] Batch mode started - will flush after 15s of quiet', 'info');
  };

  // Expose batch controls on emitter
  emitter.startBatch = startBatch;
  emitter.flushBatch = flushBatch;

  return emitter;
}

module.exports = { setupNotifications };