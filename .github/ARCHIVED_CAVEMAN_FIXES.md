# Archived Caveman Fixes

This file contains detailed bug fix explanations from December 2025 - early January 2026. 
These were moved from `copilot-instructions.md` to reduce context size while preserving history.

**For recent fixes (last 2 weeks), see `copilot-instructions.md`.**

---

## December 2025 Fixes

### HAGenericDeviceNode HA-Only Refactor (2025-12-19)
- **What broke**: The node was a confusing "Swiss Army knife" trying to talk directly to Kasa, Hue, AND Home Assistant. It had 3 different code paths for the same operation.
- **Why it broke**: Original design assumed direct device control. But HA already integrates with Kasa/Hue devices, and there are dedicated `KasaLightNode` and `HueLightNode` for direct control.
- **The fix**: Removed ~120 lines of Kasa/Hue code from `setDevicesState`, `onTrigger`, `applyHSVInput`, `fetchDeviceState`, and `handleDeviceStateUpdate`. Now the node only speaks HA format.
- **Now it works because**: One node, one job - talk to Home Assistant. HA handles translating to each device's native language (Zigbee, Hue, Kasa, etc.).

### Brightness Bar Shows 39% Instead of 100% (2025-12-19)
- **What broke**: Light was correctly at full brightness (254), but the color bar on the node showed only 39% and was 1/3 width.
- **Why it broke**: The value was being divided by 255 twice - once in the backend (correct), then again in the UI (wrong). 100/255 = 39%.
- **The fix**: Updated `ColorBarControl` and `DeviceStateControl` in `00_SharedControlsPlugin.js` to expect 0-100 values directly from the backend, not raw 0-255.
- **Now it works because**: Backend normalizes brightness to 0-100, UI displays 0-100 directly. No double-conversion.

### HAGenericDeviceNode Auto-Refresh Removal (2025-12-19)
- **What broke**: Performance degradation with many device nodes. UI became sluggish.
- **Why it broke**: Each HAGenericDeviceNode had a 30-second auto-refresh interval calling the HA API. With 20 nodes = 2,400 API calls per hour just for polling!
- **The fix**: Removed `startAutoRefresh()`, `autoRefreshInterval` property, and interval cleanup from the node. Real-time updates come via Socket.IO anyway.
- **Now it works because**: No more wasteful polling. Devices update via WebSocket push notifications instead.

### AND Gate 30-Second Delay (2025-12-18)
- **What broke**: Logic nodes (AND, OR, etc.) connected to TimeRangeNode or DayOfWeekComparisonNode took ~30 seconds (or longer) to update their output, even though they should respond instantly.
- **Why it broke**: TimeRangeNode and DayOfWeekComparisonNode had no internal "clock". They only recalculated when the user changed a slider. Imagine an employee who only checks their inbox when you tap their shoulder - if nobody taps them, they never check.
- **The fix**: Added `setInterval` in both nodes' `useEffect` to continuously trigger `changeCallback()`. TimeRangeNode ticks every 1 second; DayOfWeekComparisonNode ticks every 1 minute (day changes are slow). **Performance fix (v2.1.91)**: Only triggers when the value actually changes, not every tick.
- **Now it works because**: The time nodes continuously "wake up" and tell the engine to re-evaluate, so downstream logic gates get fresh data every second.

### Device Timeline Empty in Debug Dashboard (2025-12-18)
- **What broke**: Debug Dashboard "Device Timeline" panel always showed "No events to show" even though the engine was running and controlling lights for hours.
- **Why it broke**: The code was looking for the wrong event names in the log file. It searched for `[DEVICE-CMD]` and `[TRIGGER]`, but the actual logs use `[HA-HSV-CHANGE]`, `[HA-DEVICE-SKIP]`, etc. Like looking for "birthday party" entries in a calendar that only has "meeting" entries.
- **The fix**: Updated the search to look for the actual category names that exist in the logs.
- **Now it works because**: The timeline code looks for event names that actually exist in your logs!

### Update Button Always Shows "Updates Available" (2025-12-18)
- **What broke**: The "Check for Updates" button in the HA add-on always showed "Updates available!" even when running the latest version.
- **Why it broke**: The toast notification was displayed whenever `data.addOnUpdate` existed, but didn't check if there actually WAS an update.
- **The fix**: Now checks `data.hasUpdate` flag before showing the update toast.
- **Now it works because**: It only yells "update available" when there actually is one!

