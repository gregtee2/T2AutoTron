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

// Load built-in backend nodes
async function loadBuiltinNodes() {
  const nodesDir = path.join(__dirname, 'nodes');
  
  try {
    const files = await fs.readdir(nodesDir);
    const jsFiles = files.filter(f => f.endsWith('.js'));
    
    for (const file of jsFiles) {
      try {
        require(path.join(nodesDir, file));
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

// Auto-load last active graph on startup
async function autoStart() {
  const savedGraphsDir = path.join(__dirname, '..', '..', '..', 'Saved_Graphs');
  const lastActivePath = path.join(savedGraphsDir, '.last_active.json');
  
  try {
    // Check if there's a last active graph
    await fs.access(lastActivePath);
    
    // Load built-in nodes first
    await loadBuiltinNodes();
    
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
  autoStart,
  
  // Convenience methods
  start: () => engine.start(),
  stop: () => engine.stop(),
  loadGraph: (path) => engine.loadGraph(path),
  getStatus: () => engine.getStatus()
};
