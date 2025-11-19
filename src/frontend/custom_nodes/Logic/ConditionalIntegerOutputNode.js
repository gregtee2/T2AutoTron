// File: ConditionalIntegerOutputNode.js

class ConditionalIntegerOutputNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Conditional Integer Output";
        this.size = [220, 240]; // Adjusted size for better layout
        this.bgcolor = "rgb(38, 56, 90)"; // Valid RGB color

        // Define inputs with empty labels to prevent default rendering
        this.addInput("", "boolean"); // Input A: boolean
        this.addInput("", "number");  // Input B: number

        // Define output with an empty label to prevent default rendering
        this.addOutput("", "*");    // Output: any type

        // Internal state to track active inputs
        this.inputActive = {
            A: false,
            B: false
        };

        // Internal state to store last output
        this.lastOutput = null;

        // Debugging flag
        this.properties = {
            debug: false
        };

        console.log("ConditionalIntegerOutputNode - Constructor complete.");
    }

    /**
     * Executes the node's logic every frame/tick.
     */
    onExecute() {
        // Reset active input states
        this.inputActive.A = false;
        this.inputActive.B = false;

        // Get input data
        const A = this.getInputData(0); // Index 0: A
        const B = this.getInputData(1); // Index 1: B

        if (A === true) {
            // If A is True, pass through the integer value of B
            const intValue = parseInt(B, 10);
            this.lastOutput = intValue;
            this.setOutputData(0, intValue);

            // Mark inputs as active
            this.inputActive.A = true;
            this.inputActive.B = true;

            if (this.properties.debug) {
                console.log(`[ConditionalIntegerOutputNode] A is True. Outputting B: ${intValue}`);
            }
        } else {
            // If A is not True, output False
            this.lastOutput = false;
            this.setOutputData(0, false);

            // Mark inputs as inactive
            this.inputActive.A = false;
            this.inputActive.B = false;

            if (this.properties.debug) {
                console.log(`[ConditionalIntegerOutputNode] A is not True. Outputting False.`);
            }
        }
    }

    /**
     * Draws custom foreground elements, such as highlighted labels with pulsing animation.
     */
    onDrawForeground(ctx) {
        // Do not call super to prevent duplicate labels
        // super.onDrawForeground(ctx);

        // Get current time for animation
        const currentTime = Date.now() / 1000; // seconds
        const frequency = 1; // 1 Hz pulsing
        const pulsingFactor = 0.5 * (1 + Math.sin(currentTime * 2 * Math.PI * frequency));
        const pulsingGreen = Math.floor(255 * pulsingFactor); // 127 to 255

        // Define colors
        const activeColor = `rgb(0, ${pulsingGreen}, 0)`; // Pulsing green
        const inactiveColor = "#FFFFFF"; // White

        // Style configurations
        const fontSize = 14;
        const font = `${fontSize}px Arial`;
        ctx.font = font;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";

        // Positions
        // Positions
        const labelStartX = 25;
        const labelStartY = -15;
        const labelSpacing = 20;

        // Draw Input A Label
        ctx.fillStyle = this.inputActive.A ? activeColor : inactiveColor;
        ctx.fillText("A (Bool)", labelStartX, labelStartY + 30); // Adjust Y for alignment

        // Draw Input B Label
        ctx.fillStyle = this.inputActive.B ? activeColor : inactiveColor;
        ctx.fillText("B (Int)", labelStartX, labelStartY + 30 + labelSpacing); // Adjust Y for alignment

        // Draw Output Label
        ctx.fillStyle = "#FFFFFF"; // Always white
        ctx.fillText("Out", this.size[0] - 60, 20); // Position above the output
    }

    /**
     * Draws custom background elements if needed.
     */
    onDrawBackground(ctx) {
        // Optional: Add a background or other visuals
        // For example, a colored border based on the last output type
        if (this.lastOutput === false) {
            // Red border for False output
            ctx.strokeStyle = "#FF0000";
        } else if (typeof this.lastOutput === "number") {
            // Green border for number output
            ctx.strokeStyle = "#00FF00";
        } else {
            // Default border
            ctx.strokeStyle = "#FFFFFF";
        }
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, this.size[0], this.size[1]);
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
        }
    }
}

// Register the node with LiteGraph
LiteGraph.registerNodeType("Logic/ConditionalIntegerOutput", ConditionalIntegerOutputNode);
console.log("ConditionalIntegerOutputNode - Registered successfully under 'Logic' category.");
