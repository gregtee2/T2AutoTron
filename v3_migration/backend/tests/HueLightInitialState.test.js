jest.mock('../src/logging/logWithTimestamp', () => jest.fn());

const HueLight = require('../src/devices/managers/utils/HueLight');

describe('HueLight startup state reporting', () => {
  function createLight(states) {
    const getLight = jest.fn();
    states.forEach((state) => getLight.mockResolvedValueOnce({ data: { state } }));
    return new HueLight(
      { id: 7, name: 'Kitchen Bar Spot 1', type: 'Extended color light', _rawData: { state: { on: true } } },
      { lights: { getLight } }
    );
  }

  test('marks only the first poll as a startup snapshot', async () => {
    const light = createLight([
      { on: true, bri: 200, hue: 1000, sat: 100, ct: 300, xy: [0.4, 0.4] },
      { on: false, bri: 200, hue: 1000, sat: 100, ct: 300, xy: [0.4, 0.4] }
    ]);
    const io = { emit: jest.fn() };

    await light.updateState(io, null);
    await light.updateState(io, null);

    expect(io.emit.mock.calls[0][1]).toMatchObject({ on: true, initial: true });
    expect(io.emit.mock.calls[1][1]).toMatchObject({ on: false });
    expect(io.emit.mock.calls[1][1]).not.toHaveProperty('initial');
  });

  test('does not flag a later real change when the first poll emitted nothing', async () => {
    const unchanged = { on: true };
    const light = createLight([unchanged, { on: false }]);
    light.state = { on: true, bri: 0, hue: 0, sat: 0, colorTemp: 0, xy: [0, 0] };
    light.previousState = { ...light.state };
    const io = { emit: jest.fn() };

    await light.updateState(io, null);
    await light.updateState(io, null);

    expect(io.emit).toHaveBeenCalledTimes(1);
    expect(io.emit.mock.calls[0][1]).toMatchObject({ on: false });
    expect(io.emit.mock.calls[0][1]).not.toHaveProperty('initial');
  });
});
