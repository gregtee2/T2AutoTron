/**
 * SunriseSunsetNode.js - Backend implementation of sunrise/sunset time calculations
 * 
 * Pure Node.js implementation - no React/browser dependencies.
 * Calculates solar times based on lat/lon using SunCalc algorithm.
 */

const registry = require('../BackendNodeRegistry');

/**
 * Calculate sunrise and sunset times using simplified solar position algorithm
 * Based on NOAA solar calculator methodology
 */
function calculateSunTimes(date, latitude, longitude) {
  const toRad = (deg) => deg * Math.PI / 180;
  const toDeg = (rad) => rad * 180 / Math.PI;

  // Julian day
  const JD = Math.floor(365.25 * (date.getFullYear() + 4716)) + 
             Math.floor(30.6001 * ((date.getMonth() + 1 < 3 ? date.getMonth() + 13 : date.getMonth() + 1))) + 
             date.getDate() - 1524.5;
  
  // Julian century
  const T = (JD - 2451545) / 36525;
  
  // Solar mean longitude
  const L0 = (280.46646 + T * (36000.76983 + 0.0003032 * T)) % 360;
  
  // Solar mean anomaly
  const M = (357.52911 + T * (35999.05029 - 0.0001537 * T)) % 360;
  
  // Equation of center
  const C = (1.914602 - T * (0.004817 + 0.000014 * T)) * Math.sin(toRad(M)) +
            (0.019993 - 0.000101 * T) * Math.sin(toRad(2 * M)) +
            0.000289 * Math.sin(toRad(3 * M));
  
  // Sun true longitude
  const sunLong = L0 + C;
  
  // Obliquity of ecliptic
  const obliq = 23.439291 - 0.0130042 * T;
  
  // Sun declination
  const sinDecl = Math.sin(toRad(obliq)) * Math.sin(toRad(sunLong));
  const decl = toDeg(Math.asin(sinDecl));
  
  // Hour angle at sunrise/sunset
  const cosHA = (Math.cos(toRad(90.833)) - Math.sin(toRad(latitude)) * sinDecl) / 
                (Math.cos(toRad(latitude)) * Math.cos(toRad(Math.asin(sinDecl))));
  
  if (cosHA > 1 || cosHA < -1) {
    // No sunrise/sunset (polar day/night)
    return { sunrise: null, sunset: null };
  }
  
  const HA = toDeg(Math.acos(cosHA));
  
  // Equation of time (in minutes)
  const y = Math.tan(toRad(obliq / 2)) ** 2;
  const EoT = 4 * toDeg(
    y * Math.sin(2 * toRad(L0)) - 
    2 * 0.01671 * Math.sin(toRad(M)) + 
    4 * 0.01671 * y * Math.sin(toRad(M)) * Math.cos(2 * toRad(L0)) -
    0.5 * y * y * Math.sin(4 * toRad(L0)) -
    1.25 * 0.01671 * 0.01671 * Math.sin(2 * toRad(M))
  );
  
  // Solar noon (in minutes from midnight UTC)
  const solarNoon = 720 - 4 * longitude - EoT;
  
  // Sunrise and sunset times (in minutes from midnight UTC)
  const sunriseUTC = solarNoon - HA * 4;
  const sunsetUTC = solarNoon + HA * 4;
  
  // Convert to local date objects
  const tzOffset = date.getTimezoneOffset();
  const sunrise = new Date(date);
  sunrise.setHours(0, 0, 0, 0);
  sunrise.setMinutes(sunriseUTC - tzOffset);
  
  const sunset = new Date(date);
  sunset.setHours(0, 0, 0, 0);
  sunset.setMinutes(sunsetUTC - tzOffset);
  
  return { sunrise, sunset };
}

/**
 * SunriseSunsetNode - Outputs true during solar time windows
 * 
 * Frontend properties include AM/PM format for fixed times:
 * - fixed_stop_hour, fixed_stop_minute, fixed_stop_ampm, fixed_stop_enabled
 * - fixed_on_hour, fixed_on_minute, fixed_on_ampm, fixed_on_enabled
 */
class SunriseSunsetNode {
  constructor() {
    this.id = null;
    this.label = 'Sunrise/Sunset Trigger';
    this.properties = {
      latitude: 34.0522,
      longitude: -118.2437,
      on_offset_hours: 0,
      on_offset_minutes: 30,
      on_offset_direction: 'Before',  // Before/After
      on_enabled: true,
      fixed_on_enabled: false,
      fixed_on_hour: 6,
      fixed_on_minute: 0,
      fixed_on_ampm: 'PM',
      off_offset_hours: 0,
      off_offset_minutes: 0,
      off_offset_direction: 'Before',
      off_enabled: false,
      fixed_stop_enabled: true,
      fixed_stop_hour: 10,
      fixed_stop_minute: 30,
      fixed_stop_ampm: 'PM',
      currentState: false
    };
    this._cachedSunTimes = null;
    this._cacheDate = null;
  }

  /**
   * Convert 12-hour format to 24-hour format
   */
  to24Hour(hour, ampm) {
    let h = parseInt(hour) || 0;
    if (ampm === 'PM' && h !== 12) {
      h += 12;
    } else if (ampm === 'AM' && h === 12) {
      h = 0;
    }
    return h;
  }

