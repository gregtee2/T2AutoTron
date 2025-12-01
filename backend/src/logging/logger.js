// logging/logger.js - FIXED WITH LEVEL METHODS
const logWithTimestamp = require('./logWithTimestamp');
const LOG_LEVELS = { error: 3, warn: 2, info: 1, debug: 0 };
const MIN_LOG_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL?.toLowerCase()] ?? LOG_LEVELS.info;
const VERBOSE_LOGGING = process.env.VERBOSE_LOGGING === 'true';

class Logger {
  async log(message, level = 'info', noDelay = false, key = null, metadata) {
    if (!message || typeof message !== 'string') return;
    const logLevel = LOG_LEVELS[level.toLowerCase()];
    if (logLevel < MIN_LOG_LEVEL || (!VERBOSE_LOGGING && logLevel <= LOG_LEVELS.info)) return;
    await logWithTimestamp(`${message}${metadata ? ` ${JSON.stringify(metadata)}` : ''}`, level, noDelay);
  }

  // ADD THESE METHODS
  error(message, key = null, metadata) {
    this.log(message, 'error', true, key, metadata);
  }

  info(message, key = null, metadata) {
    this.log(message, 'info', false, key, metadata);
  }

  warn(message, key = null, metadata) {
    this.log(message, 'warn', false, key, metadata);
  }
}

module.exports = new Logger();