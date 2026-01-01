/**
 * TextStringNode.js
 * 
 * A simple node that outputs a static text string.
 * Useful for creating fixed messages, labels, or text to concatenate.
 * 
 * Outputs:
 *   - text: The configured text string
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
        node: "Outputs a static text string. Use for fixed messages or text to combine with other strings.",
        outputs: {
            text: "The configured text string"
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
            this.height = 150;

            this.properties = {
                text: ''
            };

            // Output
            this.addOutput('text', new ClassicPreset.Output(sockets.any, 'Text'));
        }

        data(inputs) {
            return {
                text: this.properties.text
            };
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
        const { NodeHeader, HelpIcon } = window.T2Controls || {};

        // Sync with node properties
        useEffect(() => {
            setText(data.properties.text || '');
        }, [data.properties.text]);

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
            // Header
            NodeHeader ? React.createElement(NodeHeader, {
                key: 'header',
                icon: '📝',
                title: 'Text String',
                tooltip: tooltips.node
            }) : React.createElement('div', {
                key: 'header',
                style: { fontWeight: 'bold', marginBottom: '8px', color: '#ffb74d' }
            }, '📝 Text String'),

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
