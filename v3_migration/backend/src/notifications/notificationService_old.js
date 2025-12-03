// src/notificationService.js - Notification Service with State Tracking and Rate-Limiting

const TelegramBot = require('node-telegram-bot-api');
const EventEmitter = require('events');
const chalk = require('chalk');

const logWithTimestamp = (message, level = 'info') => {
  const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
  const timestamp = `[${new Date().toISOString()}]`;
  let formattedMessage = `${timestamp} `;
  if (['error'].includes(level) || (LOG_LEVEL === 'info' && ['info', 'warn'].includes(level)) || LOG_LEVEL === level) {
    switch (level) {
      case 'error':
        formattedMessage += `${chalk.red('❌ ' + message)}`;
        break;
      case 'warn':
        formattedMessage += `${chalk.yellow('⚠️ ' + message)}`;
        break;
      case 'info':
      default:
        formattedMessage += `${chalk.green('✅ ' + message)}`;
        break;
    }
    console.log(formattedMessage);
  }
};

// Store last known states and last sent messages to detect duplicates
const deviceStates = new Map();
const lastSentMessages = new Map(); // Track last message per deviceId to deduplicate
let messageQueue = [];
let lastSentTime = 0;
const MIN_INTERVAL_MS = 5000; // 5 seconds between batches

function setupNotifications(io) {
  const emitter = new EventEmitter();
  const bot = process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID
    ? new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false })
    : null;

  if (bot) logWithTimestamp('Telegram bot initialized', 'info');
  else logWithTimestamp('Telegram credentials missing', 'warn');

  const sendTelegramMessage = async (message, deviceId) => {
    if (!bot || !process.env.TELEGRAM_CHAT_ID) return;

    const now = Date.now();
    // Check if this exact message was sent recently for this device
    const lastMessage = lastSentMessages.get(deviceId);
    if (lastMessage?.text === message && now - lastMessage.timestamp < MIN_INTERVAL_MS * 2) {
      logWithTimestamp(`📌 Duplicate message skipped for ${deviceId}: ${message}`, 'info');
      return;
    }

    if (now - lastSentTime < MIN_INTERVAL_MS) {
      messageQueue.push({ message, deviceId });
      logWithTimestamp('⏳ Queued Telegram message', 'info');
      return;
    }

    try {
      await bot.sendMessage(process.env.TELEGRAM_CHAT_ID, message, { parse_mode: 'Markdown' });
      logWithTimestamp(`Telegram sent: ${message}`, 'info');
      lastSentTime = now;
      lastSentMessages.set(deviceId, { text: message, timestamp: now });

      // Process queue safely
      if (messageQueue.length > 0) {
        const { message: nextMessage, deviceId: nextDeviceId } = messageQueue.shift();
        setTimeout(() => sendTelegramMessage(nextMessage, nextDeviceId), MIN_INTERVAL_MS);
      }
    } catch (err) {
      logWithTimestamp(`Telegram error: ${err.message}`, 'error');
    }
  };

  emitter.on('notify', (message) => {
    const match = message.match(/🔄 (?:Kasa|Hue) Update: (.*?)(?: is (ON|OFF)(?:, Brightness: (\d+))?)/);
    if (!match) {
      io.emit('notification', message);
      sendTelegramMessage(message, 'generic');
      return;
    }

    const [_, deviceName, powerState, brightness] = match;
    const deviceIdMatch = message.match(/ID: (\S+)/);
    const deviceId = deviceIdMatch ? deviceIdMatch[1] : deviceName;

    const newState = {
      on: powerState === 'ON',
      brightness: brightness ? parseInt(brightness, 10) : null // Use null instead of undefined for consistency
    };

    const oldState = deviceStates.get(deviceId);

    // Always emit to Socket.IO for real-time UI updates
    io.emit('notification', message);

    if (!oldState) {
      sendTelegramMessage(`Initial state - ${message}`, deviceId);
      deviceStates.set(deviceId, newState);
      return;
    }

    const stateChanged = (
      oldState.on !== newState.on ||
      (newState.brightness !== null && oldState.brightness !== newState.brightness)
    );

    if (stateChanged) {
      sendTelegramMessage(message, deviceId);
      deviceStates.set(deviceId, newState);
    } else {
      logWithTimestamp(`📌 No state change for ${deviceId}, skipping Telegram`, 'info');
    }
  });

  return emitter;
}

module.exports = { setupNotifications };