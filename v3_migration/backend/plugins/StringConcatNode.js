/**
 * StringConcatNode.js
 * 
 * Concatenates multiple string inputs together with an optional separator.
 * 
 * Inputs:
 *   - string1: First string
 *   - string2: Second string
 *   - string3: Third string (optional)
 *   - string4: Fourth string (optional)
 * 
 * Outputs:
 *   - result: The concatenated string
 */
(function() {
    if (!window.Rete || !window.React || !window.sockets) {
        console.warn('[StringConcatNode] Missing dependencies');
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect, useRef } = React;
    const sockets = window.sockets;
    const RefComponent = window.RefComponent;

    // Tooltips
    const tooltips = {
        node: "Combines multiple text strings into one. Connect text outputs from other nodes to build dynamic messages.",
        inputs: {
            string: "A text string to include in the output"
        },
        outputs: {
            result: "The combined text string"
        },
        controls: {
            separator: "Text to insert between each string (e.g., space, comma, newline)",
            prefix: "Text to add at the beginning",
            suffix: "Text to add at the end"
        }
    };

    class StringConcatNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("String Concat");
            this.changeCallback = changeCallback;
            this.width = 260;
            this.height = 280;

            this.properties = {
                separator: ' ',  // Default: space between strings
                prefix: '',
                suffix: '',
                skipEmpty: true  // Skip null/undefined/empty inputs
            };

            // Inputs - 4 string inputs
            this.addInput('string1', new ClassicPreset.Input(sockets.any, 'String 1'));
            this.addInput('string2', new ClassicPreset.Input(sockets.any, 'String 2'));
            this.addInput('string3', new ClassicPreset.Input(sockets.any, 'String 3'));
            this.addInput('string4', new ClassicPreset.Input(sockets.any, 'String 4'));

            // Output
            this.addOutput('result', new ClassicPreset.Output(sockets.any, 'Result'));
        }

        data(inputs) {
            const { separator, prefix, suffix, skipEmpty } = this.properties;
            
            // Collect all input strings
            const strings = [];
            for (let i = 1; i <= 4; i++) {
                const input = inputs[`string${i}`]?.[0];
                if (input !== undefined && input !== null) {
                    const str = String(input);
                    if (!skipEmpty || str.trim() !== '') {
                        strings.push(str);
                    }
                }
            }

            // Concatenate with separator, add prefix/suffix
            const joined = strings.join(separator);
            const result = prefix + joined + suffix;

            return {
                result: result
            };
        }

        serialize() {
            return {
                separator: this.properties.separator,
                prefix: this.properties.prefix,
                suffix: this.properties.suffix,
                skipEmpty: this.properties.skipEmpty
            };
        }

        restore(state) {
            const props = state.properties || state;
            if (props) {
                if (props.separator !== undefined) this.properties.separator = props.separator;
                if (props.prefix !== undefined) this.properties.prefix = props.prefix;
                if (props.suffix !== undefined) this.properties.suffix = props.suffix;
                if (props.skipEmpty !== undefined) this.properties.skipEmpty = props.skipEmpty;
            }
        }
    }

    // React Component
    function StringConcatComponent({ data, emit }) {
        const [separator, setSeparator] = useState(data.properties.separator ?? ' ');
        const [prefix, setPrefix] = useState(data.properties.prefix || '');
        const [suffix, setSuffix] = useState(data.properties.suffix || '');
        const [skipEmpty, setSkipEmpty] = useState(data.properties.skipEmpty !== false);
        const [preview, setPreview] = useState('');
        const { NodeHeader, HelpIcon } = window.T2Controls || {};

        // Update preview when inputs change
        useEffect(() => {
            const updatePreview = () => {
                // We can't access inputs directly, but we can show the config
                const sep = separator === ' ' ? '␣' : separator === '\n' ? '↵' : separator;
                setPreview(`[prefix]${prefix ? `"${prefix}"` : ''} + strings joined by "${sep}" + [suffix]${suffix ? `"${suffix}"` : ''}`);
            };
            updatePreview();
        }, [separator, prefix, suffix]);

        const handleSeparatorChange = (e) => {
            // Handle special escape sequences
            let value = e.target.value;
            setSeparator(value);
            // Convert display value to actual value
            if (value === '\\n') value = '\n';
            if (value === '\\t') value = '\t';
            data.properties.separator = value;
            if (data.changeCallback) data.changeCallback();
        };

        const handlePrefixChange = (e) => {
            const value = e.target.value;
            setPrefix(value);
            data.properties.prefix = value;
            if (data.changeCallback) data.changeCallback();
        };

        const handleSuffixChange = (e) => {
            const value = e.target.value;
            setSuffix(value);
            data.properties.suffix = value;
            if (data.changeCallback) data.changeCallback();
        };

        const handleSkipEmptyChange = (e) => {
            const value = e.target.checked;
            setSkipEmpty(value);
            data.properties.skipEmpty = value;
            if (data.changeCallback) data.changeCallback();
        };

        const inputStyle = {
            width: '100%',
            padding: '4px 6px',
            background: '#2a2a2a',
            color: '#fff',
            border: '1px solid #444',
            borderRadius: '4px',
            fontSize: '11px',
            boxSizing: 'border-box'
        };

        const labelStyle = {
            fontSize: '11px',
            color: '#aaa',
            marginBottom: '2px'
        };

        return React.createElement('div', {
            className: 'string-concat-node',
            style: {
                padding: '8px',
                fontFamily: 'Arial, sans-serif',
                minWidth: '240px',
                background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
                borderRadius: '8px'
            }
        }, [
            // Header
            NodeHeader ? React.createElement(NodeHeader, {
                key: 'header',
                icon: '🔗',
                title: 'String Concat',
                tooltip: tooltips.node
            }) : React.createElement('div', {
                key: 'header',
                style: { fontWeight: 'bold', marginBottom: '8px', color: '#ffb74d' }
            }, '🔗 String Concat'),

            // Inputs column
            React.createElement('div', {
                key: 'inputs',
                style: { marginBottom: '8px' }
            }, [
                // String 1
                React.createElement('div', {
                    key: 's1',
                    style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }
                }, [
                    React.createElement(RefComponent, {
                        key: 'socket',
                        init: ref => emit({ type: "render", data: { type: "socket", element: ref, payload: data.inputs.string1.socket, nodeId: data.id, side: "input", key: "string1" } }),
                        unmount: ref => emit({ type: "unmount", data: { element: ref } })
                    }),
                    React.createElement('span', { key: 'label', style: { fontSize: '11px', color: '#aaa' } }, 'String 1')
                ]),
                // String 2
                React.createElement('div', {
                    key: 's2',
                    style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }
                }, [
                    React.createElement(RefComponent, {
                        key: 'socket',
                        init: ref => emit({ type: "render", data: { type: "socket", element: ref, payload: data.inputs.string2.socket, nodeId: data.id, side: "input", key: "string2" } }),
                        unmount: ref => emit({ type: "unmount", data: { element: ref } })
                    }),
                    React.createElement('span', { key: 'label', style: { fontSize: '11px', color: '#aaa' } }, 'String 2')
                ]),
                // String 3
                React.createElement('div', {
                    key: 's3',
                    style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }
                }, [
                    React.createElement(RefComponent, {
                        key: 'socket',
                        init: ref => emit({ type: "render", data: { type: "socket", element: ref, payload: data.inputs.string3.socket, nodeId: data.id, side: "input", key: "string3" } }),
                        unmount: ref => emit({ type: "unmount", data: { element: ref } })
                    }),
                    React.createElement('span', { key: 'label', style: { fontSize: '11px', color: '#aaa' } }, 'String 3')
                ]),
                // String 4
                React.createElement('div', {
                    key: 's4',
                    style: { display: 'flex', alignItems: 'center', gap: '8px' }
                }, [
                    React.createElement(RefComponent, {
                        key: 'socket',
                        init: ref => emit({ type: "render", data: { type: "socket", element: ref, payload: data.inputs.string4.socket, nodeId: data.id, side: "input", key: "string4" } }),
                        unmount: ref => emit({ type: "unmount", data: { element: ref } })
                    }),
                    React.createElement('span', { key: 'label', style: { fontSize: '11px', color: '#aaa' } }, 'String 4')
                ])
            ]),

            // Separator control
            React.createElement('div', {
                key: 'sep-row',
                style: { marginBottom: '6px' }
            }, [
                React.createElement('div', { key: 'label', style: labelStyle }, [
                    'Separator ',
                    HelpIcon && React.createElement(HelpIcon, { key: 'h', text: tooltips.controls.separator, size: 10 })
                ]),
                React.createElement('input', {
                    key: 'input',
                    type: 'text',
                    value: separator === '\n' ? '\\n' : separator === '\t' ? '\\t' : separator,
                    onChange: handleSeparatorChange,
                    onPointerDown: (e) => e.stopPropagation(),
                    placeholder: 'space, comma, \\n',
                    style: inputStyle
                })
            ]),

            // Prefix control
            React.createElement('div', {
                key: 'prefix-row',
                style: { marginBottom: '6px' }
            }, [
                React.createElement('div', { key: 'label', style: labelStyle }, 'Prefix'),
                React.createElement('input', {
                    key: 'input',
                    type: 'text',
                    value: prefix,
                    onChange: handlePrefixChange,
                    onPointerDown: (e) => e.stopPropagation(),
                    placeholder: 'Text before...',
                    style: inputStyle
                })
            ]),

            // Suffix control
            React.createElement('div', {
                key: 'suffix-row',
                style: { marginBottom: '6px' }
            }, [
                React.createElement('div', { key: 'label', style: labelStyle }, 'Suffix'),
                React.createElement('input', {
                    key: 'input',
                    type: 'text',
                    value: suffix,
                    onChange: handleSuffixChange,
                    onPointerDown: (e) => e.stopPropagation(),
                    placeholder: 'Text after...',
                    style: inputStyle
                })
            ]),

            // Skip empty checkbox
            React.createElement('div', {
                key: 'skip-row',
                style: { marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }
            }, [
                React.createElement('input', {
                    key: 'checkbox',
                    type: 'checkbox',
                    checked: skipEmpty,
                    onChange: handleSkipEmptyChange,
                    onPointerDown: (e) => e.stopPropagation(),
                    style: { margin: 0 }
                }),
                React.createElement('span', { key: 'label', style: { fontSize: '11px', color: '#aaa' } }, 'Skip empty inputs')
            ]),

            // Output socket
            React.createElement('div', {
                key: 'output',
                style: {
                    display: 'flex',
                    justifyContent: 'flex-end',
                    alignItems: 'center',
                    gap: '8px',
                    borderTop: '1px solid #333',
                    paddingTop: '8px'
                }
            }, [
                React.createElement('span', {
                    key: 'label',
                    style: { fontSize: '11px', color: '#4caf50', fontWeight: 'bold' }
                }, 'Result'),
                React.createElement(RefComponent, {
                    key: 'socket',
                    init: ref => emit({ type: "render", data: { type: "socket", element: ref, payload: data.outputs.result.socket, nodeId: data.id, side: "output", key: "result" } }),
                    unmount: ref => emit({ type: "unmount", data: { element: ref } })
                })
            ])
        ]);
    }

    window.nodeRegistry.register('StringConcatNode', {
        label: 'String Concat',
        category: 'Utility',
        nodeClass: StringConcatNode,
        factory: (cb) => new StringConcatNode(cb),
        component: StringConcatComponent
    });

    // console.log('[StringConcatNode] Registered');
})();
