const logger = require('../logging/logger');
const fetch = require('node-fetch');

let cachedWeather = null;
let lastFetchTime = null;
let weatherSource = null; // Track which source provided the data
const CACHE_TIMEOUT = 15 * 60 * 1000;

/**
 * Weather codes from Open-Meteo to condition strings
 * https://open-meteo.com/en/docs#weathervariables
 */
function getOpenMeteoCondition(code) {
  const conditions = {
    0: 'clear', 1: 'partly-cloudy', 2: 'partly-cloudy', 3: 'cloudy',
    45: 'fog', 48: 'fog',
    51: 'drizzle', 53: 'drizzle', 55: 'drizzle',
    61: 'rain', 63: 'rain', 65: 'heavy-rain',
    71: 'snow', 73: 'snow', 75: 'heavy-snow',
    77: 'snow', 80: 'rain', 81: 'rain', 82: 'heavy-rain',
    85: 'snow', 86: 'heavy-snow',
    95: 'thunderstorm', 96: 'thunderstorm', 99: 'thunderstorm'
  };
  return conditions[code] || 'unknown';
}

/**
 * Try to fetch from Ambient Weather (personal weather station)
 */
async function fetchFromAmbientWeather() {
  const mac = process.env.AMBIENT_MAC_ADDRESS;
  const apiKey = process.env.AMBIENT_API_KEY;
  const appKey = process.env.AMBIENT_APPLICATION_KEY;
  
  if (!mac || !apiKey || !appKey) {
    return null; // Not configured
  }
  
  const url = `https://rt.ambientweather.net/v1/devices/${mac}?apiKey=${apiKey}&applicationKey=${appKey}`;
  const response = await fetch(url, { timeout: 10000, headers: { 'User-Agent': 'T2AutoTron/1.0' } });
  if (!response.ok) throw new Error(`Ambient Weather HTTP error! Status: ${response.status}`);
  const data = await response.json();
  if (!data?.length) throw new Error('No weather data returned from Ambient Weather');
  
  weatherSource = 'ambient';
  return data[0]; // Ambient Weather already returns data in the expected format
}

/**
 * Fallback: Fetch from Open-Meteo (free, no API key required)
 * Transforms data to match Ambient Weather format for compatibility
 */
async function fetchFromOpenMeteo() {
  // Get location from settings (global location configured in Settings panel)
  const lat = process.env.LOCATION_LATITUDE || '32.7767';  // Default: Dallas, TX
  const lon = process.env.LOCATION_LONGITUDE || '-96.7970';
  
  // Fetch current weather + hourly precipitation
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m&hourly=precipitation&timezone=auto&forecast_days=1`;
  
  const response = await fetch(url, { timeout: 10000, headers: { 'User-Agent': 'T2AutoTron/1.0' } });
  if (!response.ok) throw new Error(`Open-Meteo HTTP error! Status: ${response.status}`);
  const data = await response.json();
  
  if (!data?.current) throw new Error('No weather data returned from Open-Meteo');
  
  // Calculate hourly rain from the hourly precipitation array
  const now = new Date();
  const currentHour = now.getHours();
  const hourlyPrecip = data.hourly?.precipitation || [];
  const hourlyRain = hourlyPrecip[currentHour] || 0;
  
  // Transform Open-Meteo format to Ambient Weather format for compatibility
  const transformed = {
    // Temperature: Open-Meteo returns Celsius, convert to Fahrenheit
    tempf: data.current.temperature_2m * 9/5 + 32,
    
    // Humidity percentage (same format)
    humidity: data.current.relative_humidity_2m,
    
    // Wind speed: Open-Meteo returns km/h, convert to mph
    windspeedmph: data.current.wind_speed_10m * 0.621371,
    
    // Wind direction in degrees (same format)
    winddir: data.current.wind_direction_10m,
    
    // Rain data: Open-Meteo provides mm, convert to inches
    hourlyrainin: hourlyRain * 0.0393701,
    eventrainin: 0, // Open-Meteo doesn't track events
    dailyrainin: hourlyPrecip.reduce((sum, val) => sum + (val || 0), 0) * 0.0393701,
    
    // Solar radiation not available from Open-Meteo basic endpoint
    // (Would need separate solar API call)
    solarradiation: null,
    
    // Metadata
    date: new Date().toISOString(),
    dateutc: Date.now(),
    _source: 'open-meteo',
    _location: { latitude: lat, longitude: lon }
  };
  
  weatherSource = 'open-meteo';
  logger.log('info', `Open-Meteo weather: ${transformed.tempf.toFixed(1)}°F, ${transformed.humidity}% humidity`, null, 'weather:open-meteo');
  
  return transformed;
}

async function fetchWeatherData(forceRefresh = false) {
  if (lastFetchTime && (Date.now() - lastFetchTime) > CACHE_TIMEOUT) {
    logger.log('warn', 'Weather data cache expired, clearing...', null, 'weather:cache-expired');
    cachedWeather = null;
  }

  if (cachedWeather && !forceRefresh) {
    logger.log('info', 'Returning cached weather data', { source: weatherSource }, 'weather:cached');
    return cachedWeather;
  }

  // Try sources in order: Ambient Weather (most detailed) -> Open-Meteo (free fallback)
  try {
    // Try Ambient Weather first (personal weather station - most accurate)
    cachedWeather = await fetchFromAmbientWeather();
    if (cachedWeather) {
      lastFetchTime = Date.now();
      logger.log('info', 'Weather data fetched from Ambient Weather', { data: cachedWeather }, 'weather:fetched');
      return cachedWeather;
    }
  } catch (error) {
    logger.log('warn', `Ambient Weather failed: ${error.message}`, null, 'weather:ambient-error');
  }
  
  // Fallback to Open-Meteo (free, no API key needed)
  try {
    cachedWeather = await fetchFromOpenMeteo();
    lastFetchTime = Date.now();
    logger.log('info', 'Weather data fetched from Open-Meteo (fallback)', { data: cachedWeather }, 'weather:fetched');
    return cachedWeather;
  } catch (error) {
    logger.log('error', `Open-Meteo fallback failed: ${error.message}`, { stack: error.stack }, 'weather:error');
  }
  
  // Return cached data if available, even if stale
  if (cachedWeather) {
    logger.log('warn', 'Returning stale cached weather data', null, 'weather:stale');
    return cachedWeather;
  }
  
  return null;
}

function getWeatherSource() {
  return weatherSource;
}

module.exports = { fetchWeatherData, getWeatherSource };