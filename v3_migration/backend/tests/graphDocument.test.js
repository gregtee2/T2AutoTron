const {
  CURRENT_SCHEMA_VERSION,
  normalizeGraphDocument,
  prepareGraphForSave
} = require('../src/engine/graphDocument');

describe('graphDocument', () => {
  test('normalizes legacy documents without changing their graph data', () => {
    const legacy = { version: '2.1.999', nodes: [{ id: 'n1', label: 'Plugin not installed here', properties: { value: 3 } }] };
    const normalized = normalizeGraphDocument(legacy);

    expect(normalized.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(normalized.projectId).toEqual(expect.any(String));
    expect(normalized.revision).toBe(0);
    expect(normalized.connections).toEqual([]);
    expect(normalized.nodes).toEqual(legacy.nodes);
    expect(normalized.version).toBe('2.1.999');
    expect(legacy.schemaVersion).toBeUndefined();
  });

  test('assigns the next revision when the expected revision matches', () => {
    const saved = prepareGraphForSave(
      { projectId: 'project-1', baseRevision: 4, nodes: [], connections: [] },
      { projectId: 'project-1', revision: 4, nodes: [], connections: [] }
    );

    expect(saved.projectId).toBe('project-1');
    expect(saved.revision).toBe(5);
    expect(saved.baseRevision).toBeUndefined();
    expect(saved.savedAt).toEqual(expect.any(String));
  });

  test('rejects stale saves with a conflict error', () => {
    expect(() => prepareGraphForSave(
      { projectId: 'project-1', baseRevision: 3, nodes: [], connections: [] },
      { projectId: 'project-1', revision: 4, nodes: [], connections: [] }
    )).toThrow(expect.objectContaining({
      code: 'GRAPH_REVISION_CONFLICT',
      statusCode: 409,
      expectedRevision: 3,
      actualRevision: 4
    }));
  });

  test('requires an explicit baseRevision even when an embedded revision matches', () => {
    for (const document of [{ nodes: [] }, { nodes: [], revision: 4 }]) {
      expect(() => prepareGraphForSave(document, { nodes: [], revision: 4 })).toThrow(expect.objectContaining({
        code: 'GRAPH_REVISION_REQUIRED', statusCode: 428, actualRevision: 4
      }));
    }
  });

  test('imports an unversioned document before revisioned storage exists', () => {
    expect(prepareGraphForSave({ nodes: [] })).toMatchObject({ revision: 1, schemaVersion: CURRENT_SCHEMA_VERSION });
    expect(prepareGraphForSave({ nodes: [] }, { nodes: [] })).toMatchObject({ revision: 1 });
    expect(prepareGraphForSave({ nodes: [], revision: 99 }, null)).toMatchObject({ revision: 1 });
  });

  test('keeps the stored project identity if an editor omits it', () => {
    expect(prepareGraphForSave({ nodes: [], baseRevision: 2 }, { nodes: [], projectId: 'same-project', revision: 2 }))
      .toMatchObject({ projectId: 'same-project', revision: 3 });
  });

  test('explicit zero is checked even on first save', () => {
    expect(() => prepareGraphForSave({ nodes: [], baseRevision: 1 })).toThrow(expect.objectContaining({
      statusCode: 409, actualRevision: 0
    }));
  });

  test.each([CURRENT_SCHEMA_VERSION + 1, '1', -1, null, 1.5])('rejects unsupported schemaVersion %p with 400', schemaVersion => {
    expect(() => normalizeGraphDocument({ nodes: [], schemaVersion })).toThrow(expect.objectContaining({ statusCode: 400 }));
  });

  test('migrates schema zero without tying it to the release version', () => {
    expect(normalizeGraphDocument({ nodes: [], schemaVersion: 0, version: 'future-app-release' }))
      .toMatchObject({ schemaVersion: CURRENT_SCHEMA_VERSION, version: 'future-app-release' });
  });

  test.each(['revision', 'baseRevision'])('rejects invalid %s metadata', key => {
    for (const value of [-1, 0.5, '1', null, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => prepareGraphForSave({ nodes: [], [key]: value })).toThrow(expect.objectContaining({ statusCode: 400 }));
    }
  });

  test('does not reset a malformed stored revision or overflow the next revision', () => {
    expect(() => prepareGraphForSave({ nodes: [], baseRevision: 0 }, { nodes: [], revision: 'bad' }))
      .toThrow(expect.objectContaining({ statusCode: 400 }));
    expect(() => prepareGraphForSave({ nodes: [], baseRevision: Number.MAX_SAFE_INTEGER }, { nodes: [], revision: Number.MAX_SAFE_INTEGER }))
      .toThrow(expect.objectContaining({ statusCode: 400 }));
  });

  test.each([
    null, [], {}, { nodes: {} }, { nodes: [], connections: {} },
    { nodes: [null] }, { nodes: [[]] }, { nodes: [{ name: 'AnyNode' }] },
    { nodes: [{ id: '', name: 'AnyNode' }] }, { nodes: [{ id: {}, name: 'AnyNode' }] },
    { nodes: [{ id: 'a' }] }, { nodes: [{ id: 'a', name: 123 }] },
    { nodes: [{ id: 'a', name: 'AnyNode', properties: [] }] },
    { nodes: [{ id: 'a', name: 'AnyNode', data: 'invalid' }] },
    { nodes: [{ id: 'a', name: 'AnyNode', data: { properties: null } }] },
    { nodes: [{ id: 'a', name: 'AnyNode' }, { id: 'a', name: 'OtherNode' }] },
    { nodes: [], connections: [null] },
    { nodes: [], connections: [{ source: 'missing', target: 'missing', sourceOutput: 'out', targetInput: 'in' }] },
    { nodes: [], projectId: [] }
  ])('rejects malformed shape %p before saving', document => {
    expect(() => prepareGraphForSave(document)).toThrow(expect.objectContaining({
      statusCode: 400, code: 'INVALID_GRAPH_DOCUMENT'
    }));
  });

  test('checks socket fields and connection ids without requiring a node registry', () => {
    const nodes = [{ id: 'a', type: 'UnknownPlugin' }, { id: 'b', label: 'UI node' }];
    const connection = { id: 'c', source: 'a', target: 'b', sourceOutput: 'out', targetInput: 'in' };
    expect(normalizeGraphDocument({ nodes, connections: [connection] }).connections).toEqual([connection]);
    for (const invalid of [
      { ...connection, sourceOutput: '' }, { ...connection, targetInput: {} },
      { ...connection, targetInput: '__proto__' }, { ...connection, id: {} },
      { ...connection, source: {} }
    ]) {
      expect(() => normalizeGraphDocument({ nodes, connections: [invalid] })).toThrow(expect.objectContaining({ statusCode: 400 }));
    }
    expect(() => normalizeGraphDocument({ nodes, connections: [connection, connection] }))
      .toThrow(expect.objectContaining({ statusCode: 400 }));
  });

  test('supports numeric legacy ids but does not coerce connection references', () => {
    const graph = {
      nodes: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }],
      connections: [{ source: 1, target: 2, sourceOutput: 'out', targetInput: 'in' }]
    };
    expect(normalizeGraphDocument(graph).nodes).toEqual(graph.nodes);
    graph.connections[0].source = '1';
    expect(() => normalizeGraphDocument(graph)).toThrow(expect.objectContaining({ statusCode: 400 }));
  });
});