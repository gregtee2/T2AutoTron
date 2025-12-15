# Unified Architecture Decision - December 15, 2025

## 🎯 TL;DR for Future Agents

**We discovered that auto-generating UI from schemas produces ugly, unusable interfaces.**

T2AutoTron's value proposition is its **beautiful, elegant UI** - unlike Node-RED's utilitarian interface. Compromising on UI defeats the entire purpose of the project.

**The decision**: Keep the custom React UIs, hide the ugly auto-generated unified nodes from users. Backend engine uses unified definitions, and frontend plugins CAN call unified logic via `window.executeUnified()`.

---

## 🦴 Caveman Summary

**The Dream**: One file that does everything - logic AND pretty UI.

**The Reality**: Auto-generated UIs look like generic IKEA furniture. Our existing UIs are hand-crafted artisan work. Users picked T2AutoTron specifically for the nice UI.

**The Solution**: 
- Keep the pretty hand-drawn pictures (React components) 
- Hide the ugly auto-generated nodes from users
- Backend engine uses unified definitions for reliable 24/7 execution
- Frontend plugins CAN call unified logic (implemented for TimeOfDayNode as proof-of-concept)

---

## What We Actually Changed

### 1. Added `hidden: true` to Unified Definitions

All three POC unified node definitions now have `hidden: true`:

```javascript
// In TimeOfDay.node.js, Delay.node.js, HAGenericDevice.node.js
module.exports = {
  id: 'HAGenericDeviceNode',
  version: '1.0.0',
  
  // === POC FLAG ===
  // Hidden from frontend context menu - backend engine uses this, frontend uses existing pretty UI
  hidden: true,
  
  // ... rest of definition
};
```

### 2. Updated UnifiedNodeLoader.js

The frontend loader now skips hidden nodes when registering with the context menu:

```javascript
function processDefinitions() {
  for (const def of pendingDefinitions) {
    // Skip hidden definitions - these are backend-only
    if (def.hidden) {
      console.log(`[UnifiedNodeLoader] Skipping hidden node: ${def.id} (backend-only, frontend uses existing UI)`);
      continue;
    }
    // ... register visible nodes normally
  }
}
```

### 3. Rebuilt Frontend

The frontend was rebuilt and copied to `backend/frontend/`.

---

## The Architecture Now

```
┌─────────────────────────────────────────────────────────────┐
│  HAGenericDevice.node.js (Unified Definition)               │
│  - execute() function (the LOGIC) ← SINGLE SOURCE OF TRUTH  │
│  - inputs/outputs schema                                    │
│  - properties schema                                        │
│  - hidden: true ← Don't show auto-generated UI              │
└─────────────────────────────────────────────────────────────┘
              │                           │
              ▼                           ▼
┌─────────────────────────┐   ┌─────────────────────────────┐
│  Backend Engine         │   │  Frontend Plugin            │
│  Uses execute() directly│   │  TimeOfDayNode.js           │
│  via EngineNodeWrapper  │   │  - Beautiful custom React UI│
│                         │   │  - Calls unified execute()  │
│  ✅ UNIFIED LOGIC       │   │    via window.executeUnified│
│                         │   │  ✅ POC IMPLEMENTED         │
└─────────────────────────┘   └─────────────────────────────┘
```

---

## ✅ What's Actually Implemented

### Frontend Infrastructure (DONE)

1. **`window.UnifiedDefinitions`** - Global object that stores ALL unified definitions (including hidden ones)
   - Location: `frontend/src/registries/UnifiedNodeLoader.js` line 28
   - Populated on load: line 418

2. **`window.executeUnified(nodeId, inputs, properties, state)`** - Helper function for plugins
   - Location: `frontend/src/registries/UnifiedNodeLoader.js` line 49
   - Returns null if definition not found (graceful fallback)

3. **TimeOfDayNode.js POC** - Updated to call unified execute()
   - Location: `backend/plugins/TimeOfDayNode.js` lines 68-84
   - Falls back to local logic if unified not available

### Backend Infrastructure (DONE)

1. **`loadUnifiedNodes()`** - Walks `shared/nodes/` and loads all `.node.js` files
   - Location: `backend/src/engine/index.js`

2. **`EngineNodeWrapper`** - Adapts unified definitions for backend engine
   - Location: `shared/EngineNodeWrapper.js`

---

## Current State of Each Plugin

| Plugin | Calls Unified? | Notes |
|--------|---------------|-------|
| TimeOfDayNode.js | ✅ Yes | POC - calls `window.executeUnified()` |
| SunriseSunsetNode.js | ✅ Yes | Migrated - calculates on/off times via unified |
| SplineTimelineColorNode.js | ✅ Yes | Migrated - HSV color calculation via unified |
| HAGenericDeviceNode.js | ❌ No | Has async device control (complex) |
| DelayNode.js | ❌ No | Has own logic copy |
| Other ~42 plugins | ❌ No | Have own logic copies |

**Unified Definitions Available** (5 total):
- `shared/nodes/time/TimeOfDay.node.js` ← Frontend wired ✅
- `shared/nodes/time/SunriseSunset.node.js` ← Frontend wired ✅
- `shared/nodes/time/SplineTimelineColor.node.js` ← Frontend wired ✅
- `shared/nodes/timer/Delay.node.js` ← Frontend NOT wired
- `shared/nodes/devices/HAGenericDevice.node.js` ← Frontend NOT wired (complex)

