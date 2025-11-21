class OffsetValueNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Offset Value";
        this.size = [200, 100];
        this.properties = { offset: 0 }; // Default offset value

        this.addInput("Input", "hsv_info");
        this.addOutput("Output", "hsv_info");

        // Add a widget to control the offset
        this.addWidget("number", "Offset", this.properties.offset, (value) => {
            this.properties.offset = value;
        });
    }

    onExecute() {
        // Get the input HSV info
        const hsvInfo = this.getInputData(0);

        if (hsvInfo) {
            // Apply the offset to the hue
            const offsetHue = (hsvInfo.hue * 360 + this.properties.offset) % 360;

            // Ensure the hue is within the 0-1 range
            const normalizedHue = offsetHue < 0 ? (offsetHue + 360) / 360 : offsetHue / 360;

            // Create a new HSV object with the offset applied
            const offsetHSVInfo = {
                hue: normalizedHue,
                saturation: hsvInfo.saturation, // Keep saturation the same
                brightness: hsvInfo.brightness  // Keep brightness the same
            };

            // Output the modified HSV info
            this.setOutputData(0, offsetHSVInfo);
        }
    }

    // Serialize the node's properties to save its state
    serialize() {
        const data = super.serialize();
        data.properties = this.properties;
        return data;
    }

    // Configure the node's properties when loading from a saved state
    configure(data) {
        super.configure(data);
        this.properties = data.properties || { offset: 0 };
        this.widgets[0].value = this.properties.offset; // Update the widget value
    }
}

// Register the node type with LiteGraph
LiteGraph.registerNodeType("custom/offset_value", OffsetValueNode);
