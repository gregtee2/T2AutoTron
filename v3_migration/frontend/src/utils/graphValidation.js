/**
 * Graph Validation Utility
 * Validates graph structure and provides repair functions
 */

/**
 * Validates a graph JSON structure
 * @param {Object} graphData - The graph data to validate
 * @returns {Object} { valid: boolean, errors: string[], warnings: string[] }
 */
export function validateGraph(graphData) {
    const errors = [];
    const warnings = [];
    
    // Basic structure check
    if (!graphData || typeof graphData !== 'object') {
        return { valid: false, errors: ['Graph data is not an object'], warnings: [] };
    }
    
    // Check nodes array
    if (!Array.isArray(graphData.nodes)) {
        errors.push('Missing or invalid "nodes" array');
    } else {
        const nodeIds = new Set();
        
        graphData.nodes.forEach((node, index) => {
            // Check required fields
            if (!node.id) {
                errors.push(`Node at index ${index} is missing "id"`);
            } else {
                if (nodeIds.has(node.id)) {
                    errors.push(`Duplicate node ID: ${node.id}`);
                }
                nodeIds.add(node.id);
            }
            
            if (!node.label) {
                errors.push(`Node ${node.id || index} is missing "label"`);
            }
            
            if (!node.position || typeof node.position.x !== 'number' || typeof node.position.y !== 'number') {
                warnings.push(`Node ${node.id || index} has invalid position`);
            }
            
            // Check for NaN/Infinity in position
            if (node.position) {
                if (!Number.isFinite(node.position.x) || !Number.isFinite(node.position.y)) {
                    errors.push(`Node ${node.id || index} has NaN or Infinity in position`);
                }
            }
        });
    }
    
    // Check connections array
    if (!Array.isArray(graphData.connections)) {
        errors.push('Missing or invalid "connections" array');
    } else {
        const nodeIds = new Set(graphData.nodes?.map(n => n.id) || []);
        const connectionIds = new Set();
        
        graphData.connections.forEach((conn, index) => {
            // Check required fields
            if (!conn.source) {
                errors.push(`Connection at index ${index} is missing "source"`);
            } else if (!nodeIds.has(conn.source)) {
                errors.push(`Connection ${index} references non-existent source node: ${conn.source}`);
            }
            
            if (!conn.target) {
                errors.push(`Connection at index ${index} is missing "target"`);
            } else if (!nodeIds.has(conn.target)) {
                errors.push(`Connection ${index} references non-existent target node: ${conn.target}`);
            }
            
            if (!conn.sourceOutput) {
                warnings.push(`Connection ${index} is missing "sourceOutput"`);
            }
            
            if (!conn.targetInput) {
                warnings.push(`Connection ${index} is missing "targetInput"`);
            }
            
            // Check for duplicate connections
            const connKey = `${conn.source}:${conn.sourceOutput}->${conn.target}:${conn.targetInput}`;
            if (connectionIds.has(connKey)) {
                warnings.push(`Duplicate connection: ${connKey}`);
            }
            connectionIds.add(connKey);
            
            // Check for self-connections
            if (conn.source === conn.target) {
                warnings.push(`Self-connection detected on node ${conn.source}`);
            }
        });
    }
    
    // Check viewport (optional but should be valid if present)
    if (graphData.viewport) {
        if (typeof graphData.viewport.k !== 'number' || graphData.viewport.k <= 0) {
            warnings.push('Invalid viewport zoom value');
        }
        if (!Number.isFinite(graphData.viewport.x) || !Number.isFinite(graphData.viewport.y)) {
            warnings.push('Invalid viewport position');
        }
    }
    
    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}

/**
 * Attempts to repair a corrupted graph
 * @param {Object} graphData - The graph data to repair
 * @returns {Object} { repaired: boolean, graphData: Object, fixes: string[] }
 */
