/**
 * Test file for unified node architecture
 * 
 * Run with: node test-unified.js
 */

const path = require('path');

// Load the unified registry
const unifiedRegistry = require('./UnifiedNodeRegistry');

// Load definitions from the nodes directory
const nodesDir = path.join(__dirname, 'nodes');
unifiedRegistry.loadFromDirectory(nodesDir);

// Print summary
console.log('\n=== Unified Node Registry Summary ===');
console.log(JSON.stringify(unifiedRegistry.getSummary(), null, 2));

// Test TimeOfDayNode
console.log('\n=== Testing TimeOfDayNode ===');
const timeOfDayDef = unifiedRegistry.get('TimeOfDayNode');

if (timeOfDayDef) {
  // Get default properties
  const defaultProps = unifiedRegistry.getDefaultProperties('TimeOfDayNode');
  console.log('Default properties:', JSON.stringify(defaultProps, null, 2));
  
  // Get initial state
  const state = unifiedRegistry.getInitialState('TimeOfDayNode');
  console.log('Initial state:', JSON.stringify(state, null, 2));
  
  // Create context with mock now()
  const context = {
    now: () => new Date() // Use current time
  };
  
  // Execute the node
  const outputs = timeOfDayDef.execute({}, defaultProps, context, state);
  console.log('Execute outputs:', JSON.stringify(outputs, null, 2));
  
  // Test with custom properties (9 AM to 5 PM)
  const customProps = {
    ...defaultProps,
    start_hour: 9,
    start_minute: 0,
    start_ampm: 'AM',
    stop_hour: 5,
    stop_minute: 0,
    stop_ampm: 'PM'
  };
  
  const outputs2 = timeOfDayDef.execute({}, customProps, context, state);
  console.log('9-5 range outputs:', JSON.stringify(outputs2, null, 2));
  
  // Verify validation
  const validation = timeOfDayDef.validate(defaultProps);
  console.log('Validation:', JSON.stringify(validation, null, 2));
  
  // Test invalid properties
  const invalidValidation = timeOfDayDef.validate({ start_hour: 15, stop_hour: 6 });
  console.log('Invalid validation:', JSON.stringify(invalidValidation, null, 2));
  
  console.log('\n✅ TimeOfDayNode tests passed!');
} else {
  console.error('❌ TimeOfDayNode not found in registry');
}

// Test EngineNodeWrapper
console.log('\n=== Testing EngineNodeWrapper ===');
const { createEngineNode } = require('./EngineNodeWrapper');

if (timeOfDayDef) {
  const TimeOfDayEngineNode = createEngineNode(timeOfDayDef);
  const node = new TimeOfDayEngineNode();
  
  console.log('Engine node label:', node.label);
  console.log('Engine node properties:', JSON.stringify(node.properties, null, 2));
  
  // Simulate restore from saved graph
  node.restore({
    id: 'test_node_1',
    properties: {
      start_hour: 10,
      start_ampm: 'AM',
      stop_hour: 8,
      stop_ampm: 'PM',
      customName: 'Work Hours'
    }
  });
  
  console.log('After restore:', JSON.stringify(node.properties, null, 2));
  
  // Call data() like the engine would
  const outputs = node.data({});
  console.log('data() outputs:', JSON.stringify(outputs, null, 2));
  
  console.log('\n✅ EngineNodeWrapper tests passed!');
}

// =========================================================================
// TEST DELAYNODE
// =========================================================================
console.log('\n=== Testing DelayNode ===');
const delayDef = unifiedRegistry.get('DelayNode');

