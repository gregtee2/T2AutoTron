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

      // === OPENWEATHER CALL (if API key available) ===
      const apiKey = process.env.OPENWEATHERMAP_API_KEY;
      
      if (!lat || !lon) {
        // Try global location settings as last resort
        lat = process.env.LOCATION_LATITUDE || '32.7767';
        lon = process.env.LOCATION_LONGITUDE || '-96.7970';
        debugLog(`Using global location settings: ${lat}, ${lon}`);
      }

      // Try OpenWeatherMap first, then fall back to Open-Meteo
      let data = null;
      let useOpenMeteo = false;
      
      if (apiKey) {
        try {
          const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=imperial`;
          debugLog(`Fetching weather from OpenWeatherMap: ${url.replace(apiKey, 'HIDDEN')}`);

          const response = await fetch(url, { timeout: 10000 });
          debugLog(`OpenWeather response: ${response.status}`);

          if (!response.ok) {
            const text = await response.text();
            debugLog(`OpenWeather error body: ${text}`);
            throw new Error(`OpenWeather HTTP ${response.status}`);
          }

          data = await response.json();
          debugLog(`OpenWeather data items: ${data?.list?.length}`);

          if (!data?.list) throw new Error('No forecast list');
        } catch (owmErr) {
          debugLog(`OpenWeatherMap failed: ${owmErr.message}, trying Open-Meteo fallback`);
          useOpenMeteo = true;
        }
      } else {
        debugLog('No OPENWEATHERMAP_API_KEY, using Open-Meteo fallback');
        useOpenMeteo = true;
      }
      
      // === OPEN-METEO FALLBACK (free, no API key required) ===
      if (useOpenMeteo) {
        try {
          const omUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode,sunrise,sunset&timezone=auto&forecast_days=7`;
          debugLog(`Fetching from Open-Meteo: ${omUrl}`);
          
          const omResponse = await fetch(omUrl, { timeout: 10000 });
          if (!omResponse.ok) throw new Error(`Open-Meteo HTTP ${omResponse.status}`);
          
          const omData = await omResponse.json();
          debugLog(`Open-Meteo data: ${omData?.daily?.time?.length} days`);
          
          if (!omData?.daily?.time) throw new Error('No Open-Meteo daily data');
          
          // Map Open-Meteo weather codes to conditions
          const weatherCodeToCondition = (code) => {
            const map = {
              0: { condition: 'Clear', icon: '01d', desc: 'Clear sky' },
              1: { condition: 'Clear', icon: '01d', desc: 'Mainly clear' },
              2: { condition: 'Clouds', icon: '02d', desc: 'Partly cloudy' },
              3: { condition: 'Clouds', icon: '03d', desc: 'Overcast' },
              45: { condition: 'Fog', icon: '50d', desc: 'Foggy' },
              48: { condition: 'Fog', icon: '50d', desc: 'Depositing rime fog' },
              51: { condition: 'Drizzle', icon: '09d', desc: 'Light drizzle' },
              53: { condition: 'Drizzle', icon: '09d', desc: 'Moderate drizzle' },
              55: { condition: 'Drizzle', icon: '09d', desc: 'Dense drizzle' },
              61: { condition: 'Rain', icon: '10d', desc: 'Slight rain' },
              63: { condition: 'Rain', icon: '10d', desc: 'Moderate rain' },
              65: { condition: 'Rain', icon: '10d', desc: 'Heavy rain' },
              71: { condition: 'Snow', icon: '13d', desc: 'Slight snow' },
              73: { condition: 'Snow', icon: '13d', desc: 'Moderate snow' },
              75: { condition: 'Snow', icon: '13d', desc: 'Heavy snow' },
              80: { condition: 'Rain', icon: '09d', desc: 'Rain showers' },
              81: { condition: 'Rain', icon: '09d', desc: 'Moderate rain showers' },
              82: { condition: 'Rain', icon: '09d', desc: 'Violent rain showers' },
              95: { condition: 'Thunderstorm', icon: '11d', desc: 'Thunderstorm' },
              96: { condition: 'Thunderstorm', icon: '11d', desc: 'Thunderstorm with hail' },
              99: { condition: 'Thunderstorm', icon: '11d', desc: 'Thunderstorm with heavy hail' }
            };
            return map[code] || { condition: 'Unknown', icon: '01d', desc: 'Unknown' };
          };
          
          // Format Open-Meteo sunrise/sunset times
          const formatOMTime = (isoTime) => {
            if (!isoTime) return 'N/A';
            const date = new Date(isoTime);
            const h = date.getHours();
            const m = date.getMinutes();
            const period = h >= 12 ? 'PM' : 'AM';
            const displayHour = h > 12 ? h - 12 : (h === 0 ? 12 : h);
            return `${displayHour}:${m.toString().padStart(2, '0')} ${period}`;
          };
          
          // Convert Open-Meteo format to our standard format
          const daily = omData.daily.time.slice(0, 5).map((dateStr, i) => {
            const weatherInfo = weatherCodeToCondition(omData.daily.weathercode[i]);
            return {
              date: new Date(dateStr).getTime(),
              high: Math.round(omData.daily.temperature_2m_max[i] * 9/5 + 32), // C to F
              low: Math.round(omData.daily.temperature_2m_min[i] * 9/5 + 32),
              condition: weatherInfo.condition,
              icon: weatherInfo.icon,
              description: weatherInfo.desc,
              precip: omData.daily.precipitation_probability_max[i] || 0,
              humidity: null, // Not available in Open-Meteo daily
              wind: null, // Not available in Open-Meteo daily without extra params
              sunrise: formatOMTime(omData.daily.sunrise[i]),
              sunset: formatOMTime(omData.daily.sunset[i]),
              solarNoon: null,
              _source: 'open-meteo'
            };
          });
          
          cachedForecast = daily;
          lastFetchTime = Date.now();
          debugLog(`Open-Meteo success! Returning ${daily.length} days`);
          return daily;
          
        } catch (omErr) {
          debugLog(`Open-Meteo fallback failed: ${omErr.message}`);
          throw omErr;
        }
      }

      // === FORMAT 5-DAY DATA (OpenWeatherMap) ===
      // Only runs if we got data from OpenWeatherMap (not Open-Meteo)
      if (!data || !data.list) {
        throw new Error('No weather data available');
      }
      
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

