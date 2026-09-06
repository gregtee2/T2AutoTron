/**
 * Real Express router + temporary filesystem; no server, sockets, camera,
 * discovery, ffmpeg or curl processes. All credentials below are test fixtures.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const { promisify } = require('util');

let mockStore;
jest.mock('../src/cameras/cameraConfigStore', () => ({
    ...jest.requireActual('../src/cameras/cameraConfigStore'),
    cameraConfigStore: mockStore
}));
jest.mock('../src/api/middleware/authMiddleware', () => ({
    verifyPin: jest.fn(pin => pin === 'fixture-pin')
}));
jest.mock('../src/cameras', () => ({ cameraService: {
    getLatestFrame: jest.fn(), getFrameBuffer: jest.fn(() => []),
    getAllStatus: jest.fn(() => ({ cameras: [] })), getCameraStatus: jest.fn(),
    startAll: jest.fn(), stopAll: jest.fn(), reload: jest.fn(),
    startCamera: jest.fn(), stopCamera: jest.fn()
} }));
jest.mock('../src/cameras/CameraWorker', () => jest.fn().mockImplementation(config => ({
    config, start: jest.fn(), stop: jest.fn(), getLatestFrame: jest.fn()
})));
jest.mock('../src/streams/StreamManager', () => ({
    startStream: jest.fn(() => ({ success: true })), stopStream: jest.fn(),
    isStreamActive: jest.fn(() => false), getActiveStreams: jest.fn(() => []),
    RTSP_PRESETS: {}
}));
jest.mock('../src/discovery/CameraDiscovery', () => ({ inspectCamera: jest.fn() }));
jest.mock('child_process', () => {
    const execFile = jest.fn();
    execFile[require('util').promisify.custom] = jest.fn(async () => ({ stdout: Buffer.alloc(0) }));
    return { execFile, spawn: jest.fn(() => { throw new Error('Unexpected process spawn'); }) };
});
jest.mock('net', () => ({
    ...jest.requireActual('net'),
    Socket: jest.fn(() => { throw new Error('Unexpected network socket'); }),
    connect: jest.fn(() => { throw new Error('Unexpected network connection'); }),
    createConnection: jest.fn(() => { throw new Error('Unexpected network connection'); })
}));
jest.mock('http', () => ({
    ...jest.requireActual('http'),
    get: jest.fn(() => { throw new Error('Unexpected HTTP request'); }),
    request: jest.fn(() => { throw new Error('Unexpected HTTP request'); })
}));
jest.mock('https', () => ({
    ...jest.requireActual('https'),
    get: jest.fn(() => { throw new Error('Unexpected HTTPS request'); }),
    request: jest.fn(() => { throw new Error('Unexpected HTTPS request'); })
}));

const { createCameraConfigStore, resolveCameraConfigPaths, validateConfig, redactUri } =
    jest.requireActual('../src/cameras/cameraConfigStore');
const IP = '198.51.100.42';
const SECRET_ERROR = 'fixture-password rtsp://fixture-user:fixture-password@198.51.100.42/live?token=fixture-token';
const fixtureConfig = () => ({
    cameras: [{
        ip: IP, name: 'Original', username: 'fixture-user', password: 'fixture-password',
        snapshotPath: '/snapshot?user=fixture-user&password=fixture-snapshot',
        rtspPath: '/live?token=fixture-token', rtspPort: 8554,
        rtspUrl: `rtsp://fixture-user:fixture-url@${IP}:8554/live?pwd=fixture-query`,
        mjpegPath: '/video?passwd=fixture-mjpeg', brand: 'custom', fps: 17,
        useHwAccel: false, custom: { keep: 'extension-data' }, addedAt: '2026-01-01'
    }],
    defaultCredentials: { username: 'default-user', password: 'fixture-default' },
    subnet: '198.51.100.', rangeStart: 1, rangeEnd: 2, customConfig: true
});

// Directly drive the real router, with real auth middleware and fake remote
// peer/response objects. Unlike supertest, this never opens a loopback listener.
function dispatch(router, method, url, body = {}, { peer = '203.0.113.5', pin = 'fixture-pin', headers = {} } = {}) {
    return new Promise((resolve, reject) => {
        const requestHeaders = { ...headers };
        if (pin !== undefined) requestHeaders['x-app-pin'] = pin;
        const req = Object.assign(new EventEmitter(), {
            method, url, originalUrl: url, body, query: {},
            socket: { remoteAddress: peer }, headers: requestHeaders,
            get: name => requestHeaders[name.toLowerCase()]
        });
        const res = Object.assign(new EventEmitter(), {
            statusCode: 200, headersSent: false, headers: {},
            status(code) { this.statusCode = code; return this; },
            set(name, value) { this.headers[name.toLowerCase()] = value; return this; },
            setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
            json(value) { this.headersSent = true; resolve({ status: this.statusCode, body: value, headers: this.headers }); return this; },
            send(value) { this.headersSent = true; resolve({ status: this.statusCode, body: value, headers: this.headers }); return this; },
            end() { resolve({ status: this.statusCode, headers: this.headers }); }
        });
        router.handle(req, res, error => error ? reject(error) : resolve({ status: 404 }));
    });
}

let root, current, previous, legacy, fsImpl, logger, router;
let savedSupervisor;

function writeFixture(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function newStore(env = { CAMERA_CONFIG_PATH: current, GRAPH_SAVE_PATH: path.dirname(previous) }) {
    return createCameraConfigStore({ env, legacyPath: legacy, fsImpl, logger });
}

beforeEach(() => {
    jest.resetModules();
    savedSupervisor = process.env.SUPERVISOR_TOKEN;
    delete process.env.SUPERVISOR_TOKEN;
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    root = fs.mkdtempSync(path.join(os.tmpdir(), 't2-camera-test-'));
    current = path.join(root, 'config', 'cameras.json');
    previous = path.join(root, 'graphs', 'cameras.json');
    legacy = path.join(root, 'legacy', 'cameras.json');
    logger = { error: jest.fn(), warn: jest.fn() };
    fsImpl = {};
    // Fail before any filesystem operation could escape the temporary sandbox.
    for (const method of ['statSync', 'readFileSync', 'mkdirSync', 'openSync',
        'writeFileSync', 'fsyncSync', 'closeSync', 'renameSync', 'unlinkSync']) {
        fsImpl[method] = jest.fn((...args) => {
            const paths = method === 'renameSync' ? args.slice(0, 2) : args.slice(0, 1);
            for (const file of paths) {
                if (typeof file === 'string' && !path.resolve(file).startsWith(`${root}${path.sep}`)) {
                    throw new Error('Test filesystem escaped sandbox');
                }
            }
            return fs[method](...args);
        });
    }
    mockStore = newStore();
    router = require('../src/api/cameras');
});

afterEach(() => {
    if (savedSupervisor === undefined) delete process.env.SUPERVISOR_TOKEN;
    else process.env.SUPERVISOR_TOKEN = savedSupervisor;
    jest.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
});

describe('camera configuration locations and migration', () => {
    test('router/store imports and construction do not read or migrate configuration', () => {
        expect(fsImpl.readFileSync).not.toHaveBeenCalled();
        expect(fsImpl.statSync).not.toHaveBeenCalled();
        expect(fsImpl.openSync).not.toHaveBeenCalled();
    });

    test.each([
        [{}, '/app/backend/config/cameras.json'],
        [{ SUPERVISOR_TOKEN: 'fixture' }, '/data/config/cameras.json'],
        [{ GRAPH_SAVE_PATH: '/desktop/graphs/' }, '/app/backend/config/cameras.json'],
        [{ SUPERVISOR_TOKEN: 'fixture', GRAPH_SAVE_PATH: '/data/graphs/' }, '/data/config/cameras.json'],
        [{ SUPERVISOR_TOKEN: 'fixture', GRAPH_SAVE_PATH: '/volume/saved' }, '/volume/config/cameras.json'],
        [{ CAMERA_CONFIG_PATH: '/private/settings.JSON' }, '/private/settings.JSON'],
        [{ CAMERA_CONFIG_PATH: '/private/cameras/' }, '/private/cameras/cameras.json']
    ])('resolves %j without using the graph directory for camera config', (env, expected) => {
        const missingFs = { statSync: () => { throw Object.assign(new Error('Missing'), { code: 'ENOENT' }); } };
        const result = resolveCameraConfigPaths({ env, pathImpl: path.posix, fsImpl: missingFs,
            legacyPath: '/app/backend/config/cameras.json' });
        expect(result.current).toBe(expected);
        expect(result.candidates[0]).toBe(expected);
    });

    test('honors existing extensionless files and directories ending in .json', () => {
        const file = path.join(root, 'camera-settings');
        const dir = path.join(root, 'directory.json');
        writeFixture(file, fixtureConfig());
        fs.mkdirSync(dir);
        expect(newStore({ CAMERA_CONFIG_PATH: file }).getPaths().current).toBe(file);
        expect(newStore({ CAMERA_CONFIG_PATH: dir }).getPaths().current).toBe(path.join(dir, 'cameras.json'));
    });

    test.each(['current', 'previous', 'legacy'])('reads %s in precedence order and copies only during startup', location => {
        const source = { current, previous, legacy }[location];
        const config = fixtureConfig();
        config.cameras[0].name = location;
        writeFixture(legacy, { cameras: [] });
        if (location !== 'legacy') writeFixture(previous, { cameras: [] });
        writeFixture(source, config);
        const original = fs.readFileSync(source, 'utf8');

        expect(mockStore.load()).toEqual(validateConfig(config));
        expect(fsImpl.openSync).not.toHaveBeenCalled();
        if (location !== 'current') expect(fs.existsSync(current)).toBe(false);
        mockStore.initialize();
        expect(JSON.parse(fs.readFileSync(current, 'utf8'))).toEqual(validateConfig(config));
        expect(fs.readFileSync(source, 'utf8')).toBe(original);
        const writeCount = fsImpl.openSync.mock.calls.length;
        mockStore.initialize();
        expect(fsImpl.openSync).toHaveBeenCalledTimes(writeCount);
    });

    test('legacy bare arrays are normalized and migrated without losing fields', () => {
        writeFixture(legacy, fixtureConfig().cameras);
        const loaded = mockStore.initialize();
        expect(loaded.cameras).toEqual(fixtureConfig().cameras);
        expect(loaded.defaultCredentials).toEqual({ username: '', password: '' });
        expect(fs.existsSync(legacy)).toBe(true);
    });

    test('load and save return detached copies of the persisted snapshot', () => {
        writeFixture(current, fixtureConfig());
        const loaded = mockStore.load();
        loaded.cameras[0].custom.keep = 'unsaved';
        expect(mockStore.load().cameras[0].custom.keep).toBe('extension-data');
        const saved = mockStore.save(fixtureConfig());
        saved.cameras[0].password = 'unsaved';
        expect(mockStore.load().cameras[0].password).toBe('fixture-password');
    });

    test('failed migration keeps the old file and snapshot without leaking the failure text', () => {
        writeFixture(previous, fixtureConfig());
        fsImpl.renameSync.mockImplementationOnce(() => { throw new Error(SECRET_ERROR); });
        expect(mockStore.initialize()).toEqual(validateConfig(fixtureConfig()));
        expect(fs.existsSync(current)).toBe(false);
        expect(JSON.parse(fs.readFileSync(previous, 'utf8'))).toEqual(fixtureConfig());
        expect(fs.readdirSync(path.dirname(current))).toEqual([]);
        expect(JSON.stringify(logger.error.mock.calls)).not.toContain('fixture-password');
        expect(logger.warn).toHaveBeenCalledTimes(1);
    });

    test.each([null, {}, { cameras: {} }, { cameras: [null] }, { cameras: [{}] },
        { cameras: [{ ip: IP, rtspPath: {} }] }, { cameras: [], defaultCredentials: [] }])(
        'rejects invalid shape %j rather than overwriting from fallback', invalid => {
            writeFixture(current, invalid);
            writeFixture(previous, fixtureConfig());
            expect(() => mockStore.initialize()).toThrow('Could not read camera configuration');
            expect(() => mockStore.save(fixtureConfig())).toThrow('Could not read camera configuration');
            expect(JSON.parse(fs.readFileSync(current, 'utf8'))).toEqual(invalid);
            expect(fsImpl.openSync).not.toHaveBeenCalled();
        });

    test('malformed JSON and unreadable current config fail closed with safe errors', () => {
        fs.mkdirSync(path.dirname(current), { recursive: true });
        fs.writeFileSync(current, `{"password":"${SECRET_ERROR}`);
        writeFixture(previous, fixtureConfig());
        expect(() => mockStore.initialize()).toThrow('Could not read camera configuration');
        fsImpl.readFileSync.mockImplementationOnce(() => { throw new Error(SECRET_ERROR); });
        expect(() => mockStore.load()).toThrow('Could not read camera configuration');
        expect(JSON.stringify(logger.error.mock.calls)).not.toContain('fixture-password');
        expect(fsImpl.openSync).not.toHaveBeenCalled();
    });

    test('current empty camera list is authoritative; missing files do not create empty configs', () => {
        expect(mockStore.initialize().cameras).toEqual([]);
        expect(fs.existsSync(current)).toBe(false);
        writeFixture(current, { cameras: [] });
        writeFixture(previous, fixtureConfig());
        expect(newStore().initialize().cameras).toEqual([]);
    });
});

describe('real camera router persistence and redaction', () => {
    beforeEach(() => writeFixture(current, fixtureConfig()));

    test('name-only edit preserves password, URI paths, port, mjpeg and custom fields on disk and in the service', async () => {
        const response = await dispatch(router, 'POST', '/', { ip: IP, name: 'Renamed' });
        expect(response.status).toBe(200);
        const expected = fixtureConfig();
        expected.cameras[0].name = 'Renamed';
        expect(JSON.parse(fs.readFileSync(current, 'utf8'))).toEqual(validateConfig(expected));
        expect(mockStore.load()).toEqual(validateConfig(expected));
        expect(response.body.camera.password).toBeUndefined();
        expect(response.body.camera.hasPassword).toBe(true);
        expect(response.body.camera.rtspUrl).toBe(redactUri(expected.cameras[0].rtspUrl));
        expect(fsImpl.openSync).toHaveBeenCalledWith(expect.stringContaining(current), 'wx', 0o600);

        const service = require('../src/cameras/CameraService');
        jest.spyOn(service, '_startHealthCheck').mockImplementation(() => {});
        await service.initialize();
        expect(service._loadCamerasConfig()[0]).toEqual(expected.cameras[0]);
        const Worker = require('../src/cameras/CameraWorker');
        expect(Worker).toHaveBeenCalledWith(expect.objectContaining(expected.cameras[0]));
        service.shutdown();
    });

    test('posting the redacted list response preserves all original URI secrets', async () => {
        const listed = await dispatch(router, 'GET', '/');
        expect(JSON.stringify(listed.body)).not.toMatch(/fixture-(password|snapshot|token|url|query|mjpeg|default)/);
        const edited = { ...listed.body.cameras[0], name: 'Via list', password: '' };
        expect((await dispatch(router, 'POST', '/', edited)).status).toBe(200);
        const stored = mockStore.load().cameras[0];
        expect(stored).toEqual({ ...fixtureConfig().cameras[0], name: 'Via list' });
        expect(stored.hasPassword).toBeUndefined();
        expect(fs.readFileSync(current, 'utf8')).not.toContain('redacted');
    });

    test('RTSP/MJPEG partial edits accept exact redacted URI values as unchanged', async () => {
        const camera = fixtureConfig().cameras[0];
        expect((await dispatch(router, 'PUT', `/${IP}/rtsp`, {
            rtspPort: 9554, rtspPath: redactUri(camera.rtspPath), rtspUrl: redactUri(camera.rtspUrl)
        })).status).toBe(200);
        expect((await dispatch(router, 'PUT', `/${IP}/mjpeg`, {
            mjpegPath: redactUri(camera.mjpegPath)
        })).status).toBe(200);
        expect(mockStore.load().cameras[0]).toEqual({ ...camera, rtspPort: 9554 });
        // Previous API redacted passwords but left query usernames visible.
        expect((await dispatch(router, 'POST', '/', { ip: IP,
            snapshotPath: '/snapshot?user=fixture-user&password=redacted'
        })).status).toBe(200);
        expect(mockStore.load().cameras[0].snapshotPath).toBe(camera.snapshotPath);
    });

    test.each([
        ['POST', '/', { ip: IP, snapshotPath: '/different?password=redacted' }],
        ['POST', '/', { ip: '198.51.100.43', rtspUrl: 'rtsp://redacted:redacted@198.51.100.43/live' }],
        ['POST', '/', { ip: IP, password: '****' }],
        ['POST', '/credentials', { password: 'redacted' }],
        ['PUT', `/${IP}/rtsp`, { rtspUrl: `rtsp://user:****@${IP}/live` }],
        ['PUT', `/${IP}/rtsp`, { rtspPath: '/other?token=%72edacted' }],
        ['PUT', `/${IP}/mjpeg`, { mjpegPath: '/other?pwd=redacted' }]
    ])('rejects new placeholder settings via %s %s', async (method, url, body) => {
        const before = fs.readFileSync(current, 'utf8');
        const response = await dispatch(router, method, url, body);
        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(fs.readFileSync(current, 'utf8')).toBe(before);
        expect(mockStore.load()).toEqual(validateConfig(fixtureConfig()));
    });

    test('genuine new credentials and paths replace old ones, without inventing encryption', async () => {
        const changed = { ip: IP, password: 'new-fixture-password', snapshotPath: '/new?token=new-fixture-token' };
        const response = await dispatch(router, 'POST', '/', changed);
        expect(response.status).toBe(200);
        expect(response.body.camera.snapshotPath).toBe('/new?token=redacted');
        const persisted = JSON.parse(fs.readFileSync(current, 'utf8'));
        expect(persisted.cameras[0].password).toBe(changed.password);
        expect(persisted.cameras[0].snapshotPath).toBe(changed.snapshotPath);
    });

    test('default credential partial edits keep the existing password', async () => {
        expect((await dispatch(router, 'POST', '/credentials', { username: 'renamed-default', password: '' })).status).toBe(200);
        expect(mockStore.load().defaultCredentials).toEqual({ username: 'renamed-default', password: 'fixture-default' });
    });

    test('real passwords containing asterisks or the word redacted are not mistaken for placeholders', async () => {
        const config = fixtureConfig();
        config.cameras[0].password = 'fixture***redacted-but-real';
        config.cameras[0].rtspPath = '/redacted-feed?pwd=fixture***redacted-but-real';
        writeFixture(current, config);
        expect((await dispatch(router, 'POST', '/', { ip: IP, name: 'Renamed' })).status).toBe(200);
        expect(mockStore.load().cameras[0]).toEqual({ ...config.cameras[0], name: 'Renamed' });
    });

    test.each([
        ['POST', '/', { ip: IP, name: 'Not persisted' }],
        ['POST', '/', { ip: '198.51.100.43', name: 'Not added' }],
        ['DELETE', `/${IP}`, {}],
        ['POST', '/credentials', { password: 'not-persisted' }],
        ['PUT', `/${IP}/rtsp`, { rtspPort: 9554 }],
        ['PUT', `/${IP}/mjpeg`, { mjpegPath: '/not-persisted' }]
    ])('failed save from %s %s leaves memory and disk unchanged', async (method, url, body) => {
        const before = fs.readFileSync(current, 'utf8');
        fsImpl.renameSync.mockImplementationOnce(() => { throw new Error(SECRET_ERROR); });
        const response = await dispatch(router, method, url, body);
        expect(response.status).toBe(500);
        expect(response.body).toEqual({ success: false, error: 'Could not save camera configuration' });
        expect(mockStore.load()).toEqual(validateConfig(fixtureConfig()));
        expect(fs.readFileSync(current, 'utf8')).toBe(before);
        expect(fs.readdirSync(path.dirname(current))).toEqual(['cameras.json']);
        expect(JSON.stringify(logger.error.mock.calls)).not.toContain('fixture-password');
        expect((await dispatch(router, 'GET', '/')).body.cameras[0].name).toBe('Original');
        const service = require('../src/cameras/CameraService');
        expect(service._loadCamerasConfig()[0]).toEqual(fixtureConfig().cameras[0]);
    });

    test.each(['openSync', 'writeFileSync', 'fsyncSync'])('%s failure cannot publish unpersisted state', async method => {
        const before = fs.readFileSync(current, 'utf8');
        fsImpl[method].mockImplementationOnce(() => { throw new Error(SECRET_ERROR); });
        expect((await dispatch(router, 'POST', '/', { ip: IP, name: 'Not persisted' })).status).toBe(500);
        expect(fs.readFileSync(current, 'utf8')).toBe(before);
        expect(mockStore.load().cameras[0].name).toBe('Original');
        expect(fs.readdirSync(path.dirname(current))).toEqual(['cameras.json']);
    });

    test('snapshot auto-detection reports save failure instead of silently changing memory', async () => {
        const jpeg = Buffer.alloc(1200);
        jpeg[0] = 0xff; jpeg[1] = 0xd8;
        const exec = require('child_process').execFile[promisify.custom];
        exec.mockResolvedValueOnce({ stdout: Buffer.alloc(0) }).mockResolvedValueOnce({ stdout: jpeg });
        const before = fs.readFileSync(current, 'utf8');
        fsImpl.renameSync.mockImplementationOnce(() => { throw new Error(SECRET_ERROR); });
        const response = await dispatch(router, 'GET', `/snapshot/${IP}`);
        expect(response.status).toBe(500);
        expect(response.body.success).toBe(false);
        expect(mockStore.load().cameras[0].snapshotPath).toBe(fixtureConfig().cameras[0].snapshotPath);
        expect(fs.readFileSync(current, 'utf8')).toBe(before);
        expect(exec).toHaveBeenCalledTimes(2);
    });

    test('invalid JSON camera config produces a safe router failure', async () => {
        fs.writeFileSync(current, SECRET_ERROR);
        const response = await dispatch(router, 'GET', '/');
        expect(response.status).toBe(500);
        expect(response.body.error).toBe('Could not read camera configuration');
        expect(fsImpl.openSync).not.toHaveBeenCalled();
    });
});

describe('camera route protection and safe dependency responses', () => {
    test.each([
        ['GET', '/'], ['GET', `/snapshot/${IP}`], ['GET', `/mjpeg/${IP}`],
        ['GET', `/frame/${IP}`], ['GET', `/frame/${IP}/1`], ['GET', `/frames/${IP}`],
        ['GET', '/service/status'], ['GET', '/streams'], ['GET', `/stream/${IP}/status`],
        ['POST', '/inspect'], ['POST', '/discover'], ['POST', '/'], ['DELETE', `/${IP}`]
    ])('%s %s rejects remote users before config or camera access', async (method, url) => {
        const response = await dispatch(router, method, url, {}, { pin: '', headers: { 'x-forwarded-for': '127.0.0.1' } });
        expect(response.status).toBe(403);
        expect(fsImpl.readFileSync).not.toHaveBeenCalled();
        expect(require('net').Socket).not.toHaveBeenCalled();
        expect(require('child_process').spawn).not.toHaveBeenCalled();
        expect(require('../src/cameras').cameraService.getLatestFrame).not.toHaveBeenCalled();
    });

    test('PIN-authorized and loopback image requests work without any network', async () => {
        writeFixture(current, fixtureConfig());
        const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
        require('../src/cameras').cameraService.getLatestFrame.mockReturnValue(jpeg);
        const remote = await dispatch(router, 'GET', `/frame/${IP}`);
        expect(remote.status).toBe(200);
        expect(remote.body).toBe(jpeg);
        expect(remote.headers['content-type']).toBe('image/jpeg');
        const local = await dispatch(router, 'GET', '/', {}, { peer: '::ffff:127.0.0.1', pin: '' });
        expect(local.status).toBe(200);
        expect(local.body.cameras[0].password).toBeUndefined();
    });

    test('discovery and worker status redact nested URLs, passwords and raw error strings', async () => {
        writeFixture(current, fixtureConfig());
        const unsafe = { success: true, profiles: [{ rtspUrl: fixtureConfig().cameras[0].rtspUrl }],
            password: 'fixture-password', lastError: SECRET_ERROR };
        require('../src/discovery/CameraDiscovery').inspectCamera.mockResolvedValue(unsafe);
        require('../src/cameras').cameraService.getAllStatus.mockReturnValue(unsafe);
        for (const [method, url] of [['POST', '/inspect'], ['GET', '/service/status']]) {
            const response = await dispatch(router, method, url, { ip: IP });
            expect(response.status).toBe(200);
            expect(JSON.stringify(response.body)).not.toMatch(/fixture-(password|url|query)/);
            expect(response.body.lastError).toBe('Camera operation failed');
        }
    });

    test('thrown discovery, stream and frame errors never echo credentials', async () => {
        writeFixture(current, fixtureConfig());
        require('../src/discovery/CameraDiscovery').inspectCamera.mockRejectedValue(new Error(SECRET_ERROR));
        require('../src/streams/StreamManager').startStream.mockImplementation(() => { throw new Error(SECRET_ERROR); });
        require('../src/cameras').cameraService.getLatestFrame.mockImplementation(() => { throw new Error(SECRET_ERROR); });
        require('child_process').spawn.mockImplementation(() => { throw new Error(SECRET_ERROR); });
        for (const [method, url] of [['POST', '/inspect'], ['POST', `/stream/${IP}/start`], ['GET', `/frame/${IP}`], ['GET', `/mjpeg/${IP}`]]) {
            const response = await dispatch(router, method, url, { ip: IP });
            expect(response.status).toBe(500);
            expect(JSON.stringify(response.body)).not.toContain('fixture-password');
        }
        expect(JSON.stringify(console.error.mock.calls)).not.toContain('fixture-password');
        expect(JSON.stringify(console.log.mock.calls)).not.toContain('fixture-password');
    });
});