import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { NodeEditor, ClassicPreset } from "rete";
import { AreaPlugin, AreaExtensions } from "rete-area-plugin";
import { ConnectionPlugin, Presets as ConnectionPresets } from "rete-connection-plugin";
import { ReactPlugin, Presets } from "rete-react-plugin";
import { ContextMenuPlugin, Presets as ContextMenuPresets } from "rete-context-menu-plugin";
import { DataflowEngine } from "rete-engine";
import "./sockets"; // Import socket patch globally

import { Dock } from "./ui/Dock";
import { ForecastPanel } from "./ui/ForecastPanel";

// Registry
import { nodeRegistry } from "./registries/NodeRegistry";
import { registerCoreNodes } from "./nodes/registerNodes";
import { loadPlugins } from "./registries/PluginLoader";

// Controls (Still imported directly for now)
import { StatusIndicatorControl, ColorBarControl, PowerStatsControl } from "./nodes/HAGenericDeviceNode";
import { ButtonControlComponent } from "./controls/ButtonControl";
import { DropdownControlComponent } from "./controls/DropdownControl";
import { TextControlComponent } from "./controls/TextControl";
import { SwitchControlComponent } from "./controls/SwitchControl";
import { NumberControlComponent } from "./controls/NumberControl";
import { DeviceStateControlComponent } from "./controls/DeviceStateControl";
import { StatusIndicatorControlComponent } from "./controls/StatusIndicatorControl";
import { ColorBarControlComponent } from "./controls/ColorBarControl";
import { PowerStatsControlComponent } from "./controls/PowerStatsControl";

// import { CustomMenuItem } from "./CustomContextMenu";

// Register nodes immediately
registerCoreNodes();

