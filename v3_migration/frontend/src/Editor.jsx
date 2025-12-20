import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { NodeEditor, ClassicPreset } from "rete";
import { AreaPlugin, AreaExtensions } from "rete-area-plugin";
import { ConnectionPlugin, Presets as ConnectionPresets } from "rete-connection-plugin";
import { ReactPlugin, Presets } from "rete-react-plugin";
// Removed slow rete-context-menu-plugin - using FastContextMenu instead
import { DataflowEngine } from "rete-engine";
import "./sockets"; // Import socket patch globally


// Debug mode - set to true to enable verbose console logging
window.EDITOR_DEBUG = false;
const EDITOR_DEBUG = window.EDITOR_DEBUG;
const debug = (...args) => EDITOR_DEBUG && console.debug('[Editor]', ...args);

import { Dock } from "./ui/Dock";
import { ForecastPanel } from "./ui/ForecastPanel";
import { FavoritesPanel } from "./ui/FavoritesPanel";
import { SaveModal } from "./ui/SaveModal";
import { FastContextMenu } from "./FastContextMenu";
import { validateGraph, repairGraph } from "./utils/graphValidation";
import { apiUrl } from "./utils/apiBase";

// Custom Socket Component - adds data-socket-type and title for CSS styling
const CustomSocket = React.memo(({ data, socketKey, side }) => {
    // Get socket type name from the socket object
    const socketType = data?.name || 'any';
    
    // Determine semantic type from socket key (hsv_in, hsv_out, scene_hsv, etc.)
    let semanticType = socketType;
    if (socketKey && typeof socketKey === 'string') {
        const keyLower = socketKey.toLowerCase();
        if (keyLower.includes('hsv') || keyLower.includes('color')) {
            semanticType = 'hsv_info';
        } else if (keyLower.includes('trigger') || keyLower.includes('enable') || keyLower.includes('active')) {
            semanticType = 'boolean';
        } else if (keyLower.includes('light') || keyLower.includes('device')) {
            semanticType = 'light_info';
        }
    }
    
    // Build title for tooltip and CSS fallback matching
    const title = `${socketKey || 'socket'} (${semanticType})`;
    
    // Only set structural styles - let CSS handle colors via data-socket-type attribute
    return React.createElement('div', {
        className: 'rete-socket',
        'data-socket-type': semanticType,
        title: title
    });
});

// Registry
import { nodeRegistry } from "./registries/NodeRegistry";
import { loadPlugins } from "./registries/PluginLoader";

// Controls
import { ButtonControlComponent } from "./controls/ButtonControl";
import { DropdownControlComponent } from "./controls/DropdownControl";
import { TextControlComponent } from "./controls/TextControl";
import { SwitchControlComponent } from "./controls/SwitchControl";
import { NumberControlComponent } from "./controls/NumberControl";
import { InputControlComponent } from "./controls/InputControl";
import { DeviceStateControlComponent } from "./controls/DeviceStateControl";
import { StatusIndicatorControlComponent } from "./controls/StatusIndicatorControl";
import { ColorBarControlComponent } from "./controls/ColorBarControl";
import { PowerStatsControlComponent } from "./controls/PowerStatsControl";

