(function() {
    console.log("[HADeviceStateDisplayNode] Loading plugin...");

    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets || !window.T2Controls) {
        console.error("[HADeviceStateDisplayNode] Missing dependencies", {
            Rete: !!window.Rete,
            React: !!window.React,
            RefComponent: !!window.RefComponent,
            sockets: !!window.sockets,
            T2Controls: !!window.T2Controls
        });
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect } = React;
    const RefComponent = window.RefComponent;
    const sockets = window.sockets;

    // -------------------------------------------------------------------------
    // Import shared controls from T2Controls
    // -------------------------------------------------------------------------
    const { SwitchControl } = window.T2Controls;

    // -------------------------------------------------------------------------
    // NODE CLASS
    // -------------------------------------------------------------------------
    class HADeviceStateDisplayNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("HA Device State Display");
            this.width = 400;
            this.changeCallback = changeCallback;

            this.properties = {
                status: "Waiting for input data",
                debug: false,
                lastData: null
            };

            // Input: accepts device state from HAGenericDeviceNode or HADeviceStateOutputNode
            this.addInput("device_state", new ClassicPreset.Input(
                sockets.lightInfo || sockets.object || new ClassicPreset.Socket('lightInfo'), 
                "Device State"
            ));
            
            // Output: pass through the device state
            this.addOutput("device_state", new ClassicPreset.Output(
                sockets.lightInfo || sockets.object || new ClassicPreset.Socket('lightInfo'), 
                "Device State"
            ));

            // Add debug control
            this.addControl("debug", new SwitchControl("Debug Logs", false, (val) => {
                this.properties.debug = val;
            }));
        }

        log(key, message, force = false) {
            if (!this.properties.debug && !force) return;
            console.log(`[HADeviceStateDisplayNode] ${key}: ${message}`);
        }

        isActionable(entityType) {
            const actionableTypes = ["light", "switch", "fan", "cover", "media_player"];
            return actionableTypes.includes(entityType?.toLowerCase() || "");
        }

        data(inputs) {
            const inputData = inputs.device_state?.[0];
            
            if (!inputData) {
                this.properties.status = "⚠️ No input data received";
                this.properties.lastData = null;
                if (this.changeCallback) this.changeCallback();
                return { device_state: null };
            }

            // Handle both array format and object format
            let devices = [];
            if (Array.isArray(inputData)) {
                devices = inputData;
            } else if (inputData.lights && Array.isArray(inputData.lights)) {
                devices = inputData.lights;
            } else if (typeof inputData === 'object') {
                devices = [inputData];
            }

            if (devices.length === 0) {
                this.properties.status = "⚠️ No valid device data received";
                this.properties.lastData = null;
                if (this.changeCallback) this.changeCallback();
                return { device_state: null };
            }

            const device = devices[0];
            const entityType = device.entity_type || device.entityType || (device.entity_id?.split('.')[0]) || "unknown";
            const isActionable = this.isActionable(entityType);
            
            this.properties.status = `Device: ${device.name || "Unknown"} | Type: ${entityType} | Actionable: ${isActionable ? "Yes" : "No"}`;
            this.properties.lastData = device;
            
            this.log("data", `Received: ${JSON.stringify(device, null, 2)}`, false);
            
            if (this.changeCallback) this.changeCallback();
            
            // Pass through the input data
            return { device_state: inputData };
        }

        restore(state) {
            if (state.properties) {
                Object.assign(this.properties, state.properties);
            }
            if (this.controls.debug) {
                this.controls.debug.value = this.properties.debug;
            }
        }

        serialize() {
            return {
                debug: this.properties.debug
            };
        }

        toJSON() {
            return {
                id: this.id,
                label: this.label,
                properties: this.serialize()
            };
        }
    }

    // -------------------------------------------------------------------------
    // COMPONENT
    // -------------------------------------------------------------------------
    function HADeviceStateDisplayNodeComponent({ data, emit }) {
        const [status, setStatus] = useState(data.properties.status);
        const [lastData, setLastData] = useState(data.properties.lastData);

        useEffect(() => {
            data.changeCallback = () => {
                setStatus(data.properties.status);
                setLastData(data.properties.lastData);
            };
            return () => { data.changeCallback = null; };
        }, [data]);

        const isActionable = (entityType) => {
            const actionableTypes = ["light", "switch", "fan", "cover", "media_player"];
            return actionableTypes.includes(entityType?.toLowerCase() || "");
        };

        const inputs = Object.entries(data.inputs);
        const outputs = Object.entries(data.outputs);
        const controls = Object.entries(data.controls);

        return React.createElement('div', { className: 'ha-node-tron' }, [
            // Header
            React.createElement('div', { key: 'header', className: 'ha-node-header' }, [
                React.createElement('div', { key: 'title', className: 'ha-node-title' }, 'HA Device State Display'),
                React.createElement('div', { key: 'status', className: 'ha-node-status' }, status)
            ]),

            // IO Container
            React.createElement('div', { key: 'io', className: 'ha-io-container' }, [
                // Inputs
                React.createElement('div', { key: 'inputs', className: 'inputs' },
                    inputs.map(([key, input]) => React.createElement('div', { key: key, style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' } }, [
                        React.createElement(RefComponent, {
                            key: 'socket',
                            init: ref => emit({ type: "render", data: { type: "socket", element: ref, payload: input.socket, nodeId: data.id, side: "input", key } }),
                            unmount: ref => emit({ type: "unmount", data: { element: ref } })
                        }),
                        React.createElement('span', { key: 'label', className: 'ha-socket-label' }, input.label)
                    ]))
                ),
                // Outputs
                React.createElement('div', { key: 'outputs', className: 'outputs' },
                    outputs.map(([key, output]) => React.createElement('div', { key: key, style: { display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end', marginBottom: '4px' } }, [
                        React.createElement('span', { key: 'label', className: 'ha-socket-label' }, output.label),
                        React.createElement(RefComponent, {
                            key: 'socket',
                            init: ref => emit({ type: "render", data: { type: "socket", element: ref, payload: output.socket, nodeId: data.id, side: "output", key } }),
                            unmount: ref => emit({ type: "unmount", data: { element: ref } })
                        })
                    ]))
                )
            ]),

            // Controls
            React.createElement('div', { key: 'controls', className: 'ha-controls-container' },
                controls.map(([key, control]) => React.createElement(RefComponent, {
                    key: key,
                    init: ref => emit({ type: "render", data: { type: "control", element: ref, payload: control } }),
                    unmount: ref => emit({ type: "unmount", data: { element: ref } })
                }))
            ),

            // Data Display
            React.createElement('div', { 
                key: 'data-display',
                style: { 
                    padding: '10px',
                    margin: '0 15px 15px',
                    background: 'rgba(0, 20, 30, 0.4)',
                    borderRadius: '4px',
                    maxHeight: '150px',
                    overflowY: 'auto',
                    border: '1px solid rgba(0, 243, 255, 0.2)'
                },
                onPointerDown: (e) => e.stopPropagation()
            }, lastData ? [
                React.createElement('div', { 
                    key: 'actionable',
                    style: { 
                        color: isActionable(lastData.entity_type || lastData.entityType) ? '#00ff88' : '#ff6b6b',
                        marginBottom: '8px',
                        fontWeight: '600',
                        fontSize: '11px'
                    }
                }, `Actionable: ${isActionable(lastData.entity_type || lastData.entityType) ? 'Yes ✓' : 'No ✗'}`),
                React.createElement('div', { 
                    key: 'raw-label',
                    style: { color: '#00f3ff', marginBottom: '4px', fontSize: '10px', textTransform: 'uppercase' }
                }, 'Raw Data:'),
                React.createElement('pre', { 
                    key: 'raw-data',
                    style: { 
                        margin: 0, 
                        fontSize: '10px',
                        fontFamily: 'monospace',
                        color: '#b0bec5',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all'
                    }
                }, JSON.stringify(lastData, null, 2))
            ] : React.createElement('span', { style: { color: 'rgba(0, 243, 255, 0.5)', fontSize: '11px' } }, 'No valid device data received'))
        ]);
    }

    // Note: SwitchControl component is already registered by 00_SharedControlsPlugin.js

    // -------------------------------------------------------------------------
    // REGISTER
    // -------------------------------------------------------------------------
    window.nodeRegistry.register('HADeviceStateDisplayNode', {
        label: "HA Device State Display",
        category: "Home Assistant",
        nodeClass: HADeviceStateDisplayNode,
        factory: (cb) => new HADeviceStateDisplayNode(cb),
        component: HADeviceStateDisplayNodeComponent
    });

    console.log("[HADeviceStateDisplayNode] Registered");
})();
