const cors = require('cors');
module.exports = cors({
  origin: ['http://localhost:3000', 'http://localhost:8080', 'file://', 'http://localhost:5173'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
});