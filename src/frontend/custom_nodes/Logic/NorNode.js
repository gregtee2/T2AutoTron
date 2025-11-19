if (!LiteGraph.registered_node_types?.["Logic/NorNode"]) {
  class NorNode extends LiteGraph.LGraphNode {
    constructor() {
      super();
      this.title = "Nor";
      this.bgcolor = "rgb(38, 56, 90)";
      this.properties = { inputCount: 2, debug: false };
      this.outputState = false;
      this.updateInputs();
      this.addOutput("Output", "boolean");
      this.addWidget("button", "Add Input", "➕", () => this.addInputSlot(), { width: 40 });
      this.addWidget("button", "Remove Input", "➖", () => this.removeInputSlot(), { width: 40 });
      this.addWidget("toggle", "Debug Logs", this.properties.debug, (v) => {
        this.properties.debug = v;
      }, { width: 100 });
    }

    updateInputs() {
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
    }

    addInputSlot() {
      if (this.properties.inputCount >= 8) {
        if (this.properties.debug) console.log(`NorNode - Maximum inputs (8) reached`);
        return;
      }
      this.properties.inputCount++;
      this.updateInputs();
      if (this.graph) {
        this.graph._version++; // Mark graph as dirty, but don't force execution
      }
      if (this.properties.debug) console.log(`NorNode - Added input slot, total: ${this.properties.inputCount}`);
    }

    removeInputSlot() {
      if (this.properties.inputCount <= 2) {
        if (this.properties.debug) console.log(`NorNode - Minimum inputs (2) reached`);
        return;
      }
      this.properties.inputCount--;
      this.updateInputs();
      if (this.graph) {
        this.graph._version++; // Mark graph as dirty, but don't force execution
      }
      if (this.properties.debug) console.log(`NorNode - Removed input slot, total: ${this.properties.inputCount}`);
    }

    onExecute() {
      let output = false;
      for (let i = 0; i < this.properties.inputCount; i++) {
        const input = this.getInputData(i) || false;
        output = output || input;
      }
      output = !output;
      const prevOutputState = this.outputState;
      this.outputState = output;
      if (this.properties.debug) {
        // Optimize logging by building string once
        const inputsStr = Array.from({ length: this.properties.inputCount }, (_, i) => `Input ${i + 1}: ${this.getInputData(i) || false}`).join(", ");
        console.log(`NorNode - ${inputsStr}, Output: ${output}`);
      }
      this.setOutputData(0, output);
      // Only redraw if state changes and canvas isn't already marked dirty
      if (prevOutputState !== this.outputState && !this.graph?.canvas?.dirty) {
        this.setDirtyCanvas(true);
      }
    }

    onDrawBackground(ctx) {
      if (super.onDrawBackground) super.onDrawBackground(ctx);
      ctx.strokeStyle = this.outputState ? "#00FF00" : "#FF0000";
      ctx.lineWidth = 2;
      ctx.strokeRect(0, 0, this.size[0], this.size[1]);
    }

    onConnectionsChange(type, index, connected, link_info) {
      if (type === LiteGraph.OUTPUT && this.properties.debug) {
        console.log(`NorNode - Output ${connected ? "connected" : "disconnected"} at slot ${index}, link: ${link_info?.id}`);
      }
    }

    serialize() {
      const data = super.serialize();
      data.properties = { ...this.properties };
      return data;
    }

    configure(data) {
      super.configure(data);
      this.properties = {
        inputCount: data.properties?.inputCount ?? 2,
        debug: data.properties?.debug ?? false,
      };
      this.updateInputs();
      const debugWidget = this.widgets.find((w) => w.name === "Debug Logs");
      if (debugWidget) debugWidget.value = this.properties.debug;
    }
  }
  LiteGraph.registerNodeType("Logic/NorNode", NorNode);
}