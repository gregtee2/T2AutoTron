// ============================================================================
// OrNode.js - OR Gate using shared T2LogicGate base
// Refactored to use DRY principles with shared controls and base class
// ============================================================================

(function() {
    // Debug: console.log("[OrNode] Loading plugin...");

    // Use shared dependency checker
    if (!window.T2LogicGate) {
        console.error("[OrNode] T2LogicGate not found - ensure 00_LogicGateBasePlugin.js loads first");
        return;
    }

    const { 
        BaseLogicGateNode, 
        GateButtonControl, 
        createComponent,
        GATE_COLORS 
    } = window.T2LogicGate;

    // -------------------------------------------------------------------------
    // NODE CLASS - Extends shared base
    // -------------------------------------------------------------------------
    class OrNode extends BaseLogicGateNode {
        constructor(changeCallback) {
            super("OR Gate", changeCallback, {
                gateType: 'or',
                inputCount: 2
            });

            // Add input management controls
            this.addControl("add_input", new GateButtonControl("+ Add Input", () => this.addInputSlot(), GATE_COLORS.or.primary));
            this.addControl("remove_input", new GateButtonControl("- Remove Input", () => this.removeInputSlot(), GATE_COLORS.or.primary));

            this.updateInputs(true);
        }

        data(inputs) {
            const values = this.getInputValues(inputs);
            
            // OR logic: any input must be true
            const result = values.some(v => v);

            return { result };
        }
    }

    // -------------------------------------------------------------------------
    // COMPONENT - Use shared factory
    // -------------------------------------------------------------------------
    const OrNodeComponent = createComponent('or');

    // -------------------------------------------------------------------------
    // REGISTRATION
    // -------------------------------------------------------------------------
    window.nodeRegistry.register('OrNode', {
        label: "OR Gate",
        category: "Logic",
        nodeClass: OrNode,
        factory: (cb) => new OrNode(cb),
        component: OrNodeComponent
    });

    // console.log("[OrNode] Registered (DRY refactored)");
})();
