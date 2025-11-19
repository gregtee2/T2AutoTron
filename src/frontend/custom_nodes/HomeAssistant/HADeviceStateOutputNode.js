if (!LiteGraph.registered_node_types?.["HomeAssistant/HADeviceStateOutputNode"]) {
  class HADeviceStateOutputNode extends LiteGraph.LGraphNode {
    constructor() {
      super();
      Object.assign(this, {
        title: "Home Assistant Device State Output",
        resizable: true,
        autosize: false,
        bgcolor: "rgb(50, 100, 150)",
        properties: {
          selectedDeviceId: null,
          selectedDeviceName: null,
          status: "Select a device",
          debug: false,
          debugLevel: 1,
          haToken: "",
          filterType: "All",
          letterFilter: "All Letters", // New property for letter range filter
        },
        CUSTOM_API_URL: "http://localhost:3000",
        deviceSelector: null,
        devices: [],
        deviceManagerReady: false,
        perDeviceState: {},
        socket: null,
        lastLogTime: 0,
        logCount: 0,
        lastValidOutput: null, // Cache for last valid output data
        isInitialized: false, // Track initialization state
      });

      this.addOutput("Device State", "light_info");
      this.setupWidgets();
      this.initializeSocketIO();

      this.formatTime = this.formatTime.bind(this);
      this.onDrawForeground = this.onDrawForeground.bind(this);
      this.onExecute = this.onExecute.bind(this);
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
        if (this.properties.debugLevel === 1 && !force && (key.includes("execute") || key.includes("Debug"))) return;
        //console.log(`HADeviceStateOutputNode - ${key}: ${message}`);
        this.lastLogged[key] = { time: now, message };
      }
    };

    formatTime(utcTime) {
      if (!utcTime || typeof utcTime !== "string") {
        this.log("formatTimeError", `Invalid time value: ${utcTime}`, true);
        return "Invalid";
      }
      try {
        const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        let date;
        if (utcTime.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}:\d{2}|Z)?$/)) {
          date = new Date(utcTime);
        } else {
          date = new Date(utcTime.endsWith("Z") ? utcTime : `${utcTime}Z`);
        }

        if (isNaN(date.getTime())) {
          this.log("formatTimeError", `Failed to parse time: ${utcTime}`, true);
          return "Invalid";
        }

        const localTime = date.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "numeric",
          hour12: true,
          timeZone: userTimeZone,
        });

        this.log("formatTimeDebug", `Converted ${utcTime} to ${localTime}`, true);
        return localTime;
      } catch (error) {
        this.log("formatTimeError", `Error parsing time ${utcTime}: ${error.message}`, true);
        return utcTime;
      }
    }

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
            type: "combo",
            name: "Filter by Letter",
            value: this.properties.letterFilter,
            callback: (v) => this.onLetterFilterChanged(v),
            options: {
              values: [
                "All Letters",
                "ABC",
                "DEF",
                "GHI",
                "JKL",
                "MNO",
                "PQR",
                "STU",
                "VWX",
                "YZ",
              ],
              width: 100,
            },
          },
          {
            type: "combo",
            name: "Select Device",
            value: this.properties.selectedDeviceName || "Select Device",
            callback: (value) => this.onDeviceSelected(value),
            options: { values: ["Select Device", ...this.getDeviceOptions()], width: widgetWidth - 200 },
          },
          {
            type: "button",
            name: "🔄",
            value: "Refresh Devices",
            callback: () => this.onRefreshDevices(),
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
            name: "HA Token",
            value: this.properties.haToken,
            callback: (v) => {
              this.properties.haToken = v;
              this.log("haTokenUpdate", `Updated HA token`, true);
              this.fetchDevices();
            },
            options: { width: 200 },
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
        this.deviceSelector = this.widgets.find((w) => w.name === "Select Device");
        this.statusWidget = this.widgets.find((w) => w.name === "Status");

        this.updateNodeSize();
      } catch (error) {
        this.log("setupWidgetsError", `Error setting up widgets: ${error.message}`, true);
        this.updateStatus(`⚠️ Error setting up widgets: ${error.message}`);
      }
    };

    updateStatus = (message = null) => {
      const deviceId = this.properties.selectedDeviceId;
      const deviceName = deviceId ? (this.properties.selectedDeviceName || "Unknown") : "No Device";
      const deviceState = deviceId ? (this.perDeviceState[deviceId]?.state || "Unknown") : "Unknown";
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
      let widgetsHeight = this.widgets.reduce((sum, w) => sum + (w.computeSize?.(this.size[0])[1] ?? LiteGraph.NODE_WIDGET_HEIGHT), 0);
      widgetsHeight += 5;
      const outputHeight = this.outputs.length * 20;
      const overlayPadding = 15;
      const textOverlayHeight = this.properties.selectedDeviceId ? 25 : 0;
      const finalPadding = 5;
      this.size[1] = baseHeight + outputHeight + widgetsHeight + overlayPadding + textOverlayHeight + finalPadding;
      this.setSize([this.size[0], this.size[1]]);
      this.setDirtyCanvas(true);
    };

    onFilterChanged = (value) => {
      this.properties.filterType = value;
      this.log("filterChanged", `Filter changed to ${value}`, true);
      if (this.deviceSelector) {
        this.deviceSelector.options.values = ["Select Device", ...this.getDeviceOptions()];
        if (
          this.properties.selectedDeviceName &&
          !this.getDeviceOptions().includes(this.properties.selectedDeviceName)
        ) {
          this.properties.selectedDeviceId = null;
          this.properties.selectedDeviceName = null;
          this.deviceSelector.value = "Select Device";
        }
      }
      this.updateStatus(`✅ Filter set to ${value}`);
      this.updateNodeSize();
      this.setDirtyCanvas(true);
    };

    onLetterFilterChanged = (value) => {
      this.properties.letterFilter = value;
      this.log("letterFilterChanged", `Letter filter changed to ${value}`, true);
      if (this.deviceSelector) {
        this.deviceSelector.options.values = ["Select Device", ...this.getDeviceOptions()];
        if (
          this.properties.selectedDeviceName &&
          !this.getDeviceOptions().includes(this.properties.selectedDeviceName)
        ) {
          this.properties.selectedDeviceId = null;
          this.properties.selectedDeviceName = null;
          this.deviceSelector.value = "Select Device";
        }
      }
      this.updateStatus(`✅ Letter filter set to ${value}`);
      this.updateNodeSize();
      this.setDirtyCanvas(true);
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
        const response = await fetch(`${this.CUSTOM_API_URL}/api/lights/ha/`, {
          headers: { Authorization: `Bearer ${this.properties.haToken}` },
        });
        const data = await response.json();
        if (data.success && data.devices) {
          this.devices = data.devices
            .filter((d) =>
              [
                "light",
                "switch",
                "binary_sensor",
                "sensor",
                "media_player",
                "weather",
                "fan",
                "cover",
              ].includes(d.type)
            )
            .map((d) => {
              const entityType = d.type;
              let state, attributes;
              switch (entityType) {
                case "binary_sensor":
                  state = d.state.on ? "on" : "off";
                  attributes = { battery: "unknown" };
                  break;
                case "sensor":
                  state = d.state.value || "unknown";
                  attributes = { unit: d.state.unit || "" };
                  if (d.entity_id && d.entity_id.includes("sun_next")) {
                    const timeField = d.entity_id.split(".").pop();
                    this.log("fetchDevicesDebug", `Sun time field for ${d.entity_id}: ${JSON.stringify(d.state)}`, true);
                    attributes[timeField] = d.state.value;
                  }
                  break;
                case "light":
                case "switch":
                  state = d.state.on ? "on" : "off";
                  attributes = {
                    brightness: d.state.brightness || (d.state.on ? 100 : 0),
                    hs_color: d.state.hs_color || [0, 0],
                  };
                  break;
                case "media_player":
                  state = d.state.state || "off";
                  attributes = {
                    volume_level: d.state.volume_level || 0,
                    source: d.state.source || null,
                    media_title: d.state.media_title || null,
                  };
                  break;
                case "weather":
                  state = d.state.condition || "unknown";
                  attributes = {
                    temperature: d.state.temperature || null,
                    humidity: d.state.humidity || null,
                    wind_speed: d.state.wind_speed || null,
                    pressure: d.state.pressure || null,
                    precipitation: d.state.precipitation || null,
                  };
                  break;
                case "fan":
                  state = d.state.on ? "on" : "off";
                  attributes = { percentage: d.state.percentage || 0 };
                  break;
                case "cover":
                  state = d.state.on ? "open" : "closed";
                  attributes = { position: d.state.position || 0 };
                  break;
                default:
                  state = "unknown";
                  attributes = {};
              }
              const device = {
                entity_id: d.id.replace("ha_", ""),
                name: d.name.trim(),
                entityType: entityType,
                state,
                attributes,
              };
              this.log("fetchDevicesDevice", `Processed device: ${device.name} (${entityType})`, true);
              return device;
            })
            .sort((a, b) => a.name.localeCompare(b.name));
          this.deviceManagerReady = true;
          this.updateStatus("✅ Devices fetched successfully.");
          this.log("fetchDevices", `Fetched ${this.devices.length} devices`, true);
          if (this.deviceSelector) {
            this.deviceSelector.options.values = ["Select Device", ...this.getDeviceOptions()];
            if (this.properties.selectedDeviceName && !this.getDeviceOptions().includes(this.properties.selectedDeviceName)) {
              this.properties.selectedDeviceId = null;
              this.properties.selectedDeviceName = null;
              this.deviceSelector.value = "Select Device";
            }
          }
        } else {
          throw new Error(data.error || "No devices returned");
        }
      } catch (error) {
        this.log("fetchDevicesError", `Error fetching devices: ${error.message}`, true);
        this.updateStatus(`⚠️ Error fetching devices: ${error.message}`);
        this.devices = [];
        this.deviceManagerReady = false;
      }
    };

    getDeviceOptions = () => {
      const filterType = this.properties.filterType;
      const letterFilter = this.properties.letterFilter;
      const normalizedFilterType = HADeviceStateOutputNode.filterTypeMap[filterType] || filterType.toLowerCase().replace(/\s+/g, "_");

      const letterRanges = {
        ABC: { start: "A", end: "C" },
        DEF: { start: "D", end: "F" },
        GHI: { start: "G", end: "I" },
        JKL: { start: "J", end: "L" },
        MNO: { start: "M", end: "O" },
        PQR: { start: "P", end: "R" },
        STU: { start: "S", end: "T" },
        VWX: { start: "V", end: "X" },
        YZ: { start: "Y", end: "Z" },
        "All Letters": { start: "A", end: "Z" },
      };

      const filteredDevices = this.devices.filter((device) => {
        if (normalizedFilterType !== "all" && device.entityType.toLowerCase() !== normalizedFilterType) {
          return false;
        }
        if (letterFilter === "All Letters") return true;
        const range = letterRanges[letterFilter];
        if (!range) return false;
        const firstLetter = device.name.trim().toUpperCase().charAt(0);
        return firstLetter >= range.start && firstLetter <= range.end;
      });

      const options = this.deviceManagerReady && filteredDevices.length
        ? filteredDevices.map((d) => d.name).sort((a, b) => a.localeCompare(b))
        : ["No Devices Found"];

      const selectedName = this.properties.selectedDeviceName;
      if (selectedName && !options.includes(selectedName)) {
        options.push(selectedName);
      }

      return [...new Set(options)];
    };

    onRefreshDevices = async () => {
      this.properties.selectedDeviceId = null;
      this.properties.selectedDeviceName = null;
      this.perDeviceState = {};
      if (this.deviceSelector) {
        this.deviceSelector.value = "Select Device";
      }
      await this.fetchDevices();
      if (this.deviceSelector) {
        this.deviceSelector.options.values = ["Select Device", ...this.getDeviceOptions()];
      }
      this.updateNodeSize();
      this.setDirtyCanvas(true);
      this.updateStatus(`✅ Refreshed device list for filter: ${this.properties.filterType}, letter: ${this.properties.letterFilter}`);
    };

    onDeviceSelected = async (value) => {
      if (value === "Select Device" || value === "No Devices Found") {
        const removedDeviceId = this.properties.selectedDeviceId;
        if (removedDeviceId && this.perDeviceState[removedDeviceId]) {
          delete this.perDeviceState[removedDeviceId];
        }
        this.properties.selectedDeviceId = null;
        this.properties.selectedDeviceName = null;
        this.updateNodeSize();
        this.setDirtyCanvas(true);
        this.updateStatus(`✅ Deselected device`);
        this.log("deviceSelected", `Deselected device`, true);
        return;
      }

      if (!this.deviceManagerReady) await this.fetchDevices();
      const filterType = this.properties.filterType;
      const letterFilter = this.properties.letterFilter;
      const normalizedFilterType = HADeviceStateOutputNode.filterTypeMap[filterType] || filterType.toLowerCase().replace(/\s+/g, "_");

      const letterRanges = {
        ABC: { start: "A", end: "C" },
        DEF: { start: "D", end: "F" },
        GHI: { start: "G", end: "I" },
        JKL: { start: "J", end: "L" },
        MNO: { start: "M", end: "O" },
        PQR: { start: "P", end: "R" },
        STU: { start: "S", end: "T" },
        VWX: { start: "V", end: "X" },
        YZ: { start: "Y", end: "Z" },
        "All Letters": { start: "A", end: "Z" },
      };

      const filteredDevices = this.devices.filter((device) => {
        if (normalizedFilterType !== "all" && device.entityType.toLowerCase() !== normalizedFilterType) {
          return false;
        }
        if (letterFilter === "All Letters") return true;
        const range = letterRanges[letterFilter];
        if (!range) return false;
        const firstLetter = device.name.trim().toUpperCase().charAt(0);
        return firstLetter >= range.start && firstLetter <= range.end;
      });

      const device = filteredDevices.find((d) => d.name.trim() === value.trim());
      if (!device) {
        this.updateStatus(`⚠️ Device "${value}" not found.`);
        this.log("deviceSelectedWarn", `No device found for name: ${value}`, true);
        if (this.deviceSelector) this.deviceSelector.value = "Select Device";
        return;
      }

      const deviceId = device.entity_id;
      this.properties.selectedDeviceId = deviceId;
      this.properties.selectedDeviceName = device.name;
      await this.fetchDeviceState(deviceId);
      this.updateNodeSize();
      this.setDirtyCanvas(true);
      this.log("deviceSelected", `Selected device "${device.name}"`, true);
    };

    fetchDeviceState = async (deviceId) => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const response = await fetch(`${this.CUSTOM_API_URL}/api/lights/ha/ha_${deviceId}/state`, {
            headers: {
              Authorization: `Bearer ${this.properties.haToken}`,
              "Content-Type": "application/json",
            },
            signal: AbortSignal.timeout(5000),
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          const data = await response.json();
          if (data.success && data.state) {
            const device = this.devices.find((d) => d.entity_id === deviceId);
            const entityType = deviceId.split(".")[0];
            const isInsteonDevice = () =>
              deviceId.includes("insteon") ||
              deviceId.includes("switchlinc") ||
              deviceId.includes("outletlinc") ||
              (device.attributes?.model?.toLowerCase().includes("insteon")) ||
              (device.attributes?.manufacturer?.toLowerCase() === "insteon");
            this.perDeviceState[deviceId] = {
              state:
                entityType === "sensor"
                  ? data.state.value
                  : entityType === "binary_sensor"
                  ? data.state.on
                    ? "on"
                    : "off"
                  : entityType === "media_player"
                  ? data.state.state
                  : data.state.on
                  ? "on"
                  : "off",
              attributes:
                entityType === "sensor"
                  ? { unit: data.state.unit || "" }
                  : entityType === "binary_sensor"
                  ? { battery: "unknown" }
                  : entityType === "media_player"
                  ? {
                      volume_level: data.state.volume_level || 0,
                      source: data.state.source || null,
                      media_title: data.state.media_title || null,
                    }
                  : {
                      brightness: isInsteonDevice()
                        ? Math.round((data.state.brightness || 0) / 255 * 100)
                        : data.state.brightness || 0,
                      hs_color: data.state.hs_color || [data.state.hue || 0, data.state.saturation || 0],
                    },
            };
            const deviceName = this.properties.selectedDeviceName || "Unknown";
            this.updateStatus(`✅ Device "${deviceName}" state: ${this.perDeviceState[deviceId].state}`);
            this.setDirtyCanvas(true);
            this.log("fetchDeviceState", `Fetched state for "${deviceName}"`, true);
            return true;
          }
          throw new Error(data.error || "No state returned");
        } catch (error) {
          this.log(
            "fetchDeviceStateError",
            `Error fetching state for Device ID ${deviceId} (attempt ${attempt + 1}): ${error.message}`,
            true
          );
          if (attempt === 2) {
            this.updateStatus(`⚠️ Error fetching Device ${deviceId}: ${error.message}`);
            this.perDeviceState[deviceId] ||= { state: "unknown", attributes: {} };
            return false;
          }
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
      return false;
    };

    handleDeviceStateUpdate = (data) => {
      const deviceId = data.id ? data.id.replace("ha_", "") : data.entity_id;
      if (deviceId !== this.properties.selectedDeviceId) return;
      const entityType = deviceId.split(".")[0];
      const isInsteonDevice = () =>
        deviceId.includes("insteon") ||
        deviceId.includes("switchlinc") ||
        deviceId.includes("outletlinc") ||
        (data.model?.toLowerCase()?.includes("insteon")) ||
        (data.manufacturer?.toLowerCase() === "insteon");
      try {
        this.perDeviceState[deviceId] = {
          state:
            entityType === "sensor"
              ? data.value || data.state || "unknown"
              : entityType === "binary_sensor"
              ? data.on || data.state === "on"
                ? "on"
                : "off"
              : entityType === "media_player"
              ? data.state || "off"
              : data.on || data.state === "on"
              ? "on"
              : "off",
          attributes:
            entityType === "sensor"
              ? { unit: data.unit || data.attributes?.unit_of_measurement || "" }
              : entityType === "binary_sensor"
              ? { battery: data.battery_level || data.attributes?.battery_level || "unknown" }
              : entityType === "media_player"
              ? {
                  volume_level: data.volume_level || data.attributes?.volume_level || 0,
                  source: data.source || data.attributes?.source || null,
                  media_title: data.media_title || data.attributes?.media_title || null,
                }
              : {
                  brightness: isInsteonDevice()
                    ? Math.round((data.brightness || data.attributes?.brightness || 0) / 255 * 100)
                    : data.brightness || data.attributes?.brightness || 0,
                  hs_color:
                    data.hs_color ||
                    data.attributes?.hs_color ||
                    [data.hue || data.attributes?.hue || 0, data.saturation || data.attributes?.saturation || 0],
                },
        };
        const deviceName = this.properties.selectedDeviceName || "Unknown";
        this.updateStatus(`✅ Device "${deviceName}" updated: ${this.perDeviceState[deviceId].state}`);
        this.setDirtyCanvas(true);
        this.log("deviceStateUpdate", `Updated state for ${deviceName}`, true);
      } catch (error) {
        this.log("stateUpdateError", `Error processing update for ${deviceId}: ${error.message}`, true);
      }
    };

    onDrawForeground(ctx) {
      if (super.onDrawForeground) super.onDrawForeground(ctx);
      let widgetsHeight = this.widgets.reduce((sum, w) => sum + (w.computeSize?.(this.size[0])[1] ?? LiteGraph.NODE_WIDGET_HEIGHT), 0);
      widgetsHeight += 15;
      const outputHeight = this.outputs.length * 20;
      const overlayStartY = outputHeight + widgetsHeight + 35;

      const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      this.log("drawForegroundDebug", `User time zone: ${userTimeZone}`, true);

      const deviceId = this.properties.selectedDeviceId;
      if (!deviceId || !this.perDeviceState[deviceId]) return;
      const deviceName = this.properties.selectedDeviceName || "Unknown";
      const deviceState = this.perDeviceState[deviceId];
      const entityType = deviceId.split(".")[0];
      const yPosition = overlayStartY;

      ctx.fillStyle = "#E0E0E0";
      ctx.font = "14px Roboto, Arial, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(deviceName, 10, yPosition);

      const onOffX = this.size[0] - 100;
      let stateText = "";
      let dotColor = "#FF0000";
      let showDot = false;

      const timeFields = [
        "sunrise",
        "sunset",
        "sun_next_dawn",
        "sun_next_dusk",
        "last_updated",
        "last_changed",
        "next_dawn",
        "next_dusk",
        "next_midnight",
        "next_noon",
      ];

      const formatLabel = (field) => {
        return field
          .split("_")
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" ");
      };

      const formatNumber = (value, unit = "") => {
        if (typeof value !== "number") return value;
        const rounded = Math.round(value * 10) / 10;
        return `${rounded}${unit}`;
      };

      if (["light", "switch", "fan", "cover", "media_player"].includes(entityType)) {
        const isOn = entityType === "media_player" ? deviceState.state !== "off" : deviceState.state === "on";
        dotColor = isOn ? "#00FF00" : "#FF0000";
        stateText = entityType === "media_player" ? deviceState.state.charAt(0).toUpperCase() + deviceState.state.slice(1) : isOn ? "On" : "Off";
        showDot = true;

        if (deviceState.attributes) {
          if (entityType === "light" && deviceState.attributes.brightness) {
            stateText += `, Bright: ${formatNumber(deviceState.attributes.brightness, "%")}`;
          }
          if (entityType === "media_player" && deviceState.attributes.volume_level) {
            stateText += `, Vol: ${formatNumber(deviceState.attributes.volume_level * 100, "%")}`;
          }
          if (entityType === "cover" && deviceState.attributes.position) {
            stateText += `, Pos: ${formatNumber(deviceState.attributes.position, "%")}`;
          }
        }
      } else if (entityType === "binary_sensor") {
        dotColor = deviceState.state === "on" ? "#00FF00" : "#FF0000";
        stateText = deviceState.state === "on" ? "Open" : "Closed";
        showDot = true;
        const batterySensor = this.devices.find((d) => d.entity_id === `${deviceId}_battery`);
        if (batterySensor) {
          stateText += `, Battery: ${formatNumber(batterySensor.state, "%")}`;
        } else if (deviceState.attributes && deviceState.attributes.battery) {
          stateText += `, Battery: ${deviceState.attributes.battery}`;
        } else {
          stateText += `, Battery: Unknown`;
        }
      } else if (entityType === "sensor") {
        stateText = deviceState.state ? `${deviceState.state}${deviceState.attributes?.unit || ""}` : "Unknown";
        if (deviceState.attributes?.unit === "°C" && deviceState.state) {
          const celsius = parseFloat(deviceState.state);
          if (!isNaN(celsius)) {
            const fahrenheit = (celsius * 9 / 5) + 32;
            stateText = `${formatNumber(fahrenheit, "°F")}`;
          }
        }
        if (deviceId.includes("sun_next")) {
          const timeField = deviceId.split(".").pop();
          if (deviceState.attributes && deviceState.attributes[timeField]) {
            stateText = `${formatLabel(timeField)}: ${this.formatTime(deviceState.attributes[timeField])}`;
          } else if (deviceState.state && deviceState.state !== "unknown") {
            stateText = `${formatLabel(timeField)}: ${this.formatTime(deviceState.state)}`;
          }
        }
      } else if (entityType === "weather") {
        stateText = deviceState.state ? `${deviceState.state}` : "Unknown";
        if (deviceState.attributes) {
          if (deviceState.attributes.temperature) {
            const temp = deviceState.attributes.temperature;
            const unit = deviceState.attributes.unit || "°C";
            stateText += `, Temp: ${unit === "°C" ? formatNumber((temp * 9 / 5) + 32, "°F") : formatNumber(temp, unit)}`;
          }
        }
      }

      if (deviceState.attributes) {
        this.log("drawForegroundDebug", `Attributes for ${deviceId}: ${JSON.stringify(deviceState.attributes)}`, true);
        const timeField = timeFields.find((field) => deviceState.attributes[field]);
        if (timeField && !deviceId.includes("sun_next")) {
          stateText += `, ${formatLabel(timeField)}: ${this.formatTime(deviceState.attributes[timeField])}`;
        } else if (!timeField) {
          this.log("drawForegroundDebug", `No time fields found for ${deviceId}`, true);
        }
      }

      if (showDot) {
        ctx.fillStyle = dotColor;
        ctx.beginPath();
        ctx.arc(onOffX, yPosition - 5, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      ctx.fillStyle = "#E0E0E0";
      ctx.font = "12px Roboto, Arial, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(stateText, this.size[0] - 20, yPosition);
    }

    async onExecute() {
      if (!this.isInitialized) {
        this.log("execute", "Node not initialized, fetching devices", true);
        await this.fetchDevices();
      }

      const deviceId = this.properties.selectedDeviceId;
      const timeFields = [
        "sunrise",
        "sunset",
        "sun_next_dawn",
        "sun_next_dusk",
        "last_updated",
        "last_changed",
        "next_dawn",
        "next_dusk",
        "next_midnight",
        "next_noon",
      ];

      let outputData = this.lastValidOutput;
      if (deviceId) {
        const device = this.devices.find((d) => d.entity_id === deviceId);
        if (!device) {
          this.log("execute", `No device found for deviceId ${deviceId}`, true);
        } else {
          const state = this.perDeviceState[deviceId] || { state: "unknown", attributes: {} };
          if (!state) {
            this.log("execute", `No state found for deviceId ${deviceId}`, true);
          }
          const entityType = deviceId.split(".")[0];
          const deviceData = {
            light_id: deviceId,
            name: this.properties.selectedDeviceName || "Unknown",
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
              deviceData.unit = state.attributes.unit || null;
              if (deviceId.includes("sun_next")) {
                const timeField = deviceId.split(".").pop();
                if (state.attributes && state.attributes[timeField]) {
                  deviceData.value = this.formatTime(state.attributes[timeField]);
                  deviceData.unit = "";
                } else if (state.state && state.state !== "unknown") {
                  deviceData.value = this.formatTime(state.state);
                  deviceData.unit = "";
                }
              }
              break;
            case "binary_sensor":
              deviceData.hue = 0;
              deviceData.saturation = 0;
              deviceData.brightness = state.state === "on" ? 100 : 0;
              deviceData.status = state.state === "on" ? "Open" : "Closed";
              const batterySensor = this.devices.find((d) => d.entity_id === `${deviceId}_battery`);
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

          if (deviceData.attributes) {
            timeFields.forEach((field) => {
              if (deviceData.attributes[field]) {
                deviceData.attributes[field] = this.formatTime(deviceData.attributes[field]);
              }
            });
          }

          outputData = {
            lights: [deviceData],
            status: this.properties.status,
          };
        }
      }

      this.setOutputData(0, outputData);
      if (outputData) {
        this.lastValidOutput = outputData;
        this.log("execute", `Set output for device ${deviceId || "none"}: ${JSON.stringify(outputData, null, 2)}`, true);
      } else {
        this.log("execute", `No device selected, using cached output`, true);
      }

      if (this.deviceManagerReady && this.devices.length) {
        this.isInitialized = true;
      }

      this.setDirtyCanvas(true);
    }

    onSerialize = (data) => {
      this.log("serialize", "Serializing node state", true);
      data.properties = {
        ...this.properties,
        letterFilter: this.properties.letterFilter,
      };
      data.devices = this.devices;
      data.deviceManagerReady = this.deviceManagerReady;
      data.perDeviceState = this.perDeviceState;
      data.lastValidOutput = this.lastValidOutput;
      this.log("serialize", `Saved state: deviceId=${this.properties.selectedDeviceId}, outputs=1`, true);
    };

    onDeserialized = async (data) => {
      this.log("deserialize", "Deserializing node state", true);

      this.properties = {
        selectedDeviceId: data.properties?.selectedDeviceId || null,
        selectedDeviceName: data.properties?.selectedDeviceName || null,
        status: data.properties?.status || "Select a device",
        debug: data.properties?.debug || false,
        debugLevel: data.properties?.debugLevel || 1,
        haToken: data.properties?.haToken || "",
        filterType: data.properties?.filterType || "All",
        letterFilter: data.properties?.letterFilter || "All Letters",
      };
      this.devices = data.devices || [];
      this.deviceManagerReady = data.deviceManagerReady || false;
      this.perDeviceState = data.perDeviceState || {};
      this.lastValidOutput = data.lastValidOutput || null;
      this.isInitialized = false;

      this.widgets = [];
      this.deviceSelector = null;
      this.setupWidgets();

      if (!this.devices.length || !this.deviceManagerReady) {
        this.log("deserialize", "Devices not loaded, fetching devices", true);
        await this.fetchDevices();
      }

      if (this.properties.selectedDeviceId) {
        await this.fetchDeviceState(this.properties.selectedDeviceId);
      }

      if (this.socket) {
        this.socket.disconnect();
      }
      this.initializeSocketIO();

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
        setTimeout(async () => {
          await this.onExecute();
          try {
            if (this.graph) {
              this.graph.runStep(1);
              this.log("deserialize", "Triggered graph execution (2000ms)", true);
            }
          } catch (err) {
            this.log("deserializeError", `Failed to run graph step (2000ms): ${err.message}`, true);
          }
        }, 2000);
      }

      this.log("deserialize", `Restored state: deviceId=${this.properties.selectedDeviceId}, outputs=1`, true);
    };

    onConfigure = (data) => {
      this.log("onConfigure", "Configuring node state", true);
      this.onDeserialized(data);
    };

    onRemoved() {
      if (this.socket) this.socket.disconnect();
    }
  }

  LiteGraph.registerNodeType("HomeAssistant/HADeviceStateOutputNode", HADeviceStateOutputNode);
}