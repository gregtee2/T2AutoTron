const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Execute the actual IIFEs, not a reimplementation of their evaluator. No real
// browser, network, device nodes, timers or engine singleton are involved.
function loadPlugins() {
  const timers = new Map();
  let nextTimer = 0;
  const schedule = (kind, callback) => { const id = ++nextTimer; timers.set(id, { kind, callback }); return id; };
  const clock = {
    timers,
    interval: callback => schedule('interval', callback),
    clear: id => timers.delete(id),
    tickIntervals: () => { for (const timer of [...timers.values()]) if (timer.kind === 'interval') timer.callback(); },
    flushTimeouts: () => {
      for (let wave = 0; wave < 20; wave++) {
        const pending = [...timers.entries()].filter(([, timer]) => timer.kind === 'timeout');
        if (!pending.length) return;
        for (const [id, timer] of pending) { if (timers.delete(id)) timer.callback(); }
      }
      throw new Error('Unexpected callback loop');
    }
  };
  class Node {
    constructor(label) { this.label = label; this.inputs = {}; this.outputs = {}; this.properties = {}; }
    addInput(key, input) { if (this.inputs[key]) throw new Error(`Duplicate input ${key}`); this.inputs[key] = input; }
    addOutput(key, output) { if (this.outputs[key]) throw new Error(`Duplicate output ${key}`); this.outputs[key] = output; }
  }
  class Input {
    constructor(socket, label, multipleConnections = false) { Object.assign(this, { socket, label, multipleConnections }); }
  }
  class Output { constructor(socket, label) { Object.assign(this, { socket, label }); } }
  const definitions = new Map();
  const registry = {
    register: (key, definition) => definitions.set(key, definition),
    get: key => definitions.get(key),
    getByLabel: label => [...definitions.values()].find(definition => definition.label === label)
  };
  const consoleStub = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const context = vm.createContext({
    window: {
      Rete: { ClassicPreset: { Node, Input, Output } },
      React: { createElement: jest.fn(), useState: jest.fn(), useEffect: jest.fn(), useRef: jest.fn() },
      sockets: { any: {}, boolean: {}, number: {}, object: {} },
      nodeRegistry: registry
    },
    console: consoleStub,
    setTimeout: callback => schedule('timeout', callback),
    clearTimeout: clock.clear
  });
  for (const file of ['SubGraphPortNodes.js', 'SubGraphNode.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../plugins', file), 'utf8'), context, { filename: file });
  }
  return { registry, Node, clock, consoleStub };
}

const port = (key, internalNodeId, internalPort) => ({ key, internalNodeId, internalPort, label: key, type: 'any' });
const edge = (source, target, sourceOutput = 'out', targetInput = 'value') => ({ source, sourceOutput, target, targetInput });
const savedNode = (id, properties = {}) => ({ id, type: 'TestProbe', properties });
const directGraph = () => ({
  internalNodes: [savedNode('probe')], internalConnections: [],
  exposedInputs: [port('in_0', 'probe', 'value')],
  exposedOutputs: [port('out_0', 'probe', 'values')]
});
const wrap = properties => ({
  internalNodes: [{ id: 'nested', type: 'SubGraphNode', properties }],
  exposedInputs: [port('in_0', 'nested', 'exp_in_0')],
  exposedOutputs: [port('out_0', 'nested', 'exp_out_0')]
});

