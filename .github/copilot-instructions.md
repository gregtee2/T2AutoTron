# T2AutoTron 2.1 - AI Coding Instructions

## 🚀 ACTIVE PROJECT: Unified Architecture (v3.0 Refactor)

**Status**: POC Phase - Ready to Start  
**Document**: `v3_migration/UNIFIED_ARCHITECTURE_PROPOSAL.md`  
**Branch**: Create `feature/unified-architecture` before starting

### What We're Doing
Eliminating duplicate code between frontend plugins (47 files) and backend engine nodes (45 classes). Currently the same logic is written twice - once for the pretty UI, once for the 24/7 engine. We want ONE definition that both use.

### Next Steps for Agent
1. Create git branch: `feature/unified-architecture`
2. Create folder: `v3_migration/shared/nodes/`
3. Pick 3 test nodes: `CurrentTimeNode`, `DelayNode`, `HAGenericDeviceNode`
4. Write unified definitions for those 3 (see proposal doc for format)
5. Build loader that works in both frontend and backend
6. Test that they actually work

### Key Files to Read First
- `v3_migration/UNIFIED_ARCHITECTURE_PROPOSAL.md` - Full context and plan
- `backend/plugins/CurrentTimeNode.js` - Example frontend plugin
- `backend/src/engine/nodes/TimeNodes.js` - Example backend node class

### Human Context
- Owner is NOT a programmer - use caveman explanations
- AI agent time ≠ human time (200 human hours ≈ 6-10 agent hours)
- Frontend UI stays mostly the same - just how nodes are defined changes

---

## 🦴 Caveman Explanations (IMPORTANT - READ THIS FIRST)

**The project owner is not a programmer.** When explaining problems, fixes, or concepts:

1. **Always include a "caveman explanation"** - a simple, jargon-free summary that anyone can understand
2. **Avoid technical jargon** without explaining what it means in plain English
3. **Use analogies** - compare technical concepts to everyday things (cars, plumbing, jobs, etc.)
4. **Explain the "why"** - not just what you did, but why it matters

### Communication Guidelines for AI Agents

When working on this project:
- **Before diving into code**, explain what you're about to do and why
- **After fixing something**, provide a caveman summary of what was wrong and how you fixed it
- **When something is complex**, break it down into simple parts
- **Use emojis** to make things visually scannable (✅ ❌ 🔴 🟢 🦴)
- **Tables and lists** are easier to read than paragraphs of text

### Caveman Explanation Format

When documenting fixes or explaining problems, use this format:

```
## The Problem (Caveman Edition) 🦴
**What broke**: [Simple description of the symptom - what the user sees]
**Why it broke**: [Root cause in plain English - no jargon]
**The fix**: [What we did to fix it - simple version]
**Now it works because**: [Why the fix solves the problem]
```

### Good Caveman Analogies to Use

| Technical Concept | Caveman Analogy |
|-------------------|-----------------|
| Server crashing | "The worker quit their job unexpectedly" |
| Event loop empty | "Nobody scheduled any more work, so the worker went home" |
| Keep-alive/heartbeat | "A timer that says 'Hey, I'm still here, don't leave!'" |
| API call failing | "Tried to make a phone call but nobody answered" |
| Authentication error | "Showed up at the door but forgot the password" |
| Race condition | "Two people trying to go through the same door at once" |
| Memory leak | "Kept collecting stuff but never threw anything away" |
| Callback/Promise | "Left a note saying 'call me back when you're done'" |
| Socket connection | "An open phone line between two computers" |
| Cache | "A sticky note to remember something so you don't have to look it up again" |

---

### Recent Caveman Fixes:

#### Device Timeline Empty in Debug Dashboard (2025-12-18)
- **What broke**: Debug Dashboard "Device Timeline" panel always showed "No events to show" even though the engine was running and controlling lights for hours.
- **Why it broke**: The code was looking for the wrong event names in the log file. It searched for `[DEVICE-CMD]` and `[TRIGGER]`, but the actual logs use `[HA-HSV-CHANGE]`, `[HA-DEVICE-SKIP]`, etc. Like looking for "birthday party" entries in a calendar that only has "meeting" entries.
- **The fix**: Updated the search to look for the actual category names that exist in the logs.
- **Now it works because**: The timeline code looks for event names that actually exist in your logs!

