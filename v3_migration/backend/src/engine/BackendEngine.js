/**
 * BackendEngine.js
 * 
 * Server-side dataflow engine that executes node graphs without a browser.
 * This enables automations to run 24/7 on the backend.
 */

const fs = require('fs').promises;
const path = require('path');
const registry = require('./BackendNodeRegistry');
const engineLogger = require('./engineLogger');

class BackendEngine {
  constructor() {
    this.nodes = new Map();           // nodeId → node instance
    this.connections = [];            // [{source, sourceOutput, target, targetInput}]
    this.outputs = new Map();         // nodeId → {outputName: value}
    this.running = false;
    this.tickInterval = null;
    this.tickRate = 100;              // ms between ticks (10 Hz)
    this.lastTickTime = null;
    this.tickCount = 0;
    this.graphPath = null;
    this.debug = process.env.ENGINE_DEBUG === 'true' || process.env.VERBOSE_LOGGING === 'true';
  }

  /**
   * Load a graph from a JSON file
   * @param {string} graphPath - Path to the graph JSON file
   */
  async loadGraph(graphPath) {
    try {
      console.log(`[BackendEngine] Attempting to load: ${graphPath}`);
      const graphJson = await fs.readFile(graphPath, 'utf8');
      const graph = JSON.parse(graphJson);
      this.graphPath = graphPath;
      
      await this.loadGraphData(graph);
      
      console.log(`[BackendEngine] Loaded graph from ${graphPath}`);
      console.log(`[BackendEngine] Nodes: ${this.nodes.size}, Connections: ${this.connections.length}`);
      
      return true;
    } catch (error) {
      console.error(`[BackendEngine] Failed to load graph: ${error.message}`);
      console.error(`[BackendEngine] Stack: ${error.stack}`);
      return false;
    }
  }

  /**
   * Load graph from parsed JSON data
   * @param {object} graph - Parsed graph object
   */
  async loadGraphData(graph) {
    // Clear existing state
    this.nodes.clear();
    this.connections = [];
    this.outputs.clear();

    // Handle both old format (direct nodes array) and new format (nested structure)
    const nodesData = graph.nodes || [];
    const connectionsData = graph.connections || [];

    // Instantiate nodes from registry
    for (const nodeData of nodesData) {
      // Try multiple ways to find the node type
      let nodeType = nodeData.name || nodeData.type;
      let NodeClass = nodeType ? registry.get(nodeType) : null;
      
      // Fallback: try to find by label (display name)
      if (!NodeClass && nodeData.label) {
        const byLabel = registry.getByLabel(nodeData.label);
        if (byLabel) {
          if (byLabel.skipReason) {
            // Node explicitly marked as UI-only, skip silently
            if (this.debug) {
              console.log(`[BackendEngine] Skipping UI-only node: ${nodeData.label}`);
            }
            continue;
          }
          nodeType = byLabel.name;
          NodeClass = byLabel.NodeClass;
          if (this.debug) {
            console.log(`[BackendEngine] Resolved "${nodeData.label}" → ${nodeType}`);
          }
        }
      }
      
      if (NodeClass) {
        try {
          const node = new NodeClass();
          node.id = nodeData.id;
          node.label = nodeData.label || nodeType;
          
          // Restore saved properties - check multiple locations
          const props = nodeData.data?.properties || nodeData.properties || nodeData.data;
          if (props && typeof node.restore === 'function') {
            node.restore({ properties: props });
          } else if (props) {
            node.properties = { ...node.properties, ...props };
          }
          
          this.nodes.set(nodeData.id, node);
          
          if (this.debug) {
            console.log(`[BackendEngine] Instantiated node: ${nodeType} (${nodeData.id})`);
          }
        } catch (error) {
          console.error(`[BackendEngine] Failed to instantiate ${nodeType}: ${error.message}`);
        }
      } else {
        // Only warn, don't fail - frontend nodes like Debug won't run on backend
        console.log(`[BackendEngine] Skipping unregistered node type: ${nodeData.label || nodeType || 'unknown'}`);
      }
    }

    // Store connections
    this.connections = connectionsData.map(conn => ({
      source: conn.source,
      sourceOutput: conn.sourceOutput,
      target: conn.target,
      targetInput: conn.targetInput
    }));
  }

  /**
   * Gather inputs for a node from connected outputs
   * @param {string} nodeId - Target node ID
   * @returns {object} - Inputs object keyed by input name
   */
  gatherInputs(nodeId) {
    const inputs = {};
    
    for (const conn of this.connections) {
      if (conn.target === nodeId) {
        const sourceOutputs = this.outputs.get(conn.source) || {};
        const value = sourceOutputs[conn.sourceOutput];
        
        // Accumulate values for inputs (some inputs accept multiple connections)
        if (!inputs[conn.targetInput]) {
          inputs[conn.targetInput] = [];
        }
        inputs[conn.targetInput].push(value);
      }
    }
    
    return inputs;
  }

  /**
   * Perform topological sort for execution order
   * Sender nodes are prioritized to run first so buffers are populated
   * before Receiver nodes read them.
   * @returns {string[]} - Node IDs in execution order
   */
  topologicalSort() {
    const visited = new Set();
    const result = [];
    const nodeIds = Array.from(this.nodes.keys());

    // Build adjacency list (reverse - from outputs to inputs)
    const dependsOn = new Map();
    for (const nodeId of nodeIds) {
      dependsOn.set(nodeId, new Set());
    }
    
    for (const conn of this.connections) {
      if (dependsOn.has(conn.target)) {
        dependsOn.get(conn.target).add(conn.source);
      }
    }

    // Kahn's algorithm
    const visit = (nodeId) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      
      const deps = dependsOn.get(nodeId) || new Set();
      for (const dep of deps) {
        visit(dep);
      }
      
      result.push(nodeId);
    };

