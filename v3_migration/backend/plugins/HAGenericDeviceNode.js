(function() {
    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets) {
        console.error("[HAGenericDeviceNode] Missing dependencies");
        return;
    }

    // Check for shared controls and HA utilities
    if (!window.T2Controls) {
        console.error("[HAGenericDeviceNode] Missing T2Controls - ensure 00_SharedControlsPlugin.js loads first");
        return;
    }
    if (!window.T2HAUtils) {
        console.error("[HAGenericDeviceNode] Missing T2HAUtils - ensure 00_HABasePlugin.js loads first");
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect, useRef } = React;
    const RefComponent = window.RefComponent;
    const sockets = window.sockets;
    const socket = window.socket;

    // Import shared controls from T2Controls (DRY)
    const {
        ButtonControl,
        DropdownControl,
        SwitchControl,
        NumberControl,
        StatusIndicatorControl,
        ColorBarControl,
        PowerStatsControl,
        DeviceStateControl,
        THEME,
        stopPropagation
    } = window.T2Controls;

    // Import shared HA utilities from T2HAUtils (DRY)
    const {
        getDeviceApiInfo,
        compareNames,
        isAuxiliaryEntity,
        filterDevices
    } = window.T2HAUtils;

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
                haConnected: false,
                haWsConnected: false,
                debug: false,
                haToken: sessionStorage.getItem('ha_token') || localStorage.getItem('ha_token') || "",
                transitionTime: 1000,
                filterType: "All",
                triggerMode: "Follow",
                autoRefreshInterval: 30000,
                customTitle: ""  // User-editable title for the node
            };

            this.lastTriggerValue = false;
            this.hadConnection = false;  // Track if trigger input had a connection
            this.lastHsvInfo = null;
            this.devices = [];
            this.perDeviceState = {};
            this.intervalId = null;
            this.skipInitialTrigger = true; // Skip first trigger processing after load

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

        // compareNames is now imported from T2HAUtils (DRY)
        static compareNames(a = "", b = "") {
            return compareNames(a, b);
        }

        // getDeviceApiInfo is now imported from T2HAUtils (DRY)
        getDeviceApiInfo(id) {
            return getDeviceApiInfo(id);
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
            
            // Skip trigger processing on first data() call after restore
            this.skipInitialTrigger = true;
            
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
            // Skip all processing during graph loading to prevent API flood
            if (typeof window !== 'undefined' && window.graphLoading) {
                return {};  // Return empty outputs during load
            }
            
            const hsvInput = inputs.hsv_info?.[0];
            const triggerRaw = inputs.trigger?.[0];
            // Ensure trigger is always a boolean for consistent edge detection
            const trigger = !!triggerRaw;
            // Track if we have an actual connection (triggerRaw is not undefined)
            const hasConnection = triggerRaw !== undefined;
            let needsUpdate = false;



            // On first call after load, apply current state to devices (sync devices to input)
            if (this.skipInitialTrigger) {
                this.skipInitialTrigger = false;
                this.lastTriggerValue = trigger;
                this.hadConnection = hasConnection;
                
                // Sync HSV state AND apply it immediately if connected
                if (hsvInput && typeof hsvInput === 'object') {
                    this.lastHsvInfo = JSON.stringify(hsvInput);
                    // Apply HSV immediately on first connection
                    setTimeout(async () => {
                        await this.applyHSVInput(hsvInput);
                    }, 500);
                }
                
                // In Follow mode, apply the current trigger state to all devices
                const mode = this.properties.triggerMode || "Toggle";
                if (mode === "Follow" && hasConnection) {
                    // Small delay to ensure connections are established
                    setTimeout(async () => {
                        await this.setDevicesState(trigger);
                    }, 500);
                }
                // For other modes (Toggle, Turn On, Turn Off), don't act on load - wait for user action
            } else {
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
                // Detect when a new connection is made (had no connection, now has one)
                const newConnection = hasConnection && !this.hadConnection;
                const mode = this.properties.triggerMode || "Toggle";

                if (mode === "Toggle" && risingEdge) { await this.onTrigger(); needsUpdate = true; }
                else if (mode === "Follow" && (risingEdge || fallingEdge || newConnection)) { 
                    await this.setDevicesState(trigger); 
                    needsUpdate = true; 
                }
                else if (mode === "Turn On" && risingEdge) { await this.setDevicesState(true); needsUpdate = true; }
                else if (mode === "Turn Off" && risingEdge) { await this.setDevicesState(false); needsUpdate = true; }

                this.lastTriggerValue = trigger;
                this.hadConnection = hasConnection;
            }

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
            // Filter options: All, Light, Switch (includes HA switches and Kasa plugs/wall switches)
            this.addControl("filter", new DropdownControl("Filter Devices", ["All", "Light", "Switch", "Plug"], "All", (v) => { this.properties.filterType = v; this.updateDeviceSelectorOptions(); this.triggerUpdate(); }));
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
                // Store bound handlers so we can remove them in destroy()
                this._onDeviceStateUpdate = (data) => this.handleDeviceStateUpdate(data);
                this._onHaConnectionStatus = (data) => {
                    this.properties.haConnected = data.connected;
                    this.properties.haWsConnected = data.wsConnected;
                    if (data.connected) {
                        this.updateStatus(`HA Connected (${data.deviceCount} devices)`);
                    } else {
                        this.updateStatus("HA Disconnected");
                    }
                    this.triggerUpdate();
                };
                this._onConnect = () => {
                    window.socket.emit("request-ha-status");
                    this.fetchDevices();
                };
                
                window.socket.on("device-state-update", this._onDeviceStateUpdate);
                window.socket.on("ha-connection-status", this._onHaConnectionStatus);
                window.socket.on("connect", this._onConnect);
                
                // Request current HA status
                window.socket.emit("request-ha-status");
                
                if (window.socket.connected) this.fetchDevices();
            }
        }

        async fetchDevices() {
            // Skip API calls during graph loading
            if (typeof window !== 'undefined' && window.graphLoading) return;
            try {
                // Use unified /api/devices to get ALL devices (HA, Kasa, Hue, Shelly, etc.)
                const response = await fetch('/api/devices', { headers: { 'Authorization': `Bearer ${this.properties.haToken}` } });
                const data = await response.json();
                if (data.success && data.devices) {
                    // Combine all device sources into a single flat list
                    const allDevices = [];
                    for (const [prefix, devices] of Object.entries(data.devices)) {
                        if (Array.isArray(devices)) {
                            devices.forEach(d => {
                                // Normalize device type for filtering
                                let deviceType = d.type || 'unknown';
                                // Handle HA device types (ha_light.xxx -> light)
                                if (d.id?.startsWith('ha_') && d.id.includes('.')) {
                                    deviceType = d.id.split('.')[0].replace(/^ha_/, '');
                                }
                                // Kasa plugs (wall switches) should show as 'plug' type
                                // Kasa bulbs show as 'bulb' type
                                allDevices.push({
                                    ...d,
                                    type: deviceType,
                                    source: prefix.replace('_', '') // 'ha', 'kasa', 'hue', 'shelly', etc.
                                });
                            });
                        }
                    }
                    this.devices = allDevices.sort((a, b) =>
                        HAGenericDeviceNode.compareNames(a.name || a.id, b.name || b.id)
                    );
                    this.normalizeSelectedDeviceNames();
                    this.updateStatus(`Loaded ${this.devices.length} devices`);
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
            
            // Filter out auxiliary HA entities using shared utility (DRY)
            const filteredDevices = devices.filter(device => {
                const name = (device.name || device.id || "").trim();
                return !isAuxiliaryEntity(name);
            });
            
            const nameCounts = filteredDevices.reduce((acc, device) => {
                const key = (device.name || device.id || "").trim();
                acc[key] = (acc[key] || 0) + 1;
                return acc;
            }, {});

            return filteredDevices
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
                const filterType = this.properties.filterType.toLowerCase();
                list = list.filter(item => {
                    const deviceType = item.device.type?.toLowerCase() || '';
                    // "Switch" filter matches 'switch' (HA switches), 'plug' (Kasa wall switches), and 'light' (dimmable switches/lights)
                    if (filterType === 'switch') {
                        return deviceType === 'switch' || deviceType === 'plug' || deviceType === 'light';
                    }
                    // "Light" filter also matches lights (same devices, different filter name)
                    if (filterType === 'light') {
                        return deviceType === 'light' || deviceType === 'plug';
                    }
                    return deviceType === filterType;
                });
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
                // Trigger React re-render of the dropdown
                if (ctrl.updateDropdown) ctrl.updateDropdown();
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
            // Use the device's type field, or extract from id (handling ha_ prefix)
            const entityType = dev.type || (dev.id?.includes('.') ? dev.id.split('.')[0].replace(/^ha_/, '') : 'light');
            if (colorbar) colorbar.data.entityType = entityType;
            await this.fetchDeviceState(dev.id);
            this.triggerUpdate();
        }

        async fetchDeviceState(id) {
            if (!id) return;
            // Skip API calls during graph loading
            if (typeof window !== 'undefined' && window.graphLoading) return;
            try {
                const apiInfo = this.getDeviceApiInfo(id);
                if (!apiInfo) return;
                const res = await fetch(`${apiInfo.endpoint}/${apiInfo.cleanId}/state`, { headers: { 'Authorization': `Bearer ${this.properties.haToken}` } });
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
            // Skip API calls during graph loading
            if (typeof window !== 'undefined' && window.graphLoading) return;
            const transitionMs = this.properties.transitionTime > 0 ? this.properties.transitionTime : undefined;
            const ids = this.properties.selectedDeviceIds.filter(Boolean);
            if (ids.length === 0) return;
            this.updateStatus("Applying control...");
            
            // Register pending commands so the Event Log knows this change came from the app
            const nodeTitle = this.properties.customTitle || this.label || 'HA Device';
            if (typeof window !== 'undefined' && window.registerPendingCommand) {
                ids.forEach(id => window.registerPendingCommand(id, nodeTitle, 'color'));
            }
            await Promise.all(ids.map(async (id) => {
                const apiInfo = this.getDeviceApiInfo(id);
                if (!apiInfo) return;
                
                const device = this.devices.find(d => d.id === id);
                const deviceType = device?.type || (id.includes('.') ? id.split('.')[0].replace(/^ha_/, '') : 'light');
                const isLight = deviceType === "light" || deviceType === "bulb";
                const isKasa = id.startsWith('kasa_');
                
                // BUG FIX: HSV input should NOT turn on a device that is off
                // Only the Trigger input can change device on/off state
                // Check current device state - if off, skip this device entirely
                const currentState = this.perDeviceState[id];
                const isCurrentlyOn = currentState?.on || currentState?.state === 'on';
                
                // If device is off, don't apply HSV (and don't turn it on!)
                if (!isCurrentlyOn) {
                    return; // Skip this device - it's off, HSV shouldn't turn it on
                }
                
                // Device is on, apply color/brightness changes but keep it on
                let turnOn = true; // Device is already on, keep it on
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
                // BUG FIX: Don't turn off device if brightness is 0 - just set brightness to minimum (1)
                // HSV input should NEVER change on/off state
                if (brightness === 0) brightness = 1;
                
                let payload;
                if (isKasa) {
                    // Kasa uses hsv format with hue (0-360), saturation (0-100), brightness (0-100)
                    payload = { on: turnOn };
                    if (turnOn && isLight && hs_color) {
                        payload.hsv = {
                            hue: Math.round(hs_color[0]),
                            saturation: Math.round(hs_color[1]),
                            brightness: brightness !== null ? Math.round((brightness / 255) * 100) : 100
                        };
                    }
                    if (transitionMs) payload.transition = transitionMs;
                } else {
                    // HA format
                    payload = { on: turnOn, state: turnOn ? "on" : "off" };
                    if (turnOn && isLight) {
                        if (color_temp_kelvin) payload.color_temp_kelvin = color_temp_kelvin;
                        else if (hs_color) payload.hs_color = hs_color;
                        if (brightness !== null) payload.brightness = Math.max(0, Math.min(255, Math.round(brightness)));
                        if (transitionMs) payload.transition = transitionMs;
                    }
                }
                try {
                    // For Kasa devices, use POST to /on or /off endpoint
                    if (isKasa) {
                        const action = turnOn ? 'on' : 'off';
                        await fetch(`${apiInfo.endpoint}/${apiInfo.cleanId}/${action}`, { 
                            method: "POST", 
                            headers: { "Content-Type": "application/json", 'Authorization': `Bearer ${this.properties.haToken}` }, 
                            body: JSON.stringify(payload) 
                        });
                    } else {
                        await fetch(`${apiInfo.endpoint}/${apiInfo.cleanId}/state`, { 
                            method: "PUT", 
                            headers: { "Content-Type": "application/json", 'Authorization': `Bearer ${this.properties.haToken}` }, 
                            body: JSON.stringify(payload) 
                        });
                    }
                    const current = this.perDeviceState[id] || {};
                    this.perDeviceState[id] = { ...current, on: turnOn, state: turnOn ? "on" : "off", ...(hs_color ? { hs_color } : {}), ...(color_temp_kelvin ? { color_temp_kelvin } : {}), ...(brightness !== null ? { brightness } : {}) };
                    this.updateDeviceControls(id, this.perDeviceState[id]);
                } catch (e) { console.error(`Control apply failed for ${id}`, e); }
            }));
            this.triggerUpdate();
            setTimeout(() => this.updateStatus(`Control applied to ${ids.length} devices`), 600);
        }

        async setDevicesState(turnOn) {
            // Skip API calls during graph loading to prevent resource exhaustion
            if (typeof window !== 'undefined' && window.graphLoading) {
                return;
            }
            this.updateStatus(turnOn ? "Turning On..." : "Turning Off...");
            const ids = this.properties.selectedDeviceIds.filter(Boolean);
            if (ids.length === 0) return;
            const transitionMs = this.properties.transitionTime > 0 ? this.properties.transitionTime : undefined;
            
            // Register pending commands so the Event Log knows this change came from the app
            const nodeTitle = this.properties.customTitle || this.label || 'HA Device';
            if (typeof window !== 'undefined' && window.registerPendingCommand) {
                ids.forEach(id => window.registerPendingCommand(id, nodeTitle, turnOn ? 'turn_on' : 'turn_off'));
            }
            await Promise.all(ids.map(async (id) => {
                const apiInfo = this.getDeviceApiInfo(id);
                if (!apiInfo) return;
                const isKasa = id.startsWith('kasa_');
                
                const payload = { on: turnOn, state: turnOn ? "on" : "off" };
                if (turnOn && transitionMs) payload.transition = transitionMs;
                try {
                    if (isKasa) {
                        // Kasa uses POST to /on or /off endpoint
                        const action = turnOn ? 'on' : 'off';
                        await fetch(`${apiInfo.endpoint}/${apiInfo.cleanId}/${action}`, { 
                            method: "POST", 
                            headers: { "Content-Type": "application/json", 'Authorization': `Bearer ${this.properties.haToken}` }, 
                            body: JSON.stringify(payload) 
                        });
                    } else {
                        await fetch(`${apiInfo.endpoint}/${apiInfo.cleanId}/state`, { 
                            method: "PUT", 
                            headers: { "Content-Type": "application/json", 'Authorization': `Bearer ${this.properties.haToken}` }, 
                            body: JSON.stringify(payload) 
                        });
                    }
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
            
            // Register pending commands so the Event Log knows this change came from the app
            const nodeTitle = this.properties.customTitle || this.label || 'HA Device';
            if (typeof window !== 'undefined' && window.registerPendingCommand) {
                ids.forEach(id => window.registerPendingCommand(id, nodeTitle, 'toggle'));
            }
            
            const transitionMs = this.properties.transitionTime > 0 ? this.properties.transitionTime : undefined;
            await Promise.all(ids.map(async (id) => {
                const apiInfo = this.getDeviceApiInfo(id);
                if (!apiInfo) return;
                const isKasa = id.startsWith('kasa_');
                
                const current = this.perDeviceState[id] || { on: false };
                const newOn = !current.on;
                const payload = { on: newOn, state: newOn ? "on" : "off" };
                if (newOn && transitionMs) payload.transition = transitionMs;
                try {
                    if (isKasa) {
                        // Kasa uses POST to /on, /off, or /toggle endpoint
                        await fetch(`${apiInfo.endpoint}/${apiInfo.cleanId}/toggle`, { 
                            method: "POST", 
                            headers: { "Content-Type": "application/json", 'Authorization': `Bearer ${this.properties.haToken}` }
                        });
                    } else {
                        await fetch(`${apiInfo.endpoint}/${apiInfo.cleanId}/state`, { 
                            method: "PUT", 
                            headers: { "Content-Type": "application/json", 'Authorization': `Bearer ${this.properties.haToken}` }, 
                            body: JSON.stringify(payload) 
                        });
                    }
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

        // -------------------------------------------------------------------------
        // SERIALIZATION - Only save essential configuration, NOT runtime data
        // -------------------------------------------------------------------------
        serialize() {
            // Only return user-configurable settings that need to persist
            return {
                selectedDeviceIds: this.properties.selectedDeviceIds || [],
                selectedDeviceNames: this.properties.selectedDeviceNames || [],
                filterType: this.properties.filterType || "All",
                triggerMode: this.properties.triggerMode || "Follow",
                transitionTime: this.properties.transitionTime || 1000,
                debug: this.properties.debug ?? false,
                autoRefreshInterval: this.properties.autoRefreshInterval || 30000,
                customTitle: this.properties.customTitle || ""
            };
        }

        toJSON() {
            // Override default toJSON to prevent saving runtime data like devices[], perDeviceState, etc.
            return {
                id: this.id,
                label: this.label,
                properties: this.serialize()
                // Note: inputs, outputs, controls are NOT saved - they are reconstructed on load
            };
        }

        destroy() {
            // Clear interval
            if (this.intervalId) clearInterval(this.intervalId);
            
            // Remove socket listeners to prevent memory leaks
            if (window.socket) {
                if (this._onDeviceStateUpdate) window.socket.off("device-state-update", this._onDeviceStateUpdate);
                if (this._onHaConnectionStatus) window.socket.off("ha-connection-status", this._onHaConnectionStatus);
                if (this._onConnect) window.socket.off("connect", this._onConnect);
            }
            
            super.destroy?.();
        }
    }

    // -------------------------------------------------------------------------
    // COMPONENT
    // -------------------------------------------------------------------------
    function HAGenericDeviceNodeComponent({ data, emit }) {
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
                            placeholder: data.label || "HA Generic Device",
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
                        }, customTitle || data.label || "HA Generic Device"),
                    // HA Connection Status Indicator
                    React.createElement('div', { 
                        key: 'ha-status',
                        style: { 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '6px',
                            padding: '4px 8px',
                            borderRadius: '12px',
                            background: data.properties.haConnected 
                                ? 'rgba(0, 255, 100, 0.15)' 
                                : 'rgba(255, 50, 50, 0.15)',
                            border: `1px solid ${data.properties.haConnected ? '#00ff64' : '#ff3232'}`
                        }
                    }, [
                        React.createElement('div', { 
                            key: 'dot',
                            style: { 
                                width: '8px', 
                                height: '8px', 
                                borderRadius: '50%',
                                background: data.properties.haConnected ? '#00ff64' : '#ff3232',
                                boxShadow: data.properties.haConnected 
                                    ? '0 0 6px #00ff64' 
                                    : '0 0 6px #ff3232',
                                animation: data.properties.haConnected ? 'none' : 'blink 1s infinite'
                            }
                        }),
                        React.createElement('span', { 
                            key: 'label',
                            style: { 
                                fontSize: '9px', 
                                fontWeight: 'bold',
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px',
                                color: data.properties.haConnected ? '#00ff64' : '#ff3232'
                            }
                        }, data.properties.haConnected ? 'HA' : 'HA ✕')
                    ])
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
                    return React.createElement('div', { key: index, style: { display: "flex", alignItems: "center", gap: "8px", fontSize: "11px", color: "#e0f7fa" } }, [
                        React.createElement('div', { key: 'dot', style: { width: "8px", height: "8px", borderRadius: "50%", background: isOn ? "#00f3ff" : "#333", boxShadow: isOn ? "0 0 5px #00f3ff" : "none" } }),
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
})();
