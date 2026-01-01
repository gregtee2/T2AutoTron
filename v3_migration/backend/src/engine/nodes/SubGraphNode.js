/**
 * Backend Engine: SubGraphNode
 * 
 * Processes internal graph as a unit during engine ticks
 */

class SubGraphNode {
    constructor(id, properties = {}) {
        this.id = id;
        this.type = 'SubGraphNode';
        this.properties = {
            name: properties.name || 'Untitled Sub-Graph',
            description: properties.description || '',
            icon: properties.icon || '📦',
            internalNodes: properties.internalNodes || [],
            internalConnections: properties.internalConnections || [],
            exposedInputs: properties.exposedInputs || [],
            exposedOutputs: properties.exposedOutputs || [],
        };
        
        // Internal node instances (created from internalNodes)
        this.internalNodeInstances = new Map();
        this.initialized = false;
    }
    
    /**
     * Initialize internal nodes from stored graph data
     * Called once when the engine first processes this node
     */
    initializeInternalGraph(registry) {
        if (this.initialized) return;
        
        this.properties.internalNodes.forEach(nodeData => {
            const NodeClass = registry.get(nodeData.name);
            if (NodeClass) {
                const instance = new NodeClass(nodeData.id, nodeData.properties || {});
                this.internalNodeInstances.set(nodeData.id, instance);
            } else {
                console.warn(`[SubGraphNode] Unknown internal node type: ${nodeData.name}`);
            }
        });
        
        this.initialized = true;
    }
    
    /**
     * Process the internal graph
     */
    process(inputs, registry) {
        // Lazy initialize internal nodes
        if (!this.initialized && registry) {
            this.initializeInternalGraph(registry);
        }
        
        // Map exposed inputs to internal node inputs
        const internalInputs = {};
        this.properties.exposedInputs.forEach(exp => {
            const inputKey = `exp_${exp.key}`;
            const value = inputs[inputKey];
            if (value !== undefined) {
                if (!internalInputs[exp.internalNodeId]) {
                    internalInputs[exp.internalNodeId] = {};
                }
                internalInputs[exp.internalNodeId][exp.internalPort] = value;
            }
        });
        
        // Process internal nodes in topological order
        // For now, simple pass-through until full internal processing is implemented
        const outputs = {
            out: inputs.trigger
        };
        
        // TODO: Full internal graph processing
        // 1. Build dependency order from internalConnections
        // 2. Process each internal node with inputs from connections
        // 3. Collect outputs from nodes mapped to exposedOutputs
        
        // Map internal outputs to exposed outputs
        this.properties.exposedOutputs.forEach(exp => {
            const internalNode = this.internalNodeInstances.get(exp.internalNodeId);
            if (internalNode && internalNode.outputs) {
                outputs[`exp_${exp.key}`] = internalNode.outputs[exp.internalPort];
            }
        });
        
        return outputs;
    }
}

/**
 * Register with BackendNodeRegistry
 */
function register(registry) {
    registry.register('SubGraphNode', SubGraphNode);
    console.log('[SubGraphNode] Registered with backend engine');
}

module.exports = { SubGraphNode, register };
