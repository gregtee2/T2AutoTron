if (!LiteGraph.registered_node_types?.["Logic/HS_ComparisonNode"]) {
  class ComparisonNode extends LiteGraph.LGraphNode {
    constructor() {
      super();
      this.title = "Comparison";
      this.bgcolor = "rgb(38, 56, 90)"; // Same as AndNode and TimeNode
      this.properties = {
        comparisonValue: "", // User-defined value to compare against
        latch: false, // Latch mode enabled/disabled
        autoResetMidnight: false, // Auto-reset at midnight
        autoResetDuration: false, // Auto-reset after duration
        durationMinutes: 5, // Duration in minutes for auto-reset
        debug: false,
      };
      this.outputState = false;
      this.latched = false; // Tracks latched true state
      this.latchTimestamp = null; // Time when latch was set
      this.lastDate = null; // Track last date to detect midnight

      // Inputs
      this.addInput("Input", "*"); // Dynamic type input
      this.addInput("Reset", "boolean"); // Optional reset input
      this.addOutput("Output", "boolean");

      // Widgets
      this.addWidget("text", "Compare Value", this.properties.comparisonValue, (v) => {
        this.properties.comparisonValue = v;
        this.onExecute(); // Re-evaluate
      }, { width: 100 });
      this.addWidget("toggle", "Latch Mode", this.properties.latch, (v) => {
        this.properties.latch = v;
        this.onExecute(); // Re-evaluate
      }, { width: 100 });
      this.addWidget("toggle", "Reset at Midnight", this.properties.autoResetMidnight, (v) => {
        this.properties.autoResetMidnight = v;
      }, { width: 100 });
      this.addWidget("toggle", "Reset After Duration", this.properties.autoResetDuration, (v) => {
        this.properties.autoResetDuration = v;
      }, { width: 100 });
      this.addWidget("text", "Duration (min)", this.properties.durationMinutes, (v) => {
        this.properties.durationMinutes = parseFloat(v) || 5; // Default to 5 if invalid
        this.onExecute(); // Re-evaluate
      }, { width: 100 });
      this.addWidget("button", "Reset Latch", "Reset", () => {
        this.latched = false;
        this.outputState = false;
        this.latchTimestamp = null;
        this.setOutputData(0, false);
        this.setDirtyCanvas(true);
        if (this.properties.debug) console.log("ComparisonNode - Latch reset via button");
      }, { width: 100 });
      this.addWidget("toggle", "Debug Logs", this.properties.debug, (v) => {
        this.properties.debug = v;
      }, { width: 100 });
    }

    // Helper method for time comparison
    normalizeTime(value) {
      try {
        if (typeof value === "string") {
          const date = new Date(`1970-01-01 ${value}`);
          if (!isNaN(date.getTime())) {
            return date.toISOString().split("T")[1].slice(0, 5); // Normalize to HH:mm
          }
          const isoDate = new Date(value);
          if (!isNaN(isoDate.getTime())) {
            return isoDate.toISOString().split("T")[1].slice(0, 5); // Normalize to HH:mm
          }
        }
        return String(value); // Fallback to string
      } catch (e) {
        return String(value);
      }
    }

    // Check if current time is midnight (00:00 PDT)
    isMidnight(date) {
      return date.getHours() === 0 && date.getMinutes() === 0;
    }

    onExecute() {
      try {
        const now = new Date(); // Current local time (PDT, e.g., 9:44 PM)

        // Check for reset input
        const resetInput = this.getInputData(1);
        if (resetInput === true) {
          this.latched = false;
          this.outputState = false;
          this.latchTimestamp = null;
          this.setOutputData(0, false);
          if (this.properties.debug) console.log("ComparisonNode - Latch reset via input");
          this.setDirtyCanvas(true);
          return;
        }

        // Check for auto-reset at midnight
        if (this.properties.autoResetMidnight && this.latched) {
          if (this.isMidnight(now) && (!this.lastDate || !this.isMidnight(this.lastDate))) {
            this.latched = false;
            this.outputState = false;
            this.latchTimestamp = null;
            this.setOutputData(0, false);
            if (this.properties.debug) console.log("ComparisonNode - Latch auto-reset at midnight");
            this.setDirtyCanvas(true);
            return;
          }
        }

        // Check for auto-reset after duration
        if (this.properties.autoResetDuration && this.latched && this.latchTimestamp) {
          const durationMs = this.properties.durationMinutes * 60 * 1000; // Convert minutes to ms
          if (now.getTime() - this.latchTimestamp >= durationMs) {
            this.latched = false;
            this.outputState = false;
            this.latchTimestamp = null;
            this.setOutputData(0, false);
            if (this.properties.debug)
              console.log(`ComparisonNode - Latch auto-reset after ${this.properties.durationMinutes} minutes`);
            this.setDirtyCanvas(true);
            return;
          }
        }

        // Get input value
        const inputValue = this.getInputData(0);
        const compareValue = this.properties.comparisonValue;

        // Perform comparison
        let match = false;
        if (inputValue === undefined || inputValue === null) {
          match = false;
        } else {
          const inputTime = this.normalizeTime(inputValue);
          const compareTime = this.normalizeTime(compareValue);
          if (inputTime !== String(inputValue) || compareTime !== String(compareValue)) {
            match = inputTime === compareTime;
          } else {
            const inputNum = Number(inputValue);
            const compareNum = Number(compareValue);
            if (!isNaN(inputNum) && !isNaN(compareNum)) {
              match = inputNum === compareNum;
            } else {
              match = String(inputValue) === String(compareValue);
            }
          }
        }

        // Update latched state
        const prevOutputState = this.outputState;
        if (this.properties.latch) {
          if (match && !this.latched) {
            this.latched = true;
            this.latchTimestamp = now.getTime(); // Record when latch was set
          }
          this.outputState = this.latched; // Output remains true if latched
        } else {
          this.outputState = match; // Direct comparison result
          this.latchTimestamp = null;
        }

        // Set output
        this.setOutputData(0, this.outputState);

        // Debug logging
        if (this.properties.debug) {
          console.log(
            `ComparisonNode - Input: ${inputValue}, Compare: ${compareValue}, Match: ${match}, Latched: ${this.latched}, Output: ${this.outputState}, LatchTime: ${this.latchTimestamp}`
          );
        }

        // Update last date for midnight detection
        this.lastDate = now;

        // Redraw if state changes
        if (prevOutputState !== this.outputState) {
          this.setDirtyCanvas(true);
        }
      } catch (e) {
        if (this.properties.debug) {
          console.error("ComparisonNode onExecute error:", e);
        }
      }
    }

    onDrawBackground(ctx) {
      try {
        if (super.onDrawBackground) super.onDrawBackground(ctx);
        ctx.strokeStyle = this.outputState ? "#00FF00" : "#FF0000"; // Green for true, red for false
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, this.size[0], this.size[1]);
      } catch (e) {
        if (this.properties.debug) {
          console.error("ComparisonNode onDrawBackground error:", e);
        }
      }
    }

    onConnectionsChange(type, index, connected, link_info) {
      try {
        if (type === LiteGraph.OUTPUT && this.properties.debug) {
          console.log(
            `ComparisonNode - Output ${connected ? "connected" : "disconnected"} at slot ${index}, link: ${link_info?.id}`
          );
        }
      } catch (e) {
        if (this.properties.debug) {
          console.error("ComparisonNode onConnectionsChange error:", e);
        }
      }
    }

    serialize() {
      try {
        const data = super.serialize();
        data.properties = { ...this.properties };
        data.latched = this.latched;
        data.latchTimestamp = this.latchTimestamp;
        return data;
      } catch (e) {
        if (this.properties.debug) {
          console.error("ComparisonNode serialize error:", e);
        }
      }
    }

    configure(data) {
      try {
        super.configure(data);
        this.properties = {
          comparisonValue: data.properties?.comparisonValue ?? "",
          latch: data.properties?.latch ?? false,
          autoResetMidnight: data.properties?.autoResetMidnight ?? false,
          autoResetDuration: data.properties?.autoResetDuration ?? false,
          durationMinutes: data.properties?.durationMinutes ?? 5,
          debug: data.properties?.debug ?? false,
        };
        this.latched = data.latched ?? false;
        this.latchTimestamp = data.latchTimestamp ?? null;
        // Update widget values
        const valueWidget = this.widgets.find((w) => w.name === "Compare Value");
        if (valueWidget) valueWidget.value = this.properties.comparisonValue;
        const latchWidget = this.widgets.find((w) => w.name === "Latch Mode");
        if (latchWidget) latchWidget.value = this.properties.latch;
        const midnightWidget = this.widgets.find((w) => w.name === "Reset at Midnight");
        if (midnightWidget) midnightWidget.value = this.properties.autoResetMidnight;
        const durationWidget = this.widgets.find((w) => w.name === "Reset After Duration");
        if (durationWidget) durationWidget.value = this.properties.autoResetDuration;
        const durationMinWidget = this.widgets.find((w) => w.name === "Duration (min)");
        if (durationMinWidget) durationMinWidget.value = this.properties.durationMinutes;
        const debugWidget = this.widgets.find((w) => w.name === "Debug Logs");
        if (debugWidget) debugWidget.value = this.properties.debug;
      } catch (e) {
        if (this.properties.debug) {
          console.error("ComparisonNode configure error:", e);
        }
      }
    }
  }

  try {
    LiteGraph.registerNodeType("Logic/HS_ComparisonNode", ComparisonNode);
    console.log("ComparisonNode registered successfully");
  } catch (e) {
    console.error("Error registering ComparisonNode:", e);
  }
}