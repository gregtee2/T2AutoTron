// src/hueManager.js - Philips Hue Device Management
const { v3 } = require('node-hue-api');
const HueLight = require('./utils/HueLight');
const chalk = require('chalk');
const logWithTimestamp = (message, level = 'info') => {
  const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
  const timestamp = `[${new Date().toISOString()}]`;
  let formattedMessage = `${timestamp} `;
  if (['error'].includes(level) || (LOG_LEVEL === 'info' && ['info', 'warn'].includes(level)) || LOG_LEVEL === level) {
    switch (level) {
      case 'error':
        formattedMessage += `${chalk.red('❌ ' + message)}`;
        break;
      case 'warn':
        formattedMessage += `${chalk.yellow('⚠️ ' + message)}`;
        break;
      case 'info':
      default:
        formattedMessage += `${chalk.green('✅ ' + message)}`;
        break;
    }
    console.log(formattedMessage);
  }
};

let hueClient = null;
const hueLights = [];

async function setupHue(io, notificationEmitter) {
  try {
    if (!process.env.HUE_BRIDGE_IP || !process.env.HUE_USERNAME) {
      throw new Error('Hue Bridge credentials missing');
      throw new Error(`Hue light with ID ${lightId} not found`);
    }

    const hueState = {
      on: state.on
    };
    if (state.brightness !== undefined) {
      hueState.bri = Math.round(state.brightness * 2.54); // Convert percentage to Hue scale (0-254)
    }
    if (state.hue !== undefined) {
      hueState.hue = state.hue;
    }
    if (state.saturation !== undefined) {
      hueState.sat = state.saturation;
    }
    if (state.transitiontime !== undefined) {
      hueState.transitiontime = Math.round(state.transitiontime / 100); // Hue uses 1/10th seconds
    }

    await hueClient.lights.setLightState(lightId, hueState);
    logWithTimestamp(`Controlled Hue light ${deviceId}: ${JSON.stringify(hueState)}`, 'info');
    return { success: true };
  } catch (error) {
    logWithTimestamp(`Failed to control Hue light ${deviceId}: ${error.message}`, 'error');
    return { success: false, error: error.message };
  }
}

module.exports = { setupHue, controlHueDevice, hueClient, hueLights };