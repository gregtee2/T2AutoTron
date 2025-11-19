class OffsetNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Value Offset Node";
        this.size = [200, 80]; // Adjusted size for the slider
        this.bgcolor = "rgb(88, 72, 18)"; // Valid RGB color

        // Node properties
        this.properties = {
            offset: 500 // Default offset in milliseconds
        };

        // Add input and output
        this.addInput("Input", "*");
        this.addOutput("Delayed Output", "*");

        // Add slider widget for the offset (integer values only)
        this.sliderWidget = this.addWidget(
            "slider",
            "Offset (ms)",
            this.properties.offset,
            (value) => {
                this.properties.offset = Math.round(value); // Ensure integer values
                this.sliderWidget.value = this.properties.offset;
            },
            { min: 0, max: 10000, step: 100, precision: 0 } // Slider configuration
        );
    }

    onExecute() {
        // Get the input data
        const inputData = this.getInputData(0);

        if (inputData !== undefined) {
            // Schedule the output after the specified delay
            setTimeout(() => {
                this.setOutputData(0, inputData);
                this.setDirtyCanvas(true); // Update the canvas to propagate the signal
            }, this.properties.offset);
        }
    }

    /**
     * Serialize the node's state.
     */
    serialize() {
        const data = super.serialize();
        data.properties = { ...this.properties }; // Include properties in the saved state
        return data;
    }

    /**
     * Restore the node's state.
     */
    configure(data) {
        super.configure(data);
        if (data.properties) {
            Object.assign(this.properties, data.properties);

            // Update the slider widget with restored properties
            if (this.sliderWidget) {
                this.sliderWidget.value = this.properties.offset;
            }
        }
    }
}

// Register the node
LiteGraph.registerNodeType("Utility/OffsetNode", OffsetNode);
console.log("OffsetNode - Registered successfully under 'Utility' category.");
