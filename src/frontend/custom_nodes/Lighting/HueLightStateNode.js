if (!LiteGraph.registered_node_types?.["Lighting/HueLightStateNode"]) {
    class HueLightStateNode extends LiteGraph.LGraphNode {
        static deviceCache = null;
        static deviceCacheTimestamp = 0;
        static CACHE_VALIDITY = 60000; // Cache devices for 60 seconds

        constructor() {
            super();
            this.title = "Hue Light State";
            this.size = [350, 250];
            this.resizable = true;
            this.bgcolor = "rgb(80, 100, 120)";
            this.properties = {
                selectedLightIds: [],
                selectedLightNames: [],
                status: "No lights selected",
                maxRetries: 3,
                enablePolling: true,
                pollingInterval: 1000
            };
            this.BACKEND_URL = "http://localhost:3000";
            this.devices = [];
            this.deviceManagerReady = false;
            this.perLightState = {};
            this.lightSelectors = [];
            this.lastUpdate = Date.now();
            this.pollingTimer = null;
            this.lastUpdateTime = null;
            this.isConfigured = false; // New flag for configuration state
            this.addOutput("Current HSVs", "hsv_info_array");
            this.mode = LiteGraph.ALWAYS;
            this.setupWidgets();
            this.bindMethods();
            this.initializeSocketIO();
            this.fetchDevices();
            this.isConfigured = true; // Constructor sets initial configuration
        }

        bindMethods() {
            this.onAddLight = this.onAddLight.bind(this);
            this.onRemoveLight = this.onRemoveLight.bind(this);
            this.onLightSelected = this.onLightSelected.bind(this);
            this.fetchDevices = this.fetchDevices.bind(this);
            this.onRefreshDevices = this.onRefreshDevices.bind(this);
            this.updateStatus = this.updateStatus.bind(this);
            this.handleDeviceStateUpdate = this.handleDeviceStateUpdate.bind(this);
            this.fetchLightState = this.fetchLightState.bind(this);
            this.onExecute = this.onExecute.bind(this);
            this.onDrawForeground = this.onDrawForeground.bind(this);
            this.updateNodeSize = this.updateNodeSize.bind(this);
            this.startPolling = this.startPolling.bind(this);
            this.stopPolling = this.stopPolling.bind(this);
            this.copyHSVSettings = this.copyHSVSettings.bind(this);
        }

        setupWidgets() {
            try {
                const widgetWidth = this.size[0] - 20;
                this.addWidget("button", "➕", "Add Light", () => this.onAddLight(), { width: 40, tooltip: "Add a light selector." });
                this.addWidget("button", "➖", "Remove Light", () => this.onRemoveLight(), { width: 40, tooltip: "Remove the last light selector." });
                this.addWidget("button", "🔄", "Refresh Devices", () => this.onRefreshDevices(), { width: 40, tooltip: "Refresh the list of available Hue lights." });
                this.addWidget("toggle", "Enable Polling", this.properties.enablePolling, (value) => {
                    this.properties.enablePolling = value;
                    if (value) {
                        this.startPolling();
                    } else {
                        this.stopPolling();
                    }
                }, { width: 100, tooltip: "Enable periodic polling to fetch light state updates." });
                this.addWidget("number", "Poll Interval (ms)", this.properties.pollingInterval, (value) => {
                    this.properties.pollingInterval = Math.max(500, Math.round(value));
                    if (this.properties.enablePolling) {
                        this.stopPolling();
                        this.startPolling();
                    }
                }, { min: 500, max: 30000, step: 100, width: 150, tooltip: "Set the polling interval in milliseconds (500-30000)." });
                this.statusWidget = this.addWidget("text", "Status", this.properties.status, null, {
                    property: "status",
                    readonly: true,
                    width: widgetWidth - 100
                });
                this.onAddLight();
                if (this.properties.enablePolling) {
                    this.startPolling();
                }
            } catch (error) {
                console.error("HueLightStateNode - Error setting up widgets:", error);
                this.updateStatus(`⚠️ Error setting up widgets: ${error.message}`);
            }
        }

        startPolling() {
            if (this.pollingTimer) return;
            this.pollingTimer = setInterval(() => {
                this.properties.selectedLightIds.forEach(lightId => {
                    if (lightId) {
                        this.fetchLightState(lightId);
                    }
                });
            }, this.properties.pollingInterval);
            console.log("HueLightStateNode - Polling started with interval:", this.properties.pollingInterval);
        }

        stopPolling() {
            if (this.pollingTimer) {
                clearInterval(this.pollingTimer);
                this.pollingTimer = null;
                console.log("HueLightStateNode - Polling stopped");
            }
        }

        onAddLight() {
            if (!this.deviceManagerReady) {
                this.updateStatus("⚠️ Device manager not ready.");
                return;
            }
            const MAX_LIGHTS = 10;
            if (this.lightSelectors.length >= MAX_LIGHTS) {
                this.updateStatus(`⚠️ Maximum of ${MAX_LIGHTS} lights reached.`);
                return;
            }
            const index = this.lightSelectors.length;
            const lightSelector = this.addWidget(
                "combo",
                `Select Light ${index + 1}`,
                "Select Light",
                (value) => this.onLightSelected(value, index),
                { values: ["Select Light", ...this.getLightOptions()], width: this.size[0] - 20 }
            );
            lightSelector.tooltip = `Select a Hue light to monitor its HSV state.`;
            this.lightSelectors.push(lightSelector);
            this.properties.selectedLightIds.push(null);
            this.properties.selectedLightNames.push(null);
            const copyButton = this.addWidget(
                "button",
                `Copy HSV ${index + 1}`,
                "Copy HSV",
                () => this.copyHSVSettings(index),
                { width: 80, tooltip: `Copy HSV settings for light ${index + 1} to clipboard.` }
            );
            this.updateNodeSize();
            this.setDirtyCanvas(true);
            this.updateStatus(`✅ Added light selector ${this.lightSelectors.length}.`);
        }

        async copyHSVSettings(index) {
            const lightId = this.properties.selectedLightIds[index];
            if (!lightId || !this.perLightState[lightId]) {
                console.warn(`HueLightStateNode - No valid HSV data for light at index ${index}`);
                alert("No valid HSV data available for this light.");
                return;
            }
            const state = this.perLightState[lightId];
            const hsv = {
                hue: state.hue / 360,
                saturation: state.saturation / 100,
                brightness: state.brightness
            };
            const hsvString = JSON.stringify(hsv);
            try {
                if (window.api && window.api.copyToClipboard) {
                    const result = await window.api.copyToClipboard(hsvString);
                    if (result.success) {
                        console.log(`HueLightStateNode - Copied HSV for light ${this.properties.selectedLightNames[index]}:`, hsv);
                        alert(`HSV settings copied to clipboard: ${hsvString}`);
                    } else {
                        throw new Error(result.error || 'Failed to copy via IPC');
                    }
                } else {
                    console.error("HueLightStateNode - Electron API not available for clipboard access.");
                    alert(`Clipboard access not available. Manually copy this: ${hsvString}`);
                }
            } catch (err) {
                console.error("HueLightStateNode - Failed to copy HSV:", err);
                alert(`Failed to copy HSV settings to clipboard.\nManually copy this text:\n${hsvString}\nThen paste it into the HSV Control node.`);
            }
        }

        onRemoveLight() {
            if (this.lightSelectors.length === 0) {
                this.updateStatus("⚠️ No light selectors to remove.");
                return;
            }
            const lightSelector = this.lightSelectors.pop();
            const index = this.widgets.indexOf(lightSelector);
            if (index > -1) this.widgets.splice(index, 1);
            const copyButton = this.widgets.find(w => w.name === `Copy HSV ${this.lightSelectors.length + 1}`);
            if (copyButton) {
                const copyIndex = this.widgets.indexOf(copyButton);
                if (copyIndex > -1) this.widgets.splice(copyIndex, 1);
            }
            const removedLightId = this.properties.selectedLightIds.pop();
            this.properties.selectedLightNames.pop();
            if (removedLightId && this.perLightState[removedLightId]) {
                delete this.perLightState[removedLightId];
            }
            this.updateNodeSize();
            this.setDirtyCanvas(true);
            this.updateStatus(`✅ Removed light selector ${this.lightSelectors.length + 1}.`);
        }

        getLightOptions() {
            return this.deviceManagerReady && this.devices.length
                ? this.devices.map(device => `${device.name} (ID: ${device.light_id})`)
                : ["No Lights Found"];
        }

        initializeSocketIO() {
            if (typeof io === 'undefined') {
                console.error("HueLightStateNode - Socket.IO client (io) not found.");
                this.updateStatus("⚠️ Socket.IO not loaded.");
                return;
            }
            this.socket = io(this.BACKEND_URL, {
                reconnection: true,
                reconnectionAttempts: 10,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
                timeout: 10000
            });
            this.socket.on('connect', () => {
                console.log("HueLightStateNode - Connected to Socket.IO server.");
                this.updateStatus("✅ Connected to server.");
                this.fetchDevices();
            });
            this.socket.on('connect_error', (err) => {
                console.error("HueLightStateNode - Connection error:", err.message);
                this.updateStatus(`⚠️ Connection error: ${err.message}`);
            });
            this.socket.on('disconnect', () => {
                console.log("HueLightStateNode - Disconnected from Socket.IO server.");
                this.updateStatus("⚠️ Disconnected from server.");
            });
            this.socket.on('device-state-update', this.handleDeviceStateUpdate);
        }

        async fetchDevices() {
            console.log("HueLightStateNode - Fetching Hue devices...");
            const now = Date.now();
            if (HueLightStateNode.deviceCache && (now - HueLightStateNode.deviceCacheTimestamp) < HueLightStateNode.CACHE_VALIDITY) {
                this.devices = HueLightStateNode.deviceCache;
                this.deviceManagerReady = true;
                this.updateLightSelectorOptions();
                console.log(`HueLightStateNode - Using cached devices: ${this.devices.length} devices`);
                this.updateStatus("✅ Devices fetched from cache.");
                return;
            }
            const maxRetries = 3;
            const retryDelay = 2000;
            for (let attempt = 0; attempt < maxRetries; attempt++) {
                try {
                    const response = await fetch(`${this.BACKEND_URL}/api/lights/hue`, { signal: AbortSignal.timeout(10000) });
                    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    const data = await response.json();
                    if (data.success && Array.isArray(data.lights)) {
                        this.devices = data.lights.map(light => ({
                            light_id: String(light.id).replace('hue_', ''),
                            name: light.name,
                            energy: light.energy || 0
                        }));
                        this.deviceManagerReady = true;
                        HueLightStateNode.deviceCache = this.devices;
                        HueLightStateNode.deviceCacheTimestamp = now;
                        this.updateLightSelectorOptions();
                        console.log(`HueLightStateNode - Retrieved ${this.devices.length} Hue devices`);
                        this.updateStatus("✅ Devices fetched successfully.");
                        return;
                    } else if (data.error === "Hue lights not initialized yet.") {
                        throw new Error("Hue lights not initialized yet");
                    } else {
                        throw new Error("No Hue devices found or invalid response format");
                    }
                } catch (error) {
                    console.error(`HueLightStateNode - Error fetching devices on attempt ${attempt + 1}:`, error);
                    if (attempt < maxRetries - 1) {
                        console.log(`HueLightStateNode - Retrying in ${retryDelay}ms...`);
                        this.updateStatus(`⚠️ Retrying device fetch (${attempt + 2}/${maxRetries})...`);
                        await new Promise(resolve => setTimeout(resolve, retryDelay));
                    } else {
                        this.updateStatus(`⚠️ Error fetching devices after ${maxRetries} attempts: ${error.message}`);
                        this.devices = [];
                        this.deviceManagerReady = false;
                    }
                }
            }
        }

        updateLightSelectorOptions() {
            const options = this.getLightOptions();
            this.lightSelectors.forEach(selector => {
                selector.options.values = options;
                const index = this.lightSelectors.indexOf(selector);
                const lightId = this.properties.selectedLightIds[index];
                if (lightId) {
                    const selectedDevice = this.devices.find(d => d.light_id === lightId);
                    if (selectedDevice) {
                        selector.value = `${selectedDevice.name} (ID: ${lightId})`;
                    } else {
                        selector.value = "Select Light";
                        this.properties.selectedLightIds[index] = null;
                        this.properties.selectedLightNames[index] = null;
                    }
                }
            });
            this.setDirtyCanvas(true);
        }

        async onRefreshDevices() {
            await this.fetchDevices();
            this.updateStatus("✅ Devices refreshed.");
        }

        async onLightSelected(value, index) {
            console.log(`HueLightStateNode - Light selected at index ${index}: ${value}`);
            if (value === "Select Light" || value === "No Lights Found") {
                const removedLightId = this.properties.selectedLightIds[index];
                if (removedLightId && this.perLightState[removedLightId]) {
                    delete this.perLightState[removedLightId];
                }
                this.properties.selectedLightIds[index] = null;
                this.properties.selectedLightNames[index] = null;
                this.updateStatus(`✅ Deselected light at selector ${index + 1}.`);
                this.updateNodeSize();
                this.setDirtyCanvas(true);
                return;
            }
            const match = value.match(/\(ID:\s*([^\)]+)\)/);
            if (match && match[1]) {
                const lightId = match[1].replace('hue_', '');
                const lightName = value.split(" (ID:")[0];
                if (this.properties.selectedLightIds.includes(lightId)) {
                    this.updateStatus(`⚠️ Light "${lightName}" is already selected.`);
                    this.lightSelectors[index].value = "Select Light";
                    return;
                }
                this.properties.selectedLightIds[index] = lightId;
                this.properties.selectedLightNames[index] = lightName;
                this.perLightState[lightId] = { on: false, hue: 0, saturation: 0, brightness: 0, energy: 0 };
                await this.fetchLightState(lightId);
                this.updateNodeSize();
                this.setDirtyCanvas(true);
            }
        }

        async fetchLightState(lightId) {
            for (let attempt = 0; attempt < this.properties.maxRetries; attempt++) {
                try {
                    const response = await fetch(`${this.BACKEND_URL}/api/lights/hue/${lightId}`, { signal: AbortSignal.timeout(5000) });
                    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    const data = await response.json();
                    if (data.success && data.light) {
                        const { on, hue, sat, bri } = data.light.state;
                        this.perLightState[lightId] = {
                            on,
                            hue: hue !== undefined ? (hue / 65535) * 360 : 0,
                            saturation: sat !== undefined ? (sat / 254) * 100 : 0,
                            brightness: bri !== undefined ? bri : 0,
                            energy: data.light.energy || 0
                        };
                        const lightName = this.properties.selectedLightNames[this.properties.selectedLightIds.indexOf(lightId)] || "Unknown";
                        this.updateStatus(`✅ Light "${lightName}" is ${on ? "On" : "Off"}`);
                        this.setDirtyCanvas(true);
                        return true;
                    }
                    throw new Error(data.message || "Failed to fetch light state");
                } catch (error) {
                    console.error(`HueLightStateNode - Error fetching state for Light ${lightId} (attempt ${attempt + 1}):`, error);
                    if (attempt === this.properties.maxRetries - 1) {
                        this.updateStatus(`⚠️ Error fetching Light ${lightId}: ${error.message}`);
                        return false;
                    }
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }
            return false;
        }

        handleDeviceStateUpdate(data) {
            const lightId = String(data.id).replace('hue_', '');
            const index = this.properties.selectedLightIds.indexOf(lightId);
            if (index === -1) return;
            const now = Date.now();
            const timeSinceLastUpdate = this.lastUpdateTime ? now - this.lastUpdateTime : 0;
            this.lastUpdateTime = now;
            console.log(`HueLightStateNode - Received device-state-update for light ID ${lightId} after ${timeSinceLastUpdate}ms:`, data);
            const previousState = { ...this.perLightState[lightId] };
            this.perLightState[lightId] = {
                on: data.on ?? this.perLightState[lightId].on,
                hue: data.hue !== undefined ? (data.hue / 65535) * 360 : this.perLightState[lightId].hue,
                saturation: data.sat !== undefined ? (data.sat / 254) * 100 : this.perLightState[lightId].saturation,
                brightness: data.bri !== undefined ? data.bri : this.perLightState[lightId].brightness,
                energy: data.energy !== undefined ? data.energy : this.perLightState[lightId].energy
            };
            const lightName = this.properties.selectedLightNames[index];
            const hasChanged = (
                previousState.on !== this.perLightState[lightId].on ||
                previousState.hue !== this.perLightState[lightId].hue ||
                previousState.saturation !== this.perLightState[lightId].saturation ||
                previousState.brightness !== this.perLightState[lightId].brightness
            );
            if (hasChanged) {
                console.log(`HueLightStateNode - State changed for "${lightName}": on=${this.perLightState[lightId].on}, hue=${this.perLightState[lightId].hue}, sat=${this.perLightState[lightId].saturation}, bri=${this.perLightState[lightId].brightness}`);
                this.updateStatus(`✅ Real-time update: "${lightName}" is ${this.perLightState[lightId].on ? "On" : "Off"}`);
                this.setDirtyCanvas(true, true);
            }
        }

        hsvToRgb(h, s, v) {
            h = h % 1;
            const i = Math.floor(h * 6);
            const f = h * 6 - i;
            const p = v * (1 - s);
            const q = v * (1 - f * s);
            const t = v * (1 - (1 - f) * s);
            let r, g, b;
            switch (i % 6) {
                case 0: r = v; g = t; b = p; break;
                case 1: r = q; g = v; b = p; break;
                case 2: r = p; g = v; b = t; break;
                case 3: r = p; g = q; b = v; break;
                case 4: r = t; g = p; b = v; break;
                case 5: r = v; g = p; b = q; break;
            }
            return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
        }

        onExecute() {
            if (!this.isConfigured) {
                this.updateStatus("⚠️ Node is still configuring...");
                return;
            }
            try {
                const now = Date.now();
                const hsvArray = this.properties.selectedLightIds
                    .map((lightId, index) => {
                        if (!lightId || !this.perLightState[lightId]) return null;
                        const state = this.perLightState[lightId];
                        return {
                            lightId,
                            lightName: this.properties.selectedLightNames[index],
                            hsv: {
                                hue: state.hue / 360,
                                saturation: state.saturation / 100,
                                brightness: state.brightness,
                                transition: 0
                            }
                        };
                    })
                    .filter(item => item !== null);
                this.setOutputData(0, hsvArray);
                this.setDirtyCanvas(true, true);
            } catch (error) {
                console.error("HueLightStateNode - Error during execution:", error);
                this.updateStatus(`⚠️ Execution failed: ${error.message}`);
            }
        }

        onDrawForeground(ctx) {
            if (this.flags.collapsed) return;
            const statusX = this.size[0] - 15;
            const statusY = 20;
            ctx.beginPath();
            ctx.arc(statusX, statusY, 5, 0, 2 * Math.PI);
            ctx.fillStyle = this.properties.selectedLightIds.some(id => id && this.perLightState[id]?.on) ? "#00FF00" : "#FF0000";
            ctx.fill();
            let yOffset = 220;
            this.properties.selectedLightIds.forEach((lightId, index) => {
                if (!lightId || !this.perLightState[lightId]) return;
                const state = this.perLightState[lightId];
                const lightName = this.properties.selectedLightNames[index];
                const rgb = this.hsvToRgb(state.hue / 360, state.saturation / 100, state.brightness / 254);
                ctx.fillStyle = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
                ctx.fillRect(10, yOffset, 30, 20);
                ctx.strokeStyle = "#FFF";
                ctx.lineWidth = 1;
                ctx.strokeRect(10, yOffset, 30, 20);
                ctx.fillStyle = "#FFF";
                ctx.font = "12px Arial";
                ctx.textAlign = "left";
                ctx.fillText(`${lightName}: H:${Math.round(state.hue)} S:${Math.round(state.saturation)} B:${Math.round(state.brightness)}`, 50, yOffset + 15);
                yOffset += 30;
            });
        }

        updateNodeSize() {
            this.size[0] = 350;
            const baseHeight = 40;
            let widgetsHeight = this.widgets.reduce((sum, widget) => sum + (widget.computeSize ? widget.computeSize(this.size[0])[1] : LiteGraph.NODE_WIDGET_HEIGHT), 0);
            const totalLightHeight = this.properties.selectedLightIds.length * 30;
            const extraHeight = 80;
            this.size[1] = baseHeight + widgetsHeight + totalLightHeight + extraHeight;
            this.setDirtyCanvas(true);
        }

        updateStatus(newStatus) {
            this.properties.status = newStatus;
            if (this.statusWidget) this.statusWidget.value = this.properties.status;
            this.setDirtyCanvas(true);
        }

        serialize() {
            const deepCopy = (obj) => JSON.parse(JSON.stringify(obj));
            return {
                ...super.serialize(),
                version: "1.0",
                properties: deepCopy(this.properties),
                perLightState: deepCopy(this.perLightState),
                lastUpdateTime: this.lastUpdateTime,
                lastUpdate: this.lastUpdate
            };
        }

        configure(data) {
            super.configure(data);
            const version = data.version || "1.0";
            this.properties = {
                selectedLightIds: Array.isArray(data.properties?.selectedLightIds) ? data.properties.selectedLightIds : [],
                selectedLightNames: Array.isArray(data.properties?.selectedLightNames) ? data.properties.selectedLightNames : [],
                status: typeof data.properties?.status === "string" ? data.properties.status : "No lights selected",
                maxRetries: typeof data.properties?.maxRetries === "number" ? data.properties.maxRetries : 3,
                enablePolling: typeof data.properties?.enablePolling === "boolean" ? data.properties.enablePolling : true,
                pollingInterval: typeof data.properties?.pollingInterval === "number" ? Math.max(500, data.properties.pollingInterval) : 1000
            };
            this.perLightState = typeof data.perLightState === "object" && data.perLightState !== null ? data.perLightState : {};
            this.lastUpdateTime = typeof data.lastUpdateTime === "number" ? data.lastUpdateTime : null;
            this.lastUpdate = typeof data.lastUpdate === "number" ? data.lastUpdate : Date.now();
            const uniqueLightIds = [...new Set(this.properties.selectedLightIds.filter(id => id))];
            const uniqueLightNames = uniqueLightIds.map(id => this.properties.selectedLightNames[this.properties.selectedLightIds.indexOf(id)] ?? "Unknown");
            this.properties.selectedLightIds = uniqueLightIds;
            this.properties.selectedLightNames = uniqueLightNames;
            this.widgets = [];
            this.lightSelectors = [];
            if (this.socket) {
                this.socket.disconnect();
                this.socket = null;
            }
            this.stopPolling();
            this.setupWidgets();
            this.initializeSocketIO();
            try {
                this.fetchDevices().then(() => {
                    uniqueLightIds.forEach((lightId, index) => {
                        if (lightId) {
                            this.fetchLightState(lightId);
                        }
                    });
                    this.updateNodeSize();
                    this.setDirtyCanvas(true);
                    this.updateStatus(this.properties.status);
                    this.isConfigured = true;
                });
            } catch (error) {
                console.error("HueLightStateNode - Error during configuration:", error);
                this.updateStatus(`⚠️ Configuration failed: ${error.message}`);
                this.isConfigured = false;
            }
        }

        onRemoved() {
            if (this.socket) this.socket.disconnect();
            this.stopPolling();
        }
    }

    LiteGraph.registerNodeType("Lighting/HueLightStateNode", HueLightStateNode);
    console.log("HueLightStateNode - Registered successfully under 'Lighting' category.");
}