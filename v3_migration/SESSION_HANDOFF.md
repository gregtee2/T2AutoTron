# Session Handoff - December 20, 2025

## Addendum (Session 13 - Group Navigation & HueEffectNode Fixes)

### What changed (Session 13 - Claude Opus 4.5)

**Current Version: 2.1.109**

#### ✨ Feature: Group Navigation Buttons (v2.1.107)
- **What it does**: Adds quick-jump buttons in the Event Log header for each Backdrop group on canvas
- **Why**: Large graphs with many groups are hard to navigate. Now you can instantly zoom to any group
- **How it works**: 
  - Buttons are color-coded to match backdrop colors
  - "⊞ All" button zooms to fit entire canvas
  - Buttons auto-update when groups are created, renamed, recolored, or deleted
- **Files**: `App.jsx`, `App.css`, `Editor.jsx`, `BackdropNode.js`

#### 🔧 Fix 1: Group Navigation Zoom Centering (v2.1.108)
- **Symptom**: Clicking a group button didn't properly center the viewport on the group
- **Root Cause**: `AreaExtensions.zoomAt()` doesn't know about Backdrop's custom width/height
- **Fix**: Manual zoom calculation using backdrop position, width, height, and container dimensions
- **Files**: `App.jsx` - `focusBackdrop()` function

#### 🔧 Fix 2: Console Log Spam (v2.1.108)
- **Symptom**: Browser console flooded with DeviceStateControl debug messages
- **Root Cause**: Debug console.log statements left in from brightness debugging
- **Fix**: Removed console.log statements at lines 41 and 69
- **Files**: `frontend/src/controls/DeviceStateControl.jsx`

#### 🔧 Fix 3: HueEffectNode Light Discovery in Add-on (v2.1.109)
- **Symptom**: HueEffectNode couldn't discover Hue lights when running in HA add-on
- **Root Cause**: Node used raw `fetch()` instead of `window.apiFetch()` which handles HA ingress URL
- **Fix**: Replaced all 6 `fetch()` calls with `(window.apiFetch || fetch)()`
- **Files**: `backend/plugins/HueEffectNode.js`

### 🦴 Caveman Summary
1. **Group Buttons**: Added quick-jump buttons so you can hop between groups on your canvas like bookmarks
2. **Zoom Fix**: The jump buttons now actually land you in the center of the group, not off to the side
3. **Console Cleanup**: Removed debug yelling that was cluttering the browser console
4. **Hue Discovery**: Fixed the add-on phone number (URL) for discovering Hue lights

### Files Touched (Session 13)
- `v3_migration/frontend/src/App.jsx` - backdropGroups state, focusBackdrop(), refreshBackdropGroups()
- `v3_migration/frontend/src/App.css` - .group-nav-buttons, .group-nav-btn styles
- `v3_migration/frontend/src/Editor.jsx` - window.refreshBackdropGroups() calls
- `v3_migration/backend/plugins/BackdropNode.js` - window.BackdropColorPalette, refresh triggers
- `v3_migration/frontend/src/controls/DeviceStateControl.jsx` - Removed debug logging
- `v3_migration/backend/plugins/HueEffectNode.js` - Use apiFetch for ingress compatibility

---

# Session Handoff - December 19, 2025

## Addendum (Session 12 - HAGenericDeviceNode Refactor)

### What changed (Session 12 - Claude Opus 4.5)

**Current Version: 2.1.97**

#### 🔧 Fix 1: HAGenericDeviceNode Auto-Refresh Removal (v2.1.97)
- **Symptom**: Performance degradation with many device nodes, UI sluggish
- **Root Cause**: Each HAGenericDeviceNode had a 30-second `startAutoRefresh()` interval polling the HA API. 20 nodes = 2,400 API calls per hour!
- **Fix**: Removed `startAutoRefresh()`, `autoRefreshInterval` property, and interval cleanup. Devices update via Socket.IO push notifications instead.
- **Files**: `backend/plugins/HAGenericDeviceNode.js`

#### 🔧 Fix 2: Brightness Bar Shows 39% Instead of 100% (v2.1.97)
- **Symptom**: Light correctly at full brightness (254), but color bar showed only 39% width and "39%" label
- **Root Cause**: Double normalization - backend converts 0-255 → 0-100 correctly, but UI components were dividing by 255 again: `100/255*100 = 39%`
- **Fix**: Updated `ColorBarControl` and `DeviceStateControl` in `00_SharedControlsPlugin.js` to expect 0-100 values directly
- **Files**: `backend/plugins/00_SharedControlsPlugin.js`

#### 🔧 Fix 3: HAGenericDeviceNode HA-Only Refactor (v2.1.97)
- **Symptom**: Node was overly complex "Swiss Army knife" with 3 code paths for Kasa, Hue, and HA
- **Root Cause**: Original design assumed direct device control. But HA integrates Kasa/Hue devices, and dedicated `KasaLightNode`/`HueLightNode` exist for direct control
- **Fix**: Removed ~120 lines of Kasa/Hue code from 5 methods:
  - `setDevicesState()` - Removed Kasa hsv format, Hue 0-65535 conversion, 3 API endpoints → 1
  - `onTrigger()` - Removed Kasa toggle endpoint branch
  - `handleDeviceStateUpdate()` - Removed Hue brightness 0-254 conversion
  - `fetchDeviceState()` - Removed Hue direct API path
  - `applyHSVInput()` - Removed Kasa/Hue specific payload formats
- **Result**: Node went from ~1700 lines to ~1577 lines (123 lines removed)
- **Files**: `backend/plugins/HAGenericDeviceNode.js`

### 🦴 Caveman Summary
1. **Auto-Refresh Removed**: Each device node was calling the HA API every 30 seconds "just to check" - like constantly asking "are you there?" on a phone call. Now they wait for HA to push updates via WebSocket.
2. **Brightness Display Bug**: Backend says "100%" but UI was converting it again, ending up with 39%. Like a translator who translates an already-English sentence into English again.
3. **HA-Only Refactor**: The node was a confusing Swiss Army knife trying to speak 3 languages (Kasa, Hue, HA). Now it only speaks HA format, and HA handles translation to device-specific protocols.

### Brightness Scale Reference (NEW)
| Layer | Scale | Notes |
|-------|-------|-------|
| HA raw brightness | 0-255 | Raw attribute from Home Assistant |
| Backend API response | 0-100 | `homeAssistantManager.getState()` normalizes |
| Frontend UI display | 0-100 | ColorBarControl, DeviceStateControl expect this |
| HSV input brightness | 0-255 | Timeline/Spline nodes output 0-255 |
| HA API payload | 0-255 | When sending commands TO HA |

