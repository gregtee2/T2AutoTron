/**
 * WeatherNodes.js - Backend implementation of weather-based logic
 * 
 * Pure Node.js implementation - no React/browser dependencies.
 * Gets weather data from the server's weather manager.
 */

const registry = require('../BackendNodeRegistry');

// Weather data cache (shared across all weather nodes)
let weatherCache = {
  data: null,
  lastFetch: 0,
  fetchInterval: 300000  // 5 minutes
};

/**
 * Get weather data from the backend weather manager
 */
async function getWeatherData() {
  const now = Date.now();
  
  // Return cached data if fresh enough
  if (weatherCache.data && (now - weatherCache.lastFetch) < weatherCache.fetchInterval) {
    return weatherCache.data;
  }
  
  // Try to get from weather manager
  try {
    const weatherManager = require('../../devices/managers/weatherManager');
    if (weatherManager && typeof weatherManager.getCurrentWeather === 'function') {
      const data = await weatherManager.getCurrentWeather();
      if (data) {
        weatherCache.data = data;
        weatherCache.lastFetch = now;
        return data;
      }
    }
  } catch (err) {
    // Weather manager not available
  }
  
  return weatherCache.data || null;
}

/**
 * Evaluate a threshold condition with hysteresis
 */
function evaluateThreshold(value, high, low, currentState, invert) {
  if (value === null || value === undefined) return false;
  
  let result;
  if (currentState) {
    // Currently true - need to go below low to turn off
    result = value >= low;
  } else {
    // Currently false - need to go above high to turn on
    result = value >= high;
  }
  
  return invert ? !result : result;
}

/**
 * WeatherLogicNode - Multi-output weather condition evaluator
 */
class WeatherLogicNode {
  constructor() {
    this.id = null;
    this.label = 'Weather Logic';
    this.properties = {
      // Solar radiation
      solarEnabled: true,
      solarThresholdHigh: 750,
      solarThresholdLow: 500,
      solarInvert: false,
      
      // Temperature
      tempEnabled: true,
      tempThresholdHigh: 80,
      tempThresholdLow: 60,
      tempInvert: false,
      
      // Humidity
      humidityEnabled: true,
      humidityThresholdHigh: 70,
      humidityThresholdLow: 30,
      humidityInvert: false,
      
      // Wind
      windEnabled: true,
      windThresholdHigh: 15,
      windThresholdLow: 5,
      windInvert: false,
      
      // Rain thresholds
      hourlyRainEnabled: true,
      hourlyRainThreshold: 0.1,
      hourlyRainInvert: false,
      
      eventRainEnabled: true,
      eventRainThreshold: 0.1,
      eventRainInvert: false,
      
      dailyRainEnabled: true,
      dailyRainThreshold: 0.1,
      dailyRainInvert: false,
      
      // Logic mode
      logicType: 'OR',  // 'AND' or 'OR'
      
      // Internal state
      _lastEval: {}
    };
  }

  restore(data) {
    if (data.properties) {
      Object.assign(this.properties, data.properties);
    }
  }

