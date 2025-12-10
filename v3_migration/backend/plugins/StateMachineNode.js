// ============================================================================
// StateMachineNode.js - Named states with configurable transitions
// Enables complex state-based automation (idle→armed→triggered→cooldown)
// ============================================================================

(function() {
    // Dependency checks
    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets) {
        console.error("[StateMachineNode] Missing core dependencies");
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
        node: "State Machine Node: Manages named states with configurable transitions. Define states and transition rules. Useful for complex automation sequences like security systems (idle→armed→triggered→alarm→cooldown).",
        inputs: {
            trigger: "Any input that triggers evaluation of transition rules for current state.",
            reset: "Boolean true forces the state machine back to its initial state.",
            setState: "String to directly set a specific state (bypasses transition rules)."
        },
        outputs: {
            state: "Current state name as a string.",
            stateIndex: "Current state index (0-based) as a number.",
            changed: "Boolean pulse (true) when state changes, false otherwise."
        },
        controls: {
            states: "Comma-separated list of state names. First state is the initial state.",
            transitions: "Transition rules in format: fromState→toState:condition. Condition can be 'true', 'false', or left empty for 'any'.",
            currentState: "The current active state in the machine."
        }
    };

    // Default states for common use cases
    const DEFAULT_STATES = ['idle', 'armed', 'triggered', 'cooldown'];
    const DEFAULT_TRANSITIONS = [
        'idle→armed:true',
        'armed→triggered:true',
        'triggered→cooldown:true',
        'cooldown→idle:true'
    ];

    // -------------------------------------------------------------------------
    // NODE CLASS
    // -------------------------------------------------------------------------
    class StateMachineNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("State Machine");
            this.width = 260;
            this.changeCallback = changeCallback;

            this.properties = {
                states: DEFAULT_STATES.join(','),
                transitions: DEFAULT_TRANSITIONS.join('\n'),
                currentState: DEFAULT_STATES[0],
                previousState: null,
                debug: false
            };

            // Inputs
            this.addInput("trigger", new ClassicPreset.Input(
                sockets.any || new ClassicPreset.Socket('any'),
                "Trigger"
            ));
            this.addInput("reset", new ClassicPreset.Input(
                sockets.boolean || new ClassicPreset.Socket('boolean'),
                "Reset"
            ));
            this.addInput("setState", new ClassicPreset.Input(
                sockets.any || new ClassicPreset.Socket('any'),
                "Set State"
            ));

            // Outputs
            this.addOutput("state", new ClassicPreset.Output(
                sockets.any || new ClassicPreset.Socket('any'),
                "State"
            ));
            this.addOutput("stateIndex", new ClassicPreset.Output(
                sockets.number || new ClassicPreset.Socket('number'),
                "Index"
            ));
            this.addOutput("changed", new ClassicPreset.Output(
                sockets.boolean || new ClassicPreset.Socket('boolean'),
                "Changed"
            ));
        }

        _getStates() {
            return this.properties.states.split(',').map(s => s.trim()).filter(Boolean);
        }

        _parseTransitions() {
            const lines = this.properties.transitions.split('\n').filter(Boolean);
            const transitions = [];
            
            for (const line of lines) {
                // Format: fromState→toState:condition or fromState->toState:condition
                const match = line.match(/^(\w+)(?:→|->)(\w+)(?::(.*))?$/);
                if (match) {
                    transitions.push({
                        from: match[1],
                        to: match[2],
                        condition: match[3]?.trim() || 'any'
                    });
                }
            }
            return transitions;
        }

        _evaluateCondition(condition, triggerValue) {
            if (condition === 'any' || condition === '') return true;
            if (condition === 'true') return triggerValue === true;
            if (condition === 'false') return triggerValue === false;
            
            // Try numeric comparison
            const num = parseFloat(condition);
            if (!isNaN(num)) return triggerValue === num;
            
            // String match
            return triggerValue === condition;
        }

        data(inputs) {
            const trigger = inputs.trigger?.[0];
            const reset = inputs.reset?.[0];
            const setState = inputs.setState?.[0];

            const states = this._getStates();
            const initialState = states[0] || 'idle';
            
            let changed = false;
            const previousState = this.properties.currentState;

            // Handle reset
            if (reset === true) {
                this.properties.currentState = initialState;
                this.properties.previousState = previousState;
                changed = previousState !== initialState;
                
                return {
                    state: this.properties.currentState,
                    stateIndex: 0,
                    changed
                };
            }

            // Handle direct state setting
            if (setState !== undefined && typeof setState === 'string') {
                if (states.includes(setState)) {
                    this.properties.previousState = previousState;
                    this.properties.currentState = setState;
                    changed = previousState !== setState;
                }
                
                return {
                    state: this.properties.currentState,
                    stateIndex: states.indexOf(this.properties.currentState),
                    changed
                };
            }

            // Evaluate transitions based on trigger
            if (trigger !== undefined) {
                const transitions = this._parseTransitions();
                const currentState = this.properties.currentState;
                
                // Find applicable transition
                for (const trans of transitions) {
                    if (trans.from === currentState && this._evaluateCondition(trans.condition, trigger)) {
                        if (states.includes(trans.to)) {
                            this.properties.previousState = currentState;
                            this.properties.currentState = trans.to;
                            changed = true;
                            
                            if (this.properties.debug) {
                                console.log(`[StateMachine] Transition: ${currentState} → ${trans.to} (trigger=${trigger})`);
                            }
                            break;
                        }
                    }
                }
            }

            return {
                state: this.properties.currentState,
                stateIndex: states.indexOf(this.properties.currentState),
                changed
            };
        }

        restore(state) {
            if (state.properties) {
                Object.assign(this.properties, state.properties);
            }
        }

        serialize() {
            return {
                states: this.properties.states,
                transitions: this.properties.transitions,
                currentState: this.properties.currentState,
                debug: this.properties.debug
            };
        }
    }

    // -------------------------------------------------------------------------
    // REACT COMPONENT
    // -------------------------------------------------------------------------
    function StateMachineNodeComponent({ data, emit }) {
        const [states, setStates] = useState(data.properties.states);
        const [transitions, setTransitions] = useState(data.properties.transitions);
        const [currentState, setCurrentState] = useState(data.properties.currentState);
        const [showConfig, setShowConfig] = useState(false);

        // Sync with node properties
        useEffect(() => {
            const originalCallback = data.changeCallback;
            data.changeCallback = () => {
                setStates(data.properties.states);
                setTransitions(data.properties.transitions);
                setCurrentState(data.properties.currentState);
                if (originalCallback) originalCallback();
            };
            return () => { data.changeCallback = originalCallback; };
        }, [data]);

        const handleStatesChange = useCallback((e) => {
            const val = e.target.value;
            setStates(val);
            data.properties.states = val;
        }, [data]);

        const handleTransitionsChange = useCallback((e) => {
            const val = e.target.value;
            setTransitions(val);
            data.properties.transitions = val;
        }, [data]);

        const handleManualTransition = useCallback((newState) => {
            data.properties.previousState = data.properties.currentState;
            data.properties.currentState = newState;
            setCurrentState(newState);
        }, [data]);

        // Parse states for display
        const stateList = states.split(',').map(s => s.trim()).filter(Boolean);
        const currentIndex = stateList.indexOf(currentState);

        // Status color based on state index
        const stateColors = [
            THEME.textMuted,  // idle - gray
            THEME.warning,    // armed - orange
            THEME.success,    // triggered - green
            '#2196f3'         // cooldown - blue
        ];
        const statusColor = stateColors[currentIndex % stateColors.length] || THEME.primary;

        const nodeStyle = {
            background: THEME.surface,
            borderRadius: '8px',
            padding: '12px',
            minWidth: '240px',
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

        const textareaStyle = {
            ...inputStyle,
            minHeight: '60px',
            resize: 'vertical',
            fontFamily: 'monospace',
            fontSize: '10px'
        };

        const stateDisplayStyle = {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '10px',
            background: THEME.background,
            borderRadius: '6px',
            marginBottom: '8px'
        };

        const stateBadgeStyle = (isActive) => ({
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '10px',
            fontWeight: isActive ? 'bold' : 'normal',
            background: isActive ? statusColor : 'transparent',
            color: isActive ? '#fff' : THEME.textMuted,
            border: `1px solid ${isActive ? statusColor : THEME.border}`,
            cursor: 'pointer',
            transition: 'all 0.2s'
        });

        const buttonStyle = {
            background: THEME.background,
            color: THEME.text,
            border: `1px solid ${THEME.border}`,
            borderRadius: '4px',
            padding: '4px 8px',
            fontSize: '10px',
            cursor: 'pointer'
        };

        return React.createElement('div', { style: nodeStyle }, [
            // Header
            NodeHeader && React.createElement(NodeHeader, {
                key: 'header',
                icon: '🔄',
                title: 'State Machine',
                tooltip: tooltips.node,
                statusDot: true,
                statusColor: statusColor
            }),

            // Current state display with clickable states
            React.createElement('div', { key: 'state-display', style: stateDisplayStyle },
                stateList.map((state, idx) => 
                    React.createElement('span', {
                        key: state,
                        style: stateBadgeStyle(state === currentState),
                        onClick: (e) => { e.stopPropagation(); handleManualTransition(state); },
                        onPointerDown: stopPropagation,
                        title: `Click to manually set state to "${state}"`
                    }, state)
                )
            ),

            // Toggle config button
            React.createElement('button', {
                key: 'toggle-config',
                onClick: (e) => { e.stopPropagation(); setShowConfig(!showConfig); },
                onPointerDown: stopPropagation,
                style: { ...buttonStyle, width: '100%', marginBottom: showConfig ? '8px' : '0' }
            }, showConfig ? '▼ Hide Configuration' : '▶ Show Configuration'),

            // Configuration section (collapsible)
            showConfig && React.createElement('div', { key: 'config', style: { marginTop: '8px' } }, [
                // States input
                React.createElement('div', { key: 'states-row', style: { marginBottom: '8px' } }, [
                    React.createElement('div', { 
                        key: 'label', 
                        style: { display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }
                    }, [
                        React.createElement('span', { key: 'text', style: { fontSize: '11px', color: THEME.textMuted } }, 'States (comma-separated)'),
                        HelpIcon && React.createElement(HelpIcon, { key: 'help', text: tooltips.controls.states, size: 10 })
                    ]),
                    React.createElement('input', {
                        key: 'input',
                        type: 'text',
                        value: states,
                        onChange: handleStatesChange,
                        onPointerDown: stopPropagation,
                        style: inputStyle,
                        placeholder: 'idle,armed,triggered,cooldown'
                    })
                ]),

                // Transitions textarea
                React.createElement('div', { key: 'transitions-row' }, [
                    React.createElement('div', { 
                        key: 'label', 
                        style: { display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }
                    }, [
                        React.createElement('span', { key: 'text', style: { fontSize: '11px', color: THEME.textMuted } }, 'Transitions'),
                        HelpIcon && React.createElement(HelpIcon, { key: 'help', text: tooltips.controls.transitions, size: 10 })
                    ]),
                    React.createElement('textarea', {
                        key: 'input',
                        value: transitions,
                        onChange: handleTransitionsChange,
                        onPointerDown: stopPropagation,
                        style: textareaStyle,
                        placeholder: 'idle→armed:true\narmed→triggered:true'
                    })
                ])
            ]),

            // Socket containers
            React.createElement('div', { 
                key: 'inputs', 
                className: 'socket-inputs',
                style: { marginTop: '8px' }
            },
                Object.entries(data.inputs).map(([key, input]) =>
                    React.createElement('div', { key, className: 'input-socket', 'data-testid': `input-${key}` },
                        React.createElement(RefComponent, {
                            init: (ref) => emit({ type: 'render', data: { type: 'socket', side: 'input', key, nodeId: data.id, element: ref, payload: input.socket } }),
                            unmount: (ref) => emit({ type: 'unmount', data: { element: ref } })
                        }),
                        React.createElement('span', { 
                            className: 'socket-label',
                            style: { marginLeft: '8px', fontSize: '11px', color: THEME.textMuted }
                        }, input.label || key)
                    )
                )
            ),
            React.createElement('div', { 
                key: 'outputs', 
                className: 'socket-outputs',
                style: { marginTop: '4px' }
            },
                Object.entries(data.outputs).map(([key, output]) =>
                    React.createElement('div', { key, className: 'output-socket', 'data-testid': `output-${key}`, style: { textAlign: 'right' } },
                        React.createElement('span', {
                            className: 'socket-label',
                            style: { marginRight: '8px', fontSize: '11px', color: THEME.textMuted }
                        }, output.label || key),
                        React.createElement(RefComponent, {
                            init: (ref) => emit({ type: 'render', data: { type: 'socket', side: 'output', key, nodeId: data.id, element: ref, payload: output.socket } }),
                            unmount: (ref) => emit({ type: 'unmount', data: { element: ref } })
                        })
                    )
                )
            )
        ]);
    }

    // -------------------------------------------------------------------------
    // REGISTER
    // -------------------------------------------------------------------------
    if (window.nodeRegistry) {
        window.nodeRegistry.register('StateMachineNode', {
            label: "State Machine",
            category: "Logic",
            nodeClass: StateMachineNode,
            component: StateMachineNodeComponent,
            factory: (cb) => new StateMachineNode(cb)
        });
        console.log("[StateMachineNode] Registered successfully");
    } else {
        console.error("[StateMachineNode] nodeRegistry not found");
    }

})();
