if (!LiteGraph.registered_node_types?.["Math/TimeMathNode"]) {
  class TimeMathNode extends LiteGraph.LGraphNode {
    constructor() {
      super();
      try {
        this.title = "Time Math";
        this.bgcolor = "rgb(38, 56, 90)";
        this.size = [180, 0];

        this.properties = {
          operation: "Add",
          outputUnit: "Hours",
          debug: false,
        };

        this.resultState = false;
        this.inputTimes = [null, null];
        this.outputValue = 0;

        this.addInput("Time 1", "string");
        this.addInput("Time 2", "string");
        this.addOutput("Result", "number");

        this.widgets = [];
        this.addWidget("combo", "Operation", this.properties.operation, (value) => {
          this.properties.operation = value;
          if (this.properties.debug) console.log(`[TimeMathNode] Operation set to ${value}`);
          this.setDirtyCanvas(true);
        }, { values: ["Add", "Subtract"] });
        this.addWidget("combo", "Output Unit", this.properties.outputUnit, (value) => {
          this.properties.outputUnit = value;
          if (this.properties.debug) console.log(`[TimeMathNode] Output Unit set to ${value}`);
          this.setDirtyCanvas(true);
        }, { values: ["Hours", "Minutes", "Seconds"] });
        this.addWidget("toggle", "Debug", this.properties.debug, (value) => {
          this.properties.debug = value;
          console.log(`[TimeMathNode] Debug mode ${value ? "enabled" : "disabled"}`);
          this.setDirtyCanvas(true);
        }, { width: 100 });
      } catch (e) {
        console.error("[TimeMathNode] Constructor error:", e);
      }
    }

    parseTime(timeInput, isTime2 = false, time1Ms = null) {
      try {
        const now = new Date();
        const today = now.toISOString().split('T')[0];

        let hours, minutes, period;

        // Handle string input
        if (typeof timeInput === "string") {
          // 12-hour format: "HH:MM AM/PM" or "H:MM AM/PM"
          let match = timeInput.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
          if (match) {
            hours = parseInt(match[1], 10);
            minutes = parseInt(match[2], 10);
            period = match[3].toUpperCase();
          } else {
            // 24-hour format: "HH:MM"
            match = timeInput.match(/^(\d{1,2}):(\d{2})$/);
            if (match) {
              hours = parseInt(match[1], 10);
              minutes = parseInt(match[2], 10);
              period = null;
            } else {
              if (this.properties.debug) console.log(`[TimeMathNode] Invalid time string format: ${timeInput}`);
              return null;
            }
          }
        } else if (typeof timeInput === "number") {
          // Assume milliseconds since midnight
          const date = new Date(today);
          date.setHours(0, 0, 0, 0);
          date.setMilliseconds(timeInput);
          hours = date.getHours();
          minutes = date.getMinutes();
          period = hours >= 12 ? "PM" : "AM";
          if (hours > 12) hours -= 12;
          if (hours === 0) hours = 12;
        } else {
          if (this.properties.debug) console.log(`[TimeMathNode] Unsupported input type: ${typeof timeInput}, value: ${JSON.stringify(timeInput)}`);
          return null;
        }

        if (isNaN(hours) || isNaN(minutes) || minutes < 0 || minutes > 59) {
          if (this.properties.debug) console.log(`[TimeMathNode] Invalid time values: ${hours}:${minutes} ${period || ""}`);
          return null;
        }

        if (period) {
          if (hours < 1 || hours > 12) {
            if (this.properties.debug) console.log(`[TimeMathNode] Invalid hours for 12-hour format: ${hours}`);
            return null;
          }
          if (period === "PM" && hours < 12) hours += 12;
          if (period === "AM" && hours === 12) hours = 0;
        } else if (hours > 23) {
          if (this.properties.debug) console.log(`[TimeMathNode] Invalid hours for 24-hour format: ${hours}`);
          return null;
        }

        let timeDate = new Date(`${today}T${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`);
        if (isNaN(timeDate.getTime())) {
          if (this.properties.debug) console.log(`[TimeMathNode] Invalid timeDate: ${hours}:${minutes} ${period || ""}`);
          return null;
        }

        // Adjust Time 2 for subtraction across midnight
        if (isTime2 && time1Ms && this.properties.operation === "Subtract") {
          const timeMs = timeDate.getTime();
          if (timeMs <= time1Ms) {
            timeDate.setDate(timeDate.getDate() + 1);
            if (this.properties.debug) console.log(`[TimeMathNode] Adjusted Time 2 to next day: ${timeDate}`);
          }
        }

        if (this.properties.debug) console.log(`[TimeMathNode] Parsed ${JSON.stringify(timeInput)} as ${timeDate}`);
        return timeDate.getTime();
      } catch (e) {
        if (this.properties.debug) console.error(`[TimeMathNode] parseTime error: ${e.message}`);
        return null;
      }
    }

    onExecute() {
      try {
        const time1 = this.getInputData(0);
        const time2 = this.getInputData(1);
        this.inputTimes = [time1, time2];

        if (this.properties.debug) {
          console.log(`[TimeMathNode] Inputs: Time1=${JSON.stringify(time1)}, Time2=${JSON.stringify(time2)}`);
        }

        const time1Ms = this.parseTime(time1);
        const time2Ms = this.parseTime(time2, true, time1Ms);

        if (time1Ms === null || time2Ms === null) {
          this.outputValue = { duration: 0, startMs: null, endMs: null, position: 0 };
          this.resultState = false;
          this.setOutputData(0, this.outputValue);
          this.setDirtyCanvas(true);
          if (this.properties.debug) {
            console.log(`[TimeMathNode] Invalid input: Time1=${JSON.stringify(time1)}, Time2=${JSON.stringify(time2)}`);
          }
          return;
        }

        let resultMs;
        if (this.properties.operation === "Add") {
          const time2Date = new Date(time2Ms);
          const durationMs = time2Ms - new Date(time2Date).setHours(0, 0, 0, 0);
          resultMs = time1Ms + durationMs;
        } else {
          resultMs = time2Ms - time1Ms;
          if (resultMs < 0) {
            resultMs += 24 * 60 * 60 * 1000;
            if (this.properties.debug) console.log(`[TimeMathNode] Added 24 hours to negative result: ${resultMs}`);
          }
        }

        let duration;
        switch (this.properties.outputUnit) {
          case "Hours":
            duration = resultMs / (1000 * 60 * 60);
            break;
          case "Minutes":
            duration = resultMs / (1000 * 60);
            break;
          case "Seconds":
            duration = resultMs / 1000;
            break;
          default:
            duration = 0;
        }

        // Calculate current position based on system time
        const now = new Date().getTime();
        let position = 0;
        if (now >= time1Ms && now <= time2Ms) {
          position = (now - time1Ms) / (time2Ms - time1Ms);
        } else if (now > time2Ms) {
          position = 1;
        }

        this.outputValue = {
          duration,
          startMs: time1Ms,
          endMs: time2Ms,
          position,
          unit: this.properties.outputUnit.toLowerCase()
        };
        this.resultState = !isNaN(duration);

        if (this.properties.debug) {
          console.log(`[TimeMathNode] Output: ${JSON.stringify(this.outputValue)}`);
        }

        this.setOutputData(0, this.outputValue);
        this.setDirtyCanvas(true);

        // Trigger upstream for legacy nodes
        for (let i = 0; i < this.inputs.length; i++) {
          const inputLink = this.inputs[i]?.link;
          if (inputLink && this.graph) {
            const originNode = this.graph.getNodeById(inputLink.origin_id);
            if (originNode && originNode.onExecute) {
              originNode.onExecute();
              if (this.properties.debug) console.log(`[TimeMathNode] Triggered upstream node ${originNode.title || originNode.id}`);
            }
          }
        }
      } catch (e) {
        if (this.properties.debug) console.error("[TimeMathNode] onExecute error:", e);
        this.outputValue = { duration: 0, startMs: null, endMs: null, position: 0 };
        this.resultState = false;
        this.setOutputData(0, this.outputValue);
        this.setDirtyCanvas(true);
      }
    }

    onDrawBackground(ctx) {
      try {
        if (super.onDrawBackground) super.onDrawBackground(ctx);
        ctx.strokeStyle = this.resultState ? "#00FF00" : "#FF0000";
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, this.size[0], this.size[1]);
      } catch (e) {
        if (this.properties.debug) console.error("[TimeMathNode] onDrawBackground error:", e);
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
        if (this.inputs[1]) this.inputs[1].pos = [10, slotY + slotHeight];
        if (this.outputs[0]) this.outputs[0].pos = [this.size[0] - 10, slotY];

        const overlayStartY = inputStartY + slotHeight * 2 + widgetsHeight;
        ctx.fillText(`Time 1: ${this.inputTimes[0] || "null"}`, this.size[0] / 2, overlayStartY);
        ctx.fillText(`Time 2: ${this.inputTimes[1] || "null"}`, this.size[0] / 2, overlayStartY + textHeight);
        ctx.fillText(`Operation: ${this.properties.operation}`, this.size[0] / 2, overlayStartY + textHeight * 2);
        ctx.fillText(`Unit: ${this.properties.outputUnit}`, this.size[0] / 2, overlayStartY + textHeight * 3);
        ctx.fillText(`Output: ${isNaN(this.outputValue) ? "null" : this.outputValue.toFixed(2)}`, this.size[0] / 2, overlayStartY + textHeight * 4);

        const minHeight = overlayStartY + textHeight * 5 + paddingBottom + 10;
        if (this.size[1] < minHeight) this.size[1] = minHeight;
        if (this.size[0] < 180) this.size[0] = 180;
      } catch (e) {
        if (this.properties.debug) console.error("[TimeMathNode] onDrawForeground error:", e);
      }
    }

    serialize() {
      try {
        const data = super.serialize();
        data.properties = { ...this.properties };
        return data;
      } catch (e) {
        if (this.properties.debug) console.error("[TimeMathNode] serialize error:", e);
        return super.serialize();
      }
    }

    configure(data) {
      try {
        super.configure(data);
        if (data.properties) {
          this.properties = {
            operation: data.properties.operation || "Add",
            outputUnit: data.properties.outputUnit || "Hours",
            debug: data.properties.debug || false,
          };
        }
        if (this.widgets) {
          const operationWidget = this.widgets.find(w => w.name === "Operation");
          if (operationWidget) operationWidget.value = this.properties.operation;
          const unitWidget = this.widgets.find(w => w.name === "Output Unit");
          if (unitWidget) unitWidget.value = this.properties.outputUnit;
          const debugWidget = this.widgets.find(w => w.name === "Debug");
          if (debugWidget) debugWidget.value = this.properties.debug;
        }
        this.setDirtyCanvas(true);
      } catch (e) {
        console.error("[TimeMathNode] configure error:", e);
      }
    }
  }

  try {
    LiteGraph.registerNodeType("Math/TimeMathNode", TimeMathNode);
    console.log("TimeMathNode registered successfully");
  } catch (e) {
    console.error("Error registering TimeMathNode:", e);
  }
}