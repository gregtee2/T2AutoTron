if (!LiteGraph.registered_node_types?.["Generators/CyclingInteger"]) {
  class CyclingIntegerNode extends LiteGraph.LGraphNode {
    constructor() {
      super();
      this.title = "Cycling Integer";
      this.size = [200, 160]; // Adjusted size for sliders
      this.bgcolor = "rgb(38, 56, 90)"; // Match AndNode, ComparisonNode, TimeNode

      // Node properties
      this.properties = {
        min: 0, // Minimum value
        max: 10, // Maximum value
        speed: 1000, // Speed in ms
        order: "Sequential", // Order type
        debug: false, // Debug mode
      };

      // Internal state
      this.currentValue = this.properties.min;
      this.lastUpdate = null; // Track last update time for timing

      // Output
      this.addOutput("Value", "number");

      // Initialize widgets
      this.setupWidgets();
    }

    /**
     * Create the UI widgets (sliders and debug toggle).
     */
    setupWidgets() {
      this.widgets = []; // Clear existing widgets
      const widgetWidth = this.size[0] - 40; // Padding adjustment

      // Slider for Min
      this.addWidget("slider", "Min", this.properties.min, (value) => {
        this.properties.min = Math.round(value);
        if (this.properties.min > this.properties.max) {
          this.properties.min = this.properties.max;
        }
        this.resetCycle();
      }, { min: 0, max: 100, step: 1, precision: 0, width: widgetWidth });

      // Slider for Max
      this.addWidget("slider", "Max", this.properties.max, (value) => {
        this.properties.max = Math.round(value);
        if (this.properties.max < this.properties.min) {
          this.properties.max = this.properties.min;
        }
        this.resetCycle();
      }, { min: 0, max: 100, step: 1, precision: 0, width: widgetWidth });

      // Slider for Speed
      this.addWidget("slider", "Speed (ms)", this.properties.speed, (value) => {
        this.properties.speed = Math.round(value);
      }, { min: 100, max: 5000, step: 100, precision: 0, width: widgetWidth });

      // Combo box for Order
      this.addWidget("combo", "Order", this.properties.order, (value) => {
        this.properties.order = value;
        this.resetCycle();
      }, { values: ["Sequential", "Random"], width: widgetWidth });

      // Debug toggle
      this.addWidget("toggle", "Debug", this.properties.debug, (value) => {
        this.properties.debug = value;
        if (this.properties.debug) {
          console.log(`[CyclingIntegerNode] Debug mode enabled.`);
        } else {
          console.log(`[CyclingIntegerNode] Debug mode disabled.`);
        }
      }, { width: widgetWidth });
    }

    /**
     * Reset the cycle based on updated range or order
     */
    resetCycle() {
      if (this.properties.min > this.properties.max) {
        [this.properties.min, this.properties.max] = [this.properties.max, this.properties.min];
      }
      this.currentValue = this.properties.min;
      this.lastUpdate = null; // Reset timing
      this.triggerOutput();
    }

    /**
     * Trigger the current value as output
     */
    triggerOutput() {
      this.setOutputData(0, this.currentValue);
      this.setDirtyCanvas(true); // Ensure downstream nodes update
      if (this.properties.debug) {
        console.log(`[CyclingIntegerNode] Output: ${this.currentValue}`);
      }
    }

    /**
     * Utility to generate a random integer between min and max
     */
    getRandomInt(min, max) {
      return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    /**
     * Update value in onExecute
     */
    onExecute() {
      try {
        const now = Date.now();
        if (!this.lastUpdate || now - this.lastUpdate >= this.properties.speed) {
          if (this.properties.order === "Random") {
            this.currentValue = this.getRandomInt(this.properties.min, this.properties.max);
          } else {
            this.currentValue++;
            if (this.currentValue > this.properties.max) {
              this.currentValue = this.properties.min;
            }
          }
          this.lastUpdate = now;
          this.triggerOutput();
        }
      } catch (e) {
        if (this.properties.debug) {
          console.error("[CyclingIntegerNode] onExecute error:", e);
        }
      }
    }

    /**
     * Cleanup when the node is removed
     */
    onRemoved() {
      this.lastUpdate = null;
    }

    /**
     * Serialize the node's state
     */
    serialize() {
      try {
        const data = super.serialize();
        data.properties = { ...this.properties };
        return data;
      } catch (e) {
        if (this.properties.debug) {
          console.error("[CyclingIntegerNode] serialize error:", e);
        }
      }
    }

    /**
     * Restore the node's state
     */
    configure(data) {
      try {
        super.configure(data);
        if (data.properties) {
          Object.assign(this.properties, data.properties);
          this.setupWidgets();
          this.resetCycle();
        }
      } catch (e) {
        if (this.properties.debug) {
          console.error("[CyclingIntegerNode] configure error:", e);
        }
      }
    }

    /**
     * Draw border based on output state
     */
    onDrawBackground(ctx) {
      try {
        if (super.onDrawBackground) super.onDrawBackground(ctx);
        ctx.strokeStyle = this.currentValue !== null ? "#00FF00" : "#FF0000"; // Green for valid, red for no output
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, this.size[0], this.size[1]);
      } catch (e) {
        if (this.properties.debug) {
          console.error("[CyclingIntegerNode] onDrawBackground error:", e);
        }
      }
    }
  }

  try {
    LiteGraph.registerNodeType("Generators/CyclingInteger", CyclingIntegerNode);
    console.log("CyclingIntegerNode - Registered successfully under 'Generators' category.");
  } catch (e) {
    console.error("Error registering CyclingIntegerNode:", e);
  }
}