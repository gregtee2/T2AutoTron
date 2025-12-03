// test_trigger.js
const path = require('path');
// Adjust module resolution if needed
const { HAGenericDeviceNode } = require(path.resolve(__dirname, 'HAGenericDeviceNode.jsx'));

(async () => {
    const node = new HAGenericDeviceNode(() => { });
    // Simulate initial state
    console.log('Initial lastTriggerValue:', node.lastTriggerValue);
    // Simulate trigger input true
    const inputs = { trigger: [true] };
    const outputs = {};
    await node.process(inputs, outputs);
    console.log('After first trigger, lastTriggerValue:', node.lastTriggerValue);
    console.log('Outputs after trigger:', outputs);
    // Simulate same trigger true again (should not retrigger)
    await node.process({ trigger: [true] }, outputs);
    console.log('After second same trigger, lastTriggerValue:', node.lastTriggerValue);
    // Simulate trigger false (reset)
    await node.process({ trigger: [false] }, outputs);
    console.log('After reset to false, lastTriggerValue:', node.lastTriggerValue);
    // Simulate rising edge again
    await node.process({ trigger: [true] }, outputs);
    console.log('After second rising edge, lastTriggerValue:', node.lastTriggerValue);
})();
