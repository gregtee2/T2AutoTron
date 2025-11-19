if (!LiteGraph.registered_node_types?.["HomeAssistant/LogicCompareNode"]) {
  class LogicCompareNode extends LiteGraph.LGraphNode {
    constructor() {
      super();
      try {
        this.title = "Logic Compare";
        this.bgcolor = "rgb(38, 56, 90)";
        this.size = [180, 0];

        this.properties = {
          operator: ">",
          debug: false,
          timeMode: "auto",
          compareValue: "0",
          latch: false,
          autoResetMidnight: false,
          autoResetDuration: false,
          durationMinutes: 5,
        };

        this.resultState = false;
        this.inputValue = null;
        this.endTimeValue = null;
        this.isTimeInput = false;
        this.timeInterpretation = null;
        this.latched = false;
        this.latchTimestamp = null;
        this.lastDate = null;
        this.isGraphLoaded = false; // Flag to defer execution

        // Inputs and Output
        this.addInput("Value", "*");
        this.addInput("End Time", "*");
        this.addInput("Reset", "boolean");
        this.addOutput("Result", "boolean");

        // Widgets
        this.widgets = [];
        this.addWidget("combo", "Operator", this.properties.operator, (value) => {
          this.properties.operator = value;
          if (this.properties.debug) console.log(`[LogicCompareNode] Operator set to ${value}`);
        }, { values: [">", "<", "=", ">=", "<=", "!=", "within"] });
        this.addWidget("text", "Compare Value", this.properties.compareValue, (value) => {
          this.properties.compareValue = value;
          if (this.properties.debug) console.log(`[LogicCompareNode] Compare Value set to ${value}`);
        });
        this.addWidget("combo", "Time Mode", this.properties.timeMode, (value) => {
          this.properties.timeMode = value;
          if (this.properties.debug) console.log(`[LogicCompareNode] Time Mode set to ${value}`);
        }, { values: ["auto", "today"] });
        this.addWidget("toggle", "Latch Mode", this.properties.latch, (value) => {
          this.properties.latch = value;
          if (this.properties.debug) console.log(`[LogicCompareNode] Latch Mode ${value ? "enabled" : "disabled"}`);
        }, { width: 100 });
        this.addWidget("toggle", "Reset at Midnight", this.properties.autoResetMidnight, (value) => {
          this.properties.autoResetMidnight = value;
          if (this.properties.debug) console.log(`[LogicCompareNode] Reset at Midnight ${value ? "enabled" : "disabled"}`);
        }, { width: 100 });
        this.addWidget("toggle", "Reset After Duration", this.properties.autoResetDuration, (value) => {
          this.properties.autoResetDuration = value;
          if (this.properties.debug) console.log(`[LogicCompareNode] Reset After Duration ${value ? "enabled" : "disabled"}`);
        }, { width: 100 });
        this.addWidget("text", "Duration (min)", this.properties.durationMinutes, (value) => {
          this.properties.durationMinutes = parseFloat(value) || 5;
          if (this.properties.debug) console.log(`[LogicCompareNode] Duration set to ${this.properties.durationMinutes} minutes`);
        }, { width: 100 });
        this.addWidget("button", "Reset Latch", "Reset", () => {
          this.latched = false;
          this.resultState = false;
          this.latchTimestamp = null;
          this.setOutputData(0, false);
          this.setDirtyCanvas(true);
          if (this.properties.debug) console.log("[LogicCompareNode] Latch reset via button");
        }, { width: 100 });
        this.addWidget("toggle", "Debug", this.properties.debug, (value) => {
          this.properties.debug = value;
          console.log(`[LogicCompareNode] Debug mode ${value ? "enabled" : "disabled"}`);
        });
      } catch (e) {
        console.error("[LogicCompareNode] Constructor error:", e);
      }
    }

    parseTimeString(timeStr) {
      try {
        const now = new Date();
        let today = now.toISOString().split('T')[0];

        const cleanedTimeStr = timeStr.replace(/\s+/g, '').toUpperCase();
        const timeMatch = cleanedTimeStr.match(/^(\d{1,2}):(\d{2})(AM|PM)?$/);
        if (!timeMatch) {
          if (this.properties.debug) console.log(`[LogicCompareNode] Invalid time format: ${timeStr}`);
          return null;
        }

        let hours = parseInt(timeMatch[1], 10);
        const minutes = parseInt(timeMatch[2], 10);
        const isPM = timeMatch[3] === "PM";

        if (timeMatch[3]) {
          if (isPM && hours < 12) hours += 12;
          if (!isPM && hours === 12) hours = 0;
        }

        let timeDate = new Date(`${today}T${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`);
        if (isNaN(timeDate.getTime())) {
          if (this.properties.debug) console.log(`[LogicCompareNode] Failed to parse time: ${timeStr}`);
          return null;
        }

        this.timeInterpretation = "today";
        if (this.properties.timeMode === "auto" && timeDate < now) {
          timeDate.setDate(timeDate.getDate() + 1);
          this.timeInterpretation = "tomorrow";
        }

        if (this.properties.debug) {
          console.log(`[LogicCompareNode] Parsed time: ${timeStr} as ${timeDate.toISOString()}`);
        }
        return timeDate;
      } catch (e) {
        if (this.properties.debug) console.error("[LogicCompareNode] parseTimeString error:", e);
        return null;
      }
    }

    compareTimes(currentTime, inputTime, operator, endTime = null, compareTime = null) {
      try {
        const now = new Date(currentTime);
        const midnightToday = new Date(now.toISOString().split('T')[0] + 'T00:00:00');
        const inputMs = inputTime.getTime();
        const currentMs = currentTime.getTime();
        const midnightMs = midnightToday.getTime();

        let adjustedInputMs = inputMs;
        if (inputTime.getDate() !== now.getDate()) {
          adjustedInputMs = new Date(now.toISOString().split('T')[0] + `T${inputTime.getHours().toString().padStart(2, '0')}:${inputTime.getMinutes().toString().padStart(2, '0')}:00`).getTime();
        }

        let result;
        if (operator === "within") {
          if (!endTime) {
            if (this.properties.debug) console.log(`[LogicCompareNode] End time required for 'within'`);
            return false;
          }
          const endMs = endTime.getTime();
          let adjustedEndMs = endMs;
          if (endTime.getDate() !== now.getDate()) {
            adjustedEndMs = new Date(now.toISOString().split('T')[0] + `T${endTime.getHours().toString().padStart(2, '0')}:${endTime.getMinutes().toString().padStart(2, '0')}:00`).getTime();
          }

          if (adjustedEndMs < adjustedInputMs) {
            result = currentMs >= adjustedInputMs || currentMs <= adjustedEndMs;
          } else {
            result = currentMs >= adjustedInputMs && currentMs <= adjustedEndMs;
          }
        } else {
          const compareMs = compareTime ? compareTime.getTime() : adjustedInputMs;
          let adjustedCompareMs = compareMs;
          if (compareTime && compareTime.getDate() !== now.getDate()) {
            adjustedCompareMs = new Date(now.toISOString().split('T')[0] + `T${compareTime.getHours().toString().padStart(2, '0')}:${compareTime.getMinutes().toString().padStart(2, '0')}:00`).getTime();
          }

          switch (operator) {
            case ">": result = currentMs > adjustedCompareMs; break;
            case "<": result = currentMs < adjustedCompareMs && currentMs >= midnightMs; break;
            case "=": result = Math.abs(currentMs - adjustedCompareMs) < 60000; break;
            case ">=": result = currentMs >= adjustedCompareMs; break;
            case "<=": result = currentMs <= adjustedCompareMs && currentMs >= midnightMs; break;
            case "!=": result = Math.abs(currentMs - adjustedCompareMs) >= 60000; break;
            default: result = false;
          }
        }

        if (this.properties.debug) {
          console.log(`[LogicCompareNode] Time comparison: current=${now.toISOString()}, input=${inputTime.toISOString()}, operator=${operator}, result=${result}`);
        }
        return result;
      } catch (e) {
        if (this.properties.debug) console.error("[LogicCompareNode] compareTimes error:", e);
        return false;
      }
    }

    isMidnight(date) {
      try {
        return date.getHours() === 0 && date.getMinutes() === 0;
      } catch (e) {
        if (this.properties.debug) console.error("[LogicCompareNode] isMidnight error:", e);
        return false;
      }
    }

    onExecute() {
      try {
        if (!this.isGraphLoaded) {
          if (this.properties.debug) console.log("[LogicCompareNode] Skipping onExecute: graph not loaded");
          return;
        }

        const now = new Date(); // e.g., 08:08 AM PDT, May 30, 2025

        // Trigger upstream node
        const inputLink = this.inputs[0]?.link;
        if (inputLink && this.graph) {
          const originNode = this.graph.getNodeById(inputLink.origin_id);
          if (originNode && originNode.onExecute) {
            originNode.onExecute();
            if (this.properties.debug) console.log(`[LogicCompareNode] Triggered upstream node ${originNode.title || originNode.id}`);
          }
        }

        // Get inputs
        const inputValue = this.getInputData(0);
        const endTimeValue = this.getInputData(1);
        const resetInput = this.getInputData(2);
        this.inputValue = inputValue !== undefined ? inputValue : "undefined";
        this.endTimeValue = endTimeValue !== undefined ? endTimeValue : null;

        // Reset input
        if (resetInput === true) {
          this.latched = false;
          this.resultState = false;
          this.latchTimestamp = null;
          this.setOutputData(0, false);
          if (this.properties.debug) console.log("[LogicCompareNode] Latch reset via input");
          this.setDirtyCanvas(true);
          return;
        }

        // Auto-reset at midnight
        if (this.properties.autoResetMidnight && this.latched && this.isMidnight(now) && (!this.lastDate || !this.isMidnight(this.lastDate))) {
          this.latched = false;
          this.resultState = false;
          this.latchTimestamp = null;
          this.setOutputData(0, false);
          if (this.properties.debug) console.log("[LogicCompareNode] Latch auto-reset at midnight");
          this.setDirtyCanvas(true);
          return;
        }

        // Auto-reset after duration
        if (this.properties.autoResetDuration && this.latched && this.latchTimestamp) {
          const durationMs = this.properties.durationMinutes * 60 * 1000;
          if (now.getTime() - this.latchTimestamp >= durationMs) {
            this.latched = false;
            this.resultState = false;
            this.latchTimestamp = null;
            this.setOutputData(0, false);
            if (this.properties.debug) console.log(`[LogicCompareNode] Latch auto-reset after ${this.properties.durationMinutes} minutes`);
            this.setDirtyCanvas(true);
            return;
          }
        }

        let result = false;
        const operator = this.properties.operator;

        if (inputValue === undefined) {
          if (this.properties.debug) console.log(`[LogicCompareNode] Input value is undefined`);
          this.resultState = false;
          this.isTimeInput = false;
          this.setOutputData(0, this.resultState);
          this.setDirtyCanvas(true);
          return;
        }

        const inputIsTime = typeof inputValue === "string" && inputValue.match(/^\d{1,2}:\d{2}( ?)(AM|PM)?$/i);
        const compareIsTime = typeof this.properties.compareValue === "string" && this.properties.compareValue.match(/^\d{1,2}:\d{2}( ?)(AM|PM)?$/i);
        this.isTimeInput = inputIsTime;

        if (this.properties.debug) {
          console.log(`[LogicCompareNode] onExecute: Raw Input=${inputValue}, Type=${typeof inputValue}, CompareValue=${this.properties.compareValue}`);
        }

        if (inputIsTime) {
          const inputTime = this.parseTimeString(inputValue);
          let endTime = null;
          let compareTime = null;

          if (operator === "within" && endTimeValue) {
            const endTimeIsTime = typeof endTimeValue === "string" && endTimeValue.match(/^\d{1,2}:\d{2}( ?)(AM|PM)?$/i);
            if (endTimeIsTime) {
              endTime = this.parseTimeString(endTimeValue);
            }
          } else if (compareIsTime) {
            compareTime = this.parseTimeString(this.properties.compareValue);
          }

          if (inputTime) {
            result = this.compareTimes(now, inputTime, operator, endTime, compareTime);
          } else {
            result = false;
            if (this.properties.debug) console.log(`[LogicCompareNode] Failed to parse input time: ${inputValue}`);
          }
        } else {
          const numInput = Number(inputValue);
          const numCompare = Number(this.properties.compareValue);

          if (isNaN(numInput)) {
            const boolInput = typeof inputValue === "boolean" ? inputValue : inputValue.toString().toLowerCase() === "true";
            const boolCompare = isNaN(numCompare) ? (this.properties.compareValue.toLowerCase() === "true") : numCompare > 0;

            switch (operator) {
              case ">": result = boolInput > boolCompare; break;
              case "<": result = boolInput < boolCompare; break;
              case "=": result = boolInput === boolCompare; break;
              case ">=": result = boolInput >= boolCompare; break;
              case "<=": result = boolInput <= boolCompare; break;
              case "!=": result = boolInput !== boolCompare; break;
              case "within": result = false; break;
              default: result = false;
            }
            if (this.properties.debug) console.log(`[LogicCompareNode] Boolean comparison: input=${boolInput}, compare=${boolCompare}, result=${result}`);
          } else {
            if (isNaN(numCompare)) {
              if (this.properties.debug) console.log(`[LogicCompareNode] Compare value not numeric: ${this.properties.compareValue}`);
              result = false;
            } else {
              switch (operator) {
                case ">": result = numInput > numCompare; break;
                case "<": result = numInput < numCompare; break;
                case "=": result = numInput === numCompare; break;
                case ">=": result = numInput >= numCompare; break;
                case "<=": result = numInput <= numCompare; break;
                case "!=": result = numInput !== numCompare; break;
                case "within": result = false; break;
                default: result = false;
              }
              if (this.properties.debug) console.log(`[LogicCompareNode] Numeric comparison: input=${numInput}, compare=${numCompare}, result=${result}`);
            }
          }
        }

        // Latch logic
        const prevResultState = this.resultState;
        if (this.properties.latch) {
          if (result && !this.latched) {
            this.latched = true;
            this.latchTimestamp = now.getTime();
          }
          this.resultState = this.latched;
        } else {
          this.resultState = result;
          this.latchTimestamp = null;
        }

        this.setOutputData(0, this.resultState);
        this.setDirtyCanvas(true);
        if (prevResultState !== this.resultState) {
          this.setDirtyCanvas(true);
        }

        this.lastDate = now;
      } catch (e) {
        if (this.properties.debug) console.error("[LogicCompareNode] onExecute error:", e);
      }
    }

    onDrawBackground(ctx) {
      try {
        if (super.onDrawBackground) super.onDrawBackground(ctx);
        ctx.strokeStyle = this.resultState ? "#00FF00" : "#FF0000";
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, this.size[0], this.size[1]);
      } catch (e) {
        if (this.properties.debug) console.error("[LogicCompareNode] onDrawBackground error:", e);
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
        if (this.inputs[2]) this.inputs[2].pos = [10, slotY + slotHeight * 2];

        const overlayStartY = inputStartY + slotHeight * 3 + widgetsHeight;
        let operatorText = "";
        if (this.isTimeInput) {
          switch (this.properties.operator) {
            case ">": operatorText = "After"; break;
            case "<": operatorText = "Before"; break;
            case "=": operatorText = "Equal to"; break;
            case ">=": operatorText = "At or after"; break;
            case "<=": operatorText = "At or before"; break;
            case "!=": operatorText = "Not equal to"; break;
            case "within": operatorText = "Between"; break;
          }
        } else {
          switch (this.properties.operator) {
            case ">": operatorText = "Greater than"; break;
            case "<": operatorText = "Less than"; break;
            case "=": operatorText = "Equal to"; break;
            case ">=": operatorText = "Greater than or equal to"; break;
            case "<=": operatorText = "Less than or equal to"; break;
            case "!=": operatorText = "Not equal to"; break;
            case "within": operatorText = "Between"; break;
          }
        }

        let inputText;
        if (this.properties.operator === "within" && this.endTimeValue) {
          inputText = `${operatorText} ${this.inputValue} and ${this.endTimeValue}`;
        } else {
          inputText = `${operatorText} ${this.properties.compareValue}`;
        }
        ctx.fillText(inputText, this.size[0] / 2, overlayStartY);

        let nextLineY = overlayStartY + textHeight;
        if (this.isTimeInput && this.timeInterpretation && this.properties.operator !== "within") {
          const interpretationText = `Interpreted as: ${this.timeInterpretation}`;
          ctx.fillText(interpretationText, this.size[0] / 2, nextLineY);
          nextLineY += textHeight;
        }

        ctx.fillText(`Latched: ${this.latched}`, this.size[0] / 2, nextLineY);
        nextLineY += textHeight;

        ctx.fillText(`Result: ${this.resultState}`, this.size[0] / 2, nextLineY);
        nextLineY += textHeight;

        // Set minimum size without forcing resize during load
        const minHeight = nextLineY + paddingBottom + 10;
        if (this.size[1] < minHeight) this.size[1] = minHeight;
        if (this.size[0] < 180) this.size[0] = 180;
      } catch (e) {
        if (this.properties.debug) console.error("[LogicCompareNode] onDrawForeground error:", e);
      }
    }

    serialize() {
      try {
        const data = super.serialize();
        data.properties = { ...this.properties };
        data.endTimeValue = this.endTimeValue;
        data.latched = this.latched;
        data.latchTimestamp = this.latchTimestamp;
        return data;
      } catch (e) {
        if (this.properties.debug) console.error("[LogicCompareNode] serialize error:", e);
        return super.serialize();
      }
    }

    configure(data) {
      try {
        super.configure(data);
        if (data.properties) {
          this.properties = {
            operator: data.properties.operator || ">",
            debug: data.properties.debug || false,
            timeMode: data.properties.timeMode || "auto",
            compareValue: data.properties.compareValue || "0",
            latch: data.properties.latch || false,
            autoResetMidnight: data.properties.autoResetMidnight || false,
            autoResetDuration: data.properties.autoResetDuration || false,
            durationMinutes: data.properties.durationMinutes || 5,
          };
        }
        this.endTimeValue = data.endTimeValue || null;
        this.latched = data.latched || false;
        this.latchTimestamp = data.latchTimestamp || null;

        // Update widgets safely
        if (this.widgets) {
          const operatorWidget = this.widgets.find(w => w.name === "Operator");
          if (operatorWidget) operatorWidget.value = this.properties.operator;
          const compareValueWidget = this.widgets.find(w => w.name === "Compare Value");
          if (compareValueWidget) compareValueWidget.value = this.properties.compareValue;
          const timeModeWidget = this.widgets.find(w => w.name === "Time Mode");
          if (timeModeWidget) timeModeWidget.value = this.properties.timeMode;
          const latchWidget = this.widgets.find(w => w.name === "Latch Mode");
          if (latchWidget) latchWidget.value = this.properties.latch;
          const midnightWidget = this.widgets.find(w => w.name === "Reset at Midnight");
          if (midnightWidget) midnightWidget.value = this.properties.autoResetMidnight;
          const durationWidget = this.widgets.find(w => w.name === "Reset After Duration");
          if (durationWidget) durationWidget.value = this.properties.autoResetDuration;
          const durationMinWidget = this.widgets.find(w => w.name === "Duration (min)");
          if (durationMinWidget) durationMinWidget.value = this.properties.durationMinutes;
          const debugWidget = this.widgets.find(w => w.name === "Debug");
          if (debugWidget) debugWidget.value = this.properties.debug;
        }

        this.isGraphLoaded = true; // Mark graph as loaded
        this.setDirtyCanvas(true);
      } catch (e) {
        console.error("[LogicCompareNode] configure error:", e);
      }
    }
  }

  try {
    LiteGraph.registerNodeType("HomeAssistant/LogicCompareNode", LogicCompareNode);
    console.log("LogicCompareNode registered successfully");
  } catch (e) {
    console.error("Error registering LogicCompareNode:", e);
  }
}