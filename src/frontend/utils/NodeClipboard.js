// C:\X_T2_AutoTron2.0\src\frontend\utils\NodeClipboard.js
// Handles copy-and-paste logic for node graphs with clipboard and file-based fallback
const path = require('path');

class NodeClipboard {
    constructor(graph, editor, canvas, logEvent, toastr) {
        this.graph = graph;
        this.editor = editor;
        this.canvas = canvas;
        this.logEvent = logEvent;
        this.toastr = toastr;
        this.tempFileName = path.join('T2AutoTron', 'copied-nodes.json'); // Relative to userData
    }

    async copyNodes() {
        try {
            console.log('NodeClipboard - Starting copyNodes, selected nodes:', Object.keys(this.editor.selected_nodes).length);
            const selectedNodes = this.editor.selected_nodes || {};
            const nodesToCopy = Object.values(selectedNodes);
            if (nodesToCopy.length === 0) {
                this.logEvent("No nodes selected to copy", "warning");
                this.toastr.warning("Select nodes to copy");
                return false;
            }

            const nodeData = {
                nodes: nodesToCopy.map(node => {
                    const properties = { ...node.properties };
                    // Remove session-specific properties
                    delete properties.socket;
                    delete properties.connection;
                    delete properties.connectToServer;
                    return {
                        id: node.id,
                        type: node.type,
                        pos: node.pos.slice(),
                        size: node.size ? node.size.slice() : null,
                        properties,
                        inputs: node.inputs ? node.inputs.map(input => ({ ...input })) : [],
                        outputs: node.outputs ? node.outputs.map(output => ({ ...output })) : [],
                    };
                }),
                links: Object.values(this.graph._links).filter(link =>
                    nodesToCopy.some(n => n.id === link.origin_id) &&
                    nodesToCopy.some(n => n.id === link.target_id)
                ).map(link => ({
                    id: link.id,
                    origin_id: link.origin_id,
                    origin_slot: link.origin_slot,
                    target_id: link.target_id,
                    target_slot: link.target_slot,
                })),
            };

            const jsonData = JSON.stringify(nodeData);
            console.log('NodeClipboard - Copying:', jsonData.substring(0, 100) + (jsonData.length > 100 ? '...' : ''));

            // Try clipboard first
            const clipboardResult = await window.api.copyToClipboard(jsonData);
            if (clipboardResult.success) {
                this.logEvent(`Copied ${nodesToCopy.length} nodes to clipboard`, "general");
                this.toastr.success(`Copied ${nodesToCopy.length} nodes`);
                // Save to temp file as a fallback
                try {
                    const fileResult = await window.api.saveTempFile(this.tempFileName, jsonData);
                    if (fileResult.success) {
                        console.log(`NodeClipboard - Saved temp file: ${fileResult.filePath}`);
                    } else {
                        console.warn(`NodeClipboard - Failed to save temp file: ${fileResult.error}`);
                    }
                } catch (err) {
                    console.warn(`NodeClipboard - Error saving temp file: ${err.message}`);
                }
            } else {
                this.logEvent(`Failed to copy to clipboard: ${clipboardResult.error}`, "warning");
                // Fallback to temp file
                const fileResult = await window.api.saveTempFile(this.tempFileName, jsonData);
                if (fileResult.success) {
                    this.logEvent(`Copied ${nodesToCopy.length} nodes to temp file`, "general");
                    this.toastr.success(`Copied ${nodesToCopy.length} nodes (via temp file)`);
                    console.log(`NodeClipboard - Saved temp file: ${fileResult.filePath}`);
                } else {
                    this.logEvent(`Failed to copy nodes: ${fileResult.error}`, "error");
                    this.toastr.error(`Failed to copy nodes: ${fileResult.error}`);
                    return false;
                }
            }
            return true;
        } catch (err) {
            this.logEvent(`Error copying nodes: ${err.message}`, "error");
            this.toastr.error("Error copying nodes");
            console.error('NodeClipboard - Copy error:', err);
            return false;
        }
    }

