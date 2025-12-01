# T2AutoTron 2.1 - Rete.js v3 Migration

This is the next-generation version of T2AutoTron, migrated to Rete.js v3 with a modern React-based architecture.

## What's New in 2.1

### Architecture
- **Rete.js v3**: Complete migration from LiteGraph to Rete.js v3
- **React Components**: All nodes are now React components with proper state management
- **Vite Build System**: Fast development with HMR (Hot Module Replacement)
- **Modern Socket System**: Type-safe socket connections with custom compatibility layer

### Working Features
- ✅ **PushbuttonNode**: Manual trigger with pulse mode (default) and steady-state mode
- ✅ **DisplayNode**: Debug utility to visualize data flow between nodes
- ✅ **HANewDeviceNode**: Home Assistant device control with toggle functionality
- ✅ **Data Flow Engine**: Proper dataflow propagation through the graph
- ✅ **Socket Connections**: Working connections between all node types

### Key Fixes
1. **Socket Connection Issues**: Removed wrapper divs around `RefComponent` that were blocking pointer events
2. **Data Flow Propagation**: Fixed `changeCallback` preservation to ensure engine processing
3. **Pulse Mode**: Implemented smart pulse mode that shows last command while sending brief triggers
4. **CSS Interference**: Resolved z-index and pointer-events conflicts with Rete.js hit-testing

## Documentation

See [`v3_migration/frontend/RETE_NODE_GUIDE.md`](v3_migration/frontend/RETE_NODE_GUIDE.md) for comprehensive guidelines on creating Rete.js nodes, including:
- Critical rules for socket rendering
- Proper changeCallback preservation patterns
- Event propagation best practices
- Complete node structure templates

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

## Migration Status

### Completed
- [x] Core Rete.js setup
- [x] Socket system with type compatibility
- [x] PushbuttonNode (with pulse mode)
- [x] DisplayNode (debug utility)
- [x] HANewDeviceNode (basic toggle)
- [x] Data flow engine integration
- [x] Documentation (RETE_NODE_GUIDE.md)

### In Progress
- [ ] HANewDeviceNode full feature parity with v2.0
- [ ] Additional trigger nodes (timers, sensors, etc.)
- [ ] Graph save/load functionality
- [ ] UI polish and styling

### Planned
- [ ] All v2.0 node types
- [ ] Advanced automation features
- [ ] Performance optimizations
- [ ] Testing suite

## Known Issues

1. **v3_migration as submodule**: The v3_migration folder is currently tracked as a git submodule. This may need to be flattened in the future.
2. **Debug logging**: Extensive console logging is still active for debugging purposes.

## Credits

Built with:
- [Rete.js v3](https://retejs.org/)
- [React](https://react.dev/)
- [Vite](https://vitejs.dev/)
- [Home Assistant](https://www.home-assistant.io/)
