console.log("LiteGraph:", !!LiteGraph);
console.log("registered_node_types:", LiteGraph.registered_node_types);

if (!LiteGraph.registered_node_types?.["Logic/HS_AndNode"]) {
  class AndNode extends LiteGraph.LGraphNode {
    constructor() {
      try {
        super();
        this.title = "HA_And";
        this.bgcolor = "rgb(38, 56, 90)";
        this.properties = { inputCount: 2, debug: true, pulseMode: false };
        this.outputState = false;
        this.lastPulsedState = null;
        this.pulseTimeout = null;
        this.prevInputs = null;
        this.prevOutput = null;
        this.updateInputs();
        this.addOutput("Output", "boolean");
        this.addWidget("button", "Add Input", "➕", () => this.addInputSlot(), { width: 40 });
        this.addWidget("button", "Remove Input", "➖", () => this.removeInputSlot(), { width: 40 });
        this.addWidget("toggle", "Debug Logs", this.properties.debug, (v) => {
          this.properties.debug = v;
          if (this.properties.debug) console.log(`AndNode ${this.id} debug logging ${v ? "enabled" : "disabled"}`);
        }, { width: 100 });
        this.addWidget("toggle", "Pulse Mode", this.properties.pulseMode, (v) => {
          this.properties.pulseMode = v;
          if (this.pulseTimeout) {
            clearTimeout(this.pulseTimeout);
            this.pulseTimeout = null;
          }
          this.lastPulsedState = null;
          this.prevInputs = null;
          this.prevOutput = null;
          this.setOutputData(0, this.properties.pulseMode ? null : this.outputState);
          this.setDirtyCanvas(true);
          if (this.properties.debug) console.log(`AndNode ${this.id} set to ${v ? "Pulse" : "Steady"} mode`);
        }, { width: 100 });
        if (this.properties.debug) console.log(`AndNode ${this.id} constructed`);
      } catch (e) {
        console.error(`AndNode ${this.id} constructor error:`, e);
      }
    }

    updateInputs() {
      try {
        const desiredInputs = [];
        for (let i = 0; i < this.properties.inputCount; i++) {
          desiredInputs.push(`Input ${i + 1}`);
        }
        while (this.inputs?.length > desiredInputs.length) {
          this.removeInput(this.inputs.length - 1);
        }
        for (let i = 0; i < desiredInputs.length; i++) {
          if (i < (this.inputs?.length || 0)) {
            this.inputs[i].name = desiredInputs[i];
            this.inputs[i].label = "";
          } else {
            this.addInput(desiredInputs[i], "boolean");
            this.inputs[i].label = "";
          }
        }
      } catch (e) {
        console.error(`AndNode ${this.id} updateInputs error:`, e);
      }
    }

    addInputSlot() {
      try {
        if (this.properties.inputCount >= 8) {
          if (this.properties.debug) console.log(`AndNode ${this.id} - Maximum inputs (8) reached`);
          return;
        }
        this.properties.inputCount++;
        this.updateInputs();
        this.prevInputs = null; // Reset to force log on next execution
        if (this.graph) {
          this.graph._version++;
          this.graph.runStep();
        }
        if (this.properties.debug) console.log(`AndNode ${this.id} - Added input slot, total: ${this.properties.inputCount}`);
      } catch (e) {
        console.error(`AndNode ${this.id} addInputSlot error:`, e);
      }
    }

    removeInputSlot() {
      try {
        if (this.properties.inputCount <= 2) {
          if (this.properties.debug) console.log(`AndNode ${this.id} - Minimum inputs (2) reached`);
          return;
        }
        this.properties.inputCount--;
        this.updateInputs();
        this.prevInputs = null; // Reset to force log on next execution
        if (this.graph) {
          this.graph._version++;
          this.graph.runStep();
        }
        if (this.properties.debug) console.log(`AndNode ${this.id} - Removed input slot, total: ${this.properties.inputCount}`);
      } catch (e) {
        console.error(`AndNode ${this.id} removeInputSlot error:`, e);
      }
    }

    onExecute() {
      try {
        let output = null;
        let allDefined = true;
        let allTrue = true;
        const currentInputs = [];

        // Evaluate inputs
        for (let i = 0; i < this.properties.inputCount; i++) {
          const input = this.getInputData(i);
          currentInputs.push(input);
          if (input === null || input === undefined) {
            allDefined = false;
            allTrue = false;
          } else {
            allTrue = allTrue && input; // AND logic: all inputs must be true
          }
        }

        // Compute output
        if (allDefined) {
          output = allTrue; // Output is true only if all inputs are true
        } else {
          output = null; // Any null/undefined input results in null output
        }

        const prevOutputState = this.outputState;
        const prevLastPulsedState = this.lastPulsedState;
        this.outputState = output ?? false; // Track state for non-pulse mode

        // Check for changes to trigger logging
        const inputsChanged = !this.prevInputs || currentInputs.some((val, i) => val !== this.prevInputs[i]);
        const outputChanged = output !== this.prevOutput;
        const pulsedStateChanged = this.properties.pulseMode && this.lastPulsedState !== prevLastPulsedState;

        if (this.properties.pulseMode) {
          // Pulse mode: Output pulse on state change (true or false)
          if (output !== null && output !== this.lastPulsedState) {
            if (this.pulseTimeout) {
              clearTimeout(this.pulseTimeout);
              this.pulseTimeout = null;
            }
            this.setOutputData(0, output);
            this.lastPulsedState = output; // Track the last pulsed state
            this.pulseTimeout = setTimeout(() => {
              this.setOutputData(0, null);
              this.setDirtyCanvas(true);
              if (this.properties.debug) {
                console.log(`AndNode ${this.id} pulse ended, output set to null, lastPulsedState: ${this.lastPulsedState}`);
              }
            }, 500); // 500ms pulse duration
          }
        } else {
          // Non-pulse mode: Continuous output
          this.setOutputData(0, this.outputState);
        }

        // Log only on significant changes
        if (this.properties.debug && (inputsChanged || outputChanged || pulsedStateChanged)) {
          const inputStr = currentInputs.map((val, i) => `Input ${i + 1}: ${val === null ? 'null' : val}`).join(", ");
          console.log(`AndNode ${this.id} - ${inputStr}, Output: ${output}, Pulse Mode: ${this.properties.pulseMode}, Last Pulsed: ${this.lastPulsedState}`);
        }

        // Update previous state for next iteration
        this.prevInputs = currentInputs.slice();
        this.prevOutput = output;

        // Trigger redraw if outputState or lastPulsedState changes
        if (prevOutputState !== this.outputState || prevLastPulsedState !== this.lastPulsedState) {
          this.setDirtyCanvas(true);
        }
      } catch (e) {
        console.error(`AndNode ${this.id} onExecute error:`, e);
      }
    }

    onDrawBackground(ctx) {
      try {
        if (super.onDrawBackground) super.onDrawBackground(ctx);
        // Use lastPulsedState in pulse mode, outputState in non-pulse mode
        const state = this.properties.pulseMode ? this.lastPulsedState : this.outputState;
        ctx.strokeStyle = state === true ? "#00FF00" : "#FF0000"; // Green for true, red for false or null
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, this.size[0], this.size[1]);
      } catch (e) {
        console.error(`AndNode ${this.id} onDrawBackground error:`, e);
      }
    }

    onConnectionsChange(type, index, connected, link_info) {
      try {
        if (type === LiteGraph.OUTPUT && this.properties.debug) {
          console.log(`AndNode ${this.id} - Output ${connected ? "connected" : "disconnected"} at slot ${index}, link: ${link_info?.id}`);
        }
      } catch (e) {
        console.error(`AndNode ${this.id} onConnectionsChange error:`, e);
      }
    }

    serialize() {
      try {
        const data = super.serialize();
        data.properties = { ...this.properties };
        data.lastPulsedState = this.lastPulsedState;
        return data;
      } catch (e) {
        console.error(`AndNode ${this.id} serialize error:`, e);
      }
    }

    configure(data) {
      try {
        super.configure(data);
        this.properties = {
          inputCount: data.properties?.inputCount ?? 2,
          debug: data.properties?.debug ?? false,
          pulseMode: data.properties?.pulseMode ?? false
        };
        this.lastPulsedState = data.lastPulsedState ?? null;
        this.prevInputs = null;
        this.prevOutput = null;
        this.updateInputs();
        const debugWidget = this.widgets.find((w) => w.name === "Debug Logs");
        if (debugWidget) debugWidget.value = this.properties.debug;
        const pulseWidget = this.widgets.find((w) => w.name === "Pulse Mode");
        if (pulseWidget) pulseWidget.value = this.properties.pulseMode;
      } catch (e) {
        console.error(`AndNode ${this.id} configure error:`, e);
      }
    }

    onRemoved() {
      try {
        if (this.pulseTimeout) {
          clearTimeout(this.pulseTimeout);
          this.pulseTimeout = null;
        }
        this.lastPulsedState = null;
        this.prevInputs = null;
        this.prevOutput = null;
      } catch (e) {
        console.error(`AndNode ${this.id} onRemoved error:`, e);
      }
    }
  }

  try {
    LiteGraph.registerNodeType("Logic/HS_AndNode", AndNode);
    console.log("AndNode registered successfully");
  } catch (e) {
    console.error("Error registering AndNode:", e);
  }
} else {
  console.log("AndNode already registered");
}