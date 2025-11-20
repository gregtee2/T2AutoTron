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
          debug: true, // Enabled for testing
          deepDebug: true, // Enabled for testing
          haToken: "",
          transitionTime: 1000,
          maxRetries: 3,
          filterType: "All",
          stateVerificationDelay: 1000
        },
        CUSTOM_API_URL: "http://localhost:3000",
        HA_API_URL: "http://localhost:8123",
        deviceSelectors: [],
        devices: [],
        deviceManagerReady: false,
        perDeviceState: {},
        socket: null,
        HSV_DEBOUNCE_DELAY: 500,
        HSV_CHANGE_THRESHOLD: 1,
        hsvDebounceTimer: null,
        lastTriggerInput: null,
        lastHsvInput: null,
        lastStateInput: null,
        commandQueue: [],
        isProcessingQueue: false,
        lastCommandTimestamp: 0,
        EXTERNAL_CHANGE_THRESHOLD: 5000,
        commandRetryCounts: new Map(),
        stateCache: new Map(),
        STATE_CACHE_TTL: 5000,
        lastExecuteTimestamp: 0,
        loggedDebounce: false,
        lastTriggerTimestamp: 0,
        lastTriggerValue: null,
        triggerQueue: [],
        isProcessingTriggers: false,
        dirtyCanvasTimer: null,
        socketUpdateTimers: new Map(),
        globalSocketUpdateTimer: null
      });

      // Sanitize selectedDeviceIds and selectedDeviceNames
      this.properties.selectedDeviceIds = this.properties.selectedDeviceIds.filter(id => id);
      this.properties.selectedDeviceNames = this.properties.selectedDeviceNames.filter(name => name);

      this.addInput("HSV Info", "hsv_info");
      this.addInput("State", "object");
      this.addInput("Trigger", "boolean");
      this.addOutput("All Devices", "light_info");

      this.setupWidgets();
      this.initializeSocketIO();
    }

    
    log = (key, message, force = false, level = "INFO") => {
      if (key === "DeviceCheck" && !this.properties.deepDebug) return;
      if (!this.properties.debug && !force && level === "INFO") return;
      const now = Date.now();
      this.lastLogged = this.lastLogged || {};
      // Unique key for updateDeviceState based on device, trigger value, and cycle
      const logKey =
        key === "updateDeviceState"
          ? `${key}_${message.replace(/Successfully updated /, '')}_${this.lastTriggerValue}_${Math.floor(now / 1000)}`
          : key === "Trigger"
          ? `${key}_${message.split(" ")[2]}_${Math.floor(now / 1000)}`
          : key;
      const lastLog = this.lastLogged[logKey] || { time: 0, message: "" };
      if (force || now - lastLog.time > 1000 || lastLog.message !== message) {
        this.lastLogged[logKey] = { time: now, message };
      }
    };

    setupWidgets = () => {
      try {
        const widgetWidth = this.size[0] - 20;
        const widgets = [
          {
            type: "button",
            name: "🔄 Trigger",
            value: "Trigger Execution",
            callback: () => {
              this.onExecute();
              this.setDirtyCanvasDebounced();
              this.log("triggerDebug", "Manual trigger executed", false, 'INFO');
            },
            options: { width: 100 }
          },
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
                "Weather"
              ],
              width: 100
            }
          },
          {
            type: "button",
            name: "➕",
            value: "Add Device",
            callback: () => this.onAddDevice(),
            options: { width: 40 }
          },
          {
            type: "button",
            name: "➖",
            value: "Remove Device",
            callback: () => this.onRemoveDevice(),
            options: { width: 40 }
          },
          {
            type: "button",
            name: "🔄",
            value: "Refresh Devices",
            callback: () => this.onRefreshDevices(),
            options: { width: 40 }
          },
          {
            type: "number",
            name: "Transition (ms)",
            value: this.properties.transitionTime,
            callback: (v) => (this.properties.transitionTime = Math.max(0, v)),
            options: { min: 0, max: 5000, step: 100, width: 100 }
          },
          {
            type: "toggle",
            name: "Debug Logs",
            value: this.properties.debug,
            callback: (v) => {
              this.properties.debug = v;
              this.log("debugToggle", `Debug logging ${v ? "enabled" : "disabled"}`, true, 'INFO');
            },
            options: { width: 100 }
          },
          {
            type: "toggle",
            name: "Deep Debug",
            value: this.properties.deepDebug,
            callback: (v) => {
              this.properties.deepDebug = v;
              this.log("deepDebugToggle", `Deep debug logging ${v ? "enabled" : "disabled"}`, true, 'INFO');
            },
            options: { width: 100 }
          },
          {
            type: "text",
            name: "HA Token",
            value: this.properties.haToken,
            callback: (v) => {
              this.properties.haToken = v;
              this.log("haTokenUpdate", `Updated HA token`, false, 'INFO');
            },
            options: { width: 200 }
          },
          {
            type: "text",
            name: "Status",
            value: this.properties.status,
            options: { property: "status", readonly: true, width: widgetWidth - 300 }
          }
        ];

        this.widgets = widgets.map(({ type, name, value, callback, options }) =>
          this.addWidget(type, name, value, callback, options)
        );
        this.statusWidget = this.widgets.find((w) => w.name === "Status");
      } catch (error) {
        this.log("setupWidgetsError", `Error setting up widgets: ${error.message}`, true, 'ERROR');
        this.updateStatus(`⚠️ Error setting up widgets: ${error.message}`);
      }
    };

    setDirtyCanvasDebounced = () => {
      if (!this.dirtyCanvasTimer) {
        this.dirtyCanvasTimer = setTimeout(() => {
          this.setDirtyCanvas(true);
          this.dirtyCanvasTimer = null;
        }, 100);
      }
    };

    onFilterChanged = (value) => {
      this.properties.filterType = value;
      this.log("Filter", `Filter changed to ${value}`, false);
      this.updateDeviceSelectorOptions();
      this.updateStatus(`✅ Filter set to ${value}, ${this.properties.selectedDeviceIds.filter(id => id).length} devices retained`);
      this.setDirtyCanvasDebounced();
    };

    initializeSocketIO = () => {
      this.socket = io(this.CUSTOM_API_URL, {
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 10000
      });

      this.socket.on("connect", () => {
        this.log("socketConnect", `Socket.IO connected, ID: ${this.socket.id}`, true);
        this.updateStatus("✅ Connected to server.");
        this.fetchDevices();
      });

      this.socket.on("connect_error", (err) => {
        this.log("socketConnectError", `Socket.IO connection error: ${err.message}`, true);
        this.updateStatus(`⚠️ Connection error: ${err.message}`);
      });

      this.socket.on("disconnect", () => {
        this.log("socketDisconnect", "Socket.IO disconnected", false);
        this.updateStatus("⚠️ Disconnected from server.");
      });

      this.socket.on("device-state-update", (data) => this.handleDeviceStateUpdate(data));
    };

    static filterTypeMap = {
      "All": "all",
      "Light": "light",
      "Switch": "switch",
      "Sensor": "sensor",
      "Binary Sensor": "binary_sensor",
      "Media Player": "media_player",
      "Weather": "weather",
      "Fan": "fan",
      "Cover": "cover"
    };

    fetchDevices = async () => {
      try {
        this.log("fetchDevices", "Attempting to fetch devices", false);
        const response = await fetch(`${this.CUSTOM_API_URL}/api/lights/ha/`, {
          headers: { 'Authorization': `Bearer ${this.properties.haToken}` }
        });
        const data = await response.json();
        if (data.success && data.devices) {
          this.devices = data.devices
            .filter(d => ['light', 'switch', 'binary_sensor', 'sensor', 'media_player', 'weather', 'fan', 'cover'].includes(d.type))
            .map(d => {
              const entityType = d.type;
              let state, attributes;
              switch (entityType) {
                case 'binary_sensor':
                  state = d.state.on ? 'on' : 'off';
                  attributes = { battery: 'unknown' };
                  break;
                case 'sensor':
                  state = d.state.value || 'unknown';
                  attributes = { unit: d.state.unit || '' };
                  break;
                case 'light':
                case 'switch':
                  state = d.state.on ? 'on' : 'off';
                  attributes = {
                    brightness: d.state.brightness || (d.state.on ? 100 : 0),
                    hs_color: d.state.hs_color || [0, 0],
                    power: d.state.power || null,
                    energy: d.state.energy || null
                  };
                  break;
                case 'media_player':
                  state = d.state.state || 'off';
                  attributes = {
                    volume_level: d.state.volume_level || 0,
                    source: d.state.source || null,
                    media_title: d.state.media_title || null
                  };
                  break;
                case 'weather':
                  state = d.state.condition || 'unknown';
                  attributes = {
                    temperature: d.state.temperature || null,
                    humidity: d.state.humidity || null,
                    wind_speed: d.state.wind_speed || null,
                    pressure: d.state.pressure || null,
                    precipitation: d.state.precipitation || null
                  };
                  break;
                case 'fan':
                  state = d.state.on ? 'on' : 'off';
                  attributes = { percentage: d.state.percentage || 0 };
                  break;
                case 'cover':
                  state = d.state.on ? 'open' : 'closed';
                  attributes = { position: d.state.position || 0 };
                  break;
                default:
                  state = 'unknown';
                  attributes = {};
              }
              const device = {
                entity_id: d.id.replace('ha_', ''),
                name: d.name.trim(),
                type: entityType,
                entityType: entityType,
                state,
                attributes,
                source: 'ha',
                power_sensor: d.state.power ? `${entityType}.${d.id.replace('ha_', '')}_power` : null,
                energy_sensor: d.state.energy ? `${entityType}.${d.id.replace('ha_', '')}_energy` : null
              };
              this.log("fetchDevicesDevice", `Processed device: ${device.name} (${entityType})`, false);
              return device;
            })
            .sort((a, b) => a.name.localeCompare(b.name));
          this.deviceManagerReady = true;
          this.updateStatus("✅ Devices fetched successfully.");
          this.log("fetchDevices", `Fetched ${this.devices.length} devices`, false);
          this.restoreDeviceSelectors();
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

    initializeStateReconciliation = async () => {
      if (this.initialized || !this.deviceManagerReady) return;
      this.initialized = true;

      this.log("Initialization", "Starting state reconciliation", true, "INFO");

      // Check if a recent pulse was processed
      const now = Date.now();
      if (
        this.lastTriggerTimestamp &&
        now - this.lastTriggerTimestamp < 2000 &&
        typeof this.lastTriggerValue === "boolean"
      ) {
        this.log("Initialization", `Skipping reconciliation: recent pulse (${this.lastTriggerValue}) processed at ${this.lastTriggerTimestamp}`, true, "INFO");
        // Verify device states match the recent pulse
        await Promise.all(
          this.properties.selectedDeviceIds.map(async (deviceId) => {
            if (deviceId) await this.fetchDeviceState(deviceId);
          })
        );
        const mismatchedDevices = this.properties.selectedDeviceIds.filter((id) => {
          if (!id) return false;
          const device = this.devices.find((d) => d.entity_id === id);
          if (!device) return false;
          const entityType = id.split(".")[0];
          if (!["light", "switch", "fan", "cover", "media_player"].includes(entityType)) return false;
          const currentState = this.perDeviceState[id];
          if (!currentState) return false;
          const isOn = entityType === "media_player" ? currentState.state !== "off" : currentState.state === "on";
          return isOn !== this.lastTriggerValue;
        });
        if (mismatchedDevices.length === 0) {
          this.updateStatus(`✅ All devices match recent pulse state (${this.lastTriggerValue ? "On" : "Off"})`);
          return;
        }
        // If mismatches exist, proceed with reconciliation using lastTriggerValue
        this.log("Initialization", `Mismatches found after recent pulse, proceeding with reconciliation`, true, "WARN");
      }

      // Fetch all device states
      let fetchSuccess = true;
      for (const deviceId of this.properties.selectedDeviceIds) {
        if (deviceId) {
          const success = await this.fetchDeviceState(deviceId);
          if (!success) fetchSuccess = false;
        }
      }

      if (!fetchSuccess) {
        this.updateStatus("⚠️ Failed to fetch some device states during initialization");
        this.log("Initialization", "Failed to fetch some device states", true, "WARN");
        return;
      }

      // Determine expected state
      let expectedState = null;
      const triggerInput = this.inputs.find((input) => input.name === "Trigger");
      if (triggerInput && triggerInput.link) {
        const graph = this.graph;
        const link = graph.links[triggerInput.link];
        if (link) {
          const originNode = graph.getNodeById(link.origin_id);
          if (originNode) {
            const triggerOutput = originNode.getOutputData(link.origin_slot);
            if (typeof triggerOutput === "boolean") {
              expectedState = triggerOutput;
              this.log("Initialization", `Expected state from trigger node: ${expectedState}`, true, "INFO");
            } else {
              this.log("Initialization", `Trigger node is idle (output: ${triggerOutput}), using fallback state`, true, "INFO");
            }
          }
        }
      }

      // Fallback to persisted state or default
      if (expectedState === null) {
        if (this.properties.lastTriggerState !== null) {
          expectedState = this.properties.lastTriggerState;
          this.log("Initialization", `Using last trigger state: ${expectedState}`, true, "INFO");
        } else {
          expectedState = this.properties.defaultIdleState;
          this.log("Initialization", `No prior trigger state, using default idle state: ${expectedState}`, true, "INFO");
        }
      }

      // Check for state mismatches
      const mismatchedDevices = [];
      for (const deviceId of this.properties.selectedDeviceIds) {
        if (!deviceId) continue;
        const device = this.devices.find((d) => d.entity_id === id);
        if (!device) continue;
        const entityType = deviceId.split(".")[0];
        if (!["light", "switch", "fan", "cover", "media_player"].includes(entityType)) continue;

        const currentState = this.perDeviceState[deviceId];
        if (!currentState) continue;

        const isOn = entityType === "media_player" ? currentState.state !== "off" : currentState.state === "on";
        if (isOn !== expectedState) {
          mismatchedDevices.push(deviceId);
        }
      }

      if (mismatchedDevices.length === 0) {
        this.updateStatus("✅ All device states match expected state");
        this.log("Initialization", "No state mismatches found", true, "INFO");
        return;
      }

      this.log("Initialization", `Found ${mismatchedDevices.length} mismatched devices`, true, "INFO");

      // Queue commands to correct mismatched devices
      const payload = { on: expectedState, transition: this.properties.transitionTime };
      const command = {
        devices: mismatchedDevices,
        update: payload,
        timestamp: Date.now(),
      };
      this.commandQueue.push(command);
      this.log("Initialization", `Queued state correction for ${mismatchedDevices.length} devices`, true, "INFO");

      // Process the queue
      const success = await this.processQueue();
      if (success) {
        this.updateStatus(`✅ Corrected ${mismatchedDevices.length} device states to ${expectedState ? "On" : "Off"}`);
        this.log("Initialization", `Successfully corrected ${mismatchedDevices.length} device states`, true, "INFO");
      } else {
        this.updateStatus(`⚠️ Failed to correct some device states`);
        this.log("Initialization", "Failed to correct some device states", true, "ERROR");
      }

      this.setDirtyCanvasDebounced();
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

      const slotIndex = this.deviceSelectors.length;
      this.addOutput(`Device ${slotIndex}`, "light_info");
      this.log("AddDevice", `Added output slot ${slotIndex}`, false, "INFO");
      this.updateNodeSize();
      this.setDirtyCanvasDebounced();
      this.updateStatus(`✅ Added device selector ${this.deviceSelectors.length}.`);
      this.log("AddDevice", `Added device selector ${this.deviceSelectors.length}`, false, "INFO");
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
      // Compact arrays
      this.properties.selectedDeviceIds = this.properties.selectedDeviceIds.filter((id) => id);
      this.properties.selectedDeviceNames = this.properties.selectedDeviceNames.filter((name) => name);

      const slotIndex = this.outputs.length - 1;
      if (slotIndex > 0) {
        this.removeOutput(slotIndex);
        this.log("removeDeviceDebug", `Removed output slot ${slotIndex}`, false, "INFO");
      }

      this.updateNodeSize();
      this.setDirtyCanvasDebounced();
      this.updateStatus("✅ Removed device selector");
      this.log("removeDevice", "Removed device selector", false, "INFO");
    };

    restoreDeviceSelectors = () => {
      this.widgets = this.widgets.filter((w) => !w.name.startsWith("Select Device"));
      this.deviceSelectors = [];

      const filterType = this.properties.filterType;
      const normalizedFilterType = HAGenericDeviceNode.filterTypeMap[filterType] || filterType.toLowerCase().replace(/\s+/g, "_");
      const filteredDevices = this.devices.filter((device) => {
        if (normalizedFilterType === "all") return true;
        return device.entityType.toLowerCase() === normalizedFilterType;
      });

      // Compact arrays
      this.properties.selectedDeviceIds = this.properties.selectedDeviceIds.filter((id) => id);
      this.properties.selectedDeviceNames = this.properties.selectedDeviceNames.filter((name) => name);

      this.properties.selectedDeviceIds.forEach((deviceId, index) => {
        if (!deviceId) return;
        const device = this.devices.find((d) => d.entity_id === deviceId);
        const deviceName = this.properties.selectedDeviceNames[index] || "Unknown";
        const options = [
          "Select Device",
          deviceName,
          ...filteredDevices
            .map((d) => d.name)
            .filter((name) => name !== deviceName)
            .sort((a, b) => a.localeCompare(b)),
        ];
        const deviceSelector = this.addWidget(
          "combo",
          `Select Device ${index + 1}`,
          deviceName,
          (value) => this.onDeviceSelected(value, index),
          { values: options, width: this.size[0] - 20 }
        );
        this.deviceSelectors.push(deviceSelector);
        this.perDeviceState[deviceId] ??= { state: device?.state, attributes: device?.attributes };

        const slotIndex = index + 1;
        if (slotIndex >= this.outputs.length) {
          this.addOutput(`Device ${slotIndex}`, "light_info");
          this.log("RestoreSelectors", `Added output slot ${slotIndex}`, false, "INFO");
        }
      });

      // Synchronize arrays
      this.properties.selectedDeviceNames = this.properties.selectedDeviceNames.slice(0, this.properties.selectedDeviceIds.length);
      this.updateNodeSize();
      this.setDirtyCanvasDebounced();
      this.log("RestoreSelectors", `Restored ${this.properties.selectedDeviceIds.length} device selectors`, false, "INFO");
    };

    updateDeviceSelectorOptions = () => {
      const filterType = this.properties.filterType;
      const normalizedFilterType = HAGenericDeviceNode.filterTypeMap[filterType] || filterType.toLowerCase().replace(/\s+/g, '_');
      const filteredDevices = this.devices.filter((device) => {
        if (normalizedFilterType === "all") return true;
        return device.entityType.toLowerCase() === normalizedFilterType;
      });
      const baseOptions = this.deviceManagerReady && filteredDevices.length
        ? filteredDevices.map(d => d.name).sort((a, b) => a.localeCompare(b))
        : [];

      this.deviceSelectors.forEach((selector, index) => {
        const currentName = this.properties.selectedDeviceNames[index] || "Select Device";
        const options = ["Select Device", ...new Set([currentName, ...baseOptions])];
        selector.options.values = options;
        selector.value = currentName;
        this.log("Filter", `Updated selector ${index + 1} options: ${options.length - 1} devices, displaying: ${currentName}`, false);
      });

      this.log("Filter", `Updated selector options for filter ${filterType}: ${baseOptions.length} devices available`, false);
    };
    
    getDeviceOptions = () => {
      const filterType = this.properties.filterType;
      const normalizedFilterType = HAGenericDeviceNode.filterTypeMap[filterType] || filterType.toLowerCase().replace(/\s+/g, '_');
      const filteredDevices = this.devices.filter((device) => {
        if (normalizedFilterType === "all") return true;
        return device.entityType.toLowerCase() === normalizedFilterType;
      });
      return this.deviceManagerReady && filteredDevices.length
        ? filteredDevices.map((d) => d.name)
        : ["No Devices Found"];
    };

    onDeviceSelected = async (value, index) => {
      if (value === "Select Device" || value === "No Devices Found") {
        const removedDeviceId = this.properties.selectedDeviceIds[index];
        if (removedDeviceId && this.perDeviceState[removedDeviceId]) {
          delete this.perDeviceState[removedDeviceId];
        }
        this.properties.selectedDeviceIds[index] = undefined;
        this.properties.selectedDeviceNames[index] = undefined;
        this.properties.selectedDeviceIds = this.properties.selectedDeviceIds.filter(id => id); // Compact arrays
        this.properties.selectedDeviceNames = this.properties.selectedDeviceNames.filter(name => name);
        this.deviceSelectors[index].value = "Select Device";
        this.updateNodeSize();
        this.setDirtyCanvasDebounced();
        this.updateStatus(`✅ Deselected device at selector ${index + 1}.`);
        this.log("DeviceSelected", `Deselected device at selector ${index + 1}`, false, 'INFO');
        return;
      }

      if (!this.deviceManagerReady) await this.fetchDevices();
      const filterType = this.properties.filterType;
      const normalizedFilterType = HAGenericDeviceNode.filterTypeMap[filterType] || filterType.toLowerCase().replace(/\s+/g, '_');
      const filteredDevices = this.devices.filter((device) => {
        if (normalizedFilterType === "all") return true;
        return device.entityType.toLowerCase() === normalizedFilterType;
      });
      const device = filteredDevices.find((d) => d.name.trim() === value.trim());
      if (!device) {
        this.updateStatus(`⚠️ Device "${value}" not found.`);
        this.log("DeviceSelected", `No device found for name: ${value}`, true, 'WARN');
        return;
      }

      const deviceId = device.entity_id.startsWith('ha_') ? device.entity_id.slice(3) : device.entity_id;
      if (this.properties.selectedDeviceIds.includes(deviceId)) {
        this.updateStatus(`⚠️ Device "${device.name}" already selected.`);
        this.deviceSelectors[index].value = "Select Device";
        this.properties.selectedDeviceIds[index] = undefined;
        this.properties.selectedDeviceNames[index] = undefined;
        return;
      }

      this.properties.selectedDeviceIds[index] = deviceId;
      this.properties.selectedDeviceNames[index] = device.name;
      await this.fetchDeviceState(deviceId);
      // Ensure arrays are synchronized
      this.properties.selectedDeviceIds = this.properties.selectedDeviceIds.filter(id => id);
      this.properties.selectedDeviceNames = this.properties.selectedDeviceNames.filter(name => name);
      this.updateNodeSize();
      this.setDirtyCanvasDebounced();
      this.log("DeviceSelected", `Selected device "${device.name}" (ID: ${deviceId})`, false, 'INFO');
    };

    fetchDeviceState = async (deviceId) => {
      const normalizedDeviceId = deviceId.startsWith('ha_') ? deviceId.slice(3) : deviceId;
      const cached = this.stateCache.get(normalizedDeviceId);
      const now = Date.now();
      if (cached && now - cached.timestamp < this.STATE_CACHE_TTL && cached.state.state !== "unknown") {
        this.log("fetchDeviceStateCache", `Using cached state for ${normalizedDeviceId}`, false);
        this.perDeviceState[normalizedDeviceId] = cached.state;
        return true;
      }

      for (let attempt = 0; attempt < this.properties.maxRetries; attempt++) {
        try {
          this.log("fetchDeviceState", `Fetching state for ${normalizedDeviceId} (attempt ${attempt + 1})`, false);
          const response = await fetch(`${this.CUSTOM_API_URL}/api/lights/ha/ha_${normalizedDeviceId}/state`, {
            headers: { 
              'Authorization': `Bearer ${this.properties.haToken}`,
              'Content-Type': 'application/json'
            },
            signal: AbortSignal.timeout(10000)
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          const data = await response.json();
          if (data.success && data.state) {
            const device = this.devices.find((d) => d.entity_id === normalizedDeviceId);
            const entityType = normalizedDeviceId.split('.')[0];
            const stateData = {
              state: entityType === 'sensor' ? data.state.value : 
                     entityType === 'binary_sensor' ? (data.state.on ? 'on' : 'off') : 
                     entityType === 'media_player' ? data.state.state : 
                     (data.state.on ? 'on' : 'off'),
              attributes: entityType === 'sensor' ? { unit: data.state.unit || '' } :
                          entityType === 'binary_sensor' ? { battery: 'unknown' } :
                          entityType === 'media_player' ? {
                            volume_level: data.state.volume_level || 0,
                            source: data.state.source || null,
                            media_title: data.state.media_title || null
                          } : {
                            brightness: data.state.brightness || 0,
                            hs_color: data.state.hs_color || [data.state.hue || 0, data.state.saturation || 0],
                            power: data.state.power || null,
                            energy: data.state.energy || null
                          }
            };

            if (device.power_sensor && !stateData.attributes.power) {
              try {
                const powerResponse = await fetch(`${this.CUSTOM_API_URL}/api/lights/ha/ha_${device.power_sensor}/state`, {
                  headers: { 'Authorization': `Bearer ${this.properties.haToken}` }
                });
                const powerData = await powerResponse.json();
                if (powerData.success) {
                  stateData.attributes.power = parseFloat(powerData.state.value) || 0;
                  this.log("fetchDeviceState", `Fetched power for ${normalizedDeviceId}: ${stateData.attributes.power} W`, false);
                }
              } catch (e) {
                this.log("fetchDeviceStateError", `Failed to fetch power sensor ${device.power_sensor}: ${e.message}`, false);
              }
            }
            if (device.energy_sensor && !stateData.attributes.energy) {
              try {
                const energyResponse = await fetch(`${this.CUSTOM_API_URL}/api/lights/ha/ha_${device.energy_sensor}/state`, {
                  headers: { 'Authorization': `Bearer ${this.properties.haToken}` }
                });
                const energyData = await energyResponse.json();
                if (energyData.success) {
                  stateData.attributes.energy = parseFloat(energyData.state.value) || 0;
                  this.log("fetchDeviceState", `Fetched energy for ${normalizedDeviceId}: ${stateData.attributes.energy} kWh`, false);
                }
              } catch (e) {
                this.log("fetchDeviceStateError", `Failed to fetch energy sensor ${device.energy_sensor}: ${e.message}`, false);
              }
            }

            this.perDeviceState[normalizedDeviceId] = stateData;
            this.stateCache.set(normalizedDeviceId, { state: stateData, timestamp: now });
            this.log("fetchDeviceState", `Fetched state for ${normalizedDeviceId}: state=${stateData.state}`, false);
            this.setDirtyCanvasDebounced();
            return true;
          }
          throw new Error(data.error || "No state returned");
        } catch (error) {
          this.log("fetchDeviceStateError", `Error fetching state for ${normalizedDeviceId} (attempt ${attempt + 1}): ${error.message}`, true);
          if (attempt === this.properties.maxRetries - 1) {
            this.perDeviceState[normalizedDeviceId] ??= { state: "unknown", attributes: {} };
            this.updateStatus(`⚠️ Failed to fetch state for ${normalizedDeviceId} after ${this.properties.maxRetries} attempts`);
            return false;
          }
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      return false;
    };

    handleDeviceStateUpdate = (data) => {
      const deviceId = (data.id ? data.id.replace('ha_', '') : data.entity_id) || '';
      if (!this.properties.selectedDeviceIds.includes(deviceId)) return;
      this.processDeviceStateUpdate(data, deviceId);
    };

    processDeviceStateUpdate = (data, deviceId) => {
      if (!this.socketUpdateTimers) this.socketUpdateTimers = new Map();
      const updateData = { data, deviceId, timestamp: Date.now() };
      
      if (!this.globalSocketUpdateTimer) {
        this.globalSocketUpdateTimer = setTimeout(() => {
          const updates = Array.from(this.socketUpdateTimers.entries());
          this.socketUpdateTimers.clear();
          this.log("deviceStateUpdate", `Processing ${updates.length} batched updates`, true, "INFO");
          
          const processedDevices = new Set();
          updates.forEach(([deviceId, { data }]) => {
            if (!this.properties.selectedDeviceIds.includes(deviceId) || processedDevices.has(deviceId)) return;
            processedDevices.add(deviceId);
            
            const entityType = deviceId.split('.')[0];
            const newState = {
              state: entityType === 'sensor' ? data.value || data.state : 
                     entityType === 'binary_sensor' ? (data.on || data.state === 'on' ? 'on' : 'off') : 
                     entityType === 'media_player' ? data.state : 
                     (data.on || data.state === 'on' ? 'on' : 'off'),
              attributes: entityType === 'sensor' ? { unit: data.unit || data.attributes?.unit_of_measurement || '' } :
                          entityType === 'binary_sensor' ? { battery: data.battery_level || data.attributes?.battery_level || 'unknown' } :
                          entityType === 'media_player' ? {
                            volume_level: data.volume_level || data.attributes?.volume_level,
                            source: data.source || data.attributes?.source,
                            media_title: data.media_title || data.attributes?.media_title
                          } : {
                            brightness: data.brightness || data.attributes?.brightness || 0,
                            hs_color: data.hs_color || data.attributes?.hs_color || [data.hue || data.attributes?.hue || 0, data.saturation || data.attributes?.saturation || 0],
                            power: data.power || data.attributes?.power || null,
                            energy: data.energy || data.attributes?.energy || null
                          }
            };
            const oldState = this.perDeviceState[deviceId] || { state: "unknown", attributes: {} };
            if (oldState.state === newState.state && JSON.stringify(oldState.attributes) === JSON.stringify(newState.attributes)) {
              this.log("deviceStateUpdate", `Skipped redundant update for ${deviceId}: state=${newState.state}`, false, "INFO");
              return;
            }
            this.perDeviceState[deviceId] = newState;
            this.updateStatus(`✅ Device updated: ${newState.state}`);
            this.setDirtyCanvasDebounced();
            this.log("deviceStateUpdate", `Updated state for ${deviceId}: state=${newState.state}`, true, "INFO");
          });
          
          this.globalSocketUpdateTimer = null;
        }, 500);
      }
      
      this.socketUpdateTimers.set(deviceId, updateData);
    };

    handleTrigger = async (trigger, timestamp = Date.now()) => {
      if (typeof trigger !== "boolean") {
        this.log("Trigger", `Ignoring non-boolean trigger: ${trigger}`, false, "INFO");
        this.updateStatus("⚠️ Invalid trigger input (must be true or false)");
        return;
      }
      if (!this.properties.selectedDeviceIds.length) {
        this.updateStatus("⚠️ No devices selected. Cannot toggle state.");
        this.log("Trigger", "No devices selected", true, "WARN");
        return;
      }
      if (!this.deviceManagerReady) {
        this.updateStatus("⚠️ Waiting for devices to initialize.");
        this.log("Trigger", "Device manager not ready", true, "WARN");
        return;
      }

      if (this.lastTriggerTimestamp && timestamp < this.lastTriggerTimestamp) {
        this.log("Trigger", `Skipping outdated trigger: ${trigger} (timestamp ${timestamp})`, true, "INFO");
        return;
      }

      this.triggerQueue = [{ trigger, timestamp }];
      if (this.isProcessingTriggers) {
        this.log("Trigger", `Queued latest trigger: ${trigger} at ${timestamp}`, true, "INFO");
        return;
      }
      this.isProcessingTriggers = true;

      while (this.triggerQueue.length > 0) {
        const { trigger: currentTrigger, timestamp: currentTimestamp } = this.triggerQueue.shift();
        if (this.lastTriggerTimestamp && currentTimestamp < this.lastTriggerTimestamp) {
          this.log("Trigger", `Skipping outdated queued trigger: ${currentTrigger} (timestamp ${currentTimestamp})`, true, "INFO");
          continue;
        }

        this.log("Trigger", `Processing trigger: ${currentTrigger}, devices: ${this.properties.selectedDeviceIds.length}, timestamp: ${currentTimestamp}`, true, "INFO");

        await Promise.all(
          this.properties.selectedDeviceIds.map(async (deviceId) => {
            if (deviceId) await this.fetchDeviceState(deviceId);
          })
        );

        const validDevices = this.properties.selectedDeviceIds.filter((id) => {
          if (!id) {
            this.log("Trigger", `Skipping null device ID`, true, "WARN");
            return false;
          }
          const device = this.devices.find((d) => d.entity_id === id);
          const entityType = id.split(".")[0];
          if (!device || !["light", "switch", "fan", "cover", "media_player"].includes(entityType)) {
            return false;
          }
          const currentState = this.perDeviceState[id];
          if (!currentState) {
            this.log("Trigger", `No state for device ${id}`, true, "WARN");
            return false;
          }
          const isOn = entityType === "media_player" ? currentState.state !== "off" : currentState.state === "on";
          const needsUpdate = isOn !== currentTrigger;
          if (!needsUpdate) {
            this.log("Trigger", `Device ${device.name} already in state ${currentTrigger ? "On" : "Off"}`, false, "INFO");
          }
          return needsUpdate;
        });

        if (!validDevices.length) {
          this.updateStatus(`✅ All devices already in state ${currentTrigger ? "On" : "Off"}`);
          this.log("Trigger", "No devices need updating", true, "INFO");
          this.lastTriggerTimestamp = currentTimestamp;
          continue;
        }

        const payload = { on: currentTrigger, transition: this.properties.transitionTime };
        const results = await Promise.all(
          validDevices.map(async (deviceId, i) => {
            await new Promise((resolve) => setTimeout(resolve, 200 * i));
            try {
              const deviceName = this.properties.selectedDeviceNames[this.properties.selectedDeviceIds.indexOf(deviceId)] || "Unknown";
              const success = await this.updateDeviceState(deviceId, payload, "application");
              this.log("Trigger", `Update ${deviceName} (${deviceId}): ${success ? "Success" : "Failed"}`, true, "INFO");
              return { deviceId, success };
            } catch (error) {
              this.log("Trigger", `Error updating ${deviceId}: ${error.message}`, true, "ERROR");
              return { deviceId, success: false };
            }
          })
        );

        const successCount = results.filter((r) => r.success).length;
        if (successCount === validDevices.length) {
          this.updateStatus(`✅ Toggled ${successCount} devices to ${currentTrigger ? "On" : "Off"}`);
          this.log("Trigger", `Successfully toggled ${successCount} devices`, true, "INFO");
        } else {
          const failedDevices = results.filter((r) => !r.success).map((r) => r.deviceId);
          this.updateStatus(
            `⚠️ Failed to toggle ${validDevices.length - successCount}/${validDevices.length} devices: ${failedDevices.join(", ")}`
          );
          this.log(
            "Trigger",
            `Failed to toggle ${validDevices.length - successCount} devices: ${failedDevices.join(", ")}`,
            true,
            "ERROR"
          );
        }
        this.lastTriggerTimestamp = currentTimestamp;
      }

      this.isProcessingTriggers = false;
    };

    handleHSVInput = async (hsv) => {
      if (!this.properties.selectedDeviceIds.length) {
        this.updateStatus("⚠️ No devices selected. Cannot update HSV.");
        return;
      }
      if (!hsv || typeof hsv.hue !== "number" || typeof hsv.saturation !== "number" || typeof hsv.brightness !== "number") {
        this.updateStatus("⚠️ Invalid HSV input.");
        return;
      }
      this.log("HSV", `Raw HSV input: hue=${hsv.hue}, sat=${hsv.saturation}, bri=${hsv.brightness}`, false);

      let hue = hsv.hue <= 1 ? hsv.hue * 360 : hsv.hue;
      hue = Math.round(Math.max(0, Math.min(360, hue)));
      let saturation = hsv.saturation <= 1 ? hsv.saturation * 100 : hsv.saturation;
      saturation = Math.round(Math.max(0, Math.min(100, saturation)));
      let brightness;
      if (hsv.brightness <= 1) {
        brightness = hsv.brightness * 100;
      } else if (hsv.brightness <= 255) {
        brightness = (hsv.brightness / 255) * 100;
      } else {
        brightness = hsv.brightness;
      }
      brightness = Math.round(Math.max(0, Math.min(100, brightness)));
      this.log("HSV", `Normalized HSV: hue=${hue}, sat=${saturation}, bri=${brightness}`, false);

      const eligibleDevices = [];
      for (const deviceId of this.properties.selectedDeviceIds) {
        if (!deviceId) continue;
        const device = this.devices.find((d) => d.entity_id === deviceId);
        const entityType = deviceId.split('.')[0];
        if (entityType !== 'light' || !this.perDeviceState[deviceId]?.attributes?.hs_color) {
          this.log("HSV", `Skipping non-HSV device ${device?.name || deviceId}`, false);
          continue;
        }
        await this.fetchDeviceState(deviceId);
        const state = this.perDeviceState[deviceId];
        if (
          Math.abs(state.attributes.hs_color[0] - hue) > this.HSV_CHANGE_THRESHOLD ||
          Math.abs(state.attributes.hs_color[1] - saturation) > this.HSV_CHANGE_THRESHOLD ||
          Math.abs((state.attributes.brightness || (state.state === 'on' ? 100 : 0)) - brightness) > this.HSV_CHANGE_THRESHOLD
        ) {
          eligibleDevices.push(deviceId);
        }
      }

      if (!eligibleDevices.length) {
        this.log("HSV", "No update needed: HSV change below threshold or no eligible devices", false);
        return;
      }

      const command = {
        devices: eligibleDevices,
        update: (deviceId) => {
          const state = this.perDeviceState[deviceId];
          return {
            on: state.state === 'on',
            hs_color: [hue, saturation],
            brightness,
            transition: this.properties.transitionTime
          };
        },
        //timestamp: Date.now()
      };

      this.commandQueue.push(command);
      this.log("HSV", `Queued HSV command for ${eligibleDevices.length} devices: hue=${hue}, sat=${saturation}, bri=${brightness}`, false);

      if (!this.isProcessingQueue) {
        await this.processQueue();
      }
    };

    updateDeviceState = async (deviceId, update, source = "application") => {
      if (!deviceId || !this.perDeviceState[deviceId]) {
        this.log("updateDeviceState", `Invalid deviceId or missing state for ${deviceId}`, true, "WARN");
        return false;
      }
      const device = this.devices.find((d) => d.entity_id === deviceId);
      const deviceName = this.properties.selectedDeviceNames[this.properties.selectedDeviceIds.indexOf(deviceId)] || "Unknown";
      const isExternal = source === "external";

      if (isExternal) {
        this.perDeviceState[deviceId] = {
          state: update.state ?? this.perDeviceState[deviceId].state,
          attributes: update.attributes ?? this.perDeviceState[deviceId].attributes,
        };
        this.setDirtyCanvasDebounced();
        this.log("externalUpdate", `Applied external state for ${deviceName}`, false, "INFO");
        return true;
      }

      const payload = {};
      const entityType = deviceId.split(".")[0];
      if (update.on !== undefined) {
        payload.on = update.on;
      }
      if (entityType === "light" && update.hs_color) {
        payload.hs_color = update.hs_color;
        payload.brightness = Math.max(0, Math.min(100, update.brightness));
        payload.transition = update.transition ?? this.properties.transitionTime;
      } else if (["switch", "fan", "cover"].includes(entityType)) {
        payload.on = update.on;
      } else if (entityType === "media_player") {
        payload.state = update.on ? "on" : "off";
      }

      let success = false;
      let lastError = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await fetch(`${this.CUSTOM_API_URL}/api/lights/ha/ha_${deviceId}/state`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${this.properties.haToken}`,
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(15000),
          });
          const data = await response.json();
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${data.error || response.statusText}`);
          }
          if (data.success) {
            // Poll state up to 3 times
            for (let pollAttempt = 0; pollAttempt < 3; pollAttempt++) {
              await new Promise((resolve) => setTimeout(resolve, this.properties.stateVerificationDelay || 1000));
              await this.fetchDeviceState(deviceId);
              const verifiedState = this.perDeviceState[deviceId];
              const expectedOn = payload.on;
              const matches =
                entityType === "media_player"
                  ? expectedOn === undefined || (expectedOn ? verifiedState.state !== "off" : verifiedState.state === "off")
                  : expectedOn === undefined || verifiedState.state === (expectedOn ? "on" : "off");
              if (matches) {
                success = true;
                break;
              }
              this.log("updateDeviceState", `State verification failed for ${deviceName} (poll attempt ${pollAttempt + 1})`, true, "WARN");
            }
            if (success || attempt === 1) break;
          }
          throw new Error(data.error || "Failed to update state");
        } catch (error) {
          lastError = error.message;
          this.log("updateDeviceState", `Update attempt ${attempt + 1} failed for ${deviceName}: ${error.message}`, true, "ERROR");
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      if (success) {
        this.log("updateDeviceState", `Successfully updated ${deviceName}`, true, "INFO");
      } else {
        this.updateStatus(`⚠️ Failed to update Device "${deviceName}" after 2 attempts`);
        this.log("updateDeviceState", `Failed to update ${deviceName}: ${lastError}`, true, "ERROR");
      }

      return success;
    };

    verifyDeviceStates = async (devices, update) => {
      const failedDevices = [];
      for (const deviceId of devices) {
        if (!deviceId) continue;
        await this.fetchDeviceState(deviceId);
        const state = this.perDeviceState[deviceId];
        const expectedOn = update.on;
        const expectedBrightness = update.brightness;
        const expectedHue = update.hs_color ? update.hs_color[0] : undefined;
        const expectedSaturation = update.hs_color ? update.hs_color[1] : undefined;
        const entityType = deviceId.split('.')[0];
        const matches = entityType === 'light' ?
          state.state === (expectedOn ? 'on' : 'off') &&
          (!expectedBrightness || Math.abs((state.attributes.brightness || (state.state === 'on' ? 100 : 0)) - expectedBrightness) < 5) &&
          (!expectedHue || Math.abs((state.attributes.hs_color ? state.attributes.hs_color[0] : 0) - expectedHue) < 5) &&
          (!expectedSaturation || Math.abs((state.attributes.hs_color ? state.attributes.hs_color[1] : 0) - expectedSaturation) < 5) :
          state.state === (expectedOn ? 'on' : 'off');
        if (!matches) {
          const deviceName = this.properties.selectedDeviceNames[this.properties.selectedDeviceIds.indexOf(deviceId)] || "Unknown";
          this.log("Verify", `State mismatch for ${deviceName} (${deviceId}): expected ${expectedOn ? 'on' : 'off'}, got ${state.state}`, true);
          failedDevices.push({ deviceId, deviceName });
        }
      }
      return failedDevices;
    };

    processQueue = async () => {
      if (this.isProcessingQueue || !this.commandQueue.length) return true;
      this.isProcessingQueue = true;

      let success = true;
      while (this.commandQueue.length > 0) {
        const command = this.commandQueue.shift();
        const { devices, update, timestamp } = command;
        const commandId = `${timestamp}-${devices.join('-')}`;
        const retryCount = (this.commandRetryCounts.get(commandId) || 0) + 1;
        this.commandRetryCounts.set(commandId, retryCount);

        this.log("Queue", `Processing command ${commandId}: devices=${devices.length}, retry=${retryCount}`, true, 'INFO');

        try {
          await Promise.all(devices.map(deviceId => this.fetchDeviceState(deviceId)));

          const updatePromises = devices.map(async (deviceId, i) => {
            if (!deviceId) {
              this.log("Queue", `Skipping invalid device ID at index ${i}`, true, 'WARN');
              return false;
            }
            const deviceName = this.properties.selectedDeviceNames[this.properties.selectedDeviceIds.indexOf(deviceId)] || "Unknown";
            const updatePayload = typeof update === 'function' ? update(deviceId) : update;
            await new Promise(resolve => setTimeout(resolve, 200 * i));
            return await this.updateDeviceState(deviceId, updatePayload, "application");
          });

          const results = await Promise.all(updatePromises);
          const failedDevices = devices.filter((_, i) => !results[i]);
          if (failedDevices.length > 0) {
            this.log("Queue", `Failed to update ${failedDevices.length} devices`, true, 'ERROR');
            if (retryCount <= 2) {
              await new Promise(resolve => setTimeout(resolve, 1000));
              this.commandQueue.push({ devices: failedDevices, update, timestamp });
              this.log("Queue", `Re-queued command ${commandId} for ${failedDevices.length} failed devices`, false, 'INFO');
            } else {
              this.updateStatus(`⚠️ Failed to update ${failedDevices.length}/${devices.length} devices after 2 retries`);
              this.commandRetryCounts.delete(commandId);
              success = false;
            }
          } else {
            this.log("Queue", `Successfully updated ${devices.length} devices`, false, 'INFO');
            this.commandRetryCounts.delete(commandId);
          }
        } catch (error) {
          this.log("Queue", `Error processing command ${commandId}: ${error.message}`, true, 'ERROR');
          this.updateStatus(`⚠️ Error processing command for ${devices.length} devices: ${error.message}`);
          success = false;
          this.commandRetryCounts.delete(commandId);
        }
      }

      this.isProcessingQueue = false;
      return success;
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

    rgbToHex = (r, g, b) => {
      return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
    };

    updateNodeSize = () => {
      this.size[0] = 400;
      const baseHeight = 40;
      let widgetsHeight = this.widgets
        .filter((w) => !w.name.startsWith("Select Device"))
        .reduce((sum, w) => sum + (w.computeSize?.(this.size[0])[1] ?? LiteGraph.NODE_WIDGET_HEIGHT), 0);
      widgetsHeight += 15;
      const totalDeviceHeight = this.properties.selectedDeviceIds.length * 50;
      const extraHeight = 20 * this.outputs.length;
      this.size[1] = baseHeight + widgetsHeight + totalDeviceHeight + 45 + extraHeight;
      this.setSize([this.size[0], this.size[1]]);
      this.setDirtyCanvasDebounced();
    };

    updateStatus = (message = null) => {
      const deviceId = this.properties.selectedDeviceIds[0];
      const deviceName = deviceId ? (this.properties.selectedDeviceNames[this.properties.selectedDeviceIds.indexOf(deviceId)] || "Unknown") : "No Device";
      const deviceState = this.perDeviceState[deviceId]?.state || "Unknown";
      let totalPower = 0;
      let totalEnergy = 0;
      let devicesWithStats = 0;
      this.properties.selectedDeviceIds.forEach((id) => {
        if (id && this.perDeviceState[id]?.attributes) {
          if (this.perDeviceState[id].attributes.power != null) {
            totalPower += this.perDeviceState[id].attributes.power;
          }
          if (this.perDeviceState[id].attributes.energy != null) {
            totalEnergy += this.perDeviceState[id].attributes.energy;
            devicesWithStats++;
          }
        }
      });
      const status = message ?? `✅ ${devicesWithStats} devices: ${deviceState}, ${totalPower.toFixed(1)}W, ${totalEnergy.toFixed(2)}kWh`;

      if (!this.statusUpdateTimer) {
        this.statusUpdateTimer = setTimeout(() => {
          if (status !== this.properties.status) {
            this.properties.status = status;
            if (this.statusWidget) this.statusWidget.value = status;
            if (status.includes('⚠️') || status.includes('✅ Updated states')) {
              this.setDirtyCanvasDebounced();
            }
            this.log("updateStatus", `Updated status: ${status}`, false);
          }
          this.statusUpdateTimer = null;
        }, 500);
      }
    };

    onDrawForeground = (ctx) => { // MODIFIED: Added blinking effect
      if (super.onDrawForeground) super.onDrawForeground(ctx);
      let widgetsHeight = this.widgets
        .filter((w) => !w.name.startsWith("Select Device"))
        .reduce((sum, w) => sum + (w.computeSize?.(this.size[0])[1] ?? LiteGraph.NODE_WIDGET_HEIGHT), 0);
      widgetsHeight += 15;
      const selectorHeight = this.deviceSelectors.length * 25;
      const outputHeight = this.outputs.length * 20;
      const overlayStartY = widgetsHeight + selectorHeight + outputHeight + 60;

      this.properties.selectedDeviceIds.forEach((deviceId, index) => {
        if (!deviceId || !this.perDeviceState[deviceId]) return;
        const deviceName = this.properties.selectedDeviceNames[index] || "Unknown";
        const deviceState = this.perDeviceState[deviceId];
        const entityType = deviceId.split('.')[0];
        const yPosition = overlayStartY + index * 25;

        ctx.fillStyle = "#E0E0E0";
        ctx.font = "14px Roboto, Arial, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(deviceName, 10, yPosition);

        let showDot = false;
        let dotColor = "#FF0000";
        let showColorBox = false;
        let brightness = 0;

        if (['light', 'switch', 'fan', 'cover', 'media_player'].includes(entityType)) {
          const isOn = entityType === 'media_player' ? deviceState.state !== 'off' : deviceState.state === 'on';
          dotColor = isOn ? "#00FF00" : "#FF0000";
          showDot = true;
          if (entityType === 'light' && deviceState.attributes?.hs_color?.length === 2) {
            showColorBox = true;
            brightness = deviceState.attributes.brightness || (isOn ? 100 : 0);
          }
        } else if (entityType === 'binary_sensor') {
          dotColor = deviceState.state === 'on' ? "#00FF00" : "#FF0000";
          showDot = true;
        }

        if (showDot) {
          const onOffX = this.size[0] - 100;
          ctx.beginPath();
          if (dotColor === "#00FF00") { // Device is On
            const flashState = Math.floor(Date.now() / 500) % 2; // Blink every 500ms
            if (flashState === 0) { // Only draw when flashState is 0
              ctx.fillStyle = dotColor;
              ctx.arc(onOffX, yPosition - 5, 10, 0, Math.PI * 2);
              ctx.fill();
            }
          } else { // Device is Off, no blinking
            ctx.fillStyle = dotColor;
            ctx.arc(onOffX, yPosition - 5, 10, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.strokeStyle = "#FFFFFF";
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        if (showColorBox) {
          const hue = deviceState.attributes.hs_color[0] / 360;
          const saturation = deviceState.attributes.hs_color[1] / 100;
          const brightnessPercent = Math.min(1, Math.max(0, brightness / 100));
          const rgb = this.hsvToRgb(hue, saturation, brightnessPercent);
          const meterX = this.size[0] - 80;
          const meterWidth = 60;
          const meterHeight = 20;
          ctx.fillStyle = this.rgbToHex(...rgb);
          ctx.fillRect(meterX, yPosition - 15, meterWidth * brightnessPercent, meterHeight);
          ctx.strokeStyle = "#FFFFFF";
          ctx.lineWidth = 1;
          ctx.strokeRect(meterX, yPosition - 15, meterWidth, meterHeight);
          ctx.fillStyle = "#FFFFFF";
          ctx.font = "10px Roboto, Arial, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(`${Math.round(brightnessPercent * 100)}%`, meterX + meterWidth / 2, yPosition - 2);
        }

        if (deviceState.attributes?.power != null || deviceState.attributes?.energy != null) {
          ctx.fillStyle = "#E0E0E0";
          ctx.font = "10px Roboto, Arial, sans-serif";
          ctx.textAlign = "left";
          ctx.fillText(
            `P: ${deviceState.attributes.power != null ? deviceState.attributes.power.toFixed(1) + 'W' : 'N/A'}, E: ${deviceState.attributes.energy != null ? deviceState.attributes.energy.toFixed(2) + 'kWh' : 'N/A'}`,
            10,
            yPosition + 15
          );
        }
      });
    };

    onExecute = async () => {
      const now = Date.now();
      this.lastExecuteTimestamp = this.lastExecuteTimestamp || 0;
      if (now - this.lastExecuteTimestamp < 500) {
        if (!this.loggedDebounce) {
          this.log("Execute", "Debouncing execution", false, "INFO");
          this.loggedDebounce = true;
        }
        return;
      }
      this.lastExecuteTimestamp = now;
      this.loggedDebounce = false;

      this.log("executeDebug", `Executing at timestamp ${now}`, false, "INFO");

      if (!this.deviceManagerReady) {
        this.log("executeDebug", "Device manager not ready, fetching devices", false, "INFO");
        await this.fetchDevices();
        if (!this.deviceManagerReady) {
          this.updateStatus("⚠️ Failed to initialize device manager");
          this.log("executeDebug", "Failed to initialize device manager", true, "ERROR");
          return;
        }
      }

      let fetchSuccess = true;
      for (const deviceId of this.properties.selectedDeviceIds) {
        if (deviceId) {
          const success = await this.fetchDeviceState(deviceId);
          if (!success) fetchSuccess = false;
        }
      }
      if (this.properties.selectedDeviceIds.length) {
        this.updateStatus(
          fetchSuccess
            ? `✅ Updated states for ${this.properties.selectedDeviceIds.length} devices`
            : `⚠️ Failed to fetch some device states`
        );
      } else {
        this.updateStatus("⚠️ No devices selected");
      }

      const hsvInput = this.getInputData(0);
      const stateInput = this.getInputData(1);
      const triggerInput = this.getInputData(2);

      let stateChanged = false;
      if (typeof triggerInput === "boolean") {
        if (this.lastTriggerValue === triggerInput) {
          this.log("Execute", `Ignoring unchanged trigger: ${triggerInput}`, false, "INFO");
        } else {
          this.lastTriggerValue = triggerInput;
          this.properties.lastTriggerState = triggerInput;
          this.log("Execute", `Processing new trigger: ${triggerInput} at ${now}`, true, "INFO");
          await this.handleTrigger(triggerInput, now);
          stateChanged = true;
        }
      } else if (triggerInput !== null && triggerInput !== undefined) {
        this.log("Execute", `Ignoring invalid trigger input: ${triggerInput}`, true, "WARN");
      }

      if (
        hsvInput &&
        (!this.lastHsvInput ||
          hsvInput.hue !== this.lastHsvInput.hue ||
          hsvInput.saturation !== this.lastHsvInput.saturation ||
          hsvInput.brightness !== this.lastHsvInput.brightness)
      ) {
        this.lastHsvInput = hsvInput;
        this.log(
          "Execute",
          `Processing HSV input: hue=${hsvInput.hue}, sat=${hsvInput.saturation}, bri=${hsvInput.brightness}`,
          false,
          "INFO"
        );
        await this.handleHSVInput(hsvInput);
        stateChanged = true;
      }

      if (stateInput && stateInput !== this.lastStateInput) {
        this.lastStateInput = stateInput;
        const hasHsv =
          typeof stateInput.hue === "number" &&
          typeof stateInput.saturation === "number" &&
          typeof stateInput.brightness === "number";
        if (hasHsv) {
          this.log(
            "Execute",
            `Processing HSV state input: hue=${stateInput.hue}, sat=${stateInput.saturation}, bri=${stateInput.brightness}`,
            false,
            "INFO"
          );
          await this.handleHSVInput({
            hue: stateInput.hue,
            saturation: stateInput.saturation,
            brightness: stateInput.brightness,
          });
          stateChanged = true;
        } else {
          const command = {
            devices: this.properties.selectedDeviceIds.filter((id) => {
              const device = this.devices.find((d) => d.entity_id === id);
              const entityType = id.split(".")[0];
              return device && !["weather", "sensor", "binary_sensor"].includes(entityType);
            }),
            update: {
              on: stateInput.on,
              brightness: stateInput.brightness,
              hs_color: stateInput.hs_color,
              transition: stateInput.transition,
              percentage: stateInput.percentage,
              position: stateInput.position,
              state: stateInput.state,
              volume_level: stateInput.volume_level,
              source: stateInput.source,
              timestamp: now,
            },
            timestamp: now,
          };
          this.commandQueue.push(command);
          this.log("Execute", `Queued state command: devices=${command.devices.length}`, false, "INFO");
          if (!this.isProcessingQueue) {
            await this.processQueue();
          }
          stateChanged = true;
        }
      }

      const combinedData = {
        lights: this.properties.selectedDeviceIds
          .filter((id) => id)
          .map((id) => {
            const normalizedId = id.startsWith("ha_") ? id.slice(3) : id;
            const device = this.devices.find((d) => d.entity_id === normalizedId);
            const state = this.perDeviceState[normalizedId] || { state: "unknown", attributes: {} };
            const entityType = normalizedId.split(".")[0];
            let output = {
              light_id: normalizedId,
              name: this.properties.selectedDeviceNames[this.properties.selectedDeviceIds.indexOf(id)] || "Unknown",
              status: entityType === "media_player" ? (state.state !== "off" ? "On" : "Off") : state.state === "on" ? "On" : "Off",
              entity_type: entityType,
              attributes: state.attributes || {},
              power: state.attributes.power || null,
              energy: state.attributes.energy || null,
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
                const batterySensor = this.devices.find((d) => d.entity_id === `${normalizedId}_battery`);
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
      };

      this.setOutputData(0, combinedData);
      this.log("Execute", `Set combined output (slot 0): ${combinedData.lights.length} devices`, false, "INFO");

      this.properties.selectedDeviceIds.forEach((deviceId, index) => {
        if (!deviceId) return;
        try {
          const normalizedId = deviceId.startsWith("ha_") ? deviceId.slice(3) : deviceId;
          const device = this.devices.find((d) => d.entity_id === normalizedId);
          if (!device) {
            this.log("Execute", `Device not found for ID: ${normalizedId}`, true, "WARN");
            return;
          }
          const state = this.perDeviceState[normalizedId] || { state: "unknown", attributes: {} };
          if (!state) {
            this.log("Execute", `No state for device: ${normalizedId}`, true, "WARN");
            return;
          }
          const entityType = normalizedId.split(".")[0];
          const deviceData = {
            light_id: normalizedId,
            name: this.properties.selectedDeviceNames[index] || "Unknown",
            status: entityType === "media_player" ? (state.state !== "off" ? "On" : "Off") : state.state === "on" ? "On" : "Off",
            entity_type: entityType,
            attributes: state.attributes || {},
            power: state.attributes.power || null,
            energy: state.attributes.energy || null,
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
              const batterySensor = this.devices.find((d) => d.entity_id === `${normalizedId}_battery`);
              deviceData.battery = batterySensor ? deviceData.battery : state.attributes.battery || "Unknown";
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
          };

          const slotIndex = index + 1;
          if (slotIndex < this.outputs.length) {
            this.setOutputData(slotIndex, wrappedData);
            this.log("Execute", `Set output slot ${slotIndex} for Device ${index + 1}`, false, "INFO");
          }
        } catch (error) {
          this.log("Execute", `Error processing output for device ${deviceId}: ${error.message}`, true, "ERROR");
          this.updateStatus(`⚠️ Error setting output for device ${deviceId}`);
        }
      });

      if (stateChanged) this.setDirtyCanvasDebounced();
    };

    onRemoved = () => {
      if (this.hsvDebounceTimer) clearTimeout(this.hsvDebounceTimer);
      if (this.statusUpdateTimer) clearTimeout(this.statusUpdateTimer);
      if (this.dirtyCanvasTimer) clearTimeout(this.dirtyCanvasTimer);
      if (this.globalSocketUpdateTimer) clearTimeout(this.globalSocketUpdateTimer);
      if (this.socketUpdateTimers) {
        this.socketUpdateTimers.forEach((timer) => clearTimeout(timer));
        this.socketUpdateTimers.clear();
      }
      if (this.socket) this.socket.disconnect();
    };

    onRefreshDevices = () => {
      this.fetchDevices();
      this.log("refreshDevices", "Triggered device refresh", false);
    };
  }

  LiteGraph.registerNodeType("HomeAssistant/HAGenericDeviceNode", HAGenericDeviceNode);
  LiteGraph.registerType("light_info", "object");
}