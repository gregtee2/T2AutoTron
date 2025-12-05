(function() {
    console.log("[PushbuttonNode] Loading plugin...");

    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets) {
        console.error("[PushbuttonNode] Missing dependencies");
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect, useRef } = React;
    const RefComponent = window.RefComponent;
    const sockets = window.sockets;

    // CSS is now loaded from node-styles.css via index.css

    class PushbuttonNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("Pushbutton");
            this.width = 220;
            this.changeCallback = changeCallback;

            this.properties = {
                state: false,
                pulseMode: false, // Default to Latch mode (Pulse Off)
                lastCommand: false, // Track last command for display
            };

            try {
                const socket = sockets.boolean || new ClassicPreset.Socket('boolean');
                this.addOutput("state", new ClassicPreset.Output(socket, "State"));
            } catch (e) {
                console.error("[PushbuttonNode] Error adding output:", e);
            }
        }

        data(inputs) {
            return { state: this.properties.state };
        }

        triggerUpdate() {
            if (this.changeCallback) this.changeCallback();
        }

        restore(state) {
            if (state.properties) {
                this.properties.state = state.properties.state || false;
                this.properties.pulseMode = state.properties.pulseMode || false;
            }
        }

        serialize() {
            return {
                state: this.properties.state,
                pulseMode: this.properties.pulseMode
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

    function PushbuttonNodeComponent(props) {
        const { data, emit } = props;
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
            e.stopPropagation(); // Prevent node selection when clicking button
            
            const newState = !displayState;

            if (pulseMode) {
                // Pulse Mode: Flash ON then OFF
                data.properties.lastCommand = true; // Update lastCommand so the callback doesn't revert UI
                setDisplayState(true);
                data.properties.state = true;
                if (data.triggerUpdate) data.triggerUpdate();

                if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
                pulseTimeoutRef.current = setTimeout(() => {
                    data.properties.lastCommand = false; // Revert lastCommand
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
            
            // Reset state when switching modes
            if (newMode) {
                data.properties.state = false;
                setDisplayState(false);
            }
            if (data.triggerUpdate) data.triggerUpdate();
        };

        const outputs = Object.entries(data.outputs);

        return React.createElement('div', { className: 'pushbutton-node' }, [
            React.createElement('div', { key: 'header', className: 'header' }, [
                React.createElement('div', { key: 'title', style: { display: 'flex', flexDirection: 'column', gap: '4px' } }, 
                    React.createElement('span', null, data.label)
                ),
                React.createElement('div', { key: 'outputs', style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' } },
                    outputs.map(([key, output]) => 
                        React.createElement('div', { key: key, className: 'io-row' }, [
                            React.createElement('span', { key: 'label', style: { fontSize: '10px', opacity: 0.7 } }, output.label),
                            React.createElement(RefComponent, {
                                key: 'ref',
                                init: ref => emit({
                                    type: "render",
                                    data: {
                                        type: "socket",
                                        element: ref,
                                        payload: output.socket,
                                        nodeId: data.id,
                                        side: "output",
                                        key
                                    }
                                }),
                                unmount: ref => emit({ type: "unmount", data: { element: ref } })
                            })
                        ])
                    )
                )
            ]),
            React.createElement('div', { 
                key: 'content', 
                className: 'content',
                onPointerDown: (e) => e.stopPropagation()
            }, [
                React.createElement('button', {
                    key: 'btn',
                    className: `btn ${displayState ? 'active' : 'inactive'}`,
                    onClick: handleToggle
                }, pulseMode ? (displayState ? "TRIG" : "PUSH") : (displayState ? "ON" : "OFF")),
                React.createElement('div', { key: 'pulse', className: 'pulse-control' }, [
                    React.createElement('input', {
                        key: 'check',
                        type: 'checkbox',
                        checked: pulseMode,
                        onChange: handlePulseModeChange,
                        style: { accentColor: "#00f3ff" }
                    }),
                    React.createElement('span', { key: 'label' }, "Pulse Mode")
                ])
            ])
        ]);
    }

    window.nodeRegistry.register('PushbuttonNode', {
        label: "Pushbutton",
        category: "Inputs",
        nodeClass: PushbuttonNode,
        factory: (cb) => new PushbuttonNode(cb),
        component: PushbuttonNodeComponent
    });

    console.log("[PushbuttonNode] Registered");
})();
