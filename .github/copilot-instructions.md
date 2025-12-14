# T2AutoTron 2.1 - AI Coding Instructions

## Recent Context Menu & UX Polish (2025-12-13)

Major cleanup of the plugin context menu system and UX improvements:

### Category Reorganization
- **Renamed**: `CC_Control_Nodes` → `Color` (clearer purpose)
- **Renamed**: `Other` + `Plugs` → `Direct Devices` (Kasa/Hue direct control)
- **Deleted POC nodes**: `SplineHueCurveNode.js`, `TestPluginNode.js`
- **Renamed**: `PushbuttonNode` → `Toggle` (latch mode is default behavior)

### Context Menu Icons
Added emoji icons to category headers in the context menu:
- Icons defined in `00_SharedControlsPlugin.js` as `THEME.categories`
- Looked up in `Editor.jsx` via `window.T2Controls?.THEME?.categories`
- Displayed in `FastContextMenu.jsx` with `.menu-icon` CSS class

**Category → Icon mapping:**
```javascript
'Home Assistant': { icon: '🏠' },
'Logic': { icon: '🔀' },
'Timer/Event': { icon: '⏱️' },
'Color': { icon: '🎨' },
'Utility': { icon: '🔧' },
'Inputs': { icon: '📥' },
'Direct Devices': { icon: '💡' }
```

### Dynamic Node Height Fix
`HAGenericDeviceNode` wasn't expanding when devices were added:
- Removed `max-height: 400px` constraint from `node-styles.css`
- Added dynamic height calculation: `this.height = BASE_HEIGHT + (deviceCount * HEIGHT_PER_DEVICE)`
- `updateHeight()` called in `onAddDevice`, `onRemoveDevice`, `restore`

### Lasso Selection Offset Fix
Selection box was offset after Favorites panel was added:
- Added `position: relative` to `.rete-editor` in `App.css`

### Starter Example Graph (IN PROGRESS)
Adding a pre-built example graph for first-time users:
- **API endpoint**: `GET /api/examples/starter` in `server.js`
- **Graph file**: `backend/examples/starter_graph.json`
- **UI button**: "📚 Load Example" in Dock.jsx
- **Handler**: `handleLoadExample` in Editor.jsx
- **Status**: Endpoint returning 500 error - needs debugging

**Files modified this session:**
- `v3_migration/backend/plugins/00_SharedControlsPlugin.js` - Category themes with icons
- `v3_migration/backend/plugins/*.js` - 8 plugins updated with new categories
- `v3_migration/frontend/src/Editor.jsx` - Icon lookup, handleLoadExample
- `v3_migration/frontend/src/FastContextMenu.jsx` - Icon display
- `v3_migration/frontend/src/FastContextMenu.css` - .menu-icon styling
- `v3_migration/frontend/src/styles/node-styles.css` - Removed max-height
- `v3_migration/frontend/src/App.css` - Added position: relative
- `v3_migration/frontend/src/ui/Dock.jsx` - Load Example button
- `v3_migration/backend/src/server.js` - /api/examples/starter endpoint

---

## Recent Crash Detection & Logging Work (2025-12-13)

Added crash detection and log management to diagnose overnight Electron crashes:

- **Crash Detection**
    - Session marker file (`.running`) created on startup, removed on clean shutdown
    - If marker exists on startup → previous session crashed
    - Crash info logged to `crash_history.log` with uptime estimate
- **Log Rotation**
    - `main.log` now rotates at 10MB to prevent disk bloat
    - Previous 213MB log was causing potential I/O issues
- **Exception Logging**
    - Uncaught exceptions logged with full stack trace
    - Unhandled promise rejections captured

Key files in `v3_migration/crashes/`:
- `main.log` - Regular logs (10MB rotation)
- `crash_history.log` - Only crash events (check after overnight crashes)
- `last_session.json` - Info about most recent session
- `.running` - Marker file (exists only while app is running)

Implementation: `v3_migration/backend/src/frontend/electron/main.js`

## Recent Security Work (2025-12-12)

This repo now has a lightweight, LAN-friendly security model for sensitive actions:

- **PIN auth**
    - Server PIN comes from `APP_PIN` (stored in `v3_migration/backend/.env`).
    - Users can set it via **Settings → Security (This Device)**; the UI persists it to the server via `/api/settings` (no manual `.env` edits required).
    - Frontend stores the PIN in `sessionStorage` by default, or `localStorage` when "Remember" is enabled.
- **Sensitive REST endpoints are protected by "local OR PIN"**
    - Middleware: `v3_migration/backend/src/api/middleware/requireLocalOrPin.js`
    - Accepts `X-APP-PIN: <pin>` or `Authorization: Bearer <pin>`; loopback is always allowed.
- **Socket.IO auth**
    - Client emits `authenticate` after connect if a PIN is saved.
    - Server validates and emits `auth-success` / `auth-failed`.
- **Secrets masking**
    - `/api/settings` masks secret values as `********` and saving `********` means "no change".

