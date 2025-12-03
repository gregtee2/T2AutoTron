import "../sockets.js";
import sockets from "../sockets.js";

import React, { useEffect, useState } from "react";
import { ClassicPreset } from "rete";
import { RefComponent } from "rete-react-plugin";
import { socket } from "../socket";
import { ButtonControl } from "../controls/ButtonControl";
import { DropdownControl } from "../controls/DropdownControl";
import { SwitchControl } from "../controls/SwitchControl";
import { DeviceStateControl } from "../controls/DeviceStateControl";
import { StatusIndicatorControl, PowerStatsControl } from "./HAGenericDeviceNode";

// Reuse existing styles or define new ones
import "./HAGenericDeviceNode.css"; // We can reuse the styles

export class KasaPlugNode extends ClassicPreset.Node {
    constructor(changeCallback) {
        super("Kasa Plug Control");
        this.width = 400;
        this.changeCallback = changeCallback;

        this.properties = {
            selectedPlugIds: [],
            selectedPlugNames: [],
            status: "Initializing...",
            triggerMode: "Follow",
            autoRefreshInterval: 5000
        };

        this.plugs = [];
        this.perPlugState = {};
        this.intervalId = null;

        this.addInput("trigger", new ClassicPreset.Input(sockets.boolean, "Trigger"));
        this.addOutput("plug_info", new ClassicPreset.Output(sockets.object, "Plug Info"));

        this.setupControls();
        this.initializeSocketIO();
        this.startAutoRefresh();
    }

    startAutoRefresh() {
        if (this.intervalId) clearInterval(this.intervalId);
        this.intervalId = setInterval(() => this.fetchPlugs(), this.properties.autoRefreshInterval);
    }

    restore(state) {
        if (state.properties) {
            Object.assign(this.properties, state.properties);
        }

        const triggerModeCtrl = this.controls.trigger_mode;
        if (triggerModeCtrl) triggerModeCtrl.value = this.properties.triggerMode || "Follow";

        // Re-create dynamic plug controls
        this.properties.selectedPlugIds.forEach((id, index) => {
            const base = `plug_${index}_`;
            const name = this.properties.selectedPlugNames[index] || "Plug " + (index + 1);

            this.addControl(`${base}select`, new DropdownControl(
                `Plug ${index + 1}`,
                ["Select Plug", ...this.getPlugOptions()],
                name,
                (v) => this.onPlugSelected(v, index)
            ));

            this.addControl(`${base}indicator`, new StatusIndicatorControl({ state: "off" }));
            this.addControl(`${base}power`, new PowerStatsControl({ power: null, energy: null }));
            // Removed DeviceStateControl as per user request

            // Trigger fetch for this device
            if (id) this.fetchPlugState(id);
        });

        this.fetchPlugs();
    }

    async data(inputs) {
        const triggerRaw = inputs.trigger?.[0];
        const trigger = triggerRaw ?? false;

        const risingEdge = trigger && !this.lastTriggerValue;
        const fallingEdge = !trigger && this.lastTriggerValue;
        const mode = this.properties.triggerMode || "Toggle";

        if (mode === "Toggle") {
            if (risingEdge) {
                await this.onTrigger();
            }
        } else if (mode === "Follow") {
            if (risingEdge || fallingEdge) {
                await this.setPlugsState(trigger);
            }
        } else if (mode === "Turn On") {
            if (risingEdge) {
                await this.setPlugsState(true);
            }
        } else if (mode === "Turn Off") {
            if (risingEdge) {
                await this.setPlugsState(false);
            }
        }

        this.lastTriggerValue = !!trigger;

        const outputs = {};
        const selectedStates = [];

        this.properties.selectedPlugIds.forEach((id, i) => {
            if (id) {
                const state = this.perPlugState[id] || null;
                if (state) selectedStates.push(state);
            }
        });

        return { plug_info: selectedStates.length > 0 ? selectedStates : null };
    }

    triggerUpdate() {
        if (this.changeCallback) this.changeCallback();
    }

