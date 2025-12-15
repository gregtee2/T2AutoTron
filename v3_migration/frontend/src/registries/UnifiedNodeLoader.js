/**
 * UnifiedNodeLoader.js - Loads unified node definitions and converts them to Rete.js nodes
 * 
 * 🦴 Caveman Summary:
 * The unified .node.js files are like recipe cards. This loader reads those cards
 * and creates the actual kitchen tools (Rete.js nodes + React components) that
 * the editor needs to work.
 * 
 * Flow:
 * 1. Server wraps .node.js in IIFE and serves at /unified/category/file.node.js
 * 2. IIFE runs in browser, calls window.UnifiedNodeLoader.registerDefinition()
 * 3. We convert the definition to a Rete.js node class + React component
 * 4. Register with window.nodeRegistry so it appears in context menu
 */

import { apiUrl } from '../utils/apiBase';

// Store for loaded definitions before they're converted
const pendingDefinitions = [];

// Track loading state
let loadingPromise = null;
let loadedCount = 0;
let totalCount = 0;

// Global store for ALL unified definitions (including hidden ones)
// Frontend plugins can access this to call unified execute() logic
window.UnifiedDefinitions = window.UnifiedDefinitions || {};

/**
 * Helper function for frontend plugins to call unified execute() logic
 * 
 * @param {string} definitionId - The unified definition ID (e.g., 'UnifiedTimeOfDayNode')
 * @param {Object} inputs - Input values from connected sockets
 * @param {Object} properties - Node properties
 * @param {Object} state - Internal state object (will be modified by execute)
 * @returns {Object|null} - Output values, or null if definition not found
 * 
 * Usage in frontend plugins:
 * ```javascript
 * data(inputs) {
 *   const result = window.executeUnified('UnifiedTimeOfDayNode', inputs, this.properties, this._state);
 *   if (result) return result;
 *   // Fallback to local logic if unified not loaded
 *   return { state: this.properties.currentState };
 * }
 * ```
 */
window.executeUnified = function(definitionId, inputs, properties, state) {
  const def = window.UnifiedDefinitions[definitionId];
  if (!def || !def.execute) {
    console.warn(`[executeUnified] Definition not found: ${definitionId}`);
    return null;
  }
  
  // Create context for frontend execution
  const context = {
    now: () => new Date(),
    isBackend: false
  };
  
  // Initialize state if needed
  const stateObj = state || {};
  
  try {
    return def.execute(inputs, properties, context, stateObj);
  } catch (error) {
    console.error(`[executeUnified] Error executing ${definitionId}:`, error);
    return null;
  }
};

/**
 * Called by the IIFE wrapper when a unified definition is loaded
 * @param {Object} definition - The unified node definition (module.exports)
 */
function registerDefinition(definition) {
  if (!definition || !definition.id) {
    console.warn('[UnifiedNodeLoader] Invalid definition received:', definition);
    return;
  }
  console.log(`[UnifiedNodeLoader] Registered definition: ${definition.id}`);
  pendingDefinitions.push(definition);
}

/**
 * Convert a unified definition to a Rete.js node class
 * @param {Object} def - The unified node definition
 * @returns {Class} - A Rete.js compatible node class
 */