    for (const nodeId of nodeIds) {
      visit(nodeId);
    }

    // Post-process: Move Sender nodes to the front, Receiver nodes toward end
    // This ensures buffers are populated before they're read
    const senders = [];
    const receivers = [];
    const others = [];
    
    for (const nodeId of result) {
      const node = this.nodes.get(nodeId);
      if (!node) {
        others.push(nodeId);
        continue;
      }
      const nodeType = node.type || node.constructor?.name || '';
      if (nodeType === 'SenderNode' || nodeType.includes('Sender')) {
        senders.push(nodeId);
      } else if (nodeType === 'ReceiverNode' || nodeType.includes('Receiver')) {
        receivers.push(nodeId);
      } else {
        others.push(nodeId);
      }
    }
    
    // Order: Senders first, then other nodes (in topo order), then Receivers last
    return [...senders, ...others, ...receivers];
  }

  /**
   * Execute one tick of the engine
   * @param {boolean} force - If true, run even if engine is stopped (for testing)
   */
  async tick(force = false) {
    if (!this.running && !force) return;
    
    this.lastTickTime = Date.now();
    this.tickCount++;

    try {
      // Get execution order
      const sortedNodeIds = this.topologicalSort();
      
      // Execute each node
      for (const nodeId of sortedNodeIds) {
        const node = this.nodes.get(nodeId);
        if (!node) continue;
        
        // Gather inputs from connected nodes
        const inputs = this.gatherInputs(nodeId);
        
        // Execute node's data() or process() method if it exists
        const execMethod = typeof node.data === 'function' ? 'data' 
                         : typeof node.process === 'function' ? 'process' 
                         : null;
        
        if (execMethod) {
          try {
            const outputs = await node[execMethod](inputs);
            if (this.debug) {
              console.log(`[BackendEngine] Node ${nodeId} ${execMethod}() returned:`, outputs);
            }
            if (outputs) {
              this.outputs.set(nodeId, outputs);
            }
          } catch (error) {
            if (this.debug) {
              console.error(`[BackendEngine] Error in node ${nodeId}: ${error.message}`);
            }
          }
        }
      }
    } catch (error) {
      console.error(`[BackendEngine] Tick error: ${error.message}`);
    }
  }

  /**
   * Start the engine
   */
  start() {
    if (this.running) {
      console.log('[BackendEngine] Already running');
      return;
    }

    if (this.nodes.size === 0) {
      console.warn('[BackendEngine] No nodes loaded, cannot start');
      return;
    }

    this.running = true;
    this.tickCount = 0;
    
    // Log all nodes being executed
    engineLogger.logEngineEvent('START', { nodeCount: this.nodes.size, connections: this.connections.length });
    
    const nodeList = [];
    for (const [nodeId, node] of this.nodes) {
      const nodeType = node.constructor?.name || node.type || 'Unknown';
      const label = node.label || node.properties?.customTitle || 'no label';
      nodeList.push({ id: nodeId, type: nodeType, label });
      engineLogger.log('NODE-INIT', `${nodeType}`, { id: nodeId, label, properties: node.properties });
    }
    
    // Log connections
    for (const conn of this.connections) {
      engineLogger.log('CONNECTION', `${conn.source}.${conn.sourceOutput} → ${conn.target}.${conn.targetInput}`);
    }
    
    // Log execution order
    const executionOrder = this.topologicalSort();
    engineLogger.log('EXEC-ORDER', 'Node execution order:', executionOrder.map((id, i) => {
      const node = this.nodes.get(id);
      const type = node?.type || node?.constructor?.name || '?';
      return `${i + 1}. ${type} (${id})`;
    }));
    
    // Call tick immediately, then on interval
    this.tick();
    this.tickInterval = setInterval(() => this.tick(), this.tickRate);
    
    engineLogger.logEngineEvent('RUNNING', { tickRate: this.tickRate });
  }

  /**
   * Stop the engine
   */
  stop() {
    if (!this.running) {
      console.log('[BackendEngine] Not running');
      return;
    }

    this.running = false;
    
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    
    engineLogger.logEngineEvent('STOP', { tickCount: this.tickCount });
    console.log(`[BackendEngine] Stopped after ${this.tickCount} ticks`);
  }

  /**
   * Hot-reload graph without stopping
   * @param {object} graphData - New graph data
   */
  async hotReload(graphData) {
    const wasRunning = this.running;
    
    if (wasRunning) {
      this.stop();
    }
    
    await this.loadGraphData(graphData);
    
    // Only restart if there are nodes to process
    if (wasRunning && this.nodes.size > 0) {
      this.start();
      console.log('[BackendEngine] Hot-reloaded graph and restarted');
    } else if (wasRunning) {
      console.log('[BackendEngine] Hot-reload: graph is empty, staying stopped');
    } else {
      console.log('[BackendEngine] Hot-reloaded graph (engine was not running)');
    }
  }

  /**
   * Get engine status
   * @returns {object}
   */
  getStatus() {
    return {
      running: this.running,
      nodeCount: this.nodes.size,
      connectionCount: this.connections.length,
      tickCount: this.tickCount,
      tickRate: this.tickRate,
      lastTickTime: this.lastTickTime,
      graphPath: this.graphPath,
      registeredNodeTypes: registry.list()
    };
  }
}

module.exports = new BackendEngine();
