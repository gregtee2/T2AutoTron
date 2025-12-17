# T2AutoTron Plugin Architecture

> **IMPORTANT FOR AI ASSISTANTS**: This document defines the plugin architecture for T2AutoTron. ALL new nodes should be created as plugins in `backend/plugins/`. Do NOT create nodes in `frontend/src/nodes/` - that folder is deprecated.

## 🆕 Two-Layer Architecture (v2.1.60+)

T2AutoTron now has **two execution layers**:

| Layer | Location | Purpose | Runs When |
|-------|----------|---------|-----------|
| **Frontend Plugins** | `backend/plugins/*.js` | Visual UI in browser | Browser open |
| **Backend Engine Nodes** | `backend/src/engine/nodes/*.js` | 24/7 automation logic | Always (server-side) |

### Why Two Layers?

- **Frontend plugins** render the visual node editor and handle user interaction
- **Backend engine nodes** execute the same logic on the server, even when the browser is closed
- This enables **24/7 automations** - your lights keep changing colors while you sleep!

### Which Files to Create?

| Creating... | Frontend Plugin | Backend Node | Both? |
|-------------|-----------------|--------------|-------|
| New automation node | ✅ Yes | ✅ Yes | Yes - both! |
| Visual-only node (e.g., color picker preview) | ✅ Yes | ❌ No | Frontend only |
| Server-only logic (rare) | ❌ No | ✅ Yes | Backend only |

**Most new nodes need BOTH** - a frontend plugin for the visual editor AND a backend node for 24/7 execution.

---

## Overview

T2AutoTron uses a **plugin-based architecture** where all visual nodes are loaded dynamically at runtime from the `backend/plugins/` directory. This design allows:

1. **Protected Core**: The compiled React/Vite bundle contains only the editor framework
2. **User-Extensible**: Users can create/modify nodes without rebuilding
3. **Hot-Reloadable**: Node changes take effect on page refresh (no rebuild required)

## Directory Structure

```
v3_migration/
├── backend/
│   ├── plugins/                    ← ALL NODES GO HERE
│   │   ├── 00_ColorUtilsPlugin.js  ← Shared utilities (loads first)
│   │   ├── AllInOneColorNode.js
│   │   ├── BackdropNode.js
│   │   ├── ColorGradientNode.js
│   │   ├── ConditionalSwitchNode.js
│   │   ├── DisplayNode.js
│   │   ├── HAGenericDeviceNode.js
│   │   ├── HSVControlNode.js
│   │   ├── HSVModifierNode.js
│   │   ├── IntegerSelectorNode.js
│   │   └── ... (other nodes)
│   ├── src/
│   │   └── server.js               ← Serves plugins via /api/plugins
│   └── frontend/                   ← Compiled frontend (from Vite build)
│
└── frontend/
    ├── src/
    │   ├── Editor.jsx              ← Core editor (PROTECTED)
    │   ├── registries/
    │   │   ├── NodeRegistry.js     ← Node registration system (PROTECTED)
    │   │   └── PluginLoader.js     ← Loads plugins at runtime (PROTECTED)
    │   ├── sockets.js              ← Socket definitions (PROTECTED)
    │   ├── utils/
    │   │   └── ColorUtils.js       ← For React-side usage (if any remain)
    │   └── nodes/                  ← DEPRECATED - DO NOT USE
    │       └── registerNodes.js    ← Should be empty or minimal
    └── dist/                       ← Vite build output
```

## How Plugins Work

### 1. Plugin Loading Sequence

1. Browser loads compiled React bundle
2. Bundle exposes globals: `window.Rete`, `window.React`, `window.nodeRegistry`, `window.sockets`
3. PluginLoader fetches `/api/plugins` → returns list of plugin JS files
4. Plugins are loaded via `<script>` tags in alphabetical order
5. Each plugin registers itself with `window.nodeRegistry.register()`

### 2. Plugin Load Order

Plugins load **alphabetically by filename**. Use numeric prefixes to control order:
- `00_ColorUtilsPlugin.js` - Loads first (shared utilities)
- `AllInOneColorNode.js` - Loads after shared utilities
- `ZzLastPlugin.js` - Would load last

### 3. Plugin File Structure

Every plugin follows this pattern:

