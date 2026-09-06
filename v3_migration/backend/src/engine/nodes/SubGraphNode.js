/**
 * Bounded nested dataflow. Uses the backend singleton registry, not an engine
 * context. This does not supply missing ownership/reconciliation hooks to nodes.
 */
const backendRegistry = require('../BackendNodeRegistry');
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
const getNodeProperties = node => node?.data?.properties || node?.properties || node?.data || {};
const getRestoreProperties = state => state?.data?.properties || state?.properties || state?.data || state || {};
const nodeTypes = node => [node?.type, node?.name, node?.data?.type, node?.data?.name].filter(Boolean);

// Retain undefined (unlike JSON round-tripping), reject recursive data and
// bound cloning before recursive graph validation runs. Keep in sync with plugin.
function cloneConfig(value, ancestors = new Set(), budget = { count: 0 }, depth = 0) {
    if (++budget.count > 100000 || depth > 128) throw new Error('Subgraph configuration is too large/deep');
    if (value === null || typeof value !== 'object') {
        if (['function', 'symbol', 'bigint'].includes(typeof value)) throw new Error('Subgraph configuration must be plain data');
        return value;
    }
    if (ancestors.has(value)) throw new Error('Subgraph configuration contains a recursive reference');
    ancestors.add(value);
    const copy = Array.isArray(value) ? new Array(value.length) : {};
    for (const key of Object.keys(value)) {
        Object.defineProperty(copy, key, {
            value: cloneConfig(value[key], ancestors, budget, depth + 1),
            enumerable: true, configurable: true, writable: true
        });
    }
    ancestors.delete(value);
    return copy;
}

function sameConfig(a, b) {
    if (Object.is(a, b)) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a) && a.length !== b.length) return false;
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(key => hasOwn(b, key) && sameConfig(a[key], b[key]));
}

function valuesFor(inputs, key) {
    if (!hasOwn(inputs, key)) return [];
    return Array.isArray(inputs[key]) ? inputs[key].slice() : [inputs[key]];
}

const portValue = values => values.length > 1 ? values.slice() : values[0];

class SubGraphInputNode {
    constructor() {
        this.type = 'SubGraphInputNode';
        this.label = 'SubGraph Input';
        this.properties = { portName: 'input', portType: 'any' };
    }

    restore(state) { Object.assign(this.properties, cloneConfig(getRestoreProperties(state))); }
    data() {
        return { value: hasOwn(this, '_inputValues') ? portValue(this._inputValues) : this.properties._inputValue };
    }
}

class SubGraphOutputNode {
    constructor() {
        this.type = 'SubGraphOutputNode';
        this.label = 'SubGraph Output';
        this.properties = { portName: 'output', portType: 'any' };
    }

    restore(state) { Object.assign(this.properties, cloneConfig(getRestoreProperties(state))); }
    data(inputs) {
        const value = portValue(valuesFor(inputs, 'value'));
        this.properties._outputValue = value;
        return { value };
    }
}

function resolveNode(node) {
    const builtins = new Map(Object.entries({ SubGraphNode, SubGraphInputNode, SubGraphOutputNode }));
    const types = nodeTypes(node);
    let NodeClass;
    let type;
    for (const candidate of types) {
        NodeClass = backendRegistry.get(candidate) || builtins.get(candidate);
        if (NodeClass) { type = candidate; break; }
    }
    if (!NodeClass) {
        const aliases = new Map([['SubGraph Input', 'SubGraphInputNode'], ['SubGraph Output', 'SubGraphOutputNode'], ['Sub-Graph', 'SubGraphNode']]);
        for (const label of [...types, node.label].filter(Boolean)) {
            const portType = aliases.get(label);
            const match = backendRegistry.getByLabel?.(label);
            NodeClass = match?.NodeClass || builtins.get(portType);
            if (NodeClass) { type = match?.name || portType; break; }
        }
    }
    if (typeof NodeClass !== 'function') throw new Error(`Unknown internal node type: ${types[0] || node.label || 'unknown'}`);
    const kind = NodeClass === SubGraphNode ? 'graph' : NodeClass === SubGraphInputNode ? 'input' : NodeClass === SubGraphOutputNode ? 'output' : 'ordinary';
    return { NodeClass, type, kind };
}

function portKeys(record, side) {
    if (record.kind === 'input') return side === 'outputs' ? ['value'] : [];
    if (record.kind === 'output') return side === 'inputs' ? ['value'] : [];
    if (record.kind === 'graph') {
        const exposed = record.properties[side === 'inputs' ? 'exposedInputs' : 'exposedOutputs'] || [];
        return [side === 'inputs' ? 'trigger' : 'out', ...exposed.map(port => `exp_${port.key}`)];
    }
    // Never construct just to discover sockets. Legacy types without saved or
    // static metadata cannot have their port names checked before construction.
    const metadata = record.node[side] ?? record.node.data?.[side] ?? record.NodeClass[side];
    if (Array.isArray(metadata)) {
        const keys = metadata.map(port => typeof port === 'string' ? port : port?.key);
        return keys.every(key => typeof key === 'string') ? keys : null;
    }
    return metadata && typeof metadata === 'object' ? Object.keys(metadata) : null;
}

