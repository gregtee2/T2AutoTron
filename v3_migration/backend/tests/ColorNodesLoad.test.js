describe('backend color node registration', () => {
  test('loads and registers all color node types', () => {
    const registry = { register: jest.fn() };

    require('../src/engine/nodes/ColorNodes').register(registry);

    expect(registry.register.mock.calls.map(call => call[0])).toEqual([
      'SplineTimelineColorNode',
      'HSVToRGBNode',
      'RGBToHSVNode',
      'ColorMixerNode'
    ]);
  });
});