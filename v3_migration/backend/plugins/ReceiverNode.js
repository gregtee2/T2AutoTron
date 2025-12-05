(function() {
    console.log("[ReceiverNode] Loading plugin...");

    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets) {
        console.error("[ReceiverNode] Missing dependencies");
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect, useCallback } = React;
    const RefComponent = window.RefComponent;
    const sockets = window.sockets;

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
            
            if (window.AutoTronBuffer && bufferName) {
                value = window.AutoTronBuffer.get(bufferName);
            }

            const hasChanged = JSON.stringify(value) !== JSON.stringify(this.properties.lastValue);
            if (hasChanged) {
                this.properties.lastValue = value;
            }

            return {
                out: value,
                change: hasChanged
            };
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

        // Subscribe to buffer updates
        useEffect(() => {
            if (!window.AutoTronBuffer) return;

            const updateList = () => {
                const buffers = Object.keys(window.AutoTronBuffer.data).sort();
                setAvailableBuffers(buffers);
            };

            // Initial list
            updateList();

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

        return React.createElement('div', { className: 'receiver-node-tron' }, [
            React.createElement('div', { className: 'receiver-header' }, "Receiver Node"),
            React.createElement('div', { className: 'receiver-content' }, [
                // Buffer Selector
                React.createElement('div', { className: 'receiver-row' }, [
                    React.createElement('span', { className: 'receiver-label' }, "Source:"),
                    React.createElement('select', {
                        className: 'receiver-select',
                        value: selectedBuffer,
                        onChange: handleSelect
                    }, [
                        React.createElement('option', { key: 'none', value: '' }, "Select Buffer..."),
                        ...availableBuffers.map(b => React.createElement('option', { key: b, value: b }, b))
                    ])
                ]),

                // Value Display
                React.createElement('div', { className: 'receiver-value-box' }, displayValue),

                // Output Sockets
                React.createElement('div', { className: 'receiver-socket-row' }, [
                    React.createElement('span', { className: 'receiver-label', style: { width: 'auto' } }, "Out"),
                    React.createElement(RefComponent, {
                        init: ref => emit({ type: "render", data: { type: "socket", element: ref, payload: data.outputs.out.socket, nodeId: data.id, side: "output", key: "out" } }),
                        unmount: ref => emit({ type: "unmount", data: { element: ref } })
                    })
                ]),
                React.createElement('div', { className: 'receiver-socket-row' }, [
                    React.createElement('span', { className: 'receiver-label', style: { width: 'auto' } }, "Change"),
                    React.createElement(RefComponent, {
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

    console.log("[ReceiverNode] Registered");
})();