function validateGraph(properties, budget = { nodes: 0 }, depth = 1) {
    if (depth > 8) throw new Error('Subgraph nesting exceeds 8 levels');
    const nodes = properties.internalNodes || [];
    const connections = properties.internalConnections || [];
    const exposedInputs = properties.exposedInputs || [];
    const exposedOutputs = properties.exposedOutputs || [];
    if (![nodes, connections, exposedInputs, exposedOutputs].every(Array.isArray)) throw new Error('Subgraph nodes/connections/ports must be arrays');
    budget.nodes += nodes.length;
    if (budget.nodes > 1000) throw new Error('Subgraph exceeds 1000 internal nodes');
    const records = new Map();
    for (const node of nodes) {
        if (!node || typeof node.id !== 'string' || !node.id) throw new Error('Subgraph node requires an id');
        if (records.has(node.id)) throw new Error(`Duplicate subgraph node id: ${node.id}`);
        const record = { node, properties: getNodeProperties(node), ...resolveNode(node) };
        records.set(node.id, record);
        if (record.kind === 'graph') validateGraph(record.properties, budget, depth + 1);
    }
    const checkPort = (id, port, side) => {
        const record = records.get(id);
        if (!record) throw new Error(`Subgraph port references an unknown node: ${id}`);
        const keys = portKeys(record, side);
        if (typeof port !== 'string' || !port || (keys && !keys.includes(port))) throw new Error(`Dangling subgraph ${side} port: ${id}.${port}`);
    };
    const degrees = new Map(nodes.map(node => [node.id, 0]));
    const outgoing = new Map(nodes.map(node => [node.id, []]));
    for (const connection of connections) {
        if (!connection) throw new Error('Invalid subgraph connection');
        checkPort(connection.source, connection.sourceOutput, 'outputs');
        checkPort(connection.target, connection.targetInput, 'inputs');
        outgoing.get(connection.source).push(connection.target);
        degrees.set(connection.target, degrees.get(connection.target) + 1);
    }
    for (const [ports, side] of [[exposedInputs, 'inputs'], [exposedOutputs, 'outputs']]) {
        const keys = new Set();
        for (const port of ports) {
            if (!port || typeof port.key !== 'string' || !port.key || keys.has(port.key)) throw new Error('Invalid/duplicate exposed subgraph port key');
            keys.add(port.key);
            const kind = records.get(port.internalNodeId)?.kind;
            const mappedSide = side === 'inputs' && kind === 'input' ? 'outputs' : side === 'outputs' && kind === 'output' ? 'inputs' : side;
            checkPort(port.internalNodeId, port.internalPort, mappedSide);
        }
    }
    const order = nodes.filter(node => degrees.get(node.id) === 0).map(node => node.id);
    for (let index = 0; index < order.length; index++) {
        for (const target of outgoing.get(order[index])) {
            degrees.set(target, degrees.get(target) - 1);
            if (degrees.get(target) === 0) order.push(target);
        }
    }
    if (order.length !== nodes.length) throw new Error('Subgraph contains a cycle');
    return { records, order, connections, exposedInputs, exposedOutputs };
}

async function cleanupNodes(nodes) {
    for (const node of nodes) {
        try {
            if (typeof node.destroy === 'function') await node.destroy();
            else if (typeof node.dispose === 'function') await node.dispose();
        } catch (error) {
            console.warn('[SubGraphNode] Internal node cleanup failed:', error);
        }
    }
}

class SubGraphNode {
    constructor(id, properties = {}) {
        this.id = id;
        this.type = 'SubGraphNode';
        this.properties = {
            name: 'Untitled Sub-Graph', description: '', icon: '📦',
            internalNodes: [], internalConnections: [], exposedInputs: [], exposedOutputs: [],
            ...cloneConfig(properties)
        };
        this.internalNodeInstances = new Map();
        this.internalExecutionOrder = [];
        this.initialized = false;
        this._tail = Promise.resolve();
        this._generation = 0;
        this._disposed = false;
        this._configuration = null;
        this._plan = null;
    }

    _enqueue(operation) {
        const task = this._tail.then(operation);
        // Caller still receives rejection; ignored lifecycle promises cannot
        // become unhandled rejections or poison the operation queue.
        this._tail = task.catch(() => {});
        return task;
    }

    restore(state) {
        Object.assign(this.properties, cloneConfig(getRestoreProperties(state)));
        return this.disposeInternalGraph();
    }

    async _clearInternalGraph() {
        const nodes = Array.from(this.internalNodeInstances.values());
        this.internalNodeInstances.clear();
        this.internalExecutionOrder = [];
        this._configuration = null;
        this._plan = null;
        this.initialized = false;
        await cleanupNodes(nodes);
    }

