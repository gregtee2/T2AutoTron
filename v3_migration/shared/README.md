# Unified Node Architecture

**Status**: POC Phase 1 Complete ✅  
**Branch**: `feature/unified-architecture`

## 🦴 What Is This? (Caveman Edition)

Before, we had **TWO recipe books** - one for the pretty UI (frontend plugins) and one for the robot worker (backend engine). If you changed a recipe in one book, you had to manually copy it to the other book.

Now we have **ONE recipe book** that both use. Change it once, both update!

## Current Status

| Phase | Status | Notes |
|-------|--------|-------|
| **1. POC - First Node** | ✅ Complete | `TimeOfDayNode` unified |
| **2. POC - Second Node** | ✅ Complete | `DelayNode` (4 modes: delay, debounce, throttle, retriggerable) |
| **3. POC - Third Node** | ✅ Complete | `HAGenericDeviceNode` (device control with async actions) |
| **4. Frontend Loader** | ⏳ Next | Auto-generate React components from definitions |
| **5. Full Migration** | ⏳ Future | All 47 plugins → unified format |

## File Structure

```
v3_migration/shared/
├── nodes/                    # Unified node definitions
│   ├── time/
│   │   └── TimeOfDay.node.js # Time-based trigger ✅
│   ├── timer/
│   │   └── Delay.node.js     # Delay/debounce/throttle/retriggerable ✅
│   └── devices/
│       └── HAGenericDevice.node.js  # Home Assistant device control ✅
├── UnifiedNodeRegistry.js    # Loads and manages definitions
├── EngineNodeWrapper.js      # Makes unified nodes work with backend engine
├── test-unified.js           # Test file (run with: node test-unified.js)
└── README.md                 # This file
```

## How Unified Nodes Work

### Definition Format

Each node is defined in a single `.node.js` file:

```javascript
module.exports = {
  // Identity
  id: 'MyNode',
  version: '1.0.0',
  
  // UI metadata
  label: 'My Node',
  category: 'Category',
  icon: '🔧',
  helpText: 'What this node does...',
  
  // Schema
  inputs: { /* input definitions */ },
  outputs: { /* output definitions */ },
  properties: { /* configurable properties */ },
  
  // Logic - runs in BOTH frontend and backend
  execute(inputs, properties, context, state) {
    // ... pure logic, no React, no require() ...
    return { outputName: value };
  }
};
```

### Using in Backend Engine

```javascript
const unifiedRegistry = require('./shared/UnifiedNodeRegistry');
const { createEngineNode } = require('./shared/EngineNodeWrapper');

// Load definitions
unifiedRegistry.loadFromDirectory('./shared/nodes');

// Create engine-compatible node
const TimeOfDayDef = unifiedRegistry.get('TimeOfDayNode');
const TimeOfDayClass = createEngineNode(TimeOfDayDef);

// Use like any other engine node
const node = new TimeOfDayClass();
node.restore(savedData);
const outputs = node.data(inputs);
```

### Using in Frontend (TODO)

Will auto-generate React components from the definition schema.

## Key Constraints

1. **No Browser APIs in execute()** - Must work in Node.js too
2. **No Node.js APIs in execute()** - Must work in browser too
3. **Use context.now()** - Don't use `new Date()` directly (allows testing with mock time)
4. **State is passed in** - Don't use class instance variables for state

## Running Tests

```bash
cd v3_migration/shared
node test-unified.js
```

Expected output:
```
✅ TimeOfDayNode tests passed!
✅ EngineNodeWrapper tests passed!
✅ DelayNode tests passed!
✅ HAGenericDeviceNode tests passed!
=== All Tests Complete ===
```

## Design Patterns

### Device Control (Delegation Pattern)

Device nodes (HAGenericDevice, HueLight, KasaLight, etc.) should **NOT** make HTTP calls directly. Instead, they delegate to device managers:

```javascript
// ❌ BAD - Don't make HTTP calls directly
async execute(inputs, properties, context, state) {
  await fetch(`http://homeassistant/api/services/light/turn_on`, {...});
}

// ✅ GOOD - Delegate to device manager
async execute(inputs, properties, context, state) {
  const haManager = context.deviceManagers?.homeAssistant;
  if (haManager) {
    await haManager.controlDevice(entityId, shouldTurnOn, { ...colorData });
  }
  return { is_on: shouldTurnOn };
}
```

**Why?** 
- Device managers handle authentication, rate limiting, error recovery
- Frontend can run with a mock manager for preview
- Backend runs with real managers for actual control
- Node logic stays pure and testable

### Async vs Sync Execute

- **Simple nodes** (TimeOfDay, logic gates): Use sync `execute()`
- **Device nodes** (HAGenericDevice, HueLight): Use async `execute()` to await device manager calls

The `EngineNodeWrapper` handles both automatically.

## Next Steps

1. ~~Create `DelayNode.node.js`~~ ✅ Complete
2. ~~Create `HAGenericDeviceNode.node.js`~~ ✅ Complete
3. Build frontend loader that generates React components from definitions
4. Test in actual running system
5. Migrate remaining nodes (start with simple ones)
