// ============================================================================
// ComparisonNode.js - Comparison node using shared T2 infrastructure
// Refactored to use DRY principles with shared controls and components
// ============================================================================

(function() {
    // Debug: console.log("[ComparisonNode] Loading plugin...");

    // Dependency checks
    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets) {
        console.error("[ComparisonNode] Missing core dependencies");
        return;
    }

    if (!window.T2Controls) {
        console.error("[ComparisonNode] T2Controls not found - ensure 00_SharedControlsPlugin.js loads first");
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const RefComponent = window.RefComponent;
    const sockets = window.sockets;
    const { DropdownControl, InputControl, HelpIcon } = window.T2Controls;

    // -------------------------------------------------------------------------
    // TOOLTIPS
    // -------------------------------------------------------------------------
    const tooltips = {
        node: "Compares an input value against a reference value.\n\nOutputs TRUE or FALSE based on the selected operator.\n\nSupports both numeric and string comparison.",
        inputs: {
            in: "The value to compare. Can be number, string, or boolean."
        },
        outputs: {
            result: "TRUE if comparison passes, FALSE otherwise."
        },
        controls: {
            operator: "= Equal\n< Less than\n> Greater than\n<= Less or equal\n>= Greater or equal\n!= Not equal",
            value: "The reference value to compare against.\n\nNumbers are compared numerically.\nStrings are compared alphabetically."
        }
    };

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

            // Sockets
            this.addInput("in", new ClassicPreset.Input(
                sockets.any || new ClassicPreset.Socket('any'), 
                "Input"
            ));
            this.addOutput("result", new ClassicPreset.Output(
                sockets.boolean || new ClassicPreset.Socket('boolean'), 
                "Result"
            ));

            // Controls using shared T2Controls
            this.addControl("operator", new DropdownControl(
                "Operator", 
                ["=", "<", ">", "<=", ">=", "!="], 
                "=", 
                (val) => { 
                    this.properties.operator = val; 
                    if (this.changeCallback) this.changeCallback();
                }
            ));

            this.addControl("value", new InputControl(
                "Compare Value", 
                "", 
                (val) => { 
                    this.properties.compareValue = val; 
                    if (this.changeCallback) this.changeCallback();
                }
            ));
        }

        data(inputs) {
            const inputVal = inputs.in?.[0];
            const compareVal = this.properties.compareValue;
            const operator = this.properties.operator;

            if (inputVal === undefined) return { result: false };

            let result = false;

            // Try numeric comparison first
            const numInput = parseFloat(inputVal);
            const numCompare = parseFloat(compareVal);

            if (!isNaN(numInput) && !isNaN(numCompare)) {
                switch (operator) {
                    case "=":  result = numInput === numCompare; break;
                    case "!=": result = numInput !== numCompare; break;
                    case ">":  result = numInput > numCompare; break;
                    case "<":  result = numInput < numCompare; break;
                    case ">=": result = numInput >= numCompare; break;
                    case "<=": result = numInput <= numCompare; break;
                }
            } else {
                // String comparison fallback
                const strInput = String(inputVal);
                const strCompare = String(compareVal);
                
                switch (operator) {
                    case "=":  result = strInput === strCompare; break;
                    case "!=": result = strInput !== strCompare; break;
                    case ">":  result = strInput > strCompare; break;
                    case "<":  result = strInput < strCompare; break;
                    case ">=": result = strInput >= strCompare; break;
                    case "<=": result = strInput <= strCompare; break;
                }
            }

            return { result };
        }

        restore(state) {
            if (state.properties) {
                Object.assign(this.properties, state.properties);
            }
            if (this.controls.operator) this.controls.operator.value = this.properties.operator;
            if (this.controls.value) this.controls.value.value = this.properties.compareValue;
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

        return React.createElement('div', { 
            className: 'logic-node',
            style: {
                padding: '0',
                minWidth: '180px'
            }
        }, [
            // Header with tooltip
            React.createElement('div', { 
                key: 'header',
                className: 'header',
                style: {
                    padding: '8px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }
            }, [
                React.createElement('span', {
                    key: 'title'
                }, '⚖️ ' + data.label),
                HelpIcon && React.createElement(HelpIcon, { key: 'help', text: tooltips.node, size: 14 })
            ]),
            
            // Inputs
            React.createElement('div', { key: 'inputs', className: 'io-container' }, 
                inputs.map(([key, input]) => React.createElement('div', { 
                    key, 
                    style: { display: 'flex', alignItems: 'center', marginBottom: '4px' } 
                }, [
                    React.createElement(RefComponent, {
                        key: 'socket',
                        init: ref => emit({ type: "render", data: { type: "socket", element: ref, payload: input.socket, nodeId: data.id, side: "input", key } }),
                        unmount: ref => emit({ type: "unmount", data: { element: ref } })
                    }),
                    React.createElement('span', { key: 'label', className: 'socket-label' }, input.label),
                    HelpIcon && tooltips.inputs[key] && React.createElement(HelpIcon, { key: 'help', text: tooltips.inputs[key], size: 10 })
                ]))
            ),
            
            // Controls
            React.createElement('div', { key: 'controls', className: 'controls' }, 
                controls.map(([key, control]) => React.createElement('div', { key, style: { marginBottom: '6px' } }, [
                    React.createElement('div', { 
                        key: 'label-row',
                        style: { display: 'flex', alignItems: 'center', marginBottom: '2px' } 
                    }, [
                        React.createElement('label', { key: 'lbl' }, control.label || key),
                        HelpIcon && tooltips.controls[key] && React.createElement(HelpIcon, { key: 'help', text: tooltips.controls[key], size: 10 })
                    ]),
                    React.createElement(RefComponent, {
                        key: 'ctrl',
                        init: ref => emit({ type: "render", data: { type: "control", element: ref, payload: control } }),
                        unmount: ref => emit({ type: "unmount", data: { element: ref } })
                    })
                ]))
            ),
            
            // Outputs
            React.createElement('div', { key: 'outputs', className: 'io-container' }, 
                outputs.map(([key, output]) => React.createElement('div', { 
                    key, 
                    className: 'socket-row',
                    style: { justifyContent: 'flex-end' } 
                }, [
                    HelpIcon && tooltips.outputs[key] && React.createElement(HelpIcon, { key: 'help', text: tooltips.outputs[key], size: 10 }),
                    React.createElement('span', { key: 'label', className: 'socket-label' }, output.label),
                    React.createElement(RefComponent, {
                        key: 'socket',
                        init: ref => emit({ type: "render", data: { type: "socket", element: ref, payload: output.socket, nodeId: data.id, side: "output", key } }),
                        unmount: ref => emit({ type: "unmount", data: { element: ref } })
                    })
                ]))
            )
        ]);
    }

    // -------------------------------------------------------------------------
    // REGISTRATION
    // -------------------------------------------------------------------------
    window.nodeRegistry.register('ComparisonNode', {
        label: "Comparison",
        category: "Logic",
        nodeClass: ComparisonNode,
        factory: (cb) => new ComparisonNode(cb),
        component: ComparisonNodeComponent
    });

    // console.log("[ComparisonNode] Registered (DRY refactored)");
})();
