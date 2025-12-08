# T2AutoTron 2.1 - AI Coding Instructions

## Architecture Overview

T2AutoTron is a **visual node-based automation editor** for smart home control (Home Assistant, Philips Hue, Kasa, Shelly). Built with:
- **Frontend**: React + Vite + Rete.js v3 (visual node editor)
- **Backend**: Node.js/Express + Socket.IO for real-time device communication
- **Plugin System**: Runtime-loaded node plugins (no rebuild required)

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

Create `v3_migration/backend/.env` with:
```env
HA_URL=http://homeassistant.local:8123
HA_TOKEN=your_long_lived_access_token
OPENWEATHERMAP_API_KEY=your_api_key
HUE_BRIDGE_IP=192.168.x.x
HUE_USERNAME=your_hue_username
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
```

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

### Infrastructure Plugins (00_ prefix)
Files prefixed with `00_` load first and provide shared utilities:
- `00_BaseNodePlugin.js` → `window.T2Node` base class
- `00_SharedControlsPlugin.js` → `window.T2Controls` (buttons, dropdowns, etc.)
- `00_HABasePlugin.js` → `window.T2HAUtils` (Home Assistant helpers)
- `00_ColorUtilsPlugin.js` → `window.ColorUtils` (color conversion)

### Socket Types
Access via `window.sockets`: `boolean`, `number`, `object`, `lightInfo`, `any`

### Node Categories
`"Home Assistant"`, `"Logic"`, `"Timer/Event"`, `"CC_Control_Nodes"`, `"Color"`, `"Utility"`, `"Inputs"`, `"Other"`

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

### 4. Output Latching
Outputs should **stay** at their last value until a new input changes them. No auto-reset unless explicitly designed as a pulse/trigger node.

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

## API Endpoints

- `GET /api/plugins` → List available plugin files
- `GET /api/devices` → All devices (HA, Kasa, Hue, Shelly)
- `POST /api/lights/{type}` → Control device (type: ha, kasa, hue, shelly)
- `GET /api/weather` → Current weather data
- `POST /api/settings/test` → Test API connection (ha, weather, hue, telegram)

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
- `README.md` - Feature overview and API reference

---

## Beta Release TODO List

**Current Grade: C+ (65/100) | Target: B (Beta-ready)**

### 🔴 CRITICAL (Must Have for Beta)

#### 1. Remove Debug Console Logging
**Effort: 2-3 hours | Impact: High**

Every plugin spams the console with debug logs.

```
Tasks:
□ Create centralized logger utility with LOG_LEVEL support
□ Replace all console.log with conditional logging (debug flag check)
□ Keep console.error for actual errors only
□ Add environment variable: LOG_LEVEL=error|warn|info|debug
```

#### 2. Clean Up Build Artifacts
**Effort: 30 minutes | Impact: Medium**

15+ old `index-*.js` files in `backend/frontend/assets/`.

```
Tasks:
□ Delete all files in backend/frontend/assets/ except latest build
□ Add .gitignore rule for build hashes
□ Add npm script: "clean:build" to remove old artifacts
```

#### 3. Fix Hardcoded HA URL
**Effort: 30 minutes | Impact: High**

`localhost:8123` hardcoded in server.js breaks non-default setups.

```
Tasks:
□ Replace all hardcoded 'http://localhost:8123' with process.env.HA_URL
□ Add HA_URL to ALLOWED_SETTINGS in settings API
□ Document in README that HA_URL must be set
```

#### 4. Fix Package.json Metadata
**Effort: 15 minutes | Impact: Medium**

```
Tasks:
□ Update author field in both package.json files
□ Update homepage URL
□ Add proper keywords
□ Set version to 2.1.0-beta.1
```

#### 5. Add Basic Error Boundaries
**Effort: 2 hours | Impact: High**

One bad node crashes the entire editor.

```
Tasks:
□ Create ErrorBoundary React component
□ Wrap Editor.jsx with ErrorBoundary
□ Add fallback UI: "Something went wrong. Reload the page."
□ Log errors to server for debugging
```

#### 6. Secure Token Storage
**Effort: 2 hours | Impact: Critical**

HA tokens in localStorage is a security risk.

```
Tasks:
□ Move token storage to httpOnly cookies OR sessionStorage
□ Add warning in Settings UI about token security
□ Clear tokens on logout/session end
```

---

### 🟠 HIGH PRIORITY (Should Have for Beta)

