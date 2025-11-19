const cors = require('cors');
module.exports = cors({
  origin: ['http://localhost:3000', 'http://localhost:8080', 'file://'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
});