**Rule**: Backend normalizes to 0-100 for UI. Frontend should NOT divide by 255 again.

### Files Touched (Session 12)
- `v3_migration/backend/plugins/HAGenericDeviceNode.js` - Auto-refresh removal, HA-only refactor (123 lines removed)
- `v3_migration/backend/plugins/00_SharedControlsPlugin.js` - Brightness normalization fix
- `.github/copilot-instructions.md` - Updated with fixes and brightness scale documentation

---

## Addendum (Session 11 - Memory Leak Audit)

### What changed (Session 11 - Claude Opus 4.5)

**Current Version: 2.1.94**

#### 🔧 Fix 1: KasaLightNode Socket Listener Leak (v2.1.94)
- **Symptom**: UI degraded after extended use with Kasa device nodes
- **Root Cause**: `initializeSocketIO()` registered anonymous socket listener that could never be removed
- **Fix**: Store handler as `_onDeviceStateUpdate` reference, add `destroy()` method with `socket.off()` and debounce timer cleanup
- **Files**: `backend/plugins/KasaLightNode.js`

#### 🔧 Fix 2: HueLightNode Debounce Timer Leak (v2.1.94)
- **Symptom**: Orphaned timeouts if node deleted mid-debounce
- **Root Cause**: No `destroy()` method to clean up `hsvDebounceTimer`
- **Fix**: Added `destroy()` method that clears debounce timer
- **Files**: `backend/plugins/HueLightNode.js`

#### 🔧 Fix 3: LogicGateBase PulseTimeout Leak (v2.1.94)
- **Symptom**: Logic gates with pulse mode could leak timeouts
- **Root Cause**: `pulseTimeout` set in `handlePulseMode()` was never cleaned on node removal
- **Fix**: Added `destroy()` method to `BaseLogicGateNode` class (affects AND, OR, XOR, NOT, NAND, NOR gates)
- **Files**: `backend/plugins/00_LogicGateBasePlugin.js`

### 🦴 Caveman Summary
Three types of nodes were leaving messes behind when deleted:
1. **Kasa Lights**: Left phone lines (socket listeners) connected even after leaving the building
2. **Hue Lights**: Left timers running even after being fired
3. **Logic Gates**: Left their pulse countdown timers ticking even after being unplugged

Now they all clean up after themselves when removed! 🧹

### Files Touched (Session 11)
- `v3_migration/backend/plugins/KasaLightNode.js` - Socket handler reference + destroy()
- `v3_migration/backend/plugins/HueLightNode.js` - destroy() for debounce timer
- `v3_migration/backend/plugins/00_LogicGateBasePlugin.js` - destroy() for pulseTimeout
- `v3_migration/backend/package.json` - Version 2.1.94
- `home-assistant-addons/t2autotron/config.yaml` - Version 2.1.94
- `CHANGELOG.md` - Added 2.1.94 entry

---

## Addendum (Session 10 - Performance & Download Feature)

### What changed (Session 10 - Claude Opus 4.5)

**Current Version: 2.1.93**

#### 🔧 Fix 1: AND Gate 30-Second Delay (v2.1.90)
- **Symptom**: Logic nodes (AND, OR, etc.) connected to TimeRangeNode or DayOfWeekComparisonNode took ~30 seconds to update
- **Root Cause**: TimeRangeNode and DayOfWeekComparisonNode had no internal "clock" - only recalculated on slider change
- **Fix**: Added `setInterval` to continuously trigger `changeCallback()` - TimeRangeNode every 1 second, DayOfWeekComparisonNode every 60 seconds
- **Files**: `backend/plugins/TimeRangeNode.js`, `backend/plugins/DayOfWeekComparisonNode.js`

#### 🔧 Fix 2: Memory Leak / Performance Degradation (v2.1.91)
- **Symptom**: UI got sluggish over time, excessive CPU usage
- **Root Cause**: TimeRangeNode, DayOfWeekComparisonNode, and SplineTimelineColorNode were triggering changeCallback every tick (100+ times/second combined) even when values hadn't changed
- **Fixes**:
  - TimeRangeNode: Only triggers changeCallback when `isInRange` actually changes (uses `lastIsInRangeRef`)
  - DayOfWeekComparisonNode: Same pattern with `lastIsActiveRef`
  - SplineTimelineColorNode: Reduced UI interval from 50ms to 200ms
- **Files**: `backend/plugins/TimeRangeNode.js`, `backend/plugins/DayOfWeekComparisonNode.js`, `backend/plugins/SplineTimelineColorNode.js`

#### 🔧 Fix 3: Timeline Color Broken After Performance Fix (v2.1.92)
- **Symptom**: Timeline Color node stopped producing output after v2.1.91 changes
- **Root Cause**: Node needed engine updates to output, but performance fix removed excessive changeCallback calls
- **Fix**: Added separate engine update interval that triggers changeCallback only when actively producing output (timerRunning, timeActive, or previewActive)
- **Files**: `backend/plugins/SplineTimelineColorNode.js`

#### ✨ Feature: Download Graph (v2.1.93)
- **Request**: User wanted to transfer graphs from Pi (addon) to Windows (desktop)
- **Implementation**:
  - "📥 Download Graph" button in Control Panel downloads current graph
  - "📥" button next to each saved graph in Load Graph modal
  - Uses Blob + createObjectURL for browser download
- **Files**: `frontend/src/ui/Dock.jsx`, `frontend/src/ui/Dock.css`

### 🦴 Caveman Summary
1. **AND Gate Delay**: Time nodes were lazy employees - only worked when poked. Now they check their inbox every second automatically.
2. **Memory Leak**: Those same nodes were sending 100+ "I'm still here!" messages per second. Now they only speak up when something actually changes.
3. **Timeline Broken**: After making nodes less chatty, Timeline got too quiet and stopped working. Added a separate "work alarm" just for Timeline.
4. **Download Feature**: You can now save your graphs as files on your computer - backup or transfer from Pi to Windows!

### Version Progression (Session 10)
- 2.1.87 → 2.1.90 (AND gate delay fix with intervals)
- 2.1.90 → 2.1.91 (Performance fix - only trigger on change)
- 2.1.91 → 2.1.92 (Timeline Color engine interval restored)
- 2.1.92 → 2.1.93 (Download Graph feature)

