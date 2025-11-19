const logger = require('../logging/logger');
const fetch = require('node-fetch');

let cachedWeather = null;
let lastFetchTime = null;
const CACHE_TIMEOUT = 15 * 60 * 1000;

async function fetchWeatherData(forceRefresh = false) {
  if (lastFetchTime && (Date.now() - lastFetchTime) > CACHE_TIMEOUT) {
    logger.log('warn', 'Weather data cache expired, clearing...', null, 'weather:cache-expired');
    cachedWeather = null;
  }

  if (cachedWeather && !forceRefresh) {
    logger.log('info', 'Returning cached weather data', { data: cachedWeather }, 'weather:cached');
    return cachedWeather;
  }

  try {
    const url = `https://rt.ambientweather.net/v1/devices/${process.env.AMBIENT_MAC_ADDRESS}?apiKey=${process.env.AMBIENT_API_KEY}&applicationKey=${process.env.AMBIENT_APPLICATION_KEY}`;
    const response = await fetch(url, { timeout: 10000, headers: { 'User-Agent': 'T2AutoTron/1.0' } });
    if (!response.ok) throw new Error(`Ambient Weather HTTP error! Status: ${response.status}`);
    const data = await response.json();
    if (!data?.length) throw new Error('No weather data returned');

    cachedWeather = data[0];
    lastFetchTime = Date.now();
    logger.log('info', 'Weather data fetched successfully', { data: cachedWeather }, 'weather:fetched');
    return cachedWeather;
  } catch (error) {
    logger.log('error', `Error fetching weather: ${error.message}`, { stack: error.stack }, 'weather:error');
    return cachedWeather;
  }
}

module.exports = { fetchWeatherData };