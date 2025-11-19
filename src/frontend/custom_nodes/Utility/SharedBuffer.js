//working version
class SenderNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Sender Node";
        this.size = [200, 100];
        this.bgcolor = "rgb(70, 120, 150)";

        // Add an input for any type of data
        this.addInput("Input", "*");

        // Add a text widget to define the buffer name
        this.properties = { bufferName: "Default" };
        this.bufferNameWidget = this.addWidget("text", "Buffer Name", this.properties.bufferName, (value) => {
            this.properties.bufferName = value || "Default";
            this.updateBuffer();
        });

        // Show status
        this.statusWidget = this.addWidget("text", "Status", "Idle", null, { readonly: true });

        // Global shared buffer
        if (!SenderNode.sharedBuffer) {
            SenderNode.sharedBuffer = {};
        }

        // Update the buffer immediately
        this.updateBuffer();
    }

    /**
     * Updates the shared buffer with the current input data.
     */
    updateBuffer() {
        if (this.properties.bufferName) {
            SenderNode.sharedBuffer[this.properties.bufferName] = this.getInputData(0);
            this.statusWidget.value = `Stored: ${this.properties.bufferName}`;
            this.setDirtyCanvas(true);
        }
    }

    /**
     * Execute the node's function (called every frame in LiteGraph).
     */
    onExecute() {
        this.updateBuffer();
    }

    /**
     * Save the node's configuration (called when graph is serialized).
     */
    onSerialize(o) {
        o.properties = { ...this.properties }; // Save bufferName
    }

    /**
     * Restore the node's configuration (called when graph is loaded).
     */
    onConfigure(o) {
        if (o.properties) {
            this.properties = { ...o.properties };
            // Update the widget to reflect the restored buffer name
            if (this.bufferNameWidget) {
                this.bufferNameWidget.value = this.properties.bufferName;
            }
            this.updateBuffer();
        }
    }

    /**
     * Clone the node properly, ensuring bufferName is retained.
     */
    clone() {
        const newNode = super.clone();
        newNode.properties = { ...this.properties }; // Copy properties
        return newNode;
    }
}

LiteGraph.registerNodeType("Utility/SenderNode", SenderNode);
