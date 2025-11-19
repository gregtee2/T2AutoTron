if (!LiteGraph.registered_node_types || !LiteGraph.registered_node_types["Power/KasaPlugControlNode"]) {
    class KasaPlugControlNode extends LiteGraph.LGraphNode {
        constructor() {
            super();
            this.title = "Kasa Plug Control";
            this.size = [400, 200];
            this.resizable = true;
            this.autosize = false;
            this.bgcolor = "rgb(0, 110, 150)";
            this.bgGradient = null;
            this.properties = {
                selectedPlugIds: [],
                selectedPlugNames: [],
                status: "No action yet",
                deviceType: "kasa"
            };
            this.plugSelectors = [];
            this.perPlugState = {};
            this.plugs = [];
            this.deviceManagerReady = false;
            this.lastToggleState = null;
            this.intendedState = null;
            this.lastActionTime = 0;
            this.actionCooldown = 1000;
            this.lastUpdate = Date.now();
            this.glowPulse = 0;
            this.isInitialLoad = true;
            this.onAddPlug = this.onAddPlug.bind(this);
            this.onRemovePlug = this.onRemovePlug.bind(this);
            this.onPlugSelected = this.onPlugSelected.bind(this);
            this.fetchPlugs = this.fetchPlugs.bind(this);
            this.onRefreshPlugs = this.onRefreshPlugs.bind(this);
            this.handleDeviceStateUpdate = this.handleDeviceStateUpdate.bind(this);
            this.needsPlugSelectorsRestore = false;
            this.setupWidgets();
            this.addInput("Trigger", "boolean");
            this.addOutput("Plug Info", "plug_info");
            this.addOutput("Energy Data", "energy_data");
            this.initializeSocketIO();
            console.log("KasaPlugControlNode - Initialized.");
        }
        initializeSocketIO() {
            if (!this.socket) {
                this.socket = io('http://localhost:3000', {
                    reconnection: true,
                    reconnectionAttempts: Infinity,
                    reconnectionDelay: 1000,
                    reconnectionDelayMax: 5000,
                    timeout: 10000
                });
                this.socket.on('connect', () => {
                    console.log("KasaPlugControlNode - Connected to Socket.IO server.");
                    this.updateStatus("✅ Connected to server.");
                    this.fetchPlugs();
                });
                this.socket.on('connect_error', (err) => {
                    console.error("KasaPlugControlNode - Connection error:", err.message);
                    this.updateStatus(`⚠️ Connection error: ${err.message}`);
                });
                this.socket.on('disconnect', () => {
                    console.log("KasaPlugControlNode - Disconnected from Socket.IO server.");
                    this.updateStatus("⚠️ Disconnected from server.");
                });
                this.socket.on('device-state-update', (state) => this.handleDeviceStateUpdate(state));
            }
        }
        handleDeviceStateUpdate(state) {
            if (!state || !state.id) {
                console.warn("KasaPlugControlNode - Received device-state-update with missing id:", state);
                return;
            }
            const { id, on, brightness, energyUsage } = state;
            if (!id.startsWith('kasa_')) return;
            const index = this.properties.selectedPlugIds.indexOf(id);
            if (index !== -1) {
                this.perPlugState[id] = {
                    ...this.perPlugState[id],
                    on,
                    brightness: brightness || this.perPlugState[id].brightness,
                    energyUsage: energyUsage || this.perPlugState[id].energyUsage,
                    lastFetched: Date.now()
                };
                const plugName = this.properties.selectedPlugNames[index];
                const power = energyUsage?.power ? `${parseFloat(energyUsage.power).toFixed(2)} W` : "N/A";
                this.updateStatus(`Plug ${plugName} is ${on ? "On" : "Off"} | Power: ${power}`);
                console.log(`[KasaPlugControl] Updated state for ${plugName} (ID: ${id}): on=${on}`);
                this.setDirtyCanvas(true);
                if (this.intendedState !== null && on !== this.intendedState) {
                    console.log(`KasaPlugControlNode - Network update (${on}) conflicts with intended state (${this.intendedState}), enforcing`);
                    this.handleToggleInput(this.intendedState, true);
                }
            }
        }
        setupWidgets() {
            const widgetWidth = this.size[0] - 20;
            this.addPlugButton = this.addWidget("button", "➕", "Add Plug", () => this.onAddPlug(), { width: 40 });
            this.removePlugButton = this.addWidget("button", "➖", "Remove Plug", () => this.onRemovePlug(), { width: 40 });
            this.refreshPlugsButton = this.addWidget("button", "🔄", "Refresh Plugs", () => this.onRefreshPlugs(), { width: 40 });
            this.statusWidget = this.addWidget("text", "Status", this.properties.status, (v) => { this.properties.status = v; }, { width: widgetWidth - 120 });
        }
        async onAdded() {
            await this.fetchPlugs();
        }
        async fetchPlugs() {
            console.log("KasaPlugControlNode - Fetching Kasa plugs...");
            try {
                const response = await fetch('http://localhost:3000/api/lights/kasa', { signal: AbortSignal.timeout(10000) });
                if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                const data = await response.json();
                console.log("Raw API response from /api/lights/kasa:", JSON.stringify(data, null, 2));
                if (data.success && data.lights) {
                    this.plugs = data.lights.filter(device => device.type === 'plug').map(device => ({
                        id: device.id,
                        name: device.name
                    }));
                    this.deviceManagerReady = true;
                    console.log(`KasaPlugControlNode - Retrieved ${this.plugs.length} plugs: ${JSON.stringify(this.plugs.map(p => p.id))}`);
                    this.onPlugsReady();
                } else {
                    throw new Error(data.message || "No Kasa plugs found");
                }
            } catch (error) {
                console.error("KasaPlugControlNode - Error fetching plugs:", error);
                this.updateStatus(`⚠️ Error fetching plugs: ${error.message}`);
            }
        }
        onPlugsReady() {
            if (this.needsPlugSelectorsRestore) {
                this.restorePlugSelectors();
            } else {
                this.updateStatus("✅ Plugs fetched successfully.");
            }
        }
        async onRefreshPlugs() {
            await this.fetchPlugs();
            this.updateStatus("✅ Plugs refreshed.");
        }
        getPlugOptions() {
            return this.plugs.length ? this.plugs.map(plug => plug.name) : ["No Kasa Plugs Found"];
        }
        onAddPlug() {
            if (!this.deviceManagerReady) {
                this.updateStatus("⚠️ Device manager not ready.");
                return;
            }
            const MAX_PLUGS = 10;
            if (this.plugSelectors.length >= MAX_PLUGS) {
                this.updateStatus(`⚠️ Maximum of ${MAX_PLUGS} plugs reached.`);
                return;
            }
            const plugSelector = this.addWidget(
                "combo",
                `Select Plug ${this.plugSelectors.length + 1}`,
                "Select Plug",
                (value) => this.onPlugSelected(value, this.plugSelectors.indexOf(plugSelector)),
                { values: ["Select Plug", ...this.getPlugOptions()], width: this.size[0] - 20 }
            );
            this.plugSelectors.push(plugSelector);
            this.properties.selectedPlugIds.push(null);
            this.properties.selectedPlugNames.push(null);
            this.updateNodeSize();
            this.setDirtyCanvas(true, false);
            this.updateStatus(`✅ Added plug selector ${this.plugSelectors.length}.`);
        }
        onRemovePlug() {
            if (this.properties.selectedPlugIds.length === 0 && this.plugSelectors.length === 0) {
                this.updateStatus("⚠️ No plugs to remove.");
                return;
            }
            if (this.plugSelectors.length > 0) {
                const plugSelector = this.plugSelectors.pop();
                const index = this.widgets.indexOf(plugSelector);
                if (index > -1) {
                    this.widgets.splice(index, 1);
                } else {
                    console.warn("KasaPlugControlNode - Plug selector not found in widgets array:", plugSelector);
                }
            }
            const removedPlugId = this.properties.selectedPlugIds.pop();
            const removedPlugName = this.properties.selectedPlugNames.pop();
            if (removedPlugId && this.perPlugState[removedPlugId]) {
                delete this.perPlugState[removedPlugId];
            }
            this.updateNodeSize();
            this.setDirtyCanvas(true);
            this.updateStatus(`✅ Removed plug "${removedPlugName || 'Unknown'}"`);
        }
        updateNodeSize() {
            this.size[0] = 400;
            const baseHeight = 40;
            let widgetsHeight = 0;
            this.widgets.forEach(widget => {
                if (!widget.name.startsWith("Select Plug")) {
                    widgetsHeight += widget.computeSize ? widget.computeSize(this.size[0])[1] : LiteGraph.NODE_WIDGET_HEIGHT;
                }
            });
            widgetsHeight += 15;
            const selectorHeight = this.plugSelectors.length * 25;
            const totalPlugHeight = this.properties.selectedPlugIds.length * 80;
            const extraHeight = 45;
            this.size[1] = baseHeight + widgetsHeight + selectorHeight + totalPlugHeight + extraHeight;
            this.setSize([this.size[0], this.size[1]]);
            this.widgets.forEach(widget => widget.options.width = widget.name === "Status" ? this.size[0] - 120 : widget.name === "Add Plug" || widget.name === "Remove Plug" || widget.name === "Refresh Plugs" ? 40 : this.size[0] - 20);
            this.setDirtyCanvas(true, true);
        }
        async onPlugSelected(value, index) {
            if (value === "Select Plug" || value === "No Kasa Plugs Found") {
                const removedPlugId = this.properties.selectedPlugIds[index];
                if (removedPlugId && this.perPlugState[removedPlugId]) {
                    delete this.perPlugState[removedPlugId];
                }
                this.properties.selectedPlugIds[index] = null;
                this.properties.selectedPlugNames[index] = null;
                this.updateStatus(`✅ Deselected plug at selector ${index + 1}.`);
                this.updateNodeSize();
                this.setDirtyCanvas(true);
                return;
            }
            const plug = this.plugs.find(p => p.name === value);
            if (plug) {
                const plugId = plug.id;
                if (this.properties.selectedPlugIds.includes(plugId)) {
                    this.updateStatus(`⚠️ Plug "${plug.name}" is already selected.`);
                    this.plugSelectors[index].value = "Select Plug";
                    this.properties.selectedPlugIds[index] = null;
                    this.properties.selectedPlugNames[index] = null;
                    return;
                }
                this.properties.selectedPlugIds[index] = plugId;
                this.properties.selectedPlugNames[index] = plug.name;
                this.perPlugState[plugId] = { on: false, brightness: 0, energyUsage: null, lastFetched: 0 };
                try {
                    await this.fetchPlugState(plugId);
                    await this.fetchPlugEnergyData(plugId);
                    this.updateStatus(`✅ Plug "${plug.name}" is ${this.perPlugState[plugId].on ? "On" : "Off"}`);
                } catch (error) {
                    console.error(`Error fetching initial state for ${plugId}:`, error);
                    this.updateStatus(`⚠️ Error fetching state for ${plug.name}: ${error.message}`);
                }
                this.updateNodeSize();
                this.setDirtyCanvas(true);
            } else {
                console.warn(`KasaPlugControlNode - No device found for name: ${value}`);
                this.updateStatus(`⚠️ Plug "${value}" not found in device list.`);
            }
        }
        async fetchPlugEnergyData(plugId, retries = 3, delay = 1000) {
            const now = Date.now();
            if (!this.isInitialLoad && this.perPlugState[plugId]?.lastEnergyFetched && (now - this.perPlugState[plugId].lastEnergyFetched < this.actionCooldown)) {
                console.log(`[KasaPlugControl] Throttling energy fetch for ${plugId}`);
                return;
            }
            const cleanId = plugId.replace(/^kasa_/, '');
            for (let attempt = 0; attempt < retries; attempt++) {
                try {
                    const response = await fetch(`http://localhost:3000/api/lights/kasa/${encodeURIComponent(cleanId)}/energy`, { signal: AbortSignal.timeout(5000) });
                    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    const data = await response.json();
                    if (data.success && data.energyData) {
                        this.perPlugState[plugId].energyUsage = data.energyData;
                        this.perPlugState[plugId].lastEnergyFetched = now;
                        this.setOutputData(1, { deviceId: plugId, energy: data.energyData });
                        const plugName = this.properties.selectedPlugNames[this.properties.selectedPlugIds.indexOf(plugId)];
                        const power = data.energyData.power ? `${parseFloat(data.energyData.power).toFixed(2)} W` : "N/A";
                        this.updateStatus(`Plug ${plugName} is ${this.perPlugState[plugId].on ? "On" : "Off"} | Power: ${power}`);
                        console.log(`[KasaPlugControl] Energy fetched for ${plugId}: ${JSON.stringify(data.energyData)}`);
                        this.setDirtyCanvas(true);
                        return;
                    } else {
                        throw new Error(data.message || "No energy data returned");
                    }
                } catch (error) {
                    console.error(`Error fetching energy for ${plugId} (attempt ${attempt + 1}):`, error);
                    this.updateStatus(`⚠️ Error fetching energy for ${plugId}: ${error.message}`);
                    if (attempt < retries - 1) {
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }
                }
            }
        }
        async handleToggleInput(toggle, force = false) {
            const now = Date.now();
            if (!force && now - this.lastActionTime < this.actionCooldown) {
                console.log(`[KasaPlugControl] Throttling toggle, last action: ${now - this.lastActionTime}ms ago`);
                return;
            }
            if (this.properties.selectedPlugIds.length === 0) {
                this.updateStatus("No plugs selected.");
                console.log("[KasaPlugControl] No plugs selected, skipping toggle.");
                return;
            }
            const desiredState = Boolean(toggle);
            let needsUpdate = force;
            if (!force) {
                for (const plugId of this.properties.selectedPlugIds) {
                    if (!plugId) continue;
                    const currentState = this.perPlugState[plugId]?.on;
                    if (currentState !== desiredState) {
                        needsUpdate = true;
                        break;
                    }
                }
            }
            if (!needsUpdate) {
                this.lastToggleState = desiredState;
                console.log("[KasaPlugControl] All plugs already in desired state.");
                return;
            }
            this.intendedState = desiredState;
            this.lastToggleState = desiredState;
            this.lastActionTime = now;
            this.updateStatus(`Setting plugs to ${desiredState ? "On" : "Off"}.`);
            for (const plugId of this.properties.selectedPlugIds) {
                if (!plugId) continue;
                if (force || !this.perPlugState[plugId]?.lastFetched || (now - this.perPlugState[plugId].lastFetched > this.actionCooldown)) {
                    await this.fetchPlugState(plugId);
                }
                if (this.perPlugState[plugId].on === desiredState) continue;
                try {
                    const action = desiredState ? 'on' : 'off';
                    const cleanId = plugId.replace(/^kasa_/, '');
                    console.log(`[KasaPlugControl] Sending ${action} to ${plugId}`);
                    const response = await fetch(`http://localhost:3000/api/lights/kasa/${encodeURIComponent(cleanId)}/${action}`, {
                        method: 'POST',
                        signal: AbortSignal.timeout(5000)
                    });
                    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    const data = await response.json();
                    if (data.success) {
                        this.perPlugState[plugId].on = desiredState;
                        this.perPlugState[plugId].lastFetched = now;
                        const plugName = this.properties.selectedPlugNames[this.properties.selectedPlugIds.indexOf(plugId)];
                        this.updateStatus(`Plug ${plugName} turned ${desiredState ? "On" : "Off"}`);
                        await this.fetchPlugEnergyData(plugId);
                    } else {
                        throw new Error(data.message || 'Toggle failed');
                    }
                } catch (error) {
                    console.error(`[KasaPlugControl] Error toggling ${plugId}:`, error);
                    this.updateStatus(`Error toggling ${plugId}: ${error.message}`);
                }
            }
        }
        async fetchPlugState(plugId) {
            const now = Date.now();
            if (this.perPlugState[plugId]?.lastFetched && (now - this.perPlugState[plugId].lastFetched < this.actionCooldown)) {
                console.log(`[KasaPlugControl] Throttling state fetch for ${plugId}`);
                return;
            }
            const cleanId = plugId.replace(/^kasa_/, '');
            try {
                console.log(`[KasaPlugControl] Fetching state for ${plugId}`);
                const response = await fetch(`http://localhost:3000/api/lights/kasa/${encodeURIComponent(cleanId)}/state`, { signal: AbortSignal.timeout(5000) });
                if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                const data = await response.json();
                if (data.success) {
                    this.perPlugState[plugId] = {
                        ...this.perPlugState[plugId],
                        on: data.state.on,
                        brightness: data.state.brightness || 0,
                        lastFetched: now
                    };
                    console.log(`[KasaPlugControl] State fetched for ${plugId}: on=${data.state.on}`);
                } else {
                    throw new Error(data.message || "Failed to fetch state");
                }
            } catch (error) {
                console.error(`Error fetching state for ${plugId}:`, error);
                this.updateStatus(`Error fetching state for ${plugId}: ${error.message}`);
            }
        }
        onExecute() {
            if (this.needsPlugSelectorsRestore) {
                this.restorePlugSelectors();
            }
            const toggle = this.getInputData(0);
            if (toggle !== undefined && toggle !== null && toggle !== this.lastToggleState) {
                this.handleToggleInput(toggle);
            }
            const plugData = {
                plugs: this.properties.selectedPlugIds
                    .filter(id => id)
                    .map(id => ({
                        plug_id: id,
                        name: this.properties.selectedPlugNames[this.properties.selectedPlugIds.indexOf(id)],
                        status: this.perPlugState[id]?.on ? "On" : "Off"
                    })),
                status: this.properties.status
            };
            this.setOutputData(0, plugData);
            const now = Date.now();
            this.glowPulse = Math.sin((now - this.lastUpdate) / 500) * 2;
            this.lastUpdate = now;
            this.setDirtyCanvas(true);
        }
        restorePlugSelectors() {
            this.plugSelectors = [];
            this.properties.selectedPlugIds.forEach((plugId, index) => {
                if (!plugId) return;
                const plug = this.plugs.find(p => p.id === plugId);
                if (plug) {
                    const plugName = plug.name;
                    const plugSelector = this.addWidget(
                        "combo",
                        `Select Plug ${index + 1}`,
                        plugName,
                        (value) => this.onPlugSelected(value, index),
                        { values: ["Select Plug", ...this.getPlugOptions()], width: this.size[0] - 20 }
                    );
                    this.plugSelectors.push(plugSelector);
                    this.perPlugState[plugId] = this.perPlugState[plugId] || { on: false, brightness: 0, energyUsage: null, lastFetched: 0 };
                }
            });
            this.updateNodeSize();
            this.needsPlugSelectorsRestore = false;
            this.setDirtyCanvas(true);
            console.log("[KasaPlugControl] Restored plug selectors:", this.properties.selectedPlugIds);
        }
        serialize() {
            const data = super.serialize();
            data.properties = this.properties;
            data.lastToggleState = this.lastToggleState;
            data.intendedState = this.intendedState;
            data.perPlugState = this.perPlugState;
            data.lastActionTime = this.lastActionTime;
            return data;
        }
        async configure(data) {
            super.configure(data);
            this.properties = data.properties || this.properties;
            this.lastToggleState = data.lastToggleState ?? null;
            this.intendedState = data.intendedState ?? null;
            this.perPlugState = data.perPlugState || {};
            this.lastActionTime = data.lastActionTime || 0;
            this.properties.deviceType = "kasa";
            this.needsPlugSelectorsRestore = true;
            this.updateStatus(this.properties.status);
            this.size[0] = 400;
            this.widgets = [];
            this.plugSelectors = [];
            this.setupWidgets();
            if (!this.deviceManagerReady || this.plugs.length === 0) {
                await this.fetchPlugs();
            }
            this.restorePlugSelectors();
            this.updateNodeSize();
            this.setDirtyCanvas(true);
            if (this.properties.selectedPlugIds.length > 0) {
                await Promise.all(
                    this.properties.selectedPlugIds
                        .filter(id => id)
                        .map(async (id) => {
                            await this.fetchPlugState(id);
                            await this.fetchPlugEnergyData(id);
                        })
                );
                const triggerInput = this.getInputData(0);
                if (triggerInput !== undefined) {
                    const needsSync = this.properties.selectedPlugIds.some(
                        plugId => plugId && this.perPlugState[plugId]?.on !== triggerInput
                    );
                    if (needsSync) {
                        await this.handleToggleInput(triggerInput, true);
                    }
                }
            }
            this.isInitialLoad = false;
        }
        onRemoved() {
            if (this.socket) {
                this.socket.disconnect();
                console.log("KasaPlugControlNode - Disconnected from Socket.IO server.");
            }
        }
        updateStatus(message) {
            this.properties.status = message || "No action yet";
            if (this.statusWidget) this.statusWidget.value = this.properties.status;
            this.setDirtyCanvas(true);
        }
        onDrawForeground(ctx) {
            if (super.onDrawForeground) super.onDrawForeground(ctx);
            let widgetsHeight = 0;
            this.widgets.forEach(widget => {
                if (!widget.name.startsWith("Select Plug")) {
                    widgetsHeight += widget.computeSize ? widget.computeSize(this.size[0])[1] : LiteGraph.NODE_WIDGET_HEIGHT;
                }
            });
            widgetsHeight += 15;
            const selectorHeight = this.plugSelectors.length * 25;
            const startY = widgetsHeight + selectorHeight + 70;
            const spacing = 80;
            this.properties.selectedPlugIds.forEach((plugId, index) => {
                if (!plugId) return;
                const plugName = this.properties.selectedPlugNames[index];
                const plugState = this.perPlugState[plugId];
                if (!plugState) return;
                const yPosition = startY + index * spacing;
                ctx.fillStyle = "#FFFFFF";
                ctx.font = "14px Arial";
                ctx.textAlign = "left";
                ctx.fillText(plugName, 10, yPosition);
                const onOffX = 375;
                const onOffY = yPosition - 5;
                const baseRadius = 10;
                ctx.beginPath();
                if (plugState.on) {
                    const now = Date.now();
                    const flashState = Math.floor(now / 500) % 2;
                    if (flashState === 0) {
                        ctx.fillStyle = "#00FF00";
                        ctx.arc(onOffX, onOffY, baseRadius, 0, Math.PI * 2);
                        ctx.fill();
                    }
                } else {
                    ctx.fillStyle = "#FF0000";
                    ctx.arc(onOffX, onOffY, baseRadius, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.strokeStyle = "#000000";
                ctx.lineWidth = 1;
                ctx.stroke();
                const energy = plugState.energyUsage || {};
                ctx.font = "12px Arial";
                ctx.textAlign = "right";
                const statsX = this.size[0] - 10;
                let yOffset = yPosition + 20;
                ctx.fillText(`Power: ${energy.power ? parseFloat(energy.power).toFixed(2) + ' W' : 'N/A'}`, statsX, yOffset);
                yOffset += 15;
                ctx.fillText(`Voltage: ${energy.voltage ? parseFloat(energy.voltage).toFixed(2) + ' V' : 'N/A'}`, statsX, yOffset);
                yOffset += 15;
                ctx.fillText(`Current: ${energy.current ? parseFloat(energy.current).toFixed(2) + ' A' : 'N/A'}`, statsX, yOffset);
                yOffset += 15;
                ctx.fillText(`Total: ${energy.total ? parseFloat(energy.total).toFixed(2) + ' kWh' : 'N/A'}`, statsX, yOffset);
            });
        }
    }
    LiteGraph.registerNodeType("Power/KasaPlugControlNode", KasaPlugControlNode);
    console.log("KasaPlugControlNode - Registered under 'Power' category.");
    LiteGraph.KasaPlugControlNode = KasaPlugControlNode;
}