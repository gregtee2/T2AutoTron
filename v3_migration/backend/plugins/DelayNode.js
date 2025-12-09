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
                delayValue: 1,        // Numeric value for UI
                delayUnit: 'seconds', // 'ms', 'seconds', 'minutes', 'hours'
                mode: 'delay',
                randomPercent: 0,  // ±% random variation (0-100)
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

        _getRandomizedDelay() {
            const baseDelay = this.properties.delayMs;
            const randomPercent = this.properties.randomPercent || 0;
            
            if (randomPercent === 0) {
                return baseDelay;
            }
            
            // Calculate random variation: ±randomPercent%
            // (Math.random() - 0.5) gives -0.5 to +0.5
            // * 2 gives -1 to +1
            // * (randomPercent / 100) gives -percent to +percent
            const variation = (Math.random() - 0.5) * 2 * (randomPercent / 100);
            const actualDelay = Math.round(baseDelay * (1 + variation));
            
            // Ensure minimum delay of 10ms
            return Math.max(10, actualDelay);
        }

        _processTrigger(triggerValue, valueToPass) {
            const delay = this._getRandomizedDelay();
            const mode = this.properties.mode;
            
            this._log(`Trigger: ${triggerValue}, value: ${valueToPass}, mode: ${mode}, delay: ${delay}ms (base: ${this.properties.delayMs}ms)`);

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
                this.properties.delayValue = state.properties.delayValue ?? 1;
                this.properties.delayUnit = state.properties.delayUnit ?? 'seconds';
                this.properties.mode = state.properties.mode ?? 'delay';
                this.properties.randomPercent = state.properties.randomPercent ?? 0;
                this.properties.debug = state.properties.debug ?? false;
                this.properties.isActive = false;
                this.properties.countdown = 0;
                this.properties.outputValue = false;
            }
        }

        serialize() {
            return {
                delayMs: this.properties.delayMs,
                delayValue: this.properties.delayValue,
                delayUnit: this.properties.delayUnit,
                mode: this.properties.mode,
                randomPercent: this.properties.randomPercent,
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
        const [delayValue, setDelayValue] = useState(data.properties.delayValue || 1);
        const [delayUnit, setDelayUnit] = useState(data.properties.delayUnit || 'seconds');
        const [mode, setMode] = useState(data.properties.mode);
        const [randomPercent, setRandomPercent] = useState(data.properties.randomPercent || 0);
        const [isActive, setIsActive] = useState(data.properties.isActive);
        const [countdown, setCountdown] = useState(data.properties.countdown);
        const [outputState, setOutputState] = useState(data.properties.outputValue);
        const [debug, setDebug] = useState(data.properties.debug);

        // Unit conversion helpers
        const UNIT_MULTIPLIERS = {
            'ms': 1,
            'seconds': 1000,
            'minutes': 60000,
            'hours': 3600000
        };

        const updateDelay = (value, unit) => {
            const ms = Math.round(value * UNIT_MULTIPLIERS[unit]);
            setDelayMs(ms);
            setDelayValue(value);
            setDelayUnit(unit);
            data.properties.delayMs = ms;
            data.properties.delayValue = value;
            data.properties.delayUnit = unit;
        };

        // Get tooltip components from T2Controls
        const { NodeHeader, LabeledRow, HelpIcon, Tooltip } = window.T2Controls || {};

        // Sync with node state
        useEffect(() => {
            const originalCallback = data.changeCallback;
            data.changeCallback = () => {
                setDelayMs(data.properties.delayMs);
                setDelayValue(data.properties.delayValue || 1);
                setDelayUnit(data.properties.delayUnit || 'seconds');
                setMode(data.properties.mode);
                setRandomPercent(data.properties.randomPercent || 0);
                setIsActive(data.properties.isActive);
                setCountdown(data.properties.countdown);
                setOutputState(data.properties.outputValue);
                setDebug(data.properties.debug);
                if (originalCallback) originalCallback();
            };
            return () => { data.changeCallback = originalCallback; };
        }, [data]);

        const formatTime = (ms) => {
            if (ms >= 3600000) {
                const hours = ms / 3600000;
                return hours >= 10 ? `${Math.round(hours)}h` : `${hours.toFixed(1)}h`;
            }
            if (ms >= 60000) {
                const mins = ms / 60000;
                return mins >= 10 ? `${Math.round(mins)}m` : `${mins.toFixed(1)}m`;
            }
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
                time: "Time to wait before passing the signal.\nSelect a value and unit (ms, seconds, minutes, hours).\nSupports delays up to 24+ hours.",
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
            background: `linear-gradient(135deg, ${THEME.background} 0%, ${THEME.surface} 100%)`,
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
            borderBottom: `1px solid ${CATEGORY.border}`
        };

        const titleStyle = {
            color: CATEGORY.accent,
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
            background: outputState ? THEME.success : (isActive ? THEME.warning : THEME.textMuted)
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
            background: THEME.surface,
            border: `1px solid ${THEME.border}`,
            borderRadius: '4px',
            padding: '4px 6px',
            color: THEME.text,
            fontSize: '11px'
        };

        const inputStyle = {
            background: THEME.surface,
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
            border: `1px solid ${color || THEME.primary}`,
            borderRadius: '4px',
            background: `${color || THEME.primary}25`,
            color: THEME.textBright,
            fontSize: '11px',
            fontWeight: '600',
            cursor: 'pointer'
        });

        const progressBarStyle = {
            width: '100%',
            height: '6px',
            background: THEME.surfaceLight,
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
            color: THEME.textMuted
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

            // Delay time with value input + unit selector
            React.createElement('div', { key: 'time-row', style: { marginBottom: '10px' } }, [
                // Label row with help
                React.createElement('div', { key: 'label-row', style: { display: 'flex', alignItems: 'center', marginBottom: '4px' } }, [
                    React.createElement('span', { key: 'label', style: labelStyle }, 'Time'),
                    HelpIcon && React.createElement(HelpIcon, { key: 'help', text: tooltips.controls.time, size: 12 })
                ]),
                // Value input + Unit selector row
                React.createElement('div', { key: 'input-row', style: { display: 'flex', gap: '6px', alignItems: 'center' } }, [
                    // Numeric input
                    React.createElement('input', {
                        key: 'value-input',
                        type: 'number',
                        style: { ...inputStyle, flex: 1, textAlign: 'center' },
                        value: delayValue,
                        min: delayUnit === 'ms' ? 100 : 0.1,
                        step: delayUnit === 'ms' ? 100 : (delayUnit === 'hours' ? 0.25 : 1),
                        onChange: (e) => {
                            const v = parseFloat(e.target.value) || 1;
                            updateDelay(v, delayUnit);
                        },
                        onPointerDown: stopPropagation
                    }),
                    // Unit selector
                    React.createElement('select', {
                        key: 'unit-select',
                        style: { ...selectStyle, width: '90px' },
                        value: delayUnit,
                        onChange: (e) => {
                            const newUnit = e.target.value;
                            // Convert current value to new unit
                            const currentMs = delayValue * UNIT_MULTIPLIERS[delayUnit];
                            const newValue = currentMs / UNIT_MULTIPLIERS[newUnit];
                            // Round appropriately
                            const rounded = newUnit === 'ms' ? Math.round(newValue) : 
                                           newUnit === 'hours' ? Math.round(newValue * 4) / 4 :
                                           Math.round(newValue * 10) / 10;
                            updateDelay(rounded, newUnit);
                        },
                        onPointerDown: stopPropagation
                    }, [
                        React.createElement('option', { key: 'ms', value: 'ms' }, 'ms'),
                        React.createElement('option', { key: 'seconds', value: 'seconds' }, 'seconds'),
                        React.createElement('option', { key: 'minutes', value: 'minutes' }, 'minutes'),
                        React.createElement('option', { key: 'hours', value: 'hours' }, 'hours')
                    ])
                ]),
                // Show actual time in friendly format
                React.createElement('div', { key: 'formatted', style: { textAlign: 'center', marginTop: '4px' } },
                    React.createElement('span', { style: { color: THEME.primary, fontSize: '12px', fontWeight: 'bold' } }, 
                        formatTime(delayMs)
                    )
                )
            ]),

            // Random variation slider (±%)
            React.createElement('div', { key: 'random-row', style: { marginBottom: '10px' } }, [
                // Label row with help
                React.createElement('div', { key: 'label-row', style: { display: 'flex', alignItems: 'center', marginBottom: '4px' } }, [
                    React.createElement('span', { key: 'label', style: labelStyle }, 'Random'),
                    HelpIcon && React.createElement(HelpIcon, { 
                        key: 'help', 
                        text: 'Add random variation to delay time. ±50% means delay can vary between 50%-150% of set time.', 
                        size: 12 
                    })
                ]),
                // Slider
                React.createElement('input', {
                    key: 'slider',
                    type: 'range',
                    min: 0,
                    max: 100,
                    step: 5,
                    value: randomPercent,
                    onChange: (e) => {
                        const v = parseInt(e.target.value);
                        setRandomPercent(v);
                        data.properties.randomPercent = v;
                    },
                    onPointerDown: stopPropagation,
                    style: {
                        width: '100%',
                        height: '6px',
                        background: `linear-gradient(to right, ${THEME.warning} ${randomPercent}%, rgba(255,255,255,0.1) 0%)`,
                        borderRadius: '3px',
                        cursor: 'pointer',
                        WebkitAppearance: 'none',
                        appearance: 'none'
                    }
                }),
                // Value display
                React.createElement('div', { key: 'value-row', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' } }, [
                    React.createElement('span', { 
                        key: 'formatted', 
                        style: { color: randomPercent > 0 ? THEME.warning : 'rgba(255,255,255,0.4)', fontSize: '11px' } 
                    }, randomPercent > 0 ? `±${randomPercent}%` : 'Off'),
                    randomPercent > 0 && React.createElement('span', {
                        key: 'range',
                        style: { fontSize: '10px', color: 'rgba(255,255,255,0.5)' }
                    }, `${formatTime(Math.round(delayMs * (1 - randomPercent/100)))} – ${formatTime(Math.round(delayMs * (1 + randomPercent/100)))}`)
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
        // console.log("[DelayNode] Registered successfully");
    } else {
        console.error("[DelayNode] nodeRegistry not found!");
    }
})();
