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
 * - GET  /api/engine/audit      - Compare engine intent vs actual HA states
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const deviceAudit = require('../../engine/deviceAudit');
const commandTracker = require('../../engine/commandTracker');
const { prepareGraphForSave } = require('../../engine/graphDocument');
const { graphFilename, resolveGraphPath, readStoredGraph, writeJsonAtomic } = require('../../engine/graphStorage');
const requireLocalOrPin = require('../middleware/requireLocalOrPin');

// Includes logs, timers and audit endpoints, not only graph mutations.
router.use(requireLocalOrPin);

const VERBOSE = process.env.VERBOSE_LOGGING === 'true';

// Lazy-load homeAssistantManager to avoid circular dependencies
let homeAssistantManager = null;
function getHAManager() {
  if (!homeAssistantManager) {
    homeAssistantManager = require('../../devices/managers/homeAssistantManager');
  }
  return homeAssistantManager;
}

// Get the graphs directory - uses GRAPH_SAVE_PATH env var in Docker, or falls back to local path
function getGraphsDir() {
  if (process.env.GRAPH_SAVE_PATH) {
    return process.env.GRAPH_SAVE_PATH;
  }
  // Fallback for local development: backend/src/api/routes -> v3_migration/Saved_Graphs
  return path.join(__dirname, '..', '..', '..', '..', 'Saved_Graphs');
}

function sendGraphSaveError(res, error) {
  return res.status(error.statusCode || 500).json({
    success: false,
    persisted: false,
    error: error.message,
    code: error.code,
    expectedRevision: error.expectedRevision,
    currentRevision: error.actualRevision,
    persistence: error.persistence,
    activation: { status: 'not_attempted' },
    cleanupErrors: error.cleanupErrors
  });
}

// Lazy-load engine to avoid circular dependencies
let engine = null;
let registry = null;
let graphSaveQueue = Promise.resolve();
let startRequestGeneration = 0;

function withGraphSaveLock(task) {
  // Hold through activation, not just disk I/O: hotReload may temporarily stop
  // the engine. A later save must not skip activation or activate out of order.
  // This is process-local and covers REST operations only, not socket handlers.
  const run = graphSaveQueue.then(task, task);
  graphSaveQueue = run.catch(() => undefined);
  return run;
}

function getEngine() {
  if (!engine) {
    // Path is relative to src/api/routes/, engine is at src/engine/
    const engineModule = require('../../engine');
    engine = engineModule.engine;
    registry = engineModule.registry;
  }
  return { engine, registry };
}

async function activateSavedGraph(graph) {
  try {
    const { engine } = getEngine();
    // Preserve frontend priority. Do not queue an activation for later; handoff
    // reads the latest active file, not a stale snapshot captured by this save.
    if (engine.frontendActive) return { status: 'deferred', reason: 'frontend_active' };
    if (engine.shouldSkipDeviceCommands?.()) {
      return { status: 'deferred', reason: 'engine_busy' };
    }
    const result = engine.running
      ? await engine.hotReload(graph)
      : await engine.loadGraphData(graph);
    if (result === false) throw new Error('Engine rejected the saved graph');
    // Loading an empty graph is essential: stop alone leaves old nodes available
    // to a subsequent Start. Also replace stale nodes when already stopped.
    if (graph.nodes.length === 0) {
      engine.stop();
      deviceAudit.stopPeriodicAudit();
    }
    return {
      status: graph.nodes.length === 0 ? 'cleared' : 'activated',
      revision: graph.revision,
      running: engine.running
    };
  } catch (error) {
    console.warn('[Engine API] Graph persisted but activation failed:', error.message);
    return { status: 'failed', error: error.message, code: error.code };
  }
}

