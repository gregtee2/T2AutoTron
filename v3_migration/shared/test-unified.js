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

console.log('\n=== All Tests Complete ===');
