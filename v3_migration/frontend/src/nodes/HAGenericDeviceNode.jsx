import "../sockets.js";
import sockets from "../sockets.js";

import React, { useEffect, useState } from "react";
import { ClassicPreset } from "rete";
import { RefComponent } from "rete-react-plugin";
import { socket } from "../socket";
import { ButtonControl } from "../controls/ButtonControl";
import { DropdownControl } from "../controls/DropdownControl";
import { SwitchControl } from "../controls/SwitchControl";
import { NumberControl } from "../controls/NumberControl";
import { DeviceStateControl } from "../controls/DeviceStateControl";

// Reuse existing styles
import "./HAGenericDeviceNode.css";

// Wrapper control classes (defined inline)
export class StatusIndicatorControl extends ClassicPreset.Control {
    constructor(data) { super(); this.data = data; }
}
export class ColorBarControl extends ClassicPreset.Control {
    constructor(data) { super(); this.data = data; }
}
export class PowerStatsControl extends ClassicPreset.Control {
    constructor(data) { super(); this.data = data; }
}

export class HAGenericDeviceNode extends ClassicPreset.Node {
    constructor(changeCallback) {
        super("HA Generic Device");
        this.width = 420;
        this.changeCallback = changeCallback;

        this.properties = {
            selectedDeviceIds: [],
            selectedDeviceNames: [],
            status: "Initializing...",
            debug: true,
            haToken: localStorage.getItem('ha_token') || "", // Retrieve token
            transitionTime: 1000,
            filterType: "All",
            triggerMode: "Follow", // Toggle, Follow, Turn On, Turn Off
            autoRefreshInterval: 30000
        };

        this.lastTriggerValue = false;
        this.lastHsvInfo = null; // Track last HSV info to prevent loops
        this.devices = [];
        this.perDeviceState = {};
        this.intervalId = null;

        // CRITICAL: Keep the input definition that was proven to work
        console.log("[HAGenericDeviceNode] sockets.boolean:", sockets.boolean);
        console.log("[HAGenericDeviceNode] sockets.object:", sockets.object);

        this.addInput("trigger", new ClassicPreset.Input(sockets.boolean, "Trigger"));
        this.addInput("hsv_info", new ClassicPreset.Input(sockets.object, "HSV Info"));
        this.addOutput("all_devices", new ClassicPreset.Output(sockets.lightInfo, "All Devices"));

        this.setupControls();
        this.initializeSocketIO();
        this.startAutoRefresh();
    }

    startAutoRefresh() {
        if (this.intervalId) clearInterval(this.intervalId);
        this.intervalId = setInterval(() => this.fetchDevices(), this.properties.autoRefreshInterval);
    }

    // Restore state from saved graph
    restore(state) {
        if (state.properties) {
            Object.assign(this.properties, state.properties);
        }

        // Restore static controls
        const filterCtrl = this.controls.filter;
        if (filterCtrl) filterCtrl.value = this.properties.filterType;

        const triggerModeCtrl = this.controls.trigger_mode;
        if (triggerModeCtrl) triggerModeCtrl.value = this.properties.triggerMode || "Toggle";

        const transitionCtrl = this.controls.transition;
        if (transitionCtrl) transitionCtrl.value = this.properties.transitionTime;

        const debugCtrl = this.controls.debug;
        if (debugCtrl) debugCtrl.value = this.properties.debug;

        // Re-create dynamic device controls
        this.properties.selectedDeviceIds.forEach((id, index) => {
            const base = `device_${index}_`;
            const name = this.properties.selectedDeviceNames[index] || "Device " + (index + 1);
            const entityType = id ? id.split('.')[0] : "light";

            // Re-add controls
            this.addControl(`${base}select`, new DropdownControl(
                `Device ${index + 1}`,
                ["Select Device", ...this.getDeviceOptions()],
                name, // Use saved name or "Select Device"
                (v) => this.onDeviceSelected(v, index)
            ));

            this.addControl(`${base}indicator`, new StatusIndicatorControl({ state: "off" }));
            this.addControl(`${base}colorbar`, new ColorBarControl({ brightness: 0, hs_color: [0, 0], entityType: entityType }));
            this.addControl(`${base}power`, new PowerStatsControl({ power: null, energy: null }));
            this.addControl(`${base}state`, new DeviceStateControl(id, (devId) => this.perDeviceState[devId]));

            // Re-add output
            this.addOutput(`device_out_${index}`, new ClassicPreset.Output(sockets.lightInfo, `Device ${index + 1}`));
            
            // Trigger fetch for this device to ensure state is up to date
            if (id) this.fetchDeviceState(id);
        });

        // Trigger initial fetch to populate lists and states
        this.fetchDevices();
    }

