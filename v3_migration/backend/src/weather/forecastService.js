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
      // Group by day and calculate actual high/low from all readings
      const dailyMap = {};
      
      // Get timezone offset from the API response (in seconds)
      const timezoneOffsetSeconds = data.city?.timezone || 0;
      const timezoneOffsetHours = timezoneOffsetSeconds / 3600;
      
      debugLog(`Timezone offset: ${timezoneOffsetHours} hours (${timezoneOffsetSeconds} seconds)`);
      
      data.list.forEach(entry => {
        // Use local date based on timezone offset
        const utcDate = new Date(entry.dt * 1000);
        const localDate = new Date(utcDate.getTime() + timezoneOffsetSeconds * 1000);
        const dateKey = localDate.toISOString().split('T')[0]; // YYYY-MM-DD
        
        if (!dailyMap[dateKey]) {
          dailyMap[dateKey] = {
            date: entry.dt * 1000,
            temps: [],
            conditions: [],
            icons: [],
            descriptions: [],
            precips: [],
            humidity: [],
            wind: []
          };
        }
        
        dailyMap[dateKey].temps.push(entry.main.temp);
        dailyMap[dateKey].conditions.push(entry.weather[0].main);
        dailyMap[dateKey].icons.push(entry.weather[0].icon);
        dailyMap[dateKey].descriptions.push(entry.weather[0].description);
        dailyMap[dateKey].precips.push(entry.pop || 0);
        dailyMap[dateKey].humidity.push(entry.main.humidity);
        dailyMap[dateKey].wind.push(entry.wind?.speed || 0);
      });

      // Calculate sunrise/sunset times using NOAA algorithm
      // Returns times in local timezone
      const calcSunTimes = (timestamp, latitude, longitude, tzOffsetHours) => {
        const date = new Date(timestamp);
        
        // Julian day calculation
        const year = date.getUTCFullYear();
        const month = date.getUTCMonth() + 1;
        const day = date.getUTCDate();
        
        const a = Math.floor((14 - month) / 12);
        const y = year + 4800 - a;
        const m = month + 12 * a - 3;
        const jdn = day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
        
        // Julian century
        const jc = (jdn - 2451545) / 36525;
        
        // Solar calculations
        const geomMeanLongSun = (280.46646 + jc * (36000.76983 + 0.0003032 * jc)) % 360;
        const geomMeanAnomSun = 357.52911 + jc * (35999.05029 - 0.0001537 * jc);
        const eccentEarthOrbit = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc);
        
        const sunEqOfCtr = Math.sin(geomMeanAnomSun * Math.PI / 180) * (1.914602 - jc * (0.004817 + 0.000014 * jc)) +
                          Math.sin(2 * geomMeanAnomSun * Math.PI / 180) * (0.019993 - 0.000101 * jc) +
                          Math.sin(3 * geomMeanAnomSun * Math.PI / 180) * 0.000289;
        
        const sunTrueLong = geomMeanLongSun + sunEqOfCtr;
        const sunAppLong = sunTrueLong - 0.00569 - 0.00478 * Math.sin((125.04 - 1934.136 * jc) * Math.PI / 180);
        
        const meanObliqEcliptic = 23 + (26 + ((21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813)))) / 60) / 60;
        const obliqCorr = meanObliqEcliptic + 0.00256 * Math.cos((125.04 - 1934.136 * jc) * Math.PI / 180);
        
        const sunDeclin = Math.asin(Math.sin(obliqCorr * Math.PI / 180) * Math.sin(sunAppLong * Math.PI / 180)) * 180 / Math.PI;
        
        const varY = Math.tan((obliqCorr / 2) * Math.PI / 180) * Math.tan((obliqCorr / 2) * Math.PI / 180);
        const eqOfTime = 4 * (varY * Math.sin(2 * geomMeanLongSun * Math.PI / 180) -
                         2 * eccentEarthOrbit * Math.sin(geomMeanAnomSun * Math.PI / 180) +
                         4 * eccentEarthOrbit * varY * Math.sin(geomMeanAnomSun * Math.PI / 180) * Math.cos(2 * geomMeanLongSun * Math.PI / 180) -
                         0.5 * varY * varY * Math.sin(4 * geomMeanLongSun * Math.PI / 180) -
                         1.25 * eccentEarthOrbit * eccentEarthOrbit * Math.sin(2 * geomMeanAnomSun * Math.PI / 180)) * 180 / Math.PI;
        
        // Hour angle for sunrise/sunset (with atmospheric refraction correction)
        const haRad = Math.acos(
          Math.cos(90.833 * Math.PI / 180) / (Math.cos(latitude * Math.PI / 180) * Math.cos(sunDeclin * Math.PI / 180)) -
          Math.tan(latitude * Math.PI / 180) * Math.tan(sunDeclin * Math.PI / 180)
        );
        const haDeg = haRad * 180 / Math.PI;
        
        // Solar noon in local time (minutes from midnight)
        const solarNoonMin = (720 - 4 * longitude - eqOfTime + tzOffsetHours * 60);
        
        // Sunrise and sunset times (minutes from midnight, local time)
        const sunriseMin = solarNoonMin - haDeg * 4;
        const sunsetMin = solarNoonMin + haDeg * 4;
        
        debugLog(`Sun calc for ${date.toISOString()}: sunrise=${sunriseMin.toFixed(2)}min, sunset=${sunsetMin.toFixed(2)}min, jdn=${jdn}`);
        
        const formatTime = (minutes) => {
          let mins = Math.round(minutes);
          if (mins < 0) mins += 1440;
          if (mins >= 1440) mins -= 1440;
          
          const h = Math.floor(mins / 60);
          const m = mins % 60;
          const period = h >= 12 ? 'PM' : 'AM';
          const displayHour = h > 12 ? h - 12 : (h === 0 ? 12 : h);
          return `${displayHour}:${m.toString().padStart(2, '0')} ${period}`;
        };
        
        return {
          sunrise: formatTime(sunriseMin),
          sunset: formatTime(sunsetMin),
          solarNoon: formatTime(solarNoonMin)
        };
      };

      const daily = Object.keys(dailyMap)
        .sort()
        .slice(0, 5)
        .map((dateKey, index) => {
          const dayData = dailyMap[dateKey];
          const sunTimes = calcSunTimes(dayData.date, lat, lon, timezoneOffsetHours);
          
          // Get the most common condition (mode)
          const conditionCounts = {};
          dayData.conditions.forEach(c => conditionCounts[c] = (conditionCounts[c] || 0) + 1);
          const mainCondition = Object.keys(conditionCounts).reduce((a, b) => 
            conditionCounts[a] > conditionCounts[b] ? a : b
          );
          
          // Get midday icon (around noon)
          const middayIcon = dayData.icons[Math.floor(dayData.icons.length / 2)] || dayData.icons[0];
          
          // Most common description
          const descCounts = {};
          dayData.descriptions.forEach(d => descCounts[d] = (descCounts[d] || 0) + 1);
          const mainDesc = Object.keys(descCounts).reduce((a, b) => 
            descCounts[a] > descCounts[b] ? a : b
          );

          return {
            date: dayData.date,
            high: Math.round(Math.max(...dayData.temps)),
            low: Math.round(Math.min(...dayData.temps)),
            condition: mainCondition,
            icon: middayIcon,
            description: mainDesc,
            precip: Math.round(Math.max(...dayData.precips) * 100),
            humidity: Math.round(dayData.humidity.reduce((a, b) => a + b, 0) / dayData.humidity.length),
            wind: Math.round(dayData.wind.reduce((a, b) => a + b, 0) / dayData.wind.length),
            sunrise: sunTimes.sunrise,
            sunset: sunTimes.sunset,
            solarNoon: sunTimes.solarNoon
          };
        });

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