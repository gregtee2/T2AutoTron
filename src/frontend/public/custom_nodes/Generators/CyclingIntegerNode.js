// File: CyclingIntegerNode.js

class CyclingIntegerNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Cycling Integer";
        this.size = [200, 160]; // Adjusted size to accommodate sliders
        this.bgcolor = "rgb(38, 56, 90)"; // Valid RGB color

        // Node properties
        this.properties = {
            min: 0, // Minimum value
            max: 10, // Maximum value
            speed: 1000, // Speed in ms
            order: "Sequential", // Order type
            debug: false, // Debug mode
        };

        // Internal state
        this.currentValue = this.properties.min;
        this.interval = null;

        // Output
        this.addOutput("Value", "number");

        // Initialize widgets
        this.setupWidgets();

        // Start cycling
        this.startCycling();
    }

    /**
     * Create the UI widgets (sliders and debug toggle).
     */
    setupWidgets() {
        // Clear existing widgets to prevent duplicates
        this.widgets = [];

        const widgetWidth = this.size[0] - 40; // Padding adjustment

        // Slider for Min: integer slider [0..100] (adjust range as needed)
        this.addWidget("slider", "Min", this.properties.min, (value) => {
            this.properties.min = Math.round(value);
            // Ensure min does not exceed max
            if (this.properties.min > this.properties.max) {
                this.properties.min = this.properties.max;
            }
            this.resetCycle();
        }, { min: 0, max: 10, step: 1, precision: 0, width: widgetWidth });

        // Slider for Max: integer slider [0..100] (adjust range as needed)
        this.addWidget("slider", "Max", this.properties.max, (value) => {
            this.properties.max = Math.round(value);
            // Ensure max is not less than min
            if (this.properties.max < this.properties.min) {
                this.properties.max = this.properties.min;
            }
            this.resetCycle();
        }, { min: 0, max: 10, step: 1, precision: 0, width: widgetWidth });

        // Slider for Speed: integer slider [100..5000] with step 100
        this.addWidget("slider", "Speed (ms)", this.properties.speed, (value) => {
            this.properties.speed = Math.round(value);
            this.startCycling();
        }, { min: 100, max: 5000, step: 100, precision: 0, width: widgetWidth });

        // Combo box for Order type
        this.addWidget("combo", "Order", this.properties.order, (value) => {
            this.properties.order = value;
            this.resetCycle();
        }, { values: ["Sequential", "Random"], width: widgetWidth });

        // Toggle for Debug mode
        this.addWidget("toggle", "Debug", this.properties.debug, (value) => {
            this.properties.debug = value;
            if (this.properties.debug) {
                console.log(`[CyclingIntegerNode] Debug mode enabled.`);
            } else {
                console.log(`[CyclingIntegerNode] Debug mode disabled.`);
            }
        }, { width: widgetWidth });
    }

    /**
     * Start cycling integers based on properties
     */
    startCycling() {
        if (this.interval) clearInterval(this.interval);

        if (this.properties.order === "Random") {
            this.interval = setInterval(() => {
                this.currentValue = this.getRandomInt(
                    this.properties.min,
                    this.properties.max
                );
                this.triggerOutput();
            }, this.properties.speed);
        } else {
            this.currentValue = this.properties.min;
            this.interval = setInterval(() => {
                this.currentValue++;
                if (this.currentValue > this.properties.max) {
                    this.currentValue = this.properties.min;
                }
                this.triggerOutput();
            }, this.properties.speed);
        }
    }

    /**
     * Reset the cycle based on updated range or order
     */
    resetCycle() {
        // Swap min and max if min > max
        if (this.properties.min > this.properties.max) {
            [this.properties.min, this.properties.max] = [
                this.properties.max,
                this.properties.min,
            ];
        }
        this.currentValue = this.properties.min;
        this.startCycling();
    }

    /**
     * Trigger the current value as output
     */
    triggerOutput() {
        this.setOutputData(0, this.currentValue);
        if (this.properties.debug) {
            console.log(`[CyclingIntegerNode] Output: ${this.currentValue}`);
        }
    }

    /**
     * Utility to generate a random integer between min and max
     */
    getRandomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    /**
     * Cleanup when the node is removed
     */
    onRemoved() {
        if (this.interval) clearInterval(this.interval);
    }

    /**
     * Serialize the node's state.
     */
    serialize() {
        const data = super.serialize();
        data.properties = { ...this.properties };
        return data;
    }

    /**
     * Restore the node's state.
     */
    configure(data) {
        super.configure(data);
        if (data.properties) {
            Object.assign(this.properties, data.properties);
            // Reinitialize widgets to reflect restored properties
            this.setupWidgets();
            this.resetCycle();
        }
    }
}

// Register the node
LiteGraph.registerNodeType("Generators/CyclingInteger", CyclingIntegerNode);
console.log("CyclingIntegerNode - Registered successfully under 'Generators' category.");
