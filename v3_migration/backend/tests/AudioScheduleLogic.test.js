const {
  getActiveOccurrence,
  migrateLegacySchedule,
  buildAudioProgram,
  getLegacyStationOutput
} = require('../../shared/logic/AudioScheduleLogic');

// Wednesday 2026-09-23 at the given local time
const at = (time, day = 23) => new Date(`2026-09-${day}T${time}:00`);

const stations = [
  { name: 'Groove Salad', url: 'http://groove.example' },
  { name: 'Jazz 24', url: 'http://jazz.example' }
];

describe('AudioScheduleLogic', () => {
  test('same-day rows are active only inside start-end on matching days', () => {
    const row = { id: 'r1', days: [3], start: '06:30', end: '08:00' };
    expect(getActiveOccurrence(row, at('07:00'))).toBe('2026-09-23');
    expect(getActiveOccurrence(row, at('08:00'))).toBeNull();
    expect(getActiveOccurrence({ ...row, days: [1, 2] }, at('07:00'))).toBeNull();
  });

  test('overnight rows belong to the day they started', () => {
    const row = { id: 'late', days: [2], start: '22:00', end: '02:00' };
    expect(getActiveOccurrence(row, at('01:00'))).toBe('2026-09-22');
    expect(getActiveOccurrence({ ...row, days: [3] }, at('01:00'))).toBeNull();
    expect(getActiveOccurrence({ ...row, days: [3] }, at('23:00'))).toBe('2026-09-23');
  });

  test('matching start and end runs all day', () => {
    expect(getActiveOccurrence({ start: '06:00', end: '06:00', days: [] }, at('03:00'))).toBe('2026-09-23');
  });

  test('lower rows win for the same speaker and rows without speakers are skipped', () => {
    const rows = [
      { id: 'a', days: [], start: '06:00', end: '12:00', speakers: ['media_player.kitchen', 'media_player.bar'], stationIndex: 0, volume: 30, ttsVolume: 70 },
      { id: 'b', days: [], start: '07:00', end: '09:00', speakers: ['media_player.kitchen'], stationIndex: 1, volume: 45, ttsVolume: null },
      { id: 'c', days: [], start: '06:00', end: '12:00', speakers: [], stationIndex: 1, volume: 50 }
    ];

    const program = buildAudioProgram(rows, stations, at('07:30'));

    expect(program.speakers['media_player.kitchen']).toMatchObject({ rowId: 'b', url: 'http://jazz.example', volume: 45, ttsVolume: null });
    expect(program.speakers['media_player.bar']).toMatchObject({ rowId: 'a', url: 'http://groove.example', volume: 30, ttsVolume: 70 });
    expect(Object.keys(program.speakers)).toHaveLength(2);
  });

  test('key changes on a new occurrence but not on a volume-only edit', () => {
    const row = { id: 'a', days: [], start: '06:00', end: '08:00', speakers: ['media_player.kitchen'], stationIndex: 0, volume: 30 };
    const today = buildAudioProgram([row], stations, at('07:00')).speakers['media_player.kitchen'];
    const louder = buildAudioProgram([{ ...row, volume: 60 }], stations, at('07:00')).speakers['media_player.kitchen'];
    const tomorrow = buildAudioProgram([row], stations, at('07:00', 24)).speakers['media_player.kitchen'];

    expect(louder.key).toBe(today.key);
    expect(tomorrow.key).not.toBe(today.key);
  });

  test('rows pointing at a station with no URL produce no program entry', () => {
    const row = { id: 'a', days: [], start: '06:00', end: '08:00', speakers: ['media_player.kitchen'], stationIndex: 5, volume: 30 };
    expect(buildAudioProgram([row], stations, at('07:00')).speakers).toEqual({});
  });

  test('legacy start-time schedules become contiguous rows that keep the old outputs', () => {
    const rows = migrateLegacySchedule([
      { time: '18:00', stationIndex: 1, volume: 40 },
      { time: '06:00', stationIndex: 0, volume: 20 }
    ]);

    expect(rows).toMatchObject([
      { start: '06:00', end: '18:00', stationIndex: 0, volume: 20, speakers: [] },
      { start: '18:00', end: '06:00', stationIndex: 1, volume: 40, speakers: [] }
    ]);
    expect(getLegacyStationOutput(rows, at('20:00'))).toEqual({ station: 1, volume: 40 });
    expect(getLegacyStationOutput(rows, at('05:00'))).toEqual({ station: 1, volume: 40 });
    expect(getLegacyStationOutput(rows, at('09:00'))).toEqual({ station: 0, volume: 20 });
  });
});
