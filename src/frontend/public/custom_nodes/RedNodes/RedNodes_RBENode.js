class RedNodes_RBENode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "RBE (Report by Exception)";
        this.size = [300, 180]; // Increased size for multiple widgets
        this.bgcolor = "rgb(80, 15, 10)"; // Valid RGB color

        // Properties
        this.properties = {
            numInputs: 1, // Default number of inputs
            mode: "Value", // Can be "Value" or "Delta"
            threshold: 0, // Used only in "Delta" mode
            emitNull: true, // Determines output behavior when conditions are not met
            debug: false, // Debug toggle
            inputKeys: ["Input1"], // Default keys
        };

        // Internal state
        this.previousValues = [null]; // Array to store previous values for each input

        // Initialize Inputs and Outputs
        this.setupIO();

        // Widgets
        this.setupWidgets();
    }

    /**
     * Initialize Inputs and Outputs based on numInputs property
     */
    setupIO() {
        // Clear existing inputs and outputs
        this.inputs = [];
        this.outputs = [];

        // Add inputs based on numInputs property
        for (let i = 1; i <= this.properties.numInputs; i++) {
            this.addInput(`Input${i}`, "*");
            // Initialize previousValue for each input if not already present
            if (this.previousValues.length < this.properties.numInputs) {
                this.previousValues.push(null);
            }
        }

        // Add single output
        this.addOutput("Output", "*");
    }

    /**
     * Initialize widgets and layout
     */
    setupWidgets() {
        // Clear existing widgets to prevent duplicates
        this.widgets = [];

        const widgetWidth = this.size[0] - 40; // Padding

        // Number of Inputs Slider
        this.addWidget(
            "slider",
            "Inputs",
            this.properties.numInputs,
            (value) => {
                const newNum = Math.floor(value);
                if (newNum !== this.properties.numInputs) {
                    this.properties.numInputs = newNum;
                    // Adjust inputKeys array accordingly
                    while (this.properties.inputKeys.length < newNum) {
                        this.properties.inputKeys.push(`Input${this.properties.inputKeys.length + 1}`);
                    }
                    while (this.properties.inputKeys.length > newNum) {
                        this.properties.inputKeys.pop();
                        this.previousValues.pop();
                    }
                    this.setupIO();
                    this.setupWidgets(); // Re-setup widgets to reflect changes
                }
            },
            {
                min: 1,
                max: 10, // Adjust as needed
                step: 1,
                width: widgetWidth,
                tooltip: "Adjust the number of input ports."
            }
        );

        // Mode Selector
        this.addWidget(
            "combo",
            "Mode",
            this.properties.mode,
            (value) => {
                this.properties.mode = value;
                this.setDirtyCanvas(true);
                // Show or hide threshold based on mode
                this.widgets.forEach(widget => {
                    if (widget.name === "Threshold") {
                        widget.visible = (value === "Delta");
                    }
                });
            },
            { values: ["Value", "Delta"], width: widgetWidth, tooltip: "Select filtering mode: 'Value' to emit on any change, 'Delta' to emit only when change exceeds threshold." }
        );

        // Threshold Input (visible only in Delta mode)
        this.addWidget(
            "number",
            "Threshold",
            this.properties.threshold,
            (value) => {
                const num = parseFloat(value);
                if (!isNaN(num) && num >= 0) {
                    this.properties.threshold = num;
                } else {
                    // Optionally, revert to previous valid value or set to default
                    this.properties.threshold = 0;
                }
                this.setDirtyCanvas(true);
            },
            { visible: this.properties.mode === "Delta", width: widgetWidth, tooltip: "Set the minimum change required to emit data in 'Delta' mode." }
        );

        // Emit Null Toggle
        this.addWidget(
            "toggle",
            "Emit Null",
            this.properties.emitNull,
            (value) => {
                this.properties.emitNull = value;
                this.setDirtyCanvas(true);
            },
            { width: widgetWidth, tooltip: "Emit null when conditions are not met." }
        );

        // Debug Toggle
        this.addWidget(
            "toggle",
            "Debug",
            this.properties.debug,
            (value) => {
                this.properties.debug = value;
                this.setDirtyCanvas(true);
            },
            { width: widgetWidth, tooltip: "Enable or disable debug logging to the console." }
        );

        // Reset Button
        this.addWidget(
            "button",
            "Reset",
            null,
            () => {
                this.resetNode();
            },
            { width: widgetWidth, tooltip: "Reset node to default settings." }
        );

        // Custom Keys for Each Input
        for (let i = 0; i < this.properties.numInputs; i++) {
            this.addWidget(
                "text",
                `Key${i + 1}`,
                this.properties.inputKeys[i],
                (v) => {
                    this.properties.inputKeys[i] = v || `Input${i + 1}`; // Default if empty
                    this.setDirtyCanvas(true);
                },
                {
                    width: widgetWidth,
                    label_width: 30,
                    position: [20, 150 + i * 30],
                    tooltip: `Define the key for Input${i + 1} in the output object.`
                }
            );
        }
    }

    /**
     * Reset the node to its default properties and state
     */
    resetNode() {
        this.properties = {
            numInputs: 1,
            mode: "Value",
            threshold: 0,
            emitNull: true,
            debug: false,
            inputKeys: ["Input1"],
        };
        this.previousValues = [null];
        this.size = [300, 180]; // Reset to initial size
        this.setupIO();
        this.setupWidgets();
        this.setDirtyCanvas(true);
        if (this.properties.debug) {
            console.log("[RBENode] Reset to default settings.");
        }
    }

    /**
     * Core execution logic of the node
     */
    onExecute() {
        let allInputsConnected = true;

        for (let i = 0; i < this.inputs.length; i++) {
            const inputData = this.getInputData(i);
            const key = this.properties.inputKeys[i] || `Input${i + 1}`;
            let shouldOutput = false;

            if (this.properties.mode === "Value") {
                // "Value" mode: Only pass if the value changes
                if (this.previousValues[i] !== inputData) {
                    shouldOutput = true;
                    this.previousValues[i] = inputData;
                }
            } else if (this.properties.mode === "Delta") {
                // "Delta" mode: Only pass if the change exceeds the threshold
                if (typeof inputData === "number") {
                    if (
                        this.previousValues[i] !== null &&
                        Math.abs(inputData - this.previousValues[i]) > this.properties.threshold
                    ) {
                        shouldOutput = true;
                        this.previousValues[i] = inputData;
                    } else if (this.previousValues[i] === null) {
                        // If no previous value, output the first received value
                        shouldOutput = true;
                        this.previousValues[i] = inputData;
                    }
                } else {
                    if (this.properties.debug) {
                        console.warn(`[RBENode] Delta mode requires numeric input. Received non-numeric data on ${key}.`);
                    }
                    // Optionally, skip or handle non-numeric data differently
                }
            }

            // Determine if output should be emitted
            if (shouldOutput) {
                this.setOutputData(0, inputData);

                if (this.properties.debug) {
                    console.log(`[RBENode] Output from ${key}:`, inputData);
                }
            } else {
                if (this.properties.emitNull) {
                    this.setOutputData(0, null);
                    if (this.properties.debug) {
                        console.log(`[RBENode] Output from ${key}: null`);
                    }
                } else {
                    this.setOutputData(0, undefined);
                }
                // If any input is not connected or has no data, mark allInputsConnected as false
                if (inputData === undefined) {
                    allInputsConnected = false;
                }
            }
        }

        if (this.properties.debug && !allInputsConnected) {
            console.warn(`[RBENode] Not all inputs are connected or have data.`);
        }
    }

    /**
     * Serialize the node's properties and internal state
     * @param {Object} o The object to serialize into
     */
    serialize() {
        const data = super.serialize();
        data.properties = { ...this.properties };
        data.state = {
            previousValues: [...this.previousValues],
        };
        return data;
    }

    /**
     * Deserialize the node's properties and internal state
     * @param {Object} o The serialized object
     */
    configure(data) {
        super.configure(data);
        if (data.properties) {
            this.properties = {
                ...this.properties,
                ...data.properties,
            };

            // Ensure 'inputKeys' array matches 'numInputs'
            if (this.properties.inputKeys.length < this.properties.numInputs) {
                for (let i = this.properties.inputKeys.length; i < this.properties.numInputs; i++) {
                    this.properties.inputKeys.push(`Input${i + 1}`);
                }
            } else if (this.properties.inputKeys.length > this.properties.numInputs) {
                this.properties.inputKeys = this.properties.inputKeys.slice(0, this.properties.numInputs);
                this.previousValues = this.previousValues.slice(0, this.properties.numInputs);
            }

            // Ensure 'previousValues' array matches 'numInputs'
            if (this.previousValues.length < this.properties.numInputs) {
                for (let i = this.previousValues.length; i < this.properties.numInputs; i++) {
                    this.previousValues.push(null);
                }
            } else if (this.previousValues.length > this.properties.numInputs) {
                this.previousValues = this.previousValues.slice(0, this.properties.numInputs);
            }

            // Adjust node size based on the number of inputs
            this.size[1] = 180 + this.properties.numInputs * 30; // Base height + space per input

            // Restore internal state if available
            if (data.state && data.state.previousValues) {
                this.previousValues = [...data.state.previousValues];
            }

            // Re-setup widgets to reflect deserialized properties
            this.setupIO();
            this.setupWidgets();
        }
    }

    /**
     * Provide context menu options for additional actions
     * @returns {Array} Array of context menu options
     */
    getContextMenuOptions() {
        const options = [];

        // Option to mute the node (if implementing mute functionality)
        // options.push({
        //     content: this.properties.muted ? "Unmute" : "Mute",
        //     callback: () => {
        //         this.properties.muted = !this.properties.muted;
        //         this.setDirtyCanvas(true);
        //         if (this.properties.debug) {
        //             console.log(`[RBENode] Mute set to ${this.properties.muted}`);
        //         }
        //     },
        // });

        return options;
    }

    /**
     * Handle node removal to clean up resources if necessary
     */
    onRemoved() {
        // Cleanup logic if needed
    }
}

// Register the node with LiteGraph
LiteGraph.registerNodeType("RedNodes/RBENode", RedNodes_RBENode);
