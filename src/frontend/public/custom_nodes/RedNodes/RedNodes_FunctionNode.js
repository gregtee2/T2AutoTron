class RedNodes_FunctionNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Function";
        this.size = [300, 200];

        // Properties
        this.properties = {
            code: "// input: input0\n// output: output\nreturn input0 * 2;", // Default script
        };

        // Inputs and Outputs
        this.addInput("Input", "*");
        this.addOutput("Output", "*");

        // Widgets
        this.addWidget("text", "Code", this.properties.code, (value) => {
            this.properties.code = value;
        }, { multiline: true });
    }

    onExecute() {
        const inputData = this.getInputData(0);
        let outputData = null;

        try {
            // Create a function with user-provided code
            const userFunction = new Function("input0", this.properties.code);
            outputData = userFunction(inputData);
        } catch (error) {
            console.error(`[FunctionNode] Error executing script: ${error.message}`);
        }

        this.setOutputData(0, outputData);
    }

    serialize() {
        const data = super.serialize();
        data.properties = { ...this.properties };
        return data;
    }

    configure(data) {
        super.configure(data);
        if (data.properties) {
            Object.assign(this.properties, data.properties);
        }
    }
}

LiteGraph.registerNodeType("RedNodes/FunctionNode", RedNodes_FunctionNode);
