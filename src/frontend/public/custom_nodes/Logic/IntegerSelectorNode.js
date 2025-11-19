class IntegerSelectorNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Integer Selector";
        this.size = [200, 60];
        this.bgcolor = "rgb(38, 56, 90)"; // Background color

        // Node properties
        this.properties = {
            value: 0, // Selected integer value
            min: 0,   // Minimum value
            max: 10   // Maximum value
        };

        // Output
        this.addOutput("Value", "number");

        // Add a single slider widget for selecting integers
        this.sliderWidget = this.addWidget(
            "slider",
            "Select",
            this.properties.value,
            (value) => {
                // Round the value and clamp it within the range
                this.properties.value = Math.round(value);
                this.properties.value = Math.max(this.properties.min, Math.min(this.properties.max, this.properties.value));

                // Update the widget display value
                this.sliderWidget.value = this.properties.value;
            },
            { min: this.properties.min, max: this.properties.max, step: 1, precision: 0 } // Integer-only slider
        );
    }

    /**
     * Execute the node: Output the selected value
     */
    onExecute() {
        // Output the selected value
        this.setOutputData(0, this.properties.value);
    }

    /**
     * Serialize the node's state.
     */
    serialize() {
        const data = super.serialize();
        data.properties = { ...this.properties }; // Save properties
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
                this.sliderWidget.value = this.properties.value;
                this.sliderWidget.options.min = this.properties.min;
                this.sliderWidget.options.max = this.properties.max;
            }
        }
    }
}

// Register the node
LiteGraph.registerNodeType("Input/IntegerSelector", IntegerSelectorNode);
console.log("IntegerSelectorNode - Registered successfully under 'Input' category.");