**To migrate another plugin**: Add this pattern to its `data()` method:
```javascript
data() {
  if (window.executeUnified) {
    if (!this._unifiedState) this._unifiedState = {};
    const result = window.executeUnified('UnifiedNodeId', {}, this.properties, this._unifiedState);
    if (result) {
      this.properties.currentState = result.state;  // Sync for UI
      return result;
    }
  }
  // Fallback to existing local logic
  return { /* existing logic */ };
}
```

---

## What's Working Now

| Component | Status | Notes |
|-----------|--------|-------|
| Backend engine | ✅ Working | Uses unified definitions via EngineNodeWrapper |
| Unified definitions | ✅ 5 nodes | TimeOfDay, Delay, HAGenericDevice, SunriseSunset, SplineTimelineColor |
| `window.UnifiedDefinitions` | ✅ Implemented | Stores ALL definitions including hidden |
| `window.executeUnified()` | ✅ Implemented | Helper for frontend plugins |
| `hidden: true` flag | ✅ Implemented | Unified nodes hidden from context menu |
| Frontend pretty UIs | ✅ Preserved | Existing plugins unchanged |
| Auto-generated ugly UIs | ✅ Hidden | Users never see them |
| TimeOfDayNode calls unified | ✅ Done | First POC success |
| SunriseSunsetNode calls unified | ✅ Done | Second migration |
| SplineTimelineColorNode calls unified | ✅ Done | Third migration (complex HSV) |

---

## What's NOT Done Yet

These are remaining for future work:

| Task | Status | Effort |
|------|--------|--------|
| Migrate HAGenericDeviceNode to call unified | ⚠️ Complex | Has async device control - needs architecture decision |
| Migrate DelayNode to call unified | ❌ Not done | 30 min |
| Migrate other ~42 plugins | ❌ Not done | 4-8 hours total |
| Create unified definitions for all nodes | ❌ Not done | Large effort |

---

## Next Steps (Optional Future Work)

### Migrate More Frontend Plugins (Recommended)

Now that the infrastructure exists, migrating other plugins is straightforward:

1. Open `backend/plugins/SomeNode.js`
2. Find the `data()` method
3. Add the unified call pattern shown above
4. Test that it falls back properly if unified not loaded

Priority order:
1. HAGenericDeviceNode (most important for consistency)
2. DelayNode
3. Simple logic nodes (AND, OR, NOT)
4. Leave complex UI nodes for last

### Create More Unified Definitions (Lower Priority)

Create unified definitions for other nodes, prioritizing:
1. Simple logic nodes (AND, OR, NOT, Compare)
2. Timer nodes (already have Delay)
3. Leave complex UI nodes (color pickers, device selectors) for last

---

## Key Files

| File | Purpose |
|------|---------|
| `shared/nodes/time/TimeOfDay.node.js` | Unified definition (hidden) |
| `shared/nodes/timer/Delay.node.js` | Unified definition (hidden) |
| `shared/nodes/devices/HAGenericDevice.node.js` | Unified definition (hidden) |
| `shared/UnifiedNodeRegistry.js` | Loads definitions in Node.js |
| `shared/EngineNodeWrapper.js` | Adapts definitions for backend engine |
| `frontend/src/registries/UnifiedNodeLoader.js` | Loads in browser, skips hidden |
| `backend/plugins/*.js` | Pretty UI plugins (have duplicate logic) |

---

## Why This Matters

### The Owner's Perspective (Non-Programmer)

> "I want the user experience with the custom CSS, but the reliability of the unified approach."

This solution delivers that:
- **Users see**: Beautiful, hand-crafted UIs they're used to ✅
- **Backend gets**: Reliable, unified execute() logic ✅
- **Frontend CAN use unified logic**: Infrastructure in place, TimeOfDayNode POC working ✅

### Technical Benefits

1. **Backend engine reliability** - Uses unified definitions with proper delegation pattern
2. **No regression** - Existing frontend plugins unchanged
3. **Clean user experience** - Ugly auto-generated UIs hidden
4. **Gradual migration path** - Infrastructure ready, plugins can be migrated one-by-one
5. **Graceful fallback** - If unified not loaded, plugins fall back to local logic

---

## Questions?

If you're an AI agent continuing this work and something is unclear:

1. Read `shared/README.md` for architecture overview
2. Check `UNIFIED_ARCHITECTURE_PROPOSAL.md` for original rationale
3. Look at the unified definitions to understand the format
4. The `hidden: true` flag hides ugly auto-generated UIs from users

**Key verification**: Run these searches to confirm implementation:
```bash
# Verify window.UnifiedDefinitions exists
grep -r "window.UnifiedDefinitions" frontend/src/

# Verify window.executeUnified exists  
grep -r "window.executeUnified" frontend/src/

# Verify TimeOfDayNode calls unified
grep -r "executeUnified" backend/plugins/TimeOfDayNode.js
```

---

*Document created: December 15, 2025*  
*Last updated: December 15, 2025*  
*Context: POC discovered auto-generated UIs are not acceptable - implemented hidden flag + frontend calling infrastructure*
