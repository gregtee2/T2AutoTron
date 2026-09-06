const registry = require('../src/engine/BackendNodeRegistry');
const { SubGraphNode, register } = require('../src/engine/nodes/SubGraphNode');

class DoubleNode {
  constructor() {
    this.properties = {};
  }

  restore(state) {
    Object.assign(this.properties, state?.properties || {});
  }

  data(inputs) {
    return { out: (inputs.value?.[0] || 0) * 2 };
  }
}

registry.register('SubGraphDoubleNode', DoubleNode);

describe('SubGraphNode', () => {
  test('evaluates internal nodes and exposed ports', async () => {
    const node = new SubGraphNode('subgraph', {
      internalNodes: [
        { id: 'input', name: 'SubGraphInputNode', properties: {} },
        { id: 'double', name: 'SubGraphDoubleNode', properties: {} },
        { id: 'output', name: 'SubGraphOutputNode', properties: {} }
      ],
      internalConnections: [
        { source: 'input', sourceOutput: 'value', target: 'double', targetInput: 'value' },
        { source: 'double', sourceOutput: 'out', target: 'output', targetInput: 'value' }
      ],
      exposedInputs: [{
        key: 'number',
        internalNodeId: 'input',
        internalPort: 'value'
      }],
      exposedOutputs: [{
        key: 'result',
        internalNodeId: 'output',
        internalPort: 'value'
      }]
    });

    const result = await node.process({ 'exp_number': [21] });

    expect(result.out).toBeUndefined();
    expect(result.exp_result).toBe(42);
    await node.destroy();
  });

  test('rejects cycles in internal graphs', async () => {
    const node = new SubGraphNode('cyclic', {
      internalNodes: [
        { id: 'a', name: 'SubGraphDoubleNode', properties: {} },
        { id: 'b', name: 'SubGraphDoubleNode', properties: {} }
      ],
      internalConnections: [
        { source: 'a', sourceOutput: 'out', target: 'b', targetInput: 'value' },
        { source: 'b', sourceOutput: 'out', target: 'a', targetInput: 'value' }
      ]
    });

    await expect(node.process({})).rejects.toThrow(/Subgraph contains a cycle/i);
    await node.destroy();
  });
});

const port = (key, internalNodeId, internalPort) => ({ key, internalNodeId, internalPort });
const edge = (source, target, sourceOutput = 'out', targetInput = 'value') => ({ source, sourceOutput, target, targetInput });
const savedNode = (id, properties = {}) => ({ id, type: 'TestProbe', properties });
const directGraph = () => ({
  internalNodes: [savedNode('probe')],
  exposedInputs: [port('in_0', 'probe', 'value')],
  exposedOutputs: [port('out_0', 'probe', 'values')]
});
const wrap = properties => ({
  internalNodes: [{ id: 'nested', type: 'SubGraphNode', properties }],
  exposedInputs: [port('in_0', 'nested', 'exp_in_0')],
  exposedOutputs: [port('out_0', 'nested', 'exp_out_0')]
});

