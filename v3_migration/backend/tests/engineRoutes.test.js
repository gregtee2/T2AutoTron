/** Production router, real Express/PIN middleware/storage, isolated temp files.
 * No server.js, real engine/device managers, saved user graphs or live services.
 */
const express = require('express');
const request = require('supertest');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');

jest.mock('../src/engine', () => ({
  engine: {
    running: true,
    frontendActive: false,
    nodes: new Map(),
    outputs: new Map(),
    hotReload: jest.fn(),
    loadGraphData: jest.fn(),
    loadGraph: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
    shouldSkipDeviceCommands: jest.fn(() => false),
    getStatus: jest.fn()
  },
  registry: { size: 1, list: jest.fn(() => []) },
  loadBuiltinNodes: jest.fn()
}));
jest.mock('../src/engine/deviceAudit', () => ({ startPeriodicAudit: jest.fn(), stopPeriodicAudit: jest.fn() }));
jest.mock('../src/engine/commandTracker', () => ({}));
// Keep the actual route authorization middleware, but avoid the auth singleton's
// timer and any dependence on local credentials. This is a synthetic test PIN.
jest.mock('../src/api/middleware/authMiddleware', () => ({
  verifyPin: jest.fn(pin => pin === 'router-test-pin')
}));

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function graph(id = 'a', baseRevision = 0) {
  return { baseRevision, nodes: [{ id, name: 'UnknownPlugin', properties: { value: id } }], connections: [] };
}

