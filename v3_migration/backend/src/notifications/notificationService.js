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

  const send = async (msg, deviceId = 'system') => {
    if (!bot) return;

    const now = Date.now();

    // 1. Deduplicate identical message per device
    const last = lastSent.get(deviceId);
    if (last?.text === msg && now - last.time < MIN_PER_DEVICE_MS) {
      log(`Skipped duplicate: ${msg}`, 'info');
      return;
    }

    // 2. Global rate limit
    if (now - lastGlobalSend < MIN_GLOBAL_MS) {
      queue.push({ msg, deviceId });
      log('Queued message (rate limit)', 'info');
      return;
    }

    // Update timestamp immediately to prevent race conditions
    lastGlobalSend = now;

    // Send
    try {
      await bot.sendMessage(process.env.TELEGRAM_CHAT_ID, msg, { parse_mode: 'Markdown' });
      log(`Telegram: ${msg}`, 'info');
      lastSent.set(deviceId, { text: msg, time: now });
    } catch (err) {
      log(`Telegram failed: ${err.message}`, 'error');
    } finally {
      // Drain queue
      if (queue.length > 0) {
        const next = queue.shift();
        setTimeout(() => send(next.msg, next.deviceId), MIN_GLOBAL_MS);
      }
    }
  };

  emitter.on('notify', (message) => {
    // Always show in UI
    io.emit('notification', message);

    // Parse device ON/OFF messages - new simpler format: "Name turned ON/OFF"
    const turnedMatch = message.match(/\*?(.+?)\*?\s+turned\s+\*?(ON|OFF)\*?/i);
    if (turnedMatch) {
      const [_, rawName, state] = turnedMatch;
      const name = rawName.replace(/_/g, ' ').replace(/[*[\]`]/g, '').trim();
      const deviceId = name.toLowerCase().replace(/\s+/g, '_');
      
      const newState = { on: state.toUpperCase() === 'ON' };
      const oldState = deviceStates.get(deviceId);
      
      // Only send if this is a NEW state (not duplicate)
      if (!oldState || oldState.on !== newState.on) {
        send(message, deviceId);
        deviceStates.set(deviceId, newState);
      } else {
        log(`Skipped duplicate ON/OFF: ${name}`, 'info');
      }
      return;
    }
    
    // Legacy format: "Update: Name is ON/OFF" - still parse but only for ON/OFF
    const legacyMatch = message.match(/(?:🔄\s*)?(?:HA|Kasa|Hue)?\s*Update:\s*(.*?)\s+is\s+(ON|OFF)/i);
    if (legacyMatch) {
      const [_, rawName, state] = legacyMatch;
      const name = rawName.replace(/_/g, ' ').replace(/[*[\]`]/g, '');
      const deviceId = name.toLowerCase().replace(/\s+/g, '_');

      const newState = { on: state === 'ON' };
      const oldState = deviceStates.get(deviceId);

      // First time seen
      if (!oldState) {
        send(`Device online: ${name} is ${state}`, deviceId);
        deviceStates.set(deviceId, newState);
        return;
      }

      // Only ON/OFF change matters now (not brightness)
      if (oldState.on !== newState.on) {
        send(message, deviceId);
        deviceStates.set(deviceId, newState);
      } else {
        log(`No ON/OFF change: ${name}`, 'info');
      }
      return;
    }
    
    // Non-device messages: only send errors/warnings
    if (message.includes('ERROR') || message.includes('Failed') || message.includes('WARNING')) {
      send(message, 'system');
    }
  });

  return emitter;
}

module.exports = { setupNotifications };