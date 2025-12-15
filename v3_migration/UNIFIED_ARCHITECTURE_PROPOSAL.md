# T2AutoTron Unified Architecture Proposal

**Document Created**: December 15, 2025  
**Status**: Proposal / Discussion  
**Related Conversation**: Architecture unification to eliminate duplicate frontend/backend node implementations

---

## 🦴 Caveman Summary

**The Problem**: Right now we have TWO separate codebases doing the same thing:
- 47 frontend plugins (React + Rete.js) for the pretty UI
- 45 backend node classes (plain Node.js) for the engine that runs 24/7

If you add a feature to one, you have to manually add it to the other. They can drift apart. It's like having two recipe books that are supposed to be identical but are written by different chefs.

**The Dream**: ONE source of truth. Write a node definition once, and both the UI and the engine use it. Change it once, both update automatically.

**The Question**: Is this worth doing? And how would we approach it?

---

## Current Architecture (v2.1)

```
┌────────────────────────────────────────────────────────────────────┐
│                        CURRENT SYSTEM                               │
├────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  FRONTEND (browser/Electron)          BACKEND (Node.js server)     │
│  ┌─────────────────────────┐          ┌─────────────────────────┐  │
│  │  47 Plugin Files        │          │  12 Engine Node Modules │  │
│  │  backend/plugins/*.js   │          │  src/engine/nodes/*.js  │  │
│  │                         │          │                         │  │
│  │  - React.createElement  │    ≠     │  - Plain JS classes     │  │
│  │  - Rete.js ClassicPreset│          │  - process() method     │  │
│  │  - changeCallback chain │          │  - No UI code           │  │
│  │  - serialize/restore    │          │  - Different patterns   │  │
│  └─────────────────────────┘          └─────────────────────────┘  │
│           ↓                                    ↓                    │
│      Graph JSON  ─────────────────────→  Graph JSON                │
│      (same format, different interpreters)                         │
│                                                                     │
└────────────────────────────────────────────────────────────────────┘
```

### Files Involved

**Frontend Plugins** (47 files in `backend/plugins/`):
- Load via `GET /api/plugins` → browser `<script>` injection
- Use IIFE pattern with `window.nodeRegistry.register()`
- Contain React components for UI rendering
- Contain node logic in `data()` method

**Backend Engine Nodes** (12 files in `src/engine/nodes/`):
- Loaded via Node.js `require()`
- Plain ES6 classes
- Contain node logic in `process()` method
- ~45 total node classes across 12 modules

### The Maintenance Problem

When you want to add a feature (e.g., "add a 'pause' input to DelayNode"):

1. ❌ Edit `backend/plugins/DelayNode.js` (frontend version)
2. ❌ Edit `src/engine/nodes/DelayNode.js` (backend version)
3. ❌ Hope you made the same changes in both
4. ❌ Test both separately
5. ❌ Hope they don't drift over time

---

## Proposed Architecture (v3.0)

```
┌────────────────────────────────────────────────────────────────────┐
│                      UNIFIED SYSTEM                                 │
├────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              SHARED NODE DEFINITIONS                         │   │
│  │              shared/nodes/*.node.js                          │   │
│  │                                                              │   │
│  │  - Schema: inputs, outputs, properties                       │   │
│  │  - UI hints: icon, color, category, helpText                 │   │
│  │  - Logic: execute(inputs, props, context) → outputs          │   │
│  │  - Validation: validateInputs(), validateProperties()        │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                    ↓                    ↓                           │
│        ┌──────────────────┐    ┌──────────────────────┐            │
│        │  UI RENDERER     │    │  ENGINE EXECUTOR     │            │
│        │  (React/Rete)    │    │  (Node.js)           │            │
│        │                  │    │                      │            │
│        │  Auto-generates: │    │  Uses directly:      │            │
│        │  - Node component│    │  - execute() func    │            │
│        │  - Socket layout │    │  - Input validation  │            │
│        │  - Property UI   │    │  - Output types      │            │
│        │  - Tooltips      │    │                      │            │
│        └──────────────────┘    └──────────────────────┘            │
│                    ↘                ↙                               │
│              ┌─────────────────────────┐                           │
│              │       Graph JSON        │                           │
│              │     (saved state)       │                           │
│              └─────────────────────────┘                           │
│                                                                     │
└────────────────────────────────────────────────────────────────────┘
```

