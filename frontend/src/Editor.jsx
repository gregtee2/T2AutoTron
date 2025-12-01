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
import { SunriseSunsetNode, SunriseSunsetNodeComponent } from "./nodes/SunriseSunsetNode.jsx";
import { PushbuttonNode, PushbuttonNodeComponent } from "./nodes/PushbuttonNode.jsx";
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
            area.update("node", nodeId);
            process();
        };

        const defaultItems = ContextMenuPresets.classic.setup([
            ["HA Generic Device", () => {
                const node = new HAGenericDeviceNode(() => updateNode(node.id));
                return node;
            }],
            ["Sunrise/Sunset Trigger", () => {
                const node = new SunriseSunsetNode(() => updateNode(node.id));
                return node;
            }],
            ["Pushbutton", () => {
                const node = new PushbuttonNode(() => updateNode(node.id));
                return node;
            }]
        ]);

        const contextMenu = new ContextMenuPlugin({
            items: (context, plugin) => {
                if (context === 'root') {
                    return defaultItems(context, plugin);
                }
                if (context instanceof HAGenericDeviceNode || context instanceof SunriseSunsetNode || context instanceof PushbuttonNode) {
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
                    if (context.payload instanceof SunriseSunsetNode) {
                        return SunriseSunsetNodeComponent;
                    }
                    if (context.payload instanceof PushbuttonNode) {
                        return PushbuttonNodeComponent;
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

        // Add the HA Node
        const haNode = new HAGenericDeviceNode(() => updateNode(haNode.id));
        await editor.addNode(haNode);
        await area.translate(haNode.id, { x: 200, y: 100 });

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
            destroy: () => area.destroy(),
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

        let editorPromise = createEditor(container);
        let editorInstance = null;
        let selectorInstance = null;

        editorPromise.then((result) => {
            editorInstance = result.editor;
            selectorInstance = result.selector;
        });

        // Handle Delete Key
        const handleKeyDown = async (e) => {
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

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
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            editorPromise.then((result) => result.destroy());
        };
    }, [createEditor]);

    const handleSave = () => {
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
            localStorage.setItem('saved-graph', JSON.stringify(graphData));
            console.log('Graph saved to localStorage');
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
                    areaInstance.update("node", nodeData.id);
                    engineInstance.reset();
                    editorInstance.getNodes().forEach(async (n) => {
                        try {
                            await engineInstance.fetch(n.id);
                        } catch (e) {
                            // Ignore
                        }
                    });
                };

                if (nodeData.label === "HA Generic Device") node = new HAGenericDeviceNode(updateCallback);
                else if (nodeData.label === "Sunrise/Sunset Trigger") node = new SunriseSunsetNode(updateCallback);
                else if (nodeData.label === "Pushbutton") node = new PushbuttonNode(updateCallback);

                if (node) {
                    node.id = nodeData.id;
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
                    areaInstance.update("node", nodeData.id);
                    engineInstance.reset();
                    editorInstance.getNodes().forEach(async (n) => {
                        try {
                            await engineInstance.fetch(n.id);
                        } catch (e) {
                            // Ignore
                        }
                    });
                };

                if (nodeData.label === "HA Generic Device") node = new HAGenericDeviceNode(updateCallback);
                else if (nodeData.label === "Sunrise/Sunset Trigger") node = new SunriseSunsetNode(updateCallback);
                else if (nodeData.label === "Pushbutton") node = new PushbuttonNode(updateCallback);

                if (node) {
                    node.id = nodeData.id;
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
