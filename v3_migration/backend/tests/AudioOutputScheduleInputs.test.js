const fs = require('fs');
const path = require('path');
const vm = require('vm');

describe('Audio Output scheduled station inputs', () => {
  let NodeClass;
  let pluginWindow;

  beforeAll(() => {
    pluginWindow = {
      Rete: { ClassicPreset: { Node: class {
        constructor(label) {
          this.label = label;
          this.inputs = {};
          this.outputs = {};
        }
        addInput(key, input) { this.inputs[key] = input; }
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

  function createNode(overrides = {}) {
    const node = new NodeClass();
    Object.assign(node, {
      properties: {
        mediaPlayerIds: ['media_player.bar'],
        speakerVolumes: { 'media_player.bar': 30 },
        speakerStations: {},
        speakerCustomUrls: {},
        stations: [{ name: 'One', url: 'https://one.example' }, { name: 'Two', url: 'https://two.example' }],
        isStreaming: true,
        streamEnabled: true,
        customStreamUrl: '',
        lastResult: false
      },
      _lastStationInputs: { 'media_player.bar': 0 },
      _lastActiveStates: {},
      _needsVolumeSync: false,
      _lastTrigger: false,
      _lastSentTime: 0,
      setVolume: jest.fn().mockResolvedValue(undefined),
      queueStationChange: jest.fn().mockResolvedValue(true),
      ...overrides
    });
    return node;
  }

  test('uses the station restart volume instead of a competing volume request', async () => {
    const node = createNode();

    await node.data({
      vol_bar: [65],
      station_bar: [1]
    });

    expect(node.properties.speakerVolumes['media_player.bar']).toBe(65);
    expect(node.setVolume).not.toHaveBeenCalled();
    expect(node.properties.speakerStations['media_player.bar']).toBe(1);
    expect(node.queueStationChange).toHaveBeenCalledWith('media_player.bar', 'https://two.example');
  });

  test('sends a volume request when the station input is unchanged', async () => {
    const node = createNode();

    await node.data({
      vol_bar: [65],
      station_bar: [0]
    });

    expect(node.setVolume).not.toHaveBeenCalled();
    await new Promise(resolve => setTimeout(resolve, 175));
    expect(node.setVolume).toHaveBeenCalledWith('media_player.bar', 65);
    expect(node.queueStationChange).not.toHaveBeenCalled();
  });

  test('switches station when streaming is enabled but the UI status is stale', async () => {
    const node = createNode({
      properties: {
        ...createNode().properties,
        isStreaming: false,
        streamEnabled: true
      }
    });

    await node.data({ station_bar: [1] });

    expect(node.properties.speakerStations['media_player.bar']).toBe(1);
    expect(node.queueStationChange).toHaveBeenCalledWith('media_player.bar', 'https://two.example');
  });

  test('marks older station changes as stale when a newer one is queued', async () => {
    const node = createNode({
      queueStationChange: NodeClass.prototype.queueStationChange,
      playSingleSpeaker: jest.fn().mockResolvedValue(true)
    });

    node.queueStationChange('media_player.bar', 'https://one.example');
    node.queueStationChange('media_player.bar', 'https://two.example');

    const firstGuard = node.playSingleSpeaker.mock.calls[0][4];
    const secondGuard = node.playSingleSpeaker.mock.calls[1][4];
    expect(firstGuard()).toBe(false);
    expect(secondGuard()).toBe(true);
  });

  test('does not start a stale station after the stop delay', async () => {
    jest.useFakeTimers();
    const node = createNode({ queueStationChange: NodeClass.prototype.queueStationChange });
    pluginWindow.apiFetch = jest.fn().mockResolvedValue({ ok: true });
    let current = true;

    const pending = node.playSingleSpeaker(
      'media_player.bar',
      'https://one.example',
      1,
      true,
      () => current
    );
    await Promise.resolve();
    current = false;
    await jest.advanceTimersByTimeAsync(300);

    await expect(pending).resolves.toBe(false);
    expect(pluginWindow.apiFetch).toHaveBeenCalledTimes(1);
    expect(pluginWindow.apiFetch.mock.calls[0][0]).toBe('/api/media/stop');
    jest.useRealTimers();
  });

  test('coalesces rapid volume changes to the newest value', async () => {
    const node = createNode({ queueVolumeChange: NodeClass.prototype.queueVolumeChange });

    node.queueVolumeChange('media_player.bar', 40);
    node.queueVolumeChange('media_player.bar', 65);
    await new Promise(resolve => setTimeout(resolve, 175));

    expect(node.setVolume).toHaveBeenCalledTimes(1);
    expect(node.setVolume).toHaveBeenCalledWith('media_player.bar', 65);
  });
});