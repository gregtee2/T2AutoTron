// Ensure expr-eval is loaded
// Include this in your HTML: <script src="https://cdnjs.cloudflare.com/ajax/libs/expr-eval/2.0.2/expr-eval.min.js"></script>

class RedNodes_SwitchNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Switch Node";
        this.size = [500, 200];
        this.bgcolor = "rgb(80, 15, 10)"; // Valid RGB color

        // Properties
        this.properties = {
            numInputs: 1, // Number of input ports
            inputsConfig: [], // Array to hold conditions for each input
            debug: false,   // Debug mode
            evaluateAll: false, // Toggle to evaluate all matching conditions
        };

        // Initialize inputsConfig with default input
        this.properties.inputsConfig.push({
            conditions: [
                {
                    condition: "payload > 0",
                    label: "Output 1",
                },
            ],
        });

        // Inputs and Outputs
        this.setupIO();

        // Widgets
        this.setupWidgets();

        // Cache for compiled condition functions
        // Structure: [ [conditionFunc1, conditionFunc2, ...], [ ... ], ... ]
        this.conditionFunctions = [];

        // Compile initial conditions
        this.compileAllConditions();
    }

    /**
     * Setup Inputs and Outputs based on numInputs property
     */
    setupIO() {
        // Clear existing inputs and outputs
        this.inputs = [];
        this.outputs = [];

        // Add inputs based on numInputs property
        for (let i = 1; i <= this.properties.numInputs; i++) {
            this.addInput(`Input${i}`, "any");
        }

        // Add Default output
        this.addOutput("Default", "any");

        // Add outputs for conditions per input
        this.properties.inputsConfig.forEach((inputConfig, inputIndex) => {
            inputConfig.conditions.forEach((condition, condIndex) => {
                this.addOutput(
                    `Input${inputIndex + 1} - ${condition.label}`,
                    "any"
                );
            });
        });
    }

    /**
     * Setup widgets for the node.
     */
    setupWidgets() {
        // Clear existing widgets to prevent duplicates
        this.widgets = [];

        const widgetWidth = this.size[0] - 40; // Padding

        // Slider to adjust the number of inputs
        this.addWidget(
            "slider",
            "Number of Inputs",
            this.properties.numInputs,
            (value) => {
                const newNum = Math.floor(value);
                if (newNum !== this.properties.numInputs) {
                    this.properties.numInputs = newNum;
                    this.updateInputs(newNum);
                }
            },
            {
                min: 1,
                max: 10, // Adjust as needed
                step: 1,
                width: widgetWidth,
                tooltip: "Adjust the number of input ports.",
            }
        );

        // Toggle for Debug mode
        this.addWidget(
            "toggle",
            "Debug",
            this.properties.debug,
            (value) => {
                this.properties.debug = value;
            },
            { width: widgetWidth, tooltip: "Enable or disable debug logging." }
        );

        // Toggle for Evaluate All Matches
        this.addWidget(
            "toggle",
            "Evaluate All",
            this.properties.evaluateAll,
            (value) => {
                this.properties.evaluateAll = value;
            },
            { width: widgetWidth, tooltip: "Evaluate all conditions or stop at the first match." }
        );
    }

    /**
     * Update input ports based on the new number of inputs.
     * @param {number} newNum - The new number of inputs.
     */
    updateInputs(newNum) {
        // Adjust inputsConfig array
        while (this.properties.inputsConfig.length < newNum) {
            // Add new input config with a default condition
            this.properties.inputsConfig.push({
                conditions: [
                    {
                        condition: "payload > 0",
                        label: `Output ${this.properties.inputsConfig.length + 1}`,
                    },
                ],
            });
        }
        while (this.properties.inputsConfig.length > newNum) {
            // Remove excess input configs
            this.properties.inputsConfig.pop();
        }

        // Adjust condition functions cache
        while (this.conditionFunctions.length < newNum) {
            this.conditionFunctions.push([]);
        }
        while (this.conditionFunctions.length > newNum) {
            this.conditionFunctions.pop();
        }

        // Recompile all conditions
        this.compileAllConditions();

        // Reconfigure IO
        this.setupIO();

        // Adjust node size based on number of inputs and conditions
        const baseHeight = 200;
        const heightPerCondition = 20;
        const totalConditions = this.properties.inputsConfig.reduce(
            (acc, input) => acc + input.conditions.length,
            0
        );
        this.size[1] = baseHeight + totalConditions * heightPerCondition;

        // Update widgets' positions if necessary
        this.setupWidgets();

        // Trigger reconfiguration to update the UI
        this.trigger("configure");
    }

    /**
     * Compile all conditions and cache them
     */
    compileAllConditions() {
        this.conditionFunctions = [];
        this.properties.inputsConfig.forEach((inputConfig, inputIndex) => {
            const condFuncs = [];
            inputConfig.conditions.forEach((condition, condIndex) => {
                try {
                    const expr = exprEval.Parser.parse(condition.condition);
                    condFuncs.push(expr);
                } catch (err) {
                    console.error(`[SwitchNode] Invalid condition syntax in Input${inputIndex + 1} Condition${condIndex + 1}: "${condition.condition}"`, err);
                    condFuncs.push(null);
                }
            });
            this.conditionFunctions.push(condFuncs);
        });
    }

    /**
     * Add a new condition to a specific input
     * @param {number} inputIndex - The index of the input to add the condition to
     * @param {string} conditionStr - The condition as a string
     * @param {string} label - The label for the output
     */
    addConditionToInput(inputIndex, conditionStr, label) {
        if (inputIndex < 0 || inputIndex >= this.properties.inputsConfig.length) return;

        this.properties.inputsConfig[inputIndex].conditions.push({
            condition: conditionStr,
            label: label,
        });

        // Compile the new condition
        try {
            const expr = exprEval.Parser.parse(conditionStr);
            this.conditionFunctions[inputIndex].push(expr);
        } catch (err) {
            console.error(`[SwitchNode] Invalid condition syntax in Input${inputIndex + 1} Condition${this.properties.inputsConfig[inputIndex].conditions.length}: "${conditionStr}"`, err);
            this.conditionFunctions[inputIndex].push(null);
        }

        // Reconfigure IO
        this.setupIO();

        // Adjust node size
        this.size[1] += 20;

        this.trigger("configure");
    }

    /**
     * Remove a condition from a specific input
     * @param {number} inputIndex - The index of the input
     * @param {number} conditionIndex - The index of the condition to remove
     */
    removeConditionFromInput(inputIndex, conditionIndex) {
        if (
            inputIndex < 0 ||
            inputIndex >= this.properties.inputsConfig.length ||
            conditionIndex < 0 ||
            conditionIndex >= this.properties.inputsConfig[inputIndex].conditions.length
        )
            return;

        // Remove condition
        this.properties.inputsConfig[inputIndex].conditions.splice(conditionIndex, 1);
        this.conditionFunctions[inputIndex].splice(conditionIndex, 1);

        // Reconfigure IO
        this.setupIO();

        // Adjust node size
        this.size[1] -= 20;

        this.trigger("configure");
    }

    /**
     * Move a condition up or down within a specific input's condition list
     * @param {number} inputIndex - The index of the input
     * @param {number} conditionIndex - The current index of the condition
     * @param {number} direction - -1 to move up, 1 to move down
     */
    moveConditionWithinInput(inputIndex, conditionIndex, direction) {
        const newIndex = conditionIndex + direction;
        const conditions = this.properties.inputsConfig[inputIndex].conditions;
        const condFuncs = this.conditionFunctions[inputIndex];

        if (newIndex < 0 || newIndex >= conditions.length) return;

        // Swap conditions
        [conditions[conditionIndex], conditions[newIndex]] = [conditions[newIndex], conditions[conditionIndex]];
        [condFuncs[conditionIndex], condFuncs[newIndex]] = [condFuncs[newIndex], condFuncs[conditionIndex]];

        // Reconfigure IO
        this.setupIO();

        this.trigger("configure");
    }

    /**
     * Render the node in the editor and show condition details.
     * Provides visual feedback for conditions.
     */
    onDrawForeground(ctx) {
        super.onDrawForeground?.(ctx);

        const baseY = 100;
        let currentY = baseY;

        this.properties.inputsConfig.forEach((inputConfig, inputIndex) => {
            // Draw input label
            ctx.font = "14px Arial";
            ctx.textAlign = "left";
            ctx.fillStyle = "#FFFFFF";
            ctx.fillText(`Input${inputIndex + 1}:`, 10, currentY);

            currentY += 20;

            inputConfig.conditions.forEach((condition, condIndex) => {
                // Set color based on validity
                if (
                    this.conditionFunctions[inputIndex][condIndex] &&
                    this.conditionFunctions[inputIndex][condIndex].valid
                ) {
                    ctx.fillStyle = "#00FF00"; // Green for valid conditions
                } else {
                    ctx.fillStyle = "#FF5555"; // Red for invalid conditions
                }

                // Display condition text
                ctx.fillText(
                    `${condIndex + 1}: ${condition.condition}`,
                    30,
                    currentY
                );

                currentY += 20;
            });

            currentY += 10; // Extra space between inputs
        });
    }

    /**
     * Evaluate conditions and route input data.
     */
    onExecute() {
        // Iterate over each input port
        for (let inputIndex = 0; inputIndex < this.properties.numInputs; inputIndex++) {
            const inputData = this.getInputData(inputIndex);
            let matched = false;

            if (inputData === undefined) {
                // Skip if no data on this input
                continue;
            }

            // Validate inputData is an object
            if (typeof inputData !== "object" || inputData === null) {
                if (this.properties.debug) {
                    console.warn(`[SwitchNode] Input${inputIndex + 1} data is not a valid object.`);
                }
                // Optionally, route to Default output or handle as needed
                this.setOutputData(0, inputData);
                continue;
            }

            const inputConditions = this.properties.inputsConfig[inputIndex].conditions;
            const inputCondFuncs = this.conditionFunctions[inputIndex];

            if (this.properties.evaluateAll) {
                // Evaluate all conditions and trigger matching outputs
                inputConditions.forEach((condition, i) => {
                    const expr = inputCondFuncs[i];
                    if (expr && expr.valid) {
                        try {
                            const context = { payload: inputData };
                            const result = expr.evaluate(context);
                            if (result) {
                                this.setOutputData(i + 1, inputData);
                                matched = true;
                            }
                        } catch (err) {
                            if (this.properties.debug) {
                                console.error(`[SwitchNode] Error evaluating condition ${i + 1} on Input${inputIndex + 1}: ${condition.condition}`, err);
                            }
                        }
                    }
                });
            } else {
                // Evaluate until first match
                for (let i = 0; i < inputConditions.length; i++) {
                    const condition = inputConditions[i];
                    const expr = inputCondFuncs[i];
                    if (expr && expr.valid) {
                        try {
                            const context = { payload: inputData };
                            const result = expr.evaluate(context);
                            if (result) {
                                this.setOutputData(i + 1, inputData);
                                matched = true;
                                break;
                            }
                        } catch (err) {
                            if (this.properties.debug) {
                                console.error(`[SwitchNode] Error evaluating condition ${i + 1} on Input${inputIndex + 1}: ${condition.condition}`, err);
                            }
                        }
                    }
                }
            }

            // If no conditions match, send data to Default output (index 0)
            if (!matched) {
                this.setOutputData(0, inputData);
            }

            if (this.properties.debug) {
                console.log(`[SwitchNode] Input${inputIndex + 1}:`, inputData);
                console.log(`[SwitchNode] Conditions:`, inputConditions);
                console.log(`[SwitchNode] Matched:`, matched);
            }
        }
    }

    /**
     * Add UI for editing conditions in the LiteGraph Inspector.
     */
    onInspect(inspector) {
        this.properties.inputsConfig.forEach((inputConfig, inputIndex) => {
            inspector.addSeparator();
            inspector.addTitle(`Input${inputIndex + 1} Conditions`);

            inputConfig.conditions.forEach((condition, condIndex) => {
                const conditionID = `input${inputIndex + 1}_cond${condIndex + 1}`;

                inspector.addStringField(
                    `Condition ${condIndex + 1}`,
                    condition.condition,
                    (value) => {
                        condition.condition = value;
                        this.compileCondition(inputIndex, condIndex);
                        this.trigger("configure");
                    },
                    { tooltip: "Define the condition expression using 'payload' as the input data." }
                );

                inspector.addStringField(
                    `Output Label ${condIndex + 1}`,
                    condition.label,
                    (value) => {
                        condition.label = value;
                        this.setupIO(); // Re-setup IO to update output labels
                        this.trigger("configure");
                    },
                    { tooltip: "Set the label for the output port corresponding to this condition." }
                );

                inspector.addButton(
                    `Move Up ${condIndex + 1}`,
                    () => {
                        this.moveConditionWithinInput(inputIndex, condIndex, -1);
                    },
                    { tooltip: "Move this condition up in the list." }
                );

                inspector.addButton(
                    `Move Down ${condIndex + 1}`,
                    () => {
                        this.moveConditionWithinInput(inputIndex, condIndex, 1);
                    },
                    { tooltip: "Move this condition down in the list." }
                );

                inspector.addButton(
                    `Remove Condition ${condIndex + 1}`,
                    () => {
                        this.removeConditionFromInput(inputIndex, condIndex);
                    },
                    { tooltip: "Remove this condition from the node." }
                );

                inspector.addSpacer();
            });

            // Button to add a new condition to this input
            inspector.addButton(
                `Add Condition to Input${inputIndex + 1}`,
                () => {
                    const newLabel = `Output ${inputConfig.conditions.length + 1}`;
                    this.addConditionToInput(inputIndex, "payload > 0", newLabel);
                },
                { tooltip: `Add a new condition to Input${inputIndex + 1}.` }
            );
        });
    }

    /**
     * Compile a specific condition
     * @param {number} inputIndex - The index of the input
     * @param {number} condIndex - The index of the condition
     */
    compileCondition(inputIndex, condIndex) {
        const conditionStr = this.properties.inputsConfig[inputIndex].conditions[condIndex].condition;
        try {
            const expr = exprEval.Parser.parse(conditionStr);
            this.conditionFunctions[inputIndex][condIndex] = expr;
            this.conditionFunctions[inputIndex][condIndex].valid = true;
        } catch (err) {
            console.error(`[SwitchNode] Invalid condition syntax in Input${inputIndex + 1} Condition${condIndex + 1}: "${conditionStr}"`, err);
            this.conditionFunctions[inputIndex][condIndex] = null;
        }
    }

    /**
     * Serialize the node (save the conditions and properties).
     */
    serialize() {
        const data = super.serialize();
        data.properties = { ...this.properties };
        return data;
    }

    /**
     * Restore the node's state (load the conditions and properties).
     */
    configure(data) {
        super.configure(data);
        if (data.properties) {
            Object.assign(this.properties, data.properties);

            // Ensure conditionFunctions array matches inputsConfig
            this.compileAllConditions();

            // Reconfigure IO
            this.setupIO();

            // Adjust node size based on number of conditions
            const baseHeight = 200;
            const heightPerCondition = 20;
            const totalConditions = this.properties.inputsConfig.reduce(
                (acc, input) => acc + input.conditions.length,
                0
            );
            this.size[1] = baseHeight + totalConditions * heightPerCondition;

            // Re-setup widgets
            this.setupWidgets();
        }
    }

    /**
     * Initialize the node with default conditions.
     * This method is called once when the node is created.
     */
    onConfigure() {
        // Ensure at least one condition exists for each input
        this.properties.inputsConfig.forEach((inputConfig, inputIndex) => {
            if (inputConfig.conditions.length === 0) {
                inputConfig.conditions.push({
                    condition: "payload > 0",
                    label: `Output ${inputConfig.conditions.length + 1}`,
                });
                this.conditionFunctions[inputIndex].push(null); // Will be compiled
            }
        });

        // Recompile all conditions
        this.compileAllConditions();
    }

    /**
     * Optional: Add tooltips or descriptions for the node and its widgets.
     */
    onShowDescription() {
        // This method can be used to set descriptions or tooltips
        // Depending on the LiteGraph implementation
    }

    /**
     * Optional: Handle node resizing or other UI interactions.
     */
    onResize() {
        // Implement if needed
    }
}

// Register the node
LiteGraph.registerNodeType("RedNodes/SwitchNode", RedNodes_SwitchNode);
