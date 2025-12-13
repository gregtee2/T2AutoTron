/**
 * Test script for BackendEngine
 * 
 * Run with: node src/engine/test.js
 */

const { engine, registry, loadBuiltinNodes } = require('./index');

async function runTest() {
  console.log('=== Backend Engine Test ===\n');

  // Load built-in nodes
  await loadBuiltinNodes();
  
  console.log('Registered node types:', registry.list());
  console.log('');

  // Create a test graph manually
  const testGraph = {
    nodes: [
      {
        id: 'time1',
        name: 'TimeOfDayNode',
        label: 'Morning Check',
        data: {
          properties: {
            startTime: '06:00',
            endTime: '12:00',
            mode: 'state'
          }
        }
      },
      {
        id: 'time2',
        name: 'TimeOfDayNode',
        label: 'Afternoon Check',
        data: {
          properties: {
            startTime: '12:00',
            endTime: '18:00',
            mode: 'state'
          }
        }
      },
      {
        id: 'or1',
        name: 'ORNode',
        label: 'Daytime OR'
      },
      {
        id: 'not1',
        name: 'NOTNode',
        label: 'Night Inverter'
      }
    ],
    connections: [
      { source: 'time1', sourceOutput: 'active', target: 'or1', targetInput: 'a' },
      { source: 'time2', sourceOutput: 'active', target: 'or1', targetInput: 'b' },
      { source: 'or1', sourceOutput: 'result', target: 'not1', targetInput: 'input' }
    ]
  };

  // Load the test graph
  await engine.loadGraphData(testGraph);
  
  // Enable debug for this test
  engine.debug = true;
  
  console.log('Engine status:', engine.getStatus());
  console.log('Loaded nodes:', Array.from(engine.nodes.keys()));
  
  // Check if nodes have data() methods
  engine.nodes.forEach((node, id) => {
    console.log(`  ${id}: hasData=${typeof node.data === 'function'}, label=${node.label}`);
  });
  console.log('');

  // Run a few ticks manually
  console.log('Running 3 ticks...\n');
  
  for (let i = 0; i < 3; i++) {
    await engine.tick(true);  // force=true for testing
    
    console.log(`Tick ${i + 1}:`);
    
    // Show outputs (engine.outputs is a Map)
    if (engine.outputs.size === 0) {
      console.log('  (no outputs yet - nodes may not have data() returning values)');
    }
    engine.outputs.forEach((outputs, nodeId) => {
      console.log(`  ${nodeId}:`, outputs);
    });
    console.log('');
    
    // Wait a bit between ticks
    await new Promise(r => setTimeout(r, 100));
  }

  console.log('=== Test Complete ===');
  
  // Don't start the engine loop for this test
  // engine.start();
}

runTest().catch(console.error);
