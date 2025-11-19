if (!LiteGraph.registered_node_types || !LiteGraph.registered_node_types["Devices/ShellyDeviceContainerNode"]) {
    class ShellyDeviceContainerNode extends LiteGraph.LGraphNode {
        constructor() {
            super();
            this.title = "Shelly Device Container";
            this.API_URL = "http://localhost:3000";
            this.bgcolor = "rgb(80, 120, 80)";
            this.properties = {
                selectedDeviceIds: [],
                selectedDeviceNames: [],
                status: "Select a device from the dropdown"
            };
            this.devices = [];
            this.deviceManagerReady = false;
            this.deviceSelectors = [];
            this.perDeviceState = {};
            this.needsDeviceSelectorsRestore = false;
            this.setupWidgets();
            this.initializeSocketIO();
            this.fetchDevices();
        }
        setupWidgets() {
            try {
                const widgetWidth = this.size[0] - 20;
                this.addDeviceButton = this.addWidget("button", "Add Device", "Add", () => this.onAddDevice(), { width: widgetWidth });
                this.removeDeviceButton = this.addWidget("button", "Remove Device", "Remove", () => this.onRemoveDevice(), { width: widgetWidth });
                this.refreshDevicesButton = this.addWidget("button", "Refresh Devices", "Refresh", () => this.onRefreshDevices(), { width: widgetWidth });
                this.statusWidget = this.addWidget("text", "Status", this.properties.status, null, { property: "status", readonly: true, width: widgetWidth });
                console.log("ShellyDeviceContainerNode - Widgets set up.");
            } catch (error) {
                console.error("ShellyDeviceContainerNode - Error setting up widgets:", error);
                this.updateStatus(`Error setting up widgets: ${error.message}`);
            }
        }
        initializeSocketIO() {
            if (!this.socket) {
                console.log("ShellyDeviceContainerNode - Initializing Socket.IO...");
                this.socket = io(this.API_URL, {
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
        async fetchDevices() {
            console.log("ShellyDeviceContainerNode - Fetching Shelly devices...");
            try {
                this.updateStatus("🔍 Fetching Shelly devices...");
                const response = await fetch(`${this.API_URL}/api/lights/shelly`, { signal: AbortSignal.timeout(10000) });
                if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                const data = await response.json();
                console.log("ShellyDeviceContainerNode - Raw API response:", JSON.stringify(data, null, 2));
                if (data.success && data.devices) {
                    this.devices = data.devices.map(device => ({
                        device_id: device.id,
                        name: device.name,
                        ip: device.ip,
                        state: device.state
                    }));
                    this.deviceManagerReady = true;
                    console.log(`ShellyDeviceContainerNode - Retrieved ${this.devices.length} Shelly devices:`, this.devices);
                    if (this.needsDeviceSelectorsRestore && this.properties.selectedDeviceIds.length > 0) {
                        this.restoreDeviceSelectors();
                    } else {
                        this.updateStatus(`Found ${this.devices.length} Shelly devices - Select one to control`);
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
        onAddDevice() {
            if (!this.deviceManagerReady) {
                this.updateStatus("Device manager not ready.");
                return;
            }
            const MAX_DEVICES = 20;
            if (this.deviceSelectors.length >= MAX_DEVICES) {
                this.updateStatus(`Maximum of ${MAX_DEVICES} devices reached.`);
                return;
            }
            const index = this.deviceSelectors.length;
            const deviceSelector = this.addWidget(
                "combo",
                `Select Device ${index + 1}`,
                "Select Device",
                (value) => this.onDeviceSelected(value, index),
                { values: ["Select Device", ...this.getDeviceOptions()], width: this.size[0] - 20 }
            );
            const toggleButton = this.addWidget(
                "button",
                `Toggle Device ${index + 1}`,
                "Toggle",
                () => {
                    console.log("ShellyDeviceContainerNode - Toggle button clicked for index", index);
                    this.toggleDeviceStateByIndex(index);
                },
                { width: this.size[0] - 20 }
            );
            this.deviceSelectors.push({ selector: deviceSelector, toggle: toggleButton });
            this.properties.selectedDeviceIds.push(null);
            this.properties.selectedDeviceNames.push(null);
            this.updateNodeSize();
            this.setDirtyCanvas(true);
            this.updateStatus(`Added device selector ${this.deviceSelectors.length}. Select a device to toggle.`);
        }
        onRemoveDevice() {
            if (this.deviceSelectors.length === 0) {
                this.updateStatus("No device selectors to remove.");
                return;
            }
            const lastDevice = this.deviceSelectors.pop();
            this.widgets = this.widgets.filter(w => w !== lastDevice.selector && w !== lastDevice.toggle);
            const removedDeviceId = this.properties.selectedDeviceIds.pop();
            this.properties.selectedDeviceNames.pop();
            if (removedDeviceId && this.perDeviceState[removedDeviceId]) {
                delete this.perDeviceState[removedDeviceId];
            }
            this.updateNodeSize();
            this.setDirtyCanvas(true);
            this.updateStatus(`Removed device selector ${this.deviceSelectors.length + 1}.`);
        }
        getDeviceOptions() {
            return this.deviceManagerReady && this.devices.length
                ? this.devices.map(device => device.name)
                : ["No Devices Found"];
        }
        onDeviceSelected(value, index) {
            if (value === "Select Device" || value === "No Devices Found") {
                const removedDeviceId = this.properties.selectedDeviceIds[index];
                if (removedDeviceId && this.perDeviceState[removedDeviceId]) {
                    delete this.perDeviceState[removedDeviceId];
                }
                this.properties.selectedDeviceIds[index] = null;
                this.properties.selectedDeviceNames[index] = null;
                this.updateStatus(`Deselected device at selector ${index + 1}.`);
                this.updateNodeSize();
                this.setDirtyCanvas(true);
                return;
            }
            const device = this.devices.find(d => d.name === value);
            if (device) {
                const deviceId = device.device_id;
                const deviceName = device.name;
                if (this.properties.selectedDeviceIds.includes(deviceId)) {
                    this.updateStatus(`Device "${deviceName}" is already selected.`);
                    this.deviceSelectors[index].selector.value = "Select Device";
                    this.properties.selectedDeviceIds[index] = null;
                    this.properties.selectedDeviceNames[index] = null;
                    return;
                }
                this.properties.selectedDeviceIds[index] = deviceId;
                this.properties.selectedDeviceNames[index] = deviceName;
                this.perDeviceState[deviceId] = this.perDeviceState[deviceId] || { on: device.state.on || false };
                console.log("ShellyDeviceContainerNode - Selected device:", { index, deviceId, deviceName });
                this.updateNodeSize();
                this.setDirtyCanvas(true);
                this.updateStatus(`Selected device "${deviceName}" at position ${index + 1}. Ready to toggle.`);
            } else {
                console.warn(`ShellyDeviceContainerNode - No device found for name: ${value}`);
                this.updateStatus(`⚠️ Device "${value}" not found in device list.`);
            }
        }
        toggleDeviceStateByIndex(index) {
            const deviceId = this.properties.selectedDeviceIds[index];
            if (!deviceId) {
                console.log("ShellyDeviceContainerNode - No device selected at index", index);
                this.updateStatus(`No device selected at position ${index + 1}. Please select a device from the dropdown.`);
                return;
            }
            const deviceName = this.properties.selectedDeviceNames[index];
            const currentState = this.perDeviceState[deviceId]?.on || false;
            console.log("ShellyDeviceContainerNode - Triggering toggle for", deviceId, "from", currentState, "to", !currentState);
            this.toggleDeviceState(deviceId, !currentState, deviceName);
        }
        async toggleDeviceState(deviceId, newState, deviceName) {
            try {
                console.log(`ShellyDeviceContainerNode - Toggling ${deviceId} to ${newState}`);
                const endpoint = newState ? 'state' : 'off';
                const payload = newState ? { on: true } : {};
                const response = await fetch(`${this.API_URL}/api/lights/shelly/${encodeURIComponent(deviceId)}/${endpoint}`, {
                    method: endpoint === 'state' ? 'PUT' : 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    signal: AbortSignal.timeout(5000)
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                const data = await response.json();
                if (data.success) {
                    this.perDeviceState[deviceId].on = newState;
                    this.updateStatus(`✅ Device "${deviceName}" turned ${newState ? "On" : "Off"}`);
                    this.setDirtyCanvas(true);
                } else {
                    throw new Error(data.error || "Failed to toggle device");
                }
            } catch (error) {
                console.error("ShellyDeviceContainerNode - Toggle error:", error);
                this.updateStatus(`⚠️ Toggle failed for "${deviceName}": ${error.message}`);
            }
        }
        handleDeviceStateUpdate(data) {
            const deviceId = data.id;
            if (this.perDeviceState[deviceId]) {
                this.perDeviceState[deviceId].on = data.on ?? this.perDeviceState[deviceId].on;
                const deviceName = this.properties.selectedDeviceNames[this.properties.selectedDeviceIds.indexOf(deviceId)];
                console.log(`ShellyDeviceContainerNode - Received state update for ${deviceId}: ${data.on ? "On" : "Off"}`);
                this.updateStatus(`✅ Real-time update: "${deviceName}" is ${data.on ? "On" : "Off"}`);
                this.setDirtyCanvas(true);
            } else {
                console.log(`ShellyDeviceContainerNode - State update for ${deviceId} ignored (not selected)`);
            }
        }
        async onRefreshDevices() {
            await this.fetchDevices();
            this.updateStatus("✅ Devices refreshed.");
        }
        updateNodeSize() {
            this.size[0] = 300;
            const baseHeight = 40;
            let widgetsHeight = 0;
            this.widgets.forEach(widget => {
                if (!widget.name.startsWith("Select Device") && !widget.name.startsWith("Toggle Device")) {
                    widgetsHeight += widget.computeSize ? widget.computeSize(this.size[0])[1] : LiteGraph.NODE_WIDGET_HEIGHT;
                }
            });
            widgetsHeight += 15;
            const selectorHeight = this.deviceSelectors.length * 50;
            const extraHeight = 45;
            this.size[1] = baseHeight + widgetsHeight + selectorHeight + extraHeight;
            this.setSize([this.size[0], this.size[1]]);
            this.widgets.forEach(widget => widget.options.width = widget.name === "Status" ? this.size[0] - 20 : this.size[0] - 20);
            this.setDirtyCanvas(true, true);
        }
        updateStatus(message) {
            this.properties.status = message || "Select a device from the dropdown";
            if (this.statusWidget) this.statusWidget.value = this.properties.status;
            this.setDirtyCanvas(true);
        }
        onExecute() {
            if (!this.deviceManagerReady) {
                this.fetchDevices();
            }
            if (this.needsDeviceSelectorsRestore) {
                this.restoreDeviceSelectors();
            }
        }
        restoreDeviceSelectors() {
            this.deviceSelectors = [];
            this.properties.selectedDeviceIds.forEach((deviceId, index) => {
                if (!deviceId) return;
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
                    const toggleButton = this.addWidget(
                        "button",
                        `Toggle Device ${index + 1}`,
                        "Toggle",
                        () => this.toggleDeviceStateByIndex(index),
                        { width: this.size[0] - 20 }
                    );
                    this.deviceSelectors.push({ selector: deviceSelector, toggle: toggleButton });
                    this.perDeviceState[deviceId] = this.perDeviceState[deviceId] || { on: device.state.on || false };
                }
            });
            this.updateNodeSize();
            this.needsDeviceSelectorsRestore = false;
            this.setDirtyCanvas(true);
            console.log("[ShellyDeviceContainerNode] Restored device selectors:", this.properties.selectedDeviceIds);
        }
        serialize() {
            const data = super.serialize();
            data.properties = this.properties;
            data.perDeviceState = this.perDeviceState;
            return data;
        }
        configure(data) {
            super.configure(data);
            this.properties = data.properties || this.properties;
            this.perDeviceState = data.perDeviceState || {};
            this.needsDeviceSelectorsRestore = true;
            this.widgets = [];
            this.deviceSelectors = [];
            this.setupWidgets();
            if (!this.deviceManagerReady || this.devices.length === 0) {
                this.fetchDevices().then(() => {
                    this.restoreDeviceSelectors();
                    this.updateNodeSize();
                    this.setDirtyCanvas(true);
                });
            } else {
                this.restoreDeviceSelectors();
                this.updateNodeSize();
                this.setDirtyCanvas(true);
            }
            this.updateStatus(this.properties.status);
        }
        onRemoved() {
            if (this.socket) {
                this.socket.disconnect();
                console.log("ShellyDeviceContainerNode - Disconnected from Socket.IO server.");
            }
        }
    }
    LiteGraph.registerNodeType("Devices/ShellyDeviceContainerNode", ShellyDeviceContainerNode);
    console.log("ShellyDeviceContainerNode - Registered successfully under 'Devices' category'");
}