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
import { loadPlugins } from "./registries/PluginLoader";

// Controls
import { ButtonControlComponent } from "./controls/ButtonControl";
import { DropdownControlComponent } from "./controls/DropdownControl";
import { TextControlComponent } from "./controls/TextControl";
import { SwitchControlComponent } from "./controls/SwitchControl";
import { NumberControlComponent } from "./controls/NumberControl";
import { DeviceStateControlComponent } from "./controls/DeviceStateControl";
import { StatusIndicatorControlComponent } from "./controls/StatusIndicatorControl";
import { ColorBarControlComponent } from "./controls/ColorBarControl";
import { PowerStatsControlComponent } from "./controls/PowerStatsControl";

import { CustomMenuItem } from "./CustomContextMenu";

export function Editor() {
    const ref = useRef(null);
    const [editorInstance, setEditorInstance] = useState(null);
    const [areaInstance, setAreaInstance] = useState(null);
    const [engineInstance, setEngineInstance] = useState(null);
    const [selectorInstance, setSelectorInstance] = useState(null);
    const programmaticMoveRef = useRef(false);
    const lassoSelectedNodesRef = useRef(new Set());
    const processImmediateRef = useRef(null);  // For graph load operations
    
    // Refs to hold current instances for keyboard handler (avoids stale closure issues)
    const editorRef = useRef(null);
    const areaRef = useRef(null);
    const selectorRef = useRef(null);
    
    // Track mouse position for paste location
    const mousePositionRef = useRef({ x: 0, y: 0 });
    
    // Track shift key state for accumulating selection
    const shiftKeyRef = useRef(false);
    
    // Undo stack for deleted nodes
    const undoStackRef = useRef([]);

    const createEditor = useCallback(async (container) => {
        const editor = new NodeEditor();
        const area = new AreaPlugin(container);
        const connection = new ConnectionPlugin();
        const render = new ReactPlugin({ createRoot });
        const engine = new DataflowEngine();

        // Register engine with editor
        editor.use(engine);

        // Process all nodes through the dataflow engine
        const process = async () => {
            engine.reset();
            for (const node of editor.getNodes()) {
                try {
                    await engine.fetch(node.id);
                } catch (e) {
                    // Silently ignore nodes without data() method
                }
            }
        };
        
        // Alias for compatibility - same as process() but named for clarity
        const processImmediate = process;

        const updateNode = (nodeId) => {
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
                        const name = control.constructor.name;
                        
                        // Match by constructor name (works after minification if names preserved)
                        if (name === "ButtonControl") return ButtonControlComponent;
                        if (name === "DropdownControl") return DropdownControlComponent;
                        if (name === "TextControl") return TextControlComponent;
                        if (name === "SwitchControl") return SwitchControlComponent;
                        if (name === "NumberControl") return NumberControlComponent;
                        if (name === "DeviceStateControl") return DeviceStateControlComponent;
                        if (name === "StatusIndicatorControl") return StatusIndicatorControlComponent;
                        if (name === "ColorBarControl") return ColorBarControlComponent;
                        if (name === "PowerStatsControl") return PowerStatsControlComponent;
                        
                        // Debug: log unmatched controls
                        console.warn('[Editor] Unmatched control type:', name, control);
                    }
                    return Presets.classic.Control;
                }
            }
        }));

        // Use custom menu item component to filter hasSubitems prop from DOM
        render.addPreset(Presets.contextMenu.setup({
            customize: {
                item() {
                    return CustomMenuItem;
                }
            }
        }));
        connection.addPreset(ConnectionPresets.classic.setup());

        editor.use(area);
        area.use(connection);
        area.use(contextMenu);
        area.use(render);

        // Set up node selection AFTER plugins are initialized
        AreaExtensions.selectableNodes(area, selector, {
            accumulating: AreaExtensions.accumulateOnCtrl()
        });

        AreaExtensions.simpleNodesOrder(area);
        // AreaExtensions.showInputControl(area); // Disabled - was causing empty input boxes

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
        
        // Use ref for lasso-selected nodes so keyboard handler can access it
        const lassoSelectedNodes = lassoSelectedNodesRef.current;

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
                
                // Also add to Rete's selector
                selector.add({
                    id: node.id,
                    label: 'node',
                    translate(dx, dy) {},
                    unselect() {
                        view.element.classList.remove('selected');
                        view.element.style.outline = '';
                    }
                }, false); // false = don't accumulate, we already handle that
                
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
                // Check if click was on a node - if so, don't clear (onNodeClick handles it)
                let clickedOnNode = false;
                for (const [nodeId, view] of area.nodeViews) {
                    if (view.element.contains(e.target)) {
                        clickedOnNode = true;
                        break;
                    }
                }
                
                if (!clickedOnNode) {
                    // Check if the click target is the canvas area itself
                    const target = e.target;
                    const isCanvas = target === container || 
                        target.classList.contains('rete-area') ||
                        target.closest('[data-testid="area"]');
                    if (isCanvas) {
                        clearLassoSelection();
                    }
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

        // Expose capture refresh helper so save/load flows can call it
        area.updateBackdropCaptures = updateBackdropCaptures;

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

        // Handle single-click node selection via Rete's nodepicked event
        area.addPipe(context => {
            if (context.type === 'nodepicked') {
                const nodeId = context.data.id;
                const node = editor.getNode(nodeId);
                
                // If this is a locked backdrop, prevent picking entirely
                if (node) {
                    const def = nodeRegistry.getByInstance(node);
                    if (def && def.isBackdrop && node.properties.locked) {
                        console.log('[Editor] Blocked pick on locked backdrop:', nodeId);
                        return; // Return undefined to block the event
                    }
                }
                
                console.log('[Editor] Node picked (Rete event):', nodeId, 'Shift held:', shiftKeyRef.current);
                
                // If Shift is NOT held and clicking a new node, clear previous selection
                if (!shiftKeyRef.current && !lassoSelectedNodes.has(nodeId)) {
                    // Clear previous selection visually
                    lassoSelectedNodes.forEach(prevNodeId => {
                        const view = area.nodeViews.get(prevNodeId);
                        if (view && view.element) {
                            view.element.classList.remove('selected');
                            view.element.style.outline = '';
                        }
                    });
                    lassoSelectedNodes.clear();
                }
                
                // Add to our selection tracking
                lassoSelectedNodes.add(nodeId);
                
                // Apply visual selection
                const view = area.nodeViews.get(nodeId);
                if (view && view.element) {
                    view.element.classList.add('selected');
                    view.element.style.outline = '3px solid #00f3ff';
                }
                
                console.log('[Editor] Selection after pick:', Array.from(lassoSelectedNodes));
            }
            return context;
        });

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
                            // Set pointer-events based on locked state
                            if (payload.properties.locked) {
                                nodeView.element.style.pointerEvents = 'none';
                            } else {
                                nodeView.element.style.pointerEvents = 'auto';
                            }
                            console.log('[Backdrop] Set z-index for:', payload.id, 'locked:', payload.properties.locked);
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
                if (programmaticMoveRef.current) return context;
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
                    // If backdrop is locked, prevent movement by returning previous position
                    if (node.properties.locked) {
                        // Block the movement by setting position back to previous
                        return {
                            ...context,
                            data: {
                                ...context.data,
                                position: context.data.previous
                            }
                        };
                    }
                    
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
                if (programmaticMoveRef.current) return context;
                console.log('[Backdrop] Drag ended, resetting state');
                backdropDragState.isDragging = false;
                backdropDragState.activeBackdropId = null;
                
                // Update captures after any node drag
                updateBackdropCaptures();
            }
            
            return context;
        });
        // --------------------------------------

        // Update both state and refs
        editorRef.current = editor;
        areaRef.current = area;
        selectorRef.current = selector;
        
        // Expose a global function for BackdropNode to update lock state on wrapper
        window.updateBackdropLockState = (nodeId, locked) => {
            const nodeView = area.nodeViews.get(nodeId);
            if (nodeView && nodeView.element) {
                nodeView.element.style.pointerEvents = locked ? 'none' : 'auto';
                console.log('[Editor] Updated backdrop lock state:', nodeId, 'locked:', locked);
            }
        };
        
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
            process,
            processImmediate  // For graph load operations
        };
    }, []);

    useEffect(() => {
        const container = ref.current;
        if (!container) return;

        let editorInstance = null;
        let areaInstance = null;
        let engineInstance = null;
        let selectorInstance = null;
        let editorPromise = null;

        // Load plugins FIRST, then create editor
        editorPromise = loadPlugins().then(() => {
            console.log("[Editor] External plugins loaded, now creating editor...");
            return createEditor(container);
        }).then((result) => {
            editorInstance = result.editor;
            areaInstance = result.area;
            engineInstance = result.engine;
            selectorInstance = result.selector;
            
            // Store in React state for other handlers
            setEditorInstance(result.editor);
            setAreaInstance(result.area);
            setEngineInstance(result.engine);
            setSelectorInstance(result.selector);
            
            // Store processImmediate in ref for graph loading
            processImmediateRef.current = result.processImmediate;
            
            return result;
        });

        return () => {
            editorPromise.then((result) => result.destroy());
        };
    }, [createEditor]);

    // Separate useEffect for keyboard handling - uses refs to avoid stale closures
    useEffect(() => {
        if (!editorInstance || !areaInstance || !selectorInstance) return;

        const handleKeyDown = async (e) => {
            // Ignore inputs
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;

            console.log(`[Editor] KeyDown: ${e.code} (Ctrl: ${e.ctrlKey}, Meta: ${e.metaKey})`);
            
            // Use refs to get current instances (avoids stale closure issues)
            const editor = editorRef.current;
            const area = areaRef.current;
            const selector = selectorRef.current;
            
            if (!editor || !area) {
                console.log('[Editor] No editor/area ref available');
                return;
            }

            // Get selected node IDs from both the selector and our lasso tracking
            const getSelectedNodeIds = () => {
                const nodeIds = new Set();
                
                // First, check Rete's selector
                if (selector && selector.entities) {
                    if (selector.entities instanceof Map) {
                        for (const [nodeId, metadata] of selector.entities) {
                            if (editor.getNode(nodeId)) {
                                nodeIds.add(nodeId);
                            }
                        }
                    }
                }
                
                // Also check our lasso selection ref (fallback)
                for (const nodeId of lassoSelectedNodesRef.current) {
                    const node = editor.getNode(nodeId);
                    console.log(`[Editor] Checking node ${nodeId}: exists=${!!node}`);
                    if (node) {
                        nodeIds.add(nodeId);
                    }
                }
                
                console.log(`[Editor] Found ${nodeIds.size} selected nodes:`, Array.from(nodeIds));
                return Array.from(nodeIds);
            };

            // Delete
            if (e.code === 'Delete' || e.code === 'Backspace') {
                console.log(`[Editor] Delete key pressed. lassoSelectedNodesRef.current size:`, lassoSelectedNodesRef.current.size);
                console.log(`[Editor] lassoSelectedNodesRef.current contents:`, Array.from(lassoSelectedNodesRef.current));
                const nodeIds = getSelectedNodeIds();
                console.log(`[Editor] Deleting ${nodeIds.length} nodes:`, nodeIds);
                
                if (nodeIds.length > 0) {
                    // Save state for undo before deleting
                    const deletedNodes = [];
                    const deletedConnections = [];
                    const nodeIdSet = new Set(nodeIds);
                    
                    // Capture all connections involving these nodes
                    for (const conn of editor.getConnections()) {
                        if (nodeIdSet.has(conn.source) || nodeIdSet.has(conn.target)) {
                            deletedConnections.push({
                                source: conn.source,
                                target: conn.target,
                                sourceOutput: conn.sourceOutput,
                                targetInput: conn.targetInput
                            });
                        }
                    }
                    
                    // Capture node data
                    for (const nodeId of nodeIds) {
                        const node = editor.getNode(nodeId);
                        if (node) {
                            deletedNodes.push({
                                id: nodeId,
                                label: node.label,
                                position: area.nodeViews.get(nodeId)?.position || { x: 0, y: 0 },
                                properties: JSON.parse(JSON.stringify(node.properties || {}))
                            });
                        }
                    }
                    
                    // Push to undo stack
                    undoStackRef.current.push({
                        type: 'delete',
                        nodes: deletedNodes,
                        connections: deletedConnections
                    });
                    console.log('[Editor] Saved undo state:', undoStackRef.current.length, 'items in stack');
                    
                    // Now perform the deletion
                    for (const nodeId of nodeIds) {
                        const connections = editor.getConnections().filter(c => c.source === nodeId || c.target === nodeId);
                        for (const conn of connections) {
                            await editor.removeConnection(conn.id);
                        }
                        await editor.removeNode(nodeId);
                        // Also remove from our tracking
                        lassoSelectedNodesRef.current.delete(nodeId);
                    }
                }
            }
            
            // Undo (Ctrl+Z)
            if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' && !e.shiftKey) {
                e.preventDefault();
                
                if (undoStackRef.current.length === 0) {
                    console.log('[Editor] Nothing to undo');
                    return;
                }
                
                const undoAction = undoStackRef.current.pop();
                console.log('[Editor] Undoing:', undoAction.type, undoAction.nodes.length, 'nodes');
                
                if (undoAction.type === 'delete') {
                    const idMap = {}; // Old ID -> New ID
                    
                    programmaticMoveRef.current = true;
                    try {
                        // Restore nodes
                        for (const nodeData of undoAction.nodes) {
                            const def = nodeRegistry.getByLabel(nodeData.label);
                            if (def) {
                                let node;
                                const updateCallback = () => {
                                    if (area) area.update("node", node.id);
                                    if (engineInstance && editor) {
                                        engineInstance.reset();
                                        setTimeout(() => {
                                            editor.getNodes().forEach(async (n) => {
                                                try { await engineInstance.fetch(n.id); } catch (e) { }
                                            });
                                        }, 0);
                                    }
                                };
                                
                                const callback = () => {
                                    if (def.updateStrategy === 'dataflow') {
                                        if (engineInstance) engineInstance.reset();
                                        if (engineInstance && editor) {
                                            setTimeout(() => {
                                                editor.getNodes().forEach(async (n) => {
                                                    try { await engineInstance.fetch(n.id); } catch (e) { }
                                                });
                                            }, 0);
                                        }
                                    } else {
                                        updateCallback();
                                    }
                                };
                                
                                node = def.factory(callback);
                                
                                // Restore properties
                                if (nodeData.properties) {
                                    Object.assign(node.properties, nodeData.properties);
                                }
                                
                                await editor.addNode(node);
                                await area.translate(node.id, nodeData.position);
                                
                                idMap[nodeData.id] = node.id;
                            }
                        }
                        
                        // Restore connections
                        for (const connData of undoAction.connections) {
                            const newSourceId = idMap[connData.source] || connData.source;
                            const newTargetId = idMap[connData.target] || connData.target;
                            
                            const source = editor.getNode(newSourceId);
                            const target = editor.getNode(newTargetId);
                            
                            if (source && target) {
                                try {
                                    await editor.addConnection(new ClassicPreset.Connection(
                                        source,
                                        connData.sourceOutput,
                                        target,
                                        connData.targetInput
                                    ));
                                } catch (err) {
                                    console.warn('[Editor] Could not restore connection:', err);
                                }
                            }
                        }
                        
                        console.log('[Editor] Undo complete - restored', undoAction.nodes.length, 'nodes');
                    } finally {
                        programmaticMoveRef.current = false;
                        area?.updateBackdropCaptures?.();
                    }
                }
            }

            // Copy (Ctrl+C)
            if ((e.ctrlKey || e.metaKey) && e.code === 'KeyC') {
                try {
                    const nodeIds = getSelectedNodeIds();

                    if (nodeIds.length === 0) {
                        console.log("[Editor] Nothing selected to copy");
                        return;
                    }

                    console.log(`[Editor] Copying ${nodeIds.length} nodes`);

                    const selectedNodes = [];
                    const selectedNodeIds = new Set(nodeIds);

                    for (const nodeId of nodeIds) {
                        const node = editor.getNode(nodeId);
                        if (node) {
                            selectedNodes.push({
                                label: node.label,
                                position: area.nodeViews.get(node.id)?.position || { x: 0, y: 0 },
                                data: {
                                    id: node.id,
                                    properties: JSON.parse(JSON.stringify(node.properties || {}))
                                }
                            });
                        }
                    }

                    if (selectedNodes.length === 0) {
                        console.log("[Editor] Nothing selected to copy (no nodes in selection)");
                        return;
                    }

                    const selectedConnections = [];
                    for (const conn of editor.getConnections()) {
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
                const clipboardText = localStorage.getItem('rete-clipboard');
                if (!clipboardText) {
                    console.log("[Editor] Clipboard empty");
                    return;
                }

                try {
                    const data = JSON.parse(clipboardText);
                    const idMap = {}; // Old ID -> New ID
                    
                    // Calculate paste position based on mouse location
                    // Convert screen coordinates to canvas coordinates
                    const container = areaRef.current?.container || ref.current;
                    const containerRect = container?.getBoundingClientRect() || { left: 0, top: 0 };
                    const transform = area.area.transform;
                    
                    // Mouse position relative to container, adjusted for canvas pan/zoom
                    const pasteX = (mousePositionRef.current.x - containerRect.left - transform.x) / transform.k;
                    const pasteY = (mousePositionRef.current.y - containerRect.top - transform.y) / transform.k;
                    
                    // Find the bounding box of copied nodes to center them at paste location
                    let minX = Infinity, minY = Infinity;
                    for (const nodeData of data.nodes) {
                        minX = Math.min(minX, nodeData.position.x);
                        minY = Math.min(minY, nodeData.position.y);
                    }

                    // Deselect current selection
                    if (selector && selector.entities) {
                        Array.from(selector.entities).forEach(entity => selector.remove(entity));
                    }

                    programmaticMoveRef.current = true;
                    try {
                        for (const nodeData of data.nodes) {
                            let node;
                            const def = nodeRegistry.getByLabel(nodeData.label);
                            
                            if (def) {
                                const updateCallback = () => {
                                    if (area) area.update("node", node.id);
                                    if (engineInstance && editor) {
                                        engineInstance.reset();
                                        setTimeout(() => {
                                            editor.getNodes().forEach(async (n) => {
                                                try { await engineInstance.fetch(n.id); } catch (e) { }
                                            });
                                        }, 0);
                                    }
                                };

                                const callback = () => {
                                    if (def.updateStrategy === 'dataflow') {
                                        if (engineInstance) engineInstance.reset();
                                        if (engineInstance && editor) {
                                            setTimeout(() => {
                                                editor.getNodes().forEach(async (n) => {
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
                                } else if (nodeData.data && nodeData.data.properties && node.properties) {
                                    Object.assign(node.properties, nodeData.data.properties);
                                }

                                await editor.addNode(node);
                                
                                // Position relative to paste location (mouse position)
                                // Offset from the group's top-left corner
                                const offsetX = nodeData.position.x - minX;
                                const offsetY = nodeData.position.y - minY;
                                const newPos = { x: pasteX + offsetX, y: pasteY + offsetY };
                                await area.translate(node.id, newPos);

                                idMap[nodeData.data.id] = node.id;
                                
                                // Select new node
                                if (selector) {
                                    selector.add({
                                        id: node.id,
                                        label: 'node',
                                        translate: () => {},
                                        unmount: () => {}
                                    }, true);
                                }
                            }
                        }
                    } finally {
                        programmaticMoveRef.current = false;
                        area?.updateBackdropCaptures?.();
                    }

                    // Restore internal connections
                    for (const connData of data.connections) {
                        const newSourceId = idMap[connData.source];
                        const newTargetId = idMap[connData.target];

                        if (newSourceId && newTargetId) {
                            const source = editor.getNode(newSourceId);
                            const target = editor.getNode(newTargetId);
                            if (source && target) {
                                await editor.addConnection(new ClassicPreset.Connection(
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
            
            // Home key - Reset viewport to origin
            if (e.code === 'Home') {
                e.preventDefault();
                if (area.area) {
                    area.area.zoom(1, 0, 0);
                    area.area.translate(0, 0);
                    console.log('[Editor] Viewport reset via Home key');
                }
            }
        };
        
        // Track mouse position for paste location
        const handleMouseMove = (e) => {
            mousePositionRef.current = { x: e.clientX, y: e.clientY };
        };
        
        // Track Shift key state for accumulating selection
        const handleKeyDownForShift = (e) => {
            if (e.key === 'Shift') {
                shiftKeyRef.current = true;
            }
        };
        
        const handleKeyUpForShift = (e) => {
            if (e.key === 'Shift') {
                shiftKeyRef.current = false;
            }
        };
        
        // Handle delete from Electron IPC (when Delete/Backspace pressed in Electron)
        const handleElectronDelete = () => {
            console.log('[Editor] Received delete from Electron IPC');
            // Simulate a Delete keydown event
            const fakeEvent = {
                code: 'Delete',
                ctrlKey: false,
                metaKey: false,
                target: { tagName: 'DIV', isContentEditable: false }
            };
            handleKeyDown(fakeEvent);
        };
        
        // Listen for Electron IPC delete command
        let cleanupElectronDelete = null;
        if (window.api && window.api.onDeleteKey) {
            cleanupElectronDelete = window.api.onDeleteKey(handleElectronDelete);
        }

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keydown', handleKeyDownForShift);
        window.addEventListener('keyup', handleKeyUpForShift);
        window.addEventListener('mousemove', handleMouseMove);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keydown', handleKeyDownForShift);
            window.removeEventListener('keyup', handleKeyUpForShift);
            window.removeEventListener('mousemove', handleMouseMove);
            if (cleanupElectronDelete) cleanupElectronDelete();
        };
    }, [editorInstance, areaInstance, engineInstance, selectorInstance]);

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
            
            // Save viewport state (zoom and pan position)
            const viewport = areaInstance.area?.transform 
                ? { x: areaInstance.area.transform.x, y: areaInstance.area.transform.y, k: areaInstance.area.transform.k }
                : { x: 0, y: 0, k: 1 };
            
            const graphData = { nodes, connections, viewport };
            const jsonString = JSON.stringify(graphData, null, 2);

            // Save to localStorage for quick reload
            try { if (jsonString.length < 2000000) { localStorage.removeItem('saved-graph'); localStorage.setItem('saved-graph', jsonString); } } catch(e) { console.warn('localStorage skipped'); }
            console.log('Graph saved to localStorage');

            // Also save to an Electron-accessible temp file so the desktop app can reload even if localStorage is empty
            if (window.api?.saveTempFile) {
                try {
                    await window.api.saveTempFile('autotron_graph.json', jsonString);
                    console.log('[handleSave] Saved temp file for Electron reload');
                } catch (err) {
                    console.warn('[handleSave] Failed to save temp file via Electron API', err);
                }
            }

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
        if (!editorInstance || !areaInstance || !engineInstance) {
            console.error('[handleLoad] Missing instances:', { 
                editor: !!editorInstance, 
                area: !!areaInstance, 
                engine: !!engineInstance 
            });
            return;
        }
        try {
            let saved = localStorage.getItem('saved-graph');

            // If localStorage is empty (common after Electron reload), try the Electron temp file
            if (!saved && window.api?.readTempFile) {
                try {
                    const result = await window.api.readTempFile('autotron_graph.json');
                    if (result?.success && result.content) {
                        saved = result.content;
                        console.log('[handleLoad] Loaded graph from Electron temp file');
                    }
                } catch (err) {
                    console.warn('[handleLoad] Failed to read Electron temp file', err);
                }
            }

            if (!saved) {
                alert('No saved graph found');
                return;
            }

            const graphData = JSON.parse(saved);
            console.log(`[handleLoad] Loading graph with ${graphData.nodes?.length} nodes`);
            
            // Clear existing graph first
            await handleClear();
            
            // Double-check clear worked
            const existingNodes = editorInstance.getNodes();
            if (existingNodes.length > 0) {
                console.error('[handleLoad] Clear did not work! Still have', existingNodes.length, 'nodes');
                // Force remove them
                for (const node of existingNodes) {
                    try {
                        await editorInstance.removeNode(node.id);
                    } catch (e) {
                        console.error('[handleLoad] Force remove failed:', e);
                    }
                }
            }
            
            programmaticMoveRef.current = true;
            try {
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
                        } else if (nodeData.data && nodeData.data.properties && node.properties) {
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
            } finally {
                programmaticMoveRef.current = false;
                areaInstance?.updateBackdropCaptures?.();
            }
            
            // CRITICAL: Process the entire graph immediately after loading
            // This ensures all node data flows are established before UI interaction
            if (processImmediateRef.current) {
                console.log('[handleLoad] Processing graph immediately...');
                await processImmediateRef.current();
                console.log('[handleLoad] Graph processing complete');
            }
            
            // Restore viewport state from saved graph (or default if not present)
            setTimeout(() => {
                if (areaInstance?.area) {
                    const viewport = graphData.viewport || { x: 0, y: 0, k: 1 };
                    // Set zoom level first, then translate
                    areaInstance.area.zoom(viewport.k || 1, 0, 0);
                    areaInstance.area.translate(viewport.x || 0, viewport.y || 0);
                    console.log('[Editor] Viewport restored:', viewport);
                    
                    // Ensure focus returns to the editor container (fixes Electron pan/zoom issues)
                    const container = areaInstance.container;
                    if (container) {
                        container.focus();
                        // Also blur any focused inputs that might be stealing events
                        if (document.activeElement && document.activeElement.tagName !== 'BODY') {
                            document.activeElement.blur();
                        }
                    }
                }
            }, 100);
            
            console.log('Graph loaded from localStorage');
        } catch (err) {
            console.error('Failed to load graph:', err);
            alert('Failed to load graph');
        }
    };

    const handleClear = async () => {
        if (!editorInstance) {
            console.warn('[handleClear] No editor instance!');
            return;
        }
        try {
            const connections = editorInstance.getConnections();
            const nodes = editorInstance.getNodes();
            console.log(`[handleClear] Removing ${connections.length} connections and ${nodes.length} nodes`);
            
            for (const conn of connections) {
                await editorInstance.removeConnection(conn.id);
            }
            for (const node of nodes) {
                await editorInstance.removeNode(node.id);
            }
            
            // Verify clear succeeded
            const remainingNodes = editorInstance.getNodes();
            console.log(`[handleClear] Complete. Remaining nodes: ${remainingNodes.length}`);
            
            if (remainingNodes.length > 0) {
                console.error('[handleClear] Failed to remove all nodes! Remaining:', remainingNodes.map(n => n.id));
            }
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
            
            // Include viewport state in export
            const viewport = areaInstance.area?.transform 
                ? { x: areaInstance.area.transform.x, y: areaInstance.area.transform.y, k: areaInstance.area.transform.k }
                : { x: 0, y: 0, k: 1 };
            
            const graphData = { nodes, connections, viewport };
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

            programmaticMoveRef.current = true;
            try {
                for (const nodeData of graphData.nodes) {
                    let node;
                    const def = nodeRegistry.getByLabel(nodeData.label);

                    if (!def) {
                        console.warn(`[handleImport] No definition found for node label: "${nodeData.label}"`);
                        continue;
                    }

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
                        } else if (nodeData.data && nodeData.data.properties && node.properties) {
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
                    } else {
                        console.warn(`[handleImport] Connection skipped - missing node: source=${connData.source} (${!!source}), target=${connData.target} (${!!target})`);
                    }
                }
            } finally {
                programmaticMoveRef.current = false;
                areaInstance?.updateBackdropCaptures?.();
            }
            
            // Process the graph after import
            if (processImmediateRef.current) {
                await processImmediateRef.current();
            }
            
            // Restore viewport state from imported graph (or default if not present)
            setTimeout(() => {
                if (areaInstance?.area) {
                    const viewport = graphData.viewport || { x: 0, y: 0, k: 1 };
                    areaInstance.area.zoom(viewport.k || 1, 0, 0);
                    areaInstance.area.translate(viewport.x || 0, viewport.y || 0);
                    console.log('[handleImport] Viewport restored:', viewport);
                }
            }, 100);
            
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
