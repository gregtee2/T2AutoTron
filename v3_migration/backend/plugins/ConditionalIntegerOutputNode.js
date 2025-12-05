(function() {
    console.log("[ConditionalIntegerOutputNode] Loading plugin...");

    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets) {
        console.error("[ConditionalIntegerOutputNode] Missing dependencies");
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect } = React;
    const RefComponent = window.RefComponent;
    const sockets = window.sockets;

    // -------------------------------------------------------------------------
    // CSS is now loaded from node-styles.css via index.css
    // -------------------------------------------------------------------------

    // -------------------------------------------------------------------------
    // NODE CLASS
    // -------------------------------------------------------------------------
    class ConditionalIntegerOutputNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("Conditional Integer Output");
            this.width = 220;
            this.changeCallback = changeCallback;

            this.properties = {
                debug: false
            };

            this.inputActive = { A: false, B: false };
            this.lastOutput = null;

            this.addInput("a", new ClassicPreset.Input(sockets.boolean, "A (Bool)"));
            this.addInput("b", new ClassicPreset.Input(sockets.number, "B (Int)"));
            this.addOutput("out", new ClassicPreset.Output(sockets.any, "Out"));
        }

        restore(state) {
            if (state.properties) {
                Object.assign(this.properties, state.properties);
            }
        }

        serialize() {
            return {
                debug: this.properties.debug
            };
        }

        toJSON() {
            return {
                id: this.id,
                label: this.label,
                properties: this.serialize()
            };
        }

        data(inputs) {
            const A = inputs.a?.[0];
            const B = inputs.b?.[0];

            let output;

            if (A === true) {
                const intValue = typeof B === "number" ? Math.floor(B) : parseInt(B, 10) || 0;
                output = intValue;
                this.inputActive = { A: true, B: true };
            } else {
                output = false;
                this.inputActive = { A: false, B: false };
            }

            if (this.lastOutput !== output) {
                this.lastOutput = output;
                if (this.changeCallback) this.changeCallback();
            }

            if (this.properties.debug) {
                console.log(`[ConditionalIntegerOutputNode] A=${A}, B=${B}, Output=${output}`);
            }

            return { out: output };
        }
    }

    // -------------------------------------------------------------------------
    // COMPONENT
    // -------------------------------------------------------------------------
    function ConditionalIntegerOutputNodeComponent({ data, emit }) {
        const [, forceUpdate] = useState(0);

        useEffect(() => {
            data.changeCallback = () => forceUpdate(n => n + 1);
            return () => { data.changeCallback = null; };
        }, [data]);

        const inputs = Object.entries(data.inputs);
        const outputs = Object.entries(data.outputs);
        const { inputActive, lastOutput } = data;

        const borderClass = lastOutput === false ? "output-false" : typeof lastOutput === "number" ? "output-number" : "";

        return React.createElement('div', { className: `conditional-integer-output-node ${borderClass}` }, [
            React.createElement('div', { key: 'header', className: 'header' }, 'Conditional Integer Output'),
            React.createElement('div', { 
                key: 'content', 
                className: 'content',
                onPointerDown: (e) => e.stopPropagation()
            }, [
                // Inputs
                React.createElement('div', { key: 'inputs', className: 'io-section' },
                    inputs.map(([key, input]) => {
                        const isActive = key === "a" ? inputActive.A : key === "b" ? inputActive.B : false;
                        return React.createElement('div', { 
                            key, 
                            className: `io-row input-row ${isActive ? "active" : ""}`
                        }, [
                            React.createElement(RefComponent, {
                                key: 'socket',
                                init: ref => emit({
                                    type: "render",
                                    data: {
                                        type: "socket",
                                        element: ref,
                                        payload: input.socket,
                                        nodeId: data.id,
                                        side: "input",
                                        key
                                    }
                                }),
                                unmount: ref => emit({ type: "unmount", data: { element: ref } })
                            }),
                            React.createElement('span', { 
                                key: 'label', 
                                className: `input-label ${isActive ? "active-label" : ""}`
                            }, input.label || key)
                        ]);
                    })
                ),
                
                // Output Display
                React.createElement('div', { key: 'display', className: 'output-display' }, 
                    `Output: ${lastOutput === false ? "false" : lastOutput}`
                ),
                
                // Outputs
                React.createElement('div', { key: 'outputs', className: 'io-section outputs' },
                    outputs.map(([key, output]) =>
                        React.createElement('div', { key, className: 'io-row output-row' }, [
                            React.createElement('span', { key: 'label', className: 'output-label' }, output.label || key),
                            React.createElement(RefComponent, {
                                key: 'socket',
                                init: ref => emit({
                                    type: "render",
                                    data: {
                                        type: "socket",
                                        element: ref,
                                        payload: output.socket,
                                        nodeId: data.id,
                                        side: "output",
                                        key
                                    }
                                }),
                                unmount: ref => emit({ type: "unmount", data: { element: ref } })
                            })
                        ])
                    )
                )
            ])
        ]);
    }

    // -------------------------------------------------------------------------
    // REGISTER
    // -------------------------------------------------------------------------
    window.nodeRegistry.register('ConditionalIntegerOutputNode', {
        label: "Conditional Integer Output",
        category: "Logic",
        nodeClass: ConditionalIntegerOutputNode,
        component: ConditionalIntegerOutputNodeComponent,
        factory: (cb) => new ConditionalIntegerOutputNode(cb)
    });

    console.log("[ConditionalIntegerOutputNode] Registered");
})();
