// ============================================================================
// TriggerNode.js - Trigger/One-Shot Node (Node-RED Style)
// Outputs a value, waits, then outputs another (or resets)
// ============================================================================

(function() {
    // Dependency checks
    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets) {
        console.error("[TriggerNode] Missing core dependencies");
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
    
    // Get category-specific accent (Timer/Event = purple)
    const CATEGORY = THEME.getCategory ? THEME.getCategory('Timer/Event') : {
        accent: '#ce93d8',
        accentRgba: (a) => `rgba(206, 147, 216, ${a})`,
        headerBg: 'rgba(206, 147, 216, 0.15)',
        border: 'rgba(206, 147, 216, 0.4)'
    };
    
    const NodeHeader = T2Controls.NodeHeader;
    const HelpIcon = T2Controls.HelpIcon;

    const stopPropagation = (e) => e.stopPropagation();

    // Tooltip definitions
    const tooltips = {
        node: "Trigger Node: When triggered, outputs the first value immediately, waits for a duration, then outputs the second value. Perfect for one-shot pulses, timed resets, or 'on-then-off' sequences.",
        inputs: {
            trigger: "Any value triggers the sequence. True/rising edge starts the timer.",
            reset: "Cancels any running timer and immediately outputs the 'then' value."
        },
        outputs: {
            output: "Outputs 'send' value immediately, then 'then' value after the wait period."
        },
        controls: {
            send: "First value to output immediately when triggered.",
            wait: "Duration to wait before outputting the second value.",
            then: "Second value to output after the wait period. 'nothing' means don't output anything."
        }
    };

    // -------------------------------------------------------------------------
    // NODE CLASS
    // -------------------------------------------------------------------------
    class TriggerNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("Trigger");
            this.width = 240;
            this.changeCallback = changeCallback;

            this.properties = {
                sendValue: true,
                sendType: 'boolean', // 'boolean', 'number', 'string'
                waitMs: 1000,
                thenValue: false,
                thenType: 'boolean', // 'boolean', 'number', 'string', 'nothing'
                extend: false, // If true, retrigger extends the wait time
                isActive: false,
                countdown: 0,
                currentOutput: null,
                triggerCount: 0,
                debug: false
            };

            this._timerId = null;
            this._startTime = null;
            this._countdownInterval = null;
            this._lastTrigger = false;

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
            this.addOutput("output", new ClassicPreset.Output(
                sockets.any || new ClassicPreset.Socket('any'),
                "Output"
            ));
        }

        _getValue(type, value) {
            switch (type) {
                case 'boolean':
                    return Boolean(value);
                case 'number':
                    return Number(value) || 0;
                case 'string':
                    return String(value);
                case 'nothing':
                    return undefined;
                default:
                    return value;
            }
        }

        _startTimer() {
            this._clearTimer();
            
            const props = this.properties;
            props.isActive = true;
            props.countdown = props.waitMs;
            this._startTime = Date.now();

            // Countdown display
            this._countdownInterval = setInterval(() => {
                const elapsed = Date.now() - this._startTime;
                props.countdown = Math.max(0, props.waitMs - elapsed);
                if (this.changeCallback) this.changeCallback();
            }, 100);

            // Main timer
            this._timerId = setTimeout(() => {
                this._onTimerComplete();
            }, props.waitMs);
        }

        _clearTimer() {
            if (this._timerId) {
                clearTimeout(this._timerId);
                this._timerId = null;
            }
            if (this._countdownInterval) {
                clearInterval(this._countdownInterval);
                this._countdownInterval = null;
            }
        }

        _onTimerComplete() {
            const props = this.properties;
            this._clearTimer();
            props.isActive = false;
            props.countdown = 0;

            // Output the "then" value
            if (props.thenType !== 'nothing') {
                props.currentOutput = this._getValue(props.thenType, props.thenValue);
            }
            
            if (this.changeCallback) this.changeCallback();
        }

        _reset() {
            const props = this.properties;
            this._clearTimer();
            props.isActive = false;
            props.countdown = 0;
            
            // Output the "then" value immediately
            if (props.thenType !== 'nothing') {
                props.currentOutput = this._getValue(props.thenType, props.thenValue);
            }
            
            if (this.changeCallback) this.changeCallback();
        }

        data(inputs) {
            const trigger = inputs.trigger?.[0];
            const reset = inputs.reset?.[0];
            const props = this.properties;

            // Handle reset input
            if (reset === true) {
                this._reset();
                return { output: props.currentOutput };
            }

            // Detect rising edge on trigger
            const isRisingEdge = trigger && !this._lastTrigger;
            this._lastTrigger = Boolean(trigger);

            if (isRisingEdge) {
                props.triggerCount++;
                
                if (props.isActive && props.extend) {
                    // Extend the timer
                    this._startTimer();
                } else if (!props.isActive) {
                    // Start new sequence
                    props.currentOutput = this._getValue(props.sendType, props.sendValue);
                    this._startTimer();
                    if (this.changeCallback) this.changeCallback();
                }
            }

            return { output: props.currentOutput };
        }

        restore(state) {
            if (state.properties) {
                this.properties.sendValue = state.properties.sendValue ?? true;
                this.properties.sendType = state.properties.sendType || 'boolean';
                this.properties.waitMs = state.properties.waitMs || 1000;
                this.properties.thenValue = state.properties.thenValue ?? false;
                this.properties.thenType = state.properties.thenType || 'boolean';
                this.properties.extend = state.properties.extend ?? false;
            }
            // Reset runtime state
            this.properties.isActive = false;
            this.properties.countdown = 0;
            this.properties.currentOutput = null;
            this.properties.triggerCount = 0;
        }

        destroy() {
            this._clearTimer();
        }
    }

    // -------------------------------------------------------------------------
    // REACT COMPONENT
    // -------------------------------------------------------------------------
    function TriggerNodeComponent({ data, emit }) {
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

        useEffect(() => {
            return () => {
                if (data._clearTimer) data._clearTimer();
            };
        }, [data]);

        // Styles
        const containerStyle = {
            padding: '12px',
            background: `linear-gradient(135deg, ${THEME.background} 0%, ${THEME.surface} 100%)`,
            borderRadius: '8px',
            fontFamily: 'monospace',
            minWidth: '220px'
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

        const selectStyle = {
            background: THEME.surface,
            border: `1px solid ${THEME.border}`,
            borderRadius: '4px',
            color: THEME.text,
            padding: '4px 8px',
            fontSize: '11px',
            width: '80px'
        };

        const inputStyle = {
            ...selectStyle,
            width: '60px'
        };

        const sectionStyle = {
            padding: '8px',
            background: THEME.surfaceLight,
            borderRadius: '4px',
            marginBottom: '8px'
        };

        const statusStyle = {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '8px',
            background: props.isActive 
                ? `${THEME.warning}22`
                : THEME.surfaceLight,
            borderRadius: '4px',
            marginBottom: '8px'
        };

        const countdownStyle = {
            fontSize: '16px',
            fontWeight: 'bold',
            color: props.isActive ? THEME.warning : THEME.textMuted
        };

        const socketContainerStyle = {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginTop: '12px'
        };

        const socketRowStyle = {
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
        };

        return React.createElement('div', { style: containerStyle },
            // Header
            NodeHeader ? React.createElement(NodeHeader, {
                icon: '⚡',
                title: 'Trigger',
                tooltip: tooltips.node,
                statusDot: true,
                statusColor: props.isActive ? THEME.warning : '#555'
            }) : React.createElement('div', { style: { marginBottom: '8px' } },
                React.createElement('span', { style: { color: THEME.primary, fontWeight: 'bold' } }, '⚡ Trigger')
            ),

            // Countdown Display
            React.createElement('div', { style: statusStyle },
                React.createElement('span', { style: countdownStyle },
                    props.isActive 
                        ? `${(props.countdown / 1000).toFixed(1)}s`
                        : 'Ready'
                )
            ),

            // Send Section
            React.createElement('div', { style: sectionStyle },
                React.createElement('div', { style: { ...labelStyle, marginBottom: '6px' } }, 
                    'Send',
                    HelpIcon && React.createElement(HelpIcon, { text: tooltips.controls.send, size: 10 })
                ),
                React.createElement('div', { style: rowStyle },
                    React.createElement('select', {
                        style: selectStyle,
                        value: props.sendType,
                        onChange: (e) => {
                            props.sendType = e.target.value;
                            if (e.target.value === 'boolean') props.sendValue = true;
                            else if (e.target.value === 'number') props.sendValue = 1;
                            else props.sendValue = 'on';
                            forceUpdate(n => n + 1);
                        },
                        onPointerDown: stopPropagation
                    },
                        React.createElement('option', { value: 'boolean' }, 'Boolean'),
                        React.createElement('option', { value: 'number' }, 'Number'),
                        React.createElement('option', { value: 'string' }, 'String')
                    ),
                    props.sendType === 'boolean' && React.createElement('select', {
                        style: inputStyle,
                        value: String(props.sendValue),
                        onChange: (e) => {
                            props.sendValue = e.target.value === 'true';
                            forceUpdate(n => n + 1);
                        },
                        onPointerDown: stopPropagation
                    },
                        React.createElement('option', { value: 'true' }, 'true'),
                        React.createElement('option', { value: 'false' }, 'false')
                    ),
                    props.sendType === 'number' && React.createElement('input', {
                        type: 'number',
                        style: inputStyle,
                        value: props.sendValue,
                        onChange: (e) => {
                            props.sendValue = Number(e.target.value) || 0;
                            forceUpdate(n => n + 1);
                        },
                        onPointerDown: stopPropagation
                    }),
                    props.sendType === 'string' && React.createElement('input', {
                        type: 'text',
                        style: inputStyle,
                        value: props.sendValue,
                        onChange: (e) => {
                            props.sendValue = e.target.value;
                            forceUpdate(n => n + 1);
                        },
                        onPointerDown: stopPropagation
                    })
                )
            ),

            // Wait Duration
            React.createElement('div', { style: rowStyle },
                React.createElement('span', { style: labelStyle }, 
                    'Wait',
                    HelpIcon && React.createElement(HelpIcon, { text: tooltips.controls.wait, size: 10 })
                ),
                React.createElement('input', {
                    type: 'number',
                    style: inputStyle,
                    value: props.waitMs,
                    onChange: (e) => {
                        props.waitMs = Math.max(100, parseInt(e.target.value) || 1000);
                        forceUpdate(n => n + 1);
                    },
                    onPointerDown: stopPropagation,
                    min: 100,
                    step: 100
                }),
                React.createElement('span', { style: { fontSize: '10px', color: 'rgba(255,255,255,0.5)' } }, 'ms')
            ),

            // Then Section
            React.createElement('div', { style: sectionStyle },
                React.createElement('div', { style: { ...labelStyle, marginBottom: '6px' } }, 
                    'Then',
                    HelpIcon && React.createElement(HelpIcon, { text: tooltips.controls.then, size: 10 })
                ),
                React.createElement('div', { style: rowStyle },
                    React.createElement('select', {
                        style: selectStyle,
                        value: props.thenType,
                        onChange: (e) => {
                            props.thenType = e.target.value;
                            if (e.target.value === 'boolean') props.thenValue = false;
                            else if (e.target.value === 'number') props.thenValue = 0;
                            else if (e.target.value === 'string') props.thenValue = 'off';
                            forceUpdate(n => n + 1);
                        },
                        onPointerDown: stopPropagation
                    },
                        React.createElement('option', { value: 'boolean' }, 'Boolean'),
                        React.createElement('option', { value: 'number' }, 'Number'),
                        React.createElement('option', { value: 'string' }, 'String'),
                        React.createElement('option', { value: 'nothing' }, 'Nothing')
                    ),
                    props.thenType === 'boolean' && React.createElement('select', {
                        style: inputStyle,
                        value: String(props.thenValue),
                        onChange: (e) => {
                            props.thenValue = e.target.value === 'true';
                            forceUpdate(n => n + 1);
                        },
                        onPointerDown: stopPropagation
                    },
                        React.createElement('option', { value: 'true' }, 'true'),
                        React.createElement('option', { value: 'false' }, 'false')
                    ),
                    props.thenType === 'number' && React.createElement('input', {
                        type: 'number',
                        style: inputStyle,
                        value: props.thenValue,
                        onChange: (e) => {
                            props.thenValue = Number(e.target.value) || 0;
                            forceUpdate(n => n + 1);
                        },
                        onPointerDown: stopPropagation
                    }),
                    props.thenType === 'string' && React.createElement('input', {
                        type: 'text',
                        style: inputStyle,
                        value: props.thenValue,
                        onChange: (e) => {
                            props.thenValue = e.target.value;
                            forceUpdate(n => n + 1);
                        },
                        onPointerDown: stopPropagation
                    })
                )
            ),

            // Extend checkbox
            React.createElement('div', { style: rowStyle },
                React.createElement('label', { style: { ...labelStyle, cursor: 'pointer' } },
                    React.createElement('input', {
                        type: 'checkbox',
                        checked: props.extend,
                        onChange: (e) => {
                            props.extend = e.target.checked;
                            forceUpdate(n => n + 1);
                        },
                        onPointerDown: stopPropagation,
                        style: { marginRight: '6px' }
                    }),
                    'Extend on retrigger'
                )
            ),

            // Stats
            React.createElement('div', { style: { fontSize: '10px', color: 'rgba(255,255,255,0.4)', textAlign: 'center' } },
                `Triggered: ${props.triggerCount} times`
            ),

            // Sockets - iterate over data.inputs and data.outputs for proper rendering
            React.createElement('div', { style: socketContainerStyle },
                // Inputs
                React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
                    Object.entries(data.inputs).map(([key, input]) =>
                        React.createElement('div', { key, style: socketRowStyle },
                            React.createElement(RefComponent, {
                                init: (ref) => emit({ type: 'render', data: { type: 'socket', side: 'input', key, nodeId: data.id, element: ref, payload: input.socket } }),
                                unmount: (ref) => emit({ type: 'unmount', data: { element: ref } })
                            }),
                            React.createElement('span', { style: { fontSize: '10px', color: THEME.text } }, input.label || key)
                        )
                    )
                ),
                // Outputs
                React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' } },
                    Object.entries(data.outputs).map(([key, output]) =>
                        React.createElement('div', { key, style: socketRowStyle },
                            React.createElement('span', { style: { fontSize: '10px', color: THEME.text } }, output.label || key),
                            React.createElement(RefComponent, {
                                init: (ref) => emit({ type: 'render', data: { type: 'socket', side: 'output', key, nodeId: data.id, element: ref, payload: output.socket } }),
                                unmount: (ref) => emit({ type: 'unmount', data: { element: ref } })
                            })
                        )
                    )
                )
            )
        );
    }

    // -------------------------------------------------------------------------
    // REGISTER
    // -------------------------------------------------------------------------
    if (window.nodeRegistry) {
        window.nodeRegistry.register('TriggerNode', {
            label: "Trigger",
            category: "Timer/Event",
            nodeClass: TriggerNode,
            component: TriggerNodeComponent,
            factory: (cb) => new TriggerNode(cb)
        });
    }
})();
