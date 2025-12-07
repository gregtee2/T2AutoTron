(function() {
    console.log("[HADeviceStateOutputNode] Loading plugin...");

    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets || !window.T2Controls) {
        console.error("[HADeviceStateOutputNode] Missing dependencies", {
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
    const { useState, useEffect, useCallback } = React;
    const RefComponent = window.RefComponent;
    const sockets = window.sockets;

    // -------------------------------------------------------------------------
    // Import shared controls from T2Controls
    // -------------------------------------------------------------------------
    const { DropdownControl, ButtonControl, SwitchControl } = window.T2Controls;

    // -------------------------------------------------------------------------
    // FILTER MAPS
    // -------------------------------------------------------------------------
    const filterTypeMap = {
        All: "all",
        Light: "light",
        Switch: "switch",
        Sensor: "sensor",
        "Binary Sensor": "binary_sensor",
        "Media Player": "media_player",
        Weather: "weather",
        Fan: "fan",
        Cover: "cover"
    };

    const letterRanges = {
        "All Letters": { start: "A", end: "Z" },
        "ABC": { start: "A", end: "C" },
        "DEF": { start: "D", end: "F" },
        "GHI": { start: "G", end: "I" },
        "JKL": { start: "J", end: "L" },
        "MNO": { start: "M", end: "O" },
        "PQR": { start: "P", end: "R" },
        "STU": { start: "S", end: "U" },
        "VWX": { start: "V", end: "X" },
        "YZ": { start: "Y", end: "Z" }
    };

    // -------------------------------------------------------------------------
    // NODE CLASS
    // -------------------------------------------------------------------------
    class HADeviceStateOutputNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("HA Device State Output");
            this.width = 380;
            this.changeCallback = changeCallback;

            this.properties = {
                selectedDeviceId: null,
                selectedDeviceName: null,
                status: "Select a device",
                debug: false,
                haToken: localStorage.getItem('ha_token') || "",
                filterType: "All",
                letterFilter: "All Letters"
            };

            this.devices = [];
            this.deviceManagerReady = false;
            this.perDeviceState = {};
            this.lastValidOutput = null;

            // Output socket
            this.addOutput("device_state", new ClassicPreset.Output(
                sockets.lightInfo || sockets.object || new ClassicPreset.Socket('lightInfo'), 
                "Device State"
            ));

            // Setup controls
            this.setupControls();
            this.initializeSocketIO();
            this.fetchDevices();
        }

        setupControls() {
            this.addControl("filter_type", new DropdownControl(
                "Filter Devices",
                ["All", "Light", "Switch", "Sensor", "Binary Sensor", "Media Player", "Fan", "Cover", "Weather"],
                "All",
                (v) => { 
                    console.log(`[HADeviceStateOutputNode] Filter type onChange called with: ${v}`);
                    this.properties.filterType = v;
                    console.log(`[HADeviceStateOutputNode] properties.filterType is now: ${this.properties.filterType}`);
                    this.log("filterChanged", `Filter changed to ${v}`, false);
                    // Check if current selection is still valid
                    const newOptions = this.getDeviceOptions();
                    console.log(`[HADeviceStateOutputNode] Got ${newOptions.length} options after filter change`);
                    if (this.properties.selectedDeviceName && !newOptions.includes(this.properties.selectedDeviceName)) {
                        this.properties.selectedDeviceId = null;
                        this.properties.selectedDeviceName = null;
                        this.properties.status = "Select a device";
                        this.lastValidOutput = null;
                    }
                    this.updateDeviceDropdown();
                    if (this.changeCallback) this.changeCallback();
                }
            ));

            this.addControl("letter_filter", new DropdownControl(
                "Filter by Letter",
                ["All Letters", "ABC", "DEF", "GHI", "JKL", "MNO", "PQR", "STU", "VWX", "YZ"],
                "All Letters",
                (v) => { 
                    console.log(`[HADeviceStateOutputNode] Letter filter onChange called with: ${v}`);
                    this.properties.letterFilter = v;
                    console.log(`[HADeviceStateOutputNode] properties.letterFilter is now: ${this.properties.letterFilter}`);
                    this.log("letterFilterChanged", `Letter filter changed to ${v}`, false);
                    // Check if current selection is still valid
                    const newOptions = this.getDeviceOptions();
                    console.log(`[HADeviceStateOutputNode] Got ${newOptions.length} options after letter filter change`);
                    if (this.properties.selectedDeviceName && !newOptions.includes(this.properties.selectedDeviceName)) {
                        this.properties.selectedDeviceId = null;
                        this.properties.selectedDeviceName = null;
                        this.properties.status = "Select a device";
                        this.lastValidOutput = null;
                    }
                    this.updateDeviceDropdown();
                    if (this.changeCallback) this.changeCallback();
                }
            ));

            this.addControl("device_select", new DropdownControl(
                "Select Device",
                ["Select Device"],
                "Select Device",
                (v) => this.onDeviceSelected(v)
            ));

            this.addControl("refresh", new ButtonControl("🔄 Refresh Devices", () => this.fetchDevices()));
            this.addControl("debug", new SwitchControl("Debug Logs", false, (v) => { this.properties.debug = v; }));
        }

        log(key, message, force = false) {
            if (!this.properties.debug && !force) return;
            console.log(`[HADeviceStateOutputNode] ${key}: ${message}`);
        }

        formatTime(utcTime) {
            if (!utcTime || typeof utcTime !== "string") return "Invalid";
            try {
                const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
                const date = new Date(utcTime.endsWith("Z") ? utcTime : `${utcTime}Z`);
                if (isNaN(date.getTime())) return "Invalid";
                return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "numeric", hour12: true, timeZone: userTimeZone });
            } catch (error) {
                return utcTime;
            }
        }

        initializeSocketIO() {
            if (window.socket) {
                this._onDeviceStateUpdate = (data) => this.handleDeviceStateUpdate(data);
                this._onConnect = () => {
                    this.log("socket", "Connected", false);
                    this.fetchDevices();
                };
                window.socket.on("device-state-update", this._onDeviceStateUpdate);
                window.socket.on("connect", this._onConnect);
            }
        }

        async fetchDevices() {
            if (typeof window !== 'undefined' && window.graphLoading) return;

            try {
                this.log("fetch", "Fetching devices...", false);
                const response = await fetch('/api/lights/ha/', {
                    headers: { 'Authorization': `Bearer ${this.properties.haToken}` }
                });
                const data = await response.json();
                
                if (data.success && data.devices) {
                    this.devices = data.devices
                        .filter(d => ["light", "switch", "binary_sensor", "sensor", "media_player", "weather", "fan", "cover"].includes(d.type))
                        .map(d => {
                            const entityType = d.type;
                            let state = "unknown", attributes = {};
                            
                            switch (entityType) {
                                case "binary_sensor":
                                    state = d.state.on ? "on" : "off";
                                    attributes = { battery: "unknown" };
                                    break;
                                case "sensor":
                                    state = d.state.value || d.state.state || "unknown";
                                    attributes = { unit: d.state.unit || "" };
                                    break;
                                case "light":
                                case "switch":
                                    state = d.state.on ? "on" : "off";
                                    attributes = { brightness: d.state.brightness || (d.state.on ? 100 : 0), hs_color: d.state.hs_color || [0, 0] };
                                    break;
                                case "media_player":
                                    state = d.state.state || "off";
                                    attributes = { volume_level: d.state.volume_level || 0, source: d.state.source || null };
                                    break;
                                case "weather":
                                    state = d.state.condition || "unknown";
                                    attributes = { temperature: d.state.temperature || null, humidity: d.state.humidity || null };
                                    break;
                                case "fan":
                                    state = d.state.on ? "on" : "off";
                                    attributes = { percentage: d.state.percentage || 0 };
                                    break;
                                case "cover":
                                    state = d.state.on ? "open" : "closed";
                                    attributes = { position: d.state.position || 0 };
                                    break;
                            }
                            
                            return { entity_id: d.id.replace("ha_", ""), name: d.name.trim(), entityType, state, attributes };
                        })
                        .sort((a, b) => a.name.localeCompare(b.name));
                    
                    this.deviceManagerReady = true;
                    this.properties.status = "✅ Devices fetched";
                    this.updateDeviceDropdown();
                    if (this.changeCallback) this.changeCallback();
                } else {
                    throw new Error(data.error || "No devices");
                }
            } catch (error) {
                this.log("fetchError", error.message, true);
                this.properties.status = `⚠️ ${error.message}`;
                this.devices = [];
                this.deviceManagerReady = false;
            }
        }

        getDeviceOptions() {
            const filterType = this.properties.filterType;
            const letterFilter = this.properties.letterFilter;
            const normalizedFilterType = filterTypeMap[filterType] || "all";

            console.log(`[HADeviceStateOutputNode] getDeviceOptions: filterType=${filterType}, letterFilter=${letterFilter}, normalized=${normalizedFilterType}, deviceCount=${this.devices.length}`);

            const filtered = this.devices.filter(device => {
                // Type filter
                const deviceType = device.entityType ? device.entityType.toLowerCase() : "unknown";
                const typeMatch = normalizedFilterType === "all" || deviceType === normalizedFilterType;
                if (!typeMatch) {
                    return false;
                }
                
                // Letter filter
                if (letterFilter === "All Letters") {
                    return true;
                }
                
                const range = letterRanges[letterFilter];
                if (!range) {
                    console.log(`[HADeviceStateOutputNode] No range found for letterFilter: ${letterFilter}`);
                    return true;
                }
                
                const firstLetter = device.name.trim().toUpperCase().charAt(0);
                const letterMatch = firstLetter >= range.start && firstLetter <= range.end;
                return letterMatch;
            });

            console.log(`[HADeviceStateOutputNode] getDeviceOptions: Filtered to ${filtered.length} devices: ${filtered.slice(0,3).map(d => d.name).join(', ')}...`);

            return this.deviceManagerReady && filtered.length
                ? filtered.map(d => d.name).sort((a, b) => a.localeCompare(b))
                : ["No Devices Found"];
        }

        updateDeviceDropdown() {
            const deviceControl = this.controls.device_select;
            if (deviceControl) {
                const options = this.getDeviceOptions();
                deviceControl.values = ["Select Device", ...options];
                
                // Reset to Select Device if current selection is no longer valid
                if (this.properties.selectedDeviceName && !options.includes(this.properties.selectedDeviceName)) {
                    deviceControl.value = "Select Device";
                } else if (this.properties.selectedDeviceName) {
                    deviceControl.value = this.properties.selectedDeviceName;
                } else {
                    deviceControl.value = "Select Device";
                }
                
                console.log(`[HADeviceStateOutputNode] updateDeviceDropdown: Setting ${options.length} options, updateDropdown exists: ${!!deviceControl.updateDropdown}`);
                if (deviceControl.updateDropdown) {
                    deviceControl.updateDropdown();
                    console.log(`[HADeviceStateOutputNode] updateDeviceDropdown: Called updateDropdown()`);
                }
            }
        }

        async onDeviceSelected(deviceName) {
            if (deviceName === "Select Device" || deviceName === "No Devices Found") {
                this.properties.selectedDeviceId = null;
                this.properties.selectedDeviceName = null;
                this.properties.status = "Select a device";
                this.lastValidOutput = null;
                if (this.changeCallback) this.changeCallback();
                return;
            }

            const device = this.devices.find(d => d.name.trim() === deviceName.trim());
            if (!device) {
                this.properties.status = `⚠️ Device not found: ${deviceName}`;
                this.log("onDeviceSelected", `Device not found: ${deviceName}`, true);
                if (this.changeCallback) this.changeCallback();
                return;
            }

            this.log("onDeviceSelected", `Selected device: ${device.name} (${device.entity_id})`, false);
            this.properties.selectedDeviceId = device.entity_id;
            this.properties.selectedDeviceName = device.name;
            
            // Store initial state from devices array
            this.perDeviceState[device.entity_id] = {
                state: device.state,
                attributes: device.attributes
            };
            
            // Fetch latest state from API
            await this.fetchDeviceState(device.entity_id);
            
            // Force output update
            this.lastValidOutput = null;
            if (this.changeCallback) this.changeCallback();
        }

        async fetchDeviceState(deviceId) {
            if (typeof window !== 'undefined' && window.graphLoading) return false;
            
            try {
                this.log("fetchDeviceState", `Fetching state for ${deviceId}`, false);
                const response = await fetch(`/api/lights/ha/ha_${deviceId}/state`, {
                    headers: { 'Authorization': `Bearer ${this.properties.haToken}`, 'Content-Type': 'application/json' }
                });
                
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data = await response.json();
                
                this.log("fetchDeviceState", `Response: ${JSON.stringify(data).slice(0, 200)}`, false);
                
                if (data.success && data.state) {
                    const entityType = deviceId.split(".")[0];
                    
                    // Build state based on entity type
                    let stateValue = "unknown";
                    let attributes = {};
                    
                    switch (entityType) {
                        case "sensor":
                            stateValue = data.state.value || data.state.state || "unknown";
                            attributes = { unit: data.state.unit || "", value: data.state.value };
                            break;
                        case "binary_sensor":
                            stateValue = data.state.on ? "on" : "off";
                            attributes = { battery: data.state.battery_level || "unknown" };
                            break;
                        case "media_player":
                            stateValue = data.state.state || "off";
                            attributes = { 
                                volume_level: data.state.volume_level || 0, 
                                source: data.state.source || null,
                                media_title: data.state.media_title || null
                            };
                            break;
                        case "weather":
                            stateValue = data.state.condition || data.state.state || "unknown";
                            attributes = {
                                temperature: data.state.temperature || null,
                                humidity: data.state.humidity || null,
                                wind_speed: data.state.wind_speed || null,
                                pressure: data.state.pressure || null
                            };
                            break;
                        case "fan":
                            stateValue = data.state.on ? "on" : "off";
                            attributes = { percentage: data.state.percentage || 0 };
                            break;
                        case "cover":
                            stateValue = data.state.on ? "open" : "closed";
                            attributes = { position: data.state.position || 0 };
                            break;
                        case "light":
                        case "switch":
                        default:
                            stateValue = data.state.on ? "on" : "off";
                            attributes = { 
                                brightness: data.state.brightness || (data.state.on ? 100 : 0), 
                                hs_color: data.state.hs_color || [0, 0] 
                            };
                            break;
                    }
                    
                    this.perDeviceState[deviceId] = { state: stateValue, attributes };
                    this.properties.status = `✅ ${this.properties.selectedDeviceName}: ${stateValue}`;
                    this.log("fetchDeviceState", `State updated: ${stateValue}`, false);
                    return true;
                }
                throw new Error(data.error || "No state data");
            } catch (error) {
                this.log("fetchStateError", error.message, true);
                this.properties.status = `⚠️ ${error.message}`;
                return false;
            }
        }

        handleDeviceStateUpdate(data) {
            const deviceId = data.id ? data.id.replace("ha_", "") : data.entity_id;
            if (deviceId !== this.properties.selectedDeviceId) return;
            
            const entityType = deviceId.split(".")[0];
            this.perDeviceState[deviceId] = {
                state: entityType === "sensor" ? data.value || data.state || "unknown"
                    : entityType === "binary_sensor" ? (data.on || data.state === "on" ? "on" : "off")
                    : entityType === "media_player" ? data.state || "off"
                    : (data.on || data.state === "on" ? "on" : "off"),
                attributes: entityType === "sensor" ? { unit: data.unit || "" }
                    : entityType === "binary_sensor" ? { battery: data.battery_level || "unknown" }
                    : entityType === "media_player" ? { volume_level: data.volume_level || 0, source: data.source || null }
                    : { brightness: data.brightness || 0, hs_color: data.hs_color || [0, 0] }
            };
            
            this.properties.status = `✅ ${this.properties.selectedDeviceName}: ${this.perDeviceState[deviceId].state}`;
            if (this.changeCallback) this.changeCallback();
        }

        data() {
            const deviceId = this.properties.selectedDeviceId;
            if (!deviceId) {
                this.log("data", "No device selected", false);
                return { device_state: this.lastValidOutput };
            }

            const device = this.devices.find(d => d.entity_id === deviceId);
            if (!device) {
                this.log("data", `Device not found in list: ${deviceId}`, false);
                return { device_state: this.lastValidOutput };
            }

            const state = this.perDeviceState[deviceId] || { state: device.state || "unknown", attributes: device.attributes || {} };
            const entityType = device.entityType || deviceId.split(".")[0];

            // Determine on/off status
            let statusText = "Off";
            if (entityType === "media_player") {
                statusText = state.state !== "off" && state.state !== "unknown" ? "On" : "Off";
            } else if (entityType === "binary_sensor") {
                statusText = state.state === "on" ? "Open" : "Closed";
            } else if (entityType === "cover") {
                statusText = state.state === "open" ? "On" : "Off";
            } else {
                statusText = state.state === "on" ? "On" : "Off";
            }

            const deviceData = {
                light_id: deviceId,
                entity_id: deviceId,
                name: this.properties.selectedDeviceName || device.name || "Unknown",
                status: statusText,
                state: state.state,
                entity_type: entityType,
                entityType: entityType,
                attributes: state.attributes || {},
                hue: 0, saturation: 0, brightness: 0
            };

            // Type-specific properties
            if (entityType === "light") {
                deviceData.hue = deviceData.attributes.hs_color?.[0] || 0;
                deviceData.saturation = deviceData.attributes.hs_color?.[1] || 0;
                deviceData.brightness = deviceData.attributes.brightness || (state.state === "on" ? 100 : 0);
            } else if (entityType === "switch" || entityType === "fan" || entityType === "cover") {
                deviceData.brightness = state.state === "on" ? 100 : 0;
                if (entityType === "cover") deviceData.position = deviceData.attributes.position || 0;
            } else if (entityType === "media_player") {
                deviceData.brightness = (deviceData.attributes.volume_level || 0) * 100;
                deviceData.volume = deviceData.attributes.volume_level || 0;
                deviceData.source = deviceData.attributes.source || null;
            } else if (entityType === "sensor") {
                deviceData.value = state.state || null;
                deviceData.unit = state.attributes.unit || null;
            } else if (entityType === "binary_sensor") {
                deviceData.brightness = state.state === "on" ? 100 : 0;
                deviceData.status = state.state === "on" ? "Open" : "Closed";
            } else if (entityType === "weather") {
                deviceData.temperature = deviceData.attributes.temperature || null;
            }

            const outputData = { lights: [deviceData], status: this.properties.status };
            this.lastValidOutput = outputData;
            this.log("data", `Output: ${deviceData.name} (${entityType}) - ${statusText}, brightness=${deviceData.brightness}`, false);
            return { device_state: outputData };
        }

        restore(state) {
            if (state.properties) Object.assign(this.properties, state.properties);
            if (state.devices) this.devices = state.devices;
            if (state.perDeviceState) this.perDeviceState = state.perDeviceState;
            if (state.lastValidOutput) this.lastValidOutput = state.lastValidOutput;
            if (state.deviceManagerReady !== undefined) this.deviceManagerReady = state.deviceManagerReady;
            
            // Restore control values
            if (this.controls.filter_type) {
                this.controls.filter_type.value = this.properties.filterType;
                if (this.controls.filter_type.updateDropdown) this.controls.filter_type.updateDropdown();
            }
            if (this.controls.letter_filter) {
                this.controls.letter_filter.value = this.properties.letterFilter;
                if (this.controls.letter_filter.updateDropdown) this.controls.letter_filter.updateDropdown();
            }
            if (this.controls.debug) {
                this.controls.debug.value = this.properties.debug;
            }
            
            setTimeout(() => {
                this.fetchDevices().then(() => {
                    if (this.properties.selectedDeviceId) {
                        this.fetchDeviceState(this.properties.selectedDeviceId);
                    }
                    this.updateDeviceDropdown();
                    if (this.changeCallback) this.changeCallback();
                });
            }, 500);
        }

        serialize() {
            return {
                selectedDeviceId: this.properties.selectedDeviceId,
                selectedDeviceName: this.properties.selectedDeviceName,
                status: this.properties.status,
                debug: this.properties.debug,
                filterType: this.properties.filterType,
                letterFilter: this.properties.letterFilter,
                devices: this.devices,
                perDeviceState: this.perDeviceState,
                lastValidOutput: this.lastValidOutput,
                deviceManagerReady: this.deviceManagerReady
            };
        }

        toJSON() {
            return { id: this.id, label: this.label, properties: this.serialize() };
        }

        destroy() {
            if (window.socket) {
                if (this._onDeviceStateUpdate) window.socket.off("device-state-update", this._onDeviceStateUpdate);
                if (this._onConnect) window.socket.off("connect", this._onConnect);
            }
        }
    }

    // -------------------------------------------------------------------------
    // COMPONENT
    // -------------------------------------------------------------------------
    function HADeviceStateOutputNodeComponent({ data, emit }) {
        const [status, setStatus] = useState(data.properties.status);
        const [deviceState, setDeviceState] = useState(null);
        const [renderKey, setRenderKey] = useState(0); // Force re-render of controls

        useEffect(() => {
            data.changeCallback = () => {
                setStatus(data.properties.status);
                setRenderKey(k => k + 1); // Force controls to re-render
                const deviceId = data.properties.selectedDeviceId;
                if (deviceId && data.perDeviceState[deviceId]) {
                    setDeviceState(data.perDeviceState[deviceId]);
                } else {
                    setDeviceState(null);
                }
            };
            return () => { data.changeCallback = null; };
        }, [data]);

        const outputs = Object.entries(data.outputs);
        const controls = Object.entries(data.controls);

        return React.createElement('div', { className: 'ha-node-tron' }, [
            // Header
            React.createElement('div', { key: 'header', className: 'ha-node-header' }, [
                React.createElement('div', { key: 'title', className: 'ha-node-title' }, 'HA Device State Output'),
                React.createElement('div', { key: 'status', className: 'ha-node-status' }, status)
            ]),

            // Controls - use renderKey to force re-render when filters change
            React.createElement('div', { key: `controls-${renderKey}`, className: 'ha-controls-container' },
                controls.map(([key, control]) => React.createElement(RefComponent, {
                    key: `${key}-${renderKey}`,
                    init: ref => emit({ type: "render", data: { type: "control", element: ref, payload: control } }),
                    unmount: ref => emit({ type: "unmount", data: { element: ref } })
                }))
            ),

            // Device State Indicator
            deviceState && React.createElement('div', { 
                key: 'device-indicator',
                className: 'ha-device-item',
                style: { 
                    margin: '0 15px 10px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }
            }, [
                React.createElement('span', { 
                    key: 'name',
                    style: { color: '#e0f7fa', fontSize: '12px', fontWeight: '600' }
                }, data.properties.selectedDeviceName || "Unknown"),
                React.createElement('div', { 
                    key: 'indicator',
                    style: { 
                        width: '14px', height: '14px', borderRadius: '50%',
                        backgroundColor: deviceState.state === 'on' || deviceState.state === 'open' ? '#00ff88' : '#ff4444',
                        boxShadow: deviceState.state === 'on' || deviceState.state === 'open' ? '0 0 10px #00ff88' : '0 0 10px #ff4444'
                    }
                })
            ]),

            // IO Container
            React.createElement('div', { key: 'io', className: 'ha-io-container' }, [
                React.createElement('div', { key: 'inputs' }), // Empty inputs placeholder for layout
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
            ])
        ]);
    }

    // Note: Control components are already registered by 00_SharedControlsPlugin.js

    // -------------------------------------------------------------------------
    // REGISTER
    // -------------------------------------------------------------------------
    window.nodeRegistry.register('HADeviceStateOutputNode', {
        label: "HA Device State Output",
        category: "Home Assistant",
        nodeClass: HADeviceStateOutputNode,
        factory: (cb) => new HADeviceStateOutputNode(cb),
        component: HADeviceStateOutputNodeComponent
    });

    console.log("[HADeviceStateOutputNode] Registered");
})();