### Unified Node Definition Format

```javascript
// shared/nodes/TimeOfDay.node.js
module.exports = {
  // === IDENTITY ===
  id: 'TimeOfDayNode',
  version: '1.0.0',
  
  // === UI METADATA ===
  label: 'Time of Day',
  category: 'Timer/Event',
  icon: '⏰',
  color: '#4a90d9',
  width: 180,
  helpText: 'Outputs the current time components',
  
  // === INPUTS ===
  inputs: {
    // This node has no inputs
  },
  
  // === OUTPUTS ===
  outputs: {
    hour: { 
      type: 'number', 
      label: 'Hour', 
      description: 'Current hour (0-23)' 
    },
    minute: { 
      type: 'number', 
      label: 'Minute', 
      description: 'Current minute (0-59)' 
    },
    formatted: { 
      type: 'string', 
      label: 'Time', 
      description: 'Formatted as HH:MM' 
    },
    isPM: { 
      type: 'boolean', 
      label: 'Is PM', 
      description: 'True if afternoon/evening' 
    }
  },
  
  // === CONFIGURABLE PROPERTIES ===
  properties: {
    use24Hour: {
      type: 'boolean',
      default: true,
      label: '24-Hour Format',
      description: 'Use 24-hour time format'
    },
    timezone: {
      type: 'select',
      default: 'local',
      options: ['local', 'UTC'],
      label: 'Timezone'
    }
  },
  
  // === THE ACTUAL LOGIC ===
  // This function runs in BOTH frontend preview AND backend engine
  execute(inputs, properties, context) {
    const now = properties.timezone === 'UTC' ? new Date().toUTCString() : new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    
    let formatted;
    if (properties.use24Hour) {
      formatted = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    } else {
      const h = hour % 12 || 12;
      const ampm = hour < 12 ? 'AM' : 'PM';
      formatted = `${h}:${minute.toString().padStart(2, '0')} ${ampm}`;
    }
    
    return {
      hour,
      minute,
      formatted,
      isPM: hour >= 12
    };
  },
  
  // === OPTIONAL: Custom UI (only if auto-generated UI isn't enough) ===
  // customComponent: (props) => React.createElement(...),
  
  // === OPTIONAL: Validation ===
  validate(properties) {
    return { valid: true };
  }
};
```

### What Gets Auto-Generated

From the schema above, the UI renderer would automatically create:

1. **Node Header**: Icon + label + help tooltip
2. **Output Sockets**: Based on `outputs` definition, correct types
3. **Input Sockets**: Based on `inputs` definition (none in this case)
4. **Property Controls**: Toggle for `use24Hour`, dropdown for `timezone`
5. **Socket Colors**: Based on type (number=blue, boolean=green, etc.)

The engine would directly use:
1. **`execute()` function**: Called every tick
2. **Input/output type info**: For validation
3. **Property defaults**: For initialization

---

## Migration Strategy

### Option A: Big Bang (Not Recommended)
- Rewrite everything at once
- Risk: 2-3 weeks of broken system
- Risk: Lose working functionality

### Option B: Incremental Migration (Recommended)

**Phase 1: Proof of Concept (1-2 hours)**
- Pick 3 nodes: one simple, one medium, one complex
- Create unified definitions
- Build minimal loader that works in both environments
- Verify it actually works

**Phase 2: Infrastructure (2-4 hours)**
- Build robust UnifiedNodeRegistry
- Create auto-UI-generation system
- Set up fallback to legacy plugins for unmigrated nodes

**Phase 3: Node Migration (4-6 hours)**
- Migrate nodes in batches by category
- Test each batch before moving on
- Keep legacy system running in parallel

**Phase 4: Cleanup (1-2 hours)**
- Remove legacy duplicate code
- Update documentation
- Final testing

