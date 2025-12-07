# T2AutoTron 2.1 - Rete.js v3 Migration

This is the next-generation version of T2AutoTron, migrated to Rete.js v3 with a modern React-based architecture.

## What's New in 2.1

### Architecture
- **Rete.js v3**: Complete migration from LiteGraph to Rete.js v3
- **React Components**: All nodes are now React components with proper state management
- **Vite Build System**: Fast development with HMR (Hot Module Replacement)
- **Modern Socket System**: Type-safe socket connections with custom compatibility layer
- **Plugin Architecture**: Extensible node system - add new nodes without rebuilding

### Working Features
- ✅ **30+ Node Types**: Full suite of automation nodes ported from v2.0
- ✅ **HAGenericDeviceNode**: Home Assistant device control with Follow mode
- ✅ **Logic Nodes**: AND, OR, XOR, Comparison, Conditional Switch
- ✅ **Time Nodes**: Time of Day, Time Range, Sunrise/Sunset, Date Comparison, Day of Week
- ✅ **Color Nodes**: HSV Control, HSV Modifier, Color Gradient, All-In-One Color
- ✅ **Communication**: Sender/Receiver nodes for cross-graph data flow
- ✅ **Graph Save/Load**: Full serialization with viewport state preservation
- ✅ **Backdrop Nodes**: Visual grouping with z-index management
- ✅ **Settings Panel**: UI for managing API keys with test connections

### Recent Updates (December 2024)

#### Settings & API Keys Panel
- **New UI**: Accessible via "🔧 Settings & API Keys" button in the Dock
- **Test Connections**: Verify API credentials before saving
  - Home Assistant: Tests connection and returns version
  - OpenWeatherMap: Validates API key
  - Philips Hue: Connects to bridge and counts lights
  - Telegram: Verifies bot token and returns username
- **Backup/Restore**: Export and import settings as JSON files
- **Security**: Allowlist-based key management, secrets masked by default

#### New Logic Nodes
- **DateComparisonNode**: Compare current date against single date or range
- **DayOfWeekComparisonNode**: Check day of week (single, range, or all week)
- **TimeRangeNode**: Check if current time falls within a time range

#### Node Improvements
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

1. **Debug logging**: Extensive console logging is still active for debugging purposes.
2. **Some settings require restart**: Certain environment variable changes need a server restart to take effect.

## Credits

Built with:
- [Rete.js v3](https://retejs.org/)
- [React](https://react.dev/)
- [Vite](https://vitejs.dev/)
- [Home Assistant](https://www.home-assistant.io/)
