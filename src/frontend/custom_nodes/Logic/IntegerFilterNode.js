class IntegerFilterNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Integer Filter";
        this.size = [260, 140];
        this.bgcolor = "rgb(38, 56, 90)"; // Background color

        // Node properties
        this.properties = {
            matchValue: 0,    // Single integer to match
            multiMatch: "",   // Comma-separated list of integers
            min: 0,           // Minimum value
            max: 10           // Maximum value
        };

        // Inputs
        this.addInput("Value", "number");   // Incoming integer to check
        this.addInput("Payload", "*");     // Data to pass through

        // Outputs
        this.addOutput("Pass", "*");       // Payload if Value matches Match Integer
        this.addOutput("Fail", "*");       // Payload if Value does not match Match Integer

        // Add a slider widget for selecting the single integer to match
        this.sliderWidget = this.addWidget(
            "slider",
            "Match Integer",
            this.properties.matchValue,
            (value) => {
                // Round and clamp the value within the range
                this.properties.matchValue = Math.round(value);
                this.properties.matchValue = Math.max(this.properties.min, Math.min(this.properties.max, this.properties.matchValue));
                this.sliderWidget.value = this.properties.matchValue;
                this.setDirtyCanvas(true); // Redraw the node
            },
            { min: this.properties.min, max: this.properties.max, step: 1, precision: 0 } // Integer-only slider
        );

        // Add a text widget for selecting multiple integers
        this.addWidget(
            "text",
            "Multi-Match (comma-separated)",
            this.properties.multiMatch,
            (value) => {
                // Validate input: only allow numbers and commas
                this.properties.multiMatch = value.replace(/[^0-9,]/g, "").trim();
                this.setDirtyCanvas(true);
            }
        );
    }

    /**
     * Execute the node's logic.
     */
    onExecute() {
        const value = this.getInputData(0); // Get Value input
        const payload = this.getInputData(1); // Get Payload input

        // Parse the multiMatch property into an array of integers
        const multiMatchArray = this.properties.multiMatch
            .split(",")
            .map((v) => parseInt(v, 10))
            .filter((v) => !isNaN(v)); // Remove invalid values

        // Check if value matches the single integer or any in the multiMatch list
        if (value === this.properties.matchValue || multiMatchArray.includes(value)) {
            this.setOutputData(0, payload); // Send to "Pass" output
            this.setOutputData(1, null);   // Clear "Fail" output
        } else {
            this.setOutputData(0, null);   // Clear "Pass" output
            this.setOutputData(1, payload); // Send to "Fail" output
        }
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
                this.sliderWidget.value = this.properties.matchValue;
                this.sliderWidget.options.min = this.properties.min;
                this.sliderWidget.options.max = this.properties.max;
            }
        }
    }
}

// Register the node
LiteGraph.registerNodeType("Logic/IntegerFilter", IntegerFilterNode);
console.log("IntegerFilterNode - Registered successfully under 'Logic' category.");