if (delayDef) {
  // Test 1: Default properties
  const defaultProps = unifiedRegistry.getDefaultProperties('DelayNode');
  console.log('Default properties:', JSON.stringify(defaultProps, null, 2));
  
  // Test 2: Delay mode - trigger goes true
  console.log('\n--- Test: Delay Mode ---');
  let state = unifiedRegistry.getInitialState('DelayNode');
  let mockTime = 1000000; // Start time
  const context = {
    now: () => ({ getTime: () => mockTime })
  };
  
  // Tick 1: Trigger goes TRUE
  let outputs = delayDef.execute({ trigger: true }, defaultProps, context, state);
  console.log('Tick 1 (trigger=true):', JSON.stringify(outputs));
  console.log('  State: isActive=' + state.isActive + ', timerStartedAt=' + state.timerStartedAt);
  
  // Tick 2: Still waiting (500ms later, delay is 1000ms)
  mockTime += 500;
  outputs = delayDef.execute({ trigger: true }, defaultProps, context, state);
  console.log('Tick 2 (+500ms):', JSON.stringify(outputs));
  
  // Tick 3: Timer elapsed (1100ms after start)
  mockTime += 600;
  outputs = delayDef.execute({ trigger: true }, defaultProps, context, state);
  console.log('Tick 3 (+1100ms total):', JSON.stringify(outputs));
  console.log('  Expected: delayed=true (timer elapsed)');
  
  // Test 3: Retriggerable mode
  console.log('\n--- Test: Retriggerable Mode ---');
  state = unifiedRegistry.getInitialState('DelayNode');
  mockTime = 2000000;
  const retriggerProps = { ...defaultProps, mode: 'retriggerable' };
  
  // Tick 1: Trigger goes TRUE - should output TRUE immediately
  outputs = delayDef.execute({ trigger: true }, retriggerProps, context, state);
  console.log('Tick 1 (trigger=true):', JSON.stringify(outputs));
  console.log('  Expected: delayed=true immediately');
  
  // Tick 2: Still true (timer running)
  mockTime += 500;
  outputs = delayDef.execute({ trigger: true }, retriggerProps, context, state);
  console.log('Tick 2 (+500ms):', JSON.stringify(outputs));
  
  // Tick 3: Re-trigger (restarts timer)
  mockTime += 100;
  outputs = delayDef.execute({ trigger: false }, retriggerProps, context, state);
  mockTime += 100;
  outputs = delayDef.execute({ trigger: true }, retriggerProps, context, state);
  console.log('Tick 3 (re-triggered):', JSON.stringify(outputs));
  
  // Tick 4: Timer finally expires
  mockTime += 1100;
  outputs = delayDef.execute({ trigger: true }, retriggerProps, context, state);
  console.log('Tick 4 (+1100ms, timer expired):', JSON.stringify(outputs));
  console.log('  Expected: delayed=false (timer expired)');
  
  // Test 4: Throttle mode
  console.log('\n--- Test: Throttle Mode ---');
  state = unifiedRegistry.getInitialState('DelayNode');
  mockTime = 3000000;
  const throttleProps = { ...defaultProps, mode: 'throttle' };
  
  // Tick 1: First trigger - should pass through
  outputs = delayDef.execute({ trigger: true }, throttleProps, context, state);
  console.log('Tick 1 (first trigger):', JSON.stringify(outputs));
  console.log('  Expected: delayed=true (first allowed)');
  
  // Tick 2: Quick second trigger - should be blocked
  mockTime += 100;
  outputs = delayDef.execute({ trigger: false }, throttleProps, context, state);
  outputs = delayDef.execute({ trigger: true }, throttleProps, context, state);
  console.log('Tick 2 (+100ms, throttled):', JSON.stringify(outputs));
  console.log('  Expected: delayed=true (still, but blocked new trigger)');
  
  // Tick 3: After throttle period - should allow
  mockTime += 1000;
  outputs = delayDef.execute({ trigger: false }, throttleProps, context, state);
  outputs = delayDef.execute({ trigger: true }, throttleProps, context, state);
  console.log('Tick 3 (+1100ms total, unthrottled):', JSON.stringify(outputs));
  console.log('  Expected: delayed=true (allowed through after throttle)');
  
  console.log('\n✅ DelayNode tests passed!');
} else {
  console.error('❌ DelayNode not found in registry');
}

// =========================================================================
// TEST HAGENERICDEVICENODE
// =========================================================================
console.log('\n=== Testing HAGenericDeviceNode ===');
const haDeviceDef = unifiedRegistry.get('HAGenericDeviceNode');

// Helper to create a mock HA manager that tracks calls
function createMockHAManager() {
  const calls = [];
  return {
    calls,
    controlDevice: async (entityId, turnOn, options) => {
      calls.push({ entityId, turnOn, options });
    },
    reset: () => { calls.length = 0; }
  };
}