Key files:
- Frontend auth helper: `v3_migration/frontend/src/auth/authClient.js`
- PIN UI: `v3_migration/frontend/src/ui/SettingsModal.jsx`
- Authenticated fetch usage: `SettingsModal.jsx`, `ui/Dock.jsx`, `components/UpdateModal.jsx`
- Socket auto-auth/toasts: `v3_migration/frontend/src/App.jsx`
- Socket client URL defaults: `v3_migration/frontend/src/socket.js` (defaults to `window.location.origin` unless `VITE_API_URL` is set)
- Settings API + `.env` write: `v3_migration/backend/src/server.js` (allowlists `APP_PIN`)

Follow-ups are tracked in: `v3_migration/SECURITY_PUNCHLIST.md`.

## Architecture Overview

T2AutoTron is a **visual node-based automation editor** for smart home control. Built with:
- **Frontend**: React + Vite + Rete.js v3 (visual node editor)
- **Backend**: Node.js/Express + Socket.IO for real-time device communication
- **Plugin System**: Runtime-loaded node plugins (no rebuild required)

### Deployment Modes

T2AutoTron runs in two different environments with important behavioral differences:

| Feature | Desktop/Electron | Home Assistant Add-on |
|---------|-----------------|----------------------|
| **Environment** | Windows/Mac/Linux desktop app | Docker container in HA |
| **Detection** | `!process.env.SUPERVISOR_TOKEN` | `process.env.SUPERVISOR_TOKEN` exists |
| **Frontend Detection** | URL doesn't contain ingress path | URL contains `/api/hassio/ingress/` |
| **Updates** | Git-based (`git pull` from stable) | HA Supervisor manages updates |
| **Update Toast** | Shows "Update Available" with apply option | Hidden - shows "Update via HA" button |
| **Config Path** | `./env` (relative) | `/data/.env` (Docker volume) |
| **Data Persistence** | Local filesystem | `/data/` volume mount |

**⚠️ CRITICAL**: Never implement git-based update features that assume the add-on has a `.git` folder or can run `npm install`. The Docker container is built from a Dockerfile and has no git history.

**Key Detection Code:**
```javascript
// Backend (server.js)
const IS_HA_ADDON = !!process.env.SUPERVISOR_TOKEN;

// Frontend (Dock.jsx)  
const IS_HA_ADDON = window.location.pathname.includes('/api/hassio/ingress/');
```

**Files with environment-specific behavior:**
- `backend/src/server.js` - Skips update checks when `IS_HA_ADDON`
- `frontend/src/ui/Dock.jsx` - Shows different update button for add-on users

### Supported Devices
- **Home Assistant** – All entities (lights, switches, sensors, media players, etc.)
- **Philips Hue** – Direct bridge API (no HA required)
- **TP-Link Kasa** – Direct local API (no HA required)
- **Shelly** – Via Home Assistant integration (direct API planned)

### Key Directories
```
v3_migration/
├── backend/
│   ├── plugins/        ← ALL node plugins go here (NOT frontend/src/nodes/)
│   ├── src/server.js   ← Express + Socket.IO server
│   ├── src/api/        ← REST API routes
│   └── .env            ← Environment config (see below)
└── frontend/
    ├── src/Editor.jsx  ← Core Rete.js editor (PROTECTED)
    ├── src/registries/ ← NodeRegistry + PluginLoader
    └── src/sockets.js  ← Socket type definitions with connection patch
```

## Environment Configuration

Create `v3_migration/backend/.env` with (the Settings UI can create/manage this file too):
```env
APP_PIN=change_me

HA_HOST=http://homeassistant.local:8123
HA_TOKEN=your_long_lived_access_token
OPENWEATHERMAP_API_KEY=your_api_key
HUE_BRIDGE_IP=192.168.x.x
HUE_USERNAME=your_hue_username
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id

# Debug mode - set to true for verbose server logging
VERBOSE_LOGGING=false
```

## Debug Logging

Debug logging is **disabled by default**. To enable verbose logging:

**Backend (server.js):** Set `VERBOSE_LOGGING=true` in `.env`
**Frontend (Editor.jsx):** Set `EDITOR_DEBUG = true` at top of file
**Frontend (sockets.js):** Set `SOCKET_DEBUG = true` at top of file
**Plugins:** Use `this.properties.debug = true` per-node

## Device ID Prefixes

All device IDs use prefixes to identify their source system:
- `ha_` → Home Assistant entities (e.g., `ha_light.living_room`)
- `kasa_` → TP-Link Kasa devices
- `hue_` → Philips Hue lights
- `shelly_` → Shelly devices

The `T2HAUtils.getDeviceApiInfo(id)` helper parses these prefixes to route API calls correctly.

## Plugin Development (CRITICAL)

### Where to Create Nodes
- ✅ **CREATE** plugins in `backend/plugins/NodeName.js`
- ❌ **NEVER** create nodes in `frontend/src/nodes/` (deprecated)

