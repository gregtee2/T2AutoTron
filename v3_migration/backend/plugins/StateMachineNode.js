// ============================================================================
// StateMachineNode.js - Named states with configurable transitions and timers
// Enables complex state-based automation (idle→armed→triggered→cooldown)
// Features: Per-state timers, state-specific outputs, auto-advance
// ============================================================================

(function() {
    // Dependency checks
    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets) {
        console.error("[StateMachineNode] Missing core dependencies");
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
        node: "State Machine with per-state timers. States can auto-advance after a set duration. Use format 'state:seconds' (e.g., 'triggered:120' = 2 minutes). Outputs include state-specific booleans.",
        inputs: {
            trigger: "Any input that triggers evaluation of transition rules for current state.",
            reset: "Boolean true forces the state machine back to its initial state and clears timers.",
            setState: "String to directly set a specific state (bypasses transition rules)."
        },
        outputs: {
            state: "Current state name as a string.",
            stateIndex: "Current state index (0-based) as a number.",
            changed: "Boolean pulse (true) when state changes, false otherwise.",
            remaining: "Seconds remaining on current state's timer (0 if no timer)."
        },
        controls: {
            states: "Comma-separated list. Use 'name:seconds' for auto-advance timers. Example: 'idle,armed,triggered:120,cooldown:30'",
            transitions: "Transition rules: fromState→toState:condition. Use 'timeout' as condition for timer-based transitions.",
            currentState: "The current active state in the machine."
        }
    };

    // Default states with timers
    const DEFAULT_STATES = 'idle,armed,triggered:10,cooldown:5';
    const DEFAULT_TRANSITIONS = [
        'idle→armed:true',
        'armed→triggered:true',
        'triggered→cooldown:timeout',
        'cooldown→idle:timeout'
    ];

    // -------------------------------------------------------------------------
    // NODE CLASS
    // -------------------------------------------------------------------------
    class StateMachineNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("State Machine");
            this.width = 280;
            this.changeCallback = changeCallback;

            this.properties = {
                states: DEFAULT_STATES,
                transitions: DEFAULT_TRANSITIONS.join('\n'),
                currentState: 'idle',
                previousState: null,
                stateEnteredAt: null,  // Timestamp when current state was entered
                debug: false
            };

            // Timer tracking
            this.timerInterval = null;
            this.remainingSeconds = 0;

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
            this.addOutput("remaining", new ClassicPreset.Output(
                sockets.number || new ClassicPreset.Socket('number'),
                "Timer"
            ));
        }

        // Parse states with optional timers: "idle,armed,triggered:120,cooldown:30"
        _parseStates() {
            const stateConfigs = [];
            const parts = this.properties.states.split(',').map(s => s.trim()).filter(Boolean);
            
            for (const part of parts) {
                const match = part.match(/^(\w+)(?::(\d+))?$/);
                if (match) {
                    stateConfigs.push({
                        name: match[1],
                        timer: match[2] ? parseInt(match[2], 10) : null
                    });
                }
            }
            return stateConfigs;
        }

        _getStateNames() {
            return this._parseStates().map(s => s.name);
        }

        _getStateTimer(stateName) {
            const states = this._parseStates();
            const state = states.find(s => s.name === stateName);
            return state?.timer || null;
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
            // 'timeout' is handled separately in data()
            if (condition === 'timeout') return false;
            
            // Try numeric comparison
            const num = parseFloat(condition);
            if (!isNaN(num)) return triggerValue === num;
            
            // String match
            return triggerValue === condition;
        }

        _transitionTo(newState, reason) {
            const states = this._getStateNames();
            if (!states.includes(newState)) return false;
            
            const previousState = this.properties.currentState;
            if (previousState === newState) return false;
            
            this.properties.previousState = previousState;
            this.properties.currentState = newState;
            this.properties.stateEnteredAt = Date.now();
            
            // Reset timer for new state
            const timer = this._getStateTimer(newState);
            this.remainingSeconds = timer || 0;
            
            if (this.properties.debug) {
                console.log(`[StateMachine] ${previousState} → ${newState} (${reason})${timer ? `, timer: ${timer}s` : ''}`);
            }
            
            return true;
        }

        _checkTimeout() {
            const currentState = this.properties.currentState;
            const timer = this._getStateTimer(currentState);
            
            if (!timer || !this.properties.stateEnteredAt) return false;
            
            const elapsed = (Date.now() - this.properties.stateEnteredAt) / 1000;
            this.remainingSeconds = Math.max(0, Math.ceil(timer - elapsed));
            
            if (elapsed >= timer) {
                // Find timeout transition
                const transitions = this._parseTransitions();
                for (const trans of transitions) {
                    if (trans.from === currentState && trans.condition === 'timeout') {
                        return this._transitionTo(trans.to, 'timeout');
                    }
                }
            }
            return false;
        }

        data(inputs) {
            const trigger = inputs.trigger?.[0];
            const reset = inputs.reset?.[0];
            const setState = inputs.setState?.[0];

            const states = this._getStateNames();
            const initialState = states[0] || 'idle';
            
            let changed = false;

            // Handle reset
            if (reset === true) {
                changed = this._transitionTo(initialState, 'reset');
                return this._buildOutput(changed);
            }

            // Handle direct state setting
            if (setState !== undefined && typeof setState === 'string') {
                changed = this._transitionTo(setState, 'setState');
                return this._buildOutput(changed);
            }

            // Check for timeout transition first
            if (this._checkTimeout()) {
                changed = true;
                if (this.changeCallback) this.changeCallback();
                return this._buildOutput(changed);
            }

            // Evaluate transitions based on trigger
            if (trigger !== undefined) {
                const transitions = this._parseTransitions();
                const currentState = this.properties.currentState;
                
                // Find applicable transition (skip timeout - handled above)
                for (const trans of transitions) {
                    if (trans.from === currentState && trans.condition !== 'timeout') {
                        if (this._evaluateCondition(trans.condition, trigger)) {
                            changed = this._transitionTo(trans.to, `trigger=${trigger}`);
                            break;
                        }
                    }
                }
            }

            return this._buildOutput(changed);
        }

        _buildOutput(changed) {
            const states = this._getStateNames();
            const currentState = this.properties.currentState;
            const stateIndex = states.indexOf(currentState);
            
            // Build state-specific boolean outputs
            const output = {
                state: currentState,
                stateIndex,
                changed,
                remaining: this.remainingSeconds
            };
            
            // Add is_<stateName> outputs for each state
            for (const state of states) {
                output[`is_${state}`] = (currentState === state);
            }
            
            return output;
        }

        // Cleanup timer on destroy
        destroy() {
            if (this.timerInterval) {
                clearInterval(this.timerInterval);
                this.timerInterval = null;
            }
        }

        restore(state) {
            if (state.properties) {
                Object.assign(this.properties, state.properties);
            }
            // Reset timer tracking on restore
            if (!this.properties.stateEnteredAt) {
                this.properties.stateEnteredAt = Date.now();
            }
            const timer = this._getStateTimer(this.properties.currentState);
            this.remainingSeconds = timer || 0;
        }

        serialize() {
            return {
                states: this.properties.states,
                transitions: this.properties.transitions,
                currentState: this.properties.currentState,
                stateEnteredAt: this.properties.stateEnteredAt,
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
        const [remainingTime, setRemainingTime] = useState(data.remainingSeconds || 0);
        const [showConfig, setShowConfig] = useState(false);

        // Timer tick for UI countdown
        useEffect(() => {
            const interval = setInterval(() => {
                setRemainingTime(data.remainingSeconds || 0);
                setCurrentState(data.properties.currentState);
            }, 500);
            return () => clearInterval(interval);
        }, [data]);

        // Sync with node properties
        useEffect(() => {
            const originalCallback = data.changeCallback;
            data.changeCallback = () => {
                setStates(data.properties.states);
                setTransitions(data.properties.transitions);
                setCurrentState(data.properties.currentState);
                setRemainingTime(data.remainingSeconds || 0);
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
            data.properties.stateEnteredAt = Date.now();
            // Get timer for new state
            const stateConfigs = data._parseStates ? data._parseStates() : [];
            const stateConfig = stateConfigs.find(s => s.name === newState);
            data.remainingSeconds = stateConfig?.timer || 0;
            setCurrentState(newState);
            setRemainingTime(data.remainingSeconds);
            if (data.changeCallback) data.changeCallback();
        }, [data]);

        // Parse states - extract name and timer from "name:seconds" format
        const parseStateDisplay = (stateStr) => {
            const match = stateStr.match(/^(\w+)(?::(\d+))?$/);
            return match ? { name: match[1], timer: match[2] ? parseInt(match[2], 10) : null } : { name: stateStr, timer: null };
        };

        const stateList = states.split(',').map(s => s.trim()).filter(Boolean).map(parseStateDisplay);
        const currentStateConfig = stateList.find(s => s.name === currentState);
        const currentIndex = stateList.findIndex(s => s.name === currentState);

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

        const socketLabelStyle = {
            fontSize: '11px',
            color: THEME.text,
            marginLeft: '6px',
            marginRight: '6px'
        };

        // Format time for display
        const formatTime = (seconds) => {
            if (seconds <= 0) return '';
            if (seconds < 60) return `${seconds}s`;
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
        };

        return React.createElement('div', { className: 'state-machine-node', style: nodeStyle }, [
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
                stateList.map((stateConfig, idx) => {
                    const isActive = stateConfig.name === currentState;
                    const showTimer = isActive && stateConfig.timer && remainingTime > 0;
                    return React.createElement('span', {
                        key: stateConfig.name,
                        style: {
                            ...stateBadgeStyle(isActive),
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '2px'
                        },
                        onClick: (e) => { e.stopPropagation(); handleManualTransition(stateConfig.name); },
                        onPointerDown: stopPropagation,
                        title: stateConfig.timer 
                            ? `${stateConfig.name} (auto-advance after ${stateConfig.timer}s). Click to set.`
                            : `Click to set state to "${stateConfig.name}"`
                    }, [
                        React.createElement('span', { key: 'name' }, stateConfig.name),
                        showTimer && React.createElement('span', { 
                            key: 'timer',
                            style: { fontSize: '8px', opacity: 0.8 }
                        }, formatTime(remainingTime)),
                        !isActive && stateConfig.timer && React.createElement('span', {
                            key: 'duration',
                            style: { fontSize: '7px', opacity: 0.5 }
                        }, `${stateConfig.timer}s`)
                    ]);
                })
            ),

            // Timer display when active
            currentStateConfig?.timer && remainingTime > 0 && React.createElement('div', {
                key: 'timer-display',
                style: {
                    textAlign: 'center',
                    padding: '6px',
                    background: THEME.background,
                    borderRadius: '4px',
                    marginBottom: '8px',
                    fontSize: '11px',
                    color: remainingTime <= 5 ? THEME.warning : THEME.text
                }
            }, `⏱️ ${formatTime(remainingTime)} remaining`),

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
                        React.createElement('span', { key: 'text', style: { fontSize: '11px', color: THEME.textMuted } }, 'States (name:seconds for timers)'),
                        HelpIcon && React.createElement(HelpIcon, { key: 'help', text: tooltips.controls.states, size: 10 })
                    ]),
                    React.createElement('input', {
                        key: 'input',
                        type: 'text',
                        value: states,
                        onChange: handleStatesChange,
                        onPointerDown: stopPropagation,
                        style: inputStyle,
                        placeholder: 'idle,armed,triggered:120,cooldown:30'
                    })
                ]),

                // Transitions textarea
                React.createElement('div', { key: 'transitions-row' }, [
                    React.createElement('div', { 
                        key: 'label', 
                        style: { display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }
                    }, [
                        React.createElement('span', { key: 'text', style: { fontSize: '11px', color: THEME.textMuted } }, 'Transitions (use :timeout for timers)'),
                        HelpIcon && React.createElement(HelpIcon, { key: 'help', text: tooltips.controls.transitions, size: 10 })
                    ]),
                    React.createElement('textarea', {
                        key: 'input',
                        value: transitions,
                        onChange: handleTransitionsChange,
                        onPointerDown: stopPropagation,
                        style: textareaStyle,
                        placeholder: 'idle→armed:true\ntriggered→cooldown:timeout'
                    })
                ])
            ]),

            // Socket containers
            React.createElement('div', { 
                key: 'inputs', 
                className: 'io-container',
                style: { marginTop: '8px' }
            },
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
                            style: socketLabelStyle
                        }, input.label || key)
                    ])
                )
            ),
            React.createElement('div', { 
                key: 'outputs', 
                className: 'io-container',
                style: { marginTop: '4px' }
            },
                Object.entries(data.outputs).map(([key, output]) =>
                    React.createElement('div', { 
                        key, 
                        className: 'socket-row',
                        style: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: '4px' }
                    }, [
                        React.createElement('span', {
                            key: 'label',
                            style: socketLabelStyle
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
