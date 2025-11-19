if (!LiteGraph.registered_node_types?.["HomeAssistant/HAGenericDeviceNode"]) {
  class HAGenericDeviceNode extends LiteGraph.LGraphNode {
    constructor() {
      super();
      Object.assign(this, {
        title: "Home Assistant Generic Device",
        resizable: true,
        autosize: false,
        bgcolor: "rgb(80, 120, 160)",
        properties: {
          selectedDeviceIds: [],
          selectedDeviceNames: [],
          status: "No action yet",
          debug: false,
          // Optionally allow token to be set via UI
          haToken: "", // Set this in node properties or hardcode your token
        },
        CUSTOM_API_URL: "http://localhost:3000", // Custom backend
        HA_API_URL: "http://localhost:8123", // Home Assistant API (fallback)
        deviceSelectors: [],
        devices: [],
        deviceManagerReady: false,
        perDeviceState: {},
        socket: null,
      });

      this.addInput("State", "object");
      this.addInput("Trigger", "boolean");
      this.addOutput("Device Info", "object");

      this.setupWidgets();
      this.initializeSocketIO();
    }

    log = (key, message, force = false) => {
      if (!this.properties.debug && !force) return;
      const now = Date.now();
      this.lastLogged = this.lastLogged || {};
      const lastLog = this.lastLogged[key] || { time: 0, message: "" };
      if (force || now - lastLog.time > 1000 || lastLog.message !== message) {
        console.log(`HAGenericDeviceNode - ${message}`);
        this.lastLogged[key] = { time: now, message };
      }
    };

    setupWidgets = () => {
      try {
        const widgetWidth = this.size[0] - 20;
        const widgets = [
          { type: "button", name: "➕", value: "Add Device", callback: () => this.onAddDevice(), options: { width: 40 } },
          { type: "button", name: "➖", value: "Remove Device", callback: () => this.onRemoveDevice(), options: { width: 40 } },
          { type: "button", name: "🔄", value: "Refresh Devices", callback: () => this.onRefreshDevices(), options: { width: 40 } },
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
            name: "HA Token",
            value: this.properties.haToken,
            callback: (v) => {
              this.properties.haToken = v;
              this.log("haTokenUpdate", `Updated HA token`, true);
            },
            options: { width: 200 },
          },
          {
            type: "text",
            name: "Status",
            value: this.properties.status,
            options: { property: "status", readonly: true, width: widgetWidth - 300 },
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

    initializeSocketIO = () => {
      this.socket = io(this.CUSTOM_API_URL, {
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 10000,
      });

      this.socket.on("connect", () => {
        this.log("socketConnect", "Socket.IO connected", true);
        this.updateStatus("✅ Connected to server.");
        this.fetchDevices();
      });

      this.socket.on("connect_error", (err) => {
        this.log("socketConnectError", `Socket.IO connection error: ${err.message}`, true);
        this.updateStatus(`⚠️ Connection error: ${err.message}`);
      });

      this.socket.on("disconnect", () => {
        this.log("socketDisconnect", "Socket.IO disconnected", true);
        this.updateStatus("⚠️ Disconnected from server.");
      });

      this.socket.on("device-state-update", (data) => this.handleDeviceStateUpdate(data));
    };

    fetchDevices = async () => {
      try {
        // Use custom backend /api/devices
        const response = await fetch(`${this.CUSTOM_API_URL}/api/devices`);
        const data = await response.json();
        if (data.success && data.devices) {
          this.devices = [
            ...data.devices.ha.map((d) => ({
              entity_id: d.id.replace('ha_', ''),
              name: d.name,
              type: d.type,
              state: d.state.on ? 'on' : 'off',
              attributes: { brightness: d.state.brightness },
              source: 'ha',
            })),
            // Include Kasa bulbs as pseudo-HA entities
            ...data.devices.kasa
              .filter((d) => d.type === "bulb")
              .map((d) => ({
                entity_id: `light.${d.name.trim().toLowerCase().replace(/ /g, '_').replace(/[^a-z0-9_]/g, '')}`,
                name: d.name,
                type: 'light',
                state: d.state.on ? 'on' : 'off',
                attributes: { brightness: d.state.brightness, hs_color: [d.state.hue, d.state.saturation] },
                source: 'kasa',
                kasaId: d.id, // Store original kasa_ ID for control
              })),
          ].sort((a, b) => a.name.localeCompare(b.name));

          this.deviceManagerReady = true;
          this.updateStatus("✅ Devices fetched successfully.");
          this.log("fetchDevices", "Devices fetched successfully", true);
          this.restoreDeviceSelectors();
        } else {
          throw new Error(data.error || "No devices returned");
        }
      } catch (error) {
        this.log("fetchDevicesError", `Error fetching devices: ${error.message}`, true);
        this.updateStatus(`⚠️ Error fetching devices: ${error.message}`);
      }
    };

    restoreDeviceSelectors = () => {
      this.deviceSelectors = [];
      this.widgets = this.widgets.filter((w) => !w.name.startsWith("Select Device"));

      this.properties.selectedDeviceIds.forEach((deviceId, index) => {
        if (!deviceId) return;
        const device = this.devices.find((d) => d.entity_id === deviceId);
        const deviceName = this.properties.selectedDeviceNames[index] || (device?.name ?? "Unknown");
        const deviceSelector = this.addWidget(
          "combo",
          `Select Device ${index + 1}`,
          deviceName,
          (value) => this.onDeviceSelected(value, index),
          { values: ["Select Device", ...this.getDeviceOptions()], width: this.size[0] - 20 }
        );
        this.deviceSelectors.push(deviceSelector);
        this.perDeviceState[deviceId] ??= { state: device?.state, attributes: device?.attributes };
      });

      this.updateNodeSize();
      this.setDirtyCanvas(true);
      this.log("restoreDeviceSelectors", "Device selectors restored", true);
    };

    getDeviceOptions = () => (
      this.deviceManagerReady && this.devices.length 
        ? this.devices.map((d) => d.name) 
        : ["No Devices Found"]
    );

    onAddDevice = () => {
      if (!this.deviceManagerReady) {
        this.updateStatus("⚠️ Device manager not ready.");
        return;
      }
      if (this.deviceSelectors.length >= 20) {
        this.updateStatus("⚠️ Maximum of 20 devices reached.");
        return;
      }
      const deviceSelector = this.addWidget(
        "combo",
        `Select Device ${this.deviceSelectors.length + 1}`,
        "Select Device",
        (value) => this.onDeviceSelected(value, this.deviceSelectors.indexOf(deviceSelector)),
        { values: ["Select Device", ...this.getDeviceOptions()], width: this.size[0] - 20 }
      );
      this.deviceSelectors.push(deviceSelector);
      this.properties.selectedDeviceIds.push(null);
      this.properties.selectedDeviceNames.push(null);
      this.updateNodeSize();
      this.setDirtyCanvas(true);
      this.updateStatus(`✅ Added device selector ${this.deviceSelectors.length}.`);
      this.log("addDevice", `Added device selector ${this.deviceSelectors.length}`, true);
    };

    onRemoveDevice = () => {
      if (!this.deviceSelectors.length) {
        this.updateStatus("⚠️ No devices to remove.");
        return;
      }
      const deviceSelector = this.deviceSelectors.pop();
      this.widgets = this.widgets.filter((w) => w !== deviceSelector);
      const removedDeviceId = this.properties.selectedDeviceIds.pop();
      this.properties.selectedDeviceNames.pop();
      if (removedDeviceId && this.perDeviceState[removedDeviceId]) {
        delete this.perDeviceState[removedDeviceId];
      }
      this.updateNodeSize();
      this.setDirtyCanvas(true);
      this.updateStatus(`✅ Removed device selector`);
      this.log("removeDevice", `Removed device selector`, true);
    };

    onDeviceSelected = async (value, index) => {
      if (value === "Select Device" || value === "No Devices Found") {
        const removedDeviceId = this.properties.selectedDeviceIds[index];
        if (removedDeviceId && this.perDeviceState[removedDeviceId]) {
          delete this.perDeviceState[removedDeviceId];
        }
        this.properties.selectedDeviceIds[index] = null;
        this.properties.selectedDeviceNames[index] = null;
        this.updateNodeSize();
        this.setDirtyCanvas(true);
        this.updateStatus(`✅ Deselected device at selector ${index + 1}.`);
        this.log("deviceSelected", `Deselected device at selector ${index + 1}`, true);
        return;
      }

      if (!this.deviceManagerReady) await this.fetchDevices();
      const device = this.devices.find((d) => d.name === value);
      if (!device) {
        this.updateStatus(`⚠️ Device "${value}" not found.`);
        this.log("deviceSelectedWarn", `No device found for name: ${value}`, true);
        return;
      }

      const deviceId = device.entity_id;
      if (this.properties.selectedDeviceIds.includes(deviceId)) {
        this.updateStatus(`⚠️ Device "${device.name}" already selected.`);
        this.deviceSelectors[index].value = "Select Device";
        return;
      }

      this.properties.selectedDeviceIds[index] = deviceId;
      this.properties.selectedDeviceNames[index] = device.name;
      this.perDeviceState[deviceId] = { state: device.state, attributes: device.attributes };
      await this.fetchDeviceState(deviceId);
      this.updateNodeSize();
      this.setDirtyCanvas(true);
      this.log("deviceSelected", `Selected device "${device.name}" at selector ${index + 1}`, true);
    };

    fetchDeviceState = async (deviceId) => {
      try {
        const device = this.devices.find((d) => d.entity_id === deviceId);
        const isKasa = device?.source === "kasa";
        const stateId = isKasa ? device.kasaId : `ha_${deviceId}`; // Use kasa_ ID for Kasa bulbs
        const response = await fetch(`${this.CUSTOM_API_URL}/api/light-state/${stateId}`);
        const data = await response.json();
        if (data.success && data.state) {
          this.perDeviceState[deviceId] = {
            state: data.state.on ? "on" : "off",
            attributes: {
              brightness: data.state.brightness,
              hs_color: [data.state.hue, data.state.saturation],
            },
          };
          const deviceName = this.properties.selectedDeviceNames[this.properties.selectedDeviceIds.indexOf(deviceId)] || "Unknown";
          this.updateStatus(`✅ Device "${deviceName}" state: ${data.state.on ? "On" : "Off"}`);
          this.setDirtyCanvas(true);
          return true;
        }
        throw new Error(data.error || "No state returned");
      } catch (error) {
        this.log("fetchDeviceStateError", `Error fetching state for Device ID ${deviceId}: ${error.message}`, true);
        this.updateStatus(`⚠️ Error fetching Device ${deviceId}: ${error.message}`);
        this.perDeviceState[deviceId] ??= { state: "unknown", attributes: {} };
        return false;
      }
    };

    handleDeviceStateUpdate = (data) => {
      const deviceId = data.id.startsWith('ha_') ? data.id.replace('ha_', '') : data.id;
      if (!this.properties.selectedDeviceIds.includes(deviceId)) return;
      this.perDeviceState[deviceId] = {
        state: data.on ? "on" : "off",
        attributes: {
          brightness: data.brightness,
          hs_color: data.hs_color || [data.hue, data.saturation],
        },
      };
      this.updateStatus(`✅ Device "${data.name}" updated: ${data.on ? "On" : "Off"}`);
      this.setDirtyCanvas(true);
      this.log("deviceStateUpdate", `Updated state for ${data.name}: ${JSON.stringify(data)}`, true);
    };

    updateNodeSize = () => {
      this.size[0] = 400;
      const baseHeight = 40;
      let widgetsHeight = this.widgets
        .filter((w) => !w.name.startsWith("Select Device"))
        .reduce((sum, w) => sum + (w.computeSize?.(this.size[0])[1] ?? LiteGraph.NODE_WIDGET_HEIGHT), 0);
      widgetsHeight += 15;
      const totalDeviceHeight = this.properties.selectedDeviceIds.length * 50;
      this.size[1] = baseHeight + widgetsHeight + totalDeviceHeight + 45;
      this.setSize([this.size[0], this.size[1]]);
      this.setDirtyCanvas(true);
    };

    updateStatus = (message = null) => {
      const deviceId = this.properties.selectedDeviceIds[0];
      const deviceName = this.properties.selectedDeviceNames[0] || "Unknown";
      const deviceState = this.perDeviceState[deviceId]?.state || "Unknown";
      const status = message ?? `✅ Device "${deviceName}" state: ${deviceState}`;
      if (status !== this.properties.status) {
        this.properties.status = status;
        if (this.statusWidget) this.statusWidget.value = status;
        this.setDirtyCanvas(true);
        this.log("updateStatus", `Updated status: ${status}`, true);
      }
    };

    onExecute = async () => {
      if (!this.deviceManagerReady) await this.fetchDevices();

      const stateInput = this.getInputData(0);
      const triggerInput = this.getInputData(1);

      if (triggerInput !== undefined && triggerInput !== this.lastTriggerInput) {
        this.lastTriggerInput = triggerInput;
        if (triggerInput) {
          for (const deviceId of this.properties.selectedDeviceIds) {
            if (deviceId) await this.fetchDeviceState(deviceId);
          }
        }
      }

      if (stateInput && stateInput !== this.lastStateInput) {
        this.lastStateInput = stateInput;
        for (const deviceId of this.properties.selectedDeviceIds) {
          if (deviceId) {
            const device = this.devices.find((d) => d.entity_id === deviceId);
            const controlId = device.source === "kasa" ? device.kasaId : `ha_${deviceId}`;
            this.socket.emit('device-control', {
              id: controlId,
              ...stateInput,
            });
          }
        }
      }

      const deviceData = {
        devices: this.properties.selectedDeviceIds
          .filter((id) => id)
          .map((id) => ({
            entity_id: id,
            name: this.properties.selectedDeviceNames[this.properties.selectedDeviceIds.indexOf(id)],
            state: this.perDeviceState[id]?.state,
            attributes: this.perDeviceState[id]?.attributes,
          })),
        status: this.properties.status,
      };
      this.setOutputData(0, deviceData);
      this.setDirtyCanvas(true);
    };

    onRemoved = () => {
      if (this.socket) this.socket.disconnect();
    };
  }

  LiteGraph.registerNodeType("HomeAssistant/HAGenericDeviceNode", HAGenericDeviceNode);
}