### Plugin File Structure
Plugins use IIFE pattern with `React.createElement()` (not JSX):
```javascript
(function() {
    // 1. Check dependencies
    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets) return;
    
    // 2. Get globals
    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect } = React;
    
    // 3. Define Node class extending ClassicPreset.Node
    class MyNode extends ClassicPreset.Node { /* ... */ }
    
    // 4. Define React component using React.createElement()
    function MyNodeComponent({ data, emit }) { /* ... */ }
    
    // 5. Register with window.nodeRegistry
    window.nodeRegistry.register('MyNode', {
        label: "My Node",
        category: "Category",  // See categories below
        nodeClass: MyNode,
        component: MyNodeComponent,
        factory: (cb) => new MyNode(cb)
    });
})();
```

### Editable Node Titles (UI Pattern)

Some nodes support an editable title in the node header (double-click to edit). Two common patterns exist:

- **Use `properties.customName` when the node already has a “Name” field** (e.g. timer/scheduler nodes). The header can simply display `customName || data.label`.
- **Use `properties.customTitle` when you want a title that is separate from other naming fields** (example: `HAGenericDeviceNode.js`).

Implementation notes:
- Render the title as text; on `onDoubleClick`, swap to an `<input>`.
- On the `<input>`, use `onPointerDown={(e) => e.stopPropagation()}` so editing doesn’t drag the node.
- Commit on blur/Enter; cancel on Escape (restore previous title).
- Ensure the chosen property is included in `serialize()`/`restore()` so the title persists across save/load.

### Infrastructure Plugins (00_ prefix)
Files prefixed with `00_` load first and provide shared utilities:
- `00_BaseNodePlugin.js` → `window.T2Node` base class
- `00_SharedControlsPlugin.js` → `window.T2Controls` (buttons, dropdowns, HelpIcon, NodeHeader, etc.)
- `00_HABasePlugin.js` → `window.T2HAUtils` (Home Assistant helpers)
- `00_ColorUtilsPlugin.js` → `window.ColorUtils` (color conversion)
- `00_NodeComponentsPlugin.js` → Shared node UI component utilities
- `00_LogicGateBasePlugin.js` → `window.LogicGateBase` base class for logic gates

### Socket Types
Access via `window.sockets`: `boolean`, `number`, `object`, `lightInfo`, `any`

### Socket Styling (CSS)
Sockets are styled via CSS using `data-socket-type` attribute set by `CustomSocket` in `Editor.jsx`.

**Semantic type detection** (based on socket key name):
- Keys containing `hsv` or `color` → `hsv_info` (purple)
- Keys containing `trigger`, `enable`, `active` → `boolean` (green)
- Keys containing `light`, `device` → `light_info` (gold)
- All others use the socket's actual type name

**CSS Variables** (customizable in Settings → Socket Colors):
- `--socket-boolean-color`, `--socket-boolean-dark`, `--socket-boolean-border`
- `--socket-number-color`, `--socket-number-dark`, `--socket-number-border`
- `--socket-object-color`, `--socket-object-dark`, `--socket-object-border`
- `--socket-hsv-color`, `--socket-hsv-dark`, `--socket-hsv-border`
- `--socket-light-color`, `--socket-light-dark`, `--socket-light-border`

**Files involved:**
- `frontend/src/Editor.jsx` → `CustomSocket` component sets `data-socket-type`
- `frontend/src/App.css` → Socket color styles (lines 590-760)
- `frontend/src/ui/SettingsModal.jsx` → Socket Colors settings panel

### Node Categories
`"Home Assistant"`, `"Logic"`, `"Timer/Event"`, `"Color"`, `"Utility"`, `"Inputs"`, `"Direct Devices"`

**Note**: `CC_Control_Nodes` and `Other` are deprecated - use `Color` or `Direct Devices` instead.

### AutoTronBuffer (Inter-Node Communication)
Nodes can share values via `window.AutoTronBuffer` - a global key-value store for cross-node communication:

```javascript
// Writing to buffer (typically in WriteBufferNode or similar)
window.AutoTronBuffer.set('[Trigger] MyTrigger', true);
window.AutoTronBuffer.set('[HSV] MyColor', { hue: 0.5, saturation: 1, brightness: 254 });

// Reading from buffer (in any node)
const value = window.AutoTronBuffer.get('[Trigger] MyTrigger');
const hsvValue = window.AutoTronBuffer.get('[HSV] MyColor');

// List available buffers (for dropdown population)
const allBuffers = window.AutoTronBuffer.keys(); // Returns array of all buffer names
```

**Buffer Naming Conventions:**
- `[Trigger] Name` → Boolean triggers (on/off signals)
- `[HSV] Name` → HSV color objects `{ hue: 0-1, saturation: 0-1, brightness: 0-254 }`
- `[Value] Name` → Numeric values
- `[Object] Name` → Generic objects

Buffers persist across graph execution cycles, enabling state sharing between disconnected nodes.

## Node Design Philosophy (Node-RED Style)

Follow Node-RED conventions for consistent, predictable behavior:

