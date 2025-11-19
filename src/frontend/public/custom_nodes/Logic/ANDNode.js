class AND_OR_Node extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Logic Operations";
        this.bgcolor = "rgb(38, 56, 90)";

        this.size = [180, 0]; // Let LiteGraph calculate height dynamically

        this.properties = {
            mode: "AND",
            debug: false,
            maxInputs: 2,
            expectedTopics: [],
            persistState: false,
            trueValues: ["true", "on", "1"],
            falseValues: ["false", "off", "0"],
            setVariable: "",
            compareInputIndex: -1,
            compareOperator: ">",
            compareThreshold: 80
        };

        this.resultState = false;
        this.inputBuffer = {};
        this.previousA = null;
        this.variables = {};
        this.inputValues = []; // For debug display
        this.inputBooleanValues = []; // For debug display

        this.updateInputs();

        this.addOutput("Result", "boolean");
        this.addOutput("Otherwise", "boolean");
        this.addOutput("Value", "number");
        this.addOutput("HSV", "*");
        this.addOutput("Variable", "*");

        this.addWidget("combo", "Mode", this.properties.mode, (value) => {
            this.properties.mode = value;
            if (this.properties.debug) console.log(`[LogicNode] Mode set to ${value}`);
        }, { 
            values: [
                "AND", "OR", "NAND", "NOR", "XOR", "XNOR", 
                "IMPLIES", "BICOND", "CustomTrigger", 
                "RisingEdge", "FallingEdge"
            ]
        });

        this.addWidget("toggle", "Debug", this.properties.debug, (value) => {
            this.properties.debug = value;
            console.log(`[LogicNode] Debug mode ${value ? "enabled" : "disabled"}`);
        });

        this.addWidget("slider", "Max Inputs", this.properties.maxInputs, (value) => {
            this.properties.maxInputs = Math.max(2, Math.min(8, Math.floor(value)));
            this.updateInputs();
            this.updateCompareInputWidget();
        }, { min: 2, max: 8, step: 1, precision: 0 });

        this.addWidget("text", "Topics", this.properties.expectedTopics.join(","), (value) => {
            this.properties.expectedTopics = value.split(",").map(t => t.trim()).filter(t => t);
            this.inputBuffer = {};
        });

        this.compareInputWidget = this.addWidget("combo", "Compare Input", this.getCompareInputLabel(this.properties.compareInputIndex), (label) => {
            const options = this.getCompareInputOptions();
            const selectedOption = options.find(opt => opt.label === label);
            this.properties.compareInputIndex = selectedOption ? parseInt(selectedOption.value) : -1;
            if (this.properties.debug) console.log(`[LogicNode] Compare Input set to index ${this.properties.compareInputIndex}`);
        }, { values: this.getCompareInputOptions().map(opt => opt.label) });

        this.addWidget("combo", "Operator", this.properties.compareOperator, (value) => {
            this.properties.compareOperator = value;
        }, { values: [">", "<", "=", ">=", "<=", "!="] });

        this.addWidget("slider", "Threshold", this.properties.compareThreshold, (value) => {
            this.properties.compareThreshold = value;
        }, { min: -150, max: 150, step: 1, precision: 0 });

        this.addWidget("toggle", "Persist State", this.properties.persistState, (value) => {
            this.properties.persistState = value;
            console.log(`[LogicNode] State persistence ${value ? "enabled" : "disabled"}`);
        });

        this.addWidget("text", "True Values", this.properties.trueValues.join(","), (value) => {
            this.properties.trueValues = value.split(",").map(t => t.trim()).filter(t => t);
        });

        this.addWidget("text", "False Values", this.properties.falseValues.join(","), (value) => {
            this.properties.falseValues = value.split(",").map(t => t.trim()).filter(t => t);
        });

        this.addWidget("text", "Set Variable", this.properties.setVariable, (value) => {
            this.properties.setVariable = value;
        });

        this.loadState();
    }

    getCompareInputOptions() {
        const options = [{ label: "Disabled", value: "-1" }];
        for (let i = 0; i < this.properties.maxInputs; i++) {
            const label = i === 0 ? "A" : i === 1 ? "B" : `Input ${i + 1}`;
            options.push({ label: label, value: i.toString() });
        }
        return options;
    }

    getCompareInputLabel(index) {
        const options = this.getCompareInputOptions();
        const option = options.find(opt => parseInt(opt.value) === index);
        return option ? option.label : "Disabled";
    }

    updateCompareInputWidget() {
        const widget = this.widgets.find(w => w.name === "Compare Input");
        if (widget) {
            widget.options.values = this.getCompareInputOptions().map(opt => opt.label);
            const currentValue = parseInt(this.properties.compareInputIndex);
            if (currentValue >= this.properties.maxInputs) {
                widget.value = "Disabled";
                this.properties.compareInputIndex = -1;
            } else {
                widget.value = this.getCompareInputLabel(currentValue);
            }
        }
    }

    updateInputs() {
        const currentInputs = this.inputs || [];
        const currentInputNames = currentInputs.map(input => input.name);
        const desiredInputCount = this.properties.maxInputs;

        const desiredInputNames = [];
        for (let i = 0; i < desiredInputCount; i++) {
            const label = i === 0 ? "A" : i === 1 ? "B" : `Input ${i + 1}`;
            desiredInputNames.push(label);
        }

        if (currentInputNames.length !== desiredInputNames.length ||
            !currentInputNames.every((name, index) => name === desiredInputNames[index])) {
            while (currentInputs.length > desiredInputNames.length) {
                this.removeInput(currentInputs.length - 1);
            }
            for (let i = 0; i < desiredInputNames.length; i++) {
                if (i < currentInputs.length) {
                    if (currentInputs[i].name !== desiredInputNames[i]) {
                        currentInputs[i].name = desiredInputNames[i];
                    }
                    // Suppress default label rendering
                    currentInputs[i].label = "";
                } else {
                    this.addInput(desiredInputNames[i], "*");
                    this.inputs[i].label = ""; // Suppress label for new inputs
                }
            }
        }
    }

    translateInput(value) {
        if (typeof value === "string") {
            const lowerVal = value.toLowerCase();
            if (this.properties.trueValues.includes(lowerVal)) return true;
            if (this.properties.falseValues.includes(lowerVal)) return false;
        }
        return !!value;
    }

    saveState() {
        if (!this.properties.persistState) return;
        const state = {
            inputBuffer: this.inputBuffer,
            resultState: this.resultState,
            variables: this.variables,
            previousA: this.previousA
        };
        localStorage.setItem(`logic_node_${this.id}`, JSON.stringify(state));
        if (this.properties.debug) console.log(`[LogicNode] Saved state: ${JSON.stringify(state)}`);
    }

    loadState() {
        if (!this.properties.persistState) return;
        const state = localStorage.getItem(`logic_node_${this.id}`);
        if (state) {
            const parsed = JSON.parse(state);
            this.inputBuffer = parsed.inputBuffer || {};
            this.resultState = parsed.resultState || false;
            this.variables = parsed.variables || {};
            this.previousA = parsed.previousA || null;
            if (this.properties.debug) console.log(`[LogicNode] Loaded state: ${JSON.stringify(parsed)}`);
        }
    }

    onExecute() {
        this.loadState();

        for (let i = 0; i < this.inputs.length; i++) {
            const data = this.getInputData(i);
            const topic = this.properties.expectedTopics[i] || `input${i + 1}`;
            if (data !== undefined) {
                this.inputBuffer[topic] = data;
            } else {
                this.inputBuffer[topic] = undefined;
            }
        }

        const allInputsReceived = this.properties.expectedTopics.length === 0 ||
            this.properties.expectedTopics.every(topic => topic in this.inputBuffer);

        if (!allInputsReceived && this.properties.maxInputs > 2) {
            if (this.properties.debug) console.log(`[LogicNode] Waiting for all inputs`);
            return;
        }

        const values = [];
        for (let i = 0; i < this.properties.maxInputs; i++) {
            const topic = this.properties.expectedTopics[i] || `input${i + 1}`;
            values[i] = this.inputBuffer[topic];
        }

        const numericValue = values.find(val => Number.isInteger(val));
        const A = this.translateInput(this.getInputData(0));

        let result = false;
        let comparisonResult = true;
        let booleanValues = [];

        if (this.properties.mode === "RisingEdge" || this.properties.mode === "FallingEdge") {
            if (this.previousA !== null) {
                if (this.properties.mode === "RisingEdge") {
                    result = !this.previousA && A;
                } else {
                    result = this.previousA && !A;
                }
            }
            this.previousA = A;
        } else {
            const compareIndex = this.properties.compareInputIndex;

            if (this.properties.debug) {
                console.log(`[LogicNode] Compare Index: ${compareIndex}, Values Length: ${values.length}`);
            }

            if (compareIndex >= 0 && compareIndex < values.length) {
                const compareValue = values[compareIndex];
                const threshold = this.properties.compareThreshold;
                const operator = this.properties.compareOperator;

                if (compareValue === undefined) {
                    comparisonResult = false;
                    if (this.properties.debug) {
                        console.log(`[LogicNode] Comparison failed: Input ${compareIndex} is undefined`);
                    }
                } else {
                    const numValue = Number(compareValue);
                    if (!isNaN(numValue)) {
                        switch (operator) {
                            case ">":
                                comparisonResult = numValue > threshold;
                                break;
                            case "<":
                                comparisonResult = numValue < threshold;
                                break;
                            case "=":
                                comparisonResult = numValue === threshold;
                                break;
                            case ">=":
                                comparisonResult = numValue >= threshold;
                                break;
                            case "<=":
                                comparisonResult = numValue <= threshold;
                                break;
                            case "!=":
                                comparisonResult = numValue !== threshold;
                                break;
                            default:
                                comparisonResult = true;
                        }
                        if (this.properties.debug) {
                            console.log(`[LogicNode] Comparison: Input ${compareIndex} (${numValue}) ${operator} ${threshold} = ${comparisonResult}`);
                        }
                    } else {
                        comparisonResult = false;
                        if (this.properties.debug) {
                            console.log(`[LogicNode] Comparison failed: Input ${compareIndex} (${compareValue}) is not numeric`);
                        }
                    }
                }
            } else if (this.properties.debug && compareIndex >= 0) {
                console.log(`[LogicNode] Comparison skipped: Invalid compareIndex ${compareIndex}, values length ${values.length}`);
            }

            booleanValues = values.map((val, index) => {
                if (index === compareIndex) {
                    return comparisonResult;
                }
                const translated = this.translateInput(val);
                if (this.properties.debug) {
                    console.log(`[LogicNode] Input ${index}: ${val} -> ${translated}`);
                }
                return translated;
            });

            this.inputValues = values;
            this.inputBooleanValues = booleanValues;

            switch (this.properties.mode) {
                case "AND":
                    result = booleanValues.every((v, i) => values[i] === undefined || v);
                    break;
                case "OR":
                    result = booleanValues.some(v => v);
                    break;
                case "NAND":
                    result = !booleanValues.every(v => v);
                    break;
                case "NOR":
                    result = !booleanValues.some(v => v);
                    break;
                case "XOR":
                    result = booleanValues.filter(v => v).length % 2 === 1;
                    break;
                case "XNOR":
                    result = booleanValues.filter(v => v).length % 2 === 0;
                    break;
                case "IMPLIES":
                    result = !booleanValues[0] || booleanValues[1];
                    break;
                case "BICOND":
                    result = booleanValues[0] === booleanValues[1];
                    break;
                case "CustomTrigger":
                    result = !booleanValues[0] && booleanValues[1];
                    break;
                default:
                    result = false;
            }
        }

        this.resultState = result;

        if (this.properties.setVariable && result) {
            this.variables[this.properties.setVariable] = result;
            if (this.properties.debug) {
                console.log(`[LogicNode] Set ${this.properties.setVariable} = ${result}`);
            }
        }

        this.setOutputData(0, result);
        this.setOutputData(1, !result);
        this.setOutputData(2, result && numericValue !== undefined ? numericValue : null);
        this.setOutputData(3, null);
        this.setOutputData(4, this.variables[this.properties.setVariable] || null);

        if (this.properties.debug) {
            if (this.properties.mode === "RisingEdge" || this.properties.mode === "FallingEdge") {
                console.log(`[LogicNode] Inputs: ${JSON.stringify(this.inputBuffer)}, Final Result: ${result}`);
            } else {
                console.log(`[LogicNode] Inputs: ${JSON.stringify(this.inputBuffer)}, Comparison Result: ${comparisonResult}, Boolean Values: ${JSON.stringify(booleanValues)}, Final Result: ${result}`);
            }
        }

        this.saveState();
    }

    onDrawBackground(ctx) {
        if (super.onDrawBackground) super.onDrawBackground(ctx);
        ctx.strokeStyle = this.resultState ? "#00FF00" : "#FF0000";
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, this.size[0], this.size[1]);
    }

    onDrawForeground(ctx) {
        if (super.onDrawForeground) super.onDrawForeground(ctx);

        ctx.fillStyle = "#FFF";
        ctx.font = "12px Arial";
        ctx.textAlign = "center";

        const modeText = `Mode: ${this.properties.mode}`;
        const resultText = `Result: ${this.resultState}`;

        const paddingTop = 20;
        const paddingBottom = 10;
        const titleHeight = 40; // Space for title and mode text
        const slotHeight = 20; // Height per input slot

        // Draw mode text
        ctx.fillText(modeText, this.size[0] / 2, paddingTop);

        // Draw result text at the bottom
        ctx.fillText(resultText, this.size[0] / 2, this.size[1] - paddingBottom);

        // Debug display aligned with input slots
        ctx.textAlign = "left";
        ctx.font = "10px Arial";
        ctx.fillStyle = "#FFF";

        // Start input slots and debug display below the mode text, with extra spacing
        const inputStartY = titleHeight - 5; // Start inputs lower to avoid overlap
        let yOffset = inputStartY;

        for (let i = 0; i < this.properties.maxInputs; i++) {
            const inputName = i === 0 ? "A" : i === 1 ? "B" : `Input ${i + 1}`;
            const value = this.inputValues[i] !== undefined ? this.inputValues[i] : "undefined";
            const boolValue = this.inputBooleanValues[i] !== undefined ? this.inputBooleanValues[i] : "N/A";
            const displayText = `${inputName}: ${value} (${boolValue})`;

            // Align text with the input slot
            const slotY = yOffset + (i * slotHeight);
            ctx.fillText(displayText, 20, slotY + 4); // Adjusted offset to center vertically with slot

            // Set the position of the input slot (LiteGraph uses this internally)
            if (this.inputs[i]) {
                this.inputs[i].pos = [10, slotY];
            }
        }

        // Ensure the node is tall enough to accommodate title, mode text, debug display, inputs, and result text
        const minHeight = inputStartY + (this.properties.maxInputs * slotHeight) + paddingBottom + 320; // Extra padding
        if (this.size[1] < minHeight) {
            this.size[1] = minHeight;
            if (this.graph && this.graph.canvas) {
                this.graph.canvas.setDirty(true, true);
            }
        }

        // Ensure minimum width
        if (this.size[0] < 225) {
            this.size[0] = 225;
            if (this.graph && this.graph.canvas) {
                this.graph.canvas.setDirty(true, true);
            }
        }
    }

    serialize() {
        const data = super.serialize();
        data.properties = { ...this.properties };
        return data;
    }

    configure(data) {
        super.configure(data);
        if (data.properties) {
            this.properties = {
                mode: data.properties.mode || "AND",
                debug: data.properties.debug || false,
                maxInputs: data.properties.maxInputs || 2,
                expectedTopics: data.properties.expectedTopics || [],
                persistState: data.properties.persistState || false,
                trueValues: data.properties.trueValues || ["true", "on", "1"],
                falseValues: data.properties.falseValues || ["false", "off", "0"],
                setVariable: data.properties.setVariable || "",
                compareInputIndex: data.properties.compareInputIndex !== undefined ? data.properties.compareInputIndex : -1,
                compareOperator: data.properties.compareOperator || ">",
                compareThreshold: data.properties.compareThreshold !== undefined ? data.properties.compareThreshold : 80
            };
            this.updateInputs();
            const widgets = this.widgets || [];
            const modeWidget = widgets.find(w => w.name === "Mode");
            if (modeWidget) modeWidget.value = this.properties.mode;
            const debugWidget = widgets.find(w => w.name === "Debug");
            if (debugWidget) debugWidget.value = this.properties.debug;
            const maxInputsWidget = widgets.find(w => w.name === "Max Inputs");
            if (maxInputsWidget) maxInputsWidget.value = this.properties.maxInputs;
            const topicsWidget = widgets.find(w => w.name === "Topics");
            if (topicsWidget) topicsWidget.value = this.properties.expectedTopics.join(",");
            const compareInputWidget = widgets.find(w => w.name === "Compare Input");
            if (compareInputWidget) {
                compareInputWidget.options.values = this.getCompareInputOptions().map(opt => opt.label);
                compareInputWidget.value = this.getCompareInputLabel(this.properties.compareInputIndex);
            }
            const operatorWidget = widgets.find(w => w.name === "Operator");
            if (operatorWidget) operatorWidget.value = this.properties.compareOperator;
            const thresholdWidget = widgets.find(w => w.name === "Threshold");
            if (thresholdWidget) thresholdWidget.value = this.properties.compareThreshold;
            const persistWidget = widgets.find(w => w.name === "Persist State");
            if (persistWidget) persistWidget.value = this.properties.persistState;
            const trueValuesWidget = widgets.find(w => w.name === "True Values");
            if (trueValuesWidget) trueValuesWidget.value = this.properties.trueValues.join(",");
            const falseValuesWidget = widgets.find(w => w.name === "False Values");
            if (falseValuesWidget) falseValuesWidget.value = this.properties.falseValues.join(",");
            const setVariableWidget = widgets.find(w => w.name === "Set Variable");
            if (setVariableWidget) setVariableWidget.value = this.properties.setVariable;
            this.loadState();
        }
    }
}

LiteGraph.registerNodeType("Logic/LogicOperations", AND_OR_Node);
console.log("LogicNode - Registered successfully under 'Logic' category.");