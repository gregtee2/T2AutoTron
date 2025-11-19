const logger = require('../../logging/logger');

module.exports = (err, req, res, next) => {
  // Log the error using logger.log with 'error' level
  logger.log('error', err.stack, { stack: err.stack }, 'error:unhandled');

  // Send error response
  const isDevelopment = process.env.NODE_ENV !== 'production';
  res.status(500).json({
    success: false,
    error: isDevelopment ? err.stack : 'Internal server error'
  });
};