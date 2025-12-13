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
}

module.exports = new BackendNodeRegistry();
