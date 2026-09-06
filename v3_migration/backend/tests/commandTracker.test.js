// Inject a writer before importing the singleton: no production log I/O.
describe('commandTracker', () => {
  let tracker;
  let writer;
  let writerConstructor;
  let status;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-06T12:00:00.000Z'));
    jest.spyOn(console, 'log').mockImplementation(() => {});
    status = { state: 'idle', droppedEntries: 0, pendingBytes: 0 };
    const closePromise = Promise.resolve(status);
    writer = {
      write: jest.fn().mockReturnValue(true),
      close: jest.fn().mockReturnValue(closePromise),
      getStatus: jest.fn(() => status)
    };
    writerConstructor = jest.fn(() => writer);
    jest.doMock('../src/logging/BoundedLogWriter', () => writerConstructor);
    jest.isolateModules(() => { tracker = require('../src/engine/commandTracker'); });
  });

  afterEach(async () => {
    if (tracker) await tracker.close();
    jest.dontMock('../src/logging/BoundedLogWriter');
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  function outgoing() {
    tracker.logOutgoingCommand({
      entityId: 'ha_light.test', action: 'turn_on', payload: { brightness: 127 },
      nodeId: 'node-1', nodeType: 'HALightNode', reason: 'Scheduled',
      inputs: { trigger: [true] }
    });
  }

  test('preserves outgoing NDJSON shape and numeric pending age despite an ISO timestamp', () => {
    outgoing();
    const serialized = writer.write.mock.calls[0][0];
    expect(serialized.endsWith('\n')).toBe(true);
    expect(serialized.split('\n')).toHaveLength(2);
    expect(JSON.parse(serialized)).toEqual({
      timestamp: '2026-09-06T12:00:00.000Z', type: 'OUTGOING',
      entityId: 'light.test', action: 'turn_on', source: 'T2AutoTron',
      nodeId: 'node-1', nodeType: 'HALightNode', reason: 'Scheduled',
      payload: { brightness: 127 }, inputs: { trigger: true }
    });
    jest.advanceTimersByTime(2600);
    expect(tracker.getPendingCommands()).toEqual([{
      entityId: 'light.test', action: 'turn_on', ageMs: 2600, ageSeconds: 3,
      nodeType: 'HALightNode', reason: 'Scheduled'
    }]);
    expect(writerConstructor).toHaveBeenCalledWith(expect.objectContaining({ maxFileBytes: 5 * 1024 * 1024 }));
  });

  test('timing alone is labelled probable, not confirmed, and retains competing HA context', () => {
    outgoing();
    jest.advanceTimersByTime(500);
    const context = { id: 'context-1', user_id: 'user-1' };
    const result = tracker.logIncomingStateChange({
      entityId: 'light.test', oldState: 'off', newState: 'on', context,
      attributes: { brightness: 127, hs_color: [90, 50], noisy: 'ignored' }
    });
    expect(result).toEqual({
      wasUs: true, source: 'T2AutoTron (probable)',
      sourceDetails: { nodeId: 'node-1', nodeType: 'HALightNode', reason: 'Scheduled' }
    });
    const entry = JSON.parse(writer.write.mock.calls[1][0]);
    expect(entry).toMatchObject({
      type: 'INCOMING', source: 'T2AutoTron (probable)', haContext: context,
      significantAttributes: { brightness: 127, hs_color: [90, 50] }
    });
    expect(entry.significantAttributes).not.toHaveProperty('noisy');
    expect(writer.write.mock.calls[1][0]).not.toContain('confirmed');
    expect(tracker.getPendingCommands()).toEqual([]);
    expect(tracker.getHistory('ha_light.test')).toHaveLength(2);
  });

  test('the correlation window is exclusive and expired commands do not override HA attribution', () => {
    outgoing();
    jest.advanceTimersByTime(10000);
    expect(tracker.logIncomingStateChange({
      entityId: 'light.test', oldState: 'off', newState: 'on',
      context: { user_id: 'user-1' }
    })).toMatchObject({ wasUs: false, source: 'HA User', sourceDetails: { userId: 'user-1' } });
  });

  test('a backwards clock jump does not count as a command match', () => {
    outgoing();
    jest.setSystemTime(new Date('2026-09-06T11:59:59.000Z'));
    expect(tracker.logIncomingStateChange({
      entityId: 'light.test', oldState: 'off', newState: 'on'
    })).toMatchObject({ wasUs: false, source: 'External (no context)' });
  });

  test('without an outgoing command, the compatibility field is a boolean false', () => {
    expect(tracker.logIncomingStateChange({
      entityId: 'light.test', oldState: 'off', newState: 'on',
      context: { parent_id: 'automation-1', id: 'context-2' }
    })).toMatchObject({ wasUs: false, source: 'HA Automation/Script' });
  });

  test('rejected file writes still leave in-memory history and visible writer status', () => {
    writer.write.mockReturnValue(false);
    status = { state: 'failed', droppedEntries: 1, firstError: { code: 'ENOSPC' } };
    expect(outgoing).not.toThrow();
    expect(tracker.getHistory()).toHaveLength(1);
    expect(tracker.getPendingCommands()).toHaveLength(1);
    expect(tracker.getWriterStatus()).toEqual(status);
  });

  test('history stays at 1000 entries even when file writing is rejected', () => {
    writer.write.mockReturnValue(false);
    for (let n = 0; n < 1005; n++) outgoing();
    expect(tracker.getHistory(null, 2000)).toHaveLength(1000);
  });

  test('expires stale correlation entries and releases its cleanup timer on awaitable close', async () => {
    outgoing();
    jest.advanceTimersByTime(60000);
    expect(tracker.getPendingCommands()).toEqual([]);
    expect(jest.getTimerCount()).toBe(1);
    const closing = tracker.close();
    expect(closing).toBeInstanceOf(Promise);
    expect(tracker.close()).toBe(closing);
    await closing;
    expect(jest.getTimerCount()).toBe(0);
    expect(process.listeners('beforeExit')).not.toContain(tracker.close);
  });
});