class RedNodes_ChangeNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Change Node";
        this.size = [240, 120]; // Initial size
        this.bgcolor = "rgb(80, 15, 10)"; // Valid RGB color

        // Properties
        this.properties = {
            changes: [
                { from: "msg.payload", to: "msg.modifiedPayload" },
            ], // Default transformation
            debug: false, // Debug toggle
        };

        // Inputs and Outputs
        this.addInput("Input", "*");
        this.addOutput("Output", "*");

        // Widgets
        this.setupWidgets();
    }

    /**
     * Initialize widgets and layout
     */
    setupWidgets() {
        // Clear existing widgets to prevent duplicates
        this.widgets = [];

        const widgetWidth = this.size[0] - 40; // Padding

        // Debug toggle
        this.addWidget(
            "toggle",
            "Debug",
            this.properties.debug,
            (v) => {
                this.properties.debug = v;
                this.setDirtyCanvas(true);
                if (v) {
                    console.log("[ChangeNode] Debug mode enabled.");
                }
            },
            { width: widgetWidth }
        );

        // Add Transformation Button
        this.addWidget(
            "button",
            "Add Transformation",
            null,
            () => {
                this.properties.changes.push({ from: "", to: "" });
                this.setDirtyCanvas(true);
                this.size[1] += 60; // Increase height to accommodate new widgets
                this.setupWidgets(); // Re-setup widgets to include the new transformation
            },
            { width: widgetWidth }
        );

        // Render existing transformation rules
        this.properties.changes.forEach((change, index) => {
            const baseY = 90 + index * 60; // Adjust Y position based on index

            // From Path Input
            this.addWidget(
                "text",
                `From ${index + 1}`,
                change.from,
                (v) => {
                    this.properties.changes[index].from = v;
                    this.setDirtyCanvas(true);
                },
                {
                    width: (widgetWidth / 2) - 10,
                    label_width: 50,
                    position: [20, baseY],
                    tooltip: "Enter the source path (e.g., msg.payload)"
                }
            );

            // To Path Input
            this.addWidget(
                "text",
                `To ${index + 1}`,
                change.to,
                (v) => {
                    this.properties.changes[index].to = v;
                    this.setDirtyCanvas(true);
                },
                {
                    width: (widgetWidth / 2) - 10,
                    label_width: 50,
                    position: [130, baseY],
                    tooltip: "Enter the destination path (e.g., msg.modifiedPayload)"
                }
            );

            // Remove Transformation Button
            this.addWidget(
                "button",
                `Remove ${index + 1}`,
                null,
                () => {
                    this.properties.changes.splice(index, 1);
                    this.size[1] -= 60; // Decrease height
                    this.setDirtyCanvas(true);
                    this.setupWidgets(); // Re-setup widgets to reflect removal
                },
                {
                    width: widgetWidth - 20,
                    position: [20, baseY + 30],
                    tooltip: "Remove this transformation rule"
                }
            );
        });

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
            changes: [
                { from: "msg.payload", to: "msg.modifiedPayload" },
            ],
            debug: false,
        };
        this.size = [240, 120]; // Reset to initial size
        this.setupWidgets();
        this.setDirtyCanvas(true);
        console.log("[ChangeNode] Reset to default settings.");
    }

    /**
     * Apply defined changes to the input data
     * @param {Object} inputData The incoming data object
     * @returns {Object} The transformed data object
     */
    applyChanges(inputData) {
        if (!inputData || typeof inputData !== 'object') {
            // If input data is not an object, return it unchanged
            return inputData;
        }

        // Deep copy to avoid mutating the original input
        const outputData = JSON.parse(JSON.stringify(inputData));

        for (const change of this.properties.changes) {
            const { from, to } = change;

            if (!from || !to) {
                // Skip incomplete transformation rules
                console.warn("[ChangeNode] Incomplete transformation rule:", change);
                continue;
            }

            // Retrieve value from the 'from' path
            const value = this.getValueFromPath(inputData, from);
            if (value !== undefined) {
                // Set value to the 'to' path in the output data
                this.setValueToPath(outputData, to, value);
            } else {
                console.warn(`[ChangeNode] Path "${from}" not found in input data.`);
            }
        }

        return outputData;
    }

    /**
     * Retrieve a value from a nested object based on a dot-separated path
     * @param {Object} obj The object to traverse
     * @param {String} path The dot-separated path (e.g., "msg.payload")
     * @returns {*} The value at the specified path or undefined if not found
     */
    getValueFromPath(obj, path) {
        return path.split('.').reduce((acc, key) => acc?.[key], obj);
    }

    /**
     * Set a value in a nested object based on a dot-separated path
     * @param {Object} obj The object to modify
     * @param {String} path The dot-separated path (e.g., "msg.modifiedPayload")
     * @param {*} value The value to set
     */
    setValueToPath(obj, path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        const target = keys.reduce((acc, key) => {
            if (!acc[key] || typeof acc[key] !== 'object') {
                acc[key] = {};
            }
            return acc[key];
        }, obj);
        target[lastKey] = value;
    }

    /**
     * Core execution logic of the node
     */
    onExecute() {
        const inputData = this.getInputData(0);
        const outputData = this.applyChanges(inputData);

        this.setOutputData(0, outputData);

        if (this.properties.debug) {
            console.log("[ChangeNode] Input:", inputData);
            console.log("[ChangeNode] Output:", outputData);
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

            // Ensure 'changes' array has valid structure
            if (!Array.isArray(this.properties.changes)) {
                this.properties.changes = [
                    { from: "msg.payload", to: "msg.modifiedPayload" },
                ];
            }

            // Adjust node size based on the number of transformations
            this.size[1] = 120 + this.properties.changes.length * 60; // Base height + space per transformation

            // Re-setup widgets to reflect deserialized properties
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
        //             console.log(`[ChangeNode] Mute set to ${this.properties.muted}`);
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
LiteGraph.registerNodeType("RedNodes/ChangeNode", RedNodes_ChangeNode);
