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
const dependencyOrder = require('./dependencyOrder');

const VERBOSE = process.env.VERBOSE_LOGGING === 'true';

class BackendEngine {
  constructor() {
    this.nodes = new Map();           // nodeId → node instance
    this.connections = [];            // [{source, sourceOutput, target, targetInput}]
    this.outputs = new Map();         // nodeId → {outputName: value}
    this.running = false;
    this.tickInterval = null;
    this.tickRate = 100;              // ms between ticks (10 Hz)
    this.lastTickTime = null;
    this.lastTickCompletedTime = null;
    this.lastTickDurationMs = null;
    this.lastTickError = null;
    this.tickCount = 0;
    this.tickPromise = null;
    this.graphGeneration = 0;
    this.lifecycleGeneration = 0;      // Stop invalidates pending starts AND in-flight ticks
    this.lifecycleQueue = Promise.resolve();
    this.startPromise = null;
    this.loading = false;
    this.lastReconciliation = null;
    this.graphPath = null;
    this.startedAt = null;              // Timestamp when engine started
    this.debug = process.env.ENGINE_DEBUG === 'true' || process.env.VERBOSE_LOGGING === 'true';
    
    // Frontend priority: when frontend is active, engine skips device commands
    // This prevents the engine and UI from fighting over device control
    this.frontendActive = false;
    this.frontendLastSeen = null;
    this.frontendHandoffPromise = null;
    
    // Scheduled events registry - nodes register their upcoming events here
    // This enables UpcomingEventsNode to work in headless mode
    this.scheduledEventsRegistry = new Map();  // nodeId → [{time, action, deviceName}]
    this.loadDiagnostics = { skippedNodeTypes: [], skippedConnections: [] };
    this.nodeErrors = new Map();
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
      
      // When frontend goes inactive, sync backend node states from HA reality
      // This prevents backend from "correcting" things that frontend intentionally set
      if (wasActive && !active) {
        const handoffPromise = this.onFrontendInactive().catch(error => {
          console.error('[BackendEngine] Frontend handoff failed:', error.message);
        });
        const trackedHandoff = handoffPromise.finally(() => {
          if (this.frontendHandoffPromise === trackedHandoff) {
            this.frontendHandoffPromise = null;
          }
        });
        this.frontendHandoffPromise = trackedHandoff;
      }
    }
  }

  /**
   * Called when frontend goes inactive (browser closes/sleeps)
   * Reloads the latest graph and syncs states from HA reality
   */
  async onFrontendInactive() {
    console.log(`[BackendEngine] Frontend went inactive - loading latest graph and syncing states...`);
    
    try {
      // First, reload the latest graph from disk (frontend may have made changes)
      const path = require('path');
      const fs = require('fs');
      const savedGraphsDir = process.env.GRAPH_SAVE_PATH || path.join(__dirname, '../../..', 'Saved_Graphs');
      const lastActivePath = path.join(savedGraphsDir, '.last_active.json');
      
      if (fs.existsSync(lastActivePath)) {
        const graphJson = JSON.parse(fs.readFileSync(lastActivePath, 'utf-8'));
        if (graphJson && Array.isArray(graphJson.nodes)) {
          await this.hotReload(graphJson);
          if (VERBOSE) console.log(`[BackendEngine] Reloaded graph (${graphJson.nodes.length} nodes, ${graphJson.connections?.length || 0} connections)`);
        }
      }
      
      // Then sync device states from HA reality
      await this.syncDeviceStatesFromHA();
      
      // Force all device nodes to resend their current HSV on next tick
      // This ensures colors sync immediately after handoff instead of waiting for "significant change"
      this.forceHsvResync();
      
    } catch (err) {
      console.error(`[BackendEngine] Failed to handle frontend inactive:`, err.message);
    }
  }

  /**
   * Force all HAGenericDeviceNode instances to resend their current HSV on next tick.
   * Called during frontend→backend handoff to immediately sync colors.
   * 
   * The problem: Timeline colors advance continuously. When frontend hands off to backend,
   * the device still has the old color from 30+ seconds ago. Backend waits for "significant
   * change" before sending, creating a gap where device color doesn't match timeline.
   * 
   * The fix: Clear lastSentHsv on all device nodes, forcing immediate send on next tick.
   */
  forceHsvResync() {
    let resetCount = 0;
    for (const node of this.nodes.values()) {
      if (node.type === 'HAGenericDeviceNode') {
        // Clear throttling state - this forces the node to send its current HSV immediately
        node.lastSentHsv = null;
        node.lastSendTime = 0;
        resetCount++;
      }
    }
    if (resetCount > 0) {
      if (VERBOSE) console.log(`[BackendEngine] Force HSV resync: cleared throttle state on ${resetCount} device nodes`);
      engineLogger.logEngineEvent('HSV-RESYNC', { nodeCount: resetCount, reason: 'frontend-handoff' });
    }
  }

  /**
   * Sync all device node lastTrigger states to match current HA reality.
   * Called when frontend goes inactive so backend doesn't fight with frontend's changes.
   */
  async syncDeviceStatesFromHA() {
    if (VERBOSE) console.log(`[BackendEngine] Syncing device states from HA...`);
    
    try {
      // Get current HA states
      const haManager = require('../devices/managers/homeAssistantManager');
      // Note: States are kept fresh via WebSocket push - no need to force refresh
      
      let syncCount = 0;
      for (const node of this.nodes.values()) {
        // Only sync HAGenericDeviceNode types
        if (node.type === 'HAGenericDeviceNode' && Array.isArray(node.properties?.selectedDeviceIds)) {
          for (const deviceId of node.properties.selectedDeviceIds) {
            const entityId = typeof deviceId === 'string' ? deviceId.replace(/^ha_/, '') : null;
            if (!entityId) continue;

            // Use getState() which fetches fresh if not in cache. The manager
            // returns an envelope, while a few test/adaptor implementations
            // may return the state object directly.
            const result = await haManager.getState(entityId);
            const haState = result?.state && typeof result.state === 'object' ? result.state : result;
            if (!haState || typeof haState !== 'object' || haState.state === undefined) continue;

            const isOn = haState.state === 'on' || haState.state === 'open' ||
              haState.state === 'playing' || haState.on === true;
            node.deviceStates = node.deviceStates || {};
            node.deviceStates[entityId] = isOn;
            node.deviceStates[`ha_${entityId}`] = isOn;
            syncCount++;
          }
        }
      }
      
      if (VERBOSE) console.log(`[BackendEngine] Synced ${syncCount} device states from HA`);
    } catch (err) {
      console.error(`[BackendEngine] Failed to sync from HA:`, err.message);
    }
  }

  /**
   * Check if device commands should be skipped (frontend is controlling)
   * 
   * When frontend is active, it controls devices directly via Rete.js engine.
   * Backend only takes over when frontend goes inactive (browser closed/sleeping).
   * This prevents both from fighting over device control.
   * 
   * @returns {boolean} True if backend should skip commands (frontend is active)
   */
  shouldSkipDeviceCommands() {
    if (this.loading || this.frontendHandoffPromise) {
      return true;
    }

    // If frontend is active and was seen recently (within 30 seconds), skip backend commands
    // Frontend controls devices directly; backend is the fallback
    if (this.frontendActive) {
      const timeSinceHeartbeat = Date.now() - (this.frontendLastSeen || 0);
      if (timeSinceHeartbeat < 30000) {
        // Frontend is active and responsive - let it control devices
        return true;
      }
      // Frontend claims active but no heartbeat in 30s - it might be sleeping
      console.log(`[BackendEngine] Frontend claims active but no heartbeat in ${Math.round(timeSinceHeartbeat/1000)}s - backend taking over`);
      this.setFrontendActive(false);
      return true;
    }
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
      // Queue the read as well, so a following Start cannot activate the old
      // graph while this requested file is still being read. Do not nest the
      // queued loadGraphData() call inside this lifecycle operation.
      return await this._queueLifecycle(async () => {
        if (VERBOSE) console.log(`[BackendEngine] Attempting to load: ${graphPath}`);
        const graphJson = await fs.readFile(graphPath, 'utf8');
        const prepared = this._prepareGraph(JSON.parse(graphJson));
        await this._replaceGraph(prepared);
        this.graphPath = graphPath;

        if (VERBOSE) console.log(`[BackendEngine] Loaded graph from ${graphPath}`);
        if (VERBOSE) console.log(`[BackendEngine] Nodes: ${this.nodes.size}, Connections: ${this.connections.length}`);
        return true;
      });
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
    const prepared = this._prepareGraph(graph);
    return this._queueLifecycle(() => this._replaceGraph(prepared));
  }

  // Only lifecycle operations wait on this queue. A tick must NEVER wait on
  // it or on frontendHandoffPromise: data() can initiate handoff via the
  // synchronous shouldSkipDeviceCommands() guard, which queues hotReload.
  _queueLifecycle(operation) {
    const result = this.lifecycleQueue.then(operation);
    this.lifecycleQueue = result.catch(() => {});
    return result;
  }

  /** Validate topology without constructing nodes or touching the live graph. */
  _prepareGraph(graph) {
    if (!graph || typeof graph !== 'object' || !Array.isArray(graph.nodes) ||
        (graph.connections !== undefined && !Array.isArray(graph.connections))) {
      throw new Error('Invalid graph: nodes array is required and connections must be an array when present');
    }

    const sourceNodeIds = new Set();
    for (const nodeData of graph.nodes) {
      if (!nodeData || typeof nodeData !== 'object' || !nodeData.id) {
        throw new Error('Invalid graph: every node must have an id');
      }
      if (sourceNodeIds.has(nodeData.id)) {
        throw new Error(`Invalid graph: duplicate node id "${nodeData.id}"`);
      }
      sourceNodeIds.add(nodeData.id);
    }

    const connectionsData = graph.connections || [];
    for (const connection of connectionsData) {
      if (!connection || !sourceNodeIds.has(connection.source) || !sourceNodeIds.has(connection.target)) {
        throw new Error('Invalid graph: every connection must reference existing nodes');
      }
    }

    const descriptors = new Map();
    const skippedNodeTypes = new Set();
    for (const nodeData of graph.nodes) {
      let nodeType = nodeData.name || nodeData.type;
      let NodeClass = nodeType ? registry.get(nodeType) : null;

      if (!NodeClass && nodeData.label) {
        const byLabel = registry.getByLabel(nodeData.label);
        if (byLabel) {
          if (byLabel.skipReason) {
            // Only the registry may explicitly designate UI-only nodes.
            skippedNodeTypes.add(nodeData.label || nodeType || 'unknown');
            continue;
          }
          nodeType = byLabel.name;
          NodeClass = byLabel.NodeClass;
        }
      }
      if (typeof NodeClass !== 'function') {
        throw new Error(`Unregistered executable node type: ${nodeType || nodeData.label || 'unknown'} (${nodeData.id})`);
      }
      descriptors.set(nodeData.id, {
        NodeClass,
        type: NodeClass.type || nodeType,
        label: nodeData.label || nodeType,
        // Snapshot callers' descriptors before waiting on the lifecycle queue.
        properties: structuredClone(nodeData.data?.properties || nodeData.properties || nodeData.data || {})
      });
    }

    const skippedConnections = [];
    const connections = connectionsData
      .filter(conn => {
        const keep = descriptors.has(conn.source) && descriptors.has(conn.target);
        if (!keep) skippedConnections.push({ source: conn.source, target: conn.target });
        return keep;
      })
      .map(conn => ({
        source: conn.source,
        sourceOutput: conn.sourceOutput,
        target: conn.target,
        targetInput: conn.targetInput
      }));
    dependencyOrder(descriptors, connections);
    return {
      descriptors,
      connections,
      diagnostics: { skippedNodeTypes: Array.from(skippedNodeTypes), skippedConnections }
    };
  }

  async _disposeNodes(nodes) {
    for (const node of nodes) {
      const cleanup = typeof node.destroy === 'function' ? node.destroy : node.dispose;
      if (typeof cleanup !== 'function') continue;
      try {
        await cleanup.call(node);
      } catch (error) {
        console.warn(`[BackendEngine] Node cleanup failed: ${error.message}`);
      }
    }
  }

  /** Called only under the lifecycle queue; no ticks may enter during awaits. */
  async _replaceGraph(prepared, reconcile = false) {
    this.loading = true;
    const generation = this.lifecycleGeneration;
    try {
      // Wait for the actual data() promise, not a timeout/Promise.race. Stop
      // cannot cancel side effects inside a node that ignores cancellation.
      if (this.tickPromise) await this.tickPromise;

      const candidates = new Map();
      try {
        for (const [id, descriptor] of prepared.descriptors) {
          const node = new descriptor.NodeClass();
          candidates.set(id, node); // Include a node whose restore() throws.
          node.id = id;
          node.label = descriptor.label;
          if (typeof node.restore === 'function') {
            await node.restore({ properties: descriptor.properties });
          } else {
            node.properties = { ...node.properties, ...descriptor.properties };
          }
        }
        // Also validate restored defaults/normalization before disposing old nodes.
        dependencyOrder(candidates, prepared.connections);
      } catch (error) {
        await this._disposeNodes(Array.from(candidates.values()).reverse());
        throw error;
      }

      // Staging protects the old graph on restore failure, but is not a sandbox:
      // constructors/restores may start private timers or mutate shared state.
      // A throwing constructor never exposes its instance for cleanup. Full
      // rollback of those side effects requires a node-level activation contract.
      await this._disposeNodes(this.nodes.values());
      this.graphGeneration++;
      this.scheduledEventsRegistry.clear();
      AutoTronBuffer.clear();
      this.nodes = candidates;
      this.connections = prepared.connections;
      this.outputs.clear();
      this.nodeErrors.clear();
      this.loadDiagnostics = prepared.diagnostics;

      // Hot reload retains the one existing interval, paused by `loading`.
      // A concurrent Stop stays authoritative; no restart can undo it.
      if (reconcile && this.running && generation === this.lifecycleGeneration) {
        if (this.nodes.size === 0) {
          this.stop();
        } else {
          this.lastReconciliation = await this.reconcileDeviceStates();
        }
      }
    } finally {
      this.loading = false;
    }
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
    return dependencyOrder(this.nodes, this.connections).order;
  }

  /**
   * Execute one tick of the engine
   * @param {boolean} force - If true, run even if engine is stopped (for testing)
   */
  async tick(force = false) {
    // Skip, don't wait: a queued replacement may itself be draining this tick.
    if (this.loading) return;
    if (this.tickPromise) return this.tickPromise;

    const generation = this.lifecycleGeneration;
    const tickPromise = Promise.resolve().then(() => this._runTick(force, generation));
    this.tickPromise = tickPromise;

    try {
      return await tickPromise;
    } finally {
      if (this.tickPromise === tickPromise) {
        this.tickPromise = null;
      }
    }
  }

  async _runTick(force = false, generation = this.lifecycleGeneration) {
    if (this.loading || generation !== this.lifecycleGeneration || (!this.running && !force)) return;

    const tickGeneration = this.graphGeneration;
    const tickStartedAt = Date.now();
    // Force permits a stopped single-step, but a NEW Stop still cancels it at
    // node boundaries, even if another Start has already been requested.
    const isCurrent = () => !this.loading && generation === this.lifecycleGeneration &&
      tickGeneration === this.graphGeneration && (this.running || force);
    
    this.lastTickTime = Date.now();
    this.tickCount++;

    // Periodic health log every 10 minutes (6000 ticks at 100ms)
    if (this.tickCount % 6000 === 0) {
      const uptimeMinutes = Math.floor((Date.now() - this.startedAt) / 60000);
      if (VERBOSE) console.log(`[BackendEngine] Health check: uptime=${uptimeMinutes}min, ticks=${this.tickCount}, nodes=${this.nodes.size}`);
      engineLogger.logEngineEvent('HEALTH', { 
        uptimeMinutes, 
        tickCount: this.tickCount, 
        nodeCount: this.nodes.size,
        frontendActive: this.frontendActive 
      });
    }

    try {
      // Get execution order
      const { order: sortedNodeIds, dependencies } = dependencyOrder(this.nodes, this.connections);
      const failed = new Set();
      
      // Execute each node
      for (const nodeId of sortedNodeIds) {
        if (!isCurrent()) return;

        const blockedBy = Array.from(dependencies.get(nodeId)).filter(id => failed.has(id));
        if (blockedBy.length) {
          failed.add(nodeId);
          this.outputs.delete(nodeId);
          this.nodeErrors.set(nodeId, {
            ...this.nodeErrors.get(nodeId),
            message: `Skipped because upstream failed: ${blockedBy.join(', ')}`,
            blockedBy,
            lastAt: Date.now()
          });
          continue;
        }

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
            if (!isCurrent()) return;
            if (this.debug) {
              console.log(`[BackendEngine] Node ${nodeId} ${execMethod}() returned:`, outputs);
            }
            if (outputs && this.nodes.get(nodeId) === node) {
              this.outputs.set(nodeId, outputs);
            }
            this.nodeErrors.delete(nodeId);
          } catch (error) {
            if (!isCurrent()) return;
            failed.add(nodeId);
            this.outputs.delete(nodeId);
            const previous = this.nodeErrors.get(nodeId);
            const now = Date.now();
            const nodeError = {
              message: error.message,
              lastAt: now,
              count: (previous?.count || 0) + 1,
              lastLoggedAt: previous?.lastLoggedAt
            };
            this.nodeErrors.set(nodeId, nodeError);
            if (nodeError.lastLoggedAt == null || now - nodeError.lastLoggedAt >= 60000) {
              nodeError.lastLoggedAt = now;
              console.error(`[BackendEngine] Error in node ${nodeId}: ${error.message}`);
            }
          }
        }
      }
      this.lastTickCompletedTime = Date.now();
      this.lastTickDurationMs = this.lastTickCompletedTime - tickStartedAt;
      this.lastTickError = null;
    } catch (error) {
      console.error(`[BackendEngine] Tick error: ${error.message}`);
      this.lastTickError = { message: error.message, at: Date.now() };
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
      if (VERBOSE) console.log('[BackendEngine] Reconciling device states with Home Assistant...');
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
      
      if (VERBOSE) console.log(`[BackendEngine] Reconciliation complete: ${reconciledNodes} device nodes, ${totalDevices} devices synced with HA`);
      
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
  start() {
    if (this.startPromise) return this.startPromise;
    const generation = this.lifecycleGeneration;
    const pending = this._queueLifecycle(() => this._start(generation));
    const tracked = pending.finally(() => {
      if (this.startPromise === tracked) this.startPromise = null;
    });
    this.startPromise = tracked;
    return tracked;
  }

  async _start(generation) {
    if (generation !== this.lifecycleGeneration) return false;
    if (this.running) {
      return true;
    }

    if (this.nodes.size === 0) {
      console.warn('[BackendEngine] No nodes loaded, cannot start');
      return false;
    }

    // Validate dependency order before changing lifecycle state. A cyclic
    // graph must leave the engine stopped and its current graph inspectable.
    const executionOrder = this.topologicalSort();

    if (this.tickPromise) await this.tickPromise;
    if (generation !== this.lifecycleGeneration) return false;
    // Best effort, as before: an HA outage must not permanently disable the
    // whole graph. Device-specific warmup/recovery remains with the HA nodes.
    this.lastReconciliation = await this.reconcileDeviceStates();
    if (generation !== this.lifecycleGeneration) return false;

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
    engineLogger.log('EXEC-ORDER', 'Node execution order:', executionOrder.map((id, i) => {
      const node = this.nodes.get(id);
      const type = node?.type || node?.constructor?.name || '?';
      return `${i + 1}. ${type} (${id})`;
    }));
    
    // Call tick immediately, then on interval
    await this.tick();
    if (generation !== this.lifecycleGeneration || !this.running) return false;
    if (!this.tickInterval) {
      this.tickInterval = setInterval(() => this.tick(), this.tickRate);
    }
    
    engineLogger.logEngineEvent('RUNNING', { tickRate: this.tickRate });
    return true;
  }

  /**
   * Stop the engine
   */
  stop() {
    const wasActive = this.running || this.startPromise !== null;
    this.lifecycleGeneration++;
    // A subsequent explicit Start may queue behind the canceled operation.
    // The old operation is still awaited, never abandoned with Promise.race.
    this.startPromise = null;
    this.running = false;
    
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    
    if (wasActive) {
      engineLogger.logEngineEvent('STOP', { tickCount: this.tickCount });
      console.log(`[BackendEngine] Stopped after ${this.tickCount} ticks`);
    }
  }

  /**
   * Hot-reload under the same lifecycle queue as startup. Invalid candidates
   * never stop/dispose the old graph; successful replacement pauses its timer
   * through `loading` rather than risking a second asynchronous start.
   * @param {object} graphData - New graph data
   */
  async hotReload(graphData) {
    const prepared = this._prepareGraph(graphData);
    return this._queueLifecycle(() => this._replaceGraph(prepared, true));
  }

  /**
   * Get engine status
   * @returns {object}
   */
  getStatus() {
    return {
      running: this.running,
      loading: this.loading,
      starting: this.startPromise !== null && !this.running,
      lastReconciliation: this.lastReconciliation,
      nodeCount: this.nodes.size,
      connectionCount: this.connections.length,
      tickCount: this.tickCount,
      tickRate: this.tickRate,
      lastTickTime: this.lastTickTime,
      lastTickCompletedTime: this.lastTickCompletedTime,
      lastTickDurationMs: this.lastTickDurationMs,
      lastTickError: this.lastTickError,
      nodeErrors: Object.fromEntries(this.nodeErrors),
      graphPath: this.graphPath,
      startedAt: this.startedAt,
      uptime: this.startedAt ? Date.now() - this.startedAt : 0,
      registeredNodeTypes: registry.list(),
      loadDiagnostics: this.loadDiagnostics,
      frontendActive: this.frontendActive,
      frontendLastSeen: this.frontendLastSeen
    };
  }
}

module.exports = new BackendEngine();
