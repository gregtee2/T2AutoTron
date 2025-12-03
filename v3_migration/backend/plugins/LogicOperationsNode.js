(function() {
    console.log("[LogicOperationsNode] Loading plugin...");

    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets) {
        console.error("[LogicOperationsNode] Missing dependencies");
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect } = React;
    const RefComponent = window.RefComponent;
    const sockets = window.sockets;

    // -------------------------------------------------------------------------
    // CSS INJECTION
    // -------------------------------------------------------------------------
    const styleId = 'logic-operations-node-css';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.innerHTML = `
            .logic-node {
                background: rgba(30, 40, 50, 0.9);
                border: 1px solid #4fc3f7;
                border-radius: 8px;
                color: white;
                font-family: sans-serif;
                min-width: 240px;
                display: flex;
                flex-direction: column;
                box-shadow: 0 0 10px rgba(79, 195, 247, 0.2);
            }
            .logic-node .header {
                background: rgba(79, 195, 247, 0.2);
                padding: 8px 12px;
                border-bottom: 1px solid rgba(79, 195, 247, 0.3);
                font-weight: bold;
                color: #4fc3f7;
                text-align: center;
            }
            .logic-node .io-container {
                padding: 10px;
                display: flex;
                flex-direction: column;
                gap: 5px;
            }
            .logic-node .socket-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
            }
            .logic-node .controls {
                padding: 10px;
                border-top: 1px solid rgba(255, 255, 255, 0.1);
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            .logic-node button {
                background: rgba(79, 195, 247, 0.2);
                border: 1px solid #4fc3f7;
                color: #4fc3f7;
                padding: 4px 8px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
            }
            .logic-node button:hover {
                background: rgba(79, 195, 247, 0.4);
            }
            .logic-node select, .logic-node input {
                background: #222;
                color: white;
                border: 1px solid #555;
                padding: 4px;
                border-radius: 4px;
                width: 100%;
            }
        `;
        document.head.appendChild(style);
    }

    // -------------------------------------------------------------------------
    // CONTROLS
    // -------------------------------------------------------------------------
    class DropdownControl extends ClassicPreset.Control {
        constructor(label, values, initialValue, onChange) {
            super();
            this.label = label;
            this.values = values;
            this.value = initialValue;
            this.onChange = onChange;
        }

        setValue(val) {
            this.value = val;
        }
    }

    function DropdownControlComponent({ data }) {
        const [value, setValue] = useState(data.value);
        const [options, setOptions] = useState(data.values);

        useEffect(() => {
            setValue(data.value);
        }, [data.value]);

        useEffect(() => {
            setOptions(data.values);
        }, [data.values]);
        
        const handleChange = (e) => {
            const val = e.target.value;
            setValue(val);
            data.value = val;
            if (data.onChange) data.onChange(val);
        };

        return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } }, [
            React.createElement('label', { style: { fontSize: '10px', color: '#aaa' } }, data.label),
            React.createElement('select', {
                value: value,
                onChange: handleChange,
                onPointerDown: (e) => e.stopPropagation(),
                onDoubleClick: (e) => e.stopPropagation()
            }, options.map(v => React.createElement('option', { key: v, value: v }, v)))
        ]);
    }

    class InputControl extends ClassicPreset.Control {
        constructor(label, initialValue, onChange, type = "text") {
            super();
            this.label = label;
            this.value = initialValue;
            this.onChange = onChange;
            this.type = type;
        }
    }

    function InputControlComponent({ data }) {
        const [value, setValue] = useState(data.value);

        useEffect(() => {
            setValue(data.value);
        }, [data.value]);

        const handleChange = (e) => {
            const val = e.target.value;
            setValue(val);
            data.value = val;
            if (data.onChange) data.onChange(val);
        };

        return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } }, [
            React.createElement('label', { style: { fontSize: '10px', color: '#aaa' } }, data.label),
            React.createElement('input', {
                type: data.type,
                value: value,
                onChange: handleChange,
                onPointerDown: (e) => e.stopPropagation(),
                onDoubleClick: (e) => e.stopPropagation()
            })
        ]);
    }

    class ButtonControl extends ClassicPreset.Control {
        constructor(label, onClick) {
            super();
            this.label = label;
            this.onClick = onClick;
        }
    }

    function ButtonControlComponent({ data }) {
        return React.createElement('button', {
            onClick: data.onClick,
            onPointerDown: (e) => e.stopPropagation(),
            onDoubleClick: (e) => e.stopPropagation()
        }, data.label);
    }

    // -------------------------------------------------------------------------
    // NODE CLASS
    // -------------------------------------------------------------------------
    class LogicOperationsNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("Logic Operations");
            this.changeCallback = changeCallback;
            this.width = 240;

            this.properties = {
                mode: "AND",
                inputCount: 2,
                compareInputIndex: -1, // -1 = Disabled
                compareOperator: ">",
                compareThreshold: 80,
                setVariable: "",
                _lastResult: false
            };

            // Internal state for edge detection
            this.previousA = null;

            // Outputs
            this.addOutput("result", new ClassicPreset.Output(sockets.boolean || new ClassicPreset.Socket('boolean'), "Result"));
            this.addOutput("inverse", new ClassicPreset.Output(sockets.boolean || new ClassicPreset.Socket('boolean'), "Inverse"));
            this.addOutput("value", new ClassicPreset.Output(sockets.number || new ClassicPreset.Socket('number'), "Value"));
            this.addOutput("variable", new ClassicPreset.Output(sockets.any || new ClassicPreset.Socket('any'), "Variable"));

            // Controls
            this.addControl("mode", new DropdownControl("Mode", [
                "AND", "OR", "NAND", "NOR", "XOR", "XNOR", 
                "IMPLIES", "BICOND", "RisingEdge", "FallingEdge"
            ], "AND", (val) => {
                this.properties.mode = val;
                this.triggerUpdate();
            }));

            this.addControl("add_input", new ButtonControl("+ Add Input", () => this.addInputSlot()));
            this.addControl("remove_input", new ButtonControl("- Remove Input", () => this.removeInputSlot()));

            // Comparison Controls
            this.addControl("compare_input", new DropdownControl("Compare Input", this.getCompareOptions(), "Disabled", (val) => {
                this.properties.compareInputIndex = val === "Disabled" ? -1 : parseInt(val.replace("Input ", "")) - 1;
                this.triggerUpdate();
            }));

            this.addControl("operator", new DropdownControl("Operator", [">", "<", "=", ">=", "<=", "!="], ">", (val) => {
                this.properties.compareOperator = val;
                this.triggerUpdate();
            }));

            this.addControl("threshold", new InputControl("Threshold", 80, (val) => {
                this.properties.compareThreshold = val;
                this.triggerUpdate();
            }, "number"));

            this.addControl("set_variable", new InputControl("Set Variable (Name)", "", (val) => {
                this.properties.setVariable = val;
            }));

            this.updateInputs(true);
        }

        getCompareOptions() {
            const options = ["Disabled"];
            for (let i = 0; i < this.properties.inputCount; i++) {
                options.push(`Input ${i + 1}`);
            }
            return options;
        }

        triggerUpdate() {
            if (this.changeCallback) this.changeCallback();
        }

        updateInputs(suppressUpdate = false) {
            const currentInputs = Object.keys(this.inputs);
            const desiredCount = this.properties.inputCount;

            // Remove excess inputs
            for (let i = desiredCount; i < currentInputs.length; i++) {
                this.removeInput(`in${i}`);
            }

            // Add missing inputs
            for (let i = 0; i < desiredCount; i++) {
                const key = `in${i}`;
                if (!this.inputs[key]) {
                    this.addInput(key, new ClassicPreset.Input(sockets.any || new ClassicPreset.Socket('any'), `Input ${i + 1}`));
                }
            }

            // Update compare options
            if (this.controls.compare_input) {
                this.controls.compare_input.values = this.getCompareOptions();
                // Reset if out of bounds
                if (this.properties.compareInputIndex >= desiredCount) {
                    this.properties.compareInputIndex = -1;
                    this.controls.compare_input.value = "Disabled";
                }
            }
            
            if (!suppressUpdate) this.triggerUpdate();
        }

        addInputSlot() {
            if (this.properties.inputCount < 8) {
                this.properties.inputCount++;
                this.updateInputs();
            }
        }

        removeInputSlot() {
            if (this.properties.inputCount > 2) {
                this.properties.inputCount--;
                this.updateInputs();
            }
        }

        translateInput(value) {
            if (value === undefined || value === null) return false;
            if (typeof value === "boolean") return value;
            if (typeof value === "number") return value !== 0;
            if (typeof value === "string") {
                const lower = value.toLowerCase();
                if (lower === "true" || lower === "on" || lower === "1") return true;
                return false;
            }
            return !!value;
        }

        data(inputs) {
            const rawValues = [];
            const booleanValues = [];
            let numericValue = null;

            // 1. Gather Inputs
            for (let i = 0; i < this.properties.inputCount; i++) {
                const val = inputs[`in${i}`]?.[0];
                rawValues.push(val);
                
                // Find first numeric value for pass-through
                if (numericValue === null && typeof val === 'number') {
                    numericValue = val;
                }
            }

            // 2. Handle Comparison Logic
            const compareIndex = this.properties.compareInputIndex;
            let comparisonResult = true;

            if (compareIndex >= 0 && compareIndex < rawValues.length) {
                const val = rawValues[compareIndex];
                const threshold = parseFloat(this.properties.compareThreshold);
                const operator = this.properties.compareOperator;
                const numVal = parseFloat(val);

                if (!isNaN(numVal) && !isNaN(threshold)) {
                    switch (operator) {
                        case ">": comparisonResult = numVal > threshold; break;
                        case "<": comparisonResult = numVal < threshold; break;
                        case "=": comparisonResult = numVal === threshold; break;
                        case ">=": comparisonResult = numVal >= threshold; break;
                        case "<=": comparisonResult = numVal <= threshold; break;
                        case "!=": comparisonResult = numVal !== threshold; break;
                    }
                } else {
                    comparisonResult = false; // Fail if not numeric
                }
            }

            // 3. Convert to Booleans
            for (let i = 0; i < rawValues.length; i++) {
                if (i === compareIndex) {
                    booleanValues.push(comparisonResult);
                } else {
                    booleanValues.push(this.translateInput(rawValues[i]));
                }
            }

            // 4. Execute Logic Mode
            let result = false;
            const mode = this.properties.mode;
            const A = booleanValues[0];
            const B = booleanValues[1]; // Only relevant for some modes

            switch (mode) {
                case "AND": result = booleanValues.every(v => v); break;
                case "OR": result = booleanValues.some(v => v); break;
                case "NAND": result = !booleanValues.every(v => v); break;
                case "NOR": result = !booleanValues.some(v => v); break;
                case "XOR": result = booleanValues.filter(v => v).length % 2 === 1; break;
                case "XNOR": result = booleanValues.filter(v => v).length % 2 === 0; break;
                case "IMPLIES": result = !A || B; break;
                case "BICOND": result = A === B; break;
                case "RisingEdge":
                    if (this.previousA !== null) {
                        result = !this.previousA && A;
                    }
                    this.previousA = A;
                    break;
                case "FallingEdge":
                    if (this.previousA !== null) {
                        result = this.previousA && !A;
                    }
                    this.previousA = A;
                    break;
            }

            // Update UI state
            this.properties._lastResult = result;
            if (this.onResultChange) this.onResultChange(result);

            // 5. Handle Variable Setting
            if (this.properties.setVariable && result) {
                // In Rete, we don't have a global variable store built-in like LiteGraph might have had.
                // We can attach it to the window object for now as a simple global store.
                if (!window.autotronVariables) window.autotronVariables = {};
                window.autotronVariables[this.properties.setVariable] = result;
            }

            const variableValue = this.properties.setVariable && window.autotronVariables 
                ? window.autotronVariables[this.properties.setVariable] 
                : null;

            return {
                result: result,
                inverse: !result,
                value: numericValue,
                variable: variableValue
            };
        }

        restore(state) {
            if (state.properties) {
                this.properties = { ...this.properties, ...state.properties };
            }
            
            // Restore controls
            if (this.controls.mode) this.controls.mode.value = this.properties.mode;
            if (this.controls.compare_input) this.controls.compare_input.value = this.properties.compareInputIndex === -1 ? "Disabled" : `Input ${this.properties.compareInputIndex + 1}`;
            if (this.controls.operator) this.controls.operator.value = this.properties.compareOperator;
            if (this.controls.threshold) this.controls.threshold.value = this.properties.compareThreshold;
            if (this.controls.set_variable) this.controls.set_variable.value = this.properties.setVariable;
            
            this.updateInputs(true);
        }
    }

    // -------------------------------------------------------------------------
    // COMPONENT
    // -------------------------------------------------------------------------
    function LogicOperationsNodeComponent({ data, emit }) {
        const inputs = Object.entries(data.inputs);
        const outputs = Object.entries(data.outputs);
        const controls = Object.entries(data.controls);
        
        const [isActive, setIsActive] = useState(data.properties._lastResult || false);

        useEffect(() => {
            data.onResultChange = (val) => setIsActive(val);
            // Check initial state again in case it changed before mount
            if (data.properties._lastResult !== undefined) setIsActive(data.properties._lastResult);
            return () => { data.onResultChange = null; };
        }, [data]);

        const activeStyle = isActive ? {
            border: '1px solid #00FF00',
            boxShadow: '0 0 15px rgba(0, 255, 0, 0.5)'
        } : {};

        return React.createElement('div', { className: 'logic-node', style: activeStyle }, [
            React.createElement('div', { key: 'header', className: 'header' }, data.label),
            
            // Inputs
            React.createElement('div', { key: 'inputs', className: 'io-container' }, 
                inputs.map(([key, input]) => React.createElement('div', { key: key, className: 'socket-row' }, [
                    React.createElement(RefComponent, {
                        key: 'socket',
                        init: ref => emit({ type: "render", data: { type: "socket", element: ref, payload: input.socket, nodeId: data.id, side: "input", key } }),
                        unmount: ref => emit({ type: "unmount", data: { element: ref } })
                    }),
                    React.createElement('span', { key: 'label', style: { marginLeft: '10px', fontSize: '12px' } }, input.label)
                ]))
            ),

            // Controls
            React.createElement('div', { key: 'controls', className: 'controls' }, 
                controls.map(([key, control]) => React.createElement(RefComponent, {
                    key: key,
                    init: ref => emit({ type: "render", data: { type: "control", element: ref, payload: control } }),
                    unmount: ref => emit({ type: "unmount", data: { element: ref } })
                }))
            ),

            // Outputs
            React.createElement('div', { key: 'outputs', className: 'io-container' }, 
                outputs.map(([key, output]) => React.createElement('div', { key: key, className: 'socket-row', style: { justifyContent: 'flex-end' } }, [
                    React.createElement('span', { key: 'label', style: { marginRight: '10px', fontSize: '12px' } }, output.label),
                    React.createElement(RefComponent, {
                        key: 'socket',
                        init: ref => emit({ type: "render", data: { type: "socket", element: ref, payload: output.socket, nodeId: data.id, side: "output", key } }),
                        unmount: ref => emit({ type: "unmount", data: { element: ref } })
                    })
                ]))
            )
        ]);
    }

    window.nodeRegistry.register('LogicOperationsNode', {
        label: "Logic Operations",
        category: "Logic",
        nodeClass: LogicOperationsNode,
        factory: (cb) => new LogicOperationsNode(cb),
        component: LogicOperationsNodeComponent
    });

    console.log("[LogicOperationsNode] Registered");
})();
