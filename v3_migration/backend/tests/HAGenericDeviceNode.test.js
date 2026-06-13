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

describe('HAGenericDeviceNode HSV safety', () => {
  const hsv = { hue: 0.5, saturation: 1, brightness: 200 };

  beforeEach(() => {
    process.env.HA_HOST = 'http://ha.local:8123';
    process.env.HA_TOKEN = 'test-token';
    global.fetch.mockClear();
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
});