// =============================================================================
// HOURLY RAIN FORECAST - Uses Open-Meteo (free) for precipitation prediction
// Returns hourly precipitation probability and amount for the next 24-48 hours
// =============================================================================

let cachedHourlyRain = null;
let lastHourlyRainFetch = null;
const HOURLY_RAIN_CACHE_TIMEOUT = 30 * 60 * 1000; // 30 minutes

/**
 * Fetch hourly rain forecast from Open-Meteo
 * @param {number} dayOffset - Which day to get (0 = today, 1 = tomorrow, etc.)
 * @param {string} haToken - HA token for location lookup
 * @returns {object} { hours: [{time, probability, amount, intensity}], summary }
 */
async function fetchHourlyRainForecast(dayOffset = 0, haToken = null) {
  debugLog(`fetchHourlyRainForecast called. dayOffset=${dayOffset}`);
  
  const cacheKey = `day_${dayOffset}`;
  const now = Date.now();
  
  // Check cache
  if (cachedHourlyRain && 
      cachedHourlyRain[cacheKey] && 
      lastHourlyRainFetch && 
      (now - lastHourlyRainFetch) < HOURLY_RAIN_CACHE_TIMEOUT) {
    debugLog('Returning cached hourly rain data');
    return cachedHourlyRain[cacheKey];
  }
  
  try {
    // Get location
    let lat, lon;
    
    // Try HA first
    if (haToken) {
      try {
        const haHost = process.env.HA_HOST || 'http://supervisor/core';
        const configRes = await fetch(`${haHost}/api/config`, {
          headers: { 'Authorization': `Bearer ${haToken}` },
          timeout: 5000
        });
        if (configRes.ok) {
          const config = await configRes.json();
          lat = config.latitude;
          lon = config.longitude;
          debugLog(`Got location from HA: ${lat}, ${lon}`);
        }
      } catch (e) {
        debugLog(`HA location failed: ${e.message}`);
      }
    }
    
    // Fallback to env vars or locationService
    if (!lat || !lon) {
      lat = process.env.LOCATION_LATITUDE;
      lon = process.env.LOCATION_LONGITUDE;
      if (!lat || !lon) {
        const locationService = require('./locationService');
        const loc = await locationService.fetchLocationData();
        lat = loc.latitude;
        lon = loc.longitude;
      }
      debugLog(`Using fallback location: ${lat}, ${lon}`);
    }
    
    // Fetch hourly precipitation from Open-Meteo
    // Request 3 days of hourly data to handle any day offset
    const url = `https://api.open-meteo.com/v1/forecast?` +
      `latitude=${lat}&longitude=${lon}` +
      `&hourly=precipitation_probability,precipitation` +
      `&forecast_days=3&timezone=auto`;
    
    debugLog(`Fetching hourly rain: ${url}`);
    
    const response = await fetch(url, { timeout: 10000 });
    if (!response.ok) throw new Error(`Open-Meteo HTTP ${response.status}`);
    
    const data = await response.json();
    
    if (!data?.hourly?.time) {
      throw new Error('No hourly data from Open-Meteo');
    }
    
    // Parse the hourly data - Open-Meteo returns ISO timestamps
    const hourlyTimes = data.hourly.time;
    const hourlyProb = data.hourly.precipitation_probability;
    const hourlyAmount = data.hourly.precipitation; // mm
    
    // Find the start of the requested day
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const targetDay = new Date(today);
    targetDay.setDate(targetDay.getDate() + dayOffset);
    const targetDayEnd = new Date(targetDay);
    targetDayEnd.setDate(targetDayEnd.getDate() + 1);
    
    // Filter hours for the target day
    const hours = [];
    let rainPeriods = [];
    let currentRainPeriod = null;
    
    for (let i = 0; i < hourlyTimes.length; i++) {
      const hourTime = new Date(hourlyTimes[i]);
      
      if (hourTime >= targetDay && hourTime < targetDayEnd) {
        const hour = hourTime.getHours();
        const probability = hourlyProb[i] || 0;
        const amountMm = hourlyAmount[i] || 0;
        const amountIn = amountMm * 0.0393701; // mm to inches
        
        // Determine intensity
        let intensity = 'none';
        if (amountMm > 0 || probability >= 30) {
          if (amountMm >= 7.6) intensity = 'heavy';      // Heavy: >= 0.3 in/hr
          else if (amountMm >= 2.5) intensity = 'moderate'; // Moderate: 0.1-0.3 in/hr
          else if (amountMm > 0 || probability >= 50) intensity = 'light'; // Light rain
          else if (probability >= 30) intensity = 'chance'; // Just a chance
        }
        
        hours.push({
          time: hourTime.toISOString(),
          hour,
          displayTime: formatHour(hour),
          probability,
          amountMm: Math.round(amountMm * 10) / 10,
          amountIn: Math.round(amountIn * 100) / 100,
          intensity
        });
        
        // Track rain periods (probability >= 40% or actual rain)
        const isRaining = probability >= 40 || amountMm > 0;
        if (isRaining) {
          if (!currentRainPeriod) {
            currentRainPeriod = { start: hour, end: hour, maxProb: probability, totalMm: amountMm };
          } else {
            currentRainPeriod.end = hour;
            currentRainPeriod.maxProb = Math.max(currentRainPeriod.maxProb, probability);
            currentRainPeriod.totalMm += amountMm;
          }
        } else if (currentRainPeriod) {
          rainPeriods.push(currentRainPeriod);
          currentRainPeriod = null;
        }
      }
    }
    
    // Don't forget the last period
    if (currentRainPeriod) {
      rainPeriods.push(currentRainPeriod);
    }
    
    // Build summary text
    let summary = 'No rain expected';
    if (rainPeriods.length > 0) {
      const periodTexts = rainPeriods.map(p => {
        const startTime = formatHour(p.start);
        const endTime = formatHour(p.end + 1); // End is inclusive, so add 1 for "until"
        if (p.start === p.end) {
          return `around ${startTime}`;
        }
        return `${startTime}-${endTime}`;
      });
      summary = `Rain expected: ${periodTexts.join(', ')}`;
    }
    
    const result = {
      hours,
      rainPeriods,
      summary,
      totalPrecipMm: hours.reduce((sum, h) => sum + h.amountMm, 0),
      maxProbability: Math.max(...hours.map(h => h.probability), 0),
      dayOffset,
      fetchedAt: new Date().toISOString()
    };
    
    // Cache the result
    if (!cachedHourlyRain) cachedHourlyRain = {};
    cachedHourlyRain[cacheKey] = result;
    lastHourlyRainFetch = now;
    
    debugLog(`Hourly rain success: ${summary}`);
    return result;
    
  } catch (error) {
    debugLog(`Hourly rain fetch error: ${error.message}`);
    return {
      hours: [],
      rainPeriods: [],
      summary: 'Unable to fetch rain forecast',
      error: error.message
    };
  }
}

function formatHour(hour) {
  if (hour === 0 || hour === 24) return '12am';
  if (hour === 12) return '12pm';
  if (hour < 12) return `${hour}am`;
  return `${hour - 12}pm`;
}

module.exports = { fetchForecastData, fetchHourlyRainForecast };