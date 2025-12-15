/**
 * UnifiedNodeRegistry.js - Loads unified node definitions for both frontend and backend
 * 
 * 🦴 Caveman Summary:
 * This is like a librarian that keeps track of all the node "blueprints".
 * When the UI needs to show a node, it asks the librarian for the blueprint.
 * When the engine needs to run a node, it also asks the same librarian.
 * One librarian, one set of blueprints = everything stays in sync!
 * 
 * Usage in Node.js (backend):
 *   const registry = require('./UnifiedNodeRegistry');
 *   const TimeOfDayDef = registry.get('TimeOfDayNode');
 *   const outputs = TimeOfDayDef.execute(inputs, properties, context, state);
 * 
 * Usage in Browser (frontend):
 *   // Loaded via script tag, exposed as window.UnifiedNodeRegistry
 *   const TimeOfDayDef = window.UnifiedNodeRegistry.get('TimeOfDayNode');
 */

// Detect environment
const isNode = typeof window === 'undefined';
const isBrowser = !isNode;

class UnifiedNodeRegistry {
  constructor() {
    this.definitions = new Map();
    this.loadedFromPaths = [];
  }

  /**
   * Register a unified node definition
   * @param {string} id - Node ID (e.g., 'TimeOfDayNode')
   * @param {Object} definition - The unified node definition object
   */
  register(id, definition) {
    if (this.definitions.has(id)) {
      console.warn(`[UnifiedNodeRegistry] Overwriting existing definition: ${id}`);
    }
    
    // Validate required fields
    const required = ['id', 'label', 'execute'];
    const missing = required.filter(f => !definition[f]);
    if (missing.length > 0) {
      console.error(`[UnifiedNodeRegistry] Definition ${id} missing required fields: ${missing.join(', ')}`);
      return false;
    }
    
    this.definitions.set(id, definition);
    return true;
  }

  /**
   * Get a node definition by ID
   * @param {string} id - Node ID
   * @returns {Object|null} - The definition or null if not found
   */
  get(id) {
    return this.definitions.get(id) || null;
  }

  /**
   * Check if a node definition exists
   * @param {string} id - Node ID
   * @returns {boolean}
   */
  has(id) {
    return this.definitions.has(id);
  }

  /**
   * Get all registered node IDs
   * @returns {string[]}
   */
  getNodeIds() {
    return Array.from(this.definitions.keys());
  }

  /**
   * Get all definitions grouped by category
   * @returns {Object} - { category: [definitions] }
   */
  getByCategory() {
    const categories = {};
    for (const [id, def] of this.definitions) {
      const cat = def.category || 'Other';
      if (!categories[cat]) {
        categories[cat] = [];
      }
      categories[cat].push(def);
    }
    return categories;
  }

  /**
   * Create default property values for a node
   * @param {string} id - Node ID
   * @returns {Object} - Default property values
   */
  getDefaultProperties(id) {
    const def = this.get(id);
    if (!def || !def.properties) return {};
    
    const defaults = {};
    for (const [key, propDef] of Object.entries(def.properties)) {
      defaults[key] = propDef.default;
    }
    return defaults;
  }

  /**
   * Create initial internal state for a node
   * @param {string} id - Node ID
   * @returns {Object} - Initial state
   */
  getInitialState(id) {
    const def = this.get(id);
    if (!def || !def.internalState) return {};
    
    // Deep clone to avoid shared state between instances
    return JSON.parse(JSON.stringify(def.internalState));
  }

  /**
   * Load all unified node definitions from a directory (Node.js only)
   * @param {string} nodesDir - Path to the nodes directory
   */
  loadFromDirectory(nodesDir) {
    if (isBrowser) {
      console.error('[UnifiedNodeRegistry] loadFromDirectory() only works in Node.js');
      return;
    }
    
    const fs = require('fs');
    const path = require('path');
    
    if (!fs.existsSync(nodesDir)) {
      console.warn(`[UnifiedNodeRegistry] Nodes directory not found: ${nodesDir}`);
      return;
    }
    
    // Recursively find all .node.js files
    const findNodeFiles = (dir) => {
      const files = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          files.push(...findNodeFiles(fullPath));
        } else if (entry.name.endsWith('.node.js')) {
          files.push(fullPath);
        }
      }
      return files;
    };
    
    const nodeFiles = findNodeFiles(nodesDir);
    console.log(`[UnifiedNodeRegistry] Found ${nodeFiles.length} unified node definition(s)`);
    
    for (const filePath of nodeFiles) {
      try {
        const definition = require(filePath);
        if (definition && definition.id) {
          this.register(definition.id, definition);
          console.log(`[UnifiedNodeRegistry] Loaded: ${definition.id}`);
        } else {
          console.warn(`[UnifiedNodeRegistry] Invalid definition in: ${filePath}`);
        }
      } catch (err) {
        console.error(`[UnifiedNodeRegistry] Failed to load ${filePath}:`, err.message);
      }
    }
    
    this.loadedFromPaths.push(nodesDir);
  }

  /**
   * Get summary info for debugging
   * @returns {Object}
   */
  getSummary() {
    const byCategory = this.getByCategory();
    return {
      totalNodes: this.definitions.size,
      categories: Object.keys(byCategory),
      nodesByCategory: Object.fromEntries(
        Object.entries(byCategory).map(([cat, defs]) => [cat, defs.length])
      ),
      nodeIds: this.getNodeIds()
    };
  }
}

// Create singleton instance
const registry = new UnifiedNodeRegistry();

// Export for Node.js
if (isNode) {
  module.exports = registry;
}

// Expose globally for browser
if (isBrowser) {
  window.UnifiedNodeRegistry = registry;
}
