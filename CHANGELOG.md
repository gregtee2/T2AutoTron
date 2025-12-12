# Changelog

All notable changes to T2AutoTron will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.0-beta.18] - 2025-01-14

### Fixed
- **HA Device Automation Node**: Now updates in real-time when upstream device state changes
  - Added Socket.IO listener for `device-state-update` events
  - Added 200ms UI polling for responsive updates (data() must remain pure)
  - Cache now clears properly when upstream device selection changes
  - Improved output value display styling (cyan text, monospace, highlighted)
  
- **HADeviceStateOutputNode**: Emits `ha-device-selection-changed` custom event when device selection changes, enabling downstream nodes to clear stale cached data

- **Debug Node**: Scroll wheel now works properly within the node
  - Added `onWheel` with `stopPropagation()` to current value and history sections
  - Prevents canvas zoom when scrolling inside the Debug node

### Changed
- **Forecast Panel**: Updated layout to match v2.0 design
  - Two-row card format (date + temps on top, icon + description on bottom)
  - Amber date text (#ffaa00) matching v2.0 aesthetic
  - Horizontal temperature display (low / high)
  - Compact icons for better space efficiency

---

## [2.1.0-beta.17] - 2025-12-12

### Added
- **Merged Control Panel**: Control Panel can be merged into the right-side Forecast panel (and popped back out); state persists across reloads.
- **Editable node titles**: Sunrise/Sunset and Time of Day nodes support double-click title editing.
- **PIN auth (LAN-friendly)**: Settings UI supports saving/remembering an App PIN; Socket.IO auto-auth with success/failure toasts; `authFetch()` helper adds `X-APP-PIN` automatically.

### Changed
- Default Socket.IO client URL now uses `window.location.origin` when `VITE_API_URL` is not set (better LAN defaults).
- Sensitive REST endpoints now require "local or PIN" (settings, updates, device control); secrets returned by `/api/settings` are masked as `********`.
- Electron hardened defaults: production uses `webSecurity: true` and IPC channels are allowlisted.
- CSP no longer enables `unsafe-eval` in production.
- Docs updated with the editable-title node header pattern.

### Fixed
- Editor pan/zoom stability: viewport restore now uses AreaPlugin APIs (avoids transform desync); additional pointer-capture tracking/release to prevent stuck interactions.
- Backdrop resize reliability: redundant pointer-capture cleanup paths reduce stuck-drag scenarios.

## [2.1.0-beta.16] - 2025-12-11

### Added
- **🎨 Timeline Color Node** (`SplineTimelineColorNode`): New time-based color gradient node with spline curve control
  - **Visual Spline Editor**: Drag control points to shape brightness and saturation curves over time
  - **Dual Curve Mode**: Toggle between editing brightness curve (white) and saturation curve (pink)
  - **Multiple Range Modes**:
    - **Numerical**: Map a 0-100 input value to the gradient
    - **Time**: Automatically output colors based on time of day (e.g., 6 AM to 10 PM)
    - **Timer**: Triggered countdown that sweeps through the gradient
  - **Custom Color Stops**: Define your own gradient colors or use rainbow mode
  - **Preview Playhead**: Drag the playhead to preview colors at any position
  - **HSV Output**: Outputs `{ hue, saturation, brightness, rgb }` for connecting to lights
  - Perfect for sunrise/sunset lighting automation, mood transitions, and timed color effects

- **📈 Spline Curve Node** (`SplineCurveNode`): General-purpose spline curve for value mapping
  - Input any value, output a curve-shaped transformation
  - Catmull-Rom interpolation for smooth curves

- **🌈 Spline Hue Curve Node** (`SplineHueCurveNode`): Hue-specific spline for color transitions
  - Maps input values through a hue curve
  - Great for rainbow effects and color cycling

- **🔧 Spline Base Plugin** (`00_SplineBasePlugin.js`): Shared spline utilities
  - Provides `window.T2Spline` with `evaluate()`, `createDefaultCurve()`, `clamp()` functions
  - Used by all spline-based nodes for consistent curve behavior

### Fixed
- **Timeline Color Node**: Fixed critical bug where copy/pasted or loaded nodes would not output HSV values
  - Root cause: `data()` method was calling `changeCallback()` which triggered `engine.reset()` mid-fetch
  - This cancelled remaining node fetches, causing only the first Timeline Color node to work
  - Fix: Removed `changeCallback()` from inside `data()` - the method should be pure (calculate and return only)

---

## [2.1.0-beta.15] - 2025-12-11

### Added
- **🔄 Check for Updates Button**: New button in Control Panel Settings section to manually check for updates on-demand
  - Shows spinner while checking
  - Displays toast notification with result
  - Opens Update modal if update is available

---

## [2.1.0-beta.14] - 2025-12-11

### Added
- **⚡ Performance Mode**: New toggle in Settings to reduce GPU usage with many nodes
  - Disables backdrop-filter blur on nodes (biggest performance impact)
  - Simplifies glow shadows to basic drop shadows
  - Stops infinite pulse/glow animations
  - Removes transition effects on nodes
  - Look for ⚡ indicator in bottom-left when active
  - Recommended for 40+ nodes or lower-end GPUs
- **Graph Auto-Restore After Update**: Your graph is now automatically saved before applying updates and restored after reload
- **Sleep Prevention (Electron)**: Electron app now prevents Windows from suspending the app during sleep mode

### Fixed
- DeviceStateControl no longer injects CSS on every render (major performance fix)
- Moved keyframe animations to CSS file instead of dynamic injection

### Changed
- Update modal now shows "Saving current graph..." before applying update

---

## [2.1.0-beta.2] - 2024-12-10

### Added
- **Click-to-Focus on Upcoming Events**: Click any scheduled event to pan/zoom to that node in the editor
- **Zoom Extents**: Click the "Upcoming Events" header to fit all nodes in the viewport
- **Auto-Update System**: App now checks for updates on startup and notifies you when a new version is available
- **Hue Bridge Status**: Control Panel now shows Philips Hue connection status and device count

### Fixed
- Plugin count now accurately reflects loaded plugins
- Improved Control Panel status indicators

### Changed
- Updated hint text in Upcoming Events panel to explain click functionality

---

## [2.1.0-beta.1] - 2024-12-08

### Added
- Visual node-based automation editor using Rete.js v3
- Home Assistant integration with real-time device updates
- Philips Hue bridge support
- TP-Link Kasa device support
- Shelly device support
- Plugin system for runtime-loaded nodes
- Time-based triggers (TimeOfDay, Sunrise/Sunset)
- Logic gates (AND, OR, NOT, etc.)
- Color control nodes with HSV support
- Auto-save functionality (every 2 minutes)
- Toast notification system
- Error boundary for crash prevention
- Loading overlay with progress indication

### Infrastructure
- React + Vite frontend
- Node.js/Express backend
- Socket.IO for real-time communication
- Electron app wrapper

---

## [2.0.0] - Previous Version

Legacy LiteGraph-based editor. See `v2.0` branch for details.
