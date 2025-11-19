// src/frontend/js/energyMetering.js
const logger = require('../../logging/logger');

// Static wattage map based on device models (from manufacturer specs)
const wattageMap = {
  "LCA003": 10, // Hue Extended color light, ~10W max
  "LCT001": 9,  // Hue Extended color light, ~9W max (e.g., Living room ceiling 3)
  "KL130": 9    // Kasa smart light, ~9W max
};

// Default wattage for unknown devices
const DEFAULT_WATTAGE = 10;

/**
 * Calculate power based on max wattage and brightness
 * @param {string} modelId - Device model ID
 * @param {number} brightness - Brightness level (0-100 for Kasa, 0-254 for Hue)
 * @param {string} vendor - 'Hue' or 'Kasa'
 * @returns {number} Power in watts
 */
function calculatePower(modelId, brightness, vendor) {
  const maxWattage = wattageMap[modelId] || DEFAULT_WATTAGE;
  let scaledPower;
  if (vendor === 'Hue' || vendor === 'Osram') {
    scaledPower = maxWattage * (brightness / 254); // Hue uses 0-254 scale
  } else if (vendor === 'Kasa') {
    scaledPower = maxWattage * (brightness / 100); // Kasa uses 0-100 scale
  } else {
    scaledPower = maxWattage; // Fallback for unknown vendor
  }
  return Math.max(0, Math.min(maxWattage, scaledPower)); // Clamp between 0 and maxWattage
}

/**
 * Calculate energy consumption in watt-hours (Wh)
 * @param {number} power - Power in watts
 * @param {string} startTime - ISO timestamp of last state
 * @param {string} endTime - ISO timestamp of current state
 * @returns {number} Energy in Wh
 */
function calculateEnergy(power, startTime, endTime) {
  const start = new Date(startTime);
  const end = new Date(endTime);
  const hours = (end - start) / (1000 * 60 * 60); // Convert ms to hours
  return power * hours;
}

/**
 * Update energy for a device based on state change
 * @param {object} lastState - Previous state { on, brightness, timestamp, vendor, energy }
 * @param {object} newState - New state { on, brightness, timestamp, vendor }
 * @returns {number} Updated energy in Wh
 */
function updateEnergy(lastState, newState) {
  if (!lastState || !lastState.on || !lastState.timestamp) {
    return lastState?.energy || 0; // No previous state or was off, no energy added
  }

  const power = calculatePower(lastState.modelId, lastState.brightness, lastState.vendor);
  const incrementalEnergy = calculateEnergy(power, lastState.timestamp, newState.timestamp);
  const totalEnergy = (lastState.energy || 0) + incrementalEnergy;

  logger.log(
    `Energy update for ${lastState.id}: ${power.toFixed(2)}W from ${lastState.timestamp} to ${newState.timestamp} = ${incrementalEnergy.toFixed(2)}Wh (Total: ${totalEnergy.toFixed(2)}Wh)`,
    'info',
    false,
    `energy:update:${lastState.id}`
  );

  return totalEnergy;
}

module.exports = {
  calculatePower,
  calculateEnergy,
  updateEnergy,
};