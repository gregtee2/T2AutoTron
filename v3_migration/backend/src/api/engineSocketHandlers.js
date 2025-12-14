/**
 * Engine Socket Handlers - Real-time engine status updates
 * 
 * Events:
 * - request-engine-status: Client requests current status
 * - engine-status: Server sends status update
 * - engine-started: Broadcast when engine starts
 * - engine-stopped: Broadcast when engine stops
 * - engine-tick: Broadcast after each tick (throttled)
 */

let engine = null;
let registry = null;
let io = null;
let tickBroadcastInterval = null;

// Throttle tick broadcasts to max 1 per second
const TICK_BROADCAST_INTERVAL = 1000;

/**
 * Initialize engine socket handlers
 * @param {SocketIO.Server} socketIO - The Socket.IO server instance
 */
function initEngineSocketHandlers(socketIO) {
  io = socketIO;
  
  // Lazy-load engine
  const engineModule = require('../engine');
  engine = engineModule.engine;
  registry = engineModule.registry;
  
  // Listen for engine events
  setupEngineEventListeners();
  
  // Handle individual socket connections
  io.on('connection', (socket) => {
    // Client requests engine status
    socket.on('request-engine-status', () => {
      sendEngineStatus(socket);
    });
    
    // Client requests to start engine
    socket.on('start-engine', async () => {
      try {
        const path = require('path');
        const fs = require('fs').promises;
        
        // Load nodes if needed
        if (registry.size === 0) {
          await engineModule.loadBuiltinNodes();
        }
        
        // Load last active graph if engine has no nodes
        if (engine.nodes.size === 0) {
          const savedGraphsDir = process.env.GRAPH_SAVE_PATH || path.join(__dirname, '..', '..', '..', 'Saved_Graphs');
          const lastActivePath = path.join(savedGraphsDir, '.last_active.json');
          
          try {
            await fs.access(lastActivePath);
            await engine.loadGraph(lastActivePath);
            console.log(`[Engine] Loaded graph with ${engine.nodes.size} nodes`);
          } catch (err) {
            console.log('[Engine] No last active graph to load');
          }
        }
        
        engine.start();
        io.emit('engine-started', engine.getStatus());
      } catch (error) {
        socket.emit('engine-error', { message: error.message });
      }
    });
    
    // Client requests to stop engine
    socket.on('stop-engine', () => {
      try {
        engine.stop();
        io.emit('engine-stopped', engine.getStatus());
      } catch (error) {
        socket.emit('engine-error', { message: error.message });
      }
    });
    
    // Client requests to load a graph
    socket.on('load-engine-graph', async (graphPath) => {
      try {
        // Load nodes if needed
        if (registry.size === 0) {
          await engineModule.loadBuiltinNodes();
        }
        
        const success = await engine.loadGraph(graphPath);
        if (success) {
          socket.emit('engine-graph-loaded', {
            success: true,
            status: engine.getStatus()
          });
        } else {
          socket.emit('engine-error', { message: 'Failed to load graph' });
        }
      } catch (error) {
        socket.emit('engine-error', { message: error.message });
      }
    });
  });
  
  console.log('[Engine] Socket handlers initialized');
}

/**
 * Send engine status to a specific socket
 */
function sendEngineStatus(socket) {
  if (!engine) return;
  
  const status = engine.getStatus();
  socket.emit('engine-status', {
    running: status.running,
    nodeCount: status.nodeCount,
    connectionCount: status.connectionCount,
    tickCount: status.tickCount,
    lastTickTime: status.lastTickTime,
    registeredNodeTypes: registry ? registry.size : 0
  });
}

/**
 * Broadcast engine status to all connected clients
 */
function broadcastEngineStatus() {
  if (!io || !engine) return;
  
  const status = engine.getStatus();
  io.emit('engine-status', {
    running: status.running,
    nodeCount: status.nodeCount,
    connectionCount: status.connectionCount,
    tickCount: status.tickCount,
    lastTickTime: status.lastTickTime,
    registeredNodeTypes: registry ? registry.size : 0
  });
}

/**
 * Set up listeners for engine lifecycle events
 */
function setupEngineEventListeners() {
  if (!engine) return;
  
  // Start periodic status broadcasts when engine is running
  const originalStart = engine.start.bind(engine);
  engine.start = function() {
    originalStart();
    
    // Broadcast start event
    if (io) {
      io.emit('engine-started', engine.getStatus());
    }
    
    // Start periodic tick broadcasts
    if (!tickBroadcastInterval) {
      tickBroadcastInterval = setInterval(() => {
        if (engine.running) {
          broadcastEngineStatus();
        }
      }, TICK_BROADCAST_INTERVAL);
    }
  };
  
  // Stop periodic broadcasts when engine stops
  const originalStop = engine.stop.bind(engine);
  engine.stop = function() {
    originalStop();
    
    // Broadcast stop event
    if (io) {
      io.emit('engine-stopped', engine.getStatus());
    }
    
    // Stop periodic broadcasts
    if (tickBroadcastInterval) {
      clearInterval(tickBroadcastInterval);
      tickBroadcastInterval = null;
    }
  };
}

/**
 * Auto-start engine with last active graph
 * Call this during server startup
 * Engine ALWAYS starts - users can stop it manually if needed
 */
async function autoStartEngine() {
  try {
    const engineModule = require('../engine');
    engine = engineModule.engine;
    registry = engineModule.registry;
    
    // Load builtin nodes
    await engineModule.loadBuiltinNodes();
    console.log(`[Engine] Loaded ${registry.size} node types`);
    
    // Try to load last active graph
    const path = require('path');
    const fs = require('fs').promises;
    
    // Use GRAPH_SAVE_PATH env var in Docker, or fall back to local path
    const savedGraphsDir = process.env.GRAPH_SAVE_PATH || path.join(__dirname, '..', '..', '..', 'Saved_Graphs');
    const lastActivePath = path.join(savedGraphsDir, '.last_active.json');
    console.log(`[Engine] Looking for last active graph at: ${lastActivePath}`);
    
    let graphLoaded = false;
    try {
      await fs.access(lastActivePath);
      const success = await engine.loadGraph(lastActivePath);
      graphLoaded = success;
      if (success) {
        console.log(`[Engine] Loaded last active graph with ${engine.nodes.size} nodes`);
      }
    } catch (err) {
      // No last active graph - that's fine, engine will run empty
      console.log('[Engine] No last active graph found');
    }
    
    // Always start the engine - users can stop it manually if needed
    engine.start();
    console.log(`[Engine] Auto-started ${graphLoaded ? `with ${engine.nodes.size} nodes` : '(no graph loaded)'}`);
    
  } catch (error) {
    console.error('[Engine] Auto-start error:', error.message);
  }
}

module.exports = {
  initEngineSocketHandlers,
  autoStartEngine,
  broadcastEngineStatus
};
