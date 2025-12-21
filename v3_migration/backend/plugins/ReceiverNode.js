(function() {
    // Debug: console.log("[ReceiverNode] Loading plugin...");

    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets) {
        console.error("[ReceiverNode] Missing dependencies");
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect, useCallback } = React;
    const RefComponent = window.RefComponent;
    const sockets = window.sockets;
    const { HelpIcon } = window.T2Controls || {};

    // -------------------------------------------------------------------------
    // TOOLTIPS
    // -------------------------------------------------------------------------
    const tooltips = {
        node: "Receives values from Sender nodes with matching name.\n\nUse Sender/Receiver pairs to pass data between distant parts of your graph without wires.\n\nSelect a source from the dropdown to subscribe.",
        outputs: {
            out: "The current value from the selected buffer.\n\nUpdates in real-time when Sender broadcasts.",
            change: "Pulses TRUE when the value changes.\n\nUseful for triggering actions on updates."
        },
        controls: {
            source: "Select which Sender to receive from.\n\nDropdown shows all active buffers.\n\nFormat: [Type]Name (e.g., [Trigger]LivingRoom)"
        }
    };

    // -------------------------------------------------------------------------
    // CSS is now loaded from node-styles.css via index.css
    // -------------------------------------------------------------------------

    // -------------------------------------------------------------------------
    // NODE CLASS
    // -------------------------------------------------------------------------
    class ReceiverNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("Receiver");
            this.width = 250;
            this.changeCallback = changeCallback;
            this.addOutput("out", new ClassicPreset.Output(sockets.any || new ClassicPreset.Socket('any'), "Output"));
            this.addOutput("change", new ClassicPreset.Output(sockets.boolean || new ClassicPreset.Socket('boolean'), "Change"));
            this.properties = { selectedBuffer: "", lastValue: null };
        }

        data() {
            const bufferName = this.properties.selectedBuffer;
            let value = null;
            let source = null;
            
            if (window.AutoTronBuffer && bufferName) {
                value = window.AutoTronBuffer.get(bufferName);
                source = window.AutoTronBuffer.getSource(bufferName);
            }

            const hasChanged = JSON.stringify(value) !== JSON.stringify(this.properties.lastValue);
            if (hasChanged) {
                this.properties.lastValue = value;
                // Store the source for downstream nodes to access
                this.properties.lastTriggerSource = source;
            }

            return {
                out: value,
                change: hasChanged
            };
        }
        
        // Allow downstream nodes to query the trigger source
        getTriggerSource() {
            return this.properties.lastTriggerSource || this.properties.selectedBuffer?.replace(/^\[.+\]/, '') || null;
        }

        restore(state) {
            if (state.properties) {
                this.properties.selectedBuffer = state.properties.selectedBuffer || "";
            }
        }

        serialize() {
            return {
                selectedBuffer: this.properties.selectedBuffer
            };
        }

        toJSON() {
            return {
                id: this.id,
                label: this.label,
                properties: this.serialize()
            };
        }
    }

    // -------------------------------------------------------------------------
    // COMPONENT
    // -------------------------------------------------------------------------
    function ReceiverNodeComponent({ data, emit }) {
        const [selectedBuffer, setSelectedBuffer] = useState(data.properties.selectedBuffer);
        const [availableBuffers, setAvailableBuffers] = useState([]);
        const [currentValue, setCurrentValue] = useState(null);

        const triggerUpdate = useCallback(() => {
            if (data.changeCallback) data.changeCallback();
        }, [data]);

        // Subscribe to buffer updates and fetch initial value
        useEffect(() => {
            if (!window.AutoTronBuffer) return;

            const updateList = () => {
                const buffers = Object.keys(window.AutoTronBuffer.data || {}).sort();
                setAvailableBuffers(buffers);
            };

            // Initial list
            updateList();
            
            // Fetch initial value for selected buffer
            if (selectedBuffer) {
                const val = window.AutoTronBuffer.get(selectedBuffer);
                setCurrentValue(val);
            }

            // Subscribe to changes
            const unsubscribe = window.AutoTronBuffer.subscribe((key) => {
                updateList();
                if (key === selectedBuffer) {
                    const val = window.AutoTronBuffer.get(key);
                    setCurrentValue(val);
                    triggerUpdate(); // Trigger engine execution
                }
            });

            return unsubscribe;
        }, [selectedBuffer, triggerUpdate]);
        
        // Also poll the value periodically to catch any missed updates
        useEffect(() => {
            if (!selectedBuffer || !window.AutoTronBuffer) return;
            
            const interval = setInterval(() => {
                const val = window.AutoTronBuffer.get(selectedBuffer);
                setCurrentValue(prev => {
                    // Only update if value actually changed
                    if (JSON.stringify(prev) !== JSON.stringify(val)) {
                        return val;
                    }
                    return prev;
                });
            }, 500); // Check every 500ms
            
            return () => clearInterval(interval);
        }, [selectedBuffer]);

        // Handle selection change
        const handleSelect = (e) => {
            const newVal = e.target.value;
            setSelectedBuffer(newVal);
            data.properties.selectedBuffer = newVal;
            
            if (window.AutoTronBuffer) {
                setCurrentValue(window.AutoTronBuffer.get(newVal));
            }
            triggerUpdate();
        };

        // Format value for display
        const displayValue = currentValue === null || currentValue === undefined 
            ? "No Data" 
            : (typeof currentValue === 'object' ? JSON.stringify(currentValue) : String(currentValue));

        // Determine if value is "active" (truthy boolean, non-zero number, non-empty)
        const isActive = currentValue === true || 
            (typeof currentValue === 'number' && currentValue !== 0) ||
            (typeof currentValue === 'object' && currentValue !== null && Object.keys(currentValue).length > 0);
        
        // Dynamic border style based on active state
        const borderStyle = isActive 
            ? '2px solid #00ff64' 
            : '1px solid rgba(0, 243, 255, 0.3)';
        const boxShadowStyle = isActive 
            ? '0 0 15px rgba(0, 255, 100, 0.4), inset 0 0 10px rgba(0, 255, 100, 0.1)' 
            : 'none';

        return React.createElement('div', { 
            className: 'receiver-node-tron',
            style: {
                border: borderStyle,
                boxShadow: boxShadowStyle,
                transition: 'border 0.3s ease, box-shadow 0.3s ease'
            }
        }, [
            React.createElement('div', { 
                key: 'header',
                className: 'receiver-header',
                style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' }
            }, [
                React.createElement('span', { key: 'title' }, "📥 Receiver"),
                HelpIcon && React.createElement(HelpIcon, { key: 'help', text: tooltips.node, size: 14 })
            ]),
            React.createElement('div', { key: 'content', className: 'receiver-content' }, [
                // Buffer Selector
                React.createElement('div', { key: 'selector', className: 'receiver-row' }, [
                    React.createElement('span', { key: 'label', className: 'receiver-label' }, "Source:"),
                    React.createElement('select', {
                        key: 'select',
                        className: 'receiver-select',
                        value: selectedBuffer,
                        onChange: handleSelect
                    }, [
                        React.createElement('option', { key: 'none', value: '' }, "Select Buffer..."),
                        ...availableBuffers.map(b => React.createElement('option', { key: b, value: b }, b))
                    ]),
                    HelpIcon && React.createElement(HelpIcon, { key: 'help', text: tooltips.controls.source, size: 10 })
                ]),

                // Value Display
                React.createElement('div', { key: 'value', className: 'receiver-value-box' }, displayValue),

                // Output Sockets
                React.createElement('div', { key: 'out', className: 'receiver-socket-row' }, [
                    React.createElement('span', { key: 'label', className: 'receiver-label', style: { width: 'auto' } }, "Out"),
                    HelpIcon && React.createElement(HelpIcon, { key: 'help', text: tooltips.outputs.out, size: 10 }),
                    React.createElement(RefComponent, {
                        key: 'socket',
                        init: ref => emit({ type: "render", data: { type: "socket", element: ref, payload: data.outputs.out.socket, nodeId: data.id, side: "output", key: "out" } }),
                        unmount: ref => emit({ type: "unmount", data: { element: ref } })
                    })
                ]),
                React.createElement('div', { key: 'change', className: 'receiver-socket-row' }, [
                    React.createElement('span', { key: 'label', className: 'receiver-label', style: { width: 'auto' } }, "Change"),
                    HelpIcon && React.createElement(HelpIcon, { key: 'help', text: tooltips.outputs.change, size: 10 }),
                    React.createElement(RefComponent, {
                        key: 'socket',
                        init: ref => emit({ type: "render", data: { type: "socket", element: ref, payload: data.outputs.change.socket, nodeId: data.id, side: "output", key: "change" } }),
                        unmount: ref => emit({ type: "unmount", data: { element: ref } })
                    })
                ])
            ])
        ]);
    }

    window.nodeRegistry.register('ReceiverNode', {
        label: "Receiver",
        category: "Wireless",
        nodeClass: ReceiverNode,
        factory: (cb) => new ReceiverNode(cb),
        component: ReceiverNodeComponent
    });

    // console.log("[ReceiverNode] Registered");
})();
