// ============================================================================
// DisplayNode.js - Display node using shared T2 infrastructure
// Refactored to use DRY principles with shared components
// ============================================================================

(function() {
    console.log("[DisplayNode] Loading plugin...");

    // Dependency checks
    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets) {
        console.error("[DisplayNode] Missing core dependencies");
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect } = React;
    const RefComponent = window.RefComponent;
    const sockets = window.sockets;

    // Get shared components if available
    const T2Components = window.T2Components || {};
    const { createSocketRef, ValueDisplay } = T2Components;
    const THEME = T2Components.THEME || window.T2Controls?.THEME || {
        primary: '#00f3ff',
        primaryRgba: (a) => `rgba(0, 243, 255, ${a})`,
        border: 'rgba(0, 243, 255, 0.3)',
        backgroundAlt: 'rgba(0, 20, 30, 0.6)',
        text: '#e0f7fa'
    };

    // -------------------------------------------------------------------------
    // NODE CLASS
    // -------------------------------------------------------------------------
    class DisplayNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("Display");
            this.width = 200;
            this.height = 150;
            this.changeCallback = changeCallback;
            this.properties = { value: "Waiting for data..." };

            this.addInput("input", new ClassicPreset.Input(
                sockets.any || new ClassicPreset.Socket('any'), 
                "Input"
            ));
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
            return { width: this.width, height: this.height };
        }

        toJSON() {
            return { id: this.id, label: this.label, width: this.width, height: this.height };
        }
    }

    // -------------------------------------------------------------------------
    // COMPONENT
    // -------------------------------------------------------------------------
    function DisplayNodeComponent({ data, emit }) {
        const [value, setValue] = useState(data.properties.value);
        const [size, setSize] = useState({ width: data.width || 200, height: data.height || 150 });

        useEffect(() => {
            data.changeCallback = () => setValue(data.properties.value);
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
            };

            const handleMouseUp = () => {
                window.removeEventListener('pointermove', handleMouseMove);
                window.removeEventListener('pointerup', handleMouseUp);
            };

            window.addEventListener('pointermove', handleMouseMove);
            window.addEventListener('pointerup', handleMouseUp);
        };

        const inputs = Object.entries(data.inputs);

        // Format value for display
        const displayValue = value === undefined || value === null
            ? "No Data"
            : typeof value === 'object'
                ? JSON.stringify(value, null, 2)
                : String(value);

        return React.createElement('div', { 
            className: 'display-node',
            style: { 
                width: size.width + 'px', 
                height: size.height + 'px',
                background: 'linear-gradient(180deg, rgba(10,20,30,0.95) 0%, rgba(5,15,25,0.98) 100%)',
                border: `1px solid ${THEME.border}`,
                borderRadius: '8px',
                display: 'flex',
                flexDirection: 'column'
            }
        }, [
            // Header
            React.createElement('div', { 
                key: 'header', 
                className: 'header',
                style: {
                    background: THEME.primaryRgba(0.1),
                    borderBottom: `1px solid ${THEME.border}`,
                    padding: '8px 12px',
                    borderRadius: '7px 7px 0 0',
                    color: THEME.primary,
                    fontWeight: '600',
                    fontSize: '13px',
                    textTransform: 'uppercase'
                }
            }, 'Display'),

            // Content
            React.createElement('div', { 
                key: 'content', 
                className: 'content',
                style: { flex: 1, padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }
            }, [
                // Input socket
                ...inputs.map(([key, input]) => 
                    React.createElement('div', { 
                        key, 
                        className: 'io-row input-row',
                        style: { display: 'flex', alignItems: 'center' }
                    }, [
                        createSocketRef 
                            ? createSocketRef(emit, input.socket, data.id, 'input', key)
                            : React.createElement(RefComponent, {
                                key: 'socket',
                                init: ref => emit({ type: "render", data: { type: "socket", element: ref, payload: input.socket, nodeId: data.id, side: "input", key } }),
                                unmount: ref => emit({ type: "unmount", data: { element: ref } })
                            }),
                        React.createElement('span', { 
                            key: 'label', 
                            style: { marginLeft: '10px', fontSize: '12px', color: '#ccc' } 
                        }, input.label || key)
                    ])
                ),

                // Value display box
                React.createElement('div', { 
                    key: 'box', 
                    className: 'display-box',
                    onPointerDown: (e) => e.stopPropagation(),
                    style: {
                        flex: 1,
                        padding: '8px',
                        background: THEME.backgroundAlt,
                        border: `1px solid ${THEME.border}`,
                        borderRadius: '4px',
                        fontFamily: 'monospace',
                        fontSize: '12px',
                        color: THEME.text,
                        overflow: 'auto',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word'
                    }
                }, displayValue)
            ]),

            // Resize handle
            React.createElement('div', {
                key: 'resize',
                className: 'resize-handle',
                onPointerDown: handleResizeStart,
                style: {
                    position: 'absolute',
                    right: '2px',
                    bottom: '2px',
                    width: '12px',
                    height: '12px',
                    cursor: 'nwse-resize',
                    background: `linear-gradient(135deg, transparent 50%, ${THEME.primary} 50%)`,
                    borderRadius: '0 0 6px 0'
                }
            })
        ]);
    }

    // -------------------------------------------------------------------------
    // REGISTRATION
    // -------------------------------------------------------------------------
    window.nodeRegistry.register('DisplayNode', {
        label: "Display",
        category: "Utility",
        nodeClass: DisplayNode,
        factory: (cb) => new DisplayNode(cb),
        component: DisplayNodeComponent
    });

    console.log("[DisplayNode] Registered (DRY refactored)");
})();
