class RedNodes_RangeNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Range";
        this.size = [300, 120];
        this.bgcolor = "rgb(80, 15, 10)"; // Valid RGB color

        // Properties
        this.properties = {
            inputMin: 0,
            inputMax: 100,
            outputMin: 0,
            outputMax: 255,
        };

        this.addInput("Input", "*");
        this.addOutput("Output", "*");

        // Widgets
        this.addWidget("number", "Input Min", this.properties.inputMin, (v) => {
            this.properties.inputMin = parseFloat(v);
        });
        this.addWidget("number", "Input Max", this.properties.inputMax, (v) => {
            this.properties.inputMax = parseFloat(v);
        });
        this.addWidget("number", "Output Min", this.properties.outputMin, (v) => {
            this.properties.outputMin = parseFloat(v);
        });
        this.addWidget("number", "Output Max", this.properties.outputMax, (v) => {
            this.properties.outputMax = parseFloat(v);
        });
    }

    onExecute() {
        const inputValue = this.getInputData(0);
        const { inputMin, inputMax, outputMin, outputMax } = this.properties;

        if (inputValue !== undefined) {
            const normalizedValue = outputMin + ((inputValue - inputMin) * (outputMax - outputMin)) / (inputMax - inputMin);
            this.setOutputData(0, Math.min(Math.max(normalizedValue, outputMin), outputMax));
        }
    }
}

LiteGraph.registerNodeType("RedNodes/RangeNode", RedNodes_RangeNode);