### Files Touched (Session 10)
- `v3_migration/backend/plugins/TimeRangeNode.js` - Interval + change-only triggers
- `v3_migration/backend/plugins/DayOfWeekComparisonNode.js` - Interval + change-only triggers  
- `v3_migration/backend/plugins/SplineTimelineColorNode.js` - UI interval 200ms, separate engine interval
- `v3_migration/frontend/src/ui/Dock.jsx` - Download Graph buttons + handleDownloadServerGraph
- `v3_migration/frontend/src/ui/Dock.css` - .graph-download-btn styling
- `v3_migration/backend/package.json` - Version bumps
- `home-assistant-addons/t2autotron/config.yaml` - Version 2.1.93

### Graph Storage Locations
- **HA Add-on**: `/data/graphs/` (persistent Docker volume)
- **Desktop Electron**: `Saved_Graphs/` folder in project root

### Known Gap: Frontend/Backend Buffer Isolation
- `window.AutoTronBuffer` (frontend) and backend `AutoTronBuffer` Map are NOT synced
- Frontend editor sets buffers, backend engine has separate buffer state
- This causes some nodes to not work correctly in headless mode
- **Workaround**: Use device nodes directly or via HA automations for 24/7 operation
- **Future Fix**: Sync buffers via Socket.IO when editor connects

### Notes for Next Session
- Download feature deployed and working
- Buffer sync is a known gap, not blocking but good to document
- Performance is stable now - nodes only trigger on actual value changes

---

## Addendum (Session 9 - Memory Leaks & Dashboard Fixes)

### What changed (Session 9 - Claude Opus 4.5)

**Current Version: 2.1.87**

#### 🧠 Agent Workflow Note
**USE SUBAGENTS FOR RESEARCH-HEAVY TASKS** - When auditing codebase (e.g., "find all X and check if Y"), spawn a subagent instead of doing 15+ manual grep/read calls. Benefits:
- Subagent gets its own context window, returns ~50 line summary
- Saves ~10x tokens in main context (15,000 → 1,500)
- Session lasts longer before context fills up
- Cleaner conversation, structured output
- Example: "Audit all setInterval usages for cleanup" found DelayNode bug in one call

#### 🔧 Fix 1: Timeline Color Numerical Mode Backend (v2.1.82)
- **Symptom**: Numerical mode Timeline Color node wasn't working in headless/backend mode
- **Root Cause**: Backend SplineTimelineColorNode didn't have `startValue`/`endValue` properties or proper position mapping
- **Fix**: Added properties, map input: `(value - start) / (end - start)`
- **Files**: `v3_migration/backend/src/engine/nodes/ColorNodes.js`

#### 🔧 Fix 2: HADeviceStateNode Property Name (v2.1.83)
- **Symptom**: HADeviceStateNode wasn't finding devices in backend engine
- **Root Cause**: Frontend saves `selectedDeviceId`, backend expected `entityId`
- **Fix**: Added `selectedDeviceId` property, sync in restore()
- **Files**: `v3_migration/backend/src/engine/nodes/HADeviceNodes.js`

#### 🔧 Fix 3: Debug Dashboard Stale Cache (v2.1.84)
- **Symptom**: Dashboard showed "Engine says ON, HA says OFF" but devices were actually ON
- **Root Cause**: `/api/debug/all` returned cached device states, not fresh data
- **Fix**: Endpoint now fetches directly from HA API, bypassing cache
- **Files**: `v3_migration/backend/src/server.js`

#### 🔧 Fix 4: Dashboard Served from Server (v2.1.85)
- **Symptom**: User had stale desktop copy of debug_dashboard.html
- **Fix**: Added `/debug` route that serves dashboard directly from server
- **Benefit**: Always current version, no manual file updates needed
- **Files**: `v3_migration/backend/src/server.js`, `v3_migration/backend/src/debug_dashboard.html`

#### 🔧 Fix 5: Memory Leaks in HA Nodes (v2.1.86)
- **Symptom**: UI got sluggish after hours, devices stopped toggling until restart
- **Root Cause**: Socket listeners registered in Node class never cleaned up on unmount
- **Fix**: Added `useEffect` cleanup that calls `data.destroy()` on component unmount
- **Files**: `HAGenericDeviceNode.js`, `HADeviceAutomationNode.js`, `HADeviceStateOutputNode.js`

#### 🔧 Fix 6: Numerical Axis Tick Marks (v2.1.86)
- **Symptom**: Timeline Color numerical mode only showed min/max values on axis
- **Fix**: Added intermediate tick marks at nice intervals (10s, 20s based on range)
- **Files**: `v3_migration/backend/plugins/SplineTimelineColorNode.js`

#### 🔧 Fix 7: DelayNode Memory Leak (v2.1.87)
- **Symptom**: Found via subagent audit - countdown interval leaked if node deleted while active
- **Root Cause**: No `destroy()` method to clean up `_countdownInterval`
- **Fix**: Added `destroy()` method + `useEffect` cleanup
- **Files**: `v3_migration/backend/plugins/DelayNode.js`

### Version Progression (Session 9)
- 2.1.77 → 2.1.82 (Timeline Color numerical backend)
- 2.1.82 → 2.1.83 (HADeviceStateNode property name)
- 2.1.83 → 2.1.84 (Fresh HA states in debug API)
- 2.1.84 → 2.1.85 (Dashboard at /debug endpoint)
- 2.1.85 → 2.1.86 (HA node memory leaks + axis ticks)
- 2.1.86 → 2.1.87 (DelayNode memory leak)

### Debug Dashboard Access
**Use this URL:** `http://<your-HA-IP>:3000/debug`
- Always serves latest version from server
- No need for desktop copies

---

## Addendum (Session 8 - Debug Dashboard & Bug Fixes)

### What changed (Session 8 - Claude Opus 4.5)

**Current Version: 2.1.77**

#### 🔧 Fix 1: Update Button False Positive (v2.1.76)
- **Symptom**: "Check for Updates" button in HA add-on always showed "Updates available!" even when on latest version
- **Root Cause**: The toast was shown whenever `data.addOnUpdate` existed, but didn't check if there actually was an update
- **Fix**: Now checks `data.hasUpdate` flag before showing update toast
- **Files**: `v3_migration/frontend/src/ui/Dock.jsx`

