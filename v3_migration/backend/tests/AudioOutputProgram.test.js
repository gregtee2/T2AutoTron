const fs = require('fs');
const path = require('path');
const vm = require('vm');

describe('Audio Output schedule program input', () => {
  let NodeClass;

  beforeAll(() => {
    const pluginWindow = {
      Rete: { ClassicPreset: { Node: class {
        constructor(label) {
          this.label = label;
          this.inputs = {};
          this.outputs = {};
        }
        addInput(key, input) { this.inputs[key] = input; }
        removeInput(key) { delete this.inputs[key]; }
        addOutput(key, output) { this.outputs[key] = output; }
      }, Input: class {}, Output: class {} } },
      React: {},
      sockets: {},
      nodeRegistry: { register: (name, definition) => { NodeClass = definition.nodeClass; } }
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../plugins/TTSAnnouncementNode.js'), 'utf8'), {
      window: pluginWindow,
      console: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval
    });
  });

  const kitchen = 'media_player.kitchen';
  const entry = (overrides = {}) => ({
    rowId: 'r1',
    occurrence: '2026-09-23',
    url: 'http://jazz.example',
    name: 'Jazz 24',
    volume: 35,
    ttsVolume: 80,
    key: 'r1@2026-09-23|http://jazz.example',
    ...overrides
  });
  const program = (speakers, revision = 0) => ({ speakers, revision });

  function createNode() {
    const node = new NodeClass();
    node.properties.mediaPlayerIds = [kitchen];
    node.queueStationChange = jest.fn().mockResolvedValue(true);
    node.queueVolumeChange = jest.fn();
    node.stopSingleSpeaker = jest.fn().mockResolvedValue(true);
    return node;
  }

  test('new nodes have a Program input and no per-speaker sockets', () => {
    const node = new NodeClass();
    node.updateVolumeInputs([kitchen]);

    expect(node.inputs.program).toBeDefined();
    expect(node.inputs.vol_kitchen).toBeUndefined();
    expect(node.inputs.station_kitchen).toBeUndefined();
  });

  test('graphs saved before the Program input keep their per-speaker sockets', () => {
    const node = new NodeClass();
    node.restore({ properties: { mediaPlayerIds: [kitchen] } });

    expect(node.properties.showSpeakerInputs).toBe(true);
    expect(node.inputs.vol_kitchen).toBeDefined();
    expect(node.inputs.station_kitchen).toBeDefined();
  });

  test('the first program after load is a baseline and sends no commands', async () => {
    const node = createNode();

    await node.data({ program: [program({ [kitchen]: entry() })] });

    expect(node.queueStationChange).not.toHaveBeenCalled();
    expect(node.stopSingleSpeaker).not.toHaveBeenCalled();
    expect(node.getStreamUrlForSpeaker(kitchen)).toBe('http://jazz.example');
  });

  test('plays when a row starts, leaves manual changes alone, and stops when it ends', async () => {
    const node = createNode();
    await node.data({ program: [program({})] });

    await node.data({ program: [program({ [kitchen]: entry() })] });
    expect(node.queueStationChange).toHaveBeenCalledWith(kitchen, 'http://jazz.example');
    expect(node.getSpeakerVolume(kitchen)).toBe(35);

    await node.data({ program: [program({ [kitchen]: entry() })] });
    expect(node.queueStationChange).toHaveBeenCalledTimes(1);

    await node.data({ program: [program({})] });
    expect(node.stopSingleSpeaker).toHaveBeenCalledWith(kitchen);
  });

  test('a volume-only edit adjusts volume without restarting the stream', async () => {
    const node = createNode();
    await node.data({ program: [program({ [kitchen]: entry() })] });

    await node.data({ program: [program({ [kitchen]: entry({ volume: 55 }) })] });

    expect(node.queueStationChange).not.toHaveBeenCalled();
    expect(node.queueVolumeChange).toHaveBeenCalledWith(kitchen, 55);
  });

  test('the Play button revision re-applies the current schedule', async () => {
    const node = createNode();
    await node.data({ program: [program({ [kitchen]: entry() }, 0)] });

    await node.data({ program: [program({ [kitchen]: entry() }, 1)] });

    expect(node.queueStationChange).toHaveBeenCalledWith(kitchen, 'http://jazz.example');
  });

  test('a manual station pick overrides the scheduled station until the next row', async () => {
    const node = createNode();
    node.properties.stations = [{ name: 'Manual', url: 'http://manual.example' }];
    await node.data({ program: [program({ [kitchen]: entry() })] });

    node.setSpeakerStation(kitchen, 0);
    node.clearProgramOverride(kitchen);

    expect(node.getStreamUrlForSpeaker(kitchen)).toBe('http://manual.example');
  });

  test('announcements use the scheduled row volume', async () => {
    const node = createNode();
    await node.data({ program: [program({ [kitchen]: entry({ ttsVolume: 20 }) })] });

    expect(node.getTTSVolumeForSpeaker(kitchen, 60)).toBe(20);
    expect(node.getTTSVolumeForSpeaker('media_player.other', 30)).toBe(75);
  });
});
