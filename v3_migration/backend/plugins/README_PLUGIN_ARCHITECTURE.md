# 🚨 IMPORTANT: READ THIS BEFORE CREATING OR MODIFYING NODES 🚨

## T2AutoTron Plugin Architecture Guide

**Last Updated:** December 6, 2025  
**DRY Score:** A- (17.5% shared infrastructure)

---

## ⚡ QUICK START: Creating a New Node

```javascript
(function() {
    console.log("[YourNodeName] Loading plugin...");

    // 1. CHECK DEPENDENCIES - Always include T2Controls, add T2HAUtils for HA nodes
    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets || !window.T2Controls) {
        console.error("[YourNodeName] Missing dependencies");
        return;
    }

    const { ClassicPreset } = window.Rete;
    const sockets = window.sockets;

    // 2. IMPORT SHARED CONTROLS - DO NOT recreate these classes!
    const { 
        ButtonControl, 
        DropdownControl, 
        SwitchControl,
        NumberControl,
        THEME 
    } = window.T2Controls;

    // 3. For HA/device nodes, also import T2HAUtils
    // const { getDeviceApiInfo, isAuxiliaryEntity, filterDevices } = window.T2HAUtils;

    class YourNodeName extends ClassicPreset.Node {
        // ... your node implementation
    }

    window.ReteNodes = window.ReteNodes || {};
    window.ReteNodes.YourNodeName = YourNodeName;
})();
```

---

## 📦 Shared Infrastructure (00_*.js files)

These files load FIRST (alphabetically sorted). **Never duplicate code from these files!**

### `00_SharedControlsPlugin.js` (585 lines)
Exports via `window.T2Controls`:

| Control Class | Purpose | Example Usage |
|--------------|---------|---------------|
| `ButtonControl` | Clickable button | `new ButtonControl("🔄 Refresh", () => this.refresh())` |
| `DropdownControl` | Select dropdown | `new DropdownControl("Filter", ["All", "Light"], "All", (v) => this.onFilter(v))` |
| `SwitchControl` | Toggle switch | `new SwitchControl("Debug", false, (v) => this.properties.debug = v)` |
| `NumberControl` | Numeric input | `new NumberControl("Brightness", 100, 0, 100, 1, (v) => this.setBrightness(v))` |
| `InputControl` | Text input | `new InputControl("Name", "", (v) => this.properties.name = v)` |
| `StatusIndicatorControl` | Status display | `new StatusIndicatorControl(() => this.properties.status)` |
| `ColorBarControl` | Color preview bar | For HSV visualization |
| `PowerStatsControl` | Power/energy display | For device power monitoring |
| `DeviceStateControl` | Device state toggle | For HA device on/off control |

Also exports:
- `THEME` - Consistent styling colors
- `stopPropagation` - Event helper for pointerdown

### `00_HABasePlugin.js` (341 lines)
Exports via `window.T2HAUtils`:

| Function/Constant | Purpose |
|-------------------|---------|
| `filterTypeMap` | Maps "Light" → "light", "Switch" → "switch", etc. |
| `letterRanges` | A-Z ranges for alphabetical filtering |
| `fieldMapping` | Available fields per entity type (light, switch, sensor, etc.) |
| `auxiliaryPatterns` | Regex patterns for filtering out LED, Firmware, etc. entities |
| `isAuxiliaryEntity(name)` | Returns true if name matches auxiliary pattern |
| `getDeviceApiInfo(id)` | Returns `{ endpoint, cleanId }` for ha_, kasa_, hue_, shelly_ prefixes |
| `compareNames(a, b)` | Case-insensitive name comparison |
| `formatTime(utcTime)` | Converts UTC to local time string |
| `filterDevices(devices, filterType, letterFilter)` | Combined type + letter filtering |
| `normalizeHADevice(device)` | Normalizes HA device data structure |
| `getFieldsForEntityType(type)` | Returns available fields for entity type |

### `00_BaseNodePlugin.js` (237 lines)
Base node utilities and common patterns.

### `00_LogicGateBasePlugin.js` (363 lines)
Base class for logic gate nodes (And, Or, Xor).

### `00_ColorUtilsPlugin.js` (149 lines)
HSV/RGB color conversion utilities.

### `00_NodeComponentsPlugin.js` (355 lines)
Additional React components for nodes.

---

## ✅ DO's and DON'Ts

### ✅ DO:
```javascript
// Import from T2Controls
const { ButtonControl, DropdownControl, THEME } = window.T2Controls;

// Use shared utilities for HA nodes
const { getDeviceApiInfo, isAuxiliaryEntity } = window.T2HAUtils;

// Use consistent THEME colors
style: { background: THEME.primary }
```

