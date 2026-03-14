const helmet = require('helmet');

const isDev = process.env.NODE_ENV !== 'production';

// Full Helmet suite for security headers + custom CSP
module.exports = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
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
  },
  // X-Frame-Options: SAMEORIGIN (prevent clickjacking)
  frameguard: { action: 'sameorigin' },
  // X-Content-Type-Options: nosniff
  noSniff: true,
  // X-XSS-Protection header
  xssFilter: true,
  // Disable HSTS — this is a LAN app, not public HTTPS
  hsts: false,
  // Hide X-Powered-By
  hidePoweredBy: true,
});