#### 7. Add Minimum Test Coverage
**Effort: 8-12 hours | Impact: High**

```
Tasks:
□ Add tests for all device managers (HA, Hue, Kasa, Shelly)
□ Add API route tests for /api/devices, /api/settings
□ Add at least 5 node plugin tests (data flow, restore)
□ Target: 40% coverage minimum
□ Add npm script: "test:coverage"
```

#### 8. Add Loading States
**Effort: 3 hours | Impact: High**

```
Tasks:
□ Add loading spinner while plugins load
□ Show progress: "Loading plugins... 12/30"
□ Add skeleton UI for node editor area
□ Handle plugin load failures gracefully
```

#### 9. Add User-Facing Error Messages
**Effort: 4 hours | Impact: High**

```
Tasks:
□ Add toast notification system (react-hot-toast or similar)
□ Show toast on: connection failure, save failure, device control failure
□ Add success toasts for: save, settings update, device toggle
□ Create error message mapping (tech error → user-friendly)
```

#### 10. Modularize server.js
**Effort: 4 hours | Impact: Medium**

690 lines is too much for one file.

```
Tasks:
□ Extract settings routes to api/routes/settingsRoutes.js
□ Extract socket handlers to separate module
□ Extract weather endpoints to api/routes/weatherRoutes.js
□ Target: server.js < 200 lines
```

#### 11. Add Connection Status Indicators
**Effort: 3 hours | Impact: High**

```
Tasks:
□ Add status indicators in Dock UI (green/red dots)
□ Show device count per integration
□ Add "Refresh" button to manually reconnect
□ Show last successful connection time
```

#### 12. Improve Plugin Error Handling
**Effort: 3 hours | Impact: High**

```
Tasks:
□ Wrap each plugin load in try/catch
□ Show failed plugins list in UI
□ Add "Plugin failed to load: [Name] - [Error]" notification
□ Don't let one broken plugin prevent others from loading
```

---

### 🟡 MEDIUM PRIORITY (Nice to Have for Beta)

#### 13. Add Keyboard Shortcuts Help
**Effort: 2 hours**
- Add "?" shortcut to show shortcuts modal
- Document shortcuts in README

#### 14. Add Basic Analytics/Telemetry (Opt-in)
**Effort: 4 hours**
- Opt-in checkbox in Settings
- Send anonymous error reports on crash

#### 15. Create Getting Started Guide
**Effort: 3 hours**
- Create GETTING_STARTED.md with screenshots
- Add first-run wizard or guided tour

#### 16. Add Graph Validation
**Effort: 4 hours**
- Validate graph JSON before save
- Add "Repair Graph" function

#### 17. Add Auto-Save
**Effort: 2 hours**
- Auto-save every 2 minutes
- Show "Unsaved changes" indicator

#### 18. Refactor Plugins to Use Base Class
**Effort: 6 hours**
- Update key plugins to extend T2Node
- Remove duplicated dependency checking

---

### 🟢 LOW PRIORITY (Post-Beta)

- Add TypeScript (gradual migration)
- Add Mobile-Responsive CSS
- Add Undo/Redo History (rete-history-plugin)
- Add Node Search in context menu
- Performance optimization

---

### Summary: Minimum Beta Checklist

| # | Task | Time | Priority |
|---|------|------|----------|
| 1 | Remove debug logging | 3h | 🔴 Critical |
| 2 | Clean build artifacts | 30m | 🔴 Critical |
| 3 | Fix hardcoded HA URL | 30m | 🔴 Critical |
| 4 | Fix package.json metadata | 15m | 🔴 Critical |
| 5 | Add error boundaries | 2h | 🔴 Critical |
| 6 | Secure token storage | 2h | 🔴 Critical |
| 7 | Add loading states | 3h | 🟠 High |
| 8 | Add toast notifications | 4h | 🟠 High |
| 9 | Add connection indicators | 3h | 🟠 High |
| 10 | Improve plugin error handling | 3h | 🟠 High |
| 11 | Create Getting Started guide | 3h | 🟠 High |

**Total Minimum Time: ~24 hours of focused work**

### Recommended Order of Attack

1. **Day 1** (4h): Items 1-4 (quick wins, immediate polish)
2. **Day 2** (5h): Items 5-6 (critical reliability + security)
3. **Day 3** (6h): Items 7-9 (user experience)
4. **Day 4** (6h): Items 10-11 (error handling + docs)
5. **Day 5** (8h): Item 7 from High Priority (basic tests)
