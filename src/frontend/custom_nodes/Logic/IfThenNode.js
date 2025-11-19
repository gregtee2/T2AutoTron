// Path: HomeAssistant/Logic/IfThenNode
if (!LiteGraph.registered_node_types?.["HomeAssistant/Logic/IfThenNode"]) {
  class IfThenNode extends LiteGraph.LGraphNode {
    constructor() {
      super();
      this.title = "If-Then";
      this.bgcolor = "rgb(38, 56, 90)"; // Set background color
      this.addInput("Condition", "boolean");
      this.addInput("If True", "boolean");
      this.addOutput("Output", "boolean");
      this.properties = { debug: false, lastForceUpdate: 0 };
      this.outputState = false; // Track output state for border color
      this.addWidget("toggle", "Debug Logs", this.properties.debug, (v) => {
        this.properties.debug = v;
      }, { width: 100 });
    }

    onExecute() {
      const condition = this.getInputData(0) || false;
      const ifTrue = this.getInputData(1) || false;
      const output = condition ? ifTrue : false;
      const prevOutputState = this.outputState;
      this.outputState = output;
      if (this.properties.debug) {
        console.log(`IfThenNode - Condition: ${condition}, If True: ${ifTrue}, Output: ${output}`);
      }
      this.setOutputData(0, output);
      // Only redraw if state changes and canvas isn't already marked
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
        console.log(`IfThenNode - Input ${connected ? 'connected' : 'disconnected'} at slot ${index}, link: ${link_info?.id}`);
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
        debug: data.properties?.debug ?? false,
        lastForceUpdate: data.properties?.lastForceUpdate ?? 0,
      };
      const debugWidget = this.widgets.find(w => w.name === "Debug Logs");
      if (debugWidget) debugWidget.value = this.properties.debug;
    }
  }
  LiteGraph.registerNodeType("Logic/IfThenNode", IfThenNode);
}