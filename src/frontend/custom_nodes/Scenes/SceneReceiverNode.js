// File: custom_nodes/Scenes/SceneReceiverNode.js
class SceneReceiverNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Scene Receiver";
        this.size = [200, 150];
        this.bgcolor = "rgb(120, 150, 70)";

        this.addInput("Messages", "array");
        this.addOutput("Scene Commands", "scene_commands");
        this.addOutput("Enabled", "boolean");

        this.properties = {
            debug: false,
            messageCount: 0
        };

        this.statusWidget = this.addWidget("text", "Status", "Idle", null, { readonly: true });
        this.messageCountWidget = this.addWidget("text", "Messages Received", this.properties.messageCount.toString(), null, { readonly: true });
        this.debugWidget = this.addWidget("toggle", "Debug", this.properties.debug, (v) => {
            this.properties.debug = v;
            console.log(`[SceneReceiverNode] Debug ${v ? "enabled" : "disabled"}`);
        }, { width: 100 });

        this.lastEnabledState = false;
        this.lastOutputCommands = [];
        this.lastFetchedMessages = [];
    }

    // In SceneReceiverNode.js, onExecute
    onExecute() {
        let messages = this.getInputData(0) || [];
        if (!messages.length && SceneManagerNode.sharedMessages) {
            const currentMessages = Object.values(SceneManagerNode.sharedMessages).flat();
            const currentMessagesStr = JSON.stringify(currentMessages);
            if (this.properties.debug && currentMessagesStr !== JSON.stringify(this.lastFetchedMessages)) {
                console.log(`[SceneReceiverNode] Checking sharedMessages: ${JSON.stringify(SceneManagerNode.sharedMessages)}`);
            }
            if (currentMessagesStr !== JSON.stringify(this.lastFetchedMessages)) {
                messages = currentMessages;
                this.lastFetchedMessages = messages;
                if (this.properties.debug && messages.length > 0) {
                    console.log(`[SceneReceiverNode] Fetched ${messages.length} messages wirelessly from all SceneManagerNodes`);
                }
            }
        }

        let outputCommands = [];
        let enabled = false;

        if (Array.isArray(messages) && messages.length > 0) {
            outputCommands = messages.map(message => {
                if (message && typeof message === "object" && "hsv" in message && "lightId" in message) {
                    if (this.properties.debug) {
                        console.log(`[SceneReceiverNode] Processing message: ${JSON.stringify(message)}`);
                    }
                    const toggle = typeof message.toggle === 'boolean' ? message.toggle : (typeof message.enable === 'boolean' ? message.enable : true);
                    enabled = (typeof message.enable === 'boolean' ? message.enable : true) && toggle;
                    const normalizedHsv = {
                        hue: message.hsv.hue <= 1 ? message.hsv.hue * 360 : (typeof message.hsv.hue === 'number' ? message.hsv.hue : 0),
                        saturation: message.hsv.saturation <= 1 ? message.hsv.saturation * 254 : (typeof message.hsv.saturation === 'number' ? message.hsv.saturation : 254),
                        brightness: message.hsv.brightness <= 1 ? message.hsv.brightness * 254 : (typeof message.hsv.brightness === 'number' ? message.hsv.brightness : 254)
                    };
                    const command = {
                        deviceId: message.lightId,
                        toggle: toggle,
                        hsv: normalizedHsv
                    };
                    if (this.properties.debug) {
                        console.log(`[SceneReceiverNode] Generated command: ${JSON.stringify(command)}`);
                    }
                    return command;
                }
                if (this.properties.debug) {
                    console.log(`[SceneReceiverNode] Skipping invalid message: ${JSON.stringify(message)}`);
                }
                return null;
            }).filter(cmd => cmd !== null);

            this.properties.messageCount += outputCommands.length;
            this.messageCountWidget.value = this.properties.messageCount.toString();

            if (this.properties.debug) {
                console.log(`[SceneReceiverNode] Processed ${outputCommands.length} scene commands: ${JSON.stringify(outputCommands)}`);
            }
            this.statusWidget.value = `Active: ${outputCommands.length} commands`;

            Object.keys(SceneManagerNode.sharedMessages).forEach(sceneName => {
                SceneManagerNode.sharedMessages[sceneName] = [];
            });
            if (this.properties.debug) console.log(`[SceneReceiverNode] Cleared sharedMessages after processing`);
        } else {
            this.statusWidget.value = "No data";
        }

        this.setOutputData(0, outputCommands.length > 0 ? outputCommands : []);
        if (this.properties.debug && enabled !== this.lastEnabledState) {
            console.log(`[SceneReceiverNode] Outputting enabled: ${enabled}`);
        }

        if (this.lastEnabledState !== enabled) {
            this.lastEnabledState = enabled;
            this.setDirtyCanvas(true);
        }

        this.updateNodeSize();
    }

    updateNodeSize() {
        this.size[0] = 200;
        const baseHeight = 40;
        let widgetsHeight = 0;
        this.widgets.forEach(w => {
            widgetsHeight += w.computeSize ? w.computeSize(this.size[0])[1] : LiteGraph.NODE_WIDGET_HEIGHT;
        });
        this.size[1] = baseHeight + widgetsHeight + 55;
        this.setSize([this.size[0], this.size[1]]);
        this.setDirtyCanvas(true, true);
    }

    onDrawForeground(ctx) {
        if (this.flags.collapsed) return;

        ctx.fillStyle = "#FFF";
        ctx.font = "12px Arial";
        ctx.textAlign = "left";
        ctx.fillText(`Enabled: ${this.lastEnabledState}`, 10, this.size[1] - 10);
    }

    save() {
        localStorage.setItem(`scene_receiver_${this.id}`, JSON.stringify(this.properties));
        if (this.properties.debug) console.log(`[SceneReceiverNode] Saved: ${JSON.stringify(this.properties)}`);
    }

    load() {
        const saved = localStorage.getItem(`scene_receiver_${this.id}`);
        if (saved) {
            this.properties = JSON.parse(saved);
            this.messageCountWidget.value = this.properties.messageCount.toString();
            this.debugWidget.value = this.properties.debug;
            if (this.properties.debug) console.log(`[SceneReceiverNode] Loaded: ${JSON.stringify(this.properties)}`);
        }
    }

    serialize() {
        const data = super.serialize();
        data.properties = { ...this.properties };
        data.lastEnabledState = this.lastEnabledState;
        data.lastOutputCommands = this.lastOutputCommands;
        data.lastFetchedMessages = this.lastFetchedMessages;
        return data;
    }

    configure(data) {
        super.configure(data);
        if (data.properties) {
            this.properties = { ...data.properties };
        }
        this.lastEnabledState = data.lastEnabledState !== undefined ? data.lastEnabledState : false;
        this.lastOutputCommands = data.lastOutputCommands || [];
        this.lastFetchedMessages = data.lastFetchedMessages || [];
        this.messageCountWidget.value = this.properties.messageCount.toString();
        this.debugWidget.value = this.properties.debug;
        this.updateNodeSize();
        if (this.properties.debug) console.log(`[SceneReceiverNode] Configured with data: ${JSON.stringify(data)}`);
    }
}

LiteGraph.registerNodeType("Scenes/SceneReceiver", SceneReceiverNode);