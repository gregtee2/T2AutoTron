// src/hueManager.js - Philips Hue Device Management
const { v3 } = require('node-hue-api');
const HueLight = require('./utils/HueLight');
const logWithTimestamp = require('../../logging/logWithTimestamp');

let hueClient = null;
const hueLights = [];

// Helper to emit Hue connection status to all clients
function emitHueStatus(io, connected, bridgeIp, deviceCount) {
  if (!io) return;
  io.emit('hue-connection-status', {
    connected,
    bridgeIp: bridgeIp || process.env.HUE_BRIDGE_IP || null,
    deviceCount: deviceCount || 0
  });
}

async function setupHue(io, notificationEmitter) {
  try {
    if (!process.env.HUE_BRIDGE_IP || !process.env.HUE_USERNAME) {
      throw new Error('Hue Bridge credentials missing');
    }
    hueClient = await v3.api.createLocal(process.env.HUE_BRIDGE_IP).connect(process.env.HUE_USERNAME);
    logWithTimestamp('Connected to Hue Bridge', 'info');

    const lightsData = await hueClient.lights.getAll();
    hueLights.length = 0; // Clear existing lights
    for (const light of lightsData) {
      const hueLight = new HueLight(light, hueClient);
      hueLights.push(hueLight);
      // Individual light logs removed - summary at the end is sufficient
      await hueLight.updateState(io, notificationEmitter);
    }

    // Emit status after successful connection and lights load
    emitHueStatus(io, true, process.env.HUE_BRIDGE_IP, hueLights.length);

    setInterval(async () => {
      try {
        await Promise.all(hueLights.map(light => light.updateState(io, notificationEmitter)));
      } catch (err) {
        logWithTimestamp(`Hue refresh error: ${err.message}`, 'error');
      }
    }, 10000);

    logWithTimestamp(`Hue setup completed: ${hueLights.length} lights initialized, hueClient: ${!!hueClient}`, 'info');
    return hueLights;
  } catch (err) {
    logWithTimestamp(`Hue setup failed: ${err.message}`, 'error');
    emitHueStatus(io, false, process.env.HUE_BRIDGE_IP, 0);
    throw err;
  }
}

async function controlHueDevice(deviceId, state) {
  try {
    const lightId = deviceId.replace('hue_', '');
    const light = hueLights.find(l => l.id === lightId);
    if (!light) {
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

function getConnectionStatus() {
  return {
    isConnected: !!hueClient,
    deviceCount: hueLights.length,
    bridgeIp: process.env.HUE_BRIDGE_IP || null
  };
}

module.exports = { setupHue, controlHueDevice, hueClient, hueLights, getConnectionStatus, emitHueStatus };