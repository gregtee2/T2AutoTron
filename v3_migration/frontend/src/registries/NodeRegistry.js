export class NodeRegistry {
    constructor() {
        this.nodes = new Map();
    }

    /**
     * Register a new node type
     * @param {string} key - Unique identifier for the node type
     * @param {object} definition - Node definition
     * @param {string} definition.label - Display name in context menu
     * @param {Class} definition.nodeClass - The Node class constructor
     * @param {React.Component} definition.component - The React component for rendering
     * @param {Function} definition.factory - Function (callback) => new Node(callback)
     * @param {string} [definition.updateStrategy] - 'default' (updateNode) or 'dataflow' (triggerDataFlow)
     */
    register(key, definition) {
        // Support single-argument registration (definition only)
        if (typeof key === 'object' && definition === undefined) {
            definition = key;
            key = definition.label ? definition.label.replace(/\s+/g, '') : 'Node_' + Math.random().toString(36).substr(2, 9);
        }
        this.nodes.set(key, definition);
    }

    get(key) {
        return this.nodes.get(key);
    }

    getAll() {
        return Array.from(this.nodes.values()).filter(def => def);
    }
    
    getByLabel(label) {
        for (const def of this.nodes.values()) {
            if (def.label === label) return def;
        }
        return null;
    }

    getByInstance(nodeInstance) {
        for (const def of this.nodes.values()) {
            if (def.nodeClass && nodeInstance instanceof def.nodeClass) return def;
        }
        return null;
    }
}

export const nodeRegistry = new NodeRegistry();