    setupControls() {
        this.addControl("trigger_mode", new DropdownControl("Input Mode", ["Toggle", "Follow", "Turn On", "Turn Off"], "Follow", (v) => {
            this.properties.triggerMode = v;
        }));
        this.addControl("add_plug", new ButtonControl("➕ Add Plug", () => this.onAddPlug()));
        this.addControl("remove_plug", new ButtonControl("➖ Remove Plug", () => this.onRemovePlug()));
        this.addControl("refresh", new ButtonControl("🔄 Refresh", () => this.fetchPlugs()));
        this.addControl("trigger_btn", new ButtonControl("🔄 Manual Toggle", () => this.onTrigger()));
    }

    initializeSocketIO() {
        socket.on("device-state-update", (data) => this.handleDeviceStateUpdate(data));
        if (socket.connected) this.fetchPlugs();
        socket.on("connect", () => this.fetchPlugs());
    }

    async fetchPlugs() {
        try {
            const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/lights/kasa`);
            const data = await response.json();
            if (data.success && Array.isArray(data.lights)) {
                this.plugs = data.lights.filter(d => d.type === 'plug');
                this.updateStatus(`Loaded ${this.plugs.length} plugs`);
                this.updatePlugSelectorOptions();
                this.triggerUpdate();
            }
        } catch (e) {
            console.error("Fetch plugs error:", e);
            this.updateStatus("Connection failed");
        }
    }

    updateStatus(text) {
        this.properties.status = text;
        this.triggerUpdate();
    }

    onAddPlug() {
        const index = this.properties.selectedPlugIds.length;
        this.properties.selectedPlugIds.push(null);
        this.properties.selectedPlugNames.push(null);

        const base = `plug_${index}_`;
        this.addControl(`${base}select`, new DropdownControl(
            `Plug ${index + 1}`,
            ["Select Plug", ...this.getPlugOptions()],
            "Select Plug",
            (v) => this.onPlugSelected(v, index)
        ));

        this.addControl(`${base}indicator`, new StatusIndicatorControl({ state: "off" }));
        this.addControl(`${base}power`, new PowerStatsControl({ power: null, energy: null }));
        // Removed DeviceStateControl

        this.triggerUpdate();
    }

    onRemovePlug() {
        if (this.properties.selectedPlugIds.length === 0) return;
        const index = this.properties.selectedPlugIds.length - 1;
        const base = `plug_${index}_`;

        this.properties.selectedPlugIds.pop();
        this.properties.selectedPlugNames.pop();

        this.removeControl(`${base}select`);
        this.removeControl(`${base}indicator`);
        this.removeControl(`${base}power`);
        // Removed DeviceStateControl

        this.triggerUpdate();
    }

    getPlugOptions() {
        return this.plugs.map(p => p.name);
    }

    updatePlugSelectorOptions() {
        this.properties.selectedPlugIds.forEach((_, i) => {
            const ctrl = this.controls[`plug_${i}_select`];
            if (!ctrl) return;
            const current = ctrl.value || "Select Plug";
            const options = ["Select Plug", ...this.getPlugOptions()];
            if (current !== "Select Plug" && !options.includes(current)) options.push(current);
            ctrl.values = options;
            ctrl.value = current;
        });
    }

    async onPlugSelected(name, index) {
        if (name === "Select Plug") {
            this.properties.selectedPlugIds[index] = null;
            return;
        }
        const plug = this.plugs.find(p => p.name === name);
        if (!plug) return;

        this.properties.selectedPlugIds[index] = plug.id;
        this.properties.selectedPlugNames[index] = plug.name;

        // Removed DeviceStateControl update

        await this.fetchPlugState(plug.id);
        this.triggerUpdate();
    }

    async fetchPlugState(id) {
        if (!id) return;
        const cleanId = id.replace('kasa_', '');
        try {
            // Fetch State
            const resState = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/lights/kasa/${cleanId}/state`);
            const dataState = await resState.json();
            
            // Fetch Energy
            const resEnergy = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/lights/kasa/${cleanId}/energy`);
            const dataEnergy = await resEnergy.json();

            if (dataState.success) {
                const newState = {
                    ...this.perPlugState[id],
                    on: dataState.state.on,
                    state: dataState.state.on ? "on" : "off",
                    energyUsage: dataEnergy.success ? dataEnergy.energyData : null
                };
                this.perPlugState[id] = newState;
                this.updatePlugControls(id, newState);
                this.triggerUpdate();
            }
        } catch (e) {
            console.error("Failed to fetch plug state", id, e);
        }
    }

    async setPlugsState(turnOn) {
        const ids = this.properties.selectedPlugIds.filter(Boolean);
        if (ids.length === 0) return;

        await Promise.all(ids.map(async (id) => {
            const cleanId = id.replace('kasa_', '');
            const action = turnOn ? 'on' : 'off';

            try {
                await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/lights/kasa/${cleanId}/${action}`, {
                    method: "POST"
                });
                // Optimistic update
                this.perPlugState[id] = { ...this.perPlugState[id], on: turnOn, state: turnOn ? "on" : "off" };
                this.updatePlugControls(id, this.perPlugState[id]);
            } catch (e) {
                console.error(`Set state failed for ${id}`, e);
            }
        }));
        this.triggerUpdate();
    }

    async onTrigger() {
        const ids = this.properties.selectedPlugIds.filter(Boolean);
        if (ids.length === 0) return;

        await Promise.all(ids.map(async (id) => {
            const current = this.perPlugState[id] || { on: false };
            const newOn = !current.on;
            const cleanId = id.replace('kasa_', '');
            const action = newOn ? 'on' : 'off';

            try {
                await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/lights/kasa/${cleanId}/${action}`, {
                    method: "POST"
                });
                // Optimistic update
                this.perPlugState[id] = { ...this.perPlugState[id], on: newOn, state: newOn ? "on" : "off" };
                this.updatePlugControls(id, this.perPlugState[id]);
            } catch (e) {
                console.error(`Toggle failed for ${id}`, e);
            }
        }));
        this.triggerUpdate();
    }

    handleDeviceStateUpdate(data) {
        if (!data.id || !data.id.startsWith('kasa_')) return;
        
        const id = data.id;
        if (this.properties.selectedPlugIds.includes(id)) {
            const newState = {
                ...this.perPlugState[id],
                on: data.on,
                state: data.on ? "on" : "off",
                energyUsage: data.energyUsage || this.perPlugState[id]?.energyUsage
            };
            this.perPlugState[id] = newState;
            this.updatePlugControls(id, newState);
            this.triggerUpdate();
        }
    }

    updatePlugControls(id, state) {
        this.properties.selectedPlugIds.forEach((plugId, i) => {
            if (plugId !== id) return;
            const base = `plug_${i}_`;
            const indicator = this.controls[`${base}indicator`];
            const power = this.controls[`${base}power`];

            if (indicator) indicator.data = { state: state.on ? "on" : "off" };
            if (power && state.energyUsage) {
                power.data = { 
                    power: state.energyUsage.power ? parseFloat(state.energyUsage.power).toFixed(2) : null, 
                    energy: state.energyUsage.total ? parseFloat(state.energyUsage.total).toFixed(2) : null 
                };
            }
        });
    }

    destroy() {
        if (this.intervalId) clearInterval(this.intervalId);
        super.destroy?.();
    }
}

export function KasaPlugNodeComponent({ data, emit }) {
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
    const plugGroups = {};

    allControls.forEach(([key, control]) => {
        if (key.startsWith("plug_")) {
            const parts = key.split("_");
            const index = parts[1];
            if (!plugGroups[index]) plugGroups[index] = [];
            plugGroups[index].push({ key, control });
        } else {
            globalControls.push({ key, control });
        }
    });

    const containerStyle = {
        background: "#002b36", // Dark teal for Kasa
        border: "1px solid #2aa198", // Cyan/Teal border
        borderRadius: "8px",
        color: "#e0f7fa",
        minWidth: "350px",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 0 15px rgba(42, 161, 152, 0.2)"
    };

    const headerStyle = {
        padding: "10px",
        background: "linear-gradient(90deg, rgba(42, 161, 152, 0.2), rgba(0, 0, 0, 0))",
        borderBottom: "1px solid rgba(42, 161, 152, 0.3)",
        borderTopLeftRadius: "8px",
        borderTopRightRadius: "8px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
    };

    const controlsStyle = {
        padding: "10px",
        background: "rgba(0, 20, 30, 0.4)",
        display: "flex",
        flexDirection: "column",
        gap: "8px"
    };

    const summaryStyle = {
        padding: "10px",
        background: "rgba(0, 10, 15, 0.4)",
        borderTop: "1px solid rgba(42, 161, 152, 0.2)",
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
                    <div style={{ fontWeight: "bold" }}>{data.label}</div>
                </div>
                <div style={{ fontSize: "0.8em", color: "#aaa" }}>{data.properties.status}</div>
            </div>

            {/* IO Ports */}
            <div style={{ padding: "10px", display: "flex", justifyContent: "space-between", background: "rgba(0,0,0,0.2)" }}>
                <div className="inputs">
                    {inputs.map(([key, input]) => (
                        <div key={key} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <RefComponent init={ref => emit({ type: "render", data: { type: "socket", element: ref, payload: input.socket, nodeId: data.id, side: "input", key } })} unmount={ref => emit({ type: "unmount", data: { element: ref } })} />
                            <span style={{ fontSize: "0.8em" }}>{input.label}</span>
                        </div>
                    ))}
                </div>
                <div className="outputs">
                    {outputs.map(([key, output]) => (
                        <div key={key} style={{ display: "flex", alignItems: "center", gap: "8px", justifyContent: "flex-end" }}>
                            <span style={{ fontSize: "0.8em" }}>{output.label}</span>
                            <RefComponent init={ref => emit({ type: "render", data: { type: "socket", element: ref, payload: output.socket, nodeId: data.id, side: "output", key } })} unmount={ref => emit({ type: "unmount", data: { element: ref } })} />
                        </div>
                    ))}
                </div>
            </div>

            {/* Collapsed View: Summary Only */}
            {isCollapsed && (
                <div style={summaryStyle}>
                    {Object.entries(plugGroups).map(([index, groupControls]) => {
                        const select = groupControls.find(c => c.key.endsWith("_select"));
                        const indicator = groupControls.find(c => c.key.endsWith("_indicator"));
                        const name = select?.control?.value || `Plug ${parseInt(index) + 1}`;
                        const isOn = indicator?.control?.data?.state === "on";
                        
                        if (name === "Select Plug") return null;

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
                    {Object.keys(plugGroups).length === 0 && <div style={{ fontSize: "11px", color: "#aaa" }}>No plugs added</div>}
                </div>
            )}

            {!isCollapsed && (
                <div style={controlsStyle}>
                    {globalControls.map(({ key, control }) => (
                        <RefComponent key={key} init={ref => emit({ type: "render", data: { type: "control", element: ref, payload: control } })} unmount={ref => emit({ type: "unmount", data: { element: ref } })} />
                    ))}

                    {Object.entries(plugGroups).map(([index, groupControls]) => {
                        const findControl = (suffix) => groupControls.find(c => c.key.endsWith(suffix));
                        const select = findControl("_select");
                        const indicator = findControl("_indicator");
                        const power = findControl("_power");
                        // Removed state control

                        return (
                            <div key={index} style={{ border: '1px solid rgba(42, 161, 152, 0.2)', padding: '8px', borderRadius: '6px', marginTop: '8px', background: 'rgba(0, 43, 54, 0.4)' }}>
                                {select && <RefComponent key={select.key} init={ref => emit({ type: "render", data: { type: "control", element: ref, payload: select.control } })} unmount={ref => emit({ type: "unmount", data: { element: ref } })} />}
                                
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '5px' }}>
                                    {indicator && <RefComponent key={indicator.key} init={ref => emit({ type: "render", data: { type: "control", element: ref, payload: indicator.control } })} unmount={ref => emit({ type: "unmount", data: { element: ref } })} />}
                                    {power && <RefComponent key={power.key} init={ref => emit({ type: "render", data: { type: "control", element: ref, payload: power.control } })} unmount={ref => emit({ type: "unmount", data: { element: ref } })} />}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
