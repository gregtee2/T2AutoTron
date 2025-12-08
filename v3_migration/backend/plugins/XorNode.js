// ============================================================================
// XorNode.js - XOR Gate using shared T2LogicGate base
// Refactored to use DRY principles with shared controls and base class
// ============================================================================

(function() {
    // Debug: console.log("[XorNode] Loading plugin...");

    // Use shared dependency checker
    if (!window.T2LogicGate) {
        console.error("[XorNode] T2LogicGate not found - ensure 00_LogicGateBasePlugin.js loads first");
        return;
    }

    const { 
        BaseLogicGateNode, 
        createComponent 
    } = window.T2LogicGate;

    const { ClassicPreset } = window.Rete;
    const sockets = window.sockets;

    // -------------------------------------------------------------------------
    // NODE CLASS - Extends shared base (fixed 2 inputs for XOR)
    // -------------------------------------------------------------------------
    class XorNode extends BaseLogicGateNode {
        constructor(changeCallback) {
            super("XOR Gate", changeCallback, {
                gateType: 'xor',
                inputCount: 2
            });

            // XOR always has exactly 2 inputs, add them directly
            this.addInput("in0", new ClassicPreset.Input(
                sockets?.boolean || new ClassicPreset.Socket('boolean'), 
                "Input 1"
            ));
            this.addInput("in1", new ClassicPreset.Input(
                sockets?.boolean || new ClassicPreset.Socket('boolean'), 
                "Input 2"
            ));
        }

        // Override - XOR doesn't support dynamic inputs
        updateInputs() {
            // No-op for XOR (fixed 2 inputs)
        }

        data(inputs) {
            const val1 = !!inputs.in0?.[0];
            const val2 = !!inputs.in1?.[0];
            
            // XOR logic: exactly one input must be true
            const result = val1 !== val2;

            return { result };
        }
    }

    // -------------------------------------------------------------------------
    // COMPONENT - Use shared factory
    // -------------------------------------------------------------------------
    const XorNodeComponent = createComponent('xor');

    // -------------------------------------------------------------------------
    // REGISTRATION
    // -------------------------------------------------------------------------
    window.nodeRegistry.register('XorNode', {
        label: "XOR Gate",
        category: "Logic",
        nodeClass: XorNode,
        factory: (cb) => new XorNode(cb),
        component: XorNodeComponent
    });

    console.log("[XorNode] Registered (DRY refactored)");
})();
