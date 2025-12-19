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
  }

  async initialize(io, notificationEmitter, log) {
    try {
      await log('Initializing Home Assistant Media Players...', 'info', false, 'ha_media:init');
      const response = await fetch(`${this.config.host}/api/states`, {
        headers: { Authorization: `Bearer ${this.config.token}` },
      });
      if (!response.ok) throw new Error(`HA API error: ${response.status}: ${response.statusText}`);
      const states = await response.json();
      this.devices = states.filter(
        s => s.entity_id.startsWith('media_player.') && s.attributes.device_class === 'receiver'
      );
      await log(`Initialized ${this.devices.length} HA media player devices`, 'info', false, 'ha_media:initialized');

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

        this.ws = new WebSocket(`${this.config.host.replace('http', 'ws')}/api/websocket`);
        this.ws.on('open', () => {
          this.ws.send(JSON.stringify({ type: 'auth', access_token: this.config.token }));
          this.ws.send(JSON.stringify({ id: 1, type: 'subscribe_events', event_type: 'state_changed' }));
          log('HA Media WebSocket connected', 'info', false, 'ha_media:websocket');
        });
        this.ws.on('message', (data) => {
          try {
            const msg = JSON.parse(data);
            if (msg.type === 'event' && msg.event.event_type === 'state_changed') {
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
          } catch (err) {
            log(`HA Media WebSocket message error: ${err.message}`, 'error', false, 'ha_media:websocket:message');
          }
        });
        this.ws.on('error', (err) => log(`HA Media WebSocket error: ${err.message}`, 'error', false, 'ha_media:websocket:error'));
        this.ws.on('close', () => log('HA Media WebSocket closed', 'warn', false, 'ha_media:websocket:close'));
      }
      return this.devices;
    } catch (error) {
      await log(`HA Media initialization failed: ${error.message}`, 'error', false, 'ha_media:error');
      return [];
    }
  }

  async controlDevice(deviceId, state) {
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
      const response = await fetch(`${this.config.host}/api/services/${service.replace('.', '/')}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        timeout: 5000
      });
      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`HA API error: ${response.status}: ${response.statusText}, Body: ${errorBody}`);
      }
      await logger.log(`HA media control succeeded for ${deviceId}: ${JSON.stringify(payload)}`, 'info', false, `ha_media:control:${deviceId}`);
      return { success: true };
    } catch (error) {
      await logger.log(`HA media control failed for ${deviceId}: ${error.message}`, 'error', false, `ha_media:error:${deviceId}`);
      return { success: false, error: error.message };
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
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

module.exports = {
  name: 'homeAssistantMediaPlayer',
  type: 'media_player',
  prefix: 'ha_media_player_',
  initialize: async (io, notificationEmitter, log) => {
    const manager = new HomeAssistantMediaPlayerManager();
    return manager.initialize(io, notificationEmitter, log);
  },
  controlDevice: async (deviceId, state) => {
    const manager = new HomeAssistantMediaPlayerManager();
    return manager.controlDevice(deviceId, state);
  },
  getDevices: async () => {
    const manager = new HomeAssistantMediaPlayerManager();
    return manager.getDevices();
  },
  shutdown: () => {
    const manager = new HomeAssistantMediaPlayerManager();
    manager.shutdown();
  }
};