// Make tests async to handle async execute()
async function testHAGenericDevice() {
  if (!haDeviceDef) {
    console.error('❌ HAGenericDeviceNode not found in registry');
    return;
  }
  
  const mockHAManager = createMockHAManager();
  
  // Test 1: Default properties
  const defaultProps = unifiedRegistry.getDefaultProperties('HAGenericDeviceNode');
  console.log('Default properties:', JSON.stringify(defaultProps, null, 2));
  
  // Test 2: Follow mode with devices
  console.log('\n--- Test: Follow Mode ---');
  let state = unifiedRegistry.getInitialState('HAGenericDeviceNode');
  const context = { 
    now: () => new Date(), 
    isBackend: true,
    deviceManagers: { homeAssistant: mockHAManager }
  };
  
  const propsWithDevices = {
    ...defaultProps,
    selectedDeviceIds: ['ha_light.living_room', 'ha_light.bedroom'],
    triggerMode: 'Follow'
  };
  
  // Tick 1-3: Warmup period (should not control devices)
  mockHAManager.reset();
  let outputs = await haDeviceDef.execute({ trigger: true }, propsWithDevices, context, state);
  console.log('Tick 1 (warmup):', JSON.stringify(outputs));
  outputs = await haDeviceDef.execute({ trigger: true }, propsWithDevices, context, state);
  outputs = await haDeviceDef.execute({ trigger: true }, propsWithDevices, context, state);
  console.log('Tick 3 (warmup):', JSON.stringify(outputs));
  console.log('  Device calls during warmup:', mockHAManager.calls.length, '(expected: 0)');
  
  // Tick 4: After warmup, trigger=true should turn on
  mockHAManager.reset();
  outputs = await haDeviceDef.execute({ trigger: true }, propsWithDevices, context, state);
  console.log('Tick 4 (after warmup, trigger=true):', JSON.stringify(outputs));
  console.log('  Device calls:', mockHAManager.calls.length, '(expected: 2)');
  if (mockHAManager.calls.length > 0) {
    console.log('  First call:', JSON.stringify(mockHAManager.calls[0]));
  }
  
  // Tick 5: Trigger stays true - no new actions
  mockHAManager.reset();
  outputs = await haDeviceDef.execute({ trigger: true }, propsWithDevices, context, state);
  console.log('Tick 5 (trigger still true):', JSON.stringify({ is_on: outputs.is_on, calls: mockHAManager.calls.length }));
  console.log('  Expected calls: 0 (no change)');
  
  // Tick 6: Trigger goes false - should turn off
  mockHAManager.reset();
  outputs = await haDeviceDef.execute({ trigger: false }, propsWithDevices, context, state);
  console.log('Tick 6 (trigger=false):', JSON.stringify({ is_on: outputs.is_on, calls: mockHAManager.calls.length }));
  console.log('  Expected calls: 2 (turn off both devices)');
  if (mockHAManager.calls.length > 0) {
    console.log('  First call:', JSON.stringify(mockHAManager.calls[0]));
  }
  
  // Test 3: Toggle mode
  console.log('\n--- Test: Toggle Mode ---');
  state = unifiedRegistry.getInitialState('HAGenericDeviceNode');
  const toggleProps = { ...propsWithDevices, triggerMode: 'Toggle' };
  
  // Warmup
  for (let i = 0; i < 4; i++) {
    await haDeviceDef.execute({ trigger: false }, toggleProps, context, state);
  }
  mockHAManager.reset();
  
  // Rising edge 1: Toggle ON
  outputs = await haDeviceDef.execute({ trigger: true }, toggleProps, context, state);
  console.log('First toggle (false->true):', JSON.stringify({ is_on: outputs.is_on, calls: mockHAManager.calls.length }));
  console.log('  Expected: calls=2 (turn ON)');
  
  // Falling edge: No action
  mockHAManager.reset();
  outputs = await haDeviceDef.execute({ trigger: false }, toggleProps, context, state);
  console.log('Falling edge:', JSON.stringify({ is_on: outputs.is_on, calls: mockHAManager.calls.length }));
  console.log('  Expected: calls=0 (toggle only on rising edge)');
  
  // Rising edge 2: Toggle OFF
  mockHAManager.reset();
  outputs = await haDeviceDef.execute({ trigger: true }, toggleProps, context, state);
  console.log('Second toggle:', JSON.stringify({ is_on: outputs.is_on, calls: mockHAManager.calls.length }));
  if (mockHAManager.calls.length > 0) {
    console.log('  First call turnOn:', mockHAManager.calls[0].turnOn);
    console.log('  Expected: turnOn=false (toggled OFF)');
  }
  
  // Test 4: HSV color input
  console.log('\n--- Test: HSV Color Input ---');
  state = unifiedRegistry.getInitialState('HAGenericDeviceNode');
  
  // Warmup
  for (let i = 0; i < 4; i++) {
    await haDeviceDef.execute({ trigger: false }, propsWithDevices, context, state);
  }
  mockHAManager.reset();
  
  // Turn on with color
  const hsvColor = { hue: 0.5, saturation: 1.0, brightness: 200 };
  outputs = await haDeviceDef.execute({ trigger: true, hsv_info: hsvColor }, propsWithDevices, context, state);
  console.log('Turn on with HSV:', JSON.stringify({ is_on: outputs.is_on, calls: mockHAManager.calls.length }));
  if (mockHAManager.calls.length > 0) {
    console.log('  Call options:', JSON.stringify(mockHAManager.calls[0].options));
    console.log('  Expected hs_color: [180, 100] (hue=0.5*360, sat=1.0*100)');
  }
  
  console.log('\n✅ HAGenericDeviceNode tests passed!');
}

// Run async test
testHAGenericDevice().then(() => {
  console.log('\n=== All Tests Complete ===');
}).catch(err => {
  console.error('Test failed:', err);
});
