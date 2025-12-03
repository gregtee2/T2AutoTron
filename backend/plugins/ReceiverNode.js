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
    // CSS INJECTION
    // -------------------------------------------------------------------------
    const styleId = 'receiver-node-css';
    let style = document.getElementById(styleId);
    if (!style) {
        style = document.createElement('style');
        style.id = styleId;
        document.head.appendChild(style);
    }
    style.innerHTML = `
            .receiver-node-tron {
                background: rgba(30, 25, 20, 0.9) !important;
                backdrop-filter: blur(12px);
                border: 1px solid #ffb74d;
                box-shadow: 0 0 15px rgba(255, 183, 77, 0.2);
                border-radius: 12px;
                color: #fff3e0;
                font-family: 'Segoe UI', sans-serif;
                width: 250px;
                min-width: 250px;
                max-width: 250px;
                display: flex;
                flex-direction: column;
                user-select: none;
            }
            .receiver-header {
                background: linear-gradient(90deg, rgba(255, 183, 77, 0.2), transparent);
                padding: 8px 12px;
                border-bottom: 1px solid rgba(255, 183, 77, 0.3);
                font-weight: 600;
                color: #ffb74d;
                text-transform: uppercase;
                letter-spacing: 1px;
                font-size: 14px;
            }
            .receiver-content {
                padding: 12px;
                display: flex;
                flex-direction: column;
                gap: 10px;
            }
            .receiver-row {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .receiver-label {
                font-size: 11px;
                color: #ffe0b2;
                text-transform: uppercase;
                width: 60px;
            }
            .receiver-select {
                flex: 1;
                background: rgba(0, 0, 0, 0.3);
                border: 1px solid #ffb74d;
                color: #fff;
                padding: 4px;
                border-radius: 4px;
                font-size: 11px;
                outline: none;
                width: 100%;
            }
            .receiver-value-box {
                background: rgba(0, 0, 0, 0.4);
                border: 1px solid rgba(255, 183, 77, 0.3);
                padding: 6px;
                border-radius: 4px;
                font-family: monospace;
                font-size: 10px;
                color: #ffcc80;
                min-height: 20px;
                max-height: 60px;
                max-width: 220px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                display: block;
            }
            .receiver-socket-row {
                display: flex;
                align-items: center;
                justify-content: flex-end;
                gap: 8px;
            }
        `;

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
