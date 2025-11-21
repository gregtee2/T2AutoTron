// File: custom_nodes/Scenes/RoomNode.js

class RoomNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Room";
        this.size = [400, 200];
        this.bgcolor = "rgb(80, 100, 120)";

        this.properties = {
            roomName: "New Room",
            selectedDeviceIds: [],
            selectedDeviceNames: [],
            debug: false
        };

        this.deviceSelectors = [];
        this.widgets = [];
        this.availableDevices = [];

        this.addOutput("Room Data", "room_data");

        if (!RoomNode.sharedRooms) {
            RoomNode.sharedRooms = {};
        }

        this.setupWidgets();
        this.fetchDevices();
    }

    async fetchDevices() {
        try {
            const response = await fetch("http://localhost:3000/api/devices");
            const data = await response.json();
            if (data.success && data.devices) {
                this.availableDevices = [
                    ...data.devices.ha
                        .filter((d) => d.id && d.type === "light")
                        .map((d) => ({ id: d.id, name: `[HA] ${d.name}` })),
                    ...data.devices.hue.map((d) => ({ id: d.id, name: `[Hue] ${d.name}` })),
                    ...data.devices.kasa.map((d) => ({ id: d.id, name: `[Kasa] ${d.name}` })),
                    ...data.devices.shelly.map((d) => ({ id: d.id, name: `[Shelly] ${d.name}` }))
                ].sort((a, b) => a.name.localeCompare(b.name));
                if (this.properties.debug) console.log(`[RoomNode] Fetched ${this.availableDevices.length} devices: ${JSON.stringify(this.availableDevices)}`);
            } else {
                throw new Error(data.error || "No devices returned");
            }
        } catch (error) {
            console.error("[RoomNode] Failed to fetch devices:", error);
            this.availableDevices = [];
            if (this.properties.debug) console.log(`[RoomNode] Error fetching devices: ${error.message}`);
        }
        this.updateWidgets();
        this.updateSharedBuffer();
    }

    setupWidgets() {
        this.widgets = [];
        this.deviceSelectors = [];

        this.addWidget("text", "Room Name", this.properties.roomName, (v) => {
            this.properties.roomName = v;
            this.title = v;
            this.updateSharedBuffer();
            this.save();
        }, { width: 300 });

        this.addWidget("button", "➕", "Add Device", () => this.onAddDevice(), { width: 40 });
        this.addWidget("button", "➖", "Remove Device", () => this.onRemoveDevice(), { width: 40 });
        this.addWidget("button", "🔄", "Refresh Devices", () => this.onRefreshDevices(), { width: 40 });

        this.addWidget("toggle", "Debug", this.properties.debug, (v) => {
            this.properties.debug = v;
            console.log(`[RoomNode] Debug ${v ? "enabled" : "disabled"}`);
        }, { width: 100 });

        this.updateWidgets();
        this.updateSharedBuffer();
    }

    updateWidgets() {
        this.deviceSelectors.forEach(w => this.widgets.splice(this.widgets.indexOf(w), 1));
        this.deviceSelectors = [];

        this.properties.selectedDeviceIds.forEach((deviceId, index) => {
            const device = this.availableDevices.find(d => d.id === deviceId);
            const deviceName = this.properties.selectedDeviceNames[index] || (device?.name ?? "Select Device");
            const deviceSelector = this.addWidget(
                "combo",
                `Select Device ${index + 1}`,
                deviceName,
                (value) => this.onDeviceSelected(value, index),
                { values: ["Select Device", ...this.getDeviceOptions()], width: this.size[0] - 20 }
            );
            this.deviceSelectors.push(deviceSelector);
        });

        this.updateNodeSize();
        this.setDirtyCanvas(true);
        this.updateSharedBuffer();
    }

    getDeviceOptions() {
        return this.availableDevices.length ? this.availableDevices.map(d => d.name) : ["No Devices Available"];
    }

    onAddDevice() {
        if (!this.availableDevices.length) {
            if (this.properties.debug) console.log("[RoomNode] No devices available to add.");
            return;
        }
        if (this.deviceSelectors.length >= 20) {
            if (this.properties.debug) console.log("[RoomNode] Maximum of 20 devices reached.");
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
        this.updateSharedBuffer();
        if (this.properties.debug) console.log(`[RoomNode] Added device selector ${this.deviceSelectors.length}`);
    }

    onRemoveDevice() {
        if (!this.deviceSelectors.length) {
            if (this.properties.debug) console.log("[RoomNode] No devices to remove.");
            return;
        }
        const deviceSelector = this.deviceSelectors.pop();
        this.widgets = this.widgets.filter(w => w !== deviceSelector);
        this.properties.selectedDeviceIds.pop();
        this.properties.selectedDeviceNames.pop();
        this.updateNodeSize();
        this.setDirtyCanvas(true);
        this.updateSharedBuffer();
        if (this.properties.debug) console.log("[RoomNode] Removed device selector");
    }

    onDeviceSelected(value, index) {
        if (value === "Select Device" || value === "No Devices Available") {
            this.properties.selectedDeviceIds[index] = null;
            this.properties.selectedDeviceNames[index] = null;
            this.updateWidgets();
            this.setDirtyCanvas(true);
            this.updateSharedBuffer();
            if (this.properties.debug) console.log(`[RoomNode] Deselected device at selector ${index + 1}`);
            return;
        }

        const device = this.availableDevices.find(d => d.name === value);
        if (!device) {
            if (this.properties.debug) console.log(`[RoomNode] Device "${value}" not found.`);
            return;
        }

        const { id: deviceId, name: deviceName } = device;
        if (this.properties.selectedDeviceIds.includes(deviceId)) {
            if (this.properties.debug) console.log(`[RoomNode] Device "${deviceName}" already selected.`);
            this.deviceSelectors[index].value = "Select Device";
            return;
        }

        this.properties.selectedDeviceIds[index] = deviceId;
        this.properties.selectedDeviceNames[index] = deviceName;
        this.updateWidgets();
        this.setDirtyCanvas(true);
        this.updateSharedBuffer();
        if (this.properties.debug) console.log(`[RoomNode] Selected device "${deviceName}" at selector ${index + 1}`);
    }

    onRefreshDevices() {
        this.fetchDevices();
        if (this.properties.debug) console.log("[RoomNode] Devices refreshed");
    }

    updateSharedBuffer() {
        const newRoomData = {
            name: this.properties.roomName,
            devices: this.properties.selectedDeviceIds.filter(id => id)
        };
        // Only update and log if the data has changed
        const currentRoomData = RoomNode.sharedRooms[this.properties.roomName];
        if (!currentRoomData || JSON.stringify(currentRoomData) !== JSON.stringify(newRoomData)) {
            RoomNode.sharedRooms[this.properties.roomName] = newRoomData;
            if (this.properties.debug) console.log(`[RoomNode] Updated shared buffer for room "${this.properties.roomName}": ${JSON.stringify(newRoomData)}`);
        }
    }

    updateNodeSize() {
        this.size[0] = 400;
        const baseHeight = 40;
        const bottomPadding = 55;
        const paddingBetweenWidgets = 5;

        let fixedWidgetsHeight = 0;
        const fixedWidgets = this.widgets.filter(w => !w.name.startsWith("Select Device"));
        fixedWidgets.forEach((w, index) => {
            const widgetHeight = w.computeSize?.(this.size[0])[1] ?? LiteGraph.NODE_WIDGET_HEIGHT;
            fixedWidgetsHeight += widgetHeight;
            if (index < fixedWidgets.length - 1) {
                fixedWidgetsHeight += paddingBetweenWidgets;
            }
        });

        let deviceWidgetsHeight = 0;
        this.deviceSelectors.forEach((w, index) => {
            const deviceHeight = w.computeSize?.(this.size[0])[1] ?? LiteGraph.NODE_WIDGET_HEIGHT;
            deviceWidgetsHeight += deviceHeight;
            if (index < this.deviceSelectors.length - 1) {
                deviceWidgetsHeight += paddingBetweenWidgets;
            }
        });

        const sectionPadding = this.deviceSelectors.length > 0 ? paddingBetweenWidgets : 0;
        this.size[1] = baseHeight + fixedWidgetsHeight + sectionPadding + deviceWidgetsHeight + bottomPadding;

        this.widgets.forEach(w => {
            w.options.width = w.name === "Room Name" ? 300 :
                             w.name === "➕" ? 40 :
                             w.name === "➖" ? 40 :
                             w.name === "🔄" ? 40 :
                             w.name === "Debug" ? 100 :
                             w.name.startsWith("Select Device") ? this.size[0] - 20 : 300;
        });

        if (this.properties.debug) {
            console.log(`[RoomNode] Updated size: width=${this.size[0]}, height=${this.size[1]}`);
        }

        this.setSize([this.size[0], this.size[1]]);
        this.setDirtyCanvas(true, true);
    }

    onExecute() {
        const roomData = {
            name: this.properties.roomName,
            devices: this.properties.selectedDeviceIds.filter(id => id)
        };
        this.setOutputData(0, roomData);
        this.updateSharedBuffer();
    }

    onDrawForeground(ctx) {
        if (this.flags.collapsed) return;

        ctx.fillStyle = "#FFF";
        ctx.font = "12px Arial";
        ctx.textAlign = "left";
        ctx.fillText(`Devices: ${this.properties.selectedDeviceIds.filter(id => id).length}`, 10, this.size[1] - 10);
    }

    save() {
        localStorage.setItem(`room_node_${this.id}`, JSON.stringify(this.properties));
        if (this.properties.debug) console.log(`[RoomNode] Saved: ${JSON.stringify(this.properties)}`);
    }

    load() {
        const saved = localStorage.getItem(`room_node_${this.id}`);
        if (saved) {
            this.properties = JSON.parse(saved);
            this.title = this.properties.roomName;
            this.updateWidgets();
            this.updateSharedBuffer();
            if (this.properties.debug) console.log(`[RoomNode] Loaded: ${JSON.stringify(this.properties)}`);
        }
    }

    onRemoved() {
        if (this.properties.roomName in RoomNode.sharedRooms) {
            delete RoomNode.sharedRooms[this.properties.roomName];
            if (this.properties.debug) console.log(`[RoomNode] Removed room "${this.properties.roomName}" from shared buffer`);
        }
    }

    serialize() {
        const data = super.serialize();
        data.properties = { ...this.properties };
        data.availableDevices = this.availableDevices;
        return data;
    }

    configure(data) {
        super.configure(data);
        if (data.properties) {
            this.properties = { ...data.properties };
            this.title = this.properties.roomName;
            this.availableDevices = data.availableDevices || [];
            this.updateWidgets();
            this.updateSharedBuffer();
        }
    }
}

if (!LiteGraph.registered_node_types || !LiteGraph.registered_node_types["Scenes/room"]) {
    LiteGraph.registerNodeType("Scenes/room", RoomNode);
    console.log("RoomNode - Registered successfully under 'Scenes' category.");
}