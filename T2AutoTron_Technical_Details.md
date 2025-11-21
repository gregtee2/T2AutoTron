# T2AutoTron: Technical Details Supplement

This document provides detailed technical information to supplement the main documentation.

---

## Home Assistant Manager Deep Dive

### Class Structure
```javascript
class HomeAssistantManager {
  constructor() {
    this.devices = []
    this.config = { host, token }
    this.ws = null  // WebSocket connection
    this.stateCache = new Map()  // State cache
    this.deviceCache = null  // Device list cache
    this.STATE_CACHE_TTL = 5000  // 5 seconds
    this.DEVICE_CACHE_TTL = 30000  // 30 seconds
  }
}
```

### Initialization Process
1. Fetch all entities from `/api/states`
2. Filter for `light.*` and `switch.*` entities
3. Initialize device cache with current state
4. Establish WebSocket connection for real-time updates
5. Subscribe to `state_changed` events
6. Emit initial state for each device via Socket.IO

### Caching Strategy

**State Cache:**
- Key: Device ID (e.g., `ha_light.living_room`)
- Value: `{ state, expiry }`
- TTL: 5 seconds
- Invalidation: On state change events, after control actions

**Device List Cache:**
- Stores entire device list
- TTL: 30 seconds
- Reduces repeated API calls for device discovery

### WebSocket Integration
1. Connect to `ws://localhost:8123/api/websocket`
2. Authenticate with bearer token
3. Subscribe to `state_changed` events
4. On event: invalidate cache, emit Socket.IO update

### State Normalization
```javascript
{
  id: "ha_light.bedroom",
  name: "Bedroom Light",
  type: "light",
  on: true,
  brightness: 75,  // 0-100 scale
  hs_color: [120, 50],  // Hue, Saturation
  attributes: { /* raw HA attributes */ }
}
```

---

## Socket Handlers

### Event Handlers

**Client → Server:**
- `device-toggle` – Toggle device on/off
- `set-ha-token` – Update HA token from client
- `request-forecast` – Request 5-day weather forecast
- `log` – Forward client-side logs to server
- `subscribe-logs` – Stream server logs to client

**Server → Client:**
- `device-state-update` – Individual device state changed
- `device-list-update` – Full device list refresh
- `weather-update` – Current weather data
- `forecast-update` – 5-day forecast data
- `log` – Server log entry (if subscribed)

### Device List Update Logic
```javascript
After manager initialization:
1. Fetch devices from all managers
2. For Kasa plugs: extract energyUsage from device object
3. For HA devices: extract power from attributes
4. Emit unified device list with power data
```

---

## Custom Nodes System

### LiteGraph Node Structure
```javascript
function MyCustomNode() {
  this.addInput("trigger", "boolean");
  this.addOutput("result", "number");
  this.properties = { value: 0 };
}

MyCustomNode.prototype.onExecute = function() {
  const trigger = this.getInputData(0);
  if (trigger) {
    this.setOutputData(0, this.properties.value);
  }
};

LiteGraph.registerNodeType("category/MyCustomNode", MyCustomNode);
```

### Node Categories

**Lighting Nodes:**
- `HALightControlNode` – Control Home Assistant lights
- `HueLightControlNode` – Control Philips Hue lights
- `KasaLightControlNode` – Control Kasa smart bulbs
- `ShellyDeviceContainerNode` – Shelly device wrapper

**Logic Nodes:**
- `AndNode`, `OrNode`, `NotNode`, `NorNode` – Boolean logic
- `ComparisonNode`, `GreaterThanNode`, `LessThanNode` – Comparisons
- `IfThenNode`, `ChooseNode` – Conditional branching
- `TimeRangeNode`, `DateComparisonNode` – Time-based logic

**Timer Nodes:**
- `SunriseSunsetTrigger` – Trigger at sun events
- `TimeOfDayNode` – Time-based triggers
- `DelayTriggerNode` – Delayed execution
- `Timer` – Interval-based triggers

**Utility Nodes:**
- `SenderNode`, `ReceiverNode` – Wireless connections
- `PassThroughNode` – Data passthrough
- `DisplayNode` – Value display
- `PushButtonNode` – Manual trigger

**Color Control Nodes:**
- `HSVModifierNode` – HSV color manipulation
- `BrightnessAdjustNode` – Brightness control
- `AllInOneColorControl` – Unified color interface
- `ColorGradientNode` – Gradient generation

---

## Energy Display System

