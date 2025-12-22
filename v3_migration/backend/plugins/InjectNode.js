// ============================================================================
// InjectNode.js - Inject/Trigger Node (Node-RED Style)
// Manually trigger or schedule automatic triggers
// ============================================================================

(function() {
    // Dependency checks
    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets) {
        console.error("[InjectNode] Missing core dependencies");
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect, useRef, useCallback } = React;
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
        node: "Inject Node: Full-featured trigger node. Manual button, scheduled time, repeat interval, and startup trigger. Supports multiple payload types.",
        outputs: {
            output: "Outputs the configured payload value when triggered."
        },
        controls: {
            payload: "The value to output when triggered.\n• Boolean: true/false\n• Number: any numeric value\n• String: text message\n• Timestamp: current time in ms\n• Object: JSON data",
            repeat: "How often to automatically trigger (in ms). Set to 0 for manual-only mode.",
            button: "Click to immediately trigger the output.",
            onceDelay: "Inject once after this many seconds when the flow starts. Set to 0 to disable.",
            name: "Optional name for this inject node (shown in header).",
            scheduleTime: "Time of day to trigger (24-hour format). Leave empty to disable.",
            scheduleDays: "Days of week to trigger. Click to toggle each day."
        }
    };

    // Day abbreviations
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    // -------------------------------------------------------------------------
    // NODE CLASS
    // -------------------------------------------------------------------------
    class InjectNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("Inject");
            this.width = 220;
            this.changeCallback = changeCallback;

            this.properties = {
                payloadType: 'boolean', // 'boolean', 'timestamp', 'number', 'string', 'object'
                payloadValue: true,
                repeatMs: 0,  // 0 = no repeat, otherwise interval in ms
                onceDelay: 0, // 0 = disabled, otherwise seconds after start to inject once
                name: '',     // Optional name for identification
                pulseMode: false, // When true, output is undefined except during pulse
                pulseDurationMs: 500, // How long pulse lasts
                // Schedule settings
                scheduleEnabled: false,
                scheduleTime: '',      // HH:MM format (24-hour)
                scheduleDays: [true, true, true, true, true, true, true], // Sun-Sat, all enabled by default
                // Runtime state
                lastTriggerTime: null,
                triggerCount: 0,
                isRepeating: false,
                onceTriggered: false,
                nextScheduledTime: null,
                isPulsing: false,      // True during active pulse
                debug: false
            };

            // Timer for repeat mode
            this._repeatTimer = null;
            this._onceTimer = null;
            this._scheduleTimer = null;
            this._scheduleCheckInterval = null;
            this._pulseTimer = null;
            this._shouldOutput = false;
            this._initialized = false;

            // Outputs only - this is a source node
            this.addOutput("output", new ClassicPreset.Output(
                sockets.any || new ClassicPreset.Socket('any'),
                "Output"
            ));
        }

        // Initialize once-at-start timer
        initialize() {
            if (this._initialized) return;
            this._initialized = true;
            
            // Start "once at startup" timer if configured
            if (this.properties.onceDelay > 0 && !this.properties.onceTriggered) {
                this._onceTimer = setTimeout(() => {
                    this.trigger();
                    this.properties.onceTriggered = true;
                    if (this.changeCallback) this.changeCallback();
                }, this.properties.onceDelay * 1000);
            }

            // Start schedule checker if enabled
            this._startScheduleChecker();
        }

        // Schedule time checking
        _startScheduleChecker() {
            this._stopScheduleChecker();
            
            if (!this.properties.scheduleEnabled || !this.properties.scheduleTime) {
                return;
            }

            // Check every 1 second for precise triggering
            this._scheduleCheckInterval = setInterval(() => {
                this._checkSchedule();
            }, 1000);

            // Also check immediately
            this._checkSchedule();
            this._updateNextScheduledTime();
        }

        _stopScheduleChecker() {
            if (this._scheduleCheckInterval) {
                clearInterval(this._scheduleCheckInterval);
                this._scheduleCheckInterval = null;
            }
            if (this._scheduleTimer) {
                clearTimeout(this._scheduleTimer);
                this._scheduleTimer = null;
            }
        }

        _checkSchedule() {
            if (!this.properties.scheduleEnabled || !this.properties.scheduleTime) {
                return;
            }

            const now = new Date();
            const [hours, minutes] = this.properties.scheduleTime.split(':').map(Number);
            
            if (isNaN(hours) || isNaN(minutes)) return;

            const currentDay = now.getDay(); // 0 = Sunday
            
            // Check if today is enabled
            if (!this.properties.scheduleDays[currentDay]) {
                return;
            }

            const currentHours = now.getHours();
            const currentMinutes = now.getMinutes();
            const currentSeconds = now.getSeconds();

            // Trigger at exactly the start of the minute (within first 2 seconds)
            if (currentHours === hours && currentMinutes === minutes && currentSeconds < 2) {
                // Only trigger if we haven't triggered recently (within 60 seconds)
                const lastTrigger = this.properties.lastTriggerTime;
                if (!lastTrigger || (Date.now() - lastTrigger) > 60000) {
                    this.trigger();
                }
            }

            this._updateNextScheduledTime();
        }

        _updateNextScheduledTime() {
            if (!this.properties.scheduleEnabled || !this.properties.scheduleTime) {
                this.properties.nextScheduledTime = null;
                return;
            }

            const [hours, minutes] = this.properties.scheduleTime.split(':').map(Number);
            if (isNaN(hours) || isNaN(minutes)) {
                this.properties.nextScheduledTime = null;
                return;
            }

            const now = new Date();
            let nextDate = new Date(now);
            nextDate.setHours(hours, minutes, 0, 0);

            // If time has passed today, start from tomorrow
            if (nextDate <= now) {
                nextDate.setDate(nextDate.getDate() + 1);
            }

            // Find the next enabled day
            for (let i = 0; i < 7; i++) {
                const day = nextDate.getDay();
                if (this.properties.scheduleDays[day]) {
                    this.properties.nextScheduledTime = nextDate.getTime();
                    if (this.changeCallback) this.changeCallback();
                    return;
                }
                nextDate.setDate(nextDate.getDate() + 1);
            }

            // No days enabled
            this.properties.nextScheduledTime = null;
        }

        enableSchedule() {
            this.properties.scheduleEnabled = true;
            this._startScheduleChecker();
            if (this.changeCallback) this.changeCallback();
        }

        disableSchedule() {
            this.properties.scheduleEnabled = false;
            this._stopScheduleChecker();
            this.properties.nextScheduledTime = null;
            if (this.changeCallback) this.changeCallback();
        }

        // Manual trigger from UI button
        trigger() {
            this._shouldOutput = true;
            this.properties.lastTriggerTime = Date.now();
            this.properties.triggerCount++;
            
            // Handle pulse mode - output value briefly then go back to undefined
            if (this.properties.pulseMode) {
                this.properties.isPulsing = true;
                
                // Clear any existing pulse timer
                if (this._pulseTimer) {
                    clearTimeout(this._pulseTimer);
                }
                
                // End pulse after duration
                this._pulseTimer = setTimeout(() => {
                    this.properties.isPulsing = false;
                    this._pulseTimer = null;
                    if (this.changeCallback) this.changeCallback();
                }, this.properties.pulseDurationMs || 500);
            }
            
            if (this.changeCallback) this.changeCallback();
        }

        // Start repeat timer
        startRepeat() {
            this.stopRepeat();
            if (this.properties.repeatMs > 0) {
                this.properties.isRepeating = true;
                this._repeatTimer = setInterval(() => {
                    this.trigger();
                }, this.properties.repeatMs);
                if (this.changeCallback) this.changeCallback();
            }
        }

        // Stop repeat timer
        stopRepeat() {
            if (this._repeatTimer) {
                clearInterval(this._repeatTimer);
                this._repeatTimer = null;
            }
            this.properties.isRepeating = false;
        }

        _getPayload() {
            switch (this.properties.payloadType) {
                case 'boolean':
                    return Boolean(this.properties.payloadValue);
                case 'timestamp':
                    return Date.now();
                case 'number':
                    return Number(this.properties.payloadValue) || 0;
                case 'string':
                    return String(this.properties.payloadValue || '');
                case 'object':
                    // Try to parse JSON, fallback to empty object
                    try {
                        if (typeof this.properties.payloadValue === 'string') {
                            return JSON.parse(this.properties.payloadValue);
                        }
                        return this.properties.payloadValue || {};
                    } catch (e) {
                        return { error: 'Invalid JSON', raw: this.properties.payloadValue };
                    }
                default:
                    return this.properties.payloadValue;
            }
        }

        data(inputs) {
            // Initialize on first data() call (flow started)
            this.initialize();
            
            // Pulse mode: only output during active pulse, undefined otherwise
            if (this.properties.pulseMode) {
                if (this.properties.isPulsing) {
                    return { output: this._getPayload() };
                } else {
                    return { output: undefined };
                }
            }
            
            // Non-pulse mode: always return the payload value
            // (original behavior - value stays on the wire)
            return { output: this._getPayload() };
        }

        restore(state) {
            if (state.properties) {
                // Restore configuration
                this.properties.payloadType = state.properties.payloadType || 'boolean';
                this.properties.payloadValue = state.properties.payloadValue ?? true;
                this.properties.repeatMs = state.properties.repeatMs || 0;
                this.properties.onceDelay = state.properties.onceDelay || 0;
                this.properties.name = state.properties.name || '';
                this.properties.pulseMode = state.properties.pulseMode || false;
                this.properties.pulseDurationMs = state.properties.pulseDurationMs || 500;
                // Schedule settings
                this.properties.scheduleEnabled = state.properties.scheduleEnabled || false;
                this.properties.scheduleTime = state.properties.scheduleTime || '';
                this.properties.scheduleDays = state.properties.scheduleDays || [true, true, true, true, true, true, true];
                // Don't restore transient state
                this.properties.isRepeating = false;
                this.properties.lastTriggerTime = null;
                this.properties.onceTriggered = false;
                this.properties.nextScheduledTime = null;
                this.properties.isPulsing = false;
            }
            this._initialized = false;
        }

        serialize() {
            return {
                payloadType: this.properties.payloadType,
                payloadValue: this.properties.payloadValue,
                repeatMs: this.properties.repeatMs,
                onceDelay: this.properties.onceDelay,
                name: this.properties.name,
                pulseMode: this.properties.pulseMode,
                pulseDurationMs: this.properties.pulseDurationMs,
                scheduleEnabled: this.properties.scheduleEnabled,
                scheduleTime: this.properties.scheduleTime,
                scheduleDays: this.properties.scheduleDays
            };
        }

        destroy() {
            this.stopRepeat();
            this._stopScheduleChecker();
            if (this._onceTimer) {
                clearTimeout(this._onceTimer);
                this._onceTimer = null;
            }
            if (this._pulseTimer) {
                clearTimeout(this._pulseTimer);
                this._pulseTimer = null;
            }
        }
    }

    // -------------------------------------------------------------------------
    // REACT COMPONENT
    // -------------------------------------------------------------------------
    function InjectNodeComponent({ data, emit }) {
        const [, forceUpdate] = useState(0);
        const props = data.properties;

        // Sync with node changes
        useEffect(() => {
            const originalCallback = data.changeCallback;
            data.changeCallback = () => {
                forceUpdate(n => n + 1);
                if (originalCallback) originalCallback();
            };
            return () => { data.changeCallback = originalCallback; };
        }, [data]);

        // Cleanup on unmount
        useEffect(() => {
            return () => {
                if (data.stopRepeat) data.stopRepeat();
            };
        }, [data]);

        const handleTrigger = useCallback(() => {
            if (data.trigger) data.trigger();
        }, [data]);

        const handlePayloadTypeChange = useCallback((e) => {
            props.payloadType = e.target.value;
            // Set sensible defaults
            if (props.payloadType === 'boolean') {
                props.payloadValue = true;
            } else if (props.payloadType === 'timestamp') {
                props.payloadValue = null;
            } else if (props.payloadType === 'number') {
                props.payloadValue = 0;
            } else if (props.payloadType === 'string') {
                props.payloadValue = 'Hello';
            } else if (props.payloadType === 'object') {
                props.payloadValue = '{"key": "value"}';
            }
            forceUpdate(n => n + 1);
            if (data.changeCallback) data.changeCallback();
        }, [data, props]);

        const handlePayloadValueChange = useCallback((e) => {
            const val = e.target.value;
            if (props.payloadType === 'boolean') {
                props.payloadValue = val === 'true';
            } else if (props.payloadType === 'number') {
                props.payloadValue = Number(val) || 0;
            } else {
                // String or Object - store as-is
                props.payloadValue = val;
            }
            forceUpdate(n => n + 1);
            if (data.changeCallback) data.changeCallback();
        }, [data, props]);

        const handleNameChange = useCallback((e) => {
            props.name = e.target.value;
            forceUpdate(n => n + 1);
            if (data.changeCallback) data.changeCallback();
        }, [data, props]);

        const handleOnceDelayChange = useCallback((e) => {
            props.onceDelay = Math.max(0, parseFloat(e.target.value) || 0);
            forceUpdate(n => n + 1);
            if (data.changeCallback) data.changeCallback();
        }, [data, props]);

        const handleRepeatChange = useCallback((e) => {
            const val = parseInt(e.target.value) || 0;
            props.repeatMs = Math.max(0, val);
            // Restart timer if currently repeating
            if (props.isRepeating && data.startRepeat) {
                data.startRepeat();
            }
            forceUpdate(n => n + 1);
            if (data.changeCallback) data.changeCallback();
        }, [data, props]);

        const toggleRepeat = useCallback(() => {
            if (props.isRepeating) {
                if (data.stopRepeat) data.stopRepeat();
            } else {
                if (data.startRepeat) data.startRepeat();
            }
            forceUpdate(n => n + 1);
        }, [data, props]);

        // Schedule handlers
        const handleScheduleToggle = useCallback(() => {
            if (props.scheduleEnabled) {
                if (data.disableSchedule) data.disableSchedule();
            } else {
                if (data.enableSchedule) data.enableSchedule();
            }
            forceUpdate(n => n + 1);
        }, [data, props]);

        const handleScheduleTimeChange = useCallback((e) => {
            props.scheduleTime = e.target.value;
            if (props.scheduleEnabled && data._updateNextScheduledTime) {
                data._updateNextScheduledTime();
            }
            forceUpdate(n => n + 1);
            if (data.changeCallback) data.changeCallback();
        }, [data, props]);

        const handleDayToggle = useCallback((dayIndex) => {
            props.scheduleDays[dayIndex] = !props.scheduleDays[dayIndex];
            if (props.scheduleEnabled && data._updateNextScheduledTime) {
                data._updateNextScheduledTime();
            }
            forceUpdate(n => n + 1);
            if (data.changeCallback) data.changeCallback();
        }, [data, props]);

        // Pulse mode handler
        const handlePulseToggle = useCallback(() => {
            props.pulseMode = !props.pulseMode;
            forceUpdate(n => n + 1);
            if (data.changeCallback) data.changeCallback();
        }, [data, props]);

        // Format next scheduled time
        const formatNextTime = (timestamp) => {
            if (!timestamp) return null;
            const date = new Date(timestamp);
            const now = new Date();
            const isToday = date.toDateString() === now.toDateString();
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            const isTomorrow = date.toDateString() === tomorrow.toDateString();
            
            const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            if (isToday) return `Today ${timeStr}`;
            if (isTomorrow) return `Tomorrow ${timeStr}`;
            return `${DAYS[date.getDay()]} ${timeStr}`;
        };

        // Styles
        const containerStyle = {
            padding: '12px',
            background: `linear-gradient(135deg, ${THEME.background} 0%, ${THEME.surface} 100%)`,
            borderRadius: '8px',
            fontFamily: 'monospace',
            minWidth: '200px'
        };

        const buttonStyle = {
            width: '100%',
            padding: '10px',
            background: `linear-gradient(135deg, ${THEME.primaryRgba(0.3)} 0%, ${THEME.primaryRgba(0.15)} 100%)`,
            border: `1px solid ${THEME.primary}`,
            borderRadius: '6px',
            color: THEME.textBright,
            fontWeight: 'bold',
            fontSize: '14px',
            cursor: 'pointer',
            marginBottom: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
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
            flex: 1,
            maxWidth: '100px'
        };

        const inputStyle = {
            ...selectStyle,
            maxWidth: '80px'
        };

        const textInputStyle = {
            ...selectStyle,
            maxWidth: 'none',
            width: '100%'
        };

        const textareaStyle = {
            ...selectStyle,
            maxWidth: 'none',
            width: '100%',
            minHeight: '50px',
            resize: 'vertical',
            fontFamily: 'monospace',
            fontSize: '10px'
        };

        const repeatButtonStyle = {
            ...buttonStyle,
            background: props.isRepeating 
                ? `linear-gradient(135deg, rgba(95, 170, 125, 0.3) 0%, rgba(95, 170, 125, 0.15) 100%)`
                : THEME.surfaceLight,
            border: `1px solid ${props.isRepeating ? THEME.success : THEME.border}`,
            padding: '6px 12px',
            fontSize: '11px'
        };

        const statsStyle = {
            fontSize: '10px',
            color: THEME.textMuted,
            textAlign: 'center',
            marginTop: '8px'
        };

        const sectionStyle = {
            marginTop: '12px',
            paddingTop: '12px',
            borderTop: `1px solid ${THEME.border}`
        };

        // Status color
        const statusColor = props.isRepeating ? THEME.success : 
                           props.scheduleEnabled && props.scheduleTime ? '#5a9bd5' :
                           props.onceDelay > 0 && !props.onceTriggered ? THEME.warning : THEME.textMuted;

        return React.createElement('div', { style: containerStyle },
            // Header
            NodeHeader && React.createElement(NodeHeader, {
                icon: '💉',
                title: props.name || 'Inject',
                tooltip: tooltips.node,
                statusDot: true,
                statusColor: statusColor
            }),

            // Name field
            React.createElement('div', { style: rowStyle },
                React.createElement('span', { style: labelStyle }, 
                    'Name',
                    HelpIcon && React.createElement(HelpIcon, { text: tooltips.controls.name, size: 10 })
                ),
                React.createElement('input', {
                    type: 'text',
                    style: { ...inputStyle, maxWidth: '100px' },
                    value: props.name || '',
                    onChange: handleNameChange,
                    onPointerDown: stopPropagation,
                    placeholder: 'optional'
                })
            ),

            // Manual Trigger Button
            React.createElement('button', {
                style: buttonStyle,
                onClick: handleTrigger,
                onPointerDown: stopPropagation,
                title: tooltips.controls.button
            }, '▶ Inject'),

            // Payload Type
            React.createElement('div', { style: rowStyle },
                React.createElement('span', { style: labelStyle }, 
                    'Payload',
                    HelpIcon && React.createElement(HelpIcon, { text: tooltips.controls.payload, size: 10 })
                ),
                React.createElement('select', {
                    style: selectStyle,
                    value: props.payloadType,
                    onChange: handlePayloadTypeChange,
                    onPointerDown: stopPropagation
                },
                    React.createElement('option', { value: 'boolean' }, 'Boolean'),
                    React.createElement('option', { value: 'number' }, 'Number'),
                    React.createElement('option', { value: 'string' }, 'String'),
                    React.createElement('option', { value: 'timestamp' }, 'Timestamp'),
                    React.createElement('option', { value: 'object' }, 'Object')
                )
            ),

            // Payload Value (conditional based on type)
            props.payloadType === 'boolean' && React.createElement('div', { style: rowStyle },
                React.createElement('span', { style: labelStyle }, 'Value'),
                React.createElement('select', {
                    style: selectStyle,
                    value: String(props.payloadValue),
                    onChange: handlePayloadValueChange,
                    onPointerDown: stopPropagation
                },
                    React.createElement('option', { value: 'true' }, 'true'),
                    React.createElement('option', { value: 'false' }, 'false')
                )
            ),

            props.payloadType === 'number' && React.createElement('div', { style: rowStyle },
                React.createElement('span', { style: labelStyle }, 'Value'),
                React.createElement('input', {
                    type: 'number',
                    style: inputStyle,
                    value: props.payloadValue,
                    onChange: handlePayloadValueChange,
                    onPointerDown: stopPropagation
                })
            ),

            props.payloadType === 'string' && React.createElement('div', { style: { ...rowStyle, flexDirection: 'column', alignItems: 'stretch' } },
                React.createElement('span', { style: labelStyle }, 'Value'),
                React.createElement('input', {
                    type: 'text',
                    style: textInputStyle,
                    value: props.payloadValue || '',
                    onChange: handlePayloadValueChange,
                    onPointerDown: stopPropagation,
                    placeholder: 'Enter text...'
                })
            ),

            props.payloadType === 'object' && React.createElement('div', { style: { ...rowStyle, flexDirection: 'column', alignItems: 'stretch' } },
                React.createElement('span', { style: labelStyle }, 'JSON'),
                React.createElement('textarea', {
                    style: textareaStyle,
                    value: props.payloadValue || '{}',
                    onChange: handlePayloadValueChange,
                    onPointerDown: stopPropagation,
                    placeholder: '{"key": "value"}'
                })
            ),

            props.payloadType === 'timestamp' && React.createElement('div', { style: rowStyle },
                React.createElement('span', { style: { ...labelStyle, fontStyle: 'italic', opacity: 0.7 } }, 
                    'Current timestamp on trigger'
                )
            ),

            // Inject Once at Start section
            React.createElement('div', { style: sectionStyle },
                React.createElement('div', { style: rowStyle },
                    React.createElement('span', { style: labelStyle }, 
                        'Once after (sec)',
                        HelpIcon && React.createElement(HelpIcon, { text: tooltips.controls.onceDelay, size: 10 })
                    ),
                    React.createElement('input', {
                        type: 'number',
                        style: inputStyle,
                        value: props.onceDelay,
                        onChange: handleOnceDelayChange,
                        onPointerDown: stopPropagation,
                        min: 0,
                        step: 0.5
                    })
                ),
                props.onceDelay > 0 && React.createElement('div', { 
                    style: { 
                        fontSize: '10px', 
                        color: props.onceTriggered ? THEME.success : THEME.warning,
                        textAlign: 'center',
                        marginTop: '4px'
                    } 
                }, props.onceTriggered ? '✓ Triggered at start' : `⏳ Will trigger ${props.onceDelay}s after start`)
            ),

            // Repeat Interval section
            React.createElement('div', { style: sectionStyle },
                React.createElement('div', { style: rowStyle },
                    React.createElement('span', { style: labelStyle }, 
                        'Repeat (ms)',
                        HelpIcon && React.createElement(HelpIcon, { text: tooltips.controls.repeat, size: 10 })
                    ),
                    React.createElement('input', {
                        type: 'number',
                        style: inputStyle,
                        value: props.repeatMs,
                        onChange: handleRepeatChange,
                        onPointerDown: stopPropagation,
                        min: 0,
                        step: 100
                    })
                ),

                // Repeat Start/Stop Button (only if interval > 0)
                props.repeatMs > 0 && React.createElement('button', {
                    style: repeatButtonStyle,
                    onClick: toggleRepeat,
                    onPointerDown: stopPropagation
                }, props.isRepeating ? '⏹ Stop' : '▶ Start Repeat'),

                // Pulse mode toggle
                React.createElement('div', { 
                    style: { ...rowStyle, cursor: 'pointer', marginTop: '8px' },
                    onClick: handlePulseToggle,
                    onPointerDown: stopPropagation
                },
                    React.createElement('span', { style: labelStyle }, 
                        '⚡ Pulse Mode',
                        HelpIcon && React.createElement(HelpIcon, { 
                            text: 'When enabled, output briefly pulses the value then returns to undefined. This creates a clear "edge" that trigger-based nodes can detect. Use this when scheduling a lock or other action.', 
                            size: 10 
                        })
                    ),
                    React.createElement('input', {
                        type: 'checkbox',
                        checked: props.pulseMode,
                        readOnly: true,
                        style: { width: '14px', height: '14px', accentColor: THEME.primary }
                    })
                ),
                
                // Pulse mode indicator
                props.pulseMode && React.createElement('div', { 
                    style: { 
                        fontSize: '10px', 
                        color: THEME.warning,
                        textAlign: 'center',
                        marginTop: '4px',
                        padding: '4px',
                        background: 'rgba(212, 160, 84, 0.1)',
                        borderRadius: '4px'
                    } 
                }, '⚡ Value pulses briefly, then goes undefined')
            ),

            // Schedule section
            React.createElement('div', { style: sectionStyle },
                // Schedule enable/disable toggle
                React.createElement('div', { 
                    style: { ...rowStyle, cursor: 'pointer' },
                    onClick: handleScheduleToggle,
                    onPointerDown: stopPropagation
                },
                    React.createElement('span', { style: labelStyle }, 
                        '⏰ Schedule',
                        HelpIcon && React.createElement(HelpIcon, { text: tooltips.controls.scheduleTime, size: 10 })
                    ),
                    React.createElement('input', {
                        type: 'checkbox',
                        checked: props.scheduleEnabled,
                        readOnly: true,
                        style: { width: '14px', height: '14px', accentColor: THEME.primary }
                    })
                ),

                // Time input (only if schedule enabled)
                props.scheduleEnabled && React.createElement('div', { style: rowStyle },
                    React.createElement('span', { style: labelStyle }, 'Time'),
                    React.createElement('input', {
                        type: 'time',
                        style: { ...inputStyle, maxWidth: '90px' },
                        value: props.scheduleTime || '',
                        onChange: handleScheduleTimeChange,
                        onPointerDown: stopPropagation
                    })
                ),

                // Days of week (only if schedule enabled)
                props.scheduleEnabled && React.createElement('div', { style: { marginTop: '8px' } },
                    React.createElement('div', { style: { ...labelStyle, marginBottom: '6px' } }, 
                        'Days',
                        HelpIcon && React.createElement(HelpIcon, { text: tooltips.controls.scheduleDays, size: 10 })
                    ),
                    React.createElement('div', { 
                        style: { 
                            display: 'flex', 
                            gap: '2px',
                            justifyContent: 'space-between'
                        } 
                    },
                        DAYS.map((day, i) => 
                            React.createElement('button', {
                                key: day,
                                onClick: () => handleDayToggle(i),
                                onPointerDown: stopPropagation,
                                style: {
                                    padding: '4px 6px',
                                    fontSize: '9px',
                                    border: 'none',
                                    borderRadius: '3px',
                                    cursor: 'pointer',
                                    background: props.scheduleDays[i] 
                                        ? THEME.primaryRgba(0.4) 
                                        : 'rgba(255,255,255,0.1)',
                                    color: props.scheduleDays[i] 
                                        ? THEME.text 
                                        : 'rgba(255,255,255,0.4)',
                                    fontWeight: props.scheduleDays[i] ? 'bold' : 'normal'
                                }
                            }, day)
                        )
                    )
                ),

                // Next scheduled time display
                props.scheduleEnabled && props.nextScheduledTime && React.createElement('div', { 
                    style: { 
                        fontSize: '10px', 
                        color: THEME.success,
                        textAlign: 'center',
                        marginTop: '8px',
                        padding: '4px',
                        background: 'rgba(0,255,136,0.1)',
                        borderRadius: '4px'
                    } 
                }, `Next: ${formatNextTime(props.nextScheduledTime)}`),

                // No days selected warning
                props.scheduleEnabled && props.scheduleTime && !props.scheduleDays.some(d => d) && React.createElement('div', { 
                    style: { 
                        fontSize: '10px', 
                        color: THEME.error,
                        textAlign: 'center',
                        marginTop: '8px'
                    } 
                }, '⚠️ No days selected')
            ),

            // Stats
            React.createElement('div', { style: statsStyle },
                `Triggers: ${props.triggerCount}`
            ),

            // Output socket - must use data.outputs to get socket object
            React.createElement('div', { style: { display: 'flex', justifyContent: 'flex-end', marginTop: '12px' } },
                Object.entries(data.outputs).map(([key, output]) =>
                    React.createElement('div', { key, style: { display: 'flex', alignItems: 'center', gap: '6px' } },
                        React.createElement('span', { style: { fontSize: '10px', color: THEME.text } }, output.label || 'Output'),
                        React.createElement(RefComponent, {
                            init: (ref) => emit({ type: 'render', data: { type: 'socket', side: 'output', key, nodeId: data.id, element: ref, payload: output.socket } }),
                            unmount: (ref) => emit({ type: 'unmount', data: { element: ref } })
                        })
                    )
                )
            )
        );
    }

    // -------------------------------------------------------------------------
    // REGISTER
    // -------------------------------------------------------------------------
    if (window.nodeRegistry) {
        window.nodeRegistry.register('InjectNode', {
            label: "Inject",
            category: "Timer/Event",
            nodeClass: InjectNode,
            component: InjectNodeComponent,
            factory: (cb) => new InjectNode(cb)
        });
    }
})();