function createNodeClass(def) {
  const { ClassicPreset } = window.Rete;
  const sockets = window.sockets;
  
  // Create a class dynamically
  return class UnifiedNode extends ClassicPreset.Node {
    constructor(changeCallback) {
      super(def.label);
      
      this.width = def.width || 300;
      this.height = def.height || 200;
      this.changeCallback = changeCallback;
      this.definition = def;
      
      // Initialize properties with defaults from definition
      this.properties = {};
      if (def.properties) {
        for (const [key, propDef] of Object.entries(def.properties)) {
          this.properties[key] = propDef.default;
        }
      }
      
      // Initialize internal state
      this._state = {};
      if (def.internalState) {
        this._state = JSON.parse(JSON.stringify(def.internalState));
      }
      
      // Add outputs from definition
      if (def.outputs) {
        for (const [key, output] of Object.entries(def.outputs)) {
          const socketType = output.type || 'any';
          const socket = sockets[socketType] || new ClassicPreset.Socket(socketType);
          this.addOutput(key, new ClassicPreset.Output(socket, output.label || key));
        }
      }
      
      // Add inputs from definition
      if (def.inputs) {
        for (const [key, input] of Object.entries(def.inputs)) {
          const socketType = input.type || 'any';
          const socket = sockets[socketType] || new ClassicPreset.Socket(socketType);
          this.addInput(key, new ClassicPreset.Input(socket, input.label || key, input.multipleConnections || false));
        }
      }
    }
    
    /**
     * Execute the node logic - called by dataflow engine
     */
    data(inputs) {
      // Create context for execute()
      const context = {
        now: () => new Date(),
        isBackend: false
      };
      
      // Handle async execute functions
      const result = this.definition.execute(inputs, this.properties, context, this._state);
      
      // If result is a Promise, we can't handle it in sync data()
      // For now, just log warning - async nodes need different handling
      if (result && typeof result.then === 'function') {
        console.warn(`[UnifiedNode] ${this.definition.id} returned a Promise - async not supported in frontend data()`);
        return {};
      }
      
      // Remove internal properties before returning
      const cleanResult = { ...result };
      delete cleanResult._warmup;
      delete cleanResult._tickCount;
      
      return cleanResult;
    }
    
    /**
     * Restore state from saved graph
     */
    restore(state) {
      if (state.properties) {
        Object.assign(this.properties, state.properties);
      }
    }
    
    /**
     * Serialize for saving
     */
    serialize() {
      return { ...this.properties };
    }
    
    /**
     * Update callback for UI changes
     */
    update() {
      if (this.changeCallback) this.changeCallback();
    }
  };
}

/**
 * Create a React component for rendering a unified node
 * @param {Object} def - The unified node definition
 * @returns {Function} - A React functional component
 */