#### Update Button Always Shows "Updates Available" (2025-12-18)
- **What broke**: The "Check for Updates" button in the HA add-on always showed "Updates available!" even when running the latest version.
- **Why it broke**: The toast notification was displayed whenever `data.addOnUpdate` existed, but didn't check if there actually WAS an update.
- **The fix**: Now checks `data.hasUpdate` flag before showing the update toast.
- **Now it works because**: It only yells "update available" when there actually is one!

#### HA Device Dropdown Empty on Graph Load (2025-12-17)
- **What broke**: In the HA add-on, loading a saved graph caused all HA Generic Device node dropdowns to show no devices. Fresh nodes worked fine.
- **Why it broke**: Race condition - the code tried to update the dropdown BEFORE React had finished setting it up. Like trying to fill a glass that hasn't been placed on the table yet.
- **The fix**: Added a retry mechanism - if the dropdown isn't ready, wait a bit and try again (up to 5 times). Also added a backup method to fetch devices via HTTP if the socket cache is empty.
- **Now it works because**: The code is patient - it waits for the dropdown to be ready before filling it.

#### Forecast Shows Yesterday (2025-12-17)
- **What broke**: 5-day forecast in HA add-on was showing "yesterday" as the first day.
- **Why it broke**: Open-Meteo returns dates as "2025-12-17" which JavaScript parses as midnight UTC. When converted to local time, it can become Dec 16 at 6pm in some timezones.
- **The fix**: Use UTC methods (`getUTCDay()`, `getUTCMonth()`, `getUTCDate()`) instead of local methods to display the actual calendar date.
- **Now it works because**: We display the date as written by the weather service, ignoring timezone conversion.

#### SaveModal Import Path (2025-12-17)
- **What broke**: HA add-on v2.1.60 failed to build with error "Could not resolve '../apiConfig'".
- **Why it broke**: SaveModal.jsx was importing from a file path that didn't exist.
- **The fix**: Changed `../apiConfig` to `../utils/apiBase` where `apiUrl` actually lives.
- **Now it works because**: The import points to the correct file.

#### Graph Loading 2-Minute Delay (2025-12-17)
- **What broke**: Add-on took 2+ minutes to load a graph on startup. UI was frozen.
- **Why it broke**: The graph has 20 HA Generic Device nodes. Each one was yelling "GIVE ME ALL THE DEVICES!" at the same time during load. 60+ API calls firing at once = traffic jam.
- **The fix**: Added a "wait for the graph to finish loading" check. Now nodes politely wait until loading is done, THEN fetch their device info.
- **Now it works because**: API calls happen AFTER the graph loads, not during. Graph loads in ~10 seconds now.

#### Zigbee Light Flashing/Popping (2025-12-17)
- **What broke**: Christmas lights were flashing and popping during color fades (headless mode only, not when UI was open).
- **Why it broke**: Backend was sending color commands every 200ms. Zigbee lights can only handle 1 command per 3-5 seconds. Too many commands = lights get confused and flash.
- **The fix**: Increased minimum time between commands from 200ms to 3 seconds. Also raised the "is this change big enough to bother sending?" threshold.
- **Now it works because**: Lights only get color updates when there's a real change, and never faster than every 3 seconds.

#### Timeline Colors Null in Headless Mode (2025-12-16)
- **What broke**: Lights were ON but colors weren't changing when browser was closed. Timeline Color node output was `null`.
- **Why it broke**: Two problems: (1) Backend `TimeOfDayNode` wasn't telling Timeline when the day period started/ended. (2) Backend wraps all inputs in arrays `["08:00"]` but Timeline was looking for raw values `"08:00"`.
- **The fix**: Added `startTime`/`endTime` outputs to TimeOfDayNode. Changed Timeline to unwrap the array: `inputs.startTime?.[0]`.
- **Now it works because**: Timeline knows when the period starts AND can read the time correctly.

#### Server Quitting Early (2025-12-14)
- **What broke**: Server started up fine, then quit after ~20 seconds. Lights stopped changing colors.
- **Why it broke**: Node.js has a rule: "If there's no work scheduled, I'm done - goodbye!" The Kasa smart plug code was accidentally telling Node.js "don't wait for me" on its network connections. After startup finished, Node.js saw no "real" work left and exited.
- **The fix**: Added a heartbeat - a 60-second timer that says "Hey, I'm still here, don't leave!" Now Node.js always has something to wait for.

