# T2AutoTron Backend Engine - v2.2 Architecture Plan

## Overview

Move the DataflowEngine from browser (frontend) to Node.js (backend) so automations run 24/7 without requiring a browser window.

## Current vs Target Architecture

### Current (v2.1)
```
Browser                          Server
┌─────────────────────┐         ┌──────────────────┐
│ React UI            │         │ Express API      │
│ Rete.js Editor      │ ──────► │ Device Managers  │
│ DataflowEngine ⚡   │         │ Socket.IO        │
│ Plugin Execution    │         └──────────────────┘
└─────────────────────┘
     ↑ RUNS HERE
     (stops when browser closes)
```

### Target (v2.2)
```
Browser                          Server
┌─────────────────────┐         ┌──────────────────┐
│ React UI            │         │ Express API      │
│ Rete.js Editor      │ ──────► │ Device Managers  │
│ (Visual Only)       │ sync    │ Socket.IO        │
└─────────────────────┘ graph   │ BackendEngine ⚡ │
                                │ Plugin Execution │
                                └──────────────────┘
                                     ↑ RUNS HERE
                                     (runs 24/7)
```

## Key Components

### 1. BackendEngine (`/src/engine/BackendEngine.js`)

Core execution loop that replaces browser's DataflowEngine:

```javascript
class BackendEngine {
  constructor() {
    this.nodes = new Map();      // nodeId → node instance
    this.connections = [];        // [{source, sourceOutput, target, targetInput}]
    this.outputs = new Map();     // nodeId → {outputName: value}
    this.running = false;
    this.tickRate = 100;          // ms between ticks (10 Hz)
  }

  async loadGraph(graphPath) {
    const graphJson = await fs.readFile(graphPath, 'utf8');
    const graph = JSON.parse(graphJson);
    
    // Instantiate nodes from registry
    for (const nodeData of graph.nodes) {
      const NodeClass = this.registry.get(nodeData.name);
      const node = new NodeClass();
      node.restore(nodeData);
      this.nodes.set(nodeData.id, node);
    }
    
    this.connections = graph.connections;
  }

  async tick() {
    // Topological sort for execution order
    const sorted = this.topologicalSort();
    
    for (const nodeId of sorted) {
      const node = this.nodes.get(nodeId);
      
      // Gather inputs from connected outputs
      const inputs = this.gatherInputs(nodeId);
      
      // Execute node's data() method
      if (node.data) {
        const outputs = await node.data(inputs);
        this.outputs.set(nodeId, outputs);
      }
    }
  }

  start() {
    this.running = true;
    this.tickInterval = setInterval(() => this.tick(), this.tickRate);
    console.log('[BackendEngine] Started');
  }

  stop() {
    this.running = false;
    clearInterval(this.tickInterval);
    console.log('[BackendEngine] Stopped');
  }
}
```

### 2. Backend Node Registry (`/src/engine/BackendNodeRegistry.js`)

Loads node classes that work without React:

```javascript
class BackendNodeRegistry {
  constructor() {
    this.nodes = new Map();
  }

  register(name, nodeClass) {
    this.nodes.set(name, nodeClass);
  }

  get(name) {
    return this.nodes.get(name);
  }
}
```

### 3. Isomorphic Plugin Pattern

Plugins need to work in BOTH browser (for UI) and Node.js (for execution):

```javascript
// Plugin structure for isomorphic execution
(function() {
  const isBrowser = typeof window !== 'undefined';
  const isNode = typeof global !== 'undefined' && !isBrowser;

  // === EXECUTION LOGIC (works in both environments) ===
  class TimeOfDayNodeLogic {
    constructor() {
      this.properties = { startTime: '08:00', endTime: '18:00' };
    }

    data(inputs) {
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const [startH, startM] = this.properties.startTime.split(':').map(Number);
      const [endH, endM] = this.properties.endTime.split(':').map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;
      
      const inRange = currentMinutes >= startMinutes && currentMinutes < endMinutes;
      return { active: inRange };
    }

    restore(state) {
      Object.assign(this.properties, state.properties);
    }
  }

  // === BROWSER-ONLY UI ===
  if (isBrowser && window.React) {
    const { ClassicPreset } = window.Rete;
    
    class TimeOfDayNode extends ClassicPreset.Node {
      // ... UI wrapper, sockets, controls ...
    }
    
    function TimeOfDayNodeComponent({ data }) {
      // ... React component for visual editor ...
    }
    
    window.nodeRegistry.register('TimeOfDayNode', {
      nodeClass: TimeOfDayNode,
      component: TimeOfDayNodeComponent,
      // ...
    });
  }

  // === NODE.JS BACKEND ===
  if (isNode) {
    module.exports = TimeOfDayNodeLogic;
    // Or: global.backendNodeRegistry.register('TimeOfDayNode', TimeOfDayNodeLogic);
  }
})();
```

### 4. Graph Sync API

New endpoints for frontend ↔ backend graph synchronization:

