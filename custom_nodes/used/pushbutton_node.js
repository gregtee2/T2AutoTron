// PushButtonNode: Outputting state with debounce logic (similar to brightness control)
class PushButtonNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Simple On/Off";
        this.size = [200, 60];
        this.properties = { state: false };
        this.lastState = null; // Keep track of the last state
        this.debounceTimeout = null; // Timeout for debouncing
        this.addOutput("State", "boolean");
    }

    onExecute() {
        // Output the state only if it has changed
        if (this.properties.state !== this.lastState) {
            this.lastState = this.properties.state;
            clearTimeout(this.debounceTimeout);
            this.debounceTimeout = setTimeout(() => {
                this.setOutputData(0, this.properties.state);
                console.log(`PushButtonNode - Outputting state: ${this.properties.state}`);
                this.triggerSlot(0); // Propagate the value
            }, 200); // Adjust debounce delay if needed
        }
    }

    onMouseDown(e, pos) {
        if (pos[0] >= 0 && pos[0] <= this.size[0] && pos[1] >= 0 && pos[1] <= this.size[1]) {
            this.properties.state = !this.properties.state;
            this.setDirtyCanvas(true); // Redraw the canvas
            return true;
        }
        return false;
    }

    onDrawForeground(ctx) {
        ctx.fillStyle = this.properties.state ? "#6c6" : "#c66";
        ctx.fillRect(0, 0, this.size[0], this.size[1]);
        ctx.fillStyle = "#fff";
        ctx.font = "20px Arial";
        ctx.textAlign = "center";
        ctx.fillText(this.properties.state ? "ON" : "OFF", this.size[0] * 0.5, this.size[1] * 0.5 + 7);
    }

    onLoad() {
        this.setOutputData(0, this.properties.state);
    }
}

LiteGraph.registerNodeType("custom/pushbutton", PushButtonNode);

// Define TriggerNode