```javascript
(function() {
    console.log("[NodeName] Loading plugin...");

    // Check dependencies
    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets) {
        console.error("[NodeName] Missing dependencies");
        return;
    }

    // Get dependencies from window globals
    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect, useRef, useCallback } = React;
    const RefComponent = window.RefComponent;
    const sockets = window.sockets;

    // -------------------------------------------------------------------------
    // CSS INJECTION (inline styles for this node)
    // -------------------------------------------------------------------------
    const styleId = 'node-name-css';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.innerHTML = `
            .my-node { /* styles */ }
        `;
        document.head.appendChild(style);
    }

    // -------------------------------------------------------------------------
    // SHARED UTILITIES (optional - use window.ColorUtils for color nodes)
    // -------------------------------------------------------------------------
    if (!window.ColorUtils) {
        console.error("[NodeName] window.ColorUtils not found!");
    }
    const ColorUtils = window.ColorUtils;

    // -------------------------------------------------------------------------
    // NODE CLASS (Rete.js node definition)
    // -------------------------------------------------------------------------
    class MyNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("My Node");
            this.width = 300;
            this.changeCallback = changeCallback;

            // Define inputs
            this.addInput("input1", new ClassicPreset.Input(
                sockets.number, "Input Label"
            ));

            // Define outputs
            this.addOutput("output1", new ClassicPreset.Output(
                sockets.number, "Output Label"
            ));

            // Node properties (saved/restored)
            this.properties = {
                value: 0,
                enabled: true
            };
        }

        // Process data flow
        data(inputs) {
            const inputValue = inputs.input1?.[0] ?? 0;
            // Process and return outputs
            return {
                output1: inputValue * 2
            };
        }

        // Restore from saved graph
        restore(state) {
            if (state.properties) {
                Object.assign(this.properties, state.properties);
            }
        }
    }

    // -------------------------------------------------------------------------
    // REACT COMPONENT (UI for the node)
    // -------------------------------------------------------------------------
    function MyNodeComponent({ data, emit }) {
        const [value, setValue] = useState(data.properties.value);

        useEffect(() => {
            data.changeCallback = () => {
                setValue(data.properties.value);
            };
            return () => { data.changeCallback = null; };
        }, [data]);

        const handleChange = (e) => {
            const val = Number(e.target.value);
            setValue(val);
            data.properties.value = val;
            if (data.changeCallback) data.changeCallback();
        };

        // Render inputs/outputs with RefComponent
        const inputs = Object.entries(data.inputs);
        const outputs = Object.entries(data.outputs);

        return React.createElement('div', { className: 'my-node' }, [
            React.createElement('div', { key: 'header', className: 'header' }, data.label),
            
            // Inputs
            React.createElement('div', { key: 'inputs' },
                inputs.map(([key, input]) =>
                    React.createElement('div', { key, className: 'io-row' }, [
                        React.createElement(RefComponent, {
                            key: 'socket',
                            init: ref => emit({
                                type: "render",
                                data: {
                                    type: "socket",
                                    element: ref,
                                    payload: input.socket,
                                    nodeId: data.id,
                                    side: "input",
                                    key
                                }
                            }),
                            unmount: ref => emit({ type: "unmount", data: { element: ref } })
                        }),
                        React.createElement('span', { key: 'label' }, input.label)
                    ])
                )
            ),
            
            // Controls
            React.createElement('div', {
                key: 'controls',
                onPointerDown: (e) => e.stopPropagation()
            }, [
                React.createElement('input', {
                    key: 'slider',
                    type: 'range',
                    value: value,
                    onChange: handleChange
                })
            ]),
            
            // Outputs
            React.createElement('div', { key: 'outputs' },
                outputs.map(([key, output]) =>
                    React.createElement('div', { key, className: 'io-row output' }, [
                        React.createElement('span', { key: 'label' }, output.label),
                        React.createElement(RefComponent, {
                            key: 'socket',
                            init: ref => emit({
                                type: "render",
                                data: {
                                    type: "socket",
                                    element: ref,
                                    payload: output.socket,
                                    nodeId: data.id,
                                    side: "output",
                                    key
                                }
                            }),
                            unmount: ref => emit({ type: "unmount", data: { element: ref } })
                        })
                    ])
                )
            )
        ]);
    }

    // -------------------------------------------------------------------------
    // REGISTER WITH NODE REGISTRY
    // -------------------------------------------------------------------------
    window.nodeRegistry.register('MyNode', {
        label: "My Node",                    // Display name in add menu
        category: "My Category",             // Category in add menu
        nodeClass: MyNode,                   // The node class
        component: MyNodeComponent,          // React component
        factory: (cb) => new MyNode(cb)      // Factory function
    });

    console.log("[MyNode] Registered");
})();
```

## Common UI Patterns

### Editable Node Titles

Some nodes support an editable title in the node header (double-click to edit). Prefer these conventions:

- If the node already has a “Name” field, reuse `properties.customName` and display `customName || data.label` in the header.
- If the node needs a title separate from other naming fields, use `properties.customTitle`.

