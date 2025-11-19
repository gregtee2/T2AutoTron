// File: custom_nodes/Scenes/SceneManagerNode.js

class SceneManagerNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Scene Manager";
        this.size = [400, 200];
        this.bgcolor = "rgb(50, 68, 73)";

        if (!SceneManagerNode.sharedMessages) {
            SceneManagerNode.sharedMessages = {};
        }

        this.properties = {
            sceneName: "New Scene",
            selectedRoomNames: [],
            debug: false
        };

        this.roomSelectors = [];
        this.widgets = [];
        this.lastTriggerState = false;
        this.availableRooms = [];

        this.addInput("Toggle", "boolean");
        this.addInput("HSV", "hsv_info");
        this.addInput("Enable", "boolean");
        this.addOutput("Messages", "array");

        this.setupWidgets();
    }

    async fetchRooms() {
        this.availableRooms = Object.values(RoomNode.sharedRooms || {});
        if (this.properties.debug) {
            console.log(`[SceneManagerNode] Fetched ${this.availableRooms.length} rooms: ${JSON.stringify(this.availableRooms)}`);
        }
        this.updateWidgets();
    }

    setupWidgets() {
        this.widgets = [];
        this.roomSelectors = [];

        this.addWidget("text", "Scene Name", this.properties.sceneName, (v) => {
            this.properties.sceneName = v;
            this.save();
        }, { width: 300 });

        this.addWidget("button", "➕", "Add Room", () => this.onAddRoom(), { width: 40 });
        this.addWidget("button", "➖", "Remove Room", () => this.onRemoveRoom(), { width: 40 });
        this.addWidget("button", "🔄", "Refresh Rooms", () => this.onRefreshRooms(), { width: 40 });

        this.addWidget("toggle", "Debug", this.properties.debug, (v) => {
            this.properties.debug = v;
            console.log(`[SceneManagerNode] Debug ${v ? "enabled" : "disabled"}`);
        }, { width: 100 });

        this.fetchRooms();
        this.updateWidgets();
    }

    updateWidgets() {
        this.roomSelectors.forEach(w => this.widgets.splice(this.widgets.indexOf(w), 1));
        this.roomSelectors = [];

        this.properties.selectedRoomNames.forEach((roomName, index) => {
            const roomSelector = this.addWidget(
                "combo",
                `Select Room ${index + 1}`,
                roomName || "Select Room",
                (value) => this.onRoomSelected(value, index),
                { values: ["Select Room", ...this.getRoomOptions()], width: this.size[0] - 20 }
            );
            this.roomSelectors.push(roomSelector);
        });

        this.updateNodeSize();
        this.setDirtyCanvas(true);
    }

    getRoomOptions() {
        return this.availableRooms.length ? this.availableRooms.map(room => room.name) : ["No Rooms Available"];
    }

    onAddRoom() {
        if (!this.availableRooms.length) {
            if (this.properties.debug) console.log("[SceneManagerNode] No rooms available to add.");
            return;
        }
        if (this.roomSelectors.length >= 20) {
            if (this.properties.debug) console.log("[SceneManagerNode] Maximum of 20 rooms reached.");
            return;
        }
        const roomSelector = this.addWidget(
            "combo",
            `Select Room ${this.roomSelectors.length + 1}`,
            "Select Room",
            (value) => this.onRoomSelected(value, this.roomSelectors.indexOf(roomSelector)),
            { values: ["Select Room", ...this.getRoomOptions()], width: this.size[0] - 20 }
        );
        this.roomSelectors.push(roomSelector);
        this.properties.selectedRoomNames.push(null);
        this.updateNodeSize();
        this.setDirtyCanvas(true);
        if (this.properties.debug) console.log(`[SceneManagerNode] Added room selector ${this.roomSelectors.length}`);
    }

    onRemoveRoom() {
        if (!this.roomSelectors.length) {
            if (this.properties.debug) console.log("[SceneManagerNode] No rooms to remove.");
            return;
        }
        const roomSelector = this.roomSelectors.pop();
        this.widgets = this.widgets.filter(w => w !== roomSelector);
        this.properties.selectedRoomNames.pop();
        this.updateNodeSize();
        this.setDirtyCanvas(true);
        if (this.properties.debug) console.log("[SceneManagerNode] Removed room selector");
    }

    onRoomSelected(value, index) {
        if (value === "Select Room" || value === "No Rooms Available") {
            this.properties.selectedRoomNames[index] = null;
            this.updateNodeSize();
            this.setDirtyCanvas(true);
            if (this.properties.debug) console.log(`[SceneManagerNode] Deselected room at selector ${index + 1}`);
            return;
        }

        const room = this.availableRooms.find(r => r.name === value);
        if (!room) {
            if (this.properties.debug) console.log(`[SceneManagerNode] Room "${value}" not found.`);
            return;
        }

        if (this.properties.selectedRoomNames.includes(value)) {
            if (this.properties.debug) console.log(`[SceneManagerNode] Room "${value}" already selected.`);
            this.roomSelectors[index].value = "Select Room";
            return;
        }

        this.properties.selectedRoomNames[index] = value;
        this.updateNodeSize();
        this.setDirtyCanvas(true);
        if (this.properties.debug) console.log(`[SceneManagerNode] Selected room "${value}" at selector ${index + 1}`);
    }

    onRefreshRooms() {
        this.fetchRooms();
        if (this.properties.debug) console.log("[SceneManagerNode] Rooms refreshed");
    }

    updateNodeSize() {
        this.size[0] = 400;
        const baseHeight = 40;
        const bottomPadding = 55;
        const paddingBetweenWidgets = 5;

        let fixedWidgetsHeight = 0;
        const fixedWidgets = this.widgets.filter(w => !w.name.startsWith("Select Room"));
        fixedWidgets.forEach((w, index) => {
            const widgetHeight = w.computeSize?.(this.size[0])[1] ?? LiteGraph.NODE_WIDGET_HEIGHT;
            fixedWidgetsHeight += widgetHeight;
            if (index < fixedWidgets.length - 1) {
                fixedWidgetsHeight += paddingBetweenWidgets;
            }
        });

        let roomWidgetsHeight = 0;
        this.roomSelectors.forEach((w, index) => {
            const roomHeight = w.computeSize?.(this.size[0])[1] ?? LiteGraph.NODE_WIDGET_HEIGHT;
            roomWidgetsHeight += roomHeight;
            if (index < this.roomSelectors.length - 1) {
                roomWidgetsHeight += paddingBetweenWidgets;
            }
        });

        const sectionPadding = this.roomSelectors.length > 0 ? paddingBetweenWidgets : 0;
        this.size[1] = baseHeight + fixedWidgetsHeight + sectionPadding + roomWidgetsHeight + bottomPadding;

        this.widgets.forEach(w => {
            w.options.width = w.name === "Scene Name" ? 300 :
                             w.name === "➕" ? 40 :
                             w.name === "➖" ? 40 :
                             w.name === "🔄" ? 40 :
                             w.name === "Debug" ? 100 :
                             w.name.startsWith("Select Room") ? this.size[0] - 20 : 300;
        });

        if (this.properties.debug) {
            console.log(`[SceneManagerNode] Updated size: width=${this.size[0]}, height=${this.size[1]}`);
        }

        this.setSize([this.size[0], this.size[1]]);
        this.setDirtyCanvas(true, true);
    }

    save() {
        localStorage.setItem(`scene_manager_${this.id}`, JSON.stringify(this.properties));
        if (this.properties.debug) console.log(`[SceneManagerNode] Saved: ${JSON.stringify(this.properties)}`);
    }

    load() {
        const saved = localStorage.getItem(`scene_manager_${this.id}`);
        if (saved) {
            this.properties = JSON.parse(saved);
            this.fetchRooms();
            this.updateWidgets();
            if (this.properties.debug) console.log(`[SceneManagerNode] Loaded: ${JSON.stringify(this.properties)}`);
        }
    }

    // In SceneManagerNode.js, onExecute
    onExecute() {
        const messages = [];
        const toggle = this.getInputData(0);
        const hsv = this.getInputData(1);
        const enable = this.getInputData(2);
        const isEnabled = enable !== undefined ? enable : true;

        const inputState = JSON.stringify({ toggle, hsv, enable });
        if (this.properties.debug && inputState !== this.lastInputState) {
            console.log(`[SceneManagerNode] Inputs - toggle: ${toggle}, hsv: ${JSON.stringify(hsv)}, enable: ${isEnabled}, lastTriggerState: ${this.lastTriggerState}`);
            console.log(`[SceneManagerNode] Enable input type: ${typeof enable}, value: ${enable}, source: ${this.getInputLink(2)?.origin_node?.title || 'none'}`);
        }
        this.lastInputState = inputState;

        if (this.lastTriggerState === undefined) {
            this.lastTriggerState = false;
        }

        const currentMessages = SceneManagerNode.sharedMessages[this.properties.sceneName] || [];

        if (isEnabled && toggle) {
            if (hsv && typeof hsv === "object" && "hue" in hsv && "saturation" in hsv && "brightness" in hsv) {
                const rooms = this.availableRooms.filter(room => this.properties.selectedRoomNames.includes(room.name));
                rooms.forEach(room => {
                    room.devices.forEach(deviceId => {
                        const message = {
                            lightId: deviceId,
                            toggle: toggle,
                            hsv: hsv,
                            enable: isEnabled,
                            sceneName: this.properties.sceneName
                        };
                        messages.push(message);
                        if (this.properties.debug) {
                            console.log(`[SceneManagerNode] Generated message for ${deviceId} in room ${room.name}: ${JSON.stringify(message)}`);
                        }
                    });
                });
                if (JSON.stringify(currentMessages) !== JSON.stringify(messages)) {
                    SceneManagerNode.sharedMessages[this.properties.sceneName] = messages;
                    if (this.properties.debug) {
                        console.log(`[SceneManagerNode] Stored ${messages.length} messages in shared buffer for scene "${this.properties.sceneName}"`);
                    }
                }
            } else {
                if (this.properties.debug) {
                    console.log(`[SceneManagerNode] Invalid HSV input: ${JSON.stringify(hsv)}`);
                }
            }
        } else if (!toggle && currentMessages.length > 0) {
            SceneManagerNode.sharedMessages[this.properties.sceneName] = [];
            if (this.properties.debug) {
                console.log(`[SceneManagerNode] Cleared messages for scene "${this.properties.sceneName}" in shared buffer`);
            }
        }

        this.lastTriggerState = toggle;
        this.setOutputData(0, messages);
    }

    onDrawForeground(ctx) {
        if (this.flags.collapsed) return;

        ctx.fillStyle = "#FFF";
        ctx.font = "12px Arial";
        ctx.textAlign = "left";
        ctx.fillText(`Rooms: ${this.properties.selectedRoomNames.filter(name => name).length}`, 10, this.size[1] - 10);
    }

    onRemoved() {
        if (this.properties.sceneName in SceneManagerNode.sharedMessages) {
            delete SceneManagerNode.sharedMessages[this.properties.sceneName];
            if (this.properties.debug) console.log(`[SceneManagerNode] Removed messages for scene "${this.properties.sceneName}" from shared buffer`);
        }
    }

    serialize() {
        const data = super.serialize();
        data.properties = { ...this.properties };
        data.lastTriggerState = this.lastTriggerState;
        data.availableRooms = this.availableRooms;
        return data;
    }

    configure(data) {
        super.configure(data);
        if (data.properties) {
            this.properties = { ...data.properties };
        }
        this.lastTriggerState = data.lastTriggerState !== undefined ? data.lastTriggerState : false;
        this.availableRooms = data.availableRooms || [];
        this.fetchRooms();
        this.updateWidgets();
        if (this.properties.debug) console.log(`[SceneManagerNode] Configured with data: ${JSON.stringify(data)}`);
    }
}

if (!LiteGraph.registered_node_types || !LiteGraph.registered_node_types["Scenes/scene_manager"]) {
    LiteGraph.registerNodeType("Scenes/scene_manager", SceneManagerNode);
    console.log("SceneManagerNode - Registered successfully under 'Scenes' category.");
}

if (!SceneManagerNode.sharedMessages) {
    SceneManagerNode.sharedMessages = {};
}