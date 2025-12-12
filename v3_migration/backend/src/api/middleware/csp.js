const helmet = require('helmet');

const isDev = process.env.NODE_ENV !== 'production';

module.exports = helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    // Plugins are loaded as external scripts; dev builds may still require permissive settings.
    scriptSrc: [
      "'self'",
      "'unsafe-inline'",
      ...(isDev ? ["'unsafe-eval'"] : []),
      "http://localhost:3000",
      "http://localhost:8080",
      "http://localhost:5173"
    ],
    styleSrc: ["'self'", "'unsafe-inline'"],
    connectSrc: [
      "'self'",
      "ws://localhost:3000",
      "http://localhost:3000",
      "http://localhost:8080",
      "http://localhost:5173"
    ],
    imgSrc: ["'self'", "data:"],
    fontSrc: ["'self'"],
    objectSrc: ["'none'"],
    upgradeInsecureRequests: [],
  },
});