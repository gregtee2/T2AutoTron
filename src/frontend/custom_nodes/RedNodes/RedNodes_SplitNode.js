class RedNodes_SplitNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Split";
        this.size = [200, 100];

        this.addInput("Input", "object");
        this.addOutput("Key1", "*");
        this.addOutput("Key2", "*");
    }

    onExecute() {
        const inputData = this.getInputData(0);

        if (typeof inputData === "object") {
            Object.keys(inputData).forEach((key, index) => {
                if (index < this.outputs.length) {
                    this.setOutputData(index, inputData[key]);
                }
            });
        }
    }
}

LiteGraph.registerNodeType("RedNodes/SplitNode", RedNodes_SplitNode);
