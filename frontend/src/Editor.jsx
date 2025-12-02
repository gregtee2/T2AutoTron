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

import { HAGenericDeviceNode, HAGenericDeviceNodeComponent, StatusIndicatorControl, ColorBarControl, PowerStatsControl } from "./nodes/HAGenericDeviceNode";
import { KasaPlugNode, KasaPlugNodeComponent } from "./nodes/KasaPlugNode";
import { SunriseSunsetNode, SunriseSunsetNodeComponent } from "./nodes/SunriseSunsetNode.jsx";
import { TimeOfDayNode, TimeOfDayNodeComponent } from "./nodes/TimeOfDayNode.jsx";
import { PushbuttonNode, PushbuttonNodeComponent } from "./nodes/PushbuttonNode.jsx";
import { DisplayNode, DisplayNodeComponent } from "./nodes/DisplayNode.jsx";
import { AllInOneColorNode, AllInOneColorNodeComponent } from "./nodes/AllInOneColorNode.jsx";
import { WeatherLogicNode, WeatherLogicNodeComponent } from "./nodes/WeatherLogicNode.jsx";
import { ButtonControlComponent } from "./controls/ButtonControl";
import { DropdownControlComponent } from "./controls/DropdownControl";
import { TextControlComponent } from "./controls/TextControl";
import { SwitchControlComponent } from "./controls/SwitchControl";
import { NumberControlComponent } from "./controls/NumberControl";
import { DeviceStateControlComponent } from "./controls/DeviceStateControl";
import { StatusIndicatorControlComponent } from "./controls/StatusIndicatorControl";
import { ColorBarControlComponent } from "./controls/ColorBarControl";
import { PowerStatsControlComponent } from "./controls/PowerStatsControl";

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

        const defaultItems = ContextMenuPresets.classic.setup([
            ["HA Generic Device", () => {
                const node = new HAGenericDeviceNode(() => updateNode(node.id));
                return node;
            }],
            ["Kasa Plug Control", () => {
                const node = new KasaPlugNode(() => updateNode(node.id));
                return node;
            }],
            ["Sunrise/Sunset Trigger", () => {
                const node = new SunriseSunsetNode(() => updateNode(node.id));
                return node;
            }],
            ["Time of Day", () => {
                const node = new TimeOfDayNode(() => updateNode(node.id));
                return node;
            }],
            ["Pushbutton", () => {
                const node = new PushbuttonNode(() => updateNode(node.id));
                return node;
            }],
            ["Display", () => {
                const node = new DisplayNode(() => updateNode(node.id));
                return node;
            }],
            ["All-in-One Color Control", () => {
                // Use triggerDataFlow instead of updateNode to prevent UI re-renders while dragging
                const node = new AllInOneColorNode(() => triggerDataFlow());
                return node;
            }],
            ["Weather Logic", () => {
                const node = new WeatherLogicNode(() => updateNode(node.id));
                return node;
            }]
        ]);

        const contextMenu = new ContextMenuPlugin({
            items: (context, plugin) => {
                if (context === 'root') {
                    return defaultItems(context, plugin);
                }
                if (context instanceof HAGenericDeviceNode || context instanceof KasaPlugNode || context instanceof SunriseSunsetNode || context instanceof TimeOfDayNode || context instanceof PushbuttonNode || context instanceof DisplayNode || context instanceof AllInOneColorNode || context instanceof WeatherLogicNode) {
                    return {
                        searchBar: false,
                        list: [
                            {
                                label: 'Delete',
                                key: 'delete',
                                handler: () => editor.removeNode(context.id)
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
                    if (context.payload instanceof HAGenericDeviceNode) {
                        return HAGenericDeviceNodeComponent;
                    }
                    if (context.payload instanceof KasaPlugNode) {
                        return KasaPlugNodeComponent;
                    }
                    if (context.payload instanceof SunriseSunsetNode) {
                        return SunriseSunsetNodeComponent;
                    }
                    if (context.payload instanceof TimeOfDayNode) {
                        return TimeOfDayNodeComponent;
                    }
                    if (context.payload instanceof PushbuttonNode) {
                        return PushbuttonNodeComponent;
                    }
                    if (context.payload instanceof DisplayNode) {
                        return DisplayNodeComponent;
                    }
                    if (context.payload instanceof AllInOneColorNode) {
                        return AllInOneColorNodeComponent;
                    }
                    if (context.payload instanceof WeatherLogicNode) {
                        return WeatherLogicNodeComponent;
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

        render.addPreset(Presets.contextMenu.setup());
        connection.addPreset(ConnectionPresets.classic.setup());

        editor.use(area);
        area.use(connection);
        area.use(contextMenu);
        area.use(render);

        AreaExtensions.simpleNodesOrder(area);
        AreaExtensions.showInputControl(area);

        // --- Lasso Selection Implementation ---
        const selectionBox = document.createElement('div');
        selectionBox.classList.add('selection-box');
        container.appendChild(selectionBox);

        let isSelecting = false;
        let startPos = { x: 0, y: 0 };

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
                    // selector.unselect is not available, use remove on each entity
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
            
            let selectedCount = 0;
            editor.getNodes().forEach(node => {
                const view = area.nodeViews.get(node.id);
                if (view) {
                    const nodeRect = view.element.getBoundingClientRect();
                    // console.log(`[Editor] Node ${node.id} Rect:`, nodeRect);
                    
                    if (
                        boxRect.left < nodeRect.right &&
                        boxRect.right > nodeRect.left &&
                        boxRect.top < nodeRect.bottom &&
                        boxRect.bottom > nodeRect.top
                    ) {
                        console.log(`[Editor] Selecting node ${node.id}`);
                        selector.add({
                            id: node.id,
                            label: 'node',
                            translate: (dx, dy) => {
                                const view = area.nodeViews.get(node.id);
                                if (view) {
                                    const current = view.position;
                                    area.translate(node.id, { x: current.x + dx, y: current.y + dy });
                                }
                            },
                            unmount: () => {},
                            select: () => {
                                const view = area.nodeViews.get(node.id);
                                if (view) view.element.classList.add('selected');
                            },
                            unselect: () => {
                                const view = area.nodeViews.get(node.id);
                                if (view) view.element.classList.remove('selected');
                            }
                        }, true); // accumulate = true
                        selectedCount++;
                    }
                }
            });
            console.log(`[Editor] Selected ${selectedCount} nodes`);
        };

        container.addEventListener('pointerdown', onPointerDown, { capture: true });
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

        setEditorInstance(editor);
        setAreaInstance(area);
        setEngineInstance(engine);

        return {
            destroy: () => {
                container.removeEventListener('pointerdown', onPointerDown, { capture: true });
                window.removeEventListener('pointermove', onPointerMove);
                window.removeEventListener('pointerup', onPointerUp);
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
                                await editorInstance.removeNode(entity.id);
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

                        if (nodeData.label === "HA Generic Device") node = new HAGenericDeviceNode(updateCallback);
                        else if (nodeData.label === "Kasa Plug Control") node = new KasaPlugNode(updateCallback);
                        else if (nodeData.label === "Sunrise/Sunset Trigger") node = new SunriseSunsetNode(updateCallback);
                        else if (nodeData.label === "Time of Day") node = new TimeOfDayNode(updateCallback);
                        else if (nodeData.label === "Pushbutton") node = new PushbuttonNode(updateCallback);
                        else if (nodeData.label === "Display") node = new DisplayNode(updateCallback);
                        else if (nodeData.label === "Weather Logic") node = new WeatherLogicNode(updateCallback);
                        else if (nodeData.label === "All-in-One Color Control") node = new AllInOneColorNode(() => {
                            if (engineInstance) engineInstance.reset();
                            // We don't have access to 'process' here directly in the same way, 
                            // but updateCallback does area.update + process.
                            // For paste, we might need to stick with updateCallback or find a way to pass just process.
                            // Since paste is a one-time event, updateCallback is fine.
                            // BUT, if we want the node to behave correctly AFTER paste, we need to pass the right callback.
                            // The updateCallback defined above in handleKeyDown does: area.update + engine.reset + engine.fetch.
                            // We need a version that DOES NOT do area.update.
                            
                            if (engineInstance && editorInstance) {
                                engineInstance.reset();
                                setTimeout(() => {
                                    editorInstance.getNodes().forEach(async (n) => {
                                        try { await engineInstance.fetch(n.id); } catch (e) { }
                                    });
                                }, 0);
                            }
                        });

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
            const nodes = editorInstance.getNodes().map(n => ({
                id: n.id,
                label: n.label,
                position: areaInstance.nodeViews.get(n.id)?.position || { x: 0, y: 0 },
                data: n
            }));
            const connections = editorInstance.getConnections().map(c => ({
                id: c.id,
                source: c.source,
                target: c.target,
                sourceOutput: c.sourceOutput,
                targetInput: c.targetInput
            }));
            const graphData = { nodes, connections };
            const jsonString = JSON.stringify(graphData, null, 2);

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

                if (nodeData.label === "HA Generic Device") node = new HAGenericDeviceNode(updateCallback);
                else if (nodeData.label === "Kasa Plug Control") node = new KasaPlugNode(updateCallback);
                else if (nodeData.label === "Sunrise/Sunset Trigger") node = new SunriseSunsetNode(updateCallback);
                else if (nodeData.label === "Time of Day") node = new TimeOfDayNode(updateCallback);
                else if (nodeData.label === "Pushbutton") node = new PushbuttonNode(updateCallback);
                else if (nodeData.label === "Display") node = new DisplayNode(updateCallback);
                else if (nodeData.label === "Weather Logic") node = new WeatherLogicNode(updateCallback);
                else if (nodeData.label === "All-in-One Color Control") node = new AllInOneColorNode(updateCallback);

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
            const nodes = editorInstance.getNodes().map(n => ({
                id: n.id,
                label: n.label,
                position: areaInstance.nodeViews.get(n.id)?.position || { x: 0, y: 0 },
                data: n
            }));
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

                if (nodeData.label === "HA Generic Device") node = new HAGenericDeviceNode(updateCallback);
                else if (nodeData.label === "Kasa Plug Control") node = new KasaPlugNode(updateCallback);
                else if (nodeData.label === "Sunrise/Sunset Trigger") node = new SunriseSunsetNode(updateCallback);
                else if (nodeData.label === "Time of Day") node = new TimeOfDayNode(updateCallback);
                else if (nodeData.label === "Pushbutton") node = new PushbuttonNode(updateCallback);
                else if (nodeData.label === "Display") node = new DisplayNode(updateCallback);
                else if (nodeData.label === "Weather Logic") node = new WeatherLogicNode(updateCallback);
                else if (nodeData.label === "All-in-One Color Control") node = new AllInOneColorNode(updateCallback);

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
