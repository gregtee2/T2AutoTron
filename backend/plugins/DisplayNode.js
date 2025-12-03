(function() {
    console.log("[DisplayNode] Loading plugin...");

    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets) {
        console.error("[DisplayNode] Missing dependencies");
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect } = React;
    const RefComponent = window.RefComponent;
    const sockets = window.sockets;

    // Inject CSS
    const styleId = 'display-node-css';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.innerHTML = `
            .display-node {
                background: #222;
                border: 1px solid #777;
                border-radius: 8px;
                color: #fff;
                min-width: 180px;
                min-height: 100px;
                display: flex;
                flex-direction: column;
                box-shadow: 0 2px 5px rgba(0, 0, 0, 0.5);
                font-family: monospace;
                user-select: none;
                position: relative;
            }
            .display-node .header {
                padding: 8px;
                background: #333;
                border-top-left-radius: 8px;
                border-top-right-radius: 8px;
                border-bottom: 1px solid #555;
                font-weight: bold;
                text-align: center;
                flex-shrink: 0;
            }
            .display-node .content {
                padding: 10px;
                display: flex;
                flex-direction: column;
                gap: 10px;
                flex: 1;
                overflow: hidden;
            }
            .display-node .io-row {
                display: flex;
                align-items: center;
                gap: 8px;
                position: relative;
                flex-shrink: 0;
            }
            .display-node .socket-wrapper {
                width: 24px;
                height: 24px;
                display: inline-block;
                position: relative;
                z-index: 100;
            }
            .display-node .socket {
                width: 20px !important;
                height: 20px !important;
                background: #999 !important;
                border: 2px solid #fff !important;
                border-radius: 50% !important;
                pointer-events: auto !important;
                cursor: crosshair;
                z-index: 100 !important;
            }
            .display-node .socket:hover {
                background: #fff !important;
                border-color: #0f0 !important;
            }
            .display-node .display-box {
                background: #000;
                border: 1px solid #444;
                border-radius: 4px;
                padding: 8px;
                word-break: break-all;
                color: #0f0;
                user-select: text;
                cursor: text;
                flex: 1;
                overflow: auto;
            }
            .display-node .resize-handle {
                position: absolute;
                bottom: 0;
                right: 0;
                width: 15px;
                height: 15px;
                cursor: nwse-resize;
                background: linear-gradient(135deg, transparent 50%, #777 50%);
                border-bottom-right-radius: 8px;
                z-index: 10;
            }
            .display-node .resize-handle:hover {
                background: linear-gradient(135deg, transparent 50%, #fff 50%);
            }
        `;
        document.head.appendChild(style);
    }

    class DisplayNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("Display");
            this.width = 200;
            this.height = 150;
            this.changeCallback = changeCallback;
            this.properties = { value: "Waiting for data..." };
            
            try {
                const socket = sockets.boolean || new ClassicPreset.Socket('boolean');
                this.addInput("input", new ClassicPreset.Input(socket, "Input"));
            } catch (e) {
                console.error("[DisplayNode] Error adding input:", e);
            }
        }

        data(inputs) {
            const value = inputs.input?.[0];
            if (this.properties.value !== value) {
                this.properties.value = value !== undefined ? value : "No Data";
                if (this.changeCallback) this.changeCallback();
            }
            return {};
        }
    }

    function DisplayNodeComponent(props) {
        const { data, emit } = props;
        const [value, setValue] = useState(data.properties.value);
        const [size, setSize] = useState({ width: data.width || 200, height: data.height || 150 });

        useEffect(() => {
            data.changeCallback = () => {
                setValue(data.properties.value);
            };
            return () => { data.changeCallback = null; };
        }, [data]);

        const handleResizeStart = (e) => {
            e.stopPropagation();
            e.preventDefault();
            
            const startX = e.clientX;
            const startY = e.clientY;
            const startWidth = size.width;
            const startHeight = size.height;

            const handleMouseMove = (moveEvent) => {
                const newWidth = Math.max(180, startWidth + (moveEvent.clientX - startX));
                const newHeight = Math.max(100, startHeight + (moveEvent.clientY - startY));
                
                setSize({ width: newWidth, height: newHeight });
                data.width = newWidth;
                data.height = newHeight;
                
                // Force update of connections if possible, though React render usually handles it eventually
                // If connections lag, we might need to emit an update event if available
            };

            const handleMouseUp = () => {
                window.removeEventListener('pointermove', handleMouseMove);
                window.removeEventListener('pointerup', handleMouseUp);
            };

            window.addEventListener('pointermove', handleMouseMove);
            window.addEventListener('pointerup', handleMouseUp);
        };

        const inputs = Object.entries(data.inputs);

        return React.createElement('div', { 
            className: 'display-node',
            style: { width: size.width + 'px', height: size.height + 'px' }
        }, [
            React.createElement('div', { key: 'header', className: 'header' }, 'Display'),
            React.createElement('div', { key: 'content', className: 'content' }, [
                ...inputs.map(([key, input]) => 
                    React.createElement('div', { key: key, className: 'io-row input-row' }, [
                        React.createElement(RefComponent, {
                            key: 'ref',
                            init: ref => emit({
                                type: "render",
                                data: {
                                    type: "socket",
                                    element: ref,
                                    payload: input.socket,
                                    nodeId: data.id,
                                    side: "input",
                                    key
                                }
                            }),
                            unmount: ref => emit({ type: "unmount", data: { element: ref } })
                        }),
                        React.createElement('span', { key: 'label', className: 'input-label' }, input.label || key)
                    ])
                ),
                React.createElement('div', { 
                    key: 'box', 
                    className: 'display-box',
                    onPointerDown: (e) => e.stopPropagation()
                }, 
                    value === undefined || value === null
                        ? "No Data"
                        : typeof value === 'object'
                            ? JSON.stringify(value, null, 2)
                            : String(value)
                )
            ]),
            React.createElement('div', {
                key: 'resize',
                className: 'resize-handle',
                onPointerDown: handleResizeStart
            })
        ]);
    }

    window.nodeRegistry.register('DisplayNode', {
        label: "Display",
        category: "Debug/Display",
        nodeClass: DisplayNode,
        factory: (cb) => new DisplayNode(cb),
        component: DisplayNodeComponent
    });

    console.log("[DisplayNode] Registered");
})();
