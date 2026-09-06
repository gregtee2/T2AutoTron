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
require('../src/engine/nodes/HADeviceNodes');
const engine = require('../src/engine/BackendEngine');

describe('HAGenericDeviceNode HSV safety', () => {
  const hsv = { hue: 0.5, saturation: 1, brightness: 200 };

  beforeEach(() => {
    process.env.HA_HOST = 'http://ha.local:8123';
    process.env.HA_TOKEN = 'test-token';
    engine.frontendActive = false;
    engine.frontendLastSeen = null;
    global.fetch.mockClear();
  });

  afterEach(() => {
    delete process.env.HA_HOST;
    delete process.env.HA_TOKEN;
    engine.frontendActive = false;
    engine.frontendLastSeen = null;
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

    expect(node.controlDevice).toHaveBeenCalledWith('light.on_lamp', true, hsv);
  });

  test('does not send HA service calls while the frontend owns control', async () => {
    engine.setFrontendActive(true);
    const node = registry.create('HAServiceCallNode');
    node.properties.domain = 'light';
    node.properties.service = 'turn_on';
    node.properties.entityId = 'light.frontend_owned';

    const result = await node.data({ trigger: [true] });

    expect(result.result).toEqual(expect.objectContaining({ success: true, skipped: true }));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('does not send simplified light commands while the frontend owns control', async () => {
    engine.setFrontendActive(true);
    const node = registry.create('HALightControlNode');
    node.properties.entityId = 'light.frontend_owned';

    const result = await node.data({ trigger: [true] });

    expect(result).toEqual({ is_on: true });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('does not send lock commands while the frontend owns control', async () => {
    engine.setFrontendActive(true);
    const node = registry.create('HALockNode');
    node.properties.deviceId = 'ha_lock.frontend_owned';

    await node.sendLockCommand('lock');

    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('does not send Hue effects while the frontend owns control', async () => {
    engine.setFrontendActive(true);
    const node = registry.create('HueEffectNode');

    const result = await node.callHAService('light', 'turn_on', 'light.frontend_owned', {
      effect: 'candle'
    });

    expect(result).toEqual(expect.objectContaining({ success: true, skipped: true }));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('does not send WiZ effects while the frontend owns control', async () => {
    engine.setFrontendActive(true);
    const node = registry.create('WizEffectNode');

    const result = await node.callHAService('light', 'turn_on', 'light.frontend_owned', {
      effect: 'Fireplace'
    });

    expect(result).toEqual(expect.objectContaining({ success: true, skipped: true }));
    expect(global.fetch).not.toHaveBeenCalled();
  });
});