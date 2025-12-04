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
    // CSS INJECTION
    // -------------------------------------------------------------------------
    const styleId = 'integer-selector-node-css';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.innerHTML = `
            .integer-selector-node {
                background: linear-gradient(180deg, #2a3a2a 0%, #1a281a 100%);
                border: 1px solid #4a9050;
                border-radius: 8px;
                box-shadow: 0 0 12px rgba(74, 144, 80, 0.25);
                color: #e0f0e0;
                min-width: 180px;
                font-family: 'Segoe UI', sans-serif;
                overflow: hidden;
            }
            .integer-selector-node .header {
                background: linear-gradient(90deg, rgba(74, 144, 80, 0.3) 0%, rgba(74, 144, 80, 0) 100%);
                padding: 8px 12px;
                font-size: 14px;
                font-weight: 600;
                color: #7dc080;
                border-bottom: 1px solid rgba(74, 144, 80, 0.3);
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            .integer-selector-node .content {
                padding: 10px;
            }
            .integer-selector-node .value-display {
                background: rgba(0, 0, 0, 0.4);
                border: 1px solid rgba(74, 144, 80, 0.3);
                border-radius: 6px;
                padding: 10px;
                font-size: 24px;
                font-weight: bold;
                color: #7dc080;
                text-align: center;
                margin-bottom: 10px;
                font-family: 'Consolas', monospace;
            }
            .integer-selector-node .slider {
                width: 100%;
                height: 8px;
                -webkit-appearance: none;
                appearance: none;
                background: #1a281a;
                border-radius: 4px;
                outline: none;
                margin-bottom: 10px;
            }
            .integer-selector-node .slider::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: 20px;
                height: 20px;
                border-radius: 50%;
                background: #4a9050;
                cursor: pointer;
                border: 2px solid #7dc080;
                transition: background 0.2s;
            }
            .integer-selector-node .slider::-webkit-slider-thumb:hover {
                background: #5aa060;
            }
            .integer-selector-node .range-settings {
                display: flex;
                justify-content: space-between;
                gap: 10px;
                margin-bottom: 10px;
            }
            .integer-selector-node .range-input {
                display: flex;
                align-items: center;
                gap: 5px;
                flex: 1;
            }
            .integer-selector-node .range-input label {
                font-size: 11px;
                color: #a0c0a0;
            }
            .integer-selector-node .range-input input {
                width: 50px;
                background: #1a281a;
                border: 1px solid #4a9050;
                color: #e0f0e0;
                padding: 4px 6px;
                border-radius: 4px;
                font-size: 12px;
                text-align: center;
            }
            .integer-selector-node .range-input input:focus {
                outline: none;
                border-color: #7dc080;
            }
            .integer-selector-node .io-section.outputs {
                margin-top: 8px;
                border-top: 1px solid rgba(74, 144, 80, 0.2);
                padding-top: 8px;
            }
            .integer-selector-node .io-row {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .integer-selector-node .output-row {
                justify-content: flex-end;
            }
            .integer-selector-node .output-label {
                font-size: 12px;
                color: #a0c0a0;
            }
        `;
        document.head.appendChild(style);
    }

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