---

## Recent Server Stability Fix (2025-12-14)

### Problem
Server was exiting with code 0 (clean exit) after ~15-20 seconds, stopping all automations.

### 🦴 Caveman Version
The server was quitting its job too early. Node.js thought "nobody needs me anymore" and shut down. We added a heartbeat to keep it alive.

### Root Cause
- Node.js exits when the event loop is empty (no timers, no I/O pending)
- `tplink-smarthome-api` (Kasa library) was unreferencing its UDP sockets
- After initial device discovery, no referenced handles remained
- Node.js saw empty event loop → clean exit

### The Fix
1. **Absolute .env path**: Changed from relative to `path.join(__dirname, '..', '.env')`
2. **Keep-alive interval**: Added 60-second interval with explicit `.ref()` 
3. **beforeExit handler**: Safety net to prevent clean exits
4. **Uptime logging**: Shows `[Server] Uptime: X minutes` every minute

### Key Code
```javascript
// Keep the process alive - prevents exit when event loop is empty
const keepAlive = setInterval(() => {
    const uptime = Math.floor((Date.now() - startTime) / 60000);
    console.log(`[Server] Uptime: ${uptime} minutes`);
}, 60000);
keepAlive.ref(); // Ensure this interval keeps process alive

// Safety net - prevent clean exit
process.on('beforeExit', (code) => {
    console.log('[EXIT] Process beforeExit with code:', code);
    setTimeout(() => {}, 1000); // Schedule work to prevent exit
});
```

### Files Modified
- `v3_migration/backend/src/server.js` - Keep-alive interval, beforeExit handler, absolute .env path

---

## Recent Add-on CORS & Device Control Fixes (2025-12-14)

Fixed issues specific to the **Home Assistant Add-on** environment (Docker/ingress):

### Problem
- HA devices not populating in HAGenericDeviceNode
- 400 errors on PUT requests to `/api/lights/ha/.../state`
- 404 errors on Kasa device API calls
- Local Electron version worked fine, only add-on was broken

### Root Causes & Fixes

1. **CORS Configuration** (`src/config/cors.js`):
   - Added `IS_HA_ADDON` detection via `process.env.SUPERVISOR_TOKEN`
   - In add-on mode, allow ALL origins (HA ingress handles security)
   - Added `X-Ingress-Path` to allowed headers

2. **Socket.IO CORS** (`src/server.js`):
   - Added `IS_HA_ADDON` detection with startup log
   - Allow all origins in add-on mode: `origin: IS_HA_ADDON ? true : [...]`
   - Added `PUT` and `DELETE` to allowed methods

3. **Kasa Routes Fix** (`src/devices/pluginLoader.js`):
   - Fixed `kasaRoutes` legacyParams: was `[null]`, now `null`
   - This passes `(io, deviceService)` correctly instead of `(null)`

4. **Empty Body Detection** (`src/api/routes/haRoutes.js`):
   - Added diagnostic logging for empty request bodies
   - Returns clear error message if body parsing fails

### Key Detection Code
```javascript
// Backend detection
const IS_HA_ADDON = !!process.env.SUPERVISOR_TOKEN;

// Frontend detection  
const IS_HA_ADDON = window.location.pathname.includes('/api/hassio/ingress/');
```

### Files Modified
- `v3_migration/backend/src/server.js` - CORS origin handling
- `v3_migration/backend/src/config/cors.js` - Add-on mode detection
- `v3_migration/backend/src/devices/pluginLoader.js` - kasaRoutes fix
- `v3_migration/backend/src/api/routes/haRoutes.js` - Empty body logging

---

## HA Device Log Spam Fix (2025-12-16)

### Problem
Console was flooded with hundreds of "❌ Invalid HA device" error messages on every startup and device sync, making logs unreadable.

### 🦴 Caveman Version
The server was yelling "INVALID!" at every sensor, switch, and phone battery in Home Assistant - even though they're perfectly valid. It was looking for the wrong ID card format.

