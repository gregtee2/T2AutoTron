if (!LiteGraph.registered_node_types?.["HomeAssistant/HADeviceAutomationNode"]) {
  class HADeviceAutomationNode extends LiteGraph.LGraphNode {
    constructor() {
      super();
      Object.assign(this, {
        title: "Home Assistant Device Automation",
        resizable: true,
        autosize: false,
        bgcolor: "rgb(50, 100, 150)",
        properties: {
          status: "Waiting for input data",
          debug: false,
          debugLevel: 1,
          lastEntityType: "unknown",
          serializedEntityType: null,
          enableReconnect: false, // New property
          reconnectInterval: 600000, // New property: 10 minutes
        },
        lastOutputFields: [],
        selectedFields: [],
        fieldWidgets: [],
        fieldMapping: {
          light: ["state", "hue", "saturation", "brightness"],
          switch: ["open"],
          fan: ["on"],
          cover: [],
          media_player: [
            "state",
            "volume_level",
            "media_title",
            "media_content_type",
            "media_artist",
            "shuffle",
            "repeat",
            "supported_features",
          ],
          binary_sensor: ["state", "battery"],
          sensor: ["value", "unit", "temperature", "pressure", "battery_level"],
          weather: ["temperature", "humidity", "condition", "pressure", "wind_speed"],
          device_tracker: ["state", "zone", "latitude", "longitude"],
          unknown: ["state"],
        },
        retryAttempts: 0,
        maxRetryAttempts: 3,
        retryCooldown: 0,
        lastRetryCycle: 0,
        lastOutputValues: [],
        lastInputHash: null,
        lastForceUpdate: 0,
        stepInterval: null,
        _reconnectTimer: null, // New timer for reconnect
      });

      this.addInput("Device State", "light_info");
      this.setupWidgets();
      this.startGraphStepping();
      this.setupReconnectTimer(); // Initialize reconnect timer
    }

    startGraphStepping() {
      if (!this.stepInterval) {
        this.stepInterval = setInterval(() => {
          if (this.graph) {
            this.graph._version++;
            this.graph.runStep();
            if (this.properties.debug) {
              this.log("graphStepping", "Internal graph step triggered", true);
            }
          }
        }, 1000);
        if (this.properties.debug) {
          this.log("graphStepping", "Started internal graph stepping", true);
        }
      }
    }

    stopGraphStepping() {
      if (this.stepInterval) {
        clearInterval(this.stepInterval);
        this.stepInterval = null;
        if (this.properties.debug) {
          this.log("graphStepping", "Stopped internal graph stepping", true);
        }
      }
    }

    log(key, message, force = false) {
      if (!force && (!this.properties.debug || this.properties.debugLevel === 0)) return;
      const now = Date.now();
      this.lastLogTime = this.lastLogTime || 0;
      this.logCount = this.logCount || 0;
      if (now - this.lastLogTime < 100 && this.logCount >= 10 && !force) return;
      if (now - this.lastLogTime >= 1000) {
        this.logCount = 0;
        this.lastLogTime = now;
      }
      this.logCount++;
      this.lastLogged = this.lastLogged || {};
      const lastLog = this.lastLogged[key] || { time: 0, message: "" };
      if (force || now - lastLog.time > 5000 || lastLog.message !== message) {
        if (this.properties.debugLevel === 1 && !force && (key.includes("execute") || key.includes("Debug"))) return;
        //console.log(`[HADeviceAutomationNode] ${key}: ${message}`);
        this.lastLogged[key] = { time: now, message };
      }
    }

    setupWidgets() {
      try {
        const widgetWidth = this.size[0] - 20;
        const widgets = [
          {
            type: "button",
            name: "➕",
            value: "Add Field",
            callback: () => this.onAddField(),
            options: { width: 40 },
          },
          {
            type: "button",
            name: "➖",
            value: "Remove Field",
            callback: () => this.onRemoveField(),
            options: { width: 40 },
          },
          {
            type: "button",
            name: "🔄",
            value: "Reset Fields",
            callback: () => this.onResetFields(),
            options: { width: 40 },
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
            options: { property: "", readonly: true, width: widgetWidth - 120 },
          },
          // New reconnect widgets
          {
            type: "toggle",
            name: "Enable Reconnect",
            value: this.properties.enableReconnect,
            callback: (v) => {
              this.properties.enableReconnect = v;
              this.setDirtyCanvas(true, true);
            },
            options: { width: 100 },
          },
          {
            type: "number",
            name: "Reconnect Interval (ms)",
            value: this.properties.reconnectInterval,
            callback: (v) => {
              this.properties.reconnectInterval = Math.max(1000, Math.min(1800000, Math.round(v)));
              this.setDirtyCanvas(true, true);
            },
            options: { min: 1000, max: 1800000, step: 1000, precision: 0, width: 120 },
          },
        ];

        this.widgets = widgets.map(({ type, name, value, callback, options }) =>
          this.addWidget(type, name, value, callback, options)
        );
        this.statusWidget = this.widgets.find((w) => w.name === "Status");
      } catch (error) {
        this.log("Error", `Setup error: ${error.message}`, true);
        this.updateStatus(`Error: ${error.message}`);
      }
    }

    updateStatus(message) {
      if (message !== this.properties.status) {
        this.properties.status = message;
        if (this.statusWidget) this.statusWidget.value = message;
        this.setDirtyCanvas(true);
        this.log("Status", message, true);
      }
    }

    updateNodeSize() {
      this.size[0] = 400;
      const baseHeight = 40;
      let widgetsHeight = this.widgets.reduce(
        (sum, w) => sum + (w.computeSize?.(this.size[0])[1] ?? LiteGraph.NODE_WIDGET_HEIGHT),
        0
      );
      widgetsHeight += 15;
      const extraHeight = 20 * (this.outputs.length + 1);
      this.size[1] = baseHeight + widgetsHeight + extraHeight + 20;
      this.setSize([this.size[0], this.size[1]]);
      this.setDirtyCanvas(true);
    }

    onAddField() {
      if (this.fieldWidgets.length >= 10) {
        this.updateStatus("Max 10 fields reached");
        return;
      }

      const inputData = this.getInputData(0);
      const entityType = inputData?.lights?.[0]?.entity_type?.toLowerCase() || this.properties.lastEntityType || "unknown";
      const availableFields = this.fieldMapping[entityType] || this.fieldMapping.unknown;
      this.log("AddField", `Available fields for ${entityType}: ${availableFields.join(", ")}`, true);

      const fieldSelector = this.addWidget(
        "combo",
        `Select Field ${this.fieldWidgets.length + 1}`,
        "Select Field",
        (value) => this.onFieldSelected(value, this.fieldWidgets.indexOf(fieldSelector)),
        { values: ["Select Field", ...availableFields], width: this.size[0] - 20 }
      );
      this.fieldWidgets.push(fieldSelector);
      this.selectedFields.push(null);

      this.updateNodeSize();
      this.setDirtyCanvas(true);
      this.updateStatus(`Added field selector ${this.fieldWidgets.length}`);
      this.log("AddField", `Added field selector ${this.fieldWidgets.length}`, true);
    }

    onRemoveField() {
      if (!this.fieldWidgets.length) {
        this.updateStatus("No fields to remove");
        return;
      }
      const fieldSelector = this.fieldWidgets.pop();
      this.widgets = this.widgets.filter(w => w !== fieldSelector);
      this.selectedFields.pop();

      const validFields = this.selectedFields.filter(f => f !== null);
      const fieldsToRemove = this.lastOutputFields.filter(f => !validFields.includes(f));
      fieldsToRemove.forEach(field => {
        const slotIndex = this.lastOutputFields.indexOf(field);
        if (slotIndex !== -1) {
          this.removeOutput(slotIndex);
          this.lastOutputFields.splice(slotIndex, 1);
          this.lastOutputValues.splice(slotIndex, 1);
          this.log("RemoveField", `Removed output slot ${slotIndex} (${field})`, true);
        }
      });
      this.lastOutputFields = validFields;

      this.updateStatus(this.lastOutputFields.length ? `Fields: ${this.lastOutputFields.join(", ")}` : "No fields selected");
      this.updateNodeSize();
      this.setDirtyCanvas(true);
      this.log("RemoveField", `Removed field selector, fieldWidgets=${this.fieldWidgets.length}`, true);
    }

    onResetFields() {
      this.selectedFields = [];
      this.lastOutputFields = [];
      this.lastOutputValues = [];
      this.fieldWidgets.forEach(widget => {
        this.widgets = this.widgets.filter(w => w !== widget);
      });
      this.fieldWidgets = [];

      while (this.outputs.length > 0) {
        this.removeOutput(0);
      }

      const inputData = this.getInputData(0);
      const entityType = inputData?.lights?.[0]?.entity_type?.toLowerCase() || this.properties.lastEntityType || "unknown";
      this.properties.lastEntityType = entityType;
      this.properties.serializedEntityType = entityType;
      this.log("ResetFields", `Reset fields for entityType ${entityType}`, true);

      this.updateNodeSize();
      this.setDirtyCanvas(true);
      this.updateStatus("No fields selected");
      this.log("ResetFields", `Fields reset, fieldWidgets=${this.fieldWidgets.length}`, true);
    }

    restoreFieldWidgets() {
      this.log("RestoreWidgets", `Restoring ${this.selectedFields.length} field widgets`, true);

      this.fieldWidgets.forEach(widget => {
        this.widgets = this.widgets.filter(w => w !== widget);
      });
      this.fieldWidgets = [];

      let entityType = this.properties.serializedEntityType || this.properties.lastEntityType || "unknown";
      let availableFields = this.fieldMapping[entityType] || this.fieldMapping.unknown;

      const inputData = this.getInputData(0);
      if (!this.properties.serializedEntityType && inputData?.lights?.[0]?.entity_type) {
        const inputEntityType = inputData.lights[0].entity_type.toLowerCase();
        if (inputEntityType !== "unknown") {
          entityType = inputEntityType;
          availableFields = this.fieldMapping[entityType] || this.fieldMapping.unknown;
          this.properties.lastEntityType = entityType;
          this.log("RestoreWidgets", `Using entityType ${entityType} from input data`, true);
        }
      }

      this.selectedFields.forEach((field, index) => {
        const validValue = field && availableFields.includes(field) ? field : "Select Field";
        const fieldSelector = this.addWidget(
          "combo",
          `Select Field ${index + 1}`,
          validValue,
          (value) => this.onFieldSelected(value, this.fieldWidgets.indexOf(fieldSelector)),
          { values: ["Select Field", ...availableFields], width: this.size[0] - 20 }
        );
        this.fieldWidgets.push(fieldSelector);
        this.log("RestoreWidgets", `Restored field widget ${index + 1}: ${validValue}`, true);
      });

      this.lastOutputFields = this.selectedFields.filter(f => f !== null && availableFields.includes(f));

      this.outputs = [];
      this.lastOutputFields.forEach((field, index) => {
        this.addOutput(field, "number,string,boolean");
        if (this.lastOutputValues[index] !== undefined) {
          this.setOutputData(index, this.lastOutputValues[index]);
          this.log("RestoreWidgets", `Restored output value for ${field}: ${this.lastOutputValues[index]}`, true);
        }
      });

      this.updateNodeSize();
      this.setDirtyCanvas(true);
      this.log("RestoreWidgets", `Restored: fieldWidgets=${this.fieldWidgets.length}, outputs=${this.lastOutputFields.join(", ")}`, true);
    }

    onFieldSelected(value, index) {
      if (value === "Select Field") {
        const removedField = this.selectedFields[index];
        this.selectedFields[index] = null;
        if (removedField) {
          const slotIndex = this.lastOutputFields.indexOf(removedField);
          if (slotIndex !== -1) {
            this.removeOutput(slotIndex);
            this.lastOutputFields.splice(slotIndex, 1);
            this.lastOutputValues.splice(slotIndex, 1);
            this.log("FieldSelected", `Removed output slot ${slotIndex} (${removedField})`, true);
          }
        }
        this.updateStatus(this.lastOutputFields.length ? `Fields: ${this.lastOutputFields.join(", ")}` : "No fields selected");
        this.log("FieldSelected", `Deselected field at selector ${index + 1}`, true);
        return;
      }

      const inputData = this.getInputData(0);
      const entityType = inputData?.lights?.[0]?.entity_type?.toLowerCase() || this.properties.lastEntityType || "unknown";
      const availableFields = this.fieldMapping[entityType] || this.fieldMapping.unknown;

      if (!availableFields.includes(value)) {
        this.updateStatus(`Field "${value}" not available for ${entityType}`);
        this.fieldWidgets[index].value = "Select Field";
        this.log("FieldSelected", `Field "${value}" not available for ${entityType}`, true);
        return;
      }

      if (this.selectedFields.includes(value)) {
        this.updateStatus(`Field "${value}" already selected`);
        this.fieldWidgets[index].value = "Select Field";
        return;
      }

      const oldField = this.selectedFields[index];
      this.selectedFields[index] = value;
      this.properties.serializedEntityType = entityType;

      if (oldField) {
        const slotIndex = this.lastOutputFields.indexOf(oldField);
        if (slotIndex !== -1) {
          this.removeOutput(slotIndex);
          this.lastOutputFields.splice(slotIndex, 1);
          this.lastOutputValues.splice(slotIndex, 1);
          this.log("FieldSelected", `Removed old output slot ${slotIndex} (${oldField})`, true);
        }
      }

      this.lastOutputFields = this.selectedFields.filter(f => f !== null);
      const newSlotIndex = this.lastOutputFields.indexOf(value);
      this.addOutput(value, "number,string,boolean", newSlotIndex);
      this.log("FieldSelected", `Added output slot ${newSlotIndex} (${value})`, true);

      this.updateNodeSize();
      this.setDirtyCanvas(true);
      this.updateStatus(`Fields: ${this.lastOutputFields.join(", ")}`);
      this.log("FieldSelected", `Selected field "${value}" at selector ${index + 1}`, true);
    }

    updateOutputSlots() {
      const validFields = this.selectedFields.filter(f => f !== null);
      const inputData = this.getInputData(0);
      const entityType = inputData?.lights?.[0]?.entity_type?.toLowerCase() || this.properties.lastEntityType || "unknown";
      this.properties.lastEntityType = entityType;
      this.properties.serializedEntityType = entityType;
      const availableFields = this.fieldMapping[entityType] || this.fieldMapping.unknown;
      this.log("UpdateSlots", `Updating fields for ${entityType}`, true);

      const filteredFields = validFields.filter(f => availableFields.includes(f));
      if (filteredFields.length !== validFields.length) {
        const invalidFields = validFields.filter(f => !availableFields.includes(f));
        this.log("UpdateSlots", `Filtered invalid fields: ${invalidFields.join(", ")}`, true);
      }

      this.selectedFields = this.selectedFields.map(f => (filteredFields.includes(f) ? f : null));
      this.fieldWidgets = this.fieldWidgets.filter(widget => widget && widget.options && widget.type === "combo");

      this.fieldWidgets.forEach((widget, index) => {
        if (!widget || !widget.options) return;
        if (!filteredFields.includes(widget.value) && widget.value !== "Select Field") {
          widget.value = "Select Field";
        }
        widget.options.values = ["Select Field", ...availableFields];
      });

      const fieldsToAdd = filteredFields.filter(f => !this.lastOutputFields.includes(f));
      const fieldsToRemove = this.lastOutputFields.filter(f => !filteredFields.includes(f));

      fieldsToRemove.forEach(field => {
        const slotIndex = this.lastOutputFields.indexOf(field);
        if (slotIndex !== -1) {
          this.removeOutput(slotIndex);
          this.lastOutputFields.splice(slotIndex, 1);
          this.lastOutputValues.splice(slotIndex, 1);
          this.log("UpdateSlots", `Removed output slot ${slotIndex} (${field})`, true);
        }
      });

      fieldsToAdd.forEach(field => {
        this.lastOutputFields.push(field);
        const slotIndex = this.lastOutputFields.indexOf(field);
        this.addOutput(field, "number,string,boolean", slotIndex);
        this.log("UpdateSlots", `Added output slot ${slotIndex} (${field})`, true);
      });

      this.updateStatus(this.lastOutputFields.length ? `Fields: ${this.lastOutputFields.join(", ")}` : "No fields selected");
      this.updateNodeSize();
      this.setDirtyCanvas(true);
    }

    getFieldValue(device, field) {
      if (!device) return null;
      const entityType = device.entity_type?.toLowerCase();
      this.log("GetFieldValue", `Processing field ${field} for ${entityType}`, true);

      switch (field) {
        case "state":
          if (entityType === "media_player") {
            return device.status || device.state || null;
          } else if (entityType === "binary_sensor") {
            const status = (device.status || device.state)?.toLowerCase();
            if (status === "open") return true;
            if (status === "closed") return false;
            return status || null;
          } else {
            const status = (device.status || device.state)?.toLowerCase();
            if (status === "on") return true;
            if (status === "off") return false;
            return status || null;
          }
        case "hue":
        case "saturation":
        case "brightness":
        case "position":
        case "latitude":
        case "longitude":
          return typeof device[field] === "number" ? device[field] : null;
        case "volume_level":
          return typeof device.volume === "number" ? device.volume : device.attributes?.volume_level || null;
        case "battery":
        case "value":
        case "unit":
        case "zone":
        case "condition":
          return device[field] !== undefined ? device[field] : device.attributes?.[field] || null;
        case "temperature":
        case "pressure":
        case "humidity":
        case "wind_speed":
        case "battery_level":
          return typeof device[field] === "number" ? device[field] : typeof device.attributes?.[field] === "number" ? device.attributes[field] : null;
        case "media_title":
        case "media_content_type":
        case "media_artist":
        case "repeat":
          return device[field] !== undefined ? device[field] : device.attributes?.[field] || null;
        case "shuffle":
          return typeof device[field] === "boolean" ? device[field] : typeof device.attributes?.shuffle === "boolean" ? device.attributes.shuffle : null;
        case "supported_features":
          return typeof device[field] === "number" ? device[field] : typeof device.attributes?.supported_features === "number" ? device.attributes.supported_features : null;
        default:
          return device[field] !== undefined ? device[field] : device.attributes?.[field] || null;
      }
    }

    // New method: Set up the fixed 10-minute reconnect timer
    setupReconnectTimer() {
      try {
        if (this._reconnectTimer) {
          clearInterval(this._reconnectTimer);
          this._reconnectTimer = null;
        }

        this._reconnectTimer = setInterval(() => {
          this.performReconnect();
        }, 600000); // Fixed 10-minute interval
        if (this.properties.debug) {
          this.log("ReconnectTimer", "Started reconnect timer with fixed 10-minute (600000ms) interval", true);
        }
      } catch (e) {
        this.log("ReconnectTimerError", `Error: ${e.message}`, true);
      }
    }

    // New method: Perform disconnect/reconnect for all outputs
    performReconnect() {
      try {
        if (!this.outputs || this.outputs.length === 0) {
          if (this.properties.debug) {
            this.log("Reconnect", "No outputs to reconnect", true);
          }
          return;
        }

        // Store all output connections
        const connections = [];
        this.outputs.forEach((output, index) => {
          if (output.links) {
            output.links.forEach(linkId => {
              const link = this.graph.links[linkId];
              if (link) {
                connections.push({
                  output_index: index,
                  target_id: link.target_id,
                  target_slot: link.target_slot,
                });
              }
            });
          }
        });

        // Disconnect all output links
        this.outputs.forEach(output => {
          if (output.links) {
            output.links.forEach(linkId => {
              const link = this.graph.links[linkId];
              if (link) {
                const targetNode = this.graph.getNodeById(link.target_id);
                if (targetNode) {
                  targetNode.disconnectInput(link.target_slot);
                }
              }
            });
            output.links = [];
          }
        });
        if (this.properties.debug && connections.length > 0) {
          this.log("Reconnect", `Disconnected ${connections.length} output connections`, true);
        }

        // Reconnect after a short delay
        setTimeout(() => {
          try {
            connections.forEach(conn => {
              const targetNode = this.graph.getNodeById(conn.target_id);
              if (targetNode) {
                this.connect(conn.output_index, targetNode, conn.target_slot);
                if (this.properties.debug) {
                  this.log("Reconnect", `Reconnected output ${conn.output_index} to node ${conn.target_id}, slot ${conn.target_slot}`, true);
                }
              }
            });
            this.onExecute(); // Refresh output values
            this.setDirtyCanvas(true, true);
          } catch (e) {
            this.log("ReconnectError", `Reconnect phase error: ${e.message}`, true);
          }
        }, 100);
      } catch (e) {
        this.log("ReconnectError", `Error: ${e.message}`, true);
      }
    }

    onConnectionsChange(type, index, connected, link_info) {
      if (type === LiteGraph.INPUT) {
        this.log("ConnectionsChange", `Input ${connected ? "connected" : "disconnected"} at slot ${index}, link: ${link_info?.id}`, true);
        this.updateOutputSlots();
        this.setDirtyCanvas(true, true);
        if (this.graph) {
          this.graph._version++;
          this.log("ConnectionsChange", "Incremented graph version", true);
          this.onExecute();
          setTimeout(() => {
            if (this.graph) {
              this.graph.runStep();
              this.log("ConnectionsChange", "Forced graph execution", true);
            }
          }, 100);
        }
      }
    }

    onDrawForeground(ctx) {
      try {
        if (super.onDrawForeground) super.onDrawForeground(ctx);
        if (this.lastOutputFields.length === 0) return;

        let widgetsHeight = this.widgets.reduce(
          (sum, w) => sum + (w.computeSize?.(this.size[0])[1] ?? LiteGraph.NODE_WIDGET_HEIGHT),
          0
        );
        widgetsHeight += 15;
        const startY = widgetsHeight + 50;

        ctx.fillStyle = "#E0E0E0";
        ctx.font = "12px Roboto, Arial, sans-serif";
        ctx.textAlign = "left";

        const inputData = this.getInputData(0);
        if (!inputData || !inputData.lights || !Array.isArray(inputData.lights) || inputData.lights.length === 0) {
          ctx.fillText("No valid device data received", 10, startY);
          return;
        }

        const device = inputData.lights[0];
        const lines = [];

        this.lastOutputFields.forEach((field) => {
          const value = this.getFieldValue(device, field);
          lines.push(`${field}: ${value !== null ? JSON.stringify(value) : "null"}`);
        });

        lines.forEach((line, index) => {
          ctx.fillText(line, 10, startY + index * 15);
        });
      } catch (e) {
        this.log("DrawForegroundError", `Error: ${e.message}`, true);
      }
    }

    onExecute() {
      try {
        const now = Date.now();
        const inputData = this.getInputData(0);
        this.log("Execute", `Input data: ${inputData ? JSON.stringify(inputData).slice(0, 100) + "..." : "null"}`, true);

        if (this.graph && this.inputs[0]?.link) {
          const upstreamNode = this.graph.getNodeById(this.graph.links[this.inputs[0].link]?.origin_id);
          if (upstreamNode && typeof upstreamNode.onExecute === "function") {
            upstreamNode.onExecute();
            this.log("Execute", `Triggered upstream node ${upstreamNode.title || upstreamNode.id}`, true);
          }
          if (upstreamNode && typeof upstreamNode.fetchDevices === "function" && !upstreamNode.deviceManagerReady) {
            upstreamNode.fetchDevices();
            this.log("Execute", `Triggered upstream fetchDevices on ${upstreamNode.title || upstreamNode.id}`, true);
          }
        }

        const inputHash = inputData && inputData.lights && Array.isArray(inputData.lights) && inputData.lights.length > 0
          ? JSON.stringify(inputData.lights[0])
          : null;

        if (!inputData || !inputData.lights || !Array.isArray(inputData.lights) || inputData.lights.length === 0) {
          if (now < this.retryCooldown) {
            this.lastOutputFields.forEach((_, index) => {
              this.setOutputData(index, this.lastOutputValues[index] || null);
            });
            this.log("Execute", `Retry cooldown active (until ${new Date(this.retryCooldown).toISOString()})`, true);
            this.setDirtyCanvas(true);
            return;
          }

          if (this.retryAttempts >= this.maxRetryAttempts) {
            this.updateStatus(`Failed to receive data after ${this.maxRetryAttempts} retries`);
            this.log("Execute", `Max retries (${this.maxRetryAttempts}) reached`, true);
            this.retryAttempts = 0;
            this.retryCooldown = now + 15000;
            this.lastRetryCycle = now;
            this.lastOutputFields.forEach((_, index) => {
              this.setOutputData(index, this.lastOutputValues[index] || null);
            });
            this.setDirtyCanvas(true);
            return;
          }

          this.retryAttempts++;
          this.updateStatus(`Waiting for data (attempt ${this.retryAttempts}/${this.maxRetryAttempts})`);
          this.log("Execute", `No valid input data (attempt ${this.retryAttempts})`, true);
          this.lastOutputFields.forEach((_, index) => {
            this.setOutputData(index, this.lastOutputValues[index] || null);
          });
          this.setDirtyCanvas(true);
          return;
        }

        this.retryAttempts = 0;
        this.retryCooldown = 0;
        const device = inputData.lights[0];
        const entityType = device.entity_type?.toLowerCase() || "unknown";

        if (entityType !== this.properties.lastEntityType && this.lastOutputFields.length > 0) {
          this.log("Execute", `Entity type changed to ${entityType}, resetting fields`, true);
          this.onResetFields();
        }
        this.properties.lastEntityType = entityType;
        this.properties.serializedEntityType = entityType;

        const hasInputChanged = inputHash !== this.lastInputHash;
        this.lastInputHash = inputHash;

        this.updateStatus(this.lastOutputFields.length ? `Fields: ${this.lastOutputFields.join(", ")}` : "No fields selected");

        let hasOutputChanged = false;
        const newOutputValues = [];

        this.lastOutputFields.forEach((field, index) => {
          const value = this.getFieldValue(device, field);
          newOutputValues[index] = value;
          if (value !== this.lastOutputValues[index]) {
            hasOutputChanged = true;
            this.log("Execute", `Output changed for ${field}: ${this.lastOutputValues[index]} -> ${value}`, true);
          }
          this.setOutputData(index, value);
          this.log("Execute", `Set output slot ${index} (${field}): ${value}`, true);
        });

        this.lastOutputValues = newOutputValues;

        const forceUpdateInterval = 30000;
        const shouldForceUpdate = now - this.lastForceUpdate > forceUpdateInterval;

        if (hasInputChanged || hasOutputChanged || shouldForceUpdate) {
          this.setDirtyCanvas(true, true);
          if (this.graph) {
            this.graph._version++;
            this.log("Execute", "Incremented graph version", true);
            setTimeout(() => {
              if (this.graph) {
                this.graph.runStep();
                this.log("Execute", "Forced graph execution (100ms)", true);
              }
            }, 100);
            setTimeout(() => {
              if (this.graph) {
                this.graph.runStep();
                this.log("Execute", "Forced graph execution (500ms)", true);
              }
            }, 500);
            setTimeout(() => {
              if (this.graph) {
                this.graph.runStep();
                this.log("Execute", "Forced graph execution (1000ms)", true);
              }
            }, 1000);
          }
          if (shouldForceUpdate) {
            this.lastForceUpdate = now;
            this.log("Execute", "Periodic forced update", true);
          }
        } else {
          this.setDirtyCanvas(true);
        }
      } catch (e) {
        this.log("ExecuteError", `Error: ${e.message}`, true);
        this.updateStatus(`Error: ${e.message}`);
      }
    }

    onSerialize(data) {
      try {
        data.id = this.id;
        data.properties = { ...this.properties };
        data.selectedFields = [...this.selectedFields];
        data.lastOutputFields = this.lastOutputFields;
        data.lastOutputValues = this.lastOutputValues;
        data.lastInputHash = this.lastInputHash;
        data.lastForceUpdate = this.lastForceUpdate;
        data.fieldWidgets = this.fieldWidgets.map((widget) => ({
          type: widget.type,
          name: widget.name,
          value: widget.value,
        }));
        data.inputs = this.inputs.map(input => ({
          name: input.name,
          type: input.type,
          link: input.link
        }));
        data.outputs = this.outputs.map(output => ({
          name: output.name,
          type: output.type,
          links: output.links ? [...output.links] : null
        }));
        data.retryAttempts = this.retryAttempts;
        data.retryCooldown = this.retryCooldown;
        data.lastRetryCycle = this.lastRetryCycle;
        this.log("Serialize", `Saved id=${data.id}, fields=${this.lastOutputFields.join(", ")}`, true);
      } catch (e) {
        this.log("SerializeError", `Error: ${e.message}`, true);
      }
    }

    onDeserialized(data) {
      try {
        this.log("Deserialize", `Deserializing node ID: ${data.id || 'unknown'}`, true);
        if (data.id !== undefined) this.id = data.id;
        this.properties = {
          status: data.properties?.status || "Waiting for input data",
          debug: data.properties?.debug || false,
          debugLevel: data.properties?.debugLevel || 1,
          lastEntityType: data.properties?.lastEntityType || "unknown",
          serializedEntityType: data.properties?.serializedEntityType || null,
          enableReconnect: data.properties?.enableReconnect || false,
          reconnectInterval: data.properties?.reconnectInterval !== undefined ? Math.max(1000, Math.min(1800000, Math.round(data.properties.reconnectInterval))) : 600000,
        };
        this.selectedFields = data.selectedFields || [];
        this.lastOutputFields = data.lastOutputFields || [];
        this.lastOutputValues = data.lastOutputValues || [];
        this.lastInputHash = data.lastInputHash || null;
        this.lastForceUpdate = data.lastForceUpdate || 0;
        this.retryAttempts = data.retryAttempts || 0;
        this.retryCooldown = data.retryCooldown || 0;
        this.lastRetryCycle = data.lastRetryCycle || 0;

        this.widgets = [];
        this.fieldWidgets = [];
        this.outputs = [];
        this.inputs = [];
        this.addInput("Device State", "light_info");

        if (data.inputs?.length > 0) {
          this.inputs[0].link = data.inputs[0].link;
          this.log("Deserialize", `Restored input link: ${this.inputs[0].link}`, true);
        }

        this.setupWidgets();
        this.restoreFieldWidgets();

        if (data.fieldWidgets?.length) {
          this.fieldWidgets.forEach((widget, index) => {
            const serializedWidget = data.fieldWidgets[index];
            if (serializedWidget && widget.name === serializedWidget.name) {
              const entityType = this.properties.serializedEntityType || this.properties.lastEntityType || "unknown";
              const availableFields = this.fieldMapping[entityType] || this.fieldMapping.unknown;
              widget.value = availableFields.includes(serializedWidget.value) ? serializedWidget.value : "Select Field";
              widget.options.values = ["Select Field", ...availableFields];
              this.log("Deserialize", `Restored widget ${widget.name}: ${widget.value}`, true);
            }
          });
        }

        this.selectedFields = this.selectedFields.slice(0, this.fieldWidgets.length);
        this.startGraphStepping();
        this.setupReconnectTimer(); // Start reconnect timer
        // Schedule initial reconnect
        setTimeout(() => {
          this.performReconnect();
          if (this.properties.debug) {
            this.log("Reconnect", "Performed initial reconnect 3 seconds after graph load", true);
          }
        }, 3000);
        this.onExecute();
        this.setDirtyCanvas(true, true);
        this.log("Deserialize", `Restored: fields=${this.lastOutputFields.join(", ")}`, true);
      } catch (e) {
        this.log("DeserializeError", `Error: ${e.message}`, true);
      }
    }

    onConfigure(data) {
      this.onDeserialized(data);
    }

    onRemoved() {
      try {
        this.stopGraphStepping();
        if (this._reconnectTimer) {
          clearInterval(this._reconnectTimer);
          this._reconnectTimer = null;
          if (this.properties.debug) {
            this.log("Reconnect", "Reconnect timer cleared on node removal", true);
          }
        }
      } catch (e) {
        this.log("RemoveError", `Error: ${e.message}`, true);
      }
    }
  }

  try {
    LiteGraph.registerNodeType("HomeAssistant/HADeviceAutomationNode", HADeviceAutomationNode);
    console.log("HADeviceAutomationNode registered successfully");
  } catch (e) {
    console.error("Error registering HADeviceAutomationNode:", e);
  }
}