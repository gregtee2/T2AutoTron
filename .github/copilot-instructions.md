# T2AutoTron 2.1 - AI Coding Instructions

## 🚀 ACTIVE PROJECT: Unified Architecture (v3.0 Refactor)

**Status**: ✅ PHASE 1 COMPLETE - Shared Logic Implemented  
**Document**: `v3_migration/UNIFIED_ARCHITECTURE_PROPOSAL.md`  
**Branch**: `main` (shared logic merged)

### What We Did (January 2026)
Instead of the full "unified node definition" approach, we implemented a **pragmatic shared logic layer**:
- Created `v3_migration/shared/logic/*.js` with **38 pure calculation functions**
- These are used by BOTH frontend plugins AND backend engine nodes
- No UI code in shared logic - just pure math/calculations

### Current Architecture
```
┌─────────────────────────────────────────────────────────────────┐
│                    SHARED LOGIC LAYER                           │
│         v3_migration/shared/logic/*.js (38 functions)           │
│                                                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │ TimeRangeLogic  │  │ LogicGateLogic  │  │   ColorLogic    │ │
│  │ calculateTime   │  │ calculateAnd    │  │ hsvToRgb        │ │
│  │ Range()         │  │ calculateOr     │  │ rgbToHsv        │ │
│  └─────────────────┘  │ smartCompare    │  │ mixColors       │ │
│                       └─────────────────┘  └─────────────────┘ │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │  DelayLogic     │  │  UtilityLogic   │  │  DeviceLogic    │ │
│  │ toMilliseconds  │  │ processCounter  │  │ normalizeHSV    │ │
│  │ UNIT_MULTIPLIERS│  │ performMath     │  │ buildHAPayload  │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
           ↓                                    ↓
┌─────────────────────┐            ┌─────────────────────────────┐
│  FRONTEND PLUGINS   │            │    BACKEND ENGINE NODES     │
│  (browser/Rete.js)  │            │    (Node.js 24/7 server)    │
│                     │            │                             │
│  Loads via:         │            │  Loads via:                 │
│  00_SharedLogic     │            │  require('../shared/logic') │
│  Loader.js →        │            │                             │
│  window.T2Shared    │            │                             │
│  Logic              │            │                             │
└─────────────────────┘            └─────────────────────────────┘
```

### Files in shared/logic/
| File | Functions | Used By |
|------|-----------|---------|
| `TimeRangeLogic.js` | `calculateTimeRange()` | TimeRangeNode |
| `LogicGateLogic.js` | `calculateAnd/Or/Not/Xor/Nand/Nor/Xnor`, `smartCompare`, `checkThreshold` | All logic gates, ComparisonNode |
| `ColorLogic.js` | `hsvToRgb`, `rgbToHsv`, `mixColors`, `clamp` | All color nodes via 00_ColorUtilsPlugin |
| `DelayLogic.js` | `toMilliseconds`, `UNIT_MULTIPLIERS` | DelayNode |
| `UtilityLogic.js` | `processCounter`, `generateRandom`, `performMath`, `scaleValue` | Utility nodes |
| `DeviceLogic.js` | `normalizeHSVInput`, `buildHAPayload`, `determineTriggerAction` | Device nodes |
| `AndGateLogic.js` | AND gate specifics | AndNode |
| `index.js` | Aggregates all exports | Backend require() |

### How to Use Shared Logic

**In Frontend Plugins:**
```javascript
// At top of plugin (after checking dependencies)
const T2SharedLogic = window.T2SharedLogic || {};
const { calculateAnd, smartCompare, hsvToRgb } = T2SharedLogic;

// Use with fallback for safety
const result = T2SharedLogic.smartCompare?.(a, op, b) ?? legacyCompare(a, op, b);
```

**In Backend Engine Nodes:**
```javascript
const { smartCompare, calculateAnd, hsvToRgb } = require('../../../../shared/logic');

// Use directly - always available
const result = smartCompare(a, op, b);
```

### Next Steps (Future Work)
- Migrate more calculation logic to shared (currently ~60% of duplicated logic is shared)
- Consider full unified node definitions for v4.0 if shared logic approach works well
- Add more shared utility functions as patterns emerge

---

## 📌 PINNED: Future Features (Do Not Start Without User Approval)

### 🎥 Camera System - Blue Iris-style Live View (IN PROGRESS)

**Status**: ✅ Core architecture complete, live streaming working at 30fps
**Goal**: Full-featured camera management inspired by Blue Iris

#### Current Implementation (January 2026)

