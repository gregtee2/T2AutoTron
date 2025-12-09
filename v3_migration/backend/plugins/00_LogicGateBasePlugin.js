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

    // Get tooltip components from T2Controls
    const { HelpIcon } = window.T2Controls || {};

    // =========================================================================
    // GATE DESCRIPTIONS - Tooltips for each gate type
    // =========================================================================
    const GATE_TOOLTIPS = {
        and: {
            node: "AND Gate - Outputs TRUE only when ALL inputs are TRUE.\n\nUse for: Requiring multiple conditions to be met simultaneously.\n\nExample: Turn on lights only when motion detected AND it's dark.",
            pulseMode: "When enabled, outputs a brief pulse (100ms) on rising edge instead of sustained TRUE.",
            addInput: "Add another input slot (max 8).",
            removeInput: "Remove the last input slot (min 2)."
        },
        or: {
            node: "OR Gate - Outputs TRUE when ANY input is TRUE.\n\nUse for: Triggering on any of multiple conditions.\n\nExample: Alert when front door OR back door opens.",
            pulseMode: "When enabled, outputs a brief pulse (100ms) on rising edge instead of sustained TRUE.",
            addInput: "Add another input slot (max 8).",
            removeInput: "Remove the last input slot (min 2)."
        },
        xor: {
            node: "XOR Gate (Exclusive OR) - Outputs TRUE when exactly ONE input is TRUE.\n\nUse for: Detecting when only one of multiple conditions is active.\n\nExample: Alert if front door OR back door is open, but not both.",
            pulseMode: "When enabled, outputs a brief pulse (100ms) on rising edge instead of sustained TRUE.",
            addInput: "Add another input slot (max 8).",
            removeInput: "Remove the last input slot (min 2)."
        },
        not: {
            node: "NOT Gate (Inverter) - Outputs the opposite of the input.\n\nUse for: Inverting a boolean signal.\n\nExample: Trigger when motion is NOT detected.",
            pulseMode: "When enabled, outputs a brief pulse (100ms) on rising edge instead of sustained TRUE."
        },
        nand: {
            node: "NAND Gate - Outputs FALSE only when ALL inputs are TRUE (inverse of AND).\n\nUse for: Triggering when at least one condition is not met.",
            pulseMode: "When enabled, outputs a brief pulse (100ms) on rising edge instead of sustained TRUE.",
            addInput: "Add another input slot (max 8).",
            removeInput: "Remove the last input slot (min 2)."
        },
        nor: {
            node: "NOR Gate - Outputs TRUE only when ALL inputs are FALSE (inverse of OR).\n\nUse for: Triggering when no conditions are active.",
            pulseMode: "When enabled, outputs a brief pulse (100ms) on rising edge instead of sustained TRUE.",
            addInput: "Add another input slot (max 8).",
            removeInput: "Remove the last input slot (min 2)."
        }
    };

    // =========================================================================
    // SHARED STYLES FOR LOGIC GATES
    // Uses softer colors from category theme system
    // =========================================================================
    const GATE_COLORS = {
        and: { primary: '#81c784', bg: 'rgba(129, 199, 132, 0.1)', border: 'rgba(129, 199, 132, 0.3)' },
        or: { primary: '#64b5f6', bg: 'rgba(100, 181, 246, 0.1)', border: 'rgba(100, 181, 246, 0.3)' },
        xor: { primary: '#ffb74d', bg: 'rgba(255, 183, 77, 0.1)', border: 'rgba(255, 183, 77, 0.3)' },
        not: { primary: '#f48fb1', bg: 'rgba(244, 143, 177, 0.1)', border: 'rgba(244, 143, 177, 0.3)' },
        nand: { primary: '#ce93d8', bg: 'rgba(206, 147, 216, 0.1)', border: 'rgba(206, 147, 216, 0.3)' },
        nor: { primary: '#4dd0e1', bg: 'rgba(77, 208, 225, 0.1)', border: 'rgba(77, 208, 225, 0.3)' }
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
        return React.createElement('button', {
            onClick: data.onClick,
            onPointerDown: (e) => e.stopPropagation(),
            onDoubleClick: (e) => e.stopPropagation(),
            style: {
                width: '100%',
                marginBottom: '5px'
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
                style: { marginRight: '8px' }
            }),
            React.createElement('span', { 
                key: 'label',
                className: 'socket-label'
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
        const tooltips = GATE_TOOLTIPS[gateType] || GATE_TOOLTIPS.or;

        return function LogicGateComponent({ data, emit }) {
            const inputs = Object.entries(data.inputs);
            const outputs = Object.entries(data.outputs);
            const controls = Object.entries(data.controls);

            return React.createElement('div', { 
                className: 'logic-node',
                style: {
                    padding: '0',
                    minWidth: '160px'
                }
            }, [
                // Header with tooltip
                React.createElement('div', { 
                    key: 'header',
                    className: 'header',
                    style: {
                        padding: '8px 12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                    }
                }, [
                    React.createElement('span', {
                        key: 'title',
                        style: {
                            fontWeight: '600',
                            fontSize: '13px',
                            textTransform: 'uppercase',
                            letterSpacing: '1px'
                        }
                    }, data.label),
                    HelpIcon && React.createElement(HelpIcon, { 
                        key: 'help', 
                        text: tooltips.node, 
                        size: 14 
                    })
                ]),

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
                            className: 'socket-label'
                        }, input.label)
                    ]))
                ),

                // Controls
                controls.length > 0 && React.createElement('div', { 
                    key: 'controls',
                    className: 'controls'
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
                    className: 'io-container'
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
                            className: 'socket-label'
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

    // console.log("[LogicGateBasePlugin] Registered window.T2LogicGate");
})();