### HA Device Dropdown Empty on Graph Load (2025-12-17)
- **What broke**: In the HA add-on, loading a saved graph caused all HA Generic Device node dropdowns to show no devices. Fresh nodes worked fine.
- **Why it broke**: Race condition - the code tried to update the dropdown BEFORE React had finished setting it up. Like trying to fill a glass that hasn't been placed on the table yet.
- **The fix**: Added a retry mechanism - if the dropdown isn't ready, wait a bit and try again (up to 5 times). Also added a backup method to fetch devices via HTTP if the socket cache is empty.
- **Now it works because**: The code is patient - it waits for the dropdown to be ready before filling it.

### Forecast Shows Yesterday (2025-12-17)
- **What broke**: 5-day forecast in HA add-on was showing "yesterday" as the first day.
- **Why it broke**: Open-Meteo returns dates as "2025-12-17" which JavaScript parses as midnight UTC. When converted to local time, it can become Dec 16 at 6pm in some timezones.
- **The fix**: Use UTC methods (`getUTCDay()`, `getUTCMonth()`, `getUTCDate()`) instead of local methods to display the actual calendar date.
- **Now it works because**: We display the date as written by the weather service, ignoring timezone conversion.

### SaveModal Import Path (2025-12-17)
- **What broke**: HA add-on v2.1.60 failed to build with error "Could not resolve '../apiConfig'".
- **Why it broke**: SaveModal.jsx was importing from a file path that didn't exist.
- **The fix**: Changed `../apiConfig` to `../utils/apiBase` where `apiUrl` actually lives.
- **Now it works because**: The import points to the correct file.

### Graph Loading 2-Minute Delay (2025-12-17)
- **What broke**: Add-on took 2+ minutes to load a graph on startup. UI was frozen.
- **Why it broke**: The graph has 20 HA Generic Device nodes. Each one was yelling "GIVE ME ALL THE DEVICES!" at the same time during load. 60+ API calls firing at once = traffic jam.
- **The fix**: Added a "wait for the graph to finish loading" check. Now nodes politely wait until loading is done, THEN fetch their device info.
- **Now it works because**: API calls happen AFTER the graph loads, not during. Graph loads in ~10 seconds now.

### Zigbee Light Flashing/Popping (2025-12-17)
- **What broke**: Christmas lights were flashing and popping during color fades (headless mode only, not when UI was open).
- **Why it broke**: Backend was sending color commands every 200ms. Zigbee lights can only handle 1 command per 3-5 seconds. Too many commands = lights get confused and flash.
- **The fix**: Increased minimum time between commands from 200ms to 3 seconds. Also raised the "is this change big enough to bother sending?" threshold.
- **Now it works because**: Lights only get color updates when there's a real change, and never faster than every 3 seconds.

### Timeline Colors Null in Headless Mode (2025-12-16)
- **What broke**: Lights were ON but colors weren't changing when browser was closed. Timeline Color node output was `null`.
- **Why it broke**: Two problems: (1) Backend `TimeOfDayNode` wasn't telling Timeline when the day period started/ended. (2) Backend wraps all inputs in arrays `["08:00"]` but Timeline was looking for raw values `"08:00"`.
- **The fix**: Added `startTime`/`endTime` outputs to TimeOfDayNode. Changed Timeline to unwrap the array: `inputs.startTime?.[0]`.
- **Now it works because**: Timeline knows when the period starts AND can read the time correctly.

### Server Quitting Early (2025-12-14)
- **What broke**: Server started up fine, then quit after ~20 seconds. Lights stopped changing colors.
- **Why it broke**: Node.js has a rule: "If there's no work scheduled, I'm done - goodbye!" The Kasa smart plug code was accidentally telling Node.js "don't wait for me" on its network connections. After startup finished, Node.js saw no "real" work left and exited.
- **The fix**: Added a heartbeat - a 60-second timer that says "Hey, I'm still here, don't leave!" Now Node.js always has something to wait for.

---

## Detailed Implementation Notes (December 2025)

These sections contain full implementation details that were moved from the main instructions file.

---

## Server Stability Fix (2025-12-14)

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

## Add-on CORS & Device Control Fixes (2025-12-14)

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

## Context Menu & UX Polish (2025-12-13)

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

**Files modified:**
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

## Crash Detection & Logging Work (2025-12-13)

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

---

## Security Work (2025-12-12)

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
