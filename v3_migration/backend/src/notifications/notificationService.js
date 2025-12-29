// src/notificationService.js - SPAM-PROOF NOTIFICATIONS
const TelegramBot = require('node-telegram-bot-api');
const EventEmitter = require('events');
const chalk = require('chalk');

// Console logger
const log = (msg, level = 'info') => {
  const timestamp = `[${new Date().toISOString()}]`;
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
      if (!oldState || oldState.on !== newState.on) {
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

  return emitter;
}

module.exports = { setupNotifications };