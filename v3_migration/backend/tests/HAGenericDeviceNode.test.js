/**
 * Regression tests for HA Generic Device safety behavior.
 * HSV/color updates must never wake an OFF light back up.
 */

jest.mock('../src/engine/engineLogger', () => ({
  logEngineEvent: jest.fn(),
  logDeviceCommand: jest.fn(),
  logDeviceState: jest.fn(),
  logTriggerChange: jest.fn(),
  logWarmup: jest.fn(),
  getLogLevel: jest.fn(() => 0),
  log: jest.fn()
}));

jest.mock('../src/engine/deviceAudit', () => ({
  recordEngineIntent: jest.fn()
}));

jest.mock('../src/engine/commandTracker', () => ({
  logOutgoingCommand: jest.fn()
}));

global.fetch = jest.fn(async (url) => {
  if (url === 'http://ha.local:8123/api/states') {
    return {
      ok: true,
      json: async () => [
        { entity_id: 'light.off_lamp', state: 'off', attributes: {} },
        { entity_id: 'light.on_lamp', state: 'on', attributes: {} }
      ]
    };
  }

  return { ok: true, json: async () => ({}) };
});

const registry = require('../src/engine/BackendNodeRegistry');
const { bulkStateCache } = require('../src/engine/nodes/HADeviceNodes');

