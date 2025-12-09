// ============================================================================
// ChangeNode.js - Change/Transform Node (Node-RED Style)
// Set, change, or transform values passing through
// ============================================================================

(function() {
    // Dependency checks
    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets) {
        console.error("[ChangeNode] Missing core dependencies");
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
        node: "Change Node: Transform values as they pass through. Can set to a fixed value, perform math operations, apply mappings, or pass through unchanged based on conditions.",
        inputs: {
            input: "The value to transform."
        },
        outputs: {
            output: "The transformed value."
        },
        controls: {
            action: "Set: replace with fixed value. Add/Multiply/etc: perform math. Map: remap range. Scale: apply multiplier. Invert: flip boolean/sign.",
            value: "The value to use for the operation."
        }
    };

    const ACTIONS = [
        { value: 'passthrough', label: 'Pass Through' },
        { value: 'set', label: 'Set To' },
        { value: 'add', label: 'Add' },
        { value: 'subtract', label: 'Subtract' },
        { value: 'multiply', label: 'Multiply By' },
        { value: 'divide', label: 'Divide By' },
        { value: 'scale', label: 'Scale (%)' },
        { value: 'map', label: 'Map Range' },
        { value: 'clamp', label: 'Clamp' },
        { value: 'round', label: 'Round' },
        { value: 'floor', label: 'Floor' },
        { value: 'ceil', label: 'Ceiling' },
        { value: 'abs', label: 'Absolute' },
        { value: 'invert', label: 'Invert' },
        { value: 'not', label: 'NOT (Boolean)' },
        { value: 'toString', label: 'To String' },
        { value: 'toNumber', label: 'To Number' },
        { value: 'toBoolean', label: 'To Boolean' }
    ];

    // -------------------------------------------------------------------------
    // NODE CLASS
    // -------------------------------------------------------------------------
    class ChangeNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("Change");
            this.width = 240;
            this.changeCallback = changeCallback;

            this.properties = {
                action: 'passthrough',
                value: 0,
                valueType: 'number', // 'number', 'boolean', 'string'
                // For map range
                inMin: 0,
                inMax: 100,
                outMin: 0,
                outMax: 255,
                // For clamp
                clampMin: 0,
                clampMax: 100,
                // For scale
                scalePercent: 100,
                // Stats
                lastInput: null,
                lastOutput: null,
                processCount: 0,
                debug: false
            };

            // Input
            this.addInput("input", new ClassicPreset.Input(
                sockets.any || new ClassicPreset.Socket('any'),
                "Input"
            ));

            // Output
            this.addOutput("output", new ClassicPreset.Output(
                sockets.any || new ClassicPreset.Socket('any'),
                "Output"
            ));
        }

        _transform(input) {
            const props = this.properties;
            const action = props.action;

            try {
                switch (action) {
                    case 'passthrough':
                        return input;

                    case 'set':
                        if (props.valueType === 'number') return Number(props.value) || 0;
                        if (props.valueType === 'boolean') return props.value === true || props.value === 'true';
                        return String(props.value);

                    case 'add':
                        return Number(input) + Number(props.value);

                    case 'subtract':
                        return Number(input) - Number(props.value);

                    case 'multiply':
                        return Number(input) * Number(props.value);

                    case 'divide':
                        const divisor = Number(props.value);
                        return divisor !== 0 ? Number(input) / divisor : 0;

                    case 'scale':
                        return Number(input) * (props.scalePercent / 100);

                    case 'map': {
                        const val = Number(input);
                        const { inMin, inMax, outMin, outMax } = props;
                        // Linear interpolation
                        const normalized = (val - inMin) / (inMax - inMin);
                        return outMin + normalized * (outMax - outMin);
                    }

                    case 'clamp':
                        return Math.min(Math.max(Number(input), props.clampMin), props.clampMax);

                    case 'round':
                        return Math.round(Number(input));

                    case 'floor':
                        return Math.floor(Number(input));

                    case 'ceil':
                        return Math.ceil(Number(input));

                    case 'abs':
                        return Math.abs(Number(input));

                    case 'invert':
                        // For numbers: negate. For booleans: NOT
                        if (typeof input === 'boolean') return !input;
                        if (typeof input === 'number') return -input;
                        return !input;

                    case 'not':
                        return !input;

                    case 'toString':
                        return String(input);

                    case 'toNumber':
                        return Number(input) || 0;

                    case 'toBoolean':
                        return Boolean(input);

                    default:
                        return input;
                }
            } catch (e) {
                return input;
            }
        }

        data(inputs) {
            const input = inputs.input?.[0];
            const props = this.properties;

            props.lastInput = input;
            const output = this._transform(input);
            props.lastOutput = output;
            props.processCount++;

            if (this.changeCallback) this.changeCallback();
            return { output };
        }

        restore(state) {
            if (state.properties) {
                Object.assign(this.properties, state.properties);
            }
            // Reset runtime state
            this.properties.lastInput = null;
            this.properties.lastOutput = null;
            this.properties.processCount = 0;
        }
    }

    // -------------------------------------------------------------------------
    // REACT COMPONENT
    // -------------------------------------------------------------------------
    function ChangeNodeComponent({ data, emit }) {
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
            flex: 1
        };

        const inputStyle = {
            ...selectStyle,
            maxWidth: '80px'
        };

        const previewStyle = {
            padding: '8px',
            background: THEME.surfaceLight,
            borderRadius: '4px',
            marginTop: '8px',
            fontSize: '10px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
        };

        const valueStyle = {
            color: THEME.primary,
            fontWeight: 'bold',
            maxWidth: '80px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
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

        // Determine which controls to show
        const needsValue = ['set', 'add', 'subtract', 'multiply', 'divide'].includes(props.action);
        const needsMapRange = props.action === 'map';
        const needsClamp = props.action === 'clamp';
        const needsScale = props.action === 'scale';

        const formatValue = (v) => {
            if (v === null || v === undefined) return '—';
            if (typeof v === 'object') return JSON.stringify(v).slice(0, 20);
            return String(v).slice(0, 20);
        };

        return React.createElement('div', { style: containerStyle },
            // Header
            NodeHeader ? React.createElement(NodeHeader, {
                icon: '🔄',
                title: 'Change',
                tooltip: tooltips.node
            }) : React.createElement('div', { style: { marginBottom: '8px' } },
                React.createElement('span', { style: { color: THEME.primary, fontWeight: 'bold' } }, '🔄 Change')
            ),

            // Action Select
            React.createElement('div', { style: rowStyle },
                React.createElement('span', { style: labelStyle }, 
                    'Action',
                    HelpIcon && React.createElement(HelpIcon, { text: tooltips.controls.action, size: 10 })
                ),
                React.createElement('select', {
                    style: selectStyle,
                    value: props.action,
                    onChange: (e) => {
                        props.action = e.target.value;
                        forceUpdate(n => n + 1);
                    },
                    onPointerDown: stopPropagation
                },
                    ACTIONS.map(a => 
                        React.createElement('option', { key: a.value, value: a.value }, a.label)
                    )
                )
            ),

            // Value for set/add/etc
            needsValue && React.createElement('div', null,
                React.createElement('div', { style: rowStyle },
                    React.createElement('span', { style: labelStyle }, 'Type'),
                    React.createElement('select', {
                        style: { ...selectStyle, maxWidth: '100px' },
                        value: props.valueType,
                        onChange: (e) => {
                            props.valueType = e.target.value;
                            if (e.target.value === 'number') props.value = 0;
                            else if (e.target.value === 'boolean') props.value = true;
                            else props.value = '';
                            forceUpdate(n => n + 1);
                        },
                        onPointerDown: stopPropagation
                    },
                        React.createElement('option', { value: 'number' }, 'Number'),
                        React.createElement('option', { value: 'boolean' }, 'Boolean'),
                        React.createElement('option', { value: 'string' }, 'String')
                    )
                ),
                React.createElement('div', { style: rowStyle },
                    React.createElement('span', { style: labelStyle }, 'Value'),
                    props.valueType === 'boolean' 
                        ? React.createElement('select', {
                            style: inputStyle,
                            value: String(props.value),
                            onChange: (e) => {
                                props.value = e.target.value === 'true';
                                forceUpdate(n => n + 1);
                            },
                            onPointerDown: stopPropagation
                        },
                            React.createElement('option', { value: 'true' }, 'true'),
                            React.createElement('option', { value: 'false' }, 'false')
                        )
                        : React.createElement('input', {
                            type: props.valueType === 'number' ? 'number' : 'text',
                            style: inputStyle,
                            value: props.value,
                            onChange: (e) => {
                                props.value = props.valueType === 'number' 
                                    ? (Number(e.target.value) || 0)
                                    : e.target.value;
                                forceUpdate(n => n + 1);
                            },
                            onPointerDown: stopPropagation
                        })
                )
            ),

            // Scale percent
            needsScale && React.createElement('div', { style: rowStyle },
                React.createElement('span', { style: labelStyle }, 'Scale %'),
                React.createElement('input', {
                    type: 'number',
                    style: inputStyle,
                    value: props.scalePercent,
                    onChange: (e) => {
                        props.scalePercent = Number(e.target.value) || 100;
                        forceUpdate(n => n + 1);
                    },
                    onPointerDown: stopPropagation
                })
            ),

            // Map range
            needsMapRange && React.createElement('div', { style: { 
                padding: '8px', 
                background: THEME.surfaceLight, 
                borderRadius: '4px', 
                marginBottom: '8px' 
            } },
                React.createElement('div', { style: { fontSize: '10px', color: THEME.text, marginBottom: '6px' } }, 'Input Range'),
                React.createElement('div', { style: rowStyle },
                    React.createElement('input', {
                        type: 'number',
                        style: inputStyle,
                        value: props.inMin,
                        onChange: (e) => { props.inMin = Number(e.target.value) || 0; forceUpdate(n => n + 1); },
                        onPointerDown: stopPropagation,
                        placeholder: 'Min'
                    }),
                    React.createElement('span', { style: { color: 'rgba(255,255,255,0.5)' } }, '→'),
                    React.createElement('input', {
                        type: 'number',
                        style: inputStyle,
                        value: props.inMax,
                        onChange: (e) => { props.inMax = Number(e.target.value) || 100; forceUpdate(n => n + 1); },
                        onPointerDown: stopPropagation,
                        placeholder: 'Max'
                    })
                ),
                React.createElement('div', { style: { fontSize: '10px', color: THEME.text, marginBottom: '6px', marginTop: '6px' } }, 'Output Range'),
                React.createElement('div', { style: rowStyle },
                    React.createElement('input', {
                        type: 'number',
                        style: inputStyle,
                        value: props.outMin,
                        onChange: (e) => { props.outMin = Number(e.target.value) || 0; forceUpdate(n => n + 1); },
                        onPointerDown: stopPropagation,
                        placeholder: 'Min'
                    }),
                    React.createElement('span', { style: { color: 'rgba(255,255,255,0.5)' } }, '→'),
                    React.createElement('input', {
                        type: 'number',
                        style: inputStyle,
                        value: props.outMax,
                        onChange: (e) => { props.outMax = Number(e.target.value) || 255; forceUpdate(n => n + 1); },
                        onPointerDown: stopPropagation,
                        placeholder: 'Max'
                    })
                )
            ),

            // Clamp range
            needsClamp && React.createElement('div', { style: rowStyle },
                React.createElement('input', {
                    type: 'number',
                    style: inputStyle,
                    value: props.clampMin,
                    onChange: (e) => { props.clampMin = Number(e.target.value) || 0; forceUpdate(n => n + 1); },
                    onPointerDown: stopPropagation,
                    placeholder: 'Min'
                }),
                React.createElement('span', { style: { color: 'rgba(255,255,255,0.5)', fontSize: '10px' } }, '≤ x ≤'),
                React.createElement('input', {
                    type: 'number',
                    style: inputStyle,
                    value: props.clampMax,
                    onChange: (e) => { props.clampMax = Number(e.target.value) || 100; forceUpdate(n => n + 1); },
                    onPointerDown: stopPropagation,
                    placeholder: 'Max'
                })
            ),

            // Preview
            React.createElement('div', { style: previewStyle },
                React.createElement('span', { style: { color: 'rgba(255,255,255,0.5)' } },
                    React.createElement('span', { style: valueStyle }, formatValue(props.lastInput)),
                    ' → ',
                    React.createElement('span', { style: valueStyle }, formatValue(props.lastOutput))
                ),
                React.createElement('span', { style: { color: 'rgba(255,255,255,0.3)', fontSize: '9px' } },
                    `×${props.processCount}`
                )
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
        window.nodeRegistry.register('ChangeNode', {
            label: "Change",
            category: "Utility",
            nodeClass: ChangeNode,
            component: ChangeNodeComponent,
            factory: (cb) => new ChangeNode(cb)
        });
    }
})();
