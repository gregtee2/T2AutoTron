# Beta Release Status & Change Tracking

This file tracks features added, bugs fixed, and future plans.
Moved from `copilot-instructions.md` to reduce active context size.

**Current Version: 2.1.237 | Status: Beta-Ready! 🎉**

---

## ✅ COMPLETED - Critical Items

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Debug console logging | ✅ Done | All logs gated by `VERBOSE_LOGGING` env var (backend) or `EDITOR_DEBUG`/`SOCKET_DEBUG` flags (frontend) |
| 2 | Clean build artifacts | ✅ Done | Only 1-2 files in assets/ |
| 3 | Fix hardcoded HA URL | ✅ Done | Uses `process.env.HA_HOST` with fallback |
| 4 | Package.json metadata | ✅ Done | v2.1.63, proper author/homepage/keywords |
| 5 | Error boundaries | ✅ Done | `ErrorBoundary.jsx` wraps App |
| 6 | Secure token storage | ✅ Done | Uses sessionStorage (falls back to localStorage) |

## ✅ COMPLETED - High Priority Items

| # | Task | Status | Notes |
|---|------|--------|-------|
| 7 | Loading states | ✅ Done | `LoadingOverlay.jsx` with progress bar |
| 8 | Toast notifications | ✅ Done | Full toast system (`Toast.jsx`), `window.T2Toast` for plugins |
| 9 | Plugin error handling | ✅ Done | Tracks `failedPlugins`, shows in UI |
| 10 | Getting Started guide | ✅ Done | `GETTING_STARTED.md` exists |
| 11 | Graph validation | ✅ Done | `graphValidation.js` with repair function |
| 12 | Auto-save | ✅ Done | Every 2 minutes, shows toast on save |
| 13 | **Modularize server.js** | ✅ Done | v2.1.166 - Settings, Telegram, Debug routes extracted (1482→984 lines) |

---

## 🟠 REMAINING - Nice to Have

| # | Task | Status | Effort |
|---|------|--------|--------|
| 1 | Add test coverage | ⏳ Not started | 8-12h |
| 2 | Refactor plugins to T2Node | ⏳ Partial | Some use it, not all |
| 3 | Event Log App filter | 🔴 Broken | App events not showing - needs investigation |

---

## 🟢 RECENTLY ADDED (2.1.55 - 2.1.237)

