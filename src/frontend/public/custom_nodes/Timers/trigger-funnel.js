if (!LiteGraph.registered_nodes || !LiteGraph.registered_nodes["Timers/trigger_funnel"]) {
    class TriggerFunnelNode extends LiteGraph.LGraphNode {
        constructor() {
            super();
            this.title = "Trigger Funnel";
            this.size = [350, 250];

            // Tracks when each input last turned ON (false->true).
            // We'll initialize them to -1 to indicate "never turned on"
            this.lastOnTime = [-1, -1, -1, -1, -1];

            // Keep track of each input's previous state so we can detect transitions
            this.prevState = [false, false, false, false, false];

            // Which input is currently active (if any)
            this.activeIndex = null;

            // The HSV info for the active input
            this.activeHSV = null;

            // Whether we output a "true" trigger this frame
            this.outputWasActive = false;

            // Create 5 pairs of inputs:
            // Even indices: 0,2,4,6,8 => "Trigger i"
            // Odd indices: 1,3,5,7,9 => "HSV Info i"
            for (let i = 1; i <= 5; i++) {
                this.addInput(`Trigger ${i}`, "boolean");
                this.addInput(`HSV Info ${i}`, "hsv_info");
            }

            // Create one boolean + one HSV output
            this.addOutput("Funnel Trigger", "boolean");
            this.addOutput("Funnel HSV", "hsv_info");

            // Simple clock/timer to increment each frame (or each onExecute call).
            // Used for timestamps.
            this._frameCounter = 0;
        }

        onExecute() {
            // increment frame counter each time onExecute runs
            this._frameCounter++;

            // Check each input to see if it is currently ON,
            // and detect changes from false -> true.
            let anyTrue = false;
            for (let i = 0; i < 5; i++) {
                const triggerVal = this.getInputData(i * 2) === true;    // boolean
                const hsvVal     = this.getInputData(i * 2 + 1) || null; // HSV info or null

                // If it just turned from false -> true, update timestamp
                if (!this.prevState[i] && triggerVal) {
                    // Record the moment it turned ON
                    this.lastOnTime[i] = this._frameCounter;
                }

                // Save current state for next frame
                this.prevState[i] = triggerVal;
            }

            // Now find which input is actually ON and has the largest timestamp
            let selectedIndex = null;
            let bestTimestamp = -1;
            let selectedHSV   = null;

            for (let i = 0; i < 5; i++) {
                const triggerVal = this.getInputData(i * 2) === true;
                const hsvVal     = this.getInputData(i * 2 + 1) || null;

                if (triggerVal) {
                    anyTrue = true;
                    // Compare timestamps: pick the most recently turned-on input
                    if (this.lastOnTime[i] > bestTimestamp) {
                        bestTimestamp = this.lastOnTime[i];
                        selectedIndex = i;
                        selectedHSV   = hsvVal;
                    }
                }
            }

            if (selectedIndex !== null) {
                // We have an active input
                this.activeIndex = selectedIndex;
                this.activeHSV   = selectedHSV;
                this.outputWasActive = true;
            } else {
                // No inputs are on
                this.activeIndex = null;
                this.activeHSV   = null;
                this.outputWasActive = false;
            }

            // Outputs
            this.setOutputData(0, this.activeIndex !== null); // Funnel Trigger
            this.setOutputData(1, this.activeHSV);             // Funnel HSV
        }

        onDrawForeground(ctx) {
            super.onDrawForeground?.(ctx);

            // ----------------------------------
            // Mark the active input
            // ----------------------------------
            if (this.activeIndex !== null) {
                const slotHeight = LiteGraph.NODE_SLOT_HEIGHT || 20;
                const x = 10; 
                const inputIndex = this.activeIndex * 2;  // actual "Trigger" slot
                const y = slotHeight * inputIndex + slotHeight * 0.3;
                ctx.save();
                ctx.fillStyle = "#00FF00";
                ctx.fillRect(x, y, 10, 10);
                ctx.restore();
            }

            // ----------------------------------
            // Mark the output if active
            // ----------------------------------
            if (this.outputWasActive) {
                const slotHeight = LiteGraph.NODE_SLOT_HEIGHT || 20;
                const outSlotIndex = 0; 
                const x = this.size[0] - 20;
                const y = slotHeight * outSlotIndex + slotHeight * 0.3;
                ctx.save();
                ctx.fillStyle = "#00FF00";
                ctx.fillRect(x, y, 10, 10);
                ctx.restore();
            }
        }

        // Optional: persist node properties, timestamps, etc.
        onSerialize(o) {
            o.properties = LiteGraph.cloneObject(this.properties);
            o.activeIndex = this.activeIndex;
            o.lastOnTime = this.lastOnTime.slice(); // copy array
            // no need to store _frameCounter if the logic allows it to reset
        }

        onConfigure(o) {
            if (o.properties) {
                this.properties = LiteGraph.cloneObject(o.properties);
            }
            if (o.activeIndex !== undefined) {
                this.activeIndex = o.activeIndex;
            }
            if (o.lastOnTime) {
                this.lastOnTime = o.lastOnTime.slice();
            }
        }
    }

    LiteGraph.registerNodeType("Timers/trigger_funnel", TriggerFunnelNode);
    console.log("[Trigger Funnel] Node updated with time-based priority switching and re-registered.");
} else {
    console.log("[Trigger Funnel] Node is already registered.");
}
