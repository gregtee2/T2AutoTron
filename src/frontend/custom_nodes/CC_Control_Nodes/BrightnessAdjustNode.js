class BrightnessAdjustNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Brightness Adjust";
        this.size = [200, 120];
        this.properties = {
            brightness: 128,
            enabled: true
        };
        this.setupWidgets();
        this.setupInputsOutputs();
        this.updateSize();
    }

    setupWidgets() {
        this.addWidget(
            "slider",
            "Brightness",
            this.properties.brightness,
            (value) => {
                this.properties.brightness = Math.round(value);
                this.setDirtyCanvas(true);
            },
            { min: 0, max: 254, step: 1, tooltip: "Adjust the brightness (0-254)." }
        );

        this.addWidget(
            "toggle",
            "Enabled",
            this.properties.enabled,
            (value) => {
                this.properties.enabled = value;
                this.setDirtyCanvas(true);
            },
            { tooltip: "Enable or disable brightness adjustment. Disabled passes input unchanged." }
        );
    }

    setupInputsOutputs() {
        this.addInput("HSV In", "hsv_info");
        this.addInput("Enable", "boolean");
        this.addOutput("HSV Out", "hsv_info");
    }

    updateSize() {
        const widgetHeight = this.widgets.length * LiteGraph.NODE_WIDGET_HEIGHT;
        this.size[1] = Math.max(widgetHeight + 40, 120);
        this.setDirtyCanvas(true);
    }

    onExecute() {
        const hsvInput = this.getInputData(0);
        const enableInput = this.getInputData(1);

        // Determine if the node is enabled (use input if provided, otherwise use property)
        const isEnabled = enableInput !== undefined ? enableInput : this.properties.enabled;

        if (!hsvInput) {
            // No input, pass through default or nothing
            this.setOutputData(0, null);
            return;
        }

        // Create output HSV object
        const hsvOutput = {
            hue: hsvInput.hue,
            saturation: hsvInput.saturation,
            brightness: isEnabled ? this.properties.brightness : hsvInput.brightness,
            transition: hsvInput.transition || 0
        };

        this.setOutputData(0, hsvOutput);
    }

    onDrawForeground(ctx) {
        if (this.flags.collapsed) return;

        // Visual feedback for enabled state
        const statusX = this.size[0] - 15;
        const statusY = 10;
        ctx.beginPath();
        ctx.arc(statusX, statusY, 5, 0, 2 * Math.PI);
        ctx.fillStyle = this.properties.enabled ? "#0F0" : "#F00";
        ctx.fill();

        // Display current brightness value
        ctx.fillStyle = "#FFF";
        ctx.font = "10px Arial";
        ctx.textAlign = "left";
        ctx.fillText(`B: ${this.properties.brightness}`, 15, this.size[1] - 10);
    }

    serialize() {
        const data = super.serialize();
        data.properties = { ...this.properties };
        return data;
    }

    configure(data) {
        super.configure(data);
        this.properties = { ...this.properties, ...data.properties };
        this.widgets[0].value = this.properties.brightness;
        this.widgets[1].value = this.properties.enabled;
        this.setDirtyCanvas(true);
    }
}

LiteGraph.registerNodeType("CC_Control_Nodes/brightness_adjust", BrightnessAdjustNode);