| # | Feature | Notes |
|---|---------|-------|
| 1 | **Sync-on-Close** | v2.1.189 - Graph auto-syncs to backend when you switch tabs or close browser. Uses `visibilitychange` event. |
| 2 | **Camera Panel** | Collapsible panel in Dock for IP camera streams (MJPEG/snapshot) |
| 3 | **Update System** | Auto-check for updates from `stable` branch, toast notifications, one-click apply |
| 4 | **Check for Updates Button** | Manual update check button in Control Panel Settings section |
| 5 | **Performance Mode** | Toggle in Settings to reduce GPU usage (disables blur, glow, animations) |
| 6 | **Graph Auto-Restore** | Graph saved before update, auto-restored after reload |
| 7 | **Sleep Prevention** | Electron app prevents Windows from suspending during sleep |
| 8 | **Toast Notification System** | Full toast system with `window.T2Toast` for plugins |
| 9 | **Favorites Panel** | Left-side panel: drag nodes to add; click to create; right-click to remove. Favorites grouped by context-menu category with dividers |
| 10 | **Dock Merge into Forecast** | Control Panel can merge below 5-day Forecast or pop back out; persisted to `localStorage` |
| 11 | **Context Menu Icons** | Category headers now show emoji icons (🏠 Home Assistant, 🔀 Logic, etc.) |
| 12 | **Category Reorganization** | Cleaner categories: CC_Control_Nodes → Color, Other/Plugs → Direct Devices |
| 13 | **Dynamic Node Height** | HAGenericDeviceNode now expands when devices are added |
| 14 | **Lasso Selection Fix** | Selection box offset corrected after Favorites panel addition |
| 15 | **Backend Engine** | Server-side automation engine for 24/7 execution (27 node types, REST API, Socket.IO) |
| 16 | **Add-on CORS Fix** | v2.1.55 - Fixed 400/404 errors in HA add-on by allowing all origins in ingress mode |
| 17 | **Graph Loading Speed** | v2.1.58 - Deferred HA API calls during graph loading (was 2 min, now ~10s) |
| 18 | **Color Throttling** | v2.1.58 - Increased min throttle to 3s for Zigbee lights (prevents flashing/popping) |
| 19 | **Debug Dashboard** | v2.1.75 - Standalone HTML tool: engine vs HA comparison, anomaly detection, color-cycling activity tracking |
| 20 | **Report Bug Button** | v2.1.63 - 🐛 button in Control Panel opens GitHub issue with auto-filled debug info |
| 21 | **GitHub Issue Templates** | v2.1.63 - Bug report and feature request templates with structured fields |
| 22 | **Addon Landing Page** | v2.1.63 - Origin story, Node-RED comparison, "Why Share This?" section |
| 23 | **Device States API** | v2.1.73 - `/api/engine/device-states` endpoint for comparing engine expectations vs HA reality |
| 24 | **Dashboard Session Persistence** | v2.1.76 - Debug Dashboard saves events to localStorage (4hr expiry), survives browser refresh |
| 25 | **Dashboard Restart Detection** | v2.1.76 - Detects server restarts (uptime backwards), shows restart history |
| 26 | **Scroll-to-Bug Feature** | v2.1.76 - Clicking "BUGS found" badge scrolls to first mismatch with glow effect |
| 27 | **Stock Price Node** | v2.1.89 - Fetches real-time stock quotes from Yahoo Finance with backend proxy |
| 28 | **Timeline Color Negative Values** | v2.1.89 - Numerical mode supports negative ranges (e.g., -5 to +5) |
| 29 | **Download Graph Feature** | v2.1.93 - Export graphs as JSON files for backup or transfer between devices |
| 30 | **Debug Dashboard Button** | v2.1.104 - 🔍 button in Control Panel opens debug dashboard in new tab |
| 31 | **Reduced API Spam** | v2.1.105 - Removed 60-second forced updates (~60 API calls/hour per light eliminated) |
| 32 | **HueEffectNode** | v2.1.106 - Trigger built-in Hue effects (candle, fire, prism, etc.) with multi-light selection |
| 33 | **Smart HSV Exclusion** | v2.1.106 - Effect lights auto-excluded from downstream HSV commands via metadata |
| 34 | **Group Navigation Buttons** | v2.1.107 - Quick-jump buttons in Event Log header to zoom to Backdrop groups |
| 35 | **server.js Modularization** | v2.1.166 - Extracted Settings, Telegram, Debug routes (1482→984 lines, -34%) |
| 36 | **PriorityEncoderNode** | v2.1.212 - New logic node: outputs the index of the first TRUE input (1-8 inputs). Backend + frontend implementation. |
| 37 | **Device Timeline Colors** | v2.1.212 - Debug Dashboard timeline segments now show actual light colors (HSV extracted from log events). |
| 38 | **Split Bar Color Comparison** | v2.1.212 - Current timeline segment shows split bar: engine color (top) vs HA actual color (bottom). Orange border when colors differ >10°. |
| 39 | **AllInOneColorNode Tooltips** | v2.1.212 - Added comprehensive tooltips with `?` icons explaining all inputs, outputs, and controls. |
| 40 | **Oklab Color Interpolation** | v2.1.234 - Color gradients use perceptually uniform Oklab space. Red→Green goes through vibrant yellows instead of muddy browns. |
| 41 | **forceHsvResync()** | v2.1.237 - Backend immediately syncs colors when taking over from frontend (no more handoff color gap). |

---

## 🟢 RECENTLY FIXED

