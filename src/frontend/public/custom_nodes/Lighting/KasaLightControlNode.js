// Solid Version Restore point with Fixes for HSV Turning Off Bug
if (!LiteGraph.registered_node_types || !LiteGraph.registered_node_types["Lighting/KasaLightControlNode"]) {
    class KasaLightControlNode extends LiteGraph.LGraphNode {
        constructor() {
            super();
            this.title = "Kasa Light Control";
            this.resizable = true;
            this.autosize = false;
            this.bgcolor = "rgb(140, 90, 60)";
            this.bgGradient = null;
            this.intendedState = null;
            this.properties = {
                selectedLightIds: [],
                selectedLightNames: [],
                status: "No action yet",
                isCollapsed: false,
                staggerInterval: 100,
                useStagger: true,
                maxRetries: 3,
                transitionTime: 0
            };
            this.KASA_API_URL = "http://localhost:3000";
            this.lightSelectors = [];
            this.setupWidgets();
            this.addInput("HSV Info", "hsv_info");
            this.addInput("Trigger", "boolean");
            this.addOutput("Light Info", "light_info");
            this.devices = [];
            this.deviceManagerReady = false;
            this.lastToggleInput = null;
            this.lastHsvInfo = null;
            this.hsvDebounceTimer = null;
            this.HSV_DEBOUNCE_DELAY = 300;
            this.needsLightSelectorsRestore = false;
            this.boxcolor = "#000000";
            this.perLightState = {};
            this.currentStaggerIndex = -1;
            this.glowPulse = 0;
            this.lastUpdate = Date.now();
            this.requestQueue = [];
            this.isProcessingQueue = false;
            // FIX: Add flag to track HSV updates and prevent Socket.IO interference
            this.isUpdatingHSV = false;
            console.log("KasaLightControlNode - Initialized.");
            this.onAddLight = this.onAddLight.bind(this);
            this.onRemoveLight = this.onRemoveLight.bind(this);
            this.onLightSelected = this.onLightSelected.bind(this);
            this.fetchDevices = this.fetchDevices.bind(this);
            this.onRefreshDevices = this.onRefreshDevices.bind(this);
            this.onMouseDown = this.onMouseDown.bind(this);
            this.updateNodeSize = this.updateNodeSize.bind(this);
            this.updateStatus = this.updateStatus.bind(this);
            this.initializeSocketIO = this.initializeSocketIO.bind(this);
            this.handleDeviceStateUpdate = this.handleDeviceStateUpdate.bind(this);
            this.fetchLightStateAndColor = this.fetchLightStateAndColor.bind(this);
            this.handleHSVInput = this.handleHSVInput.bind(this);
            this.handleTrigger = this.handleTrigger.bind(this);
            this.toggleLightState = this.toggleLightState.bind(this);
            this.setLightColor = this.setLightColor.bind(this);
            this.updateColorSwatch = this.updateColorSwatch.bind(this);
            this.toggleCollapse = this.toggleCollapse.bind(this);
            this.setBrightness = this.setBrightness.bind(this);
            this.initializeSocketIO();
        }
        setupWidgets() {
            try {
                const widgetWidth = this.size[0] - 20;
                this.addLightButton = this.addWidget("button", "➕", "Add Light", () => this.onAddLight(), { width: 40 });
                this.removeLightButton = this.addWidget("button", "➖", "Remove Light", () => this.onRemoveLight(), { width: 40 });
                this.refreshDevicesButton = this.addWidget("button", "🔄", "Refresh Devices", () => this.onRefreshDevices(), { width: 40 });
                this.intervalWidget = this.addWidget("number", "Interval (ms)", this.properties.staggerInterval, (value) => {
                    this.properties.staggerInterval = Math.max(0, value);
                }, { min: 0, max: 1000, step: 10, width: 80 });
                this.staggerToggle = this.addWidget("toggle", "Stagger", this.properties.useStagger, (value) => {
                    this.properties.useStagger = value;
                }, { width: 60 });
                this.transitionWidget = this.addWidget("number", "Transition (ms)", this.properties.transitionTime, (value) => {
                    this.properties.transitionTime = Math.max(0, value);
                }, { min: 0, max: 5000, step: 100, width: 100 });
                this.collapseButton = this.addWidget("button", "▼", "Collapse", () => this.toggleCollapse(), { width: 40 });
                this.statusWidget = this.addWidget("text", "Status", this.properties.status, null, { property: "status", readonly: true, width: widgetWidth - 400 });
                console.log("KasaLightControlNode - Widgets set up.");
            } catch (error) {
                console.error("KasaLightControlNode - Error setting up widgets:", error);
                this.updateStatus(`⚠️ Error setting up widgets: ${error.message}`);
            }
        }
        initializeSocketIO() {
            if (!this.socket) {
                console.log("KasaLightControlNode - Initializing Socket.IO...");
                this.socket = io(this.KASA_API_URL, {
                    reconnection: true,
                    reconnectionAttempts: 10,
                    reconnectionDelay: 1000,
                    reconnectionDelayMax: 5000,
                    timeout: 10000
                });
                this.socket.on('connect', () => {
                    console.log("KasaLightControlNode - Connected to Socket.IO server.");
                    this.updateStatus("✅ Connected to server.");
                    this.fetchDevices();
                });
                this.socket.on('connect_error', (err) => {
                    console.error("KasaLightControlNode - Connection error:", err.message);
                    this.updateStatus(`⚠️ Connection error: ${err.message}`);
                });
                this.socket.on('disconnect', () => {
                    console.log("KasaLightControlNode - Disconnected from Socket.IO server.");
                    this.updateStatus("⚠️ Disconnected from server.");
                });
                this.socket.on('device-state-update', (data) => this.handleDeviceStateUpdate(data));
            }
        }
        onAdded() {
            this.fetchDevices();
        }
        async fetchDevices() {
            console.log("KasaLightControlNode - Fetching Kasa devices...");
            try {
                const response = await fetch(`${this.KASA_API_URL}/api/lights/kasa`, { signal: AbortSignal.timeout(10000) });
                if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                const data = await response.json();
                console.log("Raw API response from /api/lights/kasa:", JSON.stringify(data, null, 2));
                if (data.success && data.lights) {
                    this.devices = data.lights.filter(device => device.type === 'bulb').map(device => ({
                        light_id: device.id,
                        name: device.name
                    }));
                    console.log("Mapped device IDs:", JSON.stringify(this.devices.map(d => d.light_id), null, 2));
                    this.deviceManagerReady = true;
                    console.log(`KasaLightControlNode - Retrieved ${this.devices.length} bulbs`);
                    if (this.needsLightSelectorsRestore && this.properties.selectedLightIds.length > 0) {
                        this.restoreLightSelectors();
                    } else {
                        this.updateStatus("✅ Devices fetched successfully.");
                    }
                } else {
                    throw new Error(data.message || "No Kasa bulbs found");
                }
            } catch (error) {
                console.error("KasaLightControlNode - Error fetching devices:", error);
                this.updateStatus(`⚠️ Error fetching devices: ${error.message}`);
            }
        }
        restoreLightSelectors() {
            this.lightSelectors = [];
            this.properties.selectedLightIds.forEach((lightId, index) => {
                if (lightId) {
                    const device = this.devices.find(d => d.light_id === lightId);
                    const lightName = this.properties.selectedLightNames[index] || (device ? device.name : "Unknown");
                    const lightSelector = this.addWidget(
                        "combo",
                        `Select Light ${index + 1}`,
                        lightName,
                        (value) => this.onLightSelected(value, index),
                        { values: ["Select Light", ...this.getLightOptions()], width: this.size[0] - 20 }
                    );
                    this.lightSelectors.push(lightSelector);
                    this.perLightState[lightId] = this.perLightState[lightId] || { on: false, hue: 0, saturation: 0, brightness: 0 };
                    this.fetchLightStateAndColor(lightId);
                }
            });
            this.updateNodeSize();
            this.needsLightSelectorsRestore = false;
            this.setDirtyCanvas(true);
            this.updateStatus("✅ Light selectors restored.");
        }
        async onRefreshDevices() {
            await this.fetchDevices();
            this.updateStatus("✅ Devices refreshed.");
        }
        getLightOptions() {
            return this.deviceManagerReady && this.devices.length
                ? this.devices.map(device => device.name)
                : ["No Lights Found"];
        }
        onAddLight() {
            if (!this.deviceManagerReady) {
                this.updateStatus("⚠️ Device manager not ready.");
                return;
            }
            const MAX_LIGHTS = 20;
            if (this.lightSelectors.length >= MAX_LIGHTS) {
                this.updateStatus(`⚠️ Maximum of ${MAX_LIGHTS} lights reached.`);
                return;
            }
            const lightSelector = this.addWidget(
                "combo",
                `Select Light ${this.lightSelectors.length + 1}`,
                "Select Light",
                (value) => this.onLightSelected(value, this.lightSelectors.indexOf(lightSelector)),
                { values: ["Select Light", ...this.getLightOptions()], width: this.size[0] - 20 }
            );
            this.lightSelectors.push(lightSelector);
            this.properties.selectedLightIds.push(null);
            this.properties.selectedLightNames.push(null);
            this.updateNodeSize();
            this.setDirtyCanvas(true, false);
            this.updateStatus(`✅ Added light selector ${this.lightSelectors.length}.`);
        }
        onRemoveLight() {
            if (this.properties.selectedLightIds.length === 0 && this.lightSelectors.length === 0) {
                this.updateStatus("⚠️ No lights to remove.");
                return;
            }
            if (this.lightSelectors.length > 0) {
                const lightSelector = this.lightSelectors.pop();
                const index = this.widgets.indexOf(lightSelector);
                if (index > -1) {
                    this.widgets.splice(index, 1);
                } else {
                    console.warn("KasaLightControlNode - Light selector not found in widgets array:", lightSelector);
                }
            }
            const removedLightId = this.properties.selectedLightIds.pop();
            const removedLightName = this.properties.selectedLightNames.pop();
            if (removedLightId && this.perLightState[removedLightId]) {
                delete this.perLightState[removedLightId];
            }
            this.updateNodeSize();
            this.setDirtyCanvas(true);
            this.updateStatus(`✅ Removed light "${removedLightName || 'Unknown'}"`);
        }
        async onLightSelected(value, index) {
            if (value === "Select Light" || value === "No Lights Found") {
                const removedLightId = this.properties.selectedLightIds[index];
                if (removedLightId && this.perLightState[removedLightId]) {
                    delete this.perLightState[removedLightId];
                }
                this.properties.selectedLightIds[index] = null;
                this.properties.selectedLightNames[index] = null;
                this.updateColorSwatch();
                this.updateStatus(`✅ Deselected light at selector ${index + 1}.`);
                this.updateNodeSize();
                this.setDirtyCanvas(true);
                return;
            }
            if (!this.deviceManagerReady) {
                await this.fetchDevices();
            }
            const device = this.devices.find(d => d.name === value);
            if (device) {
                const lightId = device.light_id;
                const lightName = device.name;
                if (this.properties.selectedLightIds.includes(lightId)) {
                    this.updateStatus(`⚠️ Light "${lightName}" is already selected.`);
                    this.lightSelectors[index].value = "Select Light";
                    this.properties.selectedLightIds[index] = null;
                    this.properties.selectedLightNames[index] = null;
                    return;
                }
                this.properties.selectedLightIds[index] = lightId;
                this.properties.selectedLightNames[index] = lightName;
                this.perLightState[lightId] = { on: false, hue: 0, saturation: 0, brightness: 0 };
                this.fetchLightStateAndColor(lightId);
                this.updateNodeSize();
                this.setDirtyCanvas(true);
            } else {
                console.warn(`KasaLightControlNode - No device found for name: ${value}`);
                this.updateStatus(`⚠️ Light "${value}" not found in device list.`);
            }
        }
        async fetchLightStateAndColor(lightId) {
            const cleanId = lightId.replace(/^kasa_/, '');
            console.log(`Fetching state for lightId: ${lightId} (cleaned: ${cleanId})`);
            try {
                const response = await fetch(`${this.KASA_API_URL}/api/lights/kasa/${encodeURIComponent(cleanId)}/state`, { signal: AbortSignal.timeout(5000) });
                const data = await response.json();
                console.log(`Server response for ${lightId}:`, JSON.stringify(data, null, 2));
                if (data.success) {
                    const { on, hue, saturation, brightness } = data.state;
                    this.perLightState[lightId] = {
                        on,
                        hue: hue !== undefined ? hue : 0,
                        saturation: saturation !== undefined ? saturation : 0,
                        brightness: brightness !== undefined ? brightness : (on ? 100 : 0)
                    };
                    console.log(`Updated perLightState[${lightId}]:`, this.perLightState[lightId]);
                    this.updateColorSwatch();
                    const lightName = this.properties.selectedLightNames[this.properties.selectedLightIds.indexOf(lightId)];
                    this.updateStatus(`✅ Light "${lightName}" is ${on ? "On" : "Off"}`);
                    this.setDirtyCanvas(true);
                } else {
                    throw new Error(data.message || "Failed to fetch light state");
                }
            } catch (error) {
                console.error(`KasaLightControlNode - Error fetching state for Light ID ${lightId} (cleaned: ${cleanId}):`, error);
                this.updateStatus(`⚠️ Error fetching Light ${lightId}: ${error.message}`);
            }
        }
        async handleHSVInput(hsv) {
            if (!this.properties.selectedLightIds.length) {
                this.updateStatus("⚠️ No lights selected. Cannot update HSV.");
                return;
            }
            if (!hsv || typeof hsv.hue !== 'number' || typeof hsv.saturation !== 'number' || typeof hsv.brightness !== 'number') {
                this.updateStatus("⚠️ Invalid HSV input.");
                return;
            }
            let { hue, saturation, brightness } = hsv;
            hue = hue <= 1 ? hue * 360 : hue; // Hue: 0-1 to 0-360
            saturation = saturation <= 1 ? saturation * 100 : saturation; // Saturation: 0-1 to 0-100
            brightness = brightness <= 1 ? brightness * 254 : brightness; // Brightness: 0-1 to 0-254 if normalized
            brightness = Math.round(Math.max(1, Math.min(100, (brightness / 254) * 100))); // Minimum 1%
            hue = Math.round(Math.max(0, Math.min(360, hue)));
            saturation = Math.round(Math.max(0, Math.min(100, saturation)));
            if (this.lastHsvInfo && hue === this.lastHsvInfo.hue && saturation === this.lastHsvInfo.saturation && brightness === this.lastHsvInfo.brightness) {
                return;
            }
            this.lastHsvInfo = { hue, saturation, brightness };
            this.updateColorSwatch();
            this.isUpdatingHSV = true;
            if (this.hsvDebounceTimer) clearTimeout(this.hsvDebounceTimer);
            this.hsvDebounceTimer = setTimeout(async () => {
                const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
                for (let i = 0; i < this.properties.selectedLightIds.length; i++) {
                    const lightId = this.properties.selectedLightIds[i];
                    if (!lightId) continue;
                    if (!this.perLightState[lightId]?.on) {
                        console.log(`KasaLightControlNode - Skipping HSV update for ${lightId} (light is off)`);
                        this.updateStatus(`⚠️ Skipped HSV update for "${this.properties.selectedLightNames[i]}" (light is off)`);
                        continue;
                    }
                    const cleanId = lightId.replace(/^kasa_/, '');
                    this.currentStaggerIndex = i;
                    this.setDirtyCanvas(true);
                    if (this.properties.useStagger) await delay(i * this.properties.staggerInterval);
                    const payload = {
                        on: true,
                        hsv: { hue, saturation, brightness },
                        transition: this.properties.transitionTime
                    };
                    let success = false;
                    for (let attempt = 0; attempt < this.properties.maxRetries; attempt++) {
                        try {
                            console.log(`handleHSVInput: Sending for ${lightId}:`, payload);
                            const response = await fetch(`${this.KASA_API_URL}/api/lights/kasa/${encodeURIComponent(cleanId)}/state`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(payload),
                                signal: AbortSignal.timeout(5000)
                            });
                            const data = await response.json();
                            console.log(`handleHSVInput: Response for ${lightId}:`, data);
                            if (data.success) {
                                this.perLightState[lightId] = {
                                    on: true,
                                    hue,
                                    saturation,
                                    brightness
                                };
                                success = true;
                                break;
                            } else {
                                throw new Error(data.message || "Failed to set state");
                            }
                        } catch (error) {
                            if (attempt === this.properties.maxRetries - 1) {
                                console.error(`KasaLightControlNode - Error setting HSV for Light ID ${lightId}:`, error);
                                this.updateStatus(`⚠️ Error setting color for Light ${lightId}: ${error.message}`);
                            } else {
                                await delay(500);
                            }
                        }
                    }
                    if (success) {
                        const lightName = this.properties.selectedLightNames[i];
                        this.updateStatus(`✅ Set color for Light "${lightName}" (Step ${i + 1}).`);
                        this.setDirtyCanvas(true);
                    }
                }
                this.currentStaggerIndex = -1;
                this.isUpdatingHSV = false;
                this.setDirtyCanvas(true);
            }, this.HSV_DEBOUNCE_DELAY);
        }
        async handleTrigger(trigger, force = false) {
            // FIX: Append to requestQueue instead of resetting to prevent interrupting HSV updates
            if (!this.properties.selectedLightIds.length) {
                this.updateStatus("⚠️ No lights selected. Cannot toggle state.");
                return;
            }
            if (!this.deviceManagerReady) {
                this.updateStatus("⚠️ Waiting for devices to initialize.");
                return;
            }
            const desiredState = Boolean(trigger);
            if (!force && desiredState === this.lastToggleInput) {
                return;
            }
            this.intendedState = desiredState;
            this.lastToggleInput = desiredState;
            let needsUpdate = force;
            if (!force) {
                for (const lightId of this.properties.selectedLightIds) {
                    if (!lightId) continue;
                    if (this.perLightState[lightId]?.on !== desiredState) {
                        needsUpdate = true;
                        break;
                    }
                }
            }
            if (!needsUpdate) {
                console.log(`KasaLightControlNode - All lights already in desired state: ${desiredState}`);
                return;
            }
            this.requestQueue.push({ desiredState, timestamp: Date.now() });
            if (!this.isProcessingQueue) {
                console.log("KasaLightControlNode - Processing queue for state change");
                this.processQueue();
            }
        }
        async processQueue() {
            // FIX: Process all queued requests sequentially
            // FIX: Skip state fetch during HSV updates to avoid state mismatches
            if (this.isProcessingQueue || this.requestQueue.length === 0) return;
            this.isProcessingQueue = true;
            while (this.requestQueue.length > 0) {
                const { desiredState } = this.requestQueue[0];
                this.updateStatus(`✅ Setting lights to ${desiredState ? "On" : "Off"} ${this.properties.useStagger ? `with ${this.properties.staggerInterval}ms stagger` : "immediately"}.`);
                const payload = desiredState && this.lastHsvInfo
                    ? {
                        on: true,
                        hsv: {
                            hue: this.lastHsvInfo.hue,
                            saturation: this.lastHsvInfo.saturation,
                            brightness: Math.round((this.lastHsvInfo.brightness / 254) * 100)
                        },
                        transition: this.properties.transitionTime
                      }
                    : {
                        on: desiredState,
                        transition: this.properties.transitionTime
                      };
                const endpoint = desiredState && this.lastHsvInfo ? 'state' : desiredState ? 'on' : 'off';
                const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
                const THROTTLE_DELAY = 200;
                for (let i = 0; i < this.properties.selectedLightIds.length; i++) {
                    const lightId = this.properties.selectedLightIds[i];
                    if (!lightId) continue;
                    const cleanId = lightId.replace(/^kasa_/, '');
                    if (!this.isUpdatingHSV) await this.fetchLightStateAndColor(lightId);
                    if (this.perLightState[lightId].on === desiredState) continue;
                    this.currentStaggerIndex = i;
                    this.setDirtyCanvas(true);
                    const staggerDelay = this.properties.useStagger ? i * this.properties.staggerInterval : 0;
                    await delay(staggerDelay + (i * THROTTLE_DELAY));
                    let success = false;
                    let lastError = null;
                    for (let attempt = 0; attempt < this.properties.maxRetries; attempt++) {
                        try {
                            console.log(`processQueue: Sending for ${lightId}:`, payload);
                            const response = await fetch(`${this.KASA_API_URL}/api/lights/kasa/${encodeURIComponent(cleanId)}/${endpoint}`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(payload),
                                signal: AbortSignal.timeout(5000)
                            });
                            const data = await response.json();
                            console.log(`processQueue: Response for ${lightId}:`, data);
                            if (data.success) {
                                this.perLightState[lightId].on = desiredState;
                                if (desiredState && this.lastHsvInfo) {
                                    this.perLightState[lightId] = {
                                        ...this.perLightState[lightId],
                                        hue: this.lastHsvInfo.hue,
                                        saturation: this.lastHsvInfo.saturation,
                                        brightness: Math.round((this.lastHsvInfo.brightness / 254) * 100)
                                    };
                                }
                                success = true;
                                break;
                            } else {
                                throw new Error(data.message || "Failed to toggle state");
                            }
                        } catch (error) {
                            lastError = error;
                            console.error(`Attempt ${attempt + 1} failed for Light ID ${lightId}:`, error.message);
                            if (attempt < this.properties.maxRetries - 1) {
                                await delay(500);
                            }
                        }
                    }
                    if (success) {
                        const lightName = this.properties.selectedLightNames[i];
                        this.updateStatus(`✅ Light "${lightName}" turned ${desiredState ? "On" : "Off"} (Step ${i + 1}).`);
                        this.setDirtyCanvas(true);
                    } else {
                        this.updateStatus(`⚠️ Error toggling Light ${lightId}: ${lastError.message}`);
                    }
                }
                this.currentStaggerIndex = -1;
                this.setDirtyCanvas(true);
                this.requestQueue.shift();
            }
            this.isProcessingQueue = false;
        }
        onExecute() {
            if (!this.deviceManagerReady) {
                this.fetchDevices();
            }
            if (this.needsLightSelectorsRestore) {
                this.fetchDevices();
                this.needsLightSelectorsRestore = false;
            }
            const hsvInput = this.getInputData(0);
            const triggerInput = this.getInputData(1);
            if (hsvInput) this.handleHSVInput(hsvInput);
            if (triggerInput !== undefined) {
                this.handleTrigger(triggerInput);
            }
            const lightData = {
                lights: this.properties.selectedLightIds
                    .filter(id => id)
                    .map(id => ({
                        light_id: id,
                        name: this.properties.selectedLightNames[this.properties.selectedLightIds.indexOf(id)],
                        status: this.perLightState[id]?.on ? "On" : "Off",
                        hue: this.perLightState[id]?.hue,
                        saturation: this.perLightState[id]?.saturation,
                        brightness: this.perLightState[id]?.brightness
                    })),
                status: this.properties.status
            };
            this.setOutputData(0, lightData);
            const now = Date.now();
            this.glowPulse = Math.sin((now - this.lastUpdate) / 500) * 2;
            this.lastUpdate = now;
            this.setDirtyCanvas(true);
        }
        serialize() {
            const data = super.serialize();
            data.properties = { ...this.properties };
            data.lastToggleInput = this.lastToggleInput;
            data.intendedState = this.intendedState;
            data.lastHsvInfo = this.lastHsvInfo;
            data.boxcolor = this.boxcolor;
            data.perLightState = this.perLightState;
            return data;
        }
        configure(data) {
            super.configure(data);
            this.properties = { ...data.properties } || this.properties;
            this.lastToggleInput = data.lastToggleInput ?? null;
            this.intendedState = data.intendedState ?? null;
            this.lastHsvInfo = data.lastHsvInfo || null;
            this.boxcolor = data.boxcolor || "#000000";
            this.perLightState = data.perLightState || {};
            console.log("KasaLightControlNode - Configuring:", {
                selectedLightIds: this.properties.selectedLightIds,
                selectedLightNames: this.properties.selectedLightNames,
                perLightState: this.perLightState
            });
            this.widgets = [];
            this.lightSelectors = [];
            this.setupWidgets();
            if (!this.deviceManagerReady || this.devices.length === 0) {
                this.fetchDevices().then(() => {
                    this.restoreLightSelectors();
                    this.updateNodeSize();
                    this.setDirtyCanvas(true);
                });
            } else {
                this.restoreLightSelectors();
                this.updateNodeSize();
                this.setDirtyCanvas(true);
            }
            this.updateStatus(this.properties.status);
        }
        onRemoved() {
            if (this.hsvDebounceTimer) clearTimeout(this.hsvDebounceTimer);
            if (this.socket) this.socket.disconnect();
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
        rgbToHex(r, g, b) {
            return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
        }
        updateColorSwatch(hue = this.lastHsvInfo?.hue / 360, saturation = this.lastHsvInfo?.saturation / 100, brightness = this.lastHsvInfo?.brightness / 100) {
            if (hue === undefined || saturation === undefined || brightness === undefined) {
                this.boxcolor = "#000000";
            } else {
                const rgb = this.hsvToRgb(hue, saturation, brightness);
                this.boxcolor = this.rgbToHex(rgb[0], rgb[1], rgb[2]);
            }
            this.setDirtyCanvas(true);
        }
        toggleCollapse() {
            this.properties.isCollapsed = !this.properties.isCollapsed;
            this.collapseButton.value = this.properties.isCollapsed ? "▶" : "▼";
            this.updateNodeSize();
            this.setDirtyCanvas(true);
        }
        onDrawBackground(ctx) {
            if (super.onDrawBackground) super.onDrawBackground(ctx);
            if (!this.bgGradient) {
                this.bgGradient = ctx.createLinearGradient(0, 0, 0, this.size[1]);
                this.bgGradient.addColorStop(0, "rgba(140, 90, 60, 0.9)");
                this.bgGradient.addColorStop(1, "rgba(100, 60, 40, 0.8)");
            }
            ctx.fillStyle = this.bgGradient;
            ctx.fillRect(0, 0, this.size[0], this.size[1]);
        }
        onDrawForeground(ctx) {
            if (super.onDrawForeground) super.onDrawForeground(ctx);
            let widgetsHeight = 0;
            this.widgets.forEach(widget => {
                if (!widget.name.startsWith("Select Light")) {
                    widgetsHeight += widget.computeSize ? widget.computeSize(this.size[0])[1] : LiteGraph.NODE_WIDGET_HEIGHT;
                }
            });
            widgetsHeight += 15;
            const selectorHeight = this.lightSelectors.length * 25;
            const overlayStartY = widgetsHeight + selectorHeight + 75;
            const spacing = 25;
            if (!this.properties.isCollapsed) {
                this.properties.selectedLightIds.forEach((lightId, index) => {
                    if (!lightId) return;
                    const lightName = this.properties.selectedLightNames[index];
                    const lightState = this.perLightState[lightId];
                    if (!lightState) return;
                    const yPosition = overlayStartY + index * spacing;
                    if (this.currentStaggerIndex === index) {
                        ctx.fillStyle = "rgba(255, 255, 0, 0.3)";
                        ctx.fillRect(0, yPosition - 15, this.size[0], 25);
                    }
                    ctx.fillStyle = "#E0E0E0";
                    ctx.font = "14px Roboto, Arial, sans-serif";
                    ctx.textAlign = "left";
                    ctx.fillText(lightName, 10, yPosition);
                    const onOffX = this.size[0] - 100;
                    const baseRadius = 10;
                    ctx.beginPath();
                    if (lightState.on) {
                        const now = Date.now();
                        const flashState = Math.floor(now / 500) % 2;
                        if (flashState === 0) {
                            ctx.fillStyle = "#00FF00";
                            ctx.arc(onOffX, yPosition - 5, baseRadius, 0, Math.PI * 2);
                            ctx.fill();
                        }
                    } else {
                        ctx.fillStyle = "#FF0000";
                        ctx.arc(onOffX, yPosition - 5, baseRadius, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    ctx.strokeStyle = "#FFFFFF";
                    ctx.lineWidth = 1;
                    ctx.stroke();
                    const meterX = this.size[0] - 80;
                    const meterWidth = 60;
                    const meterHeight = 20;
                    const brightness = lightState.on ? (lightState.brightness || 100) : 0;
                    const brightnessPercent = Math.min(1, Math.max(0, brightness / 100));
                    const rgb = this.hsvToRgb(lightState.hue / 360, lightState.saturation / 100, 1);
                    ctx.fillStyle = this.rgbToHex(rgb[0], rgb[1], rgb[2]);
                    ctx.fillRect(meterX, yPosition - 15, meterWidth * brightnessPercent, meterHeight);
                    ctx.strokeStyle = "#FFFFFF";
                    ctx.lineWidth = 1;
                    ctx.strokeRect(meterX, yPosition - 15, meterWidth, meterHeight);
                    ctx.fillStyle = "#FFFFFF";
                    ctx.font = "10px Roboto, Arial, sans-serif";
                    ctx.textAlign = "center";
                    ctx.fillText(`${Math.round(brightnessPercent * 100)}%`, meterX + meterWidth / 2, yPosition - 2);
                });
            }
            const avgHue = this.properties.selectedLightIds
                .filter(id => this.perLightState[id])
                .reduce((sum, id) => sum + (this.perLightState[id].hue || 0), 0) / (this.properties.selectedLightIds.length || 1);
            const statusColor = this.hsvToRgb(avgHue / 360, 1, 1);
            ctx.fillStyle = this.rgbToHex(statusColor[0], statusColor[1], statusColor[2]);
            ctx.fillRect(0, this.size[1] - 5, this.size[0], 5);
        }
        onMouseDown(event) {
            if (!this.graph || !this.graph.canvas) return;
            const mousePos = this.graph.canvas.getMousePos(event);
            const x = mousePos.x - this.pos[0];
            const y = mousePos.y - this.pos[1];
            let widgetsHeight = 0;
            this.widgets.forEach(widget => {
                if (!widget.name.startsWith("Select Light")) {
                    widgetsHeight += widget.computeSize ? widget.computeSize(this.size[0])[1] : LiteGraph.NODE_WIDGET_HEIGHT;
                }
            });
            widgetsHeight += 15;
            const selectorHeight = this.lightSelectors.length * 25;
            const overlayStartY = widgetsHeight + selectorHeight + 75;
            const spacing = 25;
            if (!this.properties.isCollapsed) {
                this.properties.selectedLightIds.forEach((lightId, index) => {
                    if (!lightId) return;
                    const lightName = this.properties.selectedLightNames[index];
                    const lightState = this.perLightState[lightId];
                    if (!lightState) return;
                    const yPosition = overlayStartY + index * spacing;
                    const onOffX = this.size[0] - 100;
                    const onOffY = yPosition - 5;
                    const onOffHit = Math.sqrt(Math.pow(x - onOffX, 2) + Math.pow(y - onOffY, 2)) <= 10;
                    if (onOffHit) {
                        this.toggleLightState(lightId, !lightState.on, lightName);
                        return;
                    }
                });
            }
        }
        async toggleLightState(lightId, newState, lightName) {
            try {
                const endpoint = newState ? 'on' : 'off';
                const payload = { 
                    on: newState,
                    transition: this.properties.transitionTime
                };
                const response = await fetch(`${this.KASA_API_URL}/api/lights/kasa/${encodeURIComponent(lightId)}/${endpoint}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await response.json();
                if (data.success) {
                    this.perLightState[lightId].on = newState;
                    this.perLightState[lightId].brightness = newState ? (this.perLightState[lightId].brightness || 100) : 0;
                    console.log(`Before fetch, perLightState[${lightId}]:`, this.perLightState[lightId]);
                    await this.fetchLightStateAndColor(lightId);
                    console.log(`After toggle and fetch, perLightState[${lightId}]:`, this.perLightState[lightId]);
                    this.updateStatus(`✅ Light "${lightName}" turned ${newState ? "On" : "Off"}.`);
                    this.setDirtyCanvas(true);
                } else {
                    throw new Error(data.error || "Failed to toggle state");
                }
            } catch (error) {
                console.error(`KasaLightControlNode - Error toggling Light ID ${lightId}:`, error);
                this.updateStatus(`⚠️ Error toggling Light ${lightId}: ${error.message}`);
            }
        }
        async setLightColor(lightId, newHue, saturation, brightness, lightName) {
            try {
                const payload = { 
                    on: true,
                    hue: newHue,
                    saturation,
                    brightness,
                    transition: this.properties.transitionTime
                };
                const response = await fetch(`${this.KASA_API_URL}/api/lights/kasa/${encodeURIComponent(lightId)}/state`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await response.json();
                if (data.success) {
                    this.perLightState[lightId] = { ...this.perLightState[lightId], hue: newHue, saturation, brightness };
                    this.updateStatus(`✅ Light "${lightName}" color updated.`);
                    this.setDirtyCanvas(true);
                } else {
                    throw new Error(data.error || "Failed to set color");
                }
            } catch (error) {
                console.error(`KasaLightControlNode - Error updating color for Light ID ${lightId}:`, error);
                this.updateStatus(`⚠️ Error updating color for Light ${lightId}: ${error.message}`);
            }
        }
        async setBrightness(lightId, newBrightness, lightName) {
            try {
                const payload = { 
                    on: true,
                    hue: this.perLightState[lightId].hue,
                    saturation: this.perLightState[lightId].saturation,
                    brightness: Math.max(1, Math.min(100, newBrightness)),
                    transition: this.properties.transitionTime
                };
                const response = await fetch(`${this.KASA_API_URL}/api/lights/kasa/${encodeURIComponent(lightId)}/state`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await response.json();
                if (data.success) {
                    this.perLightState[lightId].brightness = newBrightness;
                    this.perLightState[lightId].on = true;
                    this.updateStatus(`✅ Light "${lightName}" brightness set to ${Math.round(newBrightness)}%.`);
                    this.setDirtyCanvas(true);
                } else {
                    throw new Error(data.error || "Failed to set brightness");
                }
            } catch (error) {
                console.error(`KasaLightControlNode - Error setting brightness for Light ID ${lightId}:`, error);
                this.updateStatus(`⚠️ Error setting brightness for Light ${lightId}: ${error.message}`);
            }
        }
        updateNodeSize() {
            this.size[0] = 400;
            const baseHeight = 40;
            let widgetsHeight = 0;
            this.widgets.forEach(widget => {
                if (!widget.name.startsWith("Select Light")) {
                    widgetsHeight += widget.computeSize ? widget.computeSize(this.size[0])[1] : LiteGraph.NODE_WIDGET_HEIGHT;
                }
            });
            widgetsHeight += 15;
            const totalLightHeight = this.properties.selectedLightIds.length * 50;
            const extraHeight = 45;
            this.size[1] = baseHeight + widgetsHeight + totalLightHeight + extraHeight;
            this.setSize([this.size[0], this.size[1]]);
            this.widgets.forEach(widget => widget.options.width = widget.name === "Status" ? this.size[0] - 400 : widget.name === "Interval (ms)" ? 80 : widget.name === "Stagger" ? 60 : widget.name === "Transition (ms)" ? 100 : 40);
            this.setDirtyCanvas(true, true);
        }
        updateStatus(newStatus) {
            this.properties.status = newStatus;
            if (this.statusWidget) this.statusWidget.value = this.properties.status;
            this.setDirtyCanvas(true);
        }
        handleDeviceStateUpdate(data) {
            // FIX: Ignore Socket.IO updates during HSV processing to prevent state mismatches
            if (this.isUpdatingHSV) {
                console.log(`Ignoring Socket.IO update for ${data.id} during HSV processing`);
                return;
            }
            const lightId = data.id;
            const index = this.properties.selectedLightIds.indexOf(lightId);
            if (index === -1) return;
            this.perLightState[lightId] = {
                on: data.on ?? this.perLightState[lightId].on,
                hue: data.hue !== undefined ? data.hue : this.perLightState[lightId].hue,
                saturation: data.saturation !== undefined ? data.saturation : this.perLightState[lightId].saturation,
                brightness: data.brightness !== undefined ? data.brightness : this.perLightState[lightId].brightness
            };
            this.updateColorSwatch();
            const lightName = this.properties.selectedLightNames[index];
            this.updateStatus(`✅ Real-time update: "${lightName}" is ${data.on ? "On" : "Off"}`);
            this.setDirtyCanvas(true);
        }
    }
    LiteGraph.registerNodeType("Lighting/KasaLightControlNode", KasaLightControlNode);
    console.log("KasaLightControlNode - Registered successfully under 'Lighting' category.");
    LiteGraph.KasaLightControlNode = KasaLightControlNode;
}