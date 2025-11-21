class BasicMergeNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Basic Merge";
        this.size = [300, 150];
        this.numInputs = 1;

        // Start with one input
        this.addInput("Input 1", "light_info");
        this.addOutput("Merged Info", "light_info");

        this.properties = { numInputs: 1 };
    }

    onConnectionsChange(inputIndex, connected) {
        console.log(`Input ${inputIndex + 1} ${connected ? "connected" : "disconnected"}.`);
    }

    // Manually add a new input
    addNewInput() {
        this.numInputs++;
        this.addInput(`Input ${this.numInputs}`, "light_info");
        console.log(`Added new input - Input ${this.numInputs}`);
        this.size[1] = Math.max(150, 50 + this.numInputs * 30);
    }
}

// Register the node type
LiteGraph.registerNodeType("custom/basic_merge", BasicMergeNode);
