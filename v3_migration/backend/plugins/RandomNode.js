// ============================================================================
// RandomNode.js - Random Number Generator Node
// Output random numbers in a configurable range
// ============================================================================

(function() {
    // Dependency checks
    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets) {
        console.error("[RandomNode] Missing core dependencies");
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
    
    // Get category-specific accent (Utility = gray-blue)
    const CATEGORY = THEME.getCategory ? THEME.getCategory('Utility') : {
        accent: '#90a4ae',
        accentRgba: (a) => `rgba(144, 164, 174, ${a})`,
        headerBg: 'rgba(144, 164, 174, 0.15)',
        border: 'rgba(144, 164, 174, 0.4)'
    };
    
    const NodeHeader = T2Controls.NodeHeader;
    const HelpIcon = T2Controls.HelpIcon;

    const stopPropagation = (e) => e.stopPropagation();

    // Tooltip definitions
    const tooltips = {
        node: "Random Node: Generates random numbers within a specified range. Trigger to generate a new random value, or use continuous mode for constant randomness.",
        inputs: {
            trigger: "Each truthy value generates a new random number. In continuous mode, any input generates new values."
        },
        outputs: {
            value: "The generated random number within the min/max range.",
            normalized: "The random value normalized to 0-1 range (useful for percentages)."
        },
        controls: {
            min: "Minimum value of the random range (inclusive).",
            max: "Maximum value of the random range (inclusive).",
            integer: "If enabled, output is rounded to whole numbers only.",
            continuous: "If enabled, generates a new random value on every graph execution."
        }
    };

    // -------------------------------------------------------------------------
    // NODE CLASS
    // -------------------------------------------------------------------------
    class RandomNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("Random");
            this.width = 200;
            this.changeCallback = changeCallback;

            this.properties = {
                min: 0,
                max: 100,
                integer: true,
                continuous: false,
                currentValue: null,
                normalized: null,
                lastTrigger: false,
                generationCount: 0,
                debug: false
            };

            // Inputs
            this.addInput("trigger", new ClassicPreset.Input(
                sockets.any || new ClassicPreset.Socket('any'),
                "Trigger"
            ));

            // Outputs
            this.addOutput("value", new ClassicPreset.Output(
                sockets.number || new ClassicPreset.Socket('number'),
                "Value"
            ));
            this.addOutput("normalized", new ClassicPreset.Output(
                sockets.number || new ClassicPreset.Socket('number'),
                "Normalized"
            ));
        }

        generate() {
            const props = this.properties;
            const min = props.min;
            const max = props.max;
            
            let value = Math.random() * (max - min) + min;
            
            if (props.integer) {
                value = Math.round(value);
            }

            props.currentValue = value;
            props.normalized = (value - min) / (max - min);
            props.generationCount++;
            
            if (this.changeCallback) this.changeCallback();
            
            return value;
        }

        data(inputs) {
            const props = this.properties;
            const trigger = inputs.trigger?.[0];

            // Detect trigger
            const triggerActive = Boolean(trigger);
            const wasActive = props.lastTrigger;
            props.lastTrigger = triggerActive;

            // Generate on rising edge or if continuous mode
            if ((triggerActive && !wasActive) || props.continuous) {
                this.generate();
            }

            return { 
                value: props.currentValue, 
                normalized: props.normalized 
            };
        }

        restore(state) {
            if (state.properties) {
                this.properties.min = state.properties.min ?? 0;
                this.properties.max = state.properties.max ?? 100;
                this.properties.integer = state.properties.integer ?? true;
                this.properties.continuous = state.properties.continuous ?? false;
            }
            // Reset runtime state
            this.properties.currentValue = null;
            this.properties.normalized = null;
            this.properties.lastTrigger = false;
            this.properties.generationCount = 0;
        }

        serialize() {
            return {
                min: this.properties.min,
                max: this.properties.max,
                integer: this.properties.integer,
                continuous: this.properties.continuous
            };
        }
    }

    // -------------------------------------------------------------------------
    // REACT COMPONENT
    // -------------------------------------------------------------------------
    function RandomNodeComponent({ data, emit }) {
        const [, forceUpdate] = useState(0);
        const props = data.properties;

        useEffect(() => {
            const originalCallback = data.changeCallback;
            data.changeCallback = () => {
                forceUpdate(n => n + 1);
                if (originalCallback) originalCallback();
            };
            return () => { data.changeCallback = originalCallback; };
        }, [data]);

        const handleMinChange = useCallback((e) => {
            props.min = parseFloat(e.target.value) || 0;
            forceUpdate(n => n + 1);
        }, [props]);

        const handleMaxChange = useCallback((e) => {
            props.max = parseFloat(e.target.value) || 100;
            forceUpdate(n => n + 1);
        }, [props]);

        const handleIntegerToggle = useCallback(() => {
            props.integer = !props.integer;
            forceUpdate(n => n + 1);
        }, [props]);

        const handleContinuousToggle = useCallback(() => {
            props.continuous = !props.continuous;
            forceUpdate(n => n + 1);
        }, [props]);

        const handleGenerate = useCallback(() => {
            data.generate();
        }, [data]);

        // Format display value
        const displayValue = props.currentValue !== null 
            ? (props.integer ? props.currentValue : props.currentValue.toFixed(2))
            : '—';

        // Status
        const hasValue = props.currentValue !== null;
        const statusColor = props.continuous ? THEME.warning : 
                           hasValue ? THEME.success : THEME.textMuted;

        // Styles
        const containerStyle = {
            padding: '12px',
            background: `linear-gradient(135deg, ${THEME.background} 0%, ${THEME.surface} 100%)`,
            borderRadius: '8px',
            fontFamily: 'monospace',
            minWidth: '180px'
        };

        const headerStyle = {
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '10px',
            paddingBottom: '8px',
            borderBottom: `1px solid ${THEME.border}`
        };

        const rowStyle = {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '8px',
            gap: '8px'
        };

        const labelStyle = {
            color: THEME.text,
            fontSize: '11px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
        };

        const inputStyle = {
            background: THEME.surface,
            border: `1px solid ${THEME.border}`,
            borderRadius: '4px',
            color: THEME.text,
            padding: '4px 8px',
            fontSize: '11px',
            width: '60px',
            textAlign: 'center'
        };

        const valueDisplayStyle = {
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '12px',
            margin: '8px 0',
            background: THEME.surfaceLight,
            borderRadius: '8px',
            border: `1px solid ${THEME.border}`
        };

        const valueStyle = {
            fontSize: '24px',
            fontWeight: 'bold',
            color: THEME.primary
        };

        const buttonStyle = {
            background: `linear-gradient(135deg, ${THEME.primaryRgba(0.3)} 0%, ${THEME.primaryRgba(0.1)} 100%)`,
            border: `1px solid ${THEME.border}`,
            borderRadius: '4px',
            color: THEME.text,
            padding: '8px 12px',
            fontSize: '12px',
            cursor: 'pointer',
            width: '100%',
            fontWeight: 'bold'
        };

        const checkboxRowStyle = {
            ...rowStyle,
            cursor: 'pointer'
        };

        const checkboxStyle = {
            width: '14px',
            height: '14px',
            accentColor: THEME.primary
        };

        const statsStyle = {
            fontSize: '10px',
            color: THEME.textMuted,
            textAlign: 'center',
            marginTop: '4px'
        };

        // Get sockets
        const triggerInput = data.inputs?.trigger;
        const valueOutput = data.outputs?.value;
        const normalizedOutput = data.outputs?.normalized;

        return React.createElement('div', { style: containerStyle }, [
            // Header
            NodeHeader 
                ? React.createElement(NodeHeader, {
                    key: 'header',
                    icon: '🎲',
                    title: 'Random',
                    tooltip: tooltips.node,
                    statusDot: true,
                    statusColor: statusColor
                })
                : React.createElement('div', { key: 'header', style: headerStyle }, [
                    React.createElement('span', { key: 'icon', style: { fontSize: '16px' } }, '🎲'),
                    React.createElement('span', { key: 'title', style: { color: THEME.text, fontWeight: 'bold', flex: 1 } }, 'Random'),
                    React.createElement('div', {
                        key: 'status',
                        style: {
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            backgroundColor: statusColor,
                            boxShadow: `0 0 6px ${statusColor}`
                        }
                    })
                ]),

            // Trigger input socket
            triggerInput && React.createElement('div', { key: 'trigger-row', style: { ...rowStyle, marginBottom: '8px' } }, [
                React.createElement(RefComponent, {
                    key: 'trigger-socket',
                    init: ref => emit({ type: 'render', data: { type: 'socket', side: 'input', key: 'trigger', nodeId: data.id, element: ref, payload: triggerInput.socket } })
                }),
                React.createElement('span', { key: 'trigger-label', style: labelStyle }, [
                    'Trigger',
                    HelpIcon && React.createElement(HelpIcon, { key: 'help', text: tooltips.inputs.trigger, size: 10 })
                ])
            ]),

            // Value display
            React.createElement('div', { key: 'value-display', style: valueDisplayStyle }, [
                React.createElement('span', { key: 'value', style: valueStyle }, displayValue)
            ]),

            // Generation count
            React.createElement('div', { key: 'stats', style: statsStyle }, 
                `Generated: ${props.generationCount} times`
            ),

            // Min value
            React.createElement('div', { key: 'min-row', style: rowStyle }, [
                React.createElement('span', { key: 'label', style: labelStyle }, [
                    'Min:',
                    HelpIcon && React.createElement(HelpIcon, { key: 'help', text: tooltips.controls.min, size: 10 })
                ]),
                React.createElement('input', {
                    key: 'input',
                    type: 'number',
                    value: props.min,
                    onChange: handleMinChange,
                    onPointerDown: stopPropagation,
                    style: inputStyle
                })
            ]),

            // Max value
            React.createElement('div', { key: 'max-row', style: rowStyle }, [
                React.createElement('span', { key: 'label', style: labelStyle }, [
                    'Max:',
                    HelpIcon && React.createElement(HelpIcon, { key: 'help', text: tooltips.controls.max, size: 10 })
                ]),
                React.createElement('input', {
                    key: 'input',
                    type: 'number',
                    value: props.max,
                    onChange: handleMaxChange,
                    onPointerDown: stopPropagation,
                    style: inputStyle
                })
            ]),

            // Integer checkbox
            React.createElement('div', { 
                key: 'integer-row', 
                style: checkboxRowStyle,
                onClick: handleIntegerToggle,
                onPointerDown: stopPropagation
            }, [
                React.createElement('span', { key: 'label', style: labelStyle }, [
                    'Integer only',
                    HelpIcon && React.createElement(HelpIcon, { key: 'help', text: tooltips.controls.integer, size: 10 })
                ]),
                React.createElement('input', {
                    key: 'checkbox',
                    type: 'checkbox',
                    checked: props.integer,
                    readOnly: true,
                    style: checkboxStyle
                })
            ]),

            // Continuous checkbox
            React.createElement('div', { 
                key: 'continuous-row', 
                style: checkboxRowStyle,
                onClick: handleContinuousToggle,
                onPointerDown: stopPropagation
            }, [
                React.createElement('span', { key: 'label', style: labelStyle }, [
                    'Continuous',
                    HelpIcon && React.createElement(HelpIcon, { key: 'help', text: tooltips.controls.continuous, size: 10 })
                ]),
                React.createElement('input', {
                    key: 'checkbox',
                    type: 'checkbox',
                    checked: props.continuous,
                    readOnly: true,
                    style: checkboxStyle
                })
            ]),

            // Generate button
            React.createElement('button', {
                key: 'generate-btn',
                onClick: handleGenerate,
                onPointerDown: stopPropagation,
                style: buttonStyle
            }, '🎲 Generate'),

            // Output sockets
            React.createElement('div', { 
                key: 'outputs',
                style: { marginTop: '12px', borderTop: `1px solid ${THEME.border}`, paddingTop: '8px' }
            }, [
                valueOutput && React.createElement('div', { key: 'value-out', style: { ...rowStyle, justifyContent: 'flex-end' } }, [
                    React.createElement('span', { key: 'label', style: labelStyle }, 'Value'),
                    React.createElement(RefComponent, {
                        key: 'value-socket',
                        init: ref => emit({ type: 'render', data: { type: 'socket', side: 'output', key: 'value', nodeId: data.id, element: ref, payload: valueOutput.socket } })
                    })
                ]),
                normalizedOutput && React.createElement('div', { key: 'norm-out', style: { ...rowStyle, justifyContent: 'flex-end' } }, [
                    React.createElement('span', { key: 'label', style: labelStyle }, 'Normalized'),
                    React.createElement(RefComponent, {
                        key: 'norm-socket',
                        init: ref => emit({ type: 'render', data: { type: 'socket', side: 'output', key: 'normalized', nodeId: data.id, element: ref, payload: normalizedOutput.socket } })
                    })
                ])
            ])
        ]);
    }

    // -------------------------------------------------------------------------
    // REGISTRATION
    // -------------------------------------------------------------------------
    if (window.nodeRegistry) {
        window.nodeRegistry.register('RandomNode', {
            label: "Random",
            category: "Utility",
            nodeClass: RandomNode,
            component: RandomNodeComponent,
            factory: (cb) => new RandomNode(cb)
        });
    }
})();