    async data(inputs) {
        const hsvInput = inputs.hsv_info?.[0];
        const triggerRaw = inputs.trigger?.[0];
        const trigger = triggerRaw ?? false;

        // console.log(`[HAGenericDeviceNode] data() called. Trigger: ${trigger}`);

        let needsUpdate = false;

        // Handle HSV Input (with loop prevention)
        if (hsvInput && typeof hsvInput === 'object') {
            // Simple shallow comparison or JSON stringify for deep comparison
            const hsvString = JSON.stringify(hsvInput);
            if (hsvString !== this.lastHsvInfo) {
                console.log("[HAGenericDeviceNode] New HSV Info detected:", hsvInput);
                this.lastHsvInfo = hsvString;
                await this.applyHSVInput(hsvInput);
                needsUpdate = true;
            }
        }

        // Rising-edge detection
        const risingEdge = trigger && !this.lastTriggerValue;
        const fallingEdge = !trigger && this.lastTriggerValue;
        const mode = this.properties.triggerMode || "Toggle";

        if (mode === "Toggle") {
            if (risingEdge) {
                console.log('[HAGenericDeviceNode] Toggle Mode: Rising Edge -> Toggling');
                await this.onTrigger();
                needsUpdate = true;
            }
        } else if (mode === "Follow") {
            if (risingEdge || fallingEdge) {
                console.log(`[HAGenericDeviceNode] Follow Mode: Input ${trigger ? "High" : "Low"} -> Setting ${trigger ? "On" : "Off"}`);
                await this.setDevicesState(trigger);
                needsUpdate = true;
            }
        } else if (mode === "Turn On") {
            if (risingEdge) {
                console.log('[HAGenericDeviceNode] Turn On Mode: Rising Edge -> Turning On');
                await this.setDevicesState(true);
                needsUpdate = true;
            }
        } else if (mode === "Turn Off") {
            if (risingEdge) {
                console.log('[HAGenericDeviceNode] Turn Off Mode: Rising Edge -> Turning Off');
                await this.setDevicesState(false);
                needsUpdate = true;
            }
        }

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

    triggerUpdate() {
        if (this.changeCallback) this.changeCallback();
    }

    setupControls() {
        this.addControl("filter", new DropdownControl("Filter Devices", ["All", "Light", "Switch"], "All", (v) => {
            this.properties.filterType = v;
            this.updateDeviceSelectorOptions();
            this.triggerUpdate();
        }));
        this.addControl("trigger_mode", new DropdownControl("Input Mode", ["Toggle", "Follow", "Turn On", "Turn Off"], "Follow", (v) => {
            this.properties.triggerMode = v;
        }));
        this.addControl("add_device", new ButtonControl("➕ Add Device", () => this.onAddDevice()));
        this.addControl("remove_device", new ButtonControl("➖ Remove Device", () => this.onRemoveDevice()));
        this.addControl("refresh", new ButtonControl("🔄 Refresh", () => this.fetchDevices()));
        this.addControl("trigger_btn", new ButtonControl("🔄 Manual Trigger", () => this.onTrigger()));
        this.addControl("transition", new NumberControl("Transition (ms)", 1000, (v) => this.properties.transitionTime = v, { min: 0, max: 10000 }));
        this.addControl("debug", new SwitchControl("Debug Logs", true, (v) => this.properties.debug = v));
    }

    initializeSocketIO() {
        socket.on("device-state-update", (data) => this.handleDeviceStateUpdate(data));
        if (socket.connected) this.fetchDevices();
        socket.on("connect", () => this.fetchDevices());
    }

    async fetchDevices() {
        try {
            const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/lights/ha/`, {
                headers: { 'Authorization': `Bearer ${this.properties.haToken}` }
            });
            const data = await response.json();
            if (data.success && Array.isArray(data.devices)) {
                this.devices = data.devices;
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

    updateStatus(text) {
        this.properties.status = text;
        this.triggerUpdate();
    }

    onAddDevice() {
        const index = this.properties.selectedDeviceIds.length;
        this.properties.selectedDeviceIds.push(null);
        this.properties.selectedDeviceNames.push(null);

        const base = `device_${index}_`;
        this.addControl(`${base}select`, new DropdownControl(
            `Device ${index + 1}`,
            ["Select Device", ...this.getDeviceOptions()],
            "Select Device",
            (v) => this.onDeviceSelected(v, index)
        ));

        this.addControl(`${base}indicator`, new StatusIndicatorControl({ state: "off" }));
        this.addControl(`${base}colorbar`, new ColorBarControl({ brightness: 0, hs_color: [0, 0], entityType: "light" }));
        this.addControl(`${base}power`, new PowerStatsControl({ power: null, energy: null }));
        this.addControl(`${base}state`, new DeviceStateControl(null, (id) => this.perDeviceState[id]));

        this.addOutput(`device_out_${index}`, new ClassicPreset.Output(sockets.lightInfo, `Device ${index + 1}`));

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
        return (this.devices || []).map(d => {
            const count = this.devices.filter(x => x.name === d.name).length;
            const displayName = count > 1 ? `${d.name} (${d.id})` : d.name;
            return { device: d, displayName };
        });
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
            const options = ["Select Device", ...this.getDeviceOptions()];
            if (current !== "Select Device" && !options.includes(current)) options.push(current);

            ctrl.values = options;
            ctrl.value = current;
        });
    }

    async onDeviceSelected(name, index) {
        if (name === "Select Device") {
            this.properties.selectedDeviceIds[index] = null;
            return;
        }

        const item = this.getAllDevicesWithUniqueNames().find(i => i.displayName === name);
        if (!item) return;

        const dev = item.device;
        this.properties.selectedDeviceIds[index] = dev.id;
        this.properties.selectedDeviceNames[index] = dev.name;

        const stateCtrl = this.controls[`device_${index}_state`];
        if (stateCtrl) stateCtrl.deviceId = dev.id;

        // Update entity type immediately for UI logic
        const colorbar = this.controls[`device_${index}_colorbar`];
        if (colorbar) {
            colorbar.data.entityType = dev.id.split('.')[0];
        }

        await this.fetchDeviceState(dev.id);
        this.triggerUpdate();
    }

    async fetchDeviceState(id) {
        if (!id) return;
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/lights/ha/${id}/state`, {
                headers: { 'Authorization': `Bearer ${this.properties.haToken}` }
            });
            const data = await res.json();
            if (data.success && data.state) {
                this.perDeviceState[id] = data.state;
                this.updateDeviceControls(id, data.state);
                this.triggerUpdate();
            }
        } catch (e) {
            console.error("Failed to fetch state for", id, e);
        }
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

            // Determine Mode (Temp vs Color)
            // If mode is explicitly 'temp', use it. 
            // If mode is missing but colorTemp is present and no color info is present, use temp? 
            // No, stick to explicit mode from AllInOneColorNode.
            const useTemp = info.mode === 'temp' && info.colorTemp;

            if (useTemp) {
                color_temp_kelvin = info.colorTemp;
            } else {
                // Fallback to Color Mode
                if (Array.isArray(info.hs_color)) {
                    hs_color = info.hs_color;
                } else if (info.h !== undefined && info.s !== undefined) {
                    hs_color = [info.h, (info.s ?? 0) * 100];
                } else if (info.hue !== undefined && info.saturation !== undefined) {
                    hs_color = [info.hue * 360, info.saturation * 100];
                }
            }

            if (info.brightness !== undefined) brightness = info.brightness;
            else if (info.v !== undefined) brightness = Math.round((info.v ?? 0) * 255);

            if (brightness === 0) turnOn = false;

            const payload = { on: turnOn, state: turnOn ? "on" : "off" };
            if (turnOn && isLight) {
                if (color_temp_kelvin) {
                    payload.color_temp_kelvin = color_temp_kelvin;
                } else if (hs_color) {
                    payload.hs_color = hs_color;
                }
                
                if (brightness !== null) payload.brightness = Math.max(0, Math.min(255, Math.round(brightness)));
                if (transitionMs) payload.transition = transitionMs;
            }

            // console.log(`[HAGenericDeviceNode] Sending payload to ${id}:`, payload);

            try {
                await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/lights/ha/${id}/state`, {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                        'Authorization': `Bearer ${this.properties.haToken}`
                    },
                    body: JSON.stringify(payload),
                });

                const current = this.perDeviceState[id] || {};
                this.perDeviceState[id] = {
                    ...current,
                    on: turnOn,
                    state: payload.state,
                    ...(hs_color ? { hs_color } : {}),
                    ...(color_temp_kelvin ? { color_temp_kelvin } : {}),
                    ...(brightness !== null ? { brightness } : {}),
                };
                this.updateDeviceControls(id, this.perDeviceState[id]);
            } catch (e) {
                console.error(`Control apply failed for ${id}`, e);
            }
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
            const payload = {
                on: turnOn,
                state: turnOn ? "on" : "off",
            };
            if (turnOn && transitionMs) payload.transition = transitionMs;

            try {
                await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/lights/ha/${id}/state`, {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                        'Authorization': `Bearer ${this.properties.haToken}`
                    },
                    body: JSON.stringify(payload),
                });

