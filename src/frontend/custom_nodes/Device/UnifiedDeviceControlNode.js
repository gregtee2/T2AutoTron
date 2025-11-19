// Ensure LiteGraph and Socket.IO are available
if (typeof LiteGraph === 'undefined') {
    console.error("LiteGraph not found. Ensure litegraph.js is included.");
} else if (typeof io === 'undefined') {
    console.warn("Socket.IO client not found. Node will attempt to function without real-time updates.");
}

// UnifiedDeviceControlNode definition
class UnifiedDeviceControlNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Unified Device Control";
        this.resizable = true;
        this.autosize = false;
        this.bgcolor = "rgb(140, 90, 60)"; // Match HueLightControlNode
        this.bgGradient = null;

        this.properties = {
            selectedDeviceIds: [],
            selectedDeviceNames: [],
            status: "No action yet",
            applyMode: "all", // "all" or "selective"
            maxRetries: 3,
            debounceDelay: 300
        };

        this.BACKEND_URL = "http://localhost:3000"; // Matches HueLightControlNode

        this.deviceSelectors = [];
        this.devices = [];
        this.deviceStates = {};
        this.deviceManagerReady = false;
        this.boxcolor = "#000000"; // For color swatch
        this.lastUpdate = Date.now();
        this.debounceTimer = null;
        this.pendingStateFetches = new Map();
        this.lastDeviceStates = new Map(); // Added to fix TypeError
        this.isRestoringSelectors = false; // Added to prevent undefined error
        this.debounceRedrawTimer = null; // Added to prevent undefined error

        this.addInput("HSV Info", "hsv_info"); // Unified HSV input
        this.addInput("Trigger", "boolean"); // Matches HueLightControlNode
        this.addOutput("Status", "object");
        this.addOutput("Device IDs", "array");

        this.initializeSocketIO();
        this.setupWidgets();

        console.log("UnifiedDeviceControlNode - Initialized.");

        // Bind methods
        this.fetchDevices = this.fetchDevices.bind(this);
        this.onAddDevice = this.onAddDevice.bind(this);
        this.onRemoveDevice = this.onRemoveDevice.bind(this);
        this.onDeviceSelected = this.onDeviceSelected.bind(this);
        this.onRefreshDevices = this.onRefreshDevices.bind(this);
        this.updateStatus = this.updateStatus.bind(this);
        this.initializeSocketIO = this.initializeSocketIO.bind(this);
        this.handleDeviceStateUpdate = this.handleDeviceStateUpdate.bind(this);
        this.handleHSVInput = this.handleHSVInput.bind(this);
        this.handleTrigger = this.handleTrigger.bind(this);
        this.fetchDeviceState = this.fetchDeviceState.bind(this);
        this.updateNodeSize = this.updateNodeSize.bind(this);
        this.updateColorSwatch = this.updateColorSwatch.bind(this);
    }

    setupWidgets() {
        try {
            const widgetWidth = this.size[0] - 20;
            this.addDeviceButton = this.addWidget("button", "➕", "Add Device", () => this.onAddDevice(), { width: 40 });
            this.removeDeviceButton = this.addWidget("button", "➖", "Remove Device", () => this.onRemoveDevice(), { width: 40 });
            this.refreshDevicesButton = this.addWidget("button", "🔄", "Refresh Devices", () => this.onRefreshDevices(), { width: 40 });
            this.applyModeToggle = this.addWidget(
                "toggle",
                "Apply Mode",
                this.properties.applyMode === "all",
                (value) => {
                    this.properties.applyMode = value ? "all" : "selective";
                    this.updateStatus(`Apply mode set to: ${this.properties.applyMode}`);
                },
                { width: 80, on: "All", off: "Selective" }
            );
            this.statusWidget = this.addWidget(
                "text",
                "Status",
                this.properties.status,
                null,
                { property: "status", readonly: true, width: widgetWidth - 200 }
            );
            console.log("UnifiedDeviceControlNode - Widgets set up.");
        } catch (error) {
            console.error("UnifiedDeviceControlNode - Error setting up widgets:", error);
            this.updateStatus(`⚠️ Error setting up widgets: ${error.message}`);
        }
    }

    initializeSocketIO() {
        if (typeof io === 'undefined') {
            console.error("UnifiedDeviceControlNode - Socket.IO client (io) not found.");
            this.updateStatus("⚠️ Socket.IO not loaded.");
            return;
        }
        if (!this.socket) {
            console.log("UnifiedDeviceControlNode - Initializing Socket.IO...");
            this.socket = io(this.BACKEND_URL, {
                reconnection: true,
                reconnectionAttempts: 10,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
                timeout: 10000
            });

            this.socket.on('connect', () => {
                console.log("UnifiedDeviceControlNode - Connected to Socket.IO server.");
                this.updateStatus("✅ Connected to server.");
                this.fetchDevices();
            });

            this.socket.on('connect_error', (err) => {
                console.error("UnifiedDeviceControlNode - Connection error:", err.message);
                this.updateStatus(`⚠️ Connection error: ${err.message}`);
            });

            this.socket.on('disconnect', () => {
                console.log("UnifiedDeviceControlNode - Disconnected from Socket.IO server.");
                this.updateStatus("⚠️ Disconnected from server.");
            });

            this.socket.on('device-state-update', (data) => this.handleDeviceStateUpdate(data));

            this.socket.on('device-list-update', (data) => {
                console.log("UnifiedDeviceControlNode - Received device-list-update:", data);
                this.devices = [
                    ...data.hue.map(d => ({ id: d.id, name: d.name, vendor: d.vendor, capabilities: d.capabilities })),
                    ...data.kasa.map(d => ({ id: d.id, name: d.name, vendor: d.vendor, capabilities: d.capabilities })),
                    ...data.shelly.map(d => ({ id: d.id, name: d.name, vendor: d.vendor, capabilities: d.capabilities })),
                    ...data.ha.map(d => ({ id: d.id, name: d.name, vendor: d.vendor, capabilities: d.capabilities }))
                ];
                this.deviceManagerReady = true;
                this.updateStatus("✅ Device list updated.");
                // Only restore selectors if not already restoring and no state fetches are pending
                if (!this.isRestoringSelectors && this.pendingStateFetches.size === 0) {
                    this.isRestoringSelectors = true;
                    this.restoreDeviceSelectors();
                    this.isRestoringSelectors = false;
                }
                // Retry state fetches for unavailable devices, but only if not already in progress
                this.properties.selectedDeviceIds.forEach(deviceId => {
                    if (deviceId && this.deviceStates[deviceId]?.available === false && !this.pendingStateFetches.has(deviceId)) {
                        this.fetchDeviceState(deviceId);
                    }
                });
            });
        }
    }

    onAdded() {
        this.fetchDevices();
    }

    async fetchDevices() {
        console.log("UnifiedDeviceControlNode - Fetching devices...");
        try {
            const response = await fetch(`${this.BACKEND_URL}/api/devices`);
            if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            const data = await response.json();
            if (data.success && data.devices) {
                this.devices = [
                    ...data.devices.hue.map(d => ({ id: d.id, name: d.name, vendor: d.vendor, capabilities: d.capabilities })),
                    ...data.devices.kasa.map(d => ({ id: d.id, name: d.name, vendor: d.vendor, capabilities: d.capabilities })),
                    ...data.devices.shelly.map(d => ({ id: d.id, name: d.name, vendor: d.vendor, capabilities: d.capabilities })),
                    ...data.devices.ha.map(d => ({ id: d.id, name: d.name, vendor: d.vendor, capabilities: d.capabilities }))
                ];
                this.deviceManagerReady = true;
                console.log(`UnifiedDeviceControlNode - Retrieved ${this.devices.length} devices`);
                if (this.needsDeviceSelectorsRestore && this.properties.selectedDeviceIds.length > 0) {
                    this.restoreDeviceSelectors();
                } else {
                    this.updateStatus("✅ Devices fetched successfully.");
                }
            } else {
                throw new Error("No devices found");
            }
        } catch (error) {
            console.error("UnifiedDeviceControlNode - Error fetching devices:", error);
            this.updateStatus(`⚠️ Error fetching devices: ${error.message}`);
        }
    }

    async onRefreshDevices() {
        await this.fetchDevices();
        this.updateStatus("✅ Devices refreshed.");
        // Retry state fetches for unavailable devices
        this.properties.selectedDeviceIds.forEach(deviceId => {
            if (deviceId && this.deviceStates[deviceId]?.available === false) {
                this.fetchDeviceState(deviceId);
            }
        });
    }

    restoreDeviceSelectors() {
        // Filter out null entries and invalid IDs (e.g., containing "undefined")
        const validDeviceIds = this.properties.selectedDeviceIds
            .filter(id => id && typeof id === 'string' && !id.includes('undefined'));
        const uniqueDeviceIds = [...new Set(validDeviceIds)];
        const uniqueDeviceNames = [];
        const uniqueDeviceStates = {};

        // Rebuild names and states for unique, valid IDs
        this.properties.selectedDeviceIds.forEach((id, index) => {
            if (id && uniqueDeviceIds.includes(id)) {
                const deviceIndex = uniqueDeviceIds.indexOf(id);
                if (!uniqueDeviceNames[deviceIndex]) {
                    uniqueDeviceNames[deviceIndex] = this.properties.selectedDeviceNames[index];
                    uniqueDeviceStates[id] = this.deviceStates[id];
                }
            }
        });

        // Update properties with cleaned lists
        this.properties.selectedDeviceIds = uniqueDeviceIds;
        this.properties.selectedDeviceNames = uniqueDeviceNames;
        this.deviceStates = uniqueDeviceStates;

        // Clear existing selectors
        this.deviceSelectors = [];
        this.widgets = this.widgets.filter(widget => !widget.name.startsWith("Select Device"));
        this.setupWidgets(); // Re-add base widgets

        // Add selectors for unique devices
        this.properties.selectedDeviceIds.forEach((deviceId, index) => {
            const device = this.devices.find(d => d.id === deviceId);
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
                this.deviceStates[deviceId] = this.deviceStates[deviceId] || {
                    on: false,
                    brightness: 0,
                    hue: 0,
                    saturation: 0,
                    energy: 0,
                    available: true
                };
                this.fetchDeviceState(deviceId);
            }
        });
        this.updateNodeSize();
        this.needsDeviceSelectorsRestore = false;
        this.updateStatus("✅ Device selectors restored.");
        if (!this.debounceRedrawTimer) {
            this.debounceRedrawTimer = setTimeout(() => {
                this.setDirtyCanvas(true);
                this.debounceRedrawTimer = null;
            }, 100);
        }
    }

    getDeviceOptions() {
        return this.deviceManagerReady && this.devices.length
            ? this.devices.map(device => `${device.name} (ID: ${device.id})`)
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
        this.updateStatus(`✅ Added device selector ${this.deviceSelectors.length}.`);
        // Avoid immediate redraw to prevent UI event loops
        if (!this.debounceRedrawTimer) {
            this.debounceRedrawTimer = setTimeout(() => {
                this.setDirtyCanvas(true);
                this.debounceRedrawTimer = null;
            }, 100);
        }
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
        if (removedDeviceId && this.deviceStates[removedDeviceId]) {
            delete this.deviceStates[removedDeviceId];
        }
        this.updateNodeSize();
        this.setDirtyCanvas(true);
        this.updateStatus(`✅ Removed device selector ${this.deviceSelectors.length + 1}.`);
    }

    async onDeviceSelected(value, index) {
        console.log(`UnifiedDeviceControlNode - Device selected: ${value}, index: ${index}`);
        if (value === "Select Device" || value === "No Devices Found") {
            const removedDeviceId = this.properties.selectedDeviceIds[index];
            if (removedDeviceId && this.deviceStates[removedDeviceId]) {
                delete this.deviceStates[removedDeviceId];
            }
            this.properties.selectedDeviceIds[index] = null;
            this.properties.selectedDeviceNames[index] = null;
            this.updateStatus(`✅ Deselected device at selector ${index + 1}.`);
            this.updateNodeSize();
            if (!this.debounceRedrawTimer) {
                this.debounceRedrawTimer = setTimeout(() => {
                    this.setDirtyCanvas(true);
                    this.debounceRedrawTimer = null;
                }, 100);
            }
            return;
        }

        const match = value.match(/\(ID:\s*([^\)]+)\)/);
        if (!match || !match[1] || match[1] === "undefined") {
            console.error(`UnifiedDeviceControlNode - Invalid device ID in value: ${value}`);
            this.updateStatus(`⚠️ Invalid device selection: ${value}. Please select a valid device.`);
            this.deviceSelectors[index].value = "Select Device";
            this.properties.selectedDeviceIds[index] = null;
            this.properties.selectedDeviceNames[index] = null;
            return;
        }

        const deviceId = match[1];
        const deviceName = value.split(" (ID:")[0];
        const device = this.devices.find(d => d.id === deviceId);
        if (!device) {
            console.error(`UnifiedDeviceControlNode - Device not found for ID: ${deviceId}`);
            this.updateStatus(`⚠️ Device "${deviceName}" not found in device list. Try refreshing devices.`);
            this.deviceSelectors[index].value = "Select Device";
            this.properties.selectedDeviceIds[index] = null;
            this.properties.selectedDeviceNames[index] = null;
            return;
        }

        console.log(`Selected: ID=${deviceId}, Name=${deviceName}, Vendor=${device?.vendor || 'Unknown'}`);

        // Check for duplicates
        const existingIndex = this.properties.selectedDeviceIds.indexOf(deviceId);
        if (existingIndex !== -1 && existingIndex !== index) {
            this.updateStatus(`⚠️ Device "${deviceName}" is already selected at selector ${existingIndex + 1}.`);
            this.deviceSelectors[index].value = "Select Device";
            this.properties.selectedDeviceIds[index] = null;
            this.properties.selectedDeviceNames[index] = null;
            return;
        }

        this.properties.selectedDeviceIds[index] = deviceId;
        this.properties.selectedDeviceNames[index] = deviceName;
        this.deviceStates[deviceId] = this.deviceStates[deviceId] || {
            on: false,
            brightness: 0,
            hue: 0,
            saturation: 0,
            energy: 0,
            available: true
        };
        await this.fetchDeviceState(deviceId);
        this.updateNodeSize();
        this.updateStatus(`✅ Selected device "${deviceName}" at selector ${index + 1}.`);
        if (!this.debounceRedrawTimer) {
            this.debounceRedrawTimer = setTimeout(() => {
                this.setDirtyCanvas(true);
                this.debounceRedrawTimer = null;
            }, 100);
        }
    }

    async fetchDeviceState(deviceId) {
        const device = this.devices.find(d => d.id === deviceId);
        if (!device) {
            this.deviceStates[deviceId] = { ...this.deviceStates[deviceId], available: false };
            this.updateStatus(`⚠️ Device ${deviceId} not found in device list. Try refreshing devices.`);
            return false;
        }

        let endpoint;
        let cleanId = deviceId;
        if (device.vendor === 'Kasa') {
            cleanId = deviceId.replace(/^kasa_/, '');
            endpoint = `${this.BACKEND_URL}/api/lights/kasa/${encodeURIComponent(cleanId)}/state`;
        } else if (device.vendor === 'Hue' || device.vendor === 'Osram') {
            cleanId = deviceId.replace(/^hue_/, '');
            endpoint = `${this.BACKEND_URL}/api/lights/hue/${encodeURIComponent(cleanId)}`;
        } else if (device.vendor === 'Shelly') {
            cleanId = deviceId.replace(/^shellyplus1-/, '');
            endpoint = `${this.BACKEND_URL}/api/lights/shelly/${encodeURIComponent(cleanId)}/state`;
        } else if (device.vendor === 'HomeAssistant') {
            endpoint = `${this.BACKEND_URL}/api/light-state/${encodeURIComponent(deviceId)}`;
        } else {
            this.updateStatus(`⚠️ Unsupported vendor for ${deviceId}: ${device.vendor}`);
            return false;
        }

        for (let attempt = 0; attempt < this.properties.maxRetries; attempt++) {
            try {
                console.log(`UnifiedDeviceControlNode - Fetching state for ${deviceId} (cleaned: ${cleanId}), attempt ${attempt + 1} via HTTP`);
                const response = await fetch(endpoint, { method: 'GET' });
                if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                const data = await response.json();
                if (data.success) {
                    let state;
                    if (device.vendor === 'Kasa') {
                        state = {
                            on: data.state.on || false,
                            brightness: data.state.brightness || 0,
                            hue: data.state.hue || 0,
                            saturation: data.state.saturation || 0,
                            energy: data.state.energy || 0,
                            available: true
                        };
                    } else if (device.vendor === 'Hue' || device.vendor === 'Osram') {
                        // Added validation and normalization for Hue brightness
                        if (typeof data.light.state.bri !== 'number' || data.light.state.bri < 0 || data.light.state.bri > 254) {
                            console.error(`Invalid raw brightness for ${deviceId}: ${data.light.state.bri}`);
                            throw new Error("Invalid brightness value received from Hue");
                        }
                        const rawBri = data.light.state.bri;
                        const normalizedBri = rawBri ? Math.max(0, Math.min(100, Math.round(rawBri / 2.54))) : 0;
                        console.log(`Raw brightness for ${deviceId}: ${rawBri}, Normalized: ${normalizedBri}`);
                        state = {
                            on: data.light.state.on || false,
                            brightness: normalizedBri,
                            hue: data.light.state.hue ? Math.round((data.light.state.hue / 65535) * 360) : 0,
                            saturation: data.light.state.sat ? Math.round((data.light.state.sat / 254) * 100) : 0,
                            energy: data.light.energy || 0,
                            available: true
                        };
                    } else if (device.vendor === 'Shelly') {
                        state = {
                            on: data.state.on || false,
                            brightness: data.state.brightness || 0,
                            hue: 0,
                            saturation: 0,
                            energy: data.state.energy || 0,
                            available: true
                        };
                    } else if (device.vendor === 'HomeAssistant') {
                        state = {
                            on: data.state.on || false,
                            brightness: data.state.brightness || 0,
                            hue: data.state.hue || 0,
                            saturation: data.state.saturation || 0,
                            energy: data.state.energy || 0,
                            available: true
                        };
                    }
                    this.deviceStates[deviceId] = state;
                    // Safely cache the state if lastDeviceStates exists
                    if (this.lastDeviceStates && typeof this.lastDeviceStates.set === 'function') {
                        this.lastDeviceStates.set(deviceId, state);
                    }
                    const deviceName = this.properties.selectedDeviceNames[this.properties.selectedDeviceIds.indexOf(deviceId)] || deviceId;
                    console.log(`UnifiedDeviceControlNode - Fetched state for "${deviceName}": on=${state.on}`);
                    this.updateStatus(`✅ "${deviceName}" is ${state.on ? "On" : "Off"}`);
                    this.setDirtyCanvas(true);
                    return true;
                } else {
                    throw new Error(data.error || "Failed to fetch state");
                }
            } catch (error) {
                console.error(`UnifiedDeviceControlNode - Error fetching state for ${deviceId} on attempt ${attempt + 1}:`, error);
                if (attempt === this.properties.maxRetries - 1) {
                    const deviceName = this.properties.selectedDeviceNames[this.properties.selectedDeviceIds.indexOf(deviceId)] || deviceId;
                    // Fallback to last known state if available
                    let lastState = null;
                    if (this.lastDeviceStates && typeof this.lastDeviceStates.get === 'function') {
                        lastState = this.lastDeviceStates.get(deviceId);
                    }
                    if (lastState) {
                        this.deviceStates[deviceId] = { ...lastState, available: true };
                        console.log(`UnifiedDeviceControlNode - Using last known state for ${deviceId}:`, lastState);
                        this.updateStatus(`⚠️ "${deviceName}" state fetch failed. Using last known state. Check server logs for device issues.`);
                        this.setDirtyCanvas(true);
                        return true;
                    } else {
                        this.deviceStates[deviceId] = {
                            on: false,
                            brightness: 0,
                            hue: 0,
                            saturation: 0,
                            energy: 0,
                            available: false
                        };
                        this.updateStatus(`⚠️ "${deviceName}" not found. Try refreshing devices.`);
                        this.setDirtyCanvas(true);
                        return false;
                    }
                }
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }
        return false;
    }
    async handleHSVInput(hsv) {
        if (!this.properties.selectedDeviceIds.length) {
            this.updateStatus("⚠️ No devices selected. Cannot update HSV.");
            return;
        }
        if (!hsv || typeof hsv.hue !== 'number' || typeof hsv.saturation !== 'number' || typeof hsv.brightness !== 'number') {
            this.updateStatus("⚠️ Invalid HSV input.");
            return;
        }

        let { hue, saturation, brightness } = hsv;
        hue = hue <= 1 ? hue * 360 : hue;
        saturation = saturation <= 1 ? saturation * 100 : saturation;
        brightness = brightness <= 1 ? brightness * 100 : brightness;

        hue = Math.round(Math.max(0, Math.min(360, hue)));
        saturation = Math.round(Math.max(0, Math.min(100, saturation)));
        brightness = Math.round(Math.max(1, Math.min(100, brightness)));

        const state = {
            on: true,
            hue: device => device.vendor === 'Hue' || device.vendor === 'Osram' ? Math.round((hue / 360) * 65535) : hue,
            saturation: device => device.vendor === 'Hue' || device.vendor === 'Osram' ? Math.round((saturation / 100) * 254) : saturation,
            brightness: device => device.vendor === 'Hue' || device.vendor === 'Osram' ? Math.round(brightness * 2.54) : brightness
        };

        this.updateColorSwatch(hue / 360, saturation / 100, brightness / 100);

        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(async () => {
            await this.controlDevices(state, "HSV");
        }, this.properties.debounceDelay);
    }

    async handleTrigger(trigger) {
        if (!this.properties.selectedDeviceIds.length) {
            this.updateStatus("⚠️ No devices selected. Cannot toggle state.");
            return;
        }
        if (!this.deviceManagerReady) {
            this.updateStatus("⚠️ Waiting for devices to initialize.");
            return;
        }

        const desiredState = Boolean(trigger);
        const state = { on: desiredState, transition: 0 };

        // Send control commands
        await this.controlDevices(state, "Trigger");

        // Wait for device to update
        await new Promise(resolve => setTimeout(resolve, 1000)); // Increased to 1000ms for Hue

        // Fetch latest states
        const fetchResults = await Promise.all(this.properties.selectedDeviceIds.map(deviceId => {
            if (!deviceId || deviceId.includes('undefined')) {
                console.warn(`UnifiedDeviceControlNode - Skipping invalid device ID: ${deviceId}`);
                return Promise.resolve(false);
            }
            if (this.deviceStates[deviceId]?.available === false) {
                console.log(`UnifiedDeviceControlNode - Skipping state fetch for unavailable device: ${deviceId}`);
                return Promise.resolve(false);
            }
            return this.fetchDeviceState(deviceId);
        }));

        // Check if update is needed
        let needsUpdate = false;
        for (let i = 0; i < this.properties.selectedDeviceIds.length; i++) {
            const deviceId = this.properties.selectedDeviceIds[i];
            if (!deviceId || deviceId.includes('undefined')) continue;
            const fetchSuccess = fetchResults[i];
            if (!fetchSuccess || this.deviceStates[deviceId]?.available === false) {
                needsUpdate = true;
                break;
            }
            const actualState = this.deviceStates[deviceId]?.on;
            if (actualState !== desiredState) {
                needsUpdate = true;
                break;
            }
        }

        if (!needsUpdate) {
            console.log(`UnifiedDeviceControlNode - State matches desired: ${desiredState}`);
            this.updateStatus(`✅ Toggle ${desiredState ? "On" : "Off"} successful.`);
            return;
        }

        // Limit retries to avoid infinite loops
        console.warn(`UnifiedDeviceControlNode - State mismatch for ${this.properties.selectedDeviceIds.join(", ")}, retrying once`);
        await this.controlDevices(state, "Trigger Retry");

        // Final state check
        await new Promise(resolve => setTimeout(resolve, 1000));
        const finalFetchResults = await Promise.all(this.properties.selectedDeviceIds.map(deviceId => {
            if (!deviceId || deviceId.includes('undefined') || this.deviceStates[deviceId]?.available === false) {
                return Promise.resolve(false);
            }
            return this.fetchDeviceState(deviceId);
        }));

        let finalSuccess = true;
        for (let i = 0; i < this.properties.selectedDeviceIds.length; i++) {
            const deviceId = this.properties.selectedDeviceIds[i];
            if (!deviceId || deviceId.includes('undefined')) continue;
            if (!finalFetchResults[i] || this.deviceStates[deviceId]?.available === false || this.deviceStates[deviceId]?.on !== desiredState) {
                finalSuccess = false;
                break;
            }
        }

        this.updateStatus(finalSuccess ? `✅ Toggle ${desiredState ? "On" : "Off"} successful after retry.` : `⚠️ Toggle failed after retry for some devices. Check server logs.`);
    }

    async controlDevices(state, actionType) {
        const results = [];
        let needsRedraw = false;
        const maxControlAttempts = 3; // Limit control retries
        const baseBackoffDelay = 500; // Start with 500ms delay

        for (let i = 0; i < this.properties.selectedDeviceIds.length; i++) {
            const deviceId = this.properties.selectedDeviceIds[i];
            if (!deviceId) continue;
            const device = this.devices.find(d => d.id === deviceId);
            if (!device || !this.deviceStates[deviceId]?.available) {
                results.push({ deviceId, success: false, error: "Device not available" });
                continue;
            }

            // Skip unsupported actions in selective mode
            if (this.properties.applyMode === "selective") {
                if (state.brightness !== undefined && !device.capabilities.brightness) {
                    results.push({ deviceId, success: false, error: "Brightness not supported" });
                    continue;
                }
                if ((state.hue !== undefined || state.saturation !== undefined) && !device.capabilities.color) {
                    results.push({ deviceId, success: false, error: "Color not supported" });
                    continue;
                }
            }

            let endpoint;
            let method = 'POST';
            let cleanId = deviceId;
            let payload;
            let useSocketIO = false;
            if (device.vendor === 'Kasa') {
                cleanId = deviceId.replace(/^kasa_/, '');
                endpoint = `${this.BACKEND_URL}/api/lights/kasa/${encodeURIComponent(cleanId)}/state`;
                payload = {
                    on: state.on !== undefined ? state.on : true,
                    hsv: state.hue !== undefined ? {
                        hue: state.hue(device),
                        saturation: state.saturation(device),
                        brightness: state.brightness(device)
                    } : undefined,
                    transition: state.transition || 0
                };
            } else if (device.vendor === 'Hue' || device.vendor === 'Osram') {
                cleanId = deviceId.replace(/^hue_/, '');
                method = 'PUT';
                endpoint = `${this.BACKEND_URL}/api/lights/hue/${encodeURIComponent(cleanId)}`;
                payload = {
                    on: state.on !== undefined ? state.on : true,
                    hue: state.hue ? state.hue(device) : undefined,
                    sat: state.saturation ? state.saturation(device) : undefined,
                    bri: state.brightness ? Math.round(Math.max(0, Math.min(100, state.brightness(device))) * 2.54) : undefined,
                    transitiontime: state.transition ? Math.round(state.transition / 100) : undefined
                };
                // Remove undefined fields from payload
                payload = Object.fromEntries(Object.entries(payload).filter(([_, v]) => v !== undefined));
                useSocketIO = true;
            } else if (device.vendor === 'Shelly') {
                cleanId = deviceId.replace(/^shellyplus1-/, '');
                endpoint = `${this.BACKEND_URL}/api/lights/shelly/${encodeURIComponent(cleanId)}/state`;
                payload = { on: state.on !== undefined ? state.on : true };
            } else if (device.vendor === 'HomeAssistant') {
                endpoint = `${this.BACKEND_URL}/api/light-state/${encodeURIComponent(deviceId)}`;
                payload = {
                    on: state.on !== undefined ? state.on : true,
                    brightness_pct: state.brightness ? state.brightness(device) : undefined,
                    hs_color: state.hue && state.saturation ? [state.hue(device), state.saturation(device)] : undefined,
                    transition: state.transition ? state.transition / 1000 : undefined
                };
            } else {
                results.push({ deviceId, success: false, error: `Unsupported vendor: ${device.vendor}` });
                continue;
            }

            let controlAttempts = 0;
            let lastError = null;
            while (controlAttempts < maxControlAttempts) {
                if (useSocketIO) {
                    try {
                        console.log(`UnifiedDeviceControlNode - Controlling ${deviceId} via Socket.IO with ${JSON.stringify(payload)} (attempt ${controlAttempts + 1})`);
                        await new Promise((resolve, reject) => {
                            this.socket.emit('device-control', { id: deviceId, ...payload }, (response) => {
                                if (response && response.success) {
                                    this.deviceStates[deviceId] = {
                                        ...this.deviceStates[deviceId],
                                        on: payload.on !== undefined ? payload.on : this.deviceStates[deviceId].on,
                                        brightness: payload.bri ? Math.round(payload.bri / 2.54) : this.deviceStates[deviceId].brightness,
                                        hue: payload.hue ? Math.round((payload.hue / 65535) * 360) : this.deviceStates[deviceId].hue,
                                        saturation: payload.sat ? Math.round((payload.sat / 254) * 100) : this.deviceStates[deviceId].saturation,
                                        available: true
                                    };
                                    results.push({ deviceId, success: true });
                                    resolve();
                                } else {
                                    reject(new Error(response?.error || `Socket.IO control failed: ${JSON.stringify(response)}`));
                                }
                            });
                        });
                        needsRedraw = true;
                        break;
                    } catch (socketError) {
                        console.error(`UnifiedDeviceControlNode - Socket.IO failed for ${deviceId} on attempt ${controlAttempts + 1}:`, socketError);
                        lastError = socketError.message;
                        controlAttempts++;
                        if (controlAttempts < maxControlAttempts) {
                            const backoffDelay = baseBackoffDelay * Math.pow(2, controlAttempts);
                            console.log(`Waiting ${backoffDelay}ms before retrying control for ${deviceId}`);
                            await new Promise(resolve => setTimeout(resolve, backoffDelay));
                        }
                        continue;
                    }
                }

                try {
                    console.log(`UnifiedDeviceControlNode - Attempt ${controlAttempts + 1} to control ${deviceId} with ${JSON.stringify(payload)} to ${endpoint}`);
                    const response = await fetch(endpoint, {
                        method,
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    const data = await response.json();
                    if (data.success) {
                        this.deviceStates[deviceId] = {
                            ...this.deviceStates[deviceId],
                            on: payload.on !== undefined ? payload.on : this.deviceStates[deviceId].on,
                            brightness: payload.bri ? Math.round(payload.bri / 2.54) : this.deviceStates[deviceId].brightness,
                            hue: payload.hue ? Math.round((payload.hue / 65535) * 360) : this.deviceStates[deviceId].hue,
                            saturation: payload.sat ? Math.round((payload.sat / 254) * 100) : this.deviceStates[deviceId].saturation,
                            available: true
                        };
                        results.push({ deviceId, success: true });
                        needsRedraw = true;
                        break;
                    } else {
                        throw new Error(data.error || "Control failed");
                    }
                } catch (error) {
                    console.error(`UnifiedDeviceControlNode - Attempt ${controlAttempts + 1} failed for ${deviceId}:`, error);
                    lastError = error.message;
                    controlAttempts++;
                    if (controlAttempts < maxControlAttempts) {
                        const backoffDelay = baseBackoffDelay * Math.pow(2, controlAttempts);
                        console.log(`Waiting ${backoffDelay}ms before retrying control for ${deviceId}`);
                        await new Promise(resolve => setTimeout(resolve, backoffDelay));
                    }
                }
            }

            if (controlAttempts >= maxControlAttempts) {
                results.push({ deviceId, success: false, error: lastError || "Max control attempts reached" });
                this.deviceStates[deviceId] = { ...this.deviceStates[deviceId], available: false };
            }
        }

        const successCount = results.filter(r => r.success).length;
        const errorMessages = results.filter(r => !r.success).map(r => `${r.deviceId}: ${r.error}`);
        if (successCount === results.length) {
            this.updateStatus(`✅ ${actionType} applied to ${successCount} device(s).`);
        } else if (successCount > 0) {
            this.updateStatus(`⚠️ ${actionType} applied to ${successCount}/${results.length} device(s). Errors: ${errorMessages.join(", ")}`);
        } else {
            this.updateStatus(`⚠️ Failed to apply ${actionType}: ${errorMessages.join(", ")}`);
        }
        if (needsRedraw) this.setDirtyCanvas(true);
    }

    handleDeviceStateUpdate(data) {
        let deviceId = data.id;
        // Handle Hue devices: server may send raw ID (e.g., "2") or prefixed ID (e.g., "hue_2")
        if (data.id && typeof data.id === 'string' && !data.id.startsWith('hue_') && this.properties.selectedDeviceIds.includes(`hue_${data.id}`)) {
            deviceId = `hue_${data.id}`;
        }
        if (this.properties.selectedDeviceIds.includes(deviceId)) {
            const device = this.devices.find(d => d.id === deviceId);
            let normalizedBrightness = data.brightness || 0;
            // Normalize brightness for Hue devices if in raw range (0–254)
            if (device && (device.vendor === 'Hue' || device.vendor === 'Osram')) {
                if (typeof data.brightness === 'number' && data.brightness > 100) {
                    console.log(`Normalizing Hue brightness for ${deviceId}: ${data.brightness} -> ${Math.round(data.brightness / 2.54)}`);
                    normalizedBrightness = Math.max(0, Math.min(100, Math.round(data.brightness / 2.54)));
                }
            }
            const state = {
                on: data.on || false,
                brightness: normalizedBrightness,
                hue: data.hue || 0,
                saturation: data.saturation || 0,
                energy: data.energy || 0,
                available: true
            };
            this.deviceStates[deviceId] = state;
            this.lastDeviceStates.set(deviceId, state); // Cache the state
            const deviceName = this.properties.selectedDeviceNames[this.properties.selectedDeviceIds.indexOf(deviceId)] || deviceId;
            console.log(`UnifiedDeviceControlNode - Received device-state-update for ${deviceId}:`, state);
            this.updateStatus(`✅ Update for "${deviceName}": ${state.on ? "On" : "Off"}`);
            this.setDirtyCanvas(true);
        }
    }

    onExecute() {
        if (!this.deviceManagerReady) this.fetchDevices();

        const hsvInput = this.getInputData(0);
        const triggerInput = this.getInputData(1);

        if (hsvInput) this.handleHSVInput(hsvInput);
        if (triggerInput !== undefined) this.handleTrigger(triggerInput);

        const statusOutput = this.properties.selectedDeviceIds
            .filter(id => id && this.deviceStates[id])
            .map(id => ({
                id,
                name: this.properties.selectedDeviceNames[this.properties.selectedDeviceIds.indexOf(id)],
                on: this.deviceStates[id].on,
                brightness: this.deviceStates[id].brightness,
                hue: this.deviceStates[id].hue,
                saturation: this.deviceStates[id].saturation,
                energy: this.deviceStates[id].energy
            }));
        this.setOutputData(0, statusOutput);
        this.setOutputData(1, this.properties.selectedDeviceIds.filter(id => id));

        this.setDirtyCanvas(true);
    }

    serialize() {
        const data = super.serialize();
        data.properties = { ...this.properties };
        data.deviceStates = this.deviceStates;
        data.boxcolor = this.boxcolor;
        return data;
    }

    configure(data) {
        super.configure(data);
        this.properties = { ...data.properties } || this.properties;
        this.properties.maxRetries = typeof this.properties.maxRetries === 'number' ? this.properties.maxRetries : 3;
        this.properties.debounceDelay = typeof this.properties.debounceDelay === 'number' ? this.properties.debounceDelay : 300;
        this.deviceStates = data.deviceStates || {};
        this.boxcolor = data.boxcolor || "#000000";
        this.needsDeviceSelectorsRestore = true;
        this.updateStatus(this.properties.status);
        this.applyModeToggle.value = this.properties.applyMode === "all";
        this.updateNodeSize();
        this.setDirtyCanvas(true);
    }

    onRemoved() {
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
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

    updateColorSwatch(hue = 0, saturation = 0, brightness = 0) {
        const rgb = this.hsvToRgb(hue, saturation, brightness);
        this.boxcolor = this.rgbToHex(rgb[0], rgb[1], rgb[2]);
        this.setDirtyCanvas(true);
    }

    updateNodeSize() {
        this.size[0] = 400; // Match HueLightControlNode
        const baseHeight = 40;
        let widgetsHeight = 0;
        this.widgets.forEach(widget => {
            widgetsHeight += widget.computeSize ? widget.computeSize(this.size[0])[1] : LiteGraph.NODE_WIDGET_HEIGHT;
        });
        widgetsHeight += 15;
        const totalDeviceHeight = this.properties.selectedDeviceIds.length * 50;
        const extraHeight = 45;
        this.size[1] = baseHeight + widgetsHeight + totalDeviceHeight + extraHeight;
        this.setSize([this.size[0], this.size[1]]);
        this.widgets.forEach(widget => {
            widget.options.width = widget.name === "Status" ? this.size[0] - 200 : widget.name === "Apply Mode" ? 80 : 40;
        });
        this.setDirtyCanvas(true, true);
    }

    updateStatus(newStatus) {
        this.properties.status = newStatus;
        if (this.statusWidget) this.statusWidget.value = this.properties.status;
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

        // Draw color swatch
        if (this.boxcolor !== "#000000") {
            ctx.fillStyle = this.boxcolor;
            ctx.fillRect(this.size[0] - 30, 10, 20, 20);
            ctx.strokeStyle = "#FFFFFF";
            ctx.lineWidth = 1;
            ctx.strokeRect(this.size[0] - 30, 10, 20, 20);
        }

        // Draw per-device status
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

        this.properties.selectedDeviceIds.forEach((deviceId, index) => {
            if (!deviceId) return;
            const deviceName = this.properties.selectedDeviceNames[index];
            const deviceState = this.deviceStates[deviceId];
            if (!deviceState) return;

            const yPosition = overlayStartY + index * spacing;

            // Draw device name
            ctx.fillStyle = deviceState.available ? "#E0E0E0" : "#FF5555";
            ctx.font = "14px Roboto, Arial, sans-serif";
            ctx.textAlign = "left";
            ctx.fillText(deviceName, 10, yPosition);

            // Draw on/off dot
            const onOffX = this.size[0] - 100;
            ctx.beginPath();
            ctx.fillStyle = deviceState.available ? (deviceState.on ? "#00FF00" : "#FF0000") : "#555555";
            ctx.arc(onOffX, yPosition - 5, 10, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "#FFFFFF";
            ctx.lineWidth = 1;
            ctx.stroke();

            // Draw brightness meter
            const meterX = this.size[0] - 80;
            const meterWidth = 60;
            const meterHeight = 20;
            const brightnessPercent = deviceState.available && deviceState.on ? (deviceState.brightness / 100) : 0;
            const rgb = this.hsvToRgb(
                deviceState.hue / 360,
                deviceState.saturation / 100,
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
        });

        // Draw aggregate status bar
        const onCount = this.properties.selectedDeviceIds.filter(id => id && this.deviceStates[id]?.on && this.deviceStates[id]?.available).length;
        const totalCount = this.properties.selectedDeviceIds.filter(id => id && this.deviceStates[id]?.available).length;
        ctx.fillStyle = onCount === totalCount ? "#00FF00" : onCount > 0 ? "#FFA500" : "#FF0000";
        ctx.fillRect(0, this.size[1] - 5, this.size[0], 5);
    }
}

// Register the node
try {
    console.log("Registering UnifiedDeviceControlNode");
    LiteGraph.registerNodeType("Devices/UnifiedDeviceControlNode", UnifiedDeviceControlNode);
    console.log("UnifiedDeviceControlNode - Registered successfully under 'Devices' category.");
    LiteGraph.UnifiedDeviceControlNode = UnifiedDeviceControlNode;
} catch (error) {
    console.error("Failed to register UnifiedDeviceControlNode:", error);
}