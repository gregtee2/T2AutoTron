(function() {
    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets) {
        console.error("[PriorityEncoderNode] Missing dependencies");
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect, useCallback } = React;
    const RefComponent = window.RefComponent;
    const sockets = window.sockets;

    // -------------------------------------------------------------------------
    // TOOLTIPS
    // -------------------------------------------------------------------------
    const tooltips = {
        node: "Outputs the index number of the first TRUE input. Perfect for converting multiple conditions (like months, days, scenes) into a single integer value. First true input wins.",
        inputs: {
            default: "Connect a boolean signal. When this input is TRUE, the node outputs this input's number (if no earlier input is already true)."
        },
        outputs: {
            value: "The index number (1-based) of the first TRUE input. Outputs 0 if no inputs are true.",
            active: "TRUE when any input is active, FALSE when all inputs are false or disconnected."
        },
        controls: {
            inputCount: "Number of boolean inputs to create (2-16). Each input corresponds to its number.",
            labels: "Optional custom labels for inputs (e.g., 'January', 'February'). Leave empty to use numbers."
        }
    };

    // -------------------------------------------------------------------------
    // NODE CLASS
    // -------------------------------------------------------------------------
    class PriorityEncoderNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("Priority Encoder");
            this.width = 220;
            this.height = 200;
            this.changeCallback = changeCallback;

            this.properties = {
                inputCount: 4,
                labels: [],  // Custom labels, empty = use numbers
                defaultValue: 0
            };

            // Output socket
            this.addOutput("value", new ClassicPreset.Output(sockets.number, "Value"));
            this.addOutput("active", new ClassicPreset.Output(sockets.boolean, "Active"));

            // Create initial inputs
            this._createInputs(this.properties.inputCount);
        }

        _createInputs(count) {
            // Remove existing numbered inputs
            const existingKeys = Object.keys(this.inputs).filter(k => k.startsWith('in_'));
            existingKeys.forEach(key => this.removeInput(key));

            // Add new inputs
            for (let i = 1; i <= count; i++) {
                const label = this.properties.labels[i - 1] || String(i);
                this.addInput(`in_${i}`, new ClassicPreset.Input(sockets.boolean, label));
            }

            // Update height based on input count
            this.height = 160 + (count * 28);
        }

        setInputCount(count) {
            this.properties.inputCount = count;
            this._createInputs(count);
            if (this.changeCallback) this.changeCallback();
        }

        setLabels(labels) {
            this.properties.labels = labels;
            // Update existing input labels
            for (let i = 1; i <= this.properties.inputCount; i++) {
                const input = this.inputs[`in_${i}`];
                if (input) {
                    input.label = labels[i - 1] || String(i);
                }
            }
            if (this.changeCallback) this.changeCallback();
        }

        data(inputs) {
            // Find first true input
            for (let i = 1; i <= this.properties.inputCount; i++) {
                const inputVal = inputs[`in_${i}`]?.[0];
                if (inputVal === true) {
                    return { 
                        value: i,
                        active: true
                    };
                }
            }
            // No true input found
            return { 
                value: this.properties.defaultValue,
                active: false
            };
        }

        serialize() {
            return {
                inputCount: this.properties.inputCount,
                labels: this.properties.labels,
                defaultValue: this.properties.defaultValue
            };
        }

        restore(state) {
            const props = state.properties || state;
            if (props) {
                this.properties.inputCount = props.inputCount || 4;
                this.properties.labels = props.labels || [];
                this.properties.defaultValue = props.defaultValue ?? 0;
                this._createInputs(this.properties.inputCount);
            }
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
    function PriorityEncoderNodeComponent({ data, emit }) {
        const [inputCount, setInputCount] = useState(data.properties.inputCount);
        const [labels, setLabels] = useState(data.properties.labels || []);
        const [showLabels, setShowLabels] = useState(false);
        const [currentValue, setCurrentValue] = useState(0);

        const { NodeHeader, HelpIcon } = window.T2Controls || {};

        // Sync with node data
        useEffect(() => {
            const originalCallback = data.changeCallback;
            data.changeCallback = () => {
                // Update displayed value by checking inputs
                if (originalCallback) originalCallback();
            };
            return () => { data.changeCallback = originalCallback; };
        }, [data]);

        const handleInputCountChange = useCallback((newCount) => {
            const count = Math.max(2, Math.min(16, newCount));
            setInputCount(count);
            data.setInputCount(count);
        }, [data]);

        const handleLabelChange = useCallback((index, value) => {
            const newLabels = [...labels];
            newLabels[index] = value;
            setLabels(newLabels);
            data.setLabels(newLabels);
        }, [labels, data]);

        // Render inputs dynamically
        const renderInputs = () => {
            const inputElements = [];
            for (let i = 1; i <= inputCount; i++) {
                const key = `in_${i}`;
                const input = data.inputs[key];
                if (!input) continue;

                inputElements.push(
                    React.createElement('div', { 
                        key: key, 
                        style: { 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '8px', 
                            marginBottom: '4px' 
                        } 
                    }, [
                        React.createElement(RefComponent, {
                            key: 'socket',
                            init: ref => emit({ type: "render", data: { type: "socket", element: ref, payload: input.socket, nodeId: data.id, side: "input", key } }),
                            unmount: ref => emit({ type: "unmount", data: { element: ref } })
                        }),
                        React.createElement('span', { 
                            key: 'label',
                            style: { 
                                fontSize: '11px', 
                                color: '#8ecae6',
                                minWidth: '60px'
                            },
                            title: tooltips.inputs.default
                        }, labels[i - 1] || `Input ${i}`)
                    ])
                );
            }
            return inputElements;
        };

        // Render outputs
        const renderOutputs = () => {
            return Object.entries(data.outputs).map(([key, output]) =>
                React.createElement('div', { 
                    key: key, 
                    style: { 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '8px', 
                        justifyContent: 'flex-end',
                        marginBottom: '4px'
                    } 
                }, [
                    React.createElement('span', { 
                        key: 'label',
                        style: { fontSize: '11px', color: '#8ecae6' },
                        title: tooltips.outputs[key] || ''
                    }, output.label),
                    React.createElement(RefComponent, {
                        key: 'socket',
                        init: ref => emit({ type: "render", data: { type: "socket", element: ref, payload: output.socket, nodeId: data.id, side: "output", key } }),
                        unmount: ref => emit({ type: "unmount", data: { element: ref } })
                    })
                ])
            );
        };

        return React.createElement('div', { 
            className: 'node-content',
            style: { 
                minWidth: '200px',
                background: 'linear-gradient(135deg, rgba(30, 40, 50, 0.95) 0%, rgba(20, 30, 40, 0.98) 100%)',
                borderRadius: '8px',
                padding: '8px'
            }
        }, [
            // Header
            NodeHeader 
                ? React.createElement(NodeHeader, { 
                    key: 'header',
                    icon: '🔢', 
                    title: 'Priority Encoder', 
                    tooltip: tooltips.node
                })
                : React.createElement('div', { 
                    key: 'header',
                    style: { 
                        fontSize: '13px', 
                        fontWeight: 'bold', 
                        color: '#00f3ff', 
                        marginBottom: '8px',
                        textAlign: 'center'
                    }
                }, '🔢 Priority Encoder'),

            // Input count control
            React.createElement('div', { 
                key: 'count-control',
                style: { 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    gap: '8px', 
                    marginBottom: '10px',
                    padding: '6px',
                    background: 'rgba(0, 0, 0, 0.3)',
                    borderRadius: '4px'
                }
            }, [
                React.createElement('span', { key: 'lbl', style: { fontSize: '11px', color: '#888' } }, 'Inputs:'),
                React.createElement('button', {
                    key: 'minus',
                    onClick: () => handleInputCountChange(inputCount - 1),
                    onPointerDown: (e) => e.stopPropagation(),
                    style: {
                        width: '24px', height: '24px',
                        background: 'rgba(0, 243, 255, 0.2)',
                        border: '1px solid #00f3ff',
                        borderRadius: '4px',
                        color: '#00f3ff',
                        cursor: 'pointer',
                        fontSize: '14px'
                    }
                }, '−'),
                React.createElement('span', { 
                    key: 'val',
                    style: { 
                        fontSize: '14px', 
                        color: '#00f3ff', 
                        fontWeight: 'bold',
                        minWidth: '24px',
                        textAlign: 'center'
                    }
                }, inputCount),
                React.createElement('button', {
                    key: 'plus',
                    onClick: () => handleInputCountChange(inputCount + 1),
                    onPointerDown: (e) => e.stopPropagation(),
                    style: {
                        width: '24px', height: '24px',
                        background: 'rgba(0, 243, 255, 0.2)',
                        border: '1px solid #00f3ff',
                        borderRadius: '4px',
                        color: '#00f3ff',
                        cursor: 'pointer',
                        fontSize: '14px'
                    }
                }, '+'),
                HelpIcon && React.createElement(HelpIcon, { key: 'help', text: tooltips.controls.inputCount, size: 12 })
            ]),

            // Toggle labels button
            React.createElement('div', {
                key: 'labels-toggle',
                style: { textAlign: 'center', marginBottom: '8px' }
            }, 
                React.createElement('button', {
                    onClick: () => setShowLabels(!showLabels),
                    onPointerDown: (e) => e.stopPropagation(),
                    style: {
                        fontSize: '10px',
                        padding: '3px 8px',
                        background: showLabels ? 'rgba(0, 243, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)',
                        border: '1px solid rgba(0, 243, 255, 0.5)',
                        borderRadius: '3px',
                        color: '#8ecae6',
                        cursor: 'pointer'
                    }
                }, showLabels ? '▼ Hide Labels' : '▶ Edit Labels')
            ),

            // Custom labels editor (collapsible)
            showLabels && React.createElement('div', {
                key: 'labels-editor',
                style: {
                    background: 'rgba(0, 0, 0, 0.3)',
                    borderRadius: '4px',
                    padding: '8px',
                    marginBottom: '8px'
                }
            }, [
                React.createElement('div', { 
                    key: 'header',
                    style: { fontSize: '10px', color: '#666', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }
                }, [
                    'Custom Labels (optional)',
                    HelpIcon && React.createElement(HelpIcon, { key: 'help', text: tooltips.controls.labels, size: 10 })
                ]),
                ...Array.from({ length: inputCount }, (_, i) =>
                    React.createElement('div', { 
                        key: `label-${i}`,
                        style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }
                    }, [
                        React.createElement('span', { key: 'num', style: { fontSize: '10px', color: '#666', width: '16px' } }, `${i + 1}:`),
                        React.createElement('input', {
                            key: 'input',
                            type: 'text',
                            value: labels[i] || '',
                            placeholder: `Input ${i + 1}`,
                            onChange: (e) => handleLabelChange(i, e.target.value),
                            onPointerDown: (e) => e.stopPropagation(),
                            style: {
                                flex: 1,
                                fontSize: '10px',
                                padding: '3px 6px',
                                background: 'rgba(0, 0, 0, 0.4)',
                                border: '1px solid rgba(0, 243, 255, 0.3)',
                                borderRadius: '3px',
                                color: '#8ecae6'
                            }
                        })
                    ])
                )
            ]),

            // I/O Container
            React.createElement('div', { 
                key: 'io',
                style: { 
                    display: 'flex', 
                    justifyContent: 'space-between',
                    gap: '20px'
                }
            }, [
                // Inputs
                React.createElement('div', { key: 'inputs' }, renderInputs()),
                // Outputs  
                React.createElement('div', { key: 'outputs' }, renderOutputs())
            ])
        ]);
    }

    // -------------------------------------------------------------------------
    // REGISTER
    // -------------------------------------------------------------------------
    window.nodeRegistry.register('PriorityEncoderNode', {
        label: "Priority Encoder",
        category: "Logic",
        nodeClass: PriorityEncoderNode,
        factory: (cb) => new PriorityEncoderNode(cb),
        component: PriorityEncoderNodeComponent
    });

    console.log("[PriorityEncoderNode] Registered ✓");
})();
