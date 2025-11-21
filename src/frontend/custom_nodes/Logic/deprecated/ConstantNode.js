if (!LiteGraph.registered_node_types?.["Logic/ConstantNode"]) {
  class ConstantNode extends LiteGraph.LGraphNode {
    constructor() {
      super();
      this.title = "Constant";
      this.bgcolor = "rgb(38, 56, 90)";
      this.properties = { value: 0, type: "number", debug: false };
      this.outputState = false;
      this.addOutput("Value", "*");
      this.addWidget("combo", "Type", this.properties.type, (v) => {
        this.properties.type = v;
        this.updateValueWidget();
      }, { values: ["number", "boolean", "string"] });
      this.addWidget("number", "Value", this.properties.value, (v) => {
        this.properties.value = v;
      }, { min: -1000, max: 1000, step: 1 });
      this.addWidget("toggle", "Debug Logs", this.properties.debug, (v) => {
        this.properties.debug = v;
      }, { width: 100 });
    }

    updateValueWidget() {
      const widget = this.widgets.find((w) => w.name === "Value");
      if (!widget) return;
      widget.name = "Value";
      if (this.properties.type === "number") {
        widget.type = "number";
        widget.value = Number(this.properties.value) || 0;
        widget.options = { min: -1000, max: 1000, step: 1 };
        widget.callback = (v) => {
          this.properties.value = v;
          this.onPropertyChanged();
        };
      } else if (this.properties.type === "boolean") {
        widget.type = "toggle";
        widget.value = this.properties.value === "true" || this.properties.value === true;
        widget.callback = (v) => {
          this.properties.value = v;
          this.onPropertyChanged();
        };
      } else if (this.properties.type === "string") {
        widget.type = "text";
        widget.value = this.properties.value.toString();
        widget.callback = (v) => {
          this.properties.value = v;
          this.onPropertyChanged();
        };
      }
    }

    onPropertyChanged() {
      // Mark graph as dirty but don't force execution
      if (this.graph) {
        this.graph._version++;
      }
      this.setDirtyCanvas(true);
    }

    onExecute() {
      let output = this.properties.value;
      if (this.properties.type === "number") {
        output = Number(this.properties.value) || 0;
      } else if (this.properties.type === "boolean") {
        output = this.properties.value === "true" || this.properties.value === true;
      }
      const prevOutputState = this.outputState;
      this.outputState = this.properties.type === "number" ? output !== 0 : output;
      if (this.properties.debug) {
        console.log(`ConstantNode - Output: ${output} (Type: ${this.properties.type})`);
      }
      this.setOutputData(0, output);
      // Only redraw if outputState changed and canvas isn't already marked dirty
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
        console.log(`ConstantNode - Output ${connected ? "connected" : "disconnected"} at slot ${index}, link: ${link_info?.id}`);
      }
      // No need to trigger onExecute or runStep; LiteGraph handles output propagation
    }

    serialize() {
      const data = super.serialize();
      data.properties = { ...this.properties };
      return data;
    }

    configure(data) {
      super.configure(data);
      this.properties = {
        value: data.properties?.value ?? 0,
        type: data.properties?.type ?? "number",
        debug: data.properties?.debug ?? false,
      };
      const typeWidget = this.widgets.find((w) => w.name === "Type");
      if (typeWidget) typeWidget.value = this.properties.type;
      this.updateValueWidget();
      const debugWidget = this.widgets.find((w) => w.name === "Debug Logs");
      if (debugWidget) debugWidget.value = this.properties.debug;
    }
  }
  LiteGraph.registerNodeType("Logic/ConstantNode", ConstantNode);
}