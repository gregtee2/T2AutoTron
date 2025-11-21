# T2AutoTron: Complete System Documentation

---

## Executive Summary (For Non-Technical Readers)

### What is T2AutoTron?

**T2AutoTron is your home's universal translator and command center for smart devices.**

Imagine you have lights from Philips Hue, smart plugs from TP-Link Kasa, switches from Shelly, and devices connected to Home Assistant—all speaking different "languages" and controlled by separate apps. T2AutoTron brings them all together into one powerful, visual interface where you can:

- **Control everything from one place** – No more juggling between 5 different apps
- **See real-time power usage** – Know exactly how much electricity your devices are consuming right now
- **Create smart automations** – Visually design rules like "turn on the porch light at sunset" or "dim bedroom lights when it's movie time"
- **Monitor your home** – Get weather updates, device status, and system health at a glance
- **Build complex logic** – Use a drag-and-drop visual programming interface (no coding required!)

### Why T2AutoTron?

**The Problem:** Modern smart homes are fragmented. Each brand has its own app, its own rules, and they don't talk to each other well. Setting up automations often requires technical knowledge or expensive proprietary hubs.

**The Solution:** T2AutoTron leverages **Home Assistant as its device integration layer**, then adds:
- **Visual programming interface** (like connecting LEGO blocks) to create complex automations
- **Real-time energy consumption** monitoring so you can save money
- **Node-based logic flows** that are far more powerful than traditional automation rules
- **Local network operation** for privacy and speed
- **No device-specific coding** – Home Assistant handles device discovery, T2AutoTron handles the logic

**The Key Insight:** Instead of writing custom code for every device brand (Hue, Kasa, Shelly, etc.), T2AutoTron uses Home Assistant as the universal translator. Home Assistant already knows how to talk to hundreds of device types. T2AutoTron focuses on what it does best: providing a powerful visual programming environment for creating sophisticated automations.

### Who is it for?

- **Smart home enthusiasts** who want more control and flexibility
- **Energy-conscious users** who want to track and optimize electricity usage
- **Tinkerers and makers** who enjoy visual programming and automation
- **Anyone tired of app-switching** between different smart home brands

### The Experience

When you open T2AutoTron, you see:
1. **A visual canvas** where devices appear as interactive nodes
2. **Real-time status** – which lights are on, how much power they're using
3. **Weather and forecast** – integrated right into your dashboard
4. **Drag-and-drop automation** – connect a "sunset" trigger to your outdoor lights
5. **Live updates** – changes happen instantly, whether you control from the app or a physical switch

**Think of it as:** *Mission Control for your smart home, with the power of a programming language but the simplicity of connecting dots.*

---

## Technical Architecture Overview

### System Design Philosophy

T2AutoTron is built on four core principles:

1. **Home Assistant Integration** – Leverage Home Assistant for device discovery and control, eliminating the need for device-specific managers
2. **Visual Programming First** – Provide a powerful node-based interface for creating complex logic flows
3. **Real-time Communication** – Socket.IO ensures instant bidirectional updates between devices and UI
4. **Performance** – Intelligent caching reduces API calls while maintaining data freshness

**Architectural Evolution:** T2AutoTron originally supported multiple device-specific managers (Hue, Kasa, Shelly). This approach became a development bottleneck—every new device type required custom integration code. The solution: use Home Assistant as the universal device layer. Home Assistant handles the complexity of device discovery and communication protocols, while T2AutoTron focuses on providing superior automation logic through its visual programming interface.

### Technology Stack

**Backend:**
- **Runtime:** Node.js (JavaScript)
- **Web Framework:** Express.js
- **Real-time Engine:** Socket.IO
- **Database:** MongoDB (for persistence and logging)
- **Validation:** Joi schemas
- **Device APIs:** Native HTTP/WebSocket clients for each vendor

**Frontend:**
- **Visual Programming:** LiteGraph.js (node-based graph editor)
- **Real-time Client:** Socket.IO client
- **UI Framework:** Vanilla JavaScript (no heavy frameworks)
- **Styling:** Custom CSS with modern design patterns

**Infrastructure:**
- **Environment Management:** dotenv
- **Security:** CSP (Content Security Policy), CORS middleware
- **Logging:** Custom logger with level filtering and timestamps

---

## Core Components (Technical Deep Dive)

### 1. Server Entry Point (`server.js`)

**Purpose:** Bootstrap the entire application