Implementation checklist:

- Swap the header title text to an `<input>` on `onDoubleClick`.
- Add `onPointerDown={(e) => e.stopPropagation()}` on the `<input>` so editing doesn’t drag the node.
- Commit on blur/Enter; cancel on Escape.
- Include the chosen property in `serialize()` and `restore()` so it persists in saved graphs.

## Available Socket Types

Access via `window.sockets`:

```javascript
const sockets = window.sockets;

sockets.number    // Numeric values
sockets.boolean   // True/False
sockets.string    // Text values
sockets.any       // Accepts any type
sockets.object    // Object/HSV data
```

You can also create custom sockets:
```javascript
const mySocket = new ClassicPreset.Socket("my_custom_type");
```

## Available Global Utilities

### window.ColorUtils (from 00_ColorUtilsPlugin.js)

For color-related nodes:

```javascript
const ColorUtils = window.ColorUtils;

ColorUtils.hsvToRgb(h, s, v)          // h,s,v in 0-1 → [r,g,b] 0-255
ColorUtils.rgbToHsv(r, g, b)          // r,g,b 0-255 → {hue, sat, val} 0-1
ColorUtils.hsvToRgbDegrees(h, s, v)   // h: 0-360, s,v: 0-100 → {r,g,b}
ColorUtils.kelvinToRGB(k)             // Color temp → {r,g,b}
ColorUtils.kelvinToHSV(k)             // Color temp → {hue, saturation, brightness}
ColorUtils.hexToRgb(hex)              // "#RRGGBB" → {r,g,b}
ColorUtils.rgbToHex(r, g, b)          // → "#RRGGBB"
ColorUtils.interpolate(v, min, max, start, end)
ColorUtils.clamp(value, min, max)
```

### window.luxon

Date/time library for time-based nodes:

```javascript
const { DateTime } = window.luxon;
const now = DateTime.now();
```

### window.socket (Socket.IO)

For real-time communication with backend:

```javascript
window.socket.emit('event', data);
window.socket.on('response', callback);
```

## Node Categories

Standard categories for organizing nodes:

- `"Home Assistant"` - HA device integrations
- `"Plugs"` - Smart plug controls
- `"Timer/Event"` - Time and trigger nodes
- `"Inputs"` - User input nodes (buttons, sliders)
- `"Logic"` - Conditional/logic operations
- `"CC_Control_Nodes"` - Color control nodes
- `"Color"` - Color utilities
- `"Utility"` - Backdrops, display, helpers
- `"Other"` - Miscellaneous

## Creating a New Node

1. Create file: `backend/plugins/MyNewNode.js`
2. Follow the template above
3. Refresh browser - node appears in add menu

## Special Node Types

### Backdrop Nodes

For grouping/organizing other nodes:

```javascript
window.nodeRegistry.register('MyBackdrop', {
    label: "My Backdrop",
    category: "Utility",
    nodeClass: MyBackdropClass,
    component: MyBackdropComponent,
    factory: (cb) => new MyBackdropClass(cb),
    isBackdrop: true  // ← Special flag for backdrop handling
});
```

### Dataflow Nodes

For nodes that need special update handling (like color sliders):

```javascript
window.nodeRegistry.register('MyColorNode', {
    label: "Color Control",
    category: "CC_Control_Nodes",
    nodeClass: MyColorClass,
    component: MyColorComponent,
    factory: (cb) => new MyColorClass(cb),
    updateStrategy: 'dataflow'  // ← Special handling for performance
});
```

## Common Patterns

### Stop Event Propagation

Prevent node dragging when interacting with controls:

```javascript
React.createElement('div', {
    onPointerDown: (e) => e.stopPropagation()
}, /* controls */)
```

### Throttled Updates

For sliders/frequent updates:

```javascript
const lastUpdateRef = useRef(0);
const timeoutRef = useRef(null);

const updateState = (updates) => {
    Object.assign(data.properties, updates);
    
    const now = Date.now();
    if (now - lastUpdateRef.current >= 50) {
        if (data.changeCallback) data.changeCallback();
        lastUpdateRef.current = now;
    } else {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
            if (data.changeCallback) data.changeCallback();
            lastUpdateRef.current = Date.now();
        }, 50);
    }
};
```

### Collapse/Expand Toggle

```javascript
const [isCollapsed, setIsCollapsed] = useState(false);

// Toggle button
React.createElement('div', {
    className: 'collapse-toggle',
    onPointerDown: (e) => { e.stopPropagation(); setIsCollapsed(!isCollapsed); }
}, isCollapsed ? "▶" : "▼")

// Conditionally render controls
!isCollapsed && React.createElement('div', { className: 'controls' }, /* ... */)
```