#### 🔧 Fix 2: Device Timeline Empty (v2.1.77)
- **Symptom**: Debug Dashboard "Device Timeline" panel always showed "No events to show" despite engine running
- **Root Cause**: `/api/engine/logs/device-history` endpoint searched for obsolete log categories (`DEVICE-CMD`, `TRIGGER`) that no longer exist in logs
- **Fix**: Updated endpoint to search for actual log categories: `HA-HSV-CHANGE`, `HA-DEVICE-SKIP`, `HA-DEVICE-SUCCESS`, etc.
- **Files**: `v3_migration/backend/src/api/routes/engineRoutes.js`

#### 🎛️ Debug Dashboard Enhancements (throughout Session 8)
- **Session Persistence**: Dashboard now saves events to localStorage (4hr expiry), survives browser refresh
- **Server Restart Detection**: Detects when server uptime goes backwards, shows restart history count
- **HSV Activity Tracking**: Activity Notes now show which lights are receiving HSV color commands
- **Scroll-to-Bug**: Clicking "BUGS found" badge scrolls to first mismatch with glow highlight effect
- **Clear Session Button**: 🗑️ button to wipe stored events and start fresh
- **Files**: `v3_migration/tools/debug_dashboard.html`

#### 🔍 API Endpoint: `/api/engine/device-states` (v2.1.73-75)
- Returns what backend engine thinks each device should be (on/off)
- Compares engine expected state vs actual HA state
- Now includes `hasHsvInput` flag for HSV-only nodes
- **Files**: `v3_migration/backend/src/api/routes/engineRoutes.js`

### 🦴 Caveman Summary
1. **Update button**: Was yelling "updates available!" even when there weren't any. Fixed to actually check.
2. **Timeline empty**: Dashboard was looking for the wrong event names in the log file. Like looking for "birthday party" entries in a calendar that only has "meeting" entries.
3. **Dashboard memory**: Before, refresh = all data lost. Now it remembers events for 4 hours.
4. **HSV tracking**: Dashboard now knows which lights are getting color commands (not just on/off).

### Version Progression (Session 8)
- 2.1.68 → 2.1.73 (device-states endpoint, dashboard enhancements)
- 2.1.73 → 2.1.74 (deviceStates tracking fix)
- 2.1.74 → 2.1.75 (HSV-only nodes report as ON)
- 2.1.75 → 2.1.76 (Update button false positive fix)
- 2.1.76 → 2.1.77 (Device timeline empty fix)

### Files Touched (Session 8)
- `v3_migration/backend/src/api/routes/engineRoutes.js` - device-states endpoint, device-history fix
- `v3_migration/tools/debug_dashboard.html` - All dashboard enhancements
- `v3_migration/frontend/src/ui/Dock.jsx` - Update button fix
- `v3_migration/backend/package.json` - Version bumps
- `home-assistant-addons/t2autotron/config.yaml` - Version bumps
- `CHANGELOG.md` - Version entries

### Testing
1. Update add-on to 2.1.77
2. Open Debug Dashboard, point at T2 server
3. Device Timeline should now show colored bars for device events
4. "Check for Updates" should correctly report no updates when on latest
5. Refresh dashboard - events should persist (localStorage)

### Tailscale for Remote Access
User asked about accessing HA remotely. Recommended Tailscale:
- Free for personal use (up to 100 devices)
- No port forwarding required
- End-to-end encrypted VPN mesh
- Install on HA (via add-on) + laptop/phone
- Access HA at `http://100.x.x.x:8123` from anywhere
- User successfully tested from Mac via Tailscale

### Notes for Next Session
- Debug Dashboard is now fully functional for troubleshooting
- All v2.1.7x fixes are about reporting/display accuracy
- Engine behavior unchanged - these are observation tools

---

## Addendum (Session 7 - HA Add-on Fixes)

### What changed (Session 7 - Claude Opus 4.5)

**Current Version: 2.1.68**

#### 🔧 Fix 1: Dropdown Race Condition - Improved Retry (v2.1.65-66)
- **Symptom**: HA device dropdowns empty after loading saved graph, populated after ~30 seconds
- **Root Cause**: React components not mounted when `updateDeviceSelectorOptions()` called
- **Fixes**:
  - Added `requestAnimationFrame` double-wait before updating dropdowns
  - Increased retries from 5 to 10, using RAF timing instead of fixed setTimeout
  - Added 1-second retry if initial fetch returns empty
  - Added 2-second fallback retry for slow operations
- **Files**: `HAGenericDeviceNode.js`

#### 🔧 Fix 2: Null Outputs After Graph Load (v2.1.67)
- **Symptom**: Debug nodes showed "null" for trigger outputs immediately after loading graph
- **Root Cause**: `processImmediate()` ran immediately after `graphLoadComplete`, but async device fetches hadn't completed yet
- **Fix**: Added delayed engine processing:
  - First `processImmediate()` at 500ms after graphLoadComplete
  - Second `processImmediate()` at 1500ms to catch slow operations
- **Files**: `Editor.jsx`

#### 🔧 Fix 3: Kasa Devices Not Found (v2.1.68)
- **Symptom**: Kasa plug nodes couldn't find devices in HA add-on (worked on desktop)
- **Root Cause**: Docker containers are network-isolated; Kasa uses UDP broadcast for discovery
- **Fix**: Added `host_network: true` to add-on config.yaml
- **Files**: `home-assistant-addons/t2autotron/config.yaml`

### 🦴 Caveman Summary
1. **Dropdowns**: Code was trying to fill cups before they were on the table. Now it waits.
2. **Null outputs**: Engine asked "what's for dinner?" while cook was still shopping. Now it waits for cook to get home.
3. **Kasa**: Docker container was in a soundproof room, couldn't hear Kasa devices yelling. Opened the walls.

### Version Progression (Session 7)
- 2.1.64 → 2.1.65 (RAF timing for dropdown)
- 2.1.65 → 2.1.66 (Device fetch retry logic)
- 2.1.66 → 2.1.67 (Delayed processImmediate)
- 2.1.67 → 2.1.68 (host_network for Kasa/Hue)

### Files Touched (Session 7)
- `v3_migration/backend/plugins/HAGenericDeviceNode.js` - Improved dropdown retry with RAF, device fetch retries
- `v3_migration/frontend/src/Editor.jsx` - Delayed processImmediate after graph load
- `v3_migration/backend/package.json` - Version bumps
- `home-assistant-addons/t2autotron/config.yaml` - Added host_network: true
- `v3_migration/backend/frontend/assets/` - Cleaned stale JS files, new builds

### Testing Needed
1. Update add-on to 2.1.68 (requires rebuild for host_network change)
2. Load saved graph → dropdowns should populate within ~2-3 seconds
3. Check Debug nodes → should show actual values, not null
4. Kasa plug nodes → should discover devices on local network