    disposeInternalGraph() {
        this._generation++;
        return this._enqueue(() => this._clearInternalGraph());
    }

    destroy() {
        this._disposed = true;
        return this.disposeInternalGraph();
    }

    _assertCurrent(generation) {
        if (this._disposed || generation !== this._generation) throw new Error('Subgraph evaluation cancelled/disposed');
    }

    async initializeInternalGraph(generation = this._generation) {
        const candidates = new Map();
        try {
            this._assertCurrent(generation);
            const configuration = cloneConfig({
                internalNodes: this.properties.internalNodes,
                internalConnections: this.properties.internalConnections,
                exposedInputs: this.properties.exposedInputs,
                exposedOutputs: this.properties.exposedOutputs
            });
            if (this.initialized && sameConfig(configuration, this._configuration)) return;
            // Validate the ENTIRE tree before any constructor/restore effects.
            const plan = validateGraph(configuration);
            await this._clearInternalGraph();
            this._assertCurrent(generation);
            for (const [id, record] of plan.records) {
                const instance = new record.NodeClass();
                candidates.set(id, instance); // Include an instance whose restore fails.
                instance.id = id;
                instance.type = record.type;
                instance.label = record.node.label || instance.label || record.type;
                const properties = cloneConfig(record.properties);
                if (typeof instance.restore === 'function') await instance.restore({ properties });
                else instance.properties = { ...(instance.properties || {}), ...properties };
                // Include nested initialization in the candidate transaction so a
                // deep restore failure also disposes already-created siblings.
                if (record.kind === 'graph') await instance.initializeInternalGraph();
                this._assertCurrent(generation);
            }
            this.internalNodeInstances = candidates;
            this.internalExecutionOrder = plan.order;
            this._configuration = configuration;
            this._plan = plan;
            this.initialized = true;
        } catch (error) {
            await cleanupNodes(candidates.values());
            await this._clearInternalGraph();
            throw error;
        }
    }

    process(inputs = {}) {
        const generation = this._generation;
        return this._enqueue(async () => {
            this._assertCurrent(generation);
            await this.initializeInternalGraph(generation);
            this._assertCurrent(generation);
            const plan = this._plan;
            const inputsByNode = new Map(plan.order.map(id => [id, Object.create(null)]));
            const append = (id, port, values) => {
                const nodeInputs = inputsByNode.get(id);
                if (!hasOwn(nodeInputs, port)) nodeInputs[port] = [];
                nodeInputs[port].push(...values);
            };
            for (const [id, record] of plan.records) {
                if (record.kind === 'input') this.internalNodeInstances.get(id)._inputValues = [];
            }
            for (const port of plan.exposedInputs) {
                if (!hasOwn(inputs, `exp_${port.key}`)) continue;
                const values = valuesFor(inputs, `exp_${port.key}`);
                if (plan.records.get(port.internalNodeId).kind === 'input') {
                    this.internalNodeInstances.get(port.internalNodeId)._inputValues.push(...values);
                } else {
                    // convertToSubGraph maps straight to ordinary node inputs.
                    append(port.internalNodeId, port.internalPort, values);
                }
            }
            const outputsByNode = new Map();
            for (const id of plan.order) {
                this._assertCurrent(generation);
                const node = this.internalNodeInstances.get(id);
                for (const connection of plan.connections) {
                    if (connection.target !== id) continue;
                    const source = this.internalNodeInstances.get(connection.source);
                    // Input ports forward the connection-list; ordinary array
                    // outputs remain ONE array-valued message.
                    const values = plan.records.get(connection.source).kind === 'input'
                        ? source._inputValues
                        : [outputsByNode.get(connection.source)?.[connection.sourceOutput]];
                    append(id, connection.targetInput, values);
                }
                const method = typeof node.data === 'function' ? node.data : node.process;
                const result = typeof method === 'function' ? await method.call(node, inputsByNode.get(id)) : {};
                this._assertCurrent(generation);
                outputsByNode.set(id, result || {});
            }
            const outputs = { out: inputs.trigger?.[0] };
            for (const port of plan.exposedOutputs) {
                const nodeOutputs = outputsByNode.get(port.internalNodeId) || {};
                const node = this.internalNodeInstances.get(port.internalNodeId);
                const property = plan.records.get(port.internalNodeId).kind === 'output' ? '_outputValue' : `_${port.internalPort}Value`;
                outputs[`exp_${port.key}`] = hasOwn(nodeOutputs, port.internalPort)
                    ? nodeOutputs[port.internalPort] : node.properties?.[property];
            }
            return outputs;
        });
    }
}

function register(registry) {
    registry.register('SubGraphNode', SubGraphNode);
    registry.register('SubGraphInputNode', SubGraphInputNode);
    registry.register('SubGraphOutputNode', SubGraphOutputNode);
}

module.exports = { SubGraphNode, SubGraphInputNode, SubGraphOutputNode, register };
