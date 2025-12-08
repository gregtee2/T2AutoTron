// ============================================================================
// DelayNode.js - Delay, Debounce, Throttle, and Retriggerable Timer Node
// Provides time-based signal control for robust automations
// ============================================================================

(function() {
    // Dependency checks
    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets) {
        console.error("[DelayNode] Missing core dependencies");
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect } = React;
    const RefComponent = window.RefComponent;
    const sockets = window.sockets;

    // Get shared theme
    const T2Controls = window.T2Controls || {};
    const THEME = T2Controls.THEME || {
        primary: '#00f3ff',
        primaryRgba: (a) => `rgba(0, 243, 255, ${a})`,
        border: 'rgba(0, 243, 255, 0.3)',
        success: '#00ff88',
        warning: '#ffaa00',
        error: '#ff4444',
        background: '#0a0f14',
        text: '#e0f7fa'
    };

    const stopPropagation = (e) => e.stopPropagation();

    // -------------------------------------------------------------------------
    // NODE CLASS
    // -------------------------------------------------------------------------
    class DelayNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("Delay");
            this.width = 260;
            this.changeCallback = changeCallback;

            this.properties = {
                delayMs: 1000,
                mode: 'delay',
                isActive: false,
                countdown: 0,
                lastInputValue: false,
                outputValue: false,
                passthroughValue: null,
                debug: false
            };

            // Timer management
            this._timerId = null;
            this._throttleLastFire = 0;
            this._startTime = null;
            this._countdownInterval = null;

            // Inputs
            this.addInput("trigger", new ClassicPreset.Input(
                sockets.boolean || new ClassicPreset.Socket('boolean'),
                "Trigger"
            ));
            this.addInput("value", new ClassicPreset.Input(
                sockets.any || new ClassicPreset.Socket('any'),
                "Value"
            ));

            // Outputs
            this.addOutput("delayed", new ClassicPreset.Output(
                sockets.boolean || new ClassicPreset.Socket('boolean'),
                "Delayed"
            ));
            this.addOutput("passthrough", new ClassicPreset.Output(
                sockets.any || new ClassicPreset.Socket('any'),
                "Passthrough"
            ));
        }

        data(inputs) {
            const trigger = inputs.trigger?.[0];
            const valueInput = inputs.value?.[0];
            
            // Determine what value to pass through
            // If "Value" input is connected, use that; otherwise use trigger value
            const valueToPass = valueInput !== undefined ? valueInput : trigger;
            
            // Detect edges (changes in trigger state)
            const triggerChanged = trigger !== this.properties.lastInputValue;
            const isRisingEdge = trigger && !this.properties.lastInputValue;
            const isFallingEdge = !trigger && this.properties.lastInputValue;
            
            this.properties.lastInputValue = trigger;
            
            // Process based on mode
            if (triggerChanged) {
                this._processTrigger(trigger, valueToPass);
            }
            
            return {
                delayed: this.properties.outputValue,
                passthrough: this.properties.passthroughValue
            };
        }

        _log(msg) {
            if (this.properties.debug) console.log(`[DelayNode] ${msg}`);
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

        _startCountdown(durationMs) {
            this._startTime = Date.now();
            this.properties.isActive = true;
            this.properties.countdown = durationMs;
            
            if (this._countdownInterval) clearInterval(this._countdownInterval);
            
            this._countdownInterval = setInterval(() => {
                const elapsed = Date.now() - this._startTime;
                this.properties.countdown = Math.max(0, durationMs - elapsed);
                if (this.changeCallback) this.changeCallback();
            }, 100);
        }

        _fireOutput(value, passthrough) {
            this._log(`Firing output: ${value}, passthrough: ${passthrough}`);
            this._clearTimer();
            this.properties.outputValue = value;
            this.properties.passthroughValue = passthrough;
            this.properties.isActive = false;
            this.properties.countdown = 0;
            if (this.changeCallback) this.changeCallback();
        }

        _processTrigger(triggerValue, valueToPass) {
            const delay = this.properties.delayMs;
            const mode = this.properties.mode;
            
            this._log(`Trigger: ${triggerValue}, value: ${valueToPass}, mode: ${mode}, delay: ${delay}ms`);

            switch (mode) {
                case 'delay':
                    // Node-RED style: wait, then pass the value through (no pulse)
                    // Each message queued independently
                    this._clearTimer();
                    this._startCountdown(delay);
                    this._timerId = setTimeout(() => {
                        // Pass the actual trigger value through (true or false)
                        this._fireOutput(triggerValue, valueToPass);
                    }, delay);
                    break;

                case 'debounce':
                    // Reset timer on each trigger, fire after silence
                    // Pass the last value received
                    this._clearTimer();
                    this._startCountdown(delay);
                    this._timerId = setTimeout(() => {
                        this._fireOutput(triggerValue, valueToPass);
                    }, delay);
                    break;

                case 'throttle':
                    // Immediate pass-through, then block for delay period
                    const now = Date.now();
                    if (now - this._throttleLastFire >= delay) {
                        this._throttleLastFire = now;
                        this._fireOutput(triggerValue, valueToPass);
                    } else {
                        this._log(`Throttled - ${delay - (now - this._throttleLastFire)}ms remaining`);
                    }
                    break;

                case 'retriggerable':
                    // Output ON immediately on rising edge, restart off-timer
                    // On falling edge, just restart the timer (don't turn off immediately)
                    this._clearTimer();
                    
                    if (triggerValue) {
                        // Rising edge: turn ON immediately
                        this.properties.outputValue = true;
                        this.properties.passthroughValue = valueToPass;
                        if (this.changeCallback) this.changeCallback();
                    }
                    
                    // Start/restart the off-timer
                    this._startCountdown(delay);
                    this._timerId = setTimeout(() => {
                        this._fireOutput(false, null);
                    }, delay);
                    break;
            }
        }

        manualTrigger() {
            this._processTrigger(true, { manual: true });
        }

        cancel() {
            this._clearTimer();
            this.properties.isActive = false;
            this.properties.outputValue = false;
            this.properties.passthroughValue = null;
            this.properties.countdown = 0;
            if (this.changeCallback) this.changeCallback();
        }

        restore(state) {
            if (state.properties) {
                this.properties.delayMs = state.properties.delayMs ?? 1000;
                this.properties.mode = state.properties.mode ?? 'delay';
                this.properties.debug = state.properties.debug ?? false;
                this.properties.isActive = false;
                this.properties.countdown = 0;
                this.properties.outputValue = false;
            }
        }

        serialize() {
            return {
                delayMs: this.properties.delayMs,
                mode: this.properties.mode,
                debug: this.properties.debug
            };
        }

        toJSON() {
            return { id: this.id, label: this.label, properties: this.serialize() };
        }
    }

    // -------------------------------------------------------------------------
    // COMPONENT
    // -------------------------------------------------------------------------
    function DelayNodeComponent({ data, emit }) {
        const [delayMs, setDelayMs] = useState(data.properties.delayMs);
        const [mode, setMode] = useState(data.properties.mode);
        const [isActive, setIsActive] = useState(data.properties.isActive);
        const [countdown, setCountdown] = useState(data.properties.countdown);
        const [outputState, setOutputState] = useState(data.properties.outputValue);
        const [debug, setDebug] = useState(data.properties.debug);

        // Get tooltip components from T2Controls
        const { NodeHeader, LabeledRow, HelpIcon, Tooltip } = window.T2Controls || {};

        // Sync with node state
        useEffect(() => {
            const originalCallback = data.changeCallback;
            data.changeCallback = () => {
                setDelayMs(data.properties.delayMs);
                setMode(data.properties.mode);
                setIsActive(data.properties.isActive);
                setCountdown(data.properties.countdown);
                setOutputState(data.properties.outputValue);
                setDebug(data.properties.debug);
                if (originalCallback) originalCallback();
            };
            return () => { data.changeCallback = originalCallback; };
        }, [data]);

        const formatTime = (ms) => {
            if (ms >= 60000) return `${(ms / 60000).toFixed(1)}m`;
            if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
            return `${ms}ms`;
        };

        // =====================================================================
        // TOOLTIPS - All help text in one place for easy maintenance
        // =====================================================================
        const tooltips = {
            node: "Delays signals by a configurable time.\n\nConnects between a trigger source and an action to add timing control to your automations.",
            inputs: {
                trigger: "Boolean signal to process.\nWhen this changes, the delay timer starts.",
                value: "Optional value to pass through.\nIf connected, this value is sent to 'Passthrough' output after the delay."
            },
            outputs: {
                delayed: "The trigger value, output after the delay period completes.",
                passthrough: "The 'Value' input (or trigger if not connected), passed through after delay."
            },
            controls: {
                mode: "Delay: Wait X time, then pass value through\nDebounce: Reset timer on each trigger, fire after silence\nThrottle: Pass immediately, block repeats for X time\nRetriggerable: ON immediately, restart OFF timer on each trigger",
                time: "Time to wait in milliseconds.\n1000ms = 1 second\n60000ms = 1 minute",
                trigger: "Manually trigger the node for testing.",
                cancel: "Cancel any pending timer and reset output to OFF.",
                debug: "Enable console logging for troubleshooting."
            }
        };

        const modeDescriptions = {
            delay: "Wait, then pass value through",
            debounce: "Pass after silence period",
            throttle: "Max once per period",
            retriggerable: "ON now, OFF after timeout"
        };

        // Styles
        const containerStyle = {
            background: 'linear-gradient(135deg, rgba(10,15,20,0.95) 0%, rgba(20,30,40,0.95) 100%)',
            borderRadius: '8px',
            padding: '10px',
            fontFamily: 'Inter, system-ui, sans-serif',
            minWidth: '220px'
        };

        const headerStyle = {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '10px',
            paddingBottom: '8px',
            borderBottom: `1px solid ${THEME.border}`
        };

        const titleStyle = {
            color: THEME.primary,
            fontSize: '14px',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
        };

        const statusDotStyle = {
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: outputState ? THEME.success : (isActive ? THEME.warning : '#555')
        };

        const inputRowStyle = {
            display: 'flex',
            alignItems: 'center',
            marginBottom: '8px',
            padding: '4px 0'
        };

        const labelStyle = {
            color: THEME.text,
            fontSize: '11px',
            width: '60px'
        };

        const selectStyle = {
            flex: 1,
            background: 'rgba(0,0,0,0.4)',
            border: `1px solid ${THEME.border}`,
            borderRadius: '4px',
            padding: '4px 6px',
            color: THEME.text,
            fontSize: '11px'
        };

        const inputStyle = {
            background: 'rgba(0,0,0,0.4)',
            border: `1px solid ${THEME.border}`,
            borderRadius: '4px',
            padding: '4px 6px',
            color: THEME.text,
            fontSize: '11px',
            width: '70px'
        };

        const buttonStyle = (color) => ({
            flex: 1,
            padding: '6px 8px',
            border: 'none',
            borderRadius: '4px',
            background: color || THEME.primary,
            color: '#000',
            fontSize: '11px',
            fontWeight: '600',
            cursor: 'pointer'
        });

        const progressBarStyle = {
            width: '100%',
            height: '6px',
            background: 'rgba(0,0,0,0.4)',
            borderRadius: '3px',
            overflow: 'hidden',
            marginTop: '8px'
        };

        const progressFillStyle = {
            height: '100%',
            background: `linear-gradient(90deg, ${THEME.primary}, ${THEME.success})`,
            width: isActive ? `${Math.max(0, 100 - (countdown / delayMs) * 100)}%` : '0%',
            transition: 'width 0.1s linear'
        };

        const socketRowStyle = (side) => ({
            display: 'flex',
            alignItems: 'center',
            justifyContent: side === 'input' ? 'flex-start' : 'flex-end',
            margin: '4px 0',
            gap: '6px'
        });

        const socketLabelStyle = {
            fontSize: '10px',
            color: 'rgba(255,255,255,0.6)'
        };

        // Build the component
        return React.createElement('div', { style: containerStyle }, [
            // Header with node-level tooltip
            NodeHeader ? 
                React.createElement(NodeHeader, {
                    key: 'header',
                    icon: '⏱️',
                    title: 'Delay',
                    tooltip: tooltips.node,
                    statusDot: true,
                    statusColor: outputState ? THEME.success : (isActive ? THEME.warning : '#555')
                }) :
                React.createElement('div', { key: 'header', style: headerStyle }, [
                    React.createElement('div', { key: 'title', style: titleStyle }, [
                        React.createElement('span', { key: 'icon' }, '⏱️'),
                        'Delay'
                    ]),
                    React.createElement('div', { key: 'status', style: statusDotStyle })
                ]),

            // Inputs with tooltips
            Object.entries(data.inputs).map(([key, input]) =>
                React.createElement('div', { key: `in-${key}`, style: socketRowStyle('input') }, [
                    React.createElement(RefComponent, {
                        key: 'socket',
                        init: ref => emit({
                            type: "render",
                            data: { type: "socket", element: ref, payload: input.socket, nodeId: data.id, side: "input", key }
                        }),
                        unmount: ref => emit({ type: "unmount", data: { element: ref } })
                    }),
                    React.createElement('span', { key: 'label', style: socketLabelStyle }, input.label || key),
                    HelpIcon && tooltips.inputs[key] && React.createElement(HelpIcon, { key: 'help', text: tooltips.inputs[key], size: 10 })
                ])
            ),

            // Mode selector with tooltip
            React.createElement('div', { key: 'mode-row', style: inputRowStyle }, [
                React.createElement('div', { key: 'label-wrap', style: { display: 'flex', alignItems: 'center', width: '60px' } }, [
                    React.createElement('span', { key: 'label', style: labelStyle }, 'Mode'),
                    HelpIcon && React.createElement(HelpIcon, { key: 'help', text: tooltips.controls.mode, size: 12 })
                ]),
                React.createElement('select', {
                    key: 'select',
                    style: selectStyle,
                    value: mode,
                    onChange: (e) => {
                        const v = e.target.value;
                        setMode(v);
                        data.properties.mode = v;
                        data.cancel();
                    },
                    onPointerDown: stopPropagation
                }, [
                    React.createElement('option', { key: 'delay', value: 'delay' }, 'Delay'),
                    React.createElement('option', { key: 'debounce', value: 'debounce' }, 'Debounce'),
                    React.createElement('option', { key: 'throttle', value: 'throttle' }, 'Throttle'),
                    React.createElement('option', { key: 'retriggerable', value: 'retriggerable' }, 'Retriggerable')
                ])
            ]),

            // Mode description
            React.createElement('div', { key: 'desc', style: { fontSize: '9px', color: 'rgba(255,255,255,0.4)', marginBottom: '8px', textAlign: 'center' } },
                modeDescriptions[mode]
            ),

            // Delay time with slider + number input
            React.createElement('div', { key: 'time-row', style: { marginBottom: '10px' } }, [
                // Label row with help
                React.createElement('div', { key: 'label-row', style: { display: 'flex', alignItems: 'center', marginBottom: '4px' } }, [
                    React.createElement('span', { key: 'label', style: labelStyle }, 'Time'),
                    HelpIcon && React.createElement(HelpIcon, { key: 'help', text: tooltips.controls.time, size: 12 })
                ]),
                // Slider
                React.createElement('input', {
                    key: 'slider',
                    type: 'range',
                    min: 100,
                    max: 60000,
                    step: 100,
                    value: Math.min(delayMs, 60000),
                    onChange: (e) => {
                        const v = parseInt(e.target.value);
                        setDelayMs(v);
                        data.properties.delayMs = v;
                    },
                    onPointerDown: stopPropagation,
                    style: {
                        width: '100%',
                        height: '6px',
                        background: `linear-gradient(to right, ${THEME.primary} ${(Math.min(delayMs, 60000) / 60000) * 100}%, rgba(255,255,255,0.1) 0%)`,
                        borderRadius: '3px',
                        cursor: 'pointer',
                        WebkitAppearance: 'none',
                        appearance: 'none'
                    }
                }),
                // Value display + manual input
                React.createElement('div', { key: 'value-row', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' } }, [
                    React.createElement('span', { key: 'formatted', style: { color: THEME.primary, fontSize: '12px', fontWeight: 'bold' } }, formatTime(delayMs)),
                    React.createElement('input', {
                        key: 'input',
                        type: 'number',
                        style: { ...inputStyle, width: '80px', textAlign: 'right' },
                        value: delayMs,
                        min: 100,
                        step: 100,
                        onChange: (e) => {
                            const v = Math.max(100, parseInt(e.target.value) || 1000);
                            setDelayMs(v);
                            data.properties.delayMs = v;
                        },
                        onPointerDown: stopPropagation
                    }),
                    React.createElement('span', { key: 'unit', style: { fontSize: '10px', color: 'rgba(255,255,255,0.5)', marginLeft: '4px' } }, 'ms')
                ])
            ]),

            // Status display
            isActive && React.createElement('div', { key: 'countdown', style: { textAlign: 'center', marginTop: '6px' } }, [
                React.createElement('span', { key: 'time', style: { color: THEME.warning, fontSize: '14px', fontWeight: 'bold' } },
                    formatTime(countdown)
                ),
                React.createElement('div', { key: 'bar', style: progressBarStyle },
                    React.createElement('div', { style: progressFillStyle })
                )
            ]),

            // Output state indicator
            React.createElement('div', { key: 'output-state', style: { textAlign: 'center', margin: '8px 0', fontSize: '11px' } },
                React.createElement('span', { style: { color: outputState ? THEME.success : '#666' } },
                    `Output: ${outputState ? 'ON' : 'OFF'}`
                )
            ),

            // Buttons with tooltips (using title attribute for simple native tooltip)
            React.createElement('div', { key: 'buttons', style: { display: 'flex', gap: '6px', marginTop: '8px' } }, [
                React.createElement('button', {
                    key: 'trigger',
                    style: buttonStyle(THEME.primary),
                    onClick: () => data.manualTrigger(),
                    onPointerDown: stopPropagation,
                    title: tooltips.controls.trigger
                }, '▶ Trigger'),
                React.createElement('button', {
                    key: 'cancel',
                    style: buttonStyle(THEME.error),
                    onClick: () => data.cancel(),
                    onPointerDown: stopPropagation,
                    title: tooltips.controls.cancel
                }, '✕ Cancel')
            ]),

            // Outputs with tooltips
            Object.entries(data.outputs).map(([key, output]) =>
                React.createElement('div', { key: `out-${key}`, style: socketRowStyle('output') }, [
                    HelpIcon && tooltips.outputs[key] && React.createElement(HelpIcon, { key: 'help', text: tooltips.outputs[key], size: 10 }),
                    React.createElement('span', { key: 'label', style: socketLabelStyle }, output.label || key),
                    React.createElement(RefComponent, {
                        key: 'socket',
                        init: ref => emit({
                            type: "render",
                            data: { type: "socket", element: ref, payload: output.socket, nodeId: data.id, side: "output", key }
                        }),
                        unmount: ref => emit({ type: "unmount", data: { element: ref } })
                    })
                ])
            ),

            // Debug toggle with tooltip
            React.createElement('div', { key: 'debug', style: { marginTop: '8px', textAlign: 'center' } },
                React.createElement('label', { 
                    style: { fontSize: '10px', color: 'rgba(255,255,255,0.4)', cursor: 'pointer' },
                    title: tooltips.controls.debug
                }, [
                    React.createElement('input', {
                        key: 'checkbox',
                        type: 'checkbox',
                        checked: debug,
                        onChange: (e) => {
                            setDebug(e.target.checked);
                            data.properties.debug = e.target.checked;
                        },
                        onPointerDown: stopPropagation,
                        style: { marginRight: '4px' }
                    }),
                    'Debug'
                ])
            )
        ]);
    }

    // -------------------------------------------------------------------------
    // REGISTRATION
    // -------------------------------------------------------------------------
    if (window.nodeRegistry) {
        window.nodeRegistry.register('DelayNode', {
            label: "Delay",
            category: "Timer/Event",
            nodeClass: DelayNode,
            component: DelayNodeComponent,
            factory: (changeCallback) => new DelayNode(changeCallback)
        });
        console.log("[DelayNode] Registered successfully");
    } else {
        console.error("[DelayNode] nodeRegistry not found!");
    }
})();