describe('SubGraph browser plugins in a VM', () => {
  let env, roots, live, constructed, restored, Probe;
  const registerProbe = (type, NodeClass, label = type) => env.registry.register(type, {
    label, nodeClass: NodeClass, factory: callback => new NodeClass(callback)
  });
  const make = async (properties, callback = jest.fn()) => {
    const node = env.registry.get('SubGraphNode').factory(callback);
    roots.push(node);
    await node.restore({ properties });
    return node;
  };

  beforeEach(() => {
    env = loadPlugins();
    roots = [];
    live = new Set();
    constructed = 0;
    restored = 0;
    Probe = class extends env.Node {
      constructor(callback) {
        super('Probe');
        constructed++;
        live.add(this);
        this.changeCallback = callback;
        this.timer = env.clock.interval(() => this.changeCallback());
        this.changeCallback(); // Constructor notifications must be gated.
      }
      restore(state) { restored++; Object.assign(this.properties, state.properties); this.changeCallback(); }
      data(inputs) { this.received = inputs; return { out: this.properties.result, values: inputs.value }; }
      async dispose() { await Promise.resolve(); env.clock.clear(this.timer); live.delete(this); }
    };
    Probe.inputs = ['value'];
    Probe.outputs = ['out', 'values'];
    registerProbe('TestProbe', Probe, 'Probe Label');
  });

  afterEach(async () => {
    for (const node of roots) await node.destroy();
    expect(live.size).toBe(0);
    expect(env.clock.timers.size).toBe(0);
  });

  test.each([[false], [null], [undefined], [0], [], [false, null, undefined, 7], [[1, 2]]].map(values => [values]))(
    'converted ordinary-node mappings retain %p with existing exp_ socket names', async values => {
      const node = await make(directGraph());
      expect(Object.keys(node.inputs)).toEqual(['trigger', 'exp_in_0']);
      expect(Object.keys(node.outputs)).toEqual(['out', 'exp_out_0']);
      expect(node.inputs.exp_in_0.multipleConnections).toBe(true);
      expect(await node.data({ exp_in_0: values, trigger: [false] })).toEqual({ out: false, exp_out_0: values });
      expect(node.internalNodeInstances.get('probe').received.value).not.toBe(values);
    }
  );

  test('absent, undefined and empty inputs stay distinct; multiple mappings append without flattening payloads', async () => {
    const graph = directGraph();
    const node = await make(graph);
    await node.data({});
    expect(node.internalNodeInstances.get('probe').received).not.toHaveProperty('value');
    await node.data({ exp_in_0: undefined });
    expect(node.internalNodeInstances.get('probe').received.value).toEqual([undefined]);
    await node.data({ exp_in_0: [] });
    expect(node.internalNodeInstances.get('probe').received.value).toEqual([]);
    graph.internalNodes.unshift(savedNode('source', { result: [3, 4] }));
    graph.internalConnections = [edge('source', 'probe')];
    graph.exposedInputs.push(port('in_1', 'probe', 'value'));
    await node.restore({ properties: graph });
    expect((await node.data({ exp_in_0: [false], exp_in_1: [null, undefined] })).exp_out_0)
      .toEqual([false, null, undefined, [3, 4]]);
  });

  test.each([[false], [null], [undefined], [], [false, null, undefined], [[1, 2]]].map(values => [values]))(
    'Input -> ordinary -> Output preserves %p and reads _outputValue', async values => {
      const node = await make({
        internalNodes: [{ id: 'input', type: 'SubGraphInputNode' }, savedNode('probe'), { id: 'output', type: 'SubGraphOutputNode' }],
        internalConnections: [edge('input', 'probe', 'value'), edge('probe', 'output', 'values')],
        exposedInputs: [port('in_0', 'input', 'value')],
        exposedOutputs: [port('out_0', 'output', 'value')]
      });
      expect((await node.data({ exp_in_0: values })).exp_out_0).toEqual(values);
      expect(node.internalNodeInstances.get('probe').received.value).toEqual(values);
      const output = node.internalNodeInstances.get('output');
      expect(output.properties._outputValue).toEqual(values);
      expect(output.properties).not.toHaveProperty('_valueValue');
      expect((await node.data({})).exp_out_0).toEqual([]);
    }
  );

  test.each([null, undefined, false])('Output-node value %p and ordinary output never use stale fallback', async value => {
    const node = await make({
      internalNodes: [savedNode('probe', { result: value, _outValue: 'stale' }), { id: 'output', type: 'SubGraphOutputNode' }],
      internalConnections: [edge('probe', 'output')],
      exposedOutputs: [port('direct', 'probe', 'out'), port('port', 'output', 'value')]
    });
    const result = await node.data({});
    expect(result).toEqual({ out: undefined, exp_direct: value, exp_port: value });
    expect(Object.prototype.hasOwnProperty.call(result, 'exp_port')).toBe(true);
    const output = node.internalNodeInstances.get('output');
    output.properties.portId = 'existing_output_key';
    expect(output.serialize()).toEqual({ portName: 'output', portType: 'any', portId: 'existing_output_key' });
  });

  test('Input/Output ports also work directly, including multiple connections', async () => {
    const node = await make({
      internalNodes: [{ id: 'input', type: 'SubGraphInputNode' }, { id: 'output', type: 'SubGraphOutputNode' }],
      internalConnections: [edge('input', 'output', 'value')],
      exposedInputs: [port('in_0', 'input', 'value')],
      exposedOutputs: [port('out_0', 'output', 'value')]
    });
    for (const values of [[false], [null], [undefined], [false, null], [[1, 2]]]) {
      expect((await node.data({ exp_in_0: values })).exp_out_0).toEqual(values.length > 1 ? values : values[0]);
    }
    const input = node.internalNodeInstances.get('input');
    input.properties.portId = 'existing_input_key';
    expect(input.serialize()).toEqual({ portName: 'input', portType: 'any', portId: 'existing_input_key' });
  });

  test('stable types and normal engine restore precedence win over conflicting labels/properties', async () => {
    const wrong = jest.fn(() => { throw new Error('wrong type'); });
    env.registry.register('Wrong', { factory: wrong, label: 'Wrong' });
    const graph = directGraph();
    graph.internalNodes[0] = { id: 'probe', type: 'TestProbe', name: 'Wrong', label: 'Wrong', properties: { result: 1 }, data: { properties: { result: null } } };
    graph.exposedOutputs[0].internalPort = 'out';
    const node = await make(graph);
    expect((await node.data({})).exp_out_0).toBeNull();
    expect(wrong).not.toHaveBeenCalled();
    graph.internalNodes[0] = { id: 'probe', type: 'Legacy', label: 'Probe Label', data: { result: false } };
    await node.restore({ properties: { internalNodes: [] }, data: { properties: graph } });
    expect((await node.data({})).exp_out_0).toBe(false);
    graph.internalNodes[0] = { id: 'probe', name: 'TestProbe', properties: { result: 7 } };
    await node.restore(graph);
    expect((await node.data({})).exp_out_0).toBe(7);
  });

  test('mutating runtime config never mutates the caller/save or recreates instances each tick', async () => {
    class Mutating extends Probe {
      restore(state) { super.restore(state); this.properties.config.list.push('restore'); }
      data() { this.properties.config.list.push('tick'); return { out: this.properties.config.list.length }; }
    }
    registerProbe('TestProbe', Mutating);
    const graph = directGraph();
    graph.internalNodes[0].properties = { config: { list: ['saved'], nullable: null, absent: undefined } };
    const node = await make(graph);
    const saved = node.serialize();
    await node.data({});
    const first = node.internalNodeInstances.get('probe');
    await node.data({});
    expect(node.internalNodeInstances.get('probe')).toBe(first);
    expect(first.properties.config.list).toEqual(['saved', 'restore', 'tick', 'tick']);
    expect(node.serialize()).toEqual(saved);
    expect(graph.internalNodes[0].properties.config.list).toEqual(['saved']);
    saved.internalNodes[0].properties.config.list.push('external edit');
    expect(node.properties.internalNodes[0].properties.config.list).toEqual(['saved']);
    expect(constructed).toBe(1);
    expect(restored).toBe(1);
    node.properties.exposedOutputs[0].internalPort = 'out';
    expect((await node.data({})).exp_out_0).toBe(3);
    expect(constructed).toBe(2);
    expect(live.size).toBe(1);
  });

  const invalidCases = [
    ['duplicates', () => ({ internalNodes: [savedNode('a'), savedNode('a')] }), /duplicate/i],
    ['cycles', () => ({ internalNodes: [savedNode('a'), savedNode('b')], internalConnections: [edge('a', 'b'), edge('b', 'a')] }), /cycle/i],
    ['self-cycle', () => ({ internalNodes: [savedNode('a')], internalConnections: [edge('a', 'a')] }), /cycle/i],
    ['unknown type', () => ({ internalNodes: [savedNode('a'), { id: 'b', type: 'Missing' }] }), /unknown/i],
    ['dangling node', () => ({ internalNodes: [savedNode('a')], internalConnections: [edge('a', 'missing')] }), /unknown/i],
    ['static input metadata', () => ({ internalNodes: [savedNode('a'), savedNode('b')], internalConnections: [edge('a', 'b', 'out', 'missing')] }), /dangling/i],
    ['saved output metadata', () => ({ internalNodes: [{ ...savedNode('a'), outputs: {} }], exposedOutputs: [port('x', 'a', 'out')] }), /dangling/i],
    ['exposed target', () => ({ internalNodes: [savedNode('a')], exposedInputs: [port('x', 'missing', 'value')] }), /unknown/i],
    ['exposed socket', () => ({ internalNodes: [savedNode('a')], exposedOutputs: [port('x', 'a', 'missing')] }), /dangling/i],
    ['output-port socket', () => ({ internalNodes: [{ id: 'a', type: 'SubGraphOutputNode' }], exposedOutputs: [port('x', 'a', 'missing')] }), /dangling/i]
  ];
  test.each(invalidCases)('%s rejected before any constructor/restore effects, even nested', async (_name, definition, error) => {
    for (const nested of [false, true]) {
      const invalid = definition();
      const graph = nested ? { internalNodes: [savedNode('before'), { id: 'nested', type: 'SubGraphNode', properties: invalid }] } : invalid;
      const node = await make(graph);
      await expect(node.data({})).rejects.toThrow(error);
      expect(node.internalNodeInstances.size).toBe(0);
      expect(constructed).toBe(0);
      expect(restored).toBe(0);
      expect(env.clock.timers.size).toBe(0);
    }
  });

  test('eight nested levels work, ninth and recursive references fail without allocating timers', async () => {
    let graph = directGraph();
    for (let depth = 1; depth < 8; depth++) graph = wrap(graph);
    const invalid = await make(wrap(graph));
    await expect(invalid.data({})).rejects.toThrow(/8 levels/);
    expect(constructed).toBe(0);
    const recursive = await make({});
    recursive.properties.internalNodes = [{ id: 'loop', type: 'SubGraphNode', properties: recursive.properties }];
    await expect(recursive.data({})).rejects.toThrow(/recursive/i);
    expect(constructed).toBe(0);
    const valid = await make(graph);
    expect((await valid.data({ exp_in_0: [false, null] })).exp_out_0).toEqual([false, null]);
    expect(constructed).toBe(1);
  });

  test('node budget spans nested siblings; 1000 ordinary nodes are accepted', async () => {
    const subtree = () => ({ internalNodes: Array.from({ length: 500 }, (_, i) => savedNode(`n${i}`)) });
    const invalid = await make({ internalNodes: [
      { id: 'left', type: 'SubGraphNode', properties: subtree() },
      { id: 'right', type: 'SubGraphNode', properties: subtree() }
    ] });
    await expect(invalid.data({})).rejects.toThrow(/1000/);
    expect(constructed).toBe(0);
    const valid = await make({ internalNodes: Array.from({ length: 1000 }, (_, i) => savedNode(`n${i}`)) });
    await expect(valid.data({})).resolves.toEqual({ out: undefined });
    expect(constructed).toBe(1000);
  });

  test.each(['constructor', 'restore'])('%s failure disposes returned candidates and gates their callbacks', async phase => {
    class Broken extends Probe {
      constructor(callback) { if (phase === 'constructor') throw new Error('failed constructor'); super(callback); }
      async restore(state) { super.restore(state); await Promise.resolve(); throw new Error('failed restore'); }
    }
    registerProbe('Broken', Broken);
    const callback = jest.fn();
    const node = await make({ internalNodes: [savedNode('before'), { id: 'broken', type: 'Broken' }] }, callback);
    await expect(node.data({})).rejects.toThrow(/failed/);
    expect(live.size).toBe(0);
    expect(env.clock.timers.size).toBe(0);
    expect(node.internalNodeInstances.size).toBe(0);
    expect(callback).not.toHaveBeenCalled();
  });

  test('internal timer/change callbacks coalesce outside active data, then become inert on disposal', async () => {
    let entered, release;
    const started = new Promise(resolve => { entered = resolve; });
    const pending = new Promise(resolve => { release = resolve; });
    class Slow extends Probe {
      async data(inputs) { this.changeCallback(); entered(); await pending; return super.data(inputs); }
    }
    registerProbe('TestProbe', Slow);
    const callback = jest.fn();
    const node = await make(directGraph(), callback);
    const running = node.data({ exp_in_0: [true] });
    await started;
    const internal = node.internalNodeInstances.get('probe');
    env.clock.tickIntervals();
    env.clock.flushTimeouts();
    expect(callback).not.toHaveBeenCalled();
    release();
    await running;
    expect(callback).not.toHaveBeenCalled();
    env.clock.flushTimeouts();
    expect(callback).toHaveBeenCalledTimes(1);
    internal.changeCallback();
    internal.changeCallback();
    env.clock.flushTimeouts();
    expect(callback).toHaveBeenCalledTimes(2);
    internal.changeCallback(); // A queued change is cancelled synchronously.
    const cleanup = node.destroy();
    internal.changeCallback();
    env.clock.flushTimeouts();
    await cleanup;
    internal.changeCallback();
    env.clock.flushTimeouts();
    expect(callback).toHaveBeenCalledTimes(2);
  });

  test('deep restore failures dispose the entire candidate tree, including outer siblings', async () => {
    class Broken extends Probe {
      async restore(state) { super.restore(state); throw new Error('deep restore failed'); }
    }
    registerProbe('Broken', Broken);
    const callback = jest.fn();
    const node = await make({ internalNodes: [savedNode('sibling'), {
      id: 'nested', type: 'SubGraphNode', properties: {
        internalNodes: [savedNode('before'), { id: 'broken', type: 'Broken' }]
      }
    }] }, callback);
    await expect(node.data({})).rejects.toThrow(/deep restore/);
    env.clock.flushTimeouts();
    expect(live.size).toBe(0);
    expect(env.clock.timers.size).toBe(0);
    expect(node.internalNodeInstances.size).toBe(0);
    expect(callback).not.toHaveBeenCalled();
  });

  test('process-only nodes receive isolated properties and no invented context argument', async () => {
    class ProcessOnly extends env.Node {
      async process(inputs) { expect(arguments.length).toBe(1); return { out: inputs.value }; }
    }
    registerProbe('ProcessOnly', ProcessOnly);
    const graph = { internalNodes: [{ id: 'p', type: 'ProcessOnly', properties: { config: { value: 1 } } }],
      exposedInputs: [port('x', 'p', 'value')], exposedOutputs: [port('y', 'p', 'out')] };
    const node = await make(graph);
    expect((await node.data({ exp_x: [null, false] })).exp_y).toEqual([null, false]);
    node.internalNodeInstances.get('p').properties.config.value = 2;
    expect(node.properties.internalNodes[0].properties.config.value).toBe(1);
    expect(graph.internalNodes[0].properties.config.value).toBe(1);
  });

  test('nested timer callbacks reach the parent, but replaced-runtime callbacks do not', async () => {
    const callback = jest.fn();
    const node = await make(wrap(directGraph()), callback);
    await node.data({ exp_in_0: [false] });
    env.clock.flushTimeouts();
    expect(callback).not.toHaveBeenCalled(); // Construction/restore gated.
    const old = node.internalNodeInstances.get('nested').internalNodeInstances.get('probe');
    env.clock.tickIntervals();
    env.clock.flushTimeouts();
    expect(callback).toHaveBeenCalledTimes(1);
    await node.restore(wrap(directGraph()));
    await node.data({ exp_in_0: [true] });
    old.changeCallback();
    env.clock.flushTimeouts();
    expect(callback).toHaveBeenCalledTimes(1);
  });

  test('rejected async cleanup/callback promises are handled', async () => {
    class Rejecting extends Probe {
      async destroy() { await super.dispose(); throw new Error('cleanup rejected'); }
    }
    registerProbe('TestProbe', Rejecting);
    const callback = jest.fn(() => Promise.reject(new Error('callback rejected')));
    const node = await make(directGraph(), callback);
    await node.data({});
    env.clock.tickIntervals();
    env.clock.flushTimeouts();
    await Promise.resolve();
    await expect(node.destroy()).resolves.toBeUndefined();
    expect(env.consoleStub.warn).toHaveBeenCalledTimes(2);
  });

  test('destroy waits for active data, gates callbacks immediately, and skips downstream data', async () => {
    let entered, release;
    const started = new Promise(resolve => { entered = resolve; });
    const pending = new Promise(resolve => { release = resolve; });
    class Slow extends Probe { async data() { entered(); await pending; return { out: true }; } }
    registerProbe('Slow', Slow);
    const callback = jest.fn();
    const node = await make({ internalNodes: [{ id: 'slow', type: 'Slow' }, savedNode('after')], internalConnections: [edge('slow', 'after')] }, callback);
    const running = node.data({});
    const rejection = expect(running).rejects.toThrow(/cancelled/);
    await started;
    const after = node.internalNodeInstances.get('after');
    const cleanup = node.destroy();
    env.clock.tickIntervals();
    env.clock.flushTimeouts();
    expect(callback).not.toHaveBeenCalled();
    expect(live.size).toBe(2);
    release();
    await rejection;
    await cleanup;
    expect(after.received).toBeUndefined();
    expect(live.size).toBe(0);
  });
});