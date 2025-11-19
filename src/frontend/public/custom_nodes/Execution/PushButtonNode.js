// File: src/nodes/PushButtonNode.js

class PushButtonNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Simple On/Off";
        this.size = [200, 120];
        this.properties = { state: false };
        this.addInput("Trigger", "boolean"); // New input for trigger
        this.addOutput("State", "boolean");
        this.lastTriggered = 0; // Timestamp of last state change
        this.lastInputState = null; // Track last processed input state
        this.userTriggered = false; // Flag to indicate user interaction
    }

    /**
     * Handles the button press to toggle state on user click within the inner area.
     */
    onMouseDown(e, pos) {
        const borderThickness = 5;

        if (
            pos[0] >= borderThickness &&
            pos[0] <= this.size[0] - borderThickness &&
            pos[1] >= borderThickness &&
            pos[1] <= this.size[1] - borderThickness
        ) {
            this.properties.state = !this.properties.state;
            this.color = this.properties.state ? "#6c6" : "#c66";
            this.lastTriggered = Date.now();
            this.userTriggered = true; // Set flag to indicate user interaction
            this.setDirtyCanvas(true);
            this.setOutputData(0, this.properties.state);
            this.triggerSlot(0);
            console.log(`PushButtonNode ${this.id} toggled to ${this.properties.state} by user at ${this.lastTriggered}`);
        }
    }

    /**
     * Draws the button with a border and inner rectangle based on the state.
     */
    onDrawForeground(ctx) {
        this.size[1] = 120;
        const borderThickness = 5;

        ctx.fillStyle = "#333";
        ctx.fillRect(0, 0, this.size[0], this.size[1]);

        ctx.fillStyle = this.properties.state ? "#6c6" : "#c66";
        ctx.fillRect(
            borderThickness,
            borderThickness,
            this.size[0] - borderThickness * 2,
            this.size[1] - borderThickness * 2
        );

        ctx.fillStyle = "#fff";
        ctx.font = "20px Arial";
        ctx.textAlign = "center";
        ctx.fillText(
            this.properties.state ? "ON" : "OFF",
            this.size[0] * 0.5,
            this.size[1] * 0.5 + 7
        );
    }

    /**
     * Called during graph execution to process input and set output.
     */
    onExecute() {
        const inputState = this.getInputData(0); // Get input trigger state

        // Process input trigger only if it's defined and different from last input state
        if (inputState !== undefined && inputState !== this.lastInputState) {
            // Only update state if not recently triggered by user
            if (!this.userTriggered) {
                this.properties.state = Boolean(inputState);
                this.color = this.properties.state ? "#6c6" : "#c66";
                this.lastTriggered = Date.now();
                this.setDirtyCanvas(true);
                console.log(`PushButtonNode ${this.id} set to ${this.properties.state} by input trigger at ${this.lastTriggered}`);
            }
            this.lastInputState = inputState; // Update last input state
            this.userTriggered = false; // Reset user trigger flag after processing new input
        }

        // Always set output to current state
        this.setOutputData(0, this.properties.state);
    }

    /**
     * Save and reload the node's state, including lastTriggered and new properties.
     */
    serialize() {
        const data = super.serialize();
        data.properties = { ...this.properties };
        data.lastTriggered = this.lastTriggered;
        data.lastInputState = this.lastInputState;
        data.userTriggered = this.userTriggered;
        return data;
    }

    configure(data) {
        super.configure(data);
        this.properties = data.properties || { state: false };
        this.lastTriggered = data.lastTriggered || 0;
        this.lastInputState = data.lastInputState ?? null;
        this.userTriggered = data.userTriggered || false;
        this.color = this.properties.state ? "#6c6" : "#c66";
        this.setDirtyCanvas(true);
    }
}

// Register only if not already registered
if (!LiteGraph.registered_nodes || !LiteGraph.registered_nodes["Execution/pushbutton"]) {
    LiteGraph.registerNodeType("Execution/pushbutton", PushButtonNode);
    console.log("PushButtonNode - Registered successfully under 'Execution' category.");
}