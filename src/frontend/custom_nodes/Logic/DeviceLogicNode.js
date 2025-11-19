// custom_nodes/Logic/DeviceLogicNode.js
class DeviceLogicNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Device Logic";
        this.size = [400, 300];
        this.bgcolor = "rgb(50, 68, 73)";

        this.properties = {
            triggerDeviceId: "",
            condition: { property: "on", operator: "=", value: true },
            action: { deviceId: "", sync: false, on: true, brightness: null }
        };

        this.addInput("Trigger", "boolean", { optional: true });
        this.addOutput("Result", "boolean");
        this.addOutput("Action Trigger", "boolean");

        this.API_URL = "http://localhost:3000";
        this.devices = [];
        this.deviceStates = {};
        this.socket = null;

        this.deviceDropdown = this.addWidget("combo", "If Device", "", (v) => {
            this.properties.triggerDeviceId = v;
            this.updateDeviceState();
            this.evaluateLogic();
            this.setDirtyCanvas(true);
        }, { values: [""] });

        this.opWidget = this.addWidget("combo", "Is", this.properties.condition.operator, (v) => {
            this.properties.condition.operator = v;
            this.evaluateLogic();
        }, { values: ["=", "!=", ">", "<", ">=", "<="] });

        this.propWidget = this.addWidget("combo", "State", this.properties.condition.property, (v) => {
            this.properties.condition.property = v;
            this.rebuildConditionWidget();
            this.evaluateLogic();
        }, { values: ["on", "brightness", "hue", "saturation"] });

        this.valWidget = null;
        this.rebuildConditionWidget();

        this.actionDeviceWidget = this.addWidget("combo", "Then Device", this.properties.action.deviceId, (v) => {
            this.properties.action.deviceId = v;
            this.executeAction();
        }, { values: [""] });

        this.syncWidget = this.addWidget("toggle", "Sync with Trigger", this.properties.action.sync, (v) => {
            this.properties.action.sync = v;
            this.rebuildActionWidgets();
            this.executeAction();
        });

        this.actionOnWidget = this.addWidget("combo", "Set On", this.properties.action.on ? "On" : "Off", (v) => {
            this.properties.action.on = v === "On";
            this.executeAction();
        }, { values: ["Off", "On"], disabled: this.properties.action.sync });

        this.actionBriWidget = this.addWidget("number", "Set Brightness", this.properties.action.brightness || 0, (v) => {
            this.properties.action.brightness = v;
            this.executeAction();
        }, { min: 0, max: 100, step: 1, disabled: this.properties.action.sync });

        this.statusWidget = this.addWidget("text", "Status", "Initializing...", null, { readonly: true });

        this.initializeSocketIO();
    }

    initializeSocketIO() {
        if (!this.socket) {
            console.log('[DeviceLogicNode] Initializing Socket.IO...');
            this.socket = io(this.API_URL, {
                reconnection: true,
                reconnectionAttempts: 10,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
                timeout: 10000
            });

            this.socket.on('connect', () => {
                console.log('[DeviceLogicNode] Connected to Socket.IO server.');
                this.updateStatus("Connected to server.");
                this.fetchDevices();
            });

            this.socket.on('connect_error', (err) => {
                console.error('[DeviceLogicNode] Connection error:', err.message);
                this.updateStatus(`Connection error: ${err.message}`);
            });

            this.socket.on('disconnect', () => {
                console.log('[DeviceLogicNode] Disconnected from Socket.IO server.');
                this.updateStatus("Disconnected from server.");
            });

            this.socket.on('device-state-update', (data) => {
                console.log('[SocketIO] Received device-state-update:', data);
                this.deviceStates[data.id] = {
                    on: data.on,
                    brightness: data.brightness || null,
                    hue: data.hue || null,
                    saturation: data.saturation || null,
                    timestamp: data.timestamp || Date.now()
                };
                console.log('[SocketIO] Updated deviceStates:', this.deviceStates);
                this.updateDeviceState();
                this.evaluateLogic();
            });
        }
    }

    onAdded() {
        this.fetchDevices();
        setTimeout(() => this.fetchDevices(), 1000);
    }

    async fetchDevices() {
        console.log('[DeviceLogicNode] Fetching devices...');
        try {
            const response = await fetch(`${this.API_URL}/api/devices`);
            const data = await response.json();
            console.log('[fetchDevices] Raw API response:', data);
            if (data.success) {
                this.devices = [
                    ...data.devices.hue.map(d => ({ id: d.id, name: d.name, vendor: "Hue" })),
                    ...data.devices.kasa.map(d => ({ id: d.id, name: d.name, vendor: "Kasa" })),
                    ...data.devices.matter.map(d => ({ id: d.id, name: d.name, vendor: "Matter" }))
                ];
                const deviceOptions = ["", ...this.devices.map(d => `${d.vendor}_${d.id} - ${d.name}`)];
                this.deviceDropdown.options.values = deviceOptions;
                this.actionDeviceWidget.options.values = deviceOptions;
                this.updateDeviceStates(data.devices);
                console.log('[fetchDevices] Updated deviceStates:', this.deviceStates);
                this.updateStatus(`Fetched ${this.devices.length} devices.`);
            }
        } catch (error) {
            console.error('[DeviceLogicNode] Error fetching devices:', error);
            this.updateStatus(`Error fetching devices: ${error.message}`);
        }
    }

    updateDeviceStates(devices) {
        devices.hue.forEach(d => {
            this.deviceStates[d.id] = { on: d.state.on, brightness: d.state.bri ? Math.round(d.state.bri / 2.54) : null, hue: d.state.hue, saturation: d.state.sat };
        });
        devices.kasa.forEach(d => {
            this.deviceStates[d.id] = { on: d.state.on, brightness: d.state.brightness, hue: d.state.hue, saturation: d.state.saturation };
        });
        devices.matter.forEach(d => {
            this.deviceStates[d.id] = { on: d.state.on, brightness: null, hue: null, saturation: null };
        });
    }

    rebuildConditionWidget() {
        if (this.valWidget) this.removeWidget(this.valWidget);
        const cond = this.properties.condition;
        if (cond.property === "on") {
            this.valWidget = this.addWidget("combo", "Value", cond.value ? "On" : "Off", (v) => {
                this.properties.condition.value = v === "On";
                this.evaluateLogic();
            }, { values: ["Off", "On"] });
        } else {
            this.valWidget = this.addWidget("number", "Value", cond.value || 0, (v) => {
                this.properties.condition.value = v;
                this.evaluateLogic();
            }, { min: 0, max: 255, step: 1 });
        }
        this.setDirtyCanvas(true);
    }

    rebuildActionWidgets() {
        this.actionOnWidget.disabled = this.properties.action.sync;
        this.actionBriWidget.disabled = this.properties.action.sync;
        this.setDirtyCanvas(true);
    }

    removeWidget(widget) {
        const index = this.widgets.indexOf(widget);
        if (index !== -1) {
            this.widgets.splice(index, 1);
        }
    }

    updateDeviceState() {
        if (!this.properties.triggerDeviceId) {
            this.triggerState = { on: false, brightness: null, hue: null, saturation: null };
            console.log('[updateDeviceState] No trigger device selected, triggerState:', this.triggerState);
            return;
        }
        const fullId = this.properties.triggerDeviceId.split(" - ")[0];
        const deviceId = fullId.replace(/^(Hue|Kasa|Matter)_/, '');
        console.log('[updateDeviceState] Full ID:', fullId, 'Parsed ID:', deviceId);
        console.log('[updateDeviceState] deviceStates:', this.deviceStates);
        this.triggerState = this.deviceStates[deviceId] || { on: false, brightness: null, hue: null, saturation: null };
        console.log('[updateDeviceState] Set triggerState:', this.triggerState);
    }

    evaluateLogic() {
        this.updateDeviceState();
        console.log('[evaluateLogic] triggerState:', this.triggerState);
        const triggerInput = this.getInputData(0);
        if (triggerInput !== undefined && !triggerInput) {
            this.setOutputData(0, false);
            this.setOutputData(1, false);
            return;
        }

        if (!this.properties.triggerDeviceId || !this.triggerState) {
            this.setOutputData(0, false);
            this.setOutputData(1, false);
            return;
        }

        const cond = this.properties.condition;
        const value = this.triggerState[cond.property];
        let result = false;

        if (value !== null && value !== undefined) {
            switch (cond.operator) {
                case "=": result = value == cond.value; break;
                case "!=": result = value != cond.value; break;
                case ">": result = value > cond.value; break;
                case "<": result = value < cond.value; break;
                case ">=": result = value >= cond.value; break;
                case "<=": result = value <= cond.value; break;
            }
        }

        console.log('[evaluateLogic] Condition:', cond, 'Value:', value, 'Result:', result);
        this.setOutputData(0, result);
        this.setOutputData(1, result);
        if (result) this.executeAction();
    }

    executeAction() {
        if (!this.socket || !this.properties.action.deviceId) return;
        const deviceId = this.properties.action.deviceId.split(" - ")[0].replace(/^(Hue|Kasa|Matter)_/, '');
        let controlData = { id: deviceId };
        if (this.properties.action.sync && this.triggerState) {
            controlData = { ...controlData, ...this.triggerState };
        } else {
            controlData.on = this.properties.action.on;
            if (this.properties.action.brightness !== null) controlData.brightness = this.properties.action.brightness;
        }
        this.socket.emit('device-control', controlData);
        console.log('[DeviceLogicNode] Sent device-control:', controlData);
    }

    onExecute() {
        this.updateDeviceState();
        this.evaluateLogic();
    }

    onConfigure(info) {
        this.properties = Object.assign(this.properties || {}, info.properties);
        this.fetchDevices().then(() => {
            this.rebuildConditionWidget();
            this.rebuildActionWidgets();
            this.evaluateLogic();
        });
    }

    updateStatus(newStatus) {
        this.statusWidget.value = newStatus;
        this.setDirtyCanvas(true);
    }

    onDrawForeground(ctx) {
        if (this.flags.collapsed) return;
        ctx.lineWidth = 4;
        ctx.strokeStyle = this.triggerState && this.triggerState.on ? "green" : "gray";
        ctx.strokeRect(0, 0, this.size[0], this.size[1]);

        ctx.font = "14px Arial";
        ctx.fillStyle = "#FFFFFF";
        ctx.textAlign = "left";

        // Adjust text positioning (3 lines now)
        const textStartY = this.size[1] - 60; // Move up to fit 3 lines (20px per line)
        const triggerName = this.properties.triggerDeviceId ? this.properties.triggerDeviceId.split(" - ")[1] || "Unknown" : "None";
        ctx.fillText(`Trigger: ${triggerName}`, 10, textStartY);
        if (this.triggerState) {
            ctx.fillText(`State: on=${this.triggerState.on}, bri=${this.triggerState.brightness || 'N/A'}`, 10, textStartY + 20);
        }

        // Natural language overlay
        let logicText = "No logic defined";
        if (this.properties.triggerDeviceId && this.properties.action.deviceId) {
            const triggerDevice = this.properties.triggerDeviceId.split(" - ")[1] || "Unknown";
            const targetDevice = this.properties.action.deviceId.split(" - ")[1] || "Unknown";
            const conditionProp = this.properties.condition.property;
            const conditionOp = this.properties.condition.operator === "=" ? "is" : 
                               this.properties.condition.operator === "!=" ? "is not" : 
                               this.properties.condition.operator;
            const conditionVal = conditionProp === "on" ? (this.properties.condition.value ? "On" : "Off") : this.properties.condition.value;
            const actionText = this.properties.action.sync ? "mirrors trigger" : 
                              `set to ${this.properties.action.on ? "On" : "Off"}${this.properties.action.brightness !== null ? `, brightness ${this.properties.action.brightness}` : ""}`;
            logicText = `If ${triggerDevice} ${conditionOp} ${conditionProp} ${conditionVal}, then ${targetDevice} ${actionText}`;
        }
        ctx.fillText(logicText, 10, textStartY + 40); // Third line
    }

    onRemoved() {
        if (this.socket) this.socket.disconnect();
    }

    computeSize() {
        return this.size;
    }
}

LiteGraph.registerNodeType("Logic/DeviceLogic", DeviceLogicNode);
console.log("DeviceLogicNode registered successfully under 'Logic' category");