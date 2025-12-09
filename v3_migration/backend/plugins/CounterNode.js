// ============================================================================
// CounterNode.js - Counter Node (Node-RED Style)
// Count incoming messages, reset on trigger or threshold
// ============================================================================

(function() {
    // Dependency checks
    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets) {
        console.error("[CounterNode] Missing core dependencies");
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
        node: "Counter Node: Counts incoming trigger signals. Outputs the current count. Can auto-reset when reaching a threshold, or manually reset via the reset input.",
        inputs: {
            trigger: "Each truthy value increments the counter by 1 (or by step amount).",
            reset: "Any truthy value resets the counter to the initial value."
        },
        outputs: {
            count: "Current counter value.",
            threshold: "Pulses TRUE when the counter reaches the threshold value."
        },
        controls: {
            initial: "Starting value when reset (default: 0).",
            step: "Amount to add on each trigger (can be negative to count down).",
            threshold: "When count reaches this value, output a pulse and optionally auto-reset.",
            autoReset: "If enabled, counter resets to initial value when threshold is reached."
        }
    };

    // -------------------------------------------------------------------------
    // NODE CLASS
    // -------------------------------------------------------------------------
    class CounterNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("Counter");
            this.width = 220;
            this.changeCallback = changeCallback;

            this.properties = {
                count: 0,
                initial: 0,
                step: 1,
                threshold: 10,
                autoReset: false,
                thresholdReached: false,
                lastTriggerValue: false,
                debug: false
            };

            // Inputs
            this.addInput("trigger", new ClassicPreset.Input(
                sockets.any || new ClassicPreset.Socket('any'),
                "Trigger"
            ));
            this.addInput("reset", new ClassicPreset.Input(
                sockets.boolean || new ClassicPreset.Socket('boolean'),
                "Reset"
            ));

            // Outputs
            this.addOutput("count", new ClassicPreset.Output(
                sockets.number || new ClassicPreset.Socket('number'),
                "Count"
            ));
            this.addOutput("threshold", new ClassicPreset.Output(
                sockets.boolean || new ClassicPreset.Socket('boolean'),
                "Threshold"
            ));
        }

        reset() {
            this.properties.count = this.properties.initial;
            this.properties.thresholdReached = false;
            if (this.changeCallback) this.changeCallback();
        }

        data(inputs) {
            const props = this.properties;
            const trigger = inputs.trigger?.[0];
            const resetSignal = inputs.reset?.[0];

            // Handle reset input
            if (resetSignal) {
                props.count = props.initial;
                props.thresholdReached = false;
                props.lastTriggerValue = false;
                if (this.changeCallback) this.changeCallback();
                return { count: props.count, threshold: false };
            }

            // Detect rising edge on trigger (only count on transition to truthy)
            const triggerActive = Boolean(trigger);
            const wasActive = props.lastTriggerValue;
            props.lastTriggerValue = triggerActive;

            if (triggerActive && !wasActive) {
                // Increment counter
                props.count += props.step;

                // Check threshold
                if (props.count >= props.threshold) {
                    props.thresholdReached = true;
                    
                    if (props.autoReset) {
                        // Reset after a brief delay to allow threshold output to be read
                        setTimeout(() => {
                            props.count = props.initial;
                            props.thresholdReached = false;
                            if (this.changeCallback) this.changeCallback();
                        }, 100);
                    }
                }

                if (this.changeCallback) this.changeCallback();
            }

            return { 
                count: props.count, 
                threshold: props.thresholdReached 
            };
        }

        restore(state) {
            if (state.properties) {
                // Restore configuration
                this.properties.initial = state.properties.initial ?? 0;
                this.properties.step = state.properties.step ?? 1;
                this.properties.threshold = state.properties.threshold ?? 10;
                this.properties.autoReset = state.properties.autoReset ?? false;
            }
            // Reset runtime state
            this.properties.count = this.properties.initial;
            this.properties.thresholdReached = false;
            this.properties.lastTriggerValue = false;
        }

        serialize() {
            return {
                initial: this.properties.initial,
                step: this.properties.step,
                threshold: this.properties.threshold,
                autoReset: this.properties.autoReset
            };
        }
    }

    // -------------------------------------------------------------------------
    // REACT COMPONENT
    // -------------------------------------------------------------------------
    function CounterNodeComponent({ data, emit }) {
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

        const handleInitialChange = useCallback((e) => {
            props.initial = parseInt(e.target.value) || 0;
            forceUpdate(n => n + 1);
        }, [props]);

        const handleStepChange = useCallback((e) => {
            props.step = parseInt(e.target.value) || 1;
            forceUpdate(n => n + 1);
        }, [props]);

        const handleThresholdChange = useCallback((e) => {
            props.threshold = parseInt(e.target.value) || 10;
            forceUpdate(n => n + 1);
        }, [props]);

        const handleAutoResetToggle = useCallback(() => {
            props.autoReset = !props.autoReset;
            forceUpdate(n => n + 1);
        }, [props]);

        const handleReset = useCallback(() => {
            if (data.reset) data.reset();
        }, [data]);

        // Status indicator
        const statusColor = props.thresholdReached ? THEME.warning : 
                           props.count > 0 ? THEME.success : THEME.textMuted;

        // Styles
        const containerStyle = {
            padding: '12px',
            background: `linear-gradient(135deg, ${THEME.background} 0%, ${THEME.surface} 100%)`,
            borderRadius: '8px',
            fontFamily: 'monospace',
            minWidth: '200px'
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

        const countDisplayStyle = {
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '12px',
            margin: '8px 0',
            background: props.thresholdReached 
                ? `${THEME.warning}22`
                : THEME.surfaceLight,
            borderRadius: '8px',
            border: `1px solid ${props.thresholdReached ? THEME.warning : THEME.border}`
        };

        const countValueStyle = {
            fontSize: '28px',
            fontWeight: 'bold',
            color: props.thresholdReached ? THEME.warning : THEME.primary
        };

        const buttonStyle = {
            background: THEME.primaryRgba(0.2),
            border: `1px solid ${THEME.border}`,
            borderRadius: '4px',
            color: THEME.text,
            padding: '6px 12px',
            fontSize: '11px',
            cursor: 'pointer',
            width: '100%'
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

        // Get input socket
        const triggerInput = data.inputs?.trigger;
        const resetInput = data.inputs?.reset;
        const countOutput = data.outputs?.count;
        const thresholdOutput = data.outputs?.threshold;

        return React.createElement('div', { style: containerStyle }, [
            // Header
            NodeHeader 
                ? React.createElement(NodeHeader, {
                    key: 'header',
                    icon: '🔢',
                    title: 'Counter',
                    tooltip: tooltips.node,
                    statusDot: true,
                    statusColor: statusColor
                })
                : React.createElement('div', { key: 'header', style: headerStyle }, [
                    React.createElement('span', { key: 'icon', style: { fontSize: '16px' } }, '🔢'),
                    React.createElement('span', { key: 'title', style: { color: THEME.text, fontWeight: 'bold', flex: 1 } }, 'Counter'),
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
            triggerInput && React.createElement('div', { key: 'trigger-row', style: { ...rowStyle, marginBottom: '4px' } }, [
                React.createElement(RefComponent, {
                    key: 'trigger-socket',
                    init: ref => emit({ type: 'render', data: { type: 'socket', side: 'input', key: 'trigger', nodeId: data.id, element: ref, payload: triggerInput.socket } })
                }),
                React.createElement('span', { key: 'trigger-label', style: labelStyle }, [
                    'Trigger',
                    HelpIcon && React.createElement(HelpIcon, { key: 'help', text: tooltips.inputs.trigger, size: 10 })
                ])
            ]),

            // Reset input socket
            resetInput && React.createElement('div', { key: 'reset-row', style: { ...rowStyle, marginBottom: '8px' } }, [
                React.createElement(RefComponent, {
                    key: 'reset-socket',
                    init: ref => emit({ type: 'render', data: { type: 'socket', side: 'input', key: 'reset', nodeId: data.id, element: ref, payload: resetInput.socket } })
                }),
                React.createElement('span', { key: 'reset-label', style: labelStyle }, [
                    'Reset',
                    HelpIcon && React.createElement(HelpIcon, { key: 'help', text: tooltips.inputs.reset, size: 10 })
                ])
            ]),

            // Count display
            React.createElement('div', { key: 'count-display', style: countDisplayStyle }, [
                React.createElement('span', { key: 'value', style: countValueStyle }, props.count)
            ]),

            // Initial value
            React.createElement('div', { key: 'initial-row', style: rowStyle }, [
                React.createElement('span', { key: 'label', style: labelStyle }, [
                    'Initial:',
                    HelpIcon && React.createElement(HelpIcon, { key: 'help', text: tooltips.controls.initial, size: 10 })
                ]),
                React.createElement('input', {
                    key: 'input',
                    type: 'number',
                    value: props.initial,
                    onChange: handleInitialChange,
                    onPointerDown: stopPropagation,
                    style: inputStyle
                })
            ]),

            // Step value
            React.createElement('div', { key: 'step-row', style: rowStyle }, [
                React.createElement('span', { key: 'label', style: labelStyle }, [
                    'Step:',
                    HelpIcon && React.createElement(HelpIcon, { key: 'help', text: tooltips.controls.step, size: 10 })
                ]),
                React.createElement('input', {
                    key: 'input',
                    type: 'number',
                    value: props.step,
                    onChange: handleStepChange,
                    onPointerDown: stopPropagation,
                    style: inputStyle
                })
            ]),

            // Threshold value
            React.createElement('div', { key: 'threshold-row', style: rowStyle }, [
                React.createElement('span', { key: 'label', style: labelStyle }, [
                    'Threshold:',
                    HelpIcon && React.createElement(HelpIcon, { key: 'help', text: tooltips.controls.threshold, size: 10 })
                ]),
                React.createElement('input', {
                    key: 'input',
                    type: 'number',
                    value: props.threshold,
                    onChange: handleThresholdChange,
                    onPointerDown: stopPropagation,
                    style: inputStyle
                })
            ]),

            // Auto-reset checkbox
            React.createElement('div', { 
                key: 'autoreset-row', 
                style: checkboxRowStyle,
                onClick: handleAutoResetToggle,
                onPointerDown: stopPropagation
            }, [
                React.createElement('span', { key: 'label', style: labelStyle }, [
                    'Auto-reset at threshold',
                    HelpIcon && React.createElement(HelpIcon, { key: 'help', text: tooltips.controls.autoReset, size: 10 })
                ]),
                React.createElement('input', {
                    key: 'checkbox',
                    type: 'checkbox',
                    checked: props.autoReset,
                    readOnly: true,
                    style: checkboxStyle
                })
            ]),

            // Manual reset button
            React.createElement('button', {
                key: 'reset-btn',
                onClick: handleReset,
                onPointerDown: stopPropagation,
                style: buttonStyle
            }, 'Reset'),

            // Output sockets
            React.createElement('div', { 
                key: 'outputs',
                style: { marginTop: '12px', borderTop: `1px solid ${THEME.border}`, paddingTop: '8px' }
            }, [
                // Count output
                countOutput && React.createElement('div', { key: 'count-out', style: { ...rowStyle, justifyContent: 'flex-end' } }, [
                    React.createElement('span', { key: 'label', style: labelStyle }, 'Count'),
                    React.createElement(RefComponent, {
                        key: 'count-socket',
                        init: ref => emit({ type: 'render', data: { type: 'socket', side: 'output', key: 'count', nodeId: data.id, element: ref, payload: countOutput.socket } })
                    })
                ]),
                // Threshold output
                thresholdOutput && React.createElement('div', { key: 'threshold-out', style: { ...rowStyle, justifyContent: 'flex-end' } }, [
                    React.createElement('span', { key: 'label', style: labelStyle }, 'Threshold'),
                    React.createElement(RefComponent, {
                        key: 'threshold-socket',
                        init: ref => emit({ type: 'render', data: { type: 'socket', side: 'output', key: 'threshold', nodeId: data.id, element: ref, payload: thresholdOutput.socket } })
                    })
                ])
            ])
        ]);
    }

    // -------------------------------------------------------------------------
    // REGISTRATION
    // -------------------------------------------------------------------------
    if (window.nodeRegistry) {
        window.nodeRegistry.register('CounterNode', {
            label: "Counter",
            category: "Utility",
            nodeClass: CounterNode,
            component: CounterNodeComponent,
            factory: (cb) => new CounterNode(cb)
        });
    }
})();
