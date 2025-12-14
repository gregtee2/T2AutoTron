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
    const labelMappings = {
      // Color nodes
      'Timeline Color': 'SplineTimelineColorNode',
      'HSV to RGB': 'HSVToRGBNode',
      'RGB to HSV': 'RGBToHSVNode',
      'Color Mixer': 'ColorMixerNode',
      // Time nodes
      'Time of Day': 'TimeOfDayNode',
      'Time Range': 'TimeRangeNode',
      'Current Time': 'TimeOfDayNode',
      // Logic nodes
      'AND': 'ANDNode',
      'OR': 'ORNode',
      'NOT': 'NOTNode',
      'XOR': 'XORNode',
      'Compare': 'CompareNode',
      'Switch': 'SwitchNode',
      'AND Gate': 'ANDGateNode',
      'OR Gate': 'ORGateNode',
      'NOT Gate': 'NOTGateNode',
      'XOR Gate': 'XORGateNode',
      // HA nodes
      'HA Device State': 'HADeviceStateNode',
      'HA Device State Output': 'HADeviceStateOutputNode',
      'HA Service Call': 'HAServiceCallNode',
      'HA Light Control': 'HALightControlNode',
      'HA Device Automation': 'HADeviceAutomationNode',
      'Device State': 'HADeviceStateNode',
      'HA Generic Device': 'HADeviceAutomationNode',
      // Device nodes
      'Hue Light': 'HueLightNode',
      'Kasa Light': 'KasaLightNode',
      'Kasa Plug': 'KasaPlugNode',
      // Other
      'Delay': 'DelayNode',
      'Trigger': 'TriggerNode',
      'Inject': 'InjectNode',
      'Debug': null  // Debug nodes don't run on backend
    };

    const nodeName = labelMappings[label];
    if (nodeName && this.nodes.has(nodeName)) {
      return { name: nodeName, NodeClass: this.nodes.get(nodeName) };
    }
    return undefined;
  }
}

module.exports = new BackendNodeRegistry();
