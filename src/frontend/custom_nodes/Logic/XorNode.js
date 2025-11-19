if (!LiteGraph.registered_node_types?.["Logic/XorNode"]) {
  class XorNode extends LiteGraph.LGraphNode {
    constructor() {
      super();
      this.title = "Xor";
      this.bgcolor = "rgb(38, 56, 90)";
      this.addInput("Value 1", "boolean");
      this.addInput("Value 2", "boolean");
      this.addOutput("Output", "boolean");
      this.properties = { debug: false };
      this.outputState = false;
      this.addWidget("toggle", "Debug Logs", this.properties.debug, (v) => {
        this.properties.debug = v;
      }, { width: 100 });
    }

    onExecute() {
      const value1 = this.getInputData(0) || false;
      const value2 = this.getInputData(1) || false;
      const output = value1 !== value2; // XOR: true if inputs differ
      const prevOutputState = this.outputState;
      this.outputState = output;
      if (this.properties.debug) {
        console.log(`XorNode - Value 1: ${value1}, Value 2: ${value2}, Output: ${output}`);
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
        console.log(`XorNode - Output ${connected ? "connected" : "disconnected"} at slot ${index}, link: ${link_info?.id}`);
      }
    }

    serialize() {
      const data = super.serialize();
      data.properties = { ...this.properties };
      return data;
    }

    configure(data) {
      super.configure(data);
      this.properties = { debug: data.properties?.debug ?? false };
      const debugWidget = this.widgets.find((w) => w.name === "Debug Logs");
      if (debugWidget) debugWidget.value = this.properties.debug;
    }
  }
  LiteGraph.registerNodeType("Logic/XorNode", XorNode);
}