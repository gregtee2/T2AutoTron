(function() {
    console.log("[SenderNode] Loading plugin...");

    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets) {
        console.error("[SenderNode] Missing dependencies");
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect, useCallback } = React;
    const RefComponent = window.RefComponent;
    const sockets = window.sockets;

    // -------------------------------------------------------------------------
    // SHARED BUFFER SYSTEM
    // -------------------------------------------------------------------------
    window.AutoTronBuffer = window.AutoTronBuffer || {
        data: {},
        listeners: [],
        set(key, value) {
            // Only notify if value actually changed to prevent loops
            if (JSON.stringify(this.data[key]) !== JSON.stringify(value)) {
                this.data[key] = value;
                this.notify(key);
            }
        },
        get(key) {
            return this.data[key];
        },
        delete(key) {
            delete this.data[key];
            this.notify(key);
        },
        subscribe(callback) {
            this.listeners.push(callback);
            return () => this.listeners = this.listeners.filter(l => l !== callback);
        },
        notify(key) {
            this.listeners.forEach(l => l(key));
        }
    };

    // -------------------------------------------------------------------------
    // CSS INJECTION
    // -------------------------------------------------------------------------
    const styleId = 'sender-node-css';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.innerHTML = `
            .sender-node-tron {
                background: rgba(20, 30, 40, 0.9) !important;
                backdrop-filter: blur(12px);
                border: 1px solid #4fc3f7;
                box-shadow: 0 0 15px rgba(79, 195, 247, 0.2);
                border-radius: 12px;
                color: #e1f5fe;
                font-family: 'Segoe UI', sans-serif;
                min-width: 250px;
                display: flex;
                flex-direction: column;
                user-select: none;
            }
            .sender-header {
                background: linear-gradient(90deg, rgba(79, 195, 247, 0.2), transparent);
                padding: 8px 12px;
                border-bottom: 1px solid rgba(79, 195, 247, 0.3);
                font-weight: 600;
                color: #4fc3f7;
                text-transform: uppercase;
                letter-spacing: 1px;
                font-size: 14px;
            }
            .sender-content {
                padding: 12px;
                display: flex;
                flex-direction: column;
                gap: 10px;
            }
            .sender-input-row {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .sender-label {
                font-size: 11px;
                color: #81d4fa;
                text-transform: uppercase;
                width: 60px;
            }
            .sender-text-input {
                flex: 1;
                background: rgba(0, 0, 0, 0.3);
                border: 1px solid #4fc3f7;
                color: #fff;
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 12px;
                outline: none;
            }
            .sender-text-input:focus {
                box-shadow: 0 0 8px rgba(79, 195, 247, 0.4);
            }
            .sender-status {
                font-size: 10px;
                color: #b3e5fc;
                margin-top: 4px;
                font-style: italic;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .sender-socket-row {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 5px;
            }
        `;
        document.head.appendChild(style);
    }

    // -------------------------------------------------------------------------
    // NODE CLASS
    // -------------------------------------------------------------------------
    class SenderNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("Sender");
            this.width = 250;
            this.changeCallback = changeCallback;
            this.addInput("in", new ClassicPreset.Input(sockets.any || new ClassicPreset.Socket('any'), "Input"));
            this.properties = { bufferName: "Default", lastValue: null, registeredName: null };
        }

        data(inputs) {
            const inputData = inputs.in?.[0];
            
            // Auto-detect type and prefix
            let prefix = "[Unknown]";
            if (typeof inputData === "boolean") prefix = "[Trigger]";
            else if (typeof inputData === "number") prefix = "[Number]";
            else if (typeof inputData === "string") prefix = "[String]";
            else if (typeof inputData === "object" && inputData) {
                if ('hue' in inputData && 'saturation' in inputData) prefix = "[HSV]";
                else if (Array.isArray(inputData)) prefix = "[Array]";
                else prefix = "[Object]";
            }

            // Clean existing prefix from user input if they typed it manually
            let baseName = this.properties.bufferName.replace(/^\[.+\]/, "");
            const finalName = `${prefix}${baseName}`;

            // Update Buffer
            if (inputData !== undefined) {
                // Cleanup old name if it changed
                if (this.properties.registeredName && this.properties.registeredName !== finalName) {
                    if (window.AutoTronBuffer.delete) {
                         window.AutoTronBuffer.delete(this.properties.registeredName);
                    }
                }

                window.AutoTronBuffer.set(finalName, inputData);
                this.properties.lastValue = inputData;
                this.properties.finalName = finalName; // Store for UI
                this.properties.registeredName = finalName;
            }

            return {};
        }
    }

    // -------------------------------------------------------------------------
    // COMPONENT
    // -------------------------------------------------------------------------
    function SenderNodeComponent({ data, emit }) {
        const [bufferName, setBufferName] = useState(data.properties.bufferName);
        const [status, setStatus] = useState("Idle");

        // Sync with properties
        useEffect(() => {
            data.properties.bufferName = bufferName;
            // Trigger re-execution to update buffer name in system
            if (data.changeCallback) data.changeCallback();
        }, [bufferName, data]);

        // Poll for status update (since data() runs in engine)
        useEffect(() => {
            const interval = setInterval(() => {
                if (data.properties.finalName) {
                    setStatus(`Broadcasting: ${data.properties.finalName}`);
                }
            }, 500);
            return () => clearInterval(interval);
        }, [data]);

        return React.createElement('div', { className: 'sender-node-tron' }, [
            React.createElement('div', { key: 'header', className: 'sender-header' }, "Sender Node"),
            React.createElement('div', { key: 'content', className: 'sender-content' }, [
                // Input Socket
                React.createElement('div', { key: 'socket', className: 'sender-socket-row' }, [
                    React.createElement(RefComponent, {
                        key: 'ref',
                        init: ref => emit({ type: "render", data: { type: "socket", element: ref, payload: data.inputs.in.socket, nodeId: data.id, side: "input", key: "in" } }),
                        unmount: ref => emit({ type: "unmount", data: { element: ref } })
                    }),
                    React.createElement('span', { key: 'label', className: 'sender-label', style: { width: 'auto' } }, "Input")
                ]),
                
                // Buffer Name Input
                React.createElement('div', { key: 'input', className: 'sender-input-row' }, [
                    React.createElement('span', { key: 'label', className: 'sender-label' }, "Name:"),
                    React.createElement('input', {
                        key: 'field',
                        className: 'sender-text-input',
                        value: bufferName,
                        onChange: (e) => setBufferName(e.target.value),
                        placeholder: "Buffer Name"
                    })
                ]),

                // Status
                React.createElement('div', { key: 'status', className: 'sender-status' }, status)
            ])
        ]);
    }

    window.nodeRegistry.register('SenderNode', {
        label: "Sender",
        category: "Wireless",
        nodeClass: SenderNode,
        factory: (cb) => new SenderNode(cb),
        component: SenderNodeComponent
    });

    console.log("[SenderNode] Registered");
})();
