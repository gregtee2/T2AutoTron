const fs = require('fs');
const path = require('path');
const vm = require('vm');
const deviceLogic = require('../../shared/logic/DeviceLogic');

describe('HA Generic frontend state enforcement', () => {
  let NodeClass;
  let pluginWindow;
  let requestTimeout;
  const timeoutSignal = {};

  beforeAll(() => {
    requestTimeout = jest.fn(() => timeoutSignal);
    pluginWindow = {
      Rete: { ClassicPreset: { Node: class {} } },
      React: {},
      RefComponent: {},
      sockets: {},
      T2Controls: {},
      T2SharedLogic: { ...deviceLogic, _ready: Promise.resolve() },
      T2HAUtils: {
        getDeviceApiInfo: id => ({ endpoint: '/api/lights/ha', cleanId: id.replace('ha_', ''), type: 'ha' }),
        compareNames: () => 0,
        isAuxiliaryEntity: () => false,
        filterDevices: devices => devices,
        normalizeDeviceId: id => id,
        stripDevicePrefix: id => id.replace('ha_', ''),
        isSameDevice: (left, right) => left.replace('ha_', '') === right.replace('ha_', '')
      },
      nodeRegistry: { register: (name, definition) => { NodeClass = definition.nodeClass; } },
      removeEventListener: jest.fn()
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../plugins/HAGenericDeviceNode.js'), 'utf8'), {
      window: pluginWindow, console: { log: jest.fn(), error: jest.fn(), warn: jest.fn() },
      setTimeout, clearTimeout, setInterval, clearInterval,
      AbortSignal: { timeout: requestTimeout }
    });
  });

  function createNode(overrides = {}) {
    const node = Object.create(NodeClass.prototype);
    Object.assign(node, {
      properties: {
        enforceState: true,
        triggerMode: 'Follow',
        selectedDeviceIds: ['ha_light.bar_lamp'],
        selectedDeviceNames: ['Bar Lamp']
      },
      perDeviceState: { 'ha_light.bar_lamp': { on: true } },
      lastTriggerValue: false,
      hadConnection: false,
      skipInitialTrigger: false,
      lastHsvInfo: null,
      devices: [],
      controls: {},
      deviceCommandStates: {},
      _confirmationTimers: {},
      _restoreTimers: [],
      _restoreGraphLoadHandler: null,
      _lifecycleTimers: new Set(),
      _destroyed: false,
      _pendingHsvInfo: null,
      _hsvRetryTimer: null,
      _hsvRetryDueAt: null,
      _hsvRetryAttempt: 0,
      changeCallback: jest.fn(),
      setDevicesState: jest.fn().mockResolvedValue({ success: true, failed: 0 }),
      ...overrides
    });
    return node;
  }

  test('does not turn off a manual lamp without a trigger input', async () => {
    const node = createNode();
    await node.checkAndEnforceState();
    expect(node.setDevicesState).not.toHaveBeenCalled();
  });

  test('does not enforce during initial graph synchronization', async () => {
    const node = createNode({ hadConnection: true, skipInitialTrigger: true });
    await node.checkAndEnforceState();
    expect(node.setDevicesState).not.toHaveBeenCalled();
  });

  test('manual HA OFF is respected until the Follow input changes', async () => {
    const id = 'ha_light.bar_lamp';
    const node = createNode({
      properties: {
        enforceState: false,
        triggerMode: 'Follow',
        selectedDeviceIds: [id],
        selectedDeviceNames: ['Bar Lamp']
      },
      lastTriggerValue: true,
      hadConnection: true,
      setDevicesState: jest.fn()
    });
    let state = deviceLogic.recordObservedDeviceState(deviceLogic.createDeviceCommandState(), true);
    node.deviceCommandStates[id] = deviceLogic.setDesiredDeviceState(state, true);

    node.handleDeviceStateUpdate({ id, on: false, state: 'off' });
    await node.data({ trigger: [true] });

    expect(node.deviceCommandStates[id]).toMatchObject({
      desiredState: null,
      observedState: false,
      phase: 'idle'
    });
    expect(node.setDevicesState).not.toHaveBeenCalled();
  });

  test('Enforce State still reasserts a confirmed opposite observation', () => {
    const id = 'ha_light.bar_lamp';
    const node = createNode({ lastTriggerValue: true, hadConnection: true });
    let state = deviceLogic.recordObservedDeviceState(deviceLogic.createDeviceCommandState(), true);
    node.deviceCommandStates[id] = deviceLogic.setDesiredDeviceState(state, true);

    node.handleDeviceStateUpdate({ id, on: false, state: 'off' });

    expect(node.deviceCommandStates[id]).toMatchObject({
      desiredState: true,
      observedState: false,
      pendingCommand: true,
      phase: 'pending'
    });
    node.clearCommandWake();
  });

  test('does not treat unavailable state as OFF during enforcement', async () => {
    const node = createNode({
      lastTriggerValue: true,
      hadConnection: true,
      perDeviceState: {
        'ha_light.bar_lamp': { on: null, state: 'unavailable', available: false }
      }
    });

    await node.checkAndEnforceState();

    expect(node.setDevicesState).not.toHaveBeenCalled();
  });

  test('enforces a real false trigger against an on lamp', async () => {
    const node = createNode({ hadConnection: true });
    await node.checkAndEnforceState();
    expect(node.setDevicesState).toHaveBeenCalledWith(false, null);
  });

  test('retries a failed initial false command without requiring another edge', async () => {
    const node = createNode({
      properties: {
        enforceState: false,
        triggerMode: 'Follow',
        selectedDeviceIds: ['ha_light.bar_lamp'],
        selectedDeviceNames: ['Bar Lamp']
      },
      skipInitialTrigger: true,
      setDevicesState: NodeClass.prototype.setDevicesState,
      getEffectiveTriggerSource: jest.fn(() => 'Bar Lamp')
    });
    pluginWindow.apiFetch = jest.fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    await node.data({ trigger: [false] });
    expect(pluginWindow.apiFetch).toHaveBeenCalledTimes(1);
    expect(node.deviceCommandStates['ha_light.bar_lamp']).toMatchObject({
      desiredState: false,
      pendingCommand: false,
      phase: 'retrying',
      attempt: 1
    });

    node.clearCommandWake();
    node.deviceCommandStates['ha_light.bar_lamp'].nextRetryAt = Date.now() - 1;

    await node.data({ trigger: [false] });
    expect(pluginWindow.apiFetch).toHaveBeenCalledTimes(2);
    expect(node.deviceCommandStates['ha_light.bar_lamp'].phase).toBe('pending');

    node.clearCommandWake();
    Object.values(node._confirmationTimers).forEach(timer => clearTimeout(timer));
  });

  test('reports a 503 OFF request as failed instead of optimistic success', async () => {
    const node = createNode({
      setDevicesState: NodeClass.prototype.setDevicesState,
      updateStatus: jest.fn(),
      getEffectiveTriggerSource: jest.fn(() => 'Bar Lamp')
    });
    pluginWindow.apiFetch = jest.fn().mockResolvedValue({ ok: false, status: 503 });
    requestTimeout.mockClear();

    const result = await node.setDevicesState(false);

    expect(result).toEqual({
      success: false,
      retryable: true,
      attempted: 1,
      succeeded: 0,
      failed: 1
    });
    expect(node.perDeviceState['ha_light.bar_lamp'].on).toBe(true);
    expect(requestTimeout).toHaveBeenCalledWith(10000);
    expect(pluginWindow.apiFetch.mock.calls[0][1].signal).toBe(timeoutSignal);
    node.clearCommandWake();
  });

  test('confirmation mismatch enters bounded retry state', async () => {
    const id = 'ha_light.bar_lamp';
    const node = createNode({
      fetchDeviceState: jest.fn().mockResolvedValue({ on: true, state: 'on' })
    });
    node.recordDeviceObservedState(id, true, deviceLogic);
    node.setDeviceDesiredState(id, false, deviceLogic);
    const commandToken = node.beginDeviceDelivery(id, deviceLogic);
    node.recordDeviceDelivery(id, {
      success: true,
      confirmAfterMs: 2500,
      commandToken
    }, deviceLogic);

    await node.verifyDeviceConfirmation(id, false);

    expect(node.deviceCommandStates[id]).toMatchObject({
      desiredState: false,
      observedState: true,
      pendingCommand: false,
      phase: 'retrying',
      attempt: 1,
      lastError: 'confirmation_mismatch'
    });
    expect(node.deviceCommandStates[id].nextRetryAt).toBeGreaterThan(Date.now());
    node.clearCommandWake();
  });

  test('unavailable confirmation does not become a false OFF confirmation', async () => {
    const id = 'ha_light.bar_lamp';
    const node = createNode({
      fetchDeviceState: jest.fn().mockResolvedValue({ on: null, state: 'unavailable' })
    });
    node.recordDeviceObservedState(id, true, deviceLogic);
    node.setDeviceDesiredState(id, false, deviceLogic);

    await node.verifyDeviceConfirmation(id, false);

    expect(node.deviceCommandStates[id]).toMatchObject({
      desiredState: false,
      observedState: true,
      phase: 'retrying',
      lastError: 'confirmation_unavailable'
    });
    node.clearCommandWake();
  });

  test('HSV safety requests a fresh HA state', async () => {
    const node = createNode({
      fetchDeviceState: jest.fn().mockResolvedValue({ on: true, state: 'on' })
    });

    await node.isDeviceActuallyOn('ha_light.bar_lamp');

    expect(node.fetchDeviceState).toHaveBeenCalledWith(
      'ha_light.bar_lamp',
      { fresh: true }
    );
  });

  test('HSV-only input applies to an explicitly ON device without a trigger wire', async () => {
    const id = 'ha_light.bar_lamp';
    const hsv = { hue: 0.2, saturation: 1, brightness: 200 };
    const node = createNode({
      skipInitialTrigger: true,
      perDeviceState: { [id]: { on: true, state: 'on' } },
      _checkHasTriggerWire: jest.fn(() => false),
      isDeviceActuallyOn: jest.fn().mockResolvedValue(true),
      updateStatus: jest.fn()
    });
    pluginWindow.apiFetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });

    await node.data({ trigger: [], hsv_info: [hsv] });

    expect(pluginWindow.apiFetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(pluginWindow.apiFetch.mock.calls[0][1].body)).toMatchObject({
      on: true,
      state: 'on'
    });
    expect(node.lastHsvInfo).toBe(JSON.stringify(hsv));
    node.destroy();
  });

  test('retryable HSV failure retains the latest color until bounded retry succeeds', async () => {
    const id = 'ha_light.bar_lamp';
    const hsv = { hue: 0.2, saturation: 1, brightness: 200 };
    const node = createNode({
      lastTriggerValue: true,
      hadConnection: true,
      perDeviceState: { [id]: { on: true, state: 'on' } },
      isDeviceActuallyOn: jest.fn().mockResolvedValue(true),
      updateStatus: jest.fn()
    });
    pluginWindow.apiFetch = jest.fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    await node.data({ trigger: [true], hsv_info: [hsv] });

    expect(node.lastHsvInfo).toBeNull();
    expect(node._pendingHsvInfo).toEqual(hsv);
    expect(node._hsvRetryAttempt).toBe(1);
    expect(node._hsvRetryDueAt).toBeGreaterThan(Date.now());

    clearTimeout(node._hsvRetryTimer);
    node._lifecycleTimers.delete(node._hsvRetryTimer);
    node._hsvRetryTimer = null;
    node._hsvRetryDueAt = Date.now() - 1;

    await node.data({ trigger: [true], hsv_info: [hsv] });

    expect(pluginWindow.apiFetch).toHaveBeenCalledTimes(2);
    expect(node.lastHsvInfo).toBe(JSON.stringify(hsv));
    expect(node._pendingHsvInfo).toBeNull();
    expect(node._hsvRetryTimer).toBeNull();
  });

  test('socket unavailable state remains unknown and does not confirm OFF', () => {
    const id = 'ha_light.bar_lamp';
    const node = createNode();
    node.recordDeviceObservedState(id, true, deviceLogic);
    node.setDeviceDesiredState(id, false, deviceLogic);

    node.handleDeviceStateUpdate({
      entity_id: 'light.bar_lamp',
      new_state: { state: 'unavailable', attributes: {} }
    });

    expect(node.perDeviceState[id]).toMatchObject({
      on: null,
      state: 'unavailable',
      available: false
    });
    expect(node.deviceCommandStates[id].observedState).toBe(true);
    expect(node.deviceCommandStates[id].phase).not.toBe('confirmed');
  });

  test('destroy clears delayed restore work and its graph-load listener', () => {
    const restoreHandler = jest.fn();
    const restoreTimer = setTimeout(() => {}, 10000);
    const node = createNode({
      _restoreGraphLoadHandler: restoreHandler,
      _restoreTimers: [restoreTimer]
    });
    pluginWindow.removeEventListener.mockClear();

    node.destroy();

    expect(pluginWindow.removeEventListener).toHaveBeenCalledWith('graphLoadComplete', restoreHandler);
    expect(node._restoreGraphLoadHandler).toBeNull();
    expect(node._restoreTimers).toEqual([]);
    expect(node._lifecycleTimers.size).toBe(0);
  });

  test('destroy cancels node-owned delayed callbacks', () => {
    const node = createNode();
    const callback = jest.fn();
    node.setLifecycleTimeout(callback, 10000);

    node.destroy();

    expect(node._destroyed).toBe(true);
    expect(node._lifecycleTimers.size).toBe(0);
  });

  test('does not recursively request another graph pass from inside data', async () => {
    const node = createNode({
      properties: {
        enforceState: false,
        triggerMode: 'Follow',
        selectedDeviceIds: ['ha_light.bar_lamp'],
        selectedDeviceNames: ['Bar Lamp']
      },
      skipInitialTrigger: true,
      setDevicesState: jest.fn().mockResolvedValue({ success: true, failed: 0 })
    });

    await node.data({ trigger: [false] });

    expect(node.setDevicesState).toHaveBeenCalledWith(false, null);
    expect(node.changeCallback).not.toHaveBeenCalled();
  });

  test('enforcement restores the current HSV object when turning a light back on', async () => {
    const hsv = { hue: 0.2, saturation: 1, brightness: 200 };
    const node = createNode({
      lastTriggerValue: true,
      hadConnection: true,
      lastHsvInfo: JSON.stringify(hsv),
      perDeviceState: { 'ha_light.bar_lamp': { on: false, state: 'off' } },
      syncFollowState: jest.fn().mockResolvedValue({ success: true })
    });

    await node.checkAndEnforceState();

    expect(node.syncFollowState).toHaveBeenCalledWith(true, hsv);
  });

  test('missing trigger input becomes idle and sends no command', async () => {
    const node = createNode({
      properties: {
        enforceState: false,
        triggerMode: 'Follow',
        selectedDeviceIds: ['ha_light.bar_lamp'],
        selectedDeviceNames: ['Bar Lamp']
      },
      _desiredFollowState: false,
      _pendingFollowState: false,
      setDevicesState: jest.fn().mockResolvedValue({ success: true })
    });
    node.deviceCommandStates['ha_light.bar_lamp'] = deviceLogic.setDesiredDeviceState(
      deviceLogic.createDeviceCommandState(),
      false
    );

    await node.data({ trigger: [] });

    expect(node.setDevicesState).not.toHaveBeenCalled();
    expect(node.deviceCommandStates['ha_light.bar_lamp'].phase).toBe('idle');
    expect(node.deviceCommandStates['ha_light.bar_lamp'].desiredState).toBeNull();
  });

  test('explicit null frontend trigger is missing input, not OFF', async () => {
    const node = createNode({ setDevicesState: jest.fn() });

    await node.data({ trigger: [null] });

    expect(node.setDevicesState).not.toHaveBeenCalled();
    expect(node.deviceCommandStates['ha_light.bar_lamp'].phase).toBe('idle');
  });

  test('new device selection does not assume OFF without a trigger value', async () => {
    const node = createNode({
      properties: {
        enforceState: false,
        triggerMode: 'Follow',
        selectedDeviceIds: [],
        selectedDeviceNames: []
      },
      lastTriggerValue: undefined,
      hadConnection: false,
      devices: [{ id: 'ha_light.bar_lamp', name: 'Bar Lamp', type: 'light' }],
      getAllDevicesWithUniqueNames: jest.fn(() => [{
        displayName: 'Bar Lamp',
        device: { id: 'ha_light.bar_lamp', name: 'Bar Lamp', type: 'light' }
      }]),
      fetchDeviceState: jest.fn().mockResolvedValue({ on: true, state: 'on' }),
      triggerUpdate: jest.fn()
    });

    await node.onDeviceSelected('Bar Lamp', 0);

    expect(node.setDevicesState).not.toHaveBeenCalled();
  });

  test('bounded startup retries settle an undefined wired trigger to idle', async () => {
    const node = createNode({
      skipInitialTrigger: true,
      _initialTriggerRetries: 10,
      _checkHasTriggerWire: jest.fn(() => true),
      setDevicesState: jest.fn()
    });

    await node.data({ trigger: [] });

    expect(node.setDevicesState).not.toHaveBeenCalled();
    expect(node.skipInitialTrigger).toBe(false);
    expect(node.deviceCommandStates['ha_light.bar_lamp'].phase).toBe('idle');
    expect(node.changeCallback).not.toHaveBeenCalled();
  });

  test('unobserved device output is unknown rather than fabricated off', () => {
    const node = createNode({ perDeviceState: {} });
    const outputs = node.buildOutputs();
    expect(outputs.device_out_0).toEqual({ on: null, state: 'unknown', available: false });
  });

  test('runtime command state is excluded from graph serialization', () => {
    const node = createNode();
    node.deviceCommandStates['ha_light.bar_lamp'] = deviceLogic.setDesiredDeviceState(
      deviceLogic.createDeviceCommandState(),
      false
    );

    const serialized = node.serialize();

    expect(serialized.selectedDeviceIds).toEqual(['ha_light.bar_lamp']);
    expect(serialized).not.toHaveProperty('deviceCommandStates');
    expect(serialized).not.toHaveProperty('pendingCommand');
  });

  test('accepted OFF remains pending and preserves observed ON until HA confirms', async () => {
    const node = createNode({
      setDevicesState: NodeClass.prototype.setDevicesState,
      updateStatus: jest.fn(),
      getEffectiveTriggerSource: jest.fn(() => 'Bar Lamp')
    });
    pluginWindow.apiFetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });

    const result = await node.setDevicesState(false);

    expect(result.success).toBe(true);
    expect(node.perDeviceState['ha_light.bar_lamp'].on).toBe(true);
    expect(node.deviceCommandStates['ha_light.bar_lamp'].phase).toBe('pending');
    clearTimeout(node._confirmationTimers['ha_light.bar_lamp']);
    delete node._confirmationTimers['ha_light.bar_lamp'];

    node.handleDeviceStateUpdate({ id: 'ha_light.bar_lamp', on: false, state: 'off' });
    expect(node.deviceCommandStates['ha_light.bar_lamp'].phase).toBe('confirmed');
    expect(node.perDeviceState['ha_light.bar_lamp'].on).toBe(false);
  });

  test('retry sends only to the failed device after another device confirms', async () => {
    const node = createNode({
      properties: {
        enforceState: false,
        triggerMode: 'Follow',
        selectedDeviceIds: ['ha_light.one', 'ha_light.two'],
        selectedDeviceNames: ['One', 'Two']
      },
      perDeviceState: {
        'ha_light.one': { on: true, state: 'on' },
        'ha_light.two': { on: true, state: 'on' }
      },
      setDevicesState: NodeClass.prototype.setDevicesState,
      updateStatus: jest.fn(),
      getEffectiveTriggerSource: jest.fn(() => 'Two Lights')
    });
    pluginWindow.apiFetch = jest.fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    await node.setDevicesState(false);
    node.handleDeviceStateUpdate({ id: 'ha_light.two', on: false, state: 'off' });
    node.deviceCommandStates['ha_light.one'].nextRetryAt = 0;

    const retry = await node.setDevicesState(false);

    expect(retry.attempted).toBe(1);
    expect(pluginWindow.apiFetch).toHaveBeenCalledTimes(3);
    expect(pluginWindow.apiFetch.mock.calls[2][0]).toContain('light.one');
    expect(node.deviceCommandStates['ha_light.two'].phase).toBe('confirmed');
    Object.values(node._confirmationTimers).forEach(timer => clearTimeout(timer));
    node._confirmationTimers = {};
  });

  test('queued command is discarded when its intent is superseded before transport', async () => {
    let releaseQueue;
    const queueBlocker = pluginWindow.T2_API_QUEUE.enqueue(
      () => new Promise(resolve => { releaseQueue = resolve; }),
      100
    );
    await Promise.resolve();

    const id = 'ha_light.bar_lamp';
    const node = createNode({
      perDeviceState: { [id]: { on: false, state: 'off' } },
      setDevicesState: NodeClass.prototype.setDevicesState,
      getEffectiveTriggerSource: jest.fn(() => 'Bar Lamp')
    });
    pluginWindow.apiFetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });

    const oldIntent = node.setDevicesState(true);
    for (let attempt = 0; attempt < 10 && !node.deviceCommandStates[id]?.activeCommand; attempt++) {
      await Promise.resolve();
    }
    expect(node.deviceCommandStates[id]?.activeCommand).not.toBeNull();
    node.setDeviceDesiredState(id, false, deviceLogic);

    releaseQueue({ ok: true });
    await queueBlocker;
    const result = await oldIntent;

    expect(result.attempted).toBe(0);
    expect(pluginWindow.apiFetch).not.toHaveBeenCalled();
    expect(node.deviceCommandStates[id]).toMatchObject({
      desiredState: false,
      pendingCommand: false,
      phase: 'pending',
      activeCommand: null
    });
    node.clearCommandWake();
  });

  test('queued HSV is discarded when an OFF intent arrives before transport', async () => {
    let releaseQueue;
    const queueBlocker = pluginWindow.T2_API_QUEUE.enqueue(
      () => new Promise(resolve => { releaseQueue = resolve; }),
      100
    );
    await Promise.resolve();

    const id = 'ha_light.bar_lamp';
    const node = createNode({
      id: 'hsv-node',
      perDeviceState: { [id]: { on: true, state: 'on' } },
      isDeviceActuallyOn: jest.fn().mockResolvedValue(true),
      updateStatus: jest.fn()
    });
    pluginWindow.apiFetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });

    const hsvUpdate = node.applyHSVInput({ hue: 0.2, saturation: 1, brightness: 200 });
    for (let attempt = 0; attempt < 10 && pluginWindow.T2_API_QUEUE.queue.length === 0; attempt++) {
      await Promise.resolve();
    }
    node.setDeviceDesiredState(id, false, deviceLogic);

    releaseQueue({ ok: true });
    await queueBlocker;
    const result = await hsvUpdate;

    expect(result).toMatchObject({ success: true, attempted: 0, succeeded: 0, failed: 0 });
    expect(pluginWindow.apiFetch).not.toHaveBeenCalled();
  });

  test('destroyed node cannot send a queued power command', async () => {
    let releaseQueue;
    const queueBlocker = pluginWindow.T2_API_QUEUE.enqueue(
      () => new Promise(resolve => { releaseQueue = resolve; }),
      100
    );
    await Promise.resolve();

    const id = 'ha_light.bar_lamp';
    const node = createNode({
      setDevicesState: NodeClass.prototype.setDevicesState,
      getEffectiveTriggerSource: jest.fn(() => 'Bar Lamp')
    });
    pluginWindow.apiFetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });

    const command = node.setDevicesState(false);
    for (let attempt = 0; attempt < 10 && !node.deviceCommandStates[id]?.activeCommand; attempt++) {
      await Promise.resolve();
    }
    expect(node.deviceCommandStates[id]?.activeCommand).not.toBeNull();
    node.destroy();

    releaseQueue({ ok: true });
    await queueBlocker;
    const result = await command;

    expect(result.attempted).toBe(0);
    expect(pluginWindow.apiFetch).not.toHaveBeenCalled();
    expect(node.deviceCommandStates[id].phase).toBe('idle');
  });

  test('preserves and sends an instant zero-millisecond transition', async () => {
    const node = createNode({
      properties: {
        enforceState: false,
        triggerMode: 'Follow',
        transitionTime: 0,
        selectedDeviceIds: ['ha_light.bar_lamp'],
        selectedDeviceNames: ['Bar Lamp']
      },
      setDevicesState: NodeClass.prototype.setDevicesState,
      updateStatus: jest.fn(),
      getEffectiveTriggerSource: jest.fn(() => 'Bar Lamp')
    });
    pluginWindow.apiFetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });

    expect(node.serialize().transitionTime).toBe(0);
    await node.setDevicesState(false);

    expect(JSON.parse(pluginWindow.apiFetch.mock.calls[0][1].body).transition).toBe(0);
    Object.values(node._confirmationTimers).forEach(timer => clearTimeout(timer));
    node.clearCommandWake();
  });

  test('syncs a newly selected device without replacing the selected device list', async () => {
    const existingId = 'ha_light.bar_lamp';
    const newId = 'ha_light.desk_lamp';
    const selectedIdsDuringSync = [];
    const node = createNode({
      properties: {
        enforceState: false,
        triggerMode: 'Follow',
        selectedDeviceIds: [existingId, null],
        selectedDeviceNames: ['Bar Lamp', null]
      },
      lastTriggerValue: true,
      hadConnection: true,
      lastHsvInfo: '{invalid',
      getAllDevicesWithUniqueNames: jest.fn(() => [{
        device: { id: newId, name: 'Desk Lamp', type: 'light' },
        displayName: 'Desk Lamp'
      }]),
      fetchDeviceState: jest.fn(async id => {
        node.perDeviceState[id] = { on: false, state: 'off' };
      }),
      setDevicesState: jest.fn(async () => {
        selectedIdsDuringSync.push([...node.properties.selectedDeviceIds]);
        return { success: true };
      })
    });

    await node.onDeviceSelected('Desk Lamp', 1);

    expect(node.setDevicesState).toHaveBeenCalledWith(true, null, [newId]);
    expect(selectedIdsDuringSync).toEqual([[existingId, newId]]);
    expect(node.properties.selectedDeviceIds).toEqual([existingId, newId]);
  });
});