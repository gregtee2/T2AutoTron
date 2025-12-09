// ============================================================================
// SmoothNode.js - Smooth/Average Node (Node-RED Style)
// Calculate rolling average of incoming values
// ============================================================================

(function() {
    // Dependency checks
    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets) {
        console.error("[SmoothNode] Missing core dependencies");
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
        node: "Smooth/Average Node: Calculates a rolling average of incoming numeric values. Useful for smoothing noisy sensor data, temperature readings, or any fluctuating values.",
        inputs: {
            input: "Numeric value to add to the rolling average.",
            reset: "Truthy value clears the sample buffer and starts fresh."
        },
        outputs: {
            average: "The calculated average of the last N samples.",
            min: "The minimum value in the current sample buffer.",
            max: "The maximum value in the current sample buffer."
        },
        controls: {
            samples: "Number of samples to keep in the rolling window (1-100).",
            mode: "Average: arithmetic mean. Median: middle value. EMA: exponential moving average.",
            alpha: "For EMA mode: smoothing factor (0-1). Lower = smoother, higher = more responsive."
        }
    };

    // -------------------------------------------------------------------------
    // NODE CLASS
    // -------------------------------------------------------------------------
    class SmoothNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("Smooth");
            this.width = 220;
            this.changeCallback = changeCallback;

            this.properties = {
                samples: 10,
                mode: 'average',  // 'average', 'median', 'ema'
                alpha: 0.2,       // EMA smoothing factor
                buffer: [],
                emaValue: null,
                currentAvg: null,
                currentMin: null,
                currentMax: null,
                debug: false
            };

            // Inputs
            this.addInput("input", new ClassicPreset.Input(
                sockets.number || new ClassicPreset.Socket('number'),
                "Input"
            ));
            this.addInput("reset", new ClassicPreset.Input(
                sockets.boolean || new ClassicPreset.Socket('boolean'),
                "Reset"
            ));

            // Outputs
            this.addOutput("average", new ClassicPreset.Output(
                sockets.number || new ClassicPreset.Socket('number'),
                "Average"
            ));
            this.addOutput("min", new ClassicPreset.Output(
                sockets.number || new ClassicPreset.Socket('number'),
                "Min"
            ));
            this.addOutput("max", new ClassicPreset.Output(
                sockets.number || new ClassicPreset.Socket('number'),
                "Max"
            ));
        }

        reset() {
            this.properties.buffer = [];
            this.properties.emaValue = null;
            this.properties.currentAvg = null;
            this.properties.currentMin = null;
            this.properties.currentMax = null;
            if (this.changeCallback) this.changeCallback();
        }

        _calculateAverage(buffer) {
            if (buffer.length === 0) return null;
            const sum = buffer.reduce((a, b) => a + b, 0);
            return sum / buffer.length;
        }

        _calculateMedian(buffer) {
            if (buffer.length === 0) return null;
            const sorted = [...buffer].sort((a, b) => a - b);
            const mid = Math.floor(sorted.length / 2);
            return sorted.length % 2 !== 0 
                ? sorted[mid] 
                : (sorted[mid - 1] + sorted[mid]) / 2;
        }

        _calculateEMA(newValue) {
            const props = this.properties;
            if (props.emaValue === null) {
                props.emaValue = newValue;
            } else {
                props.emaValue = props.alpha * newValue + (1 - props.alpha) * props.emaValue;
            }
            return props.emaValue;
        }

        data(inputs) {
            const props = this.properties;
            const input = inputs.input?.[0];
            const resetSignal = inputs.reset?.[0];

            // Handle reset
            if (resetSignal) {
                this.reset();
                return { average: null, min: null, max: null };
            }

            // Only process numeric values
            if (typeof input !== 'number' || isNaN(input)) {
                return { 
                    average: props.currentAvg, 
                    min: props.currentMin, 
                    max: props.currentMax 
                };
            }

            // Add to buffer
            props.buffer.push(input);

            // Trim buffer to max samples
            while (props.buffer.length > props.samples) {
                props.buffer.shift();
            }

            // Calculate based on mode
            let result;
            switch (props.mode) {
                case 'median':
                    result = this._calculateMedian(props.buffer);
                    break;
                case 'ema':
                    result = this._calculateEMA(input);
                    break;
                case 'average':
                default:
                    result = this._calculateAverage(props.buffer);
                    break;
            }

            // Calculate min/max
            props.currentAvg = result;
            props.currentMin = Math.min(...props.buffer);
            props.currentMax = Math.max(...props.buffer);

            if (this.changeCallback) this.changeCallback();

            return { 
                average: props.currentAvg, 
                min: props.currentMin, 
                max: props.currentMax 
            };
        }

        restore(state) {
            if (state.properties) {
                this.properties.samples = state.properties.samples ?? 10;
                this.properties.mode = state.properties.mode ?? 'average';
                this.properties.alpha = state.properties.alpha ?? 0.2;
            }
            // Reset runtime state
            this.properties.buffer = [];
            this.properties.emaValue = null;
            this.properties.currentAvg = null;
            this.properties.currentMin = null;
            this.properties.currentMax = null;
        }

        serialize() {
            return {
                samples: this.properties.samples,
                mode: this.properties.mode,
                alpha: this.properties.alpha
            };
        }
    }

    // -------------------------------------------------------------------------
    // REACT COMPONENT
    // -------------------------------------------------------------------------
    function SmoothNodeComponent({ data, emit }) {
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

        const handleSamplesChange = useCallback((e) => {
            props.samples = Math.max(1, Math.min(100, parseInt(e.target.value) || 10));
            forceUpdate(n => n + 1);
        }, [props]);

        const handleModeChange = useCallback((e) => {
            props.mode = e.target.value;
            forceUpdate(n => n + 1);
        }, [props]);

        const handleAlphaChange = useCallback((e) => {
            props.alpha = Math.max(0.01, Math.min(1, parseFloat(e.target.value) || 0.2));
            forceUpdate(n => n + 1);
        }, [props]);

        const handleReset = useCallback(() => {
            if (data.reset) data.reset();
        }, [data]);

        // Format number for display
        const formatNum = (n) => n !== null ? n.toFixed(2) : '—';

        // Status
        const hasData = props.buffer.length > 0;
        const statusColor = hasData ? THEME.success : THEME.textMuted;

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

        const selectStyle = {
            ...inputStyle,
            width: '80px',
            textAlign: 'left'
        };

        const displayBoxStyle = {
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            padding: '10px',
            margin: '8px 0',
            background: THEME.surfaceLight,
            borderRadius: '6px',
            border: `1px solid ${THEME.border}`
        };

        const valueRowStyle = {
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '11px'
        };

        const valueLabelStyle = {
            color: THEME.textMuted
        };

        const valueStyle = {
            color: THEME.primary,
            fontWeight: 'bold'
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

        const bufferIndicatorStyle = {
            fontSize: '10px',
            color: 'rgba(255,255,255,0.5)',
            textAlign: 'center',
            marginBottom: '8px'
        };

        // Get sockets
        const inputSocket = data.inputs?.input;
        const resetSocket = data.inputs?.reset;
        const avgOutput = data.outputs?.average;
        const minOutput = data.outputs?.min;
        const maxOutput = data.outputs?.max;

        return React.createElement('div', { style: containerStyle }, [
            // Header
            NodeHeader 
                ? React.createElement(NodeHeader, {
                    key: 'header',
                    icon: '📊',
                    title: 'Smooth',
                    tooltip: tooltips.node,
                    statusDot: true,
                    statusColor: statusColor
                })
                : React.createElement('div', { key: 'header', style: headerStyle }, [
                    React.createElement('span', { key: 'icon', style: { fontSize: '16px' } }, '📊'),
                    React.createElement('span', { key: 'title', style: { color: THEME.text, fontWeight: 'bold', flex: 1 } }, 'Smooth'),
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

            // Input socket
            inputSocket && React.createElement('div', { key: 'input-row', style: { ...rowStyle, marginBottom: '4px' } }, [
                React.createElement(RefComponent, {
                    key: 'input-socket',
                    init: ref => emit({ type: 'render', data: { type: 'socket', side: 'input', key: 'input', nodeId: data.id, element: ref, payload: inputSocket.socket } })
                }),
                React.createElement('span', { key: 'input-label', style: labelStyle }, [
                    'Input',
                    HelpIcon && React.createElement(HelpIcon, { key: 'help', text: tooltips.inputs.input, size: 10 })
                ])
            ]),

            // Reset socket
            resetSocket && React.createElement('div', { key: 'reset-row', style: { ...rowStyle, marginBottom: '8px' } }, [
                React.createElement(RefComponent, {
                    key: 'reset-socket',
                    init: ref => emit({ type: 'render', data: { type: 'socket', side: 'input', key: 'reset', nodeId: data.id, element: ref, payload: resetSocket.socket } })
                }),
                React.createElement('span', { key: 'reset-label', style: labelStyle }, [
                    'Reset',
                    HelpIcon && React.createElement(HelpIcon, { key: 'help', text: tooltips.inputs.reset, size: 10 })
                ])
            ]),

            // Buffer indicator
            React.createElement('div', { key: 'buffer', style: bufferIndicatorStyle }, 
                `Buffer: ${props.buffer.length} / ${props.samples} samples`
            ),

            // Values display
            React.createElement('div', { key: 'display', style: displayBoxStyle }, [
                React.createElement('div', { key: 'avg', style: valueRowStyle }, [
                    React.createElement('span', { key: 'label', style: valueLabelStyle }, 'Average:'),
                    React.createElement('span', { key: 'value', style: valueStyle }, formatNum(props.currentAvg))
                ]),
                React.createElement('div', { key: 'min', style: valueRowStyle }, [
                    React.createElement('span', { key: 'label', style: valueLabelStyle }, 'Min:'),
                    React.createElement('span', { key: 'value', style: valueStyle }, formatNum(props.currentMin))
                ]),
                React.createElement('div', { key: 'max', style: valueRowStyle }, [
                    React.createElement('span', { key: 'label', style: valueLabelStyle }, 'Max:'),
                    React.createElement('span', { key: 'value', style: valueStyle }, formatNum(props.currentMax))
                ])
            ]),

            // Samples setting
            React.createElement('div', { key: 'samples-row', style: rowStyle }, [
                React.createElement('span', { key: 'label', style: labelStyle }, [
                    'Samples:',
                    HelpIcon && React.createElement(HelpIcon, { key: 'help', text: tooltips.controls.samples, size: 10 })
                ]),
                React.createElement('input', {
                    key: 'input',
                    type: 'number',
                    min: 1,
                    max: 100,
                    value: props.samples,
                    onChange: handleSamplesChange,
                    onPointerDown: stopPropagation,
                    style: inputStyle
                })
            ]),

            // Mode selector
            React.createElement('div', { key: 'mode-row', style: rowStyle }, [
                React.createElement('span', { key: 'label', style: labelStyle }, [
                    'Mode:',
                    HelpIcon && React.createElement(HelpIcon, { key: 'help', text: tooltips.controls.mode, size: 10 })
                ]),
                React.createElement('select', {
                    key: 'select',
                    value: props.mode,
                    onChange: handleModeChange,
                    onPointerDown: stopPropagation,
                    style: selectStyle
                }, [
                    React.createElement('option', { key: 'avg', value: 'average' }, 'Average'),
                    React.createElement('option', { key: 'med', value: 'median' }, 'Median'),
                    React.createElement('option', { key: 'ema', value: 'ema' }, 'EMA')
                ])
            ]),

            // Alpha (for EMA mode)
            props.mode === 'ema' && React.createElement('div', { key: 'alpha-row', style: rowStyle }, [
                React.createElement('span', { key: 'label', style: labelStyle }, [
                    'Alpha:',
                    HelpIcon && React.createElement(HelpIcon, { key: 'help', text: tooltips.controls.alpha, size: 10 })
                ]),
                React.createElement('input', {
                    key: 'input',
                    type: 'number',
                    min: 0.01,
                    max: 1,
                    step: 0.05,
                    value: props.alpha,
                    onChange: handleAlphaChange,
                    onPointerDown: stopPropagation,
                    style: inputStyle
                })
            ]),

            // Reset button
            React.createElement('button', {
                key: 'reset-btn',
                onClick: handleReset,
                onPointerDown: stopPropagation,
                style: buttonStyle
            }, 'Clear Buffer'),

            // Output sockets
            React.createElement('div', { 
                key: 'outputs',
                style: { marginTop: '12px', borderTop: `1px solid ${THEME.border}`, paddingTop: '8px' }
            }, [
                avgOutput && React.createElement('div', { key: 'avg-out', style: { ...rowStyle, justifyContent: 'flex-end' } }, [
                    React.createElement('span', { key: 'label', style: labelStyle }, 'Average'),
                    React.createElement(RefComponent, {
                        key: 'avg-socket',
                        init: ref => emit({ type: 'render', data: { type: 'socket', side: 'output', key: 'average', nodeId: data.id, element: ref, payload: avgOutput.socket } })
                    })
                ]),
                minOutput && React.createElement('div', { key: 'min-out', style: { ...rowStyle, justifyContent: 'flex-end' } }, [
                    React.createElement('span', { key: 'label', style: labelStyle }, 'Min'),
                    React.createElement(RefComponent, {
                        key: 'min-socket',
                        init: ref => emit({ type: 'render', data: { type: 'socket', side: 'output', key: 'min', nodeId: data.id, element: ref, payload: minOutput.socket } })
                    })
                ]),
                maxOutput && React.createElement('div', { key: 'max-out', style: { ...rowStyle, justifyContent: 'flex-end' } }, [
                    React.createElement('span', { key: 'label', style: labelStyle }, 'Max'),
                    React.createElement(RefComponent, {
                        key: 'max-socket',
                        init: ref => emit({ type: 'render', data: { type: 'socket', side: 'output', key: 'max', nodeId: data.id, element: ref, payload: maxOutput.socket } })
                    })
                ])
            ])
        ]);
    }

    // -------------------------------------------------------------------------
    // REGISTRATION
    // -------------------------------------------------------------------------
    if (window.nodeRegistry) {
        window.nodeRegistry.register('SmoothNode', {
            label: "Smooth",
            category: "Utility",
            nodeClass: SmoothNode,
            component: SmoothNodeComponent,
            factory: (cb) => new SmoothNode(cb)
        });
    }
})();
