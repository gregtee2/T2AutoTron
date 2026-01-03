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
const { AutoTronBuffer } = require('./nodes/BufferNodes');

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
    this.startedAt = null;              // Timestamp when engine started
    this.debug = process.env.ENGINE_DEBUG === 'true' || process.env.VERBOSE_LOGGING === 'true';
    
    // Frontend priority: when frontend is active, engine skips device commands
    // This prevents the engine and UI from fighting over device control
    this.frontendActive = false;
    this.frontendLastSeen = null;
    
    // Scheduled events registry - nodes register their upcoming events here
    // This enables UpcomingEventsNode to work in headless mode
    this.scheduledEventsRegistry = new Map();  // nodeId → [{time, action, deviceName}]
  }

  /**
   * Register scheduled events for a node
   * @param {string} nodeId - The node ID
   * @param {Array} events - Array of {time: Date, action: string, deviceName: string}
   */
  registerScheduledEvents(nodeId, events) {
    if (!events || events.length === 0) {
      this.scheduledEventsRegistry.delete(nodeId);
    } else {
      this.scheduledEventsRegistry.set(nodeId, events.map(e => ({ ...e, nodeId })));
    }
  }

  /**
   * Get all upcoming events from all nodes, sorted by time
   * @returns {Array} - Array of upcoming events
   */
  getUpcomingEvents() {
    const now = Date.now();
    const allEvents = [];
    
    for (const [nodeId, events] of this.scheduledEventsRegistry) {
      if (Array.isArray(events)) {
        allEvents.push(...events);
      }
    }
    
    // Sort by time (soonest first) and filter out past events
    return allEvents
      .filter(e => e.time && new Date(e.time).getTime() > now)
      .sort((a, b) => new Date(a.time) - new Date(b.time))
      .slice(0, 50);  // Limit to 50 events
  }

  /**
   * Set frontend active status (called when editor connects/disconnects)
   * @param {boolean} active - Whether frontend editor is active
   */
  setFrontendActive(active) {
    const wasActive = this.frontendActive;
    this.frontendActive = active;
    this.frontendLastSeen = active ? Date.now() : this.frontendLastSeen;
    
    if (wasActive !== active) {
      const status = active ? 'PAUSING device commands (frontend active)' : 'RESUMING device commands (frontend disconnected)';
      console.log(`[BackendEngine] ${status}`);
      engineLogger.logEngineEvent(active ? 'FRONTEND-ACTIVE' : 'FRONTEND-INACTIVE', { 
        wasActive, 
        isActive: active,
        frontendLastSeen: this.frontendLastSeen 
      });
    }
  }

  /**
   * Check if device commands should be skipped (frontend is controlling)
   * 
   * UPDATE 2026-01-02: DISABLED frontend skip logic entirely.
   * Problem: When Chrome wakes from sleep, it sends heartbeats but the Rete.js
   * graph engine isn't actually running. The backend waits for a frontend that
   * isn't doing anything, so lights don't get controlled.
   * 
   * Solution: Backend always controls devices. The frontend graph engine is
   * just for visualization/editing, not for 24/7 automation.
   * 
   * @returns {boolean} Always returns false (never skip)
   */
  shouldSkipDeviceCommands() {
    // DISABLED 2026-01-02: Always let backend control devices
    // Problem: Chrome wakes from sleep, sends heartbeats, but Rete.js engine
    // isn't running. Backend waits for frontend that isn't doing anything.
    // Solution: Backend always controls devices - it's the source of truth.
    return false;
  }

  /**
   * Update frontend last seen timestamp (called from heartbeat)
   */
  frontendHeartbeat() {
    if (this.frontendActive) {
      this.frontendLastSeen = Date.now();
    }
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

    // IMPORTANT: clear shared buffers on graph load.
    // Otherwise, stale values from a previous run can persist and re-trigger devices.
    try {
      AutoTronBuffer.clear();
      if (this.debug) {
        console.log('[BackendEngine] Cleared AutoTronBuffer on graph load');
      }
    } catch (e) {
      console.warn('[BackendEngine] Failed to clear AutoTronBuffer on graph load:', e?.message || e);
    }

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
        // Track skipped nodes for summary instead of individual logs
        if (!this._skippedNodeTypes) this._skippedNodeTypes = new Set();
        this._skippedNodeTypes.add(nodeData.label || nodeType || 'unknown');
      }
    }

    // Log summary of skipped node types (if any)
    if (this._skippedNodeTypes && this._skippedNodeTypes.size > 0) {
      console.log(`[BackendEngine] Skipped ${this._skippedNodeTypes.size} unregistered node types: ${Array.from(this._skippedNodeTypes).join(', ')}`);
      this._skippedNodeTypes.clear();
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
   * @returns {object} - Inputs object keyed by input name, values are arrays
   */
  gatherInputs(nodeId) {
    const inputs = {};
    
    for (const conn of this.connections) {
      if (conn.target === nodeId) {
        const sourceOutputs = this.outputs.get(conn.source) || {};
        const value = sourceOutputs[conn.sourceOutput];
        
        // Always use arrays for consistency
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
   * Adds virtual dependencies for buffer connections (Sender → Receiver)
   * so that buffers are populated before they're read.
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
    
    // Add wire connection dependencies
    for (const conn of this.connections) {
      if (dependsOn.has(conn.target)) {
        dependsOn.get(conn.target).add(conn.source);
      }
    }

    // Add virtual buffer dependencies:
    // - All Receivers depend on ALL Senders (ensures buffers are populated first)
    // - This is simpler than matching by buffer name and works for all cases
    const senderIds = [];
    const receiverIds = [];
    
    for (const nodeId of nodeIds) {
      const node = this.nodes.get(nodeId);
      if (!node) continue;
      const nodeType = node.type || node.constructor?.name || '';
      if (nodeType === 'SenderNode' || nodeType.includes('Sender')) {
        senderIds.push(nodeId);
      } else if (nodeType === 'ReceiverNode' || nodeType.includes('Receiver')) {
        receiverIds.push(nodeId);
      }
    }
    
    // Make every Receiver depend on every Sender (virtual edge)
    for (const receiverId of receiverIds) {
      const deps = dependsOn.get(receiverId);
      if (deps) {
        for (const senderId of senderIds) {
          deps.add(senderId);
        }
      }
    }

    // Kahn's algorithm (DFS-based)
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

    return result;
  }

  /**
   * Execute one tick of the engine
   * @param {boolean} force - If true, run even if engine is stopped (for testing)
   */
  async tick(force = false) {
    if (!this.running && !force) return;
    
    this.lastTickTime = Date.now();
    this.tickCount++;

    // Periodic health log every 10 minutes (6000 ticks at 100ms)
    if (this.tickCount % 6000 === 0) {
      const uptimeMinutes = Math.floor((Date.now() - this.startedAt) / 60000);
      console.log(`[BackendEngine] Health check: uptime=${uptimeMinutes}min, ticks=${this.tickCount}, nodes=${this.nodes.size}`);
      engineLogger.logEngineEvent('HEALTH', { 
        uptimeMinutes, 
        tickCount: this.tickCount, 
        nodeCount: this.nodes.size,
        frontendActive: this.frontendActive 
      });
    }

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
   * Reconcile device states with Home Assistant before starting.
   * This queries HA for actual device states and pre-populates node state
   * to prevent unnecessary commands at startup.
   */
  async reconcileDeviceStates() {
    try {
      // Import bulkStateCache from HADeviceNodes (lazy to avoid circular dep)
      const { bulkStateCache } = require('./nodes/HADeviceNodes');
      
      // Refresh cache to get current HA states
      console.log('[BackendEngine] Reconciling device states with Home Assistant...');
      await bulkStateCache.refreshCache();
      
      const stateCache = bulkStateCache.states;
      if (!stateCache || stateCache.size === 0) {
        console.warn('[BackendEngine] No HA states available for reconciliation');
        return { success: false, reason: 'no_states' };
      }
      
      let reconciledNodes = 0;
      let totalDevices = 0;
      
      // Find all HAGenericDeviceNode instances and reconcile them
      for (const [nodeId, node] of this.nodes) {
        // Check if this node has a reconcile method (HAGenericDeviceNode)
        if (typeof node.reconcile === 'function') {
          const result = node.reconcile(stateCache);
          if (result && result.success) {
            reconciledNodes++;
            totalDevices += (result.onCount || 0) + (result.offCount || 0);
          }
        }
      }
      
      engineLogger.logEngineEvent('RECONCILE-COMPLETE', { 
        reconciledNodes, 
        totalDevices,
        haEntityCount: stateCache.size 
      });
      
      console.log(`[BackendEngine] ✅ Reconciliation complete: ${reconciledNodes} device nodes, ${totalDevices} devices synced with HA`);
      
      return { success: true, reconciledNodes, totalDevices };
    } catch (error) {
      console.error(`[BackendEngine] Reconciliation failed: ${error.message}`);
      // Continue anyway - warmup period will handle it the old way
      return { success: false, error: error.message };
    }
  }

  /**
   * Start the engine
   */
  async start() {
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
    this.startedAt = Date.now();
    
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
    
    // *** Reconcile device states with HA before first tick ***
    // This prevents unnecessary OFF commands at startup
    await this.reconcileDeviceStates();
    
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
      await this.start();
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
      startedAt: this.startedAt,
      uptime: this.startedAt ? Date.now() - this.startedAt : 0,
      registeredNodeTypes: registry.list(),
      frontendActive: this.frontendActive,
      frontendLastSeen: this.frontendLastSeen
    };
  }
}

module.exports = new BackendEngine();
