const cors = require('cors');
module.exports = cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, or same-origin requests from HA ingress)
    if (!origin) return callback(null, true);
    
    // Allow all localhost and homeassistant origins
    const allowed = [
      /^http:\/\/localhost(:\d+)?$/,
      /^http:\/\/127\.0\.0\.1(:\d+)?$/,
      /^http:\/\/homeassistant\.local(:\d+)?$/,
      /^http:\/\/192\.168\.\d+\.\d+(:\d+)?$/,  // Local network IPs
      /^http:\/\/10\.\d+\.\d+\.\d+(:\d+)?$/,    // Local network IPs
      /^file:\/\//
    ];
    
    if (allowed.some(pattern => pattern.test(origin))) {
      return callback(null, true);
    }
    
    // Log rejected origins for debugging
    console.log('[CORS] Rejected origin:', origin);
    callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-APP-PIN'],
  credentials: true,
});