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
    const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
    const getNodeProperties = node => node?.data?.properties || node?.properties || node?.data || {};

    // Keep the plain-data clone and preflight rules aligned with the backend.
    // Never share saved configuration with a node's mutable runtime properties.
    function cloneConfig(value, ancestors = new Set(), budget = { count: 0 }, depth = 0) {
        if (++budget.count > 100000 || depth > 128) throw new Error('Subgraph configuration is too large/deep');
        if (value === null || typeof value !== 'object') {
            if (['function', 'symbol', 'bigint'].includes(typeof value)) throw new Error('Subgraph configuration must be plain data');
            return value;
        }
        if (ancestors.has(value)) throw new Error('Subgraph configuration contains a recursive reference');
        ancestors.add(value);
        const copy = Array.isArray(value) ? new Array(value.length) : {};
        for (const key of Object.keys(value)) {
            Object.defineProperty(copy, key, {
                value: cloneConfig(value[key], ancestors, budget, depth + 1),
                enumerable: true, configurable: true, writable: true
            });
        }
        ancestors.delete(value);
        return copy;
    }

    function sameConfig(a, b) {
        if (Object.is(a, b)) return true;
        if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
        if (Array.isArray(a) && a.length !== b.length) return false;
        const keys = Object.keys(a);
        return keys.length === Object.keys(b).length && keys.every(key => hasOwn(b, key) && sameConfig(a[key], b[key]));
    }

    function valuesFor(inputs, key) {
        if (!hasOwn(inputs, key)) return [];
        return Array.isArray(inputs[key]) ? inputs[key].slice() : [inputs[key]];
    }

    function resolveNode(node) {
        const registry = window.nodeRegistry;
        const types = [node.type, node.name, node.data?.type, node.data?.name].filter(Boolean);
        let definition;
        let type;
        for (const candidate of types) {
            definition = registry?.get(candidate);
            if (definition) { type = candidate; break; }
        }
        if (!definition) {
            for (const label of [...types, node.label].filter(Boolean)) {
                definition = registry?.getByLabel(label);
                if (definition) { type = definition.nodeClass?.type || label; break; }
            }
        }
        if (typeof definition?.factory !== 'function') throw new Error(`Unknown internal node type: ${types[0] || node.label || 'unknown'}`);
        const kind = definition === registry.get('SubGraphNode') ? 'graph'
            : definition === registry.get('SubGraphInputNode') ? 'input'
                : definition === registry.get('SubGraphOutputNode') ? 'output' : 'ordinary';
        return { definition, type, kind };
    }

    function portKeys(record, side) {
        if (record.kind === 'input') return side === 'outputs' ? ['value'] : [];
        if (record.kind === 'output') return side === 'inputs' ? ['value'] : [];
        if (record.kind === 'graph') {
            const exposed = record.properties[side === 'inputs' ? 'exposedInputs' : 'exposedOutputs'] || [];
            return [side === 'inputs' ? 'trigger' : 'out', ...exposed.map(port => `exp_${port.key}`)];
        }
        // Only saved/static socket metadata is safe to inspect before effects.
        const metadata = record.node[side] ?? record.node.data?.[side] ?? record.definition[side] ?? record.definition.nodeClass?.[side];
        if (Array.isArray(metadata)) {
            const keys = metadata.map(port => typeof port === 'string' ? port : port?.key);
            return keys.every(key => typeof key === 'string') ? keys : null;
        }
        return metadata && typeof metadata === 'object' ? Object.keys(metadata) : null;
    }

    function validateGraph(properties, budget = { nodes: 0 }, depth = 1) {
        if (depth > 8) throw new Error('Subgraph nesting exceeds 8 levels');
        const nodes = properties.internalNodes || [];
        const connections = properties.internalConnections || [];
        const exposedInputs = properties.exposedInputs || [];
        const exposedOutputs = properties.exposedOutputs || [];
        if (![nodes, connections, exposedInputs, exposedOutputs].every(Array.isArray)) throw new Error('Subgraph nodes/connections/ports must be arrays');
        budget.nodes += nodes.length;
        if (budget.nodes > 1000) throw new Error('Subgraph exceeds 1000 internal nodes');
        const records = new Map();
        for (const node of nodes) {
            if (!node || typeof node.id !== 'string' || !node.id) throw new Error('Subgraph node requires an id');
            if (records.has(node.id)) throw new Error(`Duplicate subgraph node id: ${node.id}`);
            const record = { node, properties: getNodeProperties(node), ...resolveNode(node) };
            records.set(node.id, record);
            if (record.kind === 'graph') validateGraph(record.properties, budget, depth + 1);
        }
        const checkPort = (id, port, side) => {
            const record = records.get(id);
            if (!record) throw new Error(`Subgraph port references an unknown node: ${id}`);
            const keys = portKeys(record, side);
            if (typeof port !== 'string' || !port || (keys && !keys.includes(port))) throw new Error(`Dangling subgraph ${side} port: ${id}.${port}`);
        };
        const degrees = new Map(nodes.map(node => [node.id, 0]));
        const outgoing = new Map(nodes.map(node => [node.id, []]));
        for (const connection of connections) {
            if (!connection) throw new Error('Invalid subgraph connection');
            checkPort(connection.source, connection.sourceOutput, 'outputs');
            checkPort(connection.target, connection.targetInput, 'inputs');
            outgoing.get(connection.source).push(connection.target);
            degrees.set(connection.target, degrees.get(connection.target) + 1);
        }
        for (const [ports, side] of [[exposedInputs, 'inputs'], [exposedOutputs, 'outputs']]) {
            const keys = new Set();
            for (const port of ports) {
                if (!port || typeof port.key !== 'string' || !port.key || keys.has(port.key)) throw new Error('Invalid/duplicate exposed subgraph port key');
                keys.add(port.key);
                const kind = records.get(port.internalNodeId)?.kind;
                const mappedSide = side === 'inputs' && kind === 'input' ? 'outputs' : side === 'outputs' && kind === 'output' ? 'inputs' : side;
                checkPort(port.internalNodeId, port.internalPort, mappedSide);
            }
        }
        const order = nodes.filter(node => degrees.get(node.id) === 0).map(node => node.id);
        for (let index = 0; index < order.length; index++) {
            for (const target of outgoing.get(order[index])) {
                degrees.set(target, degrees.get(target) - 1);
                if (degrees.get(target) === 0) order.push(target);
            }
        }
        if (order.length !== nodes.length) throw new Error('Subgraph contains a cycle');
        return { records, order, connections, exposedInputs, exposedOutputs };
    }

    async function cleanupNodes(nodes) {
        for (const node of nodes) {
            try {
                if (typeof node.destroy === 'function') await node.destroy();
                else if (typeof node.dispose === 'function') await node.dispose();
            } catch (error) {
                console.warn('[SubGraphNode] Internal node cleanup failed:', error);
            }
        }
    }
    
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

            this.internalNodeInstances = new Map();
            this.internalExecutionOrder = [];
            this._configuration = null;
            this._plan = null;
            this._tail = Promise.resolve();
            this._generation = 0;
            this._disposed = false;
            this._callbackToken = null;
            this._activeData = 0;
            this._pendingChange = false;
            this._changeTimer = null;
            
            // Create default trigger input/output for basic functionality
            this.addInput('trigger', new ClassicPreset.Input(sockets.boolean, 'Trigger'));
            this.addOutput('out', new ClassicPreset.Output(sockets.any, 'Output'));
        }

        _enqueue(operation) {
            const task = this._tail.then(operation);
            this._tail = task.catch(() => {});
            return task;
        }

        _cancelChanges() {
            if (this._callbackToken) this._callbackToken.active = false;
            if (this._changeTimer !== null) clearTimeout(this._changeTimer);
            this._changeTimer = null;
            this._pendingChange = false;
        }

        _internalChanged(token) {
            if (this._disposed || !token.active || token !== this._callbackToken) return;
            this._pendingChange = true;
            this._scheduleParentChange();
        }

        _scheduleParentChange() {
            if (this._disposed || this._activeData || !this._pendingChange || this._changeTimer !== null) return;
            this._changeTimer = setTimeout(() => {
                this._changeTimer = null;
                if (this._disposed || !this._callbackToken?.active || !this._pendingChange) return;
                // A timer can fire while a child awaits I/O. Let data()'s finally
                // schedule the notification, never reset the engine mid-fetch.
                if (this._activeData) return;
                this._pendingChange = false;
                try {
                    Promise.resolve(this.changeCallback?.()).catch(error => {
                        console.warn('[SubGraphNode] Parent callback failed:', error);
                    });
                } catch (error) {
                    console.warn('[SubGraphNode] Parent callback failed:', error);
                }
            }, 0);
        }

        async _clearInternalGraph() {
            this._cancelChanges();
            const nodes = Array.from(this.internalNodeInstances.values());
            this.internalNodeInstances.clear();
            this.internalExecutionOrder = [];
            this._configuration = null;
            this._plan = null;
            await cleanupNodes(nodes);
        }

        disposeInternalGraph() {
            this._generation++;
            this._cancelChanges();
            // Wait for in-flight child data/restore before destroying its resources.
            return this._enqueue(() => this._clearInternalGraph());
        }

        _assertCurrent(generation) {
            if (this._disposed || generation !== this._generation) throw new Error('Subgraph evaluation cancelled/disposed');
        }

        async initializeInternalGraph(generation = this._generation) {
            const candidates = new Map();
            const token = { active: false };
            try {
                this._assertCurrent(generation);
                const configuration = cloneConfig({
                    internalNodes: this.properties.internalNodes,
                    internalConnections: this.properties.internalConnections,
                    exposedInputs: this.properties.exposedInputs,
                    exposedOutputs: this.properties.exposedOutputs
                });
                if (this._plan && sameConfig(configuration, this._configuration)) return;
                const plan = validateGraph(configuration);
                await this._clearInternalGraph();
                this._assertCurrent(generation);
                for (const [id, record] of plan.records) {
                    const instance = record.definition.factory(() => this._internalChanged(token));
                    if (!instance || typeof instance !== 'object') throw new Error(`Invalid internal node factory: ${record.type}`);
                    candidates.set(id, instance);
                    instance.id = id;
                    instance.label = record.node.label || instance.label || record.type;
                    const properties = cloneConfig(record.properties);
                    if (typeof instance.restore === 'function') await instance.restore({ properties });
                    else instance.properties = { ...(instance.properties || {}), ...properties };
                    // Commit the whole initialized tree, not a partially restored
                    // outer shell that leaks siblings if a deep restore fails.
                    if (record.kind === 'graph') await instance.initializeInternalGraph();
                    this._assertCurrent(generation);
                }
                this.internalNodeInstances = candidates;
                this.internalExecutionOrder = plan.order;
                this._configuration = configuration;
                this._plan = plan;
                this._callbackToken = token;
                token.active = true;
            } catch (error) {
                token.active = false;
                await cleanupNodes(candidates.values());
                await this._clearInternalGraph();
                throw error;
            }
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
                this.addInput(`exp_${exp.key}`, new ClassicPreset.Input(socketType, exp.label, true));
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
            this.properties.internalNodes = cloneConfig(nodes);
            this.properties.internalConnections = cloneConfig(connections);
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
         * Data processing - evaluates the internal graph as a nested dataflow.
         */
        data(inputs = {}) {
            const generation = this._generation;
            this._activeData++;
            return this._enqueue(async () => {
                try {
                    this._assertCurrent(generation);
                    await this.initializeInternalGraph(generation);
                    this._assertCurrent(generation);
                    const plan = this._plan;
                    const inputsByNode = new Map(plan.order.map(id => [id, Object.create(null)]));
                    const append = (id, port, values) => {
                        const nodeInputs = inputsByNode.get(id);
                        if (!hasOwn(nodeInputs, port)) nodeInputs[port] = [];
                        nodeInputs[port].push(...values);
                    };
                    for (const [id, record] of plan.records) {
                        if (record.kind === 'input') this.internalNodeInstances.get(id)._inputValues = [];
                    }
                    for (const port of plan.exposedInputs) {
                        if (!hasOwn(inputs, `exp_${port.key}`)) continue;
                        const values = valuesFor(inputs, `exp_${port.key}`);
                        if (plan.records.get(port.internalNodeId).kind === 'input') {
                            this.internalNodeInstances.get(port.internalNodeId)._inputValues.push(...values);
                        } else {
                            // Converted selections expose an ordinary input directly.
                            append(port.internalNodeId, port.internalPort, values);
                        }
                    }
                    const outputsByNode = new Map();
                    for (const id of plan.order) {
                        this._assertCurrent(generation);
                        const node = this.internalNodeInstances.get(id);
                        for (const connection of plan.connections) {
                            if (connection.target !== id) continue;
                            const source = this.internalNodeInstances.get(connection.source);
                            // Input ports forward lists, but an ordinary array output
                            // remains one message (do not flatten array payloads).
                            const values = plan.records.get(connection.source).kind === 'input'
                                ? source._inputValues
                                : [outputsByNode.get(connection.source)?.[connection.sourceOutput]];
                            append(id, connection.targetInput, values);
                        }
                        const method = typeof node.data === 'function' ? node.data : node.process;
                        const result = typeof method === 'function' ? await method.call(node, inputsByNode.get(id)) : {};
                        this._assertCurrent(generation);
                        outputsByNode.set(id, result || {});
                    }
                    const outputs = { out: inputs.trigger?.[0] };
                    for (const port of plan.exposedOutputs) {
                        const nodeOutputs = outputsByNode.get(port.internalNodeId) || {};
                        const node = this.internalNodeInstances.get(port.internalNodeId);
                        const property = plan.records.get(port.internalNodeId).kind === 'output' ? '_outputValue' : `_${port.internalPort}Value`;
                        outputs[`exp_${port.key}`] = hasOwn(nodeOutputs, port.internalPort)
                            ? nodeOutputs[port.internalPort] : node.properties?.[property];
                    }
                    return outputs;
                } finally {
                    this._activeData--;
                    this._scheduleParentChange();
                }
            });
        }
        
        serialize() {
            return cloneConfig({
                name: this.properties.name,
                description: this.properties.description,
                icon: this.properties.icon,
                internalNodes: this.properties.internalNodes,
                internalConnections: this.properties.internalConnections,
                exposedInputs: this.properties.exposedInputs,
                exposedOutputs: this.properties.exposedOutputs,
            });
        }
        
        restore(state) {
            const props = state?.data?.properties || state?.properties || state?.data || state;
            if (props) {
                Object.assign(this.properties, cloneConfig(props));
                const cleanup = this.disposeInternalGraph();
                this.rebuildSockets();
                return cleanup;
            }
        }

        destroy() {
            this._disposed = true;
            return this.disposeInternalGraph();
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