**Architecture:**
```
┌─────────────────┐     ┌─────────────────────────────────────────────┐
│  IP Camera      │     │              CameraService                  │
│  RTSP Stream    │────▶│  ┌─────────────────────────────────────┐   │
│  (H.264)        │     │  │ CameraWorker (per camera)           │   │
└─────────────────┘     │  │  - FFmpeg with CUDA decode          │   │
                        │  │  - RTSP → JPEG @ 30fps              │   │
                        │  │  - Stores in FrameBuffer (150 frames)│   │
                        │  └─────────────────────────────────────┘   │
                        └─────────────────────────────────────────────┘
                                          │
                                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Frontend (CameraPanel.jsx)                                         │
│  - Grid view: 1x1, 2x2, 3x3, 4x4                                   │
│  - Multi-camera popout (separate window)                            │
│  - Single camera popout with fast refresh                           │
│  - Live/Snap toggle                                                 │
│  - Camera discovery                                                 │
└─────────────────────────────────────────────────────────────────────┘
```

**Key Files:**
| File | Purpose |
|------|---------|
| `backend/src/cameras/CameraService.js` | Singleton managing all camera workers |
| `backend/src/cameras/CameraWorker.js` | FFmpeg RTSP→JPEG extraction per camera |
| `backend/src/cameras/FrameBuffer.js` | Ring buffer storing 150 frames (5 sec @ 30fps) |
| `backend/src/api/cameras/index.js` | REST API: `/api/cameras/*` |
| `backend/config/cameras.json` | Camera configuration (IP, credentials, paths) |
| `frontend/src/ui/CameraPanel.jsx` | React UI for camera grid and popouts |

**FFmpeg Settings (CameraWorker.js):**
```javascript
// NVIDIA hardware decode (RTX 6000 Pro)
args.push('-hwaccel', 'cuda');

// Input: RTSP with robust settings
args.push(
    '-rtsp_transport', 'tcp',
    '-fflags', '+discardcorrupt+genpts+nobuffer',
    '-flags', 'low_delay',
    '-thread_queue_size', '4096',
    '-analyzeduration', '5000000',  // 5 sec for Reolink
    '-probesize', '5000000',        // 5 MB probe
    '-i', rtspUrl,
    '-an'  // No audio
);

// Output: High quality JPEG
args.push(
    '-vf', `fps=${this.targetFps}`,  // Default 30fps
    '-f', 'image2pipe',
    '-vcodec', 'mjpeg',
    '-q:v', '2',                     // Quality: 1-31, lower = better
    '-'
);
```

**⚠️ CRITICAL LESSONS LEARNED:**

1. **Don't force sub-streams!** CameraService had code that secretly replaced `_main` with `_sub` and `subtype=0` with `subtype=1` "for ML bandwidth". This caused 480p output instead of 4K. The fix: use the configured rtspPath directly.

2. **Never use `-skip_frame nokey`!** This flag makes FFmpeg only decode keyframes (I-frames), resulting in 1 frame every 2 seconds. It's for seeking, not live playback.

3. **Frame size filter prevents green frames**: Skip frames < 10KB (corrupt/incomplete frames from startup are tiny).

4. **`-b:v` vs `-q:v` for MJPEG**: Use `-q:v 2` (quality scale 1-31) not `-b:v 50M` (bitrate) for image output.

**Completed Features:**
- ✅ Grid Layout View (1x1, 2x2, 3x3, 4x4)
- ✅ Live Stream Support - RTSP via FFmpeg @ 30fps
- ✅ GPU Acceleration - NVIDIA CUDA decode
- ✅ Multi-camera Popout - Separate window with grid
- ✅ Single Camera Popout - Fast refresh real-time view
- ✅ Camera Discovery - Scans subnet for IP cameras
- ✅ Main stream support (full resolution, not sub-stream)

**Remaining Features:**
- ⏳ Drag-to-Resize individual tiles
- ⏳ Camera Groups by location
- ⏳ PTZ Controls
- ⏳ Recording Controls
- ⏳ Motion Detection Zones
- ⏳ Right-Click Context Menu

### 🤖 AI Vision Detection System
**Goal**: Local AI-powered object detection for cameras using RTX 6000 Pro (Blackwell)

**Architecture:**
```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│  IP Camera      │────▶│  Python Vision       │────▶│  T2AutoTron     │
│  RTSP Feed      │     │  Service (FastAPI)   │     │  Vision Node    │
└─────────────────┘     │  - YOLOv11           │     │  - Trigger out  │
                        │  - Grounding DINO    │     │  - Objects list │
                        │  - LLaVA (optional)  │     │  - Confidence   │
                        └──────────────────────┘     └─────────────────┘
```

