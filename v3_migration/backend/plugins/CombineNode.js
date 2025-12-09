/**
 * CombineNode.js
 * Combines multiple inputs into a single output.
 * Passes through the most recently changed or first truthy value.
 */
(function() {
    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets) {
        console.warn('CombineNode: Dependencies not ready');
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect } = React;
    const el = React.createElement;

    // Get shared controls and theme
    const T2Controls = window.T2Controls || {};
    const { NodeHeader, HelpIcon } = T2Controls;
    const THEME = T2Controls.THEME || {
        primary: '#5fb3b3',
        background: '#1e2428',
        surface: '#2a3238',
        surfaceLight: '#343d44',
        text: '#c5cdd3',
        textMuted: '#8a959e',
        textBright: '#e8edf0',
        success: '#5faa7d',
        warning: '#d4a054',
        error: '#c75f5f',
        border: 'rgba(95, 179, 179, 0.25)',
        borderLight: 'rgba(200, 210, 220, 0.15)'
    };

    // Tooltips for user help
    const tooltips = {
        node: "Combines multiple inputs into a single output. Passes through the first truthy value found (checking Input 1 first, then Input 2, etc.). Use this to merge signals from multiple sources into one connection.",
        inputs: {
            in1: "First input - highest priority if truthy",
            in2: "Second input - used if Input 1 is falsy",
            in3: "Third input (optional) - add via + button",
            in4: "Fourth input (optional) - add via + button"
        },
        outputs: {
            output: "Passes through the first truthy input value"
        },
        controls: {
            inputCount: "Number of inputs (2-8). Click + or - to add/remove inputs.",
            mode: "Priority: Use first truthy input. Latest: Use most recently changed input. All: Pass through any change."
        }
    };

    class CombineNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("Combine");
            this.changeCallback = changeCallback;
            
            this.properties = {
                inputCount: 2,
                mode: 'priority',  // 'priority' | 'latest' | 'all'
                lastActiveInput: null,
                lastValue: null
            };

            // Add initial inputs
            this.addInput('in1', new ClassicPreset.Input(window.sockets.any, 'Input 1'));
            this.addInput('in2', new ClassicPreset.Input(window.sockets.any, 'Input 2'));
            
            // Add output
            this.addOutput('output', new ClassicPreset.Output(window.sockets.any, 'Output'));
        }

        // Add more inputs dynamically
        setInputCount(count) {
            const newCount = Math.max(2, Math.min(8, count));
            const oldCount = this.properties.inputCount;
            
            if (newCount > oldCount) {
                // Add new inputs
                for (let i = oldCount + 1; i <= newCount; i++) {
                    const key = `in${i}`;
                    if (!this.inputs[key]) {
                        this.addInput(key, new ClassicPreset.Input(window.sockets.any, `Input ${i}`));
                    }
                }
            } else if (newCount < oldCount) {
                // Remove inputs (from the end)
                for (let i = oldCount; i > newCount; i--) {
                    const key = `in${i}`;
                    if (this.inputs[key]) {
                        this.removeInput(key);
                    }
                }
            }
            
            this.properties.inputCount = newCount;
            if (this.changeCallback) this.changeCallback();
        }

        data(inputs) {
            const mode = this.properties.mode;
            let result = null;
            let activeInput = null;

            if (mode === 'priority') {
                // Priority mode: first truthy input wins
                for (let i = 1; i <= this.properties.inputCount; i++) {
                    const key = `in${i}`;
                    const values = inputs[key];
                    if (values && values.length > 0) {
                        const val = values[0];
                        if (val !== null && val !== undefined && val !== false && val !== 0 && val !== '') {
                            result = val;
                            activeInput = i;
                            break;
                        }
                    }
                }
                // If no truthy value, use first available
                if (result === null) {
                    for (let i = 1; i <= this.properties.inputCount; i++) {
                        const key = `in${i}`;
                        const values = inputs[key];
                        if (values && values.length > 0 && values[0] !== undefined) {
                            result = values[0];
                            activeInput = i;
                            break;
                        }
                    }
                }
            } else if (mode === 'latest') {
                // Latest mode: use the most recently changed input
                // For now, we track which input changed by comparing to last value
                for (let i = 1; i <= this.properties.inputCount; i++) {
                    const key = `in${i}`;
                    const values = inputs[key];
                    if (values && values.length > 0 && values[0] !== undefined) {
                        result = values[0];
                        activeInput = i;
                    }
                }
            } else {
                // 'all' mode: pass through any non-null value (last one checked wins)
                for (let i = 1; i <= this.properties.inputCount; i++) {
                    const key = `in${i}`;
                    const values = inputs[key];
                    if (values && values.length > 0 && values[0] !== undefined && values[0] !== null) {
                        result = values[0];
                        activeInput = i;
                    }
                }
            }

            this.properties.lastActiveInput = activeInput;
            this.properties.lastValue = result;

            return { output: result };
        }

        restore(state) {
            if (state.properties) {
                const savedCount = state.properties.inputCount || 2;
                // Restore input count
                for (let i = 3; i <= savedCount; i++) {
                    const key = `in${i}`;
                    if (!this.inputs[key]) {
                        this.addInput(key, new ClassicPreset.Input(window.sockets.any, `Input ${i}`));
                    }
                }
                Object.assign(this.properties, state.properties);
            }
        }

        serialize() {
            return { ...this.properties };
        }
    }

    function CombineNodeComponent({ data, emit }) {
        const [inputCount, setInputCount] = useState(data.properties?.inputCount || 2);
        const [mode, setMode] = useState(data.properties?.mode || 'priority');
        const [activeInput, setActiveInput] = useState(data.properties?.lastActiveInput);
        const [, forceUpdate] = useState(0);

        useEffect(() => {
            const originalCallback = data.changeCallback;
            data.changeCallback = () => {
                setInputCount(data.properties.inputCount);
                setMode(data.properties.mode);
                setActiveInput(data.properties.lastActiveInput);
                forceUpdate(n => n + 1);  // Force re-render for socket changes
                if (originalCallback) originalCallback();
            };
            return () => { data.changeCallback = originalCallback; };
        }, [data]);

        const handleAddInput = (e) => {
            e.stopPropagation();
            if (inputCount < 8) {
                data.setInputCount(inputCount + 1);
            }
        };

        const handleRemoveInput = (e) => {
            e.stopPropagation();
            if (inputCount > 2) {
                data.setInputCount(inputCount - 1);
            }
        };

        const handleModeChange = (e) => {
            e.stopPropagation();
            const newMode = e.target.value;
            data.properties.mode = newMode;
            setMode(newMode);
            if (data.changeCallback) data.changeCallback();
        };

        // Status indicator
        let statusColor = '#888';
        let statusText = 'No input';
        if (activeInput) {
            statusColor = '#4caf50';
            statusText = `Input ${activeInput} active`;
        }

        // Build input socket elements
        const inputSockets = [];
        for (let i = 1; i <= inputCount; i++) {
            const key = `in${i}`;
            const input = data.inputs[key];
            if (input) {
                inputSockets.push(
                    el('div', {
                        key: key,
                        style: {
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            marginBottom: '4px'
                        }
                    }, [
                        el(window.RefComponent, {
                            key: `${key}-ref`,
                            init: ref => emit({ type: 'render', data: { type: 'socket', side: 'input', key, nodeId: data.id, element: ref, payload: input.socket } })
                        }),
                        el('span', { 
                            key: `${key}-label`,
                            style: { 
                                fontSize: '12px', 
                                color: activeInput === i ? '#4caf50' : '#aaa' 
                            } 
                        }, `Input ${i}`)
                    ])
                );
            }
        }

        // Output socket
        const outputSocket = data.outputs['output'];

        return el('div', {
            style: {
                background: `linear-gradient(135deg, ${THEME.background} 0%, ${THEME.surface} 100%)`,
                borderRadius: '8px',
                padding: '10px',
                minWidth: '160px',
                fontFamily: 'Arial, sans-serif',
                color: THEME.text
            }
        }, [
            // Header
            NodeHeader 
                ? el(NodeHeader, {
                    key: 'header',
                    icon: '🔀',
                    title: 'Combine',
                    tooltip: tooltips.node,
                    statusDot: true,
                    statusColor: statusColor
                })
                : el('div', {
                    key: 'header',
                    style: {
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '10px',
                        borderBottom: `1px solid ${THEME.border}`,
                        paddingBottom: '8px'
                    }
                }, [
                    el('span', { key: 'icon', style: { fontSize: '18px' } }, '🔀'),
                    el('span', { key: 'title', style: { fontWeight: 'bold', flex: 1 } }, 'Combine'),
                    el('div', {
                        key: 'status',
                        title: statusText,
                        style: {
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            backgroundColor: statusColor,
                            boxShadow: `0 0 4px ${statusColor}`
                        }
                    })
                ]),

            // Input count control
            el('div', {
                key: 'inputCount',
                style: {
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '8px',
                    gap: '8px'
                }
            }, [
                el('span', { key: 'label', style: { fontSize: '12px', color: THEME.textMuted } }, 'Inputs:'),
                el('div', {
                    key: 'controls',
                    style: { display: 'flex', alignItems: 'center', gap: '4px' }
                }, [
                    el('button', {
                        key: 'minus',
                        onClick: handleRemoveInput,
                        onPointerDown: (e) => e.stopPropagation(),
                        disabled: inputCount <= 2,
                        style: {
                            width: '24px',
                            height: '24px',
                            borderRadius: '4px',
                            border: `1px solid ${inputCount <= 2 ? THEME.border : THEME.primary}`,
                            backgroundColor: inputCount <= 2 ? THEME.surfaceLight : `${THEME.primary}25`,
                            color: inputCount <= 2 ? THEME.textMuted : THEME.textBright,
                            cursor: inputCount <= 2 ? 'not-allowed' : 'pointer',
                            fontSize: '16px',
                            fontWeight: 'bold'
                        }
                    }, '−'),
                    el('span', {
                        key: 'count',
                        style: {
                            minWidth: '24px',
                            textAlign: 'center',
                            fontSize: '14px',
                            fontWeight: 'bold'
                        }
                    }, inputCount),
                    el('button', {
                        key: 'plus',
                        onClick: handleAddInput,
                        onPointerDown: (e) => e.stopPropagation(),
                        disabled: inputCount >= 8,
                        style: {
                            width: '24px',
                            height: '24px',
                            borderRadius: '4px',
                            border: `1px solid ${inputCount >= 8 ? THEME.border : THEME.primary}`,
                            backgroundColor: inputCount >= 8 ? THEME.surfaceLight : `${THEME.primary}25`,
                            color: inputCount >= 8 ? THEME.textMuted : THEME.textBright,
                            cursor: inputCount >= 8 ? 'not-allowed' : 'pointer',
                            fontSize: '16px',
                            fontWeight: 'bold'
                        }
                    }, '+')
                ])
            ]),

            // Mode selector
            el('div', {
                key: 'modeRow',
                style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '8px'
                }
            }, [
                el('span', { 
                    key: 'label', 
                    style: { fontSize: '12px', color: THEME.textMuted } 
                }, 'Mode:'),
                el('select', {
                    key: 'select',
                    value: mode,
                    onChange: handleModeChange,
                    onPointerDown: (e) => e.stopPropagation(),
                    style: {
                        flex: 1,
                        padding: '4px 8px',
                        borderRadius: '4px',
                        border: `1px solid ${THEME.border}`,
                        backgroundColor: THEME.surface,
                        color: THEME.text,
                        fontSize: '12px',
                        cursor: 'pointer'
                    }
                }, [
                    el('option', { key: 'priority', value: 'priority' }, 'Priority'),
                    el('option', { key: 'latest', value: 'latest' }, 'Latest'),
                    el('option', { key: 'all', value: 'all' }, 'Any')
                ]),
                HelpIcon && el(HelpIcon, { 
                    key: 'help',
                    text: tooltips.controls.mode, 
                    size: 12 
                })
            ]),

            // Active input indicator
            activeInput && el('div', {
                key: 'activeIndicator',
                style: {
                    fontSize: '11px',
                    color: THEME.success,
                    textAlign: 'center',
                    padding: '4px',
                    backgroundColor: `${THEME.success}15`,
                    borderRadius: '4px',
                    marginBottom: '8px'
                }
            }, `Active: Input ${activeInput}`),

            // Input sockets section
            el('div', {
                key: 'inputs',
                style: {
                    marginTop: '8px',
                    borderTop: `1px solid ${THEME.border}`,
                    paddingTop: '8px'
                }
            }, inputSockets),

            // Output socket
            outputSocket && el('div', {
                key: 'output',
                style: {
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: '8px',
                    marginTop: '8px',
                    borderTop: '1px solid #444',
                    paddingTop: '8px'
                }
            }, [
                el('span', { 
                    key: 'output-label',
                    style: { fontSize: '12px', color: '#aaa' } 
                }, 'Output'),
                el(window.RefComponent, {
                    key: 'output-ref',
                    init: ref => emit({ type: 'render', data: { type: 'socket', side: 'output', key: 'output', nodeId: data.id, element: ref, payload: outputSocket.socket } })
                })
            ])
        ]);
    }

    // Register the node
    if (window.nodeRegistry) {
        window.nodeRegistry.register('CombineNode', {
            label: "Combine",
            category: "Utility",
            nodeClass: CombineNode,
            component: CombineNodeComponent,
            factory: (cb) => new CombineNode(cb)
        });
        console.log('CombineNode registered successfully');
    }
})();
