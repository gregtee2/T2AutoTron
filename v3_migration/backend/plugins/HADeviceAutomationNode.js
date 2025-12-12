(function() {
    // Debug: console.log("[HADeviceAutomationNode] Loading plugin...");

    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets || !window.T2Controls || !window.T2HAUtils) {
        console.error("[HADeviceAutomationNode] Missing dependencies", {
            Rete: !!window.Rete,
            React: !!window.React,
            RefComponent: !!window.RefComponent,
            sockets: !!window.sockets,
            T2Controls: !!window.T2Controls,
            T2HAUtils: !!window.T2HAUtils
        });
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect, useRef } = React;
    const RefComponent = window.RefComponent;
    const sockets = window.sockets;

    // -------------------------------------------------------------------------
    // Import shared controls from T2Controls
    // -------------------------------------------------------------------------
    const { ButtonControl, DropdownControl, SwitchControl, HelpIcon } = window.T2Controls;

    // -------------------------------------------------------------------------
    // Import shared HA utilities from T2HAUtils (DRY)
    // -------------------------------------------------------------------------
    const { fieldMapping, getFieldsForEntityType } = window.T2HAUtils;

    // -------------------------------------------------------------------------
    // TOOLTIPS
    // -------------------------------------------------------------------------
    const tooltips = {
        node: "Extracts specific fields from device state for use in automations.\n\nAdd fields dynamically to output: brightness, color, power, temperature, etc.\n\nConnect to HADeviceStateOutput or HAGenericDevice.",
        inputs: {
            device_state: "Device state object from an HA node."
        },
        controls: {
            addField: "Add a new output field.\n\nAvailable fields depend on device type.",
            removeField: "Remove the last added field.",
            resetFields: "Clear all field outputs."
        }
    };

    // -------------------------------------------------------------------------
    // NODE CLASS
    // -------------------------------------------------------------------------

    // -------------------------------------------------------------------------
    // NODE CLASS
    // -------------------------------------------------------------------------
    class HADeviceAutomationNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("HA Device Automation");
            this.width = 420;
            this.changeCallback = changeCallback;

            this.properties = {
                status: "Waiting for input data",
                debug: false,
                lastEntityType: "unknown",
                selectedFields: [],
                lastOutputValues: {},
                lastInputDeviceId: null
            };

            // Input: accepts device state
            this.addInput("device_state", new ClassicPreset.Input(
                sockets.lightInfo || sockets.object || new ClassicPreset.Socket('lightInfo'),
                "Device State"
            ));

            // Dynamic outputs will be added based on selected fields
            this.dynamicOutputs = [];

            // Controls
            this.addControl("add_field", new ButtonControl("➕ Add Field", () => this.onAddField()));
            this.addControl("remove_field", new ButtonControl("➖ Remove Field", () => this.onRemoveField()));
            this.addControl("reset_fields", new ButtonControl("🔄 Reset Fields", () => this.onResetFields()));
            this.addControl("debug", new SwitchControl("Debug Logs", false, (v) => { this.properties.debug = v; }));

            // Field selectors will be added dynamically
            this.fieldSelectorCount = 0;

            // Listen for device state updates via Socket.IO
            this.initializeSocketListener();
        }

        initializeSocketListener() {
            if (window.socket) {
                // Listen for ANY device state update - we'll check if it affects our input
                this._onDeviceStateUpdate = (data) => {
                    // If we're tracking a device and this update is for it, trigger refresh
                    const deviceId = data.id ? data.id.replace("ha_", "") : data.entity_id;
                    if (this.properties.lastInputDeviceId && deviceId === this.properties.lastInputDeviceId) {
                        this.log("socket", `Received update for tracked device: ${deviceId}`, false);
                        if (this.changeCallback) this.changeCallback();
                    }
                };
                window.socket.on("device-state-update", this._onDeviceStateUpdate);
                
                // Listen for upstream device selection changes
                // This is a custom event that HADeviceStateOutputNode emits when device changes
                this._onUpstreamDeviceChange = (event) => {
                    this.log("event", `Upstream device changed, clearing cache`, false);
                    // Clear our cache so we don't show stale data
                    this.properties.lastOutputValues = {};
                    this.properties.lastInputDeviceId = null;
                    if (this.changeCallback) this.changeCallback();
                };
                window.addEventListener('ha-device-selection-changed', this._onUpstreamDeviceChange);
            }
        }

        // Cleanup listeners when node is removed
        destroy() {
            if (window.socket && this._onDeviceStateUpdate) {
                window.socket.off("device-state-update", this._onDeviceStateUpdate);
            }
            if (this._onUpstreamDeviceChange) {
                window.removeEventListener('ha-device-selection-changed', this._onUpstreamDeviceChange);
            }
        }

        log(key, message, force = false) {
            if (!this.properties.debug && !force) return;
            console.log(`[HADeviceAutomationNode] ${key}: ${message}`);
        }

        getAvailableFields(entityType) {
            return fieldMapping[entityType?.toLowerCase()] || fieldMapping.unknown;
        }

        onAddField() {
            if (this.fieldSelectorCount >= 10) {
                this.properties.status = "Max 10 fields reached";
                if (this.changeCallback) this.changeCallback();
                return;
            }

            const entityType = this.properties.lastEntityType || "unknown";
            const availableFields = this.getAvailableFields(entityType);
            const usedFields = this.properties.selectedFields.filter(f => f && f !== "Select Field");
            const remainingFields = availableFields.filter(f => !usedFields.includes(f));

            if (remainingFields.length === 0) {
                this.properties.status = "No more fields available";
                if (this.changeCallback) this.changeCallback();
                return;
            }

            this.fieldSelectorCount++;
            const controlKey = `field_${this.fieldSelectorCount}`;
            
            const control = new DropdownControl(
                `Field ${this.fieldSelectorCount}`,
                ["Select Field", ...remainingFields],
                "Select Field",
                (value) => this.onFieldSelected(controlKey, value)
            );
            
            this.addControl(controlKey, control);
            this.properties.selectedFields.push(null);

            this.properties.status = `Added field selector ${this.fieldSelectorCount}`;
            this.log("AddField", `Added field selector ${this.fieldSelectorCount}`, false);
            if (this.changeCallback) this.changeCallback();
        }

        onRemoveField() {
            if (this.fieldSelectorCount === 0) {
                this.properties.status = "No fields to remove";
                if (this.changeCallback) this.changeCallback();
                return;
            }

            const controlKey = `field_${this.fieldSelectorCount}`;
            const removedField = this.properties.selectedFields.pop();

            // Remove the control
            if (this.controls[controlKey]) {
                delete this.controls[controlKey];
            }

            // Remove corresponding output if it exists
            if (removedField && removedField !== "Select Field") {
                const outputKey = `out_${removedField}`;
                if (this.outputs[outputKey]) {
                    this.removeOutput(outputKey);
                    this.dynamicOutputs = this.dynamicOutputs.filter(o => o !== outputKey);
                }
            }

            this.fieldSelectorCount--;
            this.updateStatus();
            this.log("RemoveField", `Removed field selector, count=${this.fieldSelectorCount}`, false);
            if (this.changeCallback) this.changeCallback();
        }

        onResetFields() {
            // Remove all field selectors
            for (let i = this.fieldSelectorCount; i > 0; i--) {
                const controlKey = `field_${i}`;
                if (this.controls[controlKey]) {
                    delete this.controls[controlKey];
                }
            }

            // Remove all dynamic outputs
            this.dynamicOutputs.forEach(outputKey => {
                if (this.outputs[outputKey]) {
                    this.removeOutput(outputKey);
                }
            });

            this.dynamicOutputs = [];
            this.fieldSelectorCount = 0;
            this.properties.selectedFields = [];
            this.properties.lastOutputValues = {};
            this.properties.status = "No fields selected";

            this.log("ResetFields", "All fields reset", false);
            if (this.changeCallback) this.changeCallback();
        }

        onFieldSelected(controlKey, value) {
            const index = parseInt(controlKey.split('_')[1]) - 1;

            if (value === "Select Field") {
                const oldField = this.properties.selectedFields[index];
                this.properties.selectedFields[index] = null;

                // Remove corresponding output
                if (oldField && oldField !== "Select Field") {
                    const outputKey = `out_${oldField}`;
                    if (this.outputs[outputKey]) {
                        this.removeOutput(outputKey);
                        this.dynamicOutputs = this.dynamicOutputs.filter(o => o !== outputKey);
                    }
                }

                this.updateStatus();
                if (this.changeCallback) this.changeCallback();
                return;
            }

            // Check if field is already selected
            if (this.properties.selectedFields.includes(value)) {
                this.properties.status = `Field "${value}" already selected`;
                // Reset the dropdown
                if (this.controls[controlKey]) {
                    this.controls[controlKey].value = "Select Field";
                    if (this.controls[controlKey].updateDropdown) {
                        this.controls[controlKey].updateDropdown();
                    }
                }
                if (this.changeCallback) this.changeCallback();
                return;
            }

            // Remove old output if replacing a field
            const oldField = this.properties.selectedFields[index];
            if (oldField && oldField !== "Select Field") {
                const oldOutputKey = `out_${oldField}`;
                if (this.outputs[oldOutputKey]) {
                    this.removeOutput(oldOutputKey);
                    this.dynamicOutputs = this.dynamicOutputs.filter(o => o !== oldOutputKey);
                }
            }

            // Set the new field
            this.properties.selectedFields[index] = value;

            // Add new output
            const outputKey = `out_${value}`;
            if (!this.outputs[outputKey]) {
                this.addOutput(outputKey, new ClassicPreset.Output(
                    sockets.any || new ClassicPreset.Socket('any'),
                    value
                ));
                this.dynamicOutputs.push(outputKey);
            }

            this.updateStatus();
            this.log("FieldSelected", `Selected field "${value}" at index ${index}`, false);
            if (this.changeCallback) this.changeCallback();
        }

        updateStatus() {
            const activeFields = this.properties.selectedFields.filter(f => f && f !== "Select Field");
            this.properties.status = activeFields.length > 0
                ? `Fields: ${activeFields.join(", ")}`
                : "No fields selected";
        }

        getFieldValue(device, field) {
            if (!device) return null;
            const entityType = device.entity_type?.toLowerCase() || device.entityType?.toLowerCase();

            switch (field) {
                case "state":
                    if (entityType === "media_player") {
                        return device.status || device.state || null;
                    } else if (entityType === "binary_sensor") {
                        const status = (device.status || device.state)?.toLowerCase?.();
                        if (status === "open") return true;
                        if (status === "closed") return false;
                        return status || null;
                    } else {
                        const status = (device.status || device.state)?.toLowerCase?.();
                        if (status === "on") return true;
                        if (status === "off") return false;
                        return status || null;
                    }
                case "hue":
                case "saturation":
                case "brightness":
                case "position":
                case "latitude":
                case "longitude":
                case "percentage":
                    return typeof device[field] === "number" ? device[field] : null;
                case "volume_level":
                    return typeof device.volume === "number" ? device.volume : device.attributes?.volume_level || null;
                case "battery":
                case "unit":
                case "zone":
                case "condition":
                    return device[field] !== undefined ? device[field] : device.attributes?.[field] || null;
                case "value":
                    // For sensors, value is the main reading - return as number if possible
                    if (device.value !== undefined) {
                        const numVal = parseFloat(device.value);
                        return !isNaN(numVal) ? numVal : device.value;
                    }
                    if (device.state !== undefined) {
                        const numVal = parseFloat(device.state);
                        return !isNaN(numVal) ? numVal : device.state;
                    }
                    return device.attributes?.value || null;
                case "temperature":
                case "pressure":
                case "humidity":
                case "wind_speed":
                case "battery_level":
                    // First check if property exists directly on device
                    if (typeof device[field] === "number") return device[field];
                    if (typeof device.attributes?.[field] === "number") return device.attributes[field];
                    // For sensors, these values are often in device.value or device.state
                    // Check if entity_id contains the field name (e.g., sensor.xxx_temperature)
                    if (entityType === "sensor") {
                        const entityId = device.entity_id || "";
                        if (entityId.toLowerCase().includes(field.toLowerCase())) {
                            // This sensor IS the temperature/pressure/etc sensor, so use its value
                            if (device.value !== undefined) {
                                const numVal = parseFloat(device.value);
                                return !isNaN(numVal) ? numVal : null;
                            }
                            if (device.state !== undefined) {
                                const numVal = parseFloat(device.state);
                                return !isNaN(numVal) ? numVal : null;
                            }
                        }
                    }
                    return null;
                case "media_title":
                case "media_content_type":
                case "media_artist":
                case "repeat":
                    return device[field] !== undefined ? device[field] : device.attributes?.[field] || null;
                case "shuffle":
                    return typeof device[field] === "boolean" ? device[field] : typeof device.attributes?.shuffle === "boolean" ? device.attributes.shuffle : null;
                case "supported_features":
                    return typeof device[field] === "number" ? device[field] : typeof device.attributes?.supported_features === "number" ? device.attributes.supported_features : null;
                case "open":
                case "on":
                    const status = (device.status || device.state)?.toLowerCase?.();
                    return status === "on" || status === "open";
                default:
                    return device[field] !== undefined ? device[field] : device.attributes?.[field] || null;
            }
        }

        data(inputs) {
            const inputData = inputs.device_state?.[0];
            const result = {};

            if (!inputData) {
                this.properties.status = "⚠️ No input data received";
                this.properties.lastInputDeviceId = null;
                // Clear cached values when no input
                this.properties.lastOutputValues = {};
                // Return nulls for all outputs
                this.dynamicOutputs.forEach(outputKey => {
                    result[outputKey] = null;
                });
                return result;
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
                this.properties.status = "⚠️ No valid device data";
                this.properties.lastInputDeviceId = null;
                this.properties.lastOutputValues = {};
                this.dynamicOutputs.forEach(outputKey => {
                    result[outputKey] = null;
                });
                return result;
            }

            const device = devices[0];
            const entityType = device.entity_type?.toLowerCase() || device.entityType?.toLowerCase() || (device.entity_id?.split('.')[0]) || "unknown";
            
            // Track the device we're receiving data from for socket updates
            const deviceId = device.entity_id || device.light_id;
            
            // If device changed, clear old cached values first
            if (deviceId !== this.properties.lastInputDeviceId) {
                this.log("data", `Device changed from ${this.properties.lastInputDeviceId} to ${deviceId} - clearing cache`, false);
                this.properties.lastOutputValues = {};
                this.properties.lastInputDeviceId = deviceId;
            }

            // Check if entity type changed
            if (entityType !== this.properties.lastEntityType && this.dynamicOutputs.length > 0) {
                this.log("data", `Entity type changed from ${this.properties.lastEntityType} to ${entityType}`, false);
                // NOTE: Avoid mutating controls/outputs inside data(); keep this pure.
                // Dropdown refresh is handled via user interaction and restore().
            }
            this.properties.lastEntityType = entityType;

            // Get values for each selected field - compute fresh values
            const activeFields = this.properties.selectedFields.filter(f => f && f !== "Select Field");

            activeFields.forEach(field => {
                const value = this.getFieldValue(device, field);
                const outputKey = `out_${field}`;
                result[outputKey] = value;
                this.properties.lastOutputValues[field] = value;
                this.log("data", `Field ${field} = ${JSON.stringify(value)}`, false);
            });

            // Ensure all dynamic outputs have a value (null for any not computed above)
            this.dynamicOutputs.forEach(outputKey => {
                if (result[outputKey] === undefined) {
                    result[outputKey] = null;
                }
            });

            this.updateStatus();
            return result;
        }

        updateFieldDropdowns(entityType) {
            const availableFields = this.getAvailableFields(entityType);

            // Update each field selector dropdown
            for (let i = 1; i <= this.fieldSelectorCount; i++) {
                const controlKey = `field_${i}`;
                const control = this.controls[controlKey];
                if (control) {
                    const currentValue = control.value;
                    const usedFields = this.properties.selectedFields.filter((f, idx) => f && f !== "Select Field" && idx !== i - 1);
                    const remainingFields = availableFields.filter(f => !usedFields.includes(f));

                    control.values = ["Select Field", ...remainingFields];

                    // Reset if current value is no longer available
                    if (currentValue !== "Select Field" && !availableFields.includes(currentValue)) {
                        control.value = "Select Field";
                        this.properties.selectedFields[i - 1] = null;

                        // Remove the output
                        const outputKey = `out_${currentValue}`;
                        if (this.outputs[outputKey]) {
                            this.removeOutput(outputKey);
                            this.dynamicOutputs = this.dynamicOutputs.filter(o => o !== outputKey);
                        }
                    }

                    if (control.updateDropdown) {
                        control.updateDropdown();
                    }
                }
            }
        }

        restore(state) {
            if (state.properties) {
                Object.assign(this.properties, state.properties);
            }

            // Restore debug control
            if (this.controls.debug) {
                this.controls.debug.value = this.properties.debug;
            }

            // Restore field selectors and outputs
            const selectedFields = state.properties?.selectedFields || [];
            const entityType = this.properties.lastEntityType || "unknown";
            const availableFields = this.getAvailableFields(entityType);

            selectedFields.forEach((field, index) => {
                if (field && field !== "Select Field") {
                    this.fieldSelectorCount++;
                    const controlKey = `field_${this.fieldSelectorCount}`;

                    const usedFields = selectedFields.slice(0, index).filter(f => f && f !== "Select Field");
                    const remainingFields = availableFields.filter(f => !usedFields.includes(f) || f === field);

                    const control = new DropdownControl(
                        `Field ${this.fieldSelectorCount}`,
                        ["Select Field", ...remainingFields],
                        field,
                        (value) => this.onFieldSelected(controlKey, value)
                    );
                    this.addControl(controlKey, control);

                    // Add output
                    const outputKey = `out_${field}`;
                    if (!this.outputs[outputKey]) {
                        this.addOutput(outputKey, new ClassicPreset.Output(
                            sockets.any || new ClassicPreset.Socket('any'),
                            field
                        ));
                        this.dynamicOutputs.push(outputKey);
                    }
                }
            });

            this.properties.selectedFields = selectedFields;
            this.updateStatus();
        }

        serialize() {
            return {
                debug: this.properties.debug,
                lastEntityType: this.properties.lastEntityType,
                selectedFields: this.properties.selectedFields,
                lastOutputValues: this.properties.lastOutputValues,
                status: this.properties.status
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
    function HADeviceAutomationNodeComponent({ data, emit }) {
        const [status, setStatus] = useState(data.properties.status);
        const [outputValues, setOutputValues] = useState({});
        const [, forceUpdate] = useState(0);
        const lastValuesRef = React.useRef('{}');
        const lastStatusRef = React.useRef('');

        // Sync UI with data.properties (which gets updated in data() method)
        useEffect(() => {
            // Poll for value changes since data() is pure and can't call changeCallback
            const interval = setInterval(() => {
                const currentValues = data.properties.lastOutputValues || {};
                const currentStatus = data.properties.status || '';
                const currentValuesStr = JSON.stringify(currentValues);
                
                // Check if values changed using refs to avoid re-creating interval
                if (currentValuesStr !== lastValuesRef.current || currentStatus !== lastStatusRef.current) {
                    lastValuesRef.current = currentValuesStr;
                    lastStatusRef.current = currentStatus;
                    setOutputValues({ ...currentValues });
                    setStatus(currentStatus);
                }
            }, 200); // Poll every 200ms for responsive updates

            return () => clearInterval(interval);
        }, [data]); // Only depend on data, not on state

        useEffect(() => {
            const originalCallback = data.changeCallback;
            data.changeCallback = () => {
                setStatus(data.properties.status);
                setOutputValues({ ...data.properties.lastOutputValues });
                forceUpdate(n => n + 1);
                if (originalCallback) originalCallback();
            };
            return () => { data.changeCallback = originalCallback; };
        }, [data]);

        const inputs = Object.entries(data.inputs);
        const outputs = Object.entries(data.outputs);
        const controls = Object.entries(data.controls);

        // Separate button controls from field selectors
        const buttonControls = controls.filter(([key]) => ['add_field', 'remove_field', 'reset_fields', 'debug'].includes(key));
        const fieldControls = controls.filter(([key]) => key.startsWith('field_'));

        return React.createElement('div', { className: 'ha-node-tron' }, [
            // Header
            React.createElement('div', { key: 'header', className: 'ha-node-header' }, [
                React.createElement('div', { key: 'title', className: 'ha-node-title' }, 'HA Device Automation'),
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
                    outputs.map(([key, output]) => {
                        const fieldName = key.replace('out_', '');
                        const value = outputValues[fieldName];
                        const displayValue = value !== undefined && value !== null ? 
                            (typeof value === 'number' ? value.toFixed(3).replace(/\.?0+$/, '') : JSON.stringify(value)) : 
                            '—';
                        
                        return React.createElement('div', { key: key, style: { display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end', marginBottom: '6px' } }, [
                            React.createElement('span', { key: 'label', className: 'ha-socket-label' }, output.label),
                            React.createElement('span', { 
                                key: 'value', 
                                style: { 
                                    fontSize: '14px', 
                                    color: '#00f3ff', 
                                    fontFamily: 'monospace',
                                    fontWeight: '600',
                                    backgroundColor: 'rgba(0, 243, 255, 0.1)',
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    minWidth: '50px',
                                    textAlign: 'right'
                                }
                            }, displayValue),
                            React.createElement(RefComponent, {
                                key: 'socket',
                                init: ref => emit({ type: "render", data: { type: "socket", element: ref, payload: output.socket, nodeId: data.id, side: "output", key } }),
                                unmount: ref => emit({ type: "unmount", data: { element: ref } })
                            })
                        ]);
                    })
                )
            ]),

            // Button Controls Row
            React.createElement('div', { 
                key: 'button-controls', 
                style: { 
                    padding: '10px 15px', 
                    display: 'flex', 
                    gap: '8px', 
                    flexWrap: 'wrap',
                    borderTop: '1px solid rgba(0, 243, 255, 0.2)'
                } 
            },
                buttonControls.map(([key, control]) => React.createElement(RefComponent, {
                    key: key,
                    init: ref => emit({ type: "render", data: { type: "control", element: ref, payload: control } }),
                    unmount: ref => emit({ type: "unmount", data: { element: ref } })
                }))
            ),

            // Field Selectors
            fieldControls.length > 0 && React.createElement('div', { 
                key: 'field-controls', 
                className: 'ha-controls-container',
                style: { maxHeight: '200px' }
            },
                fieldControls.map(([key, control]) => React.createElement(RefComponent, {
                    key: key,
                    init: ref => emit({ type: "render", data: { type: "control", element: ref, payload: control } }),
                    unmount: ref => emit({ type: "unmount", data: { element: ref } })
                }))
            )
        ]);
    }

    // Note: Control components are already registered by 00_SharedControlsPlugin.js

    // -------------------------------------------------------------------------
    // REGISTER
    // -------------------------------------------------------------------------
    window.nodeRegistry.register('HADeviceAutomationNode', {
        label: "HA Device Automation",
        category: "Home Assistant",
        nodeClass: HADeviceAutomationNode,
        factory: (cb) => new HADeviceAutomationNode(cb),
        component: HADeviceAutomationNodeComponent
    });

    // console.log("[HADeviceAutomationNode] Registered");
})();
