if (!LiteGraph.registered_node_types?.["Logic/HS_TimeNode"]) {
  class TimeNode extends LiteGraph.LGraphNode {
    constructor() {
      super();
      this.title = "Time";
      this.bgcolor = "rgb(38, 56, 90)"; // Same as AndNode and ComparisonNode
      this.properties = {
        format: "HH:mm", // Default format (24-hour, e.g., "21:35")
        debug: false,
      };
      this.outputState = false; // True when outputting valid time, false on error
      this.timeValue = ""; // Current time output

      // Output
      this.addOutput("Time", "string");

      // Widgets
      this.addWidget(
        "combo",
        "Format",
        this.properties.format,
        (v) => {
          this.properties.format = v;
          this.onExecute(); // Re-evaluate
        },
        {
          values: ["HH:mm", "h:mm a", "HH:mm:ss", "ISO"],
          width: 100,
        }
      );
      this.addWidget("toggle", "Debug Logs", this.properties.debug, (v) => {
        this.properties.debug = v;
      }, { width: 100 });
    }

    // Format the current time based on the selected format (using local time)
    formatTime(date) {
      try {
        const pad = (num) => String(num).padStart(2, "0"); // Ensure two digits
        switch (this.properties.format) {
          case "HH:mm":
            return `${pad(date.getHours())}:${pad(date.getMinutes())}`; // e.g., "21:35"
          case "h:mm a":
            return date.toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            }); // e.g., "9:35 PM"
          case "HH:mm:ss":
            return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`; // e.g., "21:35:00"
          case "ISO":
            // Local time in ISO-like format (not UTC)
            return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${String(date.getMilliseconds()).padStart(3, "0")}Z`; // e.g., "2025-05-29T21:35:00.000Z"
          default:
            return `${pad(date.getHours())}:${pad(date.getMinutes())}`; // Fallback to HH:mm
        }
      } catch (e) {
        if (this.properties.debug) {
          console.error("TimeNode formatTime error:", e);
        }
        return "";
      }
    }

    onExecute() {
      try {
        const now = new Date(); // Current local time (e.g., 9:35 PM PDT)
        this.timeValue = this.formatTime(now);
        this.outputState = this.timeValue !== ""; // Valid output

        // Set output
        this.setOutputData(0, this.timeValue);

        // Debug logging
        if (this.properties.debug) {
          console.log(`TimeNode - Format: ${this.properties.format}, Output: ${this.timeValue}`);
        }

        // Redraw for updated time display
        this.setDirtyCanvas(true);
      } catch (e) {
        this.outputState = false;
        this.setOutputData(0, "");
        if (this.properties.debug) {
          console.error("TimeNode onExecute error:", e);
        }
        this.setDirtyCanvas(true);
      }
    }

    onDrawBackground(ctx) {
      try {
        if (super.onDrawBackground) super.onDrawBackground(ctx);
        ctx.strokeStyle = this.outputState ? "#00FF00" : "#FF0000"; // Green for valid, red for error
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, this.size[0], this.size[1]);
      } catch (e) {
        if (this.properties.debug) {
          console.error("TimeNode onDrawBackground error:", e);
        }
      }
    }

    onDrawForeground(ctx) {
      try {
        if (super.onDrawForeground) super.onDrawForeground(ctx);
        // Draw text overlay for time and format
        ctx.font = "12px Arial";
        ctx.fillStyle = "#FFFFFF"; // White text for visibility
        ctx.textAlign = "center";
        const text = `${this.timeValue || "N/A"} (${this.properties.format})`;
        const x = this.size[0] / 2; // Center horizontally
        const y = this.size[1] - 20; // Position near bottom, above output slot
        ctx.fillText(text, x, y);
      } catch (e) {
        if (this.properties.debug) {
          console.error("TimeNode onDrawForeground error:", e);
        }
      }
    }

    onConnectionsChange(type, index, connected, link_info) {
      try {
        if (type === LiteGraph.OUTPUT && this.properties.debug) {
          console.log(
            `TimeNode - Output ${connected ? "connected" : "disconnected"} at slot ${index}, link: ${link_info?.id}`
          );
        }
      } catch (e) {
        if (this.properties.debug) {
          console.error("TimeNode onConnectionsChange error:", e);
        }
      }
    }

    serialize() {
      try {
        const data = super.serialize();
        data.properties = { ...this.properties };
        return data;
      } catch (e) {
        if (this.properties.debug) {
          console.error("TimeNode serialize error:", e);
        }
      }
    }

    configure(data) {
      try {
        super.configure(data);
        this.properties = {
          format: data.properties?.format ?? "HH:mm",
          debug: data.properties?.debug ?? false,
        };
        // Update widget values
        const formatWidget = this.widgets.find((w) => w.name === "Format");
        if (formatWidget) formatWidget.value = this.properties.format;
        const debugWidget = this.widgets.find((w) => w.name === "Debug Logs");
        if (debugWidget) debugWidget.value = this.properties.debug;
      } catch (e) {
        if (this.properties.debug) {
          console.error("TimeNode configure error:", e);
        }
      }
    }
  }

  try {
    LiteGraph.registerNodeType("Logic/HS_TimeNode", TimeNode);
    console.log("TimeNode registered successfully");
  } catch (e) {
    console.error("Error registering TimeNode:", e);
  }
}