**Recommended Models:**
- **YOLOv11** - Real-time detection (100+ FPS), 80+ object classes
- **Grounding DINO** - Open vocabulary ("find person in red shirt")
- **LLaVA/Qwen2-VL** - Scene description for TTS alerts

**Node Outputs:**
- `person_detected` (boolean) - Trigger when person in frame
- `detections` (array) - List of detected objects with confidence
- `description` (string) - Natural language scene description

**Use Cases:**
- Person at front door → Turn on porch lights, send notification
- Pet in kitchen → TTS announcement
- Package on porch → Alert
- Car in driveway → Trigger automation

### 🗣️ Chatterbox TTS Integration

**Status**: ✅ Implemented - Local GPU-accelerated text-to-speech
**Location**: `chatterbox/chatterbox-master/` (source) + `backend/src/localAgent/` (bridge)

**What is Chatterbox?**
Chatterbox is a high-quality TTS engine that runs locally on your GPU. It supports voice cloning and produces natural-sounding speech. T2AutoTron integrates with it for smart home announcements.

**Architecture:**
```
┌─────────────────────────┐          ┌─────────────────────────┐
│  T2 Addon (Pi/Server)   │          │  Your Desktop (GPU)     │
│  Web UI (port 3000)     │◄────────►│  Chatterbox (port 8100) │
│                         │  Browser │  Local Agent (port 5050)│
└─────────────────────────┘          └─────────────────────────┘
```

The **Local Agent** (`t2_agent.py`) runs on your desktop and bridges the gap between:
- T2's web UI (which runs in your browser, even if T2 backend is on a Pi)
- Chatterbox TTS (which needs a GPU, so it runs on your desktop)

**Key Files:**
| File | Purpose |
|------|---------|
| `backend/src/localAgent/t2_agent.py` | Python agent that controls Chatterbox |
| `backend/src/localAgent/agent.js` | Node.js alternative agent |
| `backend/src/localAgent/start_agent.bat` | Windows launcher |
| `backend/src/localAgent/README.md` | Full setup documentation |
| `chatterbox/chatterbox-master/` | Chatterbox TTS source code |

**API Endpoints (Local Agent on port 5050):**
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/status` | GET | Agent health check |
| `/chatterbox/status` | GET | Check if Chatterbox is running |
| `/chatterbox/start` | POST | Start Chatterbox |
| `/chatterbox/stop` | POST | Stop Chatterbox |

**Quick Start:**
1. Run `start_agent.bat` on your desktop (or `python t2_agent.py`)
2. Agent listens on port 5050
3. Open T2 in browser → "🗣️ Chatterbox TTS" panel appears in Control Panel
4. Click Start to launch Chatterbox

**Configuration:**
Edit `t2_agent.py` to set your Chatterbox path:
```python
DEFAULT_CHATTERBOX_DIR = r"C:\Chatterbox"  # Change if needed
```

---

### Key Files
- `v3_migration/shared/logic/` - All shared logic modules
- `backend/plugins/00_SharedLogicLoader.js` - Frontend loader
- `backend/src/server.js` - `/api/shared-logic/` endpoints
- Individual plugin files that use shared logic

### ⚠️ Server Management Rules
- **NEVER start the server** when you want the user to test something - they manage their own server
- Only start a server if YOU need to run an internal test and verify output yourself
- Starting servers when the user is already running one creates chaos (port conflicts, multiple instances)
- After making changes, just tell the user "restart your server and test" - don't do it for them

### 🚨 CRITICAL: Git Commit Rules (READ THIS - DISASTERS HAVE OCCURRED)

**In January 2026, days of plugin work was lost because agents committed docs/version bumps but NOT the actual plugin files!**

#### Before EVERY commit, run `git status` and verify:
1. **The actual code files you modified are staged** (plugins, engine nodes, frontend components)
2. Not JUST docs, CHANGELOG, version bumps, or addon submodule updates

#### The Correct Commit Workflow:
```bash
# 1. SEE what's changed
git status

# 2. Stage EVERYTHING that was worked on (not just docs!)
git add v3_migration/backend/plugins/     # Plugin files
git add v3_migration/backend/src/         # Backend engine/routes
git add v3_migration/frontend/src/        # Frontend components
git add v3_migration/shared/logic/        # Shared logic
git add .github/copilot-instructions.md   # Docs (if updated)

# 3. Commit with descriptive message
git commit -m "feat: Description of actual feature"