describe('HAGenericDeviceNode HSV safety', () => {
  const hsv = { hue: 0.5, saturation: 1, brightness: 200 };

  beforeEach(() => {
    jest.restoreAllMocks();
    process.env.HA_HOST = 'http://ha.local:8123';
    process.env.HA_TOKEN = 'test-token';
    global.fetch.mockClear();
    bulkStateCache.states.clear();
    bulkStateCache.lastFetchTime = 0;
    bulkStateCache.fetchPromise = null;
  });

  afterEach(() => {
    delete process.env.HA_HOST;
    delete process.env.HA_TOKEN;
  });

  function createReadyNode(entityId) {
    const node = registry.create('HAGenericDeviceNode');
    node.id = `node_${entityId}`;
    node.properties.selectedDeviceIds = [`ha_${entityId}`];
    node.tickCount = 11;
    node.warmupComplete = true;
    node.hadConnection = false;
    node.controlDevice = jest.fn(async () => ({ success: true }));
    return node;
  }

  test('identifies itself for backend handoff reconciliation', () => {
    const node = registry.create('HAGenericDeviceNode');
    expect(node.type).toBe('HAGenericDeviceNode');
  });

  test('does not send HSV turn_on when HA says the light is off', async () => {
    const node = createReadyNode('light.off_lamp');

    await node.data({ hsv_info: [hsv] });

    expect(node.controlDevice).not.toHaveBeenCalled();
    expect(node.deviceStates['light.off_lamp']).toBe(false);
    expect(node.deviceStates['ha_light.off_lamp']).toBe(false);
  });

  test('still sends HSV color updates when HA says the light is on', async () => {
    const node = createReadyNode('light.on_lamp');

    await node.data({ hsv_info: [hsv] });

    expect(node.controlDevice).toHaveBeenCalledWith(
      'light.on_lamp',
      true,
      hsv,
      { trackDesired: false, trackCommand: false }
    );
  });

  test('backend 503 keeps desired OFF retrying without falsifying observed state', async () => {
    const node = registry.create('HAGenericDeviceNode');
    node.id = 'node_retry_off';
    node.properties.selectedDeviceIds = ['ha_light.on_lamp'];
    node.recordObservedCommandState('light.on_lamp', true);
    require('../src/engine/BackendEngine').frontendActive = false;
    global.fetch.mockResolvedValueOnce({ ok: false, status: 503 });

    const result = await node.controlDevice('light.on_lamp', false);

    expect(result).toMatchObject({ success: false, retryable: true, reason: 'HTTP 503' });
    expect(node.deviceStates['light.on_lamp']).toBe(true);
    expect(node.commandStates['light.on_lamp']).toMatchObject({
      desiredState: false,
      observedState: true,
      pendingCommand: false,
      phase: 'retrying',
      attempt: 1
    });
  });

  test('accepted backend OFF remains pending until HA observation confirms it', async () => {
    const node = registry.create('HAGenericDeviceNode');
    node.id = 'node_confirm_off';
    node.properties.selectedDeviceIds = ['ha_light.on_lamp'];
    node.recordObservedCommandState('light.on_lamp', true);
    require('../src/engine/BackendEngine').frontendActive = false;
    global.fetch.mockResolvedValueOnce({ ok: true });

    const result = await node.controlDevice('light.on_lamp', false);

    expect(result.success).toBe(true);
    expect(node.deviceStates['light.on_lamp']).toBe(true);
    expect(node.commandStates['light.on_lamp'].phase).toBe('pending');

    node.recordObservedCommandState('light.on_lamp', false);
    expect(node.commandStates['light.on_lamp'].phase).toBe('confirmed');
    expect(node.deviceStates['light.on_lamp']).toBe(false);
  });

  test('backend confirmation mismatch enters bounded retry state', async () => {
    const node = createReadyNode('light.on_lamp');
    node.recordObservedCommandState('light.on_lamp', true);
    node.setDesiredCommandState('light.on_lamp', false);
    const commandToken = node.beginCommandDelivery('light.on_lamp');
    node.recordCommandDelivery('light.on_lamp', {
      success: true,
      confirmAfterMs: 2500,
      commandToken
    });
    node.commandStates['light.on_lamp'].confirmationDueAt = Date.now() - 1;
    bulkStateCache.states.set('light.on_lamp', { state: 'on', attributes: {} });
    bulkStateCache.lastFetchTime = Date.now();
    jest.spyOn(bulkStateCache, 'refreshCache').mockResolvedValue(true);

    await node.refreshCommandObservations(['light.on_lamp']);

    expect(node.commandStates['light.on_lamp']).toMatchObject({
      desiredState: false,
      observedState: true,
      pendingCommand: false,
      phase: 'retrying',
      attempt: 1,
      lastError: 'confirmation_mismatch'
    });
    expect(node.commandStates['light.on_lamp'].nextRetryAt).toBeGreaterThan(Date.now());
  });

  test('backend unavailable confirmation does not confirm OFF', async () => {
    const node = createReadyNode('light.on_lamp');
    node.recordObservedCommandState('light.on_lamp', true);
    node.setDesiredCommandState('light.on_lamp', false);
    const commandToken = node.beginCommandDelivery('light.on_lamp');
    node.recordCommandDelivery('light.on_lamp', {
      success: true,
      confirmAfterMs: 2500,
      commandToken
    });
    node.commandStates['light.on_lamp'].confirmationDueAt = Date.now() - 1;
    bulkStateCache.states.set('light.on_lamp', { state: 'unavailable', attributes: {} });
    bulkStateCache.lastFetchTime = Date.now();
    jest.spyOn(bulkStateCache, 'refreshCache').mockResolvedValue(true);

    await node.refreshCommandObservations(['light.on_lamp']);

    expect(node.commandStates['light.on_lamp']).toMatchObject({
      desiredState: false,
      observedState: true,
      phase: 'retrying',
      lastError: 'confirmation_unavailable'
    });
  });

  test('failed confirmation refresh cannot reuse recent cached OFF as confirmation', async () => {
    const node = createReadyNode('light.on_lamp');
    node.recordObservedCommandState('light.on_lamp', true);
    node.setDesiredCommandState('light.on_lamp', false);
    const commandToken = node.beginCommandDelivery('light.on_lamp');
    node.recordCommandDelivery('light.on_lamp', {
      success: true,
      confirmAfterMs: 2500,
      commandToken
    });
    node.commandStates['light.on_lamp'].confirmationDueAt = Date.now() - 1;
    bulkStateCache.states.set('light.on_lamp', { state: 'off', attributes: {} });
    bulkStateCache.lastFetchTime = Date.now();
    const refresh = jest.spyOn(bulkStateCache, 'refreshCache').mockResolvedValue(false);

    await node.refreshCommandObservations(['light.on_lamp']);

    expect(node.commandStates['light.on_lamp']).toMatchObject({
      desiredState: false,
      observedState: true,
      phase: 'retrying',
      lastError: 'confirmation_unavailable'
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  test('unchanged false input retries when the per-device deadline is due', async () => {
    const node = createReadyNode('light.on_lamp');
    node.controlDevice = jest.fn(async () => ({ success: true }));
    node.lastTrigger = false;
    node.hadConnection = true;
    node.reconciled = true;
    node.recordObservedCommandState('light.on_lamp', true);
    node.setDesiredCommandState('light.on_lamp', false);
    node.recordCommandDelivery('light.on_lamp', {
      success: false,
      retryable: true,
      reason: 'temporary',
      retryAfterMs: 0
    });

    await node.data({ trigger: [false] });

    expect(node.controlDevice).toHaveBeenCalledWith(
      'light.on_lamp',
      false,
      null,
      { trackDesired: false }
    );
  });

  test('backend respects manual HA OFF until the Follow input changes', async () => {
    const node = createReadyNode('light.on_lamp');
    node.properties.triggerMode = 'Follow';
    node.properties.enforceState = false;
    node.lastTrigger = true;
    node.hadConnection = true;
    node.recordObservedCommandState('light.on_lamp', true);
    node.setDesiredCommandState('light.on_lamp', true);

    node.recordObservedCommandState('light.on_lamp', false);
    await node.data({ trigger: [true] });

    expect(node.commandStates['light.on_lamp']).toMatchObject({
      desiredState: null,
      observedState: false,
      phase: 'idle'
    });
    expect(node.controlDevice).not.toHaveBeenCalled();

    await node.data({ trigger: [false] });
    await node.data({ trigger: [true] });
    expect(node.controlDevice).toHaveBeenCalledWith(
      'light.on_lamp',
      true,
      null,
      { trackDesired: false }
    );
  });

  test('backend Enforce State reasserts an unchanged Follow input', async () => {
    const node = createReadyNode('light.on_lamp');
    node.properties.triggerMode = 'Follow';
    node.properties.enforceState = true;
    node.lastTrigger = true;
    node.hadConnection = true;
    node.recordObservedCommandState('light.on_lamp', true);
    node.setDesiredCommandState('light.on_lamp', true);

    node.recordObservedCommandState('light.on_lamp', false);
    await node.data({ trigger: [true] });

    expect(node.controlDevice).toHaveBeenCalledWith(
      'light.on_lamp',
      true,
      null,
      { trackDesired: false }
    );
  });

  test('new unsent Follow intent is delivered immediately, not treated as overdue confirmation', async () => {
    const node = createReadyNode('light.on_lamp');
    node.lastTrigger = false;
    node.hadConnection = true;
    node.recordObservedCommandState('light.on_lamp', true);
    node.setDesiredCommandState('light.on_lamp', false);

    await node.data({ trigger: [false] });

    expect(node.controlDevice).toHaveBeenCalledWith(
      'light.on_lamp',
      false,
      null,
      { trackDesired: false }
    );
    expect(node.commandStates['light.on_lamp'].phase).not.toBe('retrying');
  });

  test('failed backend HSV delivery stays unsent and retries later', async () => {
    const node = createReadyNode('light.on_lamp');
    node.lastTrigger = true;
    node.hadConnection = true;
    node.lastSendTime = 0;
    node.lastSentHsv = null;
    jest.spyOn(bulkStateCache, 'refreshCache').mockResolvedValue(true);
    bulkStateCache.states.set('light.on_lamp', { state: 'on', attributes: {} });
    node.controlDevice = jest.fn()
      .mockResolvedValueOnce({ success: false, retryable: true })
      .mockResolvedValueOnce({ success: true });

    await node.data({ trigger: [true], hsv_info: [hsv] });
    expect(node.lastSentHsv).toBeNull();

    node.lastSendTime = 0;
    await node.data({ trigger: [true], hsv_info: [hsv] });

    expect(node.controlDevice).toHaveBeenCalledTimes(2);
    expect(node.lastSentHsv).toEqual(hsv);
  });

  test('missing backend trigger is idle and sends no power command', async () => {
    const node = createReadyNode('light.on_lamp');
    node.controlDevice = jest.fn(async () => ({ success: true }));

    await node.data({ trigger: [] });

    expect(node.controlDevice).not.toHaveBeenCalled();
    expect(node.commandStates['light.on_lamp'].phase).toBe('idle');
    expect(node.commandStates['light.on_lamp'].desiredState).toBeNull();
  });

  test('explicit null backend trigger is missing input, not OFF', async () => {
    const node = createReadyNode('light.on_lamp');
    node.controlDevice = jest.fn(async () => ({ success: true }));

    await node.data({ trigger: [null] });

    expect(node.controlDevice).not.toHaveBeenCalled();
    expect(node.commandStates['light.on_lamp'].phase).toBe('idle');
  });

  test('serialized Turn On mode sends ON on a rising edge', async () => {
    const node = createReadyNode('light.off_lamp');
    node.properties.triggerMode = 'Turn On';
    node.lastTrigger = false;

    await node.data({ trigger: [true] });

    expect(node.controlDevice).toHaveBeenCalledWith('light.off_lamp', true, undefined);
  });

  test('serialized Turn Off mode sends OFF on a rising edge', async () => {
    const node = createReadyNode('light.on_lamp');
    node.properties.triggerMode = 'Turn Off';
    node.lastTrigger = false;

    await node.data({ trigger: [true] });

    expect(node.controlDevice).toHaveBeenCalledWith('light.on_lamp', false, null);
  });

  test('takeover learns a steady high Toggle input without replaying an edge', async () => {
    const node = createReadyNode('light.on_lamp');
    node.properties.triggerMode = 'Toggle';
    node.reconcile(new Map([['light.on_lamp', { state: 'on', attributes: {} }]]));

    await node.data({ trigger: [true] });
    expect(node.controlDevice).not.toHaveBeenCalled();

    await node.data({ trigger: [false] });
    await node.data({ trigger: [true] });
    expect(node.controlDevice).toHaveBeenCalledTimes(1);
  });

  test('Turn Off retries a due OFF command without another rising edge', async () => {
    const node = createReadyNode('light.on_lamp');
    node.properties.triggerMode = 'Turn Off';
    node.lastTrigger = true;
    node.hadConnection = true;
    node.recordObservedCommandState('light.on_lamp', true);
    node.setDesiredCommandState('light.on_lamp', false);
    node.recordCommandDelivery('light.on_lamp', {
      success: false,
      retryable: true,
      reason: 'temporary',
      retryAfterMs: 0
    });

    await node.data({ trigger: [true] });

    expect(node.controlDevice).toHaveBeenCalledWith(
      'light.on_lamp',
      false,
      null,
      { trackDesired: false }
    );
  });

  test('Toggle retries its stored command without another rising edge', async () => {
    const node = createReadyNode('light.on_lamp');
    node.properties.triggerMode = 'Toggle';
    node.lastTrigger = true;
    node.hadConnection = true;
    node.recordObservedCommandState('light.on_lamp', true);
    node.setDesiredCommandState('light.on_lamp', false);
    node.recordCommandDelivery('light.on_lamp', {
      success: false,
      retryable: true,
      reason: 'temporary',
      retryAfterMs: 0
    });

    await node.data({ trigger: [true] });

    expect(node.controlDevice).toHaveBeenCalledWith(
      'light.on_lamp',
      false,
      null,
      { trackDesired: false }
    );
  });
});