```javascript
// POST /api/engine/load - Load graph into backend engine
app.post('/api/engine/load', async (req, res) => {
  const { graphPath } = req.body;
  await backendEngine.loadGraph(graphPath);
  res.json({ success: true });
});

// POST /api/engine/start - Start execution
app.post('/api/engine/start', (req, res) => {
  backendEngine.start();
  res.json({ success: true, running: true });
});

// POST /api/engine/stop - Stop execution
app.post('/api/engine/stop', (req, res) => {
  backendEngine.stop();
  res.json({ success: true, running: false });
});

// GET /api/engine/status - Get engine status
app.get('/api/engine/status', (req, res) => {
  res.json({
    running: backendEngine.running,
    nodeCount: backendEngine.nodes.size,
    lastTick: backendEngine.lastTickTime
  });
});

// Socket.IO: Real-time sync
io.on('connection', (socket) => {
  socket.on('graph-updated', async (graphJson) => {
    // Hot-reload graph without stopping
    await backendEngine.hotReload(graphJson);
  });
});
```

### 5. Auto-Start on Server Boot

```javascript
// In server.js startup
async function initBackendEngine() {
  const lastGraphPath = path.join(__dirname, '../Saved_Graphs/.last_active.json');
  
  if (await fs.pathExists(lastGraphPath)) {
    console.log('[Server] Loading last active graph...');
    await backendEngine.loadGraph(lastGraphPath);
    backendEngine.start();
    console.log('[Server] Backend engine running');
  }
}

// Call after server starts
initBackendEngine();
```

## Node Categories by Complexity

### Easy to Port (pure logic, no UI dependencies)
- ✅ TimeOfDayNode - just time comparison
- ✅ TimeRangeNode - just time comparison  
- ✅ SunriseSunsetNode - uses suncalc library
- ✅ DelayNode - setTimeout/setInterval
- ✅ TriggerNode - setTimeout/setInterval
- ✅ InjectNode - cron-like scheduling
- ✅ LogicGates (AND, OR, NOT, etc.) - pure logic
- ✅ CompareNode - pure logic
- ✅ SwitchNode - pure logic
- ✅ MathNode - pure logic

### Medium (need API access)
- ⚠️ HADeviceAutomationNode - needs fetch → use node-fetch
- ⚠️ HAGenericDeviceNode - needs fetch
- ⚠️ HueLightNode - needs fetch
- ⚠️ KasaLightNode - needs fetch
- ⚠️ WeatherNode - needs fetch

### Hard (complex state/calculations)
- 🔴 SplineTimelineColorNode - spline math, HSV calculations
- 🔴 ColorGradientNode - gradient calculations
- 🔴 HSVModifierNode - color math
- 🔴 AllInOneColorNode - complex color logic

## Implementation Order

### Phase 1: Core Engine (Day 1)
1. Create BackendEngine class
2. Create BackendNodeRegistry
3. Add /api/engine/* endpoints
4. Add auto-start on server boot

### Phase 2: Simple Nodes (Day 1-2)
5. Port TimeOfDayNode, TimeRangeNode
6. Port Logic Gates (AND, OR, NOT, XOR)
7. Port DelayNode, TriggerNode
8. Port InjectNode

### Phase 3: Device Nodes (Day 2)
9. Port HADeviceAutomationNode
10. Port HueLightNode, KasaLightNode
11. Test with real devices

### Phase 4: Color Nodes (Day 2-3)
12. Port ColorUtils to backend
13. Port SplineTimelineColorNode
14. Port ColorGradientNode
15. End-to-end test with timeline → lights

### Phase 5: Integration (Day 3)
16. Frontend "Run on Server" toggle
17. Status indicator showing backend engine state
18. Hot-reload when graph saved
19. Documentation

## Files to Create

```
backend/src/engine/
├── BackendEngine.js          # Core execution loop
├── BackendNodeRegistry.js    # Node class registry
├── nodeRunner.js             # Individual node executor
├── graphLoader.js            # Parse and instantiate from JSON
└── nodes/                    # Backend-compatible node logic
    ├── TimeOfDayNode.js
    ├── TimeRangeNode.js
    ├── DelayNode.js
    ├── LogicGates.js
    ├── HADeviceNode.js
    └── ColorNodes.js
```

## Testing Strategy

1. Unit tests for BackendEngine tick loop
2. Unit tests for each ported node
3. Integration test: load graph → run → verify outputs
4. End-to-end: TimeOfDay → HALight, verify light turns on

## Success Criteria

- [ ] Backend engine starts automatically on server boot
- [ ] Graph loads from saved JSON
- [ ] TimeOfDayNode triggers at correct times
- [ ] HADeviceAutomationNode controls real devices
- [ ] SplineTimelineColorNode outputs correct HSV at current time
- [ ] Frontend shows "Engine Running" status
- [ ] Graph changes hot-reload without restart
- [ ] Works in HA add-on without browser open

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Plugin React dependencies | Extract pure logic into separate functions |
| Timing drift | Use high-resolution timers, sync to system clock |
| Memory leaks from intervals | Proper cleanup on graph reload |
| Node state synchronization | Socket.IO events for state changes |

---

## Estimated AI-Assisted Timeline

| Phase | Time |
|-------|------|
| Phase 1: Core Engine | 1-2 hours |
| Phase 2: Simple Nodes | 1-2 hours |
| Phase 3: Device Nodes | 1 hour |
| Phase 4: Color Nodes | 2-3 hours |
| Phase 5: Integration | 1 hour |
| **Total** | **6-9 hours** |

Ready to implement when you give the go-ahead!
