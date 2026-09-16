const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { HADeviceStateNode } = require('../src/engine/nodes/HADeviceNodes');

function loadNodeClass() {
  class Node {
    constructor() {
      this.controls = {};
      this.outputs = {};
    }
    addControl(key, control) {
      this.controls[key] = control;
    }
    addOutput(key, output) {
      this.outputs[key] = output;
    }
  }
  class Input {
    constructor(socket, label) {
      this.socket = socket;
      this.label = label;
    }
  }
  class Output extends Input {}
  class DropdownControl {}
  class ButtonControl {}
  class SwitchControl {}
  const booleanSocket = { name: 'boolean' };
  const source = fs.readFileSync(path.join(__dirname, '../plugins/HADeviceStateOutputNode.js'), 'utf8');
  const register = jest.fn();
  const context = {
    window: {
      Rete: { ClassicPreset: { Node, Input, Output, Socket: class {} } },
      React: {},
      RefComponent: {},
      sockets: { boolean: booleanSocket, object: { name: 'object' }, lightInfo: { name: 'light_info' } },
      T2Controls: { DropdownControl, ButtonControl, SwitchControl },
      T2HAUtils: { filterDevices: devices => devices, isSameDevice: (first, second) => first === second },
      nodeRegistry: { register }
    },
    sessionStorage: { getItem: () => '' },
    localStorage: { getItem: () => '' },
    fetch: jest.fn().mockResolvedValue({ json: async () => ({ success: false, error: 'not used' }) }),
    console: { error: jest.fn(), log: jest.fn() }
  };

  vm.runInNewContext(source, context);
  return { NodeClass: register.mock.calls[0][1].nodeClass, booleanSocket };
}

describe('HA Device State Output boolean output', () => {
  test('returns a Boolean Open / On output for an Open and Closed garage sensor', () => {
    const { NodeClass, booleanSocket } = loadNodeClass();
    const node = new NodeClass();
    const deviceId = 'binary_sensor.garage_door_sensor';
    node.properties.selectedDeviceId = deviceId;
    node.properties.selectedDeviceName = 'Garage Door Sensor';
    node.devices = [{ entity_id: deviceId, entityType: 'binary_sensor', name: 'Garage Door Sensor' }];
    node.perDeviceState[deviceId] = { state: 'open', attributes: {} };

    expect(node.outputs.is_active.socket).toBe(booleanSocket);
    expect(node.data().is_active).toBe(true);

    node.perDeviceState[deviceId] = { state: 'closed', attributes: {} };
    expect(node.data().is_active).toBe(false);
  });

  test('keeps Open and Closed Boolean behavior after backend handoff', async () => {
    const node = new HADeviceStateNode();
    node.cachedState = { state: 'open', attributes: {} };
    node.lastPollTime = Date.now();

    expect((await node.data()).is_active).toBe(true);

    node.cachedState = { state: 'closed', attributes: {} };
    expect((await node.data()).is_active).toBe(false);
  });
});