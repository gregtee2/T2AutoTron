// ============================================================================
// SwitchRouterNode.js - Switch/Router Node (Node-RED Style)
// Routes messages to different outputs based on property values
// ============================================================================

(function() {
    // Dependency checks
    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets) {
        console.error("[SwitchRouterNode] Missing core dependencies");
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
        node: "Switch Router: Routes the input to different outputs based on rules. Each rule checks a condition and if matched, outputs the value on that route. Multiple rules can match (unless 'stop on first match' is enabled).",
        inputs: {
            input: "The value to evaluate and route to outputs."
        },
        outputs: {
            out1: "Output when rule 1 matches.",
            out2: "Output when rule 2 matches.",
            out3: "Output when rule 3 matches.",
            otherwise: "Output when no rules match."
        },
        controls: {
            operator: "Comparison operator: ==, !=, <, >, <=, >=, contains, regex, true, false.",
            value: "Value to compare against.",
            stopFirst: "If enabled, stops checking rules after the first match."
        }
    };

    const OPERATORS = [
        { value: '==', label: '==' },
        { value: '!=', label: '!=' },
        { value: '<', label: '<' },
        { value: '>', label: '>' },
        { value: '<=', label: '<=' },
        { value: '>=', label: '>=' },
        { value: 'contains', label: 'contains' },
        { value: 'regex', label: 'matches regex' },
        { value: 'isTrue', label: 'is true' },
        { value: 'isFalse', label: 'is false' },
        { value: 'isNull', label: 'is null' },
        { value: 'isNotNull', label: 'is not null' }
    ];

    // -------------------------------------------------------------------------
    // NODE CLASS
    // -------------------------------------------------------------------------
    class SwitchRouterNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("Switch");
            this.width = 280;
            this.changeCallback = changeCallback;

            this.properties = {
                rules: [
                    { operator: 'isTrue', value: '' },
                    { operator: 'isFalse', value: '' }
                ],
                stopOnFirstMatch: true,
                lastMatchedRule: -1,
                routeCount: [0, 0, 0, 0], // Count for each output
                debug: false
            };

            // Input
            this.addInput("input", new ClassicPreset.Input(
                sockets.any || new ClassicPreset.Socket('any'),
                "Input"
            ));

            // Outputs (3 rule outputs + 1 otherwise)
            this.addOutput("out1", new ClassicPreset.Output(
                sockets.any || new ClassicPreset.Socket('any'),
                "→ 1"
            ));
            this.addOutput("out2", new ClassicPreset.Output(
                sockets.any || new ClassicPreset.Socket('any'),
                "→ 2"
            ));
            this.addOutput("out3", new ClassicPreset.Output(
                sockets.any || new ClassicPreset.Socket('any'),
                "→ 3"
            ));
            this.addOutput("otherwise", new ClassicPreset.Output(
                sockets.any || new ClassicPreset.Socket('any'),
                "Otherwise"
            ));
        }

        _evaluateRule(rule, value) {
            const op = rule.operator;
            const compareValue = rule.value;

            try {
                switch (op) {
                    case '==':
                        return value == compareValue || String(value) === String(compareValue);
                    case '!=':
                        return value != compareValue && String(value) !== String(compareValue);
                    case '<':
                        return Number(value) < Number(compareValue);
                    case '>':
                        return Number(value) > Number(compareValue);
                    case '<=':
                        return Number(value) <= Number(compareValue);
                    case '>=':
                        return Number(value) >= Number(compareValue);
                    case 'contains':
                        return String(value).includes(String(compareValue));
                    case 'regex':
                        return new RegExp(compareValue).test(String(value));
                    case 'isTrue':
                        return value === true || value === 'true' || value === 1;
                    case 'isFalse':
                        return value === false || value === 'false' || value === 0;
                    case 'isNull':
                        return value === null || value === undefined;
                    case 'isNotNull':
                        return value !== null && value !== undefined;
                    default:
                        return false;
                }
            } catch (e) {
                return false;
            }
        }

        data(inputs) {
            const input = inputs.input?.[0];
            const props = this.properties;
            
            const result = {
                out1: undefined,
                out2: undefined,
                out3: undefined,
                otherwise: undefined
            };

            let anyMatch = false;
            props.lastMatchedRule = -1;

            // Evaluate each rule
            for (let i = 0; i < props.rules.length && i < 3; i++) {
                const rule = props.rules[i];
                if (this._evaluateRule(rule, input)) {
                    const outputKey = `out${i + 1}`;
                    result[outputKey] = input;
                    props.routeCount[i]++;
                    
                    if (props.lastMatchedRule === -1) {
                        props.lastMatchedRule = i;
                    }
                    
                    anyMatch = true;
                    
                    if (props.stopOnFirstMatch) {
                        break;
                    }
                }
            }

            // If no rules matched, output to "otherwise"
            if (!anyMatch) {
                result.otherwise = input;
                props.routeCount[3]++;
                props.lastMatchedRule = 3;
            }

            if (this.changeCallback) this.changeCallback();
            return result;
        }

        restore(state) {
            if (state.properties) {
                this.properties.rules = state.properties.rules || [
                    { operator: 'isTrue', value: '' },
                    { operator: 'isFalse', value: '' }
                ];
                this.properties.stopOnFirstMatch = state.properties.stopOnFirstMatch ?? true;
            }
            // Reset runtime state
            this.properties.lastMatchedRule = -1;
            this.properties.routeCount = [0, 0, 0, 0];
        }
    }

    // -------------------------------------------------------------------------
    // REACT COMPONENT
    // -------------------------------------------------------------------------
    function SwitchRouterNodeComponent({ data, emit }) {
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

        // Ensure we have at least 2 rules
        while (props.rules.length < 2) {
            props.rules.push({ operator: 'isTrue', value: '' });
        }

        // Styles
        const containerStyle = {
            padding: '12px',
            background: 'linear-gradient(135deg, #0a0f14 0%, #1a1f24 100%)',
            borderRadius: '8px',
            fontFamily: 'monospace',
            minWidth: '260px'
        };

        const ruleStyle = (index) => ({
            padding: '8px',
            background: props.lastMatchedRule === index 
                ? `rgba(0, 255, 136, 0.15)`
                : 'rgba(0,0,0,0.2)',
            borderRadius: '4px',
            marginBottom: '6px',
            border: props.lastMatchedRule === index 
                ? `1px solid ${THEME.success}`
                : '1px solid transparent'
        });

        const ruleHeaderStyle = {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '6px'
        };

        const ruleLabelStyle = {
            fontSize: '10px',
            fontWeight: 'bold',
            color: THEME.primary
        };

        const ruleCountStyle = {
            fontSize: '9px',
            color: 'rgba(255,255,255,0.4)'
        };

        const selectStyle = {
            background: '#1a1f24',
            border: `1px solid ${THEME.border}`,
            borderRadius: '4px',
            color: THEME.text,
            padding: '4px 6px',
            fontSize: '10px',
            width: '100%',
            marginBottom: '4px'
        };

        const inputStyle = {
            ...selectStyle,
            marginBottom: 0
        };

        const checkboxRowStyle = {
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '10px',
            color: THEME.text,
            marginBottom: '8px'
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

        const outputSocketStyle = (index) => ({
            ...socketRowStyle,
            opacity: props.lastMatchedRule === index ? 1 : 0.6
        });

        const needsValue = (op) => !['isTrue', 'isFalse', 'isNull', 'isNotNull'].includes(op);

        return React.createElement('div', { style: containerStyle },
            // Header
            NodeHeader ? React.createElement(NodeHeader, {
                icon: '🔀',
                title: 'Switch',
                tooltip: tooltips.node
            }) : React.createElement('div', { style: { marginBottom: '8px' } },
                React.createElement('span', { style: { color: THEME.primary, fontWeight: 'bold' } }, '🔀 Switch')
            ),

            // Stop on first match checkbox
            React.createElement('label', { style: checkboxRowStyle },
                React.createElement('input', {
                    type: 'checkbox',
                    checked: props.stopOnFirstMatch,
                    onChange: (e) => {
                        props.stopOnFirstMatch = e.target.checked;
                        forceUpdate(n => n + 1);
                    },
                    onPointerDown: stopPropagation
                }),
                'Stop on first match',
                HelpIcon && React.createElement(HelpIcon, { text: tooltips.controls.stopFirst, size: 10 })
            ),

            // Rules
            props.rules.slice(0, 3).map((rule, index) => 
                React.createElement('div', { key: index, style: ruleStyle(index) },
                    React.createElement('div', { style: ruleHeaderStyle },
                        React.createElement('span', { style: ruleLabelStyle }, `Rule ${index + 1}`),
                        React.createElement('span', { style: ruleCountStyle }, `× ${props.routeCount[index]}`)
                    ),
                    React.createElement('select', {
                        style: selectStyle,
                        value: rule.operator,
                        onChange: (e) => {
                            rule.operator = e.target.value;
                            forceUpdate(n => n + 1);
                        },
                        onPointerDown: stopPropagation
                    },
                        OPERATORS.map(op => 
                            React.createElement('option', { key: op.value, value: op.value }, op.label)
                        )
                    ),
                    needsValue(rule.operator) && React.createElement('input', {
                        type: 'text',
                        style: inputStyle,
                        placeholder: 'Value...',
                        value: rule.value,
                        onChange: (e) => {
                            rule.value = e.target.value;
                            forceUpdate(n => n + 1);
                        },
                        onPointerDown: stopPropagation
                    })
                )
            ),

            // Add rule button (if less than 3)
            props.rules.length < 3 && React.createElement('button', {
                style: {
                    width: '100%',
                    padding: '6px',
                    background: 'rgba(255,255,255,0.1)',
                    border: `1px dashed ${THEME.border}`,
                    borderRadius: '4px',
                    color: THEME.text,
                    fontSize: '10px',
                    cursor: 'pointer',
                    marginBottom: '8px'
                },
                onClick: () => {
                    props.rules.push({ operator: 'isTrue', value: '' });
                    props.routeCount.splice(props.rules.length - 1, 0, 0);
                    forceUpdate(n => n + 1);
                },
                onPointerDown: stopPropagation
            }, '+ Add Rule'),

            // Otherwise indicator
            React.createElement('div', { style: {
                ...ruleStyle(3),
                opacity: props.lastMatchedRule === 3 ? 1 : 0.5
            } },
                React.createElement('div', { style: ruleHeaderStyle },
                    React.createElement('span', { style: { ...ruleLabelStyle, color: THEME.warning } }, 'Otherwise'),
                    React.createElement('span', { style: ruleCountStyle }, `× ${props.routeCount[3]}`)
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
                    Object.entries(data.outputs).map(([key, output], index) =>
                        React.createElement('div', { key, style: outputSocketStyle(index) },
                            React.createElement('span', { style: { fontSize: '10px', color: key === 'otherwise' ? THEME.warning : THEME.text } }, output.label || key),
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
        window.nodeRegistry.register('SwitchRouterNode', {
            label: "Switch",
            category: "Logic",
            nodeClass: SwitchRouterNode,
            component: SwitchRouterNodeComponent,
            factory: (cb) => new SwitchRouterNode(cb)
        });
    }
})();
