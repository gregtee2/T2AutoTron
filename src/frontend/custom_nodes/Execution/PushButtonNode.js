if (!LiteGraph.registered_node_types?.["Execution/pushbutton"]) {
    class PushButtonNode extends LiteGraph.LGraphNode {
        constructor() {
            super();
            this.title = "Simple On/Off";
            this.size = [200, 160];
            this.properties = { 
                state: false,
                pulseMode: false
            };
            this.addInput("Toggle", "boolean");
            this.addOutput("State", "boolean");
            this.lastTriggered = 0;
            this.lastInput = null;
            this.initialized = false;
            this.pulseTimeout = null;
            this.isLoaded = false;

            this.pulseWidget = this.addWidget("toggle", "Pulse Mode", this.properties.pulseMode, (value) => {
                this.properties.pulseMode = value;
                if (this.pulseTimeout) {
                    clearTimeout(this.pulseTimeout);
                    this.pulseTimeout = null;
                }
                this.setOutputData(0, this.properties.pulseMode ? null : this.properties.state);
                this.setDirtyCanvas(true);
                console.log(`PushButtonNode ${this.id} set to ${value ? "Pulse" : "Steady"} mode`);
            }, { values: [false, true] });
            console.log(`PushButtonNode ${this.id} constructed, initial state: ${this.properties.state}`);
        }

        // Updated to force pulse on load/paste
        onAdded() {
            console.log(`PushButtonNode ${this.id} onAdded called at ${Date.now()}, state: ${this.properties.state}, pulseMode: ${this.properties.pulseMode}, isLoaded: ${this.isLoaded}`);
            setTimeout(() => {
                console.log(`PushButtonNode ${this.id} firing pulse at ${Date.now()}, state: ${this.properties.state}`);
                this.handlePulseOutput(this.properties.state);
                console.log(`PushButtonNode ${this.id} fired delayed pulse: ${this.properties.state} after 1000ms on graph load or paste`);
            }, 1000);
        }

        onMouseDown(e, pos) {
            const borderThickness = 5;
            if (
                pos[0] >= borderThickness &&
                pos[0] <= this.size[0] - borderThickness &&
                pos[1] >= borderThickness &&
                pos[1] <= this.size[1] - borderThickness
            ) {
                this.properties.state = !this.properties.state;
                this.lastTriggered = Date.now();
                this.setDirtyCanvas(true);

                if (this.properties.pulseMode) {
                    this.handlePulseOutput(this.properties.state);
                } else {
                    this.setOutputData(0, this.properties.state);
                    this.triggerSlot(0);
                }

                this.color = this.properties.state ? "#6c6" : "#c66";
                console.log(`PushButtonNode ${this.id} toggled to ${this.properties.state} at ${this.lastTriggered}`);
            }
        }

        handlePulseOutput(value) {
            if (this.pulseTimeout) {
                clearTimeout(this.pulseTimeout);
                this.pulseTimeout = null;
            }
            console.log(`PushButtonNode ${this.id} sending pulse with value: ${value} at ${Date.now()}`);
            this.setOutputData(0, value);
            this.triggerSlot(0);
            this.pulseTimeout = setTimeout(() => {
                this.setOutputData(0, null);
                this.setDirtyCanvas(true);
                this.pulseTimeout = null;
                console.log(`PushButtonNode ${this.id} pulse ended, output set to null (idle) at ${Date.now()}`);
            }, 500);
        }

        onDrawForeground(ctx) {
            this.size[1] = 160;
            const borderThickness = 5;

            ctx.fillStyle = "#333";
            ctx.fillRect(0, 0, this.size[0], this.size[1]);

            ctx.fillStyle = this.properties.state ? "#6c6" : "#c66";
            ctx.fillRect(
                borderThickness,
                borderThickness,
                this.size[0] - borderThickness * 2,
                this.size[1] - borderThickness * 2
            );

            ctx.fillStyle = "#fff";
            ctx.font = "20px Arial";
            ctx.textAlign = "center";
            ctx.fillText(
                this.properties.state ? "ON" : "OFF",
                this.size[0] * 0.5,
                this.size[1] * 0.5 + 7
            );
        }

        onExecute() {
            const inputValue = this.getInputData(0);

            if (!this.initialized && inputValue !== undefined) {
                if (inputValue !== this.properties.state) {
                    this.properties.state = inputValue;
                    this.color = this.properties.state ? "#6c6" : "#c66";
                    this.lastTriggered = Date.now();
                    this.lastInput = inputValue;
                    this.setDirtyCanvas(true);
                    console.log(
                        `PushButtonNode ${this.id} initialized to ${this.properties.state} via input at ${this.lastTriggered}`
                    );
                    if (this.properties.pulseMode) {
                        this.handlePulseOutput(this.properties.state);
                    } else {
                        this.setOutputData(0, this.properties.state);
                    }
                }
                this.initialized = true;
            }

            if (
                inputValue !== undefined &&
                inputValue !== this.properties.state &&
                inputValue !== this.lastInput
            ) {
                this.properties.state = inputValue;
                this.color = this.properties.state ? "#6c6" : "#c66";
                this.lastTriggered = Date.now();
                this.lastInput = inputValue;
                this.setDirtyCanvas(true);
                console.log(
                    `PushButtonNode ${this.id} updated to ${this.properties.state} via input at ${this.lastTriggered}`
                );
                if (this.properties.pulseMode) {
                    this.handlePulseOutput(this.properties.state);
                } else {
                    this.setOutputData(0, this.properties.state);
                }
            }

            if (!this.properties.pulseMode && !this.pulseTimeout) {
                this.setOutputData(0, this.properties.state);
            }
        }

        serialize() {
            const data = super.serialize();
            data.properties = this.properties;
            data.lastTriggered = this.lastTriggered;
            data.lastInput = this.lastInput;
            data.initialized = this.initialized;
            data.isLoaded = this.isLoaded;
            return data;
        }

        configure(data) {
            super.configure(data);
            this.properties = data.properties || this.properties;
            this.lastTriggered = data.lastTriggered || 0;
            this.lastInput = data.lastInput || null;
            this.initialized = data.initialized || false;
            this.isLoaded = false; // Reset to allow pulse
            console.log(`PushButtonNode ${this.id} configured at ${Date.now()}, loaded state: ${this.properties.state}, pulseMode: ${this.properties.pulseMode}`);
            this.pulseWidget.value = this.properties.pulseMode;
            this.setDirtyCanvas(true);
        }

        onRemoved() {
            if (this.pulseTimeout) {
                clearTimeout(this.pulseTimeout);
                this.pulseTimeout = null;
            }
        }
    }

    LiteGraph.registerNodeType("Execution/pushbutton", PushButtonNode);
    console.log(`PushButtonNode registered successfully under 'Execution' category at ${Date.now()}`);
}