### 1. Pass Values Through, Don't Pulse
Nodes should pass their input values through unchanged, not generate pulses:
```javascript
// ❌ WRONG - Pulse behavior (auto-resets)
// Input: true → [delay] → Output: true for 100ms → Output: false

// ✅ CORRECT - Pass-through behavior (Node-RED style)
// Input: true → [delay] → Output: true (stays true)
// Input: false → [delay] → Output: false (stays false)
// Input: "hello" → [delay] → Output: "hello"
```

### 2. Delay Nodes
- **Delay**: Wait X time, then pass the value through unchanged
- **Debounce**: Reset timer on each input, fire after silence period
- **Throttle**: Allow max one message per time period
- **Retriggerable**: Output ON immediately, restart off-timer on each trigger

Each mode should pass the **actual value** through, not just generate a boolean pulse.

### 3. Message Independence
Each input is treated independently - a delay node doesn't "remember" or combine messages. Whatever comes in, goes out (after delay).

### 4. Output Latching
Outputs should **stay** at their last value until a new input changes them. No auto-reset unless explicitly designed as a pulse/trigger node.

### 5. Status Indicators (Node-RED Style)
Add a small colored status dot in the node header to show current state:

```javascript
// Determine status
let statusColor = '#888';  // gray = idle/no input
let statusText = 'Idle';

if (isOverrideActive) {
    statusColor = '#ff9800';  // orange = override/special mode
    statusText = 'Override';
} else if (hasInput) {
    statusColor = '#4caf50';  // green = processing
    statusText = 'Active';
} else if (hasError) {
    statusColor = '#f44336';  // red = error
    statusText = 'Error';
}

// Render in header
React.createElement('div', {
    title: statusText,
    style: {
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        backgroundColor: statusColor,
        boxShadow: `0 0 4px ${statusColor}`,
        transition: 'background-color 0.3s'
    }
})
```

**Standard Status Colors:**
- ⚪ Gray (`#888`) - Idle, no input, waiting
- 🟢 Green (`#4caf50`) - Active, processing, connected
- 🟠 Orange (`#ff9800`) - Override active, special mode
- 🔴 Red (`#f44336`) - Error, disconnected
- 🔵 Blue (`#2196f3`) - Triggered, one-shot active

## Tooltips & User Help

All nodes should include tooltips for better user experience. Use the shared tooltip components from `window.T2Controls`:

### Tooltip Components Available
- `NodeHeader` - Header with icon, title, and node-level tooltip (? icon)
- `HelpIcon` - Small "?" icon that shows tooltip on hover
- `LabeledRow` - Label + control + optional help icon
- `Tooltip` - Wrap any element to add tooltip on hover

### Tooltip Data Structure
Define all tooltips in one place for easy maintenance:
```javascript
const tooltips = {
    node: "Overall node description - what it does and when to use it.",
    inputs: {
        trigger: "What this input expects and how it's used.",
        value: "Optional input description."
    },
    outputs: {
        result: "What this output produces."
    },
    controls: {
        mode: "What each option does.",
        time: "Parameter description with examples."
    }
};
```

### Usage Example
```javascript
// Get tooltip components
const { NodeHeader, HelpIcon } = window.T2Controls || {};

// Node header with tooltip
NodeHeader && React.createElement(NodeHeader, {
    icon: '⏱️',
    title: 'Delay',
    tooltip: tooltips.node,
    statusDot: true,
    statusColor: isActive ? '#ffaa00' : '#555'
})

// Add help icon next to any label
React.createElement('div', { style: { display: 'flex', alignItems: 'center' } }, [
    React.createElement('span', {}, 'Mode'),
    HelpIcon && React.createElement(HelpIcon, { text: tooltips.controls.mode, size: 12 })
])

// Or use native title attribute for simple tooltips
React.createElement('button', { title: "Click to trigger manually" }, 'Trigger')
```

## Critical Rete.js Patterns

### 1. Socket Rendering - Never Wrap RefComponent
```javascript
// ❌ WRONG - breaks socket connections
<div className="wrapper"><RefComponent ... /></div>

// ✅ CORRECT - render directly
<RefComponent init={ref => emit({type:"render", data:{...}})} />
```

### 2. Preserve changeCallback Chain
```javascript
useEffect(() => {
    const originalCallback = data.changeCallback;  // Save original
    data.changeCallback = () => {
        setLocalState(data.properties.value);
        if (originalCallback) originalCallback();  // MUST call original
    };
    return () => { data.changeCallback = originalCallback; };
}, [data]);
```

### 3. Event Propagation
- Use `onPointerDown={(e) => e.stopPropagation()}` on interactive controls (sliders, buttons)
- **Do NOT** use on socket containers (blocks wire connections)

