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
    async data(inputs) {
      // Create context for execute()
      const context = {
        now: () => new Date(),
        isBackend: true,
        // Device control will be handled by the engine after execute returns
      };
      
      // Call the unified execute function
      const result = this.definition.execute(
        inputs,
        this.properties,
        context,
        this._state
      );
      
      // Handle pending device actions (for HAGenericDeviceNode etc.)
      if (result._pendingActions && result._pendingActions.length > 0) {
        await this._executePendingActions(result._pendingActions);
      }
      
      // Remove internal properties before returning
      const cleanResult = { ...result };
      delete cleanResult._pendingActions;
      delete cleanResult._warmup;
      delete cleanResult._tickCount;
      
      return cleanResult;
    }

    /**
     * Execute pending device control actions
     * @param {Array} actions - Array of { entityId, turnOn, colorData, transitionMs }
     */
    async _executePendingActions(actions) {
      // Try to get the HA manager from the engine
      let haManager = null;
      try {
        // Lazy load to avoid circular deps
        const path = require('path');
        const managerPath = path.join(__dirname, '..', 'backend', 'src', 'devices', 'managers', 'HomeAssistantManager');
        haManager = require(managerPath);
      } catch (e) {
        // Manager not available - log and skip
        console.warn('[EngineNodeWrapper] HA manager not available:', e.message);
        return;
      }
      
      for (const action of actions) {
        try {
          const { entityId, turnOn, colorData, transitionMs } = action;
          const domain = entityId.split('.')[0] || 'light';
          const service = turnOn ? 'turn_on' : 'turn_off';
          
          const payload = { entity_id: entityId };
          
          if (domain === 'light') {
            payload.transition = (transitionMs || 1000) / 1000;
            if (turnOn && colorData) {
              if (colorData.hs_color) payload.hs_color = colorData.hs_color;
              if (colorData.brightness) payload.brightness = colorData.brightness;
            }
          }
          
          // Use manager's callService method if available
          if (haManager && typeof haManager.callService === 'function') {
            await haManager.callService(domain, service, payload);
          }
        } catch (e) {
          console.error('[EngineNodeWrapper] Device action failed:', e.message);
        }
      }
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
