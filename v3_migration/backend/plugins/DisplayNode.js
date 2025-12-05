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

    // CSS is now loaded from node-styles.css via index.css

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

        restore(state) {
            if (state.width) this.width = state.width;
            if (state.height) this.height = state.height;
        }

        serialize() {
            return {
                width: this.width,
                height: this.height
            };
        }

        toJSON() {
            return {
                id: this.id,
                label: this.label,
                width: this.width,
                height: this.height
            };
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