## Migrating from React Nodes

If you find a node in `frontend/src/nodes/` that needs to be converted:

1. Read the `.jsx` file and `.css` file
2. Create new plugin in `backend/plugins/`
3. Convert JSX to `React.createElement()` calls
4. Inject CSS as inline styles
5. Replace ES6 imports with window globals
6. Delete the old React files

### JSX to createElement Conversion

```jsx
// JSX (React nodes)
<div className="my-class" onClick={handleClick}>
    <span>Hello</span>
</div>

// createElement (Plugins)
React.createElement('div', { className: 'my-class', onClick: handleClick }, [
    React.createElement('span', { key: 'text' }, 'Hello')
])
```

## Testing Plugins

1. Save your plugin file
2. Refresh the browser (F5)
3. Check console for registration message
4. Open Add Node menu and verify node appears
5. Add node to canvas and test functionality

## Troubleshooting

### "Missing dependencies" error
The plugin loaded before the main bundle. Check alphabetical ordering.

### Node not appearing in menu
- Check for JavaScript errors in console
- Verify `window.nodeRegistry.register()` is called
- Check category spelling matches expected categories

### Controls not responding
Ensure `onPointerDown: (e) => e.stopPropagation()` is on interactive elements.

### Sockets not connecting
Verify socket types match between nodes. Use `sockets.any` for flexible connections.

---

## Summary for AI Assistants

When asked to create a new node:

1. ✅ Create frontend plugin in `backend/plugins/NodeName.js`
2. ✅ Create backend node in `backend/src/engine/nodes/` (for 24/7 execution)
3. ✅ Use the IIFE pattern for frontend plugins
4. ✅ Use `React.createElement()` not JSX in frontend plugins
5. ✅ Inject CSS inline in frontend plugins
6. ✅ Register frontend with `window.nodeRegistry`
7. ✅ Register backend with `require('../BackendNodeRegistry').register()`
8. ❌ Do NOT create in `frontend/src/nodes/`
9. ❌ Do NOT use ES6 imports in frontend plugins

---

## Backend Engine Nodes (24/7 Execution)

This section covers the **server-side node implementations** that run even when the browser is closed.

### Directory Structure

```
backend/src/engine/
├── BackendEngine.js          # Main engine - 100ms tick loop, graph processing
├── BackendNodeRegistry.js    # Node type registry with create() factory
├── index.js                  # Exports engine singleton + registry
└── nodes/                    # Backend node implementations
    ├── TimeNodes.js          # CurrentTime, TimeRange, DayOfWeek, TimeOfDay
    ├── LogicNodes.js         # AND, OR, NOT, Compare, Switch, Threshold, Latch
    ├── DelayNode.js          # Delay, Debounce, Retriggerable modes
    ├── HADeviceNodes.js      # HALight, HASwitch, HASensor, HAGenericDevice
    ├── HueLightNodes.js      # HueLight, HueGroup (direct bridge API)
    ├── KasaLightNodes.js     # KasaLight, KasaPlug (direct local API)
    ├── ColorNodes.js         # SplineTimelineColor, HSVToRGB, RGBToHSV
    ├── BufferNodes.js        # BufferReader, BufferWriter (cross-node state)
    ├── UtilityNodes.js       # Counter, Random, Display, Sender, Receiver
    └── WeatherNodes.js       # Weather data nodes
```

### Backend Node Structure

Backend nodes are **pure JavaScript classes** without React/browser dependencies:

```javascript
/**
 * MyNode.js - Backend implementation
 */
const registry = require('../BackendNodeRegistry');

class MyNode {
  constructor() {
    this.id = null;           // Set by engine when loading graph
    this.label = 'My Node';   // Display name
    this.properties = {       // Node state (loaded from saved graph)
      value: 0,
      enabled: true
    };
  }

  /**
   * Restore properties from saved graph
   * Called when engine loads a graph
   */
  restore(data) {
    if (data.properties) {
      Object.assign(this.properties, data.properties);
    }
  }

  /**
   * Process inputs and return outputs
   * Called every engine tick (~100ms)
   * 
   * @param {Object} inputs - Input values keyed by socket name
   *   e.g., { trigger: [true], value: [42] }
   * @returns {Object} - Output values keyed by socket name
   *   e.g., { output: 84, triggered: true }
   */
  data(inputs) {
    // Inputs are arrays (can have multiple connections)
    const inputValue = inputs.value?.[0] ?? 0;
    const trigger = inputs.trigger?.[0] ?? false;

    // Process logic
    const result = inputValue * 2;

    // Return outputs (used by connected nodes)
    return {
      output: result,
      triggered: trigger
    };
  }

  /**
   * Optional: Cleanup when node is removed
   */
  destroy() {
    // Clear any timers, close connections, etc.
  }
}

// Register with backend registry
registry.register('MyNode', MyNode);

module.exports = { MyNode };
```

