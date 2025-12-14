/**
 * BackendNodeRegistry.js
 * 
 * Registry for backend-compatible node classes.
 * These are pure logic implementations without React/browser dependencies.
 */

class BackendNodeRegistry {
  constructor() {
    this.nodes = new Map();
    this.debug = process.env.VERBOSE_LOGGING === 'true';
  }

  /**
   * Register a node class for backend execution
   * @param {string} name - Node type name (e.g., 'TimeOfDayNode')
   * @param {class} nodeClass - The node class with data() method
   */
  register(name, nodeClass) {
    if (this.debug) {
      console.log(`[BackendNodeRegistry] Registered: ${name}`);
    }
    this.nodes.set(name, nodeClass);
  }

  /**
   * Get a node class by name
   * @param {string} name - Node type name
   * @returns {class|undefined}
   */
  get(name) {
    return this.nodes.get(name);
  }

  /**
   * Check if a node type is registered
   * @param {string} name - Node type name
   * @returns {boolean}
   */
  has(name) {
    return this.nodes.has(name);
  }

  /**
   * Get all registered node names
   * @returns {string[]}
   */
  list() {
    return Array.from(this.nodes.keys());
  }

  /**
   * Create a new instance of a registered node
   * @param {string} name - Node type name
   * @returns {object|null} - New node instance or null if not found
   */
  create(name) {
    const NodeClass = this.nodes.get(name);
    if (!NodeClass) {
      console.error(`[BackendNodeRegistry] Unknown node type: ${name}`);
      return null;
    }
    return new NodeClass();
  }

  /**
   * Get count of registered nodes
   * @returns {number}
   */
  get size() {
    return this.nodes.size;
  }

  /**
   * Get a node class by label (display name)
   * Used as fallback when node type name isn't available in saved graph
   * @param {string} label - Display label (e.g., 'Timeline Color')
   * @returns {object|undefined} - { name, NodeClass } or undefined
   */
  getByLabel(label) {
    // Build a label-to-name mapping based on common patterns
    // These map frontend display labels to backend node class names
    const labelMappings = {
      // Color nodes
      'Timeline Color': 'SplineTimelineColorNode',
      'All-in-One Color Control': 'SplineTimelineColorNode',  // Similar functionality
      'HSV to RGB': 'HSVToRGBNode',
      'RGB to HSV': 'RGBToHSVNode',
      'Color Mixer': 'ColorMixerNode',
      'HSV Control': null,  // Frontend-only node
      'HSV Modifier': null,  // Frontend-only node
      
      // Time nodes
      'Time of Day': 'TimeOfDayNode',
      'Time Range': 'TimeRangeNode',
      'Time Range (Continuous)': 'TimeRangeNode',
      'Current Time': 'TimeOfDayNode',
      'Sunrise/Sunset Trigger': 'TimeOfDayNode',  // Use TimeOfDay for now
      
      // Logic nodes
      'AND': 'ANDNode',
      'OR': 'ORNode',
      'NOT': 'NOTNode',
      'XOR': 'XORNode',
      'Compare': 'CompareNode',
      'Comparison': 'CompareNode',
      'Switch': 'SwitchNode',
      'AND Gate': 'ANDGateNode',
      'OR Gate': 'ORGateNode',
      'NOT Gate': 'NOTGateNode',
      'XOR Gate': 'XORGateNode',
      'Logic Condition': 'CompareNode',
      'Logic Operations': 'ANDNode',
      'Conditional Switch': 'SwitchNode',
      
      // HA nodes
      'HA Device State': 'HADeviceStateNode',
      'HA Device State Output': 'HADeviceStateOutputNode',
      'HA Device State Display': 'HADeviceStateNode',
      'HA Service Call': 'HAServiceCallNode',
      'HA Light Control': 'HALightControlNode',
      'HA Device Automation': 'HADeviceAutomationNode',
      'HA Generic Device': 'HADeviceAutomationNode',
      'Device State': 'HADeviceStateNode',
      
      // Device nodes
      'Hue Light': 'HueLightNode',
      'Hue Lights': 'HueLightNode',
      'Kasa Light': 'KasaLightNode',
      'Kasa Lights': 'KasaLightNode',
      'Kasa Plug': 'KasaPlugNode',
      'Kasa Plug Control': 'KasaPlugNode',
      
      // Utility nodes
      'Delay': 'DelayNode',
      'Trigger': 'TriggerNode',
      'Toggle': 'TriggerNode',  // Toggle acts as a trigger
      'Inject': 'InjectNode',
      
      // Nodes that don't run on backend (UI-only)
      'Debug': null,
      'Display': null,
      'Backdrop': null,
      'Receiver': null,
      'Sender': null
    };

    const nodeName = labelMappings[label];
    if (nodeName === null) {
      // Explicitly marked as not-for-backend
      return { name: null, NodeClass: null, skipReason: 'UI-only node' };
    }
    if (nodeName && this.nodes.has(nodeName)) {
      return { name: nodeName, NodeClass: this.nodes.get(nodeName) };
    }
    return undefined;
  }
}

module.exports = new BackendNodeRegistry();
