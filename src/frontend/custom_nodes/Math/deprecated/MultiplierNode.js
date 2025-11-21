if (!LiteGraph.registered_node_types?.["Math/MultiplierNode"]) {
  class MultiplierNode extends LiteGraph.LGraphNode {
    constructor() {
      super();
      try {
        this.title = "Multiplier";
        this.bgcolor = "rgb(38, 56, 90)";
        this.size = [180, 0];

        this.properties = {
          multiplier: 1,
          debug: false,
        };

        this.resultState = false; // True for valid output
        this.inputValues = [];
        this.outputValue = 0;

        this.addInput("Value", "number");
        this.addOutput("Result", "number");

        this.widgets = [];
        this.addWidget("text", "Multiplier", this.properties.multiplier, (value) => {
          this.properties.multiplier = parseFloat(value) || 1;
          if (this.properties.debug) console.log(`[MultiplierNode] Multiplier set to ${value}`);
        }, { width: 100 });
        this.addWidget("toggle", "Debug", this.properties.debug, (value) => {
          this.properties.debug = value;
          console.log(`[MultiplierNode] Debug mode ${value ? "enabled" : "disabled"}`);
        }, { width: 100 });
      } catch (e) {
        console.error("[MultiplierNode] Constructor error:", e);
      }
    }

    onExecute() {
      try {
        const inputValue = this.getInputData(0);
        this.inputValues = [inputValue !== undefined ? inputValue : 0];
        const multiplier = Number(this.properties.multiplier) || 1;

        this.outputValue = this.inputValues[0] * multiplier;
        this.resultState = !isNaN(this.outputValue);

        if (this.properties.debug) {
          console.log(`[MultiplierNode] Input: ${this.inputValues[0]}, Multiplier: ${multiplier}, Output: ${this.outputValue}`);
        }

        this.setOutputData(0, this.outputValue);
        this.setDirtyCanvas(true);

        // Trigger upstream for legacy nodes
        const inputLink = this.inputs[0]?.link;
        if (inputLink && this.graph) {
          const originNode = this.graph.getNodeById(inputLink.origin_id);
          if (originNode && originNode.onExecute) {
            originNode.onExecute();
            if (this.properties.debug) console.log(`[MultiplierNode] Triggered upstream node ${originNode.title || originNode.id}`);
          }
        }
      } catch (e) {
        if (this.properties.debug) console.error("[MultiplierNode] onExecute error:", e);
      }
    }

    onDrawBackground(ctx) {
      try {
        if (super.onDrawBackground) super.onDrawBackground(ctx);
        ctx.strokeStyle = this.resultState ? "#00FF00" : "#FF0000";
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, this.size[0], this.size[1]);
      } catch (e) {
        if (this.properties.debug) console.error("[MultiplierNode] onDrawBackground error:", e);
      }
    }

    onDrawForeground(ctx) {
      try {
        if (super.onDrawForeground) super.onDrawForeground(ctx);
        if (!ctx || !this.size) return;

        ctx.fillStyle = "#FFF";
        ctx.font = "12px Arial";
        ctx.textAlign = "center";

        const paddingTop = 20;
        const paddingBottom = 10;
        const titleHeight = 40;
        const slotHeight = 20;
        const textHeight = 20;

        let widgetsHeight = this.widgets?.reduce(
          (sum, w) => sum + (w.computeSize?.(this.size[0])[1] ?? LiteGraph.NODE_WIDGET_HEIGHT),
          0
        ) || 0;
        widgetsHeight += 15;

        const inputStartY = titleHeight - 5;
        const slotY = inputStartY;

        if (this.inputs[0]) this.inputs[0].pos = [10, slotY];
        if (this.outputs[0]) this.outputs[0].pos = [this.size[0] - 10, slotY];

        const overlayStartY = inputStartY + slotHeight + widgetsHeight;
        ctx.fillText(`Input: ${this.inputValues[0] !== undefined ? this.inputValues[0] : "null"}`, this.size[0] / 2, overlayStartY);
        ctx.fillText(`Multiplier: ${this.properties.multiplier}`, this.size[0] / 2, overlayStartY + textHeight);
        ctx.fillText(`Output: ${isNaN(this.outputValue) ? "null" : this.outputValue}`, this.size[0] / 2, overlayStartY + textHeight * 2);

        const minHeight = overlayStartY + textHeight * 3 + paddingBottom + 10;
        if (this.size[1] < minHeight) this.size[1] = minHeight;
        if (this.size[0] < 180) this.size[0] = 180;
      } catch (e) {
        if (this.properties.debug) console.error("[MultiplierNode] onDrawForeground error:", e);
      }
    }

    serialize() {
      try {
        const data = super.serialize();
        data.properties = { ...this.properties };
        return data;
      } catch (e) {
        if (this.properties.debug) console.error("[MultiplierNode] serialize error:", e);
        return super.serialize();
      }
    }

    configure(data) {
      try {
        super.configure(data);
        if (data.properties) {
          this.properties = {
            multiplier: data.properties.multiplier || 1,
            debug: data.properties.debug || false,
          };
        }
        if (this.widgets) {
          const multiplierWidget = this.widgets.find(w => w.name === "Multiplier");
          if (multiplierWidget) multiplierWidget.value = this.properties.multiplier;
          const debugWidget = this.widgets.find(w => w.name === "Debug");
          if (debugWidget) debugWidget.value = this.properties.debug;
        }
        this.setDirtyCanvas(true);
      } catch (e) {
        console.error("[MultiplierNode] configure error:", e);
      }
    }
  }

  try {
    LiteGraph.registerNodeType("Math/MultiplierNode", MultiplierNode);
    console.log("MultiplierNode registered successfully");
  } catch (e) {
    console.error("Error registering MultiplierNode:", e);
  }
}