# 4. Push to main (development branch)
git push origin main
```

#### ❌ WRONG (What caused the disaster):
```bash
# Only committed docs, forgot the actual plugin files!
git add .github/copilot-instructions.md
git add home-assistant-addons
git commit -m "docs: Update for v2.1.235"  # WHERE ARE THE PLUGINS?!
```

#### ✅ CORRECT:
```bash
# Commit ALL changed files - the whole enchilada!
git add -A  # Or explicitly add each changed directory
git status  # VERIFY plugins are staged!
git commit -m "feat: Add Nuke sliders to AllInOneColorNode"
```

#### Commit Message Prefixes:
- `feat:` - New feature (usually involves plugin/engine changes)
- `fix:` - Bug fix (usually involves code changes)
- `docs:` - Documentation ONLY (no code changes)
- `chore:` - Maintenance (submodule updates, version bumps)

**If your commit message says `feat:` or `fix:`, there MUST be code files (not just docs) in the commit!**

---

## ⚠️ CRITICAL: Frontend/Backend Priority Design (DO NOT CHANGE)

**This design was carefully implemented. Do NOT modify without explicit user approval.**

### The Architecture
1. **Frontend is in control** while browser is open (sending heartbeats)
2. **Backend engine notes all changes** but does NOT send device commands
3. **When browser closes/sleeps** (no heartbeat for 30 seconds), backend takes over
4. **Backend syncs to current state** - it knows what frontend was doing
5. **Backend forces HSV resync** - clears throttle state so colors sync immediately

### Why This Matters
- User's manual changes are preserved (not overwritten by engine)
- HSV color nodes continuously output values - device nodes ignore them if device is OFF
- Engine's `shouldSkipDeviceCommands()` returns TRUE while frontend is active
- Log shows `[HA-DEVICE-SKIP] Frontend active, skipping command` - this is CORRECT behavior
- On handoff, `forceHsvResync()` clears `lastSentHsv` so devices immediately get current colors

### Key Files
- `backend/src/engine/BackendEngine.js` - `shouldSkipDeviceCommands()`, `setFrontendActive()`, `forceHsvResync()`
- `frontend/src/App.jsx` - Sends `editor-active` and heartbeats via socket
- `backend/src/api/routes/engineRoutes.js` - Receives `editor-active` events

### Common Mistakes to Avoid
❌ Don't make backend send commands while frontend is active
❌ Don't change the 30-second heartbeat timeout without discussion  
❌ Don't assume "frontend active = blocking bug" - it's intentional
✅ If colors aren't updating, the bug is in FRONTEND, not backend

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

### Recent Caveman Fixes (Last 2 Weeks)

> **📁 Older fixes archived in:** `.github/ARCHIVED_CAVEMAN_FIXES.md`

#### Camera Sub-Stream Quality Bug (2026-01-13) - v2.1.238
- **What broke**: Camera quality was terrible (13 KB/frame) despite high-quality FFmpeg settings
- **Why**: CameraService.js had sneaky code that secretly forced sub-streams for "ML bandwidth":
  ```javascript
  // This code was REPLACING user's config!
  if (rtspPath.includes('_main')) rtspPath = rtspPath.replace('_main', '_sub');
  if (rtspPath.includes('subtype=0')) rtspPath = rtspPath.replace('subtype=0', 'subtype=1');
  ```
- **Fix**: Removed the forced sub-stream code - use configured rtspPath directly
- **Files**: `backend/src/cameras/CameraService.js`
- **Lesson**: Config said `subtype=0` (4K), code secretly used `subtype=1` (480p). Always check if middleware is modifying your inputs!

#### Camera Keyframe-Only Bug (2026-01-13) - v2.1.238  
- **What broke**: Reolink cameras showing timestamps jumping 2 seconds (02:32:26 → 02:32:28 → 02:32:30)
- **Why**: Added `-skip_frame nokey` to prevent green frames, but this makes FFmpeg ONLY decode keyframes
- **Fix**: Removed `-skip_frame nokey` flag - it's for seeking, not live playback
- **Files**: `backend/src/cameras/CameraWorker.js`
- **Lesson**: `-skip_frame nokey` = "only show keyframes (I-frames)" which are 2 sec apart. Use frame size filtering instead.

#### Color Mismatch During Frontend/Backend Handoff (2026-01-12) - v2.1.237
- **What broke**: Debug Dashboard showed massive color differences (Engine: 226° vs HA: 30°) during handoff
- **Why**: Backend waits for "significant change" before sending colors, but device had OLD color from frontend
- **Fix**: Added `forceHsvResync()` in BackendEngine.js - clears throttle state when backend takes over
- **Files**: `backend/src/engine/BackendEngine.js`, `backend/src/engine/nodes/HADeviceNodes.js`

#### Backend Engine Not Mirroring Frontend State (2026-01-06) - v2.1.210
- **What broke**: Dashboard showed "Engine says OFF, HA says ON" even when both were running correctly
- **Why**: Engine skipped state tracking when frontend was active (early return before updating `deviceStates`)
- **Fix**: Moved state update BEFORE `shouldSkipDeviceCommands()` check
- **Files**: `backend/src/engine/nodes/HADeviceNodes.js`

#### ColorLogic.js Property Mismatch (2026-01-09) - v2.1.234
- **What broke**: Timeline Color outputting `{ saturation: null }` - missing hue entirely
- **Why**: `rgbToHsv()` returned `{h,s,v}` but nodes expected `{hue,sat,val}`
- **Fix**: Return both formats: `{ h, s, v, hue, sat, val }`
- **Files**: `shared/logic/ColorLogic.js`

#### Hue/WiZ Effect Restore Bug (2026-01-06) - v2.1.207
- **What broke**: Lights stayed ON at midnight when effect trigger went FALSE
- **Why**: Effect restore was turning lights back ON (overriding downstream HAGenericDeviceNode)
- **Fix**: Only clear effect (`effect: 'none'`), don't restore on/off state
- **Files**: `HADeviceNodes.js`, `HueEffectNode.js`, `WizEffectNode.js`

#### Debug Dashboard Color Timeline (2026-01-09) - v2.1.212
- **Feature**: Timeline segments now show actual device colors (not gray)
- **Added**: Split bar (engine vs HA color), orange border for >10° mismatch, click popup with HSV values

#### TTS Triple-Play Bug (2026-01-04) - v2.1.191
- **What broke**: TTS playing 2-3 times per button click
- **Fix**: Auto-cleanup WAV files after 30s, added `enqueue: 'replace'` to HA play_media

---

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
│   ├── src/server.js   ← Express + Socket.IO server (984 lines after v2.1.166 refactor)
│   ├── src/api/        ← REST API routes
│   │   └── routes/
│   │       ├── settingsRoutes.js  ← GET/POST /api/settings, connection tests
│   │       ├── telegramRoutes.js  ← POST /api/telegram/send
│   │       ├── debugRoutes.js     ← /api/debug/*, /api/engine/logs/*
│   │       ├── haRoutes.js        ← Home Assistant device control
│   │       ├── hueRoutes.js       ← Philips Hue bridge API
│   │       └── engineRoutes.js    ← /api/engine/* (start/stop/status)
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

---

## 🚨 LOGGING GUIDELINES (CRITICAL - READ BEFORE ADDING console.log)

**Problem**: AI agents frequently add `console.log` statements for debugging, then forget to remove them or gate them behind `VERBOSE`. This causes server logs to become unreadable with thousands of routine messages per hour.

### ⚠️ BEFORE Adding ANY console.log:

1. **Ask yourself**: Is this an ERROR or just routine operation info?
2. **Errors**: Always log (use `console.error` or `logWithTimestamp(..., 'error')`)
3. **Routine operations**: MUST be gated behind `VERBOSE` flag
4. **Temporary debugging**: Remove before committing, or gate behind `VERBOSE`

### The VERBOSE Pattern

Every file that needs routine logging should have this at the top:
```javascript
const VERBOSE = process.env.VERBOSE_LOGGING === 'true';
```

Then gate routine logs:
```javascript
// ❌ WRONG - logs on every request, floods console
logWithTimestamp(`PUT /${id}/state - Body: ${JSON.stringify(body)}`, 'info');

