# Session Handoff - December 14, 2025

## THE BIG PICTURE

T2AutoTron is a **visual node-based automation editor** for smart home control (like Node-RED but focused on lighting/home automation). It has **two deployment modes**:

### 1. Home Assistant Add-on (Docker container)
- Runs inside Home Assistant as an add-on
- Users access via HA's web UI (ingress)
- **This is the production deployment for most users**
- Repo: `home-assistant-addons/t2autotron/`

### 2. Local Electron App (Windows desktop)
- Standalone Windows app for development/power users
- Direct access, no HA required
- **This is what we're debugging now**

## WHY THE BACKEND ENGINE EXISTS

**The Core Problem**: Automations currently run in the browser using Rete.js DataflowEngine. This means:
- ✅ Desktop Electron app works fine (always open)
- ❌ HA Add-on breaks when user closes browser tab = **all automations stop**

**The Solution**: Move automation execution to the **server** (backend engine). The browser becomes just an editor - automations run 24/7 on the server even when no browser is open.

This is **critical for the HA add-on** - users expect home automations to run continuously, not stop when they close a browser tab.

## CURRENT ARCHITECTURE

```
Frontend (Browser/Electron)          Backend (Node.js Server)
┌─────────────────────────┐         ┌─────────────────────────┐
│  Rete.js Visual Editor  │◄──────►│  Express + Socket.IO    │
│  (editing only)         │         │                         │
└─────────────────────────┘         │  BackendEngine          │
                                    │  ├─ 100ms tick loop     │
                                    │  ├─ Node processing     │
                                    │  └─ Device control      │
                                    │                         │
                                    │  Device Managers        │
                                    │  ├─ Home Assistant      │
                                    │  ├─ Philips Hue         │
                                    │  ├─ TP-Link Kasa        │
                                    │  └─ Shelly              │
                                    └─────────────────────────┘
```

## WHAT WE'VE BEEN DEBUGGING

### Phase 1: HA Add-on Socket Stability (DONE)
- Fixed socket disconnects when using HA ingress
- Increased timeouts, infinite reconnection attempts
- Version: 2.1.35

### Phase 2: Overnight Crash Analysis (DONE)
- Found 11 crashes overnight
- Root cause: Kasa device "Back Door Sconce Upper" offline, causing TCP errors every 5 seconds
- 380MB log file bloat from constant retries
- **Fixed**: Added offline device backoff (30s→60s→90s... max 5min between retries)
- **Fixed**: Added 10MB log rotation
- Version: 2.1.36

### Phase 3: Backend Engine Device Toggle Bug (IN PROGRESS)
**Problem**: When the backend engine starts, one HA device turns OFF even though the trigger input shows TRUE.

**User quote**: "when I start the engine in the local version, it toggles off one of my HA generic device nodes, even though the trigger is still showing True from the input buffer"

**What we've tried**:
1. Fixed label mapping in `BackendNodeRegistry.js` ('HA Generic Device' → 'HAGenericDeviceNode')
2. Added 3-tick warmup period to HAGenericDeviceNode (skip first 3 ticks while buffers populate)
3. Changed execution order: Sender nodes run FIRST, Receiver nodes run LAST
4. Added comprehensive debug logging to `crashes/engine_debug.log`

**Current status**: User needs to run app with new logging to capture exactly what's happening.

## KEY FILES FOR THIS ISSUE

```
Backend Engine:
  backend/src/engine/BackendEngine.js      - Main engine, tick loop, node ordering
  backend/src/engine/BackendNodeRegistry.js - Maps node labels to classes
  backend/src/engine/engineLogger.js       - Debug logger → crashes/engine_debug.log
  backend/src/engine/nodes/HADeviceNodes.js - HA device control with warmup logic
  backend/src/engine/nodes/BufferNodes.js  - Sender/Receiver for "wireless" connections

Debug Log Location:
  v3_migration/crashes/engine_debug.log    - Detailed engine events
```

## THE SUSPECTED ROOT CAUSE

Sender/Receiver nodes communicate via a shared buffer (not wires). On engine start:
1. Tick 1: Receiver runs, buffer empty → returns `undefined`
2. Tick 2: Sender runs, sets buffer to `true`
3. Tick 3: Receiver gets `true`, passes to HAGenericDevice
4. After warmup: HAGenericDevice sees trigger change from `undefined` → `true`... or possibly misses it

The warmup period and execution ordering were added to fix this, but the device still turns off.

## NEXT STEPS

1. **Run the app and start the engine**
2. **Check `crashes/engine_debug.log`** - should show:
   - `EXEC-ORDER` - node execution order
   - `BUFFER-SET` / `BUFFER-GET` - buffer values
   - `HA-DEVICE-TICK` - trigger values per tick
   - `HA-DECISION` - exactly why device was turned on/off
   - `WARMUP` - ticks 1-3 showing warmup behavior

3. **Share first 50-100 lines of log** - will reveal root cause

## OTHER CONTEXT

### Current Version: 2.1.36

### Recent Fixes (don't re-fix these):
- Socket stability: `reconnectionAttempts: Infinity`, `pingTimeout: 60000`
- Kasa backoff: Offline devices retry at increasing intervals
- Log rotation: 10MB max before rotating

### Key Copilot Instructions
The repo has `.github/copilot-instructions.md` with detailed architecture info. Key points:
- Plugins are in `backend/plugins/` (NOT `frontend/src/nodes/`)
- Debug logging gated by `VERBOSE_LOGGING` env var
- Never call `changeCallback()` inside `data()` method
- Use `window.T2Controls` for shared UI components

### Git Workflow
- `main` = development branch
- `stable` = production (users pull updates from here)
- Push to stable: `git push origin main:stable`

