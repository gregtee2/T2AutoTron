class InjectNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Inject";
        this.size = [200, 80];

        // Properties
        this.properties = {
            payload: "Hello, World!", // Default payload
            repeat: false,           // Whether to repeat
            interval: 1000           // Repeat interval in ms
        };

        // Outputs
        this.addOutput("Output", "*");

        // UI Widgets
        this.addWidget("text", "Payload", this.properties.payload, (v) => {
            this.properties.payload = v;
        });
        this.addWidget("toggle", "Repeat", this.properties.repeat, (v) => {
            this.properties.repeat = v;
            this.setupInterval();
        });
        this.addWidget("slider", "Interval (ms)", this.properties.interval, (v) => {
            this.properties.interval = v;
            this.setupInterval();
        }, { min: 100, max: 10000 });

        this.intervalId = null;
        this.setupInterval();
    }

    setupInterval() {
        if (this.intervalId) clearInterval(this.intervalId);
        if (this.properties.repeat) {
            this.intervalId = setInterval(() => {
                this.triggerOutput();
            }, this.properties.interval);
        }
    }

    triggerOutput() {
        this.setOutputData(0, this.properties.payload);
    }

    onExecute() {
        // Manual execution
        this.triggerOutput();
    }

    onRemoved() {
        if (this.intervalId) clearInterval(this.intervalId);
    }
}

LiteGraph.registerNodeType("Logic/Inject", InjectNode);
