/**
 * Backend Engine - Main Export
 * 
 * Server-side automation engine for T2AutoTron.
 * Runs node graphs 24/7 without requiring a browser.
 * 
 * Usage:
 *   const engine = require('./engine');
 *   await engine.loadGraph('./path/to/graph.json');
 *   engine.start();
 */

const engine = require('./BackendEngine');
const registry = require('./BackendNodeRegistry');
const path = require('path');
const fs = require('fs').promises;
const { createEngineNode } = require('../../../shared/EngineNodeWrapper');

// Load built-in backend nodes (from src/engine/nodes/)
async function loadBuiltinNodes() {
  const nodesDir = path.join(__dirname, 'nodes');
  
  try {
    const files = await fs.readdir(nodesDir);
    const jsFiles = files.filter(f => f.endsWith('.js'));
    
    for (const file of jsFiles) {
      try {
        const nodeModule = require(path.join(nodesDir, file));
        // Call the register function if it exists
        if (typeof nodeModule.register === 'function') {
          nodeModule.register(registry);
        }
        console.log(`[Engine] Loaded node module: ${file}`);
      } catch (error) {
        console.error(`[Engine] Failed to load ${file}: ${error.message}`);
      }
    }
  } catch (error) {
    // nodes directory might not exist yet
    if (error.code !== 'ENOENT') {
      console.error(`[Engine] Error loading nodes: ${error.message}`);
    }
  }
}

/**
 * Load unified node definitions from shared/nodes/
 * These are the single-source-of-truth definitions that work in both frontend and backend.
 */
async function loadUnifiedNodes() {
  // Path from backend/src/engine/ to v3_migration/shared/nodes/
  const sharedDir = path.join(__dirname, '..', '..', '..', 'shared', 'nodes');
  let loadedCount = 0;
  
  try {
    await fs.access(sharedDir);
  } catch (error) {
    console.log(`[Engine] No shared/nodes directory found at ${sharedDir} - skipping unified nodes`);
    return 0;
  }
  
  async function walkDirectory(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        await walkDirectory(fullPath);
      } else if (entry.name.endsWith('.node.js')) {
        try {
          const definition = require(fullPath);
          
          if (definition && definition.id && definition.execute) {
            // Wrap the unified definition for backend engine use
            const NodeClass = createEngineNode(definition);
            registry.register(definition.id, NodeClass);
            
            // Also register by label for graph loading compatibility
            if (definition.label) {
              // Add to the label mapping in getByLabel
              registry._unifiedLabels = registry._unifiedLabels || {};
              registry._unifiedLabels[definition.label] = definition.id;
            }
            
            loadedCount++;
            console.log(`[Engine] Loaded unified node: ${definition.id}`);
          }
        } catch (error) {
          console.error(`[Engine] Failed to load unified node ${entry.name}: ${error.message}`);
        }
      }
    }
  }
  
  await walkDirectory(sharedDir);
  console.log(`[Engine] Loaded ${loadedCount} unified node(s)`);
  return loadedCount;
}

// Auto-load last active graph on startup
async function autoStart() {
  // Use GRAPH_SAVE_PATH env var in Docker, or fall back to local path
  const savedGraphsDir = process.env.GRAPH_SAVE_PATH || path.join(__dirname, '..', '..', '..', 'Saved_Graphs');
  const lastActivePath = path.join(savedGraphsDir, '.last_active.json');
  console.log(`[Engine] autoStart: Looking for graph at ${lastActivePath}`);
  
  try {
    // Check if there's a last active graph
    await fs.access(lastActivePath);
    
    // Load built-in nodes first
    await loadBuiltinNodes();
    
    // Load unified nodes (single-source-of-truth definitions)
    await loadUnifiedNodes();
    
    // Load the graph
    const success = await engine.loadGraph(lastActivePath);
    
    if (success) {
      engine.start();
      console.log('[Engine] Auto-started with last active graph');
    }
  } catch (error) {
    // No last active graph - that's fine
    if (error.code !== 'ENOENT') {
      console.error(`[Engine] Auto-start error: ${error.message}`);
    }
  }
}

// Export engine and registry
module.exports = {
  engine,
  registry,
  loadBuiltinNodes,
  loadUnifiedNodes,
  autoStart,
  
  // Convenience methods
  start: () => engine.start(),
  stop: () => engine.stop(),
  loadGraph: (path) => engine.loadGraph(path),
  getStatus: () => engine.getStatus()
};
