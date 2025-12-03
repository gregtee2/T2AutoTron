// src/utils/KasaLight.js - Kasa Light Class

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

class KasaLight {
  constructor(device) {
    this.device = device;
    this.light_id = device.deviceId;
    this.alias = device.alias;
    this.host = device.host;
    this.deviceType = device.deviceType ? device.deviceType.toLowerCase() : 'unknown';
    this.state = { on: false, brightness: 0, hue: 0, saturation: 0 };
    logWithTimestamp(`Initialized KasaLight - Type: ${this.deviceType}`, 'info');
  }

  async initialize() {
    try {
      this.state = await this.getState();
      logWithTimestamp(`Initialized ${this.alias} with state: ${JSON.stringify(this.state)}`, 'info');
    } catch (error) {
      logWithTimestamp(`Error initializing ${this.alias}: ${error.message}`, 'error');
    }
  }

  async toggle() {
    try {
      const currentState = await this.getPowerState();
      if (currentState) {
        await this.turnOff();
      } else {
        await this.turnOn();
      }
    } catch (error) {
      logWithTimestamp(`Error toggling ${this.alias}: ${error.message}`, 'error');
      throw error;
    }
  }

  async turnOn(transition = 0) {
    try {
      if (!this.supportsBrightness()) {
        logWithTimestamp(`Sending setPowerState(true) for ${this.alias} (non-bulb, no transition support)`, 'info');
        await this.device.setPowerState(true);
      } else {
        const targetBrightness = this.state.brightness > 0 ? this.state.brightness : 100;
        logWithTimestamp(`Sending setLightState for ${this.alias} to ON with brightness ${targetBrightness}, transition ${transition}ms`, 'info');
        await this.device.lighting.setLightState({
          on_off: 1,
          brightness: targetBrightness,
          transition_period: transition
        });
      }
      this.state = await this.getState();
      logWithTimestamp(`Turned on ${this.alias} with transition ${transition}ms`, 'info');
    } catch (error) {
      logWithTimestamp(`Error turning on ${this.alias}: ${error.message}`, 'error');
      throw error;
    }
  }

  async turnOff(transition = 0) {
    try {
      if (!this.supportsBrightness()) {
        logWithTimestamp(`Sending setPowerState(false) for ${this.alias} (non-bulb, no transition support)`, 'info');
        await this.device.setPowerState(false);
      } else {
        logWithTimestamp(`Sending setLightState for ${this.alias} to OFF with transition ${transition}ms`, 'info');
        await this.device.lighting.setLightState({
          on_off: 0,
          transition_period: transition
        });
      }
      this.state = await this.getState();
      logWithTimestamp(`Turned off ${this.alias} with transition ${transition}ms`, 'info');
    } catch (error) {
      logWithTimestamp(`Error turning off ${this.alias}: ${error.message}`, 'error');
      throw error;
    }
  }

  async fadeOn(transition = 0, targetHue = null, targetSaturation = null, targetBrightness = null) {
    try {
      if (!this.supportsBrightness() || transition <= 0) {
        logWithTimestamp(`Sending setPowerState(true) for ${this.alias} (no fade needed)`, 'info');
        await this.device.setPowerState(true);
      } else {
        const steps = 100; // 100 steps for smoothness
        const interval = transition / steps;
        const startBrightness = this.state.on ? this.state.brightness : 0;
        const targetBrightnessFinal = targetBrightness !== null ? targetBrightness : (this.state.brightness > 0 ? this.state.brightness : 100);
        const startHue = this.state.hue || 0;
        const startSaturation = this.state.saturation || 0;
        const targetHueFinal = targetHue !== null ? targetHue : startHue;
        const targetSaturationFinal = targetSaturation !== null ? targetSaturation : startSaturation;

        logWithTimestamp(`Simulating fade-on for ${this.alias} to HSV(${targetHueFinal}, ${targetSaturationFinal}, ${targetBrightnessFinal}) over ${transition}ms with ${steps} steps`, 'info');
        for (let i = 0; i <= steps; i++) {
          const progress = i / steps;
          const stepBrightness = Math.round(startBrightness + (targetBrightnessFinal - startBrightness) * progress);
          const stepHue = Math.round(startHue + (targetHueFinal - startHue) * progress);
          const stepSaturation = Math.round(startSaturation + (targetSaturationFinal - startSaturation) * progress);
          
          await this.device.lighting.setLightState({
            on_off: 1,
            brightness: stepBrightness,
            hue: stepHue,
            saturation: stepSaturation,
            color_temp: 0,
            transition_period: 0
          });
          await new Promise(resolve => setTimeout(resolve, interval));
        }
      }
      this.state = await this.getState();
      logWithTimestamp(`Fade-on completed for ${this.alias} with transition ${transition}ms`, 'info');
    } catch (error) {
      logWithTimestamp(`Error during fade-on for ${this.alias}: ${error.message}`, 'error');
      throw error;
    }
  }