async function persistAndActivateGraph(graph, filename) {
  return withGraphSaveLock(async () => {
    const savedGraphsDir = path.resolve(getGraphsDir());
    await fs.mkdir(savedGraphsDir, { recursive: true });
    const requestedActivePath = path.join(savedGraphsDir, '.last_active.json');
    const lastActivePath = await resolveGraphPath(requestedActivePath, savedGraphsDir, { allowMissing: true });
    const filePath = filename
      ? await resolveGraphPath(path.join(savedGraphsDir, filename), savedGraphsDir, { allowMissing: true })
      : null;
    const currentGraph = await readStoredGraph(requestedActivePath, savedGraphsDir);
    // All saves compare against the ACTIVE revision. Named files are snapshots
    // of that same revision stream, not independently revisioned documents.
    const nextGraph = prepareGraphForSave(graph, currentGraph);
    const serialized = JSON.stringify(nextGraph, null, 2);
    const persistence = {
      status: 'pending',
      active: { filename: '.last_active.json', persisted: false, revision: currentGraph?.revision || 0 },
      ...(filename ? { named: { filename, persisted: false } } : {})
    };
    try {
      // Two independent atomic file replacements, NOT an atomic transaction.
      // If the second fails, keep/report the named snapshot and leave active
      // unchanged. Do not roll back over files another process may have touched.
      if (filePath) {
        await writeJsonAtomic(filePath, serialized);
        persistence.named.persisted = true;
        persistence.named.revision = nextGraph.revision;
      }
      await writeJsonAtomic(lastActivePath, serialized);
      persistence.active.persisted = true;
      persistence.active.revision = nextGraph.revision;
      persistence.status = 'complete';
    } catch (error) {
      persistence.status = persistence.named?.persisted ? 'partial' : 'failed';
      error.persistence = persistence;
      error.actualRevision = currentGraph?.revision || 0;
      throw error;
    }
    const activation = await activateSavedGraph(nextGraph);
    return { graph: nextGraph, persistence, activation };
  });
}

/**
 * GET /api/engine/status
 * Returns the current engine status
 */
router.get('/status', requireLocalOrPin, (req, res) => {
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
      lastTickCompletedTime: status.lastTickCompletedTime,
      lastTickDurationMs: status.lastTickDurationMs,
      lastTickError: status.lastTickError,
      nodeErrors: status.nodeErrors,
      loading: status.loading,
      starting: status.starting,
      lastReconciliation: status.lastReconciliation,
      loadDiagnostics: status.loadDiagnostics,
      uptime: status.running ? status.uptime : 0,
      frontendActive: status.frontendActive,
      frontendLastSeen: status.frontendLastSeen
    }
  });
});

/**
 * POST /api/engine/start
 * Start the backend engine
 */
