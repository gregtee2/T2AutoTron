class InputRangeSlicesNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Input Range Slices";
        this.size = [200, 100];
        this.bgcolor = "rgb(38, 56, 90)"; // Valid RGB color

        // Properties
        this.properties = {
            numberOfInputs: 3,   // Default number of inputs
            defaultOutput: -1,   // Output when no input is active
            debug: false         // Debug mode
        };

        // Output
        this.addOutput("Output", "number");

        // Initialize inputs
        this.initInputs();
    }

    /**
     * Initialize dynamic inputs based on the numberOfInputs property.
     */
    initInputs() {
        // Remove existing inputs
        for (let i = this.inputs.length - 1; i >= 0; i--) {
            this.removeInput(i);
        }

        // Add inputs dynamically
        for (let i = 0; i < this.properties.numberOfInputs; i++) {
            this.addInput(`Trigger${i}`, "*", { index: i }); // Accepts any type
        }
    }

    /**
     * Handle property changes dynamically (e.g., number of inputs).
     */
    onPropertyChanged(name, value) {
        if (name === "numberOfInputs") {
            // Clamp to a minimum of 1
            this.properties.numberOfInputs = Math.max(1, Math.round(value));
            this.initInputs();
            this.size = [200, 60 + this.properties.numberOfInputs * 20];
        }
        return false; // Prevent default behavior
    }

    /**
     * Main execution logic.
     */
    onExecute() {
        let outputValue = this.properties.defaultOutput;

        // Check each input
        for (let i = 0; i < this.inputs.length; i++) {
            const inputSignal = this.getInputData(i);
            if (typeof inputSignal === "boolean" && inputSignal === true) {
                outputValue = i; // Set output to the slot number
                break; // Stop at the first active input
            } else if (typeof inputSignal === "number") {
                outputValue = inputSignal; // Pass through numeric value
                break; // Stop at the first valid input
            }
        }

        // Set the output value
        this.setOutputData(0, outputValue);

        // Optional debug logging
        if (this.properties.debug) {
            console.log(`[InputRangeSlicesNode] Output: ${outputValue}`);
        }
    }

    /**
     * Draw additional information (e.g., number of inputs).
     */
    onDrawForeground(ctx) {
        super.onDrawForeground?.(ctx);

        ctx.fillStyle = "#FFF";
        ctx.font = "12px Arial";
        ctx.textAlign = "center";

        const text = `Inputs: ${this.properties.numberOfInputs}`;
        ctx.fillText(text, this.size[0] * 0.5, this.size[1] - 10);
    }

    /**
     * Save properties for serialization.
     */
    serialize() {
        const data = super.serialize();
        data.properties = { ...this.properties };
        return data;
    }

    configure(data) {
        super.configure(data);
        if (data.properties) {
            Object.assign(this.properties, data.properties);
            this.initInputs();
        }
    }
}

// Register the node
LiteGraph.registerNodeType("Logic/InputRangeSlices", InputRangeSlicesNode);
