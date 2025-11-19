// custom_nodes/ColorGradientNode.js
// Full improved version with UI polish, perf boosts, QoL upgrades
// Original by you — refined for better function and look

if (!LiteGraph.registered_node_types?.["HomeAssistant/ColorGradientNode"]) {
  class ColorGradientNode extends LiteGraph.LGraphNode {
    constructor() {
      super();
      this.title = "Stepped Color Gradient";
      this.bgcolor = "#000000";

      this.size = [450, 710];
      this.widgets = [];

      this.properties = {
        colorMode: "custom",
        predefinedWedge: "warm-to-cool",
        startHue: 0,
        startSaturation: 100,
        startBrightness: 100,
        endHue: 240,
        endSaturation: 80,
        endBrightness: 90,
        rangeMode: "numerical",
        startValue: 20,
        endValue: 30,
        startTimeHours: 10,
        startTimeMinutes: 0,
        startTimePeriod: "AM",
        endTimeHours: 2,
        endTimeMinutes: 0,
        endTimePeriod: "PM",
        timerDuration: 1,
        timerUnit: "hours",
        timeSteps: 60,
        gradientBarYPosition: 740,
        useBrightnessOverride: false,
        brightnessOverride: 254,
        debug: true,
        enableReconnect: false,
        reconnectInterval: 600000,
      };

      this.rangeMin = 0;
      this.rangeMax = 100;

      this.lastColor = null;
      this.isInRange = false;
      this.timerStart = null;
      this.position = 0;
      this._dirtyTimeout = null;
      this._logCount = 0;
      this._logLimit = 10;
      this.activeWidget = null;
      this._cachedStartTime = null;
      this._cachedEndTime = null;
      this.lastUpdateTime = null;
      this.currentStep = 0;
      this._lastCacheDate = null;
      this.lastInputValue = null;
      this._lastTimeStep = null;
      this._reconnectTimer = null;

      this.addInput("Value", "number");
      this.addInput("Trigger", "boolean");
      this.addInput("Timer Duration", "number");
      this.addInput("Start Time", "string");
      this.addInput("End Time", "string");
      this.addOutput("HSV Info", "hsv_info");

      this.addWidget("combo", "Color Mode", this.properties.colorMode, (value) => {
        this.properties.colorMode = value;
        if (value === "predefined") {
          this.updatePredefinedWedge(this.properties.predefinedWedge);
        }
        this.updateColorSwatch();
        if (this.properties.colorMode === "custom") {
          this.setDirtyCanvas(true, true);
        }
        this.onExecute();
      }, { values: ["predefined", "custom", "manual"] });

      this.addWidget("combo", "Wedge", this.properties.predefinedWedge, (value) => {
        this.properties.predefinedWedge = value;
        this.updatePredefinedWedge(value);
        this.updateColorSwatch();
        this.setDirtyCanvas(true, true);
        this.onExecute();
      }, { values: ["warm", "cool", "warm-to-cool"] });

      this.addWidget("slider", "Start Hue", this.properties.startHue, (value) => {
        this.properties.startHue = Math.round(value);
        this.updateColorSwatch();
        if (this.properties.colorMode === "custom") {
          this.setDirtyCanvas(true, true);
        }
        this.currentStep = 0;
        this._lastTimeStep = null;
        this.onExecute();
      }, { min: 0, max: 360, step: 1, precision: 0 });

      this.addWidget("slider", "Start Saturation", this.properties.startSaturation, (value) => {
        this.properties.startSaturation = Math.round(value);
        this.updateColorSwatch();
        if (this.properties.colorMode === "custom") {
          this.setDirtyCanvas(true, true);
        }
        this.currentStep = 0;
        this._lastTimeStep = null;
        this.onExecute();
      }, { min: 0, max: 100, step: 1, precision: 0 });

      this.addWidget("slider", "Start Brightness", this.properties.startBrightness, (value) => {
        this.properties.startBrightness = Math.round(value);
        this.updateColorSwatch();
        if (this.properties.colorMode === "custom") {
          this.setDirtyCanvas(true, true);
        }
        this.currentStep = 0;
        this._lastTimeStep = null;
        this.onExecute();
      }, { min: 0, max: 100, step: 1, precision: 0 });

      this.addWidget("slider", "End Hue", this.properties.endHue, (value) => {
        this.properties.endHue = Math.round(value);
        this.updateColorSwatch();
        if (this.properties.colorMode === "custom") {
          this.setDirtyCanvas(true, true);
        }
        this.currentStep = 0;
        this._lastTimeStep = null;
        this.onExecute();
      }, { min: 0, max: 360, step: 1, precision: 0 });

      this.addWidget("slider", "End Saturation", this.properties.endSaturation, (value) => {
        this.properties.endSaturation = Math.round(value);
        this.updateColorSwatch();
        if (this.properties.colorMode === "custom") {
          this.setDirtyCanvas(true, true);
        }
        this.currentStep = 0;
        this._lastTimeStep = null;
        this.onExecute();
      }, { min: 0, max: 100, step: 1, precision: 0 });

      this.addWidget("slider", "End Brightness", this.properties.endBrightness, (value) => {
        this.properties.endBrightness = Math.round(value);
        this.updateColorSwatch();
        if (this.properties.colorMode === "custom") {
          this.setDirtyCanvas(true, true);
        }
        this.currentStep = 0;
        this._lastTimeStep = null;
        this.onExecute();
      }, { min: 0, max: 100, step: 1, precision: 0 });

      this.addWidget("combo", "Range Mode", this.properties.rangeMode, (value) => {
        this.properties.rangeMode = value;
        this.timerStart = null;
        this.currentStep = 0;
        this._lastTimeStep = null;
        this.lastInputValue = null;
        this.setDirtyCanvas(true, true);
        this.onExecute();
      }, { values: ["numerical", "time", "timer"] });

      this.addWidget("slider", "Range Start", this.properties.startValue, (value) => {
        this.properties.startValue = Math.round(value);
        if (this.properties.debug) {
          console.log(`[ColorGradientNode] Range Start updated to ${this.properties.startValue}`);
        }
        this.updateWidgets();
        this.setDirtyCanvas(true, true);
        this.onExecute();
      }, { min: this.rangeMin, max: this.rangeMax, step: 1, precision: 0 });

      this.addWidget("slider", "Range End", this.properties.endValue, (value) => {
        this.properties.endValue = Math.round(value);
        if (this.properties.debug) {
          console.log(`[ColorGradientNode] Range End updated to ${this.properties.endValue}`);
        }
        this.updateWidgets();
        this.setDirtyCanvas(true, true);
        this.onExecute();
      }, { min: this.rangeMin, max: this.rangeMax, step: 1, precision: 0 });

      this.addWidget("slider", "Start Time Hours", this.properties.startTimeHours, (value) => {
        this.properties.startTimeHours = Math.round(value);
        this._cachedStartTime = null;
        this.currentStep = 0;
        this._lastTimeStep = null;
        this.setDirtyCanvas(true, true);
        this.onExecute();
      }, { min: 1, max: 12, step: 1, precision: 0 });

      this.addWidget("slider", "Start Time Minutes", this.properties.startTimeMinutes, (value) => {
        this.properties.startTimeMinutes = Math.round(value);
        this._cachedStartTime = null;
        this.currentStep = 0;
        this._lastTimeStep = null;
        this.setDirtyCanvas(true, true);
        this.onExecute();
      }, { min: 0, max: 59, step: 1, precision: 0 });

      this.addWidget("combo", "Start Time Period", this.properties.startTimePeriod, (value) => {
        this.properties.startTimePeriod = value;
        this._cachedStartTime = null;
        this.currentStep = 0;
        this._lastTimeStep = null;
        this.setDirtyCanvas(true, true);
        this.onExecute();
      }, { values: ["AM", "PM"] });

      this.addWidget("slider", "End Time Hours", this.properties.endTimeHours, (value) => {
        this.properties.endTimeHours = Math.round(value);
        this._cachedEndTime = null;
        this.currentStep = 0;
        this._lastTimeStep = null;
        this.setDirtyCanvas(true, true);
        this.onExecute();
      }, { min: 1, max: 12, step: 1, precision: 0 });

      this.addWidget("slider", "End Time Minutes", this.properties.endTimeMinutes, (value) => {
        this.properties.endTimeMinutes = Math.round(value);
        this._cachedEndTime = null;
        this.currentStep = 0;
        this._lastTimeStep = null;
        this.setDirtyCanvas(true, true);
        this.onExecute();
      }, { min: 0, max: 59, step: 1, precision: 0 });

      this.addWidget("combo", "End Time Period", this.properties.endTimePeriod, (value) => {
        this.properties.endTimePeriod = value;
        this._cachedEndTime = null;
        this.currentStep = 0;
        this._lastTimeStep = null;
        this.setDirtyCanvas(true, true);
        this.onExecute();
      }, { values: ["AM", "PM"] });

      this.addWidget("number", "Timer Duration", this.properties.timerDuration, (value) => {
        this.properties.timerDuration = Math.max(1, Math.round(value));
        this.setDirtyCanvas(true, true);
        this.onExecute();
      }, { min: 1, step: 1, precision: 0 });

      this.addWidget("combo", "Timer Unit", this.properties.timerUnit, (value) => {
        this.properties.timerUnit = value;
        this.setDirtyCanvas(true, true);
        this.onExecute();
      }, { values: ["seconds", "minutes", "hours"] });

      this.addWidget("number", "Time Steps", this.properties.timeSteps, (value) => {
        this.properties.timeSteps = Math.max(1, Math.round(value));
        this.currentStep = 0;
        this._lastTimeStep = null;
        this.setDirtyCanvas(true, true);
        this.onExecute();
      }, { min: 1, step: 1, precision: 0 });

      this.addWidget("number", "Gradient Y Position", this.properties.gradientBarYPosition, (value) => {
        this.properties.gradientBarYPosition = Math.round(value);
        this.setDirtyCanvas(true, true);
      }, { step: 1, precision: 0 });

      this.addWidget("toggle", "Override Brightness", this.properties.useBrightnessOverride, (value) => {
        this.properties.useBrightnessOverride = value;
        this.setDirtyCanvas(true, true);
        this.currentStep = 0;
        this._lastTimeStep = null;
        this.onExecute();
      });

      this.addWidget("slider", "Brightness", this.properties.brightnessOverride, (value) => {
        this.properties.brightnessOverride = Math.round(value);
        this.setDirtyCanvas(true, true);
        this.currentStep = 0;
        this._lastTimeStep = null;
        this.onExecute();
      }, { min: 0, max: 254, step: 1, precision: 0 });

      this.addWidget("toggle", "Debug", this.properties.debug, (value) => {
        this.properties.debug = value;
        console.log(`[ColorGradientNode] Debug mode ${value ? "enabled" : "disabled"}`);
        this.setDirtyCanvas(true, true);
      });

      this.addWidget("toggle", "Enable Reconnect", this.properties.enableReconnect, (value) => {
        this.properties.enableReconnect = value;
        this.setDirtyCanvas(true, true);
      });

      this.addWidget("number", "Reconnect Interval (ms)", this.properties.reconnectInterval, (value) => {
        this.properties.reconnectInterval = Math.max(1000, Math.min(1800000, Math.round(value)));
        this.setDirtyCanvas(true, true);
      }, { min: 1000, max: 1800000, step: 1000, precision: 0 });

      this.widgets.forEach(widget => {
        const originalCallback = widget.callback;
        widget.callback = (value) => {
          this.activeWidget = widget.name;
          originalCallback.call(widget, value);
          setTimeout(() => { this.activeWidget = null; }, 100);
        };
      });

      this.updateColorSwatch();
      this.updateSize();
      this.setupReconnectTimer();
    }

    parseTimeInput(timeStr) {
      try {
        if (!timeStr || typeof timeStr !== "string") {
          if (this.properties.debug) console.log(`[ColorGradientNode] Invalid time input: ${timeStr}`);
          return null;
        }
        timeStr = timeStr.trim().replace(/\s+/g, ' ');
        const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
        if (!match) {
          if (this.properties.debug) console.log(`[ColorGradientNode] Invalid time format: ${timeStr}`);
          return null;
        }

        const hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2], 10);
        const period = match[3].toUpperCase();

        if (isNaN(hours) || isNaN(minutes) || hours < 1 || hours > 12 || minutes < 0 || minutes > 59) {
          if (this.properties.debug) console.log(`[ColorGradientNode] Invalid time values: ${hours}:${minutes} ${period}`);
          return null;
        }

        if (this.properties.debug) console.log(`[ColorGradientNode] Parsed time input: ${timeStr} -> ${hours}:${minutes} ${period}`);
        return { hours, minutes, period };
      } catch (e) {
        if (this.properties.debug) console.error(`[ColorGradientNode] parseTimeInput error: ${e.message}`);
        return null;
      }
    }

    parseTimeString(hours, minutes, period) {
      try {
        const now = new Date();
        let baseDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        let parsedHours = parseInt(hours, 10);
        const parsedMinutes = parseInt(minutes, 10);
        const isPM = period.toUpperCase() === "PM";

        if (isNaN(parsedHours) || isNaN(parsedMinutes)) {
          if (this.properties.debug) console.log(`[ColorGradientNode] Invalid time in parseTimeString: ${hours}:${minutes} ${period}`);
          return null;
        }

        if (parsedHours < 1 || parsedHours > 12 || parsedMinutes < 0 || parsedMinutes > 59) {
          if (this.properties.debug) console.log(`[ColorGradientNode] Invalid time values: ${hours}:${minutes} ${period}`);
          return null;
        }

        if (isPM && parsedHours < 12) parsedHours += 12;
        if (!isPM && parsedHours === 12) parsedHours = 0;

        let timeDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), parsedHours, parsedMinutes, 0);
        if (isNaN(timeDate.getTime())) {
          if (this.properties.debug) console.log(`[ColorGradientNode] Invalid timeDate: ${hours}:${minutes} ${period}`);
          return null;
        }

        if (this.properties.debug) console.log(`[ColorGradientNode] Parsed ${hours}:${minutes} ${period} as ${timeDate}`);
        return timeDate;
      } catch (e) {
        console.error(`[ColorGradientNode] Error in parseTimeString: ${e.message}`);
        return null;
      }
    }

    updateSize() {
      const widgetCount = Array.isArray(this.widgets) ? this.widgets.length : 0;
      const widgetHeight = widgetCount * LiteGraph.NODE_WIDGET_HEIGHT;
      const reservedTop = 20;
      const reservedBottom = 220;
      this.size[1] = Math.max(710, widgetHeight + reservedTop + reservedBottom);
      this.size[0] = Math.max(this.size[0], 450);
      this.setDirtyCanvas(true);
    }

    onResize() {
      this.updateSize();
    }

    setDirtyCanvas(foreground, background) {
      if (this.widgets) {
        this.widgets.forEach(widget => {
          if (widget.type === "combo" && widget._isOpen) {
            widget._isOpen = false;
          }
          if (widget.type === "text" && document.activeElement === widget.element) {
            widget.element.blur();
          }
        });
      }
      if (this._dirtyTimeout) {
        clearTimeout(this._dirtyTimeout);
      }
      this._dirtyTimeout = setTimeout(() => {
        super.setDirtyCanvas(foreground, background);
        this._dirtyTimeout = null;
        if (this.graph) {
          this.graph.runStep();
        }
      }, 50);
    }

    getExtraMenuOptions(canvas) {
      return [
        {
          content: "Copy Settings",
          callback: () => {
            this.copySettings();
          },
        },
        {
          content: "Paste Settings",
          callback: () => {
            this.pasteSettings();
          },
        },
      ];
    }

    copySettings() {
      try {
        const settings = {
          colorMode: this.properties.colorMode,
          predefinedWedge: this.properties.predefinedWedge,
          startHue: this.properties.startHue,
          startSaturation: this.properties.startSaturation,
          startBrightness: this.properties.startBrightness,
          endHue: this.properties.endHue,
          endSaturation: this.properties.endSaturation,
          endBrightness: this.properties.endBrightness,
          rangeMode: this.properties.rangeMode,
          startValue: this.properties.startValue,
          endValue: this.properties.endValue,
          startTimeHours: this.properties.startTimeHours,
          startTimeMinutes: this.properties.startTimeMinutes,
          startTimePeriod: this.properties.startTimePeriod,
          endTimeHours: this.properties.endTimeHours,
          endTimeMinutes: this.properties.endTimeMinutes,
          endTimePeriod: this.properties.endTimePeriod,
          timerDuration: this.properties.timerDuration,
          timerUnit: this.properties.timerUnit,
          timeSteps: this.properties.timeSteps,
          gradientBarYPosition: this.properties.gradientBarYPosition,
          useBrightnessOverride: this.properties.useBrightnessOverride,
          brightnessOverride: this.properties.brightnessOverride,
          debug: this.properties.debug,
          enableReconnect: this.properties.enableReconnect,
          reconnectInterval: this.properties.reconnectInterval,
        };
        localStorage.setItem("colorGradientNode_clipboard", JSON.stringify(settings));
        if (this.properties.debug) {
          console.log(`[ColorGradientNode] Copied settings to clipboard: ${JSON.stringify(settings)}`);
        }
      } catch (e) {
        console.error(`[ColorGradientNode] Error in copySettings: ${e.message}`);
      }
    }

    pasteSettings() {
      try {
        const data = localStorage.getItem("colorGradientNode_clipboard");
        if (!data) {
          if (this.properties.debug) {
            console.log(`[ColorGradientNode] No settings in clipboard to paste`);
          }
          return;
        }
        const settings = JSON.parse(data);
        Object.assign(this.properties, settings);
        this.updateWidgets();
        this.setDirtyCanvas(true, true);
        if (this.properties.debug) {
          console.log(`[ColorGradientNode] Pasted settings: ${JSON.stringify(settings)}`);
        }
        this.onExecute();
      } catch (e) {
        console.error(`[ColorGradientNode] Error in pasteSettings: ${e.message}`);
      }
    }

    updatePredefinedWedge(wedge) {
      try {
        if (wedge === "warm") {
          this.properties.startHue = 0;
          this.properties.startSaturation = 100;
          this.properties.startBrightness = 100;
          this.properties.endHue = 60;
          this.properties.endSaturation = 80;
          this.properties.endBrightness = 90;
        } else if (wedge === "cool") {
          this.properties.startHue = 180;
          this.properties.startSaturation = 90;
          this.properties.startBrightness = 90;
          this.properties.endHue = 240;
          this.properties.endSaturation = 80;
          this.properties.endBrightness = 90;
        } else if (wedge === "warm-to-cool") {
          this.properties.startHue = 0;
          this.properties.startSaturation = 100;
          this.properties.startBrightness = 100;
          this.properties.endHue = 240;
          this.properties.endSaturation = 80;
          this.properties.endBrightness = 90;
        }
        this.updateWidgets();
        this.onExecute();
      } catch (e) {
        console.error(`[ColorGradientNode] Error in updatePredefinedWedge: ${e.message}`);
      }
    }

    hsvToRgb(h, s, v) {
      try {
        s = s / 100;
        v = v / 100;

        const c = v * s;
        const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
        const m = v - c;

        let r, g, b;
        if (h >= 0 && h < 60) {
          r = c; g = x; b = 0;
        } else if (h >= 60 && h < 120) {
          r = x; g = c; b = 0;
        } else if (h >= 120 && h < 180) {
          r = 0; g = c; b = x;
        } else if (h >= 180 && h < 240) {
          r = 0; g = x; b = c;
        } else if (h >= 240 && h < 300) {
          r = x; g = 0; b = c;
        } else {
          r = c; g = 0; b = x;
        }

        return {
          r: Math.round((r + m) * 255),
          g: Math.round((g + m) * 255),
          b: Math.round((b + m) * 255),
        };
      } catch (e) {
        console.error(`[ColorGradientNode] Error in hsvToRgb: ${e.message}`);
        return { r: 0, g: 0, b: 0 };
      }
    }

    updateColorSwatch() {
      try {
        const hue = this.properties.startHue;
        const saturation = this.properties.startSaturation;
        const brightness = this.properties.startBrightness;
        const color = `hsl(${hue}, ${saturation}%, ${brightness / 2}%)`;
        this.boxcolor = color;

        if (this.graph && this.graph.canvas) {
          this.graph.canvas.draw(true, true);
        }
      } catch (e) {
        console.error(`[ColorGradientNode] Error in updateColorSwatch: ${e.message}`);
      }
    }

    setupReconnectTimer() {
      try {
        if (this._reconnectTimer) {
          clearInterval(this._reconnectTimer);
          this._reconnectTimer = null;
        }

        // Always set up a 10-minute (600,000 ms) interval timer
        this._reconnectTimer = setInterval(() => {
          this.performReconnect();
        }, 600000); // Fixed 10-minute interval
        if (this.properties.debug) {
          console.log(`[ColorGradientNode] Reconnect timer started with fixed 10-minute (600000ms) interval`);
        }
      } catch (e) {
        console.error(`[ColorGradientNode] Error in setupReconnectTimer: ${e.message}`);
      }
    }

    performReconnect() {
      try {
        const valueInput = this.inputs[0];
        if (!valueInput) return;

        const connections = valueInput.link ? this.graph.links[valueInput.link] : null;

        if (connections) {
          this.disconnectInput(0);
          if (this.properties.debug) {
            console.log(`[ColorGradientNode] Disconnected Value input`);
          }
        }

        setTimeout(() => {
          if (connections) {
            const originNode = this.graph.getNodeById(connections.origin_id);
            if (originNode) {
              originNode.connect(connections.origin_slot, this, 0);
              if (this.properties.debug) {
                console.log(`[ColorGradientNode] Reconnected Value input`);
              }
            }
          }
          this.onExecute();
          this.setDirtyCanvas(true, true);
        }, 100);
      } catch (e) {
        console.error(`[ColorGradientNode] Error in performReconnect: ${e.message}`);
      }
    }

    onRemoved() {
      try {
        if (this._reconnectTimer) {
          clearInterval(this._reconnectTimer);
          this._reconnectTimer = null;
          if (this.properties.debug) {
            console.log(`[ColorGradientNode] Reconnect timer cleared on node removal`);
          }
        }
        super.onRemoved && super.onRemoved();
      } catch (e) {
        console.error(`[ColorGradientNode] Error in onRemoved: ${e.message}`);
      }
    }

    onExecute() {
      try {
        const inputValue = this.getInputData(0);
        const trigger = this.getInputData(1);
        const now = new Date();
        const currentMs = now.getTime();
        const currentDate = now.toISOString().split('T')[0];

        if (this._lastCacheDate !== currentDate) {
          this._cachedStartTime = null;
          this._cachedEndTime = null;
          this._lastCacheDate = currentDate;
          this.currentStep = 0;
          this._lastTimeStep = null;
          if (this.properties.debug) {
            console.log(`[ColorGradientNode] Invalidated time cache due to date change: ${currentDate}`);
          }
        }

        let position = 0;
        let hsvInfo = null;
        this.isInRange = false;
        let stateChanged = false;

        if (this.properties.rangeMode === "numerical") {
          if (inputValue !== this.lastInputValue) {
            this.lastInputValue = inputValue;
            stateChanged = true;
            if (this.properties.debug) {
              console.log(`[ColorGradientNode] Value input changed to ${inputValue}`);
            }
          }

          if (inputValue === undefined) {
            const fallbackValue = (this.properties.startValue + this.properties.endValue) / 2;
            position = (fallbackValue - this.properties.startValue) / (this.properties.endValue - this.properties.startValue);
            this.isInRange = true;
            stateChanged = true;
            if (this.properties.debug) {
              console.log(`[ColorGradientNode] No input value, using fallback: ${fallbackValue}`);
            }
          } else {
            const clampedValue = Math.max(this.properties.startValue, Math.min(this.properties.endValue, inputValue));
            position = (clampedValue - this.properties.startValue) / (this.properties.endValue - this.properties.startValue);
            this.isInRange = true;
            if (this.properties.debug && inputValue !== clampedValue && this._logCount++ % this._logLimit === 0) {
              //console.log(`[ColorGradientNode] Input value ${inputValue} clamped to ${clampedValue}`);
            }
          }
        } else if (this.properties.rangeMode === "time") {
          const startTimeInput = this.getInputData(3);
          const endTimeInput = this.getInputData(4);

          let startTimeProps = {
            hours: this.properties.startTimeHours,
            minutes: this.properties.startTimeMinutes,
            period: this.properties.startTimePeriod
          };
          let endTimeProps = {
            hours: this.properties.endTimeHours,
            minutes: this.properties.endTimeMinutes,
            period: this.properties.endTimePeriod
          };

          if (startTimeInput) {
            const parsedStart = this.parseTimeInput(startTimeInput);
            if (parsedStart) {
              startTimeProps = parsedStart;
              this.properties.startTimeHours = parsedStart.hours;
              this.properties.startTimeMinutes = parsedStart.minutes;
              this.properties.startTimePeriod = parsedStart.period;
              const startHourWidget = this.widgets.find(w => w.name === "Start Time Hours");
              const startMinuteWidget = this.widgets.find(w => w.name === "Start Time Minutes");
              const startPeriodWidget = this.widgets.find(w => w.name === "Start Time Period");
              if (startHourWidget) startHourWidget.value = parsedStart.hours;
              if (startMinuteWidget) startMinuteWidget.value = parsedStart.minutes;
              if (startPeriodWidget) startPeriodWidget.value = parsedStart.period;
              this._cachedStartTime = null;
              this.currentStep = 0;
              this._lastTimeStep = null;
              stateChanged = true;
              if (this.properties.debug) console.log(`[ColorGradientNode] Start Time overridden: ${startTimeInput}`);
            } else {
              if (this.properties.debug) console.log(`[ColorGradientNode] Failed to parse Start Time: ${startTimeInput}`);
            }
          }

          if (endTimeInput) {
            const parsedEnd = this.parseTimeInput(endTimeInput);
            if (parsedEnd) {
              endTimeProps = parsedEnd;
              this.properties.endTimeHours = parsedEnd.hours;
              this.properties.endTimeMinutes = parsedEnd.minutes;
              this.properties.endTimePeriod = parsedEnd.period;
              const endHourWidget = this.widgets.find(w => w.name === "End Time Hours");
              const endMinuteWidget = this.widgets.find(w => w.name === "End Time Minutes");
              const endPeriodWidget = this.widgets.find(w => w.name === "End Time Period");
              if (endHourWidget) endHourWidget.value = parsedEnd.hours;
              if (endMinuteWidget) endMinuteWidget.value = parsedEnd.minutes;
              if (endPeriodWidget) endPeriodWidget.value = parsedEnd.period;
              this._cachedEndTime = null;
              this.currentStep = 0;
              this._lastTimeStep = null;
              stateChanged = true;
              if (this.properties.debug) console.log(`[ColorGradientNode] End Time overridden: ${endTimeInput}`);
            } else {
              if (this.properties.debug) console.log(`[ColorGradientNode] Failed to parse End Time: ${endTimeInput}`);
            }
          }

          if (!this._cachedStartTime || this._cachedStartTime.input !== `${startTimeProps.hours}:${startTimeProps.minutes}${startTimeProps.period}`) {
            this._cachedStartTime = {
              input: `${startTimeProps.hours}:${startTimeProps.minutes}${startTimeProps.period}`,
              value: this.parseTimeString(startTimeProps.hours, startTimeProps.minutes, startTimeProps.period),
            };
            stateChanged = true;
          }

          const startTime = this._cachedStartTime.value;
          if (!startTime) {
            this.setOutputData(0, null);
            this.setDirtyCanvas(true, true);
            if (this.properties.debug) console.log(`[ColorGradientNode] Failed to parse startTime`);
            return;
          }

          if (!this._cachedEndTime || this._cachedEndTime.input !== `${endTimeProps.hours}:${endTimeProps.minutes}${endTimeProps.period}`) {
            this._cachedEndTime = {
              input: `${endTimeProps.hours}:${endTimeProps.minutes}${endTimeProps.period}`,
              value: this.parseTimeString(endTimeProps.hours, endTimeProps.minutes, endTimeProps.period),
            };
            stateChanged = true;
          }
          let endTime = this._cachedEndTime.value;

          if (!endTime) {
            this.setOutputData(0, null);
            this.setDirtyCanvas(true, true);
            if (this.properties.debug) console.log(`[ColorGradientNode] Failed to parse endTime`);
            return;
          }

          let startMs = startTime.getTime();
          let endMs = endTime.getTime();

          if (endMs <= startMs) {
            endTime.setDate(endTime.getDate() + 1);
            endMs = endTime.getTime();
            if (this.properties.debug) console.log(`[ColorGradientNode] Adjusted End Time to next day: ${endTime}`);
            stateChanged = true;
          }

          // Handle time mode logic with out-of-range cases
          if (currentMs < startMs) {
            // Before start time: use start HSV values (position = 0)
            position = 0;
            this.isInRange = false; // Still considered out of range for UI purposes
            if (this.properties.debug) //console.log(`[ColorGradientNode] Before start time, using start HSV values (position=0)`);
            stateChanged = true;
          } else if (currentMs > endMs) {
            // After end time: use end HSV values (position = 1)
            position = 1;
            this.isInRange = false; // Still considered out of range for UI purposes
            if (this.properties.debug) //console.log(`[ColorGradientNode] After end time, using end HSV values (position=1)`);
            stateChanged = true;
          } else {
            // Within time range: calculate position as before
            this.isInRange = true;
            const totalSteps = Math.max(1, this.properties.timeSteps);
            const stepInterval = (endMs - startMs) / totalSteps;
            const elapsedMs = currentMs - startMs;
            const currentStep = Math.floor(elapsedMs / stepInterval);

            if (currentStep !== this._lastTimeStep || stateChanged) {
              position = currentStep / totalSteps;
              this._lastTimeStep = currentStep;
              stateChanged = true;
              if (this.properties.debug) console.log(`[ColorGradientNode] Time mode step: ${currentStep}/${totalSteps}, position=${position}`);
            } else {
              position = this._lastTimeStep / totalSteps;
            }
          }
        } else if (this.properties.rangeMode === "timer") {
          if (trigger && !this.timerStart) {
            this.timerStart = now.getTime();
            this.lastUpdateTime = null;
            this.currentStep = 0;
            stateChanged = true;
            if (this.properties.debug) {
              console.log(`[ColorGradientNode] Timer started at ${this.timerStart}`);
            }
          }

          if (!this.timerStart) {
            this.setOutputData(0, null);
            this.setDirtyCanvas(true, true);
            return;
          }

          if (trigger === false) {
            this.timerStart = null;
            this.isInRange = false;
            this.currentStep = 0;
            this.lastUpdateTime = null;
            this.setOutputData(0, null);
            this.setDirtyCanvas(true, true);
            return;
          }

          let unitMultiplier;
          switch (this.properties.timerUnit) {
            case "hours":
              unitMultiplier = 3600000;
              break;
            case "minutes":
              unitMultiplier = 60000;
              break;
            case "seconds":
            default:
              unitMultiplier = 1000;
              break;
          }

          const timerDurationInput = this.getInputData(2);
          const timerDuration = timerDurationInput !== undefined && !isNaN(timerDurationInput) && timerDurationInput > 0
            ? timerDurationInput
            : this.properties.timerDuration;

          if (this.properties.debug) {
            console.log(`[ColorGradientNode] Timer Duration: ${timerDuration} (input=${timerDurationInput}, widget=${this.properties.timerDuration})`);
          }

          const durationMs = timerDuration * unitMultiplier;
          const elapsed = now.getTime() - this.timerStart;

          if (elapsed >= durationMs) {
            position = 1;
            this.isInRange = true;
            if (trigger === true) {
              this.timerStart = now.getTime();
              this.lastUpdateTime = null;
              this.currentStep = 0;
              if (this.properties.debug) {
                console.log(`[ColorGradientNode] Timer completed, restarting at ${this.timerStart}`);
              }
            } else {
              this.currentStep = 0;
              this.lastUpdateTime = null;
              this.timerStart = null;
            }
            stateChanged = true;
          } else {
            const totalSteps = Math.floor(timerDuration);
            const stepSize = totalSteps > 0 ? 1 / totalSteps : 1;
            const stepInterval = durationMs / totalSteps;

            if (this.lastUpdateTime === null || (now.getTime() - this.lastUpdateTime) >= stepInterval) {
              position = this.currentStep * stepSize;
              this.isInRange = true;
              this.currentStep = Math.min(this.currentStep + 1, totalSteps);
              this.lastUpdateTime = now.getTime();
              stateChanged = true;
            } else {
              position = this.currentStep * stepSize;
              this.isInRange = true;
            }
          }
        }

        if (this.isInRange || this.properties.rangeMode === "time") {
          const h = this.properties.startHue + position * (this.properties.endHue - this.properties.startHue);
          const s = this.properties.startSaturation + position * (this.properties.endSaturation - this.properties.startSaturation);
          const v = this.properties.startBrightness + position * (this.properties.endBrightness - this.properties.startBrightness);

          const brightness = this.properties.useBrightnessOverride
            ? this.properties.brightnessOverride
            : v * 2.54;

          hsvInfo = {
            hue: h / 360,
            saturation: s / 100,
            brightness: brightness,
            hueStart: this.properties.startHue,
            hueEnd: this.properties.endHue,
          };

          const rgb = this.hsvToRgb(h, s, v);
          this.lastColor = { r: rgb.r, g: rgb.g, b: rgb.b };
          this.position = position;
          this.setOutputData(0, hsvInfo);
          if (stateChanged) {
            this.setDirtyCanvas(true, true);
            if (this.properties.debug) {
              //console.log(`[ColorGradientNode] Updated output: hue=${hsvInfo.hue}, saturation=${hsvInfo.saturation}, brightness=${hsvInfo.brightness}`);
            }
          }
        } else {
          this.setOutputData(0, null);
          if (stateChanged) {
            this.setDirtyCanvas(true, true);
          }
        }
      } catch (e) {
        console.error(`[ColorGradientNode] Error in onExecute: ${e.message}`);
        this.setOutputData(0, null);
        this.setDirtyCanvas(true, true);
      }
    }

    onDrawForeground(ctx) {
      try {
        if (super.onDrawForeground) super.onDrawForeground(ctx);

        ctx.fillStyle = "#FFF";
        ctx.font = "12px Arial";
        ctx.textAlign = "center";

        const paddingBottom = 10;
        const gradientBarHeight = 20;
        const textHeight = 20;
        const overlayTickHeight = 30;

        let y = this.properties.gradientBarYPosition;

        const gradientBarY = y;
        const gradientBarWidth = this.size[0] - 20;
        const gradient = ctx.createLinearGradient(10, gradientBarY, this.size[0] - 10, gradientBarY);
        for (let i = 0; i <= 10; i++) {
          const t = i / 10;
          const hue = this.properties.startHue + t * (this.properties.endHue - this.properties.startHue);
          const saturation = this.properties.startSaturation + t * (this.properties.endSaturation - this.properties.startSaturation);
          const brightness = this.properties.startBrightness + t * (this.properties.endBrightness - this.properties.startBrightness);
          gradient.addColorStop(t, `hsl(${hue}, ${saturation}%, ${Math.max(20, brightness / 2)}%)`); // Ensure min 40% brightness
        }
        ctx.fillStyle = gradient;
        ctx.fillRect(10, gradientBarY, gradientBarWidth, gradientBarHeight);

        const numTicks = 6;
        const tickSpacing = gradientBarWidth / (numTicks - 1);
        ctx.fillStyle = "#FFF";
        ctx.font = "10px Arial";
        ctx.textAlign = "center";
        const tickY = gradientBarY + gradientBarHeight + 5;

        if (this.properties.rangeMode === "numerical") {
          const startVal = this.properties.startValue;
          const endVal = this.properties.endValue;
          const range = endVal - startVal;
          for (let i = 0; i < numTicks; i++) {
            const x = 10 + i * tickSpacing;
            const t = i / (numTicks - 1);
            const value = startVal + t * range;
            ctx.fillText(value.toFixed(0), x, tickY + 10);
            ctx.strokeStyle = "#FFF";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, tickY);
            ctx.lineTo(x, tickY + 5);
            ctx.stroke();
          }
        } else if (this.properties.rangeMode === "time") {
          const startTime = this._cachedStartTime?.value;
          const endTime = this._cachedEndTime?.value;
          if (startTime && endTime) {
            let startMs = startTime.getTime();
            let endMs = endTime.getTime();
            if (endMs <= startMs) {
              endTime.setDate(endTime.getDate() + 1);
              endMs = endTime.getTime();
            }
            const rangeMs = endMs - startMs;
            for (let i = 0; i < numTicks; i++) {
              const x = 10 + i * tickSpacing;
              const t = i / (numTicks - 1);
              const tickMs = startMs + t * rangeMs;
              const tickDate = new Date(tickMs);
              let hours = tickDate.getHours();
              const minutes = tickDate.getMinutes();
              const period = hours >= 12 ? "PM" : "AM";
              hours = hours % 12 || 12;
              const timeStr = `${hours}:${minutes.toString().padStart(2, '0')} ${period}`;
              ctx.fillText(timeStr, x, tickY + 10);
              ctx.strokeStyle = "#FFF";
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(x, tickY);
              ctx.lineTo(x, tickY + 5);
              ctx.stroke();
            }
          }
        } else if (this.properties.rangeMode === "timer") {
          const timerDuration = this.properties.timerDuration;
          const unit = this.properties.timerUnit;
          for (let i = 0; i < numTicks; i++) {
            const x = 10 + i * tickSpacing;
            const t = i / (numTicks - 1);
            const value = t * timerDuration;
            ctx.fillText(`${value.toFixed(1)} ${unit}`, x, tickY + 10);
            ctx.strokeStyle = "#FFF";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, tickY);
            ctx.lineTo(x, tickY + 5);
            ctx.stroke();
          }
        }
        y += gradientBarHeight + overlayTickHeight;

        if (this.isInRange) {
          const markerX = 10 + this.position * gradientBarWidth;
          ctx.strokeStyle = "#FFF";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(markerX, gradientBarY + gradientBarHeight);
          ctx.lineTo(markerX, gradientBarY + gradientBarHeight + 10);
          ctx.stroke();

          ctx.fillStyle = "#FFF";
          ctx.beginPath();
          ctx.moveTo(markerX - 5, gradientBarY + gradientBarHeight);
          ctx.lineTo(markerX + 5, gradientBarY + gradientBarHeight);
          ctx.lineTo(markerX, gradientBarY + gradientBarHeight + 5);
          ctx.closePath();
          ctx.fill();
          y += 15;
        }

        if (this.lastColor) {
          ctx.fillStyle = `rgb(${this.lastColor.r}, ${this.lastColor.g}, ${this.lastColor.b})`;
          ctx.fillRect(this.size[0] / 2 - 10, y, 20, 20);
          y += 25;
        }

        if (!this.isInRange) {
          ctx.fillStyle = "#FFF";
          ctx.font = "12px Arial";
          ctx.fillText("Outside Range", this.size[0] / 2, y);
          y += textHeight;
        } else if (this.properties.rangeMode === "numerical") {
          const inputValue = this.getInputData(0);
          if (inputValue !== undefined) {
            const clampedValue = Math.max(this.properties.startValue, Math.min(this.properties.endValue, inputValue));
            if (inputValue !== clampedValue) {
              ctx.fillText(`Input: ${inputValue} (clamped to ${clampedValue})`, this.size[0] / 2, y);
              y += textHeight;
            }
          }
        } else if (this.properties.rangeMode === "timer" && this.timerStart) {
          const durationMs = this.properties.timerDuration * (this.properties.timerUnit === "hours" ? 3600000 : this.properties.timerUnit === "minutes" ? 60000 : 1000);
          const elapsedMs = new Date().getTime() - this.timerStart;
          const elapsed = elapsedMs / (this.properties.timerUnit === "hours" ? 3600000 : this.properties.timerUnit === "minutes" ? 60000 : 1000);
          ctx.fillText(`Elapsed: ${elapsed.toFixed(1)} of ${this.properties.timerDuration} ${this.properties.timerUnit}`, this.size[0] / 2, y);
          y += textHeight;
        } else if (this.properties.rangeMode === "time") {
          ctx.fillText(`Step: ${this._lastTimeStep !== null ? this._lastTimeStep : 0}/${this.properties.timeSteps}`, this.size[0] / 2, y);
          y += textHeight;
        }

        ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
        const overlayHeight = 45;
        const overlayY = y;
        ctx.fillRect(10, overlayY, this.size[0] - 20, overlayHeight);
        ctx.fillStyle = "#FFF";
        ctx.textAlign = "left";
        let overlayTextY = overlayY + 15;

        const timeValues = [
          `Start Time: ${this.properties.startTimeHours}:${this.properties.startTimeMinutes.toString().padStart(2, '0')} ${this.properties.startTimePeriod}`,
          `End Time: ${this.properties.endTimeHours}:${this.properties.endTimeMinutes.toString().padStart(2, '0')} ${this.properties.endTimePeriod}`,
        ];

        timeValues.forEach((text) => {
          ctx.fillText(text, 15, overlayTextY);
          overlayTextY += 15;
        });

        const minHeight = overlayY + overlayHeight + paddingBottom;
        if (this.size[1] < minHeight) {
          this.size[1] = minHeight;
          if (this.graph && this.graph.canvas) {
            this.graph.canvas.setDirty(true, true);
          }
        }

        if (this.size[0] < 450) {
          this.size[0] = 450;
          if (this.graph && this.graph.canvas) {
            this.graph.canvas.setDirty(true, true);
          }
        }
      } catch (e) {
        console.error(`[ColorGradientNode] Error in onDrawForeground: ${e.message}`);
      }
    }

    onDrawBackground(ctx) {
      try {
        // Call the parent class's onDrawBackground if it exists
        if (super.onDrawBackground) super.onDrawBackground(ctx);

        // Draw the default node background
        ctx.fillStyle = this.bgcolor || "#000000";
        ctx.fillRect(0, 0, this.size[0], this.size[1]);

        // Add subtle green outline if the node is active (isInRange is true)
        if (this.isInRange) {
          ctx.strokeStyle = "rgba(0, 255, 0, 0.5)"; // Subtle green with 50% opacity
          ctx.lineWidth = 2;
          ctx.strokeRect(1, 1, this.size[0] - 2, this.size[1] - 2); // Offset slightly to avoid clipping
        }
      } catch (e) {
        console.error(`[ColorGradientNode] Error in onDrawBackground: ${e.message}`);
      }
    }


    syncWidgetsToProperties() {
      try {
        const widgets = this.widgets || [];
        widgets.forEach(widget => {
          if (widget.name === "Color Mode") widget.value = this.properties.colorMode;
          else if (widget.name === "Wedge") widget.value = this.properties.predefinedWedge;
          else if (widget.name === "Start Hue") widget.value = Math.round(this.properties.startHue);
          else if (widget.name === "Start Saturation") widget.value = Math.round(this.properties.startSaturation);
          else if (widget.name === "Start Brightness") widget.value = Math.round(this.properties.startBrightness);
          else if (widget.name === "End Hue") widget.value = Math.round(this.properties.endHue);
          else if (widget.name === "End Saturation") widget.value = Math.round(this.properties.endSaturation);
          else if (widget.name === "End Brightness") widget.value = Math.round(this.properties.endBrightness);
          else if (widget.name === "Range Mode") widget.value = this.properties.rangeMode;
          else if (widget.name === "Range Start") widget.value = Math.round(this.properties.startValue);
          else if (widget.name === "Range End") widget.value = Math.round(this.properties.endValue);
          else if (widget.name === "Start Time Hours") widget.value = Math.round(this.properties.startTimeHours);
          else if (widget.name === "Start Time Minutes") widget.value = Math.round(this.properties.startTimeMinutes);
          else if (widget.name === "Start Time Period") widget.value = this.properties.startTimePeriod;
          else if (widget.name === "End Time Hours") widget.value = Math.round(this.properties.endTimeHours);
          else if (widget.name === "End Time Minutes") widget.value = Math.round(this.properties.endTimeMinutes);
          else if (widget.name === "End Time Period") widget.value = this.properties.endTimePeriod;
          else if (widget.name === "Timer Duration") widget.value = Math.round(this.properties.timerDuration);
          else if (widget.name === "Timer Unit") widget.value = this.properties.timerUnit;
          else if (widget.name === "Time Steps") widget.value = Math.round(this.properties.timeSteps);
          else if (widget.name === "Gradient Y Position") widget.value = Math.round(this.properties.gradientBarYPosition);
          else if (widget.name === "Override Brightness") widget.value = this.properties.useBrightnessOverride;
          else if (widget.name === "Brightness") widget.value = Math.round(this.properties.brightnessOverride);
          else if (widget.name === "Debug") widget.value = this.properties.debug;
          else if (widget.name === "Enable Reconnect") widget.value = this.properties.enableReconnect;
          else if (widget.name === "Reconnect Interval (ms)") widget.value = Math.round(this.properties.reconnectInterval);
        });

        if (this.properties.debug) {
          console.log(
            `[ColorGradientNode] After updateWidgets: startValue=${this.properties.startValue}, endValue=${this.properties.endValue}`
          );
        }

        this.setDirtyCanvas(true, true);
      } catch (e) {
        console.error(`[ColorGradientNode] Error in updateWidgets: ${e.message}`);
      }
    }
  }

  LiteGraph.registerNodeType("HomeAssistant/ColorGradientNode", ColorGradientNode);
  console.log("ColorGradientNode - Registered successfully under 'HomeAssistant' category.");
}