### Notes for Next Session
- Context got very long this session - fresh start recommended
- If Kasa still doesn't work, check Docker logs for UDP errors
- Submodule workflow documented in copilot-instructions.md (push submodule first, then parent)

---

## Addendum (Session 6 - Device Dropdown Fix)

### What changed (Session 6 - Claude Opus 4.5)

#### 🔧 Fixed HA Device Dropdown Empty After Graph Load (Add-on)
- **Symptom**: In the HA add-on, loading a saved graph caused all HA Generic Device node dropdowns to show no devices. Fresh nodes worked fine.
- **Root Cause**: Race condition between device fetching and React component mounting:
  1. Graph loads, dropdowns are created with empty device list
  2. `graphLoadComplete` event fires, `fetchDevices()` runs
  3. `updateDeviceSelectorOptions()` calls `ctrl.updateDropdown()` to refresh React
  4. **BUT** React component's `useEffect` that sets up `updateDropdown` callback might not have run yet
  5. Result: `ctrl.updateDropdown` is undefined, dropdown never updates
- **Fixes**:
  1. Added retry mechanism to `updateDeviceSelectorOptions()` - retries up to 5 times with increasing delays (100-500ms) if `updateDropdown` isn't available yet
  2. Added HTTP fallback in `_onGraphLoadComplete` - if socket cache returns empty, falls back to HTTP fetch
  3. Removed duplicate random 0-2s stagger delay in `restore()` that was causing unnecessary delays

### 🦴 Caveman Explanation
When loading a saved graph, the dropdown boxes for picking HA devices were empty because the code tried to fill them BEFORE the dropdown was ready to accept data. Now the code politely waits and tries again if the dropdown isn't ready yet.

### Files touched (Session 6)
- `v3_migration/backend/plugins/HAGenericDeviceNode.js` - Added retry mechanism and HTTP fallback
- `v3_migration/backend/package.json` - Bumped to 2.1.64
- `home-assistant-addons/t2autotron/config.yaml` - Bumped to 2.1.64
- `CHANGELOG.md` - Added 2.1.64 entry

### Version Bump
- v2.1.63 → v2.1.64

---

## Addendum (Session 5 - Bug Reporting & Documentation)

### What changed (Session 5 - Claude Opus 4.5)

#### 🐛 Added Report Bug Button
- Added 🐛 **Report Bug** button to Control Panel (Dock.jsx)
- Button fetches version fresh from server, gathers debug info, opens GitHub issue pre-filled
- Created `.github/ISSUE_TEMPLATE/bug_report.md` with structured bug report format
- Created `.github/ISSUE_TEMPLATE/feature_request.md` for feature requests
- Added `dock-btn-bug` CSS styling (red theme)

#### 📚 Updated Addon Landing Page (README.md)
- Added origin story: VFX artist wanting node-based automation since 2003, LLMs made it possible
- Added "Why T2AutoTron vs Node-RED" comparison table (honest, not competitive)
- Added "Why Share This?" section asking users to test and report bugs

#### 📖 Updated DOCS.md (Documentation Tab)
- Full Node-RED comparison with detailed table
- Complete origin story with LLMs changing everything
- "Why Share This?" call for beta testers

#### 🐞 Fixed Forecast Timezone Bug
- **Symptom**: 5-day forecast showed "yesterday" as first day in HA add-on
- **Root Cause**: Open-Meteo dates like "2025-12-17" parsed as midnight UTC, then converted to local time (could become Dec 16 in some timezones)
- **Fix**: Use `getUTCDay()`, `getUTCMonth()`, `getUTCDate()` instead of local date methods
- **File**: `frontend/src/ui/ForecastPanel.jsx`

#### 🔧 Fixed SaveModal Import Path
- **Symptom**: HA add-on v2.1.60 failed to build
- **Error**: `Could not resolve "../apiConfig" from "src/ui/SaveModal.jsx"`
- **Fix**: Changed import from `../apiConfig` to `../utils/apiBase`
- **File**: `frontend/src/ui/SaveModal.jsx`

### 🦴 Caveman Explanation
The weather forecast was confused about what day it is because of timezones. We told it "just read the date exactly as written, don't try to be smart about timezones." Also added a big red button for users to easily report bugs.

### Files touched (Session 5)
- `v3_migration/frontend/src/ui/Dock.jsx` - Added Report Bug button with async version fetch
- `v3_migration/frontend/src/ui/Dock.css` - Added .dock-btn-bug styling
- `v3_migration/frontend/src/ui/ForecastPanel.jsx` - Fixed timezone issue in formatDate()
- `v3_migration/frontend/src/ui/SaveModal.jsx` - Fixed import path
- `.github/ISSUE_TEMPLATE/bug_report.md` - New bug report template
- `.github/ISSUE_TEMPLATE/feature_request.md` - New feature request template
- `home-assistant-addons/t2autotron/README.md` - Added origin story, Node-RED comparison
- `home-assistant-addons/t2autotron/DOCS.md` - Added full comparison and origin story

### Version Bumps (Session 5)
- v2.1.60 → v2.1.61 (SaveModal fix)
- v2.1.61 → v2.1.62 (Forecast timezone fix)
- v2.1.62 → v2.1.63 (Report Bug button)

### Verification
- ✅ All builds succeed
- ✅ Report Bug button opens GitHub with pre-filled debug info
- ✅ Forecast shows correct dates (today as first day)
- ✅ Addon landing page has origin story
- ✅ Commits pushed to main AND stable

---
## Addendum (Session 4 - Timeline Color Fix)

### What changed (Session 4 - Claude Opus 4.5)

#### 🔧 Fixed Timeline Color nodes outputting null in headless mode
- **Symptom**: Lights were ON but colors weren't changing. Timeline Color nodes produced `null` instead of HSV values.
- **Root Cause #1**: Backend `TimeOfDayNode` was missing `startTime` and `endTime` outputs that the frontend plugin had. Timeline node couldn't calculate position without knowing when the period started/ended.
- **Root Cause #2**: Backend engine's `gatherInputs()` always returns arrays (`{startTime: ["08:00"]}`), but `SplineTimelineColorNode` was reading `inputs.startTime` directly instead of `inputs.startTime?.[0]`.
- **Fixes**:
  - Added `formatMinutesToTime()` helper and `startTime`/`endTime` outputs to `TimeNodes.js`
  - Updated `ColorNodes.js` to use `inputs.xxx?.[0]` pattern like all other backend nodes