### 4. Never Call changeCallback Inside data()
```javascript
// ❌ WRONG - causes engine.reset() mid-fetch, cancels other nodes
data(inputs) {
    // ... calculate output ...
    if (this.changeCallback) this.changeCallback(); // BAD!
    return output;
}

// ✅ CORRECT - data() should be pure, only calculate and return
data(inputs) {
    // ... calculate output ...
    this.properties.someValue = calculatedValue; // Store for UI sync
    return output; // Just return, no side effects
}
```
The `data()` method is called by the DataflowEngine during graph processing. Calling `changeCallback()` inside it triggers `engine.reset()` which cancels remaining node fetches, causing only the first node to work.

## Development Commands

```bash
# Start backend (port 3000)
cd v3_migration/backend && npm start

# Start frontend dev server (port 5173, proxies to backend)
cd v3_migration/frontend && npm run dev -- --force

# Run tests (Jest)
cd v3_migration/backend && npm test

# Build frontend for production
cd v3_migration/frontend && npm run build
# Copy dist/* to backend/frontend/
```

### Common Issues
- **Port 3000 in use**: Kill node processes before starting
- **Vite cache issues**: Delete `frontend/node_modules/.vite`
- **Plugins not loading**: Check browser console for registration errors; verify `00_*` files load first
- **Pan/Zoom frozen after load**: Press **F5** to reset editor view (auto-resets on graph load)
- **HA 401 Unauthorized**: Update token in Settings panel → Test Connection (token refreshes immediately)

## API Endpoints

- `GET /api/plugins` → List available plugin files
- `GET /api/devices` → All devices (HA, Kasa, Hue, Shelly)
- `POST /api/lights/{type}` → Control device (type: ha, kasa, hue, shelly)
- `GET /api/weather` → Current weather data
- `POST /api/settings/test` → Test API connection (ha, weather, hue, telegram)
- `GET /api/examples/starter` → Fetch starter example graph for new users

## Real-time Communication

Socket.IO events (via `window.socket`):
- `request-ha-status` → Get HA connection status
- `request-weather-update` → Fetch current weather
- `device-state-update` → Real-time device state changes
- `ha-connection-status` → HA WebSocket status

## Testing

Tests are in `v3_migration/backend/tests/` using Jest:
```javascript
// Example: ColorUtils.test.js
const ColorUtils = require('./utils/ColorUtils');
describe('ColorUtils', () => {
    test('converts RGB to HSV', () => { /* ... */ });
});
```

## Graph Serialization

Nodes must implement serialization for save/load:
```javascript
class MyNode extends ClassicPreset.Node {
    constructor(changeCallback) {
        super("My Node");
        this.properties = { value: 0 };  // State to persist
    }
    
    // Called when loading a saved graph
    restore(state) {
        if (state.properties) {
            Object.assign(this.properties, state.properties);
        }
    }
    
    // Optional: custom serialization (default copies properties)
    serialize() {
        return { ...this.properties };
    }
}
```

Graphs are saved to `v3_migration/Saved_Graphs/` as JSON files containing node positions, properties, and connections.

## Key Documentation
- `v3_migration/PLUGIN_ARCHITECTURE.md` - Full plugin system guide
- `v3_migration/frontend/RETE_NODE_GUIDE.md` - Rete.js node patterns
- `v3_migration/backend/src/engine/BACKEND_ENGINE_PLAN.md` - Backend engine architecture
- `README.md` - Feature overview and API reference

---

## Backend Engine (Server-Side Automation) - 2025-12-13

**Branch**: `feature/backend-engine` (10 commits, ready to merge after testing)

### 🎯 WHY: The Core Problem

T2AutoTron currently runs automations **in the browser** using Rete.js DataflowEngine. This works great for:
- Desktop Electron app (always open)
- Development/testing

But it **completely breaks** for the Home Assistant Add-on use case:
- User opens HA dashboard → automations run
- User closes browser tab → **all automations stop**
- User's lights, schedules, and color timelines stop working

**This is unacceptable for production home automation.** Users expect automations to run 24/7.

### 🏗️ The Solution: Backend Engine

Move automation execution from browser → server. The backend engine:
1. **Runs continuously** on the Node.js server (inside Docker for HA add-on)
2. **Processes the same graph format** as the frontend editor
3. **Uses existing device managers** (HA, Hue, Kasa) for device control
4. **Frontend becomes optional** - just for editing, not execution

### 📊 Architecture Change

**Before (Browser-Dependent):**
```
[Browser/Electron] ←→ [Rete.js Engine] ←→ [Socket.IO] ←→ [Server] ←→ [Devices]
       ↑ REQUIRED for automation to run
```

**After (Server-Independent):**
```
[Browser/Electron] ←→ [Editor UI Only] ←→ [Socket.IO] ←→ [Server + Backend Engine] ←→ [Devices]
       ↑ Optional - only needed for editing              ↑ Runs 24/7 independently
```

### 🔌 How It Fits Together

1. **User edits graph** in browser using Rete.js editor (unchanged)
2. **User saves graph** → saved to `Saved_Graphs/` as JSON
3. **Graph is loaded into backend engine** via `/api/engine/load`
4. **Engine runs in 100ms tick loop** on server, processing nodes and controlling devices
5. **User can close browser** → automations keep running
6. **User reopens browser** → sees live engine status, can edit graph

