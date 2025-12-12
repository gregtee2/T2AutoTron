const logger = require('../../logging/logger');

module.exports = (err, req, res, next) => {
  // Log the error using logger.log(message, level, ...)
  logger.log(err.message || 'Unhandled error', 'error', true, 'error:unhandled', { stack: err.stack });

  // Send error response
  const isDevelopment = process.env.NODE_ENV !== 'production';
  res.status(500).json({
    success: false,
    error: isDevelopment ? err.stack : 'Internal server error'
  });
};