import test from 'node:test';
import assert from 'node:assert/strict';
import { createGraphDocument, normalizeGraphDocument, recordGraphSaveResponse } from '../src/utils/graphDocument.js';
import { composeRootGraph, exposedPorts, nodeProperties, serializeEditorGraph } from '../src/utils/graphProject.js';

test('tab revisions do not adopt saves acknowledged by another tab', async () => {
    const first = await import('../src/utils/graphDocument.js?tab=first');
    const second = await import('../src/utils/graphDocument.js?tab=second');
    first.recordGraphSaveResponse({ projectId: 'project', revision: 4 });
    second.recordGraphSaveResponse({ projectId: 'project', revision: 4 });
    first.recordGraphSaveResponse({ projectId: 'project', revision: 5 });
    assert.equal(first.createGraphDocument({ nodes: [] }).baseRevision, 5);
    assert.equal(second.createGraphDocument({ nodes: [] }).baseRevision, 4);
});

test('malformed and future documents cannot turn into an empty graph', () => {
    for (const input of [null, [], {}, { nodes: 'bad' }, { nodes: [], connections: {} },
        { nodes: [], schemaVersion: 99 }, { nodes: [], revision: -1 }]) {
        assert.throws(() => normalizeGraphDocument(input));
    }
    assert.deepEqual(normalizeGraphDocument({ nodes: [] }).connections, []);
});

test('acknowledged snapshot backup contains its server revision', () => {
    let backup;
    globalThis.localStorage = { setItem: (key, text) => { backup = JSON.parse(text); } };
    try {
        recordGraphSaveResponse({ revision: 8, projectId: 'project' }, { nodes: [], connections: [], revision: 7 });
        assert.equal(backup.revision, 8);
        assert.equal(backup.baseRevision, 8);
    } finally { delete globalThis.localStorage; }
});

test('root composition preserves direct ports, nested edits, viewport and current revision', () => {
    const direct = { key: 'in_0', internalNodeId: 'ordinary', internalPort: 'value', type: 'number' };
    const oldProps = { internalNodes: [], exposedInputs: [direct], exposedOutputs: [] };
    const frame = { nodeId: 'parent', graphData: { revision: 2, nodes: [
        { id: 'parent', label: 'Sub-Graph', data: { properties: oldProps } }
    ], connections: [], viewport: { x: 30, y: 50, k: 0.7 } } };
    const current = { nodes: [{ id: 'ordinary', type: 'Number', properties: { value: 19 } }], connections: [] };
    recordGraphSaveResponse({ revision: 10, projectId: 'project' });
    const root = composeRootGraph(current, [frame]);
    assert.equal(root.baseRevision, 10);
    assert.equal(nodeProperties(root.nodes[0]).internalNodes[0].properties.value, 19);
    assert.deepEqual(nodeProperties(root.nodes[0]).exposedInputs, [direct]);
    assert.deepEqual(root.viewport, frame.graphData.viewport);
    assert.deepEqual(oldProps.internalNodes, []);
    assert.equal(frame.graphData.revision, 2);
});

test('exposed port-node IDs survive reordering without mutating snapshots', () => {
    const nodes = [{ id: 'input', label: 'SubGraph Input', data: { properties: { portName: 'signal', portType: 'boolean' } } },
        { id: 'other', label: 'Other', properties: {} }];
    const parent = { data: { properties: { exposedInputs: [{ key: 'in_7', internalNodeId: 'input', internalPort: 'value' }] } } };
    assert.deepEqual(exposedPorts({ nodes }, parent), exposedPorts({ nodes: [...nodes].reverse() }, parent));
    assert.equal(exposedPorts({ nodes }, parent).exposedInputs[0].key, 'in_7');
    assert.equal(nodes[0].data.properties.portId, undefined);
});

test('missing parent refuses partial root save', () => {
    assert.throws(() => composeRootGraph({ nodes: [], connections: [] }, [{ nodeId: 'absent', graphData: { nodes: [] } }]), /Missing parent/);
});

test('serialization uses registry identity and detached properties', () => {
    class Minified { constructor() { this.id = 'node'; this.label = 'Renamed'; this.properties = { value: 3 }; } }
    const node = new Minified();
    const editor = { getNodes: () => [node], getConnections: () => [] };
    const area = { nodeViews: new Map(), area: { transform: { x: 1, y: 2, k: 1 } } };
    const graph = serializeEditorGraph(editor, area, { nodes: new Map([['StableType', { nodeClass: Minified }]]) });
    node.properties.value = 9;
    assert.equal(graph.nodes[0].type, 'StableType');
    assert.equal(graph.nodes[0].data.properties.value, 3);
    assert.equal(createGraphDocument(graph).nodes.length, 1);
});

test('ingress prefix is applied exactly once', async () => {
    globalThis.window = { location: { pathname: '/api/hassio_ingress/test-session/' } };
    try {
        const { apiUrl } = await import('../src/utils/apiBase.js');
        assert.equal(apiUrl(apiUrl('/api/engine/graphs')), '/api/hassio_ingress/test-session/api/engine/graphs');
    } finally { delete globalThis.window; }
});