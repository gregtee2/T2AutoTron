jest.mock('node-fetch', () => jest.fn());
jest.mock('../src/logging/logger', () => ({ log: jest.fn().mockResolvedValue(undefined) }));

const fetch = require('node-fetch');
const manager = require('../src/devices/managers/homeAssistantManager');

describe('Home Assistant manager command results', () => {
  beforeEach(() => {
    fetch.mockReset();
    manager.deviceHealth.clear();
    manager.shutdown();
    process.env.HA_HOST = 'http://ha.test:8123';
    process.env.HA_TOKEN = 'test-token';
    manager.updateConfig();
  });

  afterEach(() => {
    delete process.env.HA_HOST;
    delete process.env.HA_TOKEN;
  });

  test('classifies HA 503 as retryable', async () => {
    fetch.mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      text: async () => 'starting'
    });

    const result = await manager.updateState('ha_light.test', { on: false });

    expect(result).toMatchObject({ success: false, status: 503, retryable: true });
  });

  test('classifies HA 400 as permanent', async () => {
    fetch.mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: async () => 'invalid service data'
    });

    const result = await manager.updateState('ha_light.test', { on: false });

    expect(result).toMatchObject({ success: false, status: 400, retryable: false });
  });

  test('health backoff is retryable rather than a permanent request error', async () => {
    manager.deviceHealth.set('light.test', {
      failures: manager.FAILURE_THRESHOLD,
      lastFailure: Date.now(),
      unhealthy: true
    });

    const result = await manager.updateState('ha_light.test', { on: false });

    expect(result).toMatchObject({ success: false, skipped: true, retryable: true });
    expect(fetch).not.toHaveBeenCalled();
  });

  test('forceRefresh bypasses the canonical state cache', async () => {
    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ state: 'on', attributes: {} })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ state: 'off', attributes: {} })
      });

    const cached = await manager.getState('ha_light.test');
    expect(cached.state.on).toBe(true);

    const result = await manager.getState('light.test', { forceRefresh: true });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      success: true,
      state: { state: 'off', on: false, available: true }
    });
  });

  test('unavailable state remains unknown rather than OFF', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ state: 'unavailable', attributes: {} })
    });

    const result = await manager.getState('light.test', { forceRefresh: true });

    expect(result).toMatchObject({
      success: true,
      state: { state: 'unavailable', on: null, available: false }
    });
  });
});