  async data(inputs) {
    const weather = await getWeatherData();
    const p = this.properties;
    const lastEval = p._lastEval || {};
    
    // Default values if no weather data
    const results = {
      solar: false,
      temp: false,
      humidity: false,
      wind: false,
      hourlyRain: false,
      eventRain: false,
      dailyRain: false
    };
    
    if (weather) {
      // Evaluate each condition
      if (p.solarEnabled) {
        results.solar = evaluateThreshold(
          weather.solar_radiation || weather.uvi * 100,
          p.solarThresholdHigh, p.solarThresholdLow,
          lastEval.solar, p.solarInvert
        );
      }
      
      if (p.tempEnabled) {
        results.temp = evaluateThreshold(
          weather.temperature || weather.temp,
          p.tempThresholdHigh, p.tempThresholdLow,
          lastEval.temp, p.tempInvert
        );
      }
      
      if (p.humidityEnabled) {
        results.humidity = evaluateThreshold(
          weather.humidity,
          p.humidityThresholdHigh, p.humidityThresholdLow,
          lastEval.humidity, p.humidityInvert
        );
      }
      
      if (p.windEnabled) {
        results.wind = evaluateThreshold(
          weather.wind_speed || weather.wind?.speed,
          p.windThresholdHigh, p.windThresholdLow,
          lastEval.wind, p.windInvert
        );
      }
      
      // Rain conditions (simple threshold, no hysteresis)
      if (p.hourlyRainEnabled) {
        const hourlyRain = weather.rain?.['1h'] || 0;
        results.hourlyRain = p.hourlyRainInvert 
          ? hourlyRain < p.hourlyRainThreshold
          : hourlyRain >= p.hourlyRainThreshold;
      }
      
      if (p.eventRainEnabled) {
        const eventRain = weather.rain?.event || weather.rain?.['3h'] || 0;
        results.eventRain = p.eventRainInvert
          ? eventRain < p.eventRainThreshold
          : eventRain >= p.eventRainThreshold;
      }
      
      if (p.dailyRainEnabled) {
        const dailyRain = weather.rain?.daily || weather.rain?.['24h'] || 0;
        results.dailyRain = p.dailyRainInvert
          ? dailyRain < p.dailyRainThreshold
          : dailyRain >= p.dailyRainThreshold;
      }
    }
    
    // Calculate combined result
    const enabledResults = [];
    if (p.solarEnabled) enabledResults.push(results.solar);
    if (p.tempEnabled) enabledResults.push(results.temp);
    if (p.humidityEnabled) enabledResults.push(results.humidity);
    if (p.windEnabled) enabledResults.push(results.wind);
    if (p.hourlyRainEnabled) enabledResults.push(results.hourlyRain);
    if (p.eventRainEnabled) enabledResults.push(results.eventRain);
    if (p.dailyRainEnabled) enabledResults.push(results.dailyRain);
    
    const all = p.logicType === 'AND'
      ? enabledResults.every(r => r)
      : enabledResults.some(r => r);
    
    // Save state for hysteresis
    p._lastEval = results;
    
    // Extract raw values from weather data
    const temp = weather?.temperature || weather?.temp || null;
    const humidity = weather?.humidity || null;
    const wind = weather?.wind_speed || weather?.wind?.speed || null;
    const solar = weather?.solar_radiation || (weather?.uvi ? weather.uvi * 100 : null);
    const hourlyRain = weather?.rain?.['1h'] || 0;
    const eventRain = weather?.rain?.event || weather?.rain?.['3h'] || 0;
    const dailyRain = weather?.rain?.daily || weather?.rain?.['24h'] || 0;
    
    // Generate summary text for TTS
    const summaryParts = [];
    if (temp !== null) summaryParts.push(`Temperature is ${Math.round(temp)} degrees`);
    if (humidity !== null) summaryParts.push(`humidity ${Math.round(humidity)} percent`);
    if (wind !== null && wind > 0) summaryParts.push(`wind ${Math.round(wind)} miles per hour`);
    if (hourlyRain > 0) summaryParts.push(`with ${hourlyRain.toFixed(2)} inches of rain in the last hour`);
    if (dailyRain > 0.01) summaryParts.push(`total rainfall today ${dailyRain.toFixed(2)} inches`);
    const summaryText = summaryParts.length > 0 ? summaryParts.join(', ') + '.' : 'Weather data not available.';
    
    return {
      // Boolean condition outputs
      all,
      solar: results.solar,
      temp: results.temp,
      humidity: results.humidity,
      wind: results.wind,
      hourly_rain: results.hourlyRain,
      event_rain: results.eventRain,
      daily_rain: results.dailyRain,
      summary_text: summaryText,
      // Raw value outputs
      temp_value: temp,
      humidity_value: humidity,
      wind_value: wind,
      solar_value: solar,
      hourly_rain_value: hourlyRain,
      event_rain_value: eventRain,
      daily_rain_value: dailyRain
    };
  }
}

// Register node
registry.register('WeatherLogicNode', WeatherLogicNode);

module.exports = { WeatherLogicNode, getWeatherData };