### 🐳 Home Assistant Add-on Flow

```
HA Add-on Container (Docker)
├── Node.js Server (port 3000)
│   ├── Backend Engine ← Runs automations 24/7
│   ├── REST API ← Graph management, device control
│   ├── Socket.IO ← Real-time updates to frontend
│   └── Device Managers ← HA, Hue, Kasa, Shelly
└── Frontend (served as static files)
    └── Rete.js Editor ← User opens in HA iframe/panel
```

When user installs the add-on:
1. Container starts → server starts → engine loads last graph → automations run
2. User never needs to open the UI for automations to work
3. UI is only for creating/editing automation graphs

### 📁 File Structure
```
backend/src/engine/
├── BackendEngine.js      # Main engine - 100ms tick loop, graph processing
├── BackendNodeRegistry.js # Node type registry with create() factory
├── index.js              # Exports engine singleton + registry
└── nodes/                # Backend node implementations
    ├── TimeNodes.js      # CurrentTime, TimeRange, DayOfWeek, SunPosition
    ├── LogicNodes.js     # AND, OR, NOT, Compare, Switch, Threshold, Latch, Toggle
    ├── DelayNode.js      # Delay, Debounce, Retriggerable modes
    ├── HADeviceNodes.js  # HALight, HASwitch, HASensor, HAClimate, HAMediaPlayer
    ├── HueLightNodes.js  # HueLight, HueGroup (direct bridge API)
    ├── KasaLightNodes.js # KasaLight, KasaPlug (direct local API)
    └── ColorNodes.js     # SplineTimelineColor, HSVToRGB, RGBToHSV, ColorMixer
```

### API Endpoints
All at `/api/engine/*`:
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/status` | GET | Engine state: running, tickCount, nodeCount, uptime |
| `/start` | POST | Start the engine tick loop |
| `/stop` | POST | Stop the engine |
| `/load` | POST | Load a graph JSON into the engine |
| `/nodes` | GET | List all nodes with current output values |
| `/outputs` | GET | Get outputs for specific node by ID |
| `/tick` | POST | Execute single manual tick (for debugging) |

### Socket.IO Events
- `engine-status` - Emitted every 5 seconds when running (running, tickCount, nodeCount)
- `request-engine-status` - Client can request immediate status update

### Frontend Integration
- **Dock.jsx**: Engine status indicator (green=running, gray=stopped) + Start/Stop toggle button
- Socket listener for `engine-status` updates state automatically
- CSS class `.dock-btn-active` for running state styling

### Graph Format
Engine accepts the same graph JSON format as frontend save/load:
```javascript
{
  nodes: [
    { id: "node_1", name: "CurrentTimeNode", position: [x, y], properties: {...} },
    { id: "node_2", name: "HALightNode", position: [x, y], properties: { deviceId: "ha_light.living_room" } }
  ],
  connections: [
    { source: "node_1", sourceOutput: "hour", target: "node_2", targetInput: "brightness" }
  ]
}
```

### Key Implementation Notes
1. **Node Registration**: Backend nodes use `BackendNodeRegistry.register(name, nodeClass)`
2. **Device Managers**: Engine nodes access existing managers via `require('../../devices/managers/...')`
3. **Lazy Loading**: `engineRoutes.js` uses lazy `require()` to avoid circular dependencies
4. **Path Note**: Routes are at `src/api/routes/`, engine at `src/engine/` - use `../../engine` not `../engine`

### Current Status (as of 2025-12-13)
- ✅ All 5 phases complete (Core, Devices, Colors, API, UI)
- ✅ 27 node types registered
- ✅ All 71 tests pass
- 🔴 **Issue**: Server crashes on startup with exit code 1 (Kasa TCP errors from offline devices)
- 🔧 **Fix applied**: Added error handlers to `kasaManager.js`, needs testing

### Testing the Engine
```bash
# Start server
cd v3_migration/backend && npm start

# Test API (PowerShell)
Invoke-RestMethod -Uri "http://localhost:3000/api/engine/status"

