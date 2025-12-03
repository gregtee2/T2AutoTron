(function() {
    console.log("[LogicConditionNode] Loading plugin...");

    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets) {
        console.error("[LogicConditionNode] Missing dependencies");
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect } = React;
    const RefComponent = window.RefComponent;
    const sockets = window.sockets;

    // -------------------------------------------------------------------------
    // CONTROLS
    // -------------------------------------------------------------------------
    class DropdownControl extends ClassicPreset.Control {
        constructor(label, values, initialValue, onChange) {
            super();
            this.label = label;
            this.values = values;
            this.value = initialValue;
            this.onChange = onChange;
        }
    }

    function DropdownControlComponent({ data }) {
        const [value, setValue] = useState(data.value);
        
        // Update local state if data.value changes externally
        useEffect(() => {
            setValue(data.value);
        }, [data.value]);

        // Update options if data.values changes
        const [options, setOptions] = useState(data.values);
        useEffect(() => {
            setOptions(data.values);
        }, [data.values]);

        const handleChange = (e) => {
            const val = e.target.value;
            setValue(val);
            data.value = val;
            if (data.onChange) data.onChange(val);
        };

        return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px' } }, [
            React.createElement('label', { style: { fontSize: '10px', color: '#aaa' } }, data.label),
            React.createElement('select', {
                value: value,
                onChange: handleChange,
                onPointerDown: (e) => e.stopPropagation(),
                onDoubleClick: (e) => e.stopPropagation()
            }, options.map(v => React.createElement('option', { key: v, value: v }, v)))
        ]);
    }

    class InputControl extends ClassicPreset.Control {
        constructor(label, initialValue, onChange, type = "text") {
            super();
            this.label = label;
            this.value = initialValue;
            this.onChange = onChange;
            this.type = type;
        }
    }

    function InputControlComponent({ data }) {
        const [value, setValue] = useState(data.value);

        useEffect(() => {
            setValue(data.value);
        }, [data.value]);

        const handleChange = (e) => {
            const val = e.target.value;
            setValue(val);
            data.value = val;
            if (data.onChange) data.onChange(val);
        };

        return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px' } }, [
            React.createElement('label', { style: { fontSize: '10px', color: '#aaa' } }, data.label),
            React.createElement('input', {
                type: data.type,
                value: value,
                onChange: handleChange,
                onPointerDown: (e) => e.stopPropagation(),
                onDoubleClick: (e) => e.stopPropagation(),
                style: {
                    background: '#222',
                    color: 'white',
                    border: '1px solid #555',
                    padding: '4px',
                    borderRadius: '4px',
                    width: '100%'
                }
            })
        ]);
    }

    // -------------------------------------------------------------------------
    // NODE CLASS
    // -------------------------------------------------------------------------
    class LogicConditionNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("Logic Condition");
            this.changeCallback = changeCallback;
            this.width = 280;

            this.properties = {
                selectedDeviceId: "",
                conditionOperator: "=",
                conditionValue: "",
                actionType: "None",
                setValue: 0,
                haToken: localStorage.getItem('ha_token') || ""
            };

            this.devices = [];
            this.deviceState = null;

            this.addInput("trigger", new ClassicPreset.Input(sockets.trigger || new ClassicPreset.Socket('trigger'), "Trigger"));
            
            this.addOutput("condition_met", new ClassicPreset.Output(sockets.trigger || new ClassicPreset.Socket('trigger'), "Condition Met"));
            this.addOutput("action", new ClassicPreset.Output(sockets.object || new ClassicPreset.Socket('object'), "Action Data"));

            this.setupControls();
            this.fetchDevices();
        }

        setupControls() {
            this.addControl("device", new DropdownControl("Device", ["Loading..."], "Loading...", (val) => {
                const device = this.devices.find(d => d.name === val);
                if (device) {
                    this.properties.selectedDeviceId = device.id;
                    this.fetchDeviceState(device.id);
                }
            }));

            this.addControl("operator", new DropdownControl("Operator", ["=", "<", ">", "<=", ">=", "!="], "=", (val) => {
                this.properties.conditionOperator = val;
            }));

            this.addControl("value", new InputControl("Condition Value", "", (val) => {
                this.properties.conditionValue = val;
            }));

            this.addControl("action", new DropdownControl("Action", ["None", "Turn On", "Turn Off", "Set Value"], "None", (val) => {
                this.properties.actionType = val;
                // Show/Hide set value control logic could be here if we dynamically added/removed controls
                // For now, we'll just keep it visible or rely on user
            }));

            this.addControl("set_value", new InputControl("Set Value (if Action is Set Value)", 0, (val) => {
                this.properties.setValue = val;
            }, "number"));
        }

        async fetchDevices() {
            try {
                const response = await fetch('/api/lights/ha/', { 
                    headers: { 'Authorization': `Bearer ${this.properties.haToken}` } 
                });
                const data = await response.json();
                if (data.success && Array.isArray(data.devices)) {
                    this.devices = data.devices;
                    const deviceNames = this.devices.map(d => d.name);
                    
                    const deviceControl = this.controls.device;
                    if (deviceControl) {
                        deviceControl.values = ["Select Device", ...deviceNames];
                        
                        // Restore selection if exists
                        const selectedDevice = this.devices.find(d => d.id === this.properties.selectedDeviceId);
                        if (selectedDevice) {
                            deviceControl.value = selectedDevice.name;
                        } else {
                            deviceControl.value = "Select Device";
                        }
                        // Force update of the control component
                        this.triggerUpdate(); 
                    }
                }
            } catch (e) {
                console.error("[LogicConditionNode] Failed to fetch devices:", e);
            }
        }

        async fetchDeviceState(id) {
            if (!id) return;
            try {
                const res = await fetch(`/api/lights/ha/${id}/state`, { 
                    headers: { 'Authorization': `Bearer ${this.properties.haToken}` } 
                });
                const data = await res.json();
                if (data.success && data.state) {
                    this.deviceState = data.state;
                }
            } catch (e) {
                console.error("[LogicConditionNode] Failed to fetch state:", e);
            }
        }

        triggerUpdate() {
            if (this.changeCallback) this.changeCallback();
        }

        async data(inputs) {
            // Check trigger
            const trigger = inputs.trigger?.[0];
            
            // If triggered (or always check?)
            // Legacy node checked on execute. Rete dataflow runs when inputs change or triggered.
            
            if (!this.properties.selectedDeviceId) return {};

            // Refresh state before checking? Or rely on last fetched?
            // Ideally we should have real-time updates via socket like HAGenericDeviceNode
            // For now, let's fetch state if triggered
            if (trigger) {
                await this.fetchDeviceState(this.properties.selectedDeviceId);
            }

            if (!this.deviceState) return {};

            let deviceValue = this.deviceState.state;
            // Normalize boolean states
            if (deviceValue === "on") deviceValue = "On";
            if (deviceValue === "off") deviceValue = "Off";
            
            // Also handle numeric attributes if needed, but state is usually string "on"/"off" or numeric string
            
            const conditionValue = this.properties.conditionValue;
            const operator = this.properties.conditionOperator;

            let conditionMet = false;

            // Simple comparison
            if (operator === "=") {
                conditionMet = deviceValue == conditionValue; // Loose equality for "1" == 1
            } else if (operator === "!=") {
                conditionMet = deviceValue != conditionValue;
            } else {
                // Numeric comparison
                const numDevice = parseFloat(deviceValue);
                const numCond = parseFloat(conditionValue);
                if (!isNaN(numDevice) && !isNaN(numCond)) {
                    if (operator === ">") conditionMet = numDevice > numCond;
                    else if (operator === "<") conditionMet = numDevice < numCond;
                    else if (operator === ">=") conditionMet = numDevice >= numCond;
                    else if (operator === "<=") conditionMet = numDevice <= numCond;
                }
            }

            if (conditionMet) {
                const actionData = {
                    deviceId: this.properties.selectedDeviceId,
                    actionType: this.properties.actionType,
                    value: this.properties.setValue
                };
                return {
                    condition_met: true, // Trigger output
                    action: actionData
                };
            }

            return {};
        }

        restore(state) {
            if (state.properties) {
                this.properties = { ...this.properties, ...state.properties };
            }
            // Controls are restored by setting their values, but we need to wait for devices to load
            // fetchDevices will handle setting the correct value if selectedDeviceId is set
            
            const operatorControl = this.controls.operator;
            if (operatorControl) operatorControl.value = this.properties.conditionOperator;

            const valueControl = this.controls.value;
            if (valueControl) valueControl.value = this.properties.conditionValue;

            const actionControl = this.controls.action;
            if (actionControl) actionControl.value = this.properties.actionType;

            const setValueControl = this.controls.set_value;
            if (setValueControl) setValueControl.value = this.properties.setValue;
        }
    }

    // -------------------------------------------------------------------------
    // COMPONENT
    // -------------------------------------------------------------------------
    function LogicConditionNodeComponent({ data, emit }) {
        const inputs = Object.entries(data.inputs);
        const outputs = Object.entries(data.outputs);
        const controls = Object.entries(data.controls);

        return React.createElement('div', { className: 'logic-node' }, [
            React.createElement('div', { className: 'header' }, data.label),
            
            React.createElement('div', { className: 'io-container' }, 
                inputs.map(([key, input]) => React.createElement('div', { key: key, className: 'socket-row' }, [
                    React.createElement(RefComponent, {
                        init: ref => emit({ type: "render", data: { type: "socket", element: ref, payload: input.socket, nodeId: data.id, side: "input", key } }),
                        unmount: ref => emit({ type: "unmount", data: { element: ref } })
                    }),
                    React.createElement('span', { style: { marginLeft: '10px', fontSize: '12px' } }, input.label)
                ]))
            ),

            React.createElement('div', { className: 'controls' }, 
                controls.map(([key, control]) => React.createElement(RefComponent, {
                    key: key,
                    init: ref => emit({ type: "render", data: { type: "control", element: ref, payload: control } }),
                    unmount: ref => emit({ type: "unmount", data: { element: ref } })
                }))
            ),

            React.createElement('div', { className: 'io-container' }, 
                outputs.map(([key, output]) => React.createElement('div', { key: key, className: 'socket-row', style: { justifyContent: 'flex-end' } }, [
                    React.createElement('span', { style: { marginRight: '10px', fontSize: '12px' } }, output.label),
                    React.createElement(RefComponent, {
                        init: ref => emit({ type: "render", data: { type: "socket", element: ref, payload: output.socket, nodeId: data.id, side: "output", key } }),
                        unmount: ref => emit({ type: "unmount", data: { element: ref } })
                    })
                ]))
            )
        ]);
    }

    window.nodeRegistry.register('LogicConditionNode', {
        label: "Logic Condition",
        category: "Logic",
        nodeClass: LogicConditionNode,
        factory: (cb) => new LogicConditionNode(cb),
        component: LogicConditionNodeComponent
    });

    console.log("[LogicConditionNode] Registered");
})();
