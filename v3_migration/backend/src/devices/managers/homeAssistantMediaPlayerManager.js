const fetch = require('node-fetch');
const WebSocket = require('ws');
const logger = require('../../logging/logger');

class HomeAssistantMediaPlayerManager {
  constructor() {
    this.devices = [];
    this.config = {
      host: process.env.HA_HOST || 'http://localhost:8123',
      token: process.env.HA_TOKEN,
    };
    this.ws = null;
    this.connectionGeneration = 0;
    this.initialRequest = null;
    this.wsHandshakeTimer = null;
  }

  updateConfig() {
    const host = process.env.HA_HOST || 'http://localhost:8123';
    const token = process.env.HA_TOKEN;
    if (host !== this.config.host || token !== this.config.token) {
      this.shutdown();
      this.devices = [];
      this.config = { host, token };
    }
  }

  closeWebSocket() {
    clearTimeout(this.wsHandshakeTimer);
    this.wsHandshakeTimer = null;
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      try {
        if (typeof ws.terminate === 'function') ws.terminate();
        else ws.close();
      } catch (_) { /* Already closed. */ }
    }
  }

  async fetchInitialStates(config) {
    const controller = new AbortController();
    let cancel;
    let timer;
    const cancelled = new Promise((_, reject) => {
      cancel = () => {
        clearTimeout(timer);
        controller.abort();
        reject(new Error('HA media initial request cancelled or timed out'));
      };
    });
    const request = { cancel };
    this.initialRequest = request;
    timer = setTimeout(cancel, 10000);
    timer.unref?.();
    try {
      return await Promise.race([
        (async () => {
          const response = await fetch(`${config.host}/api/states`, {
            headers: { Authorization: `Bearer ${config.token}` },
            signal: controller.signal,
            timeout: 10000
          });
          if (!response.ok) {
            throw Object.assign(new Error('HA API request failed'), { status: response.status });
          }
          return response.json();
        })(),
        cancelled
      ]);
    } finally {
      clearTimeout(timer);
      if (this.initialRequest === request) this.initialRequest = null;
    }
  }

  async initialize(io, notificationEmitter, log = logger.log.bind(logger)) {
    // The singleton may have been imported before dotenv or settings changed.
    this.updateConfig();
    this.shutdown();
    const generation = this.connectionGeneration;
    const isCurrent = () => generation === this.connectionGeneration;
    const config = { ...this.config };
    try {
      log('Initializing Home Assistant Media Players...', 'info', false, 'ha_media:init');
      if (!config.token) throw new Error('HA token is not configured');
      const states = await this.fetchInitialStates(config);
      if (!isCurrent()) return [];
      this.devices = states.filter(
        s => s.entity_id.startsWith('media_player.') && s.attributes.device_class === 'receiver'
      );
      log(`Initialized ${this.devices.length} HA media player devices`, 'info', false, 'ha_media:initialized');

      if (io && notificationEmitter) {
        this.devices.forEach(device => {
          const state = {
            id: `ha_media_player_${device.entity_id}`,
            name: device.attributes.friendly_name || device.entity_id,
            type: 'media_player',
            on: device.state === 'on',
            volume_level: device.attributes.volume_level || 0,
            source: device.attributes.source || null,
            source_list: device.attributes.source_list || [],
            sound_mode: device.attributes.sound_mode || null
          };
          io.emit('device-state-update', state);
          // Don't spam Telegram on init - only WebSocket state_changed events trigger notifications
        });

        if (!isCurrent()) return [];
        const ws = new WebSocket(`${config.host.replace(/^http/, 'ws')}/api/websocket`);
        this.ws = ws;
        let phase = 'waiting-auth';
        const isCurrentSocket = () => isCurrent() && this.ws === ws;
        const fail = (message) => {
          if (!isCurrentSocket()) return;
          this.closeWebSocket();
          log(message, 'warn', false, 'ha_media:websocket');
        };
        this.wsHandshakeTimer = setTimeout(() => {
          fail('HA Media WebSocket authentication/subscription timed out');
        }, 10000);
        this.wsHandshakeTimer.unref?.();
        ws.on('open', () => {
          if (!isCurrentSocket()) return;
          log('HA Media WebSocket awaiting authentication', 'info', false, 'ha_media:websocket');
        });
        ws.on('message', (data) => {
          if (!isCurrentSocket()) return;
          try {
            const msg = JSON.parse(data);
            if (msg.type === 'auth_required' && phase === 'waiting-auth') {
              phase = 'auth-sent';
              ws.send(JSON.stringify({ type: 'auth', access_token: config.token }));
              return;
            }
            if (msg.type === 'auth_ok' && phase === 'auth-sent') {
              phase = 'subscribing';
              ws.send(JSON.stringify({ id: 1, type: 'subscribe_events', event_type: 'state_changed' }));
              return;
            }
            if (msg.type === 'auth_invalid') {
              fail('HA Media WebSocket authentication rejected; update HA credentials');
              return;
            }
            if (msg.type === 'result' && msg.id === 1 && phase === 'subscribing') {
              if (!msg.success) {
                fail('HA Media WebSocket subscription failed');
                return;
              }
              phase = 'ready';
              clearTimeout(this.wsHandshakeTimer);
              this.wsHandshakeTimer = null;
              log('HA Media WebSocket authenticated and subscribed', 'info', false, 'ha_media:websocket');
              return;
            }
            if (phase === 'ready' && msg.type === 'event' && msg.event?.event_type === 'state_changed') {
              const entity = msg.event.data.new_state;
              if (!entity || !(entity.entity_id.startsWith('media_player.') && entity.attributes.device_class === 'receiver')) return;
              const state = {
                id: `ha_media_player_${entity.entity_id}`,
                on: entity.state === 'on',
                volume_level: entity.attributes.volume_level || 0,
                source: entity.attributes.source || null,
                source_list: entity.attributes.source_list || [],
                sound_mode: entity.attributes.sound_mode || null
              };
              io.emit('device-state-update', state);
              log(`HA media state update: ${state.id} - ${entity.state}`, 'info', false, `ha_media:state:${state.id}`);
            }
          } catch (_) {
            fail('HA Media WebSocket message processing failed');
          }
        });
        ws.on('error', () => fail('HA Media WebSocket transport error'));
        ws.on('close', () => fail('HA Media WebSocket closed'));
      }
      return this.devices;
    } catch (error) {
      if (!isCurrent()) return [];
      this.closeWebSocket();
      log(`HA Media initialization failed${Number.isInteger(error.status) ? ` (HTTP ${error.status})` : ''}; check HA connection and credentials`, 'error', false, 'ha_media:error');
      return [];
    }
  }

  async controlDevice(deviceId, state) {
    this.updateConfig();
    const config = { ...this.config };
    try {
      const rawId = deviceId.replace('ha_media_player_', '');
      let service = state.on ? 'media_player.turn_on' : 'media_player.turn_off';
      const payload = { entity_id: rawId };
      if (state.volume_level !== undefined) {
        service = 'media_player.volume_set';
        payload.volume_level = state.volume_level;
      } else if (state.source !== undefined) {
        service = 'media_player.select_source';
        payload.source = state.source;
      }
      const response = await fetch(`${config.host}/api/services/${service.replace('.', '/')}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        timeout: 5000
      });
      if (!response.ok) {
        throw Object.assign(new Error('HA API request failed'), { status: response.status });
      }
      await logger.log(`HA media control succeeded for ${deviceId}: ${JSON.stringify(payload)}`, 'info', false, `ha_media:control:${deviceId}`);
      return { success: true };
    } catch (error) {
      const message = Number.isInteger(error.status) ? `HA API error: ${error.status}` : 'HA media control request failed';
      await logger.log(`HA media control failed for ${deviceId}: ${message}`, 'error', false, `ha_media:error:${deviceId}`);
      return { success: false, error: message };
    }
  }

  async getDevices() {
    return this.devices.map(device => ({
      id: `ha_media_player_${device.entity_id}`,
      name: device.attributes.friendly_name || device.entity_id,
      type: 'media_player',
      state: {
        on: device.state === 'on',
        volume_level: device.attributes.volume_level || 0,
        source: device.attributes.source || null,
        source_list: device.attributes.source_list || [],
        sound_mode: device.attributes.sound_mode || null
      }
    }));
  }

  shutdown() {
    this.connectionGeneration++;
    this.initialRequest?.cancel();
    this.initialRequest = null;
    this.closeWebSocket();
  }
}

const instance = new HomeAssistantMediaPlayerManager();

module.exports = {
  name: 'homeAssistantMediaPlayer',
  type: 'media_player',
  prefix: 'ha_media_player_',
  initialize: (io, notificationEmitter, log) => instance.initialize(io, notificationEmitter, log),
  controlDevice: (deviceId, state) => instance.controlDevice(deviceId, state),
  getDevices: () => instance.getDevices(),
  shutdown: () => instance.shutdown()
};