### ❌ DON'T:
```javascript
// DON'T create your own ButtonControl class
class ButtonControl extends ClassicPreset.Control { ... }  // ❌ WRONG!

// DON'T define your own THEME
const THEME = { primary: '#1a1a2e' };  // ❌ WRONG!

// DON'T copy auxiliary patterns locally
const auxiliaryPatterns = [/LED/i, ...];  // ❌ WRONG!

// DON'T write your own getDeviceApiInfo
if (id.startsWith('ha_')) { ... }  // ❌ Use T2HAUtils.getDeviceApiInfo(id)
```

---

## 🔌 Node Types and Their Imports

### Logic Nodes (And, Or, Xor, Comparison)
```javascript
const { SwitchControl } = window.T2Controls;
// Extend LogicGateBase from 00_LogicGateBasePlugin.js
```

### HA Device Nodes (HAGenericDevice, HADeviceStateOutput, etc.)
```javascript
const { ButtonControl, DropdownControl, SwitchControl, StatusIndicatorControl } = window.T2Controls;
const { getDeviceApiInfo, isAuxiliaryEntity, filterDevices, formatTime } = window.T2HAUtils;
```

### Color/HSV Nodes
```javascript
const { NumberControl, ColorBarControl } = window.T2Controls;
// Use 00_ColorUtilsPlugin.js for HSV conversions
```

### Time Nodes (TimeOfDay, TimeRange, SunriseSunset)
```javascript
const { NumberControl, DropdownControl, SwitchControl } = window.T2Controls;
```

---

## 📁 File Naming Convention

| Prefix | Purpose | Loads |
|--------|---------|-------|
| `00_*Plugin.js` | Shared infrastructure | FIRST (alphabetically) |
| `*Node.js` | Individual node implementations | AFTER shared plugins |

---

## 🧪 Testing Your Node

1. Check browser console for dependency errors:
   ```
   [YourNode] Missing dependencies { T2Controls: false, ... }
   ```

2. Verify node registration:
   ```javascript
   console.log(window.ReteNodes.YourNodeName);
   ```

3. Check that controls render properly and use THEME colors

---

## 📊 Current Architecture Stats

- **Total plugins:** 36 files
- **Shared infrastructure:** 6 files (2,030 lines, 17.5%)
- **Node plugins:** 30 files (9,541 lines)
- **Nodes using T2Controls:** 11/30 (37%)
- **Nodes using T2HAUtils:** 3/30 (10%)

---

## 🔄 Porting a Node from v2.0

1. Remove any local control class definitions (ButtonControl, etc.)
2. Add dependency check for `window.T2Controls` (and `window.T2HAUtils` for HA nodes)
3. Import needed controls: `const { ... } = window.T2Controls;`
4. Replace local THEME with imported THEME
5. Replace local utility functions with T2HAUtils equivalents
6. Test that all controls render correctly

---

## 💡 Example: Minimal HA Device Node

```javascript
(function() {
    console.log("[MyHANode] Loading plugin...");

    if (!window.Rete || !window.T2Controls || !window.T2HAUtils) {
        console.error("[MyHANode] Missing dependencies");
        return;
    }

    const { ClassicPreset } = window.Rete;
    const sockets = window.sockets;
    const { ButtonControl, DropdownControl, SwitchControl, THEME } = window.T2Controls;
    const { getDeviceApiInfo, isAuxiliaryEntity, filterDevices } = window.T2HAUtils;

    class MyHANode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("My HA Node");
            this.width = 380;
            this.changeCallback = changeCallback;
            this.properties = { debug: false, selectedDeviceId: null };
            this.devices = [];

            this.addOutput("device", new ClassicPreset.Output(sockets.object, "Device"));
            this.addControl("refresh", new ButtonControl("🔄 Refresh", () => this.fetchDevices()));
            this.addControl("debug", new SwitchControl("Debug", false, (v) => { this.properties.debug = v; }));
        }

        async fetchDevices() {
            const response = await fetch('/api/devices');
            const data = await response.json();
            // Filter out auxiliary entities using shared utility
            this.devices = data.devices.filter(d => !isAuxiliaryEntity(d.name));
        }

        async controlDevice(id, action) {
            const apiInfo = getDeviceApiInfo(id);  // Use shared utility!
            if (!apiInfo) return;
            await fetch(`${apiInfo.endpoint}/${apiInfo.cleanId}/${action}`, { method: 'POST' });
        }
    }

    window.ReteNodes = window.ReteNodes || {};
    window.ReteNodes.MyHANode = MyHANode;
})();
```

---

**Questions?** Check the existing nodes for patterns:
- `HAGenericDeviceNode.js` - Full-featured HA device control
- `TimeOfDayNode.js` - Time-based logic
- `AndNode.js` - Simple logic gate using LogicGateBase
