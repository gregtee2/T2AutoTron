// File: src/nodes/PassThroughNode.js

/**
 * PassThroughNode simply forwards input data to its output.
 * It visually indicates "On" commands with a green flash and "Off" commands with a red flash.
 * The flash fades back to the default appearance over 3 seconds.
 * Implements a debounce mechanism to prevent rapid re-execution.
 */
class PassThroughNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Pass-Through";
        this.size = [120, 80]; // Increased size for better visibility

        // Use "*" as the data type to accept any input and output
        this.addInput("Input", "*");
        this.addOutput("Output", "*");

        // Initialize state tracking properties
        this.lastCommand = null;       // "On" or "Off"
        this.commandTime = 0;          // Timestamp of the last command
        this.fadeDuration = 3000;      // Duration in milliseconds for the fade-out effect

        // Debounce properties
        this.debounceDelay = 100;      // Minimum time between commands in milliseconds
        this.lastExecuteTime = 0;      // Timestamp of the last command execution

        console.log("PassThroughNode - Initialized with fadeDuration:", this.fadeDuration, "ms");
    }

    /**
     * Determines the type of command based on the input data.
     * @param {*} data - The input data.
     * @returns {string|null} - Returns "On", "Off", or null if the command type is unrecognized.
     */
    determineCommandType(data) {
        if (typeof data === "boolean") {
            return data ? "On" : "Off";
        }
        // Extend this method if you have other data types representing commands
        // For example, strings like "On", "Off", or objects with specific properties
        return null;
    }

    /**
     * Executes the node by passing input data directly to the output.
     * Records the time and type of command for visual feedback.
     * Implements a debounce to prevent rapid re-execution.
     */
    onExecute() {
        const inputData = this.getInputData(0);
        const currentTime = Date.now();

        if (inputData !== undefined && (currentTime - this.lastExecuteTime) > this.debounceDelay) {
            this.setOutputData(0, inputData);
            this.lastCommand = this.determineCommandType(inputData); // "On", "Off", or null
            this.commandTime = currentTime; // Record the current timestamp
            this.passCount = (this.passCount || 0) + 1; // Initialize or increment pass count
            //console.log(`PassThroughNode - Data passed at: ${this.commandTime}, Command: ${this.lastCommand}, Pass Count: ${this.passCount}`);

            this.lastExecuteTime = currentTime; // Update last execute time
        }
    }

    /**
     * Draws the node's foreground, including the visual flash indicator when data is passed.
     * @param {CanvasRenderingContext2D} ctx - The canvas rendering context.
     */
    onDrawForeground(ctx) {
        // Calculate elapsed time since the last command
        const currentTime = Date.now();
        const elapsedTime = currentTime - this.commandTime;
        //console.log(`PassThroughNode - Elapsed Time: ${elapsedTime}ms`);

        // Define the duration for which the flash effect should be visible
        if (this.lastCommand && elapsedTime < this.fadeDuration) {
            // Calculate opacity based on elapsed time to create a fading effect
            const opacity = 1 - (elapsedTime / this.fadeDuration);
            ctx.globalAlpha = opacity;

            // Determine the flash color based on the last command
            let flashColor = "#FFD700"; // Default flash color (gold) for unrecognized commands
            if (this.lastCommand === "On") {
                flashColor = "#6c6"; // Green for "On"
            } else if (this.lastCommand === "Off") {
                flashColor = "#c66"; // Red for "Off"
            }

            // Draw a semi-transparent overlay to indicate data passing
            ctx.fillStyle = flashColor;
            ctx.fillRect(0, 0, this.size[0], this.size[1]);

            // Reset globalAlpha to default
            ctx.globalAlpha = 1.0;

            //console.log(`PassThroughNode - Drawing ${this.lastCommand} flash with opacity: ${opacity.toFixed(2)}`);
        }

        // Draw an arrow to indicate data flow direction
        ctx.fillStyle = "#fff";
        ctx.font = "14px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("→", this.size[0] / 2, this.size[1] / 2);
    }

    /**
     * Adds visual feedback on hover (cursor change and tooltip).
     * @param {Event} e - The mouse event.
     * @param {Array} pos - The position of the mouse relative to the node.
     */
    onMouseOver(e, pos) {
        this.canvas.tooltip = "Pass-Through Node: Forwards input to multiple outputs";
        this.canvas.cursor = "pointer";
    }

    onMouseOut(e, pos) {
        this.canvas.tooltip = "";
        this.canvas.cursor = "default";
    }
}

// Register the node with the name "Pass-Through"
if (!LiteGraph.registered_nodes || !LiteGraph.registered_nodes["Utility/pass_through"]) {
    LiteGraph.registerNodeType("Utility/pass_through", PassThroughNode);
    console.log("PassThroughNode - Registered successfully under 'Utility' category.");
}