    async pasteNodes() {
        try {
            let nodeData;
            const maxRetries = 3;
            const retryDelay = 100; // ms

            // Try clipboard with retries
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    const clipboardResult = await window.api.readFromClipboard();
                    if (clipboardResult.success && clipboardResult.text) {
                        console.log(`NodeClipboard - Clipboard read (attempt ${attempt}):`,
                            clipboardResult.text.substring(0, 100) + (clipboardResult.text.length > 100 ? '...' : ''));
                        nodeData = JSON.parse(clipboardResult.text);
                        if (nodeData && typeof nodeData === 'object' &&
                            nodeData.nodes && Array.isArray(nodeData.nodes) &&
                            nodeData.links && Array.isArray(nodeData.links)) {
                            break; // Valid data, exit retry loop
                        }
                        throw new Error("Invalid node data format");
                    } else {
                        console.warn(`NodeClipboard - Clipboard read failed (attempt ${attempt}):`,
                            clipboardResult.error || 'No data');
                    }
                } catch (err) {
                    console.warn(`NodeClipboard - Clipboard error (attempt ${attempt}):`, err.message);
                    if (attempt === maxRetries) {
                        this.logEvent(`Clipboard read failed after ${maxRetries} attempts: ${err.message}`, "warning");
                    }
                }
                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                }
            }

            // Fallback to temp file if clipboard fails
            if (!nodeData) {
                const fileResult = await window.api.readTempFile(this.tempFileName);
                if (!fileResult.success) {
                    this.logEvent(`Failed to read temp file: ${fileResult.error}`, "error");
                    this.toastr.error(`Failed to paste nodes: ${fileResult.error}`);
                    console.error('NodeClipboard - Temp file read failed:', fileResult.error);
                    return false;
                }
                console.log('NodeClipboard - Temp file data:',
                    fileResult.content.substring(0, 100) + (fileResult.content.length > 100 ? '...' : ''));
                try {
                    nodeData = JSON.parse(fileResult.content);
                    if (!nodeData || typeof nodeData !== 'object' ||
                        !nodeData.nodes || !Array.isArray(nodeData.nodes) ||
                        !nodeData.links || !Array.isArray(nodeData.links)) {
                        throw new Error("Invalid node data format");
                    }
                } catch (err) {
                    this.logEvent(`Invalid temp file data: ${err.message}`, "error");
                    this.toastr.error("Invalid node data in temp file");
                    console.error('NodeClipboard - Invalid temp file data:', err.message);
                    return false;
                }
            }

            const offsetX = 50, offsetY = 50;
            const newNodeIdMap = new Map();
            let skippedNodes = 0;
            nodeData.nodes.forEach(node => {
                if (!LiteGraph.registered_node_types[node.type]) {
                    this.logEvent(`Node type ${node.type} not registered`, "warning");
                    this.toastr.warning(`Node type ${node.type} not registered`);
                    console.warn(`NodeClipboard - Skipping node type: ${node.type}`);
                    skippedNodes++;
                    return;
                }
                const newNode = LiteGraph.createNode(node.type);
                if (!newNode) {
                    this.logEvent(`Failed to create node ${node.type}`, "error");
                    this.toastr.error(`Failed to create node ${node.type}`);
                    console.error(`NodeClipboard - Failed to create node: ${node.type}`);
                    skippedNodes++;
                    return;
                }
                newNode.pos = [node.pos[0] + offsetX, node.pos[1] + offsetY];
                if (node.size) newNode.size = node.size.slice();
                if (node.properties) {
                    const safeProperties = {};
                    for (const [key, value] of Object.entries(node.properties)) {
                        if (typeof value !== 'function' && value !== null && value !== undefined) {
                            safeProperties[key] = value;
                        }
                    }
                    Object.assign(newNode.properties, safeProperties);
                }
                this.graph.add(newNode);
                newNodeIdMap.set(node.id, newNode);
                if (newNode.onAdded) newNode.onAdded(this.graph);
            });

            nodeData.links.forEach(link => {
                const originNode = newNodeIdMap.get(link.origin_id);
                const targetNode = newNodeIdMap.get(link.target_id);
                if (originNode && targetNode) {
                    try {
                        this.graph.connect(
                            originNode.id,
                            link.origin_slot,
                            targetNode.id,
                            link.target_slot
                        );
                    } catch (err) {
                        this.logEvent(`Failed to connect nodes: ${err.message}`, "warning");
                        this.toastr.warning(`Failed to connect nodes: ${err.message}`);
                        console.warn('NodeClipboard - Connection error:', err.message);
                    }
                }
            });

            newNodeIdMap.forEach(node => {
                if (node.connectToServer && typeof node.connectToServer === "function") {
                    try {
                        node.connectToServer();
                    } catch (err) {
                        this.logEvent(`Failed to reconnect node ${node.type}: ${err.message}`, "warning");
                        this.toastr.warning(`Failed to reconnect node ${node.type}`);
                        console.warn('NodeClipboard - Reconnection error:', err.message);
                    }
                }
            });

            this.editor.setDirty(true, true);
            const pastedCount = nodeData.nodes.length - skippedNodes;
            if (pastedCount > 0) {
                this.logEvent(`Pasted ${pastedCount} nodes`, "general");
                this.toastr.success(`Pasted ${pastedCount} nodes`);
            } else {
                this.logEvent("No nodes pasted due to missing types or errors", "warning");
                this.toastr.warning("No nodes pasted");
            }
            return pastedCount > 0;
        } catch (err) {
            this.logEvent(`Error pasting nodes: ${err.message}`, "error");
            this.toastr.error("Error pasting nodes");
            console.error('NodeClipboard - Paste error:', err);
            return false;
        }
    }

    setupEventListeners() {
        // Ensure canvas is focusable
        this.canvas.tabIndex = 0;
        this.canvas.style.outline = 'none'; // Prevent visible focus outline
        this.canvas.addEventListener('mousedown', () => {
            this.canvas.focus();
            console.log('NodeClipboard - Canvas focused');
        });

        // Keyboard shortcuts
        this.canvas.addEventListener('keydown', (e) => {
            if (document.activeElement !== this.canvas) {
                console.log('NodeClipboard - Canvas not focused, ignoring keydown:', document.activeElement);
                return;
            }
            if (e.ctrlKey || e.metaKey) {
                if (e.key === 'c' || e.key === 'C') {
                    e.preventDefault();
                    console.log('NodeClipboard - Ctrl+C triggered');
                    this.copyNodes();
                } else if (e.key === 'v' || e.key === 'V') {
                    e.preventDefault();
                    console.log('NodeClipboard - Ctrl+V triggered');
                    this.pasteNodes();
                }
            }
        });

        // Add to context menu
        this.editor.graphcanvas.onShowMenu = function() {
            const menu = this.menu;
            menu.addItem("Copy Nodes", () => {
                console.log('NodeClipboard - Context menu Copy Nodes triggered');
                this.copyNodes();
            }, { enabled: Object.keys(this.editor.selected_nodes).length > 0 });
            menu.addItem("Paste Nodes", () => {
                console.log('NodeClipboard - Context menu Paste Nodes triggered');
                this.pasteNodes();
            });
        }.bind(this);

        this.logEvent("Node clipboard initialized", "general");
    }
}

module.exports = NodeClipboard;