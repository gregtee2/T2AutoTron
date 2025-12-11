# Changelog

All notable changes to T2AutoTron will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