#### 🆕 Added 3 missing backend node implementations (100% coverage)
- **SplineCurveNode**: Maps input through editable spline curve with catmull-rom interpolation
- **WatchdogNode**: Monitors input, triggers alert if no data within timeout period
- **HADeviceAutomationNode**: Extracts specific fields (brightness, hue, temp, etc.) from device state

### 🦴 Caveman Explanation
The Timeline node couldn't paint colors because nobody told it what time the party started, and when they finally did, the time was wrapped in a box it didn't know how to open.

### Files touched (Session 4)
- `v3_migration/backend/src/engine/nodes/TimeNodes.js` - Added startTime/endTime outputs
- `v3_migration/backend/src/engine/nodes/ColorNodes.js` - Fixed array access pattern
- `v3_migration/backend/src/engine/nodes/UtilityNodes.js` - Added SplineCurveNode, WatchdogNode
- `v3_migration/backend/src/engine/nodes/HADeviceNodes.js` - Added HADeviceAutomationNode

### Verification
- ✅ All 71 tests pass
- ✅ Timeline Color nodes now output HSV values in headless mode
- ✅ Lights change colors correctly when browser is closed
- ✅ Commits pushed to main AND stable: `f47d8bc`, `df1b1f7`

---

## Addendum (Session 3 - Late Night)

### What changed (Session 3 - Claude Opus 4.5)
- **Eliminated HA device log spam** (hundreds of "❌ Invalid HA device" messages)
  - Symptom: Console flooded with error messages for every sensor, switch, binary_sensor in Home Assistant, making logs unreadable.
  - Root cause: `socketHandlers.js` was checking for `device.entity_id` (raw HA format) but `homeAssistantManager.getDevices()` returns pre-transformed format with `device.id`. Every device failed validation.
  - Fix: Changed validation to check `device.id` instead of `device.entity_id`, reduced log level to 'warn', truncated JSON output.

### Files touched (Session 3)
- `v3_migration/backend/src/api/socketHandlers.js` - Fixed HA device validation
- `.github/copilot-instructions.md` - Added documentation for this fix

### Verification
- Server starts with clean logs (no spam)
- All HA devices still populate correctly
- Commit pushed to main: `6b29d27`

---

## Addendum (Session 2 - Earlier Today)

### What changed (Session 2 - Claude Opus 4.5)
- **Fixed Follow mode not syncing on graph load** (the basement lights issue!)
  - Symptom: HA Generic Device nodes in "Follow" mode stayed ON even when trigger input was FALSE after loading a graph.
  - Root cause: Line 463 in `HAGenericDeviceNode.js` had `|| "Toggle"` as the default mode instead of `|| "Follow"`. The UI showed "Follow" was selected, but the logic was using Toggle mode.
  - Fix: Changed default from `"Toggle"` to `"Follow"` to match the UI dropdown default.
- **Fixed same bug in KasaPlugNode.js** (line 150) - was also defaulting to Toggle.
- **Fixed inconsistent default in HAGenericDeviceNode restore** (line 387) - was also using Toggle.
- **Fixed package.json path error** in server.js
  - Symptom: `Cannot find module '../../package.json'` error on `/api/version` endpoint.
  - Root cause: server.js is in `backend/src/` but was using `../../package.json` (goes to v3_migration root) instead of `../package.json` (goes to backend/).
  - Fix: Changed path from `../../package.json` to `../package.json`.
- **Fixed headless mode buffer misalignment** (Sender/Receiver data going to wrong devices)
  - Symptom: In headless mode, Receivers were getting data from wrong Senders - lights were getting wrong colors.
  - Root cause: The `topologicalSort()` in BackendEngine.js was putting Receivers LAST in execution order. This meant consumer nodes (like HAGenericDevice) ran BEFORE the Receivers they depended on, getting stale/empty data.
  - Fix: Added virtual dependencies so every Receiver depends on every Sender. Now execution order is: Senders → Receivers → Consumers (respecting both buffer and wire dependencies).

### Files touched (Session 2)
- `v3_migration/backend/plugins/HAGenericDeviceNode.js` - Fixed 2 wrong defaults (lines 387, 463)
- `v3_migration/backend/plugins/KasaPlugNode.js` - Fixed wrong default (line 150)
- `v3_migration/backend/src/server.js` - Fixed package.json path
- `v3_migration/backend/src/engine/BackendEngine.js` - Fixed topological sort for buffer dependencies

### Verification
- All 71 tests pass
- All modified files pass syntax check (`node --check`)
- User confirmed Follow mode now works correctly on graph load
- Headless mode buffer fix ready for testing

---

## Addendum (earlier work today - Session 1)

### What changed
- Fixed a hard syntax break that prevented Home Assistant integration from loading.
  - Symptom: server starts, but logs `Failed to load manager homeAssistantManager.js: Missing catch or finally after try` and HA shows Offline.
  - Root cause: `getState()` in the HA manager had accidental pasted fragments of `updateState()` inside it, making the file invalid JS.
  - Fix: restored a clean `getState()` implementation (cache -> fetch `/api/states/<entity>` -> normalize -> cache) and moved all action-selection/coercion logic back into `updateState()`.
- Improved HA “OFF reliability” by hardening boolean handling.
  - `updateState()` now safely interprets `true/false`, `1/0`, and strings like `"true"/"false"/"on"/"off"`.
  - This avoids JS truthiness bugs where `"false"` behaves like true.
- Kept backend tests green after the fix.
  - Ran: `node --check src/devices/managers/homeAssistantManager.js` (clean)
  - Ran: `npm test --silent` (71 tests passed)

### Files touched (latest)
- `v3_migration/backend/src/devices/managers/homeAssistantManager.js`
- (Earlier in this stabilization push) `v3_migration/backend/plugins/HAGenericDeviceNode.js` (post-command state re-fetch instead of optimistic UI state)
- (Earlier) `v3_migration/backend/src/server.js` (startup identity logs: PID/CWD/ENV_PATH to detect multiple servers)

### Known remaining issues / follow-ups
- ~~There is/was an unrelated runtime error seen in logs: `Cannot find module '../../package.json'` from `server.js` on some request path.~~ **FIXED** - path corrected.
- Operationally: ensure only one backend instance owns port 3000. The added PID/CWD/ENV_PATH logs help identify which process is the "real" server.
- **Backend engine headless mode** - Buffers don't work correctly when UI is closed. This is the next item to tackle.

### Quick verification steps
1) Start backend from `v3_migration/backend`:
   - `cd v3_migration/backend && npm start`
