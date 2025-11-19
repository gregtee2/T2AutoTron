if (!LiteGraph.registered_node_types?.["HomeAssistant/HADeviceStateDisplayNode"]) {
  class HADeviceStateDisplayNode extends LiteGraph.LGraphNode {
    constructor() {
      super();
      Object.assign(this, {
        title: "Home Assistant Device State Display",
        resizable: true,
        autosize: false,
        bgcolor: "rgb(120, 160, 200)",
        properties: {
          status: "Waiting for input data",
          debug: false,
        },
      });

      // Input and Output
      this.addInput("Device State", "light_info");
      this.addOutput("Device State", "light_info");

      // Initialize widgets
      this.setupWidgets();
    }

    log = (key, message, force = false) => {
      if (!this.properties.debug && !force) return;
      const now = Date.now();
      this.lastLogged = this.lastLogged || {};
      const lastLog = this.lastLogged[key] || { time: 0, message: "" };
      if (force || now - lastLog.time > 1000 || lastLog.message !== message) {
        console.log(`HADeviceStateDisplayNode - ${message}`);
        this.lastLogged[key] = { time: now, message };
      }
    };

    setupWidgets = () => {
      try {
        const widgetWidth = this.size[0] - 20;
        const widgets = [
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
            type: "text",
            name: "Data Display",
            value: this.properties.status,
            options: { property: "status", readonly: true, width: widgetWidth - 100 },
          },
        ];

        this.widgets = widgets.map(({ type, name, value, callback, options }) =>
          this.addWidget(type, name, value, callback, options)
        );
        this.statusWidget = this.widgets.find((w) => w.name === "Data Display");
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
      let widgetsHeight = this.widgets.reduce(
        (sum, w) => sum + (w.computeSize?.(this.size[0])[1] ?? LiteGraph.NODE_WIDGET_HEIGHT),
        0
      );
      widgetsHeight += 15;
      const extraHeight = 20 * this.outputs.length;
      this.size[1] = baseHeight + widgetsHeight + 100; // Increased height for raw data display
      this.setSize([this.size[0], this.size[1]]);
      this.setDirtyCanvas(true);
    };

    isActionable = (entityType) => {
      const actionableTypes = ["light", "switch", "fan", "cover", "media_player"];
      return actionableTypes.includes(entityType?.toLowerCase() || "");
    };

    onDrawForeground = (ctx) => {
      if (super.onDrawForeground) super.onDrawForeground(ctx);
      let widgetsHeight = this.widgets.reduce(
        (sum, w) => sum + (w.computeSize?.(this.size[0])[1] ?? LiteGraph.NODE_WIDGET_HEIGHT),
        0
      );
      widgetsHeight += 15;
      const startY = widgetsHeight + 20;

      ctx.fillStyle = "#E0E0E0";
      ctx.font = "12px Roboto, Arial, sans-serif";
      ctx.textAlign = "left";

      const inputData = this.getInputData(0);
      if (!inputData || !inputData.lights || !Array.isArray(inputData.lights) || inputData.lights.length === 0) {
        ctx.fillText("No valid device data received", 10, startY);
        return;
      }

      const device = inputData.lights[0];
      const isActionable = this.isActionable(device.entity_type);
      const rawData = JSON.stringify(device, null, 2).split("\n");
      const lines = [
        `Actionable: ${isActionable ? "Yes" : "No"}`,
        `Raw Data:`,
        ...rawData,
      ];

      lines.forEach((line, index) => {
        ctx.fillText(line, 10, startY + index * 15);
      });
    };

    onExecute = () => {
      const inputData = this.getInputData(0);
      if (!inputData || !inputData.lights || !Array.isArray(inputData.lights) || inputData.lights.length === 0) {
        this.updateStatus("⚠️ No valid device data received");
        this.log("executeDebug", "No valid input data", true);
        this.setOutputData(0, null);
        return;
      }

      const device = inputData.lights[0];
      this.log("executeDebug", `Received raw data: ${JSON.stringify(device, null, 2)}`, true);

      const isActionable = this.isActionable(device.entity_type);
      const statusMessage = `Device: ${device.name || "Unknown"} | Type: ${device.entity_type || "Unknown"} | Actionable: ${isActionable ? "Yes" : "No"}`;
      this.updateStatus(statusMessage);

      // Pass through the input data to the output
      this.setOutputData(0, inputData);
      this.log("executeDebug", `Set output data: ${JSON.stringify(inputData, null, 2)}`, true);

      this.setDirtyCanvas(true);
    };
  }

  LiteGraph.registerNodeType("HomeAssistant/HADeviceStateDisplayNode", HADeviceStateDisplayNode);
}