export function Editor() {
    const ref = useRef(null);
    const [editorInstance, setEditorInstance] = useState(null);
    const [areaInstance, setAreaInstance] = useState(null);
    const [engineInstance, setEngineInstance] = useState(null);
    const [selectorInstance, setSelectorInstance] = useState(null);

    const [dockMergedIntoForecast, setDockMergedIntoForecast] = useState(() => {
        try {
            return localStorage.getItem('dockMergedIntoForecast') === 'true';
        } catch {
            return false;
        }
    });
    const dockOverlaySlotRef = useRef(null);
    const forecastDockSlotRef = useRef(null);

    useEffect(() => {
        try {
            localStorage.setItem('dockMergedIntoForecast', String(dockMergedIntoForecast));
        } catch {
            // ignore (e.g., storage blocked)
        }
    }, [dockMergedIntoForecast]);
    const programmaticMoveRef = useRef(false);
    const lassoSelectedNodesRef = useRef(new Set());
    const processImmediateRef = useRef(null);  // For graph load operations
    const loadingRef = useRef(false);  // Prevents cascading updates during graph load
    
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
    
    // Fast context menu state
    const [contextMenu, setContextMenu] = useState({
        visible: false,
        position: { x: 0, y: 0 },
        items: [],
        nodeContext: null  // If right-clicking on a node
    });

    const FAVORITES_WIDTH = 180;

    const FAVORITES_STORAGE_KEY = 'favoriteNodes';
    const [favoriteGroups, setFavoriteGroups] = useState(() => {
        try {
            const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : null;

            const normalizeLabels = (arr) => {
                const out = [];
                for (const v of Array.isArray(arr) ? arr : []) {
                    if (typeof v !== 'string') continue;
                    const label = v.trim();
                    if (!label) continue;
                    if (!out.includes(label)) out.push(label);
                }
                return out;
            };

            // Legacy format: string[]
            if (Array.isArray(parsed)) {
                const labels = normalizeLabels(parsed);
                return labels.length ? [{ category: 'Other', labels }] : [];
            }

            // New format: { version: 2, groups: [{category, labels}] }
            const maybeGroups =
                Array.isArray(parsed?.groups) ? parsed.groups :
                Array.isArray(parsed?.favoriteGroups) ? parsed.favoriteGroups :
                Array.isArray(parsed) ? parsed :
                null;

            if (!maybeGroups) return [];

            const normalizedGroups = [];
            for (const g of maybeGroups) {
                const category = (g?.category || 'Other').toString().trim() || 'Other';
                const labels = normalizeLabels(g?.labels);
                if (labels.length === 0) continue;
                normalizedGroups.push({ category, labels });
            }

            return normalizedGroups;
        } catch {
            return [];
        }
    });
    const favoritesPanelRef = useRef(null);
    const [favoritesDropActive, setFavoritesDropActive] = useState(false);
    const favoritesDragRef = useRef(null);
    
    // SaveModal state for HA ingress mode
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [currentGraphDataForSave, setCurrentGraphDataForSave] = useState(null);

    useEffect(() => {
        try {
            localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify({ version: 2, groups: favoriteGroups }));
        } catch {
            // ignore
        }
    }, [favoriteGroups]);

    const addFavoriteLabel = useCallback((label) => {
        const normalized = (label || '').toString().trim();
        if (!normalized) return;
        const def = nodeRegistry.getByLabel(normalized);
        const category = (def?.category || 'Other').toString().trim() || 'Other';

        setFavoriteGroups(prev => {
            // Already exists anywhere?
            for (const g of prev) {
                if (Array.isArray(g?.labels) && g.labels.includes(normalized)) return prev;
            }

            const next = prev.map(g => ({ category: g.category, labels: [...g.labels] }));
            const idx = next.findIndex(g => g.category === category);
            if (idx === -1) {
                next.push({ category, labels: [normalized] });
            } else {
                next[idx].labels.push(normalized);
            }
            return next;
        });
    }, []);

    const removeFavoriteLabel = useCallback((label) => {
        const normalized = (label || '').toString().trim();
        if (!normalized) return;
        setFavoriteGroups(prev => {
            const next = [];
            for (const g of prev) {
                const labels = (g?.labels || []).filter(l => l !== normalized);
                if (labels.length === 0) continue;
                next.push({ category: g.category, labels });
            }
            return next;
        });
    }, []);

    const createNodeFromLabelAtCenter = useCallback(async (label) => {
        const container = ref.current;
        const editor = editorRef.current;
        const area = areaRef.current;
        if (!container || !editor || !area) return;

        const rect = container.getBoundingClientRect();
        const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };

        // Prefer using the same handler objects as the context menu (same callback / update strategy behavior)
        try {
            const getMenuItems = window._t2GetMenuItems;
            if (typeof getMenuItems === 'function') {
                const items = getMenuItems();
                for (const cat of items || []) {
                    for (const sub of cat.subitems || []) {
                        if (sub.label === label && typeof sub.handler === 'function') {
                            await sub.handler(center);
                            return;
                        }
                    }
                }
            }
        } catch (err) {
            console.warn('[Favorites] Failed to create via context handlers:', err);
        }

        // Fallback: construct directly by label
        const def = nodeRegistry.getByLabel(label);
        if (!def) return;
        const callback = () => {
            try {
                // Minimal: update the node visuals; engine processing is triggered elsewhere
                // (Context-menu path is preferred and will be used in normal operation.)
                // eslint-disable-next-line no-unused-expressions
                processImmediateRef.current?.();
            } catch {}
        };

        try {
            const node = def.factory(callback);
            await editor.addNode(node);
            const transform = area.area.transform;
            const editorX = (center.x - transform.x) / transform.k;
            const editorY = (center.y - transform.y) / transform.k;
            await area.translate(node.id, { x: editorX, y: editorY });
            
            // Refresh group navigation buttons (in case a Backdrop was created)
            if (label === 'Backdrop' && window.refreshBackdropGroups) {
                window.refreshBackdropGroups();
            }
        } catch (err) {
            console.warn('[Favorites] Fallback create failed:', err);
        }
    }, []);

    // Drag-to-favorite is implemented inside AreaPlugin pipes (nodetranslate/nodedragged)
    // to avoid pointer-capture edge cases.

    // If plugins change, drop favorites that no longer exist
    useEffect(() => {
        try {
            const defs = nodeRegistry.getAll();
            if (defs.length === 0) return;

            const labelToCategory = new Map();
            for (const def of defs) {
                if (def?.label) labelToCategory.set(def.label, (def.category || 'Other').toString().trim() || 'Other');
            }

            setFavoriteGroups(prev => {
                const order = [];
                const byCategory = new Map();

                const add = (category, label) => {
                    if (!byCategory.has(category)) {
                        byCategory.set(category, []);
                        order.push(category);
                    }
                    const arr = byCategory.get(category);
                    if (!arr.includes(label)) arr.push(label);
                };

                for (const g of prev) {
                    for (const label of g?.labels || []) {
                        const actualCategory = labelToCategory.get(label);
                        if (!actualCategory) continue; // plugin missing
                        add(actualCategory, label);
                    }
                }

                return order.map(category => ({ category, labels: byCategory.get(category) })).filter(g => g.labels.length > 0);
            });
        } catch {
            // ignore
        }
    }, [editorInstance]);

    const createEditor = useCallback(async (container) => {
        // Wait for container to have proper dimensions (fixes race condition in Electron)
        // This ensures the AreaPlugin initializes with correct viewport size
        await new Promise((resolve) => {
            const checkReady = () => {
                const rect = container.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    resolve();
                } else {
                    requestAnimationFrame(checkReady);
                }
            };
            // Use requestAnimationFrame to ensure DOM is laid out
            requestAnimationFrame(checkReady);
        });
        
        const editor = new NodeEditor();
        const area = new AreaPlugin(container);
        const connection = new ConnectionPlugin();
        const render = new ReactPlugin({ createRoot });
        const engine = new DataflowEngine();

        // Register engine with editor
        editor.use(engine);

        // Performance monitoring - type window._t2PerfStats in console to see
        let processCallCount = 0;
        let processSkipCount = 0;
        let lastPerfReset = Date.now();
        window._t2PerfStats = () => {
            const elapsed = (Date.now() - lastPerfReset) / 1000;
            console.log(`[Perf] In ${elapsed.toFixed(1)}s: ${processCallCount} process calls, ${processSkipCount} skipped (${(processCallCount/elapsed).toFixed(1)}/sec)`);
            return { calls: processCallCount, skipped: processSkipCount, perSecond: processCallCount/elapsed };
        };
        window._t2PerfReset = () => { processCallCount = 0; processSkipCount = 0; lastPerfReset = Date.now(); console.log('[Perf] Stats reset'); };

        // Debounced process to prevent excessive graph evaluation
        let processTimeout = null;
        
        // Calculate dynamic debounce based on node count - larger graphs need more batching time
        const getDebounceTime = () => {
            const nodeCount = editor?.getNodes?.()?.length || 0;
            // Base: 16ms for <50 nodes, up to 100ms for 200+ nodes
            if (nodeCount < 50) return 16;
            if (nodeCount < 100) return 32;
            if (nodeCount < 150) return 50;
            return 100; // Very large graphs get 100ms debounce
        };
        
        // Process all nodes through the dataflow engine (debounced version)
        // Uses trailing-edge debounce: waits for quiet period, then processes
        let processRunning = false;  // True while actually processing nodes
        
        const process = async () => {
            // If actively processing, skip (prevents re-entry during async work)
            if (processRunning) {
                processSkipCount++;
                return;
            }
            
            // If timeout already pending, let it handle this (debounce batching)
            if (processTimeout) {
                return;
            }
            
            processCallCount++;
            
            // Schedule process after debounce delay (batches rapid calls)
            const debounceMs = getDebounceTime();
            processTimeout = setTimeout(async () => {
                processTimeout = null;
                processRunning = true;
                
                try {
                    const nodes = editor.getNodes();
                    const connections = editor.getConnections();
                    // One-time debug log - press F12 and type: window._debugProcess = true
                    const shouldDebug = window._debugProcess;
                    if (shouldDebug) {
                        console.log('[Editor] process() - nodes:', nodes.map(n => `${n.id}:${n.label}`));
                        console.log('[Editor] process() - connections:', connections.map(c => `${c.source}:${c.sourceOutput} -> ${c.target}:${c.targetInput}`));
                        window._debugProcess = false; // Only log once
                    }
                    engine.reset();
                    for (const node of nodes) {
                        try {
                            await engine.fetch(node.id);
                        } catch (e) {
                            // Silently ignore fetch errors (cancelled, no data method, etc.)
                        }
                    }
                } finally {
                    processRunning = false;
                }
            }, debounceMs); // Dynamic: 16ms for small graphs, up to 100ms for large ones
        };
        
        // Immediate process for when we need synchronous graph evaluation (e.g., after load)
        const processImmediate = async () => {
            // Prevent re-entry while already running
            if (processRunning) return;
            
            // Cancel any pending debounced process
            if (processTimeout) {
                clearTimeout(processTimeout);
                processTimeout = null;
            }
            
            processRunning = true;
            try {
                engine.reset();
                for (const node of editor.getNodes()) {
                    try {
                        await engine.fetch(node.id);
                    } catch (e) {
                        // Silently ignore nodes without data() method
                    }
                }
            } finally {
                processRunning = false;
            }
        };

        // Debounced node update map to batch rapid updates to the same node
        const pendingNodeUpdates = new Set();
        let nodeUpdateTimeout = null;
        
        const updateNode = (nodeId) => {
            pendingNodeUpdates.add(nodeId);
            
            if (!nodeUpdateTimeout) {
                nodeUpdateTimeout = setTimeout(() => {
                    nodeUpdateTimeout = null;
                    // Update all pending nodes
                    pendingNodeUpdates.forEach(id => {
                        area.update("node", id);
                    });
                    pendingNodeUpdates.clear();
                    process();
                }, 16); // ~60fps batching
            }
        };
        
        // Immediate update for when batching is not desired
        const updateNodeImmediate = (nodeId) => {
            area.update("node", nodeId);
            processImmediate();
        };

        const triggerDataFlow = () => {
            // Only trigger engine processing, do not force re-render of nodes
            // This is crucial for UI-heavy nodes like Color Control to prevent slider interruption
            process();
        };

        // Dynamic Context Menu Generator - returns items for FastContextMenu
        const getMenuItems = () => {
            const nodes = nodeRegistry.getAll();
            const grouped = {};

            // Group by category
            nodes.forEach(def => {
                const category = def.category || "Other";
                if (!grouped[category]) grouped[category] = [];
                
                grouped[category].push({
                    label: def.label,
                    order: def.order,  // Include order for sorting
                    description: def.description,  // Tooltip in context menu
                    handler: async (position) => {
                        let node;
                        const callback = () => {
                            if (def.updateStrategy === 'dataflow') {
                                triggerDataFlow();
                            } else {
                                updateNode(node.id);
                            }
                        };
                        node = def.factory(callback);
                        await editor.addNode(node);
                        
                        // Position the node at click location (converted to editor coordinates)
                        const transform = area.area.transform;
                        const editorX = (position.x - transform.x) / transform.k;
                        const editorY = (position.y - transform.y) / transform.k;
                        await area.translate(node.id, { x: editorX, y: editorY });
                        
                        // Refresh group navigation buttons (in case a Backdrop was created)
                        if (def.label === 'Backdrop' && window.refreshBackdropGroups) {
                            window.refreshBackdropGroups();
                        }
                    }
                });
            });

            // Convert to FastContextMenu format with sorted categories
            // Get category icons from theme if available
            const categoryThemes = window.T2Controls?.THEME?.categories || {};
            const menuItems = Object.entries(grouped)
                .map(([category, items]) => ({
                    label: category,
                    icon: categoryThemes[category]?.icon || '',
                    // Sort by order first (lower = first), then alphabetically
                    subitems: items.sort((a, b) => {
                        // Items with order come before items without
                        const orderA = a.order ?? 999;
                        const orderB = b.order ?? 999;
                        if (orderA !== orderB) return orderA - orderB;
                        return a.label.localeCompare(b.label);
                    })
                }))
                .sort((a, b) => a.label.localeCompare(b.label));

            return menuItems;
        };

        // Store menu generator for use in right-click handler
        window._t2GetMenuItems = getMenuItems;
        window._t2Editor = editor;
        window._t2Area = area;
        window._t2Process = process;  // Expose for debugging
        window._t2ProcessImmediate = processImmediate;  // Expose for debugging
        window._t2Engine = engine;  // Expose for debugging

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
                socket(context) {
                    // Return a wrapper that passes socket key and side to CustomSocket
                    const socketKey = context.key;
                    const side = context.side;
                    
                    // Return a component factory that wraps CustomSocket with context
                    return function SocketWithContext({ data }) {
                        return React.createElement(CustomSocket, {
                            data: data,
                            socketKey: socketKey,
                            side: side
                        });
                    };
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
                        if (name === "InputControl") return InputControlComponent;
                        if (name === "DeviceStateControl") return DeviceStateControlComponent;
                        if (name === "StatusIndicatorControl") return StatusIndicatorControlComponent;
                        if (name === "ColorBarControl") return ColorBarControlComponent;
                        if (name === "PowerStatsControl") return PowerStatsControlComponent;
                        
                        // Silently use default for unmatched controls (avoid console flood)
                    }
                    return Presets.classic.Control;
                }
            }
        }));

        // Connection preset for classic connection rendering
        connection.addPreset(ConnectionPresets.classic.setup());

        editor.use(area);
        area.use(connection);
        // Removed slow rete-context-menu-plugin - using FastContextMenu instead
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
                            debug('[Backdrop] Set z-index on creation for:', node.id);
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
                debug(" Connection pick - wire dragging started");
            } else if (context.type === 'connectiondrop') {
                isConnectionDragging = false;
                isPanningWhileConnecting = false;
                debug(" Connection drop - wire dragging ended");
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

        // --- Shift+Drag Pan While Dragging Node Implementation ---
        // Allows users to hold Shift while dragging a node to pan the canvas
        // This is useful for moving a node across large distances without zooming out
        let isNodeDragging = false;
        let isPanningWhileDragging = false;
        let draggedNodeId = null;
        
        // Track spacebar state locally within createEditor scope
        // This ensures we capture Space regardless of other event handling
        let localSpaceKeyHeld = false;
        let lastNodeDragPanPos = { x: 0, y: 0 };
        // Track total pan offset during Space hold (in screen pixels)
        let panAccumulatorScreen = { x: 0, y: 0 };
        
        const onLocalSpaceDown = (e) => {
            if (e.code === 'Space') {
                // Only activate pan mode if we're currently dragging a node
                // This preserves normal Space behavior for text inputs, etc.
                if (isNodeDragging && draggedNodeId) {
                    localSpaceKeyHeld = true;
                    // Reset pan accumulator when starting
                    panAccumulatorScreen = { x: 0, y: 0 };
                    // Prevent default to avoid scrolling only when panning
                    e.preventDefault();
                }
            }
        };
        const onLocalSpaceUp = (e) => {
            if (e.code === 'Space') {
                localSpaceKeyHeld = false;
                if (isPanningWhileDragging && draggedNodeId) {
                    // When releasing Space, we need to update the node's world position
                    // to account for the canvas movement during panning.
                    // The node visually stayed in place (screen coords), but the canvas moved.
                    // So we need to adjust the node's world position by the inverse of the pan.
                    const nodeView = area.nodeViews.get(draggedNodeId);
                    if (nodeView) {
                        const transform = area.area.transform;
                        // Convert accumulated screen pan to world coordinates
                        const worldDx = panAccumulatorScreen.x / transform.k;
                        const worldDy = panAccumulatorScreen.y / transform.k;
                        // Move node in world coords to match where it visually is now
                        const newPos = {
                            x: nodeView.position.x - worldDx,
                            y: nodeView.position.y - worldDy
                        };
                        programmaticMoveRef.current = true;
                        area.translate(draggedNodeId, newPos).finally(() => {
                            programmaticMoveRef.current = false;
                        });
                    }
                    isPanningWhileDragging = false;
                    container.style.cursor = '';
                }
            }
        };
        
        // Use pointermove on container (capture phase) to pan while dragging with Space held
        // When panning, we move the canvas. Node stays in place because nodetranslate is blocked.
        const onNodeDragPanPointerMove = (e) => {
            if (!isNodeDragging || !draggedNodeId) return;
            
            if (localSpaceKeyHeld) {
                if (!isPanningWhileDragging) {
                    // Start panning mode
                    isPanningWhileDragging = true;
                    lastNodeDragPanPos = { x: e.clientX, y: e.clientY };
                    panAccumulatorScreen = { x: 0, y: 0 };
                    container.style.cursor = 'grab';
                } else {
                    // Continue panning - just pan the canvas
                    // The node translation is blocked in the nodetranslate handler
                    const dx = e.clientX - lastNodeDragPanPos.x;
                    const dy = e.clientY - lastNodeDragPanPos.y;
                    
                    if (dx !== 0 || dy !== 0) {
                        const transform = area.area.transform;
                        area.area.translate(transform.x + dx, transform.y + dy);
                        // Accumulate the pan offset
                        panAccumulatorScreen.x += dx;
                        panAccumulatorScreen.y += dy;
                        lastNodeDragPanPos = { x: e.clientX, y: e.clientY };
                    }
                }
            } else if (isPanningWhileDragging) {
                // Space was released, stop panning mode but continue normal drag
                isPanningWhileDragging = false;
                container.style.cursor = '';
            }
        };
        
        window.addEventListener('keydown', onLocalSpaceDown, true);
        window.addEventListener('keyup', onLocalSpaceUp, true);
        container.addEventListener('pointermove', onNodeDragPanPointerMove, true);
        // --------------------------------------

        // --- Lasso Selection Implementation ---
        const selectionBox = document.createElement('div');
        selectionBox.classList.add('selection-box');
        container.appendChild(selectionBox);

        let isSelecting = false;
        let startPos = { x: 0, y: 0 };
        
        // Use ref for lasso-selected nodes so keyboard handler can access it
        const lassoSelectedNodes = lassoSelectedNodesRef.current;
        
        // Safety function to reset drag/selection state (prevents frozen UI)
        // Note: This is a partial reset, the full resetAllDragStates is defined after backdrop state
        const resetDragState = () => {
            if (isSelecting) {
                debug(' Safety reset: clearing stuck lasso selection');
                isSelecting = false;
                selectionBox.style.display = 'none';
            }
        };
        
        // Reset state when window loses focus (e.g., Alt+Tab during drag)
        // Uses partial reset here; full reset happens via resetAllDragStates later
        const onWindowBlur = () => {
            resetDragState();
            // Will be enhanced to call resetAllDragStates after it's defined
            if (window.resetEditorDragState) window.resetEditorDragState();
        };
        
        // Reset state when tab visibility changes
        const onVisibilityChange = () => {
            if (document.hidden) {
                resetDragState();
                if (window.resetEditorDragState) window.resetEditorDragState();
            }
        };
        
        window.addEventListener('blur', onWindowBlur);
        document.addEventListener('visibilitychange', onVisibilityChange);

        const onPointerDown = (e) => {
            // Ensure the editor container has focus so AreaPlugin pan/zoom handlers work reliably.
            // (Matches the user workaround: clicking immediately after load often "unsticks" pan/zoom.)
            try {
                // Don't steal focus from text inputs / editable controls
                const target = e.target;
                const isEditable = target && (
                    target.tagName === 'INPUT' ||
                    target.tagName === 'TEXTAREA' ||
                    target.isContentEditable
                );
                if (!isEditable) {
                    container.tabIndex = -1;
                    container.focus();
                }
            } catch (err) {}

            // Enable Lasso on Ctrl + Left Click
            if ((e.ctrlKey || e.metaKey) && e.button === 0) {
                // Debug: debug(" Lasso start");
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
            // Debug: debug(" Lasso end");
            
            // Measure BEFORE hiding
            const boxRect = selectionBox.getBoundingClientRect();
            // Debug: debug(" Box Rect:", boxRect);

            isSelecting = false;
            selectionBox.style.display = 'none';
            
            // Skip if box is too small (just a click)
            if (boxRect.width < 5 && boxRect.height < 5) {
                // Debug: debug(" Selection box too small, ignoring");
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
            
            // Debug: debug(` Found ${nodesToSelect.length} nodes in selection area`);
            
            // Select the nodes and track them for group movement
            nodesToSelect.forEach(({ node, view }) => {
                // Debug: debug(` Selecting node ${node.id}`, view.element);
                
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
            
            // Debug: debug(` Selected ${selectedCount} nodes, tracked:`, Array.from(lassoSelectedNodes));
        };
        
        // Function to clear all selections (both lasso and Rete's selector)
        const clearAllSelections = () => {
            // Clear lasso-tracked nodes
            if (lassoSelectedNodes.size > 0) {
                // Debug: debug(' Clearing lasso selection');
                lassoSelectedNodes.forEach(nodeId => {
                    const view = area.nodeViews.get(nodeId);
                    if (view && view.element) {
                        view.element.classList.remove('selected');
                        view.element.style.outline = '';
                    }
                });
                lassoSelectedNodes.clear();
            }
            
            // Clear Rete's internal selector
            if (selector && selector.entities) {
                const entities = selector.entities instanceof Map 
                    ? Array.from(selector.entities.values())
                    : Array.from(selector.entities);
                entities.forEach(entity => {
                    // Call unselect if it exists to clean up visual state
                    if (entity.unselect) entity.unselect();
                    selector.remove(entity);
                });
            }
            
            // Also clear any remaining selected classes on nodes
            editor.getNodes().forEach(node => {
                const view = area.nodeViews.get(node.id);
                if (view && view.element) {
                    view.element.classList.remove('selected');
                }
            });
        };
        
        // Alias for backward compatibility
        const clearLassoSelection = clearAllSelections;
        
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
            lastBackdropPos: null,
            nodesBeingMoved: new Set()  // Track nodes being moved to prevent double-movement
        };
        
        // Guard to prevent infinite recursion during group moves
        let isGroupMoving = false;
        let groupMovingTimeout = null;
        
        // Safety function to set isGroupMoving with automatic timeout reset
        const setGroupMoving = (value) => {
            isGroupMoving = value;
            if (groupMovingTimeout) {
                clearTimeout(groupMovingTimeout);
                groupMovingTimeout = null;
            }
            if (value) {
                // Safety timeout: reset after 500ms to prevent stuck state
                groupMovingTimeout = setTimeout(() => {
                    if (isGroupMoving) {
                        debug(' Safety reset: clearing stuck isGroupMoving');
                        isGroupMoving = false;
                    }
                    groupMovingTimeout = null;
                }, 500);
            }
        };
        
        // Comprehensive reset function for all drag/selection states
        // Called on blur, visibility change, or Escape key
        const resetAllDragStates = () => {
            // Reset lasso selection
            if (isSelecting) {
                debug(' Resetting stuck lasso selection');
                isSelecting = false;
                selectionBox.style.display = 'none';
            }
            // Reset group moving
            if (isGroupMoving) {
                debug(' Resetting stuck group moving');
                setGroupMoving(false);
            }
            // Reset backdrop drag state
            if (backdropDragState.isDragging) {
                debug(' Resetting stuck backdrop drag');
                backdropDragState.isDragging = false;
                backdropDragState.activeBackdropId = null;
                backdropDragState.nodesBeingMoved.clear();
            }
        };
        
        // Expose globally for emergency reset (can be called from console: window.resetEditorDragState())
        window.resetEditorDragState = resetAllDragStates;

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

                // Helper to check if a node's center is inside this backdrop
                const isInsideBackdrop = (nodePos, nodeWidth, nodeHeight) => {
                    const nodeCenterX = nodePos.x + nodeWidth / 2;
                    const nodeCenterY = nodePos.y + nodeHeight / 2;
                    return nodeCenterX >= backdropPos.x && 
                           nodeCenterX <= backdropPos.x + bWidth &&
                           nodeCenterY >= backdropPos.y && 
                           nodeCenterY <= backdropPos.y + bHeight;
                };

                // Check regular nodes
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
                    
                    if (isInsideBackdrop(nodePos, nodeWidth, nodeHeight)) {
                        capturedNodes.push(node.id);
                    }
                });

                // Also check other backdrop nodes (for nested groups)
                // Don't capture self!
                backdrops.forEach(otherBackdrop => {
                    if (otherBackdrop.id === backdrop.id) return; // Skip self
                    
                    const otherView = area.nodeViews.get(otherBackdrop.id);
                    if (!otherView) return;
                    
                    const otherPos = otherView.position;
                    const otherWidth = otherBackdrop.properties.width || 400;
                    const otherHeight = otherBackdrop.properties.height || 300;
                    
                    // Check if the other backdrop's center is inside this backdrop
                    if (isInsideBackdrop(otherPos, otherWidth, otherHeight)) {
                        capturedNodes.push(otherBackdrop.id);
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
        // Debounced to avoid excessive calls during bulk operations
        let backdropZIndexTimeout = null;
        function updateBackdropZIndex() {
            if (backdropZIndexTimeout) return; // Already scheduled
            backdropZIndexTimeout = setTimeout(() => {
                backdropZIndexTimeout = null;
                editor.getNodes().forEach(node => {
                    const def = nodeRegistry.getByInstance(node);
                    if (def && def.isBackdrop) {
                        const nodeView = area.nodeViews.get(node.id);
                        if (nodeView && nodeView.element) {
                            nodeView.element.style.zIndex = '-10';
                        }
                    }
                });
            }, 100);
        }

        // Handle single-click node selection via Rete's nodepicked event
        area.addPipe(context => {
            if (context.type === 'nodepicked') {
                const nodeId = context.data.id;
                const node = editor.getNode(nodeId);

                // Track node dragging for Space+drag pan feature
                isNodeDragging = true;
                draggedNodeId = nodeId;
                isPanningWhileDragging = false;

                // Prep for drag-to-favorite: record what was picked.
                // We'll only activate if it actually starts moving.
                try {
                    if (node && favoritesDragRef?.current !== undefined) {
                        const startPos = area.nodeViews.get(nodeId)?.position || { x: 0, y: 0 };
                        favoritesDragRef.current = {
                            nodeId,
                            label: node.label,
                            startPos,
                            active: false,
                            over: false
                        };
                    }
                } catch {
                    // ignore
                }
                
                // If this is a locked backdrop, prevent picking entirely
                if (node) {
                    const def = nodeRegistry.getByInstance(node);
                    if (def && def.isBackdrop && node.properties.locked) {
                        // Debug: debug(' Blocked pick on locked backdrop:', nodeId);
                        return; // Return undefined to block the event
                    }
                }
                
                // Debug: debug(' Node picked (Rete event):', nodeId, 'Shift held:', shiftKeyRef.current);
                
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
                
                // Debug: debug(' Selection after pick:', Array.from(lassoSelectedNodes));
            }
            return context;
        });

        // Drag-to-favorite: detect when a dragged node overlaps the Favorites panel,
        // and finalize on nodedragged (drag end).
        area.addPipe((context) => {
            try {
                if (programmaticMoveRef.current) return context;

                const getIsOverFavorites = (nodeId) => {
                    const favoritesRect = favoritesPanelRef.current?.getBoundingClientRect();
                    if (!favoritesRect) return false;

                    const view = area.nodeViews.get(nodeId);
                    const el = view?.element;
                    if (!el) return false;

                    const nodeRect = el.getBoundingClientRect();
                    const cx = nodeRect.left + nodeRect.width / 2;
                    const cy = nodeRect.top + nodeRect.height / 2;
                    return cx >= favoritesRect.left && cx <= favoritesRect.right && cy >= favoritesRect.top && cy <= favoritesRect.bottom;
                };

                if (context.type === 'nodetranslate') {
                    const info = favoritesDragRef.current;
                    if (!info) return context;
                    const nodeId = context.data?.id;
                    if (!nodeId || info.nodeId !== nodeId) return context;

                    // Activate on first actual movement.
                    if (!info.active) {
                        info.active = true;
                        // Best-effort: if startPos is missing, use previous.
                        if (!info.startPos && context.data?.previous) info.startPos = context.data.previous;
                    }

                    const over = getIsOverFavorites(nodeId);
                    if (over !== info.over) {
                        info.over = over;
                        setFavoritesDropActive(over);
                    }

                    return context;
                }

                if (context.type === 'nodedragged') {
                    const info = favoritesDragRef.current;
                    if (!info) return context;

                    const nodeId = context.data?.id;
                    if (!nodeId || info.nodeId !== nodeId) return context;

                    const shouldAdd = info.active && getIsOverFavorites(nodeId);
                    if (shouldAdd) {
                        addFavoriteLabel(info.label);

                        // Let the built-in drag finalize first, then snap back.
                        const snapPos = info.startPos;
                        if (snapPos) {
                            setTimeout(() => {
                                try { area.translate(nodeId, snapPos); } catch {}
                            }, 0);
                        }
                    }

                    favoritesDragRef.current = null;
                    setFavoritesDropActive(false);
                    return context;
                }
            } catch {
                // ignore
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
                            // Only update if not already set (avoid redundant DOM writes)
                            if (nodeView.element.style.zIndex !== '-10') {
                                nodeView.element.style.zIndex = '-10';
                            }
                            // Set pointer-events based on locked state
                            const targetPointerEvents = payload.properties.locked ? 'none' : 'auto';
                            if (nodeView.element.style.pointerEvents !== targetPointerEvents) {
                                nodeView.element.style.pointerEvents = targetPointerEvents;
                            }
                        }
                    }, 0);
                }
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
                
                // SPACE+DRAG PAN: Block node translation when panning
                // The canvas moves but node stays in place (in world coords)
                // This keeps node visually under cursor while panning
                if (isPanningWhileDragging && draggedNodeId === nodeId) {
                    return {
                        ...context,
                        data: {
                            ...context.data,
                            position: context.data.previous
                        }
                    };
                }
                
                // Handle lasso-selected group movement
                if (lassoSelectedNodes.size > 1 && lassoSelectedNodes.has(nodeId)) {
                    setGroupMoving(true);
                    
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
                        setGroupMoving(false);
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
                        backdropDragState.nodesBeingMoved.clear();
                        
                        // Update captures to get current nodes inside
                        updateBackdropCaptures();
                        
                        // Mark all captured nodes (including nested backdrops' children) as being moved
                        const markNodesBeingMoved = (capturedIds) => {
                            capturedIds.forEach(id => {
                                backdropDragState.nodesBeingMoved.add(id);
                                // If this is a backdrop, also mark its children
                                const capturedNode = editor.getNode(id);
                                if (capturedNode && capturedNode.properties.capturedNodes) {
                                    markNodesBeingMoved(capturedNode.properties.capturedNodes);
                                }
                            });
                        };
                        markNodesBeingMoved(node.properties.capturedNodes);
                        // Debug: debug('[Backdrop] Started dragging, captured nodes:', node.properties.capturedNodes);
                    }
                    
                    // If this backdrop is being moved as part of another backdrop's drag, don't move its children
                    // (the parent backdrop is already moving them)
                    if (backdropDragState.nodesBeingMoved.has(nodeId) && backdropDragState.activeBackdropId !== nodeId) {
                        return context; // Let parent handle moving our children
                    }
                    
                    // Move all captured nodes by the same delta
                    if (node.properties.capturedNodes.length > 0) {
                        setGroupMoving(true);
                        
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
                            setGroupMoving(false);
                        });
                        
                        return context;
                    }
                }
            }
            
            // Reset state when drag ends
            if (context.type === 'nodedragged') {
                if (programmaticMoveRef.current) return context;
                // Debug: debug('[Backdrop] Drag ended, resetting state');
                backdropDragState.isDragging = false;
                backdropDragState.activeBackdropId = null;
                backdropDragState.nodesBeingMoved.clear();
                
                // Reset Space+drag pan state
                isNodeDragging = false;
                draggedNodeId = null;
                if (isPanningWhileDragging) {
                    isPanningWhileDragging = false;
                    container.style.cursor = '';
                }
                
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
                debug(' Updated backdrop lock state:', nodeId, 'locked:', locked);
            }
        };
        
        setEditorInstance(editor);
        setAreaInstance(area);
        setEngineInstance(engine);

        return {
            destroy: () => {
                container.removeEventListener('pointerdown', onPointerDown, { capture: true });
                container.removeEventListener('click', onCanvasClick);
                container.removeEventListener('pointermove', onNodeDragPanPointerMove, true);
                window.removeEventListener('pointermove', onPointerMove);
                window.removeEventListener('pointerup', onPointerUp);
                window.removeEventListener('pointermove', onConnectionPanMove);
                window.removeEventListener('keyup', onConnectionPanKeyUp);
                window.removeEventListener('keydown', onLocalSpaceDown, true);
                window.removeEventListener('keyup', onLocalSpaceUp, true);
                window.removeEventListener('blur', onWindowBlur);
                document.removeEventListener('visibilitychange', onVisibilityChange);
                if (groupMovingTimeout) clearTimeout(groupMovingTimeout);
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
        let resizeObserver = null;

        // Track pointer captures so we can reliably release the *actual* captured IDs.
        // Some machines end up with a stuck pointer capture that breaks pan/zoom until a full reload.
        const capturedPointers = new Map(); // pointerId -> { el: EventTarget, pointerType: string }
        const onGotPointerCapture = (e) => {
            try {
                if (typeof e.pointerId === 'number') {
                    capturedPointers.set(e.pointerId, { el: e.target, pointerType: e.pointerType || 'mouse' });
                }
            } catch (err) {}
        };
        const onLostPointerCapture = (e) => {
            try {
                if (typeof e.pointerId === 'number') {
                    capturedPointers.delete(e.pointerId);
                }
            } catch (err) {}
        };
        const onPointerEnd = (e) => {
            try {
                if (typeof e.pointerId === 'number') {
                    capturedPointers.delete(e.pointerId);
                }
            } catch (err) {}
        };

        container.addEventListener('gotpointercapture', onGotPointerCapture, true);
        container.addEventListener('lostpointercapture', onLostPointerCapture, true);
        window.addEventListener('pointerup', onPointerEnd, true);
        window.addEventListener('pointercancel', onPointerEnd, true);

        // Load plugins FIRST, then create editor
        editorPromise = loadPlugins().then(() => {
            debug(" External plugins loaded, now creating editor...");
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
            
            // ELECTRON FIX: Ensure area plugin handlers are properly initialized
            // Dispatch a synthetic wheel event to "wake up" the zoom handler
            // And focus the container to enable pan/drag
            setTimeout(() => {
                if (container) {
                    container.tabIndex = -1;
                    container.focus();
                    
                    // Dispatch minimal synthetic events to initialize handlers
                    const rect = container.getBoundingClientRect();
                    const centerX = rect.left + rect.width / 2;
                    const centerY = rect.top + rect.height / 2;
                    
                    // Trigger a minimal wheel event to initialize zoom handler
                    const wheelEvent = new WheelEvent('wheel', {
                        bubbles: true, cancelable: true,
                        clientX: centerX, clientY: centerY,
                        deltaY: 0  // Zero delta so no actual zoom happens
                    });
                    container.dispatchEvent(wheelEvent);
                    
                    debug(' Container initialized and focused');
                    
                    // Expose a global reset function for debugging/recovery
                    window.resetEditorView = () => {
                        debug(' Manual reset triggered');
                        
                        // Use requestAnimationFrame to avoid blocking the main thread
                        requestAnimationFrame(() => {
                            // Also reset our internal drag/selection states
                            if (window.resetEditorDragState) {
                                window.resetEditorDragState();
                            }
                            
                            const rect = container.getBoundingClientRect();
                            const centerX = rect.left + rect.width / 2;
                            const centerY = rect.top + rect.height / 2;
                            
                            // Focus container
                            container.tabIndex = -1;
                            container.focus();

                            // Release any known captured pointers first (most reliable unstick)
                            try {
                                const captured = Array.from(capturedPointers.entries());
                                capturedPointers.clear();
                                captured.forEach(([pointerId, info]) => {
                                    const el = info?.el;
                                    const pointerType = info?.pointerType || 'mouse';
                                    try {
                                        // Nudge handlers that track pointer state
                                        const cancelEvent = new PointerEvent('pointercancel', {
                                            bubbles: true,
                                            cancelable: true,
                                            pointerId,
                                            pointerType
                                        });
                                        container.dispatchEvent(cancelEvent);
                                    } catch (e) {}

                                    try { container.releasePointerCapture(pointerId); } catch (e) {}
                                    try {
                                        if (el && typeof el.releasePointerCapture === 'function') {
                                            el.releasePointerCapture(pointerId);
                                        }
                                    } catch (e) {}
                                });
                            } catch (e) {}
                            
                            // Release pointer captures only on container and direct drag-related elements
                            // (Avoid querySelectorAll('*') which is very slow with many nodes)
                            try {
                                for (let i = 0; i < 5; i++) {
                                    try { container.releasePointerCapture(i); } catch (e) {}
                                }
                                // Only check elements that typically capture pointers
                                const dragElements = container.querySelectorAll('.node, .connection, [data-drag]');
                                dragElements.forEach(el => {
                                    try { el.releasePointerCapture(1); } catch (e) {}
                                });
                            } catch (e) {}
                            
                            // AGGRESSIVE FIX: Try to access area's internal drag handler state
                            // The AreaPlugin uses a "drag" module that tracks pointer state
                            const areaRef = areaInstance;
                            if (areaRef) {
                                // Try to reset any internal drag tracking by triggering pointercancel
                                const cancelEvent = new PointerEvent('pointercancel', {
                                    bubbles: true, cancelable: true,
                                    pointerId: 1, pointerType: 'mouse'
                                });
                                container.dispatchEvent(cancelEvent);
                                
                                // Also dispatch lostpointercapture which some handlers check
                                const lostCapture = new PointerEvent('lostpointercapture', {
                                    bubbles: true, cancelable: true,
                                    pointerId: 1, pointerType: 'mouse'
                                });
                                container.dispatchEvent(lostCapture);
                            }
                            
                            // Small delay to let cancellation events process
                            setTimeout(() => {
                                // Dispatch pointer events to reset drag state
                                const downEvent = new PointerEvent('pointerdown', {
                                    bubbles: true, cancelable: true,
                                    clientX: centerX, clientY: centerY,
                                    pointerId: 1, pointerType: 'mouse', isPrimary: true,
                                    button: 0, buttons: 1
                                });
                                const upEvent = new PointerEvent('pointerup', {
                                    bubbles: true, cancelable: true,
                                    clientX: centerX, clientY: centerY,
                                    pointerId: 1, pointerType: 'mouse', isPrimary: true,
                                    button: 0, buttons: 0
                                });
                                
                                container.dispatchEvent(downEvent);
                                setTimeout(() => {
                                    container.dispatchEvent(upEvent);
                                    // Dispatch wheel event for zoom
                                    const wheelEvent = new WheelEvent('wheel', {
                                        bubbles: true, cancelable: true,
                                        clientX: centerX, clientY: centerY,
                                        deltaY: 0
                                    });
                                    container.dispatchEvent(wheelEvent);
                                    debug(' Reset complete');
                                }, 50);
                            }, 50);
                        }); // End requestAnimationFrame
                    };
                }
            }, 100);
            
            // Set up ResizeObserver to detect when container becomes properly sized
            // This helps with Electron where the window may resize after initial load
            let hasInitializedFromResize = false;
            resizeObserver = new ResizeObserver((entries) => {
                for (const entry of entries) {
                    const { width, height } = entry.contentRect;
                    // Only act once when container first gets proper dimensions
                    if (!hasInitializedFromResize && width > 0 && height > 0) {
                        hasInitializedFromResize = true;
                        debug(' ResizeObserver: Container now has size', width, height);
                        
                        // Trigger area recalculation by focusing and dispatching events
                        setTimeout(() => {
                            container.focus();
                            // Dispatch a zero-delta wheel to reinitialize handlers
                            const rect = container.getBoundingClientRect();
                            const wheelEvent = new WheelEvent('wheel', {
                                bubbles: true, cancelable: true,
                                clientX: rect.left + rect.width / 2,
                                clientY: rect.top + rect.height / 2,
                                deltaY: 0
                            });
                            container.dispatchEvent(wheelEvent);
                        }, 50);
                    }
                }
            });
            resizeObserver.observe(container);
            
            return result;
        });

        // Listen for graphLoadComplete event to do a final reset (outside promise for cleanup access)
        const onGraphLoadComplete = () => {
            debug(' graphLoadComplete event received - triggering view reset');
            const tryReset = () => {
                if (window.resetEditorView) window.resetEditorView();
            };
            // Retry a few times because `resetEditorView` may not exist yet
            tryReset();
            setTimeout(tryReset, 100);
            setTimeout(tryReset, 500);
            setTimeout(tryReset, 1000);
        };
        window.addEventListener('graphLoadComplete', onGraphLoadComplete);

        return () => {
            if (resizeObserver) {
                resizeObserver.disconnect();
            }
            window.removeEventListener('graphLoadComplete', onGraphLoadComplete);
            container.removeEventListener('gotpointercapture', onGotPointerCapture, true);
            container.removeEventListener('lostpointercapture', onLostPointerCapture, true);
            window.removeEventListener('pointerup', onPointerEnd, true);
            window.removeEventListener('pointercancel', onPointerEnd, true);
            editorPromise.then((result) => result.destroy());
        };
    }, [createEditor]);

    // Separate useEffect for keyboard handling - uses refs to avoid stale closures
    useEffect(() => {
        if (!editorInstance || !areaInstance || !selectorInstance) return;

        const handleKeyDown = async (e) => {
            // Ignore inputs
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;

            debug(` KeyDown: ${e.code} (Ctrl: ${e.ctrlKey}, Meta: ${e.metaKey})`);
            
            // F5 or Ctrl+Shift+R - Reset editor view (fix frozen pan/zoom)
            if (e.code === 'F5' || ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyR')) {
                e.preventDefault();
                debug(' View reset shortcut triggered');
                if (window.resetEditorView) {
                    window.resetEditorView();
                }
                return;
            }
            
            // F key - Zoom extents (fit all nodes in view)
            if (e.code === 'KeyF' && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                const area = areaRef.current;
                const editor = editorRef.current;
                if (area && editor) {
                    const allNodes = editor.getNodes();
                    if (allNodes.length > 0) {
                        debug(' Zoom extents triggered (F key)');
                        AreaExtensions.zoomAt(area, allNodes, { scale: 0.9 }).catch(err => {
                            console.warn('[F key] zoomAt failed:', err);
                        });
                    }
                }
                return;
            }
            
            // Use refs to get current instances (avoids stale closure issues)
            const editor = editorRef.current;
            const area = areaRef.current;
            const selector = selectorRef.current;
            
            if (!editor || !area) {
                debug(' No editor/area ref available');
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
                    debug(` Checking node ${nodeId}: exists=${!!node}`);
                    if (node) {
                        nodeIds.add(nodeId);
                    }
                }
                
                debug(` Found ${nodeIds.size} selected nodes:`, Array.from(nodeIds));
                return Array.from(nodeIds);
            };

            // Delete
            if (e.code === 'Delete' || e.code === 'Backspace') {
                debug(` Delete key pressed. lassoSelectedNodesRef.current size:`, lassoSelectedNodesRef.current.size);
                debug(` lassoSelectedNodesRef.current contents:`, Array.from(lassoSelectedNodesRef.current));
                const nodeIds = getSelectedNodeIds();
                debug(` Deleting ${nodeIds.length} nodes:`, nodeIds);
                
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
                    debug(' Saved undo state:', undoStackRef.current.length, 'items in stack');
                    
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
                    
                    // Refresh group navigation buttons (in case a Backdrop was deleted)
                    if (window.refreshBackdropGroups) window.refreshBackdropGroups();
                }
            }
            
            // Undo (Ctrl+Z)
            if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' && !e.shiftKey) {
                e.preventDefault();
                
                if (undoStackRef.current.length === 0) {
                    debug(' Nothing to undo');
                    return;
                }
                
                const undoAction = undoStackRef.current.pop();
                debug(' Undoing:', undoAction.type, undoAction.nodes.length, 'nodes');
                
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
                        
                        debug(' Undo complete - restored', undoAction.nodes.length, 'nodes');
                        
                        // Refresh group navigation buttons (in case a Backdrop was restored)
                        if (window.refreshBackdropGroups) window.refreshBackdropGroups();
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
                        debug(" Nothing selected to copy");
                        return;
                    }

                    debug(` Copying ${nodeIds.length} nodes`);

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
                        debug(" Nothing selected to copy (no nodes in selection)");
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
                    debug('Copied to clipboard:', clipboardData);
                } catch (err) {
                    console.error("[Editor] Copy failed:", err);
                }
            }

            // Paste (Ctrl+V)
            if ((e.ctrlKey || e.metaKey) && e.code === 'KeyV') {
                const clipboardText = localStorage.getItem('rete-clipboard');
                if (!clipboardText) {
                    debug(" Clipboard empty");
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
                                        unmount: () => {},
                                        unselect: () => {}
                                    }, true);
                                }
                            }
                        }
                    } finally {
                        programmaticMoveRef.current = false;
                        area?.updateBackdropCaptures?.();
                    }

                    // PERF FIX: Add connections in parallel
                    const pasteConnectionPromises = [];
                    for (const connData of data.connections) {
                        const newSourceId = idMap[connData.source];
                        const newTargetId = idMap[connData.target];

                        if (newSourceId && newTargetId) {
                            const source = editor.getNode(newSourceId);
                            const target = editor.getNode(newTargetId);
                            if (source && target) {
                                pasteConnectionPromises.push(
                                    editor.addConnection(new ClassicPreset.Connection(
                                        source,
                                        connData.sourceOutput,
                                        target,
                                        connData.targetInput
                                    ))
                                );
                            }
                        }
                    }
                    await Promise.all(pasteConnectionPromises);
                    
                    // CRITICAL: Process the pasted nodes to establish data flow
                    // Without this, connections exist but data doesn't flow
                    if (engineInstance && editor) {
                        engineInstance.reset();
                        for (const n of editor.getNodes()) {
                            try { await engineInstance.fetch(n.id); } catch (e) { }
                        }
                    }
                    
                    debug('Pasted from clipboard');

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
                    debug(' Viewport reset via Home key');
                }
            }
            
            // Escape key - Reset any stuck drag/selection states
            if (e.code === 'Escape') {
                if (window.resetEditorDragState) {
                    window.resetEditorDragState();
                    debug(' Drag state reset via Escape key');
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
            debug(' Received delete from Electron IPC');
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

    // Fast Context Menu - Right-click handler
    useEffect(() => {
        const container = ref.current;
        if (!container || !editorInstance || !areaInstance) return;

        const handleContextMenu = (e) => {
            // Check if right-clicking on a node
            const nodeElement = e.target.closest('[data-testid="node"]');
            
            if (nodeElement) {
                // Right-click on a node - show node context menu
                e.preventDefault();
                const nodeId = nodeElement.dataset.nodeId || 
                    Array.from(areaInstance.nodeViews.entries())
                        .find(([id, view]) => view.element === nodeElement)?.[0];
                
                if (nodeId) {
                    const node = editorInstance.getNode(nodeId);
                    setContextMenu({
                        visible: true,
                        position: { x: e.clientX, y: e.clientY },
                        items: [
                            {
                                label: 'Delete',
                                handler: async () => {
                                    const connections = editorInstance.getConnections()
                                        .filter(c => c.source === nodeId || c.target === nodeId);
                                    for (const conn of connections) {
                                        await editorInstance.removeConnection(conn.id);
                                    }
                                    await editorInstance.removeNode(nodeId);
                                }
                            }
                        ],
                        nodeContext: node
                    });
                }
            } else {
                // Right-click on empty area - show add node menu
                e.preventDefault();
                const menuItems = window._t2GetMenuItems ? window._t2GetMenuItems() : [];
                setContextMenu({
                    visible: true,
                    position: { x: e.clientX, y: e.clientY },
                    items: menuItems,
                    nodeContext: null
                });
            }
        };

        container.addEventListener('contextmenu', handleContextMenu);

        return () => {
            container.removeEventListener('contextmenu', handleContextMenu);
        };
    }, [editorInstance, areaInstance]);

    // Context menu handlers
    const handleContextMenuClose = useCallback(() => {
        setContextMenu(prev => ({ ...prev, visible: false }));
    }, []);

    const handleContextMenuSelect = useCallback(async (item) => {
        if (item.handler) {
            await item.handler(contextMenu.position);
        }
    }, [contextMenu.position]);

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

            // Detect if running inside Home Assistant ingress (iframe) or HA add-on
            const isInIframe = window.self !== window.top;
            const isHAIngress = isInIframe || window.location.pathname.includes('/api/hassio');
            
            // For HA ingress: show SaveModal so user can choose filename
            if (isHAIngress) {
                debug('Running in HA ingress - showing save dialog');
                setCurrentGraphDataForSave(graphData);
                setShowSaveModal(true);
                return;
            }

            // Save to localStorage for quick reload (desktop mode)
            try { if (jsonString.length < 2000000) { localStorage.removeItem('saved-graph'); localStorage.setItem('saved-graph', jsonString); } } catch(e) { console.warn('localStorage skipped'); }
            debug('Graph saved to localStorage');

            // Also save to server as "last active" for persistence
            try {
                const response = await fetch(apiUrl('/api/engine/save-active'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: jsonString
                });
                if (response.ok) {
                    debug('[handleSave] Graph saved to server as last active');
                } else {
                    console.warn('[handleSave] Failed to save to server:', response.status);
                }
            } catch (err) {
                console.warn('[handleSave] Failed to save to server:', err);
            }

            // Also save to an Electron-accessible temp file so the desktop app can reload even if localStorage is empty
            if (window.api?.saveTempFile) {
                try {
                    await window.api.saveTempFile('autotron_graph.json', jsonString);
                    debug('[handleSave] Saved temp file for Electron reload');
                } catch (err) {
                    console.warn('[handleSave] Failed to save temp file via Electron API', err);
                }
            }

            // Try File System Access API (Modern Browsers) - only for desktop/Electron
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
                    debug('Graph saved to file');
                    return;
                } catch (err) {
                    if (err.name === 'AbortError') return; // User cancelled
                    console.warn('File System Access API failed, falling back to download', err);
                }
            }

            // Fallback to download (only for desktop browsers, not HA)
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `autotron_graph_${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
            debug('Graph saved via download');

        } catch (err) {
            console.error('Failed to save graph:', err);
        }
    };
    
    // Expose triggerGraphSave for UpdateModal to save before update
    useEffect(() => {
        window.triggerGraphSave = async () => {
            if (!editorInstance || !areaInstance) return;
            try {
                const nodes = editorInstance.getNodes().map(n => {
                    const serializedNode = typeof n.toJSON === 'function' ? n.toJSON() : { ...n };
                    if (n.properties) serializedNode.properties = n.properties;
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
                const viewport = areaInstance.area?.transform 
                    ? { x: areaInstance.area.transform.x, y: areaInstance.area.transform.y, k: areaInstance.area.transform.k }
                    : { x: 0, y: 0, k: 1 };
                
                const graphData = { nodes, connections, viewport, preUpdateSave: true, timestamp: Date.now() };
                const jsonString = JSON.stringify(graphData);
                
                if (jsonString.length < 2000000) {
                    localStorage.setItem('saved-graph', jsonString);
                    debug('[triggerGraphSave] Graph saved before update');
                }
            } catch (e) {
                console.warn('[triggerGraphSave] Failed:', e);
            }
        };
        
        return () => {
            delete window.triggerGraphSave;
        };
    }, [editorInstance, areaInstance]);

    // Auto-save to localStorage every 2 minutes
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const autoSaveIntervalRef = useRef(null);
    const lastAutoSaveRef = useRef(Date.now());
    
    // Mark as having unsaved changes when editor content changes
    useEffect(() => {
        if (!editorInstance) return;
        
        const markDirty = () => {
            setHasUnsavedChanges(true);
        };
        
        // Listen for node/connection changes
        editorInstance.addPipe((context) => {
            if (['nodecreated', 'noderemoved', 'connectioncreated', 'connectionremoved'].includes(context.type)) {
                markDirty();
            }
            return context;
        });
    }, [editorInstance]);
    
    // Auto-save interval
    useEffect(() => {
        if (!editorInstance || !areaInstance) return;
        
        const autoSave = async () => {
            // Don't auto-save during loading
            if (window.graphLoading || loadingRef.current) return;
            
            if (hasUnsavedChanges) {
                try {
                    const nodes = editorInstance.getNodes().map(n => {
                        const serializedNode = typeof n.toJSON === 'function' ? n.toJSON() : { ...n };
                        if (n.properties) serializedNode.properties = n.properties;
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
                    const viewport = areaInstance.area?.transform 
                        ? { x: areaInstance.area.transform.x, y: areaInstance.area.transform.y, k: areaInstance.area.transform.k }
                        : { x: 0, y: 0, k: 1 };
                    
                    const graphData = { nodes, connections, viewport, autoSaved: true, timestamp: Date.now() };
                    const jsonString = JSON.stringify(graphData);
                    
                    if (jsonString.length < 2000000) {
                        localStorage.setItem('saved-graph', jsonString);
                        lastAutoSaveRef.current = Date.now();
                        setHasUnsavedChanges(false);
                        
                        // Also save to server as "last active" for HA add-on persistence
                        try {
                            await fetch(apiUrl('/api/engine/save-active'), {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: jsonString
                            });
                        } catch (err) {
                            // Silent fail for auto-save to server
                        }
                        
                        // Show toast notification if available
                        if (window.T2Toast) {
                            window.T2Toast.success('Auto-saved', 2000);
                        }
                    }
                } catch (e) {
                    console.warn('[Auto-save] Failed:', e);
                }
            }
        };
        
        // Auto-save every 2 minutes
        autoSaveIntervalRef.current = setInterval(autoSave, 120000);
        
        return () => {
            if (autoSaveIntervalRef.current) {
                clearInterval(autoSaveIntervalRef.current);
            }
        };
    }, [editorInstance, areaInstance, hasUnsavedChanges]);
    
    // Auto-load graph after update - check for autoLoadAfterUpdate flag
    useEffect(() => {
        if (!editorInstance || !areaInstance || !engineInstance) return;
        
        const shouldAutoLoad = sessionStorage.getItem('autoLoadAfterUpdate') === 'true';
        if (shouldAutoLoad) {
            // Clear the flag first to prevent infinite loops
            sessionStorage.removeItem('autoLoadAfterUpdate');
            
            debug('[AutoLoad] Detected post-update reload, attempting to restore graph...');
            
            // Small delay to ensure editor is fully initialized
            const timer = setTimeout(async () => {
                try {
                    const saved = localStorage.getItem('saved-graph');
                    if (saved) {
                        debug('[AutoLoad] Found saved graph, loading...');
                        // Call handleLoad logic directly instead of using the function
                        // to avoid dependency issues
                        const graphData = JSON.parse(saved);
                        if (graphData.nodes && graphData.nodes.length > 0) {
                            // Trigger the load
                            if (window.T2Toast) {
                                window.T2Toast.info('Restoring your graph after update...', 3000);
                            }
                            // Use a small delay then call handleLoad via button simulation
                            // or directly invoke the load logic
                            document.dispatchEvent(new CustomEvent('autoLoadGraph'));
                        }
                    }
                } catch (err) {
                    console.warn('[AutoLoad] Failed to auto-load graph:', err);
                }
            }, 1000);
            
            return () => clearTimeout(timer);
        }
    }, [editorInstance, areaInstance, engineInstance]);

    // Auto-load last active graph from server on initial mount
    // DISABLED for HA ingress - user should manually click "Load Last" for faster experience
    // The backend engine keeps running regardless, so no need to auto-load the UI graph
    const hasAutoLoadedFromServer = useRef(false);
    useEffect(() => {
        if (!editorInstance || !areaInstance || !engineInstance) return;
        if (hasAutoLoadedFromServer.current) return;
        
        // Detect if running inside Home Assistant ingress (iframe)
        const isInIframe = window.self !== window.top;
        const isHAIngress = isInIframe || window.location.pathname.includes('/api/hassio');
        
        // For HA ingress: DON'T auto-load - let user click "Load Last" button (faster)
        if (isHAIngress) {
            debug('[ServerAutoLoad] Skipping - HA ingress mode, user should click Load Last');
            hasAutoLoadedFromServer.current = true; // Prevent future attempts
            return;
        }
        
        // For desktop/Electron: skip if localStorage has data
        const hasLocalGraph = localStorage.getItem('saved-graph');
        const isPostUpdate = sessionStorage.getItem('autoLoadAfterUpdate') === 'true';
        
        if (hasLocalGraph || isPostUpdate) {
            debug('[ServerAutoLoad] Skipping - desktop mode with local graph');
            return;
        }
        
        hasAutoLoadedFromServer.current = true;
        
        const loadFromServer = async () => {
            try {
                debug('[ServerAutoLoad] Fetching last active graph from server...');
                const response = await fetch(apiUrl('/api/engine/last-active'));
                const data = await response.json();
                
                if (data.success && data.graph) {
                    debug('[ServerAutoLoad] Found last active graph, loading...');
                    
                    // Store in localStorage so handleLoad can use it
                    localStorage.setItem('saved-graph', JSON.stringify(data.graph));
                    
                    // Trigger the load
                    if (window.T2Toast) {
                        window.T2Toast.info('Loading your last graph...', 2000);
                    }
                    
                    // Small delay then trigger load
                    setTimeout(() => {
                        document.dispatchEvent(new CustomEvent('autoLoadGraph'));
                    }, 500);
                } else {
                    debug('[ServerAutoLoad] No last active graph on server');
                }
            } catch (err) {
                console.warn('[ServerAutoLoad] Failed to fetch from server:', err);
            }
        };
        
        // Delay to ensure editor is fully initialized
        const timer = setTimeout(loadFromServer, 1500);
        return () => clearTimeout(timer);
    }, [editorInstance, areaInstance, engineInstance]);

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
                        debug('[handleLoad] Loaded graph from Electron temp file');
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
            debug(`[handleLoad] Loading graph with ${graphData.nodes?.length} nodes`);
            
            // Validate graph structure
            const validation = validateGraph(graphData);
            if (!validation.valid) {
                console.warn('[handleLoad] Graph validation failed:', validation.errors);
                if (window.T2Toast) {
                    window.T2Toast.warning(`Graph has issues: ${validation.errors.length} errors`, 4000);
                }
                
                // Attempt repair
                const repairResult = repairGraph(graphData);
                if (repairResult.repaired) {
                    debug('[handleLoad] Graph repaired:', repairResult.fixes);
                    if (window.T2Toast) {
                        window.T2Toast.info(`Graph repaired: ${repairResult.fixes.length} fixes applied`, 3000);
                    }
                    // Use repaired data
                    Object.assign(graphData, repairResult.graphData);
                }
            }
            if (validation.warnings.length > 0) {
                console.warn('[handleLoad] Graph warnings:', validation.warnings);
            }
            
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
            loadingRef.current = true;  // Prevent cascading updates during load
            
            // PERF FIX: Zoom out before adding nodes to prevent UI freeze
            // This prevents dense node clusters from rendering in the visible area
            // We'll zoom to fit all nodes after they're added
            if (areaInstance?.area) {
                try {
                    // IMPORTANT: Use AreaPlugin APIs; directly mutating `transform` can desync internal state
                    // and intermittently break pan/zoom until the user interacts.
                    areaInstance.area.zoom(0.1, 0, 0);
                    areaInstance.area.translate(0, 0);
                } catch (e) {
                    // Non-fatal; load will still proceed
                }
            }
            
            try {
                for (const nodeData of graphData.nodes) {
                    let node;
                    const def = nodeRegistry.getByLabel(nodeData.label);

                    if (def) {
                        const updateCallback = () => {
                            // During graph load, only update the visual, skip cascading data fetch
                            if (loadingRef.current || window.graphLoading) {
                                if (areaInstance) areaInstance.update("node", nodeData.id);
                                return;  // Skip cascading updates during load
                            }
                            if (areaInstance) areaInstance.update("node", nodeData.id);
                            // Use the shared debounced process function for efficiency
                            if (window._t2Process) {
                                window._t2Process();
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

                // PERF FIX: Add all connections in parallel instead of sequentially
                // This is ~10x faster for large graphs (100+ connections)
                const connectionPromises = [];
                for (const connData of graphData.connections) {
                    const source = editorInstance.getNode(connData.source);
                    const target = editorInstance.getNode(connData.target);
                    if (source && target) {
                        connectionPromises.push(
                            editorInstance.addConnection(new ClassicPreset.Connection(
                                source,
                                connData.sourceOutput,
                                target,
                                connData.targetInput
                            ))
                        );
                    }
                }
                await Promise.all(connectionPromises);
            } finally {
                programmaticMoveRef.current = false;
                areaInstance?.updateBackdropCaptures?.();
            }
            
            // PERF FIX: After all nodes are added, zoom to fit them all in view
            // This completes the zoom-out-before-load optimization
            const allNodes = editorInstance.getNodes();
            if (allNodes.length > 0 && areaInstance) {
                debug('[handleLoad] Zooming to fit', allNodes.length, 'nodes...');
                try {
                    await AreaExtensions.zoomAt(areaInstance, allNodes, { scale: 0.9 });
                } catch (zoomErr) {
                    console.warn('[handleLoad] zoomAt failed:', zoomErr);
                }
            }
            
            // CRITICAL: Process the entire graph immediately after loading
            // This ensures all node data flows are established before UI interaction
            if (processImmediateRef.current) {
                debug('[handleLoad] Processing graph immediately...');
                await processImmediateRef.current();
                debug('[handleLoad] Graph processing complete');
            }
            
            // Re-enable cascading updates after load is complete
            loadingRef.current = false;
            
            // Restore viewport state from saved graph (or default if not present)
            // Use a longer delay (300ms) to ensure all node rendering and state updates are complete
            // This is critical for Electron where timing issues can break pan/zoom
            debug('[handleLoad] Setting up viewport restoration timer...');
            setTimeout(() => {
                debug('[handleLoad] Viewport restoration timer fired, areaInstance:', !!areaInstance, 'area:', !!areaInstance?.area);
                if (areaInstance?.area) {
                    const viewport = graphData.viewport || { x: 0, y: 0, k: 1 };
                    const savedK = viewport.k || 1;
                    const savedX = viewport.x || 0;
                    const savedY = viewport.y || 0;
                    
                    debug('[handleLoad] Restoring viewport:', { savedX, savedY, savedK });
                    debug('[handleLoad] Current transform before restore:', { ...areaInstance.area.transform });

                    // IMPORTANT: Use AreaPlugin APIs to restore viewport.
                    // Directly mutating `area.transform` / setting CSS can desync internal state and freeze pan/zoom.
                    try {
                        areaInstance.area.zoom(savedK, 0, 0);
                        areaInstance.area.translate(savedX, savedY);
                    } catch (viewportErr) {
                        console.warn('[handleLoad] Viewport restore failed:', viewportErr);
                    }

                    debug('[handleLoad] Transform after restore:', { ...areaInstance.area.transform });
                    
                    const container = areaInstance.container;
                    if (container) {
                        // Make container focusable and focus it
                        container.tabIndex = -1;
                        container.focus();
                        
                        // Blur any focused inputs that might be stealing events
                        if (document.activeElement && document.activeElement !== container && 
                            document.activeElement.tagName !== 'BODY') {
                            document.activeElement.blur();
                        }
                        
                        // ELECTRON FIX: Dispatch synthetic pointer events to reset area's drag state
                        // This fixes pan/zoom issues that occur after loading graphs in Electron
                        // Use the global reset function which is more comprehensive
                        const tryReset = () => {
                            if (window.resetEditorView) window.resetEditorView();
                        };
                        // Schedule retries regardless of whether `resetEditorView` exists *right now*.
                        // (Load timing can beat the editor init on some machines.)
                        setTimeout(tryReset, 100);
                        setTimeout(tryReset, 500);
                        setTimeout(tryReset, 1000);
                    }
                    
                    // Release any stuck pointer captures on all nodes
                    editorInstance.getNodes().forEach(node => {
                        const view = areaInstance.nodeViews.get(node.id);
                        if (view?.element) {
                            try {
                                for (let i = 0; i < 10; i++) {
                                    try { view.element.releasePointerCapture(i); } catch (e) {}
                                }
                            } catch (e) {}
                        }
                    });
                }
            }, 300);
            
            debug('Graph loaded');
        } catch (err) {
            console.error('Failed to load graph:', err);
            loadingRef.current = false;
            alert('Failed to load graph');
        }
    };

    const handleLoadExample = async () => {
        if (!editorInstance || !areaInstance || !engineInstance) {
            console.error('[handleLoadExample] Missing instances');
            return;
        }
        
        // Confirm if there are existing nodes
        const existingNodes = editorInstance.getNodes();
        if (existingNodes.length > 0) {
            if (!confirm('This will replace your current graph with the starter example. Continue?')) {
                return;
            }
        }
        
        try {
            // Fetch the example graph from the API (use apiUrl for HA ingress compatibility)
            const response = await fetch(apiUrl('/api/examples/starter'));
            if (!response.ok) {
                throw new Error(`Failed to fetch example: ${response.status}`);
            }
            const data = await response.json();
            if (!data.success || !data.graph) {
                throw new Error('Invalid example graph response');
            }
            
            // Store in localStorage and trigger normal load
            localStorage.setItem('saved-graph', JSON.stringify(data.graph));
            debug('[handleLoadExample] Example graph loaded, triggering handleLoad...');
            await handleLoad();
            
            if (window.T2Toast) {
                window.T2Toast.success('Starter example loaded! Select devices from the dropdowns.');
            }
        } catch (err) {
            console.error('[handleLoadExample] Failed:', err);
            alert('Failed to load example graph: ' + err.message);
        }
    };
    
    // Listen for autoLoadGraph event (triggered after update)
    useEffect(() => {
        const handleAutoLoad = () => {
            debug('[AutoLoadEvent] Received autoLoadGraph event, calling handleLoad...');
            handleLoad();
        };
        
        document.addEventListener('autoLoadGraph', handleAutoLoad);
        return () => document.removeEventListener('autoLoadGraph', handleAutoLoad);
    }, [editorInstance, areaInstance, engineInstance]);

    const handleClear = async () => {
        if (!editorInstance) {
            console.warn('[handleClear] No editor instance!');
            return;
        }
        try {
            const connections = editorInstance.getConnections();
            const nodes = editorInstance.getNodes();
            debug(`[handleClear] Removing ${connections.length} connections and ${nodes.length} nodes`);
            
            for (const conn of connections) {
                await editorInstance.removeConnection(conn.id);
            }
            for (const node of nodes) {
                await editorInstance.removeNode(node.id);
            }
            
            // Verify clear succeeded
            const remainingNodes = editorInstance.getNodes();
            debug(`[handleClear] Complete. Remaining nodes: ${remainingNodes.length}`);
            
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
            debug('Graph exported');
        } catch (err) {
            console.error('Failed to export graph:', err);
        }
    };

    const handleImport = async (graphData) => {
        // Validate graph before import
        const validation = validateGraph(graphData);
        if (!validation.valid) {
            console.warn('[handleImport] Graph validation failed:', validation.errors);
            if (window.T2Toast) {
                window.T2Toast.warning(`Graph has issues: ${validation.errors.length} errors`, 4000);
            }
            
            // Attempt repair
            const repairResult = repairGraph(graphData);
            if (repairResult.repaired) {
                debug('[handleImport] Graph repaired:', repairResult.fixes);
                if (window.T2Toast) {
                    window.T2Toast.info(`Graph repaired: ${repairResult.fixes.length} fixes applied`, 3000);
                }
                // Use repaired data
                graphData = repairResult.graphData;
            } else {
                // Ask user if they want to continue with broken graph
                if (!confirm(`Graph has ${validation.errors.length} errors. Continue anyway?`)) {
                    return;
                }
            }
        }
        
        // Completely suppress console during import to prevent DevTools crash
        const originalConsole = { log: console.log, warn: console.warn, error: console.error };
        console.log = () => {};
        console.warn = () => {};
        // Keep errors but throttle them
        let errorCount = 0;
        console.error = (...args) => { if (errorCount++ < 10) originalConsole.error(...args); };
        
        originalConsole.log('%c🚀 IMPORT STARTED (console suppressed)', 'background: green; color: white; font-size: 16px;');
        
        // Set global flag to prevent nodes from making API calls during import
        window.graphLoading = true;
        
        if (!editorInstance || !areaInstance || !engineInstance) {
            Object.assign(console, originalConsole);
            return;
        }
        try {
            await handleClear();

            programmaticMoveRef.current = true;
            loadingRef.current = true;  // Prevent cascading updates during import
            
            // PERF FIX: Zoom out before adding nodes to prevent UI freeze
            // This prevents dense node clusters from rendering in the visible area
            if (areaInstance?.area) {
                try {
                    // IMPORTANT: Use AreaPlugin APIs; directly mutating `transform` can desync internal state
                    // and intermittently break pan/zoom until the user interacts.
                    areaInstance.area.zoom(0.1, 0, 0);
                    areaInstance.area.translate(0, 0);
                } catch (e) {
                    // Non-fatal; import will still proceed
                }
            }
            
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
                            // During graph import, only update the visual, skip cascading data fetch
                            if (loadingRef.current || window.graphLoading) {
                                if (areaInstance) areaInstance.update("node", nodeData.id);
                                return;  // Skip cascading updates during import
                            }
                            if (areaInstance) areaInstance.update("node", nodeData.id);
                            // Use the shared debounced process function for efficiency
                            if (window._t2Process) {
                                window._t2Process();
                            }
                        };
                        node = def.factory(updateCallback);
                    }

                    if (node) {
                        node.id = nodeData.id;

                        // DEBUG: Check restore condition for Timeline Color (use originalConsole to bypass suppression)
                        if (nodeData.label === 'Timeline Color') {
                            originalConsole.log('[DEBUG-IMPORT] Timeline Color restore check:', {
                                hasRestore: typeof node.restore === 'function',
                                hasData: !!nodeData.data,
                                dataKeys: nodeData.data ? Object.keys(nodeData.data) : 'N/A',
                                propertiesKeys: nodeData.data?.properties ? Object.keys(nodeData.data.properties) : 'N/A',
                                previewModeValue: nodeData.data?.properties?.previewMode
                            });
                        }

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

                // PERF FIX: Add connections in parallel
                const importConnectionPromises = [];
                for (const connData of graphData.connections) {
                    const source = editorInstance.getNode(connData.source);
                    const target = editorInstance.getNode(connData.target);
                    if (source && target) {
                        importConnectionPromises.push(
                            editorInstance.addConnection(new ClassicPreset.Connection(
                                source,
                                connData.sourceOutput,
                                target,
                                connData.targetInput
                            ))
                        );
                    } else {
                        console.warn(`[handleImport] Connection skipped - missing node: source=${connData.source} (${!!source}), target=${connData.target} (${!!target})`);
                    }
                }
                await Promise.all(importConnectionPromises);
            } finally {
                programmaticMoveRef.current = false;
                areaInstance?.updateBackdropCaptures?.();
            }
            
            // PERF FIX: After all nodes are added, zoom to fit them all in view
            // This completes the zoom-out-before-load optimization
            const allNodes = editorInstance.getNodes();
            if (allNodes.length > 0 && areaInstance) {
                try {
                    await AreaExtensions.zoomAt(areaInstance, allNodes, { scale: 0.9 });
                } catch (zoomErr) {
                    // Fallback if zoomAt fails - just restore console silently
                }
            }
            
            // Re-enable cascading updates after import is complete
            loadingRef.current = false;
            
            // Delay clearing graphLoading to let any queued setTimeout callbacks see it's still loading
            // This prevents API flood from callbacks queued during import
            setTimeout(async () => {
                window.graphLoading = false;
                debug('[handleImport] Graph loading complete - API calls now enabled');
                // Emit event so nodes can refresh their data now that loading is complete
                window.dispatchEvent(new CustomEvent('graphLoadComplete'));
                
                // Process all nodes through the engine to propagate values
                // This ensures HA devices sync to their trigger states after load
                // Delay slightly to let graphLoadComplete handlers (async fetches) start
                setTimeout(() => {
                    if (processImmediateRef.current) {
                        debug('[handleImport] Running processImmediate to sync node states');
                        processImmediateRef.current();
                    }
                    
                    // Run again after a longer delay to catch any slow async operations
                    setTimeout(() => {
                        if (processImmediateRef.current) {
                            debug('[handleImport] Running second processImmediate for late-loading data');
                            processImmediateRef.current();
                        }
                    }, 1500);
                }, 500);
                
                // IMPORTANT: Save imported graph to localStorage and server for persistence
                // This ensures the imported graph is available for auto-load on refresh
                try {
                    const jsonString = JSON.stringify(graphData, null, 2);
                    // Save to localStorage
                    if (jsonString.length < 2000000) {
                        localStorage.removeItem('saved-graph');
                        localStorage.setItem('saved-graph', jsonString);
                        debug('[handleImport] Graph saved to localStorage');
                    }
                    // Save to server for HA add-on persistence
                    const response = await fetch(apiUrl('/api/engine/save-active'), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: jsonString
                    });
                    if (response.ok) {
                        debug('[handleImport] Graph saved to server as last active');
                    }
                } catch (saveErr) {
                    console.warn('[handleImport] Failed to save imported graph:', saveErr);
                }
                
                // Final safety reset of editor view after all loading is complete
                const tryReset = () => {
                    if (window.resetEditorView) window.resetEditorView();
                };
                setTimeout(tryReset, 100);
                setTimeout(tryReset, 500);
            }, 2000);  // 2 second delay to ensure all queued callbacks have fired
            
            // Restore console
            Object.assign(console, originalConsole);
            console.log('%c✅ IMPORT COMPLETE', 'background: green; color: white; font-size: 16px;');
            debug('Graph imported successfully. Pan/zoom should work now.');
            
        } catch (err) {
            // Restore console on error
            window.graphLoading = false;  // Clear flag on error
            if (typeof originalConsole !== 'undefined') Object.assign(console, originalConsole);
            console.error('Failed to import graph:', err);
            loadingRef.current = false;
            alert('Failed to import graph: ' + err.message);
        }
    };

    return (
        <div style={{ width: "100%", height: "100%", position: "relative" }}>
            <FavoritesPanel
                width={FAVORITES_WIDTH}
                panelRef={favoritesPanelRef}
                dropActive={favoritesDropActive}
                favoriteGroups={favoriteGroups}
                onAddFavorite={addFavoriteLabel}
                onRemoveFavorite={removeFavoriteLabel}
                onCreateNode={createNodeFromLabelAtCenter}
            />
            <div ref={ref} className="rete-editor" style={{ width: "100%", height: "100%", marginRight: "320px", marginLeft: `${FAVORITES_WIDTH}px` }} />
            <div ref={dockOverlaySlotRef} />
            {(() => {
                const target = dockMergedIntoForecast ? forecastDockSlotRef.current : dockOverlaySlotRef.current;
                if (!target) return null;
                return createPortal(
                    <Dock
                        onSave={handleSave}
                        onLoad={handleLoad}
                        onLoadExample={handleLoadExample}
                        onClear={handleClear}
                        onExport={handleExport}
                        onImport={handleImport}
                        hasUnsavedChanges={hasUnsavedChanges}
                        isMerged={dockMergedIntoForecast}
                        onToggleMerged={() => setDockMergedIntoForecast(v => !v)}
                    />,
                    target
                );
            })()}
            <ForecastPanel dockSlotRef={forecastDockSlotRef} />
            <FastContextMenu
                visible={contextMenu.visible}
                position={contextMenu.position}
                items={contextMenu.items}
                onClose={handleContextMenuClose}
                onSelect={handleContextMenuSelect}
            />
            <SaveModal
                isOpen={showSaveModal}
                onClose={() => setShowSaveModal(false)}
                onSave={() => {
                    setHasUnsavedChanges(false);
                    setShowSaveModal(false);
                }}
                currentGraphData={currentGraphDataForSave}
            />
        </div>
    );
}