  restore(data) {
    if (data.properties) {
      Object.assign(this.properties, data.properties);
    }
  }

  data(inputs) {
    const now = new Date();
    const today = now.toDateString();
    
    // Recalculate sun times once per day
    if (this._cacheDate !== today) {
      this._cachedSunTimes = calculateSunTimes(now, this.properties.latitude, this.properties.longitude);
      this._cacheDate = today;
    }
    
    const { sunrise, sunset } = this._cachedSunTimes;
    
    // Calculate ON time
    let onTime;
    if (this.properties.fixed_on_enabled) {
      onTime = new Date(now);
      // Handle AM/PM format
      const hour24 = this.to24Hour(this.properties.fixed_on_hour, this.properties.fixed_on_ampm);
      onTime.setHours(hour24, this.properties.fixed_on_minute || 0, 0, 0);
    } else if (sunset && this.properties.on_enabled) {
      onTime = new Date(sunset);
      // Handle offset (hours + minutes)
      const offsetHours = parseInt(this.properties.on_offset_hours) || 0;
      const offsetMinutes = parseInt(this.properties.on_offset_minutes) || 0;
      const offsetMs = (offsetHours * 60 + offsetMinutes) * 60 * 1000;
      if (this.properties.on_offset_direction === 'Before') {
        onTime.setTime(onTime.getTime() - offsetMs);
      } else {
        onTime.setTime(onTime.getTime() + offsetMs);
      }
    }
    
    // Calculate OFF time
    let offTime;
    if (this.properties.fixed_stop_enabled) {
      offTime = new Date(now);
      // Handle AM/PM format
      const hour24 = this.to24Hour(this.properties.fixed_stop_hour, this.properties.fixed_stop_ampm);
      offTime.setHours(hour24, this.properties.fixed_stop_minute || 0, 0, 0);
      // If off time is before on time, it's tomorrow (overnight scenario)
      if (onTime && offTime <= onTime) {
        offTime.setDate(offTime.getDate() + 1);
      }
    } else if (sunrise && this.properties.off_enabled) {
      offTime = new Date(sunrise);
      offTime.setDate(offTime.getDate() + 1);  // Tomorrow's sunrise
      const offsetHours = parseInt(this.properties.off_offset_hours) || 0;
      const offsetMinutes = parseInt(this.properties.off_offset_minutes) || 0;
      const offsetMs = (offsetHours * 60 + offsetMinutes) * 60 * 1000;
      if (this.properties.off_offset_direction === 'Before') {
        offTime.setTime(offTime.getTime() - offsetMs);
      } else {
        offTime.setTime(offTime.getTime() + offsetMs);
      }
    }
    
    // Determine state
    let state = false;
    if (onTime && offTime) {
      const nowMs = now.getTime();
      const onMs = onTime.getTime();
      const offMs = offTime.getTime();
      
      // Debug: Log time comparison (only if node has debug enabled)
      if (this.properties.debug) {
        console.log(`[SunriseSunset ${this.id?.slice(0,8)}] onTime=${onTime.toLocaleString()}, offTime=${offTime.toLocaleString()}, now=${now.toLocaleString()}`);
        console.log(`[SunriseSunset ${this.id?.slice(0,8)}] onMs<offMs=${onMs < offMs}, nowMs>onMs=${nowMs >= onMs}, nowMs<offMs=${nowMs < offMs}`);
      }
      
      if (onMs < offMs) {
        state = nowMs >= onMs && nowMs < offMs;
      } else {
        // Overnight range
        state = nowMs >= onMs || nowMs < offMs;
      }
      
      if (this.properties.debug) {
        console.log(`[SunriseSunset ${this.id?.slice(0,8)}] state=${state}`);
      }
    }
    
    // Format times for output
    const formatTime = (date) => {
      if (!date) return '';
      const hours = date.getHours();
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const h12 = hours % 12 || 12;
      return `${h12}:${minutes} ${ampm}`;
    };
    
    // Register scheduled events with the engine for UpcomingEventsNode
    this.registerUpcomingEvents(onTime, offTime);
    
    return {
      state,
      startTime: formatTime(onTime),
      endTime: formatTime(offTime),
      sunrise: formatTime(sunrise),
      sunset: formatTime(sunset)
    };
  }

  /**
   * Register upcoming events with the engine's scheduler
   */
  registerUpcomingEvents(onTime, offTime) {
    const engine = global.backendEngine;
    if (!engine || !engine.registerScheduledEvents) return;

    const events = [];
    const nodeName = this.properties.customName || this.label || 'Sunrise/Sunset';
    const now = new Date();
    
    if (onTime && onTime > now) {
      events.push({
        time: onTime.toISOString(),
        action: 'on',
        deviceName: nodeName
      });
    }
    
    if (offTime && offTime > now) {
      events.push({
        time: offTime.toISOString(),
        action: 'off',
        deviceName: nodeName
      });
    }
    
    engine.registerScheduledEvents(this.id, events);
  }
}

// Register node
registry.register('SunriseSunsetNode', SunriseSunsetNode);

module.exports = { SunriseSunsetNode, calculateSunTimes };
