/**
 * EngineNodeWrapper.js - Wraps unified node definitions for use in BackendEngine
 * 
 * 🦴 Caveman Summary:
 * The backend engine expects nodes to have a data() method.
 * The unified definitions have an execute() method.
 * This wrapper is like an adapter plug that makes them fit together.
 * 
 * Usage:
 *   const wrapper = require('./EngineNodeWrapper');
 *   const NodeClass = wrapper.createEngineNode(timeOfDayDefinition);
 *   const node = new NodeClass();
 *   node.restore(savedData);
 *   const output = node.data(inputs);
 */

/**
 * Create an engine-compatible node class from a unified definition
 * @param {Object} definition - The unified node definition
 * @returns {Function} - A constructor function usable by BackendEngine
 */
function createEngineNode(definition) {
  // Create a class dynamically
  class EngineNode {
    constructor() {
      this.id = null;
      this.label = definition.label;
      this.definition = definition;
      
      // Initialize properties with defaults
      this.properties = {};
      if (definition.properties) {
        for (const [key, propDef] of Object.entries(definition.properties)) {
          this.properties[key] = propDef.default;
        }
      }
      
      // Initialize internal state
      this._state = {};
      if (definition.internalState) {
        this._state = JSON.parse(JSON.stringify(definition.internalState));
      }
    }

    /**
     * Restore node from saved data
     * @param {Object} data - Saved node data with properties
     */
    restore(data) {
      if (data.properties) {
        Object.assign(this.properties, data.properties);
      }
      if (data.id) {
        this.id = data.id;
      }
    }

    /**
     * Execute the node logic (called by BackendEngine)
     * @param {Object} inputs - Input values from connected nodes
     * @returns {Object} - Output values
     */
    data(inputs) {
      // Create context for execute()
      const context = {
        now: () => new Date(),
        // Add other context items as needed by specific nodes
        // deviceManagers: { ha, hue, kasa }, etc.
      };
      
      // Call the unified execute function
      return this.definition.execute(
        inputs,
        this.properties,
        context,
        this._state
      );
    }

    /**
     * Alias for data() - some engine code calls process()
     */
    process(inputs) {
      return this.data(inputs);
    }

    /**
     * Serialize for saving
     */
    serialize() {
      return { ...this.properties };
    }

    /**
     * Get node type ID
     */
    getTypeId() {
      return this.definition.id;
    }
  }

  // Set display name for debugging
  Object.defineProperty(EngineNode, 'name', { value: definition.id });
  
  return EngineNode;
}

/**
 * Register all unified nodes with the BackendNodeRegistry
 * @param {UnifiedNodeRegistry} unifiedRegistry - The unified registry
 * @param {BackendNodeRegistry} engineRegistry - The backend engine registry
 */
function registerAllWithEngine(unifiedRegistry, engineRegistry) {
  const nodeIds = unifiedRegistry.getNodeIds();
  let registered = 0;
  
  for (const id of nodeIds) {
    const definition = unifiedRegistry.get(id);
    if (definition) {
      const NodeClass = createEngineNode(definition);
      engineRegistry.register(id, NodeClass);
      registered++;
    }
  }
  
  console.log(`[EngineNodeWrapper] Registered ${registered} unified node(s) with backend engine`);
  return registered;
}

module.exports = {
  createEngineNode,
  registerAllWithEngine
};
