// ============================================================================
// DebugNode.js - Debug/Log Node (Node-RED Style)  
// Display and log values passing through for debugging automations
// ============================================================================

(function() {
    // Debug: console.log("[DebugNode] Loading plugin...");
    
    // Dependency checks
    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets) {
        console.error("[DebugNode] Missing core dependencies", {
            Rete: !!window.Rete,
            React: !!window.React,
            RefComponent: !!window.RefComponent,
            sockets: !!window.sockets
        });
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
        node: "Debug Node: Displays values passing through for debugging. Shows a log of recent values with timestamps. Can optionally log to browser console.",
        inputs: {
            input: "The value to display and optionally log."
        },
        outputs: {
            output: "Passes the input value through unchanged."
        },
        controls: {
            name: "Optional name to identify this debug point in logs.",
            toConsole: "If enabled, also logs values to browser console.",
            maxHistory: "Number of previous values to keep in the history."
        }
    };

    // -------------------------------------------------------------------------
    // NODE CLASS
    // -------------------------------------------------------------------------
    class DebugNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("Debug");
            this.width = 260;
            this.changeCallback = changeCallback;

            this.properties = {
                name: '',
                toConsole: false,
                maxHistory: 10,
                enabled: true,
                history: [], // { time, value, type }
                currentValue: null,
                messageCount: 0
            };

            // Input
            this.addInput("input", new ClassicPreset.Input(
                sockets.any || new ClassicPreset.Socket('any'),
                "Input"
            ));

            // Pass-through output
            this.addOutput("output", new ClassicPreset.Output(
                sockets.any || new ClassicPreset.Socket('any'),
                "Output"
            ));
        }

        _addToHistory(value) {
            const props = this.properties;
            
            const entry = {
                time: new Date().toLocaleTimeString(),
                timestamp: Date.now(),
                value: value,
                type: typeof value
            };

            props.history.unshift(entry);
            
            // Trim history
            while (props.history.length > props.maxHistory) {
                props.history.pop();
            }

            // Console logging
            if (props.toConsole) {
                const prefix = props.name ? `[Debug: ${props.name}]` : '[Debug]';
                console.log(prefix, value);
            }
        }

        data(inputs) {
            const input = inputs.input?.[0];
            const props = this.properties;

            if (props.enabled && input !== undefined) {
                // Only log if value changed
                if (input !== props.currentValue || typeof input === 'object') {
                    props.currentValue = input;
                    props.messageCount++;
                    this._addToHistory(input);
                    if (this.changeCallback) this.changeCallback();
                }
            }

            // Pass through unchanged
            return { output: input };
        }

        clearHistory() {
            this.properties.history = [];
            this.properties.messageCount = 0;
            if (this.changeCallback) this.changeCallback();
        }

        restore(state) {
            if (state.properties) {
                this.properties.name = state.properties.name || '';
                this.properties.toConsole = state.properties.toConsole ?? false;
                this.properties.maxHistory = state.properties.maxHistory || 10;
                this.properties.enabled = state.properties.enabled ?? true;
            }
            // Reset runtime state
            this.properties.history = [];
            this.properties.currentValue = null;
            this.properties.messageCount = 0;
        }
    }

    // -------------------------------------------------------------------------
    // REACT COMPONENT
    // -------------------------------------------------------------------------
    function DebugNodeComponent({ data, emit }) {
        const [, forceUpdate] = useState(0);
        const props = data.properties;
        const historyRef = useRef(null);

        useEffect(() => {
            const originalCallback = data.changeCallback;
            data.changeCallback = () => {
                forceUpdate(n => n + 1);
                if (originalCallback) originalCallback();
            };
            return () => { data.changeCallback = originalCallback; };
        }, [data]);

        const handleClear = useCallback(() => {
            if (data.clearHistory) data.clearHistory();
        }, [data]);

        const formatValue = (value) => {
            if (value === null) return 'null';
            if (value === undefined) return 'undefined';
            if (typeof value === 'boolean') return value ? 'true' : 'false';
            if (typeof value === 'object') {
                try {
                    return JSON.stringify(value, null, 2);
                } catch (e) {
                    return '[Object]';
                }
            }
            return String(value);
        };

        const getTypeColor = (type) => {
            switch (type) {
                case 'boolean': return '#ff88ff';
                case 'number': return '#88ff88';
                case 'string': return '#ffff88';
                case 'object': return '#88ffff';
                default: return THEME.text;
            }
        };

        // Styles
        const containerStyle = {
            padding: '12px',
            background: 'linear-gradient(135deg, #0a0f14 0%, #1a1f24 100%)',
            borderRadius: '8px',
            fontFamily: 'monospace',
            minWidth: '240px'
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
            background: '#1a1f24',
            border: `1px solid ${THEME.border}`,
            borderRadius: '4px',
            color: THEME.text,
            padding: '4px 8px',
            fontSize: '11px',
            flex: 1
        };

        const historyContainerStyle = {
            maxHeight: '150px',
            overflowY: 'auto',
            background: 'rgba(0,0,0,0.4)',
            borderRadius: '4px',
            padding: '4px',
            marginBottom: '8px'
        };

        const historyEntryStyle = {
            padding: '4px 6px',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            fontSize: '10px'
        };

        const timeStyle = {
            color: 'rgba(255,255,255,0.4)',
            marginRight: '8px'
        };

        const valueDisplayStyle = {
            wordBreak: 'break-all',
            whiteSpace: 'pre-wrap',
            maxHeight: '60px',
            overflow: 'hidden'
        };

        const currentValueStyle = {
            padding: '10px',
            background: `linear-gradient(135deg, ${THEME.primary}22 0%, ${THEME.primary}11 100%)`,
            borderRadius: '4px',
            border: `1px solid ${THEME.primary}44`,
            marginBottom: '8px',
            fontSize: '13px',
            fontWeight: 'bold',
            textAlign: 'center',
            color: THEME.primary,
            wordBreak: 'break-all',
            maxHeight: '80px',
            overflow: 'auto'
        };

        const headerRowStyle = {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '8px'
        };

        const buttonStyle = {
            background: 'rgba(255,255,255,0.1)',
            border: `1px solid ${THEME.border}`,
            borderRadius: '4px',
            color: THEME.text,
            padding: '4px 8px',
            fontSize: '10px',
            cursor: 'pointer'
        };

        const countBadgeStyle = {
            background: THEME.primary,
            color: '#000',
            padding: '2px 6px',
            borderRadius: '10px',
            fontSize: '9px',
            fontWeight: 'bold'
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

        const toggleStyle = {
            width: '36px',
            height: '20px',
            borderRadius: '10px',
            background: props.enabled ? THEME.success : '#444',
            position: 'relative',
            cursor: 'pointer',
            transition: 'background 0.2s'
        };

        const toggleKnobStyle = {
            width: '16px',
            height: '16px',
            borderRadius: '50%',
            background: '#fff',
            position: 'absolute',
            top: '2px',
            left: props.enabled ? '18px' : '2px',
            transition: 'left 0.2s'
        };

        return React.createElement('div', { style: containerStyle },
            // Header with count and toggle
            React.createElement('div', { style: headerRowStyle },
                NodeHeader ? React.createElement(NodeHeader, {
                    icon: '🔍',
                    title: props.name || 'Debug',
                    tooltip: tooltips.node
                }) : React.createElement('span', { style: { color: THEME.primary, fontWeight: 'bold' } }, 
                    `🔍 ${props.name || 'Debug'}`
                ),
                React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                    React.createElement('span', { style: countBadgeStyle }, props.messageCount),
                    React.createElement('div', { 
                        style: toggleStyle,
                        onClick: () => {
                            props.enabled = !props.enabled;
                            forceUpdate(n => n + 1);
                        },
                        onPointerDown: stopPropagation,
                        title: props.enabled ? 'Disable' : 'Enable'
                    },
                        React.createElement('div', { style: toggleKnobStyle })
                    )
                )
            ),

            // Name input
            React.createElement('div', { style: rowStyle },
                React.createElement('span', { style: labelStyle }, 
                    'Name',
                    HelpIcon && React.createElement(HelpIcon, { text: tooltips.controls.name, size: 10 })
                ),
                React.createElement('input', {
                    type: 'text',
                    style: inputStyle,
                    value: props.name,
                    placeholder: 'Debug point name...',
                    onChange: (e) => {
                        props.name = e.target.value;
                        forceUpdate(n => n + 1);
                    },
                    onPointerDown: stopPropagation
                })
            ),

            // Current value display
            React.createElement('div', { style: currentValueStyle },
                formatValue(props.currentValue)
            ),

            // History
            props.history.length > 0 && React.createElement('div', { style: historyContainerStyle, ref: historyRef },
                props.history.map((entry, i) => 
                    React.createElement('div', { key: i, style: historyEntryStyle },
                        React.createElement('span', { style: timeStyle }, entry.time),
                        React.createElement('span', { 
                            style: { ...valueDisplayStyle, color: getTypeColor(entry.type) } 
                        }, formatValue(entry.value))
                    )
                )
            ),

            // Controls row
            React.createElement('div', { style: rowStyle },
                React.createElement('label', { style: { ...labelStyle, cursor: 'pointer' } },
                    React.createElement('input', {
                        type: 'checkbox',
                        checked: props.toConsole,
                        onChange: (e) => {
                            props.toConsole = e.target.checked;
                            forceUpdate(n => n + 1);
                        },
                        onPointerDown: stopPropagation,
                        style: { marginRight: '4px' }
                    }),
                    'Console',
                    HelpIcon && React.createElement(HelpIcon, { text: tooltips.controls.toConsole, size: 10 })
                ),
                React.createElement('button', {
                    style: buttonStyle,
                    onClick: handleClear,
                    onPointerDown: stopPropagation
                }, 'Clear')
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
        window.nodeRegistry.register('DebugNode', {
            label: "Debug",
            category: "Utility",
            nodeClass: DebugNode,
            component: DebugNodeComponent,
            factory: (cb) => new DebugNode(cb)
        });
        // console.log("[DebugNode] Registered successfully");
    } else {
        console.error("[DebugNode] window.nodeRegistry not found!");
    }
})();