function createNodeComponent(def) {
  return function UnifiedNodeComponent({ data, emit }) {
    const React = window.React;
    const { useState, useEffect, useCallback } = React;
    const RefComponent = window.RefComponent;
    const { NodeHeader, HelpIcon } = window.T2Controls || {};
    
    // Local state for reactive updates
    const [, setTick] = useState(0);
    
    // Sync with node properties
    useEffect(() => {
      const originalCallback = data.changeCallback;
      data.changeCallback = () => {
        setTick(t => t + 1);
        if (originalCallback) originalCallback();
      };
      return () => { data.changeCallback = originalCallback; };
    }, [data]);
    
    // Execute node and get outputs for display
    const context = { now: () => new Date(), isBackend: false };
    let computedOutputs = {};
    try {
      computedOutputs = def.execute({}, data.properties, context, data._state || {}) || {};
    } catch (e) {
      console.warn(`[UnifiedNode] Error executing ${def.id}:`, e);
    }
    
    // Helper to update a property
    const updateProperty = useCallback((key, value) => {
      data.properties[key] = value;
      if (data.changeCallback) data.changeCallback();
    }, [data]);
    
    // Render property controls based on uiType
    const renderControl = (key, propDef) => {
      const value = data.properties[key];
      
      switch (propDef.uiType) {
        case 'hidden':
          return null;
          
        case 'text':
          return React.createElement('input', {
            type: 'text',
            value: value || '',
            onChange: (e) => updateProperty(key, e.target.value),
            onPointerDown: (e) => e.stopPropagation(),
            style: { width: '100%', padding: '4px', background: '#333', color: '#fff', border: '1px solid #555', borderRadius: '4px' }
          });
          
        case 'number':
          return React.createElement('input', {
            type: 'number',
            value: value ?? 0,
            min: propDef.min,
            max: propDef.max,
            onChange: (e) => updateProperty(key, parseFloat(e.target.value) || 0),
            onPointerDown: (e) => e.stopPropagation(),
            style: { width: '60px', padding: '4px', background: '#333', color: '#fff', border: '1px solid #555', borderRadius: '4px' }
          });
          
        case 'select':
          return React.createElement('select', {
            value: value || propDef.default,
            onChange: (e) => updateProperty(key, e.target.value),
            onPointerDown: (e) => e.stopPropagation(),
            style: { padding: '4px', background: '#333', color: '#fff', border: '1px solid #555', borderRadius: '4px' }
          }, (propDef.options || []).map(opt => 
            React.createElement('option', { key: opt, value: opt }, opt)
          ));
          
        case 'toggle':
          return React.createElement('button', {
            onClick: () => updateProperty(key, !value),
            onPointerDown: (e) => e.stopPropagation(),
            style: {
              padding: '4px 12px',
              background: value ? '#4caf50' : '#555',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }
          }, value ? 'ON' : 'OFF');
          
        default:
          return React.createElement('span', {}, String(value));
      }
    };
    
    // Get inputs/outputs from data (populated by createNodeClass)
    const inputEntries = data.inputs ? Object.entries(data.inputs).map(([key, input]) => ({ key, ...input })) : [];
    const outputEntries = data.outputs ? Object.entries(data.outputs).map(([key, output]) => ({ key, ...output })) : [];
    
    // Get dimensions from node (set in createNodeClass from def)
    const nodeWidth = data.width || def.width || 300;
    const nodeHeight = data.height || def.height || 400;
    
    return React.createElement('div', { 
      className: 'unified-node',
      style: {
        width: `${nodeWidth}px`,
        minHeight: `${nodeHeight - 40}px`, // Account for Rete wrapper padding
        padding: '12px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'visible'
      }
    }, [
      // Title bar
      React.createElement('div', { 
        key: 'title', 
        className: 'title',
        style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }
      }, [
        React.createElement('div', { key: 'left', style: { display: 'flex', alignItems: 'center', gap: '6px' } }, [
          React.createElement('span', { key: 'icon' }, def.icon || '📦'),
          React.createElement('span', { key: 'label' }, data.properties.customName || def.label)
        ]),
        HelpIcon && React.createElement(HelpIcon, { key: 'help', text: def.helpText, size: 14 })
      ]),
      
      // Input sockets section
      inputEntries.length > 0 && React.createElement('div', { 
        key: 'inputs', 
        className: 'unified-inputs-section',
        style: { marginBottom: '8px' }
      }, inputEntries.map(input =>
        React.createElement('div', { 
          key: input.key, 
          className: 'unified-input-row',
          style: { display: 'flex', alignItems: 'center', justifyContent: 'flex-start', padding: '2px 0' }
        }, [
          React.createElement(RefComponent, { 
            key: 'socket',
            init: ref => emit({ type: 'render', data: { type: 'socket', element: ref, payload: input.socket, nodeId: data.id, side: 'input', key: input.key } }),
            unmount: ref => emit({ type: 'unmount', data: { element: ref } })
          }),
          React.createElement('span', { 
            key: 'label', 
            className: 'unified-socket-label',
            style: { marginLeft: '8px', fontSize: '12px', color: '#aaa' }
          }, def.inputs?.[input.key]?.label || input.key)
        ])
      )),
      
      // Output sockets section  
      outputEntries.length > 0 && React.createElement('div', { 
        key: 'outputs', 
        className: 'unified-outputs-section',
        style: { marginBottom: '8px' }
      }, outputEntries.map(output =>
        React.createElement('div', { 
          key: output.key, 
          className: 'unified-output-row',
          style: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '2px 0' }
        }, [
          React.createElement('span', { 
            key: 'label', 
            className: 'unified-socket-label',
            style: { marginRight: '8px', fontSize: '12px', color: '#aaa' }
          }, def.outputs?.[output.key]?.label || output.key),
          React.createElement('span', {
            key: 'value',
            style: { marginRight: '8px', fontSize: '11px', color: '#4caf50', fontFamily: 'monospace' }
          }, computedOutputs[output.key] !== undefined ? String(computedOutputs[output.key]) : '—'),
          React.createElement(RefComponent, { 
            key: 'socket',
            init: ref => emit({ type: 'render', data: { type: 'socket', element: ref, payload: output.socket, nodeId: data.id, side: 'output', key: output.key } }),
            unmount: ref => emit({ type: 'unmount', data: { element: ref } })
          })
        ])
      )),
      
      // Property controls
      def.properties && React.createElement('div', {
        key: 'controls',
        className: 'content',
        style: { display: 'flex', flexDirection: 'column', gap: '8px' },
        onPointerDown: (e) => e.stopPropagation()
      }, Object.entries(def.properties)
        .filter(([_, p]) => p.uiType !== 'hidden')
        .map(([key, propDef]) =>
          React.createElement('div', {
            key: key,
            className: 'control-row',
            style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }
          }, [
            React.createElement('span', { key: 'label', className: 'control-label', style: { fontSize: '12px', color: '#aaa' } }, propDef.label || key),
            renderControl(key, propDef)
          ])
        )
      )
    ]);
  };
}

