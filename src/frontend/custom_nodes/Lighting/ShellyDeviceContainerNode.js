if (!LiteGraph.registered_node_types || !LiteGraph.registered_node_types["Lighting/ShellyDeviceContainerNode"]) {
    class ShellyDeviceContainerNode extends LiteGraph.LGraphNode {
        constructor() {
            super();
            this.title = "Shelly Device Container";
            this.resizable = true;
            this.autosize = false;
            this.bgcolor = "rgb(60, 90, 140)";
            this.bgGradient = null;
            this.properties = {
                selectedDeviceIds: [],
                selectedDeviceNames: [],
                status: "No action yet",
                isCollapsed: false,
                staggerInterval: 100,
                useStagger: true,
                maxRetries: 3
            };
            this.BACKEND_URL = "http://localhost:3000";
            this.deviceSelectors = [];
            this.setupWidgets();
            this.addInput("Trigger", "boolean");
            this.addOutput("Device Info", "device_info");
            this.devices = [];
            this.deviceManagerReady = false;
            this.lastToggleInput = null;
            this.intendedState = null;
            this.boxcolor = "#000000";
            this.perDeviceState = {};
            this.currentStaggerIndex = -1;
            this.glowPulse = 0;
            this.lastUpdate = Date.now();
            this.requestQueue = [];
            this.isProcessingQueue = false;
            console.log("ShellyDeviceContainerNode - Initialized.");
            this.onAddDevice = this.onAddDevice.bind(this);
            this.onRemoveDevice = this.onRemoveDevice.bind(this);
            this.onDeviceSelected = this.onDeviceSelected.bind(this);
            this.fetchDevices = this.fetchDevices.bind(this);
            this.onRefreshDevices = this.onRefreshDevices.bind(this);
            this.onMouseDown = this.onMouseDown.bind(this);
            this.updateNodeSize = this.updateNodeSize.bind(this);
            this.updateStatus = this.updateStatus.bind(this);
            this.initializeSocketIO = this.initializeSocketIO.bind(this);
            this.handleDeviceStateUpdate = this.handleDeviceStateUpdate.bind(this);
            this.fetchDeviceState = this.fetchDeviceState.bind(this);
            this.handleTrigger = this.handleTrigger.bind(this);
            this.toggleDeviceState = this.toggleDeviceState.bind(this);
            this.toggleCollapse = this.toggleCollapse.bind(this);
            this.initializeSocketIO();
        }
        setupWidgets() {
            try {
                const widgetWidth = this.size[0] - 20;
                this.addDeviceButton = this.addWidget("button", "➕", "Add Device", () => this.onAddDevice(), { width: 40 });
                this.removeDeviceButton = this.addWidget("button", "➖", "Remove Device", () => this.onRemoveDevice(), { width: 40 });
                this.refreshDevicesButton = this.addWidget("button", "🔄", "Refresh Devices", () => this.onRefreshDevices(), { width: 40 });
                this.intervalWidget = this.addWidget("number", "Interval (ms)", this.properties.staggerInterval, (value) => {
                    this.properties.staggerInterval = Math.max(0, value);
                }, { min: 0, max: 1000, step: 10, width: 80 });
                this.staggerToggle = this.addWidget("toggle", "Stagger", this.properties.useStagger, (value) => {
                    this.properties.useStagger = value;
                }, { width: 60 });
                this.collapseButton = this.addWidget("button", "▼", "Collapse", () => this.toggleCollapse(), { width: 40 });
                this.statusWidget = this.addWidget("text", "Status", this.properties.status, null, { property: "status", readonly: true, width: widgetWidth - 300 });
                console.log("ShellyDeviceContainerNode - Widgets set up.");
            } catch (error) {
                console.error("ShellyDeviceContainerNode - Error setting up widgets:", error);
                this.updateStatus(`⚠️ Error setting up widgets: ${error.message}`);
            }
        }
        initializeSocketIO() {
            if (!this.socket) {
                console.log("ShellyDeviceContainerNode - Initializing Socket.IO...");
                this.socket = io(this.BACKEND_URL, {
                    reconnection: true,
                    reconnectionAttempts: 10,
                    reconnectionDelay: 1000,
                    reconnectionDelayMax: 5000,
                    timeout: 10000
                });
                this.socket.on('connect', () => {
                    console.log("ShellyDeviceContainerNode - Connected to Socket.IO server.");
                    this.updateStatus("✅ Connected to server.");
                    this.fetchDevices();
                });
                this.socket.on('connect_error', (err) => {
                    console.error("ShellyDeviceContainerNode - Connection error:", err.message);
                    this.updateStatus(`⚠️ Connection error: ${err.message}`);
                });
                this.socket.on('disconnect', () => {
                    console.log("ShellyDeviceContainerNode - Disconnected from Socket.IO server.");
                    this.updateStatus("⚠️ Disconnected from server.");
                });
                this.socket.on('device-state-update', (data) => this.handleDeviceStateUpdate(data));
            }
        }
        onAdded() {
            this.fetchDevices();
        }
        async fetchDevices() {
            console.log("ShellyDeviceContainerNode - Fetching Shelly devices...");
            try {
                this.updateStatus("🔍 Fetching Shelly devices...");
                const response = await fetch(`${this.BACKEND_URL}/api/lights/shelly`, { signal: AbortSignal.timeout(10000) });
                if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                const data = await response.json();
                console.log("ShellyDeviceContainerNode - Raw API response:", JSON.stringify(data, null, 2));
                if (data.success && data.devices) {
                    this.devices = data.devices.map(device => ({
                        device_id: String(device.id), // e.g., "shellyplus1-8813bfd054c4"
                        name: device.name
                    }));
                    this.deviceManagerReady = true;
                    console.log(`ShellyDeviceContainerNode - Retrieved ${this.devices.length} Shelly devices:`, this.devices);
                    if (this.needsDeviceSelectorsRestore && this.properties.selectedDeviceIds.length > 0) {
                        this.restoreDeviceSelectors();
                    } else {
                        this.updateStatus("✅ Devices fetched successfully.");
                    }
                } else {
                    this.devices = [];
                    this.updateStatus("⚠️ No Shelly devices found in response");
                }
            } catch (error) {
                console.error("ShellyDeviceContainerNode - Error fetching devices:", error);
                this.updateStatus(`⚠️ Error fetching devices: ${error.message}`);
            }
        }
        restoreDeviceSelectors() {
            this.deviceSelectors = [];
            this.properties.selectedDeviceIds.forEach((deviceId, index) => {
                const device = this.devices.find(d => d.device_id === deviceId);
                if (device) {
                    const deviceName = device.name;
                    const deviceSelector = this.addWidget(
                        "combo",
                        `Select Device ${index + 1}`,
                        deviceName,
                        (value) => this.onDeviceSelected(value, index),
                        { values: ["Select Device", ...this.getDeviceOptions()], width: this.size[0] - 20 }
                    );
                    this.deviceSelectors.push(deviceSelector);
                    this.perDeviceState[deviceId] = this.perDeviceState[deviceId] || { on: false };
                    this.fetchDeviceState(deviceId);
                }
            });
            this.updateNodeSize();
            this.needsDeviceSelectorsRestore = false;
            this.setDirtyCanvas(true);
            this.updateStatus("✅ Device selectors restored.");
        }
        async onRefreshDevices() {
            await this.fetchDevices();
            this.updateStatus("✅ Devices refreshed.");
        }
        getDeviceOptions() {
            return this.deviceManagerReady && this.devices.length
                ? this.devices.map(device => device.name)
                : ["No Devices Found"];
        }
        onAddDevice() {
            if (!this.deviceManagerReady) {
                this.updateStatus("⚠️ Device manager not ready.");
                return;
            }
            const MAX_DEVICES = 20;
            if (this.deviceSelectors.length >= MAX_DEVICES) {
                this.updateStatus(`⚠️ Maximum of ${MAX_DEVICES} devices reached.`);
                return;
            }
            const deviceSelector = this.addWidget(
                "combo",
                `Select Device ${this.deviceSelectors.length + 1}`,
                "Select Device",
                (value) => this.onDeviceSelected(value, this.deviceSelectors.indexOf(deviceSelector)),
                { values: ["Select Device", ...this.getDeviceOptions()], width: this.size[0] - 20 }
            );
            this.deviceSelectors.push(deviceSelector);
            this.properties.selectedDeviceIds.push(null);
            this.properties.selectedDeviceNames.push(null);
            this.updateNodeSize();
            this.setDirtyCanvas(true);
            this.updateStatus(`✅ Added device selector ${this.deviceSelectors.length}.`);
        }
        onRemoveDevice() {
            if (this.deviceSelectors.length === 0) {
                this.updateStatus("⚠️ No device selectors to remove.");
                return;
            }
            const deviceSelector = this.deviceSelectors.pop();
            const index = this.widgets.indexOf(deviceSelector);
            if (index > -1) this.widgets.splice(index, 1);
            const removedDeviceId = this.properties.selectedDeviceIds.pop();
            this.properties.selectedDeviceNames.pop();
            if (removedDeviceId && this.perDeviceState[removedDeviceId]) {
                delete this.perDeviceState[removedDeviceId];
            }
            this.updateNodeSize();
            this.setDirtyCanvas(true);
            this.updateStatus(`✅ Removed device selector ${this.deviceSelectors.length + 1}.`);
        }
        updateNodeSize() {
            this.size[0] = 400;
            const baseHeight = 40;
            let widgetsHeight = 0;
            this.widgets.forEach(widget => {
                if (!widget.name.startsWith("Select Device")) {
                    widgetsHeight += widget.computeSize ? widget.computeSize(this.size[0])[1] : LiteGraph.NODE_WIDGET_HEIGHT;
                }
            });
            widgetsHeight += 15;
            const totalDeviceHeight = this.properties.selectedDeviceIds.length * 50;
            const extraHeight = 45;
            this.size[1] = baseHeight + widgetsHeight + totalDeviceHeight + extraHeight;
            this.setSize([this.size[0], this.size[1]]);
            this.widgets.forEach(widget => widget.options.width = widget.name === "Status" ? this.size[0] - 300 : widget.name === "Interval (ms)" ? 80 : widget.name === "Stagger" ? 60 : 40);
            this.setDirtyCanvas(true, true);
        }
        onDeviceSelected(value, index) {
            if (value === "Select Device" || value === "No Devices Found") {
                const removedDeviceId = this.properties.selectedDeviceIds[index];
                if (removedDeviceId && this.perDeviceState[removedDeviceId]) {
                    delete this.perDeviceState[removedDeviceId];
                }
                this.properties.selectedDeviceIds[index] = null;
                this.properties.selectedDeviceNames[index] = null;
                this.updateStatus(`✅ Deselected device at selector ${index + 1}.`);
                this.updateNodeSize();
                this.setDirtyCanvas(true);
                return;
            }
            const device = this.devices.find(d => d.name === value);
            if (device) {
                const deviceId = device.device_id;
                const deviceName = device.name;
                if (this.properties.selectedDeviceIds.includes(deviceId)) {
                    this.updateStatus(`⚠️ Device "${deviceName}" is already selected.`);
                    this.deviceSelectors[index].value = "Select Device";
                    this.properties.selectedDeviceIds[index] = null;
                    this.properties.selectedDeviceNames[index] = null;
                    return;
                }
                this.properties.selectedDeviceIds[index] = deviceId;
                this.properties.selectedDeviceNames[index] = deviceName;
                this.perDeviceState[deviceId] = { on: false };
                this.fetchDeviceState(deviceId);
                this.updateNodeSize();
                this.setDirtyCanvas(true);
            } else {
                console.warn(`ShellyDeviceContainerNode - No device found for name: ${value}`);
                this.updateStatus(`⚠️ Device "${value}" not found in device list.`);
            }
        }
        async fetchDeviceState(deviceId) {
            try {
                const response = await fetch(`${this.BACKEND_URL}/api/lights/shelly/${encodeURIComponent(deviceId)}/state`, { signal: AbortSignal.timeout(5000) });
                const data = await response.json();
                if (data.success && data.state) {
                    const { on } = data.state;
                    this.perDeviceState[deviceId] = { on };
                    const deviceName = this.properties.selectedDeviceNames[this.properties.selectedDeviceIds.indexOf(deviceId)];
                    console.log(`ShellyDeviceContainerNode - Fetched state for "${deviceName}": on=${on}`);
                    this.updateStatus(`✅ Device "${deviceName}" is ${on ? "On" : "Off"}`);
                    this.setDirtyCanvas(true);
                } else {
                    throw new Error(data.error || "Failed to fetch device state");
                }
            } catch (error) {
                console.error(`ShellyDeviceContainerNode - Error fetching state for Device ID ${deviceId}:`, error);
                this.updateStatus(`⚠️ Error fetching Device ${deviceId}: ${error.message}`);
            }
        }
        async handleTrigger(trigger, force = false) {
            if (!this.properties.selectedDeviceIds.length) {
                this.updateStatus("⚠️ No devices selected. Cannot toggle state.");
                return;
            }
            if (!this.deviceManagerReady) {
                this.updateStatus("⚠️ Waiting for devices to initialize.");
                return;
            }
            const desiredState = Boolean(trigger);
            let needsUpdate = force;
            if (!force) {
                for (const deviceId of this.properties.selectedDeviceIds) {
                    if (!deviceId) continue;
                    const currentState = this.perDeviceState[deviceId]?.on;
                    if (currentState !== desiredState) {
                        needsUpdate = true;
                        break;
                    }
                }
            }
            if (!needsUpdate) {
                this.lastToggleInput = desiredState;
                return;
            }
            this.intendedState = desiredState;
            this.lastToggleInput = desiredState;
            this.properties.selectedDeviceIds.forEach(deviceId => {
                if (deviceId) {
                    this.perDeviceState[deviceId] = this.perDeviceState[deviceId] || {};
                    this.perDeviceState[deviceId].on = desiredState;
                }
            });
            this.setDirtyCanvas(true);
            this.requestQueue = [{ desiredState, timestamp: Date.now() }];
            if (!this.isProcessingQueue) {
                console.log("ShellyDeviceContainerNode - Processing queue for state change");
                this.processQueue();
            }
        }
        async processQueue() {
            if (this.isProcessingQueue || this.requestQueue.length === 0) return;
            this.isProcessingQueue = true;
            const { desiredState } = this.requestQueue[0];
            this.updateStatus(`✅ Setting devices to ${desiredState ? "On" : "Off"} ${this.properties.useStagger ? `with ${this.properties.staggerInterval}ms stagger` : "immediately"}.`);
            const payload = { on: desiredState };
            const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
            const THROTTLE_DELAY = 200;
            for (let i = 0; i < this.properties.selectedDeviceIds.length; i++) {
                const deviceId = this.properties.selectedDeviceIds[i];
                if (!deviceId) continue;
                await this.fetchDeviceState(deviceId);
                if (this.perDeviceState[deviceId].on === desiredState) continue;
                this.currentStaggerIndex = i;
                this.setDirtyCanvas(true);
                const staggerDelay = this.properties.useStagger ? i * this.properties.staggerInterval : 0;
                await delay(staggerDelay + (i * THROTTLE_DELAY));
                let success = false;
                for (let attempt = 0; attempt < this.properties.maxRetries; attempt++) {
                    try {
                        const response = await fetch(`${this.BACKEND_URL}/api/lights/shelly/${encodeURIComponent(deviceId)}/state`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload),
                            signal: AbortSignal.timeout(5000)
                        });
                        const data = await response.json();
                        if (data.success) {
                            this.perDeviceState[deviceId].on = desiredState;
                            success = true;
                            break;
                        } else {
                            throw new Error(data.error || "Failed to toggle state");
                        }
                    } catch (error) {
                        console.error(`ShellyDeviceContainerNode - Attempt ${attempt + 1} failed for Device ID ${deviceId}:`, error);
                        if (attempt === this.properties.maxRetries - 1) {
                            this.updateStatus(`⚠️ Error toggling Device ${deviceId}: ${error.message}`);
                        } else {
                            await delay(500);
                        }
                    }
                }
                if (success) {
                    const deviceName = this.properties.selectedDeviceNames[i];
                    this.updateStatus(`✅ Device "${deviceName}" turned ${desiredState ? "On" : "Off"} (Step ${i + 1}).`);
                    this.setDirtyCanvas(true);
                }
            }
            this.currentStaggerIndex = -1;
            this.isProcessingQueue = false;
            this.requestQueue.shift();
            if (this.requestQueue.length > 0) {
                this.processQueue();
            }
        }
        onExecute() {
            if (this.needsDeviceSelectorsRestore) this.fetchDevices();
            const triggerInput = this.getInputData(0);
            if (triggerInput !== undefined) {
                this.handleTrigger(triggerInput);
            }
            const deviceData = {
                devices: this.properties.selectedDeviceIds
                    .filter(id => id)
                    .map(id => ({
                        device_id: id,
                        name: this.properties.selectedDeviceNames[this.properties.selectedDeviceIds.indexOf(id)],
                        status: this.perDeviceState[id]?.on ? "On" : "Off"
                    })),
                status: this.properties.status
            };
            this.setOutputData(0, deviceData);
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
            data.boxcolor = this.boxcolor;
            data.perDeviceState = this.perDeviceState;
            return data;
        }
        async configure(data) {
            super.configure(data);
            this.properties = { ...data.properties } || this.properties;
            this.properties.staggerInterval = typeof this.properties.staggerInterval === 'number' ? this.properties.staggerInterval : 100;
            this.properties.useStagger = typeof this.properties.useStagger === 'boolean' ? this.properties.useStagger : true;
            this.properties.maxRetries = typeof this.properties.maxRetries === 'number' ? this.properties.maxRetries : 3;
            this.lastToggleInput = data.lastToggleInput ?? null;
            this.intendedState = data.intendedState ?? null;
            this.perDeviceState = data.perDeviceState || {};
            this.boxcolor = data.boxcolor || "#000000";
            this.needsDeviceSelectorsRestore = true;
            this.updateStatus(this.properties.status);
            this.intervalWidget.value = this.properties.staggerInterval;
            this.staggerToggle.value = this.properties.useStagger;
            this.updateNodeSize();
            this.setDirtyCanvas(true);
            if (this.properties.selectedDeviceIds.length > 0) {
                await this.fetchDevices();
                await Promise.all(
                    this.properties.selectedDeviceIds
                        .filter(id => id)
                        .map(id => this.fetchDeviceState(id))
                );
                const triggerInput = this.getInputData(0);
                if (triggerInput !== undefined) {
                    const needsSync = this.properties.selectedDeviceIds.some(
                        deviceId => deviceId && this.perDeviceState[deviceId]?.on !== triggerInput
                    );
                    if (needsSync) {
                        this.handleTrigger(triggerInput, true);
                    }
                }
            }
        }
        onRemoved() {
            if (this.socket) this.socket.disconnect();
        }
        onDrawBackground(ctx) {
            if (super.onDrawBackground) super.onDrawBackground(ctx);
            if (!this.bgGradient) {
                this.bgGradient = ctx.createLinearGradient(0, 0, 0, this.size[1]);
                this.bgGradient.addColorStop(0, "rgba(60, 90, 140, 0.9)");
                this.bgGradient.addColorStop(1, "rgba(40, 60, 100, 0.8)");
            }
            ctx.fillStyle = this.bgGradient;
            ctx.fillRect(0, 0, this.size[0], this.size[1]);
        }
        onDrawForeground(ctx) {
            if (super.onDrawForeground) super.onDrawForeground(ctx);
            let widgetsHeight = 0;
            this.widgets.forEach(widget => {
                if (!widget.name.startsWith("Select Device")) {
                    widgetsHeight += widget.computeSize ? widget.computeSize(this.size[0])[1] : LiteGraph.NODE_WIDGET_HEIGHT;
                }
            });
            widgetsHeight += 15;
            const selectorHeight = this.deviceSelectors.length * 25;
            const overlayStartY = widgetsHeight + selectorHeight + 75;
            const spacing = 25;
            if (!this.properties.isCollapsed) {
                this.properties.selectedDeviceIds.forEach((deviceId, index) => {
                    if (!deviceId) return;
                    const deviceName = this.properties.selectedDeviceNames[index];
                    const deviceState = this.perDeviceState[deviceId];
                    if (!deviceState) return;
                    const yPosition = overlayStartY + index * spacing;
                    if (this.currentStaggerIndex === index) {
                        ctx.fillStyle = "rgba(255, 255, 0, 0.3)";
                        ctx.fillRect(0, yPosition - 15, this.size[0], 25);
                    }
                    ctx.fillStyle = "#E0E0E0";
                    ctx.font = "14px Roboto, Arial, sans-serif";
                    ctx.textAlign = "left";
                    if (deviceState.on) {
                        ctx.shadowColor = "rgba(0, 255, 0, 0.2)";
                        ctx.shadowBlur = 3 + this.glowPulse;
                    }
                    ctx.fillText(deviceName, 10, yPosition);
                    ctx.shadowBlur = 0;
                    const onOffX = this.size[0] - 100;
                    ctx.fillStyle = deviceState.on ? "#00FF00" : "#FF0000";
                    if (deviceState.on) {
                        ctx.shadowColor = "rgba(0, 255, 0, 0.2)";
                        ctx.shadowBlur = 3 + this.glowPulse;
                    }
                    ctx.beginPath();
                    ctx.arc(onOffX, yPosition - 5, 10, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = "#FFFFFF";
                    ctx.lineWidth = 1;
                    ctx.stroke();
                    ctx.shadowBlur = 0;
                });
            }
            ctx.fillStyle = "#0000FF";
            ctx.fillRect(0, this.size[1] - 5, this.size[0], 5);
        }
        onMouseDown(event) {
            if (!this.graph || !this.graph.canvas) return;
            const mousePos = this.graph.canvas.getMousePos(event);
            const x = mousePos.x - this.pos[0];
            const y = mousePos.y - this.pos[1];
            let widgetsHeight = 0;
            this.widgets.forEach(widget => {
                if (!widget.name.startsWith("Select Device")) {
                    widgetsHeight += widget.computeSize ? widget.computeSize(this.size[0])[1] : LiteGraph.NODE_WIDGET_HEIGHT;
                }
            });
            widgetsHeight += 15;
            const selectorHeight = this.deviceSelectors.length * 25;
            const overlayStartY = widgetsHeight + selectorHeight + 10;
            const spacing = 25;
            if (!this.properties.isCollapsed) {
                this.properties.selectedDeviceIds.forEach((deviceId, index) => {
                    if (!deviceId) return;
                    const deviceName = this.properties.selectedDeviceNames[index];
                    const deviceState = this.perDeviceState[deviceId];
                    if (!deviceState) return;
                    const yPosition = overlayStartY + index * spacing;
                    const onOffX = this.size[0] - 100;
                    const onOffY = yPosition - 5;
                    const onOffHit = Math.sqrt(Math.pow(x - onOffX, 2) + Math.pow(y - onOffY, 2)) <= 10;
                    if (onOffHit) {
                        this.toggleDeviceState(deviceId, !deviceState.on, deviceName);
                        return;
                    }
                });
            }
        }
        async toggleDeviceState(deviceId, newState, deviceName) {
            try {
                const payload = { on: newState };
                const response = await fetch(`${this.BACKEND_URL}/api/lights/shelly/${encodeURIComponent(deviceId)}/state`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    signal: AbortSignal.timeout(5000)
                });
                const data = await response.json();
                if (data.success) {
                    this.perDeviceState[deviceId].on = newState;
                    this.updateStatus(`✅ Device "${deviceName}" turned ${newState ? "On" : "Off"}.`);
                    this.setDirtyCanvas(true);
                } else {
                    throw new Error(data.error || "Failed to toggle state");
                }
            } catch (error) {
                console.error(`ShellyDeviceContainerNode - Error toggling Device ID ${deviceId}:`, error);
                this.updateStatus(`⚠️ Error toggling Device ${deviceId}: ${error.message}`);
            }
        }
        updateStatus(newStatus) {
            this.properties.status = newStatus;
            if (this.statusWidget) this.statusWidget.value = this.properties.status;
            this.setDirtyCanvas(true);
        }
        handleDeviceStateUpdate(data) {
            const deviceId = String(data.id);
            const index = this.properties.selectedDeviceIds.indexOf(deviceId);
            if (index === -1) {
                return;
            }
            const networkState = data.on;
            this.perDeviceState[deviceId] = { on: networkState ?? this.perDeviceState[deviceId].on };
            const deviceName = this.properties.selectedDeviceNames[index];
            console.log(`ShellyDeviceContainerNode - Received state update for "${deviceName}": ${networkState ? "On" : "Off"}`);
            this.updateStatus(`✅ Real-time update: "${deviceName}" is ${networkState ? "On" : "Off"}`);
            this.setDirtyCanvas(true);
            if (this.intendedState !== null && networkState !== this.intendedState) {
                console.log(`ShellyDeviceContainerNode - Network update (${networkState}) conflicts with intended state (${this.intendedState}), enforcing`);
                this.handleTrigger(this.intendedState, true);
            }
        }
        toggleCollapse() {
            this.properties.isCollapsed = !this.properties.isCollapsed;
            this.collapseButton.value = this.properties.isCollapsed ? "▶" : "▼";
            this.updateNodeSize();
            this.setDirtyCanvas(true);
        }
    }
    LiteGraph.registerNodeType("Lighting/ShellyDeviceNode", ShellyDeviceContainerNode);
    console.log("ShellyDeviceContainerNode - Registered successfully under 'Lighting' category.");
    LiteGraph.ShellyDeviceContainerNode = ShellyDeviceContainerNode;
}