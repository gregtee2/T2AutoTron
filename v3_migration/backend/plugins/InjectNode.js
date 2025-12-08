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
        primary: '#00f3ff',
        primaryRgba: (a) => `rgba(0, 243, 255, ${a})`,
        border: 'rgba(0, 243, 255, 0.3)',
        success: '#00ff88',
        warning: '#ffaa00',
        error: '#ff4444',
        background: '#0a0f14',
        text: '#e0f7fa'
    };
    
    const NodeHeader = T2Controls.NodeHeader;
    const HelpIcon = T2Controls.HelpIcon;

    const stopPropagation = (e) => e.stopPropagation();

    // Tooltip definitions
    const tooltips = {
        node: "Inject Node: Manually trigger flows or set up automatic interval-based triggers. Use the button to fire immediately, or configure repeat mode for automatic triggering.",
        outputs: {
            output: "Outputs the configured payload value when triggered."
        },
        controls: {
            payload: "The value to output when triggered. Options: true, false, timestamp (current time in ms), or custom number.",
            repeat: "How often to automatically trigger. Set to 0 for manual-only mode.",
            button: "Click to immediately trigger the output."
        }
    };

    // -------------------------------------------------------------------------
    // NODE CLASS
    // -------------------------------------------------------------------------
    class InjectNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("Inject");
            this.width = 220;
            this.changeCallback = changeCallback;

            this.properties = {
                payloadType: 'boolean', // 'boolean', 'timestamp', 'number'
                payloadValue: true,
                repeatMs: 0,  // 0 = no repeat, otherwise interval in ms
                lastTriggerTime: null,
                triggerCount: 0,
                isRepeating: false,
                debug: false
            };

            // Timer for repeat mode
            this._repeatTimer = null;
            this._shouldOutput = false;

            // Outputs only - this is a source node
            this.addOutput("output", new ClassicPreset.Output(
                sockets.any || new ClassicPreset.Socket('any'),
                "Output"
            ));
        }

        // Manual trigger from UI button
        trigger() {
            this._shouldOutput = true;
            this.properties.lastTriggerTime = Date.now();
            this.properties.triggerCount++;
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
                    return this.properties.payloadValue;
                case 'timestamp':
                    return Date.now();
                case 'number':
                    return Number(this.properties.payloadValue) || 0;
                default:
                    return this.properties.payloadValue;
            }
        }

        data(inputs) {
            // Check if we should output (triggered)
            if (this._shouldOutput) {
                this._shouldOutput = false;
                return { output: this._getPayload() };
            }
            
            // When not triggered, still return the last value for downstream
            // This allows the flow to continue processing
            return { output: this._getPayload() };
        }

        restore(state) {
            if (state.properties) {
                Object.assign(this.properties, state.properties);
                // Don't restore transient state
                this.properties.isRepeating = false;
                this.properties.lastTriggerTime = null;
            }
        }

        destroy() {
            this.stopRepeat();
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
            }
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

        // Styles
        const containerStyle = {
            padding: '12px',
            background: 'linear-gradient(135deg, #0a0f14 0%, #1a1f24 100%)',
            borderRadius: '8px',
            fontFamily: 'monospace',
            minWidth: '200px'
        };

        const buttonStyle = {
            width: '100%',
            padding: '10px',
            background: `linear-gradient(135deg, ${THEME.primary} 0%, #0088aa 100%)`,
            border: 'none',
            borderRadius: '6px',
            color: '#000',
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
            background: '#1a1f24',
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

        const repeatButtonStyle = {
            ...buttonStyle,
            background: props.isRepeating 
                ? `linear-gradient(135deg, ${THEME.success} 0%, #00aa66 100%)`
                : `linear-gradient(135deg, #444 0%, #333 100%)`,
            padding: '6px 12px',
            fontSize: '11px'
        };

        const statsStyle = {
            fontSize: '10px',
            color: 'rgba(255,255,255,0.5)',
            textAlign: 'center',
            marginTop: '8px'
        };

        return React.createElement('div', { style: containerStyle },
            // Header
            NodeHeader && React.createElement(NodeHeader, {
                icon: '💉',
                title: 'Inject',
                tooltip: tooltips.node,
                statusDot: true,
                statusColor: props.isRepeating ? THEME.success : '#555'
            }),

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
                    React.createElement('option', { value: 'timestamp' }, 'Timestamp'),
                    React.createElement('option', { value: 'number' }, 'Number')
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

            props.payloadType === 'timestamp' && React.createElement('div', { style: rowStyle },
                React.createElement('span', { style: { ...labelStyle, fontStyle: 'italic', opacity: 0.7 } }, 
                    'Current timestamp on trigger'
                )
            ),

            // Repeat Interval
            React.createElement('div', { style: { ...rowStyle, marginTop: '12px', paddingTop: '12px', borderTop: `1px solid ${THEME.border}` } },
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