// ✅ CORRECT - only logs when debugging
if (VERBOSE) logWithTimestamp(`PUT /${id}/state - Body: ${JSON.stringify(body)}`, 'info');
```

### What Should ALWAYS Log (No VERBOSE Check)

| Log Type | Example | Why |
|----------|---------|-----|
| Errors | `❌ HA service call failed` | Need to see failures |
| Startup messages | `✓ Server running on port 3000` | Confirms startup worked |
| Warnings | `⚠️ Token expired, refreshing` | Actionable issues |
| User-triggered events | `Telegram: 💡 Light turned ON` | User notifications |
| Critical state changes | `[BackendEngine] PAUSING device commands` | Mode changes |

### What Should NEVER Log by Default (Gate Behind VERBOSE)

| Log Type | Example | Why |
|----------|---------|-----|
| Every API request | `PUT /light.xxx/state` | Hundreds per hour |
| Every device update | `Successfully updated HA device` | Redundant with request |
| Every state sync | `Cache refreshed: 1090 entities` | Routine maintenance |
| Every command sent | `[CMD→] light: turn_on` | Hundreds per hour |
| Every state received | `[←STATE] light: on → off` | Hundreds per hour |
| Periodic health checks | `Uptime: X minutes` | Once is enough |
| Success confirmations | `✅ Emitted device-state-update` | Routine operation |

### Files That Already Have VERBOSE Gating

These files have the pattern implemented - use them as examples:
- `src/api/routes/haRoutes.js` - Device update logs
- `src/api/routes/hueRoutes.js` - Hue update logs
- `src/api/routes/mediaRoutes.js` - Media play/stop logs
- `src/engine/commandTracker.js` - CMD→ and ←STATE logs
- `src/engine/nodes/HADeviceNodes.js` - BulkStateCache logs

### The deviceAudit.js Pattern (Smart Filtering)

For periodic status logs, don't just gate behind VERBOSE - be smart about what's worth logging:

```javascript
// Only log mismatches that are FRESH (< 30 min old)
// Stale mismatches (600+ min) mean user manually changed something - not our problem
const STALE_THRESHOLD = 30 * 60 * 1000;
const freshMismatches = results.mismatches.filter(m => m.staleness < STALE_THRESHOLD);

