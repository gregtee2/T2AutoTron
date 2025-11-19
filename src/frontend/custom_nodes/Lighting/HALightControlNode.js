if (!LiteGraph.registered_node_types?.["Lighting/HALightControlNode"]) {
  class HALightControlNode extends LiteGraph.LGraphNode {
    constructor() {
      super();
      Object.assign(this, {
        title: "Home Assistant Light Control",
        resizable: true,
        autosize: false,
        bgcolor: "rgb(80, 120, 160)",
        properties: {
          selectedLightIds: [],
          selectedLightNames: [],
          status: "No action yet",
          isCollapsed: false,
          maxRetries: 3,
          maxCommandRetries: 2,
          transitionTime: 1000,
          enforceInput: false,
          debug: true,
          filterType: "All",
        },
        HA_API_URL: "http://localhost:3000",
        lightSelectors: [],
        devices: [],
        deviceManagerReady: false,
        perLightState: {},
        commandQueue: [],
        isProcessingQueue: false,
        lastCommandTimestamp: 0,
        EXTERNAL_CHANGE_THRESHOLD: 5000,
        HSV_DEBOUNCE_DELAY: 300,
        hsvDebounceTimer: null,
        lastLogged: {},
        lastTriggerInput: null,
        lastHsvInput: null,
        lastStateRefresh: 0,
        isConfigured: false,
        enforceInitialTrigger: false,
        commandRetryCounts: new Map(),
      });
      this.addInput("HSV Info", "hsv_info");
      this.addInput("Trigger", "boolean");
      this.addOutput("Light Info", "light_info");
      this.setupWidgets();
      this.initializeSocketIO();
      this.isConfigured = true;
    }

    log = (key, message, force = false) => {
      if (!this.properties.debug && !force) return;
      const now = Date.now();
      this.lastLogged = this.lastLogged || {};
      const lastLog = this.lastLogged[key] || { time: 0, message: "" };
      if (force || now - lastLog.time > 1000 || lastLog.message !== message) {
        //console.log(`HALightControlNode - ${message}`);
        this.lastLogged[key] = { time: now, message };
      }
    };

    setupWidgets = () => {
      try {
        const widgetWidth = this.size[0] - 20;
        const widgets = [
          { type: "combo", name: "Filter Devices", value: this.properties.filterType, callback: (v) => this.onFilterChanged(v), options: { values: ["All", "Hue", "Kasa", "Rooms"], width: 100 } },
          { type: "button", name: "➕", value: "Add Light", callback: () => this.onAddLight(), options: { width: 40 } },
          { type: "button", name: "➖", value: "Remove Light", callback: () => this.onRemoveLight(), options: { width: 40 } },
          { type: "button", name: "🔄", value: "Refresh Devices", callback: () => this.onRefreshDevices(), options: { width: 40 } },
          {
            type: "number",
            name: "Transition (ms)",
            value: this.properties.transitionTime,
            callback: (v) => (this.properties.transitionTime = Math.max(0, v)),
            options: { min: 0, max: 5000, step: 100, width: 100 },
          },
          {
            type: "number",
            name: "Command Retries",
            value: this.properties.maxCommandRetries,
            callback: (v) => (this.properties.maxCommandRetries = Math.max(0, Math.min(5, v))),
            options: { min: 0, max: 5, step: 1, width: 100 },
          },
          {
            type: "toggle",
            name: "Enforce Input",
            value: this.properties.enforceInput,
            callback: (v) => {
              this.properties.enforceInput = v;
              this.log("enforceToggle", `Enforce Input toggled to ${v}`, true);
              this.updateStatus();
            },
            options: { width: 100 },
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
            type: "button",
            name: "▼",
            value: "Collapse",
            callback: () => this.toggleCollapse(),
            options: { width: 40 },
          },
          {
            type: "text",
            name: "Status",
            value: this.properties.status,
            options: { property: "status", readonly: true, width: widgetWidth - 400 },
          },
        ];
        this.widgets = widgets.map(({ type, name, value, callback, options }) =>
          this.addWidget(type, name, value, callback, options)
        );
        this.statusWidget = this.widgets.find((w) => w.name === "Status");
        this.collapseButton = this.widgets.find((w) => w.name === "▼");
      } catch (error) {
        this.log("setupWidgetsError", `Error setting up widgets: ${error.message}`, true);
        this.updateStatus(`⚠️ Error setting up widgets: ${error.message}`);
      }
    };

    onFilterChanged = (value) => {
      this.properties.filterType = value;
      this.log("filterChanged", `Filter changed to ${value}`, true);
      this.restoreLightSelectors();
      this.updateStatus(`✅ Filter set to ${value}`);
    };

    initializeSocketIO = () => {
      this.socket = io(this.HA_API_URL, {
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
        const response = await fetch(`${this.HA_API_URL}/api/lights/ha`, { signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        const data = await response.json();
        this.log("fetchDevicesDebug", `Raw API response: ${JSON.stringify(data, null, 2)}`, true);
        if (data.success && data.devices) {
          this.devices = data.devices
            .filter((d) => d.id && (d.type === "light" || d.type === "switch"))
            .map((d) => ({
              light_id: d.id,
              name: `[HA] ${d.name}`,
              type: d.type,
              hasColor: d.state && d.state.hs_color && Array.isArray(d.state.hs_color) && d.state.hs_color.length === 2,
            }))
            .sort((a, b) => a.name.localeCompare(b.name));
          this.log("fetchDevicesDebug", `Filtered devices: ${JSON.stringify(this.devices, null, 2)}`, true);
          this.deviceManagerReady = true;
          this.updateStatus("✅ Devices fetched successfully.");
          this.log("fetchDevices", "Devices fetched successfully", true);
          this.restoreLightSelectors();
        } else {
          throw new Error(data.error || "No devices returned");
        }
      } catch (error) {
        this.log("fetchDevicesError", `Error fetching devices: ${error.message}`, true);
        this.updateStatus(`⚠️ Error fetching devices: ${error.message}`);
      }
    };

    restoreLightSelectors = () => {
      this.lightSelectors = [];
      this.widgets = this.widgets.filter((w) => !w.name.startsWith("Select Light"));
      const filterType = this.properties.filterType;

      const filteredDevices = this.devices.filter((device) => {
        if (filterType === "All") return true;
        if (filterType === "Hue") return device.type === "light" && device.hasColor;
        if (filterType === "Kasa") return device.type === "switch" || device.name.toLowerCase().includes("kasa");
        if (filterType === "Rooms") return device.type === "light" && device.name.match(/\b(Room|Living|Kitchen|Bedroom|Office|Garage)\b/i);
        return true;
      });

      const validLightIds = this.properties.selectedLightIds.filter((lightId) =>
        lightId && filteredDevices.find((d) => d.light_id === lightId)
      );
      const validLightNames = validLightIds.map(
        (lightId) => filteredDevices.find((d) => d.light_id === lightId)?.name ?? this.properties.selectedLightNames[this.properties.selectedLightIds.indexOf(lightId)] ?? "Unknown"
      );
      this.properties.selectedLightIds = validLightIds;
      this.properties.selectedLightNames = validLightNames;
      validLightIds.forEach((lightId, index) => {
        const lightName = validLightNames[index];
        const lightSelector = this.addWidget(
          "combo",
          `Select Light ${index + 1}`,
          lightName,
          (value) => this.onLightSelected(value, index),
          { values: ["Select Light", ...this.getLightOptions()], width: this.size[0] - 20 }
        );
        this.lightSelectors.push(lightSelector);
        this.perLightState[lightId] ??= { on: false, hue: 0, saturation: 0, brightness: 0 };
      });
      this.updateNodeSize();
      this.setDirtyCanvas(true);
      this.log("restoreLightSelectors", "Light selectors restored", true);
    };

    getLightOptions = () => {
      const filterType = this.properties.filterType;
      const filteredDevices = this.devices.filter((device) => {
        if (filterType === "All") return true;
        if (filterType === "Hue") return device.type === "light" && device.hasColor;
        if (filterType === "Kasa") return device.type === "switch" || device.name.toLowerCase().includes("kasa");
        if (filterType === "Rooms") return device.type === "light" && device.name.match(/\b(Room|Living|Kitchen|Bedroom|Office|Garage)\b/i);
        return true;
      });
      return this.deviceManagerReady && filteredDevices.length ? filteredDevices.map((d) => d.name) : ["No Lights Found"];
    };

    onAddLight = () => {
      if (!this.deviceManagerReady) {
        this.updateStatus("⚠️ Device manager not ready.");
        return;
      }
      if (this.lightSelectors.length >= 20) {
        this.updateStatus("⚠️ Maximum of 20 lights reached.");
        return;
      }
      const lightSelector = this.addWidget(
        "combo",
        `Select Light ${this.lightSelectors.length + 1}`,
        "Select Light",
        (value) => this.onLightSelected(value, this.lightSelectors.indexOf(lightSelector)),
        { values: ["Select Light", ...this.getLightOptions()], width: this.size[0] - 20 }
      );
      this.lightSelectors.push(lightSelector);
      this.properties.selectedLightIds.push(null);
      this.properties.selectedLightNames.push(null);
      this.updateNodeSize();
      this.setDirtyCanvas(true);
      this.updateStatus(`✅ Added light selector ${this.lightSelectors.length}.`);
      this.log("addLight", `Added light selector ${this.lightSelectors.length}`, true);
    };

    onRemoveLight = () => {
      if (!this.lightSelectors.length) {
        this.updateStatus("⚠️ No lights to remove.");
        return;
      }
      const lightSelector = this.lightSelectors.pop();
      this.widgets = this.widgets.filter((w) => w !== lightSelector);
      const removedLightId = this.properties.selectedLightIds.pop();
      this.properties.selectedLightNames.pop();
      if (removedLightId && this.perLightState[removedLightId]) {
        delete this.perLightState[removedLightId];
      }
      this.updateNodeSize();
      this.setDirtyCanvas(true);
      this.updateStatus(`✅ Removed light selector`);
      this.log("removeLight", `Removed light selector`, true);
    };

    onLightSelected = async (value, index) => {
      if (value === "Select Light" || value === "No Lights Found") {
        const removedLightId = this.properties.selectedLightIds[index];
        if (removedLightId && this.perLightState[removedLightId]) {
          delete this.perLightState[removedLightId];
        }
        this.properties.selectedLightIds[index] = null;
        this.properties.selectedLightNames[index] = null;
        this.updateNodeSize();
        this.setDirtyCanvas(true);
        this.updateStatus(`✅ Deselected light at selector ${index + 1}.`);
        this.log("lightSelected", `Deselected light at selector ${index + 1}`, true);
        return;
      }
      if (!this.deviceManagerReady) await this.fetchDevices();
      const device = this.devices.find((d) => d.name === value);
      if (!device) {
        this.updateStatus(`⚠️ Light "${value}" not found.`);
        this.log("lightSelectedWarn", `No device found for name: ${value}`, true);
        return;
      }
      const { light_id: lightId, name: lightName } = device;
      if (this.properties.selectedLightIds.includes(lightId)) {
        this.updateStatus(`⚠️ Light "${lightName}" already selected.`);
        this.lightSelectors[index].value = "Select Light";
        return;
      }
      this.properties.selectedLightIds[index] = lightId;
      this.properties.selectedLightNames[index] = lightName;
      this.perLightState[lightId] = { on: false, hue: 0, saturation: 0, brightness: 0 };
      await this.fetchLightStateAndColor(lightId);
      this.updateNodeSize();
      this.setDirtyCanvas(true);
      this.log("lightSelected", `Selected light "${lightName}" at selector ${index + 1}`, true);
    };

    onRefreshDevices = async () => {
      await this.fetchDevices();
      for (const lightId of this.properties.selectedLightIds) {
        if (lightId) await this.fetchLightStateAndColor(lightId);
      }
      this.updateStatus("✅ Devices refreshed.");
      this.log("refreshDevices", "Devices refreshed", true);
    };

    fetchLightStateAndColor = async (lightId) => {
      for (let attempt = 0; attempt < this.properties.maxRetries; attempt++) {
        try {
          if (lightId.startsWith("kasa_")) {
            this.log("fetchLightStateWarn", `Kasa device ${lightId}: Setting default state`, true);
            this.perLightState[lightId] = {
              on: false,
              hue: 0,
              saturation: 0,
              brightness: 0,
            };
            return true;
          }
          const response = await fetch(`${this.HA_API_URL}/api/lights/ha/${encodeURIComponent(lightId)}/state`, {
            signal: AbortSignal.timeout(5000),
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          const data = await response.json();
          if (data.success && data.state) {
            const { on, hs_color = [0, 0], brightness = on ? 100 : 0 } = data.state;
            this.perLightState[lightId] = {
              on,
              hue: hs_color[0],
              saturation: hs_color[1],
              brightness,
            };
            const lightName = this.properties.selectedLightNames[this.properties.selectedLightIds.indexOf(lightId)] || "Unknown";
            this.updateStatus(`✅ Light "${lightName}" is ${on ? "On" : "Off"}`);
            this.setDirtyCanvas(true);
            this.log("fetchLightState", `Fetched state for "${lightName}": on=${on}, hue=${hs_color[0]}, sat=${hs_color[1]}, bri=${brightness}`, true);
            return true;
          }
          throw new Error(data.error || "No state returned");
        } catch (error) {
          this.log("fetchLightStateError", `Error fetching state for Light ID ${lightId} (attempt ${attempt + 1}): ${error.message}`, true);
          if (attempt === this.properties.maxRetries - 1) {
            this.updateStatus(`⚠️ Error fetching Light ${lightId}: ${error.message}`);
            this.perLightState[lightId] = this.perLightState[lightId] ?? { on: false, hue: 0, saturation: 0, brightness: 0 };
            return false;
          }
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
      return false;
    };

    updateLightState = async (lightId, update, source = "application") => {
      if (!lightId || !this.perLightState[lightId]) {
        this.log("updateLightStateWarn", `Invalid lightId or missing state for ${lightId}`, true);
        return false;
      }
      const now = Date.now();
      const lightName = this.properties.selectedLightNames[this.properties.selectedLightIds.indexOf(lightId)] || "Unknown";
      const isExternal = source === "external";
      const commandEnforceInput = update.enforceInput ?? this.properties.enforceInput;
      const isTriggerCommand = update.isTriggerCommand ?? false;

      if (isExternal) {
        const newState = {
          on: update.on ?? this.perLightState[lightId].on,
          hue: update.hue ?? this.perLightState[lightId].hue,
          saturation: update.saturation ?? this.perLightState[lightId].saturation,
          brightness: update.brightness ?? this.perLightState[lightId].brightness,
        };
        this.perLightState[lightId] = newState;
        this.updateStatus(`✅ External update: "${lightName}" is ${newState.on ? "On" : "Off"}`);
        this.setDirtyCanvas(true);
        this.log("externalUpdate", `Applied external state for ${lightName}: on=${newState.on}, bri=${newState.brightness}`, true);
        return true;
      }

      if (!isTriggerCommand && !commandEnforceInput && now - this.lastCommandTimestamp < this.EXTERNAL_CHANGE_THRESHOLD && update.timestamp < this.lastCommandTimestamp) {
        this.log("updateLightStateSkip", `Skipping update for ${lightName}: commandEnforceInput=${commandEnforceInput}, timestampDiff=${now - this.lastCommandTimestamp}`, true);
        return false;
      }

      const currentState = this.perLightState[lightId];
      const isSwitch = lightId.includes('switch.');
      const payload = {
        on: update.on ?? currentState.on,
        transition: this.properties.transitionTime,
      };
      if (!isSwitch) {
        if (update.hue !== undefined && update.saturation !== undefined) {
          payload.hs_color = [update.hue, update.saturation];
        }
        if (update.brightness !== undefined) {
          if (lightId.startsWith("insteon_")) {
            payload.brightness = Math.round((update.brightness / 100) * 255);
          } else {
            payload.brightness = Math.max(1, Math.min(100, update.brightness));
          }
        }
      }

      this.log("updateLightState", `Attempt 1/${this.properties.maxRetries} for ${lightName}: payload=${JSON.stringify(payload)}`, true);

      let success = false;
      for (let attempt = 0; attempt < this.properties.maxRetries; attempt++) {
        try {
          this.log("updateLightState", `Attempt ${attempt + 1}/${this.properties.maxRetries} for ${lightName}: payload=${JSON.stringify(payload)}`, true);
          const response = await fetch(`${this.HA_API_URL}/api/lights/ha/${encodeURIComponent(lightId)}/state`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(15000), // Increased to 15 seconds
          });
          const data = await response.json();
          this.log("updateLightStateResponse", `Response for ${lightName}: status=${response.status}, success=${data.success}, error=${data.error || 'none'}`, true);
          if (!response.ok) throw new Error(`HTTP ${response.status}: ${data.error || response.statusText}`);
          if (data.success) {
            await new Promise(resolve => setTimeout(resolve, 1000)); // Reduced to 1 second
            await this.fetchLightStateAndColor(lightId);
            const verifiedState = this.perLightState[lightId];
            const matches = verifiedState.on === payload.on &&
                            (!isTriggerCommand || // Relax for trigger commands
                             (!payload.brightness || Math.abs(verifiedState.brightness - payload.brightness) < 10) &&
                             (!payload.hs_color || (Math.abs(verifiedState.hue - payload.hs_color[0]) < 5 && Math.abs(verifiedState.saturation - payload.hs_color[1]) < 5)));
            if (matches) {
              success = true;
              this.perLightState[lightId] = {
                ...this.perLightState[lightId],
                on: payload.on,
                hue: payload.hs_color ? payload.hs_color[0] : this.perLightState[lightId].hue,
                saturation: payload.hs_color ? payload.hs_color[1] : this.perLightState[lightId].saturation,
                brightness: payload.brightness ?? this.perLightState[lightId].brightness,
              };
              this.updateStatus(`✅ Updated Light "${lightName}" to ${payload.on ? "On" : "Off"}`);
              this.setDirtyCanvas(true);
              this.log("updateLightStateSuccess", `Successfully updated ${lightName}: on=${payload.on}, bri=${payload.brightness}`, true);
              break;
            }
            this.log("updateLightStateVerifyWarn", `Verification failed for ${lightName}: expected on=${payload.on}, got on=${verifiedState.on}, bri=${verifiedState.brightness}`, true);
          } else {
            throw new Error(data.error || "Failed to update state");
          }
        } catch (error) {
          this.log("updateLightStateError", `Attempt ${attempt + 1} failed for ${lightName}: ${error.message}`, true);
          await new Promise(resolve => setTimeout(resolve, 2000)); // Increased to 2 seconds
        }
      }

      if (!success && this.socket.connected) {
        this.log("updateLightStateFallback", `Attempting Socket.IO control for ${lightName}`, true);
        try {
          const socketPayload = {
            id: lightId,
            on: payload.on,
            brightness: payload.brightness,
            hs_color: payload.hs_color,
            transitiontime: payload.transition,
          };
          await new Promise((resolve, reject) => {
            this.socket.emit('device-control', socketPayload, (response) => {
              this.log("updateLightStateSocketResponse", `Socket.IO response for ${lightName}: ${JSON.stringify(response, null, 2)}`, true);
              if (response && response.success) {
                resolve();
              } else {
                reject(new Error(response?.error || "Socket.IO control failed"));
              }
            });
            setTimeout(() => reject(new Error("Socket.IO timeout")), 10000); // Increased to 10 seconds
          });
          await new Promise(resolve => setTimeout(resolve, 1000));
          await this.fetchLightStateAndColor(lightId);
          const verifiedState = this.perLightState[lightId];
          const matches = verifiedState.on === payload.on &&
                          (!isTriggerCommand ||
                           (!payload.brightness || Math.abs(verifiedState.brightness - payload.brightness) < 10) &&
                           (!payload.hs_color || (Math.abs(verifiedState.hue - payload.hs_color[0]) < 5 && Math.abs(verifiedState.saturation - payload.hs_color[1]) < 5)));
          if (matches) {
            success = true;
            this.updateStatus(`✅ Updated Light "${lightName}" to ${payload.on ? "On" : "Off"} via Socket.IO`);
            this.setDirtyCanvas(true);
            this.log("updateLightStateSuccess", `Successfully updated ${lightName} via Socket.IO: on=${payload.on}, bri=${payload.brightness}`, true);
          } else {
            this.log("updateLightStateVerifyWarn", `Socket.IO verification failed for ${lightName}: expected on=${payload.on}, got on=${verifiedState.on}, bri=${verifiedState.brightness}`, true);
          }
        } catch (error) {
          this.log("updateLightStateError", `Socket.IO fallback failed for ${lightName}: ${error.message}`, true);
          this.updateStatus(`⚠️ Failed to update Light "${lightName}" via Socket.IO: ${error.message}`);
        }
      }

      return success;
    };

    verifyLightStates = async (lights, update) => {
      const failedLights = [];
      for (const lightId of lights) {
        if (!lightId) continue;
        await this.fetchLightStateAndColor(lightId);
        const state = this.perLightState[lightId];
        const expectedOn = update.on;
        const expectedBrightness = update.brightness;
        const expectedHue = update.hue;
        const expectedSaturation = update.saturation;
        const matches = state.on === expectedOn &&
                       (!expectedBrightness || Math.abs(state.brightness - expectedBrightness) < 10) &&
                       (!expectedHue || Math.abs(state.hue - expectedHue) < 5) &&
                       (!expectedSaturation || Math.abs(state.saturation - expectedSaturation) < 5);
        if (!matches) {
          const lightName = this.properties.selectedLightNames[this.properties.selectedLightIds.indexOf(lightId)] || "Unknown";
          failedLights.push({ lightId, lightName });
          this.log("verifyLightStates", `State mismatch for ${lightName}: expected on=${expectedOn}, bri=${expectedBrightness}, got on=${state.on}, bri=${state.brightness}`, true);
        }
      }
      return failedLights;
    };

    handleDeviceStateUpdate = async (data) => {
      const lightId = data.id;
      if (!this.properties.selectedLightIds.includes(lightId)) return;
      await this.fetchLightStateAndColor(lightId);
      const fetchedState = this.perLightState[lightId];
      const update = {
        on: fetchedState.on,
        hue: fetchedState.hue,
        saturation: fetchedState.saturation,
        brightness: fetchedState.brightness,
      };
      this.commandQueue = this.commandQueue.filter((cmd) => {
        if (cmd.lights.includes(lightId)) {
          return cmd.update.timestamp > data.timestamp;
        }
        return true;
      });
      if (this.hsvDebounceTimer) {
        clearTimeout(this.hsvDebounceTimer);
        this.hsvDebounceTimer = null;
      }
      this.perLightState[lightId] = update;
      const lightName = this.properties.selectedLightNames[this.properties.selectedLightIds.indexOf(lightId)] || "Unknown";
      this.updateStatus(`✅ External update: "${lightName}" is ${update.on ? "On" : "Off"}`);
      this.setDirtyCanvas(true);
      this.log("handleDeviceStateUpdate", `Applied external state for ${lightName}: on=${update.on}, bri=${update.brightness}`, true);
      if (this.commandQueue.length && !this.isProcessingQueue) {
        await this.processQueue();
      }
    };

    handleTrigger = async (trigger) => {
      if (!this.properties.selectedLightIds.length) {
        this.updateStatus("⚠️ No lights selected. Cannot toggle state.");
        return;
      }
      if (!this.deviceManagerReady) {
        this.updateStatus("⚠️ Waiting for devices to initialize.");
        return;
      }
      const desiredState = Boolean(trigger);
      this.log("handleTrigger", `Trigger received: ${desiredState}`, true);
      const originalEnforceInput = this.properties.enforceInput;
      if (!originalEnforceInput) {
        this.properties.enforceInput = true;
        this.log("handleTrigger", "Temporarily enabled enforceInput for trigger command", true);
      }
      try {
        let hsvInput = this.getInputData(0) || this.lastHsvInput;
        let hue = 0;
        let saturation = 0;
        let brightness = null;

        if (desiredState && hsvInput && typeof hsvInput.hue === "number" && typeof hsvInput.saturation === "number" && typeof hsvInput.brightness === "number") {
          hue = hsvInput.hue <= 1 ? hsvInput.hue * 360 : hsvInput.hue;
          hue = Math.round(Math.max(0, Math.min(360, hue)));
          saturation = hsvInput.saturation <= 1 ? hsvInput.saturation * 100 : hsvInput.saturation;
          saturation = Math.round(Math.max(0, Math.min(100, saturation)));
          brightness = hsvInput.brightness <= 1 ? hsvInput.brightness * 100 : 
                       (hsvInput.brightness <= 255 ? (hsvInput.brightness / 255) * 100 : hsvInput.brightness);
          brightness = Math.round(Math.max(0, Math.min(100, brightness)));
          this.log("handleTrigger", `Using HSV input: hue=${hue}, sat=${saturation}, bri=${brightness}`, true);
        } else if (desiredState) {
          const lightId = this.properties.selectedLightIds[0];
          if (lightId && this.perLightState[lightId]?.brightness) {
            brightness = this.perLightState[lightId].brightness;
            this.log("handleTrigger", `Using last known brightness: ${brightness}`, true);
          } else {
            brightness = 100;
            this.log("handleTrigger", `Using default brightness: ${brightness}`, true);
          }
        }

        const command = {
          lights: this.properties.selectedLightIds.filter((id) => id),
          update: (lightId) => {
            const isSwitch = lightId.includes('switch.');
            return {
              on: desiredState,
              ...(desiredState && !isSwitch && brightness !== null ? { hue, saturation, brightness, transition: this.properties.transitionTime } : {}),
              enforceInput: this.properties.enforceInput,
              timestamp: Date.now(),
              isTriggerCommand: true
            };
          },
          timestamp: Date.now()
        };
        this.commandQueue.push(command);
        this.log("handleTrigger", `Queued trigger command: on=${desiredState}, lights=${command.lights.length}${brightness !== null ? `, hue=${hue}, sat=${saturation}, bri=${brightness}` : ''}`, true);
        await this.processQueue();
      } finally {
        if (!originalEnforceInput) {
          this.properties.enforceInput = false;
          this.log("handleTrigger", "Restored enforceInput to false after trigger command", true);
        }
      }
    };

    handleHSVInput = async (hsv) => {
      if (!this.properties.selectedLightIds.length) {
        this.updateStatus("⚠️ No lights selected. Cannot update HSV.");
        return;
      }
      if (!hsv || typeof hsv.hue !== "number" || typeof hsv.saturation !== "number" || typeof hsv.brightness !== "number") {
        this.updateStatus("⚠️ Invalid HSV input.");
        return;
      }
      this.log("handleHSVInput", `Raw HSV input: hue=${hsv.hue}, sat=${hsv.saturation}, bri=${hsv.brightness}`, true);
      let { hue, saturation, brightness } = hsv;
      hue = hue <= 1 ? hue * 360 : hue;
      hue = Math.round(Math.max(0, Math.min(360, hue)));
      saturation = saturation <= 1 ? saturation * 100 : saturation;
      saturation = Math.round(Math.max(0, Math.min(100, saturation)));
      brightness = brightness <= 1 ? brightness * 100 : Math.round((brightness / 254) * 100);
      brightness = Math.round(Math.max(0, Math.min(100, brightness)));
      this.log("handleHSVInput", `Normalized HSV input: hue=${hue}, sat=${saturation}, bri=${brightness}`, true);
      const originalEnforceInput = this.properties.enforceInput;
      if (!originalEnforceInput) {
        this.properties.enforceInput = true;
        this.log("handleHSV", "Temporarily enabled enforceInput for HSV command", true);
      }
      try {
        let needsUpdate = false;
        for (const lightId of this.properties.selectedLightIds) {
          if (!lightId) continue;
          await this.fetchLightStateAndColor(lightId);
          const state = this.perLightState[lightId];
          if (
            Math.abs(state.hue - hue) > 0.1 ||
            Math.abs(state.saturation - saturation) > 0.1 ||
            Math.abs(state.brightness - brightness) > 0.1
          ) {
            needsUpdate = true;
            this.log("handleHSVInput", `Needs update for ${lightId}: state=[${state.hue},${state.saturation},${state.brightness}], input=[${hue},${saturation},${brightness}]`, true);
            break;
          }
        }
        if (!needsUpdate) {
          this.log("handleHSVInput", "No update needed: HSV state matches current state", true);
          return;
        }
        const commands = [];
        for (const lightId of this.properties.selectedLightIds) {
          if (!lightId) continue;
          const state = this.perLightState[lightId];
          commands.push({
            lights: [lightId],
            update: {
              on: state.on, // Respect the current on/off state
              hue,
              saturation,
              brightness,
              enforceInput: this.properties.enforceInput,
              timestamp: Date.now(),
            },
            timestamp: Date.now(),
          });
        }
        commands.forEach((command) => {
          this.commandQueue.push(command);
          this.log("handleHSV", `Queued HSV command for light ${command.lights[0]}: on=${command.update.on}, hue=${hue}, sat=${saturation}, bri=${brightness}`, true);
        });
        if (this.hsvDebounceTimer) {
          clearTimeout(this.hsvDebounceTimer);
          this.hsvDebounceTimer = null;
        }
        this.hsvDebounceTimer = setTimeout(async () => {
          await this.processQueue();
          this.hsvDebounceTimer = null;
        }, this.HSV_DEBOUNCE_DELAY);
      } finally {
        if (!originalEnforceInput) {
          this.properties.enforceInput = false;
          this.log("handleHSV", "Restored enforceInput to false after HSV command", true);
        }
      }
    };

    processQueue = async () => {
      if (this.isProcessingQueue || !this.commandQueue.length) return true;
      this.isProcessingQueue = true;
      const command = this.commandQueue.shift();
      const { lights, update, timestamp } = command;
      const commandId = `${timestamp}-${lights.join('-')}`;
      this.commandRetryCounts.set(commandId, (this.commandRetryCounts.get(commandId) || 0) + 1);
      this.log("processQueue", `Processing command ${commandId}: lights=${lights.length}, update=${JSON.stringify(typeof update === 'function' ? update(lights[0]) : update)}`, true);

      // Pre-fetch states
      await Promise.all(lights.map(lightId => this.fetchLightStateAndColor(lightId)));

      const updatePromises = lights.map(async (lightId, i) => {
        if (!lightId) {
          this.log("processQueueWarn", `Skipping invalid light ID at index ${i}`, true);
          return false;
        }
        const lightName = this.properties.selectedLightNames[this.properties.selectedLightIds.indexOf(lightId)] || "Unknown";
        this.log("processQueue", `Processing light ${i + 1}/${lights.length}: ${lightName} (ID: ${lightId})`, true);
        const updatePayload = typeof update === 'function' ? update(lightId) : update;
        const success = await this.updateLightState(lightId, { ...updatePayload, timestamp }, "application");
        if (success) {
          this.log("processQueue", `Successfully updated light ${lightName}`, true);
          return true;
        } else {
          this.log("processQueue", `Failed to update light ${lightName}`, true);
          return false;
        }
      });

      const results = await Promise.all(updatePromises);
      const successCount = results.filter(success => success).length;

      const failedLights = await this.verifyLightStates(lights, typeof update === 'function' ? update(lights[0]) : update);
      if (failedLights.length > 0) {
        failedLights.forEach(({ lightId, lightName }) => {
          const state = this.perLightState[lightId];
          this.log("processQueueWarn", `Failed light ${lightName} (ID: ${lightId}): expected on=${typeof update === 'function' ? update(lightId).on : update.on}, got on=${state.on}, bri=${state.brightness}`, true);
        });
        if (this.commandRetryCounts.get(commandId) <= this.properties.maxCommandRetries) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          this.commandQueue.push({
            lights: failedLights.map(l => l.lightId),
            update,
            timestamp,
          });
          this.log("processQueue", `Re-queued command ${commandId} for ${failedLights.length} failed lights (retry ${this.commandRetryCounts.get(commandId)}/${this.properties.maxCommandRetries})`, true);
        } else {
          this.updateStatus(`⚠️ Failed to update ${failedLights.length} lights after ${this.properties.maxCommandRetries} retries: ${failedLights.map(l => l.lightName).join(', ')}`);
          this.commandRetryCounts.delete(commandId);
        }
      } else {
        this.commandRetryCounts.delete(commandId);
      }

      this.log("processQueue", `Completed command ${commandId}: ${successCount}/${lights.length} lights updated`, true);
      this.lastCommandTimestamp = Date.now();
      this.isProcessingQueue = false;
      if (this.commandQueue.length) await this.processQueue();
      return failedLights.length === 0;
    };

    updateNodeSize = () => {
      this.size[0] = 400;
      const baseHeight = 40;
      let widgetsHeight = this.widgets
        .filter((w) => !w.name.startsWith("Select Light"))
        .reduce((sum, w) => sum + (w.computeSize?.(this.size[0])[1] ?? LiteGraph.NODE_WIDGET_HEIGHT), 0);
      widgetsHeight += 15;
      const totalLightHeight = this.properties.selectedLightIds.length * 50;
      this.size[1] = baseHeight + widgetsHeight + totalLightHeight + 45;
      this.setSize([this.size[0], this.size[1]]);
      this.widgets.forEach((w) => {
        w.options.width =
          w.name === "Status" ? this.size[0] - 400 :
          w.name === "Filter Devices" ? 100 :
          w.name === "Transition (ms)" ? 100 :
          w.name === "Command Retries" ? 100 :
          w.name === "Enforce Input" ? 100 :
          w.name === "Debug Logs" ? 100 : 40;
      });
      this.setDirtyCanvas(true);
    };

    updateStatus = (message = null) => {
      const lightId = this.properties.selectedLightIds[0];
      const lightName = this.properties.selectedLightNames[0] || "Unknown";
      const lightState = this.perLightState[lightId]?.on ? "On" : "Off";
      const status = message ?? `✅ Light "${lightName}" is ${lightState}, Enforce Input: ${this.properties.enforceInput}`;
      if (status !== this.properties.status) {
        this.properties.status = status;
        if (this.statusWidget) this.statusWidget.value = status;
        this.setDirtyCanvas(true);
        this.log("updateStatus", `Updated status: ${status}`, true);
      }
    };

    toggleCollapse = () => {
      this.properties.isCollapsed = !this.properties.isCollapsed;
      this.collapseButton.name = this.properties.isCollapsed ? "▶" : "▼";
      this.updateNodeSize();
      this.setDirtyCanvas(true);
      this.log("toggleCollapse", `Node ${this.properties.isCollapsed ? "collapsed" : "expanded"}`, true);
    };

    onMouseDown = (event) => {
      if (!this.graph?.canvas) return;
      const mousePos = this.graph.canvas.getMousePos(event);
      const x = mousePos.x - this.pos[0];
      const y = mousePos.y - this.pos[1];
      let widgetsHeight = this.widgets
        .filter((w) => !w.name.startsWith("Select Light"))
        .reduce((sum, w) => sum + (w.computeSize?.(this.size[0])[1] ?? LiteGraph.NODE_WIDGET_HEIGHT), 0);
      widgetsHeight += 15;
      const selectorHeight = this.lightSelectors.length * 25;
      const overlayStartY = widgetsHeight + selectorHeight + 75;
      if (!this.properties.isCollapsed) {
        this.properties.selectedLightIds.forEach((lightId, index) => {
          if (!lightId || !this.perLightState[lightId]) return;
          const lightName = this.properties.selectedLightNames[index];
          const lightState = this.perLightState[lightId];
          const yPosition = overlayStartY + index * 25;
          const onOffX = this.size[0] - 100;
          const onOffY = yPosition - 5;
          const distance = Math.sqrt((x - onOffX) ** 2 + (y - onOffY) ** 2);
          this.log("onMouseDown", `Click detected at x=${x}, y=${y}, distance=${distance} from onOffX=${onOffX}, onOffY=${onOffY}`, true);
          if (distance <= 10) {
            this.log("onMouseDown", `Toggling light ${lightName} to ${!lightState.on}`, true);
            this.updateLightState(lightId, { on: !lightState.on }, "application");
          }
        });
      }
    };

    onExecute = async () => {
      if (!this.isConfigured) {
        this.updateStatus("⚠️ Node is still configuring...");
        return;
      }
      if (!this.deviceManagerReady) {
        this.updateStatus("⚠️ Waiting for devices to initialize...");
        return;
      }
      try {
        const now = Date.now();
        let stateChanged = false;
        if (!this.lastStateRefresh || now - this.lastStateRefresh > 10000) {
          for (const lightId of this.properties.selectedLightIds) {
            if (lightId && (await this.fetchLightStateAndColor(lightId))) stateChanged = true;
          }
          this.lastStateRefresh = now;
        }
        const hsvInput = this.getInputData(0);
        const triggerInput = this.getInputData(1);
        if (!this.enforceInitialTrigger && triggerInput !== undefined && triggerInput !== this.lastTriggerInput) {
          this.lastTriggerInput = triggerInput;
          await this.handleTrigger(triggerInput);
          stateChanged = true;
        }
        if (
          hsvInput &&
          (!this.lastHsvInput ||
            hsvInput.hue !== this.lastHsvInput.hue ||
            hsvInput.saturation !== this.lastHsvInput.saturation ||
            hsvInput.brightness !== this.lastHsvInput.brightness)
        ) {
          this.lastHsvInput = hsvInput;
          await this.handleHSVInput(hsvInput);
          stateChanged = true;
        }
        if (stateChanged) this.updateStatus();
        const lightData = {
          lights: this.properties.selectedLightIds
            .filter((id) => id)
            .map((id) => ({
              light_id: id,
              name: this.properties.selectedLightNames[this.properties.selectedLightIds.indexOf(id)],
              status: this.perLightState[id]?.on ? "On" : "Off",
              hue: this.perLightState[id]?.hue || 0,
              saturation: this.perLightState[id]?.saturation || 0,
              brightness: this.perLightState[id]?.brightness || 0,
            })),
          status: this.properties.status,
        };
        this.setOutputData(0, lightData);
        if (stateChanged) this.setDirtyCanvas(true);
      } catch (error) {
        this.log("onExecuteError", `Error during execution: ${error.message}`, true);
        this.updateStatus(`⚠️ Execution failed: ${error.message}`);
      }
    };

    serialize = () => {
      const deepCopy = (obj) => JSON.parse(JSON.stringify(obj));
      return {
        ...super.serialize(),
        version: "1.2",
        properties: deepCopy(this.properties),
        perLightState: deepCopy(this.perLightState),
        commandQueue: deepCopy(this.commandQueue),
        lastCommandTimestamp: this.lastCommandTimestamp,
        lastStateRefresh: this.lastStateRefresh,
        lastLogged: deepCopy(this.lastLogged),
        lastTriggerInput: this.lastTriggerInput,
        enforceInitialTrigger: this.enforceInitialTrigger,
        commandRetryCounts: Object.fromEntries(this.commandRetryCounts),
      };
    };

    configure = async (data) => {
      super.configure(data);
      const version = data.version || "1.0";
      this.properties = {
        selectedLightIds: Array.isArray(data.properties?.selectedLightIds) ? data.properties.selectedLightIds : [],
        selectedLightNames: Array.isArray(data.properties?.selectedLightNames) ? data.properties.selectedLightNames : [],
        status: typeof data.properties?.status === "string" ? data.properties.status : "No action yet",
        isCollapsed: typeof data.properties?.isCollapsed === "boolean" ? data.properties.isCollapsed : false,
        maxRetries: typeof data.properties?.maxRetries === "number" ? data.properties.maxRetries : 3,
        maxCommandRetries: typeof data.properties?.maxCommandRetries === "number" ? data.properties.maxCommandRetries : 2,
        transitionTime: typeof data.properties?.transitionTime === "number" ? data.properties.transitionTime : 0,
        enforceInput: typeof data.properties?.enforceInput === "boolean" ? data.properties.enforceInput : false,
        debug: typeof data.properties?.debug === "boolean" ? data.properties.debug : true,
        filterType: typeof data.properties?.filterType === "string" ? data.properties.filterType : "All",
      };
      this.perLightState = typeof data.perLightState === "object" && data.perLightState !== null ? data.perLightState : {};
      this.commandQueue = [];
      this.commandRetryCounts = new Map(Object.entries(data.commandRetryCounts || {}));
      this.lastCommandTimestamp = typeof data.lastCommandTimestamp === "number" ? data.lastCommandTimestamp : 0;
      this.lastStateRefresh = typeof data.lastStateRefresh === "number" ? data.lastStateRefresh : 0;
      this.lastLogged = typeof data.lastLogged === "object" && data.lastLogged !== null ? data.lastLogged : {};
      this.lastTriggerInput = data.lastTriggerInput ?? null;
      this.enforceInitialTrigger = true;
      const uniqueLightIds = [...new Set(this.properties.selectedLightIds.filter((id) => id))];
      const uniqueLightNames = uniqueLightIds.map((id) => this.properties.selectedLightNames[this.properties.selectedLightIds.indexOf(id)] ?? "Unknown");
      this.properties.selectedLightIds = uniqueLightIds;
      this.properties.selectedLightNames = uniqueLightNames;
      this.widgets = [];
      this.lightSelectors = [];
      if (this.socket) {
        this.socket.disconnect();
        this.socket = null;
      }
      this.setupWidgets();
      this.initializeSocketIO();
      try {
        let retries = 5;
        while (!this.deviceManagerReady && retries > 0) {
          await this.fetchDevices();
          if (!this.deviceManagerReady) {
            this.log("configure", `Failed to fetch devices, retrying (${retries} attempts left)`, true);
            await new Promise(resolve => setTimeout(resolve, 2000));
            retries--;
          }
        }
        if (!this.deviceManagerReady) {
          throw new Error("Failed to fetch devices after multiple attempts");
        }

        for (const lightId of this.properties.selectedLightIds) {
          if (lightId) {
            await this.fetchLightStateAndColor(lightId);
            this.log("configure", `Initial state for ${lightId}: ${JSON.stringify(this.perLightState[lightId])}`, true);
          }
        }

        const triggerInput = this.getInputData(1);
        if (triggerInput !== undefined) {
          this.log("configure", `Enforcing initial trigger state: ${triggerInput}`, true);
          await this.handleTrigger(triggerInput);
          this.lastTriggerInput = triggerInput;
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        this.enforceInitialTrigger = false;
        this.restoreLightSelectors();
        this.updateNodeSize();
        this.setDirtyCanvas(true);
        this.updateStatus();
        this.isConfigured = true;
      } catch (error) {
        this.log("configureError", `Error during configuration: ${error.message}`, true);
        this.updateStatus(`⚠️ Configuration failed: ${error.message}`);
        this.isConfigured = false;
      }
    };

    onRemoved = () => {
      if (this.hsvDebounceTimer) clearTimeout(this.hsvDebounceTimer);
      if (this.socket) this.socket.disconnect();
    };

    hsvToRgb = (h, s, v) => {
      h = h % 1;
      const i = Math.floor(h * 6);
      const f = h * 6 - i;
      const p = v * (1 - s);
      const q = v * (1 - f * s);
      const t = v * (1 - (1 - f) * s);
      let r, g, b;
      switch (i % 6) {
        case 0: r = v; g = t; b = p; break;
        case 1: r = q; g = v; b = p; break;
        case 2: r = p; g = v; b = t; break;
        case 3: r = p; g = q; b = v; break;
        case 4: r = t; g = p; b = v; break;
        case 5: r = v; g = p; b = q; break;
      }
      return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    };

    rgbToHex = (r, g, b) => "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();

    onDrawForeground = (ctx) => {
      if (super.onDrawForeground) super.onDrawForeground(ctx);
      let widgetsHeight = this.widgets
        .filter((w) => !w.name.startsWith("Select Light"))
        .reduce((sum, w) => sum + (w.computeSize?.(this.size[0])[1] ?? LiteGraph.NODE_WIDGET_HEIGHT), 0);
      widgetsHeight += 15;
      const selectorHeight = this.lightSelectors.length * 25;
      const overlayStartY = widgetsHeight + selectorHeight + 90;
      if (!this.properties.isCollapsed) {
        this.properties.selectedLightIds.forEach((lightId, index) => {
          if (!lightId || !this.perLightState[lightId]) return;
          const lightName = this.properties.selectedLightNames[index];
          const lightState = this.perLightState[lightId];
          const yPosition = overlayStartY + index * 25;
          ctx.fillStyle = "#E0E0E0";
          ctx.font = "14px Roboto, Arial, sans-serif";
          ctx.textAlign = "left";
          ctx.fillText(lightName, 10, yPosition);
          const onOffX = this.size[0] - 100;
          ctx.fillStyle = lightState.on ? "#00FF00" : "#FF0000";
          ctx.beginPath();
          ctx.arc(onOffX, yPosition - 5, 10, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#FFFFFF";
          ctx.lineWidth = 1;
          ctx.stroke();
          const meterX = this.size[0] - 80;
          const meterWidth = 60;
          const meterHeight = 20;
          const brightness = lightState.on ? (lightState.brightness || 100) : 0;
          const brightnessPercent = Math.min(1, Math.max(0, brightness / 100));
          const rgb = this.hsvToRgb(lightState.hue / 360, lightState.saturation / 100, brightnessPercent);
          ctx.fillStyle = this.rgbToHex(...rgb);
          ctx.fillRect(meterX, yPosition - 15, meterWidth * brightnessPercent, meterHeight);
          ctx.strokeStyle = "#FFFFFF";
          ctx.strokeRect(meterX, yPosition - 15, meterWidth, meterHeight);
          ctx.fillStyle = "#FFFFFF";
          ctx.font = "10px Roboto, Arial, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(`${Math.round(brightnessPercent * 100)}%`, meterX + meterWidth / 2, yPosition - 2);
        });
      }
    };
  }
  LiteGraph.registerNodeType("Lighting/HALightControlNode", HALightControlNode);
}