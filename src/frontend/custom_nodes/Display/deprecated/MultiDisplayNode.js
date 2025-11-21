class CombinedDisplayNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Combined Display";
        this.size = [200, 150];
        
        // Define Inputs
        this.addInput("Result", "boolean"); // Connect to AND/OR Result
        this.addInput("A", "*"); // Connect to AND/OR Input A
        this.addInput("B", "*"); // Connect to AND/OR Input B
        // Add more inputs dynamically if needed
        
        // Internal state to store input values
        this.inputValues = {
            Result: null,
            A: null,
            B: null,
            // Add more keys if you add more inputs
        };
        
        // Optional: Add a button to add more inputs dynamically
        this.addWidget("button", "Add Input", null, () => {
            const newInputIndex = Object.keys(this.inputValues).length;
            const newInputName = `Input${newInputIndex}`;
            this.addInput(newInputName, "*");
            this.inputValues[newInputName] = null;
            this.size = [this.size[0], this.size[1] + 20]; // Increase node height
            this.setDirtyCanvas(true); // Refresh the canvas to show new input
        });
    }

    onExecute() {
        // Iterate through all inputs and store their data
        for (let i = 0; i < this.inputs.length; i++) {
            const input = this.inputs[i];
            const data = this.getInputData(i);
            this.inputValues[input.name] = data;
        }
    }

    /**
     * Draw the text overlay on the node.
     */
    onDrawForeground(ctx) {
        ctx.fillStyle = "#FFFFFF"; // Default text color
        ctx.font = "14px Arial";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        
        let y = 10; // Starting y position

        // Display the Result
        if (this.inputValues["Result"] !== null) {
            const resultText = `Result: ${this.inputValues["Result"]}`;
            ctx.fillStyle = this.inputValues["Result"] ? "#28a745" : "#dc3545"; // Green for true, Red for false
            ctx.fillText(resultText, 10, y);
            y += 20;
        }

        // Display each input value
        for (let key in this.inputValues) {
            if (key === "Result") continue; // Skip Result as it's already displayed

            const value = this.inputValues[key];
            if (value === null || value === undefined) continue; // Skip if no data

            let displayText = `${key}: ${value}`;
            let color = "#FFFFFF"; // Default text color

            // Determine color based on type
            if (typeof value === "boolean") {
                color = value ? "#28a745" : "#dc3545"; // Green or Red
            } else if (typeof value === "number") {
                color = "#007bff"; // Blue for numbers
            } else {
                color = "#FFC107"; // Amber for other types
            }

            ctx.fillStyle = color;
            ctx.fillText(displayText, 10, y);
            y += 20;
        }
    }

    /**
     * Customize the background color based on the Result.
     */
    onDrawBackground(ctx) {
        // Change background based on Result
        if (this.inputValues["Result"] !== null) {
            const result = this.inputValues["Result"];
            ctx.fillStyle = result ? "#155724" : "#721c24"; // Dark Green or Dark Red
        } else {
            ctx.fillStyle = "#343a40"; // Default dark background
        }

        // Fill the background
        ctx.fillRect(0, 0, this.size[0], this.size[1]);
    }

    /**
     * Serialize the node's state.
     */
    serialize() {
        const data = super.serialize();
        data.inputValues = this.inputValues;
        return data;
    }

    /**
     * Restore the node's state.
     */
    configure(data) {
        super.configure(data);
        if (data.inputValues) {
            this.inputValues = data.inputValues;
        }
    }
}

// Register the node
LiteGraph.registerNodeType("Display/CombinedDisplayNode", CombinedDisplayNode);
