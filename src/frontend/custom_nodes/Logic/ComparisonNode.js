class ComparisonNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Comparison";
        this.size = [220, 130];

        this.properties = {
            operator: ">",
            threshold: 10,
            thresholdMin: 0, // For BETWEEN operator
            thresholdMax: 100, // For BETWEEN operator
            debug: false
        };

        this.addInput("Value", "number");
        this.addOutput("Condition", "boolean");

        this.setupWidgets();
    }

    setupWidgets() {
        this.addWidget(
            "combo",
            "Operator",
            this.properties.operator,
            (value) => {
                this.properties.operator = value;
                this.updateWidgetsVisibility();
                this.setDirtyCanvas(true);
            },
            {
                values: [">", "<", ">=", "<=", "=", "!=", "BETWEEN"],
                width: 80
            }
        );

        // Threshold for single-value comparisons
        this.thresholdWidget = this.addWidget(
            "slider",
            "Threshold",
            this.properties.threshold,
            (value) => {
                this.properties.threshold = parseFloat(value);
                this.setDirtyCanvas(true);
            },
            {
                min: 0,
                max: 100,
                step: 1,
                precision: 0,
                width: 120
            }
        );

        // ThresholdMin for BETWEEN operator
        this.thresholdMinWidget = this.addWidget(
            "slider",
            "Min",
            this.properties.thresholdMin,
            (value) => {
                this.properties.thresholdMin = parseFloat(value);
                this.setDirtyCanvas(true);
            },
            {
                min: 0,
                max: 100,
                step: 1,
                precision: 0,
                width: 120
            }
        );

        // ThresholdMax for BETWEEN operator
        this.thresholdMaxWidget = this.addWidget(
            "slider",
            "Max",
            this.properties.thresholdMax,
            (value) => {
                this.properties.thresholdMax = parseFloat(value);
                this.setDirtyCanvas(true);
            },
            {
                min: 0,
                max: 100,
                step: 1,
                precision: 0,
                width: 120
            }
        );

        this.addWidget(
            "toggle",
            "Debug",
            this.properties.debug,
            (value) => {
                this.properties.debug = value;
                this.setDirtyCanvas(true);
            },
            {
                label: "Debug Logging"
            }
        );

        // Initial visibility of widgets
        this.updateWidgetsVisibility();
    }

    updateWidgetsVisibility() {
        if (this.properties.operator === "BETWEEN") {
            this.thresholdWidget.visible = false;
            this.thresholdMinWidget.visible = true;
            this.thresholdMaxWidget.visible = true;
        } else {
            this.thresholdWidget.visible = true;
            this.thresholdMinWidget.visible = false;
            this.thresholdMaxWidget.visible = false;
        }
    }

    onExecute() {
        const value = this.getInputData(0);
        let result = false;

        if (typeof value === "number") {
            switch (this.properties.operator) {
                case ">":
                    result = (value > this.properties.threshold);
                    break;
                case "<":
                    result = (value < this.properties.threshold);
                    break;
                case ">=":
                    result = (value >= this.properties.threshold);
                    break;
                case "<=":
                    result = (value <= this.properties.threshold);
                    break;
                case "=":
                    result = (value === this.properties.threshold);
                    break;
                case "!=":
                    result = (value !== this.properties.threshold);
                    break;
                case "BETWEEN":
                    result = (value >= this.properties.thresholdMin && value <= this.properties.thresholdMax);
                    break;
                default:
                    console.warn("[ComparisonNode] Unknown operator:", this.properties.operator);
            }
        }
        this.setOutputData(0, result);

        if (this.properties.debug) {
            if (this.properties.operator === "BETWEEN") {
                console.log(
                    `[ComparisonNode] Value=${value}, ` +
                    `Operator=${this.properties.operator}, ` +
                    `Range=[${this.properties.thresholdMin}, ${this.properties.thresholdMax}], ` +
                    `Result=${result}`
                );
            } else {
                console.log(
                    `[ComparisonNode] Value=${value}, ` +
                    `Operator=${this.properties.operator}, ` +
                    `Threshold=${this.properties.threshold}, ` +
                    `Result=${result}`
                );
            }
        }
    }

    configure(data) {
        super.configure(data);
        this.properties = data.properties || this.properties;
        this.updateWidgetsVisibility();
    }

    serialize() {
        const data = super.serialize();
        data.properties = this.properties;
        return data;
    }
}

LiteGraph.registerNodeType("Logic/Comparison", ComparisonNode);