# Expected response when working:
{ "running": false, "tickCount": 0, "nodeCount": 0, "uptime": 0 }
```

---

## Beta Release Status

**Current Version: 2.1.13 | Status: Beta-Ready! 🎉**

### ✅ COMPLETED - Critical Items

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Debug console logging | ✅ Done | All logs gated by `VERBOSE_LOGGING` env var (backend) or `EDITOR_DEBUG`/`SOCKET_DEBUG` flags (frontend) |
| 2 | Clean build artifacts | ✅ Done | Only 1-2 files in assets/ |
| 3 | Fix hardcoded HA URL | ✅ Done | Uses `process.env.HA_HOST` with fallback |
| 4 | Package.json metadata | ✅ Done | v2.1.0-beta.15, proper author/homepage/keywords |
| 5 | Error boundaries | ✅ Done | `ErrorBoundary.jsx` wraps App |
| 6 | Secure token storage | ✅ Done | Uses sessionStorage (falls back to localStorage) |

### ✅ COMPLETED - High Priority Items

| # | Task | Status | Notes |
|---|------|--------|-------|
| 7 | Loading states | ✅ Done | `LoadingOverlay.jsx` with progress bar |
| 8 | Toast notifications | ✅ Done | Full toast system (`Toast.jsx`), `window.T2Toast` for plugins |
| 9 | Plugin error handling | ✅ Done | Tracks `failedPlugins`, shows in UI |
| 10 | Getting Started guide | ✅ Done | `GETTING_STARTED.md` exists |
| 11 | Graph validation | ✅ Done | `graphValidation.js` with repair function |
| 12 | Auto-save | ✅ Done | Every 2 minutes, shows toast on save |

### 🟠 REMAINING - Nice to Have

| # | Task | Status | Effort |
|---|------|--------|--------|
| 1 | Add test coverage | ⏳ Not started | 8-12h |
| 2 | Modularize server.js | ⏳ Not started | 4h (working fine as-is) |
| 3 | Refactor plugins to T2Node | ⏳ Partial | Some use it, not all |

### 🟢 RECENTLY ADDED (beta.12 - beta.18)

| # | Feature | Notes |
|---|---------|-------|
| 1 | **Camera Panel** | Collapsible panel in Dock for IP camera streams (MJPEG/snapshot) |
| 2 | **Update System** | Auto-check for updates from `stable` branch, toast notifications, one-click apply |
| 3 | **Check for Updates Button** | Manual update check button in Control Panel Settings section |
| 4 | **Performance Mode** | Toggle in Settings to reduce GPU usage (disables blur, glow, animations) |
| 5 | **Graph Auto-Restore** | Graph saved before update, auto-restored after reload |
| 6 | **Sleep Prevention** | Electron app prevents Windows from suspending during sleep |
| 7 | **Toast Notification System** | Full toast system with `window.T2Toast` for plugins |
| 8 | **Favorites Panel** | Left-side panel: drag nodes to add; click to create; right-click to remove. Favorites grouped by context-menu category with dividers |
| 9 | **Dock Merge into Forecast** | Control Panel can merge below 5-day Forecast or pop back out; persisted to `localStorage` |
| 10 | **Context Menu Icons** | Category headers now show emoji icons (🏠 Home Assistant, 🔀 Logic, etc.) |
| 11 | **Category Reorganization** | Cleaner categories: CC_Control_Nodes → Color, Other/Plugs → Direct Devices |
| 12 | **Dynamic Node Height** | HAGenericDeviceNode now expands when devices are added |
| 13 | **Lasso Selection Fix** | Selection box offset corrected after Favorites panel addition |
| 14 | **Backend Engine** | Server-side automation engine for 24/7 execution (27 node types, REST API, Socket.IO) |

### 🟢 RECENTLY FIXED

| # | Fix | Notes |
|---|-----|-------|
| 1 | HA Token refresh | Settings panel now updates token immediately via `homeAssistantManager.updateConfig()` |
| 2 | Pan/Zoom freeze | F5 resets view; auto-reset on graph load via `graphLoadComplete` event |
| 3 | Reset performance | `resetEditorView()` uses `requestAnimationFrame` to avoid blocking (was 350ms+, now <16ms) |
| 4 | DeviceStateControl CSS | No longer injects CSS on every render (major performance fix) |
| 5 | Keyframe animations | Moved from dynamic injection to `node-styles.css` |
| 6 | HA Device Automation outputs | `data()` now pure (no changeCallback inside), always returns all dynamic outputs; uses `??` to preserve `false`/`0` |

### 🟢 POST-BETA / LOW PRIORITY

- Add TypeScript (gradual migration)
- Add Mobile-Responsive CSS
- Add Undo/Redo History (rete-history-plugin)
- Add Node Search in context menu
- Performance optimization
- Analytics/Telemetry (opt-in)

### 🔵 FUTURE NATIVE DEVICE SUPPORT

Additional local-API smart devices to support (no cloud required):

| Priority | Device | Protocol | npm Package | Notes |
|----------|--------|----------|-------------|-------|
| 1 | **LIFX** | UDP LAN (no hub) | `lifx-lan-client` | Excellent local API, no bridge needed |
| 2 | **Wiz (Philips)** | UDP local (port 38899) | `wiz-local-control` | Very affordable bulbs ($10-15) |
| 3 | **WLED** | REST API + WebSocket | Direct HTTP | DIY LED strips, huge community |
| 4 | **Yeelight (Xiaomi)** | TCP JSON | `yeelight2` | Enable "LAN Control" in app first |
| 5 | **Tuya/Smart Life** | TCP (needs keys) | `tuyapi` | Huge ecosystem, one-time key extraction |

**Implementation Pattern** (same as HueLightNode/KasaLightNode):
- Backend routes: `src/api/routes/{device}Routes.js`
- Device manager: `src/devices/managers/{device}Manager.js`
- Frontend plugin: `backend/plugins/{Device}LightNode.js`
- Settings panel: Add connection config to SettingsModal.jsx

---

### What's Working Well

- **Plugin System**: Runtime-loaded, no rebuild needed, error-tolerant
- **Real-time Updates**: Socket.IO for device state changes
- **Multi-Platform**: Home Assistant, Hue, Kasa, Shelly support
- **User Experience**: Loading overlay, toast notifications, auto-save
- **Developer Experience**: Debug flags per node, `window.T2Toast` for plugins
- **Stability**: Error boundaries prevent full crashes
- **Update System**: Auto-check from `stable` branch, preserves graph during updates
- **Performance Mode**: GPU-friendly option for complex graphs (40+ nodes)
- **Camera Integration**: IP camera panel with MJPEG/snapshot support

---

## Key UI Components

### Favorites Panel (FavoritesPanel.jsx)
Left-side panel for quick access to frequently-used nodes:
- **Drag-to-Add**: Drag any node onto the panel to add it to Favorites (node snaps back after drop).
- **Grouped by Category**: Dividers auto-generated per context-menu category (e.g., Home Assistant, Logic).
- **Click to Create**: Click a favorite to drop a new instance at canvas center.
- **Right-click to Remove**: Removes favorite from list.
- **Tooltip**: `?` icon explains usage.
- **Persistence**: Stored in `localStorage['favoriteNodes']` as `{ version: 2, groups: [{category, labels}] }`.

Files:
- `v3_migration/frontend/src/ui/FavoritesPanel.jsx`
- `v3_migration/frontend/src/ui/FavoritesPanel.css`
- State/logic in `v3_migration/frontend/src/Editor.jsx` (favoriteGroups, addFavoriteLabel, removeFavoriteLabel).

### Control Panel (Dock.jsx)
The right-side docked panel containing:
- **Graph Controls**: New, Save, Load, Load Example, Undo, Run buttons
- **Connection Status**: HA, Hue, Socket.IO indicators
- **Plugin Status**: Loaded/failed plugin count
- **Camera Panel**: Collapsible IP camera viewer (CameraPanel.jsx)
- **Settings Section**: Settings modal, Keyboard shortcuts, Check for Updates button
- **Merge/Pop-out**: Can merge into Forecast panel (below 5-day cards) or float independently; state persisted to `localStorage`.

### Settings Modal (SettingsModal.jsx)
Tabbed modal with:
- **Home Assistant**: URL, token, test connection
- **Philips Hue**: Bridge IP, username, test connection
- **Weather**: OpenWeatherMap API key
- **Telegram**: Bot token, chat ID
- **Cameras**: Add/edit/remove IP cameras
- **Performance Mode**: Toggle for reduced GPU usage
- **Socket Colors**: Customize socket type colors

### Update System (UpdateModal.jsx + UpdateChecker.jsx)
- `UpdateChecker.jsx`: Runs on app load, checks `stable` branch for new version
- `UpdateModal.jsx`: Shows update notification, handles apply with graph preservation
- Backend endpoint: `GET /api/update/check` returns version comparison
- Backend endpoint: `POST /api/update/apply` runs `git pull origin stable`

---

## Git Workflow & Branch Strategy

### Branch Structure

| Branch | Purpose | Merge Target |
|--------|---------|--------------|
| `main` | Primary development branch. All new features and fixes go here. | `stable` |
| `stable` | Production releases. Users pull updates from this branch. | — |

### Development Workflow

1. **Work on `main` branch** for new features and bug fixes.
2. **Test thoroughly** on `main` before pushing to `stable`.
3. **Push to `stable`** when ready for user deployment: `git push origin main:stable`

### Common Git Commands

```bash
# Check current branch
git branch

