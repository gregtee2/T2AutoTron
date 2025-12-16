# Session Handoff - December 15, 2025

## ✅ CURRENT STATUS: DEVICE TOGGLE BUG FIXED

The main bug is **FIXED**. Devices now turn on correctly after graph load in both:
- **Frontend UI** (Rete.js editor in browser/Electron)
- **Backend Engine** (server-side automation)

The fix is committed to `feature/unified-architecture` branch and ready to merge to `main` + `stable`.

---

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

## WHY THE BACKEND ENGINE EXISTS

**The Core Problem**: Automations currently run in the browser using Rete.js DataflowEngine. This means:
- ✅ Desktop Electron app works fine (always open)
- ❌ HA Add-on breaks when user closes browser tab = **all automations stop**

**The Solution**: Move automation execution to the **server** (backend engine). The browser becomes just an editor - automations run 24/7 on the server even when no browser is open.

---

## WHAT WAS FIXED THIS SESSION (December 15, 2025)

### 🐛 Bug: Devices Not Turning On After Graph Load

**Symptom**: HAGenericDeviceNode had `trigger=true` from input connection, but devices stayed OFF.

**Root Cause**: SAME BUG in TWO PLACES - the "skip/warmup" logic was "eating" the initial trigger value.

| Location | File | The Problem |
|----------|------|-------------|
| Backend Engine | `src/engine/nodes/HADeviceNodes.js` | Warmup period (ticks 1-3) set `lastTrigger = trigger` without acting |
| Frontend Plugin | `plugins/HAGenericDeviceNode.js` | Skip pass set `lastTriggerValue = trigger` without acting |

Both were setting `lastTrigger` during their skip phase, so when the node ran again, it saw `trigger === lastTrigger` (both true) and thought "nothing changed, do nothing."

**The Fix**: Don't set `lastTrigger` during skip/warmup. Leave it as `false` so the next call sees a proper rising edge (false→true).

### 🐛 Bug: HSV Slider Lag (Fixed earlier this session)

**Symptom**: Moving HSV sliders had 1-2 second delay before lights changed. Presets worked instantly.

**Root Cause**: Throttle logic in `HSVControlNode.js` was resetting the timeout on every drag, so it only fired after you stopped dragging.

**Fix**: Changed to fire immediately on drag start, then throttle subsequent updates.

### 🐛 Bug: Wrong Graph Loaded by Engine

**Symptom**: Backend engine loaded `.last_active.json` with only 2 nodes instead of user's 134-node graph.

**Root Cause**: Frontend `handleLoad()` wasn't saving to `.last_active.json`, so backend had stale graph.

**Fix**: Added `save-active` call in `handleLoad()` after loading from localStorage.

---

## FILES MODIFIED THIS SESSION

| File | What Changed |
|------|--------------|
| `backend/plugins/HAGenericDeviceNode.js` | Don't set `lastTriggerValue` during skip pass; add second `triggerUpdate()` 100ms after skip |
| `backend/src/engine/nodes/HADeviceNodes.js` | Don't set `lastTrigger` during warmup (ticks 1-3); force initial sync on tick 4 if trigger=true |
| `backend/plugins/HSVControlNode.js` | Fix slider throttle to fire during drag, not just after |
| `frontend/src/Editor.jsx` | Save to `/api/engine/save-active` after loading graph |

---

## KEY ARCHITECTURE NOTES

### Frontend Plugin vs Backend Engine (Two Cooks)

Think of it like having two cooks who both know the same recipe:
- **Frontend Plugin** (`backend/plugins/*.js`) = Cook in the dining room (runs in browser)
- **Backend Engine Node** (`backend/src/engine/nodes/*.js`) = Cook in the kitchen (runs on server)

They use different code but similar logic. Bugs need to be fixed in BOTH places.

### HAGenericDeviceNode Trigger Flow

```
SunriseSunset Node → Sender Node → [Buffer] → Receiver Node → HAGenericDeviceNode
                          ↓                           ↓
                   (writes to buffer)         (reads from buffer)
                                                      ↓
                                              trigger input = true
                                                      ↓
                                              Rising edge detected?
                                              lastTrigger=false, trigger=true
                                                      ↓
                                              YES → Turn on devices!
```

### GraphLoadComplete Event

When a graph loads:
1. `graphLoadComplete` event fires
2. HAGenericDeviceNode sets `skipInitialTrigger = true`
3. First `triggerUpdate()` runs - records state, doesn't act
4. Second `triggerUpdate()` (100ms later) - detects rising edge, turns on devices

---

## NEXT STEPS FOR FUTURE AGENT

### Immediate: Merge to Main/Stable
```bash
cd C:\X_T2_AutoTron2.1
git checkout main
git merge feature/unified-architecture
git push origin main
git push origin main:stable
```

Then bump HA add-on version:
```bash
cd home-assistant-addons
# Edit t2autotron/config.yaml - bump version
git add .; git commit -m "chore: Bump to v2.1.XX"; git push origin main
```

### Future: Unified Architecture (Deferred)

The original goal was to eliminate duplicate code between frontend plugins and backend engine nodes. This was **deferred** to focus on bug fixes. The proposal is in:
- `v3_migration/UNIFIED_ARCHITECTURE_PROPOSAL.md`

---

## DEBUG LOGGING

| Location | Flag | Log File |
|----------|------|----------|
| Backend Engine | Always on | `crashes/engine_debug.log` |
| Backend Server | `VERBOSE_LOGGING=true` in `.env` | Console |
| Frontend Editor | `EDITOR_DEBUG = true` in `Editor.jsx` | Browser console |
| Frontend Sockets | `SOCKET_DEBUG = true` in `sockets.js` | Browser console |

Engine log shows:
- `HA-INPUTS` - trigger/HSV values received
- `TRIGGER-CHANGE` - when trigger changes (includes reason)
- `HA-DEVICE-SUCCESS` / `HA-DEVICE-ERROR` - device control attempts
- `HA-HSV-SKIP` - when skipping (usually means lastTrigger already matches)

---

## GIT STATE

- **Branch**: `feature/unified-architecture`
- **Status**: All fixes committed and pushed
- **Ready to merge**: Yes

Recent commits on this branch:
1. `fix: Frontend HAGenericDeviceNode now syncs on graph load`
2. `fix: Force initial sync after warmup period ends`
3. `fix: Save graph to .last_active.json when loading`
4. `fix: HSVControlNode slider throttle`

---

## KEY FILES REFERENCE

```
Frontend:
  frontend/src/Editor.jsx         - Main Rete.js editor
  frontend/src/socket.js          - Socket.IO client
  frontend/src/ui/Dock.jsx        - Control panel UI

Backend Plugins (run in browser):
  backend/plugins/HAGenericDeviceNode.js  - HA device control (FIXED)
  backend/plugins/HSVControlNode.js       - HSV color picker (FIXED)
  backend/plugins/SenderNode.js           - Write to buffer
  backend/plugins/ReceiverNode.js         - Read from buffer

Backend Engine (run on server):
  backend/src/engine/BackendEngine.js     - Main tick loop
  backend/src/engine/nodes/HADeviceNodes.js - HA control (FIXED)
  backend/src/engine/nodes/BufferNodes.js - Sender/Receiver
  backend/src/engine/engineLogger.js      - Debug logger

API Routes:
  backend/src/api/routes/engineRoutes.js  - /api/engine/* endpoints
  backend/src/server.js                   - Main Express server
```
