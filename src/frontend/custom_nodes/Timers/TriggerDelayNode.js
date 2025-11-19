class TriggerDelayNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Trigger Delay";
        this.size = [200, 100];
        this.properties = {
            delayMs: 1000 // Default delay: 1000ms
        };
        this.mode = LiteGraph.ALWAYS;

        // Setup inputs and outputs
        this.addInput("Trigger In", "boolean");
        this.addOutput("Trigger Out", "boolean");

        // Setup widgets
        this.setupWidgets();

        // Internal state
        this.lastInputValue = null;
        this.timeoutId = null;
        this.isDelayActive = false; // Track if delay is in progress
        this.delayStartTime = null; // Track when delay started
    }

    setupWidgets() {
        // Delay slider (0–3000ms)
        this.delaySlider = this.addWidget("slider", "Delay (ms)", this.properties.delayMs, (value) => {
            this.properties.delayMs = Math.round(value);
            this.delayNumber.value = this.properties.delayMs;
            this.setDirtyCanvas(true);
        }, { min: 0, max: 3000, step: 1, width: 120 });

        // Number input for fine-tuning
        this.delayNumber = this.addWidget("number", "", this.properties.delayMs, (value) => {
            this.properties.delayMs = Math.max(0, Math.min(3000, Math.round(value)));
            this.delaySlider.value = this.properties.delayMs;
            this.setDirtyCanvas(true);
        }, { min: 0, max: 3000, step: 1, width: 60 });

        // Reset button to default (1000ms)
        this.addWidget("button", "Reset", "R", () => {
            this.properties.delayMs = 1000;
            this.delaySlider.value = this.properties.delayMs;
            this.delayNumber.value = this.properties.delayMs;
            this.setDirtyCanvas(true);
        }, { width: 40 });
    }

    onExecute() {
        const inputValue = this.getInputData(0);

        // Handle undefined input by maintaining last state
        if (inputValue === undefined && this.lastInputValue === null) {
            this.setOutputData(0, false); // Default to false if no input
            return;
        }

        // Detect input change
        if (inputValue !== undefined && inputValue !== this.lastInputValue) {
            this.lastInputValue = inputValue;

            // Clear any existing timeout
            if (this.timeoutId !== null) {
                clearTimeout(this.timeoutId);
                this.timeoutId = null;
            }

            // Start delay
            this.isDelayActive = true;
            this.delayStartTime = Date.now();
            this.timeoutId = setTimeout(() => {
                this.isDelayActive = false;
                this.timeoutId = null;
                this.setOutputData(0, this.lastInputValue);
                this.setDirtyCanvas(true);
            }, this.properties.delayMs);
        }

        // If delay is complete, continuously output the last input value
        if (!this.isDelayActive && this.lastInputValue !== null) {
            this.setOutputData(0, this.lastInputValue);
        }
    }

    onRemoved() {
        if (this.timeoutId !== null) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }
    }

    serialize() {
        const data = super.serialize();
        data.properties = {
            delayMs: this.properties.delayMs
        };
        return data;
    }

    configure(data) {
        super.configure(data);
        if (data.properties) {
            this.properties = { ...this.properties, ...data.properties };
            this.delaySlider.value = this.properties.delayMs;
            this.delayNumber.value = this.properties.delayMs;
        }
        // Reset internal state to ensure clean start
        if (this.timeoutId !== null) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }
        this.lastInputValue = null;
        this.isDelayActive = false;
        this.delayStartTime = null;
        this.setDirtyCanvas(true);
    }
}

LiteGraph.registerNodeType("Timers/TriggerDelay", TriggerDelayNode);