export function repairGraph(graphData) {
    const fixes = [];
    let repaired = false;
    
    // Deep clone to avoid mutating original
    const data = JSON.parse(JSON.stringify(graphData));
    
    // Ensure nodes array exists
    if (!Array.isArray(data.nodes)) {
        data.nodes = [];
        fixes.push('Created empty nodes array');
        repaired = true;
    }
    
    // Ensure connections array exists
    if (!Array.isArray(data.connections)) {
        data.connections = [];
        fixes.push('Created empty connections array');
        repaired = true;
    }
    
    // Fix node issues
    const validNodeIds = new Set();
    const seenIds = new Set();
    
    data.nodes = data.nodes.filter((node, index) => {
        // Remove nodes without id
        if (!node.id) {
            fixes.push(`Removed node at index ${index} (missing ID)`);
            repaired = true;
            return false;
        }
        
        // Handle duplicate IDs
        if (seenIds.has(node.id)) {
            const newId = `${node.id}_${Date.now()}_${index}`;
            fixes.push(`Renamed duplicate node ID ${node.id} to ${newId}`);
            node.id = newId;
            repaired = true;
        }
        seenIds.add(node.id);
        validNodeIds.add(node.id);
        
        // Fix missing label
        if (!node.label) {
            node.label = 'Unknown Node';
            fixes.push(`Set label for node ${node.id} to "Unknown Node"`);
            repaired = true;
        }
        
        // Fix invalid position
        if (!node.position || typeof node.position !== 'object') {
            node.position = { x: 0, y: 0 };
            fixes.push(`Reset position for node ${node.id}`);
            repaired = true;
        } else {
            if (!Number.isFinite(node.position.x)) {
                node.position.x = 0;
                fixes.push(`Fixed NaN x position for node ${node.id}`);
                repaired = true;
            }
            if (!Number.isFinite(node.position.y)) {
                node.position.y = 0;
                fixes.push(`Fixed NaN y position for node ${node.id}`);
                repaired = true;
            }
        }
        
        return true;
    });
    
    // Remove connections to/from non-existent nodes
    data.connections = data.connections.filter((conn, index) => {
        if (!validNodeIds.has(conn.source)) {
            fixes.push(`Removed connection ${index} (invalid source: ${conn.source})`);
            repaired = true;
            return false;
        }
        if (!validNodeIds.has(conn.target)) {
            fixes.push(`Removed connection ${index} (invalid target: ${conn.target})`);
            repaired = true;
            return false;
        }
        return true;
    });
    
    // Fix viewport if corrupted
    if (data.viewport) {
        if (!Number.isFinite(data.viewport.x)) {
            data.viewport.x = 0;
            fixes.push('Fixed viewport x position');
            repaired = true;
        }
        if (!Number.isFinite(data.viewport.y)) {
            data.viewport.y = 0;
            fixes.push('Fixed viewport y position');
            repaired = true;
        }
        if (!Number.isFinite(data.viewport.k) || data.viewport.k <= 0) {
            data.viewport.k = 1;
            fixes.push('Fixed viewport zoom level');
            repaired = true;
        }
    }
    
    return {
        repaired,
        graphData: data,
        fixes
    };
}

/**
 * Gets statistics about a graph
 * @param {Object} graphData - The graph data
 * @returns {Object} Statistics about the graph
 */
export function getGraphStats(graphData) {
    if (!graphData || !graphData.nodes) {
        return { nodeCount: 0, connectionCount: 0, nodeTypes: {} };
    }
    
    const nodeTypes = {};
    graphData.nodes.forEach(node => {
        const label = node.label || 'Unknown';
        nodeTypes[label] = (nodeTypes[label] || 0) + 1;
    });
    
    return {
        nodeCount: graphData.nodes.length,
        connectionCount: graphData.connections?.length || 0,
        nodeTypes,
        hasViewport: !!graphData.viewport,
        autoSaved: !!graphData.autoSaved,
        timestamp: graphData.timestamp
    };
}
