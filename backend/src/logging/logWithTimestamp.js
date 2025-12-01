// src/logging/logWithTimestamp.js
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');

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

  // Write to file
  const logFile = path.join(process.cwd(), 'server.log');
  // Strip ANSI codes for file log
  const cleanMessage = formattedMessage.replace(/\u001b\[\d+m/g, '') + '\n';
  fs.appendFile(logFile, cleanMessage, (err) => {
    if (err) console.error('Failed to write to log file:', err);
  });
};