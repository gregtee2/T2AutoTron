const fetch = require('node-fetch');
const logger = require('../logging/logger');

let cachedLocation = null;

/**
 * Fetch location from Home Assistant config (if running as add-on)
 */
async function fetchHALocation() {
  const haHost = process.env.HA_HOST || 'http://supervisor/core';
  const haToken = process.env.HA_TOKEN || process.env.SUPERVISOR_TOKEN;
  
  if (!haToken) {
    return null;
  }
  
  try {
    const response = await fetch(`${haHost}/api/config`, {
      headers: { 'Authorization': `Bearer ${haToken}` },
      timeout: 5000
    });
    
    if (!response.ok) {
      logger.warn({ key: 'location:ha-failed' }, `HA config fetch failed: ${response.status}`);
      return null;
    }
    
    const config = await response.json();
    
    if (config.latitude && config.longitude) {
      const location = {
        latitude: config.latitude,
        longitude: config.longitude,
        city: config.location_name || 'Home',
        timezone: config.time_zone || 'UTC'
      };
      logger.info({ key: 'location:ha' }, `Got location from HA: ${location.city} (${location.timezone})`);
      return location;
    }
  } catch (err) {
    logger.warn({ key: 'location:ha-error' }, `HA location error: ${err.message}`);
  }
  
  return null;
}

async function fetchLocationData() {
  if (cachedLocation) {
    logger.info({ key: 'location:cached' }, 'Using cached location data');
    return cachedLocation;
  }
  
  // Try Home Assistant first (best for add-on users)
  const haLocation = await fetchHALocation();
  if (haLocation) {
    cachedLocation = haLocation;
    return cachedLocation;
  }
  
  // Fallback to IP geolocation
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
    // Final fallback: use environment variables (set from HA config or .env)
    const fallbackLat = process.env.LOCATION_LATITUDE || process.env.HA_LATITUDE;
    const fallbackLon = process.env.LOCATION_LONGITUDE || process.env.HA_LONGITUDE;
    if (fallbackLat && fallbackLon) {
      cachedLocation = { 
        latitude: parseFloat(fallbackLat), 
        longitude: parseFloat(fallbackLon), 
        city: process.env.LOCATION_NAME || 'Home', 
        timezone: process.env.TZ || 'UTC' 
      };
      logger.warn({ key: 'location:env-fallback' }, `Using environment location: ${JSON.stringify(cachedLocation)}`);
    } else {
      // Absolute last resort - use 0,0 which will be obviously wrong
      cachedLocation = { latitude: 0, longitude: 0, city: 'Unknown (configure HA location)', timezone: 'UTC' };
      logger.warn({ key: 'location:no-fallback' }, 'No location available - configure Home Assistant location settings');
    }
    return cachedLocation;
  }
}

module.exports = { fetchLocationData, fetchHALocation };