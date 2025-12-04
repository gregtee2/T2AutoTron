(function() {
    console.log("[HAGenericDeviceNode] Loading plugin...");

    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets) {
        console.error("[HAGenericDeviceNode] Missing dependencies");
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect, useRef } = React;
    const RefComponent = window.RefComponent;
    const sockets = window.sockets;
    const socket = window.socket; // Assuming global socket instance

    // -------------------------------------------------------------------------
    // CSS INJECTION
    // -------------------------------------------------------------------------
    const styleId = 'ha-generic-device-node-css';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.innerHTML = `
            /* Tron / Sci-Fi Node Design */
            .ha-node-tron {
                background: rgba(10, 15, 20, 0.85) !important;
                backdrop-filter: blur(12px);
                border: 1px solid #00f3ff;
                box-shadow: 0 0 15px rgba(0, 243, 255, 0.2), inset 0 0 20px rgba(0, 243, 255, 0.05);
                border-radius: 12px;
                color: #e0f7fa;
                font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                min-width: 420px;
                display: flex;
                flex-direction: column;
                transition: all 0.3s ease;
                user-select: none;
            }
            .ha-node-tron:hover {
                box-shadow: 0 0 25px rgba(0, 243, 255, 0.4), inset 0 0 30px rgba(0, 243, 255, 0.1);
                border-color: #50ffff;
            }
            .ha-node-header {
                background: linear-gradient(90deg, rgba(0, 243, 255, 0.1), rgba(0, 243, 255, 0.0));
                padding: 10px 15px;
                border-bottom: 1px solid rgba(0, 243, 255, 0.3);
                display: flex;
                flex-direction: column;
                align-items: center;
            }
            .ha-node-title {
                font-size: 16px;
                font-weight: 600;
                letter-spacing: 1px;
                text-transform: uppercase;
                color: #00f3ff;
                text-shadow: 0 0 8px rgba(0, 243, 255, 0.6);
            }
            .ha-node-status {
                font-size: 10px;
                color: #a7ffeb;
                margin-top: 4px;
                opacity: 0.8;
            }
            .ha-io-container {
                display: flex;
                justify-content: space-between;
                padding: 15px;
                background: rgba(0, 0, 0, 0.2);
            }
            .ha-socket-label {
                font-size: 11px;
                color: #b2ebf2;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            .ha-controls-container {
                padding: 15px;
                border-top: 1px solid rgba(0, 243, 255, 0.2);
                background: rgba(0, 10, 15, 0.4);
                display: flex;
                flex-direction: column;
                gap: 10px;
            }
            .ha-device-item {
                background: rgba(0, 20, 30, 0.6);
                border: 1px solid rgba(0, 243, 255, 0.15);
                border-left: 3px solid rgba(0, 243, 255, 0.5);
                border-radius: 4px;
                padding: 6px 10px;
                margin-bottom: 6px;
                transition: all 0.2s;
            }
            .ha-device-item:hover {
                background: rgba(0, 40, 50, 0.7);
                border-color: rgba(0, 243, 255, 0.4);
            }
        `;
        document.head.appendChild(style);
    }

    // -------------------------------------------------------------------------
    // CONTROLS
    // -------------------------------------------------------------------------
    
    // Button Control
    class ButtonControl extends ClassicPreset.Control {
        constructor(label, onClick) {
            super();
            this.label = label;
            this.onClick = onClick;
        }
    }
    function ButtonControlComponent({ data }) {
        return React.createElement('button', {
            onPointerDown: (e) => e.stopPropagation(),
            onDoubleClick: (e) => e.stopPropagation(),
            onClick: data.onClick,
            style: {
                width: "100%", padding: "8px", marginBottom: "5px",
                background: "rgba(0, 243, 255, 0.1)", border: "1px solid rgba(0, 243, 255, 0.4)",
                color: "#00f3ff", borderRadius: "20px", cursor: "pointer",
                fontWeight: "600", textTransform: "uppercase", fontSize: "12px", transition: "all 0.2s"
            },
            onMouseOver: (e) => { e.currentTarget.style.background = "rgba(0, 243, 255, 0.25)"; e.currentTarget.style.boxShadow = "0 0 12px rgba(0, 243, 255, 0.4)"; },
            onMouseOut: (e) => { e.currentTarget.style.background = "rgba(0, 243, 255, 0.1)"; e.currentTarget.style.boxShadow = "none"; }
        }, data.label);
    }

    // Dropdown Control
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
        useEffect(() => { setValue(data.value); }, [data.value]);
        const handleChange = (e) => {
            const val = e.target.value;
            setValue(val);
            data.value = val;
            if (data.onChange) data.onChange(val);
        };
        return React.createElement('div', { style: { marginBottom: "5px" } }, [
            data.label && React.createElement('label', { key: 'l', style: { display: "block", fontSize: "10px", color: "#00f3ff", marginBottom: "2px", textTransform: "uppercase", letterSpacing: "0.5px" } }, data.label),
            React.createElement('select', {
                key: 's',
                value: value,
                onChange: handleChange,
                onPointerDown: (e) => e.stopPropagation(),
                onDoubleClick: (e) => e.stopPropagation(),
                style: { width: "100%", background: "#0a0f14", color: "#00f3ff", border: "1px solid rgba(0, 243, 255, 0.3)", padding: "6px", borderRadius: "4px", outline: "none", fontSize: "12px" }
            }, data.values.map(v => React.createElement('option', { key: v, value: v, style: { background: "#0a0f14", color: "#00f3ff" } }, v)))
        ]);
    }

    // Switch Control
    class SwitchControl extends ClassicPreset.Control {
        constructor(label, initialValue, onChange) {
            super();
            this.label = label;
            this.value = initialValue;
            this.onChange = onChange;
        }
    }
    function SwitchControlComponent({ data }) {
        const [value, setValue] = useState(data.value);
        const handleChange = (e) => {
            const val = e.target.checked;
            setValue(val);
            data.value = val;
            if (data.onChange) data.onChange(val);
        };
        return React.createElement('div', { style: { display: "flex", alignItems: "center", marginBottom: "5px" } }, [
            React.createElement('input', {
                key: 'i',
                type: 'checkbox',
                checked: value,
                onChange: handleChange,
                onPointerDown: (e) => e.stopPropagation(),
                onDoubleClick: (e) => e.stopPropagation(),
                style: { accentColor: "#00f3ff" }
            }),
            React.createElement('span', { key: 's', style: { marginLeft: "5px", fontSize: "12px", color: "#00f3ff", textTransform: "uppercase", letterSpacing: "0.5px" } }, data.label)
        ]);
    }

    // Number Control
    class NumberControl extends ClassicPreset.Control {
        constructor(label, initialValue, onChange, options = {}) {
            super();
            this.label = label;
            this.value = initialValue;
            this.onChange = onChange;
            this.options = options;
        }
    }
    function NumberControlComponent({ data }) {
        const [value, setValue] = useState(data.value);
        const handleChange = (e) => {
            const val = Number(e.target.value);
            setValue(val);
            data.value = val;
            if (data.onChange) data.onChange(val);
        };
        return React.createElement('div', { style: { marginBottom: "5px" } }, [
            data.label && React.createElement('label', { key: 'l', style: { display: "block", fontSize: "10px", color: "#00f3ff", marginBottom: "2px", textTransform: "uppercase", letterSpacing: "0.5px" } }, data.label),
            React.createElement('input', {
                key: 'i',
                type: 'number',
                value: value,
                onChange: handleChange,
                min: data.options.min,
                max: data.options.max,
                step: data.options.step,
                onPointerDown: (e) => e.stopPropagation(),
                onDoubleClick: (e) => e.stopPropagation(),
                style: { width: "100%", background: "#0a0f14", color: "#00f3ff", border: "1px solid rgba(0, 243, 255, 0.3)", padding: "6px", borderRadius: "4px", outline: "none", fontSize: "12px" }
            })
        ]);
    }

    // Status Indicator Control
    class StatusIndicatorControl extends ClassicPreset.Control {
        constructor(data) { super(); this.data = data; }
    }
    function StatusIndicatorControlComponent({ data }) {
        const { state, color } = data.data || {};
        const isOn = state === 'on' || state === 'open' || state === 'playing';
        const activeColor = color || (isOn ? '#00f3ff' : '#333');
        return React.createElement('div', {
            style: { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '5px', width: '100%' },
            onPointerDown: (e) => e.stopPropagation()
        }, React.createElement('div', {
            style: {
                width: '12px', height: '12px', borderRadius: '50%',
                backgroundColor: isOn ? activeColor : 'rgba(0, 20, 30, 0.8)',
                boxShadow: isOn ? `0 0 10px ${activeColor}, 0 0 20px ${activeColor}` : 'none',
                transition: 'all 0.3s ease', border: '1px solid rgba(0, 243, 255, 0.3)'
            }
        }));
    }

    // Color Bar Control
    class ColorBarControl extends ClassicPreset.Control {
        constructor(data) { super(); this.data = data; }
    }
    function ColorBarControlComponent({ data }) {
        const { brightness, hs_color, entityType } = data.data || {};
        let barColor = '#444';
        if (hs_color && hs_color.length === 2) {
            barColor = `hsl(${hs_color[0]}, ${hs_color[1]}%, 50%)`;
        } else if (entityType === 'light') {
            barColor = '#ffaa00';
        }
        const widthPercent = brightness ? (brightness / 255) * 100 : 0;
        return React.createElement('div', {
            style: { width: '100%', height: '8px', backgroundColor: 'rgba(0, 20, 30, 0.6)', borderRadius: '4px', overflow: 'hidden', marginTop: '5px', border: '1px solid rgba(0, 243, 255, 0.2)' },
            onPointerDown: (e) => e.stopPropagation()
        }, React.createElement('div', {
            style: { width: `${widthPercent}%`, height: '100%', backgroundColor: barColor, transition: 'all 0.3s ease', boxShadow: `0 0 10px ${barColor}` }
        }));
    }

    // Power Stats Control
    class PowerStatsControl extends ClassicPreset.Control {
        constructor(data) { super(); this.data = data; }
    }
    function PowerStatsControlComponent({ data }) {
        const { power, energy } = data.data || {};
        if (power === null && energy === null) {
            return React.createElement('div', { style: { fontSize: '10px', color: '#777', marginTop: '5px', fontFamily: 'monospace' } }, '-- W / -- kWh');
        }
        return React.createElement('div', {
            style: { display: 'flex', flexDirection: 'column', fontSize: '10px', color: '#e0f7fa', marginTop: '5px', fontFamily: 'monospace' },
            onPointerDown: (e) => e.stopPropagation()
        }, [
            React.createElement('div', { key: 'p', style: { display: 'flex', justifyContent: 'space-between' } }, [
                React.createElement('span', { key: 'l' }, 'PWR:'),
                React.createElement('span', { key: 'v', style: { color: '#00f3ff' } }, power !== null ? `${power} W` : '--')
            ]),
            energy !== null && React.createElement('div', { key: 'e', style: { display: 'flex', justifyContent: 'space-between' } }, [
                React.createElement('span', { key: 'l' }, 'NRG:'),
                React.createElement('span', { key: 'v', style: { color: '#ffaa00' } }, `${energy} kWh`)
            ])
        ]);
    }

    // Device State Control
    class DeviceStateControl extends ClassicPreset.Control {
        constructor(deviceId, getState) {
            super();
            this.deviceId = deviceId;
            this.getState = getState;
        }
    }
    function DeviceStateControlComponent({ data }) {
        const state = data.getState ? data.getState(data.deviceId) : null;
        if (!state) {
            return React.createElement('div', { style: { padding: "4px 8px", background: "rgba(0, 20, 30, 0.6)", borderRadius: "4px", marginBottom: "4px", display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: "24px", border: "1px solid rgba(0, 243, 255, 0.1)" } }, 
                React.createElement('span', { style: { fontSize: "11px", color: "rgba(0, 243, 255, 0.5)" } }, "No state data")
            );
        }
        const isOn = state.on || state.state === 'on';
        const brightness = state.brightness ? Math.round((state.brightness / 255) * 100) : 0;
        const hsColor = state.hs_color || [0, 0];
        const [hue, saturation] = hsColor;
        let color = "#e74c3c";
        if (isOn) {
            color = (saturation === 0) ? "#f1c40f" : `hsl(${hue}, ${saturation}%, 50%)`;
        }
        return React.createElement('div', { style: { padding: "6px 8px", background: "rgba(0, 20, 30, 0.6)", borderRadius: "4px", marginBottom: "4px", border: "1px solid rgba(0, 243, 255, 0.2)", display: "flex", flexDirection: "column" } }, [
            React.createElement('div', { key: 'top', style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: isOn ? "4px" : "0" } }, [
                React.createElement('div', { key: 'left', style: { display: "flex", alignItems: "center", flex: 1, overflow: "hidden" } }, [
                    React.createElement('div', { key: 'ind', style: { width: "14px", height: "14px", borderRadius: "50%", background: color, border: "1px solid rgba(255,255,255,0.3)", marginRight: "8px", flexShrink: 0, boxShadow: isOn ? `0 0 5px ${color}` : "none" } }),
                    React.createElement('span', { key: 'name', style: { fontSize: "12px", color: "#e0f7fa", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginRight: "8px" } }, state.name || data.deviceId)
                ]),
                React.createElement('span', { key: 'val', style: { fontSize: "10px", color: "#00f3ff", fontFamily: "monospace", whiteSpace: "nowrap" } }, isOn ? `${brightness}%` : "Off")
            ]),
            isOn && React.createElement('div', { key: 'bar', style: { width: "100%", height: "4px", background: "rgba(0, 243, 255, 0.1)", borderRadius: "2px", overflow: "hidden" } }, 
                React.createElement('div', { style: { width: `${brightness}%`, height: "100%", background: `linear-gradient(90deg, rgba(0, 243, 255, 0.2), ${color})`, transition: "width 0.3s ease-out" } })
            )
        ]);
    }

    // -------------------------------------------------------------------------
    // NODE CLASS
    // -------------------------------------------------------------------------
    class HAGenericDeviceNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("HA Generic Device");
            this.width = 420;
            this.changeCallback = changeCallback;

            this.properties = {
                selectedDeviceIds: [],
                selectedDeviceNames: [],
                status: "Initializing...",
                debug: true,
                haToken: localStorage.getItem('ha_token') || "",
                transitionTime: 1000,
                filterType: "All",
                triggerMode: "Follow",
                autoRefreshInterval: 30000
            };

            this.lastTriggerValue = false;
            this.lastHsvInfo = null;
            this.devices = [];
            this.perDeviceState = {};
            this.intervalId = null;

            try {
                this.addInput("trigger", new ClassicPreset.Input(sockets.boolean || new ClassicPreset.Socket('boolean'), "Trigger"));
                this.addInput("hsv_info", new ClassicPreset.Input(sockets.object || new ClassicPreset.Socket('object'), "HSV Info"));
                this.addOutput("all_devices", new ClassicPreset.Output(sockets.lightInfo || new ClassicPreset.Socket('lightInfo'), "All Devices"));
            } catch (e) {
                console.error("[HAGenericDeviceNode] Error adding sockets:", e);
            }

            this.setupControls();
            this.initializeSocketIO();
            this.startAutoRefresh();
        }

        static compareNames(a = "", b = "") {
            return a.localeCompare(b, undefined, { sensitivity: "base" });
        }

        normalizeSelectedDeviceNames() {
            const uniqueDevices = this.getAllDevicesWithUniqueNames();
            const displayNameMap = new Map(uniqueDevices.map(item => [item.device.id, item.displayName]));

            this.properties.selectedDeviceIds.forEach((id, idx) => {
                if (!id) return;
                const displayName = displayNameMap.get(id);
                if (displayName) this.properties.selectedDeviceNames[idx] = displayName;
            });
        }

        startAutoRefresh() {
            if (this.intervalId) clearInterval(this.intervalId);
            this.intervalId = setInterval(() => this.fetchDevices(), this.properties.autoRefreshInterval);
        }

        restore(state) {
            if (state.properties) Object.assign(this.properties, state.properties);
            
            if (this.controls.filter) this.controls.filter.value = this.properties.filterType;
            if (this.controls.trigger_mode) this.controls.trigger_mode.value = this.properties.triggerMode || "Toggle";
            if (this.controls.transition) this.controls.transition.value = this.properties.transitionTime;
            if (this.controls.debug) this.controls.debug.value = this.properties.debug;

            this.properties.selectedDeviceIds.forEach((id, index) => {
                const base = `device_${index}_`;
                const name = this.properties.selectedDeviceNames[index] || "Device " + (index + 1);
                const entityType = id ? id.split('.')[0] : "light";

                this.addControl(`${base}select`, new DropdownControl(`Device ${index + 1}`, ["Select Device", ...this.getDeviceOptions()], name, (v) => this.onDeviceSelected(v, index)));
                this.addControl(`${base}indicator`, new StatusIndicatorControl({ state: "off" }));
                this.addControl(`${base}colorbar`, new ColorBarControl({ brightness: 0, hs_color: [0, 0], entityType: entityType }));
                this.addControl(`${base}power`, new PowerStatsControl({ power: null, energy: null }));
                this.addControl(`${base}state`, new DeviceStateControl(id, (devId) => this.perDeviceState[devId]));
                this.addOutput(`device_out_${index}`, new ClassicPreset.Output(sockets.lightInfo || new ClassicPreset.Socket('lightInfo'), `Device ${index + 1}`));
                
                if (id) this.fetchDeviceState(id);
            });
            this.fetchDevices();
        }

        async data(inputs) {
            const hsvInput = inputs.hsv_info?.[0];
            const triggerRaw = inputs.trigger?.[0];
            const trigger = triggerRaw ?? false;
            let needsUpdate = false;

            if (hsvInput && typeof hsvInput === 'object') {
                const hsvString = JSON.stringify(hsvInput);
                if (hsvString !== this.lastHsvInfo) {
                    this.lastHsvInfo = hsvString;
                    await this.applyHSVInput(hsvInput);
                    needsUpdate = true;
                }
            }

            const risingEdge = trigger && !this.lastTriggerValue;
            const fallingEdge = !trigger && this.lastTriggerValue;
            const mode = this.properties.triggerMode || "Toggle";

            if (mode === "Toggle" && risingEdge) { await this.onTrigger(); needsUpdate = true; }
            else if (mode === "Follow" && (risingEdge || fallingEdge)) { await this.setDevicesState(trigger); needsUpdate = true; }
            else if (mode === "Turn On" && risingEdge) { await this.setDevicesState(true); needsUpdate = true; }
            else if (mode === "Turn Off" && risingEdge) { await this.setDevicesState(false); needsUpdate = true; }

            this.lastTriggerValue = !!trigger;

            const outputs = {};
            const selectedStates = [];
            this.properties.selectedDeviceIds.forEach((id, i) => {
                if (id) {
                    const state = this.perDeviceState[id] || { on: false, state: "off" };
                    outputs[`device_out_${i}`] = state;
                    selectedStates.push(state);
                } else {
                    outputs[`device_out_${i}`] = null;
                }
            });
            outputs.all_devices = selectedStates.length > 0 ? selectedStates : null;
            if (needsUpdate) this.triggerUpdate();
            return outputs;
        }

        triggerUpdate() { if (this.changeCallback) this.changeCallback(); }

        setupControls() {
            this.addControl("filter", new DropdownControl("Filter Devices", ["All", "Light", "Switch"], "All", (v) => { this.properties.filterType = v; this.updateDeviceSelectorOptions(); this.triggerUpdate(); }));
            this.addControl("trigger_mode", new DropdownControl("Input Mode", ["Toggle", "Follow", "Turn On", "Turn Off"], "Follow", (v) => { this.properties.triggerMode = v; }));
            this.addControl("add_device", new ButtonControl("➕ Add Device", () => this.onAddDevice()));
            this.addControl("remove_device", new ButtonControl("➖ Remove Device", () => this.onRemoveDevice()));
            this.addControl("refresh", new ButtonControl("🔄 Refresh", () => this.fetchDevices()));
            this.addControl("trigger_btn", new ButtonControl("🔄 Manual Trigger", () => this.onTrigger()));
            this.addControl("transition", new NumberControl("Transition (ms)", 1000, (v) => this.properties.transitionTime = v, { min: 0, max: 10000 }));
            this.addControl("debug", new SwitchControl("Debug Logs", true, (v) => this.properties.debug = v));
        }

        initializeSocketIO() {
            if (window.socket) {
                window.socket.on("device-state-update", (data) => this.handleDeviceStateUpdate(data));
                if (window.socket.connected) this.fetchDevices();
                window.socket.on("connect", () => this.fetchDevices());
            }
        }

        async fetchDevices() {
            try {
                const response = await fetch('/api/lights/ha/', { headers: { 'Authorization': `Bearer ${this.properties.haToken}` } });
                const data = await response.json();
                if (data.success && Array.isArray(data.devices)) {
                    this.devices = [...data.devices].sort((a, b) =>
                        HAGenericDeviceNode.compareNames(a.name || a.id, b.name || b.id)
                    );
                    this.normalizeSelectedDeviceNames();
                    this.updateStatus(`Loaded ${data.devices.length} devices`);
                    this.updateDeviceSelectorOptions();
                    this.triggerUpdate();
                } else {
                    this.updateStatus("Failed to load devices");
                }
            } catch (e) {
                console.error("Fetch devices error:", e);
                this.updateStatus("Connection failed");
            }
        }

        updateStatus(text) { this.properties.status = text; this.triggerUpdate(); }

        onAddDevice() {
            const index = this.properties.selectedDeviceIds.length;
            this.properties.selectedDeviceIds.push(null);
            this.properties.selectedDeviceNames.push(null);
            const base = `device_${index}_`;
            this.addControl(`${base}select`, new DropdownControl(`Device ${index + 1}`, ["Select Device", ...this.getDeviceOptions()], "Select Device", (v) => this.onDeviceSelected(v, index)));
            this.addControl(`${base}indicator`, new StatusIndicatorControl({ state: "off" }));
            this.addControl(`${base}colorbar`, new ColorBarControl({ brightness: 0, hs_color: [0, 0], entityType: "light" }));
            this.addControl(`${base}power`, new PowerStatsControl({ power: null, energy: null }));
            this.addControl(`${base}state`, new DeviceStateControl(null, (id) => this.perDeviceState[id]));
            this.addOutput(`device_out_${index}`, new ClassicPreset.Output(sockets.lightInfo || new ClassicPreset.Socket('lightInfo'), `Device ${index + 1}`));
            this.triggerUpdate();
        }

        onRemoveDevice() {
            if (this.properties.selectedDeviceIds.length === 0) return;
            const index = this.properties.selectedDeviceIds.length - 1;
            const base = `device_${index}_`;
            this.properties.selectedDeviceIds.pop();
            this.properties.selectedDeviceNames.pop();
            this.removeControl(`${base}select`);
            this.removeControl(`${base}indicator`);
            this.removeControl(`${base}colorbar`);
            this.removeControl(`${base}power`);
            this.removeControl(`${base}state`);
            this.removeOutput(`device_out_${index}`);
            this.triggerUpdate();
        }

        getAllDevicesWithUniqueNames() {
            const devices = this.devices || [];
            const nameCounts = devices.reduce((acc, device) => {
                const key = (device.name || device.id || "").trim();
                acc[key] = (acc[key] || 0) + 1;
                return acc;
            }, {});

            return devices
                .map(device => {
                    const baseName = (device.name || device.id || "").trim();
                    const displayName = nameCounts[baseName] > 1 ? `${baseName} (${device.id})` : baseName;
                    return { device, displayName };
                })
                .sort((a, b) => HAGenericDeviceNode.compareNames(a.displayName, b.displayName));
        }

        getDeviceOptions() {
            let list = this.getAllDevicesWithUniqueNames();
            if (this.properties.filterType !== "All") {
                const type = this.properties.filterType.toLowerCase();
                list = list.filter(item => item.device.type?.toLowerCase() === type);
            }
            return list.map(item => item.displayName);
        }

        updateDeviceSelectorOptions() {
            this.properties.selectedDeviceIds.forEach((_, i) => {
                const ctrl = this.controls[`device_${i}_select`];
                if (!ctrl) return;
                const current = ctrl.value || "Select Device";
                const baseOptions = this.getDeviceOptions();
                let sortedOptions = [...baseOptions];

                if (current !== "Select Device" && !baseOptions.includes(current)) {
                    sortedOptions = [...sortedOptions, current].sort((a, b) =>
                        HAGenericDeviceNode.compareNames(a, b)
                    );
                }

                ctrl.values = ["Select Device", ...sortedOptions];
                ctrl.value = current;
            });
        }

        async onDeviceSelected(name, index) {
            if (name === "Select Device") { this.properties.selectedDeviceIds[index] = null; return; }
            const item = this.getAllDevicesWithUniqueNames().find(i => i.displayName === name);
            if (!item) return;
            const dev = item.device;
            this.properties.selectedDeviceIds[index] = dev.id;
            this.properties.selectedDeviceNames[index] = item.displayName || dev.name;
            const stateCtrl = this.controls[`device_${index}_state`];
            if (stateCtrl) stateCtrl.deviceId = dev.id;
            const colorbar = this.controls[`device_${index}_colorbar`];
            if (colorbar) colorbar.data.entityType = dev.id.split('.')[0];
            await this.fetchDeviceState(dev.id);
            this.triggerUpdate();
        }

        async fetchDeviceState(id) {
            if (!id) return;
            try {
                const res = await fetch(`/api/lights/ha/${id}/state`, { headers: { 'Authorization': `Bearer ${this.properties.haToken}` } });
                const data = await res.json();
                if (data.success && data.state) {
                    this.perDeviceState[id] = data.state;
                    this.updateDeviceControls(id, data.state);
                    this.triggerUpdate();
                }
            } catch (e) { console.error("Failed to fetch state for", id, e); }
        }

        async applyHSVInput(info) {
            if (!info || typeof info !== "object") return;
            const transitionMs = this.properties.transitionTime > 0 ? this.properties.transitionTime : undefined;
            const ids = this.properties.selectedDeviceIds.filter(Boolean);
            if (ids.length === 0) return;
            this.updateStatus("Applying control...");
            await Promise.all(ids.map(async (id) => {
                const entityType = id.split('.')[0];
                const isLight = entityType === "light" || entityType === "ha_light";
                let turnOn = info.on ?? true;
                let hs_color = null;
                let color_temp_kelvin = null;
                let brightness = null;
                const useTemp = info.mode === 'temp' && info.colorTemp;
                if (useTemp) color_temp_kelvin = info.colorTemp;
                else {
                    if (Array.isArray(info.hs_color)) hs_color = info.hs_color;
                    else if (info.h !== undefined && info.s !== undefined) hs_color = [info.h, (info.s ?? 0) * 100];
                    else if (info.hue !== undefined && info.saturation !== undefined) hs_color = [info.hue * 360, info.saturation * 100];
                }
                if (info.brightness !== undefined) brightness = info.brightness;
                else if (info.v !== undefined) brightness = Math.round((info.v ?? 0) * 255);
                if (brightness === 0) turnOn = false;
                const payload = { on: turnOn, state: turnOn ? "on" : "off" };
                if (turnOn && isLight) {
                    if (color_temp_kelvin) payload.color_temp_kelvin = color_temp_kelvin;
                    else if (hs_color) payload.hs_color = hs_color;
                    if (brightness !== null) payload.brightness = Math.max(0, Math.min(255, Math.round(brightness)));
                    if (transitionMs) payload.transition = transitionMs;
                }
                try {
                    await fetch(`/api/lights/ha/${id}/state`, { method: "PUT", headers: { "Content-Type": "application/json", 'Authorization': `Bearer ${this.properties.haToken}` }, body: JSON.stringify(payload) });
                    const current = this.perDeviceState[id] || {};
                    this.perDeviceState[id] = { ...current, on: turnOn, state: payload.state, ...(hs_color ? { hs_color } : {}), ...(color_temp_kelvin ? { color_temp_kelvin } : {}), ...(brightness !== null ? { brightness } : {}) };
                    this.updateDeviceControls(id, this.perDeviceState[id]);
                } catch (e) { console.error(`Control apply failed for ${id}`, e); }
            }));
            this.triggerUpdate();
            setTimeout(() => this.updateStatus(`Control applied to ${ids.length} devices`), 600);
        }

        async setDevicesState(turnOn) {
            this.updateStatus(turnOn ? "Turning On..." : "Turning Off...");
            const ids = this.properties.selectedDeviceIds.filter(Boolean);
            if (ids.length === 0) return;
            const transitionMs = this.properties.transitionTime > 0 ? this.properties.transitionTime : undefined;
            await Promise.all(ids.map(async (id) => {
                const payload = { on: turnOn, state: turnOn ? "on" : "off" };
                if (turnOn && transitionMs) payload.transition = transitionMs;
                try {
                    await fetch(`/api/lights/ha/${id}/state`, { method: "PUT", headers: { "Content-Type": "application/json", 'Authorization': `Bearer ${this.properties.haToken}` }, body: JSON.stringify(payload) });
                    this.perDeviceState[id] = { ...this.perDeviceState[id], on: turnOn, state: payload.state };
                    this.updateDeviceControls(id, this.perDeviceState[id]);
                } catch (e) { console.error(`Set state failed for ${id}`, e); }
            }));
            this.triggerUpdate();
            setTimeout(() => this.updateStatus(turnOn ? "Turned On" : "Turned Off"), 600);
        }

        async onTrigger() {
            this.updateStatus("Toggling...");
            const ids = this.properties.selectedDeviceIds.filter(Boolean);
            if (ids.length === 0) { this.updateStatus("No devices selected"); return; }
            const transitionMs = this.properties.transitionTime > 0 ? this.properties.transitionTime : undefined;
            await Promise.all(ids.map(async (id) => {
                const current = this.perDeviceState[id] || { on: false };
                const newOn = !current.on;
                const payload = { on: newOn, state: newOn ? "on" : "off" };
                if (newOn && transitionMs) payload.transition = transitionMs;
                try {
                    await fetch(`/api/lights/ha/${id}/state`, { method: "PUT", headers: { "Content-Type": "application/json", 'Authorization': `Bearer ${this.properties.haToken}` }, body: JSON.stringify(payload) });
                    this.perDeviceState[id] = { ...this.perDeviceState[id], on: newOn, state: payload.state };
                    this.updateDeviceControls(id, this.perDeviceState[id]);
                } catch (e) { console.error(`Toggle failed for ${id}`, e); }
            }));
            this.triggerUpdate();
            setTimeout(() => this.updateStatus(`Toggled ${ids.length} device(s)`), 600);
        }

        handleDeviceStateUpdate(data) {
            let id, state;
            if (data.id) { id = data.id; state = { ...data, state: data.state || (data.on ? "on" : "off") }; }
            else if (data.entity_id && data.new_state) {
                id = data.entity_id;
                const a = data.new_state.attributes || {};
                state = { on: data.new_state.state === "on", state: data.new_state.state, brightness: a.brightness ?? 0, hs_color: a.hs_color ?? [0, 0], power: a.power || a.current_power_w || a.load_power || null, energy: a.energy || a.energy_kwh || a.total_energy_kwh || null };
            }
            if (id && this.properties.selectedDeviceIds.includes(id)) {
                this.perDeviceState[id] = { ...this.perDeviceState[id], ...state };
                this.updateDeviceControls(id, state);
                this.triggerUpdate();
            }
        }

        updateDeviceControls(id, state) {
            this.properties.selectedDeviceIds.forEach((devId, i) => {
                if (devId !== id) return;
                const base = `device_${i}_`;
                const indicator = this.controls[`${base}indicator`];
                const colorbar = this.controls[`${base}colorbar`];
                const power = this.controls[`${base}power`];
                if (indicator) indicator.data = { state: state.state || (state.on ? "on" : "off") };
                if (colorbar) colorbar.data = { brightness: state.brightness ?? 0, hs_color: state.hs_color ?? [0, 0], entityType: id.split('.')[0] };
                if (power) power.data = { power: state.power ?? null, energy: state.energy ?? null };
            });
        }

        destroy() { if (this.intervalId) clearInterval(this.intervalId); super.destroy?.(); }
    }

    // -------------------------------------------------------------------------
    // COMPONENT
    // -------------------------------------------------------------------------
    function HAGenericDeviceNodeComponent({ data, emit }) {
        const [seed, setSeed] = useState(0);
        const [isCollapsed, setIsCollapsed] = useState(false);

        useEffect(() => {
            data.changeCallback = () => setSeed(s => s + 1);
            return () => { data.changeCallback = null; };
        }, [data]);

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

        return React.createElement('div', { className: 'ha-node-tron' }, [
            // Header
            React.createElement('div', { key: 'header', className: 'ha-node-header' }, [
                React.createElement('div', { key: 'row', style: { display: "flex", alignItems: "center", gap: "8px" } }, [
                    React.createElement('div', { 
                        key: 'toggle',
                        style: { cursor: "pointer", fontSize: "12px", userSelect: "none" },
                        onPointerDown: (e) => { e.stopPropagation(); setIsCollapsed(!isCollapsed); }
                    }, isCollapsed ? "▶" : "▼"),
                    React.createElement('div', { key: 'title', className: 'ha-node-title' }, data.label || "HA Generic Device")
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
                        React.createElement('span', { key: 'l', className: 'ha-socket-label' }, input.label)
                    ]))
                ),
                React.createElement('div', { key: 'out', className: 'outputs' }, 
                    outputs.map(([key, output]) => React.createElement('div', { key: key, style: { display: "flex", alignItems: "center", gap: "8px", justifyContent: "flex-end", marginBottom: "4px" } }, [
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
            isCollapsed && React.createElement('div', { key: 'collapsed', className: 'ha-controls-container' }, 
                Object.entries(deviceGroups).map(([index, groupControls]) => {
                    const select = groupControls.find(c => c.key.endsWith("_select"));
                    const indicator = groupControls.find(c => c.key.endsWith("_indicator"));
                    const name = select?.control?.value || `Device ${parseInt(index) + 1}`;
                    const isOn = indicator?.control?.data?.state === "on";
                    if (name === "Select Device") return null;
                    return React.createElement('div', { key: index, style: { display: "flex", alignItems: "center", gap: "8px", fontSize: "11px", color: "#e0f7fa" } }, [
                        React.createElement('div', { key: 'dot', style: { width: "8px", height: "8px", borderRadius: "50%", background: isOn ? "#00f3ff" : "#333", boxShadow: isOn ? "0 0 5px #00f3ff" : "none" } }),
                        React.createElement('span', { key: 'name' }, name)
                    ]);
                })
            ),

            // Expanded View
            !isCollapsed && React.createElement('div', { key: 'expanded', className: 'ha-controls-container' }, [
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
                    const power = findControl("_power");
                    const state = findControl("_state");
                    const entityType = colorbar?.control?.data?.entityType || "light";
                    const isSwitch = entityType.includes("switch");
                    const isLight = entityType.includes("light");

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
                            power && (isSwitch || power.control.data.power !== null) && React.createElement('div', { key: 'pwr', style: { flex: '0 0 auto' } }, React.createElement(RefComponent, {
                                init: ref => emit({ type: "render", data: { type: "control", element: ref, payload: power.control } }),
                                unmount: ref => emit({ type: "unmount", data: { element: ref } })
                            })),
                            colorbar && isLight && React.createElement('div', { key: 'col', style: { flex: '1 1 auto' } }, React.createElement(RefComponent, {
                                init: ref => emit({ type: "render", data: { type: "control", element: ref, payload: colorbar.control } }),
                                unmount: ref => emit({ type: "unmount", data: { element: ref } })
                            }))
                        ]),
                        state && React.createElement('div', { key: 'st' }, React.createElement(RefComponent, {
                            init: ref => emit({ type: "render", data: { type: "control", element: ref, payload: state.control } }),
                            unmount: ref => emit({ type: "unmount", data: { element: ref } })
                        }))
                    ]);
                })
            ])
        ]);
    }

    window.nodeRegistry.register('HAGenericDeviceNode', {
        label: "HA Generic Device",
        category: "Home Assistant",
        nodeClass: HAGenericDeviceNode,
        factory: (cb) => new HAGenericDeviceNode(cb),
        component: HAGenericDeviceNodeComponent
    });

    console.log("[HAGenericDeviceNode] Registered");
})();
