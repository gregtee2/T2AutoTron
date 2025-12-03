import { nodeRegistry } from '../registries/NodeRegistry';

import { HAGenericDeviceNode, HAGenericDeviceNodeComponent } from './HAGenericDeviceNode';
import { KasaPlugNode, KasaPlugNodeComponent } from './KasaPlugNode';
import { SunriseSunsetNode, SunriseSunsetNodeComponent } from './SunriseSunsetNode.jsx';
import { TimeOfDayNode, TimeOfDayNodeComponent } from './TimeOfDayNode.jsx';
import { PushbuttonNode, PushbuttonNodeComponent } from './PushbuttonNode.jsx';
import { DisplayNode, DisplayNodeComponent } from './DisplayNode.jsx';
import { AllInOneColorNode, AllInOneColorNodeComponent } from './AllInOneColorNode.jsx';
import { WeatherLogicNode, WeatherLogicNodeComponent } from './WeatherLogicNode.jsx';
import { BackdropNode, BackdropNodeComponent } from './BackdropNode.jsx';

export function registerCoreNodes() {
    nodeRegistry.register('HAGenericDeviceNode', {
        label: "HA Generic Device",
        category: "Home Assistant",
        nodeClass: HAGenericDeviceNode,
        component: HAGenericDeviceNodeComponent,
        factory: (cb) => new HAGenericDeviceNode(cb)
    });

    nodeRegistry.register('KasaPlugNode', {
        label: "Kasa Plug Control",
        category: "Plugs",
        nodeClass: KasaPlugNode,
        component: KasaPlugNodeComponent,
        factory: (cb) => new KasaPlugNode(cb)
    });

    nodeRegistry.register('SunriseSunsetNode', {
        label: "Sunrise/Sunset Trigger",
        category: "Timer/Event",
        nodeClass: SunriseSunsetNode,
        component: SunriseSunsetNodeComponent,
        factory: (cb) => new SunriseSunsetNode(cb)
    });

    nodeRegistry.register('TimeOfDayNode', {
        label: "Time of Day",
        category: "Timer/Event",
        nodeClass: TimeOfDayNode,
        component: TimeOfDayNodeComponent,
        factory: (cb) => new TimeOfDayNode(cb)
    });

    nodeRegistry.register('PushbuttonNode', {
        label: "Pushbutton",
        category: "Inputs",
        nodeClass: PushbuttonNode,
        component: PushbuttonNodeComponent,
        factory: (cb) => new PushbuttonNode(cb)
    });

    nodeRegistry.register('DisplayNode', {
        label: "Display",
        category: "Other",
        nodeClass: DisplayNode,
        component: DisplayNodeComponent,
        factory: (cb) => new DisplayNode(cb)
    });

    nodeRegistry.register('AllInOneColorNode', {
        label: "All-in-One Color Control",
        category: "CC_Control_Nodes",
        nodeClass: AllInOneColorNode,
        component: AllInOneColorNodeComponent,
        factory: (cb) => new AllInOneColorNode(cb),
        updateStrategy: 'dataflow' // Special handling for color slider performance
    });

    nodeRegistry.register('WeatherLogicNode', {
        label: "Weather Logic",
        category: "Logic",
        nodeClass: WeatherLogicNode,
        component: WeatherLogicNodeComponent,
        factory: (cb) => new WeatherLogicNode(cb)
    });

    nodeRegistry.register('BackdropNode', {
        label: "Backdrop",
        category: "Utility",
        nodeClass: BackdropNode,
        component: BackdropNodeComponent,
        factory: (cb) => new BackdropNode(cb),
        isBackdrop: true  // Special flag for backdrop handling
    });
}
