// ============================================================================
// AndNode.js - AND Gate using shared T2LogicGate base
// Refactored to use DRY principles with shared controls and base class
// ============================================================================

(function() {
    // Debug: console.log("[AndNode] Loading plugin...");

    // Use shared dependency checker
    if (!window.T2LogicGate) {
        console.error("[AndNode] T2LogicGate not found - ensure 00_LogicGateBasePlugin.js loads first");
        return;
    }

    const { 
        BaseLogicGateNode, 
        GateButtonControl, 
        GateSwitchControl,
        createComponent,
        GATE_COLORS 
    } = window.T2LogicGate;

    // -------------------------------------------------------------------------
    // NODE CLASS - Extends shared base
    // -------------------------------------------------------------------------
    class AndNode extends BaseLogicGateNode {
        constructor(changeCallback) {
            super("AND Gate", changeCallback, {
                gateType: 'and',
                inputCount: 2,
                pulseMode: false
            });

            // Add pulse mode control
            this.addControl("pulse_mode", new GateSwitchControl("Pulse Mode", false, (val) => {
                this.properties.pulseMode = val;
            }));

            // Add input management controls
            this.addControl("add_input", new GateButtonControl("+ Add Input", () => this.addInputSlot(), GATE_COLORS.and.primary));
            this.addControl("remove_input", new GateButtonControl("- Remove Input", () => this.removeInputSlot(), GATE_COLORS.and.primary));

            this.updateInputs(true);
        }

        data(inputs) {
            const values = this.getInputValues(inputs);
            
            // AND logic: all inputs must be true
            const rawResult = values.every(v => v);
            
            // Handle pulse mode if enabled
            const result = this.handlePulseMode(rawResult);

            return { result };
        }

        restore(state) {
            super.restore(state);
            if (this.controls.pulse_mode) {
                this.controls.pulse_mode.value = this.properties.pulseMode;
            }
        }
    }

    // -------------------------------------------------------------------------
    // COMPONENT - Use shared factory
    // -------------------------------------------------------------------------
    const AndNodeComponent = createComponent('and');

    // -------------------------------------------------------------------------
    // REGISTRATION
    // -------------------------------------------------------------------------
    window.nodeRegistry.register('AndNode', {
        label: "AND Gate",
        category: "Logic",
        nodeClass: AndNode,
        factory: (cb) => new AndNode(cb),
        component: AndNodeComponent
    });

    // console.log("[AndNode] Registered (DRY refactored)");
})();
