/**
 * Engine Routes - REST API for backend engine control
 * 
 * Endpoints:
 * - GET  /api/engine/status     - Get engine running status
 * - POST /api/engine/start      - Start the engine
 * - POST /api/engine/stop       - Stop the engine
 * - POST /api/engine/load       - Load a graph file
 * - GET  /api/engine/nodes      - List registered node types
 * - GET  /api/engine/outputs    - Get current node outputs
 */

const express = require('express');
const router = express.Router();
const path = require('path');

// Lazy-load engine to avoid circular dependencies
let engine = null;
let registry = null;

function getEngine() {
  if (!engine) {
    // Path is relative to src/api/routes/, engine is at src/engine/
    const engineModule = require('../../engine');
    engine = engineModule.engine;
    registry = engineModule.registry;
  }
  return { engine, registry };
}

/**
 * GET /api/engine/status
 * Returns the current engine status
 */
router.get('/status', (req, res) => {
  const { engine } = getEngine();
  const status = engine.getStatus();
  
  res.json({
    success: true,
    status: {
      running: status.running,
      nodeCount: status.nodeCount,
      connectionCount: status.connectionCount,
      tickCount: status.tickCount,
      lastTickTime: status.lastTickTime,
      uptime: status.running ? Date.now() - status.startTime : 0
    }
  });
});

/**
 * POST /api/engine/start
 * Start the backend engine
 */
router.post('/start', async (req, res) => {
  try {
    const { engine, registry } = getEngine();
    const engineModule = require('../../engine');
    
    // Load builtin nodes if not already loaded
    if (registry.size === 0) {
      await engineModule.loadBuiltinNodes();
    }
    
    // Load last active graph if no graph is loaded
    if (engine.nodes.size === 0) {
      const savedGraphsDir = path.join(__dirname, '..', '..', '..', 'Saved_Graphs');
      const lastActivePath = path.join(savedGraphsDir, '.last_active.json');
      
      try {
        await engine.loadGraph(lastActivePath);
      } catch (err) {
        // No last active graph - that's fine
        console.log('[Engine API] No last active graph found');
      }
    }
    
    if (engine.nodes.size === 0) {
      return res.status(400).json({
        success: false,
        error: 'No graph loaded. Load a graph first.'
      });
    }
    
    engine.start();
    
    res.json({
      success: true,
      message: 'Engine started',
      status: engine.getStatus()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/engine/stop
 * Stop the backend engine
 */
router.post('/stop', (req, res) => {
  try {
    const { engine } = getEngine();
    engine.stop();
    
    res.json({
      success: true,
      message: 'Engine stopped',
      status: engine.getStatus()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/engine/load
 * Load a graph file into the engine
 * Body: { graphPath: string } or { graphName: string }
 */
router.post('/load', express.json(), async (req, res) => {
  try {
    const { engine, registry } = getEngine();
    const engineModule = require('../../engine');
    
    // Load builtin nodes if not already loaded
    if (registry.size === 0) {
      await engineModule.loadBuiltinNodes();
    }
    
    let graphPath = req.body.graphPath;
    
    // If graphName provided, resolve to full path
    if (req.body.graphName && !graphPath) {
      // Path from src/api/routes/ to v3_migration/Saved_Graphs/
      // __dirname = backend/src/api/routes
      // We need to go up 4 levels (routes -> api -> src -> backend -> v3_migration) then into Saved_Graphs
      const savedGraphsDir = path.join(__dirname, '..', '..', '..', '..', 'Saved_Graphs');
      graphPath = path.join(savedGraphsDir, req.body.graphName);
      
      // Add .json extension if missing
      if (!graphPath.endsWith('.json')) {
        graphPath += '.json';
      }
    }
    
    if (!graphPath) {
      return res.status(400).json({
        success: false,
        error: 'graphPath or graphName required'
      });
    }
    
    console.log(`[Engine API] Loading graph from: ${graphPath}`);
    const success = await engine.loadGraph(graphPath);
    
    if (success) {
      res.json({
        success: true,
        message: `Graph loaded: ${path.basename(graphPath)}`,
        status: engine.getStatus()
      });
    } else {
      res.status(400).json({
        success: false,
        error: `Failed to load graph from ${graphPath}`
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/engine/nodes
 * List all registered node types in the backend engine
 */
router.get('/nodes', async (req, res) => {
  try {
    const { registry } = getEngine();
    const engineModule = require('../../engine');
    
    // Load builtin nodes if not already loaded
    if (registry.size === 0) {
      await engineModule.loadBuiltinNodes();
    }
    
    res.json({
      success: true,
      nodes: registry.list(),
      count: registry.size
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/engine/outputs
 * Get current outputs from all nodes
 */
router.get('/outputs', (req, res) => {
  try {
    const { engine } = getEngine();
    
    const outputs = {};
    for (const [nodeId, output] of engine.outputs) {
      outputs[nodeId] = output;
    }
    
    res.json({
      success: true,
      outputs,
      tickCount: engine.tickCount
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/engine/tick
 * Force a single engine tick (for testing)
 */
router.post('/tick', async (req, res) => {
  try {
    const { engine } = getEngine();
    
    await engine.tick(true);
    
    const outputs = {};
    for (const [nodeId, output] of engine.outputs) {
      outputs[nodeId] = output;
    }
    
    res.json({
      success: true,
      message: 'Tick executed',
      tickCount: engine.tickCount,
      outputs
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
