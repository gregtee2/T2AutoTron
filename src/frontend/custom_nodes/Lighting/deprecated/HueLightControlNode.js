if (!LiteGraph.registered_node_types || !LiteGraph.registered_node_types["Lighting/HueLightControlNode"]) {
    class HueLightControlNode extends LiteGraph.LGraphNode {
        static deviceCache = null;
        static deviceCacheTimestamp = 0;
        static CACHE_VALIDITY = 60000; // Cache devices for 60 seconds

        constructor() {
            super();
            this.title = "Hue Light Control";
            this.resizable = true;
            this.autosize = false;
            this.bgcolor = "rgb(140, 90, 60)";
            this.bgGradient = null;

            this.properties = {
                selectedLightIds: [],
                selectedLightNames: [],
                status: "No action yet",
                isCollapsed: false,
                staggerInterval: 100,
                useStagger: true,
                maxRetries: 3,
                debug: false
            };

            this.BACKEND_URL = "http://localhost:3000";

            this.lightSelectors = [];
            this.initializeSocketIO();
            this.setupWidgets();

            this.addInput("HSV Info", "hsv_info");
            this.addInput("Trigger", "boolean");
            this.addInput("FX Effect", "fx_effect");
            this.addOutput("Light Info", "light_info");

            this.devices = [];
            this.deviceManagerReady = false;

            this.lastToggleInput = null;
            this.lastToggleTimestamp = 0;
            this.lastTriggerInput = null;
            this.intendedState = null;
            this.lastHsvInfo = null;
            this.lastHsvInput = null;
            this.lastFxInfo = null;
            this.lastFxUpdate = 0;
            this.lastStateSync = 0;

            this.hsvDebounceTimer = null;
            this.HSV_DEBOUNCE_DELAY = 100;

            this.boxcolor = "#000000";
            this.perLightState = {};

            this.currentStaggerIndex = -1;

            this.glowPulse = 0;
            this.lastUpdate = Date.now();

            this.requestQueue = [];
            this.isProcessingQueue = false;

            console.log("HueLightControlNode - Initialized.");

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
                this.collapseButton = this.addWidget("button", "▼", "Collapse", () => this.toggleCollapse(), { width: 40 });
                this.statusWidget = this.addWidget("text", "Status", this.properties.status, null, { property: "status", readonly: true, width: widgetWidth - 300 });
                console.log("HueLightControlNode - Widgets set up.");
            } catch (error) {
                console.error("HueLightControlNode - Error setting up widgets:", error);
                this.updateStatus(`⚠️ Error setting up widgets: ${error.message}`);
            }
        }

        initializeSocketIO() {
            if (typeof io === 'undefined') {
                console.error("HueLightControlNode - Socket.IO client (io) not found. Ensure socket.io.js is included in your HTML.");
                this.updateStatus("⚠️ Socket.IO not loaded.");
                return;
            }
            if (!this.socket) {
                console.log("HueLightControlNode - Initializing Socket.IO...");
                this.socket = io(this.BACKEND_URL, {
                    reconnection: true,
                    reconnectionAttempts: 10,
                    reconnectionDelay: 1000,
                    reconnectionDelayMax: 5000,
                    timeout: 10000
                });

                this.socket.on('connect', () => {
                    console.log("HueLightControlNode - Connected to Socket.IO server.");
                    this.updateStatus("✅ Connected to server.");
                    this.fetchDevices();
                });

                this.socket.on('connect_error', (err) => {
                    console.error("HueLightControlNode - Connection error:", err.message);
                    this.updateStatus(`⚠️ Connection error: ${err.message}`);
                });

                this.socket.on('disconnect', () => {
                    console.log("HueLightControlNode - Disconnected from Socket.IO server.");
                    this.updateStatus("⚠️ Disconnected from server.");
                });

                this.socket.on('device-state-update', (data) => this.handleDeviceStateUpdate(data));
            }
        }

        onAdded() {
            this.fetchDevices();
        }

        async fetchDevices() {
            console.log("HueLightControlNode - Fetching Hue devices...");
            const now = Date.now();
            if (HueLightControlNode.deviceCache && (now - HueLightControlNode.deviceCacheTimestamp) < HueLightControlNode.CACHE_VALIDITY) {
                this.devices = HueLightControlNode.deviceCache;
                this.deviceManagerReady = true;
                console.log(`HueLightControlNode - Using cached devices: ${this.devices.length} devices`);
                if (this.needsLightSelectorsRestore && this.properties.selectedLightIds.length > 0) {
                    this.restoreLightSelectors();
                } else {
                    this.updateStatus("✅ Devices fetched from cache.");
                }
                return;
            }

            const maxRetries = 3;
            const retryDelay = 2000; // 2 seconds
            for (let attempt = 0; attempt < maxRetries; attempt++) {
                try {
                    const response = await fetch(`${this.BACKEND_URL}/api/lights/hue`);
                    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    const data = await response.json();
                    if (data.success && Array.isArray(data.lights)) {
                        this.devices = data.lights.map(light => ({
                            light_id: String(light.id).replace('hue_', ''),
                            name: light.name,
                            energy: light.energy || 0,
                            supportsEffects: {
                                candle: true,
                                fireplace: true,
                                prism: true,
                                sparkle: true,
                                cosmos: true,
                                underwater: true,
                                enchant: true,
                                sunbeam: true,
                                colorloop: light.type?.includes("Color") || false,
                                scattered: true
                            }
                        }));
                        this.deviceManagerReady = true;
                        HueLightControlNode.deviceCache = this.devices;
                        HueLightControlNode.deviceCacheTimestamp = now;
                        console.log(`HueLightControlNode - Retrieved ${this.devices.length} Hue devices`);
                        if (this.needsLightSelectorsRestore && this.properties.selectedLightIds.length > 0) {
                            this.restoreLightSelectors();
                        } else {
                            this.updateStatus("✅ Devices fetched successfully.");
                        }
                        return;
                    } else if (data.error === "Hue lights not initialized yet.") {
                        throw new Error("Hue lights not initialized yet");
                    } else {
                        throw new Error("No Hue devices found or invalid response format");
                    }
                } catch (error) {
                    console.error(`HueLightControlNode - Error fetching devices on attempt ${attempt + 1}:`, error);
                    if (attempt < maxRetries - 1) {
                        console.log(`HueLightControlNode - Retrying in ${retryDelay}ms...`);
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

        restoreLightSelectors() {
            this.lightSelectors = [];
            this.properties.selectedLightIds.forEach((lightId, index) => {
                const device = this.devices.find(d => d.light_id === lightId);
                if (device) {
                    const lightName = device.name;
                    const lightSelector = this.addWidget(
                        "combo",
                        `Select Light ${index + 1}`,
                        `${lightName} (ID: ${lightId})`,
                        (value) => this.onLightSelected(value, index),
                        { values: ["Select Light", ...this.getLightOptions()], width: this.size[0] - 20 }
                    );
                    this.lightSelectors.push(lightSelector);
                    this.perLightState[lightId] = this.perLightState[lightId] || { 
                        on: false, 
                        hue: 0, 
                        saturation: 0, 
                        brightness: 0,
                        energy: device.energy || 0,
                        effect: null
                    };
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
                ? this.devices.map(device => `${device.name} (ID: ${device.light_id})`)
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
            this.setDirtyCanvas(true);
            this.updateStatus(`✅ Added light selector ${this.lightSelectors.length}.`);
        }

        onRemoveLight() {
            if (this.lightSelectors.length === 0) {
                this.updateStatus("⚠️ No light selectors to remove.");
                return;
            }
            const lightSelector = this.lightSelectors.pop();
            const index = this.widgets.indexOf(lightSelector);
            if (index > -1) this.widgets.splice(index, 1);
            const removedLightId = this.properties.selectedLightIds.pop();
            this.properties.selectedLightNames.pop();
            if (removedLightId && this.perLightState[removedLightId]) {
                delete this.perLightState[removedLightId];
            }
            this.updateNodeSize();
            this.setDirtyCanvas(true);
            this.updateStatus(`✅ Removed light selector ${this.lightSelectors.length + 1}.`);
        }

        async onLightSelected(value, index) {
            console.log(`onLightSelected triggered with value: ${value}, index: ${index}`);
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

            const match = value.match(/\(ID:\s*([^\)]+)\)/);
            if (match && match[1]) {
                const lightId = match[1].replace('hue_', '');
                const lightName = value.split(" (ID:")[0];
                console.log(`Selected: ID=${lightId}, Name=${lightName}`);

                const allNodes = this.graph ? this.graph.findNodesByType("Lighting/HueLightControlNode") : [];
                const isDuplicate = allNodes.some(node => 
                    node !== this && node.properties.selectedLightIds.includes(lightId)
                );
                if (isDuplicate) {
                    this.updateStatus(`⚠️ Light "${lightName}" is already controlled by another node.`);
                    this.lightSelectors[index].value = "Select Light";
                    this.properties.selectedLightIds[index] = null;
                    this.properties.selectedLightNames[index] = null;
                    return;
                }

                if (this.properties.selectedLightIds.includes(lightId)) {
                    this.updateStatus(`⚠️ Light "${lightName}" is already selected in this node.`);
                    this.lightSelectors[index].value = "Select Light";
                    this.properties.selectedLightIds[index] = null;
                    this.properties.selectedLightNames[index] = null;
                    return;
                }

                this.properties.selectedLightIds[index] = lightId;
                this.properties.selectedLightNames[index] = lightName;
                this.perLightState[lightId] = { on: false, hue: 0, saturation: 0, brightness: 0, energy: 0, effect: null };
                await this.fetchLightStateAndColor(lightId);
                this.updateNodeSize();
                this.setDirtyCanvas(true);
            }
        }

        async fetchLightStateAndColor(lightId) {
            for (let attempt = 0; attempt < this.properties.maxRetries; attempt++) {
                try {
                    console.log(`Fetching state for Hue light ${lightId}, attempt ${attempt + 1}`);
                    const response = await fetch(`${this.BACKEND_URL}/api/lights/hue/${lightId}`);
                    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    const data = await response.json();
                    console.log(`Hue response for ${lightId}:`, data);
                    if (data.success && data.light) {
                        const { on, hue, sat, bri } = data.light.state;
                        this.perLightState[lightId] = {
                            on,
                            hue: hue !== undefined ? (hue / 65535) * 360 : 0,
                            saturation: sat !== undefined ? (sat / 254) * 100 : 0,
                            brightness: bri !== undefined ? bri : 0,
                            energy: data.light.energy !== undefined ? data.light.energy : this.perLightState[lightId]?.energy || 0,
                            effect: data.light.state.effect || null
                        };
                        const lightName = this.properties.selectedLightNames[this.properties.selectedLightIds.indexOf(lightId)];
                        this.updateStatus(`✅ Light "${lightName}" is ${on ? "On" : "Off"}`);
                        this.setDirtyCanvas(true);
                        return true;
                    } else {
                        throw new Error(data.message || "Failed to fetch light state");
                    }
                } catch (error) {
                    console.error(`HueLightControlNode - Error fetching state for Light ID ${lightId} on attempt ${attempt + 1}:`, error);
                    if (attempt === this.properties.maxRetries - 1) {
                        this.updateStatus(`⚠️ Error fetching Light ${lightId} after ${this.properties.maxRetries} attempts: ${error.message}`);
                        return false;
                    } else {
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                }
            }
            return false;
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

            const isNewPush = !this.lastHsvInput || 
                hsv.hue !== this.lastHsvInput.hue || 
                hsv.saturation !== this.lastHsvInput.saturation || 
                hsv.brightness !== this.lastHsvInput.brightness;

            if (!isNewPush) {
                return;
            }

            this.lastHsvInput = { ...hsv };

            let { hue, saturation, brightness } = hsv;
            hue = hue <= 1 ? hue * 360 : hue;
            saturation = saturation <= 1 ? saturation * 254 : saturation;
            brightness = brightness <= 1 ? brightness * 254 : brightness > 254 ? brightness : brightness;

            hue = Math.round(Math.max(0, Math.min(360, hue)));
            saturation = Math.round(Math.max(0, Math.min(254, saturation)));
            brightness = Math.round(Math.max(1, Math.min(254, brightness)));

            this.lastHsvInfo = { hue, saturation, brightness };
            this.updateColorSwatch();

            if (this.hsvDebounceTimer) clearTimeout(this.hsvDebounceTimer);
            this.hsvDebounceTimer = setTimeout(async () => {
                const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

                for (let i = 0; i < this.properties.selectedLightIds.length; i++) {
                    const lightId = this.properties.selectedLightIds[i];
                    if (!lightId) continue;

                    const lightName = this.properties.selectedLightNames[i];
                    const stateFetched = await this.fetchLightStateAndColor(lightId);
                    if (!stateFetched) {
                        this.updateStatus(`⚠️ Skipping HSV update for Light "${lightName}": Failed to fetch state`);
                        continue;
                    }

                    this.perLightState[lightId] = {
                        ...this.perLightState[lightId],
                        hue,
                        saturation,
                        brightness,
                        effect: null
                    };

                    if (!this.perLightState[lightId].on) {
                        if (this.properties.debug) console.log(`HueLightControlNode - Light "${lightName}" (ID: ${lightId}) is off, storing HSV but not updating API`);
                        this.updateStatus(`ℹ️ Light "${lightName}" is off, HSV stored but not applied`);
                        continue;
                    }

                    const payload = {
                        on: true,
                        hue: Math.round((hue / 360) * 65535),
                        sat: saturation,
                        bri: brightness,
                        effect: "none"
                    };

                    this.currentStaggerIndex = i;
                    this.setDirtyCanvas(true);

                    if (this.properties.useStagger) await delay(i * this.properties.staggerInterval);

                    let success = false;
                    for (let attempt = 0; attempt < this.properties.maxRetries; attempt++) {
                        try {
                            const response = await fetch(`${this.BACKEND_URL}/api/lights/hue/${lightId}/state`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(payload)
                            });
                            const data = await response.json();
                            if (data.success) {
                                this.perLightState[lightId].on = true;
                                success = true;
                                break;
                            } else {
                                throw new Error(data.error || "Failed to set color");
                            }
                        } catch (error) {
                            if (attempt === this.properties.maxRetries - 1) {
                                console.warn(`HueLightControlNode - Error setting HSV for Light "${lightName}" (ID: ${lightId}) after ${this.properties.maxRetries} attempts: ${error.message}`);
                                this.updateStatus(`⚠️ Error setting color for Light "${lightName}": ${error.message}`);
                            } else {
                                await delay(500);
                            }
                        }
                    }

                    if (success) {
                        this.updateStatus(`✅ Set color for Light "${lightName}" (Step ${i + 1}).`);
                        this.setDirtyCanvas(true);
                    }
                }
                this.currentStaggerIndex = -1;
                this.setDirtyCanvas(true);
            }, this.HSV_DEBOUNCE_DELAY);
        }

        async handleFXInput(fx) {
            if (!this.properties.selectedLightIds.length) {
                this.updateStatus("⚠️ No lights selected. Cannot update FX.");
                return;
            }
            if (!fx || typeof fx !== 'object') {
                this.updateStatus("⚠️ Invalid FX input.");
                return;
            }

            let isEffectCommand = fx.effectCommand;
            let effectCommand, intensity, baseColor, hue, saturation, brightness;

            if (isEffectCommand) {
                effectCommand = fx.effectCommand;
                intensity = fx.intensity || 1;
                baseColor = fx.baseColor || null;
                if (!["candle", "fireplace", "colorloop", "prism", "sparkle", "cosmos", "underwater", "enchant", "sunbeam", "scattered"].includes(effectCommand)) {
                    this.updateStatus(`⚠️ Unsupported effect: ${effectCommand}`);
                    return;
                }
            } else {
                hue = fx.hue;
                saturation = fx.saturation;
                brightness = fx.brightness;
                if (
                    typeof hue !== 'number' ||
                    typeof saturation !== 'number' ||
                    typeof brightness !== 'number'
                ) {
                    this.updateStatus("⚠️ Invalid FX HSV values.");
                    return;
                }
            }

            const isNewPush = !this.lastFxInfo || 
                (isEffectCommand ? 
                    this.lastFxInfo.effectCommand !== effectCommand :
                    (fx.hue !== this.lastFxInfo.hue || 
                     fx.saturation !== this.lastFxInfo.saturation || 
                     fx.brightness !== this.lastFxInfo.brightness));

            if (!isNewPush) {
                return;
            }

            this.lastFxInfo = isEffectCommand ? { effectCommand, intensity, baseColor } : { hue, saturation, brightness };

            if (!isEffectCommand) {
                hue = hue <= 1 ? hue * 360 : hue;
                saturation = saturation <= 1 ? saturation * 254 : saturation;
                brightness = brightness <= 1 ? brightness * 254 : brightness > 254 ? brightness : brightness;

                hue = Math.round(Math.max(0, Math.min(360, hue)));
                saturation = Math.round(Math.max(0, Math.min(254, saturation)));
                brightness = Math.round(Math.max(1, Math.min(254, brightness)));

                this.updateColorSwatch(hue / 360, saturation / 254, brightness / 254);
            }

            const now = Date.now();
            const isRapidUpdate = this.lastFxUpdate && (now - this.lastFxUpdate) < 200;
            this.lastFxUpdate = now;

            if (this.hsvDebounceTimer && !isRapidUpdate) clearTimeout(this.hsvDebounceTimer);

            const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

            for (let i = 0; i < this.properties.selectedLightIds.length; i++) {
                const lightId = this.properties.selectedLightIds[i];
                if (!lightId) continue;

                const lightName = this.properties.selectedLightNames[i];
                const device = this.devices.find(d => d.light_id === lightId);

                if (isEffectCommand && (!device || !device.supportsEffects[effectCommand])) {
                    this.updateStatus(`⚠️ Light "${lightName}" does not support ${effectCommand} effect`);
                    continue;
                }

                const stateFetched = await this.fetchLightStateAndColor(lightId);
                if (!stateFetched) {
                    this.updateStatus(`⚠️ Skipping FX update for Light "${lightName}": Failed to fetch state`);
                    continue;
                }

                if (!this.perLightState[lightId].on) {
                    this.updateStatus(`ℹ️ Light "${lightName}" is off, FX stored but not applied`);
                    continue;
                }

                let payload;
                if (isEffectCommand && effectCommand === "colorloop") {
                    // API-driven effect (colorloop is supported by the Hue API)
                    payload = {
                        on: true,
                        effect: effectCommand,
                        bri: Math.round(intensity * 254)
                    };
                    this.perLightState[lightId] = {
                        ...this.perLightState[lightId],
                        effect: effectCommand,
                        brightness: payload.bri
                    };
                } else if (isEffectCommand && ["candle", "fireplace"].includes(effectCommand)) {
                    // API-driven effect (candle and fireplace are supported by your Hue Bridge)
                    payload = {
                        on: true,
                        effect: effectCommand,
                        bri: Math.round(intensity * 254)
                    };
                    if (baseColor) {
                        payload.hue = Math.round((baseColor.hue / 360) * 65535);
                        payload.sat = Math.round(baseColor.saturation * 254);
                    }
                    this.perLightState[lightId] = {
                        ...this.perLightState[lightId],
                        effect: effectCommand,
                        brightness: payload.bri,
                        ...(baseColor ? {
                            hue: baseColor.hue,
                            saturation: baseColor.saturation
                        } : {})
                    };
                } else {
                    // Emulated effects (prism, sparkle, etc.) or fallback for candle/fireplace if API fails
                    if (!isEffectCommand) {
                        // Direct HSV input from HueFXNode
                        hue = hue <= 1 ? hue * 360 : hue;
                        saturation = saturation <= 1 ? saturation * 254 : saturation;
                        brightness = brightness <= 1 ? brightness * 254 : brightness > 254 ? brightness : brightness;

                        hue = Math.round(Math.max(0, Math.min(360, hue)));
                        saturation = Math.round(Math.max(0, Math.min(254, saturation)));
                        brightness = Math.round(Math.max(1, Math.min(254, brightness)));
                    } else {
                        // Emulate candle or fireplace using HSV streams
                        if (effectCommand === "candle") {
                            // Candle: Flickering warm glow
                            const flicker = Math.sin((timestamp / 1000) * speed * 2) * 0.2 + 0.8;
                            hue = baseColor ? baseColor.hue : 39; // Warm yellow (default for candle)
                            saturation = baseColor ? baseColor.saturation * 254 : 200;
                            brightness = flicker * intensity * 254;
                        } else if (effectCommand === "fireplace") {
                            // Fireplace: Dancing flames with orange-red tones
                            const flicker = Math.sin((timestamp / 1000) * speed * 3) * 0.3 + 0.7;
                            hue = baseColor ? baseColor.hue : 15 + Math.sin((timestamp / 1000) * speed) * 10; // Orange-red range
                            saturation = baseColor ? baseColor.saturation * 254 : 254;
                            brightness = flicker * intensity * 254;
                        }
                    }
                    payload = {
                        on: true,
                        hue: Math.round((hue / 360) * 65535),
                        sat: saturation,
                        bri: brightness,
                        effect: "none"
                    };
                    this.perLightState[lightId] = {
                        ...this.perLightState[lightId],
                        hue,
                        saturation,
                        brightness,
                        effect: effectCommand // Store effect name for UI, even if emulated
                    };
                }

                this.currentStaggerIndex = i;
                this.setDirtyCanvas(true);

                if (this.properties.useStagger) await delay(i * this.properties.staggerInterval);

                let success = false;
                for (let attempt = 0; attempt < this.properties.maxRetries; attempt++) {
                    try {
                        const response = await fetch(`${this.BACKEND_URL}/api/lights/hue/${lightId}/state`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload)
                        });
                        const data = await response.json();
                        if (data.success) {
                            this.perLightState[lightId].on = true;
                            success = true;
                            break;
                        } else {
                            throw new Error(data.error || "Failed to set effect/HSV");
                        }
                    } catch (error) {
                        if (attempt === this.properties.maxRetries - 1) {
                            // If API fails for candle/fireplace, log the error but continue
                            console.warn(`HueLightControlNode - Error setting ${isEffectCommand ? effectCommand : "color"} for Light "${lightName}" after ${this.properties.maxRetries} attempts: ${error.message}`);
                            this.updateStatus(`⚠️ Error setting ${isEffectCommand ? effectCommand : "color"} for Light "${lightName}": ${error.message}`);
                            // No fallback to emulation since we know the Hue Bridge supports these effects
                            break;
                        } else {
                            await delay(500);
                        }
                    }
                }

                if (success) {
                    this.updateStatus(`✅ Set ${isEffectCommand ? effectCommand : "color"} for Light "${lightName}" (Step ${i + 1}).`);
                    this.setDirtyCanvas(true);
                }
            }
            this.currentStaggerIndex = -1;
            this.setDirtyCanvas(true);
        }

        async handleTrigger(trigger, force = false) {
            const desiredState = Boolean(trigger);
            
            // State-based check to skip redundant triggers
            if (!force && desiredState === this.lastToggleInput) {
                if (this.properties.debug) { // Only log skipping if debug is enabled
                    console.log(`HueLightControlNode (id: ${this.id}) - Skipping trigger: desiredState (${desiredState}) matches lastToggleInput`);
                }
                return;
            }

            // Log only when the trigger is processed
            const detailedPerLightState = {};
            for (const lightId of Object.keys(this.perLightState)) {
                const lightName = this.properties.selectedLightNames[this.properties.selectedLightIds.indexOf(lightId)] || "Unknown";
                detailedPerLightState[`${lightId} (${lightName})`] = this.perLightState[lightId];
            }
            console.log(`HueLightControlNode (id: ${this.id}) - Processing trigger: trigger=${trigger}, force=${force}, lastToggleInput=${this.lastToggleInput}, perLightState=${JSON.stringify(detailedPerLightState)}`);

            if (!this.properties.selectedLightIds.length) {
                this.updateStatus("⚠️ No lights selected. Cannot toggle state.");
                return;
            }
            if (!this.deviceManagerReady) {
                this.updateStatus("⚠️ Waiting for devices to initialize.");
                return;
            }

            let needsUpdate = false;
            const maxFetchRetries = 3;

            console.log(`HueLightControlNode (id: ${this.id}) - handleTrigger: Fetching state for all lights`);
            for (let retry = 0; retry < maxFetchRetries; retry++) {
                const fetchResults = await Promise.all(this.properties.selectedLightIds.map(lightId => 
                    lightId ? this.fetchLightStateAndColor(lightId) : Promise.resolve(false)
                ));

                let allFetched = true;
                for (let i = 0; i < this.properties.selectedLightIds.length; i++) {
                    const lightId = this.properties.selectedLightIds[i];
                    if (!lightId) continue;
                    const fetchSuccess = fetchResults[i];
                    if (!fetchSuccess) {
                        console.log(`HueLightControlNode (id: ${this.id}) - handleTrigger: Fetch failed for light ${lightId} on retry ${retry + 1}`);
                        allFetched = false;
                        continue;
                    }
                    const actualState = this.perLightState[lightId]?.on;
                    if (actualState !== desiredState) {
                        console.log(`HueLightControlNode (id: ${this.id}) - handleTrigger: Mismatch detected for light ${lightId} (actual=${actualState}, desired=${desiredState})`);
                        needsUpdate = true;
                    }
                }
                if (allFetched) break;
                console.log(`HueLightControlNode (id: ${this.id}) - handleTrigger: Retrying state fetch, attempt ${retry + 2}`);
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            if (!needsUpdate) {
                this.lastToggleInput = desiredState;
                console.log(`HueLightControlNode (id: ${this.id}) - No update needed, state already matches: ${desiredState}`);
                this.updateStatus(`ℹ️ Lights already ${desiredState ? "On" : "Off"}`);
                return;
            }

            this.intendedState = desiredState;
            this.lastToggleInput = desiredState;
            this.lastToggleTimestamp = Date.now();

            this.properties.selectedLightIds.forEach(lightId => {
                if (lightId) {
                    this.perLightState[lightId] = this.perLightState[lightId] || {};
                    this.perLightState[lightId].on = desiredState;
                    console.log(`HueLightControlNode (id: ${this.id}) - Updated perLightState for ${lightId} to on=${desiredState}`);
                }
            });
            this.setDirtyCanvas(true);

            this.requestQueue = [{ desiredState, timestamp: Date.now() }];
            if (!this.isProcessingQueue) {
                console.log(`HueLightControlNode (id: ${this.id}) - Processing queue for state change`);
                this.processQueue();
            }
        }

        async processQueue() {
            if (this.isProcessingQueue || this.requestQueue.length === 0) return;
            this.isProcessingQueue = true;

            const { desiredState } = this.requestQueue[0];
            console.log(`HueLightControlNode - Processing queue with desiredState: ${desiredState}`);
            this.updateStatus(`✅ Setting lights to ${desiredState ? "On" : "Off"} ${this.properties.useStagger ? `with ${this.properties.staggerInterval}ms stagger` : "immediately"}.`);

            const payload = desiredState && this.lastHsvInfo
                ? {
                    on: true,
                    hue: Math.round((this.lastHsvInfo.hue / 360) * 65535),
                    sat: Math.round(this.lastHsvInfo.saturation),
                    bri: Math.round(this.lastHsvInfo.brightness)
                  }
                : { on: desiredState };

            const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

            for (let i = 0; i < this.properties.selectedLightIds.length; i++) {
                const lightId = this.properties.selectedLightIds[i];
                if (!lightId) continue;

                this.currentStaggerIndex = i;
                this.setDirtyCanvas(true);

                const staggerDelay = this.properties.useStagger ? i * this.properties.staggerInterval : 0;
                await delay(staggerDelay);

                let success = false;
                for (let attempt = 0; attempt < this.properties.maxRetries; attempt++) {
                    try {
                        console.log(`HueLightControlNode - Attempt ${attempt + 1} to toggle ${lightId} to on=${desiredState}`);
                        const response = await fetch(`${this.BACKEND_URL}/api/lights/hue/${lightId}/state`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload)
                        });
                        const data = await response.json();
                        console.log(`HueLightControlNode - Toggle response for ${lightId}:`, data);
                        if (data.success) {
                            this.perLightState[lightId].on = desiredState;
                            if (desiredState && this.lastHsvInfo) {
                                this.perLightState[lightId] = {
                                    ...this.perLightState[lightId],
                                    hue: this.lastHsvInfo.hue,
                                    saturation: this.lastHsvInfo.saturation,
                                    brightness: this.lastHsvInfo.brightness
                                };
                            }
                            success = true;
                            break;
                        } else {
                            throw new Error(data.error || "Failed to toggle state");
                        }
                    } catch (error) {
                        console.error(`HueLightControlNode - Attempt ${attempt + 1} failed for ${lightId}:`, error);
                        if (attempt === this.properties.maxRetries - 1) {
                            this.updateStatus(`⚠️ Error toggling Light ${lightId} after ${this.properties.maxRetries} attempts: ${error.message}`);
                        } else {
                            await delay(500);
                        }
                    }
                }

                if (success) {
                    const lightName = this.properties.selectedLightNames[i];
                    this.updateStatus(`✅ Light "${lightName}" turned ${desiredState ? "On" : "Off"} (Step ${i + 1}).`);
                    this.setDirtyCanvas(true);
                } else {
                    await this.fetchLightStateAndColor(lightId);
                }
            }
            this.currentStaggerIndex = -1;
            this.setDirtyCanvas(true);

            this.isProcessingQueue = false;
            this.requestQueue.shift();
            if (this.requestQueue.length > 0) {
                this.processQueue();
            }
        }

        onExecute() {
            if (this.needsLightSelectorsRestore) this.fetchDevices();
            const hsvInput = this.getInputData(0);
            const triggerInput = this.getInputData(1);
            const fxInput = this.getInputData(2);

            // Periodic state sync every 30 seconds
            const now = Date.now();
            if (!this.lastStateSync || now - this.lastStateSync > 30000) {
                this.properties.selectedLightIds.forEach(lightId => {
                    if (lightId) this.fetchLightStateAndColor(lightId);
                });
                this.lastStateSync = now;
            }

            if (triggerInput !== undefined) {
                if (this.forceInitialTrigger && this.deviceManagerReady) {
                    setTimeout(() => {
                        console.log(`HueLightControlNode (id: ${this.id}) - Processing delayed initial trigger: ${triggerInput}, force=${this.forceInitialTrigger}`);
                        this.handleTrigger(triggerInput, true);
                        this.lastTriggerInput = triggerInput;
                        this.forceInitialTrigger = false;
                    }, 1000);
                } else if (triggerInput !== this.lastTriggerInput) {
                    // Only log if the trigger will be processed (we'll check in handleTrigger)
                    // Call handleTrigger and let it log if the trigger is processed
                    this.handleTrigger(triggerInput, false);
                    this.lastTriggerInput = triggerInput;
                }
            }
            if (hsvInput) this.handleHSVInput(hsvInput);
            if (fxInput) this.handleFXInput(fxInput);

            const lightData = {
                lights: this.properties.selectedLightIds
                    .filter(id => id)
                    .map(id => ({
                        light_id: id,
                        name: this.properties.selectedLightNames[this.properties.selectedLightIds.indexOf(id)],
                        status: this.perLightState[id]?.on ? "On" : "Off",
                        hue: this.perLightState[id]?.hue,
                        saturation: this.perLightState[id]?.saturation,
                        brightness: this.perLightState[id]?.brightness,
                        energy: this.perLightState[id]?.energy || 0,
                        effect: this.perLightState[id]?.effect
                    })),
                status: this.properties.status
            };
            this.setOutputData(0, lightData);

            this.glowPulse = Math.sin((now - this.lastUpdate) / 500) * 2;
            this.lastUpdate = now;
            this.setDirtyCanvas(true);
        }

        serialize() {
            const data = super.serialize();
            data.properties = { ...this.properties };
            data.lastToggleInput = this.lastToggleInput;
            data.lastToggleTimestamp = this.lastToggleTimestamp;
            data.lastTriggerInput = this.lastTriggerInput;
            data.intendedState = this.intendedState;
            data.lastHsvInfo = this.lastHsvInfo;
            data.lastHsvInput = this.lastHsvInput;
            data.lastFxInfo = this.lastFxInfo;
            data.boxcolor = this.boxcolor;
            data.perLightState = this.perLightState;
            return data;
        }

        configure = async (data) => {
            console.log(`configure: Restoring node with data=${JSON.stringify(data)}`);
            super.configure(data);
            this.properties = {
                selectedLightIds: Array.isArray(data.properties?.selectedLightIds) ? data.properties.selectedLightIds : [],
                selectedLightNames: Array.isArray(data.properties?.selectedLightNames) ? data.properties.selectedLightNames : [],
                status: typeof data.properties?.status === "string" ? data.properties.status : "No action yet",
                isCollapsed: typeof data.properties?.isCollapsed === "boolean" ? data.properties.isCollapsed : false,
                staggerInterval: typeof data.properties?.staggerInterval === "number" ? data.properties.staggerInterval : 100,
                useStagger: typeof data.properties?.useStagger === "boolean" ? data.properties.useStagger : true,
                maxRetries: typeof data.properties?.maxRetries === "number" ? data.properties.maxRetries : 3
            };
            this.perLightState = data.perLightState || {};
            this.lastToggleInput = data.lastToggleInput ?? null;
            this.lastToggleTimestamp = data.lastToggleTimestamp ?? 0;
            this.lastTriggerInput = null; // Will be set after processing initial trigger
            this.intendedState = data.intendedState ?? null;
            this.lastHsvInfo = data.lastHsvInfo || null;
            this.lastHsvInput = data.lastHsvInput || null;
            this.lastFxInfo = data.lastFxInfo || null;
            this.boxcolor = data.boxcolor || "#000000";
            this.needsLightSelectorsRestore = true;
            this.forceInitialTrigger = false; // Allow immediate trigger processing
            this.widgets = [];
            this.lightSelectors = [];
            if (this.socket) {
                this.socket.disconnect();
                this.socket = null;
            }
            this.setupWidgets();
            this.initializeSocketIO();
            try {
                // Fetch devices and initialize light states
                await this.fetchDevices();
                for (const lightId of this.properties.selectedLightIds) {
                    if (lightId) {
                        await this.fetchLightStateAndColor(lightId);
                        console.log(`configure: Initial state for ${lightId}: ${JSON.stringify(this.perLightState[lightId])}`);
                    }
                }
                // Process initial trigger input if present
                const triggerInput = this.getInputData(1);
                if (triggerInput !== undefined) {
                    console.log(`configure: Applying initial trigger: ${triggerInput}`);
                    this.lastTriggerInput = triggerInput; // Prevent reprocessing in onExecute
                    await this.handleTrigger(triggerInput, true); // Force state fetch and apply trigger
                    await new Promise(resolve => setTimeout(resolve, 1000)); // Allow queue to process
                    console.log(`configure: Initial trigger ${triggerInput} applied to ${this.properties.selectedLightIds.length} lights`);
                } else {
                    console.log(`configure: No initial trigger input found`);
                }
                this.updateNodeSize();
                this.setDirtyCanvas(true);
                this.updateStatus(this.properties.status);
            } catch (error) {
                console.error(`configure: Error during configuration: ${error.message}`);
                this.updateStatus(`⚠️ Configuration failed: ${error.message}`);
            }
        };

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

        updateColorSwatch(hue = this.lastHsvInfo?.hue / 360, saturation = this.lastHsvInfo?.saturation / 254, brightness = this.lastHsvInfo?.brightness / 254) {
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
            const overlayStartY = widgetsHeight + selectorHeight + 100;
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
                    const brightness = lightState.on ? (lightState.brightness || 254) : 0;
                    const brightnessPercent = Math.min(1, Math.max(0, brightness / 254));
                    const rgb = this.hsvToRgb(
                        lightState.hue / 360,
                        lightState.saturation / 254,
                        brightnessPercent
                    );
                    ctx.fillStyle = this.rgbToHex(rgb[0], rgb[1], rgb[2]);
                    ctx.fillRect(meterX, yPosition - 15, meterWidth * brightnessPercent, meterHeight);
                    ctx.strokeStyle = "#FFFFFF";
                    ctx.lineWidth = 1;
                    ctx.strokeRect(meterX, yPosition - 15, meterWidth, meterHeight);
                    ctx.fillStyle = "#FFFFFF";
                    ctx.font = "10px Roboto, Arial, sans-serif";
                    ctx.textAlign = "center";
                    ctx.fillText(`${Math.round(brightnessPercent * 100)}%`, meterX + meterWidth / 2, yPosition - 2);

                    const energyX = meterX + meterWidth + 10;
                    ctx.fillStyle = "#E0E0E0";
                    ctx.font = "10px Roboto, Arial, sans-serif";
                    ctx.textAlign = "left";
                    const energyText = `Energy: ${lightState.energy !== undefined ? lightState.energy.toFixed(2) : '0.00'} Wh`;
                    ctx.fillText(energyText, energyX, yPosition);

                    if (lightState.effect) {
                        ctx.fillStyle = "#E0E0E0";
                        ctx.font = "10px Roboto, Arial, sans-serif";
                        ctx.textAlign = "right";
                        ctx.fillText(lightState.effect, this.size[0] - 10, yPosition + 10);
                    }
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
            const overlayStartY = widgetsHeight + selectorHeight + 10;
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
                const payload = { on: newState };
                console.log(`HueLightControlNode - Sending toggle for ${lightId} to on=${newState}`);
                const response = await fetch(`${this.BACKEND_URL}/api/lights/hue/${lightId}/state`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await response.json();
                console.log(`HueLightControlNode - Toggle response for ${lightId}:`, data);
                if (data.success) {
                    this.perLightState[lightId].on = newState;
                    this.updateStatus(`✅ Light "${lightName}" turned ${newState ? "On" : "Off"}.`);
                    this.setDirtyCanvas(true);
                } else {
                    throw new Error(data.error || "Failed to toggle state");
                }
            } catch (error) {
                console.error(`HueLightControlNode - Error toggling Light ID ${lightId}:`, error);
                this.updateStatus(`⚠️ Error toggling Light ${lightId}: ${error.message}`);
            }
        }

        async setLightColor(lightId, newHue, saturation, brightness, lightName) {
            try {
                const payload = {
                    hue: Math.round((newHue / 360) * 65535),
                    sat: Math.round((saturation / 100) * 254),
                    bri: Math.round(brightness)
                };
                const response = await fetch(`${this.BACKEND_URL}/api/lights/hue/${lightId}/state`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await response.json();
                if (data.success) {
                    this.perLightState[lightId] = { ...this.perLightState[lightId], hue: newHue, saturation, brightness, effect: null };
                    this.updateStatus(`✅ Light "${lightName}" color updated.`);
                    this.setDirtyCanvas(true);
                } else {
                    throw new Error(data.error || "Failed to set color");
                }
            } catch (error) {
                console.error(`HueLightControlNode - Error updating color for Light ID ${lightId}:`, error);
                this.updateStatus(`⚠️ Error updating color for Light ${lightId}: ${error.message}`);
            }
        }

        async setBrightness(lightId, newBrightness, lightName) {
            try {
                const payload = {
                    on: true,
                    hue: Math.round((this.perLightState[lightId].hue / 360) * 65535),
                    sat: Math.round((this.perLightState[lightId].saturation / 100) * 254),
                    bri: Math.max(1, Math.min(254, newBrightness))
                };
                const response = await fetch(`${this.BACKEND_URL}/api/lights/hue/${lightId}/state`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await response.json();
                if (data.success) {
                    this.perLightState[lightId].brightness = newBrightness;
                    this.perLightState[lightId].on = true;
                    this.updateStatus(`✅ Light "${lightName}" brightness set to ${Math.round((newBrightness / 254) * 100)}%.`);
                    this.setDirtyCanvas(true);
                } else {
                    throw new Error(data.error || "Failed to set brightness");
                }
            } catch (error) {
                console.error(`HueLightControlNode - Error setting brightness for Light ID ${lightId}:`, error);
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
            const extraHeight = 65;
            this.size[1] = baseHeight + widgetsHeight + totalLightHeight + extraHeight;
            this.setSize([this.size[0], this.size[1]]);
            this.widgets.forEach(widget => widget.options.width = widget.name === "Status" ? this.size[0] - 300 : widget.name === "Interval (ms)" ? 80 : widget.name === "Stagger" ? 60 : 40);
            this.setDirtyCanvas(true, true);
        }

        updateStatus(newStatus) {
            this.properties.status = newStatus;
            if (this.statusWidget) this.statusWidget.value = this.properties.status;
            this.setDirtyCanvas(true);
        }

        handleDeviceStateUpdate(data) {
            const lightId = String(data.id).replace('hue_', '');
            const index = this.properties.selectedLightIds.indexOf(lightId);
            if (index === -1) return;

            const networkState = data.on;
            this.perLightState[lightId] = {
                on: networkState ?? this.perLightState[lightId].on,
                hue: data.hue !== undefined ? (data.hue / 65535) * 360 : this.perLightState[lightId].hue,
                saturation: data.sat !== undefined ? (data.sat / 254) * 100 : this.perLightState[lightId].saturation,
                brightness: data.bri !== undefined ? data.bri : this.perLightState[lightId].brightness,
                energy: data.energy !== undefined ? data.energy : this.perLightState[lightId].energy,
                effect: data.effect || this.perLightState[lightId].effect
            };

            const lightName = this.properties.selectedLightNames[index];
            console.log(`HueLightControlNode - Network update for "${lightName}": on=${networkState}, energy=${this.perLightState[lightId].energy}`);
            this.updateStatus(`✅ Real-time update: "${lightName}" is ${networkState ? "On" : "Off"}`);
            this.setDirtyCanvas(true);

            const now = Date.now();
            const timeSinceLastToggle = now - this.lastToggleTimestamp;
            const RECENT_THRESHOLD = 10000; // Increased to 10 seconds
            if (this.intendedState !== null && networkState !== this.intendedState && timeSinceLastToggle < RECENT_THRESHOLD) {
                console.log(`HueLightControlNode - Network update (${networkState}) conflicts with intended state (${this.intendedState}), enforcing (recent toggle: ${timeSinceLastToggle}ms ago)`);
                this.handleTrigger(this.intendedState, true);
            } else if (timeSinceLastToggle >= RECENT_THRESHOLD) {
                console.log(`HueLightControlNode - Network update (${networkState}) differs from intended state (${this.intendedState}), but last toggle was too long ago (${timeSinceLastToggle}ms), not enforcing`);
            }
        }
    }

    LiteGraph.registerNodeType("Lighting/HueLightControlNode", HueLightControlNode);
    console.log("HueLightControlNode - Registered successfully under 'Lighting' category.");
    LiteGraph.HueLightControlNode = HueLightControlNode;
}