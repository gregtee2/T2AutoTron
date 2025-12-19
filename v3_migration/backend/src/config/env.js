//src/config/env.js

const convict = require('convict');

const config = convict({
  port: {
    doc: 'Server port',
    format: 'port',
    default: 3000,
    env: 'PORT',
  },
  mongodbUri: {
    doc: 'MongoDB connection URI',
    format: String,
    default: 'mongodb://localhost:27017/lightgraph',
    env: 'MONGODB_URI',
  },
  logLevel: {
    doc: 'Minimum log level',
    format: String,  // Changed from enum to String - validate manually if needed
    default: 'info',
    env: 'LOG_LEVEL',
  },
  verboseLogging: {
    doc: 'Enable verbose logging',
    format: Boolean,
    default: false,
    env: 'VERBOSE_LOGGING',
  },
  ambientMacAddress: {
    doc: 'Ambient Weather MAC address',
    format: String,
    default: '',
    env: 'AMBIENT_MAC_ADDRESS',
  },
  ambientApiKey: {
    doc: 'Ambient Weather API key',
    format: String,
    default: '',
    env: 'AMBIENT_API_KEY',
  },
  ambientApplicationKey: {
    doc: 'Ambient Weather application key',
    format: String,
    default: '',
    env: 'AMBIENT_APPLICATION_KEY',
  },
  openWeatherMapApiKey: {
    doc: 'OpenWeatherMap API key',
    format: String,
    default: '',
    env: 'OPENWEATHERMAP_API_KEY',
  },
  haHost: {
    doc: 'Home Assistant host',
    format: String,
    default: 'http://localhost:8123',
    env: 'HA_HOST',
  },
  haToken: {
    doc: 'Home Assistant token',
    format: String,
    default: '',
    env: 'HA_TOKEN',
  },
});

config.validate({ allowed: 'strict' });

module.exports = config;