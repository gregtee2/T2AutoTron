const fetch = require('node-fetch');
const logger = require('../logging/logger');

let cachedLocation = null;

async function fetchLocationData() {
  if (cachedLocation) {
    logger.info({ key: 'location:cached' }, 'Using cached location data');
    return cachedLocation;
  }
  try {
    const response = await fetch('http://ip-api.com/json', { timeout: 10000, headers: { 'User-Agent': 'T2AutoTron/1.0' } });
    if (!response.ok) throw new Error(`IP-API HTTP error! Status: ${response.status}`);
    const data = await response.json();
    if (data.status !== 'success') throw new Error('Invalid location data');
    cachedLocation = { latitude: data.lat, longitude: data.lon, city: data.city || 'Unknown', timezone: data.timezone || 'UTC' };
    logger.info({ key: 'location:fetched' }, `Location data fetched: ${JSON.stringify(cachedLocation)}`);
    return cachedLocation;
  } catch (error) {
    logger.error({ key: 'error:location', stack: error.stack }, `Error fetching location: ${error.message}`);
    cachedLocation = { latitude: 34.0522, longitude: -118.2437, city: 'Los Angeles', timezone: 'America/Los_Angeles' };
    logger.warn({ key: 'location:default' }, `Using default location: ${JSON.stringify(cachedLocation)}`);
    return cachedLocation;
  }
}

module.exports = { fetchLocationData };