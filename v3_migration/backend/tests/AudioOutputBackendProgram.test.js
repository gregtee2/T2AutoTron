jest.mock('../src/engine/engineLogger', () => ({
  log: jest.fn(),
  warn: jest.fn(),
  logEngineEvent: jest.fn(),
  logDeviceCommand: jest.fn(),
  logDeviceState: jest.fn(),
  logTriggerChange: jest.fn(),
  logWarmup: jest.fn(),
  getLogLevel: jest.fn(() => 0)
}));

jest.mock('../src/engine/deviceAudit', () => ({ recordEngineIntent: jest.fn() }));
jest.mock('../src/engine/commandTracker', () => ({ logOutgoingCommand: jest.fn() }));
jest.mock('../src/engine/BackendEngine', () => ({ shouldSkipDeviceCommands: jest.fn(() => false) }));

const registry = require('../src/engine/BackendNodeRegistry');
require('../src/engine/nodes/HADeviceNodes');
require('../src/engine/nodes/UtilityNodes');
const engine = require('../src/engine/BackendEngine');

describe('backend Audio Output and Station Schedule', () => {
  const kitchen = 'media_player.kitchen';
  const entry = (overrides = {}) => ({
    rowId: 'r1',
    url: 'http://jazz.example',
    name: 'Jazz 24',
    volume: 35,
    ttsVolume: 80,
    key: 'r1@2026-09-23|http://jazz.example',
    ...overrides
  });

  function createAudioOutput() {
    const node = registry.create('TTSAnnouncementNode');
    node.properties.mediaPlayerIds = [kitchen];
    node._initialized = true;
    node.playSingleSpeaker = jest.fn().mockResolvedValue(true);
    node.stopSingleSpeaker = jest.fn().mockResolvedValue(true);
    node.setSpeakerVolume = jest.fn().mockResolvedValue(true);
    return node;
  }

  beforeEach(() => {
    engine.shouldSkipDeviceCommands.mockReturnValue(false);
  });

  test('reads wired inputs passed by the engine', async () => {
    const node = createAudioOutput();
    node.properties.stations = [{ name: 'One', url: 'http://one.example' }, { name: 'Two', url: 'http://two.example' }];
    node.properties.isStreaming = true;

    await node.process({ station_kitchen: [1] });

    expect(node.properties.speakerStations[kitchen]).toBe(1);
    expect(node.playSingleSpeaker).toHaveBeenCalledWith(kitchen, null, true);
  });

  test('plays scheduled rows 24/7 after the load baseline and stops them when rows end', async () => {
    const node = createAudioOutput();

    await node.process({ program: [{ speakers: {} }] });
    await node.process({ program: [{ speakers: { [kitchen]: entry() } }] });
    expect(node.playSingleSpeaker).toHaveBeenCalledWith(kitchen, 'http://jazz.example', true);
    expect(node.properties.speakerVolumes[kitchen]).toBe(35);

    await node.process({ program: [{ speakers: {} }] });
    expect(node.stopSingleSpeaker).toHaveBeenCalledWith(kitchen);
  });

  test('only mirrors the schedule while the browser editor is in control', async () => {
    const node = createAudioOutput();
    engine.shouldSkipDeviceCommands.mockReturnValue(true);

    await node.process({ program: [{ speakers: {} }] });
    await node.process({ program: [{ speakers: { [kitchen]: entry() } }] });

    expect(node.playSingleSpeaker).not.toHaveBeenCalled();
    expect(node._programEntries[kitchen]).toMatchObject({ rowId: 'r1' });
  });

  test('backend Station Schedule converts legacy entries and builds a program', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-23T07:00:00'));
    try {
      const legacy = registry.create('StationScheduleNode');
      legacy.restore({ properties: {
        stations: [{ name: 'Morning', url: 'http://morning.example' }, { name: 'Evening', url: 'http://evening.example' }],
        schedule: [{ time: '06:00', stationIndex: 0, volume: 20 }, { time: '18:00', stationIndex: 1, volume: 40 }]
      } });
      expect(legacy.data()).toMatchObject({ program: { speakers: {} }, station: 0, volume: 20 });

      const scheduled = registry.create('StationScheduleNode');
      scheduled.restore({ properties: {
        stations: [{ name: 'Morning', url: 'http://morning.example' }],
        schedule: [{ id: 'r1', days: [], start: '06:30', end: '08:00', speakers: [kitchen], stationIndex: 0, volume: 30, ttsVolume: 60 }]
      } });
      expect(scheduled.data().program.speakers[kitchen]).toMatchObject({ url: 'http://morning.example', volume: 30, ttsVolume: 60 });
    } finally {
      jest.useRealTimers();
    }
  });
});
