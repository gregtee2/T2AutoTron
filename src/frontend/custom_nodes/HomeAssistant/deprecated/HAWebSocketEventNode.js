if (!LiteGraph.registered_node_types?.["HomeAssistant/HAWebSocketEventNode"]) {
  class HAWebSocketEventNode extends LiteGraph.LGraphNode {
    constructor() {
      super();
      Object.assign(this, {
        title: "Home Assistant WebSocket Event",
        resizable: true,
        autosize: false,
        bgcolor: "rgb(90, 130, 170)",
        properties: {
          selectedDeviceIds: [],
          selectedDeviceNames: [],
          status: "No action yet",
          debug: false,
          haToken: "",
          filterType: "All",
          selectedEvents: ["state_changed"],
          haApiUrl: "http://192.168.1.78:8123", // Raspberry Pi HA instance
        },
        CUSTOM_API_URL: "http://localhost:3000",
        deviceSelectors: [],
        devices: [],
        deviceManagerReady: false,
        perDeviceState: {},
        ws: null,
        socket: null,
        lastEvents: [],
        lastLogTime: 0,
        logCount: 0,
      });

      this.addOutput("All Devices", "light_info");
      this.setupWidgets();
      this.initializeConnections();
    }

    log = (key, message, force = false) => {
      if (!force && !this.properties.debug) return;
      const now = Date.now();
      if (now - this.lastLogTime < 100 && this.logCount >= 10 && !force) return;
      if (now - this.lastLogTime >= 1000) {
        this.logCount = 0;
        this.lastLogTime = now;
      }
      this.logCount++;
      this.lastLogged = this.lastLogged || {};
      const lastLog = this.lastLogged[key] || { time: 0, message: "" };
      if (force || now - lastLog.time > 1000 || lastLog.message !== message) {
        console.log(`HAWebSocketEventNode - ${key}: ${message}`);
        this.lastLogged[key] = { time: now, message };
      }
    };

    setupWidgets = () => {
      try {
        const widgetWidth = this.size[0] - 20;
        const widgets = [
          {
            type: "combo",
            name: "Filter Devices",
            value: this.properties.filterType,
            callback: (v) => this.onFilterChanged(v),
            options: {
              values: [
                "All",
                "Light",
                "Switch",
                "Sensor",
                "Binary Sensor",
                "Media Player",
                "Fan",
                "Cover",
                "Weather",
              ],
              width: 100,
            },
          },
          {
            type: "button",
            name: "➕",
            value: "Add Device",
            callback: () => this.onAddDevice(),
            options: { width: 40 },
          },
          {
            type: "button",
            name: "➖",
            value: "Remove Device",
            callback: () => this.onRemoveDevice(),
            options: { width: 40 },
          },
          {
            type: "button",
            name: "🔄",
            value: "Refresh Devices",
            callback: () => this.onRefreshDevices(),
            options: { width: 40 },
          },
          {
            type: "text",
            name: "HA API URL",
            value: this.properties.haApiUrl,
            callback: (v) => {
              this.properties.haApiUrl = v;
              this.log("haApiUrlUpdate", `Updated HA API URL: ${v}`, true);
              this.fetchDevices();
              if (this.ws) this.ws.close();
              this.initializeWebSocket();
            },
            options: { width: 200, placeholder: "e.g., http://192.168.1.78:8123" },
          },
          {
            type: "text",
            name: "Event Types",
            value: this.properties.selectedEvents.join(", "),
            callback: (v) => {
              this.properties.selectedEvents = v
                .split(",")
                .map((e) => e.trim())
                .filter((e) => e);
              this.log("eventTypesUpdate", `Updated event types: ${this.properties.selectedEvents}`, true);
              this.subscribeToEvents();
            },
            options: { width: 200, placeholder: "e.g., state_changed,call_service" },
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
            type: "text",
            name: "HA Token",
            value: this.properties.haToken,
            callback: (v) => {
              this.properties.haToken = v;
              this.log("haTokenUpdate", `Updated HA token`, true);
              this.fetchDevices();
              if (this.ws) this.ws.close();
              this.initializeWebSocket();
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

        // Fetch token from backend
        fetch(`${this.CUSTOM_API_URL}/api/ha-token`)
          .then((res) => res.json())
          .then((data) => {
            this.properties.haToken = data.token;
            this.widgets.find((w) => w.name === "HA Token").value = data.token;
            this.fetchDevices();
            this.initializeWebSocket();
          })
          .catch((err) =>
            this.log("fetchTokenError", `Failed to fetch HA token: ${err.message}`, true)
          );
      } catch (error) {
        this.log("setupWidgetsError", `Error setting up widgets: ${error.message}`, true);
        this.updateStatus(`⚠️ Error setting up widgets: ${error.message}`);
      }
    };

    updateStatus = (message = null) => {
      const deviceId = this.properties.selectedDeviceIds[0];
      const deviceName = deviceId
        ? this.properties.selectedDeviceNames[this.properties.selectedDeviceIds.indexOf(deviceId)] || "Unknown"
        : "No Device";
      const deviceState = this.perDeviceState[deviceId]?.state || "Unknown";
      const status = message ?? `✅ Device "${deviceName}" state: ${deviceState}`;
      if (status !== this.properties.status) {
        this.properties.status = status;
        if (this.statusWidget) this.statusWidget.value = status;
        this.setDirtyCanvas(true);
        this.log("updateStatus", `Updated status: ${status}`, true);
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
      const totalDeviceHeight = this.properties.selectedDeviceIds.length * 50;
      const extraHeight = 20 * this.outputs.length;
      this.size[1] = baseHeight + widgetsHeight + totalDeviceHeight + 45 + extraHeight;
      this.setSize([this.size[0], this.size[1]]);
      this.setDirtyCanvas(true);
    };

    initializeConnections = () => {
      this.initializeWebSocket();
      this.socket = io(this.CUSTOM_API_URL, {
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 10000,
      });

      this.socket.on("connect", () => {
        this.log("socketConnect", "Socket.IO connected (fallback)", true);
        this.fetchDevices();
      });

      this.socket.on("connect_error", (err) => {
        this.log("socketConnectError", `Socket.IO connection error: ${err.message}`, true);
        this.updateStatus(`⚠️ Socket.IO connection error: ${err.message}`);
      });

      this.socket.on("disconnect", () => {
        this.log("socketDisconnect", "Socket.IO disconnected", true);
        this.updateStatus(`⚠️ Socket.IO disconnected`);
      });

      this.socket.on("device-state-update", (data) => {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
          this.handleDeviceStateUpdate(data);
        }
      });
    };

    initializeWebSocket = () => {
      try {
        this.ws = new WebSocket(`ws://${this.properties.haApiUrl.replace(/^http(s)?:\/\//, "")}/api/websocket`);
      } catch (error) {
        this.log("wsInitError", `Failed to initialize WebSocket: ${error.message}`, true);
        this.updateStatus(
          `⚠️ WebSocket blocked by CSP. Add 'connect-src ws://${this.properties.haApiUrl.replace(
            /^http(s)?:\/\//,
            ""
          )}' to your CSP.`
        );
        return;
      }
      this.ws.onopen = () => {
        this.ws.send(
          JSON.stringify({
            type: "auth",
            access_token: this.properties.haToken,
          })
        );
        this.log("wsConnect", "WebSocket connected", true);
        this.updateStatus("✅ WebSocket connected");
      };
      this.ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "auth_ok") {
          this.subscribeToEvents();
        } else if (data.type === "event") {
          this.handleHAEvent(data.event);
        } else if (data.type === "auth_invalid") {
          this.log("wsAuthError", `Authentication failed: ${data.message}`, true);
          this.updateStatus("⚠️ WebSocket authentication failed. Check HA token.");
          this.ws.close();
        }
      };
      this.ws.onerror = (err) => {
        this.log("wsError", `WebSocket error: ${err.message || "Unknown error"}`, true);
        this.updateStatus("⚠️ WebSocket error");
      };
      this.ws.onclose = () => {
        this.log("wsDisconnect", "WebSocket disconnected", true);
        this.updateStatus("⚠️ WebSocket disconnected");
        setTimeout(() => this.initializeWebSocket(), 5000);
      };
    };

    subscribeToEvents = () => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        this.log("subscribeEventsError", "WebSocket not connected", true);
        return;
      }
      this.properties.selectedEvents.forEach((eventType, index) => {
        this.ws.send(
          JSON.stringify({
            id: 100 + index,
            type: "subscribe_events",
            event_type: eventType,
          })
        );
        this.log("subscribeEvents", `Subscribed to event: ${eventType}`, true);
      });
    };

    static filterTypeMap = {
      All: "all",
      Light: "light",
      Switch: "switch",
      Sensor: "sensor",
      "Binary Sensor": "binary_sensor",
      "Media Player": "media_player",
      Weather: "weather",
      Fan: "fan",
      Cover: "cover",
    };

    fetchDevices = async () => {
      try {
        this.log("fetchDevices", "Attempting to fetch devices", true);
        const response = await fetch(`${this.properties.haApiUrl}/api/states`, {
          headers: { Authorization: `Bearer ${this.properties.haToken}` },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        const states = await response.json();
        this.devices = states
          .filter((s) =>
            ["light", "switch", "binary_sensor", "sensor", "media_player", "weather", "fan", "cover"].includes(
              s.entity_id.split(".")[0]
            )
          )
          .map((s) => {
            const entityType = s.entity_id.split(".")[0];
            let state, attributes;
            switch (entityType) {
              case "binary_sensor":
                state = s.state === "on" ? "on" : "off";
                attributes = { battery: s.attributes.battery_level || "unknown" };
                break;
              case "sensor":
                state = s.state || "unknown";
                attributes = { unit: s.attributes.unit_of_measurement || "" };
                break;
              case "light":
              case "switch":
                state = s.state;
                attributes = {
                  brightness: s.attributes.brightness || (s.state === "on" ? 100 : 0),
                  hs_color: s.attributes.hs_color || [0, 0],
                };
                break;
              case "media_player":
                state = s.state || "off";
                attributes = {
                  volume_level: s.attributes.volume_level || 0,
                  source: s.attributes.source || null,
                  media_title: s.attributes.media_title || null,
                };
                break;
              case "weather":
                state = s.attributes.condition || "unknown";
                attributes = {
                  temperature: s.attributes.temperature || null,
                  humidity: s.attributes.humidity || null,
                  wind_speed: s.attributes.wind_speed || null,
                  pressure: s.attributes.pressure || null,
                  precipitation: s.attributes.precipitation || null,
                };
                break;
              case "fan":
                state = s.state;
                attributes = { percentage: s.attributes.percentage || 0 };
                break;
              case "cover":
                state = s.state;
                attributes = { position: s.attributes.current_position || 0 };
                break;
              default:
                state = "unknown";
                attributes = {};
            }
            const device = {
              entity_id: s.entity_id,
              name: s.attributes.friendly_name?.trim() || s.entity_id,
              type: entityType,
              entityType: entityType,
              state,
              attributes,
              source: "ha",
            };
            this.log("fetchDevicesDevice", `Processed device: ${device.name} (${entityType}, ID: ${device.entity_id})`, true);
            return device;
          })
          .sort((a, b) => a.name.localeCompare(b.name));
        this.deviceManagerReady = true;
        this.updateStatus("✅ Devices fetched successfully.");
        this.log("fetchDevices", `Fetched ${this.devices.length} devices`, true);
        this.restoreDeviceSelectors();
      } catch (error) {
        this.log("fetchDevicesError", `Error fetching devices: ${error.message}`, true);
        let statusMessage = `⚠️ Error fetching devices: ${error.message}`;
        if (error.message.includes("Content Security Policy")) {
          statusMessage = `⚠️ CSP blocked request to ${this.properties.haApiUrl}. Add 'connect-src ${this.properties.haApiUrl}' to your CSP.`;
        } else if (error.message.includes("CORS")) {
          statusMessage = `⚠️ CORS error. Ensure HA allows requests from your app's origin.`;
        }
        this.updateStatus(statusMessage);
        this.devices = [];
        this.deviceManagerReady = false;
      }
    };

    getDeviceOptions = () => {
      const filterType = this.properties.filterType;
      const normalizedFilterType =
        HAWebSocketEventNode.filterTypeMap[filterType] || filterType.toLowerCase().replace(/\s+/g, "_");
      const filteredDevices = this.devices.filter((device) => {
        if (normalizedFilterType === "all") return true;
        return device.entityType.toLowerCase() === normalizedFilterType;
      });
      return this.deviceManagerReady && filteredDevices.length
        ? filteredDevices.map((d) => d.name)
        : ["No Devices Found"];
    };

    onFilterChanged = (value) => {
      this.properties.filterType = value;
      this.log("filterChanged", `Filter changed to ${value}`, true);
      this.restoreDeviceSelectors();
      this.updateStatus(`✅ Filter set to ${value}`);
    };

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
      this.addOutput(`Device ${this.deviceSelectors.length}`, "light_info");
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
      if (this.outputs.length > 1) {
        this.removeOutput(this.outputs.length - 1);
      }
      this.updateNodeSize();
      this.setDirtyCanvas(true);
      this.updateStatus(`✅ Removed device selector`);
      this.log("removeDevice", `Removed device selector`, true);
    };

    restoreDeviceSelectors = () => {
      this.deviceSelectors = [];
      this.widgets = this.widgets.filter((w) => !w.name.startsWith("Select Device"));
      while (this.outputs.length > 1) {
        this.removeOutput(this.outputs.length - 1);
      }
      const filterType = this.properties.filterType;
      const normalizedFilterType =
        HAWebSocketEventNode.filterTypeMap[filterType] || filterType.toLowerCase().replace(/\s+/g, "_");
      const filteredDevices = this.devices.filter((device) => {
        if (normalizedFilterType === "all") return true;
        return device.entityType.toLowerCase() === normalizedFilterType;
      });
      const validDeviceIds = this.properties.selectedDeviceIds.filter((deviceId) =>
        deviceId && filteredDevices.find((d) => d.entity_id === deviceId)
      );
      const validDeviceNames = validDeviceIds.map(
        (deviceId) =>
          filteredDevices.find((d) => d.entity_id === deviceId)?.name ||
          this.properties.selectedDeviceNames[this.properties.selectedDeviceIds.indexOf(deviceId)] ||
          "Unknown"
      );
      this.properties.selectedDeviceIds = validDeviceIds;
      this.properties.selectedDeviceNames = validDeviceNames;
      validDeviceIds.forEach((deviceId, index) => {
        if (!deviceId) return;
        const device = filteredDevices.find((d) => d.entity_id === deviceId);
        const deviceName = validDeviceNames[index];
        const deviceSelector = this.addWidget(
          "combo",
          `Select Device ${index + 1}`,
          deviceName,
          (value) => this.onDeviceSelected(value, index),
          { values: ["Select Device", ...this.getDeviceOptions()], width: this.size[0] - 20 }
        );
        this.deviceSelectors.push(deviceSelector);
        this.perDeviceState[deviceId] ??= { state: device?.state, attributes: device?.attributes };
        this.addOutput(`Device ${index + 1}`, "light_info");
      });
      this.updateNodeSize();
      this.setDirtyCanvas(true);
      this.log("restoreDeviceSelectors", "Device selectors and output slots restored", true);
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
      const filterType = this.properties.filterType;
      const normalizedFilterType =
        HAWebSocketEventNode.filterTypeMap[filterType] || filterType.toLowerCase().replace(/\s+/g, "_");
      const filteredDevices = this.devices.filter((device) => {
        if (normalizedFilterType === "all") return true;
        return device.entityType.toLowerCase() === normalizedFilterType;
      });
      const device = filteredDevices.find((d) => d.name.trim() === value.trim());
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
      await this.fetchDeviceState(deviceId);
      this.updateNodeSize();
      this.setDirtyCanvas(true);
      this.log("deviceSelected", `Selected device "${device.name}" (ID: ${deviceId}) at selector ${index + 1}`, true);
    };

    fetchDeviceState = async (deviceId) => {
      try {
        const response = await fetch(`${this.properties.haApiUrl}/api/states/${deviceId}`, {
          headers: {
            Authorization: `Bearer ${this.properties.haToken}`,
            "Content-Type": "application/json",
          },
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        const data = await response.json();
        const entityType = deviceId.split(".")[0];
        const isInsteonDevice = () =>
          deviceId.includes("insteon") ||
          deviceId.includes("switchlinc") ||
          deviceId.includes("outletlinc") ||
          (data.attributes?.model?.toLowerCase()?.includes("insteon")) ||
          (data.attributes?.manufacturer?.toLowerCase() === "insteon");
        this.perDeviceState[deviceId] = {
          state:
            entityType === "sensor"
              ? data.state
              : entityType === "binary_sensor"
              ? data.state
              : entityType === "media_player"
              ? data.state
              : data.state,
          attributes:
            entityType === "sensor"
              ? { unit: data.attributes.unit_of_measurement || "" }
              : entityType === "binary_sensor"
              ? { battery: data.attributes.battery_level || "unknown" }
              : entityType === "media_player"
              ? {
                  volume_level: data.attributes.volume_level || 0,
                  source: data.attributes.source || null,
                  media_title: data.attributes.media_title || null,
                }
              : {
                  brightness: isInsteonDevice()
                    ? Math.round((data.attributes.brightness || 0) / 255 * 100)
                    : data.attributes.brightness || 0,
                  hs_color: data.attributes.hs_color || [data.attributes.hue || 0, data.attributes.saturation || 0],
                },
        };
        const deviceName =
          this.properties.selectedDeviceNames[this.properties.selectedDeviceIds.indexOf(deviceId)] || "Unknown";
        this.updateStatus(`✅ Device "${deviceName}" state: ${this.perDeviceState[deviceId].state}`);
        this.setDirtyCanvas(true);
        this.log("fetchDeviceState", `Fetched state for "${deviceName}"`, true);
        return true;
      } catch (error) {
        this.log("fetchDeviceStateError", `Error fetching state for Device ID ${deviceId}: ${error.message}`, true);
        let statusMessage = `⚠️ Error fetching Device ${deviceId}: ${error.message}`;
        if (error.message.includes("Content Security Policy")) {
          statusMessage = `⚠️ CSP blocked request to ${this.properties.haApiUrl}. Add 'connect-src ${this.properties.haApiUrl}' to your CSP.`;
        } else if (error.message.includes("CORS")) {
          statusMessage = `⚠️ CORS error. Ensure HA allows requests from your app's origin.`;
        }
        this.updateStatus(statusMessage);
        this.perDeviceState[deviceId] ||= { state: "unknown", attributes: {} };
        return false;
      }
    };

    handleHAEvent = (event) => {
      this.lastEvents.push(event);
      if (this.lastEvents.length > 10) this.lastEvents.shift();
      if (event.event_type === "state_changed") {
        const deviceId = event.data.entity_id;
        if (this.properties.selectedDeviceIds.includes(deviceId)) {
          this.handleDeviceStateUpdate({
            entity_id: deviceId,
            state: event.data.new_state.state,
            attributes: event.data.new_state.attributes,
          });
        }
      } else {
        this.log("haEvent", `Received event: ${event.event_type}, data: ${JSON.stringify(event.data)}`, true);
        this.setDirtyCanvas(true);
      }
      this.onExecute();
    };

    handleDeviceStateUpdate = (data) => {
      const deviceId = data.entity_id;
      if (!this.properties.selectedDeviceIds.includes(deviceId)) return;
      const entityType = deviceId.split(".")[0];
      const isInsteonDevice = () =>
        deviceId.includes("insteon") ||
        deviceId.includes("switchlinc") ||
        deviceId.includes("outletlinc") ||
        (data.attributes?.model?.toLowerCase()?.includes("insteon")) ||
        (data.attributes?.manufacturer?.toLowerCase() === "insteon");
      this.perDeviceState[deviceId] = {
        state:
          entityType === "sensor"
            ? data.state
            : entityType === "binary_sensor"
            ? data.state
            : entityType === "media_player"
            ? data.state
            : data.state,
        attributes:
          entityType === "sensor"
            ? { unit: data.attributes.unit_of_measurement || "" }
            : entityType === "binary_sensor"
            ? { battery: data.attributes.battery_level || "unknown" }
            : entityType === "media_player"
            ? {
                volume_level: data.attributes.volume_level || 0,
                source: data.attributes.source || null,
                media_title: data.attributes.media_title || null,
              }
            : {
                brightness: isInsteonDevice()
                  ? Math.round((data.attributes.brightness || 0) / 255 * 100)
                  : data.attributes.brightness || 0,
                hs_color: data.attributes.hs_color || [data.attributes.hue || 0, data.attributes.saturation || 0],
              },
      };
      const deviceName =
        this.properties.selectedDeviceNames[this.properties.selectedDeviceIds.indexOf(deviceId)] || "Unknown";
      this.updateStatus(`✅ Device "${deviceName}" updated: ${this.perDeviceState[deviceId].state}`);
      this.setDirtyCanvas(true);
      this.log("deviceStateUpdate", `Updated state for ${deviceName}: ${JSON.stringify(this.perDeviceState[deviceId])}`, true);
    };

    onDrawForeground = (ctx) => {
      if (super.onDrawForeground) super.onDrawForeground(ctx);
      let widgetsHeight = this.widgets.reduce(
        (sum, w) => sum + (w.computeSize?.(this.size[0])[1] ?? LiteGraph.NODE_WIDGET_HEIGHT),
        0
      );
      widgetsHeight += 15;
      const selectorHeight = this.deviceSelectors.length * 25;
      const overlayStartY = widgetsHeight + selectorHeight + 100;

      this.properties.selectedDeviceIds.forEach((deviceId, index) => {
        if (!deviceId || !this.perDeviceState[deviceId]) return;
        const deviceName = this.properties.selectedDeviceNames[index] || "Unknown";
        const deviceState = this.perDeviceState[deviceId];
        const entityType = deviceId.split(".")[0];
        const yPosition = overlayStartY + index * 25;

        ctx.fillStyle = "#E0E0E0";
        ctx.font = "14px Roboto, Arial, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(deviceName, 10, yPosition);

        const stateX = this.size[0] - 100;
        let stateText = "";
        let dotColor = "#FF0000";
        let showDot = false;

        if (["light", "switch", "fan", "cover", "media_player"].includes(entityType)) {
          const isOn = entityType === "media_player" ? deviceState.state !== "off" : deviceState.state === "on";
          dotColor = isOn ? "#00FF00" : "#FF0000";
          stateText = entityType === "media_player" ? deviceState.state.charAt(0).toUpperCase() + deviceState.state.slice(1) : isOn ? "On" : "Off";
          if (entityType === "media_player" && deviceState.attributes?.volume_level) {
            stateText += `, Vol: ${(deviceState.attributes.volume_level * 100).toFixed(0)}%`;
          }
          showDot = true;
        } else if (entityType === "binary_sensor") {
          dotColor = deviceState.state === "on" ? "#00FF00" : "#FF0000";
          stateText = deviceState.state === "on" ? "Open" : "Closed";
          showDot = true;
          const batterySensor = this.devices.find((d) => d.entity_id === `${deviceId}_battery`);
          if (batterySensor) {
            stateText += `, Battery: ${batterySensor.state}%`;
          } else if (deviceState.attributes?.battery) {
            stateText += `, Battery: ${deviceState.attributes.battery}`;
          } else {
            stateText += `, Battery: Unknown`;
          }
        } else if (entityType === "sensor") {
          stateText = deviceState.state ? `${deviceState.state}${deviceState.attributes?.unit || ""}` : "Unknown";
        }

        if (showDot) {
          ctx.fillStyle = dotColor;
          ctx.beginPath();
          ctx.arc(stateX, yPosition - 5, 10, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#FFFFFF";
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        ctx.fillStyle = "#E0E0E0";
        ctx.font = "12px Roboto, Arial, sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(stateText, this.size[0] - 20, yPosition);
      });
    };

    onExecute = async () => {
      if (!this.deviceManagerReady) {
        this.log("executeDebug", "Device manager not ready, fetching devices", true);
        await this.fetchDevices();
      }

      const combinedData = {
        lights: this.properties.selectedDeviceIds
          .filter((id) => id)
          .map((id) => {
            const device = this.devices.find((d) => d.entity_id === id);
            const state = this.perDeviceState[id] || { state: "unknown", attributes: {} };
            const entityType = id.split(".")[0];
            let output = {
              light_id: id,
              name: this.properties.selectedDeviceNames[this.properties.selectedDeviceIds.indexOf(id)] || "Unknown",
              status: entityType === "media_player" ? (state.state !== "off" ? "On" : "Off") : state.state === "on" ? "On" : "Off",
              entity_type: entityType,
              attributes: state.attributes || {},
            };
            switch (entityType) {
              case "light":
                output.hue = output.attributes.hs_color ? output.attributes.hs_color[0] : 0;
                output.saturation = output.attributes.hs_color ? output.attributes.hs_color[1] : 0;
                output.brightness = output.attributes.brightness || (state.state === "on" ? 100 : 0);
                break;
              case "switch":
              case "fan":
              case "cover":
                output.hue = 0;
                output.saturation = 0;
                output.brightness = state.state === "on" ? 100 : 0;
                if (entityType === "cover") {
                  output.position = output.attributes.position || 0;
                }
                break;
              case "media_player":
                output.hue = 0;
                output.saturation = 0;
                output.brightness = output.attributes.volume_level ? output.attributes.volume_level * 100 : 0;
                output.volume = output.attributes.volume_level || 0;
                output.source = output.attributes.source || null;
                output.media_title = output.attributes.media_title || null;
                break;
              case "sensor":
                output.hue = 0;
                output.saturation = 0;
                output.brightness = 0;
                output.value = state.state || null;
                output.unit = output.attributes.unit || null;
                break;
              case "binary_sensor":
                output.hue = 0;
                output.saturation = 0;
                output.brightness = state.state === "on" ? 100 : 0;
                output.status = state.state === "on" ? "Open" : "Closed";
                const batterySensor = this.devices.find((d) => d.entity_id === `${id}_battery`);
                output.battery = batterySensor ? batterySensor.state : output.attributes.battery || "Unknown";
                break;
              case "weather":
                output.hue = 0;
                output.saturation = 0;
                output.brightness = 0;
                output.temperature = output.attributes.temperature || null;
                output.unit = output.attributes.unit || "°C";
                break;
            }
            return output;
          }),
        status: this.properties.status,
        events: this.lastEvents,
      };

      this.setOutputData(0, combinedData);
      this.log("executeDebug", `Set combined output (slot 0): ${JSON.stringify(combinedData, null, 2)}`, true);

      this.properties.selectedDeviceIds.forEach((deviceId, index) => {
        if (!deviceId) return;
        const device = this.devices.find((d) => d.entity_id === deviceId);
        if (!device) return;
        const state = this.perDeviceState[deviceId] || { state: "unknown", attributes: {} };
        const entityType = deviceId.split(".")[0];
        const deviceData = {
          light_id: deviceId,
          name: this.properties.selectedDeviceNames[index] || "Unknown",
          status: entityType === "media_player" ? (state.state !== "off" ? "On" : "Off") : state.state === "on" ? "On" : "Off",
          entity_type: entityType,
          attributes: state.attributes || {},
        };
        switch (entityType) {
          case "light":
            deviceData.hue = deviceData.attributes.hs_color ? deviceData.attributes.hs_color[0] : 0;
            deviceData.saturation = deviceData.attributes.hs_color ? deviceData.attributes.hs_color[1] : 0;
            deviceData.brightness = deviceData.attributes.brightness || (state.state === "on" ? 100 : 0);
            break;
          case "switch":
          case "fan":
          case "cover":
            deviceData.hue = 0;
            deviceData.saturation = 0;
            deviceData.brightness = state.state === "on" ? 100 : 0;
            if (entityType === "cover") {
              deviceData.position = deviceData.attributes.position || 0;
            }
            break;
          case "media_player":
            deviceData.hue = 0;
            deviceData.saturation = 0;
            deviceData.brightness = deviceData.attributes.volume_level ? deviceData.attributes.volume_level * 100 : 0;
            deviceData.volume = deviceData.attributes.volume_level || 0;
            deviceData.source = deviceData.attributes.source || null;
            deviceData.media_title = deviceData.attributes.media_title || null;
            break;
          case "sensor":
            deviceData.hue = 0;
            deviceData.saturation = 0;
            deviceData.brightness = 0;
            deviceData.value = state.state || null;
            deviceData.unit = deviceData.attributes.unit || null;
            break;
          case "binary_sensor":
            deviceData.hue = 0;
            deviceData.saturation = 0;
            deviceData.brightness = state.state === "on" ? 100 : 0;
            deviceData.status = state.state === "on" ? "Open" : "Closed";
            const batterySensor = this.devices.find((d) => d.entity_id === `${id}_battery`);
            deviceData.battery = batterySensor ? batterySensor.state : deviceData.attributes.battery || "Unknown";
            break;
          case "weather":
            deviceData.hue = 0;
            deviceData.saturation = 0;
            deviceData.brightness = 0;
            deviceData.temperature = deviceData.attributes.temperature || null;
            deviceData.unit = deviceData.attributes.unit || "°C";
            break;
        }
        const wrappedData = {
          lights: [deviceData],
          status: this.properties.status,
          events: this.lastEvents,
        };
        const slotIndex = index + 1;
        if (slotIndex < this.outputs.length) {
          this.setOutputData(slotIndex, wrappedData);
          this.log(
            "executeDebug",
            `Set output slot ${slotIndex} for Device ${index + 1} (ID: ${deviceId}): ${JSON.stringify(wrappedData, null, 2)}`,
            true
          );
        }
      });
    };

    onSerialize = (data) => {
      this.log("serialize", "Serializing node state", true);
      data.properties = { ...this.properties, haApiUrl: this.properties.haApiUrl };
      data.devices = this.devices;
      data.deviceManagerReady = this.deviceManagerReady;
      data.perDeviceState = this.perDeviceState;
      data.lastEvents = this.lastEvents;
      this.log(
        "serialize",
        `Saved state: deviceIds=${this.properties.selectedDeviceIds}, outputs=${this.outputs.length}`,
        true
      );
    };

    onDeserialized = async (data) => {
      this.log("deserialize", "Deserializing node state", true);
      this.properties = {
        selectedDeviceIds: data.properties?.selectedDeviceIds || [],
        selectedDeviceNames: data.properties?.selectedDeviceNames || [],
        status: data.properties?.status || "No action yet",
        debug: data.properties?.debug || false,
        haToken: data.properties?.haToken || "",
        filterType: data.properties?.filterType || "All",
        selectedEvents: data.properties?.selectedEvents || ["state_changed"],
        haApiUrl: data.properties?.haApiUrl || "http://192.168.1.78:8123",
      };
      this.devices = data.devices || [];
      this.deviceManagerReady = data.deviceManagerReady || false;
      this.perDeviceState = data.perDeviceState || {};
      this.lastEvents = data.lastEvents || [];
      this.widgets = [];
      this.deviceSelectors = [];
      this.setupWidgets();
      if (!this.devices.length || !this.deviceManagerReady) {
        this.log("deserialize", "Devices not loaded, fetching devices", true);
        await this.fetchDevices();
      }
      for (const deviceId of this.properties.selectedDeviceIds) {
        if (deviceId) await this.fetchDeviceState(deviceId);
      }
      if (this.socket) this.socket.disconnect();
      if (this.ws) this.ws.close();
      this.initializeConnections();
      this.log("deserialize", "Triggering initial execution", true);
      await this.onExecute();
      if (this.graph) {
        this.graph._version++;
        this.setDirtyCanvas(true);
        setTimeout(async () => {
          await this.onExecute();
          try {
            if (this.graph) {
              this.graph.runStep(1);
              this.log("deserialize", "Triggered graph execution (1000ms)", true);
            }
          } catch (err) {
            this.log("deserializeError", `Failed to run graph step (1000ms): ${err.message}`, true);
          }
        }, 1000);
      }
      this.log(
        "deserialize",
        `Restored state: deviceIds=${this.properties.selectedDeviceIds}, outputs=${this.outputs.length}`,
        true
      );
    };

    onConfigure = (data) => {
      this.log("onConfigure", "Configuring node state", true);
      this.onDeserialized(data);
    };

    onRemoved = () => {
      if (this.socket) this.socket.disconnect();
      if (this.ws) this.ws.close();
    };
  }

  LiteGraph.registerNodeType("HomeAssistant/HAWebSocketEventNode", HAWebSocketEventNode);
  //LiteGraph.registerType("light_info", "object");
}