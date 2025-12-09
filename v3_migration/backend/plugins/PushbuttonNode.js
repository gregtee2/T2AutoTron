// ============================================================================
// PushbuttonNode.js - Pushbutton node using shared T2 infrastructure
// Refactored to use DRY principles with shared components
// ============================================================================

(function() {
    // Debug: console.log("[PushbuttonNode] Loading plugin...");

    // Dependency checks
    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets) {
        console.error("[PushbuttonNode] Missing core dependencies");
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect, useRef } = React;
    const RefComponent = window.RefComponent;
    const sockets = window.sockets;

    // Get shared components
    const T2Components = window.T2Components || {};
    const { createSocketRef, StatusBadge } = T2Components;
    const THEME = T2Components.THEME || window.T2Controls?.THEME || {
        primary: '#00f3ff',
        primaryRgba: (a) => `rgba(0, 243, 255, ${a})`,
        border: 'rgba(0, 243, 255, 0.3)',
        success: '#00ff88'
    };

    // -------------------------------------------------------------------------
    // NODE CLASS
    // -------------------------------------------------------------------------
    class PushbuttonNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("Pushbutton");
            this.width = 220;
            this.changeCallback = changeCallback;

            this.properties = {
                state: false,
                pulseMode: false,
                lastCommand: false
            };

            this.addOutput("state", new ClassicPreset.Output(
                sockets.boolean || new ClassicPreset.Socket('boolean'), 
                "State"
            ));
        }

        data() {
            return { state: this.properties.state };
        }

        triggerUpdate() {
            if (this.changeCallback) this.changeCallback();
        }

        restore(state) {
            if (state.properties) {
                Object.assign(this.properties, state.properties);
            }
        }

        serialize() {
            return {
                state: this.properties.state,
                pulseMode: this.properties.pulseMode
            };
        }

        toJSON() {
            return { id: this.id, label: this.label, properties: this.serialize() };
        }
    }

    // -------------------------------------------------------------------------
    // COMPONENT
    // -------------------------------------------------------------------------
    function PushbuttonNodeComponent({ data, emit }) {
        const [displayState, setDisplayState] = useState(data.properties.lastCommand);
        const [pulseMode, setPulseMode] = useState(data.properties.pulseMode);
        const pulseTimeoutRef = useRef(null);

        useEffect(() => {
            const originalCallback = data.changeCallback;
            data.changeCallback = () => {
                setDisplayState(data.properties.lastCommand);
                setPulseMode(data.properties.pulseMode);
                if (originalCallback) originalCallback();
            };
            return () => { data.changeCallback = originalCallback; };
        }, [data]);

        const handleToggle = (e) => {
            e.stopPropagation();
            
            const newState = !displayState;

            if (pulseMode) {
                // Pulse Mode: Flash ON then OFF
                data.properties.lastCommand = true;
                setDisplayState(true);
                data.properties.state = true;
                if (data.triggerUpdate) data.triggerUpdate();

                if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
                pulseTimeoutRef.current = setTimeout(() => {
                    data.properties.lastCommand = false;
                    setDisplayState(false);
                    data.properties.state = false;
                    if (data.triggerUpdate) data.triggerUpdate();
                }, 500);
            } else {
                // Latch Mode: Toggle State
                data.properties.lastCommand = newState;
                data.properties.state = newState;
                setDisplayState(newState);
                if (data.triggerUpdate) data.triggerUpdate();
            }
        };

        const handlePulseModeChange = (e) => {
            const newMode = e.target.checked;
            data.properties.pulseMode = newMode;
            setPulseMode(newMode);
            
            if (newMode) {
                data.properties.state = false;
                setDisplayState(false);
            }
            if (data.triggerUpdate) data.triggerUpdate();
        };

        const outputs = Object.entries(data.outputs);
        const buttonColor = displayState ? THEME.success : THEME.primary;

        return React.createElement('div', { 
            className: 'pushbutton-node',
            style: {
                background: 'linear-gradient(180deg, rgba(10,20,30,0.95) 0%, rgba(5,15,25,0.98) 100%)',
                border: `1px solid ${THEME.border}`,
                borderRadius: '8px',
                minWidth: '200px'
            }
        }, [
            // Header with outputs
            React.createElement('div', { 
                key: 'header',
                style: {
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: THEME.primaryRgba(0.1),
                    borderBottom: `1px solid ${THEME.border}`,
                    padding: '8px 12px',
                    borderRadius: '7px 7px 0 0'
                }
            }, [
                React.createElement('span', { 
                    key: 'title',
                    style: { color: THEME.primary, fontWeight: '600', fontSize: '13px', textTransform: 'uppercase' }
                }, data.label),
                
                // Output sockets
                React.createElement('div', { 
                    key: 'outputs',
                    style: { display: 'flex', alignItems: 'center', gap: '8px' }
                }, outputs.map(([key, output]) => 
                    React.createElement('div', { 
                        key, 
                        style: { display: 'flex', alignItems: 'center', gap: '4px' }
                    }, [
                        React.createElement('span', { 
                            key: 'label',
                            style: { fontSize: '10px', color: '#aaa' }
                        }, output.label),
                        createSocketRef 
                            ? createSocketRef(emit, output.socket, data.id, 'output', key)
                            : React.createElement(RefComponent, {
                                key: 'socket',
                                init: ref => emit({ type: "render", data: { type: "socket", element: ref, payload: output.socket, nodeId: data.id, side: "output", key } }),
                                unmount: ref => emit({ type: "unmount", data: { element: ref } })
                            })
                    ])
                ))
            ]),

            // Content
            React.createElement('div', { 
                key: 'content',
                style: { padding: '12px' },
                onPointerDown: (e) => e.stopPropagation()
            }, [
                // Big Push Button
                React.createElement('button', {
                    key: 'button',
                    onClick: handleToggle,
                    style: {
                        width: '100%',
                        padding: '16px',
                        background: displayState ? `${buttonColor}30` : 'transparent',
                        border: `2px solid ${buttonColor}`,
                        borderRadius: '8px',
                        color: buttonColor,
                        fontSize: '14px',
                        fontWeight: '700',
                        textTransform: 'uppercase',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        boxShadow: displayState ? `0 0 20px ${buttonColor}40` : 'none'
                    }
                }, displayState ? '● ON' : '○ OFF'),

                // Pulse Mode Toggle
                React.createElement('label', {
                    key: 'pulseMode',
                    style: {
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginTop: '12px',
                        fontSize: '12px',
                        color: '#aaa',
                        cursor: 'pointer'
                    }
                }, [
                    React.createElement('input', {
                        key: 'checkbox',
                        type: 'checkbox',
                        checked: pulseMode,
                        onChange: handlePulseModeChange,
                        style: { accentColor: THEME.primary }
                    }),
                    React.createElement('span', { key: 'label' }, pulseMode ? 'Pulse Mode' : 'Latch Mode')
                ])
            ])
        ]);
    }

    // -------------------------------------------------------------------------
    // REGISTRATION
    // -------------------------------------------------------------------------
    window.nodeRegistry.register('PushbuttonNode', {
        label: "Pushbutton",
        category: "Input",
        nodeClass: PushbuttonNode,
        factory: (cb) => new PushbuttonNode(cb),
        component: PushbuttonNodeComponent
    });

    // console.log("[PushbuttonNode] Registered (DRY refactored)");
})();
