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

// Get the graphs directory - uses GRAPH_SAVE_PATH env var in Docker, or falls back to local path
function getGraphsDir() {
  if (process.env.GRAPH_SAVE_PATH) {
    return process.env.GRAPH_SAVE_PATH;
  }
  // Fallback for local development: backend/src/api/routes -> v3_migration/Saved_Graphs
  return path.join(__dirname, '..', '..', '..', '..', 'Saved_Graphs');
}

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
      uptime: status.running ? Date.now() - status.startTime : 0,
      frontendActive: status.frontendActive,
      frontendLastSeen: status.frontendLastSeen
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
      // Also load unified nodes (single-source-of-truth definitions)
      await engineModule.loadUnifiedNodes();
    }
    
    // Load last active graph if no graph is loaded
    if (engine.nodes.size === 0) {
      const savedGraphsDir = getGraphsDir();
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
      // Also load unified nodes (single-source-of-truth definitions)
      await engineModule.loadUnifiedNodes();
    }
    
    let graphPath = req.body.graphPath;
    
    // If graphName provided, resolve to full path
    if (req.body.graphName && !graphPath) {
      const savedGraphsDir = getGraphsDir();
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

/**
 * GET /api/engine/last-active
 * Returns the last active graph JSON for frontend auto-load
 */
router.get('/last-active', async (req, res) => {
  console.log('[Engine API] GET /last-active called');
  try {
    const fs = require('fs').promises;
    const savedGraphsDir = getGraphsDir();
    const lastActivePath = path.join(savedGraphsDir, '.last_active.json');
    console.log('[Engine API] Looking for:', lastActivePath);
    
    try {
      const content = await fs.readFile(lastActivePath, 'utf-8');
      const graphData = JSON.parse(content);
      console.log('[Engine API] Found last active graph with', graphData.nodes?.length || 0, 'nodes');
      
      res.json({
        success: true,
        graph: graphData,
        source: '.last_active.json'
      });
    } catch (err) {
      // No last active graph exists
      console.log('[Engine API] No last active graph found');
      res.json({
        success: false,
        error: 'No last active graph found',
        graph: null
      });
    }
  } catch (error) {
    console.error('[Engine API] Error in last-active:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/engine/save-active
 * Save the current graph as the last active graph (for auto-load on reconnect)
 */
router.post('/save-active', async (req, res) => {
  console.log('[Engine API] POST /save-active called');
  try {
    const fs = require('fs').promises;
    const savedGraphsDir = getGraphsDir();
    const lastActivePath = path.join(savedGraphsDir, '.last_active.json');
    console.log('[Engine API] Saving to:', lastActivePath);
    
    // Ensure directory exists
    await fs.mkdir(savedGraphsDir, { recursive: true });
    
    const graphData = req.body;
    if (!graphData || !graphData.nodes) {
      console.log('[Engine API] Invalid graph data received:', typeof graphData);
      return res.status(400).json({
        success: false,
        error: 'Invalid graph data - must contain nodes array'
      });
    }
    
    await fs.writeFile(lastActivePath, JSON.stringify(graphData, null, 2), 'utf-8');
    
    console.log(`[Engine API] Saved last active graph (${graphData.nodes?.length || 0} nodes)`);
    
    // Also hot-reload into engine if it's running
    try {
      const { engine } = getEngine();
      if (engine && engine.running) {
        // Use hotReload with parsed data instead of loadGraph with file path
        // This avoids race conditions and handles empty graphs gracefully
        if (graphData.nodes && graphData.nodes.length > 0) {
          await engine.hotReload(graphData);
          console.log('[Engine API] Graph hot-reloaded into engine');
        } else {
          // Graph was cleared - stop the engine gracefully
          engine.stop();
          console.log('[Engine API] Graph cleared - engine stopped');
        }
      }
    } catch (err) {
      // Don't fail the save if engine reload fails
      console.warn('[Engine API] Could not reload into engine:', err.message);
    }
    
    res.json({
      success: true,
      message: 'Graph saved as last active',
      nodeCount: graphData.nodes?.length || 0
    });
  } catch (error) {
    console.error('[Engine API] Error in save-active:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/engine/graphs
 * List all saved graph files on the server
 */
router.get('/graphs', async (req, res) => {
  try {
    const fs = require('fs').promises;
    const savedGraphsDir = getGraphsDir();
    
    let files = [];
    try {
      const entries = await fs.readdir(savedGraphsDir, { withFileTypes: true });
      files = entries
        .filter(entry => entry.isFile() && entry.name.endsWith('.json') && !entry.name.startsWith('.'))
        .map(entry => entry.name);
    } catch (err) {
      // Directory might not exist yet
      console.log('[Engine API] Graphs directory not found:', savedGraphsDir);
    }
    
    // Get file stats for sorting by date
    const graphsWithStats = await Promise.all(
      files.map(async (name) => {
        try {
          const filePath = path.join(savedGraphsDir, name);
          const stats = await fs.stat(filePath);
          return {
            name,
            path: filePath,
            modified: stats.mtime,
            size: stats.size
          };
        } catch {
          return { name, path: path.join(savedGraphsDir, name), modified: new Date(0), size: 0 };
        }
      })
    );
    
    // Sort by modification date, newest first
    graphsWithStats.sort((a, b) => b.modified - a.modified);
    
    res.json({
      success: true,
      directory: savedGraphsDir,
      graphs: graphsWithStats.map(g => ({
        name: g.name,
        displayName: g.name.replace('.json', ''),
        modified: g.modified.toISOString(),
        size: g.size
      }))
    });
  } catch (error) {
    console.error('[Engine API] Error listing graphs:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/engine/log/help
 * Explains log categories and what they mean
 */
router.get('/log/help', (req, res) => {
  res.json({
    success: true,
    logLevels: {
      0: 'QUIET - Only errors and device commands',
      1: 'NORMAL - State changes + device commands (default)',
      2: 'VERBOSE - Everything including every tick (huge logs!)'
    },
    categories: {
      'ENGINE': 'Engine start/stop/status events',
      'DEVICE-CMD': '📤 Command SENT to device (the "order placed")',
      'HA-DEVICE-SUCCESS': '✅ Device acknowledged command (the "order delivered")',
      'HA-DEVICE-ERROR': '❌ Device command failed (the "order lost")',
      'TRIGGER': '🔀 Node trigger state changed (true→false or vice versa)',
      'BUFFER-CHANGE': '📝 Buffer value changed (color, brightness, etc.)',
      'BUFFER-SET': 'Buffer value set (verbose mode only)',
      'BUFFER-GET': 'Buffer value read (verbose mode only)',
      'NODE': 'Node execution details (verbose mode only)',
      'HA-INPUTS': 'Inputs received by HA device nodes'
    },
    endpoints: {
      'GET /api/engine/log/level': 'Get current log level',
      'POST /api/engine/log/level': 'Set log level (body: { level: 0|1|2 })',
      'GET /api/engine/log/audit': 'Get audit summary from recent logs',
      'GET /api/engine/log/audit?lines=500': 'Analyze last 500 lines',
      'GET /api/engine/log/audit?category=DEVICE-CMD': 'Filter by category'
    },
    logFile: 'crashes/engine_debug.log',
    tip: 'To see what lights were controlled overnight, check DEVICE-CMD entries. To verify they worked, check HA-DEVICE-SUCCESS/ERROR.'
  });
});

/**
 * GET /api/engine/log/level
 * Get current log level
 */
router.get('/log/level', (req, res) => {
  const engineLogger = require('../../engine/engineLogger');
  res.json({
    success: true,
    level: engineLogger.getLogLevel(),
    levelName: ['QUIET', 'NORMAL', 'VERBOSE'][engineLogger.getLogLevel()] || 'UNKNOWN'
  });
});

/**
 * POST /api/engine/log/level
 * Set log level (0=QUIET, 1=NORMAL, 2=VERBOSE)
 * Body: { level: number }
 */
router.post('/log/level', express.json(), (req, res) => {
  const engineLogger = require('../../engine/engineLogger');
  const { level } = req.body;
  
  if (level === undefined || level < 0 || level > 2) {
    return res.status(400).json({
      success: false,
      error: 'Invalid level. Use 0 (QUIET), 1 (NORMAL), or 2 (VERBOSE)'
    });
  }
  
  engineLogger.setLogLevel(level);
  res.json({
    success: true,
    message: `Log level set to ${level}`,
    levelName: ['QUIET', 'NORMAL', 'VERBOSE'][level]
  });
});

/**
 * GET /api/engine/log/audit
 * Get audit summary from recent log file
 * Query params:
 *   - lines: number of lines to analyze (default 1000)
 *   - category: filter by category (DEVICE-CMD, TRIGGER, etc.)
 */
router.get('/log/audit', async (req, res) => {
  try {
    const fs = require('fs').promises;
    const engineLogger = require('../../engine/engineLogger');
    const logFile = engineLogger.LOG_FILE;
    
    const maxLines = parseInt(req.query.lines) || 1000;
    const filterCategory = req.query.category?.toUpperCase();
    
    // Read log file
    let logContent;
    try {
      logContent = await fs.readFile(logFile, 'utf8');
    } catch (err) {
      return res.json({
        success: true,
        audit: {
          error: 'No log file found',
          summary: {}
        }
      });
    }
    
    // Get last N lines
    const lines = logContent.split('\n').slice(-maxLines);
    
    // Parse and count by category
    const categoryCounts = {};
    const deviceCommands = [];
    const triggers = [];
    const errors = [];
    
    const linePattern = /^\[([^\]]+)\] \[([^\]]+)\] (.*)$/;
    
    for (const line of lines) {
      const match = line.match(linePattern);
      if (!match) continue;
      
      const [, timestamp, category, message] = match;
      
      // Skip if filtering and doesn't match
      if (filterCategory && category !== filterCategory) continue;
      
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
      
      // Collect interesting entries
      if (category === 'DEVICE-CMD' && deviceCommands.length < 50) {
        deviceCommands.push({ timestamp, message });
      }
      if (category === 'TRIGGER' && triggers.length < 50) {
        triggers.push({ timestamp, message });
      }
      if (category.includes('ERROR') && errors.length < 20) {
        errors.push({ timestamp, category, message });
      }
    }
    
    res.json({
      success: true,
      audit: {
        linesAnalyzed: lines.length,
        categoryCounts,
        recentDeviceCommands: deviceCommands.slice(-20),
        recentTriggers: triggers.slice(-20),
        errors,
        logFile
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/engine/graphs/:name
 * Get a specific saved graph by name
 */
router.get('/graphs/:name', async (req, res) => {
  try {
    const fs = require('fs').promises;
    const savedGraphsDir = getGraphsDir();
    
    let graphName = req.params.name;
    if (!graphName.endsWith('.json')) {
      graphName += '.json';
    }
    
    const graphPath = path.join(savedGraphsDir, graphName);
    
    // Security: ensure the resolved path is within the graphs directory
    const resolvedPath = path.resolve(graphPath);
    const resolvedDir = path.resolve(savedGraphsDir);
    if (!resolvedPath.startsWith(resolvedDir)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }
    
    const content = await fs.readFile(graphPath, 'utf8');
    const graph = JSON.parse(content);
    
    res.json({
      success: true,
      name: graphName,
      graph
    });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return res.status(404).json({
        success: false,
        error: 'Graph not found'
      });
    }
    console.error('[Engine API] Error loading graph:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
