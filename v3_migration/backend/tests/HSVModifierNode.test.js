const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { AutoTronBuffer, HSVModifierNode: BackendHSVModifierNode } = require('../src/engine/nodes/BufferNodes');

const inputColor = { hue: 0.18, saturation: 0.42, brightness: 97 };

function loadFrontendNode() {
  class Node {
    constructor(label) {
      this.label = label;
    }
    addInput() {}
    addOutput() {}
  }
  class Input {
    constructor(socket, label) {
      this.socket = socket;
      this.label = label;
    }
  }
  class Output extends Input {}
  const register = jest.fn();
  const source = fs.readFileSync(path.join(__dirname, '../plugins/HSVModifierNode.js'), 'utf8');
  const context = {
    window: {
      Rete: { ClassicPreset: { Node, Input, Output, Socket: class {} } },
      React: {},
      RefComponent: {},
      sockets: { object: {}, boolean: {} },
      ColorUtils: {},
      nodeRegistry: { register }
    },
    console: { error: jest.fn() }
  };

  vm.runInNewContext(source, context);
  return register.mock.calls[0][1].nodeClass;
}

describe('HSV Modifier passthrough', () => {
  beforeEach(() => AutoTronBuffer.clear());

  test.each([
    ['checkbox', node => { node.properties.enabled = false; }, {}],
    ['Enable socket', () => {}, { enable: [false] }],
    ['Enable buffer', node => {
      node.properties.selectedBuffer = '[Trigger] Disable modifier';
      AutoTronBuffer.set('[Trigger] Disable modifier', false);
    }, {}]
  ])('backend passes HSV In through when disabled by %s', (source, configure, inputs) => {
    const node = new BackendHSVModifierNode('modifier', {
      hueShift: 120,
      saturationScale: 0.9,
      brightnessScale: 200
    });
    configure(node);

    expect(node.process({ hsv_in: [inputColor], ...inputs }).hsv_out).toBe(inputColor);
  });

  test('frontend passes HSV In through when the Enable socket is false', () => {
    const FrontendHSVModifierNode = loadFrontendNode();
    const node = new FrontendHSVModifierNode();
    node.properties.hueShift = 120;
    node.properties.saturationScale = 0.9;
    node.properties.brightnessScale = 200;

    expect(node.data({ hsv_in: [inputColor], enable: [false] }).hsv_out).toBe(inputColor);
  });

  test('modifies HSV In when enabled', () => {
    const node = new BackendHSVModifierNode('modifier', {
      hueShift: 120,
      saturationScale: 0.9,
      brightnessScale: 200
    });

    const output = node.process({ hsv_in: [inputColor] }).hsv_out;

    expect(output).toEqual({
      hue: expect.any(Number),
      saturation: 0.9,
      brightness: 200
    });
    expect(output.hue).toBeCloseTo(0.5133333333333333, 12);
  });
});