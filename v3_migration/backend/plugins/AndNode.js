(function() {
    console.log("[AndNode] Loading plugin...");

    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets) {
        console.error("[AndNode] Missing dependencies");
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect } = React;
    const RefComponent = window.RefComponent;
    const sockets = window.sockets;

    // -------------------------------------------------------------------------
    // CONTROLS
    // -------------------------------------------------------------------------
    class ButtonControl extends ClassicPreset.Control {
        constructor(label, onClick) {
            super();
            this.label = label;
            this.onClick = onClick;
        }
    }

    function ButtonControlComponent({ data }) {
        return React.createElement('button', {
            onClick: data.onClick,
            onPointerDown: (e) => e.stopPropagation(),
            onDoubleClick: (e) => e.stopPropagation(),
            style: {
                background: 'rgba(79, 195, 247, 0.2)',
                border: '1px solid #4fc3f7',
                color: '#4fc3f7',
                padding: '4px 8px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
                width: '100%',
                marginBottom: '5px'
            }
        }, data.label);
    }

    class SwitchControl extends ClassicPreset.Control {
        constructor(label, initialValue, onChange) {
            super();
            this.label = label;
            this.value = initialValue;
            this.onChange = onChange;
        }
    }

    function SwitchControlComponent({ data }) {
        const [value, setValue] = useState(data.value);
        
        const handleChange = (e) => {
            const val = e.target.checked;
            setValue(val);
            data.value = val;
            if (data.onChange) data.onChange(val);
        };

        return React.createElement('div', { style: { display: 'flex', alignItems: 'center', marginBottom: '5px' } }, [
            React.createElement('input', {
                type: 'checkbox',
                checked: value,
                onChange: handleChange,
                onPointerDown: (e) => e.stopPropagation(),
                onDoubleClick: (e) => e.stopPropagation(),
                style: { marginRight: '5px' }
            }),
            React.createElement('span', { style: { fontSize: '12px', color: '#eee' } }, data.label)
        ]);
    }

    // -------------------------------------------------------------------------
    // NODE CLASS
    // -------------------------------------------------------------------------
    class AndNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("AND Gate");
            this.changeCallback = changeCallback;
            this.width = 180;

            this.properties = {
                inputCount: 2,
                pulseMode: false
            };

            this.lastOutput = null;
            this.pulseTimeout = null;

            this.addOutput("result", new ClassicPreset.Output(sockets.boolean || new ClassicPreset.Socket('boolean'), "Result"));

            this.addControl("pulse_mode", new SwitchControl("Pulse Mode", false, (val) => {
                this.properties.pulseMode = val;
            }));

            this.addControl("add_input", new ButtonControl("+ Add Input", () => this.addInputSlot()));
            this.addControl("remove_input", new ButtonControl("- Remove Input", () => this.removeInputSlot()));

            this.updateInputs(true);
        }

        triggerUpdate() {
            if (this.changeCallback) this.changeCallback();
        }

        updateInputs(suppressUpdate = false) {
            const currentInputs = Object.keys(this.inputs);
            const desiredCount = this.properties.inputCount;

            for (let i = desiredCount; i < currentInputs.length; i++) {
                this.removeInput(`in${i}`);
            }

            for (let i = 0; i < desiredCount; i++) {
                const key = `in${i}`;
                if (!this.inputs[key]) {
                    this.addInput(key, new ClassicPreset.Input(sockets.boolean || new ClassicPreset.Socket('boolean'), `Input ${i + 1}`));
                }
            }
            
            if (!suppressUpdate) this.triggerUpdate();
        }

        addInputSlot() {
            if (this.properties.inputCount < 8) {
                this.properties.inputCount++;
                this.updateInputs();
            }
        }

        removeInputSlot() {
            if (this.properties.inputCount > 2) {
                this.properties.inputCount--;
                this.updateInputs();
            }
        }

        data(inputs) {
            const values = [];
            for (let i = 0; i < this.properties.inputCount; i++) {
                const val = inputs[`in${i}`]?.[0];
                values.push(!!val);
            }

            const result = values.every(v => v);

            if (this.properties.pulseMode) {
                // Pulse Logic
                // If result changed
                if (result !== this.lastOutput) {
                    this.lastOutput = result;
                    
                    // If we have a new value (true or false), we output it
                    // But wait, pulse usually means "output true for a bit then false" 
                    // OR "output the new state for a bit then null/false"?
                    // Legacy HS_AndNode: "Output pulse on state change (true or false)... 500ms pulse duration... output set to null"
                    
                    if (this.pulseTimeout) {
                        clearTimeout(this.pulseTimeout);
                        this.pulseTimeout = null;
                    }

                    // Start pulse
                    this.pulseTimeout = setTimeout(() => {
                        this.lastOutput = null; // Reset to null/false after pulse
                        this.triggerUpdate(); // Trigger re-evaluation to send null
                    }, 500);

                    return { result: result };
                } else {
                    // If no change, check if we are in "pulsed out" state (timeout finished)
                    // If lastOutput is null, we return null/false
                    // If lastOutput is set, we return it (pulse is active)
                    return { result: this.lastOutput !== null ? this.lastOutput : false };
                }
            } else {
                // Normal Mode
                this.lastOutput = result;
                return {
                    result: result
                };
            }
        }

        restore(state) {
            if (state.properties) {
                this.properties = { ...this.properties, ...state.properties };
            }
            if (this.controls.pulse_mode) this.controls.pulse_mode.value = this.properties.pulseMode;
            this.updateInputs();
        }

        serialize() {
            return {
                inputCount: this.properties.inputCount,
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

    // -------------------------------------------------------------------------
    // COMPONENT
    // -------------------------------------------------------------------------
    function AndNodeComponent({ data, emit }) {
        const inputs = Object.entries(data.inputs);
        const outputs = Object.entries(data.outputs);
        const controls = Object.entries(data.controls);

        return React.createElement('div', { className: 'logic-node' }, [
            React.createElement('div', { className: 'header' }, data.label),
            
            React.createElement('div', { className: 'io-container' }, 
                inputs.map(([key, input]) => React.createElement('div', { key: key, className: 'socket-row' }, [
                    React.createElement(RefComponent, {
                        init: ref => emit({ type: "render", data: { type: "socket", element: ref, payload: input.socket, nodeId: data.id, side: "input", key } }),
                        unmount: ref => emit({ type: "unmount", data: { element: ref } })
                    }),
                    React.createElement('span', { style: { marginLeft: '10px', fontSize: '12px' } }, input.label)
                ]))
            ),

            React.createElement('div', { className: 'controls' }, 
                controls.map(([key, control]) => React.createElement(RefComponent, {
                    key: key,
                    init: ref => emit({ type: "render", data: { type: "control", element: ref, payload: control } }),
                    unmount: ref => emit({ type: "unmount", data: { element: ref } })
                }))
            ),

            React.createElement('div', { className: 'io-container' }, 
                outputs.map(([key, output]) => React.createElement('div', { key: key, className: 'socket-row', style: { justifyContent: 'flex-end' } }, [
                    React.createElement('span', { style: { marginRight: '10px', fontSize: '12px' } }, output.label),
                    React.createElement(RefComponent, {
                        init: ref => emit({ type: "render", data: { type: "socket", element: ref, payload: output.socket, nodeId: data.id, side: "output", key } }),
                        unmount: ref => emit({ type: "unmount", data: { element: ref } })
                    })
                ]))
            )
        ]);
    }

    window.nodeRegistry.register('AndNode', {
        label: "AND Gate",
        category: "Logic",
        nodeClass: AndNode,
        factory: (cb) => new AndNode(cb),
        component: AndNodeComponent
    });

    console.log("[AndNode] Registered");
})();
