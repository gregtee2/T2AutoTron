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
    const sockets = window.sockets;
    const { DropdownControl, InputControl } = window.T2Controls;
    const { createSimpleNodeComponent } = window.T2Components || {};

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
                (val) => { this.properties.operator = val; }
            ));

            this.addControl("value", new InputControl(
                "Compare Value", 
                "", 
                (val) => { this.properties.compareValue = val; }
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
    // COMPONENT - Use shared factory or create simple one
    // -------------------------------------------------------------------------
    const ComparisonNodeComponent = createSimpleNodeComponent 
        ? createSimpleNodeComponent({ className: 'logic-node' })
        : function({ data, emit }) {
            // Fallback if T2Components not available
            const React = window.React;
            const RefComponent = window.RefComponent;
            const inputs = Object.entries(data.inputs);
            const outputs = Object.entries(data.outputs);
            const controls = Object.entries(data.controls);

            return React.createElement('div', { className: 'logic-node' }, [
                React.createElement('div', { key: 'header', className: 'header' }, data.label),
                React.createElement('div', { key: 'inputs', className: 'io-container' }, 
                    inputs.map(([key, input]) => React.createElement('div', { key, className: 'socket-row' }, [
                        React.createElement(RefComponent, {
                            key: 'socket',
                            init: ref => emit({ type: "render", data: { type: "socket", element: ref, payload: input.socket, nodeId: data.id, side: "input", key } }),
                            unmount: ref => emit({ type: "unmount", data: { element: ref } })
                        }),
                        React.createElement('span', { key: 'label', style: { marginLeft: '10px', fontSize: '12px' } }, input.label)
                    ]))
                ),
                React.createElement('div', { key: 'controls', className: 'controls' }, 
                    controls.map(([key, control]) => React.createElement(RefComponent, {
                        key,
                        init: ref => emit({ type: "render", data: { type: "control", element: ref, payload: control } }),
                        unmount: ref => emit({ type: "unmount", data: { element: ref } })
                    }))
                ),
                React.createElement('div', { key: 'outputs', className: 'io-container' }, 
                    outputs.map(([key, output]) => React.createElement('div', { key, className: 'socket-row', style: { justifyContent: 'flex-end' } }, [
                        React.createElement('span', { key: 'label', style: { marginRight: '10px', fontSize: '12px' } }, output.label),
                        React.createElement(RefComponent, {
                            key: 'socket',
                            init: ref => emit({ type: "render", data: { type: "socket", element: ref, payload: output.socket, nodeId: data.id, side: "output", key } }),
                            unmount: ref => emit({ type: "unmount", data: { element: ref } })
                        })
                    ]))
                )
            ]);
        };

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