### File Structure After Migration

```
T2AutoTron/
├── shared/                          # NEW: Shared between frontend & backend
│   ├── nodes/                       # Unified node definitions
│   │   ├── time/
│   │   │   ├── TimeOfDay.node.js
│   │   │   ├── TimeRange.node.js
│   │   │   ├── DayOfWeek.node.js
│   │   │   └── SunriseSunset.node.js
│   │   ├── logic/
│   │   │   ├── And.node.js
│   │   │   ├── Or.node.js
│   │   │   ├── Compare.node.js
│   │   │   └── ...
│   │   ├── devices/
│   │   │   ├── HAGenericDevice.node.js
│   │   │   ├── HueLight.node.js
│   │   │   ├── KasaPlug.node.js
│   │   │   └── ...
│   │   └── color/
│   │       ├── SplineTimeline.node.js
│   │       ├── HSVToRGB.node.js
│   │       └── ...
│   ├── UnifiedNodeRegistry.js       # Loads definitions, provides to both
│   ├── NodeValidator.js             # Shared validation logic
│   └── types.js                     # Socket type definitions
│
├── frontend/                        # UI-specific code
│   ├── src/
│   │   ├── NodeRenderer.jsx         # Generates React components from schemas
│   │   ├── SocketRenderer.jsx       # Renders sockets with correct colors
│   │   ├── PropertyRenderer.jsx     # Generates property UI controls
│   │   └── Editor.jsx               # Main editor (mostly unchanged)
│   └── ...
│
├── backend/                         # Server-specific code
│   ├── src/
│   │   ├── engine/
│   │   │   ├── BackendEngine.js     # Uses unified definitions
│   │   │   └── EngineNodeWrapper.js # Wraps definition for engine use
│   │   └── server.js
│   └── plugins/                     # LEGACY: Keep for unmigrated nodes
│       └── (gradually emptied as nodes are migrated)
│
└── ...
```

---

## What Stays The Same vs Changes

### ✅ STAYS THE SAME

| Component | Why |
|-----------|-----|
| **Rete.js Editor** | Still the core visual editor framework |
| **React Frontend** | Still renders the UI |
| **Socket.IO communication** | Still handles real-time updates |
| **Graph JSON format** | Same save/load format |
| **Device managers** | HA, Hue, Kasa managers unchanged |
| **REST API** | Same endpoints |
| **Home Assistant Add-on** | Same deployment model |

### 🔄 CHANGES

| Component | Current | Unified |
|-----------|---------|---------|
| **Node definitions** | 47 plugins + 45 engine classes | ~50 unified definitions |
| **Where logic lives** | Duplicated in two places | Single `execute()` function |
| **UI generation** | Manual React.createElement | Auto-generated from schema |
| **Adding new nodes** | Edit 2 files | Edit 1 file |
| **Node testing** | Test frontend + backend separately | Test once, works everywhere |

---

## Effort Estimates

### Human Developer (for reference)
| Phase | Hours |
|-------|-------|
| Design & planning | 8-16 |
| Infrastructure | 24-40 |
| Node migration (50 nodes) | 80-120 |
| Testing & debugging | 40-60 |
| **Total** | **150-236 hours** |

### AI Agent (realistic)
| Phase | Time |
|-------|------|
| POC (3 nodes) | 30-60 minutes |
| Infrastructure | 2-3 hours |
| Node migration (50 nodes) | 3-5 hours |
| Testing & debugging | 1-2 hours |
| **Total** | **6-10 hours of agent work** |

Note: Agent time is spread across multiple sessions for human review/testing between phases.

---

## Decision Points for Human

Before proceeding, the human owner should decide:

### 1. Is This Worth Doing?
- **Pro**: Cleaner architecture, easier maintenance, less duplication
- **Con**: Takes time, current system works, risk of breaking things

### 2. When To Do It?
- **Now**: While architecture is fresh in mind, before more features added
- **Later**: After current bugs are stable, as a v3.0 project
- **Never**: Just maintain dual system, document carefully

