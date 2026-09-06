import { createGraphDocument } from './graphDocument.js';

const clone = value => JSON.parse(JSON.stringify(value));

export function nodeProperties(node) {
    return node?.data?.properties || node?.properties || node?.data || {};
}

export function serializeEditorGraph(editor, area, registry) {
    const nodes = editor.getNodes().map(node => {
        const definition = [...registry.nodes.entries()].find(([, def]) =>
            def?.nodeClass && node instanceof def.nodeClass);
        const serialized = typeof node.toJSON === 'function' ? node.toJSON() : { id: node.id, label: node.label };
        return {
            id: node.id,
            type: definition?.[0] || node.type || node.constructor.type || node.constructor.name,
            label: node.label,
            position: { ...(area.nodeViews.get(node.id)?.position || { x: 0, y: 0 }) },
            // Detach saved snapshots from mutable node runtime state.
            data: clone({ ...serialized, properties: node.properties || serialized.properties || {} })
        };
    });
    const connections = editor.getConnections().map(({ id, source, sourceOutput, target, targetInput }) =>
        ({ id, source, sourceOutput, target, targetInput }));
    const transform = area.area?.transform;
    return createGraphDocument({ nodes, connections, viewport: transform
        ? { x: transform.x, y: transform.y, k: transform.k } : { x: 0, y: 0, k: 1 } });
}

export function exposedPorts(graph, parent) {
    const previous = nodeProperties(parent);
    const ids = new Set(graph.nodes.map(node => node.id));
    function collect(side, label, prefix) {
        const oldPorts = previous[side] || [];
        // Conversion exposes ordinary node ports directly. Keep those mappings;
        // only deleted nodes/port nodes should remove exposed connections.
        const ports = oldPorts.filter(port => {
            const node = graph.nodes.find(candidate => candidate.id === port.internalNodeId);
            return node && node.label !== 'SubGraph Input' && node.label !== 'SubGraph Output';
        }).map(port => ({ ...port }));
        for (const node of graph.nodes.filter(candidate => candidate.label === label)) {
            const props = nodeProperties(node);
            const old = oldPorts.find(port => port.internalNodeId === node.id);
            ports.push({ key: old?.key || props.portId || `${prefix}_${node.id}`,
                label: props.portName || prefix, type: props.portType || 'any',
                internalNodeId: node.id, internalPort: 'value' });
        }
        return ports.filter(port => ids.has(port.internalNodeId));
    }
    return { exposedInputs: collect('exposedInputs', 'SubGraph Input', 'in'),
        exposedOutputs: collect('exposedOutputs', 'SubGraph Output', 'out') };
}

export function composeRootGraph(current, stack) {
    let child = clone(current);
    for (let index = stack.length - 1; index >= 0; index--) {
        const frame = stack[index];
        const parent = clone(frame.graphData);
        const node = parent.nodes.find(candidate => candidate.id === frame.nodeId);
        if (!node) throw new Error(`Missing parent subgraph ${frame.nodeId}; refusing a partial project save`);
        const props = nodeProperties(node);
        const ports = exposedPorts(child, node);
        Object.assign(props, { internalNodes: child.nodes, internalConnections: child.connections, ...ports });
        if (node.data?.properties) node.data.properties = props;
        else node.properties = props;
        if (node.properties) node.properties = props;
        child = parent;
    }
    // The parent frame contains an old save revision, not this tab's current one.
    return createGraphDocument(child);
}