export function Editor() {
    const ref = useRef(null);
    const [editorInstance, setEditorInstance] = useState(null);
    const [areaInstance, setAreaInstance] = useState(null);
    const [engineInstance, setEngineInstance] = useState(null);

    const createEditor = useCallback(async (container) => {
        const editor = new NodeEditor();
        const area = new AreaPlugin(container);
        const connection = new ConnectionPlugin();
        const render = new ReactPlugin({ createRoot });
        const engine = new DataflowEngine();

        // Register engine with editor
        editor.use(engine);

        const process = async () => {
            console.log("[Editor] process() called - resetting engine and fetching all nodes");
            engine.reset();
            // Fetch all nodes to propagate data
            for (const node of editor.getNodes()) {
                try {
                    await engine.fetch(node.id);
                } catch (e) {
                    // Silently ignore nodes without data() method
                }
            }
        };

        const updateNode = (nodeId) => {
            console.log(`[Editor] updateNode(${nodeId}) called`);
            area.update("node", nodeId);
            process();
        };

        const triggerDataFlow = () => {
            // Only trigger engine processing, do not force re-render of nodes
            // This is crucial for UI-heavy nodes like Color Control to prevent slider interruption
            process();
        };

        // Dynamic Context Menu Generator
        const getMenuOptions = () => {
            const nodes = nodeRegistry.getAll();
            const grouped = {};

            // Group by category
            nodes.forEach(def => {
                const category = def.category || "Other";
                if (!grouped[category]) grouped[category] = [];
                
                grouped[category].push([def.label, () => {
                    let node;
                    const callback = () => {
                        if (def.updateStrategy === 'dataflow') {
                            triggerDataFlow();
                        } else {
                            updateNode(node.id);
                        }
                    };
                    node = def.factory(callback);
                    return node;
                }]);
            });

            // Convert to Rete Context Menu format
            const menuItems = Object.entries(grouped).map(([category, items]) => {
                // Sort items alphabetically
                items.sort((a, b) => a[0].localeCompare(b[0]));
                return [category, items];
            });
            
            // Sort categories alphabetically
            menuItems.sort((a, b) => a[0].localeCompare(b[0]));

            return ContextMenuPresets.classic.setup(menuItems, { delay: 0 });
        };

        const contextMenu = new ContextMenuPlugin({
            items: (context, plugin) => {
                if (context === 'root') {
                    const createItems = getMenuOptions();
                    return createItems(context, plugin);
                }
                // Check if context is a registered node type
                const def = nodeRegistry.getByInstance(context);
                if (def) {
                    return {
                        searchBar: false,
                        list: [
                            {
                                label: 'Delete',
                                key: 'delete',
                                handler: async () => {
                                    const nodeId = context.id;
                                    const connections = editor.getConnections().filter(c => c.source === nodeId || c.target === nodeId);
                                    for (const conn of connections) {
                                        await editor.removeConnection(conn.id);
                                    }
                                    await editor.removeNode(nodeId);
                                }
                            }
                        ]
                    };
                }
                return { searchBar: false, list: [] };
            }
        });

        const selector = AreaExtensions.selector();
        AreaExtensions.selectableNodes(area, selector, {
            accumulating: AreaExtensions.accumulateOnCtrl()
        });

        // Register Custom Components
        render.addPreset(Presets.classic.setup({
            customize: {
                node(context) {
                    const def = nodeRegistry.getByInstance(context.payload);
                    if (def) {
                        return def.component;
                    }
                    return Presets.classic.Node;
                },
                control(context) {
                    if (context.payload instanceof ClassicPreset.Control) {
                        const control = context.payload;
                        if (control.constructor.name === "ButtonControl") return ButtonControlComponent;
                        if (control.constructor.name === "DropdownControl") return DropdownControlComponent;
                        if (control.constructor.name === "TextControl") return TextControlComponent;
                        if (control.constructor.name === "SwitchControl") return SwitchControlComponent;
                        if (control.constructor.name === "NumberControl") return NumberControlComponent;
                        if (control.constructor.name === "DeviceStateControl") return DeviceStateControlComponent;

                        // New Legacy Widgets
                        if (control instanceof StatusIndicatorControl) return StatusIndicatorControlComponent;
                        if (control instanceof ColorBarControl) return ColorBarControlComponent;
                        if (control instanceof PowerStatsControl) return PowerStatsControlComponent;
                    }
                    return Presets.classic.Control;
                }
            }
        }));

        // Use default context menu preset - styling is handled via App.css
        // The hasSubitems warning is a known Rete issue and is harmless
        render.addPreset(Presets.contextMenu.setup());
        connection.addPreset(ConnectionPresets.classic.setup());

        editor.use(area);
        area.use(connection);
        area.use(contextMenu);
        area.use(render);

        AreaExtensions.simpleNodesOrder(area);
        AreaExtensions.showInputControl(area);

        // Listen for node additions to set backdrop z-index
        editor.addPipe(context => {
            if (context.type === 'nodecreated') {
                const node = context.data;
                const def = nodeRegistry.getByInstance(node);
                if (def && def.isBackdrop) {
                    // Set z-index after the node view is created
                    setTimeout(() => {
                        const nodeView = area.nodeViews.get(node.id);
                        if (nodeView && nodeView.element) {
                            nodeView.element.style.zIndex = '-10';
                            console.log('[Backdrop] Set z-index on creation for:', node.id);
                        }
                    }, 50);
                }
            }
            return context;
        });

        // --- Pan While Connecting Implementation ---
        // Allows users to hold Ctrl while dragging a connection to pan the canvas
        let isConnectionDragging = false;
        let isPanningWhileConnecting = false;
        let lastPanPosition = { x: 0, y: 0 };

        // Listen for connection pick/drop events
        connection.addPipe(context => {
            if (context.type === 'connectionpick') {
                isConnectionDragging = true;
                console.log("[Editor] Connection pick - wire dragging started");
            } else if (context.type === 'connectiondrop') {
                isConnectionDragging = false;
                isPanningWhileConnecting = false;
                console.log("[Editor] Connection drop - wire dragging ended");
            }
            return context;
        });

        // Handle Ctrl+drag panning while connecting
        const onConnectionPanMove = (e) => {
            if (!isConnectionDragging) return;
            
            if (e.ctrlKey || e.metaKey) {
                if (!isPanningWhileConnecting) {
                    // Start panning
                    isPanningWhileConnecting = true;
                    lastPanPosition = { x: e.clientX, y: e.clientY };
                    container.style.cursor = 'grab';
                } else {
                    // Continue panning - calculate delta and translate
                    const dx = e.clientX - lastPanPosition.x;
                    const dy = e.clientY - lastPanPosition.y;
                    
                    if (dx !== 0 || dy !== 0) {
                        const transform = area.area.transform;
                        area.area.translate(transform.x + dx, transform.y + dy);
                        lastPanPosition = { x: e.clientX, y: e.clientY };
                    }
                }
            } else if (isPanningWhileConnecting) {
                // Released Ctrl, stop panning mode
                isPanningWhileConnecting = false;
                container.style.cursor = '';
            }
        };

        const onConnectionPanKeyUp = (e) => {
            if ((e.key === 'Control' || e.key === 'Meta') && isPanningWhileConnecting) {
                isPanningWhileConnecting = false;
                container.style.cursor = '';
            }
        };

        window.addEventListener('pointermove', onConnectionPanMove);
        window.addEventListener('keyup', onConnectionPanKeyUp);
        // --------------------------------------

        // --- Lasso Selection Implementation ---
        const selectionBox = document.createElement('div');
        selectionBox.classList.add('selection-box');
        container.appendChild(selectionBox);

        let isSelecting = false;
        let startPos = { x: 0, y: 0 };
        
        // Track lasso-selected nodes for group movement
        const lassoSelectedNodes = new Set();

        const onPointerDown = (e) => {
            // Enable Lasso on Ctrl + Left Click
            if ((e.ctrlKey || e.metaKey) && e.button === 0) {
                console.log("[Editor] Lasso start");
                e.stopPropagation(); 
                e.preventDefault();
                isSelecting = true;
                
                const rect = container.getBoundingClientRect();
                startPos = { 
                    x: e.clientX - rect.left, 
                    y: e.clientY - rect.top 
                };
                
                selectionBox.style.display = 'block';
                selectionBox.style.left = `${startPos.x}px`;
                selectionBox.style.top = `${startPos.y}px`;
                selectionBox.style.width = '0px';
                selectionBox.style.height = '0px';
                
                // Clear selection unless Shift is also held
                if (!e.shiftKey) {
                    // Clear visual selection
                    lassoSelectedNodes.forEach(nodeId => {
                        const view = area.nodeViews.get(nodeId);
                        if (view && view.element) {
                            view.element.classList.remove('selected');
                            view.element.style.outline = '';
                        }
                    });
                    lassoSelectedNodes.clear();
                    
                    // Also clear Rete's selector
                    if (selector && selector.entities) {
                        Array.from(selector.entities).forEach(entity => selector.remove(entity));
                    }
                }
            }
        };

        const onPointerMove = (e) => {
            if (!isSelecting) return;
            
            const rect = container.getBoundingClientRect();
            const currentX = e.clientX - rect.left;
            const currentY = e.clientY - rect.top;
            
            const left = Math.min(startPos.x, currentX);
            const top = Math.min(startPos.y, currentY);
            const width = Math.abs(currentX - startPos.x);
            const height = Math.abs(currentY - startPos.y);
            
            selectionBox.style.left = `${left}px`;
            selectionBox.style.top = `${top}px`;
            selectionBox.style.width = `${width}px`;
            selectionBox.style.height = `${height}px`;
        };

        const onPointerUp = (e) => {
            if (!isSelecting) return;
            console.log("[Editor] Lasso end");
            
            // Measure BEFORE hiding
            const boxRect = selectionBox.getBoundingClientRect();
            console.log("[Editor] Box Rect:", boxRect);

            isSelecting = false;
            selectionBox.style.display = 'none';
            
            // Skip if box is too small (just a click)
            if (boxRect.width < 5 && boxRect.height < 5) {
                console.log("[Editor] Selection box too small, ignoring");
                return;
            }
            
            let selectedCount = 0;
            const nodesToSelect = [];
            
            editor.getNodes().forEach(node => {
                const view = area.nodeViews.get(node.id);
                if (view && view.element) {
                    const nodeRect = view.element.getBoundingClientRect();
                    
                    // Check if node is FULLY contained within selection box
                    if (
                        boxRect.left <= nodeRect.left &&
                        boxRect.right >= nodeRect.right &&
                        boxRect.top <= nodeRect.top &&
                        boxRect.bottom >= nodeRect.bottom
                    ) {
                        nodesToSelect.push({ node, view });
                    }
                }
            });
            
            console.log(`[Editor] Found ${nodesToSelect.length} nodes in selection area`);
            
            // Select the nodes and track them for group movement
            nodesToSelect.forEach(({ node, view }) => {
                console.log(`[Editor] Selecting node ${node.id}`, view.element);
                
                // Track this node in our lasso selection
                lassoSelectedNodes.add(node.id);
                
                // Add selected class for visual feedback
                view.element.classList.add('selected');
                
                // Also try setting a direct style as backup
                view.element.style.outline = '3px solid #00f3ff';
                
                selectedCount++;
            });
            
            console.log(`[Editor] Selected ${selectedCount} nodes, tracked:`, Array.from(lassoSelectedNodes));
        };
        
        // Function to clear lasso selection
        const clearLassoSelection = () => {
            if (lassoSelectedNodes.size > 0) {
                console.log('[Editor] Clearing lasso selection');
                lassoSelectedNodes.forEach(nodeId => {
                    const view = area.nodeViews.get(nodeId);
                    if (view && view.element) {
                        view.element.classList.remove('selected');
                        view.element.style.outline = '';
                    }
                });
                lassoSelectedNodes.clear();
            }
        };
        
        // Click on empty canvas clears selection
        const onCanvasClick = (e) => {
            // Only clear if clicking directly on the canvas (not on a node)
            // and not during a lasso selection operation
            // and not holding Ctrl (which starts lasso)
            if (!e.ctrlKey && !e.metaKey && !isSelecting) {
                // Check if the click target is the canvas area itself
                const target = e.target;
                if (target === container || 
                    target.classList.contains('rete-area') ||
                    target.closest('[data-testid="area"]')) {
                    clearLassoSelection();
                }
            }
        };

        container.addEventListener('pointerdown', onPointerDown, { capture: true });
        container.addEventListener('click', onCanvasClick);
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        // --------------------------------------

        // Trigger process on connection changes
        editor.addPipe(context => {
            if (context.type === 'connectioncreated' || context.type === 'connectionremoved') {
                process();
            }
            return context;
        });

        // --- Backdrop Node Group Movement Logic ---
        // Track which nodes are being dragged and handle backdrop group movement
        let backdropDragState = {
            activeBackdropId: null,
            initialPositions: new Map(),
            isDragging: false,
            lastBackdropPos: null
        };
        
        // Guard to prevent infinite recursion during group moves
        let isGroupMoving = false;

        // Function to update which nodes are captured by which backdrops
        function updateBackdropCaptures() {
            const allNodes = editor.getNodes();
            const backdrops = allNodes.filter(n => {
                const def = nodeRegistry.getByInstance(n);
                return def && def.isBackdrop;
            });
            const regularNodes = allNodes.filter(n => {
                const def = nodeRegistry.getByInstance(n);
                return !def || !def.isBackdrop;
            });

            backdrops.forEach(backdrop => {
                const backdropView = area.nodeViews.get(backdrop.id);
                if (!backdropView) return;
                
                // Ensure backdrop z-index is always low
                if (backdropView.element) {
                    backdropView.element.style.zIndex = '-10';
                }
                
                const backdropPos = backdropView.position;
                const capturedNodes = [];
                const bWidth = backdrop.properties.width || 400;
                const bHeight = backdrop.properties.height || 300;

                regularNodes.forEach(node => {
                    const nodeView = area.nodeViews.get(node.id);
                    if (!nodeView) return;
                    
                    // Ensure regular nodes have positive z-index
                    if (nodeView.element) {
                        const currentZ = parseInt(nodeView.element.style.zIndex || '0', 10);
                        if (currentZ < 0) {
                            nodeView.element.style.zIndex = '1';
                        }
                    }
                    
                    const nodePos = nodeView.position;
                    const nodeWidth = node.width || 180;
                    const nodeHeight = node.height || 100;
                    
                    // Check if node center is inside backdrop bounds
                    const nodeCenterX = nodePos.x + nodeWidth / 2;
                    const nodeCenterY = nodePos.y + nodeHeight / 2;
                    
                    if (nodeCenterX >= backdropPos.x && 
                        nodeCenterX <= backdropPos.x + bWidth &&
                        nodeCenterY >= backdropPos.y && 
                        nodeCenterY <= backdropPos.y + bHeight) {
                        capturedNodes.push(node.id);
                    }
                });

                // Update the backdrop's captured nodes list
                const prevCount = backdrop.properties.capturedNodes.length;
                backdrop.properties.capturedNodes = capturedNodes;
                
                // Trigger re-render to show node count if changed
                if (prevCount !== capturedNodes.length && backdrop.changeCallback) {
                    backdrop.changeCallback();
                }
            });
        }

        // Function to ensure backdrop nodes are always behind other nodes
        function updateBackdropZIndex() {
            editor.getNodes().forEach(node => {
                const def = nodeRegistry.getByInstance(node);
                if (def && def.isBackdrop) {
                    const nodeView = area.nodeViews.get(node.id);
                    if (nodeView && nodeView.element) {
                        nodeView.element.style.zIndex = '-10';
                    }
                }
            });
        }

        area.addPipe(context => {
            // When a node is rendered, check if it's a backdrop and set z-index
            if (context.type === 'render' && context.data?.payload) {
                const payload = context.data.payload;
                const def = nodeRegistry.getByInstance(payload);
                if (def && def.isBackdrop) {
                    // Schedule z-index update for after render completes
                    setTimeout(() => {
                        const nodeView = area.nodeViews.get(payload.id);
                        if (nodeView && nodeView.element) {
                            nodeView.element.style.zIndex = '-10';
                            console.log('[Backdrop] Set z-index for:', payload.id);
                        }
                    }, 0);
                }
            }
            
            // Also update on rendered event
            if (context.type === 'rendered') {
                setTimeout(() => updateBackdropZIndex(), 10);
            }
            
            // Use nodetranslate for real-time movement tracking
            if (context.type === 'nodetranslate') {
                // Skip if we're already doing a group move (prevents infinite recursion)
                if (isGroupMoving) return context;
                
                const nodeId = context.data.id;
                const node = editor.getNode(nodeId);
                if (!node) return context;
                
                const newPos = context.data.position;
                const prevPos = context.data.previous;
                const deltaX = newPos.x - prevPos.x;
                const deltaY = newPos.y - prevPos.y;
                
                if (deltaX === 0 && deltaY === 0) return context;
                
                // Handle lasso-selected group movement
                if (lassoSelectedNodes.size > 1 && lassoSelectedNodes.has(nodeId)) {
                    isGroupMoving = true;
                    
                    // Move other selected nodes using area.translate for proper connection updates
                    const promises = [];
                    lassoSelectedNodes.forEach(selectedId => {
                        if (selectedId !== nodeId) {
                            const selectedView = area.nodeViews.get(selectedId);
                            if (selectedView) {
                                const newX = selectedView.position.x + deltaX;
                                const newY = selectedView.position.y + deltaY;
                                // Use area.translate which properly updates connections
                                promises.push(area.translate(selectedId, { x: newX, y: newY }));
                            }
                        }
                    });
                    
                    // Wait for all translations to complete, then reset flag
                    Promise.all(promises).then(() => {
                        isGroupMoving = false;
                    });
                    
                    return context; // Return early to avoid further processing
                }
                
                // Check if this is a backdrop node
                const def = nodeRegistry.getByInstance(node);
                
                if (def && def.isBackdrop) {
                    // If we just started dragging this backdrop, update captures first
                    if (backdropDragState.activeBackdropId !== nodeId) {
                        backdropDragState.activeBackdropId = nodeId;
                        backdropDragState.isDragging = true;
                        
                        // Update captures to get current nodes inside
                        updateBackdropCaptures();
                        console.log('[Backdrop] Started dragging, captured nodes:', node.properties.capturedNodes);
                    }
                    
                    // Move all captured nodes by the same delta
                    if (node.properties.capturedNodes.length > 0) {
                        isGroupMoving = true;
                        
                        const promises = [];
                        node.properties.capturedNodes.forEach(capturedId => {
                            if (!lassoSelectedNodes.has(capturedId)) {
                                const capturedView = area.nodeViews.get(capturedId);
                                if (capturedView) {
                                    const newX = capturedView.position.x + deltaX;
                                    const newY = capturedView.position.y + deltaY;
                                    promises.push(area.translate(capturedId, { x: newX, y: newY }));
                                }
                            }
                        });
                        
                        Promise.all(promises).then(() => {
                            isGroupMoving = false;
                        });
                        
                        return context;
                    }
                }
            }
            
            // Reset state when drag ends
            if (context.type === 'nodedragged') {
                console.log('[Backdrop] Drag ended, resetting state');
                backdropDragState.isDragging = false;
                backdropDragState.activeBackdropId = null;
                
                // Update captures after any node drag
                updateBackdropCaptures();
            }
            
            return context;
        });
        // --------------------------------------

        setEditorInstance(editor);
        setAreaInstance(area);
        setEngineInstance(engine);

        return {
            destroy: () => {
                container.removeEventListener('pointerdown', onPointerDown, { capture: true });
                container.removeEventListener('click', onCanvasClick);
                window.removeEventListener('pointermove', onPointerMove);
                window.removeEventListener('pointerup', onPointerUp);
                window.removeEventListener('pointermove', onConnectionPanMove);
                window.removeEventListener('keyup', onConnectionPanKeyUp);
                if (selectionBox.parentNode) selectionBox.parentNode.removeChild(selectionBox);
                area.destroy();
            },
            selector,
            editor,
            area,
            engine,
            process
        };
    }, []);

    useEffect(() => {
        // Load external plugins on startup
        loadPlugins().then(() => {
            console.log("[Editor] External plugins loaded");
        });

        const container = ref.current;
        if (!container) return;

        let editorInstance = null;
        let areaInstance = null;
        let engineInstance = null;
        let selectorInstance = null;

        let editorPromise = createEditor(container);

        editorPromise.then((result) => {
            editorInstance = result.editor;
            areaInstance = result.area;
            engineInstance = result.engine;
            selectorInstance = result.selector;
        });

        // Handle Key Down (Delete, Copy, Paste)
        const handleKeyDown = async (e) => {
            // Ignore inputs
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;

            console.log(`[Editor] KeyDown: ${e.code} (Ctrl: ${e.ctrlKey}, Meta: ${e.metaKey})`);

            // Delete
            if (e.code === 'Delete' || e.code === 'Backspace') {
                if (editorInstance && selectorInstance) {
                    if (selectorInstance.entities) {
                        const entities = Array.from(selectorInstance.entities);
                        for (const entity of entities) {
                            if (entity.label === 'node') {
                                const nodeId = entity.id;
                                const connections = editorInstance.getConnections().filter(c => c.source === nodeId || c.target === nodeId);
                                for (const conn of connections) {
                                    await editorInstance.removeConnection(conn.id);
                                }
                                await editorInstance.removeNode(nodeId);
                            }
                        }
                    }
                }
            }

            // Copy (Ctrl+C)
            if ((e.ctrlKey || e.metaKey) && e.code === 'KeyC') {
                if (!editorInstance || !selectorInstance) {
                    console.warn("[Editor] Copy failed: Editor or Selector not initialized");
                    return;
                }
                
                try {
                    const selectedNodes = [];
                    const selectedNodeIds = new Set();

                    // Check if selector has entities
                    if (!selectorInstance.entities || selectorInstance.entities.size === 0) {
                        console.log("[Editor] Nothing selected to copy (selector empty)");
                        return;
                    }

                    console.log(`[Editor] Processing ${selectorInstance.entities.size} entities for copy`);

                    for (const entity of selectorInstance.entities) {
                        // console.log("[Editor] Entity:", entity);
                        if (entity.label === 'node') {
                            const node = editorInstance.getNode(entity.id);
                            // console.log(`[Editor] Node lookup for ${entity.id}:`, node ? "Found" : "Not Found");
                            
                            if (node) {
                                // Serialize only safe data
                                selectedNodes.push({
                                    label: node.label,
                                    position: areaInstance.nodeViews.get(node.id)?.position || { x: 0, y: 0 },
                                    data: {
                                        id: node.id,
                                        properties: JSON.parse(JSON.stringify(node.properties || {})) // Deep copy properties
                                    }
                                });
                                selectedNodeIds.add(node.id);
                            }
                        } else {
                            console.log("[Editor] Skipping non-node entity:", entity.label);
                        }
                    }

                    if (selectedNodes.length === 0) {
                        console.log("[Editor] Nothing selected to copy (no nodes in selection)");
                        return;
                    }

                    const selectedConnections = [];
                    for (const conn of editorInstance.getConnections()) {
                        if (selectedNodeIds.has(conn.source) && selectedNodeIds.has(conn.target)) {
                            selectedConnections.push({
                                source: conn.source,
                                target: conn.target,
                                sourceOutput: conn.sourceOutput,
                                targetInput: conn.targetInput
                            });
                        }
                    }

                    const clipboardData = { nodes: selectedNodes, connections: selectedConnections };
                    localStorage.setItem('rete-clipboard', JSON.stringify(clipboardData));
                    console.log('Copied to clipboard:', clipboardData);
                } catch (err) {
                    console.error("[Editor] Copy failed:", err);
                }
            }

            // Paste (Ctrl+V)
            if ((e.ctrlKey || e.metaKey) && e.code === 'KeyV') {
                if (!editorInstance || !areaInstance || !engineInstance) {
                    console.warn("[Editor] Paste failed: Editor not initialized");
                    return;
                }

                const clipboardText = localStorage.getItem('rete-clipboard');
                if (!clipboardText) {
                    console.log("[Editor] Clipboard empty");
                    return;
                }

                try {
                    const data = JSON.parse(clipboardText);
                    const idMap = {}; // Old ID -> New ID

                    // Deselect current selection
                    if (selectorInstance) {
                        Array.from(selectorInstance.entities).forEach(entity => selectorInstance.remove(entity));
                    }

                    for (const nodeData of data.nodes) {
                        let node;
                        const def = nodeRegistry.getByLabel(nodeData.label);
                        
                        if (def) {
                            const updateCallback = () => {
                                if (areaInstance) areaInstance.update("node", node.id);
                                if (engineInstance && editorInstance) {
                                    engineInstance.reset();
                                    setTimeout(() => {
                                        editorInstance.getNodes().forEach(async (n) => {
                                            try { await engineInstance.fetch(n.id); } catch (e) { }
                                        });
                                    }, 0);
                                }
                            };

                            // Special handling for dataflow-only nodes (like Color Node)
                            // For paste, we generally want the full updateCallback to ensure everything is synced
                            // But if we want to respect the strategy:
                            const callback = () => {
                                if (def.updateStrategy === 'dataflow') {
                                    // For paste, we might still want area update initially?
                                    // The original code for paste used a custom callback for ColorNode that did NOT do area.update?
                                    // Actually, the original code for paste had a callback that did area.update.
                                    // Wait, let's check the original code I replaced.
                                    // Original paste code for ColorNode:
                                    /*
                                    else if (nodeData.label === "All-in-One Color Control") node = new AllInOneColorNode(() => {
                                        if (engineInstance) engineInstance.reset();
                                        if (engineInstance && editorInstance) { ... }
                                    });
                                    */
                                    // It did NOT call area.update("node", node.id).
                                    
                                    if (engineInstance) engineInstance.reset();
                                    if (engineInstance && editorInstance) {
                                        setTimeout(() => {
                                            editorInstance.getNodes().forEach(async (n) => {
                                                try { await engineInstance.fetch(n.id); } catch (e) { }
                                            });
                                        }, 0);
                                    }
                                } else {
                                    updateCallback();
                                }
                            };

                            node = def.factory(callback);
                        }

                        if (node) {
                            // Restore properties
                            if (typeof node.restore === 'function' && nodeData.data) {
                                node.restore(nodeData.data);
                            } else if (nodeData.data && nodeData.data.properties) {
                                Object.assign(node.properties, nodeData.data.properties);
                            }

                            await editorInstance.addNode(node);
                            
                            // Offset position slightly (e.g., +20px)
                            const newPos = { x: nodeData.position.x + 20, y: nodeData.position.y + 20 };
                            await areaInstance.translate(node.id, newPos);

                            idMap[nodeData.data.id] = node.id;
                            
                            // Select new node
                            if (selectorInstance) {
                                selectorInstance.add({
                                    id: node.id,
                                    label: 'node',
                                    translate: () => {},
                                    unmount: () => {}
                                }, true);
                            }
                        }
                    }

                    // Restore internal connections
                    for (const connData of data.connections) {
                        const newSourceId = idMap[connData.source];
                        const newTargetId = idMap[connData.target];

                        if (newSourceId && newTargetId) {
                            const source = editorInstance.getNode(newSourceId);
                            const target = editorInstance.getNode(newTargetId);
                            if (source && target) {
                                await editorInstance.addConnection(new ClassicPreset.Connection(
                                    source,
                                    connData.sourceOutput,
                                    target,
                                    connData.targetInput
                                ));
                            }
                        }
                    }
                    console.log('Pasted from clipboard');

                } catch (err) {
                    console.error("[Editor] Paste failed:", err);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            editorPromise.then((result) => result.destroy());
        };
    }, [createEditor]);

    const handleSave = async () => {
        if (!editorInstance || !areaInstance) return;
        try {
            const nodes = editorInstance.getNodes().map(n => {
                // Ensure properties are included in the saved data
                // Rete's default toJSON might not include custom 'properties'
                const serializedNode = typeof n.toJSON === 'function' ? n.toJSON() : { ...n };
                if (n.properties) {
                    serializedNode.properties = n.properties;
                }
                
                return {
                    id: n.id,
                    label: n.label,
                    position: areaInstance.nodeViews.get(n.id)?.position || { x: 0, y: 0 },
                    data: serializedNode
                };
            });
            const connections = editorInstance.getConnections().map(c => ({
                id: c.id,
                source: c.source,
                target: c.target,
                sourceOutput: c.sourceOutput,
                targetInput: c.targetInput
            }));
            const graphData = { nodes, connections };
            const jsonString = JSON.stringify(graphData, null, 2);

            // Save to localStorage for quick reload
            localStorage.setItem('saved-graph', jsonString);
            console.log('Graph saved to localStorage');

            // Try File System Access API (Modern Browsers)
            if (window.showSaveFilePicker) {
                try {
                    const handle = await window.showSaveFilePicker({
                        suggestedName: 'autotron_graph.json',
                        types: [{
                            description: 'AutoTron Graph',
                            accept: { 'application/json': ['.json'] },
                        }],
                    });
                    const writable = await handle.createWritable();
                    await writable.write(jsonString);
                    await writable.close();
                    console.log('Graph saved to file');
                    return;
                } catch (err) {
                    if (err.name === 'AbortError') return; // User cancelled
                    console.warn('File System Access API failed, falling back to download', err);
                }
            }

            // Fallback to download
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `autotron_graph_${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
            console.log('Graph saved via download');

        } catch (err) {
            console.error('Failed to save graph:', err);
        }
    };

    const handleLoad = async () => {
        if (!editorInstance || !areaInstance || !engineInstance) return;
        try {
            const saved = localStorage.getItem('saved-graph');
            if (!saved) {
                alert('No saved graph found');
                return;
            }
            const graphData = JSON.parse(saved);
            await handleClear();

            for (const nodeData of graphData.nodes) {
                let node;
                const def = nodeRegistry.getByLabel(nodeData.label);

                if (def) {
                    const updateCallback = () => {
                        if (areaInstance) areaInstance.update("node", nodeData.id);
                        if (engineInstance && editorInstance) {
                            engineInstance.reset();
                            setTimeout(() => {
                                editorInstance.getNodes().forEach(async (n) => {
                                    try {
                                        await engineInstance.fetch(n.id);
                                    } catch (e) { }
                                });
                            }, 0);
                        }
                    };
                    // For loading, we generally use the standard update callback
                    node = def.factory(updateCallback);
                }

                if (node) {
                    node.id = nodeData.id;

                    // Restore properties and state
                    if (typeof node.restore === 'function' && nodeData.data) {
                        node.restore(nodeData.data);
                    } else if (nodeData.data && nodeData.data.properties) {
                        Object.assign(node.properties, nodeData.data.properties);
                    }

                    await editorInstance.addNode(node);
                    await areaInstance.translate(node.id, nodeData.position);
                }
            }

            for (const connData of graphData.connections) {
                const source = editorInstance.getNode(connData.source);
                const target = editorInstance.getNode(connData.target);
                if (source && target) {
                    await editorInstance.addConnection(new ClassicPreset.Connection(
                        source,
                        connData.sourceOutput,
                        target,
                        connData.targetInput
                    ));
                }
            }
            console.log('Graph loaded from localStorage');
        } catch (err) {
            console.error('Failed to load graph:', err);
            alert('Failed to load graph');
        }
    };

    const handleClear = async () => {
        if (!editorInstance) return;
        try {
            for (const conn of editorInstance.getConnections()) {
                await editorInstance.removeConnection(conn.id);
            }
            for (const node of editorInstance.getNodes()) {
                await editorInstance.removeNode(node.id);
            }
            console.log('Graph cleared');
        } catch (err) {
            console.error('Failed to clear graph:', err);
        }
    };

    const handleExport = () => {
        if (!editorInstance || !areaInstance) return;
        try {
            const nodes = editorInstance.getNodes().map(n => {
                const serializedNode = typeof n.toJSON === 'function' ? n.toJSON() : { ...n };
                if (n.properties) {
                    serializedNode.properties = n.properties;
                }
                return {
                    id: n.id,
                    label: n.label,
                    position: areaInstance.nodeViews.get(n.id)?.position || { x: 0, y: 0 },
                    data: serializedNode
                };
            });
            const connections = editorInstance.getConnections().map(c => ({
                id: c.id,
                source: c.source,
                target: c.target,
                sourceOutput: c.sourceOutput,
                targetInput: c.targetInput
            }));
            const graphData = { nodes, connections };
            const blob = new Blob([JSON.stringify(graphData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `graph-${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
            console.log('Graph exported');
        } catch (err) {
            console.error('Failed to export graph:', err);
        }
    };

    const handleImport = async (graphData) => {
        if (!editorInstance || !areaInstance || !engineInstance) return;
        try {
            await handleClear();

            for (const nodeData of graphData.nodes) {
                let node;
                const def = nodeRegistry.getByLabel(nodeData.label);

                if (def) {
                    const updateCallback = () => {
                        if (areaInstance) areaInstance.update("node", nodeData.id);
                        if (engineInstance && editorInstance) {
                            engineInstance.reset();
                            setTimeout(() => {
                                editorInstance.getNodes().forEach(async (n) => {
                                    try {
                                        await engineInstance.fetch(n.id);
                                    } catch (e) { }
                                });
                            }, 0);
                        }
                    };
                    node = def.factory(updateCallback);
                }

                if (node) {
                    node.id = nodeData.id;

                    // Restore properties and state
                    if (typeof node.restore === 'function' && nodeData.data) {
                        node.restore(nodeData.data);
                    } else if (nodeData.data && nodeData.data.properties) {
                        Object.assign(node.properties, nodeData.data.properties);
                    }

                    await editorInstance.addNode(node);
                    await areaInstance.translate(node.id, nodeData.position);
                }
            }

            for (const connData of graphData.connections) {
                const source = editorInstance.getNode(connData.source);
                const target = editorInstance.getNode(connData.target);
                if (source && target) {
                    await editorInstance.addConnection(new ClassicPreset.Connection(
                        source,
                        connData.sourceOutput,
                        target,
                        connData.targetInput
                    ));
                }
            }
            console.log('Graph imported');
        } catch (err) {
            console.error('Failed to import graph:', err);
            alert('Failed to import graph');
        }
    };

    return (
        <div style={{ width: "100%", height: "100vh", position: "relative" }}>
            <div ref={ref} className="rete-editor" style={{ width: "100%", height: "100%", marginRight: "320px" }} />
            <Dock
                onSave={handleSave}
                onLoad={handleLoad}
                onClear={handleClear}
                onExport={handleExport}
                onImport={handleImport}
            />
            <ForecastPanel />
        </div>
    );
}