### 3. Approach?
- **Option A: In-Place Migration**: Modify v2.1 incrementally
  - Pro: No context switching, gradual improvement
  - Con: Risk of breaking working system
  
- **Option B: Fresh v3.0 Project**: New folder, port what works
  - Pro: Clean slate, can cherry-pick best patterns
  - Con: Need to maintain two versions during transition

### 4. Start With POC?
Recommendation: Yes. Spend 1 hour on proof-of-concept to validate the approach before committing to full migration.

---

## Questions To Answer Before Starting

1. **Do we need custom UI for any nodes?** (Most can be auto-generated, but some might need special layouts)

2. **How do we handle node-specific device managers?** (HA, Hue, Kasa need different API calls)

3. **What about the AutoTronBuffer system?** (Cross-node communication might need special handling)

4. **Browser compatibility?** (Unified code must work in both Node.js and browsers)

5. **Testing strategy?** (How do we verify nodes work identically in both environments?)

---

## Next Steps (If Proceeding)

1. **Human Decision**: In-place migration vs fresh v3.0?
2. **POC Phase**: Pick 3 nodes, build minimal infrastructure, prove it works
3. **Review POC**: Human evaluates if result is worth continuing
4. **Full Migration**: If POC succeeds, migrate all nodes
5. **Cleanup**: Remove legacy code, update docs

---

## Appendix: Node Inventory

### Current Frontend Plugins (47 files)
```
00_BaseNodePlugin.js, 00_ColorUtilsPlugin.js, 00_HABasePlugin.js,
00_LogicGateBasePlugin.js, 00_NodeComponentsPlugin.js, 00_SharedControlsPlugin.js,
AllInOneColorNode.js, AndNode.js, BackdropNode.js, ChangeNode.js,
ColorGradientNode.js, CompareNode.js, CurrentTimeNode.js, DayOfWeekNode.js,
DebugConsoleNode.js, DelayNode.js, EventLogNode.js, HAClimateNode.js,
HAGenericDeviceNode.js, HALightNode.js, HAMediaPlayerNode.js, HASensorNode.js,
HASwitchNode.js, HueGroupNode.js, HueLightNode.js, InvertNode.js,
KasaLightNode.js, KasaPlugNode.js, LatchNode.js, MQTTNode.js,
NotNode.js, NumberInputNode.js, ORNode.js, PushbuttonNode.js,
RandomColorNode.js, ReceiverNode.js, SenderNode.js, ShellyPlugNode.js,
SplineTimelineColorNode.js, SunriseSunsetNode.js, SwitchNode.js,
TelegramNode.js, ThresholdNode.js, TimeOfDayNode.js, TimeRangeNode.js,
ToggleLatchNode.js, WeatherNode.js
```

### Current Backend Engine Nodes (~45 classes in 12 modules)
```
AdditionalNodes.js: NumberInputNode, InvertNode, ChangeNode, DebugConsoleNode,
                    MQTTNode, EventLogNode, SwitchNode, RandomColorNode,
                    WeatherNode, TelegramNode

BufferNodes.js: SenderNode, ReceiverNode, BufferDisplayNode

ColorNodes.js: SplineTimelineColorNode, AllInOneColorNode, HSVToRGBNode, RGBToHSVNode

DelayNode.js: DelayNode (3 modes: delay, debounce, retriggerable)

HADeviceNodes.js: HAGenericDeviceNode, HALightNode, HASwitchNode, HASensorNode

HueNodes.js: HueLightNode, HueGroupNode

InputNodes.js: NumberInputNode, ToggleNode, PushbuttonNode

KasaNodes.js: KasaLightNode, KasaPlugNode

LogicNodes.js: AndNode, OrNode, NotNode, CompareNode, ThresholdNode, LatchNode

ShellyNodes.js: ShellyPlugNode

TimeNodes.js: CurrentTimeNode, TimeRangeNode, DayOfWeekNode, SunriseSunsetNode, TimeOfDayNode
```

---

*Document maintained for future AI agents and human developers.*
*Last updated: December 15, 2025*
