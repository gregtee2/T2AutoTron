class DisplayNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Debug Display";
        this.size = [200, 120];
        this.bgcolor = "#343a40"; // Default dark background

        // Define multiple inputs to capture all outputs from a node
        this.addInput("Input 1", "*"); // Accepts any data type
        this.addInput("Input 2", "*"); // Add more inputs as needed
        this.addInput("Input 3", "*");

        // No outputs needed for a debug display
        this.currentValues = []; // Array to store the latest input values for each slot
        this.inputLabels = ["Input 1", "Input 2", "Input 3"]; // Labels for each input
    }

    onExecute() {
        // Update current values for each input slot
        this.currentValues = [];
        for (let i = 0; i < this.inputs.length; i++) {
            const inputData = this.getInputData(i);
            this.currentValues[i] = inputData !== undefined ? inputData : null;
        }

        // Dynamically resize the node based on content
        this.updateNodeSize();
    }

    updateNodeSize() {
        const ctx = this.graph?.canvas?.ctx || document.createElement("canvas").getContext("2d");
        ctx.font = "12px Arial";
        
        let maxWidth = 200; // Minimum width
        let totalHeight = 40; // Base height for title

        // Calculate required width and height based on content
        this.currentValues.forEach((value, index) => {
            if (value !== null) {
                const label = `${this.inputLabels[index]}: `;
                const text = this.formatValue(value);
                const labelWidth = ctx.measureText(label).width;
                const textWidth = ctx.measureText(text).width;
                const lineWidth = labelWidth + textWidth + 20; // Padding
                maxWidth = Math.max(maxWidth, lineWidth);
                totalHeight += 20; // Height per line
            }
        });

        totalHeight += 20; // Bottom padding
        this.size = [Math.max(maxWidth, 200), totalHeight];
        this.setDirtyCanvas(true, true);
    }

    formatValue(value) {
        if (value === null || value === undefined) return "null";
        if (Array.isArray(value)) {
            // For arrays, show a concise representation
            if (value.length === 0) return "[]";
            if (value.length > 2) return `[${value.length} items]`;
            return `[${value.map(v => this.formatValue(v)).join(", ")}]`;
        }
        if (typeof value === "object") {
            // For objects, show a concise representation
            try {
                return JSON.stringify(value, null, 0).slice(0, 50) + (JSON.stringify(value).length > 50 ? "..." : "");
            } catch (e) {
                return "[Object]";
            }
        }
        return String(value).slice(0, 50); // Truncate long strings
    }

    onDrawForeground(ctx) {
        ctx.fillStyle = "#FFFFFF"; // Text color
        ctx.font = "12px Arial";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";

        let yOffset = 30; // Start below the title
        this.currentValues.forEach((value, index) => {
            if (value !== null) {
                const label = `${this.inputLabels[index]}: `;
                const text = this.formatValue(value);
                ctx.fillText(label, 10, yOffset);
                ctx.fillText(text, 10 + ctx.measureText(label).width, yOffset);
                yOffset += 20; // Move to next line
            }
        });
    }

    onDrawBackground(ctx) {
        // Background color based on whether there’s data
        ctx.fillStyle = this.currentValues.some(v => v !== null) ? "#4a4a4a" : "#343a40";
        ctx.fillRect(0, 0, this.size[0], this.size[1]);
    }

    onGetInputs() {
        return [
            ["Input 1", "*"],
            ["Input 2", "*"],
            ["Input 3", "*"]
        ];
    }

    onGetOutputs() {
        return [];
    }

    serialize() {
        const data = super.serialize();
        data.currentValues = this.currentValues;
        data.inputLabels = this.inputLabels;
        return data;
    }

    configure(data) {
        super.configure(data);
        if (data.currentValues !== undefined) {
            this.currentValues = data.currentValues;
        }
        if (data.inputLabels !== undefined) {
            this.inputLabels = data.inputLabels;
        }
        this.updateNodeSize();
    }
}

// Register the node
LiteGraph.registerNodeType("Debug/DisplayNode", DisplayNode);