/**
 * Process all pending definitions and register them with nodeRegistry
 * 
 * NOTE: Definitions with hidden: true are skipped for context menu registration.
 * These nodes are backend-only - the frontend uses existing pretty UI components.
 * The unified definitions provide shared execute() logic for the backend engine.
 * 
 * ALL definitions (including hidden) are stored in window.UnifiedDefinitions
 * so frontend plugins can access the unified execute() logic.
 */
function processDefinitions() {
  const nodeRegistry = window.nodeRegistry;
  if (!nodeRegistry) {
    console.error('[UnifiedNodeLoader] window.nodeRegistry not available');
    return [];
  }
  
  const registered = [];
  
  for (const def of pendingDefinitions) {
    // Store ALL definitions in global registry (including hidden ones)
    // This allows frontend plugins to access unified execute() logic
    window.UnifiedDefinitions[def.id] = def;
    console.log(`[UnifiedNodeLoader] Stored definition: ${def.id} (hidden: ${!!def.hidden})`);
    
    // Skip hidden definitions for UI registration - frontend uses existing pretty plugins
    if (def.hidden) {
      console.log(`[UnifiedNodeLoader] Skipping UI registration for hidden node: ${def.id}`);
      continue;
    }
    
    try {
      const NodeClass = createNodeClass(def);
      const Component = createNodeComponent(def);
      
      nodeRegistry.register(def.id, {
        label: def.label,
        category: def.category || 'Unified',
        nodeClass: NodeClass,
        component: Component,
        factory: (cb) => new NodeClass(cb)
      });
      
      registered.push(def.id);
      console.log(`[UnifiedNodeLoader] Registered node: ${def.id} in category: ${def.category}`);
    } catch (error) {
      console.error(`[UnifiedNodeLoader] Failed to process ${def.id}:`, error);
    }
  }
  
  // Clear pending
  pendingDefinitions.length = 0;
  
  return registered;
}

/**
 * Load all unified node definitions from the server
 * @returns {Promise<string[]>} - Array of registered node IDs
 */
export async function loadUnifiedPlugins() {
  if (loadingPromise) return loadingPromise;
  
  loadingPromise = (async () => {
    try {
      // Fetch list of unified plugins
      const response = await fetch(apiUrl('/api/unified-plugins'));
      if (!response.ok) {
        console.warn('[UnifiedNodeLoader] Could not fetch unified plugins list');
        return [];
      }
      
      const plugins = await response.json();
      totalCount = plugins.length;
      
      if (plugins.length === 0) {
        console.log('[UnifiedNodeLoader] No unified plugins found');
        return [];
      }
      
      console.log(`[UnifiedNodeLoader] Loading ${plugins.length} unified plugins...`);
      
      // Load each plugin script
      for (const pluginPath of plugins) {
        try {
          await loadScript(apiUrl(`/${pluginPath}`));
          loadedCount++;
        } catch (error) {
          console.error(`[UnifiedNodeLoader] Failed to load ${pluginPath}:`, error);
        }
      }
      
      // Process all loaded definitions
      const registered = processDefinitions();
      
      console.log(`[UnifiedNodeLoader] Completed: ${registered.length} unified nodes registered`);
      return registered;
      
    } catch (error) {
      console.error('[UnifiedNodeLoader] Error loading unified plugins:', error);
      return [];
    }
  })();
  
  return loadingPromise;
}

/**
 * Helper to load a script tag
 */
function loadScript(url) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${url}`));
    document.head.appendChild(script);
  });
}

// Expose registerDefinition globally so IIFE wrappers can call it
if (typeof window !== 'undefined') {
  window.UnifiedNodeLoader = {
    registerDefinition,
    loadUnifiedPlugins,
    getStats: () => ({ pendingCount: pendingDefinitions.length, loadedCount, totalCount })
  };
}

// Named export for registerDefinition (loadUnifiedPlugins already exported inline)
export { registerDefinition };

// Default export for compatibility
export default {
  registerDefinition,
  loadUnifiedPlugins
};
