const fetch = require('node-fetch');
const WebSocket = require('ws');
const logger = require('../../logging/logger');
const fs = require('fs');
const path = require('path');

class HomeAssistantManager {
  static devices = [];
  static ws = null;
  static config = {
    host: process.env.HA_HOST || 'http://homeassistant.local:8123',
    token: process.env.HA_TOKEN,
  };
  static supportedDomains = ['light', 'switch', 'fan', 'cover', 'weather', 'sensor', 'binary_sensor', 'media_player'];

  // Load configuration from file
  static loadConfig() {
    const configPath = path.join(__dirname, '..', '..', 'config', 'ha_config.json');
    try {
      if (fs.existsSync(configPath)) {
        const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        return {
          includePatterns: configData.home_assistant?.sensor_include_patterns || [],
          excludePatterns: configData.home_assistant?.sensor_exclude_patterns || []
        };
      }
    } catch (error) {
      logger.log(`Failed to load HA config: ${error.message}`, 'error', false, 'ha:config');
    }
    return { includePatterns: [], excludePatterns: [] };
  }

  async initialize(io, notificationEmitter, log) {
    try {
      await log('Initializing Home Assistant...', 'info', false, 'ha:init');
      await log(`HA Config: host=${HomeAssistantManager.config.host}, token=${HomeAssistantManager.config.token ? 'present' : 'missing'}`, 'info', false, 'ha:config');
      
      const response = await fetch(`${HomeAssistantManager.config.host}/api/states`, {
        headers: { Authorization: `Bearer ${HomeAssistantManager.config.token}` },
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HA API error: ${response.status}: ${response.statusText}, Body: ${errorText}`);
      }
      const states = await response.json();
      const { includePatterns, excludePatterns } = HomeAssistantManager.loadConfig();
      HomeAssistantManager.devices = states.filter(s => 
        HomeAssistantManager.supportedDomains.some(domain => 
          s.entity_id.startsWith(`${domain}.`) &&
          (domain !== 'sensor' && domain !== 'binary_sensor' || 
            (
              // Include if matches an include pattern (or no patterns defined)
              (includePatterns.length === 0 || 
               includePatterns.some(pattern => 
                 s.entity_id.toLowerCase().includes(pattern.toLowerCase()) || 
                 s.attributes.friendly_name?.toLowerCase().includes(pattern.toLowerCase())
               )) &&
              // Exclude if matches an exclude pattern
              !excludePatterns.some(pattern => 
                s.entity_id.toLowerCase().includes(pattern.toLowerCase()) || 
                s.attributes.friendly_name?.toLowerCase().includes(pattern.toLowerCase())
              )
            ))
        )
      );
      await log(`Initialized ${HomeAssistantManager.devices.length} HA devices (${HomeAssistantManager.supportedDomains.join(', ')})`, 'info', false, 'ha:initialized');

      if (io && notificationEmitter) {
        HomeAssistantManager.devices.forEach(device => {
          const entityType = device.entity_id.split('.')[0];
          const state = {
            id: `ha_${device.entity_id}`,
            name: device.attributes.friendly_name || device.entity_id,
            type: entityType,
            ...(entityType === 'weather' ? {
              condition: device.state,
              temperature: device.attributes.temperature,
              humidity: device.attributes.humidity,
              wind_speed: device.attributes.wind_speed,
              pressure: device.attributes.pressure,
              precipitation: device.attributes.precipitation
            } : entityType === 'sensor' ? {
              value: device.state,
              unit: device.attributes.unit_of_measurement
            } : entityType === 'binary_sensor' ? {
              on: device.state === 'on'
            } : entityType === 'light' ? {
              on: device.state === 'on',
              brightness: device.attributes.brightness ? Math.round((device.attributes.brightness / 255) * 100) : (device.state === 'on' ? 100 : 0),
              hs_color: device.attributes.hs_color || [0, 0]
            } : entityType === 'fan' ? {
              on: device.state === 'on',
              percentage: device.attributes.percentage || 0
            } : entityType === 'cover' ? {
              on: device.state === 'open',
              position: device.attributes.current_position || 0
            } : entityType === 'switch' ? {
              on: device.state === 'on',
              brightness: device.attributes.brightness ? Math.round((device.attributes.brightness / 255) * 100) : (device.state === 'on' ? 100 : 0),
              hs_color: device.attributes.hs_color || [0, 0]
            } : entityType === 'media_player' ? {
              state: device.state,
              volume_level: device.attributes.volume_level,
              source: device.attributes.source,
              media_title: device.attributes.media_title
            } : {})
          };
          io.emit('device-state-update', state);
          notificationEmitter.emit('notify', `🔄 HA Update: ${state.name} updated`);
        });

        HomeAssistantManager.ws = new WebSocket(`${HomeAssistantManager.config.host.replace('http', 'ws')}/api/websocket`);
        HomeAssistantManager.ws.on('open', () => {
          HomeAssistantManager.ws.send(JSON.stringify({ type: 'auth', access_token: HomeAssistantManager.config.token }));
          HomeAssistantManager.ws.send(JSON.stringify({ id: 1, type: 'subscribe_events', event_type: 'state_changed' }));
          log('HA WebSocket connected', 'info', false, 'ha:websocket');
        });
        HomeAssistantManager.ws.on('message', (data) => {
          try {
            const msg = JSON.parse(data);
            if (msg.type === 'event' && msg.event.event_type === 'state_changed') {
              const entity = msg.event.data.new_state;
              if (!entity || !HomeAssistantManager.supportedDomains.some(domain => 
                entity.entity_id.startsWith(`${domain}.`) &&
                (domain !== 'sensor' && domain !== 'binary_sensor' || 
                  (
                    (includePatterns.length === 0 || 
                     includePatterns.some(pattern => 
                       entity.entity_id.toLowerCase().includes(pattern.toLowerCase()) || 
                       entity.attributes.friendly_name?.toLowerCase().includes(pattern.toLowerCase())
                     )) &&
                    !excludePatterns.some(pattern => 
                      entity.entity_id.toLowerCase().includes(pattern.toLowerCase()) || 
                      entity.attributes.friendly_name?.toLowerCase().includes(pattern.toLowerCase())
                    )
                  ))
              )) return;
              const entityType = entity.entity_id.split('.')[0];
              const state = {
                id: `ha_${entity.entity_id}`,
                ...(entityType === 'weather' ? {
                  condition: entity.state,
                  temperature: entity.attributes.temperature,
                  humidity: entity.attributes.humidity,
                  wind_speed: entity.attributes.wind_speed,
                  pressure: entity.attributes.pressure,
                  precipitation: entity.attributes.precipitation
                } : entityType === 'sensor' ? {
                  value: entity.state,
                  unit: entity.attributes.unit_of_measurement
                } : entityType === 'binary_sensor' ? {
                  on: entity.state === 'on'
                } : entityType === 'light' ? {
                  on: entity.state === 'on',
                  brightness: entity.attributes.brightness ? Math.round((entity.attributes.brightness / 255) * 100) : (entity.state === 'on' ? 100 : 0),
                  hs_color: entity.attributes.hs_color || [0, 0]
                } : entityType === 'fan' ? {
                  on: entity.state === 'on',
                  percentage: entity.attributes.percentage || 0
                } : entityType === 'cover' ? {
                  on: entity.state === 'open',
                  position: entity.attributes.current_position || 0
                } : entityType === 'switch' ? {
                  on: entity.state === 'on',
                  brightness: entity.attributes.brightness ? Math.round((entity.attributes.brightness / 255) * 100) : (entity.state === 'on' ? 100 : 0),
                  hs_color: entity.attributes.hs_color || [0, 0]
                } : entityType === 'media_player' ? {
                  state: entity.state,
                  volume_level: entity.attributes.volume_level,
                  source: entity.attributes.source,
                  media_title: entity.attributes.media_title
                } : {})
              };
              io.emit('device-state-update', state);
              log(`HA state update: ${state.id} - ${entity.state}`, 'info', false, `ha:state:${state.id}`);
            }
          } catch (err) {
            log(`HA WebSocket message error: ${err.message}`, 'error', false, 'ha:websocket:message');
          }
        });
        HomeAssistantManager.ws.on('error', (err) => log(`HA WebSocket error: ${err.message}`, 'error', false, 'ha:websocket:error'));
        HomeAssistantManager.ws.on('close', () => log('HA WebSocket closed', 'warn', false, 'ha:websocket:close'));
      }
      return HomeAssistantManager.devices;
    } catch (error) {
      await log(`HA initialization failed: ${error.message}`, 'error', false, 'ha:error');
      return [];
    }
  }

  async getState(id) {
    try {
      const rawId = id.replace('ha_', '');
      const response = await fetch(`${HomeAssistantManager.config.host}/api/states/${rawId}`, {
        headers: { Authorization: `Bearer ${HomeAssistantManager.config.token}` },
        timeout: 5000
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HA API error: ${response.status}: ${response.statusText}, Body: ${errorText}`);
      }
      const data = await response.json();
      const entityType = rawId.split('.')[0];
      const state = {
        ...(entityType === 'weather' ? {
          condition: data.state,
          temperature: data.attributes.temperature,
          humidity: data.attributes.humidity,
          wind_speed: data.attributes.wind_speed,
          pressure: data.attributes.pressure,
          precipitation: data.attributes.precipitation
        } : entityType === 'sensor' ? {
          value: data.state,
          unit: data.attributes.unit_of_measurement
        } : entityType === 'binary_sensor' ? {
          on: data.state === 'on'
        } : entityType === 'light' ? {
          on: data.state === 'on',
          brightness: data.attributes.brightness ? Math.round((data.attributes.brightness / 255) * 100) : (data.state === 'on' ? 100 : 0),
          hs_color: data.attributes.hs_color || [0, 0]
        } : entityType === 'fan' ? {
          on: data.state === 'on',
          percentage: data.attributes.percentage || 0
        } : entityType === 'cover' ? {
          on: data.state === 'open',
          position: data.attributes.current_position || 0
        } : entityType === 'switch' ? {
          on: data.state === 'on',
          brightness: data.attributes.brightness ? Math.round((data.attributes.brightness / 255) * 100) : (data.state === 'on' ? 100 : 0),
          hs_color: data.attributes.hs_color || [0, 0]
        } : entityType === 'media_player' ? {
          state: data.state,
          volume_level: data.attributes.volume_level,
          source: data.attributes.source,
          media_title: data.attributes.media_title
        } : {})
      };
      await logger.log(`Fetched state for HA device ${rawId}: ${JSON.stringify(state)}`, 'info', false, `ha:state:${rawId}`);
      return { success: true, state };
    } catch (error) {
      await logger.log(`Failed to fetch state for HA device ${id}: ${error.message}`, 'error', false, `ha:state:${id}`);
      return { success: false, error: error.message };
    }
  }

