// ============================================================================
// IntegerSelectorNode.js - Integer selector using shared T2 infrastructure
// Refactored to use DRY principles with shared components
// ============================================================================

(function() {
    console.log("[IntegerSelectorNode] Loading plugin...");

    // Dependency checks
    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets) {
        console.error("[IntegerSelectorNode] Missing core dependencies");
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect } = React;
    const RefComponent = window.RefComponent;
    const sockets = window.sockets;

    // Get shared components
    const T2Components = window.T2Components || {};
    const { createSocketRef, LabeledSlider } = T2Components;
    const THEME = T2Components.THEME || window.T2Controls?.THEME || {
        primary: '#00f3ff',
        primaryRgba: (a) => `rgba(0, 243, 255, ${a})`,
        border: 'rgba(0, 243, 255, 0.3)',
        background: '#0a0f14'
    };

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

            this.addOutput("value", new ClassicPreset.Output(
                sockets.number || new ClassicPreset.Socket('number'), 
                "Value"
            ));
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
            return { id: this.id, label: this.label, properties: this.serialize() };
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

        const handleSliderChange = (val) => {
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
        const stopProp = (e) => e.stopPropagation();

        const inputStyle = {
            width: '50px',
            background: THEME.background,
            color: THEME.primary,
            border: `1px solid ${THEME.border}`,
            borderRadius: '4px',
            padding: '4px',
            fontSize: '11px',
            textAlign: 'center'
        };

        return React.createElement('div', { 
            className: 'integer-selector-node',
            style: {
                background: 'linear-gradient(180deg, rgba(10,20,30,0.95) 0%, rgba(5,15,25,0.98) 100%)',
                border: `1px solid ${THEME.border}`,
                borderRadius: '8px',
                minWidth: '180px'
            }
        }, [
            // Header
            React.createElement('div', { 
                key: 'header',
                style: {
                    background: THEME.primaryRgba(0.1),
                    borderBottom: `1px solid ${THEME.border}`,
                    padding: '8px 12px',
                    borderRadius: '7px 7px 0 0',
                    color: THEME.primary,
                    fontWeight: '600',
                    fontSize: '13px',
                    textTransform: 'uppercase'
                }
            }, 'Integer Selector'),

            // Content
            React.createElement('div', { 
                key: 'content',
                style: { padding: '12px' },
                onPointerDown: stopProp
            }, [
                // Large value display
                React.createElement('div', { 
                    key: 'valueDisplay',
                    style: {
                        fontSize: '32px',
                        fontWeight: '700',
                        color: THEME.primary,
                        textAlign: 'center',
                        marginBottom: '12px',
                        fontFamily: 'monospace',
                        textShadow: `0 0 20px ${THEME.primaryRgba(0.5)}`
                    }
                }, value),

                // Slider
                LabeledSlider 
                    ? React.createElement(LabeledSlider, {
                        key: 'slider',
                        label: '',
                        value,
                        min,
                        max,
                        step: 1,
                        onChange: handleSliderChange
                    })
                    : React.createElement('input', {
                        key: 'slider',
                        type: 'range',
                        min, max,
                        step: 1,
                        value,
                        onChange: (e) => handleSliderChange(Number(e.target.value)),
                        style: { width: '100%', accentColor: THEME.primary }
                    }),

                // Min/Max settings
                React.createElement('div', { 
                    key: 'range',
                    style: {
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginTop: '12px',
                        paddingTop: '8px',
                        borderTop: `1px solid ${THEME.border}`
                    }
                }, [
                    React.createElement('div', { 
                        key: 'min',
                        style: { display: 'flex', alignItems: 'center', gap: '6px' }
                    }, [
                        React.createElement('label', { 
                            key: 'label',
                            style: { fontSize: '10px', color: '#aaa', textTransform: 'uppercase' }
                        }, 'Min'),
                        React.createElement('input', {
                            key: 'input',
                            type: 'number',
                            value: min,
                            onChange: handleMinChange,
                            style: inputStyle
                        })
                    ]),
                    React.createElement('div', { 
                        key: 'max',
                        style: { display: 'flex', alignItems: 'center', gap: '6px' }
                    }, [
                        React.createElement('label', { 
                            key: 'label',
                            style: { fontSize: '10px', color: '#aaa', textTransform: 'uppercase' }
                        }, 'Max'),
                        React.createElement('input', {
                            key: 'input',
                            type: 'number',
                            value: max,
                            onChange: handleMaxChange,
                            style: inputStyle
                        })
                    ])
                ])
            ]),

            // Output
            React.createElement('div', { 
                key: 'outputs',
                style: {
                    padding: '8px 12px',
                    borderTop: `1px solid ${THEME.border}`,
                    display: 'flex',
                    justifyContent: 'flex-end',
                    alignItems: 'center',
                    gap: '8px'
                }
            }, outputs.map(([key, output]) => [
                React.createElement('span', { 
                    key: 'label',
                    style: { fontSize: '11px', color: '#aaa' }
                }, output.label),
                createSocketRef 
                    ? createSocketRef(emit, output.socket, data.id, 'output', key)
                    : React.createElement(RefComponent, {
                        key: 'socket',
                        init: ref => emit({ type: "render", data: { type: "socket", element: ref, payload: output.socket, nodeId: data.id, side: "output", key } }),
                        unmount: ref => emit({ type: "unmount", data: { element: ref } })
                    })
            ]))
        ]);
    }

    // -------------------------------------------------------------------------
    // REGISTRATION
    // -------------------------------------------------------------------------
    window.nodeRegistry.register('IntegerSelectorNode', {
        label: "Integer Selector",
        category: "Input",
        nodeClass: IntegerSelectorNode,
        factory: (cb) => new IntegerSelectorNode(cb),
        component: IntegerSelectorNodeComponent
    });

    console.log("[IntegerSelectorNode] Registered (DRY refactored)");
})();
