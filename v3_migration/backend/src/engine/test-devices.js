/**
 * Test script for device node integration
 * 
 * This simulates a real automation:
 * TimeOfDayNode (afternoon) → HALightControlNode
 * 
 * Run with: node src/engine/test-devices.js
 */

const { engine, registry, loadBuiltinNodes } = require('./index');

async function runTest() {
  console.log('=== Device Node Integration Test ===\n');

  // Load built-in nodes
  await loadBuiltinNodes();
  
  console.log('Registered node types:', registry.list().length);
  console.log('');

  // Create a test graph: TimeOfDay → Light
  // This simulates "Turn on lights during afternoon hours"
  const testGraph = {
    nodes: [
      {
        id: 'timeCheck',
        name: 'TimeOfDayNode',
        label: 'Afternoon (12:00-20:00)',
        data: {
          properties: {
            startTime: '12:00',
            endTime: '20:00',
            mode: 'state'
          }
        }
      },
      {
        id: 'haLight',
        name: 'HALightControlNode',
        label: 'Living Room Light',
        data: {
          properties: {
            entityId: 'light.living_room',
            transitionTime: 1000
          }
        }
      }
    ],
    connections: [
      { 
        source: 'timeCheck', 
        sourceOutput: 'active', 
        target: 'haLight', 
        targetInput: 'trigger' 
      }
    ]
  };

  // Load the test graph
  await engine.loadGraphData(testGraph);
  engine.debug = true;
  
  console.log('Graph loaded:');
  console.log(`  Nodes: ${engine.nodes.size}`);
  console.log(`  Connections: ${engine.connections.length}`);
  console.log('');

  // Run one tick
  console.log('Running tick...\n');
  await engine.tick(true);
  
  // Show results
  console.log('Results:');
  engine.outputs.forEach((outputs, nodeId) => {
    const node = engine.nodes.get(nodeId);
    console.log(`  ${node.label} (${nodeId}):`);
    for (const [key, value] of Object.entries(outputs)) {
      console.log(`    ${key}: ${JSON.stringify(value)}`);
    }
  });
  console.log('');

  // Check what would happen
  const timeOutput = engine.outputs.get('timeCheck');
  const lightOutput = engine.outputs.get('haLight');
  
  if (timeOutput?.active) {
    console.log('✅ TimeOfDay is ACTIVE (within 12:00-20:00)');
    console.log('   → Light would receive trigger=true');
    console.log('   → HALightControlNode would call HA API to turn on light');
  } else {
    console.log('⏸️  TimeOfDay is INACTIVE (outside 12:00-20:00)');
    console.log('   → Light would receive trigger=false');
    console.log('   → HALightControlNode would call HA API to turn off light');
  }
  
  console.log('');
  console.log('Note: Actual HA API calls require HA_HOST and HA_TOKEN in .env');
  console.log('');
  console.log('=== Test Complete ===');
}

runTest().catch(console.error);
