/**
 * BackendEngine.test.js — Unit tests for the dataflow engine
 *
 * Covers: graph loading, topological sort, tick execution, frontend priority,
 * scheduled events, and node registry integration.
 */

// Minimal stubs so engine doesn't crash on import
jest.mock('../src/engine/engineLogger', () => ({
  logEngineEvent: jest.fn(),
  logDeviceCommand: jest.fn(),
  logDeviceState: jest.fn(),
  logBufferSet: jest.fn(),
  logBufferGet: jest.fn(),
  log: jest.fn()
}));

jest.mock('../src/devices/managers/homeAssistantManager', () => ({
  getState: jest.fn()
}));

// Socket tests must not load builtin/device modules or access saved graphs.
jest.mock('../src/engine', () => ({
  engine: require('../src/engine/BackendEngine'),
  registry: require('../src/engine/BackendNodeRegistry'),
  loadBuiltinNodes: jest.fn().mockResolvedValue(undefined)
}));

// BackendEngine exports a singleton, not the class
const engine = require('../src/engine/BackendEngine');
const registry = require('../src/engine/BackendNodeRegistry');
const homeAssistantManager = require('../src/devices/managers/homeAssistantManager');
const { SenderNode, ReceiverNode, AutoTronBuffer } = require('../src/engine/nodes/BufferNodes');
const dependencyOrder = require('../src/engine/dependencyOrder');

const pendingDeferreds = [];
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  pendingDeferreds.push(resolve);
  return { promise, resolve, reject };
}

// A minimal test node with a data() method
class StubNode {
  constructor() {
    this.type = 'StubNode';
    this.id = null;
    this.label = 'Stub';
    this.properties = { value: 42 };
  }
  data(inputs) {
    return { out: this.properties.value };
  }
  restore(state) {
    const props = state.properties || state;
    Object.assign(this.properties, props);
  }
}

// Register stub so engine can instantiate it
registry.register('StubNode', StubNode);
registry.register('SenderNode', SenderNode);
registry.register('ReceiverNode', ReceiverNode);