### Root Cause
- `homeAssistantManager.getDevices()` returns devices in **transformed format** with `id: 'ha_light.xxx'`
- `socketHandlers.js` was checking for `device.entity_id` (raw HA format)
- Every device failed this check and got logged as "invalid"
- Sensors, switches, binary_sensors, media_players - ALL logged as errors with full JSON dumps

### The Fix
Updated `socketHandlers.js` to check for `device.id` instead of `device.entity_id`:

```javascript
// BEFORE (wrong - checking for raw HA format)
if (!device.entity_id || typeof device.entity_id !== 'string') {
  logger.log(`Invalid HA device: ${JSON.stringify(device)}`, 'error');
  return null;
}

// AFTER (correct - matches pre-transformed format)
if (!device.id || typeof device.id !== 'string') {
  logger.log(`Malformed HA device (missing id): ${JSON.stringify(device).slice(0, 100)}`, 'warn');
  return null;
}
```

### Files Modified
- `v3_migration/backend/src/api/socketHandlers.js` - Fixed HA device validation to match actual data format

---

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
    ├── TimeNodes.js      # CurrentTime, TimeRange, DayOfWeek, SunPosition, TimeOfDay
    ├── LogicNodes.js     # AND, OR, NOT, Compare, Switch, Threshold, Latch, Toggle
    ├── DelayNode.js      # Delay, Debounce, Retriggerable modes
    ├── HADeviceNodes.js  # HALight, HASwitch, HASensor, HAClimate, HAGenericDevice, HADeviceAutomation
    ├── HueLightNodes.js  # HueLight, HueGroup (direct bridge API)
    ├── KasaLightNodes.js # KasaLight, KasaPlug (direct local API)
    ├── ColorNodes.js     # SplineTimelineColor, HSVToRGB, RGBToHSV, ColorMixer
    └── UtilityNodes.js   # Counter, Random, StateMachine, SplineCurve, Watchdog, Sender, Receiver
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
| `/device-states` | GET | What engine thinks each device should be (for dashboard comparison) |

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

### Current Status (as of 2025-12-16)
- ✅ All 5 phases complete (Core, Devices, Colors, API, UI)
- ✅ **100% node coverage** - All frontend plugins have backend implementations
- ✅ All 71 tests pass
- ✅ **Server stability fixed** - Keep-alive interval prevents premature exit
- ✅ Engine runs 24/7 independently of frontend
- ✅ Colors/HSV flow correctly through SplineTimeline → Buffer → HAGenericDevice
- ✅ Timeline Color nodes work in headless mode (fixed 2025-12-16)