2) Watch startup logs:
   - HA manager should load (no “Missing catch or finally after try”).
3) In the UI, confirm HA shows connected and devices populate.
4) Toggle a problematic HA device OFF using HA Generic Device, then verify:
   - the node UI state matches the physical state (it now re-reads state after the command).

## 🚨 CURRENT STATE: RESTORED TO STABLE

**We are on the `main` branch (v2.1.55)** - the stable, working version.

All experimental backend engine changes are on `feature/unified-architecture` branch but that branch has issues. The user ended the session by restoring to `main` because things broke.

---

## THE BIG PICTURE

T2AutoTron is a **visual node-based automation editor** for smart home control (like Node-RED but focused on lighting/home automation). It has **two deployment modes**:

### 1. Home Assistant Add-on (Docker container)
- Runs inside Home Assistant as an add-on
- Users access via HA's web UI (ingress)
- **This is the production deployment for most users**

### 2. Local Electron App (Windows desktop)
- Standalone Windows app for development/power users
- Direct access, no HA required

---

## WHAT WE WERE TRYING TO FIX

### The Goal: Headless Mode Buffer System

**The Problem**: When the UI is open, everything works. When the UI is closed (headless mode), lights don't respond correctly to buffer-based automation.

**User's Description**: "I loaded the UI, changed the Kasa lights in HA, and they immediately flipped back to the UI intended state. I then quit UI to go headless, and they're not adjusting."

### How Buffers Work

Sender/Receiver nodes communicate via a **shared buffer** (not wires). This allows "wireless" connections:

```
[Spline Timeline] → [Sender: [HSV] Master Bedroom]
                                    ↓ (buffer)
[Receiver: [HSV] Master Bedroom] → [HA Generic Device]
```

The backend engine must:
1. Run Sender nodes FIRST (to populate buffers)
2. Run Receiver nodes SECOND (to read buffers)
3. Run consumer nodes LAST (to use the data)

---

## WHAT WE FIXED (on feature branch)

### Fix 1: Topological Sort with Virtual Buffer Dependencies
- Added virtual edges: Sender → Receiver → consumers
- Ensures execution order respects buffer data flow
- File: `BackendEngine.js`

### Fix 2: Buffer Name Normalization
- Strip `[HSV]`, `[Trigger]` prefixes before matching
- `[HSV] Master Bedroom` sender matches `[HSV] Master Bedroom` receiver
- File: `BackendEngine.js`

### Fix 3: Input Array Unwrapping
- `gatherInputs()` was returning `{trigger: [true]}` instead of `{trigger: true}`
- Now unwraps single-element arrays
- File: `BackendEngine.js`

### Fix 4: IntegerSelectorNode Registration
- Was marked as `null` (UI-only) but needed to run on backend
- Changed `'Integer Selector': null` → `'Integer Selector': 'IntegerSelectorNode'`
- File: `BackendNodeRegistry.js`

### Fix 5: HSVControlNode Kept as UI-Only
- Accidentally registered it, caused ALL lights to turn RED
- Reverted to `null` - it's a UI control, not a backend node
- File: `BackendNodeRegistry.js`

---

## WHAT BROKE

After all the fixes, something broke the **frontend UI**:

1. **Timeline Color node** not showing correct times
2. **HA Generic Device nodes** not responding
3. User saw: "There was no time on any of the timeline color nodes"

This happened AFTER fixing IntegerSelector and reverting HSVControl. We don't know exactly what caused the frontend issues.

---

## THE RESTORE

User said: "I'm getting tired and need stop this for the evening. Can we find a restore point?"

**Commands run:**
```bash
git stash          # Stash any uncommitted changes
git checkout main  # Switch to stable main branch
```

**Result:** Now on `main` branch (commit `d869205`, v2.1.55) - stable, working UI.

---

## BRANCH STATUS

| Branch | Commit | Status |
|--------|--------|--------|
| `main` | d869205 | ✅ STABLE - Currently checked out |
| `stable` | d869205 | ✅ STABLE - Same as main |
| `feature/unified-architecture` | 08b4ac2 | ⚠️ HAS ISSUES - Contains all fixes but frontend broke |

---

## IF CONTINUING THIS WORK

### Option A: Start Fresh from Main
1. Create new branch: `git checkout -b feature/backend-engine-v2`
2. Apply fixes ONE AT A TIME, testing after each
3. Test both frontend AND headless mode after each change

### Option B: Debug the Feature Branch
1. `git checkout feature/unified-architecture`
2. Compare files to main: `git diff main -- backend/src/engine/`
3. Find what broke the frontend
4. The stashed changes might be relevant: `git stash list`

### Key Files Changed on Feature Branch
- `backend/src/engine/BackendEngine.js` - Virtual dependencies, array unwrapping
- `backend/src/engine/BackendNodeRegistry.js` - IntegerSelector, HSVControl mappings
- `backend/src/engine/nodes/AdditionalNodes.js` - IntegerSelectorNode, HSVControlNode

---

## WHAT TO TEST

When making changes, verify BOTH:

1. **Frontend UI works:**
   - Timeline Color nodes show times
   - HA Generic Device nodes respond
   - Lights change when you adjust controls

2. **Headless mode works:**
   - Close UI, run only backend
   - Lights should maintain buffer-defined colors
   - Check with: `GET http://localhost:3000/api/engine/status`

---

## KEY FILES FOR THIS ISSUE

```
Backend Engine:
  backend/src/engine/BackendEngine.js       - Main engine, topological sort
  backend/src/engine/BackendNodeRegistry.js - Label → class mappings
  backend/src/engine/nodes/BufferNodes.js   - Sender/Receiver buffer comms
  backend/src/engine/nodes/AdditionalNodes.js - IntegerSelector, HSVControl

Frontend Plugins:
  backend/plugins/SplineTimelineColorNode.js - Timeline color UI
  backend/plugins/HAGenericDeviceNode.js     - HA device control UI
```

---

## 🦴 CAVEMAN SUMMARY

**What we tried to do:** Make lights keep their colors when you close the app.

**What we did:** Fixed several problems with how the server processes nodes.

**What went wrong:** After fixing the backend, the frontend UI stopped working. Timeline colors disappeared, lights wouldn't respond.

**Where we are now:** Went back to the version that works. All our fixes are saved on a different branch, but we need to figure out what broke the UI before using them.

---

## OTHER CONTEXT

### Current Version: 2.1.55