describe('BackendEngine', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: 1000000 });
    // No real HA cache, network, devices, or private configuration in this suite.
    jest.spyOn(engine, 'reconcileDeviceStates').mockResolvedValue({ success: true });
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    engine.stop();
    // Release deferred work even if an assertion failed before its normal release.
    pendingDeferreds.splice(0).forEach(resolve => resolve());
    if (engine.tickPromise) await engine.tickPromise;
    await engine.lifecycleQueue;
    // Reset state between tests
    engine.nodes.clear();
    engine.connections = [];
    engine.outputs.clear();
    engine.nodeErrors.clear();
    engine.tickCount = 0;
    engine.graphPath = null;
    engine.lastReconciliation = null;
    engine.frontendActive = false;
    engine.frontendLastSeen = null;
    engine.frontendHandoffPromise = null;
    engine.scheduledEventsRegistry.clear();
    AutoTronBuffer.clear();
    homeAssistantManager.getState.mockReset();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  // ---------------------------------------------------------------------------
  // Construction & defaults
  // ---------------------------------------------------------------------------
  test('starts in stopped state with empty graph', () => {
    expect(engine.running).toBe(false);
    expect(engine.nodes.size).toBe(0);
    expect(engine.connections.length).toBe(0);
    expect(engine.tickCount).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // loadGraphData — node instantiation
  // ---------------------------------------------------------------------------
  describe('loadGraphData', () => {
    test('instantiates registered node types', async () => {
      await engine.loadGraphData({
        nodes: [
          { id: 'n1', name: 'StubNode', properties: { value: 99 } }
        ],
        connections: []
      });
      expect(engine.nodes.size).toBe(1);
      const node = engine.nodes.get('n1');
      expect(node).toBeDefined();
      expect(node.properties.value).toBe(99);
    });

    test('fails closed for unknown executable types and preserves the old graph', async () => {
      const old = new StubNode();
      engine.nodes.set('old', old);
      await expect(engine.loadGraphData({
        nodes: [
          { id: 'n1', name: 'NonExistentNode', label: 'Fake' }
        ],
        connections: []
      })).rejects.toThrow(/unregistered executable node type/i);
      expect(engine.nodes.get('old')).toBe(old);
    });

    test('allows only explicit registry UI-only skips and diagnoses their connections', async () => {
      await engine.loadGraphData({
        nodes: [
          { id: 'source', name: 'StubNode' },
          { id: 'display', name: 'DisplayNode', label: 'Display' }
        ],
        connections: [{ source: 'source', sourceOutput: 'out', target: 'display', targetInput: 'in' }]
      });
      expect(Array.from(engine.nodes.keys())).toEqual(['source']);
      expect(engine.loadDiagnostics).toEqual({
        skippedNodeTypes: ['Display'],
        skippedConnections: [{ source: 'source', target: 'display' }]
      });
      expect(engine.connections).toEqual([]);
    });

    test('stores connections', async () => {
      await engine.loadGraphData({
        nodes: [
          { id: 'a', name: 'StubNode' },
          { id: 'b', name: 'StubNode' }
        ],
        connections: [
          { source: 'a', sourceOutput: 'out', target: 'b', targetInput: 'in' }
        ]
      });
      expect(engine.connections.length).toBe(1);
      expect(engine.connections[0].source).toBe('a');
    });

    test('clears previous graph on reload', async () => {
      await engine.loadGraphData({
        nodes: [{ id: 'old', name: 'StubNode' }],
        connections: []
      });
      expect(engine.nodes.size).toBe(1);

      await engine.loadGraphData({
        nodes: [],
        connections: []
      });
      expect(engine.nodes.size).toBe(0);
    });

    test('accepts legacy graphs without a connections field', async () => {
      await engine.loadGraphData({
        nodes: [{ id: 'legacy', name: 'StubNode' }]
      });

      expect(engine.nodes.has('legacy')).toBe(true);
      expect(engine.connections).toEqual([]);
    });

    test('rejects invalid replacement before clearing the current graph', async () => {
      await engine.loadGraphData({
        nodes: [{ id: 'old', name: 'StubNode' }],
        connections: []
      });

      await expect(engine.loadGraphData({
        nodes: [
          { id: 'duplicate', name: 'StubNode' },
          { id: 'duplicate', name: 'StubNode' }
        ],
        connections: []
      })).rejects.toThrow(/duplicate node id/i);

      expect(engine.nodes.has('old')).toBe(true);
      expect(engine.nodes.has('duplicate')).toBe(false);
    });

    test('disposes old nodes and clears scheduled events on reload', async () => {
      const destroy = jest.fn();
      engine.nodes.set('old', { destroy });
      engine.registerScheduledEvents('old', [{
        time: new Date(Date.now() + 60000),
        action: 'display only'
      }]);

      await engine.loadGraphData({ nodes: [], connections: [] });

      expect(destroy).toHaveBeenCalledTimes(1);
      expect(engine.getUpcomingEvents()).toEqual([]);
    });

    test('waits for an in-flight tick before replacing the graph', async () => {
      let releaseNode;
      let nodeEntered;
      const entered = new Promise(resolve => {
        nodeEntered = resolve;
      });

      engine.nodes.set('old', {
        data: async () => {
          nodeEntered();
          await new Promise(resolve => {
            releaseNode = resolve;
          });
          return { out: 'old graph' };
        }
      });

      const tick = engine.tick(true);
      await entered;
      const reload = engine.loadGraphData({ nodes: [], connections: [] });

      releaseNode();
      await tick;
      await reload;

      expect(engine.nodes.size).toBe(0);
      expect(engine.outputs.size).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // gatherInputs
  // ---------------------------------------------------------------------------
  describe('gatherInputs', () => {
    test('gathers outputs from connected source nodes', async () => {
      await engine.loadGraphData({
        nodes: [
          { id: 'src', name: 'StubNode', properties: { value: 7 } },
          { id: 'dst', name: 'StubNode' }
        ],
        connections: [
          { source: 'src', sourceOutput: 'out', target: 'dst', targetInput: 'val' }
        ]
      });
      // Simulate src having produced output
      engine.outputs.set('src', { out: 7 });

      const inputs = engine.gatherInputs('dst');
      expect(inputs.val).toEqual([7]);
    });

    test('returns empty object when no connections', () => {
      const inputs = engine.gatherInputs('nonexistent');
      expect(inputs).toEqual({});
    });
  });

  // ---------------------------------------------------------------------------
  // topologicalSort
  // ---------------------------------------------------------------------------
  describe('topologicalSort', () => {
    test('returns nodes in dependency order', async () => {
      await engine.loadGraphData({
        nodes: [
          { id: 'a', name: 'StubNode' },
          { id: 'b', name: 'StubNode' },
          { id: 'c', name: 'StubNode' }
        ],
        connections: [
          { source: 'a', sourceOutput: 'out', target: 'b', targetInput: 'in' },
          { source: 'b', sourceOutput: 'out', target: 'c', targetInput: 'in' }
        ]
      });
      const order = engine.topologicalSort();
      expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
      expect(order.indexOf('b')).toBeLessThan(order.indexOf('c'));
    });

    test('returns all nodes even with no connections', async () => {
      await engine.loadGraphData({
        nodes: [
          { id: 'x', name: 'StubNode' },
          { id: 'y', name: 'StubNode' }
        ],
        connections: []
      });
      const order = engine.topologicalSort();
      expect(order).toHaveLength(2);
      expect(order).toContain('x');
      expect(order).toContain('y');
    });

    test('reports cyclic dependencies with a node path', async () => {
      const cyclicGraph = {
        nodes: [
          { id: 'a', name: 'StubNode' },
          { id: 'b', name: 'StubNode' },
          { id: 'c', name: 'StubNode' }
        ],
        connections: [
          { source: 'a', sourceOutput: 'out', target: 'b', targetInput: 'in' },
          { source: 'b', sourceOutput: 'out', target: 'c', targetInput: 'in' },
          { source: 'c', sourceOutput: 'out', target: 'a', targetInput: 'in' }
        ]
      };

      let error;
      try {
        await engine.loadGraphData(cyclicGraph);
      } catch (caughtError) {
        error = caughtError;
      }

      expect(error?.message).toMatch(/^Graph contains a cycle:/);
      expect(error?.message).toContain('a');
      expect(error?.message).toContain('b');
      expect(error?.message).toContain('c');
    });

    test('matches buffers by actual names instead of linking all senders to all receivers', async () => {
      await engine.loadGraphData({
        nodes: [
          { id: 'rB', name: 'ReceiverNode', properties: { selectedBuffer: '[Number]B' } },
          { id: 'sB', name: 'SenderNode', properties: { bufferName: '[Trigger]B' } },
          { id: 'rA', label: 'Receiver', data: { properties: { selectedBuffer: '[Number]A' } } },
          { id: 'sA', label: 'Sender', properties: { bufferName: 'A' } },
          { id: 'source', name: 'StubNode' }
        ],
        connections: [
          { source: 'source', sourceOutput: 'out', target: 'sA', targetInput: 'in' },
          { source: 'rA', sourceOutput: 'out', target: 'sB', targetInput: 'in' }
        ]
      });
      expect(engine.topologicalSort()).toEqual(['source', 'sA', 'rA', 'sB', 'rB']);
      await engine.tick(true);
      expect(engine.outputs.get('rB').out).toBe(42);
    });

    test('rejects a real cycle through a matched virtual buffer edge during preflight', async () => {
      await expect(engine.loadGraphData({
        nodes: [
          { id: 'send', name: 'SenderNode', properties: { bufferName: ' Loop' } },
          { id: 'read', name: 'ReceiverNode', properties: { bufferName: '[Number] Loop' } }
        ],
        connections: [{ source: 'read', sourceOutput: 'out', target: 'send', targetInput: 'in' }]
      })).rejects.toThrow(/cycle/);
    });

    test('uses receiver selectedBuffer precedence, sender Default, and preserves key whitespace', () => {
      const nodes = new Map([
        ['default', { type: 'SenderNode', properties: {} }],
        ['space', { type: 'SenderNode', properties: { bufferName: ' A' } }],
        ['r', { type: 'ReceiverNode', properties: { selectedBuffer: '[Number]Default', bufferName: '[Number] A' } }],
        ['no-space', { type: 'ReceiverNode', properties: { bufferName: '[Number]A' } }]
      ]);
      const { dependencies } = dependencyOrder(nodes, []);
      expect(Array.from(dependencies.get('r'))).toEqual(['default']);
      expect(Array.from(dependencies.get('no-space'))).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // tick (forced, single step)
  // ---------------------------------------------------------------------------
  describe('tick', () => {
    test('executes nodes and stores outputs', async () => {
      await engine.loadGraphData({
        nodes: [
          { id: 'n1', name: 'StubNode', properties: { value: 123 } }
        ],
        connections: []
      });
      await engine.tick(true); // force=true so it runs even when stopped
      const outputs = engine.outputs.get('n1');
      expect(outputs).toBeDefined();
      expect(outputs.out).toBe(123);
    });

    test('does nothing when stopped and force=false', async () => {
      await engine.loadGraphData({
        nodes: [{ id: 'n1', name: 'StubNode' }],
        connections: []
      });
      await engine.tick(false);
      expect(engine.outputs.size).toBe(0);
    });

    test('does not overlap asynchronous ticks', async () => {
      let activeCalls = 0;
      let maximumActiveCalls = 0;
      let releaseNode;
      let nodeEntered;
      const entered = new Promise(resolve => {
        nodeEntered = resolve;
      });

      engine.nodes.set('slow', {
        data: async () => {
          activeCalls++;
          maximumActiveCalls = Math.max(maximumActiveCalls, activeCalls);
          nodeEntered();
          await new Promise(resolve => {
            releaseNode = resolve;
          });
          activeCalls--;
          return { out: true };
        }
      });

      const firstTick = engine.tick(true);
      await entered;
      const secondTick = engine.tick(true);

      expect(maximumActiveCalls).toBe(1);
      releaseNode();
      await Promise.all([firstTick, secondTick]);
      expect(engine.outputs.get('slow')).toEqual({ out: true });
    });
  });

  // ---------------------------------------------------------------------------
  // start / stop
  // ---------------------------------------------------------------------------
  describe('start/stop', () => {
    test('start sets running=true and increments tickCount', async () => {
      await engine.loadGraphData({
        nodes: [{ id: 'n1', name: 'StubNode' }],
        connections: []
      });
      await engine.start();
      expect(engine.running).toBe(true);

      await jest.advanceTimersByTimeAsync(150);
      engine.stop();
      expect(engine.running).toBe(false);
      expect(engine.tickCount).toBeGreaterThan(0);
    });

    test('does not enter running state for a cyclic graph', async () => {
      await engine.loadGraphData({
        nodes: [
          { id: 'a', name: 'StubNode' },
          { id: 'b', name: 'StubNode' }
        ],
        connections: []
      });
      // Live topology can also be mutated after loading; start validates it too.
      engine.connections = [
        { source: 'a', sourceOutput: 'out', target: 'b', targetInput: 'in' },
        { source: 'b', sourceOutput: 'out', target: 'a', targetInput: 'in' }
      ];

      await expect(engine.start()).rejects.toThrow(/cycle/i);
      expect(engine.running).toBe(false);
    });

    test('restores the running graph when hot-reload validation fails', async () => {
      await engine.loadGraphData({
        nodes: [{ id: 'stable', name: 'StubNode' }],
        connections: []
      });
      await engine.start();

      await expect(engine.hotReload({
        nodes: [
          { id: 'duplicate', name: 'StubNode' },
          { id: 'duplicate', name: 'StubNode' }
        ],
        connections: []
      })).rejects.toThrow(/duplicate node id/i);

      expect(engine.running).toBe(true);
      expect(engine.nodes.has('stable')).toBe(true);
      engine.stop();
    });
  });

  describe('lifecycle regressions (deferred work and fake clock)', () => {
    test('concurrent starts share reconciliation, initial tick, and one interval', async () => {
      engine.nodes.set('n', new StubNode());
      const entered = deferred();
      const release = deferred();
      engine.reconcileDeviceStates.mockImplementation(() => {
        entered.resolve();
        return release.promise;
      });

      const first = engine.start();
      const second = engine.start();
      expect(first).toBe(second);
      await entered.promise;
      expect(engine.reconcileDeviceStates).toHaveBeenCalledTimes(1);
      expect(engine.running).toBe(false);
      expect(jest.getTimerCount()).toBe(0);

      release.resolve({ success: true });
      expect(await first).toBe(true);
      expect(await second).toBe(true);
      expect(engine.tickCount).toBe(1);
      expect(jest.getTimerCount()).toBe(1);
      await jest.advanceTimersByTimeAsync(300);
      expect(engine.tickCount).toBe(4);
    });

    test('stop during pending reconciliation cancels startup without arming a timer', async () => {
      const data = jest.fn(() => ({ out: true }));
      engine.nodes.set('n', { data });
      const entered = deferred();
      const release = deferred();
      engine.reconcileDeviceStates.mockImplementation(() => {
        entered.resolve();
        return release.promise;
      });

      const starting = engine.start();
      await entered.promise;
      engine.stop();
      release.resolve({ success: true });
      expect(await starting).toBe(false);
      await jest.advanceTimersByTimeAsync(1000);
      expect(engine.running).toBe(false);
      expect(engine.tickInterval).toBeNull();
      expect(jest.getTimerCount()).toBe(0);
      expect(data).not.toHaveBeenCalled();
    });

    test('an explicit new start after stop waits for the canceled activation to settle', async () => {
      engine.nodes.set('n', new StubNode());
      const entered = deferred();
      const release = deferred();
      engine.reconcileDeviceStates.mockImplementationOnce(() => {
        entered.resolve();
        return release.promise;
      });
      const canceled = engine.start();
      await entered.promise;
      engine.stop();
      const restarted = engine.start();
      expect(restarted).not.toBe(canceled);
      expect(engine.reconcileDeviceStates).toHaveBeenCalledTimes(1);
      release.resolve({ success: true });
      expect(await canceled).toBe(false);
      expect(await restarted).toBe(true);
      expect(engine.reconcileDeviceStates).toHaveBeenCalledTimes(2);
      expect(jest.getTimerCount()).toBe(1);
    });

    test('stop during the initial awaited tick prevents output commits, descendants, and rearming', async () => {
      const entered = deferred();
      const release = deferred();
      const descendant = jest.fn(() => ({ out: 'must not send' }));
      engine.nodes.set('slow', { data: async () => {
        entered.resolve();
        await release.promise;
        return { out: true };
      } });
      engine.nodes.set('device', { data: descendant });
      engine.connections = [{ source: 'slow', sourceOutput: 'out', target: 'device', targetInput: 'in' }];

      const starting = engine.start();
      await entered.promise;
      expect(engine.running).toBe(true);
      engine.stop();
      release.resolve();
      expect(await starting).toBe(false);
      expect(engine.outputs.size).toBe(0);
      expect(descendant).not.toHaveBeenCalled();
      expect(engine.tickInterval).toBeNull();
      expect(jest.getTimerCount()).toBe(0);
    });

    test('stop also invalidates an in-flight forced tick at its next node boundary', async () => {
      const entered = deferred();
      const release = deferred();
      engine.nodes.set('slow', { data: async () => {
        entered.resolve();
        await release.promise;
        return { out: true };
      } });
      const after = jest.fn();
      engine.nodes.set('after', { data: after });
      const tick = engine.tick(true);
      await entered.promise;
      engine.stop(); // Was already stopped; must still invalidate the forced step.
      release.resolve();
      await tick;
      expect(after).not.toHaveBeenCalled();
      expect(engine.outputs.size).toBe(0);
    });

    test('async disposal blocks both interval ticks and forced ticks until replacement is ready', async () => {
      const entered = deferred();
      const release = deferred();
      const oldData = jest.fn(() => ({ out: 'old' }));
      engine.nodes.set('old', { data: oldData, destroy: () => {
        entered.resolve();
        return release.promise;
      } });
      await engine.start();
      const originalInterval = engine.tickInterval;
      const loading = engine.loadGraphData({ nodes: [{ id: 'new', name: 'StubNode' }] });
      await entered.promise;
      expect(engine.loading).toBe(true);
      expect(engine.shouldSkipDeviceCommands()).toBe(true);
      await jest.advanceTimersByTimeAsync(500);
      await engine.tick(true);
      expect(oldData).toHaveBeenCalledTimes(1);
      expect(engine.tickCount).toBe(1);
      expect(engine.nodes.has('new')).toBe(false);

      release.resolve();
      await loading;
      expect(engine.loading).toBe(false);
      expect(engine.tickInterval).toBe(originalInterval);
      await jest.advanceTimersByTimeAsync(100);
      expect(engine.outputs.get('new')).toEqual({ out: 42 });
      expect(engine.nodes.has('old')).toBe(false);
    });

    test('load and activation serialize in both directions', async () => {
      const disposalEntered = deferred();
      const releaseDisposal = deferred();
      engine.nodes.set('old', { destroy: () => {
        disposalEntered.resolve();
        return releaseDisposal.promise;
      } });
      const loading = engine.loadGraphData({ nodes: [{ id: 'new', name: 'StubNode' }] });
      await disposalEntered.promise;
      const starting = engine.start();
      await jest.advanceTimersByTimeAsync(100);
      expect(engine.reconcileDeviceStates).not.toHaveBeenCalled();
      releaseDisposal.resolve();
      await loading;
      await starting;
      expect(engine.outputs.get('new')).toEqual({ out: 42 });
      engine.stop();

      const reconcileEntered = deferred();
      const releaseReconcile = deferred();
      engine.reconcileDeviceStates.mockImplementationOnce(() => {
        reconcileEntered.resolve();
        return releaseReconcile.promise;
      });
      const destroy = jest.fn();
      engine.nodes.get('new').destroy = destroy;
      const restarting = engine.start();
      await reconcileEntered.promise;
      const reloading = engine.loadGraphData({ nodes: [] });
      await jest.advanceTimersByTimeAsync(100);
      expect(destroy).not.toHaveBeenCalled();
      releaseReconcile.resolve({ success: true });
      await restarting;
      await reloading;
      expect(destroy).toHaveBeenCalledTimes(1);
      expect(engine.nodes.size).toBe(0);
    });

    test('file read and parsing serialize before a following start (mocked filesystem only)', async () => {
      const entered = deferred();
      const release = deferred();
      const readFile = jest.spyOn(require('fs').promises, 'readFile').mockImplementation(() => {
        entered.resolve();
        return release.promise;
      });
      const oldData = jest.fn();
      engine.nodes.set('old', { data: oldData });
      const load = engine.loadGraph('in-memory-test-graph.json');
      await entered.promise;
      const start = engine.start();
      await jest.advanceTimersByTimeAsync(100);
      expect(engine.reconcileDeviceStates).not.toHaveBeenCalled();
      expect(oldData).not.toHaveBeenCalled();
      release.resolve(JSON.stringify({ nodes: [{ id: 'new', name: 'StubNode' }] }));
      expect(await load).toBe(true);
      expect(await start).toBe(true);
      expect(readFile).toHaveBeenCalledWith('in-memory-test-graph.json', 'utf8');
      expect(engine.outputs.get('new')).toEqual({ out: 42 });
      expect(engine.graphPath).toBe('in-memory-test-graph.json');
    });

    test('stop does not allow disposal to overtake an unfinished node promise', async () => {
      const entered = deferred();
      const release = deferred();
      const destroy = jest.fn();
      engine.nodes.set('old', { destroy, data: async () => {
        entered.resolve();
        await release.promise;
        return { out: true };
      } });
      const tick = engine.tick(true);
      await entered.promise;
      const loading = engine.loadGraphData({ nodes: [] });
      await jest.advanceTimersByTimeAsync(100);
      expect(engine.loading).toBe(true);
      engine.stop();
      await jest.advanceTimersByTimeAsync(1000);
      expect(destroy).not.toHaveBeenCalled();
      expect(engine.nodes.has('old')).toBe(true);
      release.resolve();
      await tick;
      await loading;
      expect(destroy).toHaveBeenCalledTimes(1);
      expect(engine.nodes.size).toBe(0);
      expect(engine.outputs.size).toBe(0);
    });

    test('stop during hot reload cleanup remains stopped after cleanup and activation requests settle', async () => {
      const entered = deferred();
      const release = deferred();
      engine.nodes.set('old', { data: () => ({}), destroy: () => {
        entered.resolve();
        return release.promise;
      } });
      await engine.start();
      const reload = engine.hotReload({ nodes: [{ id: 'new', name: 'StubNode' }] });
      await entered.promise;
      const queuedStart = engine.start();
      engine.stop();
      release.resolve();
      await reload;
      expect(await queuedStart).toBe(false);
      await jest.advanceTimersByTimeAsync(500);
      expect(engine.running).toBe(false);
      expect(engine.outputs.size).toBe(0);
      expect(jest.getTimerCount()).toBe(0);
    });

    test('cyclic hot reload preserves running nodes, outputs, buffers, and the original interval', async () => {
      const old = new StubNode();
      old.destroy = jest.fn();
      engine.nodes.set('stable', old);
      await engine.start();
      AutoTronBuffer.set('[Number]stable', 7);
      const interval = engine.tickInterval;
      await expect(engine.hotReload({
        nodes: [{ id: 'a', name: 'StubNode' }, { id: 'b', name: 'StubNode' }],
        connections: [
          { source: 'a', sourceOutput: 'out', target: 'b', targetInput: 'in' },
          { source: 'b', sourceOutput: 'out', target: 'a', targetInput: 'in' }
        ]
      })).rejects.toThrow(/cycle/);
      expect(engine.nodes.get('stable')).toBe(old);
      expect(old.destroy).not.toHaveBeenCalled();
      expect(engine.outputs.get('stable')).toEqual({ out: 42 });
      expect(AutoTronBuffer.get('[Number]stable')).toBe(7);
      expect(engine.running).toBe(true);
      expect(engine.tickInterval).toBe(interval);
      expect(engine.reconcileDeviceStates).toHaveBeenCalledTimes(1);
    });

    test('cleans staged candidates including a failed async restore before touching old nodes', async () => {
      const entered = deferred();
      const release = deferred();
      const disposed = [];
      class StagedNode extends StubNode {
        async restore(state) {
          super.restore(state);
          this.timer = setInterval(() => {}, 10);
          if (this.properties.fail) {
            entered.resolve();
            await release.promise;
            throw new Error('restore failed');
          }
        }
        destroy() {
          clearInterval(this.timer);
          disposed.push(this.id);
        }
      }
      registry.register('StagedNode', StagedNode);
      const old = new StubNode();
      old.destroy = jest.fn();
      engine.nodes.set('old', old);
      await engine.start();
      const interval = engine.tickInterval;
      const load = engine.hotReload({ nodes: [
        { id: 'good', name: 'StagedNode' },
        { id: 'bad', name: 'StagedNode', properties: { fail: true } }
      ] });
      // Attach rejection handling before releasing the deferred restore.
      const rejected = expect(load).rejects.toThrow('restore failed');
      await entered.promise;
      expect(old.destroy).not.toHaveBeenCalled();
      await engine.tick(true);
      release.resolve();
      await rejected;
      expect(disposed).toEqual(['bad', 'good']);
      expect(engine.nodes.get('old')).toBe(old);
      expect(old.destroy).not.toHaveBeenCalled();
      expect(engine.loading).toBe(false);
      expect(engine.running).toBe(true);
      expect(engine.tickInterval).toBe(interval);
      expect(jest.getTimerCount()).toBe(1);
    });

    test('constructor failure cleans previously created candidates and leaves the old graph intact', async () => {
      const disposed = jest.fn();
      class Candidate extends StubNode { destroy() { disposed(); } }
      class BadConstructor { constructor() { throw new Error('constructor failed'); } }
      registry.register('Candidate', Candidate);
      registry.register('BadConstructor', BadConstructor);
      const old = new StubNode();
      old.destroy = jest.fn();
      engine.nodes.set('old', old);
      await expect(engine.loadGraphData({ nodes: [
        { id: 'good', name: 'Candidate' },
        { id: 'bad', name: 'BadConstructor' }
      ] })).rejects.toThrow('constructor failed');
      expect(disposed).toHaveBeenCalledTimes(1);
      expect(old.destroy).not.toHaveBeenCalled();
      expect(engine.nodes.get('old')).toBe(old);
      // The lifecycle queue must recover after a failed load.
      await engine.loadGraphData({ nodes: [] });
      expect(old.destroy).toHaveBeenCalledTimes(1);
    });

    test('an HA reconciliation failure does not permanently disable all automation', async () => {
      engine.nodes.set('device-like-stub', { reconcile: jest.fn(), data: () => ({ out: 'local-only' }) });
      engine.reconcileDeviceStates.mockResolvedValue({ success: false, reason: 'no_states' });
      expect(await engine.start()).toBe(true);
      expect(engine.running).toBe(true);
      expect(engine.getStatus().lastReconciliation).toEqual({ success: false, reason: 'no_states' });
    });

    test('handoff initiated inside data() can queue hot reload without a lifecycle deadlock', async () => {
      jest.spyOn(engine, 'onFrontendInactive').mockImplementation(async () => {
        await engine.hotReload({ nodes: [{ id: 'replacement', name: 'StubNode' }] });
        engine.forceHsvResync();
      });
      engine.nodes.set('guard', { data: () => ({ out: engine.shouldSkipDeviceCommands() }) });
      engine.setFrontendActive(true);
      engine.frontendLastSeen = Date.now() - 30001;
      await engine.start();
      await engine.frontendHandoffPromise;
      expect(engine.onFrontendInactive).toHaveBeenCalledTimes(1);
      expect(engine.nodes.has('replacement')).toBe(true);
      expect(engine.loading).toBe(false);
      expect(engine.running).toBe(true);
      expect(engine.frontendHandoffPromise).toBeNull();
      expect(jest.getTimerCount()).toBe(1);
    });

    test('socket wrapper ignores empty/canceled starts and broadcasts concurrent activation once', async () => {
      const originalStart = engine.start;
      const originalStop = engine.stop;
      const io = { on: jest.fn(), emit: jest.fn() };
      const { initEngineSocketHandlers } = require('../src/api/engineSocketHandlers');
      try {
        initEngineSocketHandlers(io);
        initEngineSocketHandlers(io); // Must not install duplicate lifecycle wrappers.
        expect(await engine.start()).toBe(false);
        expect(io.emit).not.toHaveBeenCalled();
        expect(jest.getTimerCount()).toBe(0);

        engine.nodes.set('n', new StubNode());
        const entered = deferred();
        const release = deferred();
        engine.reconcileDeviceStates.mockImplementationOnce(() => {
          entered.resolve();
          return release.promise;
        });
        const canceled = engine.start();
        await entered.promise;
        engine.stop();
        release.resolve({ success: true });
        expect(await canceled).toBe(false);
        expect(io.emit.mock.calls.filter(([event]) => event === 'engine-started')).toHaveLength(0);
        expect(jest.getTimerCount()).toBe(0);

        io.emit.mockClear();
        await Promise.all([engine.start(), engine.start()]);
        expect(io.emit.mock.calls.filter(([event]) => event === 'engine-started')).toHaveLength(1);
        expect(jest.getTimerCount()).toBe(2); // One tick interval, one status interval.
        engine.stop();
        expect(jest.getTimerCount()).toBe(0);
      } finally {
        engine.stop();
        engine.start = originalStart;
        engine.stop = originalStop;
      }
    });
  });

  describe('node failures', () => {
    test('retains each node log timestamp through repeated failures (including clock zero)', async () => {
      jest.setSystemTime(0);
      engine.nodes.set('a', { data: () => { throw new Error('a failed'); } });
      engine.nodes.set('b', { data: () => { throw new Error('b failed'); } });
      await engine.tick(true);
      expect(console.error).toHaveBeenCalledTimes(2);
      for (let i = 1; i <= 4; i++) {
        jest.setSystemTime(i * 1000);
        await engine.tick(true);
      }
      expect(console.error).toHaveBeenCalledTimes(2);
      expect(engine.nodeErrors.get('a')).toMatchObject({ count: 5, lastLoggedAt: 0, lastAt: 4000 });
      expect(engine.nodeErrors.get('b')).toMatchObject({ count: 5, lastLoggedAt: 0 });
      jest.setSystemTime(60000);
      await engine.tick(true);
      expect(console.error).toHaveBeenCalledTimes(4);
      expect(engine.nodeErrors.get('a').lastLoggedAt).toBe(60000);
    });

    test('blocks wired and buffer descendants after upstream failure, then recovers with fresh arrays', async () => {
      await engine.loadGraphData({ nodes: [
        { id: 'source', name: 'StubNode', properties: { value: true } },
        { id: 'send', name: 'SenderNode', properties: { bufferName: 'chain' } },
        { id: 'read', name: 'ReceiverNode', properties: { selectedBuffer: '[Trigger]chain' } },
        { id: 'device', name: 'StubNode' },
        { id: 'independent', name: 'StubNode' }
      ], connections: [
        { source: 'source', sourceOutput: 'out', target: 'send', targetInput: 'in' },
        { source: 'read', sourceOutput: 'out', target: 'device', targetInput: 'in' }
      ] });
      const source = jest.spyOn(engine.nodes.get('source'), 'data');
      const receiver = jest.spyOn(engine.nodes.get('read'), 'data');
      const device = jest.spyOn(engine.nodes.get('device'), 'data').mockImplementation(inputs => ({ out: inputs.in[0] }));
      const independent = jest.spyOn(engine.nodes.get('independent'), 'data');
      await engine.tick(true);
      expect(device).toHaveBeenLastCalledWith({ in: [true] });
      source.mockImplementationOnce(() => { throw new Error('upstream failed'); });
      await engine.tick(true);
      expect(AutoTronBuffer.get('[Trigger]chain')).toBe(true); // Stale storage must not be read.
      expect(receiver).toHaveBeenCalledTimes(1);
      expect(device).toHaveBeenCalledTimes(1);
      expect(independent).toHaveBeenCalledTimes(2);
      for (const id of ['source', 'send', 'read', 'device']) expect(engine.outputs.has(id)).toBe(false);
      expect(engine.nodeErrors.get('device').blockedBy).toEqual(['read']);

      source.mockImplementationOnce(() => ({ out: false }));
      await engine.tick(true);
      expect(device).toHaveBeenLastCalledWith({ in: [false] });
      expect(engine.outputs.get('device')).toEqual({ out: false });
      expect(engine.nodeErrors.size).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Frontend priority
  // ---------------------------------------------------------------------------
  describe('frontend priority', () => {
    test('shouldSkipDeviceCommands returns true when frontend is active', () => {
      engine.setFrontendActive(true);
      expect(engine.shouldSkipDeviceCommands()).toBe(true);
    });

    test('shouldSkipDeviceCommands returns false when frontend is inactive', () => {
      engine.setFrontendActive(false);
      expect(engine.shouldSkipDeviceCommands()).toBe(false);
    });

    test('heartbeat updates lastSeen timestamp', () => {
      engine.setFrontendActive(true);
      const before = engine.frontendLastSeen;
      engine.frontendHeartbeat();
      expect(engine.frontendLastSeen).toBeGreaterThanOrEqual(before);
    });

    test('heartbeat timeout enters handoff and suppresses commands until complete', async () => {
      const originalHandoff = engine.onFrontendInactive;
      let releaseHandoff;
      const handoffStarted = new Promise(resolve => {
        releaseHandoff = resolve;
      });
      engine.onFrontendInactive = jest.fn(() => handoffStarted);

      engine.setFrontendActive(true);
      engine.frontendLastSeen = Date.now() - 30001;

      expect(engine.shouldSkipDeviceCommands()).toBe(true);
      expect(engine.frontendActive).toBe(false);
      expect(engine.onFrontendInactive).toHaveBeenCalledTimes(1);

      const handoff = engine.frontendHandoffPromise;
      releaseHandoff();
      await handoff;

      expect(engine.frontendHandoffPromise).toBeNull();
      expect(engine.shouldSkipDeviceCommands()).toBe(false);
      engine.onFrontendInactive = originalHandoff;
    });

    test('resets generic-device HSV throttling during handoff resync', () => {
      const node = {
        type: 'HAGenericDeviceNode',
        lastSentHsv: { hue: 0.2, saturation: 1, brightness: 200 },
        lastSendTime: 123
      };
      engine.nodes.set('generic', node);

      engine.forceHsvResync();

      expect(node.lastSentHsv).toBeNull();
      expect(node.lastSendTime).toBe(0);
    });

    test('syncs generic-device reality without overwriting trigger state', async () => {
      homeAssistantManager.getState.mockResolvedValue({
        success: true,
        state: { state: 'on' }
      });
      const node = {
        type: 'HAGenericDeviceNode',
        properties: { selectedDeviceIds: ['ha_light.handoff_lamp'] },
        deviceStates: {},
        lastTrigger: false
      };
      engine.nodes.set('generic', node);

      await engine.syncDeviceStatesFromHA();

      expect(homeAssistantManager.getState).toHaveBeenCalledWith('light.handoff_lamp');
      expect(node.deviceStates['light.handoff_lamp']).toBe(true);
      expect(node.deviceStates['ha_light.handoff_lamp']).toBe(true);
      expect(node.lastTrigger).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Scheduled events
  // ---------------------------------------------------------------------------
  describe('scheduled events', () => {
    test('registerScheduledEvents stores events', () => {
      const futureTime = new Date(Date.now() + 60000);
      engine.registerScheduledEvents('node1', [
        { time: futureTime, action: 'on', deviceName: 'Light' }
      ]);
      const events = engine.getUpcomingEvents();
      expect(events.length).toBe(1);
      expect(events[0].action).toBe('on');
    });

    test('getUpcomingEvents filters past events', () => {
      engine.registerScheduledEvents('node1', [
        { time: new Date(Date.now() - 60000), action: 'past', deviceName: 'X' }
      ]);
      const events = engine.getUpcomingEvents();
      expect(events.length).toBe(0);
    });

    test('registerScheduledEvents with empty array clears', () => {
      engine.registerScheduledEvents('node1', [
        { time: new Date(Date.now() + 60000), action: 'on' }
      ]);
      engine.registerScheduledEvents('node1', []);
      const events = engine.getUpcomingEvents();
      expect(events.length).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// BackendNodeRegistry
// ---------------------------------------------------------------------------
describe('BackendNodeRegistry', () => {
  test('register and get', () => {
    registry.register('TestNode', StubNode);
    expect(registry.get('TestNode')).toBe(StubNode);
  });

  test('has() returns false for unknown types', () => {
    expect(registry.has('CompletelyFakeNode')).toBe(false);
  });

  test('create() returns new instance', () => {
    registry.register('TestNode2', StubNode);
    const instance = registry.create('TestNode2');
    expect(instance).toBeInstanceOf(StubNode);
  });

  test('create() returns null for unknown type', () => {
    const instance = registry.create('NoSuchNode_XYZ');
    expect(instance).toBeNull();
  });

  test('list() includes registered names', () => {
    const names = registry.list();
    expect(names).toContain('StubNode');
  });

  test('resolves Watchdog label to WatchdogNode', () => {
    require('../src/engine/nodes/UtilityNodes');

    const definition = registry.getByLabel('Watchdog');

    expect(definition.name).toBe('WatchdogNode');
    expect(definition.NodeClass.name).toBe('WatchdogNode');
  });

  test('size reflects registered count', () => {
    expect(registry.size).toBeGreaterThan(0);
  });
});
