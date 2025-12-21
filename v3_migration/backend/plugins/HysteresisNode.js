// ============================================================================
// HysteresisNode.js - Upper/Lower threshold with latch behavior
// Prevents oscillation in threshold-based control (e.g., thermostats)
// ============================================================================

(function() {
    // Dependency checks
    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets) {
        console.error("[HysteresisNode] Missing core dependencies");
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect, useCallback } = React;
    const RefComponent = window.RefComponent;
    const sockets = window.sockets;

    // Get shared components
    const T2Controls = window.T2Controls || {};
    const THEME = T2Controls.THEME || {
        primary: '#5fb3b3',
        primaryRgba: (a) => `rgba(95, 179, 179, ${a})`,
        border: 'rgba(95, 179, 179, 0.25)',
        success: '#5faa7d',
        warning: '#d4a054',
        error: '#c75f5f',
        background: '#1e2428',
        surface: '#2a3238',
        text: '#c5cdd3',
        textMuted: '#8a959e'
    };
    
    // Get category-specific accent (Logic = green)
    const CATEGORY = THEME.getCategory ? THEME.getCategory('Logic') : {
        accent: '#81c784',
        accentRgba: (a) => `rgba(129, 199, 132, ${a})`,
        headerBg: 'rgba(129, 199, 132, 0.15)',
        border: 'rgba(129, 199, 132, 0.4)'
    };
    
    const NodeHeader = T2Controls.NodeHeader;
    const HelpIcon = T2Controls.HelpIcon;

    const stopPropagation = (e) => e.stopPropagation();

    // Tooltip definitions
    const tooltips = {
        node: "Hysteresis Node: Implements upper/lower threshold with latch behavior. Output turns ON when value exceeds upper threshold, stays ON until value drops below lower threshold. Prevents rapid on/off oscillation (chattering) in control systems like thermostats.",
        inputs: {
            value: "Numeric input value to compare against thresholds.",
            reset: "Boolean true forces output to OFF state."
        },
        outputs: {
            output: "Boolean output: true when latched ON, false when latched OFF.",
            state: "String state: 'high' (above upper), 'low' (below lower), 'band' (between thresholds)."
        },
        controls: {
            upper: "Upper threshold - output turns ON when value rises above this.",
            lower: "Lower threshold - output turns OFF when value falls below this.",
            invert: "Invert logic: ON below lower, OFF above upper (cooling mode vs heating mode)."
        }
    };

    // -------------------------------------------------------------------------
    // NODE CLASS
    // -------------------------------------------------------------------------
    class HysteresisNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("Hysteresis");
            this.width = 220;
            this.changeCallback = changeCallback;

            this.properties = {
                upper: 75,
                lower: 65,
                invert: false,
                latched: false,
                lastValue: null,
                debug: false
            };

            // Inputs
            this.addInput("value", new ClassicPreset.Input(
                sockets.number || new ClassicPreset.Socket('number'),
                "Value"
            ));
            this.addInput("reset", new ClassicPreset.Input(
                sockets.boolean || new ClassicPreset.Socket('boolean'),
                "Reset"
            ));

            // Outputs
            this.addOutput("output", new ClassicPreset.Output(
                sockets.boolean || new ClassicPreset.Socket('boolean'),
                "Output"
            ));
            this.addOutput("state", new ClassicPreset.Output(
                sockets.any || new ClassicPreset.Socket('any'),
                "State"
            ));
        }

        data(inputs) {
            const value = inputs.value?.[0];
            const reset = inputs.reset?.[0];

            // Handle reset
            if (reset === true) {
                this.properties.latched = false;
                return { output: false, state: 'reset' };
            }

            // No value = maintain state
            if (value === undefined || typeof value !== 'number') {
                return { 
                    output: this.properties.invert ? !this.properties.latched : this.properties.latched, 
                    state: this.properties.latched ? 'latched' : 'off' 
                };
            }

            this.properties.lastValue = value;
            const { upper, lower, invert } = this.properties;

            // Determine state
            let state = 'band';
            if (value >= upper) {
                state = 'high';
                this.properties.latched = true;
            } else if (value <= lower) {
                state = 'low';
                this.properties.latched = false;
            }
            // If in band, maintain current latch state

            // Apply invert if needed
            const output = invert ? !this.properties.latched : this.properties.latched;

            if (this.properties.debug) {
                console.log(`[Hysteresis] value=${value}, upper=${upper}, lower=${lower}, latched=${this.properties.latched}, output=${output}`);
            }

            return { output, state };
        }

        restore(state) {
            if (state.properties) {
                Object.assign(this.properties, state.properties);
            }
        }

        serialize() {
            return {
                upper: this.properties.upper,
                lower: this.properties.lower,
                invert: this.properties.invert,
                debug: this.properties.debug
            };
        }
    }

    // -------------------------------------------------------------------------
    // REACT COMPONENT
    // -------------------------------------------------------------------------
    function HysteresisNodeComponent({ data, emit }) {
        const [upper, setUpper] = useState(data.properties.upper);
        const [lower, setLower] = useState(data.properties.lower);
        const [invert, setInvert] = useState(data.properties.invert);
        const [latched, setLatched] = useState(data.properties.latched);
        const [lastValue, setLastValue] = useState(data.properties.lastValue);

        // Sync with node properties
        useEffect(() => {
            const originalCallback = data.changeCallback;
            data.changeCallback = () => {
                setUpper(data.properties.upper);
                setLower(data.properties.lower);
                setInvert(data.properties.invert);
                setLatched(data.properties.latched);
                setLastValue(data.properties.lastValue);
                if (originalCallback) originalCallback();
            };
            return () => { data.changeCallback = originalCallback; };
        }, [data]);

        const handleUpperChange = useCallback((e) => {
            const val = parseFloat(e.target.value) || 0;
            setUpper(val);
            data.properties.upper = val;
        }, [data]);

        const handleLowerChange = useCallback((e) => {
            const val = parseFloat(e.target.value) || 0;
            setLower(val);
            data.properties.lower = val;
        }, [data]);

        const handleInvertChange = useCallback((e) => {
            const val = e.target.checked;
            setInvert(val);
            data.properties.invert = val;
        }, [data]);

        // Status color
        let statusColor = THEME.textMuted; // gray = no input
        let statusText = 'Waiting';
        if (lastValue !== null) {
            if (latched) {
                statusColor = THEME.success;
                statusText = invert ? 'OFF (inverted)' : 'ON';
            } else {
                statusColor = THEME.error;
                statusText = invert ? 'ON (inverted)' : 'OFF';
            }
        }

        const nodeStyle = {
            background: THEME.surface,
            borderRadius: '8px',
            padding: '12px',
            minWidth: '200px',
            border: `1px solid ${CATEGORY.border}`
        };

        const inputStyle = {
            width: '100%',
            background: THEME.background,
            color: THEME.text,
            border: `1px solid ${THEME.border}`,
            borderRadius: '4px',
            padding: '6px 8px',
            fontSize: '12px'
        };

        const rowStyle = {
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '8px'
        };

        const labelStyle = {
            width: '50px',
            fontSize: '11px',
            color: THEME.textMuted
        };

        const statStyle = {
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '11px',
            color: THEME.textMuted,
            marginTop: '8px',
            padding: '6px 8px',
            background: THEME.background,
            borderRadius: '4px'
        };

        // Visual band indicator
        const bandStyle = {
            marginTop: '8px',
            padding: '8px',
            background: THEME.background,
            borderRadius: '4px',
            position: 'relative',
            height: '40px'
        };

        const bandBarStyle = {
            position: 'absolute',
            left: '10%',
            right: '10%',
            top: '50%',
            transform: 'translateY(-50%)',
            height: '8px',
            background: `linear-gradient(to right, ${THEME.error}, ${THEME.textMuted}, ${THEME.success})`,
            borderRadius: '4px'
        };

        return React.createElement('div', { 
            className: 'logic-node',
            style: { padding: '0', minWidth: '200px' } 
        }, [
            // Header
            NodeHeader && React.createElement(NodeHeader, {
                key: 'header',
                icon: '📊',
                title: 'Hysteresis',
                tooltip: tooltips.node,
                statusDot: true,
                statusColor: statusColor
            }),

            // Upper threshold
            React.createElement('div', { key: 'upper-row', style: rowStyle }, [
                React.createElement('span', { key: 'label', style: labelStyle }, 'Upper'),
                React.createElement('input', {
                    key: 'input',
                    type: 'number',
                    value: upper,
                    onChange: handleUpperChange,
                    onPointerDown: stopPropagation,
                    style: { ...inputStyle, flex: 1 }
                }),
                HelpIcon && React.createElement(HelpIcon, { key: 'help', text: tooltips.controls.upper, size: 10 })
            ]),

            // Lower threshold
            React.createElement('div', { key: 'lower-row', style: rowStyle }, [
                React.createElement('span', { key: 'label', style: labelStyle }, 'Lower'),
                React.createElement('input', {
                    key: 'input',
                    type: 'number',
                    value: lower,
                    onChange: handleLowerChange,
                    onPointerDown: stopPropagation,
                    style: { ...inputStyle, flex: 1 }
                }),
                HelpIcon && React.createElement(HelpIcon, { key: 'help', text: tooltips.controls.lower, size: 10 })
            ]),

            // Invert checkbox
            React.createElement('div', { key: 'invert-row', style: { ...rowStyle, marginBottom: '4px' } }, [
                React.createElement('label', { 
                    key: 'label',
                    style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: THEME.textMuted, cursor: 'pointer' }
                }, [
                    React.createElement('input', {
                        key: 'checkbox',
                        type: 'checkbox',
                        checked: invert,
                        onChange: handleInvertChange,
                        onPointerDown: stopPropagation
                    }),
                    'Invert (cooling mode)'
                ]),
                HelpIcon && React.createElement(HelpIcon, { key: 'help', text: tooltips.controls.invert, size: 10 })
            ]),

            // Stats display
            React.createElement('div', { key: 'stats', style: statStyle }, [
                React.createElement('span', { key: 'status' }, `Output: ${statusText}`),
                React.createElement('span', { key: 'value' }, `Value: ${lastValue !== null ? lastValue.toFixed(1) : '—'}`)
            ]),

            // Inputs (left side, using same pattern as logic gates)
            React.createElement('div', { 
                key: 'inputs',
                className: 'io-container',
                style: { padding: '8px 10px' }
            }, 
                Object.entries(data.inputs).map(([key, input]) => 
                    React.createElement('div', { 
                        key, 
                        className: 'socket-row',
                        style: { display: 'flex', alignItems: 'center', marginBottom: '4px' }
                    }, [
                        React.createElement(RefComponent, {
                            key: 'socket',
                            init: (ref) => emit({ type: 'render', data: { type: 'socket', side: 'input', key, nodeId: data.id, element: ref, payload: input.socket } }),
                            unmount: (ref) => emit({ type: 'unmount', data: { element: ref } })
                        }),
                        React.createElement('span', { 
                            key: 'label',
                            className: 'socket-label'
                        }, input.label || key)
                    ])
                )
            ),

            // Outputs (right side, using same pattern as logic gates)
            React.createElement('div', { 
                key: 'outputs',
                className: 'io-container'
            }, 
                Object.entries(data.outputs).map(([key, output]) => 
                    React.createElement('div', { 
                        key, 
                        className: 'socket-row',
                        style: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }
                    }, [
                        React.createElement('span', {
                            key: 'label',
                            className: 'socket-label'
                        }, output.label || key),
                        React.createElement(RefComponent, {
                            key: 'socket',
                            init: (ref) => emit({ type: 'render', data: { type: 'socket', side: 'output', key, nodeId: data.id, element: ref, payload: output.socket } }),
                            unmount: (ref) => emit({ type: 'unmount', data: { element: ref } })
                        })
                    ])
                )
            )
        ]);
    }

    // -------------------------------------------------------------------------
    // REGISTER
    // -------------------------------------------------------------------------
    if (window.nodeRegistry) {
        window.nodeRegistry.register('HysteresisNode', {
            label: "Hysteresis",
            category: "Logic",
            nodeClass: HysteresisNode,
            component: HysteresisNodeComponent,
            factory: (cb) => new HysteresisNode(cb)
        });
        console.log("[HysteresisNode] Registered successfully");
    } else {
        console.error("[HysteresisNode] nodeRegistry not found");
    }

})();