router.post('/start', requireLocalOrPin, async (req, res) => {
  try {
    const generation = startRequestGeneration;
    const assertNotCancelled = () => {
      if (generation !== startRequestGeneration) {
        throw Object.assign(new Error('Engine start cancelled by Stop'), { statusCode: 409 });
      }
    };
    const response = await withGraphSaveLock(async () => {
      assertNotCancelled();
      const { engine, registry } = getEngine();
      if (registry.size === 0) await require('../../engine').loadBuiltinNodes();
      assertNotCancelled();
      if (engine.nodes.size === 0) {
        const savedGraphsDir = path.resolve(getGraphsDir());
        const graph = await readStoredGraph(path.join(savedGraphsDir, '.last_active.json'), savedGraphsDir);
        assertNotCancelled();
        if (graph) await engine.loadGraphData(graph);
      }
      assertNotCancelled();
      if (engine.nodes.size === 0) {
        return { statusCode: 400, success: false, error: 'No graph loaded. Load a graph first.' };
      }
      await engine.start();
      deviceAudit.startPeriodicAudit();
      return { statusCode: 200, success: true, message: 'Engine started', status: engine.getStatus() };
    });
    const { statusCode, ...body } = response;
    res.status(statusCode).json(body);
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/engine/stop
 * Stop the backend engine
 */
router.post('/stop', requireLocalOrPin, (req, res) => {
  try {
    // Stop stays immediate and invalidates Starts waiting behind a save/read.
    startRequestGeneration++;
    const { engine } = getEngine();
    engine.stop();
    
    // Stop periodic audit
    deviceAudit.stopPeriodicAudit();
    
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
router.post('/load', requireLocalOrPin, express.json(), async (req, res) => {
  try {
    const savedGraphsDir = path.resolve(getGraphsDir());
    const body = req.body || {};
    const namedPath = body.graphName !== undefined ? graphFilename(body.graphName) : null;
    const graphPath = body.graphPath ?? namedPath;
    if (typeof graphPath !== 'string' || !graphPath.trim() || graphPath.includes('\0')) {
      return res.status(400).json({ success: false, error: 'graphPath or graphName required' });
    }
    const response = await withGraphSaveLock(async () => {
      const graph = await readStoredGraph(graphPath, savedGraphsDir);
      if (!graph) return { statusCode: 404, success: false, error: 'Graph not found' };
      const { registry } = getEngine();
      if (registry.size === 0) await require('../../engine').loadBuiltinNodes();
      const activation = await activateSavedGraph(graph);
      return {
        statusCode: activation.status === 'failed' ? 500 : 200,
        success: activation.status !== 'failed',
        message: activation.status === 'deferred' ? 'Graph activation deferred; save-active is required for handoff' : `Graph loaded: ${path.basename(graphPath)}`,
        activation,
        status: getEngine().engine.getStatus()
      };
    });
    const { statusCode, ...bodyResponse } = response;
    res.status(statusCode).json(bodyResponse);
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/engine/node-labels
 * Get all loaded node instances with their labels/titles (for debug dashboard)
 */
router.get('/node-labels', requireLocalOrPin, (req, res) => {
  try {
    const { engine } = getEngine();
    
    const nodeLabels = {};
    for (const [nodeId, node] of engine.nodes) {
      const props = node.properties || {};
      nodeLabels[nodeId] = {
        label: props.customTitle || props.customName || node.label || node.constructor?.name || 'Unknown',
        type: node.constructor?.name || node.label || 'Unknown'
      };
    }
    
    res.json({
      success: true,
      nodeLabels,
      count: Object.keys(nodeLabels).length
    });
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
router.get('/nodes', requireLocalOrPin, async (req, res) => {
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
router.get('/outputs', requireLocalOrPin, (req, res) => {
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
router.get('/device-states', requireLocalOrPin, async (req, res) => {
  try {
    const { engine } = getEngine();
    
    const deviceStates = [];
    
    // First pass: find all lights under Hue Effect control
    // These should be excluded from color mismatch checks
    const effectControlledEntities = new Set();
    for (const [nodeId, node] of engine.nodes) {
      const nodeType = node.constructor?.name || node.label || 'Unknown';
      if (nodeType === 'HueEffectNode' && node.isEffectActive) {
        const entityIds = node.properties?.entityIds || [];
        entityIds.forEach(id => {
          const cleanId = id.startsWith('ha_') ? id.slice(3) : id;
          effectControlledEntities.add(cleanId);
        });
      }
    }
    
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
          // Note: deviceStates may be keyed with or without ha_ prefix - check both
          const trackedState = node.deviceStates?.[entityId] ?? node.deviceStates?.[`ha_${entityId}`] ?? node.deviceStates?.[deviceId];
          if (trackedState !== undefined) {
            expectedState = trackedState ? 'on' : 'off';
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
            trackedState: trackedState,  // Already looked up above with fallback
            effectOverride: effectControlledEntities.has(entityId),  // Skip color check if Hue Effect active
            lastOutput: output
          });
        });
      }
      
      // HALockNode - special handling for lock devices
      else if (nodeType === 'HALockNode' && props.deviceId) {
        const entityId = props.deviceId.startsWith('ha_') ? props.deviceId.slice(3) : props.deviceId;
        
        // For locks, expected state is "locked" or "unlocked" (HA format)
        // currentState is set by the node after sending commands
        let expectedState = props.currentState || 'unknown';
        
        deviceStates.push({
          nodeId,
          nodeType,
          nodeTitle: props.customTitle || props.customName || node.label,
          entityId,
          deviceName: props.deviceName || entityId,
          expectedState,  // Will be "locked", "unlocked", or "unknown"
          lastOutput: output
        });
      }
      
      // HALightControlNode and other HA devices - has deviceId
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
    
    // Fetch actual HA states for all entities to enable split-bar comparison
    const haManager = getHAManager();
    for (const device of deviceStates) {
      if (device.entityId) {
        try {
          const result = await haManager.getState(device.entityId);
          // getState returns { success: true, state: { state, brightness, hs_color, ... } }
          if (result && result.success && result.state) {
            const haState = result.state;
            device.haState = {
              state: haState.state,
              brightness: haState.brightness, // Already normalized to 0-100 by getState()
              hs_color: haState.hs_color,     // [hue, sat] where hue is 0-360, sat is 0-100
              rgb_color: haState.attributes?.rgb_color,
              color_temp: haState.attributes?.color_temp
            };
          }
        } catch (e) {
          // Ignore errors fetching individual device states
        }
      }
    }
    
    // Include frontend status so dashboard can show appropriate message
    const status = engine.getStatus();
    
    res.json({
      success: true,
      deviceStates,
      tickCount: engine.tickCount,
      running: engine.running,
      lastTickTime: engine.lastTickTime,
      frontendActive: status.frontendActive,
      frontendLastSeen: status.frontendLastSeen
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
router.post('/tick', requireLocalOrPin, async (req, res) => {
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
router.get('/last-active', requireLocalOrPin, async (req, res) => {
  if (VERBOSE) console.log('[Engine API] GET /last-active called');
  try {
    const savedGraphsDir = path.resolve(getGraphsDir());
    const lastActivePath = path.join(savedGraphsDir, '.last_active.json');
    const graphData = await readStoredGraph(lastActivePath, savedGraphsDir);
    if (!graphData) {
      return res.json({
        success: false,
        error: 'No last active graph found',
        graph: null
      });
    }
    res.json({ success: true, graph: graphData, source: '.last_active.json' });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/engine/save-active
 * Save the current graph as the last active graph (for auto-load on reconnect)
 * Also used by sendBeacon on browser close to sync unsaved changes
 * Body: graph document with baseRevision (required once active revision > 0).
 * 200 means persisted; inspect activation.status for activated/cleared/deferred/failed.
 */
router.post('/save-active', requireLocalOrPin, async (req, res) => {
  try {
    const { graph, persistence, activation } = await persistAndActivateGraph(req.body);
    res.json({
      success: true,
      persisted: true,
      message: 'Graph saved as last active',
      nodeCount: graph.nodes.length,
      revision: graph.revision,
      projectId: graph.projectId,
      persistence,
      activation
    });
  } catch (error) {
    if (!error.statusCode || error.statusCode >= 500) console.error('[Engine API] Error in save-active:', error);
    sendGraphSaveError(res, error);
  }
});

/**
 * POST /api/engine/save-graph
 * Save a graph with a specific filename
 * Body: { filename, graph: { ...document, baseRevision } }.
 * baseRevision targets the active stream, not the named snapshot's revision.
 * A failed second write reports persistence.status='partial'; it is not rolled back.
 */
router.post('/save-graph', requireLocalOrPin, async (req, res) => {
  try {
    const finalName = graphFilename(req.body?.filename);
    const { graph, persistence, activation } = await persistAndActivateGraph(req.body?.graph, finalName);
    res.json({
      success: true,
      persisted: true,
      message: `Graph saved as ${finalName}`,
      filename: finalName,
      nodeCount: graph.nodes.length,
      revision: graph.revision,
      projectId: graph.projectId,
      persistence,
      activation
    });
  } catch (error) {
    if (!error.statusCode || error.statusCode >= 500) console.error('[Engine API] Error in save-graph:', error);
    sendGraphSaveError(res, error);
  }
});

/**
 * GET /api/engine/graphs
 * List all saved graph files on the server
 */
router.get('/graphs', requireLocalOrPin, async (req, res) => {
  try {
    const fs = require('fs').promises;
    const savedGraphsDir = getGraphsDir();
    
    let files = [];
    try {
      const entries = await fs.readdir(savedGraphsDir, { withFileTypes: true });
      files = entries
        .filter(entry => entry.isFile() && entry.name.endsWith('.json') && !entry.name.startsWith('.') && entry.name.toLowerCase() !== 'cameras.json')
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
router.get('/graphs/:name', requireLocalOrPin, async (req, res) => {
  try {
    const savedGraphsDir = path.resolve(getGraphsDir());
    const graphName = graphFilename(req.params.name);
    const graph = await readStoredGraph(graphName, savedGraphsDir);
    if (!graph) return res.status(404).json({ success: false, error: 'Graph not found' });
    
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
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/engine/buffers
 * Get all AutoTronBuffer values
 */
router.get('/buffers', requireLocalOrPin, (req, res) => {
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
  
  // Path: from routes/ → api/ → src/ → backend/ → v3_migration/crashes/
  const LOG_FILE_PRIMARY = path.join(__dirname, '..', '..', '..', '..', 'crashes', 'engine_debug.log');
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
      
      // Match ISO timestamp at start: [2026-01-06T10:06:00.000Z]
      const timestampMatch = line.match(/^\[(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)\]/);
      if (!timestampMatch) {
        // Also try legacy format without ISO: [10:06 AM]
        // For legacy logs, skip time filtering (we can't know the date)
        const legacyMatch = line.match(/^\[(\d{1,2}:\d{2}(?::\d{2})?\s*[AP]M)\]/);
        if (!legacyMatch) continue;
        // For legacy format, include line but we can't filter by time
      }
      
      let timestamp;
      if (timestampMatch) {
        timestamp = new Date(timestampMatch[1]);
        if (timestamp < cutoff) continue;
      } else {
        // Legacy format - use current date with parsed time
        // This is approximate but allows viewing recent logs
        timestamp = new Date(); // Will be approximate
      }
      
      // Extract category - now third [...] block (ISO, local time, then category)
      // Or second [...] block for legacy format
      const categoryMatch = line.match(/\[([A-Z][A-Z0-9-]+)\]/);
      const category = categoryMatch ? categoryMatch[1] : 'UNKNOWN';
      
      // Extract action/message - everything after the second bracket up to pipe or end
      const messageMatch = line.match(/^\[[^\]]+\]\s*\[[^\]]+\]\s*(.+?)(?:\s*\||\s*$)/);
      const message = messageMatch ? messageMatch[1].trim() : line;
      
      // Extract JSON data after pipe (|) if present
      const dataMatch = line.match(/\|\s*(\{.+\})\s*$/);
      let data = null;
      if (dataMatch) {
        try {
          data = JSON.parse(dataMatch[1]);
        } catch (e) {
          // Ignore parsing errors
        }
      }
      
      // For HSV-CHANGE events with multiple entities, create an entry for EACH entity
      // This ensures the dashboard timeline shows colors for all devices, not just the first
      if (category === 'HA-HSV-CHANGE' && data?.entities && Array.isArray(data.entities)) {
        for (const entityId of data.entities) {
          if (entityFilter && !entityId.includes(entityFilter)) continue;
          history.push({
            time: timestamp.toISOString(),
            timeLocal: timestamp.toLocaleString(),
            category,
            entity: entityId,
            action: message,
            data: data
          });
        }
      } else {
        // Standard single-entity extraction
        const entityMatch = line.match(/((?:light|switch|sensor|climate|cover|fan|media_player)\.[a-z0-9_]+)/i);
        const entityId = entityMatch ? entityMatch[1] : null;
        
        if (entityFilter && entityId && !entityId.includes(entityFilter)) continue;
        
        history.push({
          time: timestamp.toISOString(),
          timeLocal: timestamp.toLocaleString(),
          category,
          entity: entityId,
          action: message,
          data: data
        });
      }
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

/**
 * GET /api/engine/audit
 * Run audit comparing engine intent vs actual HA device states
 * Returns mismatches between what engine thinks it sent and what HA reports
 */
router.get('/audit', async (req, res) => {
  try {
    const results = await deviceAudit.auditAndLog();
    res.json(results);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/engine/audit/tracked
 * Get list of devices currently being tracked by the audit system
 */
router.get('/audit/tracked', (req, res) => {
  try {
    const tracked = deviceAudit.getTrackedDevices();
    res.json({
      success: true,
      deviceCount: Object.keys(tracked).length,
      devices: tracked
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/engine/commands
 * Get command history - shows who sent what and why
 * Query params:
 *   - entity: Filter by entity ID (e.g., "lock.front_door")
 *   - limit: Max number of events (default 100)
 */
router.get('/commands', (req, res) => {
  try {
    const entity = req.query.entity;
    const limit = parseInt(req.query.limit) || 100;
    
    const history = commandTracker.getHistory(entity, limit);
    const pending = commandTracker.getPendingCommands();
    
    res.json({
      success: true,
      filter: entity || 'all',
      count: history.length,
      pendingCommands: pending,
      history
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/engine/commands/pending
 * Get commands we sent that haven't received state confirmations yet
 */
router.get('/commands/pending', (req, res) => {
  try {
    const pending = commandTracker.getPendingCommands();
    res.json({
      success: true,
      count: pending.length,
      pending
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
