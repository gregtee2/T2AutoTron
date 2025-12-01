// test_trigger.mjs
import { HAGenericDeviceNode } from './HAGenericDeviceNode.jsx';

(async () => {
    const node = new HAGenericDeviceNode(() => { });
    console.log('Initial lastTriggerValue:', node.lastTriggerValue);
    // First rising edge
    await node.process({ trigger: [true] }, {});
    console.log('After first trigger, lastTriggerValue:', node.lastTriggerValue);
    // Same trigger again (no action)
    await node.process({ trigger: [true] }, {});
    console.log('After second same trigger, lastTriggerValue:', node.lastTriggerValue);
    // Reset to false
    await node.process({ trigger: [false] }, {});
    console.log('After reset to false, lastTriggerValue:', node.lastTriggerValue);
    // Rising edge again
    await node.process({ trigger: [true] }, {});
    console.log('After second rising edge, lastTriggerValue:', node.lastTriggerValue);
})();
