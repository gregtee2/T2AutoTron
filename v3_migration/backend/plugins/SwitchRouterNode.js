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
        { value: 'between', label: 'is between' },
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
                routeCount: [0, 0, 0], // Count for each output (dynamic size + otherwise)
                debug: false
            };

            // Input
            this.addInput("input", new ClassicPreset.Input(
                sockets.any || new ClassicPreset.Socket('any'),
                "Input"
            ));

            // Create outputs for initial rules
            this._createOutputs();
        }

        _createOutputs() {
            // Remove all existing outputs
            const existingOutputs = Object.keys(this.outputs);
            for (const key of existingOutputs) {
                this.removeOutput(key);
            }

            // Create outputs for each rule
            for (let i = 0; i < this.properties.rules.length; i++) {
                this.addOutput(`out${i + 1}`, new ClassicPreset.Output(
                    sockets.any || new ClassicPreset.Socket('any'),
                    `→ ${i + 1}`
                ));
            }

            // Always add "otherwise" output
            this.addOutput("otherwise", new ClassicPreset.Output(
                sockets.any || new ClassicPreset.Socket('any'),
                "Otherwise"
            ));

            // Ensure routeCount array matches
            while (this.properties.routeCount.length < this.properties.rules.length + 1) {
                this.properties.routeCount.push(0);
            }
        }

        addRule() {
            if (this.properties.rules.length >= 8) return;
            this.properties.rules.push({ operator: 'isTrue', value: '' });
            this._createOutputs();
            if (this.changeCallback) this.changeCallback();
        }

        removeRule() {
            if (this.properties.rules.length <= 1) return;
            this.properties.rules.pop();
            this.properties.routeCount.pop();
            this._createOutputs();
            if (this.changeCallback) this.changeCallback();
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
                    case 'between':
                        const num = Number(value);
                        const min = Number(rule.min ?? 0);
                        const max = Number(rule.max ?? 100);
                        return num >= min && num <= max;
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
            
            // Build result object based on actual outputs that exist on this node
            // This ensures consistency even if outputs were recreated during restore
            const result = {};
            for (const key of Object.keys(this.outputs)) {
                result[key] = undefined;
            }

            let anyMatch = false;
            props.lastMatchedRule = -1;

            // Evaluate each rule
            for (let i = 0; i < props.rules.length; i++) {
                const rule = props.rules[i];
                const outputKey = `out${i + 1}`;
                
                // Only process if this output exists
                if (!this.outputs[outputKey]) continue;
                
                if (this._evaluateRule(rule, input)) {
                    result[outputKey] = input;
                    props.routeCount[i] = (props.routeCount[i] || 0) + 1;
                    
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
            if (!anyMatch && this.outputs.otherwise) {
                result.otherwise = input;
                const otherwiseIdx = props.rules.length;
                props.routeCount[otherwiseIdx] = (props.routeCount[otherwiseIdx] || 0) + 1;
                props.lastMatchedRule = otherwiseIdx;
            }

            if (this.changeCallback) this.changeCallback();
            return result;
        }

        restore(state) {
            if (state.properties) {
                // Deep copy rules to ensure all properties (including min/max for 'between') are preserved
                this.properties.rules = (state.properties.rules || [
                    { operator: 'isTrue', value: '' },
                    { operator: 'isFalse', value: '' }
                ]).map(rule => ({
                    operator: rule.operator || 'isTrue',
                    value: rule.value ?? '',
                    min: rule.min ?? 0,
                    max: rule.max ?? 100
                }));
                this.properties.stopOnFirstMatch = state.properties.stopOnFirstMatch ?? true;
            }
            // Reset runtime state
            this.properties.lastMatchedRule = -1;
            this.properties.routeCount = new Array(this.properties.rules.length + 1).fill(0);
            // Recreate outputs for restored rules
            this._createOutputs();
            
            // Schedule area update to ensure Rete recognizes the new outputs
            if (this.changeCallback) {
                setTimeout(() => {
                    if (this.changeCallback) this.changeCallback();
                }, 50);
            }
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
            fontFamily: 'monospace',
            minWidth: '260px'
        };

        const ruleStyle = (index) => ({
            padding: '8px',
            background: props.lastMatchedRule === index 
                ? `rgba(95, 170, 125, 0.15)`
                : THEME.surfaceLight,
            borderRadius: '4px',
            marginBottom: '6px',
            border: props.lastMatchedRule === index 
                ? `1px solid ${THEME.success}`
                : `1px solid ${THEME.borderLight}`
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
            color: THEME.textMuted
        };

        const selectStyle = {
            background: THEME.surface,
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

        const needsValue = (op) => !['isTrue', 'isFalse', 'isNull', 'isNotNull', 'between'].includes(op);
        const isBetween = (op) => op === 'between';

        return React.createElement('div', { className: 'logic-node', style: containerStyle },
            // Header
            React.createElement('div', { className: 'header' },
                React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
                    React.createElement('span', null, '🔀'),
                    'Switch',
                    HelpIcon && React.createElement(HelpIcon, { text: tooltips.node })
                )
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

            // Rules (dynamically render all rules - no slice limit)
            props.rules.map((rule, index) => 
                React.createElement('div', { key: index, style: ruleStyle(index) },
                    React.createElement('div', { style: ruleHeaderStyle },
                        React.createElement('span', { style: ruleLabelStyle }, `Rule ${index + 1}`),
                        React.createElement('span', { style: ruleCountStyle }, `× ${props.routeCount[index] || 0}`)
                    ),
                    React.createElement('select', {
                        style: selectStyle,
                        value: rule.operator,
                        onChange: (e) => {
                            rule.operator = e.target.value;
                            // Initialize min/max for between
                            if (e.target.value === 'between') {
                                rule.min = rule.min ?? 0;
                                rule.max = rule.max ?? 100;
                            }
                            forceUpdate(n => n + 1);
                        },
                        onPointerDown: stopPropagation
                    },
                        OPERATORS.map(op => 
                            React.createElement('option', { key: op.value, value: op.value }, op.label)
                        )
                    ),
                    // Standard value input (for non-between operators)
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
                    }),
                    // Min/Max inputs for "between" operator
                    isBetween(rule.operator) && React.createElement('div', {
                        style: { display: 'flex', gap: '4px', marginTop: '4px' }
                    },
                        React.createElement('input', {
                            type: 'number',
                            style: { ...inputStyle, width: '70px' },
                            placeholder: 'Min',
                            value: rule.min ?? 0,
                            onChange: (e) => {
                                rule.min = e.target.value;
                                forceUpdate(n => n + 1);
                            },
                            onPointerDown: stopPropagation
                        }),
                        React.createElement('span', { style: { color: THEME.text, fontSize: '10px', alignSelf: 'center' } }, '–'),
                        React.createElement('input', {
                            type: 'number',
                            style: { ...inputStyle, width: '70px' },
                            placeholder: 'Max',
                            value: rule.max ?? 100,
                            onChange: (e) => {
                                rule.max = e.target.value;
                                forceUpdate(n => n + 1);
                            },
                            onPointerDown: stopPropagation
                        })
                    )
                )
            ),

            // Add/Remove rule buttons
            React.createElement('div', {
                style: { display: 'flex', gap: '6px', marginBottom: '8px' }
            },
                // Add rule button (max 8)
                props.rules.length < 8 && React.createElement('button', {
                    style: {
                        flex: 1,
                        padding: '6px',
                        background: 'rgba(255,255,255,0.1)',
                        border: `1px dashed ${THEME.border}`,
                        borderRadius: '4px',
                        color: THEME.text,
                        fontSize: '10px',
                        cursor: 'pointer'
                    },
                    onClick: () => {
                        data.addRule();
                        forceUpdate(n => n + 1);
                    },
                    onPointerDown: stopPropagation
                }, '+ Add Rule'),
                // Remove rule button (min 1)
                props.rules.length > 1 && React.createElement('button', {
                    style: {
                        flex: 1,
                        padding: '6px',
                        background: 'rgba(199,95,95,0.2)',
                        border: `1px dashed ${THEME.error || '#c75f5f'}`,
                        borderRadius: '4px',
                        color: THEME.error || '#c75f5f',
                        fontSize: '10px',
                        cursor: 'pointer'
                    },
                    onClick: () => {
                        data.removeRule();
                        forceUpdate(n => n + 1);
                    },
                    onPointerDown: stopPropagation
                }, '− Remove Rule')
            ),

            // Otherwise indicator
            React.createElement('div', { style: {
                ...ruleStyle(props.rules.length),
                opacity: props.lastMatchedRule === props.rules.length ? 1 : 0.5
            } },
                React.createElement('div', { style: ruleHeaderStyle },
                    React.createElement('span', { style: { ...ruleLabelStyle, color: THEME.warning } }, 'Otherwise'),
                    React.createElement('span', { style: ruleCountStyle }, `× ${props.routeCount[props.rules.length] || 0}`)
                )
            ),

            // Sockets - use io-container and socket-row for proper layout
            React.createElement('div', { className: 'io-container', style: { marginTop: '8px' } },
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
                        React.createElement('span', { key: 'label', className: 'socket-label' }, input.label || key)
                    ])
                )
            ),
            React.createElement('div', { className: 'io-container' },
                Object.entries(data.outputs).map(([key, output], index) =>
                    React.createElement('div', { 
                        key, 
                        className: 'socket-row',
                        style: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', opacity: props.lastMatchedRule === index ? 1 : 0.6 }
                    }, [
                        React.createElement('span', { 
                            key: 'label', 
                            className: 'socket-label',
                            style: key === 'otherwise' ? { color: THEME.warning } : {}
                        }, output.label || key),
                        React.createElement(RefComponent, {
                            key: 'socket',
                            init: (ref) => emit({ type: 'render', data: { type: 'socket', side: 'output', key, nodeId: data.id, element: ref, payload: output.socket } }),
                            unmount: (ref) => emit({ type: 'unmount', data: { element: ref } })
                        })
                    ])
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