# Ensure on main for development
git checkout main

# Pull latest changes
git pull origin main

# Stage and commit changes
git add .
git commit -m "feat: Add new feature description"

# Push to main (development)
git push origin main

# Deploy to stable (production) - users get this via update check
git push origin main:stable
```

### Commit Message Conventions

Use conventional commit prefixes:
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `refactor:` - Code refactoring (no functional change)
- `style:` - Formatting, whitespace (no code change)
- `test:` - Adding or updating tests
- `chore:` - Build process, dependencies, config

**Examples:**
```
feat: Add Hue connection status to Control Panel
fix: Resolve pluginLoader.js syntax error
docs: Update copilot-instructions with Git workflow
refactor: Move socket handlers to separate module
```

### Handling Merge Conflicts

1. Pull both branches to ensure they're up to date
2. Attempt merge: `git merge sandbox` (from main)
3. If conflicts occur, resolve manually in VS Code
4. Stage resolved files: `git add <file>`
5. Complete merge: `git commit`

### Quick Reference

```bash
# Start new feature (from sandbox)
git checkout sandbox
git pull origin sandbox
# ... make changes ...
git add .
git commit -m "feat: Description"
git push origin sandbox

# Deploy to production
git checkout main
git merge sandbox
git push origin main
git checkout sandbox
```