  async updateState(id, update) {
    try {
      const rawId = id.replace('ha_', '');
      const entityType = rawId.split('.')[0];
      let service;
      const payload = { entity_id: rawId };

      switch (entityType) {
        case 'light':
          service = update.on ? 'light/turn_on' : 'light/turn_off';
          if (update.on) {
            if (update.brightness !== undefined) payload.brightness_pct = Math.round(update.brightness);
            if (update.hs_color) payload.hs_color = update.hs_color;
            if (update.transition !== undefined) payload.transition = update.transition / 1000;
          }
          break;
        case 'switch':
          service = update.on ? 'switch/turn_on' : 'switch/turn_off';
          break;
        case 'fan':
          service = update.on ? 'fan/turn_on' : 'fan/turn_off';
          if (update.on && update.percentage !== undefined) payload.percentage = update.percentage;
          break;
        case 'cover':
          service = update.on ? 'cover/open_cover' : 'cover/close_cover';
          if (update.position !== undefined) payload.position = update.position;
          break;
        case 'media_player':
          service = update.on ? 'media_player.turn_on' : 'media_player.turn_off';
          if (update.volume_level !== undefined) payload.volume_level = update.volume_level;
          if (update.source) payload.source = update.source;
          break;
        case 'weather':
        case 'sensor':
        case 'binary_sensor':
          throw new Error(`Weather, sensor, and binary sensor entities are read-only`);
        default:
          throw new Error(`Unsupported entity type: ${entityType}`);
      }

      await logger.log(`Sending HA state update for ${id}: ${JSON.stringify(payload)}`, 'info', false, `ha:state:${id}`);
      const response = await fetch(`${HomeAssistantManager.config.host}/api/services/${service}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${HomeAssistantManager.config.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        timeout: 5000
      });
      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`HA API error: ${response.status}: ${response.statusText}, Body: ${errorBody}`);
      }
      await logger.log(`HA state update succeeded for ${id}: ${JSON.stringify(payload)}`, 'info', false, `ha:state:${id}`);
      return { success: true };
    } catch (error) {
      await logger.log(`HA state update failed for ${id}: ${error.message}`, 'error', false, `ha:state:${id}`);
      return { success: false, error: error.message };
    }
  }

  async controlDevice(deviceId, state) {
    try {
      const rawId = deviceId.replace('ha_', '');
      const entityType = rawId.split('.')[0];
      let service;
      const payload = { entity_id: rawId };

      switch (entityType) {
        case 'light':
          service = state.on ? 'light/turn_on' : 'light/turn_off';
          if (state.on) {
            if (state.brightness !== undefined) payload.brightness_pct = Math.round(state.brightness);
            if (state.hs_color) payload.hs_color = state.hs_color;
            if (state.transition !== undefined) payload.transition = state.transition / 1000;
          }
          break;
        case 'switch':
          service = state.on ? 'switch/turn_on' : 'switch/turn_off';
          break;
        case 'fan':
          service = state.on ? 'fan/turn_on' : 'fan/turn_off';
          if (state.on && state.percentage !== undefined) payload.percentage = state.percentage;
          break;
        case 'cover':
          service = state.on ? 'cover/open_cover' : 'cover/close_cover';
          if (state.position !== undefined) payload.position = state.position;
          break;
        case 'media_player':
          service = state.on ? 'media_player.turn_on' : 'media_player.turn_off';
          if (state.volume_level !== undefined) payload.volume_level = state.volume_level;
          if (state.source) payload.source = state.source;
          break;
        case 'weather':
        case 'sensor':
        case 'binary_sensor':
          throw new Error(`Weather, sensor, and binary sensor entities are read-only`);
        default:
          throw new Error(`Unsupported entity type: ${entityType}`);
      }

      await logger.log(`Sending HA control for ${deviceId}: ${JSON.stringify(payload)}`, 'info', false, `ha:control:${deviceId}`);
      const response = await fetch(`${HomeAssistantManager.config.host}/api/services/${service}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${HomeAssistantManager.config.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        timeout: 5000
      });
      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`HA API error: ${response.status}: ${response.statusText}, Body: ${errorBody}`);
      }
      await logger.log(`HA control succeeded for ${deviceId}: ${JSON.stringify(payload)}`, 'info', false, `ha:control:${deviceId}`);
      return { success: true };
    } catch (error) {
      await logger.log(`HA control failed for ${deviceId}: ${error.message}`, 'error', false, `ha:error:${deviceId}`);
      return { success: false, error: error.message };
    }
  }

  getDevices() {
    return HomeAssistantManager.devices.map(device => {
      const entityType = device.entity_id.split('.')[0];
      return {
        id: `ha_${device.entity_id}`,
        name: device.attributes.friendly_name || device.entity_id,
        type: entityType,
        state: {
          ...(entityType === 'weather' ? {
            condition: device.state,
            temperature: device.attributes.temperature,
            humidity: device.attributes.humidity,
            wind_speed: device.attributes.wind_speed,
            pressure: device.attributes.pressure,
            precipitation: device.attributes.precipitation
          } : entityType === 'sensor' ? {
            value: device.state,
            unit: device.attributes.unit_of_measurement
          } : entityType === 'binary_sensor' ? {
            on: device.state === 'on'
          } : entityType === 'light' ? {
            on: device.state === 'on',
            brightness: device.attributes.brightness ? Math.round((device.attributes.brightness / 255) * 100) : (device.state === 'on' ? 100 : 0),
            hs_color: device.attributes.hs_color || [0, 0]
          } : entityType === 'fan' ? {
            on: device.state === 'on',
            percentage: device.attributes.percentage || 0
          } : entityType === 'cover' ? {
            on: device.state === 'open',
            position: device.attributes.current_position || 0
          } : entityType === 'switch' ? {
            on: device.state === 'on',
            brightness: device.attributes.brightness ? Math.round((device.attributes.brightness / 255) * 100) : (device.state === 'on' ? 100 : 0),
            hs_color: device.attributes.hs_color || [0, 0]
          } : entityType === 'media_player' ? {
            state: device.state,
            volume_level: device.attributes.volume_level,
            source: device.attributes.source,
            media_title: device.attributes.media_title,
            media_content_type: device.attributes.media_content_type,
            media_artist: device.attributes.media_artist,
            shuffle: device.attributes.shuffle,
            repeat: device.attributes.repeat,
            supported_features: device.attributes.supported_features
          } : {})
        }
      };
    });
  }

  async shutdown() {
    if (HomeAssistantManager.ws) {
      HomeAssistantManager.ws.close();
      HomeAssistantManager.ws = null;
    }
  }
}

module.exports = {
  name: 'HomeAssistant',
  type: 'device',
  prefix: 'ha_',
  initialize: async (io, notificationEmitter, log) => await new HomeAssistantManager().initialize(io, notificationEmitter, log),
  getState: async (id) => await new HomeAssistantManager().getState(id),
  updateState: async (id, update) => await new HomeAssistantManager().updateState(id, update),
  controlDevice: async (deviceId, state) => await new HomeAssistantManager().controlDevice(deviceId, state),
  getDevices: () => new HomeAssistantManager().getDevices(),
  shutdown: async () => await new HomeAssistantManager().shutdown()
};