if (typeof LiteGraph !== "undefined" && !LiteGraph.registered_node_types?.["HomeAssistant/TimeTriggerNode"]) {
  // Register toggle_command type inside the block to ensure LiteGraph is defined
  // light_info is already registered by HADeviceStateOutputNode
  if (!LiteGraph.registered_types?.["toggle_command"]) {
    try {
      LiteGraph.registerType("toggle_command", "object");
    } catch (error) {
      console.error("Failed to register toggle_command type:", error);
    }
  }

  class TimeTriggerNode extends LiteGraph.LGraphNode {
    constructor() {
      super();
      Object.assign(this, {
        title: "Time Trigger",
        resizable: true,
        autosize: false,
        bgcolor: "rgb(120, 160, 100)",
        properties: {
          targetTime: "00:00",
          useDynamicTime: false,
          status: "Waiting for input...",
          debug: false,
          debugLevel: 1,
        },
        toggleStates: {},
        lastLogTime: 0,
        logCount: 0,
      });

      this.addInput("Device Data", "light_info");
      this.addOutput("Toggle Command", "toggle_command");
      this.setupWidgets();

      this.log("constructor", `Input type for Device Data: ${this.inputs[0]?.type}`, true);
    }

    log = (key, message, force = false) => {
      if (!force && (!this.properties.debug || this.properties.debugLevel === 0)) return;
      const now = Date.now();
      if (now - this.lastLogTime < 100 && this.logCount >= 10 && !force) return;
      if (now - this.lastLogTime >= 1000) {
        this.logCount = 0;
        this.lastLogTime = now;
      }
      this.logCount++;
      this.lastLogged = this.lastLogged || {};
      const lastLog = this.lastLogged[key] || { time: 0, message: "" };
      if (force || now - lastLog.time > 5000 || lastLog.message !== message) {
        if (this.properties.debugLevel === 1 && !force && key.includes("execute")) return;
        this.lastLogged[key] = { time: now, message };
      }
    };

    setupWidgets = () => {
      try {
        const widgetWidth = this.size[0] - 20;
        const widgets = [
          {
            type: "text",
            name: "Target Time (HH:mm)",
            value: this.properties.targetTime,
            callback: (v) => {
              if (/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v)) {
                this.properties.targetTime = v;
                this.log("targetTimeUpdate", `Updated target time to ${v}`, true);
                this.updateStatus(`✅ Target time set to ${v}`);
              } else {
                this.log("targetTimeError", `Invalid time format: ${v}. Use HH:mm (24-hour).`, true);
                this.updateStatus(`⚠️ Invalid target time: ${v}. Use HH:mm (e.g., 00:00).`);
              }
            },
            options: { width: 150 },
          },
          {
            type: "toggle",
            name: "Use Dynamic Time",
            value: this.properties.useDynamicTime,
            callback: (v) => {
              this.properties.useDynamicTime = v;
              this.log("useDynamicTimeToggle", `Use dynamic time ${v ? "enabled" : "disabled"}`, true);
              this.updateStatus(`✅ Use dynamic time ${v ? "enabled" : "disabled"}`);
            },
            options: { width: 150 },
          },
          {
            type: "toggle",
            name: "Debug Logs",
            value: this.properties.debug,
            callback: (v) => {
              this.properties.debug = v;
              this.log("debugToggle", `Debug logging ${v ? "enabled" : "disabled"}`, true);
            },
            options: { width: 100 },
          },
          {
            type: "combo",
            name: "Debug Level",
            value: this.properties.debugLevel.toString(),
            callback: (v) => {
              this.properties.debugLevel = parseInt(v);
              this.log("debugLevel", `Debug level set to ${v}`, true);
            },
            options: { values: ["0", "1", "2"], width: 60 },
          },
          {
            type: "text",
            name: "Status",
            value: this.properties.status,
            options: { property: "status", readonly: true, width: widgetWidth - 200 },
          },
        ];

        this.widgets = widgets.map(({ type, name, value, callback, options }) =>
          this.addWidget(type, name, value, callback, options)
        );
        this.statusWidget = this.widgets.find((w) => w.name === "Status");
      } catch (error) {
        this.log("setupWidgetsError", `Error setting up widgets: ${error.message}`, true);
        this.updateStatus(`⚠️ Error setting up widgets: ${error.message}`);
      }
    };

    updateStatus = (message) => {
      if (message !== this.properties.status) {
        this.properties.status = message;
        if (this.statusWidget) this.statusWidget.value = message;
        this.setDirtyCanvas(true);
        this.log("updateStatus", `Updated status: ${message}`, true);
      }
    };

    updateNodeSize = () => {
      this.size[0] = 400;
      const baseHeight = 40;
      let widgetsHeight = this.widgets.reduce((sum, w) => sum + (w.computeSize?.(this.size[0])[1] ?? LiteGraph.NODE_WIDGET_HEIGHT), 0);
      widgetsHeight += 15;
      const extraHeight = 20 * this.outputs.length;
      this.size[1] = baseHeight + widgetsHeight + 45 + extraHeight;
      this.setSize([this.size[0], this.size[1]]);
      this.setDirtyCanvas(true);
    };

    parseLocalTime(timeStr, referenceDate) {
      try {
        const [time, period] = timeStr.split(" ");
        let [hours, minutes] = time.split(":").map(Number);
        if (period === "PM" && hours !== 12) hours += 12;
        if (period === "AM" && hours === 12) hours = 0;
        const date = new Date(referenceDate);
        date.setHours(hours, minutes, 0, 0);
        return date;
      } catch (error) {
        this.log("parseLocalTimeError", `Error parsing time ${timeStr}: ${error.message}`, true);
        return null;
      }
    }

    parseTargetTime(targetTime, referenceDate) {
      try {
        const [hours, minutes] = targetTime.split(":").map(Number);
        const target = new Date(referenceDate);
        target.setHours(hours, minutes, 0, 0);
        return target;
      } catch (error) {
        this.log("parseTargetTimeError", `Error parsing target time ${targetTime}: ${error.message}`, true);
        return null;
      }
    }

    onExecute = () => {
      const data = this.getInputData(0);
      if (!data || !data.lights || !Array.isArray(data.lights)) {
        this.updateStatus("⚠️ No valid device data received");
        this.setOutputData(0, null);
        return;
      }

      const now = new Date();
      const toggleCommands = [];

      data.lights.forEach((device) => {
        const deviceId = device.light_id;
        if (!deviceId) return;

        this.toggleStates[deviceId] = this.toggleStates[deviceId] || { lastTriggeredValue: null, hasTriggered: false };

        let targetDate;
        if (this.properties.useDynamicTime) {
          const sunNextDawn = device.attributes?.sun_next_dawn || device.value;
          if (!sunNextDawn || typeof sunNextDawn !== "string") {
            this.log("executeWarn", `No valid sun_next_dawn time for ${deviceId}`, true);
            return;
          }
          targetDate = this.parseLocalTime(sunNextDawn, now);
          if (!targetDate) {
            this.updateStatus(`⚠️ Invalid sun_next_dawn time for ${deviceId}: ${sunNextDawn}`);
            return;
          }
        } else {
          targetDate = this.parseTargetTime(this.properties.targetTime, now);
          if (!targetDate) {
            this.updateStatus(`⚠️ Invalid target time: ${this.properties.targetTime}`);
            return;
          }
        }

        if (targetDate < now) {
          targetDate.setDate(targetDate.getDate() + 1);
        }

        const timeFieldValue = device.attributes?.sun_next_dawn || device.value || "unknown";
        const toggleState = this.toggleStates[deviceId];

        if (toggleState.lastTriggeredValue !== timeFieldValue) {
          toggleState.lastTriggeredValue = timeFieldValue;
          toggleState.hasTriggered = false;
          this.log("execute", `Reset trigger state for ${deviceId} due to new time value: ${timeFieldValue}`, true);
        }

        if (!toggleState.hasTriggered && now >= targetDate) {
          toggleCommands.push({ deviceId, toggle: true });
          toggleState.hasTriggered = true;
          this.log("execute", `Triggering toggle for ${deviceId} at ${targetDate.toLocaleTimeString()}`, true);
          this.updateStatus(`✅ Triggered toggle for ${deviceId} at ${targetDate.toLocaleTimeString()}`);
        } else if (now < targetDate) {
          this.log("execute", `Waiting for ${deviceId}: Current time ${now.toLocaleTimeString()} < Target time ${targetDate.toLocaleTimeString()}`, true);
        }
      });

      this.setOutputData(0, toggleCommands.length > 0 ? toggleCommands : null);
    };

    onDrawForeground = (ctx) => {
      if (super.onDrawForeground) super.onDrawForeground(ctx);
      let widgetsHeight = this.widgets.reduce((sum, w) => sum + (w.computeSize?.(this.size[0])[1] ?? LiteGraph.NODE_WIDGET_HEIGHT), 0);
      widgetsHeight += 15;
      const overlayStartY = widgetsHeight + 60;

      ctx.fillStyle = "#E0E0E0";
      ctx.font = "12px Roboto, Arial, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`Target: ${this.properties.useDynamicTime ? "Dynamic (sun_next_dawn)" : this.properties.targetTime}`, 10, overlayStartY);
    };

    onConnectionsChange = (type, index, connected, link_info) => {
      if (type === LiteGraph.INPUT && index === 0) {
        if (connected) {
          this.log("connection", `Connected input to ${link_info.origin_id}:${link_info.origin_slot}`, true);
          const originNode = this.graph.getNodeById(link_info.origin_id);
          const originOutputType = originNode.outputs[link_info.origin_slot]?.type;
          this.log("connection", `Origin output type: ${originOutputType}, Expected: light_info`, true);
          if (originOutputType !== "light_info") {
            this.updateStatus(`⚠️ Warning: Expected light_info, got ${originOutputType}`);
          }
        } else {
          this.log("connection", `Disconnected input`, true);
        }
      }
    };
  }

  LiteGraph.registerNodeType("HomeAssistant/TimeTriggerNode", TimeTriggerNode);
}