describe('SubGraph backend regression contract (no devices)', () => {
  let originalRegistry, roots, live, constructed, restored, Probe;
  const make = properties => {
    const node = new SubGraphNode('root', properties);
    roots.push(node);
    return node;
  };

  beforeEach(() => {
    originalRegistry = new Map(registry.nodes);
    roots = [];
    live = new Set();
    constructed = 0;
    restored = 0;
    Probe = class {
      constructor(...args) {
        expect(args).toEqual([]); // No invented engine/context argument.
        constructed++;
        live.add(this);
        this.properties = {};
      }
      restore(state) { restored++; Object.assign(this.properties, state.properties); }
      data(inputs) {
        this.received = inputs;
        return { out: this.properties.result, values: inputs.value, present: Object.prototype.hasOwnProperty.call(inputs, 'value') };
      }
      async dispose() { await Promise.resolve(); live.delete(this); }
    };
    Probe.inputs = ['value'];
    Probe.outputs = ['out', 'values', 'present'];
    registry.register('TestProbe', Probe);
    register(registry);
  });

  afterEach(async () => {
    for (const node of roots) await node.destroy();
    expect(live.size).toBe(0);
    registry.nodes = originalRegistry;
    jest.restoreAllMocks();
  });

  test.each([
    [false], [null], [undefined], [0], [], [false, null, undefined, 7], [[1, 2]]
  ].map(values => [values]))('direct ordinary input retains connection-list %p', async values => {
    const node = make(directGraph());
    const result = await node.process({ exp_in_0: values, trigger: [false] });
    expect(result).toEqual({ exp_out_0: values, out: false });
    expect(node.internalNodeInstances.get('probe').received.value).not.toBe(values);
    expect(values).toEqual(result.exp_out_0);
  });

  test('absent, explicitly undefined and empty inputs stay distinguishable', async () => {
    const node = make(directGraph());
    await node.process({});
    expect(node.internalNodeInstances.get('probe').received).not.toHaveProperty('value');
    await node.process({ exp_in_0: undefined });
    expect(node.internalNodeInstances.get('probe').received.value).toEqual([undefined]);
    await node.process({ exp_in_0: [] });
    expect(node.internalNodeInstances.get('probe').received.value).toEqual([]);
  });

  test.each([[false], [null], [undefined], [], [false, null, undefined], [[1, 2]]].map(values => [values]))(
    'port nodes forward the list without introducing another array: %p', async values => {
      const node = make({
        internalNodes: [{ id: 'input', type: 'SubGraphInputNode' }, savedNode('probe'), { id: 'output', type: 'SubGraphOutputNode' }],
        internalConnections: [edge('input', 'probe', 'value'), edge('probe', 'output', 'values')],
        exposedInputs: [port('in_0', 'input', 'value')],
        exposedOutputs: [port('out_0', 'output', 'value')]
      });
      expect((await node.process({ exp_in_0: values })).exp_out_0).toEqual(values);
      expect(node.internalNodeInstances.get('probe').received.value).toEqual(values);
      expect((await node.process({})).exp_out_0).toEqual([]); // No stale input.
    }
  );

  test.each([null, undefined, false])('legitimate output %p never uses stale property fallback', async value => {
    const graph = directGraph();
    graph.internalNodes[0].properties = { result: value, _outValue: 'stale' };
    graph.exposedOutputs[0].internalPort = 'out';
    const result = await make(graph).process({});
    expect(Object.prototype.hasOwnProperty.call(result, 'exp_out_0')).toBe(true);
    expect(result.exp_out_0).toBe(value);
  });

  test('multiple exposed mappings append to the same ordinary input; array outputs remain messages', async () => {
    const graph = directGraph();
    graph.internalNodes.unshift(savedNode('source', { result: [3, 4] }));
    graph.internalConnections = [edge('source', 'probe')];
    graph.exposedInputs.push(port('in_1', 'probe', 'value'));
    expect((await make(graph).process({ exp_in_0: [false], exp_in_1: [null, undefined] })).exp_out_0)
      .toEqual([false, null, undefined, [3, 4]]);
  });

  test('stable type beats misleading name/label and data.properties beats properties', async () => {
    const wrong = jest.fn(() => { throw new Error('wrong type'); });
    registry.register('Wrong', wrong);
    const node = make({
      internalNodes: [{ id: 'probe', type: 'TestProbe', name: 'Wrong', label: 'Compare', properties: { result: 'wrong' }, data: { properties: { result: null } } }],
      exposedOutputs: [port('out_0', 'probe', 'out')]
    });
    expect((await node.process({})).exp_out_0).toBeNull();
    expect(wrong).not.toHaveBeenCalled();
    expect(node.internalNodeInstances.get('probe').type).toBe('TestProbe');
  });

  test('backend getByLabel returns {name, NodeClass}; legacy data and stable name work', async () => {
    registry.register('CompareNode', Probe);
    const node = make({
      internalNodes: [{ id: 'probe', type: 'OldType', label: 'Compare', data: { result: false } }],
      exposedOutputs: [port('out_0', 'probe', 'out')]
    });
    expect((await node.process({})).exp_out_0).toBe(false);
    expect(node.internalNodeInstances.get('probe').type).toBe('CompareNode');
    await node.restore({ internalNodes: [{ id: 'probe', name: 'TestProbe', properties: { result: 12 } }] });
    expect((await node.process({})).exp_out_0).toBe(12);
  });

  test('restore and tick mutations never change the definition or reinitialize on the next tick', async () => {
    class Mutating extends Probe {
      restore(state) { super.restore(state); this.properties.config.list.push('restore'); }
      data() { this.properties.config.list.push('tick'); return { out: this.properties.config.list.length }; }
    }
    registry.register('TestProbe', Mutating);
    const graph = directGraph();
    graph.internalNodes[0].properties = { config: { list: ['saved'], nullable: null, absent: undefined } };
    const node = make(graph);
    await node.process({});
    const first = node.internalNodeInstances.get('probe');
    await node.process({});
    expect(node.internalNodeInstances.get('probe')).toBe(first);
    expect(first.properties.config.list).toEqual(['saved', 'restore', 'tick', 'tick']);
    expect(node.properties.internalNodes[0].properties).toEqual(graph.internalNodes[0].properties);
    expect(graph.internalNodes[0].properties.config.list).toEqual(['saved']);
    expect(constructed).toBe(1);
    expect(restored).toBe(1);
    node.properties.exposedOutputs[0].internalPort = 'out';
    expect((await node.process({})).exp_out_0).toBe(3);
    expect(constructed).toBe(2); // Mapping changes do invalidate the runtime.
    expect(live.size).toBe(1);
  });

  const invalidCases = [
    ['duplicate', () => ({ internalNodes: [savedNode('a'), savedNode('a')] }), /duplicate/i],
    ['cycle', () => ({ internalNodes: [savedNode('a'), savedNode('b')], internalConnections: [edge('a', 'b'), edge('b', 'a')] }), /cycle/i],
    ['self-cycle', () => ({ internalNodes: [savedNode('a')], internalConnections: [edge('a', 'a')] }), /cycle/i],
    ['unknown node', () => ({ internalNodes: [savedNode('a'), { id: 'b', type: 'Unregistered' }] }), /unknown/i],
    ['dangling connection', () => ({ internalNodes: [savedNode('a')], internalConnections: [edge('a', 'missing')] }), /unknown/i],
    ['static socket metadata', () => ({ internalNodes: [savedNode('a'), savedNode('b')], internalConnections: [edge('a', 'b', 'missing')] }), /dangling/i],
    ['saved socket metadata', () => ({ internalNodes: [{ ...savedNode('a'), inputs: {} }], exposedInputs: [port('x', 'a', 'value')] }), /dangling/i],
    ['exposed target', () => ({ internalNodes: [savedNode('a')], exposedInputs: [port('x', 'missing', 'value')] }), /unknown/i],
    ['exposed output', () => ({ internalNodes: [savedNode('a')], exposedOutputs: [port('x', 'a', 'missing')] }), /dangling/i],
    ['port-node socket', () => ({ internalNodes: [{ id: 'a', type: 'SubGraphInputNode' }], exposedInputs: [port('x', 'a', 'missing')] }), /dangling/i]
  ];
  test.each(invalidCases)('%s rejected before constructors/restore (including nested)', async (_name, definition, error) => {
    for (const nested of [false, true]) {
      const invalid = definition();
      const graph = nested ? { internalNodes: [savedNode('before'), { id: 'nested', type: 'SubGraphNode', properties: invalid }] } : invalid;
      const node = make(graph);
      await expect(node.process({})).rejects.toThrow(error);
      expect(node.internalNodeInstances.size).toBe(0);
      expect(constructed).toBe(0);
      expect(restored).toBe(0);
    }
  });

  test('eight levels work; nine levels and recursive objects fail before effects', async () => {
    let graph = directGraph();
    for (let depth = 1; depth < 8; depth++) graph = wrap(graph);
    const invalid = make(wrap(graph));
    await expect(invalid.process({})).rejects.toThrow(/8 levels/);
    expect(constructed).toBe(0);
    const recursive = make({});
    recursive.properties.internalNodes = [{ id: 'loop', type: 'SubGraphNode', properties: recursive.properties }];
    await expect(recursive.process({})).rejects.toThrow(/recursive/i);
    expect(constructed).toBe(0);
    expect((await make(graph).process({ exp_in_0: [false, null] })).exp_out_0).toEqual([false, null]);
    expect(constructed).toBe(1);
  });

  test('1000-node budget includes all nested siblings, not just each graph separately', async () => {
    const subtree = () => ({ internalNodes: Array.from({ length: 500 }, (_, i) => savedNode(`n${i}`)) });
    const node = make({ internalNodes: [
      { id: 'left', type: 'SubGraphNode', properties: subtree() },
      { id: 'right', type: 'SubGraphNode', properties: subtree() }
    ] });
    await expect(node.process({})).rejects.toThrow(/1000/);
    expect(constructed).toBe(0);
    await expect(make({ internalNodes: Array.from({ length: 1000 }, (_, i) => savedNode(`n${i}`)) }).process({})).resolves.toEqual({ out: undefined });
    expect(constructed).toBe(1000);
  });

  test.each(['constructor', 'restore'])('%s failure disposes all returned candidates asynchronously', async phase => {
    class Broken extends Probe {
      constructor() { if (phase === 'constructor') throw new Error('failed constructor'); super(); }
      async restore(state) { super.restore(state); await Promise.resolve(); throw new Error('failed restore'); }
    }
    registry.register('Broken', Broken);
    const node = make({ internalNodes: [savedNode('first'), { id: 'broken', type: 'Broken' }] });
    await expect(node.process({})).rejects.toThrow(/failed/);
    expect(live.size).toBe(0);
    expect(node.internalNodeInstances.size).toBe(0);
  });

  test('cleanup rejection is handled and does not stop disposal of other candidates', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    class Rejecting extends Probe {
      async destroy() { live.delete(this); throw new Error('cleanup rejected'); }
    }
    registry.register('Rejecting', Rejecting);
    const node = make({ internalNodes: [{ id: 'a', type: 'Rejecting' }, savedNode('b')] });
    await node.process({});
    await expect(node.destroy()).resolves.toBeUndefined();
    expect(live.size).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  test('nested initialization failure also cleans up outer siblings', async () => {
    class Broken extends Probe {
      async restore(state) { super.restore(state); throw new Error('deep restore failed'); }
    }
    registry.register('Broken', Broken);
    const node = make({ internalNodes: [savedNode('sibling'), {
      id: 'nested', type: 'SubGraphNode', properties: {
        internalNodes: [savedNode('before'), { id: 'broken', type: 'Broken' }]
      }
    }] });
    await expect(node.process({})).rejects.toThrow(/deep restore/);
    expect(live.size).toBe(0);
    expect(node.internalNodeInstances.size).toBe(0);
  });

  test('process-only nodes get one argument and isolated properties without restore', async () => {
    class ProcessOnly {
      constructor() { this.properties = {}; }
      async process(inputs) { expect(arguments.length).toBe(1); return { out: inputs.value }; }
    }
    registry.register('ProcessOnly', ProcessOnly);
    const graph = { internalNodes: [{ id: 'p', type: 'ProcessOnly', properties: { config: { value: 1 } } }],
      exposedInputs: [port('x', 'p', 'value')], exposedOutputs: [port('y', 'p', 'out')] };
    const node = make(graph);
    expect((await node.process({ exp_x: [null, false] })).exp_y).toEqual([null, false]);
    node.internalNodeInstances.get('p').properties.config.value = 2;
    expect(node.properties.internalNodes[0].properties.config.value).toBe(1);
    expect(graph.internalNodes[0].properties.config.value).toBe(1);
  });

  test('Input -> Output supports scalar null/false/undefined and multiple messages', async () => {
    const node = make({
      internalNodes: [{ id: 'input', type: 'SubGraphInputNode' }, { id: 'output', type: 'SubGraphOutputNode' }],
      internalConnections: [edge('input', 'output', 'value')],
      exposedInputs: [port('x', 'input', 'value')], exposedOutputs: [port('y', 'output', 'value')]
    });
    for (const values of [[false], [null], [undefined], [false, null], [[1, 2]]]) {
      expect((await node.process({ exp_x: values })).exp_y).toEqual(values.length > 1 ? values : values[0]);
    }
  });

  test('destroy waits for active data and prevents downstream evaluation', async () => {
    let entered, release;
    const started = new Promise(resolve => { entered = resolve; });
    const pending = new Promise(resolve => { release = resolve; });
    class Slow extends Probe {
      async data() { entered(); await pending; return { out: true }; }
    }
    registry.register('Slow', Slow);
    const node = make({ internalNodes: [{ id: 'slow', type: 'Slow' }, savedNode('after')], internalConnections: [edge('slow', 'after')] });
    const running = node.process({});
    const rejection = expect(running).rejects.toThrow(/cancelled/);
    await started;
    const after = node.internalNodeInstances.get('after');
    const cleanup = node.destroy();
    expect(live.size).toBe(2);
    release();
    await rejection;
    await cleanup;
    expect(after.received).toBeUndefined();
    expect(live.size).toBe(0);
  });
});