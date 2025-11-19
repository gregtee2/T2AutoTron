// weather/forecastService.js - FINAL 100% WORKING
const logger = require('../logging/logger');
const fetch = require('node-fetch');

let cachedForecast = null;
let lastFetchTime = null;
const CACHE_TIMEOUT = 15 * 60 * 1000; // 15 minutes

async function fetchForecastData(forceRefresh = false, haToken = null) {
  // Clear expired cache
  if (lastFetchTime && (Date.now() - lastFetchTime) > CACHE_TIMEOUT) {
    logger.log('Forecast cache expired', 'warn', false, 'forecast:cache-expired');
    cachedForecast = null;
  }

  if (cachedForecast && !forceRefresh) {
    logger.log('Using cached forecast', 'info', false, 'forecast:cached');
    return cachedForecast;
  }

  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      logger.log(`Fetching forecast (attempt ${attempt + 1})`, 'info', false, `forecast:fetch:${attempt}`);

      // === GET LOCATION FROM HA (if token) ===
      let lat, lon;
      if (haToken) {
        try {
          const configRes = await fetch('http://192.168.1.78:8123/api/config', {
            headers: { 'Authorization': `Bearer ${haToken}` }
          });
          if (configRes.ok) {
            const config = await configRes.json();
            lat = config.latitude;
            lon = config.longitude;
            logger.log(`Using HA location: ${lat}, ${lon}`, 'info');
          }
        } catch (haErr) {
          logger.log(`HA location failed: ${haErr.message}`, 'warn');
        }
      }

      // === FALLBACK: locationService ===
      if (!lat || !lon) {
        const location = await require('./locationService').fetchLocationData();
        lat = location.latitude;
        lon = location.longitude;
      }

      // === OPENWEATHER CALL ===
      const apiKey = process.env.OPENWEATHERMAP_API_KEY;
      if (!apiKey) throw new Error('OPENWEATHERMAP_API_KEY missing');

      const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=imperial`;
      const response = await fetch(url, { timeout: 10000 });
      if (!response.ok) throw new Error(`OpenWeather HTTP ${response.status}`);

      const data = await response.json();
      if (!data?.list) throw new Error('No forecast list');

      // === FORMAT 5-DAY DATA ===
      const daily = data.list
        .filter((_, i) => i % 8 === 0)
        .slice(0, 5)
        .map(entry => ({
          date: entry.dt * 1000,
          high: Math.round(entry.main.temp_max),
          low: Math.round(entry.main.temp_min),
          condition: entry.weather[0].main,
          precip: Math.round((entry.pop || 0) * 100)
        }));

      cachedForecast = daily;
      lastFetchTime = Date.now();
      logger.log('Forecast fetched & cached', 'info', false, 'forecast:success');
      return daily;

    } catch (error) {
      logger.log(`Forecast error (attempt ${attempt + 1}): ${error.message}`, 'error', true, `forecast:error:${attempt}`);
      if (attempt === maxRetries - 1) {
        logger.log('Max retries failed', 'error');
        return cachedForecast || [];
      }
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
}

module.exports = { fetchForecastData };