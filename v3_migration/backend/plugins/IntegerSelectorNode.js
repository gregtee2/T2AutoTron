(function() {
    console.log("[IntegerSelectorNode] Loading plugin...");

    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets) {
        console.error("[IntegerSelectorNode] Missing dependencies");
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
    class IntegerSelectorNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("Integer Selector");
            this.width = 200;
            this.changeCallback = changeCallback;

            this.properties = {
                value: 0,
                min: 0,
                max: 10
            };

            this.addOutput("value", new ClassicPreset.Output(sockets.number, "Value"));
        }

        restore(state) {
            if (state.properties) {
                Object.assign(this.properties, state.properties);
                this.properties.value = Math.max(
                    this.properties.min,
                    Math.min(this.properties.max, this.properties.value)
                );
            }
        }

        serialize() {
            return {
                value: this.properties.value,
                min: this.properties.min,
                max: this.properties.max
            };
        }

        toJSON() {
            return {
                id: this.id,
                label: this.label,
                properties: this.serialize()
            };
        }

        data() {
            return { value: this.properties.value };
        }

        setValue(val) {
            const clamped = Math.max(this.properties.min, Math.min(this.properties.max, Math.round(val)));
            if (clamped !== this.properties.value) {
                this.properties.value = clamped;
                if (this.changeCallback) this.changeCallback();
            }
        }

        setMin(val) {
            this.properties.min = Math.round(val);
            if (this.properties.value < this.properties.min) {
                this.properties.value = this.properties.min;
            }
            if (this.changeCallback) this.changeCallback();
        }

        setMax(val) {
            this.properties.max = Math.round(val);
            if (this.properties.value > this.properties.max) {
                this.properties.value = this.properties.max;
            }
            if (this.changeCallback) this.changeCallback();
        }
    }

    // -------------------------------------------------------------------------
    // COMPONENT
    // -------------------------------------------------------------------------
    function IntegerSelectorNodeComponent({ data, emit }) {
        const [value, setValue] = useState(data.properties.value);
        const [min, setMin] = useState(data.properties.min);
        const [max, setMax] = useState(data.properties.max);

        useEffect(() => {
            data.changeCallback = () => {
                setValue(data.properties.value);
                setMin(data.properties.min);
                setMax(data.properties.max);
            };
            return () => { data.changeCallback = null; };
        }, [data]);

        const handleSliderChange = (e) => {
            const val = parseInt(e.target.value, 10);
            setValue(val);
            data.setValue(val);
        };

        const handleMinChange = (e) => {
            const val = parseInt(e.target.value, 10);
            if (!isNaN(val)) {
                setMin(val);
                data.setMin(val);
            }
        };

        const handleMaxChange = (e) => {
            const val = parseInt(e.target.value, 10);
            if (!isNaN(val)) {
                setMax(val);
                data.setMax(val);
            }
        };

        const outputs = Object.entries(data.outputs);

        return React.createElement('div', { className: 'integer-selector-node' }, [
            React.createElement('div', { key: 'header', className: 'header' }, 'Integer Selector'),
            React.createElement('div', { 
                key: 'content', 
                className: 'content',
                onPointerDown: (e) => e.stopPropagation()
            }, [
                // Value Display
                React.createElement('div', { key: 'value', className: 'value-display' }, value),
                
                // Slider
                React.createElement('input', {
                    key: 'slider',
                    type: 'range',
                    className: 'slider',
                    min: min,
                    max: max,
                    step: 1,
                    value: value,
                    onChange: handleSliderChange
                }),
                
                // Range Settings
                React.createElement('div', { key: 'range', className: 'range-settings' }, [
                    React.createElement('div', { key: 'minInput', className: 'range-input' }, [
                        React.createElement('label', { key: 'minLabel' }, 'Min:'),
                        React.createElement('input', {
                            key: 'min',
                            type: 'number',
                            value: min,
                            onChange: handleMinChange
                        })
                    ]),
                    React.createElement('div', { key: 'maxInput', className: 'range-input' }, [
                        React.createElement('label', { key: 'maxLabel' }, 'Max:'),
                        React.createElement('input', {
                            key: 'max',
                            type: 'number',
                            value: max,
                            onChange: handleMaxChange
                        })
                    ])
                ]),
                
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
    window.nodeRegistry.register('IntegerSelectorNode', {
        label: "Integer Selector",
        category: "Inputs",
        nodeClass: IntegerSelectorNode,
        component: IntegerSelectorNodeComponent,
        factory: (cb) => new IntegerSelectorNode(cb)
    });

    console.log("[IntegerSelectorNode] Registered");
})();