### Git Workflow
- `main` = development branch
- `stable` = production (users pull updates from here)
- Push to stable: `git push origin main:stable`

### Key Copilot Instructions
The repo has `.github/copilot-instructions.md` with detailed architecture info. Key points:
- Plugins are in `backend/plugins/` (NOT `frontend/src/nodes/`)
- Debug logging gated by `VERBOSE_LOGGING` env var
- Never call `changeCallback()` inside `data()` method
- Use `window.T2Controls` for shared UI components

---

# Addendum (Session 5 - 2025-12-17) - Graph Loading + Throttling Fixes

## Current Version: 2.1.58

## What Changed

### Problem 1: Graph Loading Takes 2 Minutes (Add-on)

**Symptom**: User reported the add-on took ~2 minutes to load the graph on startup.

**Investigation**: Graph has 133 nodes including 20 HA Generic Device nodes. During restore, each HAGenericDeviceNode was calling:
- `fetchDevices()` - Full device list from HA
- `fetchDeviceState()` for each selected device

With 20 nodes × 3 devices each = 60+ API calls during graph load, all firing simultaneously.

**Root Cause**: The `restore()` method was immediately calling `fetchDevices()` which then called `fetchDeviceState()` for each device. No awareness of "we're loading a graph, maybe wait."

**Fix**: Added `window.graphLoading` check in `restore()`:
```javascript
restore(state) {
    // ... restore properties ...
    
    // Wait for graph loading to complete before hitting HA API
    const waitForGraphLoad = () => {
        if (window.graphLoading) {
            setTimeout(waitForGraphLoad, 100);
            return;
        }
        // Now fetch devices
        this.fetchDevices();
    };
    setTimeout(waitForGraphLoad, 50);
}
```

**Commit**: `e9b50d2` - "fix: Defer HA device API calls during graph loading to prevent 2-minute load times"

---

### Problem 2: Christmas Lights Flashing/Popping (Headless Mode)

**Symptom**: User reported lights were "popping and flashing" during color fading when running in headless mode (UI closed). Not seen when UI is open.

**Investigation**: Backend engine was sending color commands every 200ms during color transitions. Zigbee lights can't handle more than ~1 command per 3-5 seconds.

**Root Cause**: The `HAGenericDeviceNode` backend implementation had:
- `MIN_FAST_INTERVAL = 200` (way too fast)
- `SIGNIFICANT_HUE_CHANGE = 0.01` (1% = too sensitive)

Combined with fast-changing spline timeline colors = constant rapid API calls.

**Fix**: Increased throttling thresholds:
```javascript
// Before
const MIN_FAST_INTERVAL = 200;
const SIGNIFICANT_HUE_CHANGE = 0.01;
const SIGNIFICANT_SAT_CHANGE = 0.05;
const SIGNIFICANT_BRI_CHANGE = 5;

// After
const MIN_FAST_INTERVAL = 3000;  // 3 seconds minimum
const SIGNIFICANT_HUE_CHANGE = 0.05;  // 5% threshold
const SIGNIFICANT_SAT_CHANGE = 0.10;  // 10% threshold
const SIGNIFICANT_BRI_CHANGE = 10;    // 10 units threshold
```

**Commit**: `0e5b94b` - "fix: Increase color change throttle to 3s minimum to prevent Zigbee light flashing/popping"

---

### Problem 3: Kitchen Lights Mystery

**Symptom**: User reported kitchen lights turned off when closing the browser.

**Investigation**: Checked engine logs - showed correct processing with `trigger=true`. Could not reproduce.

**Conclusion**: Likely timing coincidence with scheduled 10:30 PM off time, or initialization transient. No code changes made.

---

## Debug Dashboard Created

Created standalone HTML monitoring tool: `v3_migration/tools/debug_dashboard.html`

**Purpose**: Monitor T2 backend and lights without needing HA login.

**Features**:
- Only requires T2 backend URL (no HA token needed)
- Shows engine status (running/stopped, node count, ticks)
- Shows AutoTron buffers (color values, triggers)
- Shows HA light states
- Auto-refreshes every 3 seconds

**Backend API Endpoints Added**:
- `GET /api/debug/lights` - Returns HA lights via backend proxy
- `GET /api/debug/all` - Combined endpoint (engine + buffers + lights)

**Known Issue**: Light states panel displays "[OBJECT OBJECT]" instead of formatted values (cosmetic, low priority).

---

## Files Touched

**Frontend Plugin (HAGenericDeviceNode.js)**:
- Added `window.graphLoading` check in `restore()` to defer API calls

**Backend Engine Node (HADeviceNodes.js)**:
- Increased `MIN_FAST_INTERVAL` from 200ms to 3000ms
- Increased significant change thresholds (5% hue, 10% saturation, 10 brightness)

**Server (server.js)**:
- Added `/api/debug/lights` endpoint
- Added `/api/debug/all` endpoint

**New File (debug_dashboard.html)**:
- Standalone HTML monitoring tool

**Version Bumps**:
- `package.json` → 2.1.58
- `home-assistant-addons/t2autotron/config.yaml` → 2.1.58 (submodule)

---

## 🦴 Caveman Summary

**Problem 1**: Loading the graph took FOREVER (2 minutes). That's because every HA device node was yelling "GIVE ME ALL THE DEVICES!" at the same time. Now they politely wait until the graph is done loading.

**Problem 2**: Christmas lights were flashing like a disco ball. The server was shouting "CHANGE COLOR!" every 0.2 seconds. Zigbee lights can't handle that - they need 3 seconds between commands. Now we wait.

**Debug Dashboard**: New tool to spy on your lights without logging into HA. Just open the HTML file and point it at your T2 server.

---

## Verification

- ✅ All 71 tests pass
- ✅ Graph loads in ~10 seconds (was 2 minutes)
- ✅ Color fading is smooth (was flashing)
- ✅ Version 2.1.58 pushed to main and stable
- ✅ Addon submodule updated

---

## Git Status

| Branch | Commit | Status |
|--------|--------|--------|
| `main` | 25efff7 | ✅ STABLE - v2.1.58 |
| `stable` | 25efff7 | ✅ STABLE - Same as main |
| `feature/unified-architecture` | 08b4ac2 | ⚠️ OLD - Contains previous session's work |

---

## Next Session Considerations

1. **Test add-on update**: Verify 2.1.58 installs correctly via HA add-on update
2. **Dashboard polish**: Fix "[OBJECT OBJECT]" display bug in lights panel (low priority)
3. **Continue Unified Architecture**: The v3.0 refactor proposal still pending

