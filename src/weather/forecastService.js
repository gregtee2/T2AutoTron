// weather/forecastService.js - DEBUG VERSION
const logger = require('../logging/logger');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const DEBUG_FILE = path.join(process.cwd(), 'forecast_debug.log');

function debugLog(msg) {
  try {
    const timestamp = new Date().toISOString();
    fs.appendFileSync(DEBUG_FILE, `[${timestamp}] ${msg}\n`);
  } catch (e) {
    console.error('Failed to write to debug log:', e);
  }
}

let cachedForecast = null;
let lastFetchTime = null;
const CACHE_TIMEOUT = 15 * 60 * 1000; // 15 minutes

async function fetchForecastData(forceRefresh = false, haToken = null) {
  debugLog(`fetchForecastData called. forceRefresh=${forceRefresh}, haToken=${haToken ? 'YES' : 'NO'}`);

  // Clear expired cache
  if (lastFetchTime && (Date.now() - lastFetchTime) > CACHE_TIMEOUT) {
    debugLog('Cache expired');
    cachedForecast = null;
  }

  if (cachedForecast && !forceRefresh) {
    debugLog('Returning cached forecast');
    return cachedForecast;
  }

  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      debugLog(`Attempt ${attempt + 1} starting`);

      // === GET LOCATION FROM HA (if token) ===
      let lat, lon;
      if (haToken) {
        debugLog('haToken provided, trying HA location...');
        try {
          const haHost = process.env.HA_HOST || 'http://localhost:8123';
          debugLog(`Using HA_HOST: ${haHost}`);

          const configRes = await fetch(`${haHost}/api/config`, {
            headers: { 'Authorization': `Bearer ${haToken}` }
          });

          debugLog(`HA config response: ${configRes.status}`);

          if (configRes.ok) {
            const config = await configRes.json();
            lat = config.latitude;
            lon = config.longitude;
            debugLog(`Got HA location: ${lat}, ${lon}`);
          }
        } catch (haErr) {
          debugLog(`HA location failed: ${haErr.message}`);
        }
      } else {
        debugLog('No haToken provided');
      }

      // === FALLBACK: locationService ===
      if (!lat || !lon) {
        debugLog('Lat/Lon missing, trying fallback locationService...');
        try {
          const location = await require('./locationService').fetchLocationData();
          lat = location.latitude;
          lon = location.longitude;
          debugLog(`Got fallback location: ${lat}, ${lon}`);
        } catch (locErr) {
          debugLog(`Fallback location failed: ${locErr.message}`);
        }
      }

      // === OPENWEATHER CALL ===
      const apiKey = process.env.OPENWEATHERMAP_API_KEY;
      if (!apiKey) {
        debugLog('ERROR: OPENWEATHERMAP_API_KEY missing');
        throw new Error('OPENWEATHERMAP_API_KEY missing');
      }

      if (!lat || !lon) {
        debugLog('ERROR: No location data available');
        throw new Error('No location data available');
      }

      const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=imperial`;
      debugLog(`Fetching weather from: ${url.replace(apiKey, 'HIDDEN')}`);

      const response = await fetch(url, { timeout: 10000 });
      debugLog(`OpenWeather response: ${response.status}`);

      if (!response.ok) {
        const text = await response.text();
        debugLog(`OpenWeather error body: ${text}`);
        throw new Error(`OpenWeather HTTP ${response.status}`);
      }

      const data = await response.json();
      debugLog(`OpenWeather data items: ${data?.list?.length}`);

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
          icon: entry.weather[0].icon,
          description: entry.weather[0].description,
          precip: Math.round((entry.pop || 0) * 100)
        }));

      cachedForecast = daily;
      lastFetchTime = Date.now();
      debugLog(`Success! Returning ${daily.length} days: ${JSON.stringify(daily)}`);
      return daily;

    } catch (error) {
      debugLog(`Error in attempt ${attempt + 1}: ${error.message}`);
      if (attempt === maxRetries - 1) {
        debugLog('Max retries reached. Returning empty/cached.');
        return cachedForecast || [];
      }
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
}

module.exports = { fetchForecastData };