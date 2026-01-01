/**
 * TextStringNode.js
 * 
 * A text node that outputs a static text string, with optional trigger gating.
 * 
 * Inputs:
 *   - trigger: (Optional) When connected, text only outputs when trigger is TRUE
 * 
 * Outputs:
 *   - text: The configured text string (or undefined if trigger is FALSE)
 * 
 * Behavior:
 *   - No trigger connected: Always outputs the text (backwards compatible)
 *   - Trigger connected + TRUE: Outputs the text
 *   - Trigger connected + FALSE/undefined: Outputs undefined (no text)
 */
(function() {
    if (!window.Rete || !window.React || !window.sockets) {
        console.warn('[TextStringNode] Missing dependencies');
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect } = React;
    const sockets = window.sockets;
    const RefComponent = window.RefComponent;

    // Tooltips
    const tooltips = {
        node: "Outputs a text string. Connect a trigger to gate the output - text only flows when triggered.\n\nPerfect for sending different messages based on events (rain started, motion detected, etc.)",
        inputs: {
            trigger: "When connected, text only outputs when this is TRUE.\n\nConnect to Edge Detector outputs to send text on state changes."
        },
        outputs: {
            text: "The configured text string (or undefined if trigger is FALSE)"
        },
        controls: {
            text: "Enter the text to output. Supports multi-line text."
        }
    };

    class TextStringNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("Text String");
            this.changeCallback = changeCallback;
            this.width = 250;
            this.height = 180;

            this.properties = {
                text: '',
                lastTriggered: false
            };

            // Optional trigger input
            this.addInput('trigger', new ClassicPreset.Input(sockets.boolean, 'Trigger'));

            // Output
            this.addOutput('text', new ClassicPreset.Output(sockets.any, 'Text'));
        }

        data(inputs) {
            const triggerInput = inputs.trigger;
            const hasTriggerConnection = triggerInput !== undefined && triggerInput !== null;
            
            // If trigger is connected, only output when TRUE
            if (hasTriggerConnection) {
                const triggerValue = triggerInput[0];
                const isTriggered = triggerValue === true;
                
                this.properties.lastTriggered = isTriggered;
                
                if (isTriggered) {
                    return { text: this.properties.text };
                } else {
                    return { text: undefined };
                }
            }
            
            // No trigger connected - always output (backwards compatible)
            return { text: this.properties.text };
        }

        serialize() {
            return {
                text: this.properties.text
            };
        }

        restore(state) {
            const props = state.properties || state;
            if (props) {
                this.properties.text = props.text || '';
            }
        }
    }

    // React Component
    function TextStringComponent({ data, emit }) {
        const [text, setText] = useState(data.properties.text || '');
        const [isTriggered, setIsTriggered] = useState(false);
        const { NodeHeader, HelpIcon } = window.T2Controls || {};

        // Sync with node properties
        useEffect(() => {
            setText(data.properties.text || '');
        }, [data.properties.text]);

        // Update triggered state for UI feedback
        useEffect(() => {
            const interval = setInterval(() => {
                setIsTriggered(data.properties.lastTriggered || false);
            }, 100);
            return () => clearInterval(interval);
        }, [data]);

        const handleTextChange = (e) => {
            const value = e.target.value;
            setText(value);
            data.properties.text = value;
            if (data.changeCallback) data.changeCallback();
        };

        return React.createElement('div', {
            className: 'text-string-node',
            style: {
                padding: '8px',
                fontFamily: 'Arial, sans-serif',
                minWidth: '230px',
                background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
                borderRadius: '8px'
            }
        }, [
            // Header with status indicator
            React.createElement('div', {
                key: 'header',
                style: {
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '8px',
                    padding: '4px 0'
                }
            }, [
                React.createElement('div', {
                    key: 'title-area',
                    style: { display: 'flex', alignItems: 'center', gap: '8px' }
                }, [
                    React.createElement('span', { key: 'icon' }, '📝'),
                    React.createElement('span', { 
                        key: 'title',
                        style: { fontWeight: 'bold', color: '#ffb74d' }
                    }, 'Text String')
                ]),
                React.createElement('div', {
                    key: 'status-area',
                    style: { display: 'flex', alignItems: 'center', gap: '6px' }
                }, [
                    // Triggered indicator
                    React.createElement('div', {
                        key: 'status',
                        title: isTriggered ? 'Triggered - Text flowing' : 'Waiting for trigger',
                        style: {
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            backgroundColor: isTriggered ? '#4caf50' : '#555',
                            boxShadow: isTriggered ? '0 0 6px #4caf50' : 'none',
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

            // Trigger input socket
            React.createElement('div', {
                key: 'trigger-row',
                style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '8px'
                }
            }, [
                React.createElement(RefComponent, {
                    key: 'trigger-socket',
                    init: ref => emit({ type: "render", data: { type: "socket", element: ref, payload: data.inputs.trigger.socket, nodeId: data.id, side: "input", key: "trigger" } }),
                    unmount: ref => emit({ type: "unmount", data: { element: ref } })
                }),
                React.createElement('span', {
                    key: 'trigger-label',
                    style: { fontSize: '11px', color: '#aaa' }
                }, 'Trigger (optional)')
            ]),

            // Text input area
            React.createElement('div', {
                key: 'input-row',
                style: { marginBottom: '8px' }
            }, [
                React.createElement('div', {
                    key: 'label',
                    style: { 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '4px',
                        marginBottom: '4px',
                        fontSize: '12px',
                        color: '#aaa'
                    }
                }, [
                    React.createElement('span', { key: 'l' }, 'Text:'),
                    HelpIcon && React.createElement(HelpIcon, { 
                        key: 'h', 
                        text: tooltips.controls.text, 
                        size: 12 
                    })
                ]),
                React.createElement('textarea', {
                    key: 'textarea',
                    value: text,
                    onChange: handleTextChange,
                    onPointerDown: (e) => e.stopPropagation(),
                    placeholder: 'Enter text here...',
                    rows: 3,
                    style: {
                        width: '100%',
                        padding: '6px',
                        background: '#2a2a2a',
                        color: '#fff',
                        border: '1px solid #444',
                        borderRadius: '4px',
                        fontSize: '12px',
                        resize: 'vertical',
                        fontFamily: 'inherit',
                        boxSizing: 'border-box'
                    }
                })
            ]),

            // Output socket
            React.createElement('div', {
                key: 'output',
                style: {
                    display: 'flex',
                    justifyContent: 'flex-end',
                    alignItems: 'center',
                    gap: '8px'
                }
            }, [
                React.createElement('span', {
                    key: 'label',
                    style: { fontSize: '11px', color: '#aaa' }
                }, 'Text'),
                React.createElement(RefComponent, {
                    key: 'socket',
                    init: ref => emit({ type: "render", data: { type: "socket", element: ref, payload: data.outputs.text.socket, nodeId: data.id, side: "output", key: "text" } }),
                    unmount: ref => emit({ type: "unmount", data: { element: ref } })
                })
            ])
        ]);
    }

    window.nodeRegistry.register('TextStringNode', {
        label: 'Text String',
        category: 'Utility',
        nodeClass: TextStringNode,
        factory: (cb) => new TextStringNode(cb),
        component: TextStringComponent
    });

    // console.log('[TextStringNode] Registered');
})();
