// src/config/database.js
const mongoose = require('mongoose');
const logger = require('../logging/logger');
const config = require('./env');

async function connectMongoDB() {
  const maxRetries = 5;
  for (let i = 0; i < maxRetries; i++) {
    try {
      await logger.log('Attempting to connect to MongoDB...', 'info', false, `mongodb:connect:${i}`);
      await mongoose.connect(config.get('mongodbUri'), {
        serverSelectionTimeoutMS: 5000,
        maxPoolSize: 10
      });
      await logger.log('Connected to MongoDB successfully', 'info', false, 'mongodb:connected');
      return;
    } catch (err) {
      await logger.log(`MongoDB attempt ${i + 1} failed: ${err.message}`, 'warn', false, `mongodb:fail:${i}`);
      if (i === maxRetries - 1) {
        await logger.log('MongoDB connection failed after retries', 'error', false, 'error:mongodb');
        throw new Error('MongoDB connection failed');
      }
      await new Promise(resolve => setTimeout(resolve, 5000 * (i + 1)));
    }
  }
}

module.exports = { connectMongoDB };