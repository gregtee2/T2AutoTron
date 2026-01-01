/**
 * EdgeDetectorNode - Detects rising and falling edges of a boolean signal
 * 
 * Perfect for triggering one-shot events when states change:
 * - Motion sensor goes active → trigger announcement
 * - Rain starts → "It's raining" TTS
 * - Rain stops → "Rain has stopped" TTS
 * 
 * Category: Logic
 */
(function() {
    // console.log("[EdgeDetectorNode] Loading plugin...");

    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets || !window.T2Controls) {
        console.error("[EdgeDetectorNode] Missing dependencies", {
            Rete: !!window.Rete,
            React: !!window.React,
            RefComponent: !!window.RefComponent,
            sockets: !!window.sockets,
            T2Controls: !!window.T2Controls
        });
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect, useRef } = React;
    const RefComponent = window.RefComponent;
    const sockets = window.sockets;
    const { HelpIcon, THEME } = window.T2Controls;

    // -------------------------------------------------------------------------
    // TOOLTIPS
    // -------------------------------------------------------------------------
    const tooltips = {
        node: "Edge Detector - Detects state transitions.\n\nOutputs a brief pulse when the input changes from FALSE→TRUE (rising) or TRUE→FALSE (falling).\n\nPerfect for triggering one-shot events like TTS announcements when states change.",
        inputs: {
            input: "Boolean input to watch for changes.\n\nCan also accept numbers (0 = false, non-zero = true) or strings ('true'/'false')."
        },
        outputs: {
            rising: "Pulses TRUE when input goes FALSE → TRUE.\n\nUse this for 'started' events (rain started, motion detected, etc.)",
            falling: "Pulses TRUE when input goes TRUE → FALSE.\n\nUse this for 'stopped' events (rain stopped, motion cleared, etc.)",
            changed: "Pulses TRUE on any change (rising OR falling).\n\nUseful when you want to react to any state change.",
            state: "Current state of the input (after boolean conversion).\n\nThis is NOT a pulse - it stays at the current value."
        }
    };

    // -------------------------------------------------------------------------
    // NODE CLASS
    // -------------------------------------------------------------------------
    class EdgeDetectorNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("Edge Detector");
            this.changeCallback = changeCallback;
            this.width = 200;
            this.height = 140;

            this.properties = {
                lastInputState: null, // null = no previous value (first run)
                risingEdge: false,
                fallingEdge: false,
                currentState: false,
                debug: false
            };

            // Input
            this.addInput("input", new ClassicPreset.Input(
                sockets.boolean || new ClassicPreset.Socket('boolean'), 
                "Input"
            ));

            // Outputs
            this.addOutput("rising", new ClassicPreset.Output(
                sockets.boolean || new ClassicPreset.Socket('boolean'), 
                "Rising"
            ));
            this.addOutput("falling", new ClassicPreset.Output(
                sockets.boolean || new ClassicPreset.Socket('boolean'), 
                "Falling"
            ));
            this.addOutput("changed", new ClassicPreset.Output(
                sockets.boolean || new ClassicPreset.Socket('boolean'), 
                "Changed"
            ));
            this.addOutput("state", new ClassicPreset.Output(
                sockets.boolean || new ClassicPreset.Socket('boolean'), 
                "State"
            ));
        }

        /**
         * Convert any input value to boolean
         */
        toBoolean(value) {
            if (value === undefined || value === null) return false;
            if (typeof value === 'boolean') return value;
            if (typeof value === 'number') return value !== 0;
            if (typeof value === 'string') {
                const lower = value.toLowerCase().trim();
                return lower === 'true' || lower === 'on' || lower === '1' || lower === 'yes';
            }
            return !!value;
        }

        data(inputs) {
            // Get input value and convert to boolean
            const rawInput = inputs.input?.[0];
            const currentState = this.toBoolean(rawInput);
            const lastState = this.properties.lastInputState;

            // Detect edges
            let risingEdge = false;
            let fallingEdge = false;

            if (lastState !== null) {
                // Rising edge: was false, now true
                risingEdge = !lastState && currentState;
                // Falling edge: was true, now false
                fallingEdge = lastState && !currentState;
            }

            // Store state for next cycle
            this.properties.lastInputState = currentState;
            this.properties.risingEdge = risingEdge;
            this.properties.fallingEdge = fallingEdge;
            this.properties.currentState = currentState;

            if (this.properties.debug && (risingEdge || fallingEdge)) {
                console.log(`[EdgeDetector] ${risingEdge ? 'RISING' : 'FALLING'} edge detected`);
            }

            return {
                rising: risingEdge,
                falling: fallingEdge,
                changed: risingEdge || fallingEdge,
                state: currentState
            };
        }

        serialize() {
            return {
                lastInputState: this.properties.lastInputState,
                debug: this.properties.debug
            };
        }

        restore(state) {
            const props = state.properties || state;
            if (props) {
                // Restore last state so edges work correctly after reload
                if (props.lastInputState !== undefined) {
                    this.properties.lastInputState = props.lastInputState;
                }
                if (props.debug !== undefined) {
                    this.properties.debug = props.debug;
                }
            }
        }
    }

    // -------------------------------------------------------------------------
    // REACT COMPONENT
    // -------------------------------------------------------------------------
    function EdgeDetectorNodeComponent({ data, emit }) {
        const [state, setState] = useState({
            currentState: data.properties.currentState || false,
            risingEdge: data.properties.risingEdge || false,
            fallingEdge: data.properties.fallingEdge || false
        });

        // Update state when properties change
        useEffect(() => {
            const interval = setInterval(() => {
                setState({
                    currentState: data.properties.currentState || false,
                    risingEdge: data.properties.risingEdge || false,
                    fallingEdge: data.properties.fallingEdge || false
                });
            }, 200);
            return () => clearInterval(interval);
        }, [data]);

        return React.createElement('div', { className: 'logic-node edge-detector-node' }, [
            // Header
            React.createElement('div', { 
                key: 'header', 
                className: 'header',
                style: { 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    padding: '8px 10px'
                }
            }, [
                React.createElement('div', { 
                    key: 'title-area',
                    style: { display: 'flex', alignItems: 'center', gap: '8px' }
                }, [
                    React.createElement('span', { key: 'icon' }, '📈'),
                    React.createElement('span', { key: 'title' }, 'Edge Detector')
                ]),
                React.createElement('div', { 
                    key: 'status-area',
                    style: { display: 'flex', alignItems: 'center', gap: '6px' }
                }, [
                    // Status dot showing current input state
                    React.createElement('div', {
                        key: 'status-dot',
                        title: state.currentState ? 'Input: TRUE' : 'Input: FALSE',
                        style: {
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            backgroundColor: state.currentState ? '#4caf50' : '#555',
                            boxShadow: state.currentState ? '0 0 6px #4caf50' : 'none',
                            transition: 'all 0.2s'
                        }
                    }),
                    HelpIcon && React.createElement(HelpIcon, { 
                        key: 'help', 
                        text: tooltips.node, 
                        size: 14 
                    })
                ])
            ]),

            // IO Container
            React.createElement('div', { key: 'io', className: 'io-container' }, [
                // Input row
                React.createElement('div', { 
                    key: 'input-row', 
                    className: 'socket-row',
                    style: { marginBottom: '8px' }
                }, [
                    React.createElement(RefComponent, {
                        key: 'input-socket',
                        init: ref => emit({ 
                            type: "render", 
                            data: { 
                                type: "socket", 
                                element: ref, 
                                payload: data.inputs.input.socket, 
                                nodeId: data.id, 
                                side: "input", 
                                key: "input" 
                            } 
                        }),
                        unmount: ref => emit({ type: "unmount", data: { element: ref } })
                    }),
                    React.createElement('span', { 
                        key: 'input-label', 
                        className: 'socket-label',
                        style: { flex: 1 }
                    }, "Input"),
                    React.createElement('span', { 
                        key: 'input-value',
                        style: { 
                            fontSize: '11px', 
                            color: state.currentState ? '#4caf50' : '#888',
                            fontFamily: 'monospace'
                        }
                    }, state.currentState ? 'TRUE' : 'FALSE')
                ]),

                // Section header
                React.createElement('div', { 
                    key: 'section', 
                    className: 'section-header' 
                }, "OUTPUTS"),

                // Rising output
                React.createElement('div', { 
                    key: 'rising-row', 
                    className: 'socket-row' 
                }, [
                    React.createElement('span', { 
                        key: 'rising-indicator',
                        style: { 
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            backgroundColor: state.risingEdge ? '#4caf50' : 'transparent',
                            boxShadow: state.risingEdge ? '0 0 6px #4caf50' : 'none',
                            marginRight: '4px'
                        }
                    }),
                    React.createElement('span', { 
                        key: 'rising-label', 
                        className: 'socket-label',
                        style: { flex: 1 }
                    }, "↑ Rising"),
                    React.createElement(RefComponent, {
                        key: 'rising-socket',
                        init: ref => emit({ 
                            type: "render", 
                            data: { 
                                type: "socket", 
                                element: ref, 
                                payload: data.outputs.rising.socket, 
                                nodeId: data.id, 
                                side: "output", 
                                key: "rising" 
                            } 
                        }),
                        unmount: ref => emit({ type: "unmount", data: { element: ref } })
                    })
                ]),

                // Falling output
                React.createElement('div', { 
                    key: 'falling-row', 
                    className: 'socket-row' 
                }, [
                    React.createElement('span', { 
                        key: 'falling-indicator',
                        style: { 
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            backgroundColor: state.fallingEdge ? '#ff5722' : 'transparent',
                            boxShadow: state.fallingEdge ? '0 0 6px #ff5722' : 'none',
                            marginRight: '4px'
                        }
                    }),
                    React.createElement('span', { 
                        key: 'falling-label', 
                        className: 'socket-label',
                        style: { flex: 1 }
                    }, "↓ Falling"),
                    React.createElement(RefComponent, {
                        key: 'falling-socket',
                        init: ref => emit({ 
                            type: "render", 
                            data: { 
                                type: "socket", 
                                element: ref, 
                                payload: data.outputs.falling.socket, 
                                nodeId: data.id, 
                                side: "output", 
                                key: "falling" 
                            } 
                        }),
                        unmount: ref => emit({ type: "unmount", data: { element: ref } })
                    })
                ]),

                // Changed output
                React.createElement('div', { 
                    key: 'changed-row', 
                    className: 'socket-row' 
                }, [
                    React.createElement('span', { 
                        key: 'changed-indicator',
                        style: { 
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            backgroundColor: (state.risingEdge || state.fallingEdge) ? '#ff9800' : 'transparent',
                            boxShadow: (state.risingEdge || state.fallingEdge) ? '0 0 6px #ff9800' : 'none',
                            marginRight: '4px'
                        }
                    }),
                    React.createElement('span', { 
                        key: 'changed-label', 
                        className: 'socket-label',
                        style: { flex: 1 }
                    }, "⟷ Changed"),
                    React.createElement(RefComponent, {
                        key: 'changed-socket',
                        init: ref => emit({ 
                            type: "render", 
                            data: { 
                                type: "socket", 
                                element: ref, 
                                payload: data.outputs.changed.socket, 
                                nodeId: data.id, 
                                side: "output", 
                                key: "changed" 
                            } 
                        }),
                        unmount: ref => emit({ type: "unmount", data: { element: ref } })
                    })
                ]),

                // State output
                React.createElement('div', { 
                    key: 'state-row', 
                    className: 'socket-row' 
                }, [
                    React.createElement('span', { 
                        key: 'state-indicator',
                        style: { 
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            backgroundColor: state.currentState ? '#2196f3' : '#555',
                            marginRight: '4px'
                        }
                    }),
                    React.createElement('span', { 
                        key: 'state-label', 
                        className: 'socket-label',
                        style: { flex: 1 }
                    }, "● State"),
                    React.createElement(RefComponent, {
                        key: 'state-socket',
                        init: ref => emit({ 
                            type: "render", 
                            data: { 
                                type: "socket", 
                                element: ref, 
                                payload: data.outputs.state.socket, 
                                nodeId: data.id, 
                                side: "output", 
                                key: "state" 
                            } 
                        }),
                        unmount: ref => emit({ type: "unmount", data: { element: ref } })
                    })
                ])
            ])
        ]);
    }

    // -------------------------------------------------------------------------
    // REGISTER
    // -------------------------------------------------------------------------
    window.nodeRegistry.register('EdgeDetectorNode', {
        label: "Edge Detector",
        category: "Logic",
        nodeClass: EdgeDetectorNode,
        component: EdgeDetectorNodeComponent,
        factory: (cb) => new EdgeDetectorNode(cb)
    });

    // console.log("[EdgeDetectorNode] Registered");
})();
