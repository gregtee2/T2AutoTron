(function() {
    console.log("[ConditionalSwitchNode] Loading plugin...");

    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets) {
        console.error("[ConditionalSwitchNode] Missing dependencies");
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
    class ConditionalSwitchNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("Conditional Switch");
            this.width = 200;
            this.changeCallback = changeCallback;

            this.properties = {
                numberOfInputs: 4,
                clampSelect: true,
                debug: false
            };

            this.maxInputs = 10;
            this.activeIndex = -1;

            this.addInput("select", new ClassicPreset.Input(sockets.number, "Select"));
            this._rebuildDataInputs();
            this.addOutput("out", new ClassicPreset.Output(sockets.any, "Out"));
        }

        _rebuildDataInputs() {
            for (let i = 0; i < this.maxInputs; i++) {
                const key = `data_${i}`;
                if (this.inputs[key]) {
                    this.removeInput(key);
                }
            }
            for (let i = 0; i < this.properties.numberOfInputs; i++) {
                const key = `data_${i}`;
                this.addInput(key, new ClassicPreset.Input(sockets.any, `Data ${i}`));
            }
        }

        setNumberOfInputs(count) {
            const clamped = Math.max(1, Math.min(this.maxInputs, count));
            if (clamped !== this.properties.numberOfInputs) {
                this.properties.numberOfInputs = clamped;
                this._rebuildDataInputs();
                if (this.changeCallback) this.changeCallback();
            }
        }

        restore(state) {
            if (state.properties) {
                Object.assign(this.properties, state.properties);
                this._rebuildDataInputs();
            }
        }

        serialize() {
            return {
                numberOfInputs: this.properties.numberOfInputs,
                clampSelect: this.properties.clampSelect,
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
            let selectVal = inputs.select?.[0];
            if (typeof selectVal !== "number") {
                selectVal = 0;
            }

            if (this.properties.clampSelect) {
                if (selectVal < 0) selectVal = 0;
                if (selectVal >= this.properties.numberOfInputs) {
                    selectVal = this.properties.numberOfInputs - 1;
                }
            }

            const chosenIndex = Math.floor(selectVal);
            let outData = null;

            if (chosenIndex >= 0 && chosenIndex < this.properties.numberOfInputs) {
                const key = `data_${chosenIndex}`;
                outData = inputs[key]?.[0] ?? null;
            }

            const newActiveIndex = (outData !== null || chosenIndex >= 0) ? chosenIndex : -1;
            if (newActiveIndex !== this.activeIndex) {
                this.activeIndex = newActiveIndex;
                if (this.changeCallback) this.changeCallback();
            }

            if (this.properties.debug) {
                console.log(`[ConditionalSwitchNode] select=${selectVal}, chosenIndex=${chosenIndex}, outData=`, outData);
            }

            return { out: outData };
        }
    }

    // -------------------------------------------------------------------------
    // COMPONENT
    // -------------------------------------------------------------------------
    function ConditionalSwitchNodeComponent({ data, emit }) {
        const [, forceUpdate] = useState(0);
        const [numberOfInputs, setNumberOfInputs] = useState(data.properties.numberOfInputs);

        useEffect(() => {
            data.changeCallback = () => forceUpdate(n => n + 1);
            return () => { data.changeCallback = null; };
        }, [data]);

        useEffect(() => {
            setNumberOfInputs(data.properties.numberOfInputs);
        }, [data.properties.numberOfInputs]);

        const handleInputCountChange = (e) => {
            const val = parseInt(e.target.value, 10);
            if (!isNaN(val)) {
                setNumberOfInputs(val);
                data.setNumberOfInputs(val);
            }
        };

        const inputs = Object.entries(data.inputs);
        const outputs = Object.entries(data.outputs);
        const activeIndex = data.activeIndex;

        return React.createElement('div', { className: 'conditional-switch-node' }, [
            React.createElement('div', { key: 'header', className: 'header' }, 'Conditional Switch'),
            React.createElement('div', { 
                key: 'content', 
                className: 'content',
                onPointerDown: (e) => e.stopPropagation()
            }, [
                // Settings
                React.createElement('div', { key: 'inputCount', className: 'settings-row' }, [
                    React.createElement('label', { key: 'label' }, 'Inputs:'),
                    React.createElement('input', {
                        key: 'input',
                        type: 'number',
                        min: 1,
                        max: 10,
                        value: numberOfInputs,
                        onChange: handleInputCountChange,
                        className: 'input-count'
                    })
                ]),
                React.createElement('div', { key: 'clamp', className: 'settings-row' }, [
                    React.createElement('label', { key: 'label' }, 'Clamp:'),
                    React.createElement('input', {
                        key: 'checkbox',
                        type: 'checkbox',
                        checked: data.properties.clampSelect,
                        onChange: (e) => {
                            data.properties.clampSelect = e.target.checked;
                            forceUpdate(n => n + 1);
                        }
                    })
                ]),
                
                // Inputs
                React.createElement('div', { key: 'inputs', className: 'io-section' },
                    inputs.map(([key, input]) => {
                        const isDataInput = key.startsWith("data_");
                        const inputIndex = isDataInput ? parseInt(key.split("_")[1], 10) : -1;
                        const isActive = isDataInput && inputIndex === activeIndex;

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
    window.nodeRegistry.register('ConditionalSwitchNode', {
        label: "Conditional Switch",
        category: "Logic",
        nodeClass: ConditionalSwitchNode,
        component: ConditionalSwitchNodeComponent,
        factory: (cb) => new ConditionalSwitchNode(cb)
    });

    console.log("[ConditionalSwitchNode] Registered");
})();
