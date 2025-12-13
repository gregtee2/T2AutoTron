/**
 * HueLightNode.js - Philips Hue Light Control Node
 * 
 * Direct Hue Bridge control without Home Assistant dependency.
 * Uses same styling and structure as HAGenericDeviceNode.
 */
(function() {
    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets) {
        console.error("[HueLightNode] Missing dependencies");
        return;
    }

    // Check for shared controls
    if (!window.T2Controls) {
        console.error("[HueLightNode] Missing T2Controls - ensure 00_SharedControlsPlugin.js loads first");
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect, useRef } = React;
    const RefComponent = window.RefComponent;
    const sockets = window.sockets;

    // Import shared controls from T2Controls (DRY)
    const {
        ButtonControl,
        DropdownControl,
        StatusIndicatorControl,
        ColorBarControl,
        HelpIcon,
        THEME,
        stopPropagation
    } = window.T2Controls;

    // -------------------------------------------------------------------------
    // TOOLTIPS
    // -------------------------------------------------------------------------
    const tooltips = {
        node: "Control Philips Hue lights directly via the Hue Bridge.\n\nNo Home Assistant required - connects directly to your Hue Bridge.\n\nConnect trigger to turn devices on/off.\nConnect HSV Info to control light color.",
        inputs: {
            trigger: "Boolean signal to control lights.\n\nTRUE = turn on, FALSE = turn off",
            hsv_info: "HSV color object from color nodes.\n\nFormat: { hue: 0-1, saturation: 0-1, brightness: 0-254 }\n\nApplies color to all selected lights."
        },
        outputs: {
            all_devices: "Array of all selected light states.\n\nUseful for chaining to other nodes."
        },
        controls: {
            addDevice: "Add a new Hue light to control",
            removeDevice: "Remove the last added light",
            refresh: "Refresh list of available lights from Hue Bridge",
            trigger: "Manually trigger all lights with current settings"
        }
    };

    // -------------------------------------------------------------------------
    // NODE CLASS
    // -------------------------------------------------------------------------
    class HueLightNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("Hue Lights");
            this.width = 420;
            this.changeCallback = changeCallback;

            this.properties = {
                selectedDeviceIds: [],
                selectedDeviceNames: [],
                status: "Initializing...",
                bridgeConnected: false,
                transitionTime: 1000,
                customTitle: ""
            };

            this.devices = [];  // Available devices from Hue Bridge
            this.perDeviceState = {};
            this.lastTriggerValue = undefined;
            this.lastHsvInput = null;
            this.hsvDebounceTimer = null;

            try {
                this.addInput("trigger", new ClassicPreset.Input(sockets.boolean || new ClassicPreset.Socket('boolean'), "Trigger"));
                this.addInput("hsv_info", new ClassicPreset.Input(sockets.object || new ClassicPreset.Socket('object'), "HSV Info"));
                this.addOutput("all_devices", new ClassicPreset.Output(sockets.lightInfo || new ClassicPreset.Socket('lightInfo'), "All Devices"));
            } catch (e) {
                console.error("[HueLightNode] Error adding sockets:", e);
            }

            this.setupControls();
            
            // Defer initial fetch until after node is fully initialized (has id)
            setTimeout(() => this.fetchDevices(), 100);
        }

        setupControls() {
            // Filter dropdown (to match HA node)
            this.addControl("filter", new DropdownControl("Filter Devices", ["All", "Lights", "Groups"], "All", (v) => {
                this.properties.filterType = v;
                this.triggerUpdate();
            }));

            // Add device button
            this.addControl("add_device", new ButtonControl("+ Add Device", () => this.onAddDevice(), { variant: 'primary' }));

            // Remove device button
            this.addControl("remove_device", new ButtonControl("− Remove Device", () => this.onRemoveDevice(), { variant: 'danger' }));

            // Refresh button
            this.addControl("refresh", new ButtonControl("🔄 Refresh", () => this.fetchDevices(), { variant: 'primary' }));

            // Toggle All button (toggles based on current state)
            this.addControl("toggle_all", new ButtonControl("⚡ Toggle All", () => this.onToggleAll(), { variant: 'success' }));

            // All Off button
            this.addControl("all_off", new ButtonControl("⏹ All Off", () => this.onAllOff(), { variant: 'danger' }));

            // Transition time
            this.addControl("transition", new window.T2Controls.NumberControl("Transition (ms)", 1000, (v) => {
                this.properties.transitionTime = v;
            }, { min: 0, max: 10000, step: 100 }));
        }

        triggerUpdate() {
            // Only trigger if node is fully initialized (has id)
            if (this.id && this.changeCallback) this.changeCallback();
        }

        updateStatus(msg) {
            this.properties.status = msg;
            // Safe update - won't error if node not fully initialized
            if (this.id && this.changeCallback) this.changeCallback();
        }

        getDeviceOptions() {
            const options = this.devices.map(d => d.name);
            options.sort((a, b) => a.localeCompare(b));
            return options;
        }

        async fetchDevices() {
            this.updateStatus("Fetching Hue lights...");
            try {
                const fetchFn = window.apiFetch || fetch;
                const response = await fetchFn('/api/lights/hue');
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                const data = await response.json();
                
                if (data.success && Array.isArray(data.lights)) {
                    this.devices = data.lights.map(light => ({
                        id: `hue_${light.id}`,
                        name: light.name || `Light ${light.id}`,
                        rawId: light.id,
                        state: light.state || {}
                    }));
                    this.properties.bridgeConnected = true;
                    this.updateStatus(`Loaded ${this.devices.length} Hue light(s)`);
                    
                    // Update dropdowns for existing devices
                    this.properties.selectedDeviceIds.forEach((id, index) => {
                        const ctrl = this.controls[`device_${index}_select`];
                        if (ctrl) {
                            ctrl.values = ["Select Device", ...this.getDeviceOptions()];
                            if (ctrl.updateDropdown) ctrl.updateDropdown();
                        }
                    });
                } else {
                    this.devices = [];
                    this.properties.bridgeConnected = false;
                    this.updateStatus("No lights found or Hue Bridge not configured");
                }
            } catch (error) {
                console.error('[HueLightNode] Failed to fetch devices:', error);
                this.devices = [];
                this.properties.bridgeConnected = false;
                this.updateStatus(`Error: ${error.message}`);
            }
            this.triggerUpdate();
        }

        onAddDevice() {
            const index = this.properties.selectedDeviceIds.length;
            const base = `device_${index}_`;

            this.properties.selectedDeviceIds.push(null);
            this.properties.selectedDeviceNames.push("Select Device");

            // Add device controls (same pattern as HAGenericDeviceNode)
            this.addControl(`${base}select`, new DropdownControl(
                `Device ${index + 1}`, 
                ["Select Device", ...this.getDeviceOptions()], 
                "Select Device", 
                (v) => this.onDeviceSelected(v, index)
            ));
            this.addControl(`${base}indicator`, new StatusIndicatorControl({ state: "off" }));
            this.addControl(`${base}colorbar`, new ColorBarControl({ brightness: 0, hs_color: [0, 0], entityType: "light" }));

            // Add per-device output
            this.addOutput(`device_out_${index}`, new ClassicPreset.Output(
                sockets.lightInfo || new ClassicPreset.Socket('lightInfo'), 
                `Device ${index + 1}`
            ));

            this.updateStatus(`Added device slot ${index + 1}`);
            this.triggerUpdate();
        }

        onRemoveDevice() {
            if (this.properties.selectedDeviceIds.length === 0) {
                this.updateStatus("No devices to remove");
                return;
            }

            const index = this.properties.selectedDeviceIds.length - 1;
            const base = `device_${index}_`;
            const id = this.properties.selectedDeviceIds[index];

            // Remove controls
            this.removeControl(`${base}select`);
            this.removeControl(`${base}indicator`);
            this.removeControl(`${base}colorbar`);
            this.removeOutput(`device_out_${index}`);

            // Clean up state
            if (id) delete this.perDeviceState[id];
            this.properties.selectedDeviceIds.pop();
            this.properties.selectedDeviceNames.pop();

            this.updateStatus(`Removed device slot ${index + 1}`);
            this.triggerUpdate();
        }

        onDeviceSelected(name, index) {
            const device = this.devices.find(d => d.name === name);
            const base = `device_${index}_`;

            if (device) {
                const oldId = this.properties.selectedDeviceIds[index];
                if (oldId) delete this.perDeviceState[oldId];

                this.properties.selectedDeviceIds[index] = device.id;
                this.properties.selectedDeviceNames[index] = name;

                // Fetch current state
                this.fetchDeviceState(device.rawId);
            } else {
                this.properties.selectedDeviceIds[index] = null;
                this.properties.selectedDeviceNames[index] = "Select Device";
            }
            this.triggerUpdate();
        }

        async fetchDeviceState(rawId) {
            try {
                const fetchFn = window.apiFetch || fetch;
                const response = await fetchFn(`/api/lights/hue/${rawId}`);
                if (response.ok) {
                    const data = await response.json();
                    if (data.success && data.light) {
                        const state = data.light.state || {};
                        const id = `hue_${rawId}`;
                        this.perDeviceState[id] = {
                            on: state.on || false,
                            state: state.on ? 'on' : 'off',
                            brightness: state.bri || 0,
                            // Convert Hue's 0-65535 to 0-360 degrees
                            hs_color: [
                                ((state.hue || 0) / 65535) * 360, 
                                ((state.sat || 0) / 254) * 100
                            ]
                        };
                        this.updateDeviceControls(id, this.perDeviceState[id]);
                    }
                }
            } catch (error) {
                console.error(`[HueLightNode] Failed to fetch state for ${rawId}:`, error);
            }
        }

        updateDeviceControls(id, state) {
            this.properties.selectedDeviceIds.forEach((devId, i) => {
                if (devId !== id) return;
                const base = `device_${i}_`;
                const indicator = this.controls[`${base}indicator`];
                const colorbar = this.controls[`${base}colorbar`];
                // Determine on/off state - be explicit about boolean conversion
                const isOn = state.on === true || state.state === 'on';
                const stateStr = isOn ? 'on' : 'off';
                
                // Create NEW data objects to ensure React detects the change
                if (indicator) indicator.data = { state: stateStr };
                if (colorbar) colorbar.data = { 
                    brightness: isOn ? (state.brightness ?? 0) : 0,  // Force 0 when off
                    hs_color: state.hs_color ?? [0, 0], 
                    entityType: "light",
                    state: stateStr,
                    on: isOn
                };
            });
            this.triggerUpdate();
        }

        hasLightsOn() {
            return this.properties.selectedDeviceIds.some(id => 
                id && this.perDeviceState[id]?.on
            );
        }

        async applyHSVToLights(hsvInfo) {
            const ids = this.properties.selectedDeviceIds.filter(id => 
                id && this.perDeviceState[id]?.on
            );
            
            if (ids.length === 0) return;

            console.log(`[HueLightNode] Applying HSV to ${ids.length} lights:`, hsvInfo);

            await Promise.all(ids.map(async (id) => {
                const rawId = id.replace('hue_', '');
                
                // Normalize HSV values (handle both 0-1 and 0-360/0-100 ranges)
                const hue = hsvInfo.hue <= 1 ? hsvInfo.hue : hsvInfo.hue / 360;
                const sat = hsvInfo.saturation <= 1 ? hsvInfo.saturation : hsvInfo.saturation / 100;
                const bri = hsvInfo.brightness <= 1 ? hsvInfo.brightness * 254 : 
                            hsvInfo.brightness <= 254 ? hsvInfo.brightness : 254;

                const payload = {
                    on: true,
                    hue: Math.round(hue * 65535),
                    sat: Math.round(sat * 254),
                    bri: Math.round(Math.max(1, Math.min(254, bri)))
                };

                try {
                    console.log(`[HueLightNode] HSV PUT /api/lights/hue/${rawId}/state:`, JSON.stringify(payload));
                    
                    const fetchFn = window.apiFetch || fetch;
                    const response = await fetchFn(`/api/lights/hue/${rawId}/state`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });

                    if (response.ok) {
                        this.perDeviceState[id] = {
                            ...this.perDeviceState[id],
                            hue: payload.hue,
                            sat: payload.sat,
                            brightness: payload.bri,
                            hs_color: [hsvInfo.hue * 360, hsvInfo.saturation * 100]
                        };
                        this.updateDeviceControls(id, this.perDeviceState[id]);
                    }
                } catch (e) {
                    console.error(`[HueLightNode] HSV apply failed for ${id}:`, e);
                }
            }));

            this.updateStatus("Color updated");
        }

        async onToggleAll() {
            // Toggle based on current state - if any are on, turn all off; otherwise turn all on
            const anyOn = this.properties.selectedDeviceIds.some(id => 
                id && this.perDeviceState[id]?.on
            );
            console.log(`[HueLightNode] Toggle All: anyOn=${anyOn}, will set to ${!anyOn}`);
            await this.setDevicesState(!anyOn);
        }

        async onAllOff() {
            console.log('[HueLightNode] All Off triggered');
            await this.setDevicesState(false);
        }

        async setDevicesState(turnOn, hsvInfo = null) {
            const ids = this.properties.selectedDeviceIds.filter(Boolean);
            if (ids.length === 0) {
                this.updateStatus("No devices selected");
                return;
            }

            this.updateStatus(turnOn ? "Turning On..." : "Turning Off...");
            const transitionMs = this.properties.transitionTime;

            await Promise.all(ids.map(async (id) => {
                const rawId = id.replace('hue_', '');
                
                // Build payload exactly like v2.0 did
                let payload;
                if (turnOn && hsvInfo) {
                    // ON with color
                    payload = {
                        on: true,
                        hue: Math.round((hsvInfo.hue <= 1 ? hsvInfo.hue : hsvInfo.hue / 360) * 65535),
                        sat: Math.round((hsvInfo.saturation <= 1 ? hsvInfo.saturation : hsvInfo.saturation / 100) * 254),
                        bri: Math.round(hsvInfo.brightness <= 1 ? hsvInfo.brightness * 254 : 
                                        hsvInfo.brightness <= 254 ? hsvInfo.brightness : 254)
                    };
                } else {
                    // Simple on/off (v2.0 style)
                    payload = { on: turnOn };
                }

                try {
                    console.log(`[HueLightNode] PUT /api/lights/hue/${rawId}/state:`, JSON.stringify(payload));
                    
                    const fetchFn = window.apiFetch || fetch;
                    const response = await fetchFn(`/api/lights/hue/${rawId}/state`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });

                    const data = await response.json();
                    console.log(`[HueLightNode] Response for ${rawId}:`, data);

                    if (response.ok && data.success) {
                        this.perDeviceState[id] = { 
                            ...this.perDeviceState[id], 
                            on: turnOn, 
                            state: turnOn ? "on" : "off"
                        };
                        if (turnOn && hsvInfo) {
                            this.perDeviceState[id].hue = payload.hue;
                            this.perDeviceState[id].sat = payload.sat;
                            this.perDeviceState[id].bri = payload.bri;
                        }
                        this.updateDeviceControls(id, this.perDeviceState[id]);
                    } else {
                        console.error(`[HueLightNode] API error for ${id}:`, data.error || data);
                        this.updateStatus(`Error: ${data.error || 'API failed'}`);
                    }
                } catch (e) {
                    console.error(`[HueLightNode] Set state failed for ${id}:`, e);
                    this.updateStatus(`Error: ${e.message}`);
                }
            }));

            this.updateStatus(turnOn ? "Turned On" : "Turned Off");
        }

        async data(inputs) {
            // Skip during graph loading
            if (typeof window !== 'undefined' && window.graphLoading) {
                return {};
            }

            const hsvInput = inputs.hsv_info?.[0];
            const trigger = inputs.trigger?.[0];

            // DEBUG: Log inputs received
            if (window.EDITOR_DEBUG) {
                console.log('[HueLightNode] data() received:', {
                    nodeId: this.id,
                    hsvInput: hsvInput,
                    trigger: trigger,
                    hasLightsOn: this.hasLightsOn?.()
                });
            }

            // Handle trigger changes
            if (trigger !== undefined && trigger !== this.lastTriggerValue) {
                this.lastTriggerValue = trigger;
                await this.setDevicesState(!!trigger, hsvInput);
            }
            
            // Handle HSV changes in real-time (when lights are on)
            if (hsvInput && this.hasLightsOn()) {
                const hsvChanged = !this.lastHsvInput ||
                    Math.abs((hsvInput.hue || 0) - (this.lastHsvInput.hue || 0)) > 0.001 ||
                    Math.abs((hsvInput.saturation || 0) - (this.lastHsvInput.saturation || 0)) > 0.001 ||
                    Math.abs((hsvInput.brightness || 0) - (this.lastHsvInput.brightness || 0)) > 1;
                
                if (hsvChanged) {
                    this.lastHsvInput = { ...hsvInput };
                    // Debounce HSV updates to avoid flooding the API
                    if (this.hsvDebounceTimer) clearTimeout(this.hsvDebounceTimer);
                    this.hsvDebounceTimer = setTimeout(() => {
                        this.applyHSVToLights(hsvInput);
                    }, 100); // 100ms debounce
                }
            }

            // Build output
            const deviceStates = this.properties.selectedDeviceIds
                .filter(Boolean)
                .map(id => ({
                    id,
                    ...this.perDeviceState[id]
                }));

            const outputs = { all_devices: deviceStates };

            // Per-device outputs
            this.properties.selectedDeviceIds.forEach((id, index) => {
                if (id) {
                    outputs[`device_out_${index}`] = this.perDeviceState[id] || {};
                }
            });

            return outputs;
        }

        restore(state) {
            if (state.properties) Object.assign(this.properties, state.properties);

            // Restore device controls
            this.properties.selectedDeviceIds.forEach((id, index) => {
                const base = `device_${index}_`;
                const name = this.properties.selectedDeviceNames[index] || "Device " + (index + 1);

                this.addControl(`${base}select`, new DropdownControl(
                    `Device ${index + 1}`, 
                    ["Select Device", ...this.getDeviceOptions()], 
                    name, 
                    (v) => this.onDeviceSelected(v, index)
                ));
                this.addControl(`${base}indicator`, new StatusIndicatorControl({ state: "off" }));
                this.addControl(`${base}colorbar`, new ColorBarControl({ brightness: 0, hs_color: [0, 0], entityType: "light" }));
                this.addOutput(`device_out_${index}`, new ClassicPreset.Output(
                    sockets.lightInfo || new ClassicPreset.Socket('lightInfo'), 
                    `Device ${index + 1}`
                ));

                if (id) {
                    const rawId = id.replace('hue_', '');
                    this.fetchDeviceState(rawId);
                }
            });

            this.fetchDevices();
        }

        serialize() {
            return {
                selectedDeviceIds: this.properties.selectedDeviceIds || [],
                selectedDeviceNames: this.properties.selectedDeviceNames || [],
                transitionTime: this.properties.transitionTime || 1000,
                customTitle: this.properties.customTitle || ""
            };
        }
    }

    // -------------------------------------------------------------------------
    // COMPONENT (matches HAGenericDeviceNode styling)
    // -------------------------------------------------------------------------
    function HueLightNodeComponent({ data, emit }) {
        const [seed, setSeed] = useState(0);
        const [isCollapsed, setIsCollapsed] = useState(false);
        const [customTitle, setCustomTitle] = useState(data.properties.customTitle || "");
        const [isEditingTitle, setIsEditingTitle] = useState(false);
        const titleInputRef = useRef(null);

        useEffect(() => {
            data.changeCallback = () => {
                setSeed(s => s + 1);
                setCustomTitle(data.properties.customTitle || "");
            };
            return () => { data.changeCallback = null; };
        }, [data]);

        useEffect(() => {
            if (isEditingTitle && titleInputRef.current) {
                titleInputRef.current.focus();
                titleInputRef.current.select();
            }
        }, [isEditingTitle]);

        const handleTitleChange = (e) => {
            setCustomTitle(e.target.value);
            data.properties.customTitle = e.target.value;
        };

        const handleTitleBlur = () => {
            setIsEditingTitle(false);
            if (data.changeCallback) data.changeCallback();
        };

        const handleTitleKeyDown = (e) => {
            if (e.key === 'Enter') {
                setIsEditingTitle(false);
                if (data.changeCallback) data.changeCallback();
            }
            if (e.key === 'Escape') {
                setCustomTitle(data.properties.customTitle || "");
                setIsEditingTitle(false);
            }
        };

        const inputs = Object.entries(data.inputs);
        const outputs = Object.entries(data.outputs);
        const allControls = Object.entries(data.controls);

        const globalControls = [];
        const deviceGroups = {};

        allControls.forEach(([key, control]) => {
            if (key.startsWith("device_")) {
                const parts = key.split("_");
                const index = parts[1];
                if (!deviceGroups[index]) deviceGroups[index] = [];
                deviceGroups[index].push({ key, control });
            } else {
                globalControls.push({ key, control });
            }
        });

        // Check if ANY device is currently ON
        const anyDeviceOn = Object.values(data.perDeviceState || {}).some(state => 
            state?.on || state?.state === 'on'
        );
        
        // Dynamic border style based on device state
        const borderStyle = anyDeviceOn 
            ? '2px solid #00ff64' 
            : '1px solid rgba(0, 243, 255, 0.3)';
        const boxShadowStyle = anyDeviceOn 
            ? '0 0 15px rgba(0, 255, 100, 0.4), inset 0 0 10px rgba(0, 255, 100, 0.1)' 
            : 'none';

        return React.createElement('div', { 
            className: 'ha-node-tron',
            style: {
                border: borderStyle,
                boxShadow: boxShadowStyle,
                transition: 'border 0.3s ease, box-shadow 0.3s ease'
            }
        }, [
            // Header
            React.createElement('div', { key: 'header', className: 'ha-node-header' }, [
                React.createElement('div', { key: 'row', style: { display: "flex", alignItems: "center", gap: "8px", width: "100%" } }, [
                    React.createElement('div', { 
                        key: 'toggle',
                        style: { cursor: "pointer", fontSize: "12px", userSelect: "none" },
                        onPointerDown: (e) => { e.stopPropagation(); setIsCollapsed(!isCollapsed); }
                    }, isCollapsed ? "▶" : "▼"),
                    // Editable custom title
                    isEditingTitle
                        ? React.createElement('input', {
                            key: 'title-input',
                            ref: titleInputRef,
                            type: 'text',
                            className: 'ha-node-title-input',
                            value: customTitle,
                            placeholder: "Hue Lights",
                            onChange: handleTitleChange,
                            onBlur: handleTitleBlur,
                            onKeyDown: handleTitleKeyDown,
                            onPointerDown: (e) => e.stopPropagation(),
                            style: { flex: 1 }
                        })
                        : React.createElement('div', { 
                            key: 'title', 
                            className: 'ha-node-title', 
                            style: { flex: 1, cursor: 'text' },
                            onDoubleClick: (e) => { e.stopPropagation(); setIsEditingTitle(true); },
                            onPointerDown: (e) => e.stopPropagation(),
                            title: 'Double-click to edit title'
                        }, customTitle || "Hue Lights"),
                    // Hue Bridge Connection Status Indicator
                    React.createElement('div', { 
                        key: 'hue-status',
                        style: { 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '6px',
                            padding: '4px 8px',
                            borderRadius: '12px',
                            background: data.properties.bridgeConnected 
                                ? 'rgba(0, 255, 100, 0.15)' 
                                : 'rgba(255, 50, 50, 0.15)',
                            border: `1px solid ${data.properties.bridgeConnected ? '#00ff64' : '#ff3232'}`
                        }
                    }, [
                        React.createElement('div', { 
                            key: 'dot',
                            style: { 
                                width: '8px', 
                                height: '8px', 
                                borderRadius: '50%',
                                background: data.properties.bridgeConnected ? '#00ff64' : '#ff3232',
                                boxShadow: data.properties.bridgeConnected 
                                    ? '0 0 6px #00ff64' 
                                    : '0 0 6px #ff3232',
                                animation: data.properties.bridgeConnected ? 'none' : 'blink 1s infinite'
                            }
                        }),
                        React.createElement('span', { 
                            key: 'label',
                            style: { 
                                fontSize: '9px', 
                                fontWeight: 'bold',
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px',
                                color: data.properties.bridgeConnected ? '#00ff64' : '#ff3232'
                            }
                        }, data.properties.bridgeConnected ? 'HUE' : 'HUE ✕')
                    ]),
                    // Help icon with node tooltip
                    HelpIcon && React.createElement(HelpIcon, { key: 'help', text: tooltips.node, size: 14 })
                ]),
                React.createElement('div', { key: 'status', className: 'ha-node-status' }, data.properties.status)
            ]),

            // IO
            React.createElement('div', { key: 'io', className: 'ha-io-container' }, [
                React.createElement('div', { key: 'in', className: 'inputs' }, 
                    inputs.map(([key, input]) => React.createElement('div', { key: key, style: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" } }, [
                        React.createElement(RefComponent, {
                            key: 'ref',
                            init: ref => emit({ type: "render", data: { type: "socket", element: ref, payload: input.socket, nodeId: data.id, side: "input", key } }),
                            unmount: ref => emit({ type: "unmount", data: { element: ref } })
                        }),
                        React.createElement('span', { key: 'l', className: 'ha-socket-label' }, input.label),
                        HelpIcon && tooltips.inputs[key] && React.createElement(HelpIcon, { key: 'help', text: tooltips.inputs[key], size: 10 })
                    ]))
                ),
                React.createElement('div', { key: 'out', className: 'outputs' }, 
                    outputs.map(([key, output]) => React.createElement('div', { key: key, style: { display: "flex", alignItems: "center", gap: "8px", justifyContent: "flex-end", marginBottom: "4px" } }, [
                        HelpIcon && tooltips.outputs[key] && React.createElement(HelpIcon, { key: 'help', text: tooltips.outputs[key], size: 10 }),
                        React.createElement('span', { key: 'l', className: 'ha-socket-label' }, output.label),
                        React.createElement(RefComponent, {
                            key: 'ref',
                            init: ref => emit({ type: "render", data: { type: "socket", element: ref, payload: output.socket, nodeId: data.id, side: "output", key } }),
                            unmount: ref => emit({ type: "unmount", data: { element: ref } })
                        })
                    ]))
                )
            ]),

            // Collapsed View
            isCollapsed && React.createElement('div', { 
                key: 'collapsed', 
                className: 'ha-controls-container',
                onWheel: (e) => e.stopPropagation()
            }, 
                Object.entries(deviceGroups).map(([index, groupControls]) => {
                    const select = groupControls.find(c => c.key.endsWith("_select"));
                    const indicator = groupControls.find(c => c.key.endsWith("_indicator"));
                    const name = select?.control?.value || `Device ${parseInt(index) + 1}`;
                    const isOn = indicator?.control?.data?.state === "on";
                    if (name === "Select Device") return null;
                    return React.createElement('div', { key: index, style: { display: "flex", alignItems: "center", gap: "8px", fontSize: "11px", color: "#c5cdd3" } }, [
                        React.createElement('div', { key: 'dot', style: { width: "8px", height: "8px", borderRadius: "50%", background: isOn ? "#4fc3f7" : "#333", boxShadow: isOn ? "0 0 5px #4fc3f7" : "none" } }),
                        React.createElement('span', { key: 'name' }, name)
                    ]);
                })
            ),

            // Expanded View
            !isCollapsed && React.createElement('div', { 
                key: 'expanded', 
                className: 'ha-controls-container',
                onWheel: (e) => e.stopPropagation()
            }, [
                // Global Controls
                ...globalControls.map(({ key, control }) => React.createElement(RefComponent, {
                    key: key,
                    init: ref => emit({ type: "render", data: { type: "control", element: ref, payload: control } }),
                    unmount: ref => emit({ type: "unmount", data: { element: ref } })
                })),

                // Device Groups
                ...Object.entries(deviceGroups).map(([index, groupControls]) => {
                    const findControl = (suffix) => groupControls.find(c => c.key.endsWith(suffix));
                    const select = findControl("_select");
                    const indicator = findControl("_indicator");
                    const colorbar = findControl("_colorbar");

                    return React.createElement('div', { key: index, className: 'ha-device-item' }, [
                        select && React.createElement('div', { key: 'sel', style: { marginBottom: '5px' } }, React.createElement(RefComponent, {
                            init: ref => emit({ type: "render", data: { type: "control", element: ref, payload: select.control } }),
                            unmount: ref => emit({ type: "unmount", data: { element: ref } })
                        })),
                        React.createElement('div', { key: 'row', style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' } }, [
                            indicator && React.createElement('div', { key: 'ind', style: { flex: '0 0 auto' } }, React.createElement(RefComponent, {
                                init: ref => emit({ type: "render", data: { type: "control", element: ref, payload: indicator.control } }),
                                unmount: ref => emit({ type: "unmount", data: { element: ref } })
                            })),
                            colorbar && React.createElement('div', { key: 'col', style: { flex: '1 1 auto' } }, React.createElement(RefComponent, {
                                init: ref => emit({ type: "render", data: { type: "control", element: ref, payload: colorbar.control } }),
                                unmount: ref => emit({ type: "unmount", data: { element: ref } })
                            }))
                        ])
                    ]);
                })
            ])
        ]);
    }

    // -------------------------------------------------------------------------
    // REGISTER
    // -------------------------------------------------------------------------
    window.nodeRegistry.register('HueLightNode', {
        label: "Hue Lights",
        category: "Other",
        nodeClass: HueLightNode,
        factory: (cb) => new HueLightNode(cb),
        component: HueLightNodeComponent
    });

    console.log('[HueLightNode] Registered successfully');
})();
