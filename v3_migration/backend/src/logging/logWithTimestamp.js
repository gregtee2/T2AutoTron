// src/logging/logWithTimestamp.js
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');

const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB max log file size
let lastRotationCheck = 0;
const ROTATION_CHECK_INTERVAL = 60000; // Check every minute

async function rotateLogIfNeeded(logFile) {
  const now = Date.now();
  if (now - lastRotationCheck < ROTATION_CHECK_INTERVAL) return;
  lastRotationCheck = now;
  
  try {
    const stats = fs.statSync(logFile);
    if (stats.size > MAX_LOG_SIZE) {
      const backupFile = logFile + '.old';
      // Remove old backup if exists
      if (fs.existsSync(backupFile)) {
        fs.unlinkSync(backupFile);
      }
      // Rename current to backup
      fs.renameSync(logFile, backupFile);
      console.log(`[Logger] Rotated ${logFile} (was ${(stats.size / 1024 / 1024).toFixed(1)}MB)`);
    }
  } catch (err) {
    // File doesn't exist yet or other error - ignore
  }
}

module.exports = async (message, level = 'info', noDelay = false) => {
  const timestamp = `[${new Date().toISOString()}]`;
  let formattedMessage = `${timestamp} `;
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

  if (noDelay) {
    console.log(formattedMessage);
  } else {
    setTimeout(() => console.log(formattedMessage), 0);
  }

  // Write to file with rotation
  const logFile = path.join(process.cwd(), 'server.log');
  await rotateLogIfNeeded(logFile);
  
  // Strip ANSI codes for file log
  const cleanMessage = formattedMessage.replace(/\u001b\[\d+m/g, '') + '\n';
  fs.appendFile(logFile, cleanMessage, (err) => {
    if (err) console.error('Failed to write to log file:', err);
  });
};