  async fadeOff(transition = 0) {
    try {
      if (!this.supportsBrightness() || transition <= 0) {
        logWithTimestamp(`Sending setPowerState(false) for ${this.alias} (no fade needed)`, 'info');
        await this.device.setPowerState(false);
      } else {
        const steps = 100; // Finer steps for smoother fade
        const interval = transition / steps;
        const startBrightness = this.state.brightness || 0;
        const startHue = this.state.hue || 0;
        const startSaturation = this.state.saturation || 0;

        logWithTimestamp(`Simulating fade-off for ${this.alias} from brightness ${startBrightness} over ${transition}ms with ${steps} steps`, 'info');
        for (let i = steps; i >= 0; i--) {
          const progress = i / steps;
          const stepBrightness = Math.round(startBrightness * progress);
          
          await this.device.lighting.setLightState({
            on_off: i > 0 ? 1 : 0, // Turn off only at the last step
            brightness: stepBrightness,
            hue: startHue,
            saturation: startSaturation,
            color_temp: 0,
            transition_period: 0
          });
          await new Promise(resolve => setTimeout(resolve, interval));
        }
      }
      this.state = await this.getState();
      logWithTimestamp(`Fade-off completed for ${this.alias} with transition ${transition}ms`, 'info');
    } catch (error) {
      logWithTimestamp(`Error during fade-off for ${this.alias}: ${error.message}`, 'error');
      throw error;
    }
  }

  async getPowerState() {
    try {
      const state = await this.device.getPowerState();
      return state;
    } catch (error) {
      logWithTimestamp(`Error getting power state for ${this.alias}: ${error.message}`, 'error');
      throw error;
    }
  }

  async getState() {
    try {
      const on = await this.device.getPowerState();
      let brightness = 0, hue = 0, saturation = 0;
      if (this.device.deviceType === 'bulb' && this.device.lighting?.getLightState) {
        const lightState = await this.device.lighting.getLightState();
        brightness = lightState.brightness || 0;
        hue = lightState.hue || 0;
        saturation = lightState.saturation || 0;
      }
      this.state = { on, brightness, hue, saturation };
      return this.state;
    } catch (error) {
      logWithTimestamp(`Error getting state for ${this.alias}: ${error.message}`, 'error');
      throw error;
    }
  }

  async setBrightness(brightness, transition = 0) {
    try {
      if (!this.supportsBrightness()) {
        throw new Error(`Device ${this.alias} does not support brightness`);
      }
      if (typeof brightness !== 'number' || brightness < 1 || brightness > 100) {
        throw new Error('Brightness must be a number between 1 and 100');
      }
      logWithTimestamp(`Sending setLightState for ${this.alias} with brightness ${brightness}, transition ${transition}ms`, 'info');
      await this.device.lighting.setLightState({ brightness, transition_period: transition });
      this.state = await this.getState();
      logWithTimestamp(`Set brightness for ${this.alias} to ${brightness} with transition ${transition}ms`, 'info');
    } catch (error) {
      logWithTimestamp(`Error setting brightness for ${this.alias}: ${error.message}`, 'error');
      throw error;
    }
  }

  async setColor(hue, saturation, brightness, transition = 0) {
    try {
      if (!this.supportsColor()) {
        throw new Error(`Device ${this.alias} does not support color`);
      }
      if (
        typeof hue !== 'number' || hue < 0 || hue > 360 ||
        typeof saturation !== 'number' || saturation < 0 || saturation > 100 ||
        typeof brightness !== 'number' || brightness < 1 || brightness > 100
      ) {
        throw new Error(`Invalid HSV values: hue=${hue}, saturation=${saturation}, brightness=${brightness}`);
      }
      logWithTimestamp(`Sending setLightState for ${this.alias} with HSV(${hue}, ${saturation}, ${brightness}), transition ${transition}ms`, 'info');
      await this.device.lighting.setLightState({
        hue,
        saturation,
        brightness,
        color_temp: 0,
        transition_period: transition
      });
      this.state = await this.getState();
      logWithTimestamp(`Set color for ${this.alias} to HSV(${hue}, ${saturation}, ${brightness}) with transition ${transition}ms`, 'info');
    } catch (error) {
      logWithTimestamp(`Error setting color for ${this.alias}: ${error.message}`, 'error');
      throw error;
    }
  }

  supportsBrightness() {
    return this.device.deviceType === 'bulb' && !!this.device.lighting?.setLightState;
  }

  supportsColor() {
    return this.supportsBrightness();
  }
}

module.exports = KasaLight;