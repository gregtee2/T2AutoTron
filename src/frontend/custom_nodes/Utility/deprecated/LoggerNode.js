class LoggerNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Logger";
        this.size = [200, 100];
        this.addInput("Data", "object");
        // Output is optional; omit if you don't need to pass data further
    }

    onExecute() {
        const data = this.getInputData(0);
        if (data) {
            console.log("LoggerNode: Received data:", data);
        }
    }
}

// Register the node with LiteGraph
LiteGraph.registerNodeType("Utility/Logger", LoggerNode);
