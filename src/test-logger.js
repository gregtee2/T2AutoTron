// test-logger.js
const logger = require('./src/logging/logger');
logger.log('Test message', 'info', false, 'test:key').then(() => console.log('Logged successfully'));