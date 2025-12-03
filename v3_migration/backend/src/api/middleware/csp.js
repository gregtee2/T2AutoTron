const helmet = require('helmet');

module.exports = helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "http://localhost:3000", "http://localhost:8080"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    connectSrc: ["'self'", "ws://localhost:3000", "http://localhost:3000", "http://localhost:8080"],
    imgSrc: ["'self'", "data:"],
    fontSrc: ["'self'"],
    objectSrc: ["'none'"],
    upgradeInsecureRequests: [],
  },
});