if (freshMismatches.length === 0) {
  // All good - log to FILE only, not console
  engineLogger.log('AUDIT-OK', summary);
} else {
  // Fresh issues - worth logging to console
  console.log(`[AUDIT] ⚠️ ${freshMismatches.length} device mismatches`);
}
```

### Logging Cleanup Checklist (After Any Debug Session)

Before committing code that added `console.log`:
- [ ] Did I remove temporary debug logs?
- [ ] Are remaining logs gated behind `VERBOSE`?
- [ ] Did I use the right log level (error vs info)?
- [ ] Will this log flood the console during normal operation?
- [ ] Run server for 5 minutes - is the output readable?

### 🦴 Caveman Version

**Logs are like a security camera.** You want to record important events (break-ins, fires), not every person walking by. If your logs show thousands of "person walked by" messages per hour, you'll never notice the actual break-in.

**Rule of thumb**: If a log message appears more than once per minute during normal operation, it should be behind `VERBOSE`.

---

## Device ID System (CRITICAL)

### The Problem We Solved
Different parts of the system used different ID formats, causing state sync failures:
- Socket sends `light.living_room` (raw HA format)
- Nodes store `ha_light.living_room` (prefixed format)
- Comparisons failed, state updates were ignored

### The Solution: Centralized Device Registry

**Backend (Node.js):** `src/devices/managers/deviceManagers.js`
```javascript
const { normalizeDeviceId, stripDevicePrefix, isSameDevice, getDeviceApiInfo } = require('./deviceManagers');

// Normalize to internal format (adds ha_ prefix if missing)
normalizeDeviceId('light.xxx')      // → 'ha_light.xxx'
normalizeDeviceId('ha_light.xxx')   // → 'ha_light.xxx'

// Strip prefix for API calls
stripDevicePrefix('ha_light.xxx')   // → 'light.xxx'

// Compare across formats
isSameDevice('ha_light.xxx', 'light.xxx')  // → true

// Get API info
getDeviceApiInfo('ha_light.xxx')    // → { endpoint: '/api/lights/ha', cleanId: 'light.xxx', source: 'ha' }
```

**Frontend (Plugins):** `window.T2HAUtils` (from 00_HABasePlugin.js)
```javascript
const { normalizeDeviceId, stripDevicePrefix, isSameDevice } = window.T2HAUtils;
// Same functions available in browser context
```

### Device ID Prefixes

All device IDs use prefixes to identify their source system:
- `ha_` → Home Assistant entities (e.g., `ha_light.living_room`)
- `kasa_` → TP-Link Kasa devices
- `hue_` → Philips Hue lights
- `shelly_` → Shelly devices

### ⚠️ ALWAYS Use the Helpers!

When comparing device IDs, **NEVER** do this:
```javascript
// ❌ WRONG - will fail if formats differ
if (selectedDeviceIds.includes(socketEntityId)) { ... }
```

**ALWAYS** use the helper:
```javascript
// ✅ CORRECT - handles format differences
const matchedId = selectedDeviceIds.find(devId => isSameDevice(devId, socketEntityId));
if (matchedId) { ... }
```

## Brightness Scale Normalization

**IMPORTANT**: Brightness values flow through multiple layers. Here's the canonical scale at each point:

| Layer | Scale | Example | Notes |
|-------|-------|---------|-------|
| Home Assistant raw | 0-255 | 254 | Raw `brightness` attribute from HA |
| Hue Bridge raw | 0-254 | 254 | Hue uses 254 max, not 255 |
| Backend API response | 0-100 | 100 | `homeAssistantManager.getState()` normalizes to percentage |
| Frontend UI display | 0-100 | 100 | `ColorBarControl`, `DeviceStateControl` expect percentage |
| HSV input brightness | 0-255 | 254 | Timeline/Spline nodes output 0-255 |
| HA API payload | 0-255 | 254 | When sending commands to HA |

**Key rule**: Backend normalizes everything to 0-100 for UI. Frontend components should NOT divide by 255 again.

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
- `00_SharedLogicLoader.js` → `window.T2SharedLogic` (38 shared calculation functions - NEW!)
- `00_BaseNodePlugin.js` → `window.T2Node` base class
- `00_SharedControlsPlugin.js` → `window.T2Controls` (buttons, dropdowns, HelpIcon, NodeHeader, etc.)
- `00_HABasePlugin.js` → `window.T2HAUtils` (Home Assistant helpers)
- `00_ColorUtilsPlugin.js` → `window.ColorUtils` (color conversion - now uses T2SharedLogic internally)
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

### ⚠️ Critical Plugin Development Patterns (MUST READ)

These patterns are **non-obvious** and will cause bugs if not followed. Learned from debugging sessions.

#### 1. DropdownControl Usage
```javascript
// ❌ WRONG - .options doesn't exist
control.options = ['Option1', 'Option2'];

