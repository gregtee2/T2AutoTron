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
    // CSS INJECTION
    // -------------------------------------------------------------------------
    const styleId = 'conditional-integer-output-node-css';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.innerHTML = `
            .conditional-integer-output-node {
                background: linear-gradient(180deg, #1e3a5f 0%, #0d1f33 100%);
                border: 2px solid #4a90d9;
                border-radius: 8px;
                box-shadow: 0 0 12px rgba(74, 144, 217, 0.25);
                color: #e0e8f0;
                min-width: 200px;
                font-family: 'Segoe UI', sans-serif;
                overflow: hidden;
                transition: border-color 0.3s;
            }
            .conditional-integer-output-node.output-false {
                border-color: #ff4444;
                box-shadow: 0 0 12px rgba(255, 68, 68, 0.3);
            }
            .conditional-integer-output-node.output-number {
                border-color: #00ff64;
                box-shadow: 0 0 12px rgba(0, 255, 100, 0.3);
            }
            .conditional-integer-output-node .header {
                background: linear-gradient(90deg, rgba(74, 144, 217, 0.3) 0%, rgba(74, 144, 217, 0) 100%);
                padding: 8px 12px;
                font-size: 13px;
                font-weight: 600;
                color: #7db8f0;
                border-bottom: 1px solid rgba(74, 144, 217, 0.3);
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            .conditional-integer-output-node .content {
                padding: 10px;
            }
            .conditional-integer-output-node .io-section {
                margin-bottom: 8px;
            }
            .conditional-integer-output-node .io-section.outputs {
                margin-top: 8px;
                border-top: 1px solid rgba(74, 144, 217, 0.2);
                padding-top: 8px;
            }
            .conditional-integer-output-node .io-row {
                display: flex;
                align-items: center;
                margin-bottom: 6px;
                gap: 8px;
                padding: 2px 4px;
                border-radius: 4px;
                transition: background-color 0.2s;
            }
            .conditional-integer-output-node .input-row {
                justify-content: flex-start;
            }
            .conditional-integer-output-node .input-row.active {
                background: rgba(0, 255, 100, 0.1);
                border: 1px solid rgba(0, 255, 100, 0.4);
            }
            .conditional-integer-output-node .output-row {
                justify-content: flex-end;
            }
            .conditional-integer-output-node .input-label,
            .conditional-integer-output-node .output-label {
                font-size: 12px;
                color: #a0b8d0;
            }
            .conditional-integer-output-node .active-label {
                color: #00ff64 !important;
                font-weight: 600;
            }
            .conditional-integer-output-node .output-display {
                background: rgba(0, 0, 0, 0.3);
                border: 1px solid rgba(74, 144, 217, 0.2);
                border-radius: 4px;
                padding: 6px 10px;
                font-size: 12px;
                color: #7db8f0;
                text-align: center;
                margin: 8px 0;
            }
        `;
        document.head.appendChild(style);
    }

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
