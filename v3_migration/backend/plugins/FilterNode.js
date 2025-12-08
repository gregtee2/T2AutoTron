// ============================================================================
// FilterNode.js - Filter/RBE (Report by Exception) Node
// Only pass values when they change (block duplicates)
// ============================================================================

(function() {
    // Dependency checks
    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets) {
        console.error("[FilterNode] Missing core dependencies");
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
        node: "Filter Node (RBE - Report by Exception): Only outputs when the input value changes. Blocks duplicate consecutive values. Useful for preventing redundant device commands or reducing unnecessary updates.",
        inputs: {
            input: "The value to filter. Only passes through when different from the previous value."
        },
        outputs: {
            output: "Outputs the value only when it changes from the previous value.",
            changed: "Outputs true briefly when a change is detected."
        },
        controls: {
            mode: "Filter mode: 'block' blocks all duplicates, 'deadband' allows changes within a tolerance, 'rate' limits how often values can pass.",
            deadband: "For deadband mode: value must change by at least this amount to pass through.",
            rate: "For rate mode: minimum time (ms) between outputs."
        }
    };

    // -------------------------------------------------------------------------
    // NODE CLASS
    // -------------------------------------------------------------------------
    class FilterNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("Filter");
            this.width = 220;
            this.changeCallback = changeCallback;

            this.properties = {
                mode: 'block', // 'block', 'deadband', 'rate'
                deadband: 0,
                rateMs: 1000,
                lastValue: undefined,
                lastOutputTime: 0,
                passCount: 0,
                blockCount: 0,
                lastWasBlocked: false,
                debug: false
            };

            this._changeFlag = false;
            this._firstRun = true;

            // Inputs
            this.addInput("input", new ClassicPreset.Input(
                sockets.any || new ClassicPreset.Socket('any'),
                "Input"
            ));

            // Outputs
            this.addOutput("output", new ClassicPreset.Output(
                sockets.any || new ClassicPreset.Socket('any'),
                "Output"
            ));
            this.addOutput("changed", new ClassicPreset.Output(
                sockets.boolean || new ClassicPreset.Socket('boolean'),
                "Changed"
            ));
        }

        _shouldPass(newValue) {
            const props = this.properties;
            const now = Date.now();

            // First value always passes
            if (this._firstRun) {
                this._firstRun = false;
                props.lastValue = newValue;
                props.lastOutputTime = now;
                return true;
            }

            switch (props.mode) {
                case 'block':
                    // Block if value is identical
                    if (this._valuesEqual(newValue, props.lastValue)) {
                        return false;
                    }
                    break;

                case 'deadband':
                    // For numbers, check if change exceeds deadband
                    if (typeof newValue === 'number' && typeof props.lastValue === 'number') {
                        if (Math.abs(newValue - props.lastValue) < props.deadband) {
                            return false;
                        }
                    } else {
                        // For non-numbers, fall back to equality check
                        if (this._valuesEqual(newValue, props.lastValue)) {
                            return false;
                        }
                    }
                    break;

                case 'rate':
                    // Block if not enough time has passed
                    if (now - props.lastOutputTime < props.rateMs) {
                        return false;
                    }
                    break;
            }

            props.lastValue = newValue;
            props.lastOutputTime = now;
            return true;
        }

        _valuesEqual(a, b) {
            // Handle object comparison
            if (typeof a === 'object' && typeof b === 'object') {
                try {
                    return JSON.stringify(a) === JSON.stringify(b);
                } catch (e) {
                    return a === b;
                }
            }
            return a === b;
        }

        data(inputs) {
            const input = inputs.input?.[0];
            const props = this.properties;

            // If no input connected, pass through undefined
            if (input === undefined) {
                return { output: undefined, changed: false };
            }

            const shouldPass = this._shouldPass(input);
            
            if (shouldPass) {
                props.passCount++;
                props.lastWasBlocked = false;
                this._changeFlag = true;
                
                // Clear change flag after a short delay
                setTimeout(() => {
                    this._changeFlag = false;
                    if (this.changeCallback) this.changeCallback();
                }, 100);
                
                if (this.changeCallback) this.changeCallback();
                return { output: input, changed: true };
            } else {
                props.blockCount++;
                props.lastWasBlocked = true;
                if (this.changeCallback) this.changeCallback();
                // Return last known value but indicate no change
                return { output: props.lastValue, changed: false };
            }
        }

        reset() {
            this.properties.lastValue = undefined;
            this.properties.lastOutputTime = 0;
            this._firstRun = true;
            if (this.changeCallback) this.changeCallback();
        }

        restore(state) {
            if (state.properties) {
                // Only restore configuration, not runtime state
                this.properties.mode = state.properties.mode || 'block';
                this.properties.deadband = state.properties.deadband || 0;
                this.properties.rateMs = state.properties.rateMs || 1000;
            }
            // Reset runtime state
            this.properties.lastValue = undefined;
            this.properties.passCount = 0;
            this.properties.blockCount = 0;
            this._firstRun = true;
        }
    }

    // -------------------------------------------------------------------------
    // REACT COMPONENT
    // -------------------------------------------------------------------------
    function FilterNodeComponent({ data, emit }) {
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

        const handleModeChange = useCallback((e) => {
            props.mode = e.target.value;
            data.reset && data.reset();
            forceUpdate(n => n + 1);
        }, [data, props]);

        const handleDeadbandChange = useCallback((e) => {
            props.deadband = parseFloat(e.target.value) || 0;
            forceUpdate(n => n + 1);
        }, [props]);

        const handleRateChange = useCallback((e) => {
            props.rateMs = parseInt(e.target.value) || 100;
            forceUpdate(n => n + 1);
        }, [props]);

        const handleReset = useCallback(() => {
            if (data.reset) data.reset();
        }, [data]);

        // Styles
        const containerStyle = {
            padding: '12px',
            background: 'linear-gradient(135deg, #0a0f14 0%, #1a1f24 100%)',
            borderRadius: '8px',
            fontFamily: 'monospace',
            minWidth: '200px'
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
            maxWidth: '70px'
        };

        const statsStyle = {
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '10px',
            color: 'rgba(255,255,255,0.5)',
            marginTop: '8px',
            padding: '6px',
            background: 'rgba(0,0,0,0.3)',
            borderRadius: '4px'
        };

        const indicatorStyle = {
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: props.lastWasBlocked ? THEME.warning : THEME.success,
            marginLeft: '8px',
            boxShadow: `0 0 6px ${props.lastWasBlocked ? THEME.warning : THEME.success}`
        };

        const resetButtonStyle = {
            background: 'rgba(255,255,255,0.1)',
            border: `1px solid ${THEME.border}`,
            borderRadius: '4px',
            color: THEME.text,
            padding: '4px 8px',
            fontSize: '10px',
            cursor: 'pointer'
        };

        const socketContainerStyle = {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: '12px'
        };

        const socketRowStyle = {
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
        };

        return React.createElement('div', { style: containerStyle },
            // Header with status indicator
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' } },
                NodeHeader ? React.createElement(NodeHeader, {
                    icon: '🚰',
                    title: 'Filter',
                    tooltip: tooltips.node
                }) : React.createElement('span', { style: { color: THEME.primary, fontWeight: 'bold' } }, '🚰 Filter'),
                React.createElement('div', { style: indicatorStyle, title: props.lastWasBlocked ? 'Last: Blocked' : 'Last: Passed' })
            ),

            // Mode Select
            React.createElement('div', { style: rowStyle },
                React.createElement('span', { style: labelStyle }, 
                    'Mode',
                    HelpIcon && React.createElement(HelpIcon, { text: tooltips.controls.mode, size: 10 })
                ),
                React.createElement('select', {
                    style: selectStyle,
                    value: props.mode,
                    onChange: handleModeChange,
                    onPointerDown: stopPropagation
                },
                    React.createElement('option', { value: 'block' }, 'Block Dupes'),
                    React.createElement('option', { value: 'deadband' }, 'Deadband'),
                    React.createElement('option', { value: 'rate' }, 'Rate Limit')
                )
            ),

            // Deadband value (only for deadband mode)
            props.mode === 'deadband' && React.createElement('div', { style: rowStyle },
                React.createElement('span', { style: labelStyle }, 
                    'Tolerance',
                    HelpIcon && React.createElement(HelpIcon, { text: tooltips.controls.deadband, size: 10 })
                ),
                React.createElement('input', {
                    type: 'number',
                    style: inputStyle,
                    value: props.deadband,
                    onChange: handleDeadbandChange,
                    onPointerDown: stopPropagation,
                    min: 0,
                    step: 0.1
                })
            ),

            // Rate limit value (only for rate mode)
            props.mode === 'rate' && React.createElement('div', { style: rowStyle },
                React.createElement('span', { style: labelStyle }, 
                    'Min Interval',
                    HelpIcon && React.createElement(HelpIcon, { text: tooltips.controls.rate, size: 10 })
                ),
                React.createElement('input', {
                    type: 'number',
                    style: inputStyle,
                    value: props.rateMs,
                    onChange: handleRateChange,
                    onPointerDown: stopPropagation,
                    min: 100,
                    step: 100
                }),
                React.createElement('span', { style: { fontSize: '10px', color: 'rgba(255,255,255,0.5)' } }, 'ms')
            ),

            // Stats
            React.createElement('div', { style: statsStyle },
                React.createElement('span', null, `✓ ${props.passCount}`),
                React.createElement('span', null, `✗ ${props.blockCount}`),
                React.createElement('button', {
                    style: resetButtonStyle,
                    onClick: handleReset,
                    onPointerDown: stopPropagation,
                    title: 'Reset filter state'
                }, 'Reset')
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
        window.nodeRegistry.register('FilterNode', {
            label: "Filter",
            category: "Logic",
            nodeClass: FilterNode,
            component: FilterNodeComponent,
            factory: (cb) => new FilterNode(cb)
        });
    }
})();
