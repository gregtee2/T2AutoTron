// Path: HomeAssistant/Logic/ChooseNode
if (!LiteGraph.registered_node_types?.["Logic/ChooseNode"]) {
  class ChooseNode extends LiteGraph.LGraphNode {
    constructor() {
      super();
      this.title = "Choose";
      this.bgcolor = "rgb(38, 56, 90)"; // Set background color
      this.properties = { optionCount: 2, debug: false, lastForceUpdate: 0 };
      this.outputState = false; // Track output state for border color
      this.updateInputs();
      this.addOutput("Output", "boolean");
      this.addWidget("button", "Add Option", "➕", () => this.addOption(), { width: 40 });
      this.addWidget("button", "Remove Option", "➖", () => this.removeOption(), { width: 40 });
      this.addWidget("toggle", "Debug Logs", this.properties.debug, (v) => {
        this.properties.debug = v;
      }, { width: 100 });
    }

    updateInputs() {
      const desiredInputs = [];
      for (let i = 0; i < this.properties.optionCount; i++) {
        desiredInputs.push(`Option ${i + 1} Condition`, `Option ${i + 1} Action`);
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

    addOption() {
      if (this.properties.optionCount >= 5) {
        if (this.properties.debug) console.log(`ChooseNode - Maximum options (5) reached`);
        return;
      }
      this.properties.optionCount++;
      this.updateInputs();
      if (this.properties.debug) console.log(`ChooseNode - Added option, total: ${this.properties.optionCount}`);
    }

    removeOption() {
      if (this.properties.optionCount <= 2) {
        if (this.properties.debug) console.log(`ChooseNode - Minimum options (2) reached`);
        return;
      }
      this.properties.optionCount--;
      this.updateInputs();
      if (this.properties.debug) console.log(`ChooseNode - Removed option, total: ${this.properties.optionCount}`);
    }

    onExecute() {
      let output = false;
      for (let i = 0; i < this.properties.optionCount; i++) {
        const condition = this.getInputData(i * 2) || false;
        const action = this.getInputData(i * 2 + 1) || false;
        if (condition) {
          output = action;
          break;
        }
      }
      const prevOutputState = this.outputState;
      this.outputState = output;
      if (this.properties.debug) {
        // Optimize logging by building string once
        const conditionsStr = Array.from({ length: this.properties.optionCount }, (_, i) => 
          `Option ${i + 1} Condition: ${this.getInputData(i * 2) || false}, Action: ${this.getInputData(i * 2 + 1) || false}`
        ).join(", ");
        console.log(`ChooseNode - ${conditionsStr}, Output: ${output}`);
      }
      this.setOutputData(0, output);
      // Only redraw if state changes and canvas isn't already marked dirty
      if (prevOutputState !== this.outputState && !this.graph?.canvas?.dirty) {
        this.setDirtyCanvas(true);
      }
    }

    onDrawBackground(ctx) {
      if (super.onDrawBackground) super.onDrawBackground(ctx);
      ctx.strokeStyle = this.outputState ? "#00FF00" : "#FF0000"; // Green for true, red for false
      ctx.lineWidth = 2;
      ctx.strokeRect(0, 0, this.size[0], this.size[1]);
    }

    onConnectionsChange(type, index, connected, link_info) {
      if (type === LiteGraph.INPUT && this.properties.debug) {
        console.log(`ChooseNode - Input ${connected ? "connected" : "disconnected"} at slot ${index}, link: ${link_info?.id}`);
      }
      // Mark graph as dirty but don't force execution or call onExecute
      if (type === LiteGraph.INPUT && this.graph) {
        this.graph._version++;
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
        optionCount: data.properties?.optionCount ?? 2,
        debug: data.properties?.debug ?? false,
        lastForceUpdate: data.properties?.lastForceUpdate ?? 0,
      };
      this.updateInputs();
      const debugWidget = this.widgets.find(w => w.name === "Debug Logs");
      if (debugWidget) debugWidget.value = this.properties.debug;
    }
  }
  LiteGraph.registerNodeType("Logic/ChooseNode", ChooseNode);
}