// ✅ CORRECT - Use .values property
const { DropdownControl } = window.T2Controls;
const dropdown = new DropdownControl(['Option1', 'Option2'], 'defaultValue', (val) => {
    this.properties.selectedValue = val;
    if (this.changeCallback) this.changeCallback();
});
this.addControl('my_dropdown', dropdown);

// To update dropdown options later:
dropdown.values = ['NewOption1', 'NewOption2', 'NewOption3'];
dropdown.updateDropdown();  // REQUIRED to refresh UI!
```

#### 2. Accessing Controls in Node Class
```javascript
// ❌ WRONG - controls is NOT a Map with .get()
const dropdown = this.controls.get('device_select');

// ✅ CORRECT - controls are direct properties
const dropdown = this.controls.device_select;
dropdown.values = newOptions;
dropdown.updateDropdown();
```

#### 3. React Component Control Rendering
```javascript
// ❌ WRONG - using key string lookup
Object.entries(data.controls).map(([key, control]) => {
    return React.createElement(Presets.classic.Control, {
        key: key  // This doesn't work!
    });
});

// ✅ CORRECT - pass the actual control object as payload
Object.entries(data.controls).map(([key, control]) => {
    return React.createElement(Presets.classic.Control, {
        key: key,
        payload: control  // Pass the control object!
    });
});
```

#### 4. Socket Creation in Constructor
```javascript
constructor(changeCallback) {
    super("My Node");
    this.changeCallback = changeCallback;
    
    // Add sockets BEFORE controls
    this.addInput('trigger', new ClassicPreset.Input(sockets.boolean, 'Trigger'));
    this.addOutput('value', new ClassicPreset.Output(sockets.any, 'Value'));
    
    // Then add controls
    this.setupControls();
}
```

#### 5. API Endpoints for HA Devices
```javascript
// ❌ WRONG - this endpoint doesn't exist
fetch('/api/ha/states/' + entityId)

// ✅ CORRECT - use the lights API with ha type
fetch('/api/lights/ha/' + entityId + '/state')

// For device lists via socket:
window.socket.emit('request-ha-devices');
window.socket.on('ha-devices', (devices) => { /* devices array */ });
```

#### 6. Socket Event Listeners (Memory Leaks)
```javascript
// ❌ WRONG - listeners never cleaned up
useEffect(() => {
    window.socket.on('device-state-update', handleUpdate);
}, []);

// ✅ CORRECT - clean up on unmount
useEffect(() => {
    const handleUpdate = (update) => { /* ... */ };
    window.socket.on('device-state-update', handleUpdate);
    
    return () => {
        window.socket.off('device-state-update', handleUpdate);
    };
}, []);
```

#### 7. Triggering Graph Re-evaluation
```javascript
// When a control value changes and should trigger downstream nodes:
if (this.changeCallback) this.changeCallback();

// ❌ WRONG - calling changeCallback inside data() method
data(inputs) {
    if (this.changeCallback) this.changeCallback(); // Causes reset loop!
    return { value: this.properties.value };
}

// ✅ CORRECT - data() should be pure, return only
data(inputs) {
    return { value: this.properties.value };
}
```

#### 8. Save/Load (Serialization)
```javascript
// Required for graph persistence - use this EXACT pattern!
// The restore() receives { properties: {...} } from the serialized node

serialize() {
    return {
        myValue: this.properties.myValue,
        myOption: this.properties.myOption
        // List explicit properties, not spread (for clarity)
    };
}

