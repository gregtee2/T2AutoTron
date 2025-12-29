
# T2AutoTron 2.1

## 🆕 Latest Fixes (v2.1.135, Dec 29, 2025)
- Lock notifications from Home Assistant now send Telegram messages for all lock state changes (locked/unlocked), even after settings are saved. Bug was passing null for notificationEmitter during HA re-init; now fixed.
- Kasa smart bulbs now show 💡 emoji instead of 🔌, thanks to improved device detection (checks device.lighting capability).
- Backend engine runs automations 24/7, even if browser is closed.
- All changes tested, pending user confirmation before next version bump.

See SESSION_HANDOFF.md and CHANGELOG.md for full details and agent handoff instructions.

[![License](https://img.shields.io/github/license/gregtee2/T2AutoTron?style=flat-square)](LICENSE)
[![Version](https://img.shields.io/badge/version-2.1.109--beta-blue?style=flat-square)](https://github.com/gregtee2/T2AutoTron/releases)
[![Open in VS Code](https://img.shields.io/badge/Open%20in-VS%20Code-blue?logo=visualstudiocode&style=flat-square)](https://open.vscode.dev/gregtee2/T2AutoTron)

Visual node-based smart home automation editor with a **24/7 backend engine** - your automations run even when you close the browser!

![Main Interface](screenshots/Main_Canvas.png)

## 🤔 Why T2AutoTron?

Back in 2003, I got into home automation. Every app I found was menu-driven - you'd click through screens to set up rules, but you couldn't *see* the logic flow. As a visual effects artist running **Nuke** (a node-based compositing tool), I kept thinking: *"Why can't I just connect device nodes, trigger nodes, and logic nodes together?"*

Nothing like that existed, and I wasn't a programmer. Fast forward 20 years - LLMs changed everything. I could finally design the app I'd always wanted while AI handled the code.

**T2AutoTron is that app.** A visual-first automation editor where you *see* your automations flow in real-time.

### Not a Node-RED replacement - a visual alternative

| | T2AutoTron | Node-RED |
|-|-----------|----------|
| **Philosophy** | See data flow live on nodes | Debug via text sidebar |
| **Learning curve** | Lower - no msg.payload | Steeper |
| **Color tools** | Built-in HSV, timelines | Manual setup |
| **Home Automation** | Purpose-built for HA | General-purpose |
| **Execution** | 24/7 backend engine | Flow-based |

### Why share this?

I'm sure there are others who'd appreciate a visual approach. But this is **beta software** - I need testers! Click the 🐛 **Report Bug** button in the app to help make it better.

---

## ✨ Features

- 🎨 **Visual Node Editor** - Drag-and-drop automation building with Rete.js
- ⚡ **24/7 Backend Engine** - Automations run on the server, not in your browser
- 🏠 **Native HA Integration** - Direct access to all Home Assistant entities
- 💡 **Multi-Platform Device Support:**
  - **Home Assistant** – All entities (lights, switches, sensors, media players, etc.)
  - **Philips Hue** – Direct bridge API + built-in effects (candle, fire, prism, etc.)
  - **TP-Link Kasa** – Direct local API (no HA required)
  - **Shelly** – Via Home Assistant integration
- 🔌 **55+ Node Types** - Time, logic, color, weather, Hue effects, and more
- 🎯 **Group Navigation** - Quick-jump buttons to zoom to Backdrop groups in large graphs
- 🔄 **Hot Plugin Updates** - Add new nodes without rebuilding
- 💾 **Auto-Save** - Every 2 minutes to prevent work loss
- 🔍 **Debug Dashboard** - Compare engine state vs actual device state

---

## 📦 Installation Options

T2AutoTron can run two ways - pick what works best for you:

| Option | Best For | Install Time |
|--------|----------|--------------|
| **🏠 Home Assistant Add-on** | HA users who want everything in one place | 5-10 min |
| **🖥️ Desktop App** | Standalone use, development, non-HA users | 1-2 min |

---

## 🏠 Option 1: Home Assistant Add-on (Recommended for HA users)

Run T2AutoTron directly inside Home Assistant - no separate computer needed!

### Quick Install

1. **Add the repository** to Home Assistant:
   - Go to **Settings** → **Add-ons** → **Add-on Store**
   - Click the **⋮** menu → **Repositories**
   - Add: `https://github.com/gregtee2/home-assistant-addons`

2. **Find "T2AutoTron"** in the add-on store and click **Install**

3. **Wait for build** (5-10 minutes on Raspberry Pi)

4. **Start the add-on** and click **Open Web UI**

That's it! Your automations now run 24/7 on your HA server.

📖 [Full add-on documentation](https://github.com/gregtee2/home-assistant-addons)

---

## 🖥️ Option 2: Desktop App (Windows/Mac/Linux)

**Requirements:** Windows 10/11, macOS, or Linux

### Step 1: Download

**Option A: ZIP Download (Easiest)**
1. Download: [T2AutoTron-stable.zip](https://github.com/gregtee2/T2AutoTron/archive/refs/heads/stable.zip)
2. Extract to a folder (e.g., `C:\T2AutoTron`)

**Option B: Git Clone (For Developers)**
```bash
git clone https://github.com/gregtee2/T2AutoTron.git
cd T2AutoTron
```

### Step 2: Install

**Windows:** Double-click `install.bat`

**Mac/Linux:**
```bash
chmod +x install.sh && ./install.sh
```

> ⏱️ First install takes 1-2 minutes. Node.js is installed automatically if needed.

### Step 3: Run

**Windows:** Double-click `start_servers.bat`

**Mac/Linux:**
```bash
./start_servers.sh
```

The app opens in an Electron desktop window. 

### Step 4: Configure

1. Click the **⚙️ Settings** gear icon
2. Enter your **Home Assistant URL** (e.g., `http://homeassistant.local:8123`)
3. Enter your **Home Assistant Token** ([How to get a token](https://www.home-assistant.io/docs/authentication/#your-account-profile))
4. Click **Test Connection** → should show green checkmark
5. Click **Save**

### Step 5: Update (Anytime)

**Windows:** Double-click `update.bat`

**Mac/Linux:**
```bash
./update.sh
```

> 🔄 Works like ComfyUI - one click to update! Automatically installs Git if needed and converts ZIP downloads to Git-enabled.

---

## 📁 File Reference

| File | Purpose |
|------|---------|
| `install.bat` / `install.sh` | One-click installer (installs Node.js + dependencies) |
| `start_servers.bat` / `start_servers.sh` | **Recommended** - Launches backend + Electron app |
| `start.bat` / `start.sh` | Alternative - Launches backend + browser (tab may sleep) |
| `update.bat` / `update.sh` | One-click updater (auto-converts ZIP to Git) |

---

## 🔗 Links & Community

- 📖 [Getting Started Guide](v3_migration/GETTING_STARTED.md) - Step-by-step tutorial
- 🔧 [Node Development Guide](v3_migration/frontend/RETE_NODE_GUIDE.md) - Create custom nodes
- 🧩 [Plugin Architecture](v3_migration/PLUGIN_ARCHITECTURE.md) - Extend T2AutoTron
- 🐛 [Issues & Feature Requests](https://github.com/gregtee2/T2AutoTron/issues)
- 💬 [Discussions](https://github.com/gregtee2/T2AutoTron/discussions)

---

## 📦 Node Categories

| Category | Examples |
|----------|----------|
| **Home Assistant** | HA Generic Device, HA Device Automation |
| **Timer/Event** | Sunrise/Sunset, Time of Day, Delay, Debounce |
| **Logic** | AND, OR, NOT, Compare, Threshold, Switch |
| **Color** | HSV Control, Timeline Color, Color Gradient |
| **Inputs** | Toggle, Number Slider, Trigger Button |
| **Utility** | Sender/Receiver, Display, Counter |
| **Direct Devices** | Hue Light, Kasa Plug |

---

## 🎨 Screenshots

### Visual Node Editor
Build automations by connecting nodes visually - no coding required.

![Context Menu](screenshots/Context_Menu.png)

### Automation Flows
Create complex automations with visual flows connecting triggers, logic, and device control.

![Flow Example](screenshots/Flow_Exmaple.png)

### Organize with Backdrops
Group related nodes into zones for better organization.

![Backdrop Grouping](screenshots/Group_Nodes_into_Zones.png)

### Settings & API Keys
Configure all your integrations in one place with connection testing.

![Settings Panel](screenshots/API_Keys_Inputs.png)

### Real-Time Dashboard
- 5-Day Weather Forecast
- Device Status indicators
- Event Log with filtering
- Connection Status (HA, Hue, Engine)

---

## 🏗️ Architecture
- **Rete.js v3**: Modern visual programming framework
- **React Components**: All nodes are React components with proper state management
- **24/7 Backend Engine**: Server-side automation execution
- **Vite Build System**: Fast development with HMR (Hot Module Replacement)
- **Plugin Architecture**: Extensible node system - add new nodes without rebuilding

## ✅ Working Features
- ✅ **50+ Node Types**: Full suite of automation nodes
- ✅ **24/7 Backend Engine**: Automations run even when browser is closed
- ✅ **HAGenericDeviceNode**: Home Assistant device control with Follow mode
- ✅ **Logic Nodes**: AND, OR, XOR, Comparison, Conditional Switch
- ✅ **Time Nodes**: Time of Day, Time Range, Sunrise/Sunset, Date Comparison, Day of Week
- ✅ **Color Nodes**: HSV Control, HSV Modifier, Color Gradient, All-In-One Color
- ✅ **Communication**: Sender/Receiver nodes for cross-graph data flow
- ✅ **Graph Save/Load**: Full serialization with viewport state preservation
- ✅ **Backdrop Nodes**: Visual grouping with z-index management
- ✅ **Settings Panel**: UI for managing API keys with test connections
- ✅ **Auto-Save**: Every 2 minutes to prevent work loss

## Recent Updates (December 2024)

### Direct Hue Bridge Control 💡 (NEW!)
- **HueLightNode**: Control Philips Hue lights directly without Home Assistant
  - No Home Assistant required - connects directly to your Hue Bridge
  - Real-time HSV color control while lights are on
  - Toggle All and All Off buttons for quick control
  - Trigger input for automation flows
  - Perfect for users who only have Hue lights and don't need HA

### Weather Works Out of the Box! 🌤️
- **Open-Meteo Fallback**: Weather features now work without any API keys!
  - Uses free [Open-Meteo API](https://open-meteo.com/) as automatic fallback
  - 5-Day Forecast panel works immediately after install
  - WeatherLogicNode shows current conditions
  - Source indicator shows which API is providing data (Open-Meteo or Ambient Weather)
- **Global Location Settings**: Configure your city in Settings → Location
  - City search with automatic coordinates and timezone detection
  - Used by Sunrise/Sunset node and weather services
  - Supports international cities with proper timezone handling

### Settings & API Keys Panel
- **New UI**: Accessible via "🔧 Settings & API Keys" button in the Dock
- **Test Connections**: Verify API credentials before saving
  - Home Assistant: Tests connection and returns version
  - OpenWeatherMap: Validates API key
  - Philips Hue: Connects to bridge and counts lights
  - Telegram: Verifies bot token and returns username
- **Backup/Restore**: Export and import settings as JSON files
- **Security**: Allowlist-based key management, secrets masked by default

### New Logic Nodes
- **DateComparisonNode**: Compare current date against single date or range
- **DayOfWeekComparisonNode**: Check day of week (single, range, or all week)
- **TimeRangeNode**: Check if current time falls within a time range

### Node Improvements
- **HADeviceStateOutputNode**: Filter dropdowns now properly update device lists
- **HADeviceAutomationNode**: Fixed sensor temperature value extraction
- **All nodes**: Consistent shared CSS styles via `node-styles.css`

### Key Fixes
1. **Socket Connection Issues**: Removed wrapper divs around `RefComponent` that were blocking pointer events
2. **Data Flow Propagation**: Fixed `changeCallback` preservation to ensure engine processing
3. **Pulse Mode**: Implemented smart pulse mode that shows last command while sending brief triggers
4. **CSS Architecture**: Consolidated all node styles into single `node-styles.css` file

## Documentation

See [`v3_migration/frontend/RETE_NODE_GUIDE.md`](v3_migration/frontend/RETE_NODE_GUIDE.md) for comprehensive guidelines on creating Rete.js nodes, including:
- Critical rules for socket rendering
- Proper changeCallback preservation patterns
- Event propagation best practices
- Complete node structure templates

See [`v3_migration/PLUGIN_ARCHITECTURE.md`](v3_migration/PLUGIN_ARCHITECTURE.md) for the plugin system documentation.

## Development

### Manual Install (For Developers)

If you prefer manual setup or need more control:

```bash
# Clone the repo
git clone https://github.com/gregtee2/T2AutoTron.git
cd T2AutoTron

# Install dependencies
cd v3_migration/backend && npm install
cd ../frontend && npm install

# Create environment config
cd ../backend
cp .env.example .env  # Edit with your settings

# Start servers (two terminals)
cd v3_migration/backend && npm start    # Terminal 1: Backend on port 3000
cd v3_migration/frontend && npm run dev  # Terminal 2: Frontend on port 5173
```

### Frontend (Rete.js Editor)
```bash
cd v3_migration/frontend
npm install
npm run dev
```

### Backend (Node.js Server)
```bash
cd v3_migration/backend
npm install
npm start
```

### Build for Production
```bash
cd v3_migration/frontend
npm run build
# Copy dist/* to backend/frontend/
```

## API Endpoints

### Settings Management
- `GET /api/settings` - Fetch current settings (allowlisted keys only)
- `POST /api/settings` - Update settings in `.env` file
- `POST /api/settings/test` - Test connection for a service (ha, weather, hue, telegram)

### Devices
- `GET /api/devices` - List all devices
- `POST /api/devices/:id/control` - Control a device

### Weather
- `GET /api/weather` - Current weather data
- `GET /api/forecast` - 5-day forecast

## Migration Status

### Completed
- [x] Core Rete.js setup
- [x] Socket system with type compatibility
- [x] 30+ node types ported
- [x] Data flow engine integration
- [x] Graph save/load with viewport state
- [x] Backdrop node support
- [x] Settings UI with API key management
- [x] Test connection functionality
- [x] Settings backup/restore
- [x] Documentation (RETE_NODE_GUIDE.md, PLUGIN_ARCHITECTURE.md)

### In Progress
- [ ] Mobile-responsive UI
- [ ] Advanced scheduling features
- [ ] Energy monitoring dashboard

### Planned
- [ ] PWA/Mobile app
- [ ] Cloud backup option
- [ ] Community node sharing
- [ ] Performance optimizations
- [ ] Testing suite

## Known Issues

1. **Some settings require restart**: Certain environment variable changes need a server restart to take effect (HA token updates work immediately).

## Debug Mode

Debug logging is disabled by default. To enable verbose logging:
- **Backend**: Set `VERBOSE_LOGGING=true` in `v3_migration/backend/.env`
- **Frontend**: Set `EDITOR_DEBUG = true` in `Editor.jsx` or `SOCKET_DEBUG = true` in `sockets.js`

## Credits

Built with:
- [Rete.js v3](https://retejs.org/)
- [React](https://react.dev/)
- [Vite](https://vitejs.dev/)
- [Home Assistant](https://www.home-assistant.io/)

---

## GitHub Topics (add these for discoverability)

`home-automation`, `node-editor`, `smart-home`, `home-assistant`, `iot`, `react`, `retejs`, `visual-programming`, `automation`, `open-source`