### Core Function
```javascript
function getPowerFromDevice(device) {
  // Kasa plugs
  if (device.id?.startsWith('kasa_') && device.energyUsage) {
    return device.energyUsage.power_mw / 1000;
  }
  
  // Shelly devices
  if (device.id?.startsWith('shellyplus1-') && device.power !== undefined) {
    return device.power;
  }
  
  // Home Assistant entities
  if (device.id?.startsWith('ha_') && device.attributes) {
    return parseFloat(device.attributes.current_power_w) || 0;
  }
  
  return 0;
}
```

### Display Logic
1. Listen for `device-list-update` events
2. Iterate through all devices
3. Extract power consumption using `getPowerFromDevice`
4. Sum total power
5. Count active devices (power > 0)
6. Update UI with formatted values

---

## Data Flow Diagrams

### Device Control Flow
```
User clicks node → LiteGraph executes → Socket.IO emit 'device-toggle'
  → Server validates → DeviceService.controlDevice()
  → Manager.controlDevice() → Device API (HTTP/WebSocket)
  → Device responds → Manager invalidates cache
  → WebSocket event → Server emits 'device-state-update'
  → Frontend updates node visual state
```

### Real-time Update Flow
```
Physical switch toggled → Device API state change
  → HA WebSocket event → Manager receives event
  → Manager invalidates cache → Emit 'device-state-update'
  → Frontend receives update → Update LiteGraph node
  → Update device list UI → Update energy display
```

### Weather Update Flow
```
Server startup → Fetch initial weather → Emit to all clients
  → Every 3 minutes: Fetch updated weather
  → Compare with last update → If changed, emit update
  → Frontend updates weather banner
```

---

## Developer Guide

### Adding a New Device Manager

1. Create `src/devices/managers/myDeviceManager.js`:
```javascript
class MyDeviceManager {
  constructor() {
    this.devices = [];
  }
  
  async initialize(io, notificationEmitter, log) {
    // Discover devices
    // Set up real-time listeners
    // Emit initial states
  }
  
  async controlDevice(deviceId, state) {
    // Send command to device API
    // Return { success: true/false }
  }
  
  getDevices() {
    // Return device array
  }
  
  shutdown() {
    // Cleanup
  }
}

module.exports = {
  name: 'MyDevice',
  type: 'light',
  prefix: 'mydevice_',
  initialize: (io, notif, log) => instance.initialize(io, notif, log),
  controlDevice: (id, state) => instance.controlDevice(id, state),
  getDevices: () => instance.getDevices(),
  shutdown: () => instance.shutdown()
};
```

2. Create `src/api/routes/myDeviceRoutes.js`:
```javascript
const express = require('express');
const router = express.Router();

module.exports = (io, deviceService) => {
  router.get('/devices', async (req, res) => {
    // Return device list
  });
  
  router.post('/:id/control', async (req, res) => {
    // Control device
  });
  
  return router;
};
```

3. Update `src/devices/pluginLoader.js` route mapping (if needed)
4. Add environment variables to `.env`

**No core file modifications required!**

### Adding a Custom Frontend Node

1. Create `src/frontend/custom_nodes/MyCategory/MyNode.js`:
```javascript
function MyCustomNode() {
  this.addInput("in", "number");
  this.addOutput("out", "number");
  this.properties = { multiplier: 2 };
}

MyCustomNode.prototype.onExecute = function() {
  const input = this.getInputData(0) || 0;
  this.setOutputData(0, input * this.properties.multiplier);
};

LiteGraph.registerNodeType("MyCategory/MyCustomNode", MyCustomNode);
```

2. Add script tag to `src/frontend/index.html`:
```html
<script src="custom_nodes/MyCategory/MyNode.js"></script>
```

**Node will be automatically available in LiteGraph!**

---

## Troubleshooting

### Common Issues

**"Cannot connect to Home Assistant"**
- Check `HA_HOST` and `HA_TOKEN` in `.env`
- Verify HA is running and accessible
- Check firewall/network settings

**"Devices not appearing"**
- Check manager initialization logs
- Verify device API credentials
- Check device compatibility (light/switch entities)

**"High CPU usage"**
- Check cache TTL settings
- Review log spam (adjust log levels)
- Monitor WebSocket connection count

**"Frontend not updating"**
- Check Socket.IO connection status
- Verify browser console for errors
- Check CORS configuration

---

## Future Enhancements

### Planned Features
- Matter protocol support (matterRoutes.js stub exists)
- Automated testing suite
- Plugin marketplace
- Mobile app (React Native)
- Voice control integration
- Machine learning for automation suggestions

### Architecture Improvements
- Microservices separation
- Redis caching layer
- GraphQL API option
- TypeScript migration
- Docker containerization
