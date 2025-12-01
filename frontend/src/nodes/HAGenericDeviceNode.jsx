// HAGenericDeviceNode.jsx
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
            haToken: "",
            transitionTime: 1000,
            filterType: "All",
            autoRefreshInterval: 30000
        };

        this.lastTriggerValue = false;   // ← For rising-edge detection
        this.devices = [];
        this.perDeviceState = {};
        this.intervalId = null;

        // Separate inputs - HSV is dedicated for HSV control only
        this.addInput("hsv_info", new ClassicPreset.Input(sockets.object, "HSV Info"));
        this.addInput("trigger", new ClassicPreset.Input(sockets.boolean, "Trigger"));
        this.addOutput("all_devices", new ClassicPreset.Output(sockets.lightInfo, "All Devices"));

        this.setupControls();
        this.initializeSocketIO();
        this.startAutoRefresh();
    }

    startAutoRefresh() {
        if (this.intervalId) clearInterval(this.intervalId);
        this.intervalId = setInterval(() => this.fetchDevices(), this.properties.autoRefreshInterval);
    }

    async data(inputs) {
        const hsvInput = inputs.hsv_info?.[0];
        const triggerRaw = inputs.trigger?.[0];
        const trigger = triggerRaw ?? false;

        if (this.properties.debug) {
            console.log('[HAGenericDeviceNode] data() - trigger:', triggerRaw, 'hsv:', hsvInput);
        }

        let needsUpdate = false;

        if (hsvInput) {
            await this.applyHSVInput(hsvInput);
            needsUpdate = true;
        }

        // Rising-edge detection — works perfectly with Pulse Mode
        if (trigger && !this.lastTriggerValue) {
            console.log('[HAGenericDeviceNode] *** RISING EDGE DETECTED → TOGGLING DEVICES ***');
            await this.onTrigger();
            needsUpdate = true;
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

        const transitionSec = this.properties.transitionTime > 0 ? this.properties.transitionTime / 1000 : undefined;
        const ids = this.properties.selectedDeviceIds.filter(Boolean);
        if (ids.length === 0) return;

        this.updateStatus("Applying control...");

        await Promise.all(ids.map(async (id) => {
            const entityType = id.split('.')[0];
            const isLight = entityType === "light";

            let turnOn = info.on ?? true;
            let hs_color = null;
            let brightness = null;

            if (Array.isArray(info.hs_color)) hs_color = info.hs_color;
            else if (info.h !== undefined && info.s !== undefined) hs_color = [info.h, (info.s ?? 0) * 100];

            if (info.brightness !== undefined) brightness = info.brightness;
            else if (info.v !== undefined) brightness = Math.round((info.v ?? 0) * 255);

            if (brightness === 0) turnOn = false;

            const payload = { on: turnOn, state: turnOn ? "on" : "off" };
            if (turnOn && isLight) {
                if (hs_color) payload.hs_color = hs_color;
                if (brightness !== null) payload.brightness = brightness;
                if (transitionSec) payload.transition = transitionSec;
            }

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

    async onTrigger() {
        this.updateStatus("Toggling...");
        const ids = this.properties.selectedDeviceIds.filter(Boolean);
        const transitionSec = this.properties.transitionTime > 0 ? this.properties.transitionTime / 1000 : undefined;

        await Promise.all(ids.map(async (id) => {
            const current = this.perDeviceState[id] || { on: false };
            const newOn = !current.on;

            const payload = {
                on: newOn,
                state: newOn ? "on" : "off",
            };
            if (newOn && transitionSec) payload.transition = transitionSec;

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
                power: a.power ?? null,
                energy: a.energy ?? null,
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
            if (colorbar) colorbar.data = { brightness: state.brightness ?? 0, hs_color: state.hs_color ?? [0, 0], entityType: id.split('.')[0] };
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

    useEffect(() => {
        data.changeCallback = () => setSeed(s => s + 1);
        return () => { data.changeCallback = null; };
    }, [data]);

    const inputs = Object.entries(data.inputs);
    const outputs = Object.entries(data.outputs);
    const controls = Object.entries(data.controls);

    return (
        <div className="ha-node-tron">
            <div className="ha-node-header">
                <div className="ha-node-title">{data.label || "HA Generic Device"}</div>
                <div className="ha-node-status">{data.properties.status}</div>
            </div>

            <div className="ha-io-container">
                <div className="inputs">
                    {inputs.map(([key, input]) => (
                        <div key={key} className="io-row">
                            <RefComponent
                                init={ref => emit({ type: "render", data: { type: "socket", element: ref, payload: input.socket, nodeId: data.id, side: "input", key } })}
                                unmount={ref => emit({ type: "unmount", data: { element: ref } })}
                            />
                            <span className="ha-socket-label">{input.label}</span>
                        </div>
                    ))}
                </div>

                <div className="outputs">
                    {outputs.map(([key, output]) => (
                        <div key={key} className="io-row">
                            <span className="ha-socket-label">{output.label}</span>
                            <RefComponent
                                init={ref => emit({ type: "render", data: { type: "socket", element: ref, payload: output.socket, nodeId: data.id, side: "output", key } })}
                                unmount={ref => emit({ type: "unmount", data: { element: ref } })}
                            />
                        </div>
                    ))}
                </div>
            </div>

            <div className="ha-controls-container">
                {controls.map(([key, control]) => (
                    <RefComponent
                        key={key}
                        init={ref => emit({ type: "render", data: { type: "control", element: ref, payload: control } })}
                        unmount={ref => emit({ type: "unmount", data: { element: ref } })}
                    />
                ))}
            </div>
        </div>
    );
}
