/**
 * SubGraph Port Nodes - Input/Output nodes for exposing ports on the parent SubGraphNode
 * 
 * Place these inside a sub-graph to define what ports appear on the outer node:
 * - SubGraph Input: Creates an INPUT socket on the parent node, outputs the value inside
 * - SubGraph Output: Creates an OUTPUT socket on the parent node, receives value from inside
 */
(function() {
    'use strict';
    
    if (!window.Rete || !window.React || !window.sockets) {
        console.warn('[SubGraphPortNodes] Dependencies not ready, deferring...');
        return;
    }
    
    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect, useRef } = React;
    const sockets = window.sockets;
    
    // =========================================================================
    // SubGraph Input Node - Exposes an INPUT on the parent SubGraphNode
    // =========================================================================
    class SubGraphInputNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("SubGraph Input");
            this.changeCallback = changeCallback;
            this.width = 160;
            this.height = 80;
            
            this.properties = {
                portName: "input",
                portType: "any"
            };
            
            // This node has an OUTPUT (sends data into the sub-graph)
            this.addOutput('value', new ClassicPreset.Output(sockets.any, 'Value'));
        }
        
        data(inputs) {
            // The value comes from the parent's exposed input - stored in properties
            return {
                value: this.properties._inputValue
            };
        }
        
        serialize() {
            return { ...this.properties };
        }
        
        restore(state) {
            const props = state.properties || state;
            if (props) {
                Object.assign(this.properties, props);
            }
        }
    }
    
    function SubGraphInputComponent({ data, emit }) {
        const [portName, setPortName] = useState(data.properties?.portName || "input");
        const [portType, setPortType] = useState(data.properties?.portType || "any");
        const inputRef = useRef(null);
        
        const { HelpIcon } = window.T2Controls || {};
        const RefComponent = window.RefComponent;
        
        const typeOptions = ['any', 'boolean', 'number', 'object'];
        
        const handleNameChange = (e) => {
            const newName = e.target.value;
            setPortName(newName);
            data.properties.portName = newName;
            if (data.changeCallback) data.changeCallback();
        };
        
        const handleTypeChange = (e) => {
            const newType = e.target.value;
            setPortType(newType);
            data.properties.portType = newType;
            if (data.changeCallback) data.changeCallback();
        };
        
        return React.createElement('div', {
            className: 'subgraph-input-node',
            style: {
                background: 'linear-gradient(135deg, #2d5a3d 0%, #1a3528 100%)',
                borderRadius: '8px',
                padding: '8px',
                minWidth: '140px',
                border: '2px solid #4a8a5a'
            }
        }, [
            // Header
            React.createElement('div', {
                key: 'header',
                style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    marginBottom: '8px',
                    color: '#8fdf9f',
                    fontWeight: 'bold',
                    fontSize: '12px'
                }
            }, [
                React.createElement('span', { key: 'icon' }, '📥'),
                React.createElement('span', { key: 'title' }, 'Sub-Graph Input'),
                HelpIcon && React.createElement(HelpIcon, {
                    key: 'help',
                    text: 'This creates an INPUT port on the parent Sub-Graph node. Connect nodes inside the sub-graph to the "Value" output.',
                    size: 12
                })
            ]),
            
            // Port name input
            React.createElement('div', {
                key: 'name-row',
                style: { marginBottom: '6px' }
            }, [
                React.createElement('label', {
                    key: 'label',
                    style: { fontSize: '10px', color: '#8ab', display: 'block', marginBottom: '2px' }
                }, 'Port Name:'),
                React.createElement('input', {
                    key: 'input',
                    ref: inputRef,
                    value: portName,
                    onChange: handleNameChange,
                    onPointerDown: (e) => e.stopPropagation(),
                    style: {
                        width: '100%',
                        background: '#1a2530',
                        border: '1px solid #4a6a5a',
                        borderRadius: '3px',
                        color: '#fff',
                        padding: '3px 6px',
                        fontSize: '11px'
                    }
                })
            ]),
            
            // Type dropdown
            React.createElement('div', {
                key: 'type-row',
                style: { marginBottom: '8px' }
            }, [
                React.createElement('label', {
                    key: 'label',
                    style: { fontSize: '10px', color: '#8ab', display: 'block', marginBottom: '2px' }
                }, 'Type:'),
                React.createElement('select', {
                    key: 'select',
                    value: portType,
                    onChange: handleTypeChange,
                    onPointerDown: (e) => e.stopPropagation(),
                    style: {
                        width: '100%',
                        background: '#1a2530',
                        border: '1px solid #4a6a5a',
                        borderRadius: '3px',
                        color: '#fff',
                        padding: '3px 6px',
                        fontSize: '11px'
                    }
                }, typeOptions.map(t => React.createElement('option', { key: t, value: t }, t)))
            ]),
            
            // Output socket
            React.createElement('div', {
                key: 'output',
                style: {
                    display: 'flex',
                    justifyContent: 'flex-end',
                    alignItems: 'center',
                    gap: '6px'
                }
            }, [
                React.createElement('span', {
                    key: 'label',
                    style: { fontSize: '11px', color: '#aaa' }
                }, 'Value →'),
                RefComponent && React.createElement(RefComponent, {
                    key: 'socket',
                    init: ref => ref && emit({ type: 'render', data: { type: 'socket', side: 'output', key: 'value', nodeId: data.id, element: ref, payload: data.outputs?.value?.socket } })
                })
            ])
        ]);
    }
    
    // =========================================================================
    // SubGraph Output Node - Exposes an OUTPUT on the parent SubGraphNode
    // =========================================================================
    class SubGraphOutputNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("SubGraph Output");
            this.changeCallback = changeCallback;
            this.width = 160;
            this.height = 80;
            
            this.properties = {
                portName: "output",
                portType: "any"
            };
            
            // This node has an INPUT (receives data from inside the sub-graph)
            this.addInput('value', new ClassicPreset.Input(sockets.any, 'Value'));
        }
        
        data(inputs) {
            // Store the incoming value so the parent can read it
            const value = inputs.value?.[0];
            this.properties._outputValue = value;
            return {};
        }
        
        serialize() {
            return { ...this.properties };
        }
        
        restore(state) {
            const props = state.properties || state;
            if (props) {
                Object.assign(this.properties, props);
            }
        }
    }
    
    function SubGraphOutputComponent({ data, emit }) {
        const [portName, setPortName] = useState(data.properties?.portName || "output");
        const [portType, setPortType] = useState(data.properties?.portType || "any");
        const inputRef = useRef(null);
        
        const { HelpIcon } = window.T2Controls || {};
        const RefComponent = window.RefComponent;
        
        const typeOptions = ['any', 'boolean', 'number', 'object'];
        
        const handleNameChange = (e) => {
            const newName = e.target.value;
            setPortName(newName);
            data.properties.portName = newName;
            if (data.changeCallback) data.changeCallback();
        };
        
        const handleTypeChange = (e) => {
            const newType = e.target.value;
            setPortType(newType);
            data.properties.portType = newType;
            if (data.changeCallback) data.changeCallback();
        };
        
        return React.createElement('div', {
            className: 'subgraph-output-node',
            style: {
                background: 'linear-gradient(135deg, #5a3d2d 0%, #352818 100%)',
                borderRadius: '8px',
                padding: '8px',
                minWidth: '140px',
                border: '2px solid #8a6a4a'
            }
        }, [
            // Header
            React.createElement('div', {
                key: 'header',
                style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    marginBottom: '8px',
                    color: '#dfaf8f',
                    fontWeight: 'bold',
                    fontSize: '12px'
                }
            }, [
                React.createElement('span', { key: 'icon' }, '📤'),
                React.createElement('span', { key: 'title' }, 'Sub-Graph Output'),
                HelpIcon && React.createElement(HelpIcon, {
                    key: 'help',
                    text: 'This creates an OUTPUT port on the parent Sub-Graph node. Connect the "Value" input to receive data from inside the sub-graph.',
                    size: 12
                })
            ]),
            
            // Port name input
            React.createElement('div', {
                key: 'name-row',
                style: { marginBottom: '6px' }
            }, [
                React.createElement('label', {
                    key: 'label',
                    style: { fontSize: '10px', color: '#8ab', display: 'block', marginBottom: '2px' }
                }, 'Port Name:'),
                React.createElement('input', {
                    key: 'input',
                    ref: inputRef,
                    value: portName,
                    onChange: handleNameChange,
                    onPointerDown: (e) => e.stopPropagation(),
                    style: {
                        width: '100%',
                        background: '#1a2530',
                        border: '1px solid #6a5a4a',
                        borderRadius: '3px',
                        color: '#fff',
                        padding: '3px 6px',
                        fontSize: '11px'
                    }
                })
            ]),
            
            // Type dropdown
            React.createElement('div', {
                key: 'type-row',
                style: { marginBottom: '8px' }
            }, [
                React.createElement('label', {
                    key: 'label',
                    style: { fontSize: '10px', color: '#8ab', display: 'block', marginBottom: '2px' }
                }, 'Type:'),
                React.createElement('select', {
                    key: 'select',
                    value: portType,
                    onChange: handleTypeChange,
                    onPointerDown: (e) => e.stopPropagation(),
                    style: {
                        width: '100%',
                        background: '#1a2530',
                        border: '1px solid #6a5a4a',
                        borderRadius: '3px',
                        color: '#fff',
                        padding: '3px 6px',
                        fontSize: '11px'
                    }
                }, typeOptions.map(t => React.createElement('option', { key: t, value: t }, t)))
            ]),
            
            // Input socket
            React.createElement('div', {
                key: 'input',
                style: {
                    display: 'flex',
                    justifyContent: 'flex-start',
                    alignItems: 'center',
                    gap: '6px'
                }
            }, [
                RefComponent && React.createElement(RefComponent, {
                    key: 'socket',
                    init: ref => ref && emit({ type: 'render', data: { type: 'socket', side: 'input', key: 'value', nodeId: data.id, element: ref, payload: data.inputs?.value?.socket } })
                }),
                React.createElement('span', {
                    key: 'label',
                    style: { fontSize: '11px', color: '#aaa' }
                }, '← Value')
            ])
        ]);
    }
    
    // =========================================================================
    // Register nodes
    // =========================================================================
    window.nodeRegistry.register('SubGraphInputNode', {
        label: "SubGraph Input",
        category: "Utility",
        nodeClass: SubGraphInputNode,
        component: SubGraphInputComponent,
        factory: (cb) => new SubGraphInputNode(cb)
    });
    
    window.nodeRegistry.register('SubGraphOutputNode', {
        label: "SubGraph Output",
        category: "Utility",
        nodeClass: SubGraphOutputNode,
        component: SubGraphOutputComponent,
        factory: (cb) => new SubGraphOutputNode(cb)
    });
    
    console.log('[SubGraphPortNodes] ✅ Registered SubGraph Input and SubGraph Output nodes');
})();