toJSON() {
    return {
        id: this.id,
        label: this.label,
        properties: this.serialize()
    };
}

restore(state) {
    // Handle both patterns: state.properties (from copy/paste) or state directly
    const props = state.properties || state;
    if (props) {
        Object.assign(this.properties, props);
    }
    
    // Sync dropdown control values with restored properties
    const myControl = this.controls.my_dropdown;
    if (myControl && this.properties.myValue) {
        myControl.value = this.properties.myValue;
        // Note: updateDropdown() is called after options are populated
    }
    
    // Defer fetches to avoid race conditions during graph load
    setTimeout(() => {
        this.fetchData();
    }, 500);
}
```

#### 9. Pointer Events on Interactive Controls
```javascript
// Interactive elements need stopPropagation or node will drag
React.createElement('select', {
    onPointerDown: (e) => e.stopPropagation(),  // Prevents node drag
    onChange: (e) => { /* handle change */ }
})

// BUT: Never stopPropagation on socket containers (breaks wire connections)
```

#### 10. Device ID Prefixes
```javascript
// Always use prefixed IDs
const haDeviceId = 'ha_light.living_room';     // Home Assistant
const kasaId = 'kasa_192.168.1.100';           // Kasa
const hueId = 'hue_1';                          // Hue

// Parse with T2HAUtils
const { type, entityId } = window.T2HAUtils?.getDeviceApiInfo(deviceId) || {};
// type = 'ha', entityId = 'light.living_room'
```

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

### 🔄 Frontend/Backend Handoff (v2.1.189+)

**The Problem**: When user closes browser, unsaved graph changes would be lost.

**The Solution**: Multi-layer sync system:

| Layer | Mechanism | Frequency | Purpose |
|-------|-----------|-----------|----------|
| 1. Heartbeat | Socket.IO `editor-heartbeat` | Every 30 sec | Backend knows frontend is alive |
| 2. Auto-save | POST `/api/engine/save-active` | Every 2 min | Periodic sync of current graph |
| 3. Visibility sync | `visibilitychange` event | On tab switch | Sync before user leaves |
| 4. Backend takeover | Heartbeat timeout | After 30 sec silence | Backend resumes device control |

**Key Files:**
- `frontend/src/App.jsx` - `syncGraphToBackend()` function at module level (not in React)
- `frontend/src/Editor.jsx` - `window._t2GetGraphData()` serialization helper
- `backend/src/api/routes/engineRoutes.js` - `/save-active` endpoint with hot-reload

**Why Module Level?**: Browser events inside React `useEffect` don't fire reliably on tab close. Registering at module load time (outside React) ensures handlers are attached immediately.

**⚠️ Browser Limitation**: Modern browsers BLOCK `beforeunload` and `pagehide` for security. We use `visibilitychange` instead - fires when tab becomes hidden (before close).

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

**Current Version: 2.1.237 | Status: Beta-Ready! 🎉**

> **📁 Full release tracking in:** `.github/RELEASE_STATUS.md`

### Quick Status
- ✅ All critical items complete (debug logging, error boundaries, secure storage)
- ✅ All high-priority items complete (loading states, toasts, auto-save)
- 🟠 Remaining: Test coverage, T2Node refactor, Event Log filter

### Recent Highlights (v2.1.189 - v2.1.237)
| Version | Feature/Fix |
|---------|-------------|
| v2.1.237 | `forceHsvResync()` - Immediate color sync on frontend→backend handoff |
| v2.1.234 | Oklab color interpolation - Vibrant gradients (no muddy browns) |
| v2.1.212 | Debug Dashboard color timeline - See actual device colors in timeline |
| v2.1.189 | Sync-on-Close - Graph syncs when you switch tabs (browsers block close events) |

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

### ⚠️ CRITICAL: Update Addon CHANGELOG

**When bumping the version, ALWAYS update `home-assistant-addons/t2autotron/CHANGELOG.md`!**

This file is what HA users see in the add-on store. If you don't update it, users won't know what changed.

**CHANGELOG Location:** `home-assistant-addons/t2autotron/CHANGELOG.md`

**Format:**
```markdown
## [2.1.XX] - YYYY-MM-DD
### Fixed
- Brief description of bug fix

### Added  
- Brief description of new feature

### Changed
- Brief description of behavior change
```

**Checklist for every version bump:**
1. ✅ Bump version in `backend/package.json`
2. ✅ Bump version in `home-assistant-addons/t2autotron/config.yaml`
3. ✅ **Add entry to `home-assistant-addons/t2autotron/CHANGELOG.md`** ← Don't forget!
4. ✅ Build frontend (`npm run build`)
5. ✅ Push addon submodule first, then parent repo

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
