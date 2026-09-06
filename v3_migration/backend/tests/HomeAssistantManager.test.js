jest.mock('node-fetch', () => jest.fn());

jest.mock('ws', () => {
  const { EventEmitter } = require('events');

  return class FakeWebSocket extends EventEmitter {
    static instances = [];

    constructor(url) {
      super();
      this.url = url;
      this.sent = [];
      FakeWebSocket.instances.push(this);
    }

    send(message) {
      this.sent.push(JSON.parse(message));
    }

    close() {
      if (this.closed) return;
      this.closed = true;
      this.emit('close');
    }

    terminate() {
      this.terminated = true;
      this.close();
    }
  };
});

jest.mock('../src/logging/logger', () => ({
  log: jest.fn(() => Promise.resolve())
}));

jest.mock('../src/engine/commandTracker', () => ({
  logIncomingStateChange: jest.fn()
}));

const fetch = require('node-fetch');
const WebSocket = require('ws');
const logger = require('../src/logging/logger');
const tracker = require('../src/engine/commandTracker');
const manager = require('../src/devices/managers/homeAssistantManager');

const reply = (socket, message) => socket.emit('message', JSON.stringify(message));
const subscribe = socket => {
  socket.emit('open');
  reply(socket, { type: 'auth_required' });
  reply(socket, { type: 'auth_ok' });
  reply(socket, { id: 1, type: 'result', success: true, result: null });
};
const entity = (state = 'on', id = 'light.example') => ({
  entity_id: id,
  state,
  attributes: { friendly_name: 'Example', brightness: state === 'on' ? 255 : 0 }
});
const response = data => ({ ok: true, json: async () => data });
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const stateEvent = (newState, oldState = entity()) => ({
  type: 'event',
  event: { event_type: 'state_changed', data: { new_state: newState, old_state: oldState } }
});

