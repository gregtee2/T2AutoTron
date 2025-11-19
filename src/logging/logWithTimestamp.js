// src/logging/logWithTimestamp.js
const chalk = require('chalk');

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
};