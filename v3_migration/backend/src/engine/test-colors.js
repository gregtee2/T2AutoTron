/**
 * Test Color Nodes
 * 
 * Tests the SplineTimelineColorNode and color utilities
 */

const engine = require('./BackendEngine');
const registry = require('./BackendNodeRegistry');

// Load color nodes
const ColorNodes = require('./nodes/ColorNodes');
ColorNodes.register(registry);

console.log('\n=== Color Nodes Test ===\n');
console.log('Registered nodes:', registry.list());

// Test 1: SplineTimelineColorNode in time mode
console.log('\n--- Test 1: SplineTimelineColorNode (time mode) ---');

const colorNode = registry.create('SplineTimelineColorNode');
colorNode.id = 'colorTest';

// Configure for time mode with current time in range
const now = new Date();
const currentHour = now.getHours();
colorNode.properties.rangeMode = 'time';
colorNode.properties.startTime = `${String(currentHour - 1).padStart(2, '0')}:00`;
colorNode.properties.endTime = `${String(currentHour + 1).padStart(2, '0')}:00`;

const result1 = colorNode.data({});
console.log('Time mode result:', JSON.stringify(result1, null, 2));
console.log('Position:', colorNode.properties.position.toFixed(3));
console.log('Is in range:', colorNode.properties.isInRange);

// Test 2: SplineTimelineColorNode in numerical mode
console.log('\n--- Test 2: SplineTimelineColorNode (numerical mode) ---');

// Use separate node instances to avoid throttling
for (const pos of [0.25, 0.5, 0.75]) {
  const node = registry.create('SplineTimelineColorNode');
  node.id = `colorTest_${pos}`;
  node.properties.rangeMode = 'numerical';
  const result = node.data({ value: pos });
  const hsv = result.hsvInfo;
  console.log(`Position ${pos}: H=${hsv.hue.toFixed(2)} S=${hsv.saturation.toFixed(2)} B=${hsv.brightness} RGB=(${hsv.rgb.r},${hsv.rgb.g},${hsv.rgb.b})`);
}

// Test 3: HSVToRGBNode
console.log('\n--- Test 3: HSVToRGBNode ---');

const hsvToRgb = registry.create('HSVToRGBNode');
hsvToRgb.id = 'hsvToRgb';

const rgbResult = hsvToRgb.data({
  hsvInfo: { hue: 0.0, saturation: 1, brightness: 254 }  // Red
});
console.log('Red HSV -> RGB:', rgbResult);

const rgbResult2 = hsvToRgb.data({
  hsvInfo: { hue: 0.333, saturation: 1, brightness: 254 }  // Green
});
console.log('Green HSV -> RGB:', rgbResult2);

// Test 4: RGBToHSVNode
console.log('\n--- Test 4: RGBToHSVNode ---');

const rgbToHsv = registry.create('RGBToHSVNode');
rgbToHsv.id = 'rgbToHsv';

const hsvResult = rgbToHsv.data({ r: 255, g: 0, b: 0 });  // Red
console.log('Red RGB -> HSV:', JSON.stringify(hsvResult, null, 2));

// Test 5: ColorMixerNode
console.log('\n--- Test 5: ColorMixerNode ---');

const mixer = registry.create('ColorMixerNode');
mixer.id = 'mixer';

const red = { hue: 0, saturation: 1, brightness: 254 };
const blue = { hue: 0.666, saturation: 1, brightness: 254 };

const mixed50 = mixer.data({ color1: red, color2: blue, mix: 0.5 });
console.log('Red + Blue (50% mix):', JSON.stringify(mixed50.hsvInfo, null, 2));

// Test 6: Full graph with SplineTimeline -> HALightControl
console.log('\n--- Test 6: Graph Integration ---');

// Load HA nodes (auto-registers on require)
require('./nodes/HADeviceNodes');

// Build a simple graph
engine.nodes.clear();
engine.connections = [];
engine.outputs.clear();

const splineColor = registry.create('SplineTimelineColorNode');
splineColor.id = 'splineColor';
splineColor.properties.rangeMode = 'numerical';

const haLight = registry.create('HALightControlNode');
haLight.id = 'haLight';
haLight.properties.entityId = 'light.test_light';

engine.nodes.set('splineColor', splineColor);
engine.nodes.set('haLight', haLight);
engine.connections.push({
  source: 'splineColor',
  sourceOutput: 'hsvInfo',
  target: 'haLight',
  targetInput: 'hsv_info'
});

// Manually set input for splineColor (simulating external input)
// For the tick test, we set the node's value directly
splineColor.data({ value: 0.5 });

// Run a tick (async)
console.log('Running tick...');
(async () => {
  await engine.tick(true);
  
  console.log('splineColor output:', JSON.stringify(engine.outputs.get('splineColor'), null, 2));
  console.log('haLight output:', JSON.stringify(engine.outputs.get('haLight'), null, 2));

  console.log('\n=== All Color Tests Complete ===\n');
})();