                this.perDeviceState[id] = {
                    ...this.perDeviceState[id],
                    on: turnOn,
                    state: payload.state,
                };
                this.updateDeviceControls(id, this.perDeviceState[id]);
            } catch (e) {
                console.error(`Set state failed for ${id}`, e);
            }
        }));

        this.triggerUpdate();
        setTimeout(() => this.updateStatus(turnOn ? "Turned On" : "Turned Off"), 600);
    }

    async onTrigger() {
        this.updateStatus("Toggling...");
        const ids = this.properties.selectedDeviceIds.filter(Boolean);
        console.log("[HAGenericDeviceNode] onTrigger called. IDs:", ids);

        if (ids.length === 0) {
            console.warn("[HAGenericDeviceNode] No devices selected to toggle.");
            this.updateStatus("No devices selected");
            return;
        }

        const transitionMs = this.properties.transitionTime > 0 ? this.properties.transitionTime : undefined;

        await Promise.all(ids.map(async (id) => {
            const current = this.perDeviceState[id] || { on: false };
            const newOn = !current.on;

            const payload = {
                on: newOn,
                state: newOn ? "on" : "off",
            };
            if (newOn && transitionMs) payload.transition = transitionMs;

            try {
                await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/lights/ha/${id}/state`, {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                        'Authorization': `Bearer ${this.properties.haToken}`
                    },
                    body: JSON.stringify(payload),
                });

                this.perDeviceState[id] = {
                    ...this.perDeviceState[id],
                    on: newOn,
                    state: payload.state,
                };
                this.updateDeviceControls(id, this.perDeviceState[id]);
            } catch (e) {
                console.error(`Toggle failed for ${id}`, e);
            }
        }));

        this.triggerUpdate();
        setTimeout(() => this.updateStatus(`Toggled ${ids.length} device(s)`), 600);
    }

    handleDeviceStateUpdate(data) {
        let id, state;
        if (data.id) {
            id = data.id;
            state = { ...data, state: data.state || (data.on ? "on" : "off") };
        } else if (data.entity_id && data.new_state) {
            id = data.entity_id;
            const a = data.new_state.attributes || {};
            state = {
                on: data.new_state.state === "on",
                state: data.new_state.state,
                brightness: a.brightness ?? 0,
                hs_color: a.hs_color ?? [0, 0],
                // Expanded power attribute search
                power: a.power || a.current_power_w || a.load_power || null,
                energy: a.energy || a.energy_kwh || a.total_energy_kwh || null,
            };
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
            if (colorbar) {
                colorbar.data = { 
                    brightness: state.brightness ?? 0, 
                    hs_color: state.hs_color ?? [0, 0], 
                    entityType: id.split('.')[0] // Ensure entityType is updated
                };
            }
            if (power) power.data = { power: state.power ?? null, energy: state.energy ?? null };
        });
    }

    destroy() {
        if (this.intervalId) clearInterval(this.intervalId);
        super.destroy?.();
    }
}

export function HAGenericDeviceNodeComponent({ data, emit }) {
    const [seed, setSeed] = useState(0);
    const [isCollapsed, setIsCollapsed] = useState(false);

    useEffect(() => {
        data.changeCallback = () => setSeed(s => s + 1);
        return () => { data.changeCallback = null; };
    }, [data]);

    const inputs = Object.entries(data.inputs);
    const outputs = Object.entries(data.outputs);
    const allControls = Object.entries(data.controls);

    // Separate Global vs Device Controls
    const globalControls = [];
    const deviceGroups = {};

    allControls.forEach(([key, control]) => {
        if (key.startsWith("device_")) {
            const parts = key.split("_"); // device, index, type
            const index = parts[1];
            if (!deviceGroups[index]) deviceGroups[index] = [];
            deviceGroups[index].push({ key, control });
        } else {
            globalControls.push({ key, control });
        }
    });

    // Simplified styles to ensure connectivity works (based on the working minimal node)
    const containerStyle = {
        background: "#0a0f14", // Dark blue/black background
        border: "1px solid #00f3ff", // Cyan border
        borderRadius: "8px",
        color: "#e0f7fa", // Light cyan text
        minWidth: "350px",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 0 15px rgba(0, 243, 255, 0.2)" // Subtle glow
    };

    const headerStyle = {
        padding: "10px",
        background: "linear-gradient(90deg, rgba(0, 243, 255, 0.1), rgba(0, 243, 255, 0.0))", // Gradient header
        borderBottom: "1px solid rgba(0, 243, 255, 0.3)",
        borderTopLeftRadius: "8px",
        borderTopRightRadius: "8px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
    };

    const ioStyle = {
        padding: "10px",
        display: "flex",
        justifyContent: "space-between",
        gap: "20px",
        background: "rgba(0, 0, 0, 0.2)"
    };

    const socketRowStyle = {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        marginBottom: "4px"
    };

    const controlsStyle = {
        padding: "10px",
        background: "rgba(0, 10, 15, 0.4)",
        borderTop: "1px solid rgba(0, 243, 255, 0.2)",
        borderBottomLeftRadius: "8px",
        borderBottomRightRadius: "8px",
        display: "flex",
        flexDirection: "column",
        gap: "8px"
    };

    const summaryStyle = {
        padding: "10px",
        background: "rgba(0, 10, 15, 0.4)",
        borderTop: "1px solid rgba(0, 243, 255, 0.2)",
        borderBottomLeftRadius: "8px",
        borderBottomRightRadius: "8px",
        display: "flex",
        flexDirection: "column",
        gap: "4px"
    };

    return (
        <div style={containerStyle}>
            <div style={headerStyle}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div 
                        style={{ cursor: "pointer", fontSize: "12px", userSelect: "none" }}
                        onPointerDown={(e) => { e.stopPropagation(); setIsCollapsed(!isCollapsed); }}
                    >
                        {isCollapsed ? "▶" : "▼"}
                    </div>
                    <div style={{ fontWeight: "bold" }}>{data.label || "HA Generic Device"}</div>
                </div>
                <div style={{ fontSize: "0.8em", color: "#aaa" }}>{data.properties.status}</div>
            </div>

            <div style={ioStyle}>
                <div className="inputs">
                    {inputs.map(([key, input]) => (
                        <div key={key} style={socketRowStyle}>
                            <RefComponent
                                init={ref => emit({ type: "render", data: { type: "socket", element: ref, payload: input.socket, nodeId: data.id, side: "input", key } })}
                                unmount={ref => emit({ type: "unmount", data: { element: ref } })}
                            />
                            <span style={{ fontSize: "0.8em" }}>{input.label}</span>
                        </div>
                    ))}
                </div>

                <div className="outputs">
                    {outputs.map(([key, output]) => (
                        <div key={key} style={{ ...socketRowStyle, justifyContent: "flex-end" }}>
                            <span style={{ fontSize: "0.8em" }}>{output.label}</span>
                            <RefComponent
                                init={ref => emit({ type: "render", data: { type: "socket", element: ref, payload: output.socket, nodeId: data.id, side: "output", key } })}
                                unmount={ref => emit({ type: "unmount", data: { element: ref } })}
                            />
                        </div>
                    ))}
                </div>
            </div>

            {/* Collapsed View: Summary Only */}
            {isCollapsed && (
                <div style={summaryStyle}>
                    {Object.entries(deviceGroups).map(([index, groupControls]) => {
                        const select = groupControls.find(c => c.key.endsWith("_select"));
                        const indicator = groupControls.find(c => c.key.endsWith("_indicator"));
                        const name = select?.control?.value || `Device ${parseInt(index) + 1}`;
                        const isOn = indicator?.control?.data?.state === "on";
                        
                        if (name === "Select Device") return null;

                        return (
                            <div key={index} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px", color: "#e0f7fa" }}>
                                <div style={{ 
                                    width: "8px", height: "8px", borderRadius: "50%", 
                                    background: isOn ? "#00f3ff" : "#333",
                                    boxShadow: isOn ? "0 0 5px #00f3ff" : "none"
                                }} />
                                <span>{name}</span>
                            </div>
                        );
                    })}
                    {Object.keys(deviceGroups).length === 0 && <div style={{ fontSize: "11px", color: "#aaa" }}>No devices added</div>}
                </div>
            )}

            {/* Expanded View: Full Controls */}
            {!isCollapsed && (
                <div style={controlsStyle}>
                    {/* Global Controls */}
                    {globalControls.map(({ key, control }) => (
                        <RefComponent
                            key={key}
                            init={ref => emit({ type: "render", data: { type: "control", element: ref, payload: control } })}
                            unmount={ref => emit({ type: "unmount", data: { element: ref } })}
                        />
                    ))}

                    {/* Device Groups */}
                    {Object.entries(deviceGroups).map(([index, groupControls]) => {
                        const findControl = (suffix) => groupControls.find(c => c.key.endsWith(suffix));
                        
                        const select = findControl("_select");
                        const indicator = findControl("_indicator");
                        const colorbar = findControl("_colorbar");
                        const power = findControl("_power");
                        const state = findControl("_state");

                        // Determine visibility based on entity type
                        const entityType = colorbar?.control?.data?.entityType || "light";
                        const isSwitch = entityType.includes("switch");
                        const isLight = entityType.includes("light");

                        return (
                            <div key={index} style={{ border: '1px solid rgba(0, 243, 255, 0.2)', padding: '8px', borderRadius: '6px', marginTop: '8px', background: 'rgba(0, 20, 30, 0.4)' }}>
                                {/* Row 1: Select Device */}
                                {select && (
                                    <div style={{ marginBottom: '5px' }}>
                                        <RefComponent
                                            key={select.key}
                                            init={ref => emit({ type: "render", data: { type: "control", element: ref, payload: select.control } })}
                                            unmount={ref => emit({ type: "unmount", data: { element: ref } })}
                                        />
                                    </div>
                                )}

                                {/* Row 2: Indicator, Power, ColorBar */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                                    {indicator && (
                                        <div style={{ flex: '0 0 auto' }}>
                                            <RefComponent
                                                key={indicator.key}
                                                init={ref => emit({ type: "render", data: { type: "control", element: ref, payload: indicator.control } })}
                                                unmount={ref => emit({ type: "unmount", data: { element: ref } })}
                                            />
                                        </div>
                                    )}
                                    
                                    {/* Show Power Stats for Switches (or if power data exists) */}
                                    {power && (isSwitch || power.control.data.power !== null) && (
                                        <div style={{ flex: '0 0 auto' }}>
                                            <RefComponent
                                                key={power.key}
                                                init={ref => emit({ type: "render", data: { type: "control", element: ref, payload: power.control } })}
                                                unmount={ref => emit({ type: "unmount", data: { element: ref } })}
                                            />
                                        </div>
                                    )}

                                    {/* Show ColorBar (Intensity) ONLY for Lights */}
                                    {colorbar && isLight && (
                                        <div style={{ flex: '1 1 auto' }}>
                                            <RefComponent
                                                key={colorbar.key}
                                                init={ref => emit({ type: "render", data: { type: "control", element: ref, payload: colorbar.control } })}
                                                unmount={ref => emit({ type: "unmount", data: { element: ref } })}
                                            />
                                        </div>
                                    )}
                                </div>

                                {/* Row 3: State Control */}
                                {state && (
                                    <div>
                                        <RefComponent
                                            key={state.key}
                                            init={ref => emit({ type: "render", data: { type: "control", element: ref, payload: state.control } })}
                                            unmount={ref => emit({ type: "unmount", data: { element: ref } })}
                                        />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
