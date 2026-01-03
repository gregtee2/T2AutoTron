// src/utils/HueLight.js - Hue Light Class

const { v3 } = require('node-hue-api');
const convert = require('color-convert');
const logWithTimestamp = require('../../../logging/logWithTimestamp');

class HueLight {
  constructor(light, hueApi) {
    this.light = light;
    this.id = String(light.id);
    this.name = light.name.trim();
    this.type = light.type;
    this.modelId = light.modelid;
    this.state = light._rawData?.state || {};
    this.hueApi = hueApi;
    this.previousState = { ...this.state };
  }

  async getCurrentState() {
    try {
      const light = await this.hueApi.lights.getLight(this.id);
      this.state = {
        on: light._rawData?.state?.on || false,
        bri: light._rawData?.state?.bri || 0,
        hue: light._rawData?.state?.hue || 0,
        sat: light._rawData?.state?.sat || 0,
        alert: light._rawData?.state?.alert || 'none',
        effect: light._rawData?.state?.effect || 'none',
        colorTemp: light._rawData?.state?.ct || 0,
        xy: light._rawData?.state?.xy || [0, 0]
      };
      return this.state;
    } catch (error) {
      logWithTimestamp(`Error fetching state for light "${this.id}": ${error.message}`, 'error');
      throw error;
    }
  }

  async updateState(io, notificationEmitter) {
    try {
      // Reduced logging: only log errors or significant state changes
      const light = await this.hueApi.lights.getLight(this.id);

      const rawState = light.data?.state;
      if (!rawState) {
        throw new Error(`Missing state data in raw response for "${this.name}"`);
      }

      this.state = {
        on: typeof rawState.on === 'boolean' ? rawState.on : this.state.on ?? false,
        bri: typeof rawState.bri === 'number' ? rawState.bri : this.state.bri ?? 0,
        hue: typeof rawState.hue === 'number' ? rawState.hue : this.state.hue ?? 0,
        sat: typeof rawState.sat === 'number' ? rawState.sat : this.state.sat ?? 0,
        colorTemp: typeof rawState.ct === 'number' ? rawState.ct : this.state.colorTemp ?? 0,
        xy: Array.isArray(rawState.xy) && rawState.xy.length === 2 ? rawState.xy : this.state.xy ?? [0, 0],
      };

      const stateChanged = this.hasStateChanged();
      if (stateChanged) {
        const stateToEmit = {
          id: this.id,
          name: this.name,
          type: this.type,
          on: this.state.on,
          brightness: this.state.bri,
          hue: this.state.hue,
          saturation: this.state.sat,
          colorTemp: this.state.colorTemp,
          xy: this.state.xy,
        };
        io.emit('device-state-update', stateToEmit);

        // Only send Telegram on ON/OFF changes, not brightness/color changes
        // This prevents spam when colors are cycling continuously
        const onOffChanged = this.state.on !== this.previousState.on;
        if (onOffChanged && notificationEmitter) {
          const status = this.state.on ? 'ON' : 'OFF';
          const message = `💡 *${this.name}* turned *${status}*`;
          notificationEmitter.emit('notify', message);
        }
      }

      this.previousState = { ...this.state };
    } catch (error) {
      logWithTimestamp(`Error updating state for "${this.name}": ${error.message}`, 'error');
    }
  }

  hasStateChanged() {
    return (
      this.state.on !== this.previousState.on ||
      this.state.bri !== this.previousState.bri ||
      this.state.hue !== this.previousState.hue ||
      this.state.sat !== this.previousState.sat ||
      this.state.colorTemp !== this.previousState.colorTemp ||
      JSON.stringify(this.state.xy) !== JSON.stringify(this.previousState.xy)
    );
  }

  async turnOn() {
    try {
      const state = new v3.lightStates.LightState().on();
      await this.hueApi.lights.setLightState(this.id, state);
      await this.getCurrentState();
      logWithTimestamp(`"${this.name}" turned on`, 'info');
    } catch (error) {
      logWithTimestamp(`Error turning on "${this.name}": ${error.message}`, 'error');
      throw error;
    }
  }

  async turnOff() {
    try {
      const state = new v3.lightStates.LightState().off();
      await this.hueApi.lights.setLightState(this.id, state);
      await this.getCurrentState();
      logWithTimestamp(`"${this.name}" turned off`, 'info');
    } catch (error) {
      logWithTimestamp(`Error turning off "${this.name}": ${error.message}`, 'error');
      throw error;
    }
  }

  async toggle() {
    try {
      if (!this.state || typeof this.state.on !== 'boolean') {
        throw new Error(`Invalid state for light "${this.name}"`);
      }
      const newState = !this.state.on;
      const state = new v3.lightStates.LightState()[newState ? 'on' : 'off']();
      await this.hueApi.lights.setLightState(this.id, state);
      await this.getCurrentState();
      logWithTimestamp(`"${this.name}" toggled to ${newState ? 'on' : 'off'}`, 'info');
    } catch (error) {
      logWithTimestamp(`Error toggling "${this.name}": ${error.message}`, 'error');
      throw error;
    }
  }

  async setBrightness(brightness) {
    try {
      if (!this.supportsBrightness()) {
        throw new Error(`Device "${this.name}" does not support brightness adjustments`);
      }
      if (brightness < 0 || brightness > 254) {
        throw new Error(`Brightness value ${brightness} is out of range (0-254)`);
      }
      const state = new v3.lightStates.LightState().brightness(Math.round(brightness));
      await this.hueApi.lights.setLightState(this.id, state);
      await this.getCurrentState();
      logWithTimestamp(`"${this.name}" brightness set to ${brightness}`, 'info');
    } catch (error) {
      logWithTimestamp(`Error setting brightness for "${this.name}": ${error.message}`, 'error');
      throw error;
    }
  }

  async setColor(hsv) {
    try {
      if (!this.supportsColor()) {
        throw new Error(`Device "${this.name}" does not support color adjustments`);
      }
      const { hue, saturation, brightness } = hsv;
      if (
        typeof hue !== 'number' || hue < 0 || hue > 360 ||
        typeof saturation !== 'number' || saturation < 0 || saturation > 100 ||
        typeof brightness !== 'number' || brightness < 0 || brightness > 254
      ) {
        throw new Error(`Invalid HSV values: ${JSON.stringify(hsv)}`);
      }
      const scaledHue = Math.round((hue / 360) * 65535);
      const scaledSat = Math.round((saturation / 100) * 254);
      const scaledBri = Math.round(brightness);
      const state = new v3.lightStates.LightState()
        .hue(scaledHue)
        .sat(scaledSat)
        .bri(scaledBri);
      await this.hueApi.lights.setLightState(this.id, state);
      await this.getCurrentState();
      logWithTimestamp(`"${this.name}" color set to HSV(${hue}, ${saturation}, ${brightness})`, 'info');
    } catch (error) {
      logWithTimestamp(`Error setting color for "${this.name}": ${error.message}`, 'error');
      throw error;
    }
  }

  supportsBrightness() {
    return true;
  }

  supportsColor() {
    const colorSupportedTypes = ['Extended color light', 'Color temperature light', 'Color light'];
    return colorSupportedTypes.includes(this.type);
  }
}

module.exports = HueLight;