describe('HomeAssistantManager WebSocket lifecycle', () => {
  const io = { emit: jest.fn() };
  const notificationEmitter = { emit: jest.fn() };
  const log = jest.fn(() => Promise.resolve());
  const originalHost = process.env.HA_HOST;
  const originalToken = process.env.HA_TOKEN;

  beforeEach(() => {
    jest.useFakeTimers();
    manager.shutdown();
    process.env.HA_HOST = 'http://ha.local:8123';
    process.env.HA_TOKEN = 'test-token';
    manager.updateConfig();
    manager.deviceHealth.clear();
    jest.clearAllMocks();
    jest.spyOn(Math, 'random').mockReturnValue(0);
    fetch.mockReset().mockResolvedValue(response([]));
    WebSocket.instances.length = 0;
  });

  afterEach(() => {
    manager.shutdown();
    const remainingTimers = jest.getTimerCount();
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
    if (originalHost === undefined) delete process.env.HA_HOST;
    else process.env.HA_HOST = originalHost;
    if (originalToken === undefined) delete process.env.HA_TOKEN;
    else process.env.HA_TOKEN = originalToken;
    expect(remainingTimers).toBe(0);
  });

  test('uses auth_required -> auth -> auth_ok -> subscribe -> result before readiness', async () => {
    await manager.initialize(io, notificationEmitter, log);
    const socket = WebSocket.instances[0];

    socket.emit('open');
    expect(socket.sent).toEqual([]);
    expect(manager.getConnectionStatus().isConnected).toBe(false);
    expect(manager.getConnectionStatus().wsConnected).toBe(false);
    reply(socket, { id: 1, type: 'result', success: true });
    reply(socket, { type: 'auth_ok' }); // Out-of-order messages are not authentication.
    expect(socket.sent).toEqual([]);
    expect(manager.getConnectionStatus().wsConnected).toBe(false);

    reply(socket, { type: 'auth_required' });
    reply(socket, { type: 'auth_required' });
    expect(socket.sent).toEqual([{ type: 'auth', access_token: 'test-token' }]);
    reply(socket, { type: 'auth_ok' });
    reply(socket, { type: 'auth_ok' });
    expect(socket.sent).toEqual([
      { type: 'auth', access_token: 'test-token' },
      { id: 1, type: 'subscribe_events', event_type: 'state_changed' }
    ]);
    reply(socket, { id: 2, type: 'result', success: true });
    reply(socket, stateEvent(entity()));
    expect(manager.getConnectionStatus().wsConnected).toBe(false);
    expect(io.emit).not.toHaveBeenCalledWith('device-state-update', expect.anything());
    reply(socket, { id: 1, type: 'result', success: true });
    expect(manager.getConnectionStatus().isConnected).toBe(true);
    expect(manager.getConnectionStatus().wsConnected).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });

  test('a reconnect can wait for auth then succeed without a pending retry replacing it', async () => {
    await manager.initialize(io, notificationEmitter, log);
    subscribe(WebSocket.instances[0]);
    WebSocket.instances[0].close();
    expect(manager.getConnectionStatus().wsConnected).toBe(false);
    expect(jest.getTimerCount()).toBe(1);

    await jest.advanceTimersByTimeAsync(1000);
    const replacement = WebSocket.instances[1];
    expect(WebSocket.instances).toHaveLength(2);
    expect(jest.getTimerCount()).toBe(1); // Only the handshake deadline, not another retry.
    await jest.advanceTimersByTimeAsync(2500);
    expect(WebSocket.instances).toHaveLength(2);
    expect(replacement.closed).not.toBe(true);
    subscribe(replacement);
    expect(jest.getTimerCount()).toBe(0);
    await jest.advanceTimersByTimeAsync(60000);
    expect(WebSocket.instances).toHaveLength(2);
    expect(manager.getConnectionStatus().wsConnected).toBe(true);
  });

  test('explicit initialize cancels a pending reconnect', async () => {
    await manager.initialize(io, notificationEmitter, log);
    WebSocket.instances[0].close();
    expect(jest.getTimerCount()).toBe(1);
    await manager.initialize(io, notificationEmitter, log);
    subscribe(WebSocket.instances[1]);
    await jest.advanceTimersByTimeAsync(60000);
    expect(WebSocket.instances).toHaveLength(2);
    expect(jest.getTimerCount()).toBe(0);
  });

  test('error plus close plus stale error schedules just one retry', async () => {
    await manager.initialize(io, notificationEmitter, log);
    const socket = WebSocket.instances[0];
    socket.emit('error', new Error('Transport failed'));
    socket.emit('close');
    socket.emit('error', new Error('Late transport error'));
    expect(socket.terminated).toBe(true);
    expect(jest.getTimerCount()).toBe(1);
    await jest.advanceTimersByTimeAsync(1000);
    expect(WebSocket.instances).toHaveLength(2);
    subscribe(WebSocket.instances[1]);
    expect(jest.getTimerCount()).toBe(0);
  });

  test.each(['transport', 'authentication', 'subscription'])('bounds a stalled %s handshake and retries once', async stage => {
    await manager.initialize(io, notificationEmitter, log);
    const socket = WebSocket.instances[0];
    if (stage !== 'transport') {
      socket.emit('open');
      reply(socket, { type: 'auth_required' });
    }
    if (stage === 'subscription') reply(socket, { type: 'auth_ok' });
    await jest.advanceTimersByTimeAsync(10000);
    expect(socket.terminated).toBe(true);
    expect(manager.getConnectionStatus().wsConnected).toBe(false);
    expect(WebSocket.instances).toHaveLength(1);
    expect(jest.getTimerCount()).toBe(1);
    await jest.advanceTimersByTimeAsync(1000);
    expect(WebSocket.instances).toHaveLength(2);
    subscribe(WebSocket.instances[1]);
    expect(jest.getTimerCount()).toBe(0);
  });

  test('subscription failure retries and successful subscription resets backoff', async () => {
    await manager.initialize(io, notificationEmitter, log);
    const first = WebSocket.instances[0];
    reply(first, { type: 'auth_required' });
    reply(first, { type: 'auth_ok' });
    reply(first, { id: 1, type: 'result', success: false, error: { code: 'unknown_error' } });
    await jest.advanceTimersByTimeAsync(1000);
    WebSocket.instances[1].close();
    await jest.advanceTimersByTimeAsync(1999);
    expect(WebSocket.instances).toHaveLength(2);
    await jest.advanceTimersByTimeAsync(1);
    subscribe(WebSocket.instances[2]);
    WebSocket.instances[2].close();
    await jest.advanceTimersByTimeAsync(1000);
    expect(WebSocket.instances).toHaveLength(4);
    subscribe(WebSocket.instances[3]);
  });

  test('auth_invalid stops retries; an ordinary REST read does not reset rejection', async () => {
    await manager.initialize(io, notificationEmitter, log);
    const socket = WebSocket.instances[0];
    socket.emit('open');
    reply(socket, { type: 'auth_required' });
    reply(socket, { type: 'auth_invalid' });
    fetch.mockResolvedValueOnce(response(entity()));
    expect((await manager.getState('ha_light.example')).success).toBe(true);
    await jest.advanceTimersByTimeAsync(60000);
    expect(WebSocket.instances).toHaveLength(1);
    expect(manager.getConnectionStatus().wsConnected).toBe(false);
    expect(jest.getTimerCount()).toBe(0);

    // Explicit reconfigure retries even when the environment values are unchanged.
    expect(manager.updateConfig()).toBe(false);
    await jest.advanceTimersByTimeAsync(1000);
    subscribe(WebSocket.instances[1]);
    expect(manager.getConnectionStatus().wsConnected).toBe(true);
  });

  test.each([401, 403])('HTTP %s stops retries until explicit initialization', async status => {
    fetch.mockResolvedValueOnce({ ok: false, status });
    expect(await manager.initialize(io, notificationEmitter, log)).toEqual([]);
    await jest.advanceTimersByTimeAsync(60000);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(WebSocket.instances).toHaveLength(0);
    expect(jest.getTimerCount()).toBe(0);
    await manager.initialize(io, notificationEmitter, log);
    subscribe(WebSocket.instances[0]);
    expect(manager.getConnectionStatus().wsConnected).toBe(true);
  });

  test('a WebSocket HTTP 401 upgrade rejection stops retries', async () => {
    await manager.initialize(io, notificationEmitter, log);
    const socket = WebSocket.instances[0];
    socket.emit('unexpected-response', {}, { statusCode: 401 });
    socket.emit('error', new Error('Late upgrade failure'));
    await jest.advanceTimersByTimeAsync(60000);
    expect(WebSocket.instances).toHaveLength(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  test.each(['fetch', 'body'])('shutdown while initial REST %s is pending cannot revive the manager', async stage => {
    const pending = deferred();
    fetch.mockReturnValueOnce(stage === 'fetch' ? pending.promise : Promise.resolve({ ok: true, json: () => pending.promise }));
    const initialization = manager.initialize(io, notificationEmitter, log);
    await jest.advanceTimersByTimeAsync(0);
    const signal = fetch.mock.calls[0][1].signal;
    manager.shutdown();
    expect(signal.aborted).toBe(true);
    expect(await initialization).toEqual([]);
    const emissions = io.emit.mock.calls.length;
    pending.resolve(stage === 'fetch' ? response([entity()]) : [entity()]);
    await jest.advanceTimersByTimeAsync(60000);
    expect(WebSocket.instances).toHaveLength(0);
    expect(await manager.getDevices()).toEqual([]);
    expect(io.emit).toHaveBeenCalledTimes(emissions);
    expect(manager.getConnectionStatus()).toMatchObject({ isConnected: false, wsConnected: false });
    expect(jest.getTimerCount()).toBe(0);
  });

  test.each(['fetch', 'body'])('initial REST %s timeout is bounded even if AbortSignal is ignored', async stage => {
    const pending = deferred();
    fetch.mockReturnValueOnce(stage === 'fetch' ? pending.promise : Promise.resolve({ ok: true, json: () => pending.promise }));
    const initialization = manager.initialize(io, notificationEmitter, log);
    const signal = fetch.mock.calls[0][1].signal;
    await jest.advanceTimersByTimeAsync(10000);
    expect(await initialization).toEqual([]);
    expect(signal.aborted).toBe(true);
    expect(jest.getTimerCount()).toBe(1);
    await jest.advanceTimersByTimeAsync(1000);
    expect(WebSocket.instances).toHaveLength(1);
    subscribe(WebSocket.instances[0]);
    pending.resolve(stage === 'fetch' ? response([entity()]) : [entity()]);
    await jest.advanceTimersByTimeAsync(60000);
    expect(await manager.getDevices()).toEqual([]);
    expect(WebSocket.instances).toHaveLength(1);
    expect(manager.getConnectionStatus().wsConnected).toBe(true);
  });

  test.each(['resolve', 'reject'])('duplicate initialization ignores a stale REST %s', async completion => {
    const pending = deferred();
    fetch.mockReturnValueOnce(pending.promise);
    const oldInitialization = manager.initialize(io, notificationEmitter, log);
    const oldSignal = fetch.mock.calls[0][1].signal;
    fetch.mockResolvedValueOnce(response([entity('off')]));
    await manager.initialize(io, notificationEmitter, log);
    expect(await oldInitialization).toEqual([]);
    expect(oldSignal.aborted).toBe(true);
    subscribe(WebSocket.instances[0]);
    const emissions = io.emit.mock.calls.length;
    if (completion === 'resolve') pending.resolve(response([entity('on')]));
    else pending.reject(Object.assign(new Error('Old authentication failed'), { status: 401 }));
    await jest.advanceTimersByTimeAsync(60000);
    expect((await manager.getDevices())[0].state.on).toBe(false);
    expect(io.emit).toHaveBeenCalledTimes(emissions);
    expect(WebSocket.instances).toHaveLength(1);
    expect(manager.getConnectionStatus().wsConnected).toBe(true);
  });

  test('duplicate initialization ignores every retired socket event', async () => {
    await manager.initialize(io, notificationEmitter, log);
    const retired = WebSocket.instances[0];
    subscribe(retired);
    await manager.initialize(io, notificationEmitter, log);
    const current = WebSocket.instances[1];
    subscribe(current);
    expect(retired.terminated).toBe(true);
    const sent = retired.sent.length;
    io.emit.mockClear();
    log.mockClear();
    retired.emit('open');
    reply(retired, { type: 'auth_required' });
    reply(retired, { type: 'auth_ok' });
    reply(retired, { id: 1, type: 'result', success: true });
    reply(retired, stateEvent(entity('unlocked', 'lock.front'), entity('locked', 'lock.front')));
    reply(retired, { type: 'auth_invalid' });
    retired.emit('error', new Error('Stale error'));
    retired.emit('close');
    expect(retired.sent).toHaveLength(sent);
    expect(io.emit).not.toHaveBeenCalled();
    expect(notificationEmitter.emit).not.toHaveBeenCalled();
    expect(tracker.logIncomingStateChange).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    expect(manager.getConnectionStatus().wsConnected).toBe(true);
    current.close();
    await jest.advanceTimersByTimeAsync(1000);
    expect(WebSocket.instances).toHaveLength(3); // Old auth_invalid did not disable retries.
    subscribe(WebSocket.instances[2]);
  });

  test('reconfigure cancels pending REST without allowing it to restore old devices', async () => {
    const pending = deferred();
    fetch.mockReturnValueOnce(pending.promise);
    const initialization = manager.initialize(io, notificationEmitter, log);
    process.env.HA_HOST = 'http://new-ha.local:8123';
    process.env.HA_TOKEN = 'new-test-token';
    expect(manager.updateConfig()).toBe(true);
    expect(await initialization).toEqual([]);
    await jest.advanceTimersByTimeAsync(1000);
    const socket = WebSocket.instances[0];
    expect(socket.url).toBe('ws://new-ha.local:8123/api/websocket');
    subscribe(socket);
    expect(socket.sent[0]).toEqual({ type: 'auth', access_token: 'new-test-token' });
    pending.resolve(response([entity()]));
    await jest.advanceTimersByTimeAsync(60000);
    expect(await manager.getDevices()).toEqual([]);
    expect(WebSocket.instances).toHaveLength(1);
  });

  test('shutdown clears pending retries and ignores late events without reconnecting', async () => {
    await manager.initialize(io, notificationEmitter, log);
    const socket = WebSocket.instances[0];
    socket.close();
    manager.shutdown();
    const emissions = io.emit.mock.calls.length;
    subscribe(socket);
    socket.emit('error', new Error('After shutdown'));
    socket.emit('close');
    manager.updateConfig(); // Settings refresh alone must not undo shutdown.
    await jest.advanceTimersByTimeAsync(60000);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(WebSocket.instances).toHaveLength(1);
    // Reconfigure may broadcast the disconnected status, but never readiness.
    expect(io.emit.mock.calls.slice(emissions).every(([event, status]) => event === 'ha-connection-status' && !status.wsConnected)).toBe(true);
    expect(manager.getConnectionStatus()).toMatchObject({ isConnected: false, wsConnected: false });
  });

  test('initialization rebuilds getDevices instead of wrapping the old cached list', async () => {
    fetch.mockResolvedValueOnce(response([entity('on')]));
    await manager.initialize(io, notificationEmitter, log);
    const oldList = await manager.getDevices();
    expect(oldList[0].state.on).toBe(true);
    fetch.mockResolvedValueOnce(response([entity('off')]));
    await manager.initialize(io, notificationEmitter, log);
    const newList = await manager.getDevices();
    expect(Array.isArray(newList)).toBe(true);
    expect(newList).not.toBe(oldList);
    expect(newList[0].state.on).toBe(false);
  });

  test.each(['changed', 'removed'])('%s events invalidate raw and ha_ state caches and the device list', async change => {
    fetch.mockResolvedValueOnce(response([entity()]));
    await manager.initialize(io, notificationEmitter, log);
    const socket = WebSocket.instances[0];
    subscribe(socket);
    fetch.mockResolvedValue(response(entity()));
    const raw = await manager.getState('light.example');
    const prefixed = await manager.getState('ha_light.example');
    expect(raw).toMatchObject({ success: true, state: { state: 'on', on: true, brightness: 100 } });
    expect(prefixed).toEqual(raw);
    await manager.getState('light.example');
    await manager.getState('ha_light.example');
    expect(fetch).toHaveBeenCalledTimes(3);
    await manager.getDevices();

    const next = change === 'removed' ? null : entity('off');
    reply(socket, stateEvent(next));
    fetch.mockResolvedValue(response(entity(change === 'removed' ? 'unavailable' : 'off')));
    expect((await manager.getState('light.example')).state.on).toBe(false);
    expect((await manager.getState('ha_light.example')).state.on).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(5);
    const devices = await manager.getDevices();
    if (change === 'removed') expect(devices).toEqual([]);
    else expect(devices[0].state.on).toBe(false);
    expect(io.emit).toHaveBeenLastCalledWith('device-state-update', expect.objectContaining({
      id: 'ha_light.example', state: change === 'removed' ? 'unavailable' : 'off', on: false
    }));
  });

  test.each(['getState', 'updateState', 'callService'])('%s does not forward credential-bearing transport errors', async operation => {
    const secret = 'http://url-user:url-password@ha.local:8123/?key=query-secret test-token';
    fetch.mockRejectedValueOnce(new Error(secret));
    let result;
    if (operation === 'getState') result = await manager.getState('ha_light.example');
    else if (operation === 'updateState') result = await manager.updateState('ha_light.example', { on: true });
    else result = await manager.callService('light', 'turn_on', { entity_id: 'light.example' });
    expect(result).toEqual({ success: false, error: 'Home Assistant request failed' });
    const output = JSON.stringify([logger.log.mock.calls, result, manager.getUnhealthyDevices()]);
    for (const value of ['url-user', 'url-password', 'query-secret', 'test-token']) expect(output).not.toContain(value);
  });

  test('lifecycle logs and status envelopes never include token or URL secrets', async () => {
    process.env.HA_HOST = 'http://url-user:url-password@ha.local:8123/private-secret?key=query-secret#fragment-secret';
    process.env.HA_TOKEN = 'mock-secret-token';
    await manager.initialize(io, notificationEmitter, log);
    expect(manager.getConnectionStatus().host).toBe('http://ha.local:8123');
    WebSocket.instances[0].emit('error', new Error(`${process.env.HA_HOST} ${process.env.HA_TOKEN}`));
    fetch.mockRejectedValueOnce(new Error(`${process.env.HA_HOST} ${process.env.HA_TOKEN}`));
    await manager.initialize(io, notificationEmitter, log);
    const output = JSON.stringify([log.mock.calls, logger.log.mock.calls, io.emit.mock.calls, manager.getConnectionStatus()]);
    for (const secret of ['url-user', 'url-password', 'private-secret', 'query-secret', 'fragment-secret', 'mock-secret-token']) {
      expect(output).not.toContain(secret);
    }
  });
});