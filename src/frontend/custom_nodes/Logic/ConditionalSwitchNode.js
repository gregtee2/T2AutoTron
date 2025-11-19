// File: ConditionalSwitchNode.js

class ConditionalSwitchNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Conditional Switch";
        this.size = [160, 100];

        // Set node colors
        //this.color = "#FF8800";   // Border color
        this.bgcolor = "rgb(38, 56, 90)"; // Valid RGB color


        // Properties
        this.properties = {
            numberOfInputs: 10, // Default number of inputs (max 10)
            clampSelect: true,  // Clamp the select index if out of range
            debug: false
        };

        // Add "Select" input with a meaningful label
        this.addInput("Select", "number");

        // Add fixed data inputs (Data0 to Data9)
        this.maxInputs = 10; // Maximum number of data inputs
        for (let i = 0; i < this.maxInputs; i++) {
            this.addInput(""); // Labels: Data0, Data1, ..., Data9
        }

        // Single data output (wildcard type for compatibility)
        this.addOutput("Out", "*");

        // Internal state to track active inputs
        // Initialize with false for each data input
        this.inputActive = Array(this.maxInputs).fill(false);

        console.log("ConditionalSwitchNode - Constructor complete.");
    }

    /**
     * Handle property changes
     */
    onPropertyChanged(name, value) {
        if (name === "numberOfInputs") {
            // Clamp the numberOfInputs between 1 and maxInputs
            const clampedValue = Math.max(1, Math.min(this.maxInputs, value));
            if (clampedValue !== this.properties.numberOfInputs) {
                this.properties.numberOfInputs = clampedValue;
            }
            // Adjust node size based on the number of inputs
            this.size = [160, 60 + this.properties.numberOfInputs * 20];
            // Reset active inputs
            this.inputActive = Array(this.maxInputs).fill(false);
        }
        return false; // Skip default behavior
    }

    onExecute() {
        // Reset all inputActive flags at the start of execution
        this.inputActive = Array(this.maxInputs).fill(false);

        // 1) Get the "Select" value
        let selectVal = this.getInputData(0); // Index 0 = "Select"
        if (typeof selectVal !== "number") {
            selectVal = 0;
        }

        // Clamp the select value if necessary
        if (this.properties.clampSelect) {
            if (selectVal < 0) selectVal = 0;
            if (selectVal >= this.properties.numberOfInputs) {
                selectVal = this.properties.numberOfInputs - 1;
            }
        }

        // 2) Fetch the data from the selected input
        let chosenIndex = selectVal; // Data inputs start at index 1

        let outData = null;

        if (
            chosenIndex >= 0 &&
            chosenIndex < this.properties.numberOfInputs
        ) {
            // Data inputs are offset by 1 (Select is input 0)
            const dataInputIndex = chosenIndex; // Data0 is input 1
            outData = this.getInputData(dataInputIndex + 1);

            // Mark this input as active
            this.inputActive[dataInputIndex] = true;
        } else {
            // If clampSelect is false and index is out of range
            if (!this.properties.clampSelect) {
                outData = null;
            }
        }

        // 3) Set the output data
        this.setOutputData(0, outData);

        // Debugging (if enabled)
        if (this.properties.debug) {
            console.log(
                `[ConditionalSwitchNode] select=${selectVal}, outData=`,
                outData
            );
            console.log(`[ConditionalSwitchNode] Active Inputs:`, this.inputActive);
        }
    }

    /**
     * Draw the text overlay on the node and highlight active inputs
     */
    onDrawForeground(ctx) {
        // Do not call super.onDrawForeground to avoid duplicate labels
        // super.onDrawForeground?.(ctx);

        // Style configurations
        const activeColor = "#00FF00"; // Green for active inputs
        const inactiveColor = "#FFFFFF"; // White for inactive inputs
        const fontSize = 12;
        const font = `${fontSize}px Arial`;
        ctx.font = font;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";

        const inputStartX = 20; // X position for input labels
        const inputStartY = 35; // Starting Y position
        const inputSpacing = 20; // Spacing between inputs

        for (let i = 0; i < this.properties.numberOfInputs; i++) {
            const label = `Data${i}`;
            const isActive = this.inputActive[i];
            ctx.fillStyle = isActive ? activeColor : inactiveColor;

            // Calculate Y position for this input
            const y = inputStartY + i * inputSpacing;

            // Draw the label
            ctx.fillText(label, inputStartX, y);
        }

        // Optionally, draw the "Select" label separately above the data inputs
        // ctx.fillStyle = "#FFFFFF"; // White color for "Select"
        // ctx.fillText("Select", 10, inputStartY - 15);
    }

    /**
     * Serialize the node's state.
     */
    serialize() {
        const data = super.serialize();
        data.properties = { ...this.properties };
        return data;
    }

    /**
     * Restore the node's state.
     */
    configure(data) {
        super.configure(data);
        if (data.properties) {
            Object.assign(this.properties, data.properties);

            // Clamp the numberOfInputs to ensure consistency
            this.properties.numberOfInputs = Math.max(
                1,
                Math.min(this.maxInputs, this.properties.numberOfInputs)
            );

            // Adjust node size based on the number of inputs
            this.size = [160, 60 + this.properties.numberOfInputs * 20];

            // Reset active inputs
            this.inputActive = Array(this.maxInputs).fill(false);
        }
    }
}

// Register the node
LiteGraph.registerNodeType("Logic/ConditionalSwitch", ConditionalSwitchNode);
console.log("ConditionalSwitchNode - Registered successfully under 'Logic' category.");
