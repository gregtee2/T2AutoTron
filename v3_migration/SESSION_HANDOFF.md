# Session Handoff - December 18, 2025

## Addendum (Session 8 - Debug Dashboard Enhancements)

### What changed (Session 8 - Claude Opus 4.5)

**Current Version: 2.1.75**

#### 🔍 New API Endpoint: `/api/engine/device-states`
- Returns what the backend engine thinks each device should be
- Compares engine expected state vs actual HA state for mismatch detection
- Checks multiple sources: `node.deviceStates`, `node.lastTrigger`, `node.lastSentHsv`, `output.is_on`
- **Files**: `v3_migration/backend/src/api/routes/engineRoutes.js`

#### 🎛️ Debug Dashboard Major Enhancements
- **Split Anomalies/Activity Notes**: "Anomalies" panel now shows only real problems (stuck devices, stale state). "Activity Notes" shows expected behavior (color cycling, frequent updates)
- **Engine vs HA Comparison**: New panel shows what engine expects vs what HA reports. Uses new `/api/engine/device-states` endpoint
- **Removed Node Map**: Wasn't useful in current form (just listed node names). Left comment for future enhancement
- **Fixed variable name bug**: Renamed `noEvents` → `unknown` in activity tracking
- **Files**: `v3_migration/tools/debug_dashboard.html`

#### 🔧 HSV-Only Nodes Report as ON (v2.1.75)
- **Symptom**: Bar Lamp showed as "OFF" in Engine vs HA panel, but lights were actually ON
- **Root Cause**: HSV-only nodes (no trigger connected) have `lastTrigger: null`, but are sending color commands
- **Fix**: Check `node.lastSentHsv` - if we're sending HSV color commands, device is effectively ON
- **Scope**: REPORTING only - does not change engine behavior, just accurate dashboard display
- **Files**: `v3_migration/backend/src/api/routes/engineRoutes.js`

### 🦴 Caveman Summary
1. **Dashboard Split**: Before, it yelled "ANOMALY!" when lights changed colors fast (which is normal). Now it knows the difference between real problems and expected behavior.
2. **Engine vs HA**: New comparison shows "what the robot thinks" vs "what's actually happening" - helps find when automations get out of sync with reality.
3. **HSV-Only Fix**: Some lights only get color commands (no on/off trigger). Dashboard was saying "this light is OFF" when it's clearly ON. Fixed the reporting.

### Version Progression (Session 8)
- 2.1.68 → 2.1.73 (device-states endpoint, dashboard enhancements)
- 2.1.73 → 2.1.74 (deviceStates tracking fix)
- 2.1.74 → 2.1.75 (HSV-only nodes report as ON)

### Files Touched (Session 8)
- `v3_migration/backend/src/api/routes/engineRoutes.js` - Added `/api/engine/device-states` endpoint
- `v3_migration/tools/debug_dashboard.html` - Split anomalies/activity, engine vs HA panel
- `v3_migration/backend/package.json` - Version bumps
- `home-assistant-addons/t2autotron/config.yaml` - Version bumps

### Testing
1. Update add-on to 2.1.75
2. Open Debug Dashboard, point at T2 server
3. Click "Run Full Comparison" → should show Engine vs HA comparison
4. HSV-only lights (like Bar Lamp) should show as ON when receiving color commands

### Future Enhancement (Pinned)
- **Node Map with Live State**: Could show node activity/output values in real-time
- Requires new backend API to expose node execution state
- Lower priority - dashboard is working well without it

### Notes for Next Session
- Remote HA access question answered (recommend Tailscale - free, secure, easy)
- Dashboard is feature-complete for debugging automation mismatches
- All changes are reporting/display only - no engine behavior changes

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