### Key Differences from Frontend Plugins

| Aspect | Frontend Plugin | Backend Node |
|--------|-----------------|--------------|
| **File location** | `backend/plugins/` | `backend/src/engine/nodes/` |
| **Module format** | IIFE (self-executing) | CommonJS (require/module.exports) |
| **UI rendering** | React.createElement() | None - pure logic |
| **Dependencies** | window.* globals | require() imports |
| **Execution** | Browser (when open) | Server (24/7) |
| **Registry** | `window.nodeRegistry.register()` | `registry.register()` |

### Accessing Device Managers

Backend nodes can control devices directly:

```javascript
// Home Assistant
const haManager = require('../../devices/managers/homeAssistantManager');
await haManager.controlDevice('light.living_room', { on: true, brightness: 255 });

// Philips Hue
const hueManager = require('../../devices/managers/hueManager');
await hueManager.setLightState('1', { on: true, hue: 10000, sat: 254 });

// TP-Link Kasa
const kasaManager = require('../../devices/managers/kasaManager');
await kasaManager.setPlugState('192.168.1.100', true);
```

### Accessing AutoTronBuffer

For cross-node state sharing (Sender/Receiver pattern):

```javascript
const bufferManager = require('../../devices/managers/bufferManager');

// Write to buffer
bufferManager.set('[HSV] My Color', { hue: 0.5, saturation: 1, brightness: 254 });

// Read from buffer
const value = bufferManager.get('[HSV] My Color');

// List all buffers
const keys = bufferManager.keys();
```

### Label-to-Class Mapping

The backend registry maps frontend display labels to backend class names. Add your node to the mapping in `BackendNodeRegistry.js`:

```javascript
// In getByLabel() method
const labelMappings = {
  'My Node': 'MyNode',  // ← Add your mapping
  'Time of Day': 'TimeOfDayNode',
  'Timeline Color': 'SplineTimelineColorNode',
  // ... etc
};
```

### Testing Backend Nodes

```bash
# Run backend tests
cd v3_migration/backend && npm test

# Test specific node
npm test -- --grep "MyNode"
```

### Example: Complete Node (Frontend + Backend)

#### 1. Backend Node (`backend/src/engine/nodes/MyNodes.js`)

```javascript
const registry = require('../BackendNodeRegistry');

class DoubleValueNode {
  constructor() {
    this.id = null;
    this.label = 'Double Value';
    this.properties = { multiplier: 2 };
  }

  restore(data) {
    if (data.properties) Object.assign(this.properties, data.properties);
  }

  data(inputs) {
    const value = inputs.value?.[0] ?? 0;
    return { result: value * this.properties.multiplier };
  }
}

registry.register('DoubleValueNode', DoubleValueNode);
module.exports = { DoubleValueNode };
```

#### 2. Frontend Plugin (`backend/plugins/DoubleValueNode.js`)

```javascript
(function() {
    if (!window.Rete || !window.React || !window.nodeRegistry) return;

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const sockets = window.sockets;

    class DoubleValueNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("Double Value");
            this.changeCallback = changeCallback;
            this.addInput("value", new ClassicPreset.Input(sockets.number, "Value"));
            this.addOutput("result", new ClassicPreset.Output(sockets.number, "Result"));
            this.properties = { multiplier: 2 };
        }

        data(inputs) {
            const value = inputs.value?.[0] ?? 0;
            return { result: value * this.properties.multiplier };
        }

        restore(state) {
            if (state.properties) Object.assign(this.properties, state.properties);
        }
    }

    function DoubleValueComponent({ data, emit }) {
        // Render node UI with sockets
        return React.createElement('div', { className: 'node-content' },
            React.createElement('div', { className: 'node-header' }, 'Double Value')
            // ... socket rendering
        );
    }

    window.nodeRegistry.register('DoubleValueNode', {
        label: "Double Value",
        category: "Utility",
        nodeClass: DoubleValueNode,
        component: DoubleValueComponent,
        factory: (cb) => new DoubleValueNode(cb)
    });
})();
```

#### 3. Add Label Mapping (`BackendNodeRegistry.js`)

```javascript
const labelMappings = {
  'Double Value': 'DoubleValueNode',  // ← Add this line
  // ... other mappings
};
```

Now your node works in both the visual editor AND runs 24/7 on the server!
