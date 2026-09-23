const fs = require('fs');
const path = require('path');
const vm = require('vm');
const luxon = require('luxon');

function loadPlugin(fileName) {
  let NodeClass;
  const pluginWindow = {
    Rete: { ClassicPreset: { Node: class { addOutput() {} }, Output: class {}, Socket: class {} } },
    React: { useState: () => [], useEffect: () => {}, useCallback: fn => fn, useRef: () => ({}) },
    RefComponent: {},
    sockets: { boolean: {}, string: {} },
    luxon,
    T2Controls: {},
    nodeRegistry: { register: (name, definition) => { NodeClass = definition.nodeClass; } }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../plugins', fileName), 'utf8'), {
    window: pluginWindow,
    Intl,
    console: { log: jest.fn(), error: jest.fn(), warn: jest.fn() }
  });
  return NodeClass;
}

describe('time nodes compute their state on graph restore', () => {
  const timezone = 'America/Los_Angeles';

  afterEach(() => jest.useRealTimers());

  function setClock(iso) {
    jest.useFakeTimers();
    jest.setSystemTime(luxon.DateTime.fromISO(iso, { zone: timezone }).toJSDate());
  }

  describe('Time of Day', () => {
    const TimeOfDayNode = loadPlugin('TimeOfDayNode.js');
    const saved = {
      start_hour: 8, start_minute: 0, start_ampm: 'AM', start_enabled: true,
      stop_hour: 6, stop_minute: 0, stop_ampm: 'PM', stop_enabled: true,
      timezone, pulseMode: false
    };

    test('reports ON immediately inside the active window', () => {
      setClock('2026-09-23T09:55:00');
      const node = new TimeOfDayNode(() => {});
      node.restore({ properties: saved });
      expect(node.data().state).toBe(true);
    });

    test('reports OFF outside the active window', () => {
      setClock('2026-09-23T19:00:00');
      const node = new TimeOfDayNode(() => {});
      node.restore({ properties: saved });
      expect(node.data().state).toBe(false);
    });

    test('pulse mode starts OFF', () => {
      setClock('2026-09-23T09:55:00');
      const node = new TimeOfDayNode(() => {});
      node.restore({ properties: { ...saved, pulseMode: true } });
      expect(node.data().state).toBe(false);
    });
  });

  describe('Sunrise/Sunset', () => {
    const SunriseSunsetNode = loadPlugin('SunriseSunsetNode.js');
    const saved = {
      on_enabled: true, on_offset_hours: 0, on_offset_minutes: 30, on_offset_direction: 'Before',
      fixed_on_enabled: false, off_enabled: false,
      fixed_stop_enabled: true, fixed_stop_hour: 10, fixed_stop_minute: 30, fixed_stop_ampm: 'PM',
      sunrise_time: '2026-09-23T13:40:46.000Z',
      sunset_time: '2026-09-24T01:49:39.000Z',
      timezone, pulseMode: false
    };

    test('replaces a stale saved ON with OFF during the day', () => {
      setClock('2026-09-23T09:23:00');
      const node = new SunriseSunsetNode(() => {});
      node.restore({ properties: { ...saved, currentState: true } });
      expect(node.data().state).toBe(false);
    });

    test('reports ON immediately between sunset offset and fixed stop', () => {
      setClock('2026-09-23T21:00:00');
      const node = new SunriseSunsetNode(() => {});
      node.restore({ properties: { ...saved, currentState: false } });
      expect(node.data().state).toBe(true);
    });

    test('stays OFF when sun times have never been fetched', () => {
      setClock('2026-09-23T21:00:00');
      const node = new SunriseSunsetNode(() => {});
      node.restore({ properties: { ...saved, sunrise_time: null, sunset_time: null, currentState: true } });
      expect(node.data().state).toBe(false);
    });
  });
});
