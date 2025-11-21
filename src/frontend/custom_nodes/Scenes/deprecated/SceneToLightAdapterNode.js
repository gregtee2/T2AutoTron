// File: custom_nodes/Scenes/SceneToLightAdapterNode.js
if (!LiteGraph.registered_node_types["Scenes/SceneToLightAdapter"]) {
    class SceneToLightAdapterNode extends LiteGraph.LGraphNode {
        constructor() {
            super();
            this.title = "Scene to Light Adapter";
            this.size = [250, 150];
            this.bgcolor = "rgb(100, 120, 140)";

            // Inputs
            this.addInput("Scene Commands", "scene_commands");

            // Outputs
            this.addOutput("HSV Info", "hsv_info");
            this.addOutput("Trigger", "boolean");

            // Properties
            this.properties = {
                deviceId: "",
                debug: false,
                status: "Idle"
            };

            // Widgets
            this.deviceIdWidget = this.addWidget(
                "text",
                "Device ID",
                this.properties.deviceId,
                (value) => {
                    this.properties.deviceId = value.trim();
                    this.updateStatus(`Device ID set to: ${this.properties.deviceId || "None"}`);
                },
                { width: 200 }
            );
            this.statusWidget = this.addWidget(
                "text",
                "Status",
                this.properties.status,
                null,
                { readonly: true, width: 200 }
            );
            this.debugWidget = this.addWidget(
                "toggle",
                "Debug",
                this.properties.debug,
                (value) => {
                    this.properties.debug = value;
                    console.log(`[SceneToLightAdapterNode] Debug ${value ? "enabled" : "disabled"}`);
                },
                { width: 100 }
            );

            // Internal state
            this.lastCommands = [];
            this.lastHsvOutput = null;
            this.lastTriggerOutput = false;

            this.updateNodeSize();
        }

        updateStatus(newStatus) {
            this.properties.status = newStatus;
            this.statusWidget.value = newStatus;
            this.setDirtyCanvas(true);
            if (this.properties.debug) {
                console.log(`[SceneToLightAdapterNode] Status: ${newStatus}`);
            }
        }

        updateNodeSize() {
            this.size[0] = 250;
            const baseHeight = 40;
            let widgetsHeight = 0;
            this.widgets.forEach(w => {
                widgetsHeight += w.computeSize ? w.computeSize(this.size[0])[1] : LiteGraph.NODE_WIDGET_HEIGHT;
            });
            this.size[1] = baseHeight + widgetsHeight + 55;
            this.setSize([this.size[0], this.size[1]]);
            this.setDirtyCanvas(true, true);
        }

        onExecute() {
            // Get input commands
            const commands = this.getInputData(0) || [];
            const commandsStr = JSON.stringify(commands);

            // Check if commands have changed
            if (commandsStr === JSON.stringify(this.lastCommands)) {
                // No change, output last values
                this.setOutputData(0, this.lastHsvOutput);
                this.setOutputData(1, this.lastTriggerOutput);
                return;
            }

            this.lastCommands = commands;

            // Find command for the specified deviceId
            const matchingCommand = Array.isArray(commands)
                ? commands.find(cmd => cmd && cmd.deviceId === this.properties.deviceId)
                : null;

            if (matchingCommand) {
                // Extract HSV and toggle
                const hsv = matchingCommand.hsv;
                const trigger = matchingCommand.toggle;

                // Validate HSV
                if (
                    hsv &&
                    typeof hsv.hue === "number" &&
                    typeof hsv.saturation === "number" &&
                    typeof hsv.brightness === "number"
                ) {
                    this.lastHsvOutput = {
                        hue: Math.max(0, Math.min(360, hsv.hue)),
                        saturation: Math.max(0, Math.min(254, hsv.saturation)),
                        brightness: Math.max(0, Math.min(254, hsv.brightness))
                    };
                    this.lastTriggerOutput = Boolean(trigger);

                    this.setOutputData(0, this.lastHsvOutput);
                    this.setOutputData(1, this.lastTriggerOutput);

                    this.updateStatus(
                        `Processing command for Light ${this.properties.deviceId}: ` +
                        `HSV(${this.lastHsvOutput.hue}, ${this.lastHsvOutput.saturation}, ${this.lastHsvOutput.brightness}), ` +
                        `Trigger: ${this.lastTriggerOutput}`
                    );

                    if (this.properties.debug) {
                        console.log(
                            `[SceneToLightAdapterNode] Output for ${this.properties.deviceId}: ` +
                            `HSV=${JSON.stringify(this.lastHsvOutput)}, Trigger=${this.lastTriggerOutput}`
                        );
                    }
                } else {
                    // Invalid HSV, output null/false
                    this.lastHsvOutput = null;
                    this.lastTriggerOutput = false;
                    this.setOutputData(0, null);
                    this.setOutputData(1, false);
                    this.updateStatus(`Invalid HSV data for Light ${this.properties.deviceId}`);
                }
            } else {
                // No matching command, output null/false
                this.lastHsvOutput = null;
                this.lastTriggerOutput = false;
                this.setOutputData(0, null);
                this.setOutputData(1, false);
                this.updateStatus(
                    this.properties.deviceId
                        ? `No command found for Light ${this.properties.deviceId}`
                        : `No Device ID specified`
                );
            }

            this.setDirtyCanvas(true);
        }

        onDrawForeground(ctx) {
            if (this.flags.collapsed) return;

            ctx.fillStyle = "#FFF";
            ctx.font = "12px Arial";
            ctx.textAlign = "left";
            ctx.fillText(
                `Trigger: ${this.lastTriggerOutput}`,
                10,
                this.size[1] - 20
            );
            ctx.fillText(
                `HSV: ${this.lastHsvOutput ? `(${this.lastHsvOutput.hue}, ${this.lastHsvOutput.saturation}, ${this.lastHsvOutput.brightness})` : "N/A"}`,
                10,
                this.size[1] - 10
            );
        }

        serialize() {
            const data = super.serialize();
            data.properties = { ...this.properties };
            data.lastHsvOutput = this.lastHsvOutput;
            data.lastTriggerOutput = this.lastTriggerOutput;
            data.lastCommands = this.lastCommands;
            return data;
        }

        configure(data) {
            super.configure(data);
            if (data.properties) {
                this.properties = { ...data.properties };
            }
            this.lastHsvOutput = data.lastHsvOutput || null;
            this.lastTriggerOutput = data.lastTriggerOutput || false;
            this.lastCommands = data.lastCommands || [];
            this.deviceIdWidget.value = this.properties.deviceId;
            this.statusWidget.value = this.properties.status;
            this.debugWidget.value = this.properties.debug;
            this.updateNodeSize();
            if (this.properties.debug) {
                console.log(`[SceneToLightAdapterNode] Configured with data: ${JSON.stringify(data)}`);
            }
        }
    }

    LiteGraph.registerNodeType("Scenes/SceneToLightAdapter", SceneToLightAdapterNode);
    console.log("SceneToLightAdapterNode - Registered successfully under 'Scenes' category.");
}