/**
 * SubGraphNode - A node that contains an internal graph (ComfyUI-style)
 * 
 * Features:
 * - Double-click to enter and view/edit internal nodes
 * - Exposed inputs/outputs appear as sockets on this node
 * - Internal graph executes as a unit
 */
(function() {
    'use strict';
    
    if (!window.Rete || !window.React || !window.sockets) {
        console.warn('[SubGraphNode] Dependencies not ready, deferring...');
        return;
    }
    
    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect, useRef } = React;
    const sockets = window.sockets;
    
    // =========================================================================
    // SubGraphNode Class
    // =========================================================================
    class SubGraphNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("Sub-Graph");
            this.changeCallback = changeCallback;
            this.width = 200;
            this.height = 120;
            
            this.properties = {
                name: "Untitled Sub-Graph",
                description: "",
                icon: "📦",
                // Internal graph data
                internalNodes: [],
                internalConnections: [],
                // Exposed ports mapping
                exposedInputs: [],   // [{ key, label, type, internalNodeId, internalPort }]
                exposedOutputs: [],  // [{ key, label, type, internalNodeId, internalPort }]
            };
            
            // Create default trigger input/output for basic functionality
            this.addInput('trigger', new ClassicPreset.Input(sockets.boolean, 'Trigger'));
            this.addOutput('out', new ClassicPreset.Output(sockets.any, 'Output'));
        }
        
        /**
         * Rebuild sockets based on exposed ports
         */
        rebuildSockets() {
            // Clear existing sockets (except default ones if no exposed ports)
            const inputKeys = Object.keys(this.inputs);
            const outputKeys = Object.keys(this.outputs);
            
            // Remove old dynamic sockets
            inputKeys.forEach(key => {
                if (key.startsWith('exp_')) {
                    delete this.inputs[key];
                }
            });
            outputKeys.forEach(key => {
                if (key.startsWith('exp_')) {
                    delete this.outputs[key];
                }
            });
            
            // Add exposed inputs
            this.properties.exposedInputs.forEach(exp => {
                const socketType = sockets[exp.type] || sockets.any;
                this.addInput(`exp_${exp.key}`, new ClassicPreset.Input(socketType, exp.label));
            });
            
            // Add exposed outputs
            this.properties.exposedOutputs.forEach(exp => {
                const socketType = sockets[exp.type] || sockets.any;
                this.addOutput(`exp_${exp.key}`, new ClassicPreset.Output(socketType, exp.label));
            });
            
            // Update node height based on socket count
            const socketCount = Math.max(
                this.properties.exposedInputs.length + 1,
                this.properties.exposedOutputs.length + 1
            );
            this.height = Math.max(120, 60 + socketCount * 30);
        }
        
        /**
         * Set the internal graph data
         */
        setInternalGraph(nodes, connections) {
            this.properties.internalNodes = nodes;
            this.properties.internalConnections = connections;
            if (this.changeCallback) this.changeCallback();
        }
        
        /**
         * Add an exposed input
         */
        exposeInput(key, label, type, internalNodeId, internalPort) {
            this.properties.exposedInputs.push({
                key,
                label,
                type,
                internalNodeId,
                internalPort
            });
            this.rebuildSockets();
            if (this.changeCallback) this.changeCallback();
        }
        
        /**
         * Add an exposed output
         */
        exposeOutput(key, label, type, internalNodeId, internalPort) {
            this.properties.exposedOutputs.push({
                key,
                label,
                type,
                internalNodeId,
                internalPort
            });
            this.rebuildSockets();
            if (this.changeCallback) this.changeCallback();
        }
        
        /**
         * Remove an exposed input
         */
        unexposeInput(key) {
            this.properties.exposedInputs = this.properties.exposedInputs.filter(e => e.key !== key);
            this.rebuildSockets();
            if (this.changeCallback) this.changeCallback();
        }
        
        /**
         * Remove an exposed output
         */
        unexposeOutput(key) {
            this.properties.exposedOutputs = this.properties.exposedOutputs.filter(e => e.key !== key);
            this.rebuildSockets();
            if (this.changeCallback) this.changeCallback();
        }
        
        /**
         * Data processing - runs internal graph and returns outputs
         */
        data(inputs) {
            // For now, pass through trigger to output
            // Full implementation will process internal graph
            const trigger = inputs.trigger?.[0];
            
            // Collect exposed input values
            const exposedInputValues = {};
            this.properties.exposedInputs.forEach(exp => {
                const inputKey = `exp_${exp.key}`;
                exposedInputValues[exp.key] = inputs[inputKey]?.[0];
            });
            
            // TODO: Process internal graph with exposedInputValues
            // For now, just pass trigger through
            
            return {
                out: trigger,
                // Add exposed outputs here after processing
            };
        }
        
        serialize() {
            return {
                name: this.properties.name,
                description: this.properties.description,
                icon: this.properties.icon,
                internalNodes: this.properties.internalNodes,
                internalConnections: this.properties.internalConnections,
                exposedInputs: this.properties.exposedInputs,
                exposedOutputs: this.properties.exposedOutputs,
            };
        }
        
        restore(state) {
            const props = state.properties || state;
            if (props) {
                Object.assign(this.properties, props);
                this.rebuildSockets();
            }
        }
    }
    
    // =========================================================================
    // React Component
    // =========================================================================
    function SubGraphNodeComponent({ data, emit }) {
        const [name, setName] = useState(data.properties?.name || "Untitled Sub-Graph");
        const [isEditing, setIsEditing] = useState(false);
        const inputRef = useRef(null);
        
        // Get shared components
        const { NodeHeader, HelpIcon } = window.T2Controls || {};
        const RefComponent = window.RefComponent;
        
        useEffect(() => {
            if (data.properties) {
                setName(data.properties.name);
            }
        }, [data.properties?.name]);
        
        // Handle double-click to enter sub-graph
        const handleDoubleClick = (e) => {
            console.log('[SubGraph] Double-click detected!', { 
                nodeId: data.id, 
                hasEnterSubGraph: !!window.enterSubGraph,
                internalNodes: data.properties?.internalNodes?.length || 0
            });
            e.stopPropagation();
            e.preventDefault();
            // Emit event to Editor to enter sub-graph view
            if (window.enterSubGraph) {
                console.log('[SubGraph] Calling window.enterSubGraph...');
                window.enterSubGraph(data.id, data.properties);
            } else {
                console.log('[SubGraph] window.enterSubGraph NOT FOUND!');
                // Fallback: show alert until Editor integration is complete
                if (window.T2Toast) {
                    window.T2Toast.info('Sub-graph editing coming soon!');
                }
            }
        };
        
        // Handle name editing
        const startEditing = (e) => {
            e.stopPropagation();
            setIsEditing(true);
            setTimeout(() => inputRef.current?.focus(), 0);
        };
        
        const finishEditing = () => {
            setIsEditing(false);
            data.properties.name = name;
            if (data.changeCallback) data.changeCallback();
        };
        
        const handleKeyDown = (e) => {
            if (e.key === 'Enter') {
                finishEditing();
            } else if (e.key === 'Escape') {
                setName(data.properties?.name || "Untitled Sub-Graph");
                setIsEditing(false);
            }
        };
        
        // Tooltip content
        const tooltip = "Contains an internal graph. Double-click to enter and edit the internal nodes.";
        
        // Count exposed ports
        const inputCount = (data.properties?.exposedInputs?.length || 0) + 1;
        const outputCount = (data.properties?.exposedOutputs?.length || 0) + 1;
        
        return React.createElement('div', {
            className: 'subgraph-node',
            onDoubleClick: handleDoubleClick,
            style: {
                background: 'linear-gradient(135deg, #2a4858 0%, #1a2f3a 100%)',
                borderRadius: '8px',
                padding: '8px',
                minWidth: '180px',
                border: '2px solid #3d6070',
                cursor: 'pointer'
            }
        }, [
            // Header
            React.createElement('div', {
                key: 'header',
                style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '8px',
                    borderBottom: '1px solid #3d6070',
                    paddingBottom: '6px'
                }
            }, [
                // Icon
                React.createElement('span', {
                    key: 'icon',
                    style: { fontSize: '18px' }
                }, data.properties?.icon || '📦'),
                
                // Name (editable)
                isEditing ? 
                    React.createElement('input', {
                        key: 'name-input',
                        ref: inputRef,
                        value: name,
                        onChange: (e) => setName(e.target.value),
                        onBlur: finishEditing,
                        onKeyDown: handleKeyDown,
                        onPointerDown: (e) => e.stopPropagation(),
                        style: {
                            flex: 1,
                            background: '#1a2530',
                            border: '1px solid #4a90a4',
                            borderRadius: '3px',
                            color: '#fff',
                            padding: '2px 6px',
                            fontSize: '13px',
                            fontWeight: 'bold'
                        }
                    }) :
                    React.createElement('span', {
                        key: 'name',
                        onDoubleClick: startEditing,
                        style: {
                            flex: 1,
                            color: '#e0e0e0',
                            fontWeight: 'bold',
                            fontSize: '13px',
                            cursor: 'text'
                        }
                    }, name),
                
                // Help icon
                HelpIcon && React.createElement(HelpIcon, {
                    key: 'help',
                    text: tooltip,
                    size: 14
                })
            ]),
            
            // Info section - double-click here to enter
            React.createElement('div', {
                key: 'info',
                onDoubleClick: handleDoubleClick,
                style: {
                    fontSize: '11px',
                    color: '#8aa8b8',
                    marginBottom: '8px',
                    cursor: 'pointer',
                    padding: '4px',
                    borderRadius: '4px',
                    background: 'rgba(255,255,255,0.05)'
                },
                title: 'Double-click to enter sub-graph'
            }, [
                React.createElement('div', { key: 'nodes' }, 
                    `${data.properties?.internalNodes?.length || 0} internal nodes`
                ),
                React.createElement('div', { key: 'ports' },
                    `${inputCount} inputs, ${outputCount} outputs`
                ),
                // Enter button
                React.createElement('button', {
                    key: 'enter-btn',
                    onClick: (e) => {
                        e.stopPropagation();
                        handleDoubleClick(e);
                    },
                    onPointerDown: (e) => e.stopPropagation(),
                    style: {
                        marginTop: '6px',
                        width: '100%',
                        padding: '4px 8px',
                        background: '#3d6070',
                        border: '1px solid #5a8090',
                        borderRadius: '4px',
                        color: '#cde',
                        cursor: 'pointer',
                        fontSize: '11px'
                    }
                }, '▶ Enter Sub-Graph')
            ]),
            
            // Sockets container
            React.createElement('div', {
                key: 'sockets',
                style: {
                    display: 'flex',
                    justifyContent: 'space-between'
                }
            }, [
                // Inputs column
                React.createElement('div', {
                    key: 'inputs',
                    style: { display: 'flex', flexDirection: 'column', gap: '4px' }
                }, Object.entries(data.inputs || {}).map(([key, input]) =>
                    React.createElement('div', {
                        key: `in-${key}`,
                        style: {
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }
                    }, [
                        RefComponent && React.createElement(RefComponent, {
                            key: 'socket',
                            init: ref => ref && emit({ type: 'render', data: { type: 'socket', side: 'input', key, nodeId: data.id, element: ref, payload: input.socket } })
                        }),
                        React.createElement('span', {
                            key: 'label',
                            style: { fontSize: '11px', color: '#aaa' }
                        }, input.label || key)
                    ])
                )),
                
                // Outputs column
                React.createElement('div', {
                    key: 'outputs',
                    style: { display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }
                }, Object.entries(data.outputs || {}).map(([key, output]) =>
                    React.createElement('div', {
                        key: `out-${key}`,
                        style: {
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }
                    }, [
                        React.createElement('span', {
                            key: 'label',
                            style: { fontSize: '11px', color: '#aaa' }
                        }, output.label || key),
                        RefComponent && React.createElement(RefComponent, {
                            key: 'socket',
                            init: ref => ref && emit({ type: 'render', data: { type: 'socket', side: 'output', key, nodeId: data.id, element: ref, payload: output.socket } })
                        })
                    ])
                ))
            ]),
            
            // "Double-click to enter" hint
            React.createElement('div', {
                key: 'hint',
                style: {
                    marginTop: '8px',
                    fontSize: '10px',
                    color: '#667788',
                    textAlign: 'center',
                    fontStyle: 'italic'
                }
            }, '⇥ Double-click to enter')
        ]);
    }
    
    // =========================================================================
    // Register Node
    // =========================================================================
    if (window.nodeRegistry) {
        window.nodeRegistry.register('SubGraphNode', {
            label: "Sub-Graph",
            category: "Utility",
            nodeClass: SubGraphNode,
            component: SubGraphNodeComponent,
            factory: (cb) => new SubGraphNode(cb)
        });
        console.log('[SubGraphNode] ✅ Registered');
    } else {
        console.error('[SubGraphNode] nodeRegistry not available');
    }
    
})();
