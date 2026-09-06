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

const fetch = require('node-fetch');
const WebSocket = require('ws');
const logger = require('../src/logging/logger');
const manager = require('../src/devices/managers/homeAssistantMediaPlayerManager');

const receiver = (state = 'on') => ({
  entity_id: 'media_player.receiver',
  state,
  attributes: { device_class: 'receiver', friendly_name: 'Receiver', volume_level: 0.4 }
});
const response = data => ({ ok: true, json: async () => data });
const reply = (socket, message) => socket.emit('message', JSON.stringify(message));
const subscribe = socket => {
  socket.emit('open');
  reply(socket, { type: 'auth_required' });
  reply(socket, { type: 'auth_ok' });
  reply(socket, { id: 1, type: 'result', success: true });
};
const deferred = () => {
  let resolve;
  const promise = new Promise(yes => { resolve = yes; });
  return { promise, resolve };
};
const stateEvent = () => ({
  type: 'event',
  event: { event_type: 'state_changed', data: { new_state: receiver('off') } }
});

describe('HomeAssistantMediaPlayerManager lifecycle', () => {
  const io = { emit: jest.fn() };
  const notifications = { emit: jest.fn() };
  const log = jest.fn(() => Promise.resolve());
  const originalHost = process.env.HA_HOST;
  const originalToken = process.env.HA_TOKEN;

  beforeEach(() => {
    jest.useFakeTimers();
    manager.shutdown();
    jest.clearAllMocks();
    fetch.mockReset().mockImplementation(async () => response([receiver()]));
    WebSocket.instances.length = 0;
    process.env.HA_HOST = 'http://ha.local:8123';
    process.env.HA_TOKEN = 'test-token';
  });

  afterEach(() => {
    manager.shutdown();
    const remainingTimers = jest.getTimerCount();
    jest.clearAllTimers();
    jest.useRealTimers();
    if (originalHost === undefined) delete process.env.HA_HOST;
    else process.env.HA_HOST = originalHost;
    if (originalToken === undefined) delete process.env.HA_TOKEN;
    else process.env.HA_TOKEN = originalToken;
    expect(remainingTimers).toBe(0);
  });

  test('shares initialized devices with exported reads', async () => {
    await manager.initialize(io, notifications, log);

    const devices = await manager.getDevices();

    expect(devices).toEqual([{
      id: 'ha_media_player_media_player.receiver',
      name: 'Receiver',
      type: 'media_player',
      state: { on: true, volume_level: 0.4, source: null, source_list: [], sound_mode: null }
    }]);
    expect(manager.name).toBe('homeAssistantMediaPlayer');
    expect(manager.prefix).toBe('ha_media_player_');
    expect(notifications.emit).not.toHaveBeenCalled();
  });

  test('initialization uses env set after module import and refreshes it again on reinit', async () => {
    await manager.initialize(io, notifications, log);
    expect(fetch).toHaveBeenLastCalledWith('http://ha.local:8123/api/states', expect.objectContaining({
      headers: { Authorization: 'Bearer test-token' }, signal: expect.anything(), timeout: 10000
    }));
    const old = WebSocket.instances[0];
    process.env.HA_HOST = 'https://new-ha.local:8123';
    process.env.HA_TOKEN = 'new-test-token';
    await manager.initialize(io, notifications, log);
    expect(old.terminated).toBe(true);
    expect(fetch).toHaveBeenLastCalledWith('https://new-ha.local:8123/api/states', expect.objectContaining({
      headers: { Authorization: 'Bearer new-test-token' }
    }));
    const socket = WebSocket.instances[1];
    expect(socket.url).toBe('wss://new-ha.local:8123/api/websocket');
    subscribe(socket);
    expect(socket.sent[0]).toEqual({ type: 'auth', access_token: 'new-test-token' });
  });

  test('control refreshes host/token without needing initialize and preserves service payload', async () => {
    process.env.HA_HOST = 'http://control-ha.local:8123';
    process.env.HA_TOKEN = 'control-test-token';
    expect(await manager.controlDevice('ha_media_player_media_player.receiver', { volume_level: 0.7 })).toEqual({ success: true });
    expect(fetch).toHaveBeenLastCalledWith('http://control-ha.local:8123/api/services/media_player/volume_set', expect.objectContaining({
      method: 'POST',
      headers: { Authorization: 'Bearer control-test-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity_id: 'media_player.receiver', volume_level: 0.7 })
    }));
    process.env.HA_HOST = 'http://second-control-ha.local:8123';
    process.env.HA_TOKEN = 'second-control-test-token';
    await manager.controlDevice('ha_media_player_media_player.receiver', { on: false });
    expect(fetch).toHaveBeenLastCalledWith('http://second-control-ha.local:8123/api/services/media_player/turn_off', expect.objectContaining({
      headers: { Authorization: 'Bearer second-control-test-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity_id: 'media_player.receiver' })
    }));
  });

  test('waits for the real auth and subscription exchange before processing events', async () => {
    await manager.initialize(io, notifications, log);
    const socket = WebSocket.instances[0];
    io.emit.mockClear();
    socket.emit('open');
    expect(socket.sent).toEqual([]);
    reply(socket, { type: 'auth_ok' });
    reply(socket, { id: 1, type: 'result', success: true });
    reply(socket, stateEvent());
    expect(socket.sent).toEqual([]);
    expect(io.emit).not.toHaveBeenCalled();
    reply(socket, { type: 'auth_required' });
    reply(socket, { type: 'auth_required' });
    expect(socket.sent).toEqual([{ type: 'auth', access_token: 'test-token' }]);
    reply(socket, { type: 'auth_ok' });
    reply(socket, { type: 'auth_ok' });
    expect(socket.sent).toHaveLength(2);
    expect(socket.sent[1]).toEqual({ id: 1, type: 'subscribe_events', event_type: 'state_changed' });
    reply(socket, stateEvent());
    expect(io.emit).not.toHaveBeenCalled();
    reply(socket, { id: 1, type: 'result', success: true });
    reply(socket, stateEvent());
    expect(io.emit).toHaveBeenCalledWith('device-state-update', {
      id: 'ha_media_player_media_player.receiver', on: false, volume_level: 0.4,
      source: null, source_list: [], sound_mode: null
    });
    expect(jest.getTimerCount()).toBe(0);
    await jest.advanceTimersByTimeAsync(60000);
    expect(socket.closed).not.toBe(true);
    expect(WebSocket.instances).toHaveLength(1);
  });

  test('reinit closes the old socket before awaiting REST and ignores all stale events', async () => {
    await manager.initialize(io, notifications, log);
    const old = WebSocket.instances[0];
    subscribe(old);
    const oldSent = old.sent.length;
    const pending = deferred();
    fetch.mockReturnValueOnce(pending.promise);
    const reinitialization = manager.initialize(io, notifications, log);
    expect(old.terminated).toBe(true);
    io.emit.mockClear();
    log.mockClear();
    old.emit('open');
    reply(old, { type: 'auth_required' });
    reply(old, { type: 'auth_ok' });
    reply(old, { id: 1, type: 'result', success: true });
    reply(old, stateEvent());
    reply(old, { type: 'auth_invalid' });
    old.emit('error', new Error('Stale error'));
    old.emit('close');
    expect(io.emit).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    expect(old.sent).toHaveLength(oldSent);
    pending.resolve(response([receiver('off')]));
    await reinitialization;
    subscribe(WebSocket.instances[1]);
    expect((await manager.getDevices())[0].state.on).toBe(false);
    await jest.advanceTimersByTimeAsync(60000);
    expect(WebSocket.instances).toHaveLength(2);
  });

  test('overlapping initializers cannot replace the newer devices or socket', async () => {
    const pending = deferred();
    fetch.mockReturnValueOnce(pending.promise);
    const old = manager.initialize(io, notifications, log);
    const signal = fetch.mock.calls[0][1].signal;
    fetch.mockResolvedValueOnce(response([receiver('off')]));
    await manager.initialize(io, notifications, log);
    subscribe(WebSocket.instances[0]);
    expect(await old).toEqual([]);
    expect(signal.aborted).toBe(true);
    pending.resolve(response([receiver('on')]));
    await jest.advanceTimersByTimeAsync(60000);
    expect((await manager.getDevices())[0].state.on).toBe(false);
    expect(WebSocket.instances).toHaveLength(1);
  });

  test.each(['fetch', 'body'])('shutdown during REST %s prevents late initialization', async stage => {
    // Establish a known snapshot without opening a socket.
    fetch.mockResolvedValueOnce(response([]));
    await manager.initialize(null, null, log);
    const pending = deferred();
    fetch.mockReturnValueOnce(stage === 'fetch' ? pending.promise : Promise.resolve({ ok: true, json: () => pending.promise }));
    const initialization = manager.initialize(io, notifications, log);
    await jest.advanceTimersByTimeAsync(0);
    const signal = fetch.mock.calls[1][1].signal;
    manager.shutdown();
    expect(signal.aborted).toBe(true);
    expect(await initialization).toEqual([]);
    pending.resolve(stage === 'fetch' ? response([receiver()]) : [receiver()]);
    await jest.advanceTimersByTimeAsync(60000);
    expect(await manager.getDevices()).toEqual([]);
    expect(WebSocket.instances).toHaveLength(0);
    expect(io.emit).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  test.each(['fetch', 'body'])('bounds the initial REST %s even when abort is ignored', async stage => {
    const pending = deferred();
    fetch.mockReturnValueOnce(stage === 'fetch' ? pending.promise : Promise.resolve({ ok: true, json: () => pending.promise }));
    const initialization = manager.initialize(io, notifications, log);
    const signal = fetch.mock.calls[0][1].signal;
    await jest.advanceTimersByTimeAsync(10000);
    expect(await initialization).toEqual([]);
    expect(signal.aborted).toBe(true);
    pending.resolve(stage === 'fetch' ? response([receiver()]) : [receiver()]);
    await jest.advanceTimersByTimeAsync(60000);
    expect(WebSocket.instances).toHaveLength(0);
    expect(io.emit).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  test.each(['transport', 'authentication', 'subscription'])('closes a stalled %s handshake without leaking timers', async stage => {
    await manager.initialize(io, notifications, log);
    const socket = WebSocket.instances[0];
    if (stage !== 'transport') reply(socket, { type: 'auth_required' });
    if (stage === 'subscription') reply(socket, { type: 'auth_ok' });
    await jest.advanceTimersByTimeAsync(10000);
    expect(socket.terminated).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
    io.emit.mockClear();
    subscribe(socket);
    reply(socket, stateEvent());
    expect(io.emit).not.toHaveBeenCalled();
  });

  test.each(['auth', 'subscription'])('%s rejection closes the socket with no automatic retry', async rejection => {
    await manager.initialize(io, notifications, log);
    const socket = WebSocket.instances[0];
    reply(socket, { type: 'auth_required' });
    if (rejection === 'auth') reply(socket, { type: 'auth_invalid' });
    else {
      reply(socket, { type: 'auth_ok' });
      reply(socket, { id: 1, type: 'result', success: false });
    }
    await jest.advanceTimersByTimeAsync(60000);
    expect(socket.terminated).toBe(true);
    expect(WebSocket.instances).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  test('does not expose credential-bearing transport errors in logs or control results', async () => {
    const secretError = 'http://url-user:url-password@ha.local:8123/?key=query-secret mock-secret-token';
    fetch.mockRejectedValueOnce(new Error(secretError));
    expect(await manager.initialize(io, notifications, log)).toEqual([]);
    fetch.mockRejectedValueOnce(new Error(secretError));
    const result = await manager.controlDevice('ha_media_player_media_player.receiver', { on: true });
    expect(result).toEqual({ success: false, error: 'HA media control request failed' });
    await manager.initialize(io, notifications, log);
    WebSocket.instances[0].emit('error', new Error(secretError));
    const output = JSON.stringify([log.mock.calls, logger.log.mock.calls, io.emit.mock.calls, result]);
    for (const secret of ['url-user', 'url-password', 'query-secret', 'mock-secret-token']) {
      expect(output).not.toContain(secret);
    }
  });
});