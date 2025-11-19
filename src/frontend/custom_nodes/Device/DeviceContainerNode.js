if (!LiteGraph.registered_node_types || !LiteGraph.registered_node_types["Devices/DeviceContainerNode"]) {
    class DeviceContainerNode extends LiteGraph.LGraphNode {
        constructor() {
            super();
            this.title = "Device Container"; // Override this in child classes
            this.resizable = true;
            this.autosize = false;
            this.bgcolor = "rgb(140, 90, 60)"; // Consistent visual style

            this.properties = {
                selectedDeviceIds: [],
                selectedDeviceNames: [],
                status: "No action yet"
            };

            this.API_URL = "http://localhost:3000"; // Base URL, override if needed

            this.deviceSelectors = [];
            this.setupWidgets();

            // Generic inputs/outputs (customize as needed)
            this.addInput("Trigger", "boolean");
            this.addOutput("Device Info", "device_info");

            this.devices = []; // List of available devices
            this.deviceManagerReady = false;

            this.perDeviceState = {}; // Store state for each device (e.g., { id: { on: false, ... } })

            console.log("DeviceContainerNode - Initialized.");

            // Bind methods
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

            this.initializeSocketIO();
        }

        setupWidgets() {
            try {
                const widgetWidth = this.size[0] - 20;
                this.addDeviceButton = this.addWidget("button", "Add Device", "Add", () => this.onAddDevice(), { width: widgetWidth });
                this.removeDeviceButton = this.addWidget("button", "Remove Device", "Remove", () => this.onRemoveDevice(), { width: widgetWidth });
                this.refreshDevicesButton = this.addWidget("button", "Refresh Devices", "Refresh", () => this.onRefreshDevices(), { width: widgetWidth });
                this.statusWidget = this.addWidget("text", "Status", this.properties.status, null, { property: "status", readonly: true, width: widgetWidth });
                console.log("DeviceContainerNode - Widgets set up.");
            } catch (error) {
                console.error("DeviceContainerNode - Error setting up widgets:", error);
                this.updateStatus(`Error setting up widgets: ${error.message}`);
            }
        }

        initializeSocketIO() {
            if (!this.socket) {
                console.log("DeviceContainerNode - Initializing Socket.IO...");
                this.socket = io(this.API_URL, {
                    reconnection: true,
                    reconnectionAttempts: 10,
                    reconnectionDelay: 1000,
                    reconnectionDelayMax: 5000,
                    timeout: 10000
                });

                this.socket.on('connect', () => {
                    console.log("DeviceContainerNode - Connected to Socket.IO server.");
                    this.updateStatus("Connected to server.");
                    this.fetchDevices(); // Refresh on connect
                });

                this.socket.on('connect_error', (err) => {
                    console.error("DeviceContainerNode - Connection error:", err.message);
                    this.updateStatus(`Connection error: ${err.message}`);
                });

                this.socket.on('disconnect', () => {
                    console.log("DeviceContainerNode - Disconnected from Socket.IO server.");
                    this.updateStatus("Disconnected from server.");
                });

                this.socket.on('device-state-update', (data) => this.handleDeviceStateUpdate(data));
            }
        }

        onAdded() {
            this.fetchDevices(); // Fetch devices immediately
        }

        async fetchDevices() {
            // Placeholder: Override this in child classes with specific API calls
            console.log("DeviceContainerNode - Fetching devices...");
            try {
                // Example: const response = await fetch(`${this.API_URL}/api/devices`);
                // Process response here (e.g., filter by device type)
                this.devices = []; // Replace with actual device list
                this.deviceManagerReady = true;
                console.log(`DeviceContainerNode - Retrieved ${this.devices.length} devices`);
                if (this.needsDeviceSelectorsRestore && this.properties.selectedDeviceIds.length > 0) {
                    this.restoreDeviceSelectors();
                } else {
                    this.updateStatus("Devices fetched successfully.");
                }
            } catch (error) {
                console.error("DeviceContainerNode - Error fetching devices:", error);
                this.updateStatus(`Error fetching devices: ${error.message}`);
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
                        `${deviceName} (ID: ${deviceId})`,
                        (value) => this.onDeviceSelected(value, index),
                        { values: ["Select Device", ...this.getDeviceOptions()], width: this.size[0] - 20 }
                    );
                    this.deviceSelectors.push(deviceSelector);
                    this.perDeviceState[deviceId] = this.perDeviceState[deviceId] || { on: false }; // Minimal default state
                }
            });
            this.updateNodeSize();
            this.needsDeviceSelectorsRestore = false;
            this.setDirtyCanvas(true);
            this.updateStatus("Device selectors restored.");
        }

        async onRefreshDevices() {
            await this.fetchDevices();
            this.updateStatus("Devices refreshed.");
        }

        getDeviceOptions() {
            return this.deviceManagerReady && this.devices.length
                ? this.devices.map(device => `${device.name} (ID: ${device.device_id})`)
                : ["No Devices Found"];
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
            this.updateStatus(`Added device selector ${this.deviceSelectors.length}.`);
        }

        onRemoveDevice() {
            if (this.deviceSelectors.length === 0) {
                this.updateStatus("No device selectors to remove.");
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
            this.updateStatus(`Removed device selector ${this.deviceSelectors.length + 1}.`);
        }

        updateNodeSize() {
            this.size[0] = 400;
            const baseHeight = 40;
            let widgetsHeight = 0;
            this.widgets.forEach(widget => {
                widgetsHeight += widget.computeSize ? widget.computeSize(this.size[0])[1] : LiteGraph.NODE_WIDGET_HEIGHT;
            });
            widgetsHeight += 15; // Padding
            const perDeviceIndicatorHeight = this.properties.selectedDeviceIds.length * 30;
            const extraHeight = 40; // Reserve space for future elements
            this.size[1] = baseHeight + widgetsHeight + perDeviceIndicatorHeight + extraHeight;
            this.setSize([this.size[0], this.size[1]]);
            this.widgets.forEach(widget => widget.options.width = this.size[0] - 20);
            this.setDirtyCanvas(true, true); // Full redraw
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

            const match = value.match(/\(ID:\s*(\w+)\)/); // Flexible ID format
            if (match && match[1]) {
                const deviceId = match[1];
                const deviceName = value.split(" (ID:")[0];

                if (this.properties.selectedDeviceIds.includes(deviceId)) {
                    this.updateStatus(`Device "${deviceName}" is already selected.`);
                    this.deviceSelectors[index].value = "Select Device";
                    this.properties.selectedDeviceIds[index] = null;
                    this.properties.selectedDeviceNames[index] = null;
                    return;
                }

                this.properties.selectedDeviceIds[index] = deviceId;
                this.properties.selectedDeviceNames[index] = deviceName;
                this.perDeviceState[deviceId] = this.perDeviceState[deviceId] || { on: false }; // Default state
                this.updateNodeSize();
                this.setDirtyCanvas(true);
                this.updateStatus(`Selected device "${deviceName}".`);
                // Add custom state fetching here if needed
            }
        }

        onExecute() {
            if (this.needsDeviceSelectorsRestore) this.fetchDevices();
            const triggerInput = this.getInputData(0);
            if (triggerInput !== undefined) {
                this.handleTrigger(triggerInput); // Placeholder for trigger logic
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
        }

        handleTrigger(trigger) {
            // Placeholder: Override in child classes for device-specific trigger logic
            this.updateStatus(`Trigger received: ${trigger ? "On" : "Off"}`);
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
            this.updateStatus(this.properties.status);
            this.updateNodeSize();
            this.setDirtyCanvas(true);
        }

        onRemoved() {
            if (this.socket) this.socket.disconnect();
        }

        onDrawForeground(ctx) {
            if (super.onDrawForeground) super.onDrawForeground(ctx);

            let widgetsHeight = 0;
            this.widgets.forEach(widget => {
                widgetsHeight += widget.computeSize ? widget.computeSize(this.size[0])[1] : LiteGraph.NODE_WIDGET_HEIGHT;
            });
            widgetsHeight += 15;

            const startY = widgetsHeight + 70;
            const spacing = 30;

            this.properties.selectedDeviceIds.forEach((deviceId, index) => {
                if (!deviceId) return;
                const deviceName = this.properties.selectedDeviceNames[index];
                const deviceState = this.perDeviceState[deviceId];
                if (!deviceState) return;

                const yPosition = startY + index * spacing;
                ctx.fillStyle = "#FFFFFF";
                ctx.font = "12px Arial";
                ctx.textAlign = "left";
                ctx.fillText(deviceName, 10, yPosition);

                const onOffX = this.size[0] - 70;
                ctx.fillStyle = deviceState.on ? "#00FF00" : "#FF0000";
                ctx.beginPath();
                ctx.arc(onOffX, yPosition - 5, 10, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = "#000000";
                ctx.lineWidth = 1;
                ctx.stroke();

                // Placeholder for additional visuals (e.g., color box) in child classes
            });
        }

        onMouseDown(event) {
            if (!this.graph || !this.graph.canvas) return;
            const mousePos = this.graph.canvas.getMousePos(event);
            const x = mousePos.x - this.pos[0];
            const y = mousePos.y - this.pos[1];

            let widgetsHeight = 0;
            this.widgets.forEach(widget => {
                widgetsHeight += widget.computeSize ? widget.computeSize(this.size[0])[1] : LiteGraph.NODE_WIDGET_HEIGHT;
            });
            widgetsHeight += 15;

            const startY = widgetsHeight + 70;
            const spacing = 30;

            this.properties.selectedDeviceIds.forEach((deviceId, index) => {
                if (!deviceId) return;
                const deviceName = this.properties.selectedDeviceNames[index];
                const deviceState = this.perDeviceState[deviceId];
                if (!deviceState) return;

                const yPosition = startY + index * spacing;
                const onOffX = this.size[0] - 70;
                const onOffY = yPosition - 5;
                if (Math.sqrt(Math.pow(x - onOffX, 2) + Math.pow(y - onOffY, 2)) <= 10) {
                    this.toggleDeviceState(deviceId, !deviceState.on, deviceName);
                    return;
                }
                // Add custom click areas (e.g., for color boxes) in child classes
            });
        }

        toggleDeviceState(deviceId, newState, deviceName) {
            // Placeholder: Override in child classes for device-specific toggle logic
            this.perDeviceState[deviceId].on = newState;
            this.updateStatus(`Device "${deviceName}" turned ${newState ? "On" : "Off"}.`);
            this.setDirtyCanvas(true);
        }

        updateStatus(newStatus) {
            this.properties.status = newStatus;
            if (this.statusWidget) this.statusWidget.value = this.properties.status;
            this.setDirtyCanvas(true);
        }

        handleDeviceStateUpdate(data) {
            // Placeholder: Override in child classes for real-time updates
            const deviceId = data.id;
            if (this.perDeviceState[deviceId]) {
                this.perDeviceState[deviceId].on = data.on ?? this.perDeviceState[deviceId].on;
                const deviceName = this.properties.selectedDeviceNames[this.properties.selectedDeviceIds.indexOf(deviceId)];
                this.updateStatus(`Real-time update: "${deviceName}" is ${data.on ? "On" : "Off"}`);
                this.setDirtyCanvas(true);
            }
        }
    }

    LiteGraph.registerNodeType("Devices/DeviceContainerNode", DeviceContainerNode);
    console.log("DeviceContainerNode - Registered successfully under 'Devices' category.");
    LiteGraph.DeviceContainerNode = DeviceContainerNode;
}