### 🦴 Backend Engine Caveman Summary
The engine is like a robot that runs your light automations. Before, it only worked when you had the app open (like a TV that only works when you're watching). Now it runs on the server 24/7, even when you close the browser. Your lights keep changing colors while you sleep!

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

**Current Version: 2.1.77 | Status: Beta-Ready! 🎉**

### ✅ COMPLETED - Critical Items

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Debug console logging | ✅ Done | All logs gated by `VERBOSE_LOGGING` env var (backend) or `EDITOR_DEBUG`/`SOCKET_DEBUG` flags (frontend) |
| 2 | Clean build artifacts | ✅ Done | Only 1-2 files in assets/ |
| 3 | Fix hardcoded HA URL | ✅ Done | Uses `process.env.HA_HOST` with fallback |
| 4 | Package.json metadata | ✅ Done | v2.1.63, proper author/homepage/keywords |
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
| 4 | Event Log App filter | 🔴 Broken | App events not showing - needs investigation |

### 🟢 RECENTLY ADDED (2.1.55 - 2.1.63)

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
| 15 | **Add-on CORS Fix** | v2.1.55 - Fixed 400/404 errors in HA add-on by allowing all origins in ingress mode |
| 16 | **Graph Loading Speed** | v2.1.58 - Deferred HA API calls during graph loading (was 2 min, now ~10s) |
| 17 | **Color Throttling** | v2.1.58 - Increased min throttle to 3s for Zigbee lights (prevents flashing/popping) |
| 18 | **Debug Dashboard** | v2.1.75 - Standalone HTML tool: engine vs HA comparison, anomaly detection, color-cycling activity tracking |
| 19 | **Report Bug Button** | v2.1.63 - 🐛 button in Control Panel opens GitHub issue with auto-filled debug info |
| 20 | **GitHub Issue Templates** | v2.1.63 - Bug report and feature request templates with structured fields |
| 21 | **Addon Landing Page** | v2.1.63 - Origin story, Node-RED comparison, "Why Share This?" section |
| 22 | **Device States API** | v2.1.73 - `/api/engine/device-states` endpoint for comparing engine expectations vs HA reality |
| 23 | **Dashboard Session Persistence** | v2.1.76 - Debug Dashboard saves events to localStorage (4hr expiry), survives browser refresh |
| 24 | **Dashboard Restart Detection** | v2.1.76 - Detects server restarts (uptime backwards), shows restart history |
| 25 | **Scroll-to-Bug Feature** | v2.1.76 - Clicking "BUGS found" badge scrolls to first mismatch with glow effect |

### 🟢 RECENTLY FIXED

| # | Fix | Notes |
|---|-----|-------|
| 1 | **Server early exit** | Server was quitting after ~20 seconds. Added keep-alive interval + beforeExit handler. See Caveman Explanation above. |
| 2 | HA Token refresh | Settings panel now updates token immediately via `homeAssistantManager.updateConfig()` |
| 3 | Pan/Zoom freeze | F5 resets view; auto-reset on graph load via `graphLoadComplete` event |
| 4 | Reset performance | `resetEditorView()` uses `requestAnimationFrame` to avoid blocking (was 350ms+, now <16ms) |
| 5 | DeviceStateControl CSS | No longer injects CSS on every render (major performance fix) |
| 6 | Keyframe animations | Moved from dynamic injection to `node-styles.css` |
| 7 | HA Device Automation outputs | `data()` now pure (no changeCallback inside), always returns all dynamic outputs; uses `??` to preserve `false`/`0` |
| 8 | Add-on CORS/Ingress | v2.1.55 - Allow all origins when `SUPERVISOR_TOKEN` present, fixed Kasa route params |
| 9 | **Graph loading 2-min delay** | v2.1.58 - HAGenericDeviceNode now waits for `window.graphLoading` to clear before fetching devices |
| 10 | **Zigbee light flashing** | v2.1.58 - Backend HADeviceNodes throttle increased from 200ms to 3s minimum |
| 11 | **Forecast timezone bug** | v2.1.62 - 5-day forecast was showing "yesterday" due to UTC parse issue. Fixed by using `getUTCDay()/getUTCMonth()/getUTCDate()` |
| 12 | **SaveModal import path** | v2.1.61 - Fixed `../apiConfig` → `../utils/apiBase` import that broke addon build |
| 13 | **HA dropdown race condition** | v2.1.64-68 - Fixed dropdowns empty after graph load (RAF timing, retry logic, host_network for Kasa) |
| 14 | **HSV-only nodes display** | v2.1.75 - Debug Dashboard correctly shows HSV-only device nodes as ON when sending color commands |
| 15 | **Update button false positive** | v2.1.76 - "Check for Updates" in add-on always showed updates available. Now checks `hasUpdate` flag |
| 16 | **Device timeline empty** | v2.1.77 - `/api/engine/logs/device-history` now finds actual log categories (was searching obsolete names) |

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

### ⚠️ CRITICAL: Add-on Submodule Push

**The HA add-on lives in a separate repo (submodule).** When you change anything in `home-assistant-addons/` (especially `config.yaml` version bumps), you MUST:

1. **Push the submodule first:**
   ```bash
   cd home-assistant-addons
   git add -A
   git commit -m "bump: vX.X.X - Description"
   git push origin main
   ```

2. **Then update the parent repo's reference:**
   ```bash
   cd ..  # back to T2AutoTron root
   git add home-assistant-addons
   git commit -m "chore: update addon submodule to vX.X.X"
   git push origin main
   git push origin main:stable
   ```

**If you skip this, HA users won't see the update!** The add-on repo is what Home Assistant checks for new versions.

### Development Workflow

1. **Work on `main` branch** for new features and bug fixes.
2. **Test thoroughly** on `main` before pushing to `stable`.
3. **Push to `stable`** when ready for user deployment: `git push origin main:stable`
4. **If add-on was touched**, follow the submodule push steps above.

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