describe('engine persistence REST routes', () => {
  let app, engine, root, graphsDir, activePath, savedGraphPath, onRequest;

  beforeEach(async () => {
    jest.resetModules();
    savedGraphPath = process.env.GRAPH_SAVE_PATH;
    root = await fs.mkdtemp(path.join(os.tmpdir(), 't2-engine-routes-'));
    graphsDir = path.join(root, 'graphs');
    await fs.mkdir(graphsDir);
    activePath = path.join(graphsDir, '.last_active.json');
    process.env.GRAPH_SAVE_PATH = graphsDir;
    engine = require('../src/engine').engine;
    const installGraph = async document => {
      engine.nodes = new Map(document.nodes.map(node => [node.id, node]));
      engine.activeRevision = document.revision;
    };
    engine.hotReload.mockImplementation(installGraph);
    engine.loadGraphData.mockImplementation(installGraph);
    engine.stop.mockImplementation(() => { engine.running = false; });
    engine.start.mockImplementation(async () => { engine.running = true; });
    engine.getStatus.mockImplementation(() => ({ running: engine.running, nodeCount: engine.nodes.size, frontendActive: engine.frontendActive }));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    onRequest = null;
    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      // Supertest connects over loopback; simulate a direct remote caller so
      // forgetting requireLocalOrPin on a route actually fails these tests.
      Object.defineProperty(req.socket, 'remoteAddress', { value: '203.0.113.5', configurable: true });
      onRequest?.(req);
      next();
    });
    app.use('/api/engine', require('../src/api/routes/engineRoutes'));
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    if (savedGraphPath === undefined) delete process.env.GRAPH_SAVE_PATH;
    else process.env.GRAPH_SAVE_PATH = savedGraphPath;
    await fs.rm(root, { recursive: true, force: true });
  });

  const auth = test => test.set('X-APP-PIN', 'router-test-pin');
  const readActive = async () => JSON.parse(await fs.readFile(activePath, 'utf8'));
  const save = document => auth(request(app).post('/api/engine/save-active')).send(document);
  const saveNamed = (document, filename = 'foo.json') => auth(request(app).post('/api/engine/save-graph')).send({ filename, graph: document });

  test('named save preserves .json and reports both writes and activation', async () => {
    const response = await saveNamed(graph()).expect(200);
    expect(response.body).toMatchObject({
      success: true, persisted: true, filename: 'foo.json', revision: 1,
      persistence: { status: 'complete', named: { persisted: true, revision: 1 }, active: { persisted: true, revision: 1 } },
      activation: { status: 'activated', revision: 1 }
    });
    expect(await fs.readdir(graphsDir)).toEqual(expect.arrayContaining(['foo.json', '.last_active.json']));
    expect(await fs.readdir(graphsDir)).toHaveLength(2);
    expect(await fs.readFile(path.join(graphsDir, 'foo.json'), 'utf8')).toBe(await fs.readFile(activePath, 'utf8'));
  });

  test('legacy camera credentials cannot be listed, read, loaded or overwritten as a graph', async () => {
    const privatePath = path.join(graphsDir, 'cameras.json');
    const content = JSON.stringify({ cameras: [{ ip: 'camera.invalid', password: 'test-only' }] });
    await fs.writeFile(privatePath, content);
    const listing = await auth(request(app).get('/api/engine/graphs')).expect(200);
    expect(listing.body.graphs).toEqual([]);
    await auth(request(app).get('/api/engine/graphs/cameras.json')).expect(403);
    await auth(request(app).post('/api/engine/load')).send({ graphPath: privatePath }).expect(403);
    await saveNamed(graph(), 'cameras.json').expect(403);
    expect(await fs.readFile(privatePath, 'utf8')).toBe(content);
  });

  test('concurrent saves with the same base revision give exactly one 200 and one 409', async () => {
    const responses = await Promise.all([save(graph('first')), saveNamed(graph('second'))]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
    const winner = responses.find(response => response.status === 200);
    const loser = responses.find(response => response.status === 409);
    expect(loser.body).toMatchObject({ persisted: false, currentRevision: 1, expectedRevision: 0, activation: { status: 'not_attempted' } });
    expect((await readActive()).revision).toBe(winner.body.revision);
    expect(engine.hotReload).toHaveBeenCalledTimes(1);
    expect(engine.activeRevision).toBe(1);
  });

  test('missing baseRevision cannot bypass protection, even with matching embedded revision', async () => {
    await save(graph()).expect(200);
    const before = await fs.readFile(activePath, 'utf8');
    const noBase = graph('new');
    delete noBase.baseRevision;
    await save(noBase).expect(428);
    const response = await saveNamed({ ...noBase, revision: 1 }).expect(428);
    expect(response.body).toMatchObject({ code: 'GRAPH_REVISION_REQUIRED', currentRevision: 1, persisted: false });
    expect(await fs.readFile(activePath, 'utf8')).toBe(before);
    expect(await fs.readdir(graphsDir)).toEqual(['.last_active.json']);
  });

  test.each([
    ['future schema', document => ({ ...document, schemaVersion: 999 })],
    ['null node', document => ({ ...document, nodes: [null] })],
    ['missing type', document => ({ ...document, nodes: [{ id: 'a' }] })],
    ['bad properties', document => ({ ...document, nodes: [{ id: 'a', name: 'A', properties: [] }] })],
    ['duplicate id', document => ({ ...document, nodes: [document.nodes[0], document.nodes[0]] })],
    ['bad reference', document => ({ ...document, connections: [{ source: 'a', target: 'missing', sourceOutput: 'out', targetInput: 'in' }] })],
    ['bad socket', document => ({ ...document, connections: [{ source: 'a', target: 'a', sourceOutput: 'out' }] })],
    ['bad revision', document => ({ ...document, baseRevision: '1' })]
  ])('%s returns 400 without replacing either prior file', async (label, mutate) => {
    await saveNamed(graph()).expect(200);
    const before = await fs.readFile(activePath, 'utf8');
    await save(mutate(graph('a', 1))).expect(400);
    await saveNamed(mutate(graph('a', 1))).expect(400);
    expect(await fs.readFile(activePath, 'utf8')).toBe(before);
    expect(await fs.readFile(path.join(graphsDir, 'foo.json'), 'utf8')).toBe(before);
    expect(engine.hotReload).toHaveBeenCalledTimes(1);
  });

  test.each(['../escape.json', 'folder/file', 'folder\\file', 'foo?.json', '.json', '.last_active.json', 'CON.json', '', 'a\nb', 123])(
    'malformed filename %p is rejected instead of rewritten', async filename => {
      await saveNamed(graph(), filename).expect(400);
      await auth(request(app).post('/api/engine/load')).send({ graphName: filename }).expect(400);
      expect(await fs.readdir(graphsDir)).toEqual([]);
      expect(engine.hotReload).not.toHaveBeenCalled();
    }
  );

  test('legacy unversioned files remain readable/loadable and can be migrated on first save', async () => {
    const legacy = { nodes: [{ id: 'old', label: 'Legacy plugin' }], version: '2.1.240' };
    const content = JSON.stringify(legacy);
    await fs.writeFile(path.join(graphsDir, 'legacy.json'), content);
    await fs.writeFile(activePath, content);
    const loaded = await auth(request(app).get('/api/engine/graphs/legacy')).expect(200);
    expect(loaded.body.graph).toMatchObject({ nodes: legacy.nodes, revision: 0, schemaVersion: 1, connections: [] });
    await auth(request(app).post('/api/engine/load')).send({ graphName: 'legacy.json' }).expect(200);
    expect(await fs.readFile(activePath, 'utf8')).toBe(content); // Reads never migrate disk.
    const saved = await save(legacy).expect(200);
    expect(saved.body.revision).toBe(1);
  });

  test('authenticated direct reads and controls use the production PIN middleware', async () => {
    await saveNamed(graph()).expect(200);
    for (const url of ['/status', '/last-active', '/graphs', '/graphs/foo.json']) {
      await request(app).get(`/api/engine${url}`).expect(403);
      await request(app).get(`/api/engine${url}`).set('X-APP-PIN', 'wrong').expect(403);
      await request(app).get(`/api/engine${url}`).set('Authorization', 'Bearer router-test-pin').expect(200);
    }
    for (const url of ['/save-active', '/save-graph', '/load', '/start', '/stop']) {
      await request(app).post(`/api/engine${url}`).send(graph()).expect(403);
    }
    await request(app).get('/api/engine/graphs/foo.json').set('X-Forwarded-For', '127.0.0.1').expect(403);
  });

  test('start reads the saved document through validation, not an unchecked engine file read', async () => {
    await save(graph()).expect(200);
    engine.nodes.clear();
    engine.running = false;
    await auth(request(app).post('/api/engine/start')).expect(200);
    expect(engine.loadGraphData).toHaveBeenCalledWith(expect.objectContaining({ revision: 1 }));
    expect(engine.loadGraph).not.toHaveBeenCalled();
  });

  test('Stop cancels a Start still waiting for its stored graph read', async () => {
    await save(graph()).expect(200);
    engine.nodes.clear();
    engine.running = false;
    const entered = deferred();
    const release = deferred();
    const realRead = fs.readFile.bind(fs);
    jest.spyOn(fs, 'readFile').mockImplementationOnce(async (...args) => {
      entered.resolve();
      await release.promise;
      return realRead(...args);
    });
    const starting = auth(request(app).post('/api/engine/start')).then(response => response);
    await entered.promise;
    try {
      await auth(request(app).post('/api/engine/stop')).expect(200);
    } finally {
      release.resolve();
      await starting;
    }
    expect((await starting).status).toBe(409);
    expect(engine.start).not.toHaveBeenCalled();
    expect(engine.running).toBe(false);
  });

  test.each([true, false])('empty graph clears old nodes when running=%p and cannot resurrect on Start', async running => {
    engine.running = running;
    engine.nodes.set('old', { id: 'old' });
    const response = await save({ nodes: [], connections: [], baseRevision: 0 }).expect(200);
    expect(response.body.activation).toMatchObject({ status: 'cleared', running: false });
    expect(engine.nodes.size).toBe(0);
    expect(engine.stop).toHaveBeenCalled();
    expect((await readActive()).nodes).toEqual([]);
    await auth(request(app).post('/api/engine/start')).expect(400);
    expect(engine.start).not.toHaveBeenCalled();
    expect(engine.nodes.size).toBe(0);
  });

  test.each([true, false])('frontend ownership defers both empty and populated saves (empty=%p)', async empty => {
    engine.frontendActive = true;
    engine.nodes.set('old', { id: 'old' });
    const document = empty ? { nodes: [], connections: [], baseRevision: 0 } : graph();
    const response = await save(document).expect(200);
    expect(response.body).toMatchObject({ persisted: true, activation: { status: 'deferred', reason: 'frontend_active' } });
    expect(engine.hotReload).not.toHaveBeenCalled();
    expect(engine.loadGraphData).not.toHaveBeenCalled();
    expect(engine.stop).not.toHaveBeenCalled();
    expect(engine.nodes.has('old')).toBe(true);
    expect((await readActive()).nodes).toEqual(document.nodes);
  });

  test('an activation error does not misreport an already persisted save as unsaved', async () => {
    engine.hotReload.mockRejectedValueOnce(new Error('reload failed'));
    const response = await save(graph()).expect(200);
    expect(response.body).toMatchObject({
      success: true, persisted: true, revision: 1,
      persistence: { status: 'complete' }, activation: { status: 'failed', error: 'reload failed' }
    });
    expect((await readActive()).revision).toBe(1);
    await save(graph('retry', 1)).expect(200); // Lock is not poisoned.
    expect(engine.activeRevision).toBe(2);
  });

  test('newer active save cannot overtake older activation even while hotReload temporarily stops', async () => {
    const entered = deferred();
    const release = deferred();
    const secondArrived = deferred();
    const applied = [];
    engine.hotReload.mockImplementation(async document => {
      if (document.revision === 1) {
        engine.running = false;
        entered.resolve();
        await release.promise;
        engine.running = true;
      }
      engine.activeRevision = document.revision;
      applied.push(document.revision);
    });
    const older = save(graph('older')).then(response => response);
    await entered.promise;
    onRequest = req => { if (req.path.endsWith('/save-graph')) secondArrived.resolve(); };
    const newer = saveNamed(graph('newer', 1)).then(response => response);
    try {
      await secondArrived.promise;
      // Request two reached the router while one was paused. It must not replace
      // the file yet or decide to skip activation based on running=false.
      expect((await readActive()).revision).toBe(1);
      expect(engine.hotReload).toHaveBeenCalledTimes(1);
    } finally {
      release.resolve();
      await Promise.all([older, newer]);
    }
    expect((await older).status).toBe(200);
    expect((await newer).status).toBe(200);
    expect(applied).toEqual([1, 2]);
    expect(engine.activeRevision).toBe(2);
    expect((await readActive()).nodes[0].id).toBe('newer');
  });

  test('active rename failure leaves old contents intact and cleans the temporary file', async () => {
    await save(graph()).expect(200);
    const before = await fs.readFile(activePath, 'utf8');
    const rename = jest.spyOn(fs, 'rename').mockRejectedValueOnce(Object.assign(new Error('rename denied'), { code: 'EACCES' }));
    const response = await save(graph('next', 1)).expect(500);
    expect(response.body).toMatchObject({ persisted: false, error: 'rename denied', persistence: { status: 'failed' }, activation: { status: 'not_attempted' } });
    expect(await fs.readFile(activePath, 'utf8')).toBe(before);
    expect(await fs.readdir(graphsDir)).toEqual(['.last_active.json']);
    expect(engine.hotReload).toHaveBeenCalledTimes(1);
    rename.mockRestore();
    await save(graph('retry', 1)).expect(200);
  });

  test('second of two file writes failing reports partial persistence without changing active or engine', async () => {
    await saveNamed(graph()).expect(200);
    const before = await fs.readFile(activePath, 'utf8');
    const realRename = fs.rename.bind(fs);
    jest.spyOn(fs, 'rename').mockImplementation((source, destination) => {
      if (destination === activePath) return Promise.reject(Object.assign(new Error('active rename denied'), { code: 'EACCES' }));
      return realRename(source, destination);
    });
    const response = await saveNamed(graph('new', 1)).expect(500);
    expect(response.body).toMatchObject({
      success: false, persisted: false, currentRevision: 1,
      persistence: { status: 'partial', named: { filename: 'foo.json', persisted: true, revision: 2 }, active: { persisted: false, revision: 1 } },
      activation: { status: 'not_attempted' }
    });
    expect(await fs.readFile(activePath, 'utf8')).toBe(before);
    expect(JSON.parse(await fs.readFile(path.join(graphsDir, 'foo.json'), 'utf8')).revision).toBe(2);
    expect(engine.activeRevision).toBe(1);
    expect(await fs.readdir(graphsDir)).toHaveLength(2);
  });

  test('first named write failure leaves both old files intact', async () => {
    await saveNamed(graph()).expect(200);
    const before = await fs.readFile(activePath, 'utf8');
    jest.spyOn(fs, 'rename').mockRejectedValueOnce(new Error('named rename denied'));
    const response = await saveNamed(graph('new', 1)).expect(500);
    expect(response.body.persistence).toMatchObject({ status: 'failed', named: { persisted: false }, active: { persisted: false } });
    expect(await fs.readFile(activePath, 'utf8')).toBe(before);
    expect(await fs.readFile(path.join(graphsDir, 'foo.json'), 'utf8')).toBe(before);
  });

  test('temporary files are random, exclusive and synced/closed before rename', async () => {
    const { writeJsonAtomic } = require('../src/engine/graphStorage');
    const realOpen = fs.open.bind(fs);
    const realRename = fs.rename.bind(fs);
    const stages = new Map();
    jest.spyOn(Date, 'now').mockReturnValue(123); // Same clock tick cannot collide.
    const open = jest.spyOn(fs, 'open').mockImplementation(async (name, flags, mode) => {
      const handle = await realOpen(name, flags, mode);
      const stage = [];
      stages.set(name, stage);
      return {
        writeFile: async (...args) => { stage.push('write'); return handle.writeFile(...args); },
        sync: async () => { stage.push('sync'); return handle.sync(); },
        close: async () => { stage.push('close'); return handle.close(); }
      };
    });
    jest.spyOn(fs, 'rename').mockImplementation(async (source, destination) => {
      expect(stages.get(source)).toEqual(['write', 'sync', 'close']);
      return realRename(source, destination);
    });
    await Promise.all([
      writeJsonAtomic(path.join(graphsDir, 'one.json'), '{}'),
      writeJsonAtomic(path.join(graphsDir, 'two.json'), '{}')
    ]);
    const names = open.mock.calls.map(([name]) => name);
    expect(new Set(names).size).toBe(2);
    for (const [name, flags, mode] of open.mock.calls) {
      expect(name).toMatch(/\.[a-f0-9-]{36}\.tmp$/);
      expect(flags).toBe('wx');
      expect(mode).toBe(0o600);
    }
  });

  test('sync failure preserves the original and removes the temporary file', async () => {
    await save(graph()).expect(200);
    const before = await fs.readFile(activePath, 'utf8');
    const realOpen = fs.open.bind(fs);
    jest.spyOn(fs, 'open').mockImplementationOnce(async (...args) => {
      const handle = await realOpen(...args);
      return { writeFile: (...values) => handle.writeFile(...values), sync: async () => { throw new Error('sync failed'); }, close: () => handle.close() };
    });
    await save(graph('new', 1)).expect(500);
    expect(await fs.readFile(activePath, 'utf8')).toBe(before);
    expect(await fs.readdir(graphsDir)).toEqual(['.last_active.json']);
  });

  test('cleanup failure does not mask the original rename error', async () => {
    const { writeJsonAtomic } = require('../src/engine/graphStorage');
    const original = Object.assign(new Error('original rename failure'), { code: 'EACCES' });
    jest.spyOn(fs, 'rename').mockRejectedValueOnce(original);
    jest.spyOn(fs, 'unlink').mockRejectedValueOnce(new Error('cleanup failure'));
    await expect(writeJsonAtomic(path.join(graphsDir, 'new.json'), '{}')).rejects.toBe(original);
    expect(original.cleanupErrors).toEqual(['cleanup failure']);
  });

  test('exclusive create collisions never truncate or remove a pre-existing temporary file', async () => {
    const crypto = require('crypto');
    const { writeJsonAtomic } = require('../src/engine/graphStorage');
    const id = '00000000-0000-4000-8000-000000000000';
    jest.spyOn(crypto, 'randomUUID').mockReturnValue(id);
    const destination = path.join(graphsDir, 'collision.json');
    const temporary = `${destination}.${id}.tmp`;
    await fs.writeFile(temporary, 'another writer');
    await expect(writeJsonAtomic(destination, '{}')).rejects.toMatchObject({ code: 'EEXIST' });
    expect(await fs.readFile(temporary, 'utf8')).toBe('another writer');
  });

  test('path traversal and outside-directory junction reads are denied', async () => {
    const outside = path.join(root, 'outside');
    await fs.mkdir(outside);
    await fs.writeFile(path.join(outside, 'secret.json'), JSON.stringify(graph()));
    await auth(request(app).post('/api/engine/load')).send({ graphPath: path.join(outside, 'secret.json') }).expect(403);
    await auth(request(app).post('/api/engine/load')).send({ graphPath: '../outside/secret.json' }).expect(403);
    // Directory junctions work on Windows without developer-mode symlink rights.
    await fs.symlink(outside, path.join(graphsDir, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
    await auth(request(app).post('/api/engine/load')).send({ graphPath: 'escape/secret.json' }).expect(403);
    expect(engine.hotReload).not.toHaveBeenCalled();
  });

  test('last-active/direct reads reject final symlinks rather than serving linked files', async () => {
    const realLstat = fs.lstat.bind(fs);
    // Portable final-symlink test: Windows file symlink creation requires extra
    // privileges. Parent junction containment is exercised on real disk above.
    jest.spyOn(fs, 'lstat').mockImplementation(async filename => {
      if (filename === activePath || filename === path.join(graphsDir, 'linked.json')) {
        return { isSymbolicLink: () => true };
      }
      return realLstat(filename);
    });
    await auth(request(app).get('/api/engine/last-active')).expect(403);
    await auth(request(app).get('/api/engine/graphs/linked')).expect(403);
    await save(graph()).expect(403);
  });

  test('a configured directory junction remains usable while containing reads and writes', async () => {
    const alias = path.join(root, 'graphs-alias');
    await fs.symlink(graphsDir, alias, process.platform === 'win32' ? 'junction' : 'dir');
    process.env.GRAPH_SAVE_PATH = alias;
    await saveNamed(graph()).expect(200);
    await save(graph('next', 1)).expect(200);
    const response = await auth(request(app).get('/api/engine/last-active')).expect(200);
    expect(response.body.graph.revision).toBe(2);
    expect((await readActive()).revision).toBe(2);
  });

  test('invalid/future stored documents are 400, not disguised as missing files', async () => {
    await fs.writeFile(activePath, '{bad-json');
    await auth(request(app).get('/api/engine/last-active')).expect(400);
    const future = JSON.stringify({ ...graph(), schemaVersion: 999 });
    await fs.writeFile(activePath, future);
    await fs.writeFile(path.join(graphsDir, 'future.json'), future);
    await auth(request(app).get('/api/engine/graphs/future')).expect(400);
    await auth(request(app).post('/api/engine/load')).send({ graphName: 'future' }).expect(400);
    await auth(request(app).post('/api/engine/start')).expect(400);
    expect(engine.loadGraphData).not.toHaveBeenCalled();
  });

  test('status exposes completed-tick and per-node failure diagnostics', async () => {
    engine.getStatus.mockReturnValue({ running: true, lastTickTime: 10, lastTickCompletedTime: 20, nodeErrors: { a: { message: 'failed' } }, loading: false });
    const response = await auth(request(app).get('/api/engine/status')).expect(200);
    expect(response.body.status).toMatchObject({ lastTickTime: 10, lastTickCompletedTime: 20, nodeErrors: { a: { message: 'failed' } }, loading: false });
  });
});