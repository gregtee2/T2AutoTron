// src/config/database.js
const mongoose = require('mongoose');
const logger = require('../logging/logger');
const config = require('./env');

async function connectMongoDB() {
  // Check if MongoDB is disabled via environment
  if (process.env.SKIP_MONGODB === 'true') {
    console.log('MongoDB connection skipped (SKIP_MONGODB=true)');
    await logger.log('MongoDB connection skipped', 'info', false, 'mongodb:skipped');
    return;
  }

  const maxRetries = 2; // Reduced retries for faster startup
  for (let i = 0; i < maxRetries; i++) {
    try {
      await logger.log('Attempting to connect to MongoDB...', 'info', false, `mongodb:connect:${i}`);
      await mongoose.connect(config.get('mongodbUri'), {
        serverSelectionTimeoutMS: 3000, // Faster timeout
        maxPoolSize: 10
      });
      await logger.log('Connected to MongoDB successfully', 'info', false, 'mongodb:connected');
      return;
    } catch (err) {
      await logger.log(`MongoDB attempt ${i + 1} failed: ${err.message}`, 'warn', false, `mongodb:fail:${i}`);
      if (i === maxRetries - 1) {
        // Instead of throwing, just log and continue without MongoDB
        console.log('⚠ MongoDB not available - continuing without database');
        await logger.log('MongoDB not available - running without database', 'warn', false, 'mongodb:unavailable');
        return; // Don't throw, just continue
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

module.exports = { connectMongoDB };