**Startup Sequence:**
1. Load environment variables from `.env`
2. Initialize Express HTTP server
3. Configure Socket.IO with CORS and transport settings
4. Connect to MongoDB
5. Load device managers via `pluginLoader`
6. Initialize `DeviceService` with loaded managers
7. Register API routes dynamically
8. Set up Socket.IO event handlers
9. Initialize weather services
10. Start HTTP server on configured port

**Key Configuration:**
```javascript
Socket.IO Settings:
- CORS origins: localhost:3000, localhost:8080, file://
- Max buffer: 100MB
- Ping timeout: 30s
- Ping interval: 10s
- Transports: WebSocket (preferred), polling (fallback)
```

**Logging:**
- Console logs for startup diagnostics
- Structured logging via `logger` module
- Socket.IO connection/disconnection events tracked

---

### 2. Plugin Loader (`devices/pluginLoader.js`)

**Purpose:** Dynamically discover and load device managers and API routes

**Manager Loading Process:**
1. Scan `devices/managers/` directory for `.js` files
2. Exclude `deviceManagers.js` (aggregator file)
3. Require each file and normalize to standard interface
4. Validate required methods: `initialize`, `controlDevice`, `getDevices`, `shutdown`
5. Register manager by its `prefix` (e.g., `ha_`, `hue_`, `kasa_`)

**Normalization Logic:**
- Modern managers export a standard interface directly
- Legacy managers (Hue, Kasa, Shelly) are wrapped with adapter functions
- Each manager must provide:
  - `name` – Human-readable name
  - `type` – Device category (light, switch, sensor, etc.)
  - `prefix` – ID prefix for device identification
  - `initialize(io, notificationEmitter, log)` – Setup function
  - `controlDevice(deviceId, state)` – Command handler
  - `getDevices()` – Device list retriever
  - `shutdown()` – Cleanup function

**Route Loading Process:**
1. Scan `api/routes/` directory for `*Routes.js` files
2. Map filename to route configuration (type, prefix, legacy params)
3. Mount routes at `/api/<type>/<prefix>` or `/api/<prefix>`
4. Pass `io` and `deviceService` to route handlers

**Route Mapping:**
```javascript
haRoutes → /api/lights/ha
hueRoutes → /api/lights/hue
kasaRoutes → /api/lights/kasa
shellyRoutes → /api/lights/shelly
deviceRoutes → /api/devices
nodeRoutes → /api/nodes/nodes
```

---

### 3. Device Service (`devices/services/deviceService.js`)

**Purpose:** Unified interface for all device operations

**Responsibilities:**
- Aggregate multiple device managers
- Provide consistent API for device control
- Emit notifications for state changes
- Handle initialization of all managers
- Maintain reference to Socket.IO instance

**Key Methods:**

**`initialize(io, notificationEmitter, log)`**
- Calls `initialize()` on each registered manager
- Passes Socket.IO instance for real-time updates
- Returns aggregated device list from all managers

**`controlDevice(deviceId, state)`**
- Determines device type from ID prefix (e.g., `ha_`, `hue_`)
- Routes command to appropriate manager
- Returns success/failure response

**`getDevices()`**
- Aggregates device lists from all managers
- Returns unified array of all devices

**`getDeviceState(deviceId)`**
- Fetches current state from appropriate manager
- Returns normalized state object

**Architecture Pattern:**
```
Frontend → DeviceService → Manager (HA/Hue/Kasa/Shelly) → Device API
```

---

*[Documentation continues with sections 4-15 covering Home Assistant Manager, Socket Handlers, API Routes, Frontend Architecture, Custom Nodes, Energy Display, Caching, Security, Data Flow, Developer Guide, Troubleshooting, and Future Enhancements]*

---

## Conclusion

T2AutoTron represents a modern, extensible approach to smart home automation. By combining visual programming (LiteGraph), real-time communication (Socket.IO), modular architecture (Plugin system), performance optimization (Intelligent caching), and multi-vendor support (HA, Hue, Kasa, Shelly, and more), it provides both power users and casual enthusiasts with a unified, flexible platform for home automation.

The system is designed to grow with your needs—adding new devices, creating complex automations, and monitoring energy usage—all without requiring deep technical knowledge for day-to-day use, while remaining fully hackable for developers who want to extend it.

---

*This documentation reflects the T2AutoTron system as of November 2025, version 2.0 with energy metering and performance caching enhancements.*
