// ============================================================================
// WatchdogNode.js - Alert when no input received within timeout period
// Detects offline sensors, stale data, or missing heartbeats
// ============================================================================

(function() {
    // Dependency checks
    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets) {
        console.error("[WatchdogNode] Missing core dependencies");
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect, useCallback, useRef } = React;
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
        node: "Watchdog Node: Monitors for missing inputs. If no message is received within the timeout period, outputs an alert. Useful for detecting offline sensors or stale data.",
        inputs: {
            input: "Any input value. Each input resets the watchdog timer.",
            reset: "Boolean true resets the watchdog and clears any alert."
        },
        outputs: {
            alert: "Outputs true when timeout expires (no input received). Resets to false when input arrives.",
            lastSeen: "Outputs time in seconds since last input was received.",
            passthrough: "Passes through the input value unchanged (for chaining)."
        },
        controls: {
            timeout: "Time in seconds to wait before triggering alert (1-3600).",
            mode: "'alert' outputs once when timeout expires. 'repeat' continues outputting while timed out."
        }
    };

    // -------------------------------------------------------------------------
    // NODE CLASS
    // -------------------------------------------------------------------------
    class WatchdogNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("Watchdog");
            this.width = 220;
            this.changeCallback = changeCallback;

            this.properties = {
                timeout: 60,        // seconds
                mode: 'alert',      // 'alert' = once, 'repeat' = continuous
                lastInputTime: null,
                isTimedOut: false,
                alertFired: false,
                debug: false
            };

            // Inputs
            this.addInput("input", new ClassicPreset.Input(
                sockets.any || new ClassicPreset.Socket('any'),
                "Input"
            ));
            this.addInput("reset", new ClassicPreset.Input(
                sockets.boolean || new ClassicPreset.Socket('boolean'),
                "Reset"
            ));

            // Outputs
            this.addOutput("alert", new ClassicPreset.Output(
                sockets.boolean || new ClassicPreset.Socket('boolean'),
                "Alert"
            ));
            this.addOutput("lastSeen", new ClassicPreset.Output(
                sockets.number || new ClassicPreset.Socket('number'),
                "Last Seen (s)"
            ));
            this.addOutput("passthrough", new ClassicPreset.Output(
                sockets.any || new ClassicPreset.Socket('any'),
                "Passthrough"
            ));
        }

        data(inputs) {
            const inputVal = inputs.input?.[0];
            const resetVal = inputs.reset?.[0];
            const now = Date.now();

            // Handle reset
            if (resetVal === true) {
                this.properties.isTimedOut = false;
                this.properties.alertFired = false;
                this.properties.lastInputTime = now;
                return { alert: false, lastSeen: 0, passthrough: null };
            }

            // Handle input received
            if (inputVal !== undefined) {
                this.properties.lastInputTime = now;
                this.properties.isTimedOut = false;
                this.properties.alertFired = false;
                return { alert: false, lastSeen: 0, passthrough: inputVal };
            }

            // Check for timeout
            if (this.properties.lastInputTime) {
                const elapsed = (now - this.properties.lastInputTime) / 1000;
                const timedOut = elapsed >= this.properties.timeout;

                if (timedOut) {
                    this.properties.isTimedOut = true;
                    
                    // In 'alert' mode, only fire once
                    if (this.properties.mode === 'alert') {
                        if (!this.properties.alertFired) {
                            this.properties.alertFired = true;
                            return { alert: true, lastSeen: elapsed, passthrough: null };
                        }
                        return { alert: false, lastSeen: elapsed, passthrough: null };
                    }
                    
                    // In 'repeat' mode, keep firing
                    return { alert: true, lastSeen: elapsed, passthrough: null };
                }

                return { alert: false, lastSeen: elapsed, passthrough: null };
            }

            // No input ever received
            return { alert: false, lastSeen: 0, passthrough: null };
        }

        restore(state) {
            if (state.properties) {
                Object.assign(this.properties, state.properties);
            }
        }

        serialize() {
            return {
                timeout: this.properties.timeout,
                mode: this.properties.mode,
                debug: this.properties.debug
            };
        }
    }

    // -------------------------------------------------------------------------
    // REACT COMPONENT
    // -------------------------------------------------------------------------
    function WatchdogNodeComponent({ data, emit }) {
        const [timeout, setTimeout_] = useState(data.properties.timeout || 60);
        const [mode, setMode] = useState(data.properties.mode || 'alert');
        const [lastSeen, setLastSeen] = useState(0);
        const [isTimedOut, setIsTimedOut] = useState(false);
        const intervalRef = useRef(null);

        // Sync with node properties
        useEffect(() => {
            const originalCallback = data.changeCallback;
            data.changeCallback = () => {
                setTimeout_(data.properties.timeout);
                setMode(data.properties.mode);
                setIsTimedOut(data.properties.isTimedOut);
                if (originalCallback) originalCallback();
            };
            return () => { data.changeCallback = originalCallback; };
        }, [data]);

        // Update last seen display periodically
        useEffect(() => {
            intervalRef.current = setInterval(() => {
                if (data.properties.lastInputTime) {
                    const elapsed = (Date.now() - data.properties.lastInputTime) / 1000;
                    setLastSeen(Math.round(elapsed));
                    setIsTimedOut(elapsed >= data.properties.timeout);
                }
            }, 1000);
            return () => clearInterval(intervalRef.current);
        }, [data.properties]);

        const handleTimeoutChange = useCallback((e) => {
            const val = Math.max(1, Math.min(3600, parseInt(e.target.value) || 60));
            setTimeout_(val);
            data.properties.timeout = val;
        }, [data]);

        // Status color
        let statusColor = '#888'; // gray = waiting
        let statusText = 'Waiting';
        if (data.properties.lastInputTime) {
            if (isTimedOut) {
                statusColor = THEME.error;
                statusText = 'Timeout!';
            } else {
                statusColor = THEME.success;
                statusText = 'Active';
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

        return React.createElement('div', { style: nodeStyle }, [
            // Header
            NodeHeader && React.createElement(NodeHeader, {
                key: 'header',
                icon: '🐕',
                title: 'Watchdog',
                tooltip: tooltips.node,
                statusDot: true,
                statusColor: statusColor
            }),

            // Timeout input
            React.createElement('div', { key: 'timeout-row', style: { marginBottom: '8px' } }, [
                React.createElement('label', { 
                    key: 'label',
                    style: { fontSize: '10px', color: THEME.textMuted, display: 'flex', alignItems: 'center', gap: '4px' }
                }, [
                    'Timeout (seconds)',
                    HelpIcon && React.createElement(HelpIcon, { key: 'help', text: tooltips.controls.timeout, size: 10 })
                ]),
                React.createElement('input', {
                    key: 'input',
                    type: 'number',
                    value: timeout,
                    min: 1,
                    max: 3600,
                    onChange: handleTimeoutChange,
                    onPointerDown: stopPropagation,
                    style: inputStyle
                })
            ]),

            // Mode selector
            React.createElement('div', { key: 'mode-row', style: { marginBottom: '8px' } }, [
                React.createElement('label', {
                    key: 'label',
                    style: { fontSize: '10px', color: THEME.textMuted, display: 'flex', alignItems: 'center', gap: '4px' }
                }, [
                    'Mode',
                    HelpIcon && React.createElement(HelpIcon, { key: 'help', text: tooltips.controls.mode, size: 10 })
                ]),
                React.createElement('select', {
                    key: 'select',
                    value: mode,
                    onChange: (e) => {
                        setMode(e.target.value);
                        data.properties.mode = e.target.value;
                    },
                    onPointerDown: stopPropagation,
                    style: inputStyle
                }, [
                    React.createElement('option', { key: 'alert', value: 'alert' }, 'Alert (once)'),
                    React.createElement('option', { key: 'repeat', value: 'repeat' }, 'Repeat (continuous)')
                ])
            ]),

            // Stats display
            React.createElement('div', { key: 'stats', style: statStyle }, [
                React.createElement('span', { key: 'status' }, `Status: ${statusText}`),
                React.createElement('span', { key: 'lastseen' }, `Last: ${lastSeen}s ago`)
            ]),

            // Socket containers
            React.createElement('div', { key: 'inputs', className: 'io-container' },
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
            React.createElement('div', { key: 'outputs', className: 'io-container' },
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
        window.nodeRegistry.register('WatchdogNode', {
            label: "Watchdog",
            category: "Logic",
            nodeClass: WatchdogNode,
            component: WatchdogNodeComponent,
            factory: (cb) => new WatchdogNode(cb)
        });
        console.log("[WatchdogNode] Registered successfully");
    } else {
        console.error("[WatchdogNode] nodeRegistry not found");
    }

})();
