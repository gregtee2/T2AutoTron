# T2 AutoTron 2.1 - Getting Started Guide

Welcome to T2 AutoTron, a visual node-based automation editor for smart home control. This guide will help you get up and running quickly.

## 📋 Choose Your Installation Method

- **[Home Assistant Add-on](#-home-assistant-add-on-recommended)** - Easiest, runs inside HA
- **[Standalone Installation](#-standalone-installation)** - Run on any PC/server

---

## 🏠 Home Assistant Add-on (Recommended)

### Installation

1. In Home Assistant, go to **Settings → Add-ons → Add-on Store**
2. Click **⋮ (three dots)** → **Repositories**
3. Add: `https://github.com/gregtee2/home-assistant-addons`
4. Find **T2AutoTron** in the store and click **Install**
5. After installation, click **Start**
6. Click **Open Web UI** or find T2AutoTron in the sidebar

### First-Time Setup

Once T2AutoTron opens, click the **⚙️ Settings** button in the Control Panel (right side) to configure:

#### 📍 Location Settings
Your location is used for sunrise/sunset calculations and weather features.

**For Home Assistant Add-on Users:** 
Location is **auto-filled** from your Home Assistant configuration! You'll see a green confirmation message in Settings. No action needed.

**For Standalone Users:**
1. **Enter your city name** in the City field
2. **Click the 🔍 Search button** - coordinates and timezone auto-fill
3. That's it!

#### 🌤️ Weather Services (Optional)
If you want weather-based automations:
- **OpenWeatherMap API Key**: Get a free key at [openweathermap.org](https://openweathermap.org/api)
- **Ambient Weather**: API key and Application key from [ambientweather.net](https://ambientweather.net/)

#### 📱 Telegram Notifications (Optional)
To receive automation notifications on your phone:
- **Bot Token**: Create a bot via [@BotFather](https://t.me/botfather) on Telegram
- **Chat ID**: Send a message to your bot, then visit `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates`

#### 💡 Philips Hue Direct Control (Optional)
Control Hue lights without going through HA (lower latency):
- **Bridge IP**: Your Hue bridge IP address (find in Hue app)
- **Username**: Press the Hue bridge button, then use the pairing process

> **Note:** Home Assistant connection is automatic in the add-on - no token needed!

After entering your settings, click **Save**. Settings persist across add-on restarts.

---

## 💻 Standalone Installation

### Prerequisites

Before you start, make sure you have:
- **Node.js 18+** installed ([download](https://nodejs.org/))
- A **Home Assistant** instance (optional but recommended)
- Any smart devices you want to control:
  - **Philips Hue** – Works with or without HA (direct bridge API)
  - **TP-Link Kasa** – Works with or without HA (direct local API)
  - **Shelly** – Requires Home Assistant integration

## 🚀 Quick Start

### 1. Install Dependencies

```bash
# Navigate to the project
cd v3_migration

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Start the Application

**Terminal 1 - Start Backend:**
```bash
cd v3_migration/backend
npm start
```

**Terminal 2 - Start Frontend:**
```bash
cd v3_migration/frontend
npm run dev
```

Open your browser to: **http://localhost:5173**

### 3. Configure Your Integrations (via UI)

No need to edit config files! Use the built-in Settings panel:

1. Click **🔧 Settings & API Keys** in the dock (top-left)
2. Enter your credentials for each integration you want to use:
   - **Home Assistant**: Your HA URL and Long-Lived Access Token
   - **Philips Hue**: Bridge IP and username
   - **OpenWeatherMap**: API key for weather nodes
   - **Telegram**: Bot token and chat ID for notifications
3. Click **Test Connection** to verify each one works
4. Click **Save Settings** - done!

> **Tip:** You only need to configure the integrations you'll actually use. Start with just Home Assistant!

**Getting a Home Assistant Token:**
1. Go to your Home Assistant Profile (click your username)
2. Scroll down to "Long-Lived Access Tokens"
3. Create a new token and copy it

## 🖥️ The Interface

### Control Panel (Dock)
The floating dock in the top-left provides:
- **Graph Tools**: Save, Load, Import, Clear
- **Connection Status**: Shows what's connected and device counts
- **Settings**: Configure API keys and integrations

### Node Editor
- **Right-click** to open the context menu and add nodes
- **Drag** from output sockets to input sockets to connect nodes
- **Scroll** to zoom in/out
- **Middle-click drag** to pan the canvas

### Bottom Panels
- **Event Log**: Shows real-time device state changes and triggers
- **Upcoming Events**: Shows scheduled automation events

## 🔌 Your First Automation

Let's create a simple "toggle light on button press" automation:

### Step 1: Add a Pushbutton Node
1. Right-click the canvas
2. Navigate to **Inputs** → **Pushbutton**
3. Click to place it

### Step 2: Add an HA Generic Device Node
1. Right-click the canvas
2. Navigate to **Home Assistant** → **HA Generic Device**
3. Click to place it

### Step 3: Connect Them
1. Drag from the **Pushbutton's output** (right side)
2. Drop onto the **HA Device's trigger input** (left side)

### Step 4: Select Your Device
1. In the HA Generic Device node, click "Add Device"
2. Select your light from the dropdown
3. Set **Trigger Mode** to "Toggle"

### Step 5: Test It!
Click the pushbutton - your light should toggle!

## 📦 Common Node Types

### Input Nodes
| Node | Purpose |
|------|---------|
| **Pushbutton** | Manual trigger button |
| **Integer Selector** | Pick a number value |
| **Time of Day** | Outputs true during specified hours |
| **Sunrise/Sunset** | Triggers at solar events |

### Logic Nodes
| Node | Purpose |
|------|---------|
| **AND** | All inputs must be true |
| **OR** | Any input can be true |
| **Comparison** | Compare two values |
| **Conditional Switch** | Route signals based on conditions |

### Device Nodes
| Node | Purpose |
|------|---------|
| **HA Generic Device** | Control any Home Assistant entity |
| **HA Device State** | Read device states |
| **Kasa Plug** | Control TP-Link Kasa devices |

### Color Nodes
| Node | Purpose |
|------|---------|
| **HSV Control** | Set hue, saturation, brightness |
| **Color Gradient** | Animate between colors |
| **All-in-One Color** | Full color picker |

## 💾 Saving Your Work

### Quick Save
Click **💾 Save** in the dock to save to the server.

### Export to File
1. After saving, your graph is in `v3_migration/Saved_Graphs/`
2. You can also use browser localStorage (auto-saved)

### Import from File
Click **📂 Import File** to load a saved `.json` graph.

## ⚙️ Settings & API Keys

Click **🔧 Settings & API Keys** to configure:

- **Home Assistant**: URL and access token
- **Weather Services**: OpenWeatherMap API key
- **Philips Hue**: Bridge IP and username
- **Telegram**: Bot token and chat ID for notifications

Each section has a **Test Connection** button to verify your settings.

## 🔧 Troubleshooting

### Backend won't start
```bash
# Check if port 3000 is in use
netstat -ano | findstr :3000
# Kill the process if needed
```

### Plugins not loading
- Check browser console (F12) for errors
- Clear Vite cache: `rm -rf v3_migration/frontend/node_modules/.vite`
- Restart with `npm run dev -- --force`

### Home Assistant not connecting
1. Verify HA_HOST and HA_TOKEN in Settings
2. Make sure your HA instance is accessible
3. Check the "Test Connection" button in Settings

### Nodes not responding
- Check the **Connection Status** in the dock
- Make sure backend is running and shows "Connected"
- Verify device is online in Home Assistant

## 📚 Next Steps

- Read `PLUGIN_ARCHITECTURE.md` to create custom nodes
- Check `RETE_NODE_GUIDE.md` for advanced node patterns
- Browse existing plugins in `backend/plugins/` for examples

## 🆘 Getting Help

- Check the browser console (F12) for error messages
- Look at the Event Log panel for automation feedback
- Review the README.md for API documentation

---

Happy automating! 🏠✨
