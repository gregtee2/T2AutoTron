// ============================================================================
// 00_LogicGateBasePlugin.js - Shared base for logic gate nodes (AND, OR, XOR, etc.)
// This file MUST be loaded BEFORE logic gate plugins
// Exposes window.T2LogicGate for use by logic gate node plugins
// ============================================================================

(function() {
    // Debug: console.log("[LogicGateBasePlugin] Loading logic gate...");

    // Dependency check
    if (!window.Rete || !window.React || !window.RefComponent) {
        console.error("[LogicGateBasePlugin] Missing dependencies");
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect } = React;
    const RefComponent = window.RefComponent;

    // =========================================================================
    // SHARED STYLES FOR LOGIC GATES
    // =========================================================================
    const GATE_COLORS = {
        and: { primary: '#00ff88', bg: 'rgba(0, 255, 136, 0.1)', border: 'rgba(0, 255, 136, 0.3)' },
        or: { primary: '#4fc3f7', bg: 'rgba(79, 195, 247, 0.1)', border: 'rgba(79, 195, 247, 0.3)' },
        xor: { primary: '#ff9800', bg: 'rgba(255, 152, 0, 0.1)', border: 'rgba(255, 152, 0, 0.3)' },
        not: { primary: '#e91e63', bg: 'rgba(233, 30, 99, 0.1)', border: 'rgba(233, 30, 99, 0.3)' },
        nand: { primary: '#9c27b0', bg: 'rgba(156, 39, 176, 0.1)', border: 'rgba(156, 39, 176, 0.3)' },
        nor: { primary: '#00bcd4', bg: 'rgba(0, 188, 212, 0.1)', border: 'rgba(0, 188, 212, 0.3)' }
    };

    // =========================================================================
    // BUTTON CONTROL (Tron-styled for logic gates)
    // =========================================================================
    class GateButtonControl extends ClassicPreset.Control {
        constructor(label, onClick, color = '#4fc3f7') {
            super();
            this.label = label;
            this.onClick = onClick;
            this.color = color;
        }
    }

    function GateButtonControlComponent({ data }) {
        const color = data.color || '#4fc3f7';
        return React.createElement('button', {
            onClick: data.onClick,
            onPointerDown: (e) => e.stopPropagation(),
            onDoubleClick: (e) => e.stopPropagation(),
            style: {
                background: `${color}20`,
                border: `1px solid ${color}`,
                color: color,
                padding: '4px 8px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
                width: '100%',
                marginBottom: '5px',
                transition: 'all 0.2s'
            },
            onMouseOver: (e) => {
                e.currentTarget.style.background = `${color}40`;
                e.currentTarget.style.boxShadow = `0 0 8px ${color}40`;
            },
            onMouseOut: (e) => {
                e.currentTarget.style.background = `${color}20`;
                e.currentTarget.style.boxShadow = 'none';
            }
        }, data.label);
    }

    // =========================================================================
    // SWITCH CONTROL (for logic gates)
    // =========================================================================
    class GateSwitchControl extends ClassicPreset.Control {
        constructor(label, initialValue, onChange) {
            super();
            this.label = label;
            this.value = initialValue;
            this.onChange = onChange;
        }
    }

    function GateSwitchControlComponent({ data }) {
        const [value, setValue] = useState(data.value);

        useEffect(() => {
            setValue(data.value);
        }, [data.value]);

        const handleChange = (e) => {
            const val = e.target.checked;
            setValue(val);
            data.value = val;
            if (data.onChange) data.onChange(val);
        };

        return React.createElement('div', { 
            style: { display: 'flex', alignItems: 'center', marginBottom: '5px' } 
        }, [
            React.createElement('input', {
                key: 'checkbox',
                type: 'checkbox',
                checked: value,
                onChange: handleChange,
                onPointerDown: (e) => e.stopPropagation(),
                onDoubleClick: (e) => e.stopPropagation(),
                style: { marginRight: '5px', accentColor: '#00f3ff' }
            }),
            React.createElement('span', { 
                key: 'label',
                style: { fontSize: '12px', color: '#eee' } 
            }, data.label)
        ]);
    }

    // =========================================================================
    // BASE LOGIC GATE NODE CLASS
    // =========================================================================
    class BaseLogicGateNode extends ClassicPreset.Node {
        constructor(label, changeCallback, options = {}) {
            super(label);
            this.changeCallback = changeCallback;
            this.width = options.width || 180;
            this.gateType = options.gateType || 'or';

            this.properties = {
                inputCount: options.inputCount || 2,
                pulseMode: options.pulseMode || false,
                ...options.properties
            };

            this.lastOutput = null;
            this.pulseTimeout = null;

            // Add output
            const sockets = window.sockets;
            this.addOutput("result", new ClassicPreset.Output(
                sockets?.boolean || new ClassicPreset.Socket('boolean'), 
                "Result"
            ));
        }

        triggerUpdate() {
            if (this.changeCallback) this.changeCallback();
        }

        updateInputs(suppressUpdate = false) {
            const sockets = window.sockets;
            const currentInputs = Object.keys(this.inputs);
            const desiredCount = this.properties.inputCount;

            // Remove excess inputs
            for (let i = desiredCount; i < currentInputs.length; i++) {
                this.removeInput(`in${i}`);
            }

            // Add missing inputs
            for (let i = 0; i < desiredCount; i++) {
                const key = `in${i}`;
                if (!this.inputs[key]) {
                    this.addInput(key, new ClassicPreset.Input(
                        sockets?.boolean || new ClassicPreset.Socket('boolean'), 
                        `Input ${i + 1}`
                    ));
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

        getInputValues(inputs) {
            const values = [];
            for (let i = 0; i < this.properties.inputCount; i++) {
                const val = inputs[`in${i}`]?.[0];
                values.push(!!val);
            }
            return values;
        }

        handlePulseMode(result) {
            if (!this.properties.pulseMode) {
                return result;
            }

            // In pulse mode, only output true for one cycle on rising edge
            if (result && !this.lastOutput) {
                this.lastOutput = true;
                if (this.pulseTimeout) clearTimeout(this.pulseTimeout);
                this.pulseTimeout = setTimeout(() => {
                    this.lastOutput = false;
                    this.triggerUpdate();
                }, 100);
                return true;
            }

            if (!result) {
                this.lastOutput = false;
            }
            return false;
        }

        restore(state) {
            if (state.properties) {
                Object.assign(this.properties, state.properties);
            }
            this.updateInputs(true);
        }

        serialize() {
            return { ...this.properties };
        }

        toJSON() {
            return {
                id: this.id,
                label: this.label,
                properties: this.serialize()
            };
        }
    }

    // =========================================================================
    // SHARED COMPONENT FACTORY
    // =========================================================================
    function createLogicGateComponent(gateType = 'or') {
        const colors = GATE_COLORS[gateType] || GATE_COLORS.or;

        return function LogicGateComponent({ data, emit }) {
            const inputs = Object.entries(data.inputs);
            const outputs = Object.entries(data.outputs);
            const controls = Object.entries(data.controls);

            return React.createElement('div', { 
                className: 'logic-node',
                style: {
                    background: 'linear-gradient(180deg, rgba(10,20,30,0.95) 0%, rgba(5,15,25,0.98) 100%)',
                    border: `1px solid ${colors.border}`,
                    borderRadius: '8px',
                    padding: '0',
                    minWidth: '160px'
                }
            }, [
                // Header
                React.createElement('div', { 
                    key: 'header',
                    className: 'header',
                    style: {
                        background: colors.bg,
                        borderBottom: `1px solid ${colors.border}`,
                        padding: '8px 12px',
                        borderRadius: '7px 7px 0 0',
                        color: colors.primary,
                        fontWeight: '600',
                        fontSize: '13px',
                        textTransform: 'uppercase',
                        letterSpacing: '1px'
                    }
                }, data.label),

                // Inputs
                React.createElement('div', { 
                    key: 'inputs',
                    className: 'io-container',
                    style: { padding: '8px 10px' }
                }, 
                    inputs.map(([key, input]) => React.createElement('div', { 
                        key: key, 
                        className: 'socket-row',
                        style: { 
                            display: 'flex', 
                            alignItems: 'center', 
                            marginBottom: '4px' 
                        }
                    }, [
                        React.createElement(RefComponent, {
                            key: 'socket',
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
                        React.createElement('span', { 
                            key: 'label',
                            style: { marginLeft: '10px', fontSize: '12px', color: '#ccc' } 
                        }, input.label)
                    ]))
                ),

                // Controls
                controls.length > 0 && React.createElement('div', { 
                    key: 'controls',
                    style: { 
                        padding: '4px 10px', 
                        borderTop: `1px solid ${colors.border}` 
                    }
                }, 
                    controls.map(([key, control]) => {
                        if (control instanceof GateButtonControl) {
                            return React.createElement(GateButtonControlComponent, { 
                                key, 
                                data: control 
                            });
                        }
                        if (control instanceof GateSwitchControl) {
                            return React.createElement(GateSwitchControlComponent, { 
                                key, 
                                data: control 
                            });
                        }
                        return null;
                    })
                ),

                // Outputs
                React.createElement('div', { 
                    key: 'outputs',
                    className: 'io-container',
                    style: { 
                        padding: '8px 10px', 
                        borderTop: `1px solid ${colors.border}` 
                    }
                }, 
                    outputs.map(([key, output]) => React.createElement('div', { 
                        key: key, 
                        className: 'socket-row',
                        style: { 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'flex-end' 
                        }
                    }, [
                        React.createElement('span', { 
                            key: 'label',
                            style: { marginRight: '10px', fontSize: '12px', color: '#ccc' } 
                        }, output.label),
                        React.createElement(RefComponent, {
                            key: 'socket',
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
                    ]))
                )
            ]);
        };
    }

    // =========================================================================
    // EXPOSE TO WINDOW
    // =========================================================================
    window.T2LogicGate = {
        // Base class
        BaseLogicGateNode,

        // Controls
        GateButtonControl,
        GateButtonControlComponent,
        GateSwitchControl,
        GateSwitchControlComponent,

        // Component factory
        createComponent: createLogicGateComponent,

        // Colors for custom styling
        GATE_COLORS
    };

    console.log("[LogicGateBasePlugin] Registered window.T2LogicGate");
})();