| # | Fix | Notes |
|---|-----|-------|
| 1 | **Server early exit** | Server was quitting after ~20 seconds. Added keep-alive interval + beforeExit handler. |
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
| 17 | **Memory leaks in HA nodes** | v2.1.86 - Socket listeners now cleaned up on component unmount |
| 18 | **DelayNode memory leak** | v2.1.87 - Countdown interval now cleaned up via destroy() method |
| 19 | **AND gate 30-second delay** | v2.1.90 - TimeRangeNode and DayOfWeekComparisonNode now tick automatically |
| 20 | **Performance degradation** | v2.1.91 - Nodes only trigger changeCallback when values actually change (was 100+/sec) |
| 21 | **Timeline Color broken** | v2.1.92 - Added dedicated engine interval for active output modes |
| 22 | **HAGenericDeviceNode auto-refresh** | v2.1.97 - Removed 30-second polling (2400 API calls/hour with 20 nodes). Uses Socket.IO push instead. |
| 23 | **Brightness bar 39% bug** | v2.1.97 - ColorBarControl and DeviceStateControl were dividing by 255 twice. Now expect 0-100 directly. |
| 24 | **HAGenericDeviceNode HA-only refactor** | v2.1.97 - Removed ~120 lines of Kasa/Hue direct API code. Node now only speaks to HA (HA translates to devices). |
| 25 | **HADeviceAutomationNode registry bug** | v2.1.103 - Backend engine was instantiating wrong node class. Now correctly creates field-extraction node. |
| 26 | **LOG_LEVEL crash** | v2.1.102 - Add-on no longer crashes on startup with invalid LOG_LEVEL value. |
| 27 | **Group nav zoom centering** | v2.1.108 - Group navigation buttons now properly center viewport on the selected group. |
| 28 | **Console log spam** | v2.1.108 - Removed debug logging from DeviceStateControl that was spamming browser console. |
| 29 | **HueEffectNode add-on discovery** | v2.1.109 - Fixed light discovery in HA add-on. Was using raw `fetch()` instead of `window.apiFetch()`. |
| 30 | **Backend audio not starting** | v2.1.173 - TTSAnnouncementNode backend never started streaming on graph load. Added `_initialized` flag to call `playStream()` on first tick. |
| 31 | **Server log spam cleanup** | v2.1.175 - Gated ALL routine logs behind `VERBOSE_LOGGING`. Removed: PUT logs, device update logs, CMD→/←STATE logs, cache refresh logs, audit OK logs, uptime logs. |
| 32 | **Device sync settling delay** | v2.1.187 - Lights no longer flash ON→OFF on graph load. Added 1-second settling delay before backend sends commands. |
| 33 | **Browser close sync blocked** | v2.1.189 - Browsers block `beforeunload`/`pagehide`. Now uses `visibilitychange` to sync before close. |
| 34 | **Hue/WiZ Effect restore bug** | v2.1.207 - Effect nodes were turning lights back ON at midnight. Now only clear effect, don't restore on/off state. |
| 35 | **REFRESH button not fetching states** | v2.1.208 - REFRESH now fetches device states, not just dropdown list. Helps after overnight sessions. |
| 36 | **Stale state after overnight** | v2.1.209 - Device state bars now auto-refresh on socket reconnect AND when user returns to tab (visibilitychange). No more stale data after sleep/screensaver. |
| 37 | **Engine not mirroring frontend** | v2.1.210 - Engine's `deviceStates` was out of sync when frontend active. Moved state tracking BEFORE skip check in `controlDevice()`. Engine now mirrors frontend exactly. |
| 38 | **Debug node breaking data flow** | v2.1.211 - Debug node was `null` (frontend-only) in backend registry. Added backend `DebugNode` pass-through implementation so data flows correctly through Debug → downstream nodes. |
| 39 | **Device Timeline choppy segments** | v2.1.212 - Timeline segments now merge properly into continuous bars. Was showing separate segments for each log entry instead of merged state spans. |
| 40 | **Sender/Receiver dropdown drag** | v2.1.212 - Clicking dropdown to select buffer no longer drags the node. Added `stopPropagation()` to pointer events on dropdowns. |
| 41 | **ColorLogic.js property mismatch** | v2.1.234 - `rgbToHsv()` now returns both `{h,s,v}` AND `{hue,sat,val}` for legacy compatibility. |
| 42 | **Frontend/Backend handoff color gap** | v2.1.237 - `forceHsvResync()` clears throttle state so colors sync immediately when backend takes over. |

---

## 🟢 POST-BETA / LOW PRIORITY

- Add TypeScript (gradual migration)
- Add Mobile-Responsive CSS
- Add Undo/Redo History (rete-history-plugin)
- Add Node Search in context menu
- Performance optimization
- Analytics/Telemetry (opt-in)

---

## 🔵 FUTURE NATIVE DEVICE SUPPORT

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

## What's Working Well

- **Plugin System**: Runtime-loaded, no rebuild needed, error-tolerant
- **Real-time Updates**: Socket.IO for device state changes
- **Multi-Platform**: Home Assistant, Hue, Kasa, Shelly support
- **User Experience**: Loading overlay, toast notifications, auto-save
- **Developer Experience**: Debug flags per node, `window.T2Toast` for plugins
- **Stability**: Error boundaries prevent full crashes
- **Update System**: Auto-check from `stable` branch, preserves graph during updates
- **Performance Mode**: GPU-friendly option for complex graphs (40+ nodes)
- **Camera Integration**: IP camera panel with MJPEG/snapshot support
