class RedNodes_JoinNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Join";
        this.size = [300, 150]; // Increased width and height for additional widgets

        // Properties
        this.properties = {
            numInputs: 2, // Default number of inputs
            debug: false,
            inputKeys: ["Input1", "Input2"], // Default keys
        };

        // Internal Data
        this.data = {};

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
        for (let i = 0; i < this.properties.numInputs; i++) {
            this.addInput(`Input${i + 1}`, "*");
        }

        // Add single output
        this.addOutput("Out", "*");
    }

    /**
     * Initialize widgets and layout
     */
    setupWidgets() {
        // Clear existing widgets to prevent duplicates
        this.widgets = [];

        const widgetWidth = this.size[0] - 40; // Padding

        // Debug Toggle
        this.addWidget(
            "toggle",
            "Debug",
            this.properties.debug,
            (v) => {
                this.properties.debug = v;
                this.setDirtyCanvas(true);
                if (v) {
                    console.log("[JoinNode] Debug mode enabled.");
                } else {
                    console.log("[JoinNode] Debug mode disabled.");
                }
            },
            { width: widgetWidth }
        );

        // Number of Inputs Slider
        this.addWidget(
            "slider",
            "Inputs",
            this.properties.numInputs,
            (v) => {
                const newNum = Math.floor(v);
                if (newNum !== this.properties.numInputs) {
                    this.properties.numInputs = newNum;
                    // Adjust inputKeys array accordingly
                    while (this.properties.inputKeys.length < newNum) {
                        this.properties.inputKeys.push(`Input${this.properties.inputKeys.length + 1}`);
                    }
                    while (this.properties.inputKeys.length > newNum) {
                        this.properties.inputKeys.pop();
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
                    position: [20, 100 + i * 30],
                    tooltip: `Define the key for Input${i + 1} in the output object.`
                }
            );
        }

        // Reset Button (positioned at the bottom)
        this.addWidget(
            "button",
            "Reset",
            null,
            () => {
                this.resetNode();
            },
            {
                width: widgetWidth,
                position: [20, this.size[1] - 40],
                tooltip: "Reset to default settings"
            }
        );
    }

    /**
     * Reset the node to its default properties and state
     */
    resetNode() {
        this.properties = {
            numInputs: 2,
            debug: false,
            inputKeys: ["Input1", "Input2"],
        };
        this.size = [300, 150]; // Reset to initial size
        this.setupIO();
        this.setupWidgets();
        this.setDirtyCanvas(true);
        console.log("[JoinNode] Reset to default settings.");
    }

    /**
     * Core execution logic of the node
     */
    onExecute() {
        // Reset data at the start of execution
        this.data = {};
        let allInputsConnected = true;

        for (let i = 0; i < this.inputs.length; i++) {
            const inputData = this.getInputData(i);
            const key = this.properties.inputKeys[i] || `Input${i + 1}`;

            if (inputData !== undefined) {
                this.data[key] = inputData;
                if (this.properties.debug) {
                    console.log(`[JoinNode] Received from ${key}:`, inputData);
                }
            } else {
                allInputsConnected = false;
                if (this.properties.debug) {
                    console.warn(`[JoinNode] ${key} is not connected or has no data.`);
                }
                // Optionally, set a flag or update widget to indicate missing input
            }
        }

        if (allInputsConnected) {
            if (this.properties.debug) {
                console.log(`[JoinNode] Output Data:`, this.data);
            }
            this.setOutputData(0, this.data);
        } else {
            if (this.properties.debug) {
                console.warn(`[JoinNode] Not all inputs have data. Output not emitted.`);
            }
            // Optionally, emit partial data or handle differently
            this.setOutputData(0, this.data); // Emit whatever data is available
        }
    }

    /**
     * Serialize the node's properties and state
     * @param {Object} o The object to serialize into
     */
    onSerialize(o) {
        o.version = 1; // Versioning for future compatibility
        o.properties = {
            ...this.properties,
        };
        o.size = this.size;
        o.title = this.title;
    }

    /**
     * Deserialize the node's properties and state
     * @param {Object} o The serialized object
     */
    onConfigure(o) {
        if (o.properties) {
            this.properties = {
                ...this.properties,
                ...o.properties,
            };

            // Ensure 'inputKeys' array matches 'numInputs'
            if (this.properties.inputKeys.length < this.properties.numInputs) {
                for (let i = this.properties.inputKeys.length; i < this.properties.numInputs; i++) {
                    this.properties.inputKeys.push(`Input${i + 1}`);
                }
            } else if (this.properties.inputKeys.length > this.properties.numInputs) {
                this.properties.inputKeys = this.properties.inputKeys.slice(0, this.properties.numInputs);
            }

            // Adjust node size based on the number of transformations
            this.size[1] = 150 + this.properties.numInputs * 30; // Base height + space per transformation

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
        //             console.log(`[JoinNode] Mute set to ${this.properties.muted}`);
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

// Register the node
LiteGraph.registerNodeType("RedNodes/JoinNode", RedNodes_JoinNode);
