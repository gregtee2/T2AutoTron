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
  log: jest.fn()
}));

// BackendEngine exports a singleton, not the class
const engine = require('../src/engine/BackendEngine');
const registry = require('../src/engine/BackendNodeRegistry');

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

describe('BackendEngine', () => {
  afterEach(async () => {
    jest.restoreAllMocks();
    if (engine.frontendHandoffRetryTimer) clearTimeout(engine.frontendHandoffRetryTimer);
    engine.frontendHandoffRetryTimer = null;
    engine.frontendHandoffPromise = null;
    engine.frontendHandoffInProgress = false;
    engine.tickInProgress = false;
    if (engine.running || engine.activeTickPromise) await engine.stop();
    // Reset state between tests
    engine.nodes.clear();
    engine.connections = [];
    engine.outputs.clear();
    engine.tickCount = 0;
    engine.frontendActive = false;
    engine.frontendLastSeen = null;
    engine.frontendHandoffInProgress = false;
    engine.frontendHandoffPromise = null;
    engine.scheduledEventsRegistry.clear();
    engine.activeTickPromise = null;
    engine.hotReloadPromise = null;
    engine.hotReloadShouldRun = false;
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

    test('skips unknown node types without crashing', async () => {
      await engine.loadGraphData({
        nodes: [
          { id: 'n1', name: 'NonExistentNode', label: 'Fake' }
        ],
        connections: []
      });
      expect(engine.nodes.size).toBe(0);
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
      engine.start();
      expect(engine.running).toBe(true);

      // Wait for at least one tick
      await new Promise(r => setTimeout(r, 150));
      await engine.stop();
      expect(engine.running).toBe(false);
      expect(engine.tickCount).toBeGreaterThan(0);
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

    test('heartbeat reclaims frontend ownership after a timeout', () => {
      engine.frontendActive = false;
      engine.frontendLastSeen = Date.now() - 31000;

      engine.frontendHeartbeat();

      expect(engine.frontendActive).toBe(true);
      expect(Date.now() - engine.frontendLastSeen).toBeLessThan(1000);
      expect(engine.shouldSkipDeviceCommands()).toBe(true);
    });

    test('stale heartbeat keeps commands paused until backend handoff completes', async () => {
      let finishHandoff;
      const handoff = new Promise(resolve => { finishHandoff = resolve; });
      const handoffSpy = jest.spyOn(engine, 'onFrontendInactive').mockReturnValue(handoff);

      engine.setFrontendActive(true);
      engine.frontendLastSeen = Date.now() - 31000;

      expect(engine.shouldSkipDeviceCommands()).toBe(true);
      expect(engine.frontendActive).toBe(false);
      expect(engine.frontendHandoffInProgress).toBe(true);
      expect(handoffSpy).toHaveBeenCalledTimes(1);
      expect(engine.shouldSkipDeviceCommands()).toBe(true);

      const pendingHandoff = engine.frontendHandoffPromise;
      finishHandoff(true);
      await pendingHandoff;

      expect(engine.frontendHandoffInProgress).toBe(false);
      expect(engine.shouldSkipDeviceCommands()).toBe(false);
    });

    test('handoff reconciles HA Generic devices and baselines normal Follow input', async () => {
      const haManager = require('../src/devices/managers/homeAssistantManager');
      const getState = jest.spyOn(haManager, 'getState').mockImplementation(async entityId => ({
        success: true,
        state: { state: entityId === 'light.on_lamp' ? 'on' : 'off', on: entityId === 'light.on_lamp' }
      }));
      const node = {
        type: 'HAGenericDeviceNode',
        properties: { selectedDeviceIds: ['ha_light.on_lamp', 'ha_light.off_lamp'] },
        deviceStates: {},
        lastTrigger: false,
        reconciled: false,
        hadConnection: false,
        recordObservedCommandState: jest.fn(function (entityId, isOn) {
          this.deviceStates[entityId] = isOn;
          this.deviceStates[`ha_${entityId}`] = isOn;
        }),
        setDesiredCommandState: jest.fn(),
        rearmCommandStates: jest.fn()
      };
      engine.nodes.set('generic', node);

      await engine.syncDeviceStatesFromHA();

      expect(getState).toHaveBeenCalledWith('light.on_lamp', { forceRefresh: true });
      expect(getState).toHaveBeenCalledWith('light.off_lamp', { forceRefresh: true });
      expect(node.deviceStates['light.on_lamp']).toBe(true);
      expect(node.deviceStates['ha_light.off_lamp']).toBe(false);
      expect(node.lastTrigger).toBeUndefined();
      expect(node.awaitingTriggerBaseline).toBe(true);
      expect(node.reconciled).toBe(true);
      expect(node.hadConnection).toBe(true);
      expect(node.setDesiredCommandState).toHaveBeenCalledWith('light.on_lamp', undefined);
      expect(node.setDesiredCommandState).toHaveBeenCalledWith('light.off_lamp', undefined);
      expect(node.rearmCommandStates).not.toHaveBeenCalled();
    });

    test('failed handoff keeps backend commands paused and schedules retry', async () => {
      jest.spyOn(engine, 'onFrontendInactive').mockResolvedValue(false);
      engine.setFrontendActive(true);

      engine.setFrontendActive(false);
      await engine.frontendHandoffPromise;

      expect(engine.frontendHandoffInProgress).toBe(true);
      expect(engine.frontendHandoffRetryTimer).not.toBeNull();
      expect(engine.shouldSkipDeviceCommands()).toBe(true);
    });

    test('tick actively expires a stale frontend lease without device traffic', async () => {
      let finishHandoff;
      jest.spyOn(engine, 'onFrontendInactive').mockReturnValue(new Promise(resolve => {
        finishHandoff = resolve;
      }));
      engine.running = true;
      engine.frontendActive = true;
      engine.frontendLastSeen = Date.now() - 31000;

      await engine.tick();

      expect(engine.frontendActive).toBe(false);
      expect(engine.frontendHandoffInProgress).toBe(true);
      expect(engine.tickCount).toBe(0);
      finishHandoff(true);
      await engine.frontendHandoffPromise;
    });
  });

  test('does not overlap backend ticks while a node is still awaiting', async () => {
    let finishNode;
    const data = jest.fn(() => new Promise(resolve => { finishNode = resolve; }));
    engine.nodes.set('slow', { id: 'slow', type: 'StubNode', data });
    engine.running = true;

    const firstTick = engine.tick();
    await Promise.resolve();
    const overlappingTick = engine.tick();

    expect(data).toHaveBeenCalledTimes(1);
    expect(engine.tickCount).toBe(1);
    finishNode({ out: true });
    await Promise.all([firstTick, overlappingTick]);
    expect(data).toHaveBeenCalledTimes(1);
  });

  test('hot reload waits for the active tick before replacing the graph', async () => {
    let finishNode;
    const data = jest.fn(() => new Promise(resolve => { finishNode = resolve; }));
    engine.nodes.set('slow', { id: 'slow', type: 'StubNode', data });
    engine.running = true;
    jest.spyOn(engine, 'reconcileDeviceStates').mockResolvedValue({ success: true });

    const activeTick = engine.tick();
    await Promise.resolve();
    const reload = engine.hotReload({
      nodes: [{ id: 'new', name: 'StubNode', properties: { value: 7 } }],
      connections: []
    });
    await Promise.resolve();

    expect(engine.nodes.has('slow')).toBe(true);
    finishNode({ out: 'old' });
    await activeTick;
    await reload;

    expect(engine.nodes.has('slow')).toBe(false);
    expect(engine.outputs.get('slow')).toBeUndefined();
    expect(engine.outputs.get('new')).toEqual({ out: 7 });
  });

  test('concurrent hot reloads keep only the newest requested graph', async () => {
    let finishNode;
    const data = jest.fn(() => new Promise(resolve => { finishNode = resolve; }));
    engine.nodes.set('slow', { id: 'slow', type: 'StubNode', data });
    engine.running = true;
    jest.spyOn(engine, 'reconcileDeviceStates').mockResolvedValue({ success: true });

    const activeTick = engine.tick();
    await Promise.resolve();
    const olderReload = engine.hotReload({
      nodes: [{ id: 'older', name: 'StubNode', properties: { value: 1 } }],
      connections: []
    });
    const newerReload = engine.hotReload({
      nodes: [{ id: 'newer', name: 'StubNode', properties: { value: 2 } }],
      connections: []
    });

    finishNode({ out: 'old' });
    await activeTick;
    await Promise.all([olderReload, newerReload]);

    expect(engine.nodes.has('older')).toBe(false);
    expect(engine.nodes.has('newer')).toBe(true);
    expect(engine.outputs.get('newer')).toEqual({ out: 2 });
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

  test('size reflects registered count', () => {
    expect(registry.size).toBeGreaterThan(0);
  });
});
