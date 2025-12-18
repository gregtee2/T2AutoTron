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
 * GET /api/engine/device-states
 * Returns what the engine thinks each device's state SHOULD be
 * based on the tracked device states (not just trigger input).
 * Used by debug dashboard to compare "engine expected state" vs "actual HA state".
 */
router.get('/device-states', async (req, res) => {
  try {
    const { engine } = getEngine();
    
    const deviceStates = [];
    
    // Iterate over all nodes to find device-controlling nodes
    for (const [nodeId, node] of engine.nodes) {
      const nodeType = node.constructor?.name || node.label || 'Unknown';
      const props = node.properties || {};
      
      // Get output for this node
      const output = engine.outputs.get(nodeId) || {};
      
      // HAGenericDeviceNode - has selectedDeviceIds array
      if (props.selectedDeviceIds && Array.isArray(props.selectedDeviceIds)) {
        props.selectedDeviceIds.forEach((deviceId, i) => {
          const entityId = deviceId.startsWith('ha_') ? deviceId.slice(3) : deviceId;
          const deviceName = props.selectedDeviceNames?.[i] || entityId;
          
          // Determine expected state for REPORTING purposes only
          // This does NOT change engine behavior - just tells dashboard what we think is happening
          let expectedState = 'unknown';
          
          // First check deviceStates (tracks actual commands sent)
          if (node.deviceStates && node.deviceStates[entityId] !== undefined) {
            expectedState = node.deviceStates[entityId] ? 'on' : 'off';
          }
          // If trigger is connected, use trigger state
          else if (node.lastTrigger !== undefined && node.lastTrigger !== null) {
            expectedState = node.lastTrigger ? 'on' : 'off';
          }
          // HSV-only mode: if no trigger but we have lastSentHsv, device is effectively ON
          // (we're sending color commands to it, so it must be on)
          else if (node.lastSentHsv) {
            expectedState = 'on';  // Reporting only - receiving HSV means it's on
          }
          // Fallback: check output.is_on
          else if (output.is_on !== undefined) {
            expectedState = output.is_on ? 'on' : 'off';
          }
          
          // Get the trigger/hsv info if available
          const triggerMode = props.triggerMode || 'Follow';
          
          deviceStates.push({
            nodeId,
            nodeType,
            nodeTitle: props.customTitle || props.customName || node.label,
            entityId,
            deviceName,
            expectedState,
            triggerMode,
            lastTrigger: node.lastTrigger,
            hasHsvInput: !!node.lastSentHsv,
            expectedHsv: node.lastSentHsv || null,  // What color engine is sending
            trackedState: node.deviceStates?.[entityId],
            lastOutput: output
          });
        });
      }
      
      // HALightControlNode - has deviceId
      else if (props.deviceId && (nodeType.includes('Light') || nodeType.includes('HA'))) {
        const entityId = props.deviceId.startsWith('ha_') ? props.deviceId.slice(3) : props.deviceId;
        
        let expectedState = 'unknown';
        if (node.deviceStates && node.deviceStates[entityId] !== undefined) {
          expectedState = node.deviceStates[entityId] ? 'on' : 'off';
        } else if (output.is_on !== undefined) {
          expectedState = output.is_on ? 'on' : 'off';
        }
        
        deviceStates.push({
          nodeId,
          nodeType,
          nodeTitle: props.customTitle || props.customName || node.label,
          entityId,
          deviceName: props.deviceName || entityId,
          expectedState,
          trackedState: node.deviceStates?.[entityId],
          lastOutput: output
        });
      }
    }
    
    res.json({
      success: true,
      deviceStates,
      tickCount: engine.tickCount,
      running: engine.running,
      lastTickTime: engine.lastTickTime
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
 * POST /api/engine/save-graph
 * Save a graph with a specific filename
 */
router.post('/save-graph', async (req, res) => {
  console.log('[Engine API] POST /save-graph called');
  try {
    const fs = require('fs').promises;
    const savedGraphsDir = getGraphsDir();
    
    const { filename, graph } = req.body;
    if (!filename || !graph) {
      return res.status(400).json({
        success: false,
        error: 'Must provide filename and graph data'
      });
    }
    
    // Sanitize filename - allow alphanumeric, underscores, hyphens, spaces
    const safeName = filename.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim();
    if (!safeName) {
      return res.status(400).json({
        success: false,
        error: 'Invalid filename'
      });
    }
    
    const finalName = safeName.endsWith('.json') ? safeName : `${safeName}.json`;
    const filePath = path.join(savedGraphsDir, finalName);
    
    // Ensure directory exists
    await fs.mkdir(savedGraphsDir, { recursive: true });
    
    await fs.writeFile(filePath, JSON.stringify(graph, null, 2), 'utf-8');
    
    // Also save as last active so engine picks it up
    const lastActivePath = path.join(savedGraphsDir, '.last_active.json');
    await fs.writeFile(lastActivePath, JSON.stringify(graph, null, 2), 'utf-8');
    
    console.log(`[Engine API] Saved graph as "${finalName}" (${graph.nodes?.length || 0} nodes)`);
    
    // Hot-reload into engine
    try {
      const { engine } = getEngine();
      if (engine && engine.running && graph.nodes && graph.nodes.length > 0) {
        await engine.hotReload(graph);
        console.log('[Engine API] Graph hot-reloaded into engine');
      }
    } catch (err) {
      console.warn('[Engine API] Could not reload into engine:', err.message);
    }
    
    res.json({
      success: true,
      message: `Graph saved as ${finalName}`,
      filename: finalName,
      nodeCount: graph.nodes?.length || 0
    });
  } catch (error) {
    console.error('[Engine API] Error in save-graph:', error);
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

/**
 * GET /api/engine/buffers
 * Get all AutoTronBuffer values
 */
router.get('/buffers', (req, res) => {
  const { engine } = getEngine();
  
  // Import AutoTronBuffer from BufferNodes
  let buffers = {};
  try {
    const { AutoTronBuffer } = require('../../engine/nodes/BufferNodes');
    for (const key of AutoTronBuffer.keys()) {
      buffers[key] = AutoTronBuffer.get(key);
    }
  } catch (err) {
    console.log('[Engine API] Could not load buffers:', err.message);
  }
  
  res.json({
    success: true,
    buffers
  });
});

/**
 * GET /api/engine/timers
 * Get active timeline/timer nodes
 */
router.get('/timers', (req, res) => {
  const { engine } = getEngine();
  const timers = [];
  
  // Find all timeline/timer nodes and their state
  for (const [nodeId, node] of engine.nodes) {
    if (node.name && (
      node.name.includes('Timeline') || 
      node.name.includes('Timer') || 
      node.name.includes('Delay')
    )) {
      const props = node.properties || {};
      timers.push({
        nodeId,
        name: props.customName || props.customTitle || node.name,
        mode: props.rangeMode || props.mode || 'unknown',
        duration: props.timerDurationValue ? 
          `${props.timerDurationValue} ${props.timerUnit || 'ms'}` : 
          (props.duration || '--'),
        direction: node.pingPongDirection || 1,
        position: props.position || 0,
        progress: props.position || 0,
        isInRange: props.isInRange || false,
        loopMode: props.timerLoopMode || 'none'
      });
    }
  }
  
  res.json({
    success: true,
    timers
  });
});

/**
 * GET /api/engine/logs
 * Retrieve engine debug logs for analysis
 * Query params:
 *   - lines: Number of lines to return (default: 500, max: 10000)
 *   - filter: Category filter (e.g., "DEVICE-CMD", "TRIGGER", "BUFFER-CHANGE")
 *   - since: ISO timestamp to filter logs after
 */
router.get('/logs', (req, res) => {
  const fs = require('fs');
  const path = require('path');
  
  // Log file is in crashes/ folder
  const LOG_DIR = process.env.GRAPH_SAVE_PATH ? 
    path.join(process.env.GRAPH_SAVE_PATH, '..') :  // Docker: /data -> /data/../ = /
    path.join(__dirname, '..', '..', '..', '..', 'crashes');
  
  // Also check the standard location inside backend
  const LOG_FILE_PRIMARY = path.join(__dirname, '..', '..', '..', 'crashes', 'engine_debug.log');
  const LOG_FILE_DOCKER = '/data/engine_debug.log';
  
  // Try multiple locations
  let LOG_FILE = null;
  if (fs.existsSync(LOG_FILE_PRIMARY)) {
    LOG_FILE = LOG_FILE_PRIMARY;
  } else if (fs.existsSync(LOG_FILE_DOCKER)) {
    LOG_FILE = LOG_FILE_DOCKER;
  } else if (fs.existsSync(path.join(LOG_DIR, 'engine_debug.log'))) {
    LOG_FILE = path.join(LOG_DIR, 'engine_debug.log');
  }
  
  if (!LOG_FILE || !fs.existsSync(LOG_FILE)) {
    return res.json({
      success: true,
      logs: [],
      message: 'No log file found. Engine may not have started yet.',
      searchedPaths: [LOG_FILE_PRIMARY, LOG_FILE_DOCKER]
    });
  }
  
  try {
    const maxLines = Math.min(parseInt(req.query.lines) || 500, 10000);
    const filter = req.query.filter;
    const since = req.query.since ? new Date(req.query.since) : null;
    
    // Read file and get last N lines
    const content = fs.readFileSync(LOG_FILE, 'utf-8');
    let lines = content.split('\n').filter(line => line.trim());
    
    // Apply category filter if specified
    if (filter) {
      const filterRegex = new RegExp(`\\[${filter}\\]`, 'i');
      lines = lines.filter(line => filterRegex.test(line));
    }
    
    // Apply timestamp filter if specified
    if (since) {
      lines = lines.filter(line => {
        const match = line.match(/^\[(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)\]/);
        if (match) {
          const lineDate = new Date(match[1]);
          return lineDate >= since;
        }
        return true; // Keep non-timestamped lines (headers, etc.)
      });
    }
    
    // Take last N lines
    const result = lines.slice(-maxLines);
    
    // Parse into structured format for easier analysis
    const parsed = result.map(line => {
      const match = line.match(/^\[([^\]]+)\]\s*\[([^\]]+)\]\s*(.+?)(?:\s*\|\s*(.+))?$/);
      if (match) {
        return {
          timestamp: match[1],
          category: match[2],
          message: match[3],
          data: match[4] ? tryParseJson(match[4]) : null
        };
      }
      return { raw: line };
    });
    
    res.json({
      success: true,
      logFile: LOG_FILE,
      totalLines: lines.length,
      returnedLines: result.length,
      filter: filter || null,
      since: since ? since.toISOString() : null,
      logs: parsed
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/engine/logs/device-history
 * Get simplified device command history for debugging
 * Query params:
 *   - entityId: Filter by specific entity (e.g., "light.bar_lamp")
 *   - hours: How many hours back to look (default: 24)
 */
router.get('/logs/device-history', (req, res) => {
  const fs = require('fs');
  const path = require('path');
  
  const LOG_FILE_PRIMARY = path.join(__dirname, '..', '..', '..', 'crashes', 'engine_debug.log');
  const LOG_FILE_DOCKER = '/data/engine_debug.log';
  
  let LOG_FILE = fs.existsSync(LOG_FILE_PRIMARY) ? LOG_FILE_PRIMARY : 
                 fs.existsSync(LOG_FILE_DOCKER) ? LOG_FILE_DOCKER : null;
  
  if (!LOG_FILE) {
    return res.json({
      success: true,
      history: [],
      message: 'No log file found'
    });
  }
  
  try {
    const entityFilter = req.query.entityId;
    const hoursBack = parseInt(req.query.hours) || 24;
    const cutoff = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
    
    const content = fs.readFileSync(LOG_FILE, 'utf-8');
    const lines = content.split('\n');
    
    const history = [];
    
    // Categories that indicate device activity (check actual log output to verify)
    const deviceCategories = [
      'DEVICE-CMD',         // logDeviceCommand() calls
      'HA-DEVICE-SUCCESS',  // Successful HA API calls
      'HA-DEVICE-ERROR',    // Failed HA API calls  
      'HA-DEVICE-SKIP',     // Skipped (frontend active)
      'HA-HSV-CHANGE',      // HSV color changes sent
      'HA-HSV-ONLY',        // HSV-only commands
      'HA-HSV-SKIP',        // HSV skipped (trigger=false)
      'TRIGGER',            // Trigger events
      'HA-DECISION'         // Decision logging
    ];
    
    for (const line of lines) {
      // Check if line contains any device-related category
      const hasDeviceCategory = deviceCategories.some(cat => line.includes(`[${cat}]`));
      if (!hasDeviceCategory) continue;
      
      const timestampMatch = line.match(/^\[(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)\]/);
      if (!timestampMatch) continue;
      
      const timestamp = new Date(timestampMatch[1]);
      if (timestamp < cutoff) continue;
      
      // Extract entity ID if present (in message or data)
      const entityMatch = line.match(/((?:light|switch|sensor|climate|cover|fan|media_player)\.[a-z0-9_]+)/i);
      const entityId = entityMatch ? entityMatch[1] : null;
      
      if (entityFilter && entityId && !entityId.includes(entityFilter)) continue;
      
      // Extract category - match the second [...] block (first is timestamp)
      const categoryMatch = line.match(/^\[[^\]]+\]\s*\[([A-Z0-9-]+)\]/);
      const category = categoryMatch ? categoryMatch[1] : 'UNKNOWN';
      
      // Extract action/message - everything after the second bracket up to pipe or end
      const messageMatch = line.match(/^\[[^\]]+\]\s*\[[^\]]+\]\s*(.+?)(?:\s*\||\s*$)/);
      const message = messageMatch ? messageMatch[1].trim() : line;
      
      history.push({
        time: timestamp.toISOString(),
        timeLocal: timestamp.toLocaleString(),
        category,
        entity: entityId,
        action: message
      });
    }
    
    res.json({
      success: true,
      entityFilter: entityFilter || 'all',
      hoursBack,
      eventCount: history.length,
      history: history.slice(-1000) // Last 1000 events max
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Helper to try parsing JSON
function tryParseJson(str) {
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

module.exports = router;
