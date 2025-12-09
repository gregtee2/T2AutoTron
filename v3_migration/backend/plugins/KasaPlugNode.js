(function() {
    // Debug: console.log("[KasaPlugNode] Loading plugin...");

    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets || !window.T2Controls) {
        console.error("[KasaPlugNode] Missing dependencies", {
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
    const socket = window.socket;

    // -------------------------------------------------------------------------
    // Import shared controls from T2Controls
    // -------------------------------------------------------------------------
    const {
        ButtonControl,
        DropdownControl,
        StatusIndicatorControl,
        PowerStatsControl
    } = window.T2Controls;

    // -------------------------------------------------------------------------
    // NODE CLASS
    // -------------------------------------------------------------------------
    class KasaPlugNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("Kasa Plug Control");
            this.width = 400;
            this.changeCallback = changeCallback;
            this.properties = { selectedPlugIds: [], selectedPlugNames: [], status: "Initializing...", triggerMode: "Follow", autoRefreshInterval: 5000 };
            this.plugs = [];
            this.perPlugState = {};
            this.intervalId = null;

            try {
                this.addInput("trigger", new ClassicPreset.Input(sockets.boolean || new ClassicPreset.Socket('boolean'), "Trigger"));
                this.addOutput("plug_info", new ClassicPreset.Output(sockets.object || new ClassicPreset.Socket('object'), "Plug Info"));
            } catch (e) { console.error("[KasaPlugNode] Error adding sockets:", e); }

            this.setupControls();
            this.initializeSocketIO();
            this.startAutoRefresh();
        }

        // Get effective trigger source for Event Log attribution
        getEffectiveTriggerSource() {
            // Check if there's a recent buffer trigger source
            if (window.AutoTronBuffer && typeof window.AutoTronBuffer.getLastTriggerSource === 'function') {
                const bufferSource = window.AutoTronBuffer.getLastTriggerSource();
                if (bufferSource) {
                    return bufferSource;
                }
            }
            // Fall back to node label
            return this.label || 'Kasa Plug';
        }

        startAutoRefresh() {
            if (this.intervalId) clearInterval(this.intervalId);
            this.intervalId = setInterval(() => this.fetchPlugs(), this.properties.autoRefreshInterval);
        }

        restore(state) {
            if (state.properties) Object.assign(this.properties, state.properties);
            if (this.controls.trigger_mode) this.controls.trigger_mode.value = this.properties.triggerMode || "Follow";
            this.properties.selectedPlugIds.forEach((id, index) => {
                const base = `plug_${index}_`;
                const name = this.properties.selectedPlugNames[index] || "Plug " + (index + 1);
                this.addControl(`${base}select`, new DropdownControl(`Plug ${index + 1}`, ["Select Plug", ...this.getPlugOptions()], name, (v) => this.onPlugSelected(v, index)));
                this.addControl(`${base}indicator`, new StatusIndicatorControl({ state: "off" }));
                this.addControl(`${base}power`, new PowerStatsControl({ power: null, energy: null }));
                if (id) this.fetchPlugState(id);
            });
            this.fetchPlugs();
        }

        async data(inputs) {
            // Skip all processing during graph loading to prevent API flood
            if (typeof window !== 'undefined' && window.graphLoading) {
                return {};  // Return empty outputs during load
            }
            
            const triggerRaw = inputs.trigger?.[0];
            const trigger = triggerRaw ?? false;
            const risingEdge = trigger && !this.lastTriggerValue;
            const fallingEdge = !trigger && this.lastTriggerValue;
            const mode = this.properties.triggerMode || "Toggle";

            if (mode === "Toggle" && risingEdge) await this.onTrigger();
            else if (mode === "Follow" && (risingEdge || fallingEdge)) await this.setPlugsState(trigger);
            else if (mode === "Turn On" && risingEdge) await this.setPlugsState(true);
            else if (mode === "Turn Off" && risingEdge) await this.setPlugsState(false);

            this.lastTriggerValue = !!trigger;
            const selectedStates = [];
            this.properties.selectedPlugIds.forEach((id) => {
                if (id) { const state = this.perPlugState[id] || null; if (state) selectedStates.push(state); }
            });
            return { plug_info: selectedStates.length > 0 ? selectedStates : null };
        }

        triggerUpdate() { if (this.changeCallback) this.changeCallback(); }

        setupControls() {
            this.addControl("trigger_mode", new DropdownControl("Input Mode", ["Toggle", "Follow", "Turn On", "Turn Off"], "Follow", (v) => { this.properties.triggerMode = v; }));
            this.addControl("add_plug", new ButtonControl("➕ Add Plug", () => this.onAddPlug()));
            this.addControl("remove_plug", new ButtonControl("➖ Remove Plug", () => this.onRemovePlug()));
            this.addControl("refresh", new ButtonControl("🔄 Refresh", () => this.fetchPlugs()));
            this.addControl("trigger_btn", new ButtonControl("🔄 Manual Toggle", () => this.onTrigger()));
        }

        initializeSocketIO() {
            if (window.socket) {
                // Store bound handlers so we can remove them in destroy()
                this._onDeviceStateUpdate = (data) => this.handleDeviceStateUpdate(data);
                this._onConnect = () => this.fetchPlugs();
                
                // Listen for graph load complete event to refresh devices
                this._onGraphLoadComplete = () => {
                    this.fetchPlugs();
                    // Also fetch state for each selected plug
                    this.properties.selectedPlugIds.filter(Boolean).forEach(id => {
                        this.fetchPlugState(id);
                    });
                };
                
                window.socket.on("device-state-update", this._onDeviceStateUpdate);
                window.socket.on("connect", this._onConnect);
                window.addEventListener("graphLoadComplete", this._onGraphLoadComplete);
                
                if (window.socket.connected) this.fetchPlugs();
            }
        }

        async fetchPlugs() {
            // Skip API calls during graph loading
            if (typeof window !== 'undefined' && window.graphLoading) return;
            try {
                const response = await fetch('/api/lights/kasa');
                const data = await response.json();
                if (data.success && Array.isArray(data.lights)) {
                    this.plugs = data.lights.filter(d => d.type === 'plug');
                    this.updateStatus(`Loaded ${this.plugs.length} plugs`);
                    this.updatePlugSelectorOptions();
                    this.triggerUpdate();
                }
            } catch (e) { console.error("Fetch plugs error:", e); this.updateStatus("Connection failed"); }
        }

        updateStatus(text) { this.properties.status = text; this.triggerUpdate(); }

        onAddPlug() {
            const index = this.properties.selectedPlugIds.length;
            this.properties.selectedPlugIds.push(null);
            this.properties.selectedPlugNames.push(null);
            const base = `plug_${index}_`;
            this.addControl(`${base}select`, new DropdownControl(`Plug ${index + 1}`, ["Select Plug", ...this.getPlugOptions()], "Select Plug", (v) => this.onPlugSelected(v, index)));
            this.addControl(`${base}indicator`, new StatusIndicatorControl({ state: "off" }));
            this.addControl(`${base}power`, new PowerStatsControl({ power: null, energy: null }));
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
            this.triggerUpdate();
        }

        getPlugOptions() { return this.plugs.map(p => p.name); }

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
            if (name === "Select Plug") { this.properties.selectedPlugIds[index] = null; return; }
            const plug = this.plugs.find(p => p.name === name);
            if (!plug) return;
            this.properties.selectedPlugIds[index] = plug.id;
            this.properties.selectedPlugNames[index] = plug.name;
            await this.fetchPlugState(plug.id);
            this.triggerUpdate();
        }

        async fetchPlugState(id) {
            if (!id) return;
            // Skip API calls during graph loading
            if (typeof window !== 'undefined' && window.graphLoading) return;
            const cleanId = id.replace('kasa_', '');
            try {
                const resState = await fetch(`/api/lights/kasa/${cleanId}/state`);
                const dataState = await resState.json();
                const resEnergy = await fetch(`/api/lights/kasa/${cleanId}/energy`);
                const dataEnergy = await resEnergy.json();
                if (dataState.success) {
                    const newState = { ...this.perPlugState[id], on: dataState.state.on, state: dataState.state.on ? "on" : "off", energyUsage: dataEnergy.success ? dataEnergy.energyData : null };
                    this.perPlugState[id] = newState;
                    this.updatePlugControls(id, newState);
                    this.triggerUpdate();
                }
            } catch (e) { console.error("Failed to fetch plug state", id, e); }
        }

        async setPlugsState(turnOn) {
            // Skip API calls during graph loading
            if (typeof window !== 'undefined' && window.graphLoading) return;
            const ids = this.properties.selectedPlugIds.filter(Boolean);
            if (ids.length === 0) return;
            
            // Register pending commands so the Event Log knows this change came from the app
            const nodeTitle = this.getEffectiveTriggerSource();
            if (typeof window !== 'undefined' && window.registerPendingCommand) {
                ids.forEach(id => window.registerPendingCommand(id, nodeTitle, turnOn ? 'turn_on' : 'turn_off'));
            }
            
            await Promise.all(ids.map(async (id) => {
                const cleanId = id.replace('kasa_', '');
                const action = turnOn ? 'on' : 'off';
                try {
                    await fetch(`/api/lights/kasa/${cleanId}/${action}`, { method: "POST" });
                    this.perPlugState[id] = { ...this.perPlugState[id], on: turnOn, state: turnOn ? "on" : "off" };
                    this.updatePlugControls(id, this.perPlugState[id]);
                } catch (e) { console.error(`Set state failed for ${id}`, e); }
            }));
            this.triggerUpdate();
        }

        async onTrigger() {
            // Skip API calls during graph loading
            if (typeof window !== 'undefined' && window.graphLoading) return;
            const ids = this.properties.selectedPlugIds.filter(Boolean);
            if (ids.length === 0) return;
            
            // Register pending commands so the Event Log knows this change came from the app
            const nodeTitle = this.getEffectiveTriggerSource();
            if (typeof window !== 'undefined' && window.registerPendingCommand) {
                ids.forEach(id => window.registerPendingCommand(id, nodeTitle, 'toggle'));
            }
            
            await Promise.all(ids.map(async (id) => {
                const current = this.perPlugState[id] || { on: false };
                const newOn = !current.on;
                const cleanId = id.replace('kasa_', '');
                const action = newOn ? 'on' : 'off';
                try {
                    await fetch(`/api/lights/kasa/${cleanId}/${action}`, { method: "POST" });
                    this.perPlugState[id] = { ...this.perPlugState[id], on: newOn, state: newOn ? "on" : "off" };
                    this.updatePlugControls(id, this.perPlugState[id]);
                } catch (e) { console.error(`Toggle failed for ${id}`, e); }
            }));
            this.triggerUpdate();
        }

        handleDeviceStateUpdate(data) {
            if (!data.id || !data.id.startsWith('kasa_')) return;
            const id = data.id;
            if (this.properties.selectedPlugIds.includes(id)) {
                const newState = { ...this.perPlugState[id], on: data.on, state: data.on ? "on" : "off", energyUsage: data.energyUsage || this.perPlugState[id]?.energyUsage };
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
                    power.data = { power: state.energyUsage.power ? parseFloat(state.energyUsage.power).toFixed(2) : null, energy: state.energyUsage.total ? parseFloat(state.energyUsage.total).toFixed(2) : null };
                }
            });
        }

        // -------------------------------------------------------------------------
        // SERIALIZATION - Only save essential configuration, NOT runtime data
        // -------------------------------------------------------------------------
        serialize() {
            return {
                selectedPlugIds: this.properties.selectedPlugIds || [],
                selectedPlugNames: this.properties.selectedPlugNames || [],
                triggerMode: this.properties.triggerMode || "Follow",
                autoRefreshInterval: this.properties.autoRefreshInterval || 5000
            };
        }

        toJSON() {
            return {
                id: this.id,
                label: this.label,
                properties: this.serialize()
            };
        }

        destroy() {
            // Clear interval
            if (this.intervalId) clearInterval(this.intervalId);
            
            // Remove socket listeners to prevent memory leaks
            if (window.socket) {
                if (this._onDeviceStateUpdate) window.socket.off("device-state-update", this._onDeviceStateUpdate);
                if (this._onConnect) window.socket.off("connect", this._onConnect);
            }
            
            // Remove window event listener
            if (this._onGraphLoadComplete) {
                window.removeEventListener("graphLoadComplete", this._onGraphLoadComplete);
            }
            
            super.destroy?.();
        }
    }

    // -------------------------------------------------------------------------
    // COMPONENT
    // -------------------------------------------------------------------------
    function KasaPlugNodeComponent({ data, emit }) {
        const [seed, setSeed] = useState(0);
        const [isCollapsed, setIsCollapsed] = useState(false);
        useEffect(() => { data.changeCallback = () => setSeed(s => s + 1); return () => { data.changeCallback = null; }; }, [data]);

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

        return React.createElement('div', { className: 'kasa-node' }, [
            React.createElement('div', { key: 'h', className: 'kasa-header' }, [
                React.createElement('div', { key: 't', style: { display: "flex", alignItems: "center", gap: "8px" } }, [
                    React.createElement('div', { key: 'c', style: { cursor: "pointer", fontSize: "12px" }, onPointerDown: (e) => { e.stopPropagation(); setIsCollapsed(!isCollapsed); } }, isCollapsed ? "▶" : "▼"),
                    React.createElement('div', { key: 'l', style: { fontWeight: "bold" } }, data.label)
                ]),
                React.createElement('div', { key: 's', style: { fontSize: "0.8em", color: "#aaa" } }, data.properties.status)
            ]),
            React.createElement('div', { key: 'io', style: { padding: "10px", display: "flex", justifyContent: "space-between", background: "rgba(0,0,0,0.2)" } }, [
                React.createElement('div', { key: 'i', className: 'inputs' }, inputs.map(([key, input]) => React.createElement('div', { key: key, style: { display: "flex", alignItems: "center", gap: "8px" } }, [
                    React.createElement(RefComponent, { key: 'r', init: ref => emit({ type: "render", data: { type: "socket", element: ref, payload: input.socket, nodeId: data.id, side: "input", key } }), unmount: ref => emit({ type: "unmount", data: { element: ref } }) }),
                    React.createElement('span', { key: 'l', style: { fontSize: "0.8em" } }, input.label)
                ]))),
                React.createElement('div', { key: 'o', className: 'outputs' }, outputs.map(([key, output]) => React.createElement('div', { key: key, style: { display: "flex", alignItems: "center", gap: "8px", justifyContent: "flex-end" } }, [
                    React.createElement('span', { key: 'l', style: { fontSize: "0.8em" } }, output.label),
                    React.createElement(RefComponent, { key: 'r', init: ref => emit({ type: "render", data: { type: "socket", element: ref, payload: output.socket, nodeId: data.id, side: "output", key } }), unmount: ref => emit({ type: "unmount", data: { element: ref } }) })
                ])))
            ]),
            isCollapsed && React.createElement('div', { key: 'col', style: { padding: "10px", background: "rgba(0, 10, 15, 0.4)", display: "flex", flexDirection: "column", gap: "4px" } }, 
                Object.entries(plugGroups).map(([index, groupControls]) => {
                    const select = groupControls.find(c => c.key.endsWith("_select"));
                    const indicator = groupControls.find(c => c.key.endsWith("_indicator"));
                    const name = select?.control?.value || `Plug ${parseInt(index) + 1}`;
                    const isOn = indicator?.control?.data?.state === "on";
                    if (name === "Select Plug") return null;
                    return React.createElement('div', { key: index, style: { display: "flex", alignItems: "center", gap: "8px", fontSize: "11px", color: "#c5cdd3" } }, [
                        React.createElement('div', { key: 'd', style: { width: "8px", height: "8px", borderRadius: "50%", background: isOn ? "#4fc3f7" : "#333", boxShadow: isOn ? "0 0 5px #4fc3f7" : "none" } }),
                        React.createElement('span', { key: 'n' }, name)
                    ]);
                })
            ),
            !isCollapsed && React.createElement('div', { key: 'exp', className: 'kasa-controls' }, [
                ...globalControls.map(({ key, control }) => React.createElement(RefComponent, { key: key, init: ref => emit({ type: "render", data: { type: "control", element: ref, payload: control } }), unmount: ref => emit({ type: "unmount", data: { element: ref } }) })),
                ...Object.entries(plugGroups).map(([index, groupControls]) => {
                    const findControl = (suffix) => groupControls.find(c => c.key.endsWith(suffix));
                    const select = findControl("_select");
                    const indicator = findControl("_indicator");
                    const power = findControl("_power");
                    return React.createElement('div', { key: index, className: 'kasa-plug-item' }, [
                        select && React.createElement(RefComponent, { key: select.key, init: ref => emit({ type: "render", data: { type: "control", element: ref, payload: select.control } }), unmount: ref => emit({ type: "unmount", data: { element: ref } }) }),
                        React.createElement('div', { key: 'r', style: { display: 'flex', alignItems: 'center', gap: '8px', marginTop: '5px' } }, [
                            indicator && React.createElement(RefComponent, { key: indicator.key, init: ref => emit({ type: "render", data: { type: "control", element: ref, payload: indicator.control } }), unmount: ref => emit({ type: "unmount", data: { element: ref } }) }),
                            power && React.createElement(RefComponent, { key: power.key, init: ref => emit({ type: "render", data: { type: "control", element: ref, payload: power.control } }), unmount: ref => emit({ type: "unmount", data: { element: ref } }) })
                        ])
                    ]);
                })
            ])
        ]);
    }

    window.nodeRegistry.register('KasaPlugNode', {
        label: "Kasa Plug Control",
        category: "Plugs",
        nodeClass: KasaPlugNode,
        factory: (cb) => new KasaPlugNode(cb),
        component: KasaPlugNodeComponent
    });

    // console.log("[KasaPlugNode] Registered");
})();
