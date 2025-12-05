(function() {
    console.log("[ComparisonNode] Loading plugin...");

    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets) {
        console.error("[ComparisonNode] Missing dependencies");
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect } = React;
    const RefComponent = window.RefComponent;
    const sockets = window.sockets;

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
    }

    function DropdownControlComponent({ data }) {
        const [value, setValue] = useState(data.value);
        
        const handleChange = (e) => {
            const val = e.target.value;
            setValue(val);
            data.value = val;
            if (data.onChange) data.onChange(val);
        };

        return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px' } }, [
            React.createElement('label', { style: { fontSize: '10px', color: '#aaa' } }, data.label),
            React.createElement('select', {
                value: value,
                onChange: handleChange,
                onPointerDown: (e) => e.stopPropagation(),
                onDoubleClick: (e) => e.stopPropagation()
            }, data.values.map(v => React.createElement('option', { key: v, value: v }, v)))
        ]);
    }

    class InputControl extends ClassicPreset.Control {
        constructor(label, initialValue, onChange) {
            super();
            this.label = label;
            this.value = initialValue;
            this.onChange = onChange;
        }
    }

    function InputControlComponent({ data }) {
        const [value, setValue] = useState(data.value);

        const handleChange = (e) => {
            const val = e.target.value;
            setValue(val);
            data.value = val;
            if (data.onChange) data.onChange(val);
        };

        return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px' } }, [
            React.createElement('label', { style: { fontSize: '10px', color: '#aaa' } }, data.label),
            React.createElement('input', {
                type: 'text',
                value: value,
                onChange: handleChange,
                onPointerDown: (e) => e.stopPropagation(),
                onDoubleClick: (e) => e.stopPropagation(),
                style: {
                    background: '#222',
                    color: 'white',
                    border: '1px solid #555',
                    padding: '4px',
                    borderRadius: '4px',
                    width: '100%'
                }
            })
        ]);
    }

    // -------------------------------------------------------------------------
    // NODE CLASS
    // -------------------------------------------------------------------------
    class ComparisonNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("Comparison");
            this.changeCallback = changeCallback;
            this.width = 200;

            this.properties = {
                operator: "=",
                compareValue: ""
            };

            this.addInput("in", new ClassicPreset.Input(sockets.any || new ClassicPreset.Socket('any'), "Input"));
            this.addOutput("result", new ClassicPreset.Output(sockets.boolean || new ClassicPreset.Socket('boolean'), "Result"));

            this.addControl("operator", new DropdownControl("Operator", ["=", "<", ">", "<=", ">=", "!="], "=", (val) => {
                this.properties.operator = val;
            }));

            this.addControl("value", new InputControl("Compare Value", "", (val) => {
                this.properties.compareValue = val;
            }));
        }

        data(inputs) {
            const inputVal = inputs.in?.[0];
            const compareVal = this.properties.compareValue;
            const operator = this.properties.operator;

            let result = false;

            if (inputVal === undefined) return { result: false };

            // Try numeric comparison first
            const numInput = parseFloat(inputVal);
            const numCompare = parseFloat(compareVal);

            if (!isNaN(numInput) && !isNaN(numCompare)) {
                if (operator === "=") result = numInput === numCompare;
                else if (operator === "!=") result = numInput !== numCompare;
                else if (operator === ">") result = numInput > numCompare;
                else if (operator === "<") result = numInput < numCompare;
                else if (operator === ">=") result = numInput >= numCompare;
                else if (operator === "<=") result = numInput <= numCompare;
            } else {
                // String comparison
                const strInput = String(inputVal);
                const strCompare = String(compareVal);
                
                if (operator === "=") result = strInput === strCompare;
                else if (operator === "!=") result = strInput !== strCompare;
                // Other operators might not make sense for strings but JS allows it
                else if (operator === ">") result = strInput > strCompare;
                else if (operator === "<") result = strInput < strCompare;
                else if (operator === ">=") result = strInput >= strCompare;
                else if (operator === "<=") result = strInput <= strCompare;
            }

            return {
                result: result
            };
        }

        restore(state) {
            if (state.properties) {
                this.properties = { ...this.properties, ...state.properties };
            }
            this.controls.operator.value = this.properties.operator;
            this.controls.value.value = this.properties.compareValue;
        }

        serialize() {
            return {
                operator: this.properties.operator,
                compareValue: this.properties.compareValue
            };
        }

        toJSON() {
            return {
                id: this.id,
                label: this.label,
                properties: this.serialize()
            };
        }
    }

    // -------------------------------------------------------------------------
    // COMPONENT
    // -------------------------------------------------------------------------
    function ComparisonNodeComponent({ data, emit }) {
        const inputs = Object.entries(data.inputs);
        const outputs = Object.entries(data.outputs);
        const controls = Object.entries(data.controls);

        return React.createElement('div', { className: 'logic-node' }, [
            React.createElement('div', { className: 'header' }, data.label),
            
            React.createElement('div', { className: 'io-container' }, 
                inputs.map(([key, input]) => React.createElement('div', { key: key, className: 'socket-row' }, [
                    React.createElement(RefComponent, {
                        init: ref => emit({ type: "render", data: { type: "socket", element: ref, payload: input.socket, nodeId: data.id, side: "input", key } }),
                        unmount: ref => emit({ type: "unmount", data: { element: ref } })
                    }),
                    React.createElement('span', { style: { marginLeft: '10px', fontSize: '12px' } }, input.label)
                ]))
            ),

            React.createElement('div', { className: 'controls' }, 
                controls.map(([key, control]) => React.createElement(RefComponent, {
                    key: key,
                    init: ref => emit({ type: "render", data: { type: "control", element: ref, payload: control } }),
                    unmount: ref => emit({ type: "unmount", data: { element: ref } })
                }))
            ),

            React.createElement('div', { className: 'io-container' }, 
                outputs.map(([key, output]) => React.createElement('div', { key: key, className: 'socket-row', style: { justifyContent: 'flex-end' } }, [
                    React.createElement('span', { style: { marginRight: '10px', fontSize: '12px' } }, output.label),
                    React.createElement(RefComponent, {
                        init: ref => emit({ type: "render", data: { type: "socket", element: ref, payload: output.socket, nodeId: data.id, side: "output", key } }),
                        unmount: ref => emit({ type: "unmount", data: { element: ref } })
                    })
                ]))
            )
        ]);
    }

    window.nodeRegistry.register('ComparisonNode', {
        label: "Comparison",
        category: "Logic",
        nodeClass: ComparisonNode,
        factory: (cb) => new ComparisonNode(cb),
        component: ComparisonNodeComponent
    });

    console.log("[ComparisonNode] Registered");
})();
