class PassThroughNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Pass-Through";
        this.size = [20, 20]; // Small and simple

        // Single input and output, both "any" type
        this.addInput("Input", "any");
        this.addOutput("Output", "any");
    }

    onExecute() {
        // Pass input data directly to the output
        const inputData = this.getInputData(0);
        this.setOutputData(0, inputData);
    }
}

// Register the node with LiteGraph
LiteGraph.registerNodeType("Utility/pass_through", PassThroughNode);
