if (!LiteGraph.registered_node_types?.["Audio/HADenonAVRControlNode"]) {
  class HADenonAVRControlNode extends LiteGraph.LGraphNode {
    constructor() {
      super();
      Object.assign(this, {
        title: "Home Assistant Denon AVR Control",
        resizable: true,
        autosize: false,
        bgcolor: "rgb(100, 80, 160)",
        properties: {
          selectedAvrEntity: null,
          selectedAvrName: "Select AVR",
          status: "No action yet",
          isCollapsed: false,
          maxRetries: 3,
          debug: true,
          volumeLevel: 0.1
        },
        HA_API_URL: "http://localhost:3000",
        avrEntities: [],
        deviceManagerReady: false,
        avrState: { power: "OFF", volume: 0, source: null, soundMode: null },
        commandQueue: [],
        isProcessingQueue: false,
        lastCommandTimestamp: 0,
        EXTERNAL_CHANGE_THRESHOLD: 5000,
        VOLUME_DEBOUNCE_DELAY: 300, // New: Debounce for volume changes
        volumeDebounceTimer: null, // New: Timer for volume debouncing
        isConfigured: false,
        commandRetryCounts: new Map(),
        lastTriggerInput: null,
        lastVolumeInput: null,
        lastSourceInput: null
      });
      this.addInput("Trigger", "boolean");
      this.addInput("Volume", "number");
      this.addInput("Source", "string");
      this.addOutput("AVR Info", "avr_info");
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
        console.log(`HADenonAVRControlNode - ${message}`); // Updated: Un-comment for consistency
        this.lastLogged[key] = { time: now, message };
      }
    };

    setupWidgets = () => {
      try {
        const widgetWidth = this.size[0] - 20;
        const widgets = [
          {
            type: "combo",
            name: "Select AVR",
            value: this.properties.selectedAvrName,
            callback: (v) => this.onAvrSelected(v),
            options: { values: ["Select AVR", ...this.getAvrOptions()], width: widgetWidth - 100 }
          },
          {
            type: "combo",
            name: "Source",
            value: this.avrState.source || "Select Source",
            callback: (v) => this.onSourceSelected(v),
            options: { values: ["Select Source"], width: widgetWidth - 100 }
          },
          {
            type: "number",
            name: "Volume",
            value: this.properties.volumeLevel,
            callback: (v) => {
              this.properties.volumeLevel = Math.max(0, Math.min(1, v));
              this.queueVolumeUpdate(this.properties.volumeLevel); // Updated: Use debounced volume update
            },
            options: { min: 0, max: 1, step: 0.01, width: 100 }
          },
          {
            type: "button",
            name: "🔄",
            value: "Refresh AVRs",
            callback: () => this.fetchAvrEntities(), // New: Refresh button
            options: { width: 40 }
          },
          {
            type: "toggle",
            name: "Debug Logs",
            value: this.properties.debug,
            callback: (v) => {
              this.properties.debug = v;
              this.log("debugToggle", `Debug logging ${v ? "enabled" : "disabled"}`, true);
            },
            options: { width: 100 }
          },
          {
            type: "button",
            name: "▼",
            value: "Collapse",
            callback: () => this.toggleCollapse(),
            options: { width: 40 }
          },
          {
            type: "text",
            name: "Status",
            value: this.properties.status,
            options: { property: "status", readonly: true, width: widgetWidth - 200 }
          }
        ];
        this.widgets = widgets.map(({ type, name, value, callback, options }) =>
          this.addWidget(type, name, value, callback, options)
        );
        this.statusWidget = this.widgets.find((w) => w.name === "Status");
        this.sourceWidget = this.widgets.find((w) => w.name === "Source");
        this.collapseButton = this.widgets.find((w) => w.name === "▼");
      } catch (error) {
        this.log("setupWidgetsError", `Error setting up widgets: ${error.message}`, true);
        this.updateStatus(`⚠️ Error setting up widgets: ${error.message}`);
      }
    };

    getAvrOptions = () => {
      return this.deviceManagerReady && this.avrEntities.length
        ? this.avrEntities.map((e) => e.name || e.entity_id)
        : ["No AVRs Found"];
    };

    onAvrSelected = async (value) => {
      if (value === "Select AVR" || value === "No AVRs Found") {
        this.properties.selectedAvrEntity = null;
        this.properties.selectedAvrName = "Select AVR";
        this.avrState = { power: "OFF", volume: 0, source: null, soundMode: null };
        this.updateSourceOptions();
        this.updateNodeSize();
        this.setDirtyCanvas(true);
        this.updateStatus("✅ AVR deselected.");
        this.log("avrSelected", "Deselected AVR", true);
        return;
      }
      if (!this.deviceManagerReady) await this.fetchAvrEntities();
      const entity = this.avrEntities.find((e) => (e.name || e.entity_id) === value);
      if (!entity) {
        this.updateStatus(`⚠️ AVR "${value}" not found.`);
        this.log("avrSelectedWarn", `No entity found for name: ${value}`, true);
        return;
      }
      this.properties.selectedAvrEntity = entity.entity_id;
      this.properties.selectedAvrName = value;
      await this.fetchAvrState();
      this.updateSourceOptions();
      this.updateNodeSize();
      this.setDirtyCanvas(true);
      this.updateStatus(`✅ Selected AVR "${value}".`);
      this.log("avrSelected", `Selected AVR "${value}" (${entity.entity_id})`, true);
    };

    onSourceSelected = async (value) => {
      if (value === "Select Source" || !this.properties.selectedAvrEntity) return;
      const entity = this.avrEntities.find((e) => e.entity_id === this.properties.selectedAvrEntity);
      const validSources = entity?.state.source_list || [];
      if (!validSources.includes(value)) {
        this.updateStatus(`⚠️ Invalid source "${value}" for AVR.`);
        this.log("sourceSelectedWarn", `Invalid source "${value}"`, true);
        return;
      }
      const command = {
        entity_id: this.properties.selectedAvrEntity,
        service: "media_player.select_source",
        data: { source: value },
        timestamp: Date.now()
      };
      this.commandQueue.push(command);
      this.log("sourceSelected", `Queued source change to "${value}"`, true);
      if (!this.isProcessingQueue) await this.processQueue();
    };

    queueVolumeUpdate = (volume) => {
      // New: Debounce volume updates
      if (this.volumeDebounceTimer) clearTimeout(this.volumeDebounceTimer);
      this.volumeDebounceTimer = setTimeout(async () => {
        await this.updateAvrState({ volume });
        this.volumeDebounceTimer = null;
      }, this.VOLUME_DEBOUNCE_DELAY);
    };

    initializeSocketIO = () => {
      this.socket = io(this.HA_API_URL, {
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 10000
      });
      this.socket.on("connect", () => {
        this.log("socketConnect", "Socket.IO connected", true);
        this.updateStatus("✅ Connected to server.");
        this.fetchAvrEntities();
      });
      this.socket.on("connect_error", (err) => {
        this.log("socketConnectError", `Socket.IO connection error: ${err.message}`, true);
        this.updateStatus(`⚠️ Connection error: ${err.message}`);
      });
      this.socket.on("disconnect", () => {
        this.log("socketDisconnect", "Socket.IO disconnected", true);
        this.updateStatus("⚠️ Disconnected from server.");
      });
      this.socket.on("device-state-update", (data) => this.handleStateUpdate(data));
    };

    fetchAvrEntities = async () => {
      try {
        const response = await fetch(`${this.HA_API_URL}/api/lights/ha/`, {
          signal: AbortSignal.timeout(10000)
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        const data = await response.json();
        this.log("fetchAvrEntitiesDebug", `Raw API response: ${JSON.stringify(data, null, 2)}`, true);
        if (data.success && data.devices) {
          this.avrEntities = data.devices
            .filter((d) => d.id.startsWith('ha_media_player.') || d.type === 'media_player')
            .map((d) => ({
              entity_id: d.id.replace('ha_', ''),
              name: d.name,
              state: d.state
            }));
          this.deviceManagerReady = true;
          this.updateStatus("✅ AVR entities fetched successfully.");
          this.log("fetchAvrEntities", `Found ${this.avrEntities.length} AVR entities: ${JSON.stringify(this.avrEntities, null, 2)}`, true);
          const avrWidget = this.widgets.find((w) => w.name === "Select AVR");
          if (avrWidget) {
            avrWidget.options.values = ["Select AVR", ...this.getAvrOptions()];
            if (!this.getAvrOptions().includes(avrWidget.value)) {
              avrWidget.value = "Select AVR";
            }
          }
          if (this.properties.selectedAvrEntity) await this.fetchAvrState();
        } else {
          throw new Error(data.error || "No devices returned");
        }
      } catch (error) {
        this.log("fetchAvrEntitiesError", `Error fetching AVR entities: ${error.message}`, true);
        this.updateStatus(`⚠️ Error fetching AVR entities: ${error.message}`);
      }
    };

    fetchAvrState = async () => {
      if (!this.properties.selectedAvrEntity) return false;
      for (let attempt = 0; attempt < this.properties.maxRetries; attempt++) {
        try {
          const response = await fetch(
            `${this.HA_API_URL}/api/lights/ha/ha_${encodeURIComponent(this.properties.selectedAvrEntity)}/state`,
            { signal: AbortSignal.timeout(5000) }
          );
          if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          const data = await response.json();
          this.log("fetchAvrStateDebug", `Raw state response: ${JSON.stringify(data, null, 2)}`, true);
          if (data.success && data.state) {
            this.avrState = {
              power: data.state.state === "off" ? "OFF" : "ON",
              volume: data.state.volume_level || 0,
              source: data.state.source || null,
              soundMode: data.state.sound_mode || null
            };
            this.updateSourceOptions();
            this.updateStatus(
              `✅ AVR "${this.properties.selectedAvrName}" is ${this.avrState.power}, Volume: ${(this.avrState.volume * 100).toFixed(0)}%`
            );
            this.setDirtyCanvas(true);
            this.log(
              "fetchAvrState",
              `Fetched state for "${this.properties.selectedAvrName}": power=${this.avrState.power}, volume=${this.avrState.volume}, source=${this.avrState.source}`,
              true
            );
            return true;
          }
          throw new Error(data.error || "No state returned");
        } catch (error) {
          this.log(
            "fetchAvrStateError",
            `Error fetching state for AVR ha_${this.properties.selectedAvrEntity} (attempt ${attempt + 1}): ${error.message}`,
            true
          );
          if (attempt === this.properties.maxRetries - 1) {
            this.updateStatus(`⚠️ Error fetching AVR state: ${error.message}`);
            return false;
          }
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
      return false;
    };

    updateSourceOptions = () => {
      if (!this.sourceWidget || !this.properties.selectedAvrEntity) return;
      const entity = this.avrEntities.find((e) => e.entity_id === this.properties.selectedAvrEntity);
      const sources = entity?.state.source_list || ["Select Source"];
      this.sourceWidget.options.values = ["Select Source", ...sources];
      this.sourceWidget.value = this.avrState.source || "Select Source";
      this.setDirtyCanvas(true);
    };

    updateAvrState = async (update) => {
      if (!this.properties.selectedAvrEntity) {
        this.log("updateAvrStateWarn", "No AVR selected", true);
        return false;
      }
      let service;
      const data = {};
      if (update.power !== undefined) {
        service = update.power ? "media_player.turn_on" : "media_player.turn_off";
      } else if (update.volume !== undefined) {
        service = "media_player.volume_set";
        data.volume_level = Math.max(0, Math.min(1, update.volume));
      } else {
        this.log("updateAvrStateWarn", "No valid update provided", true);
        return false;
      }
      const command = {
        entity_id: this.properties.selectedAvrEntity,
        service,
        data,
        timestamp: Date.now()
      };
      this.commandQueue.push(command);
      this.log(
        "updateAvrState",
        `Queued update: service=${command.service}, data=${JSON.stringify(command.data)}`,
        true
      );
      if (!this.isProcessingQueue) await this.processQueue();
      return true;
    };

    handleStateUpdate = async (data) => {
      if (data.id !== `ha_${this.properties.selectedAvrEntity}`) return;
      this.avrState = {
        power: data.state === "off" ? "OFF" : "ON",
        volume: data.volume_level || 0,
        source: data.source || null,
        soundMode: data.sound_mode || null
      };
      this.updateSourceOptions();
      this.updateStatus(
        `✅ External update: "${this.properties.selectedAvrName}" is ${this.avrState.power}, Volume: ${(this.avrState.volume * 100).toFixed(0)}%`
      );
      this.setDirtyCanvas(true);
      this.log(
        "handleStateUpdate",
        `Applied external state for ${this.properties.selectedAvrName}: power=${this.avrState.power}, volume=${this.avrState.volume}, source=${this.avrState.source}`,
        true
      );
    };

    processQueue = async () => {
      if (this.isProcessingQueue || !this.commandQueue.length) return true;
      this.isProcessingQueue = true;
      const command = this.commandQueue.shift();
      const { entity_id, service, data, timestamp } = command;
      const commandId = `${timestamp}-${entity_id}`;
      this.commandRetryCounts.set(commandId, (this.commandRetryCounts.get(commandId) || 0) + 1);
      this.log(
        "processQueue",
        `Processing command ${commandId}: service=${service}, data=${JSON.stringify(data)}`,
        true
      );
      let success = false;

      for (let attempt = 0; attempt < this.properties.maxRetries; attempt++) {
        try {
          this.log(
            "processQueue",
            `Sending command for ${entity_id}: ${JSON.stringify({ service, data })} (attempt ${attempt + 1})`,
            true
          );
          const response = await fetch(`${this.HA_API_URL}/api/services/${service.replace(".", "/")}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ entity_id: `media_player.${entity_id}`, ...data })
          });
          const result = await response.json();
          this.log(
            "processQueueResponse",
            `Response for ${entity_id}: status=${response.status}, body=${JSON.stringify(result, null, 2)}`,
            true
          );
          if (!response.ok) throw new Error(`HTTP ${response.status}: ${result.message || response.statusText}`);
          await new Promise((resolve) => setTimeout(resolve, 1000));
          await this.fetchAvrState();
          const expectedPower = service.includes("turn_on") ? "ON" : service.includes("turn_off") ? "OFF" : this.avrState.power;
          const expectedVolume = data.volume_level !== undefined ? data.volume_level : this.avrState.volume;
          const expectedSource = data.source || this.avrState.source;
          if (
            this.avrState.power === expectedPower &&
            (expectedVolume === this.avrState.volume || Math.abs(this.avrState.volume - expectedVolume) < 0.05) &&
            (expectedSource === this.avrState.source || !data.source)
          ) {
            success = true;
            this.updateStatus(
              `✅ Updated AVR "${this.properties.selectedAvrName}" to ${this.avrState.power}, Volume: ${(this.avrState.volume * 100).toFixed(0)}%`
            );
            this.setDirtyCanvas(true);
            this.log("processQueueSuccess", `Successfully updated ${entity_id}`, true);
            break;
          } else {
            this.log(
              "processQueueWarn",
              `State mismatch for ${entity_id}: expected power=${expectedPower}, volume=${expectedVolume}, source=${expectedSource}, got power=${this.avrState.power}, volume=${this.avrState.volume}, source=${this.avrState.source}`,
              true
            );
          }
        } catch (error) {
          this.log(
            "processQueueError",
            `Attempt ${attempt + 1} failed for ${entity_id}: ${error.message}`,
            true
          );
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      if (!success && this.commandRetryCounts.get(commandId) <= this.properties.maxRetries) {
        this.commandQueue.push(command);
        this.log(
          "processQueue",
          `Re-queued command ${commandId} (retry ${this.commandRetryCounts.get(commandId)}/${this.properties.maxRetries})`,
          true
        );
      } else if (!success) {
        this.updateStatus(`⚠️ Failed to update AVR after ${this.properties.maxRetries} retries`);
        this.commandRetryCounts.delete(commandId);
      } else {
        this.commandRetryCounts.delete(commandId);
      }

      this.lastCommandTimestamp = Date.now();
      this.isProcessingQueue = false;
      if (this.commandQueue.length) await this.processQueue();
      return success;
    };

    updateNodeSize = () => {
      this.size[0] = 400;
      const baseHeight = 40;
      let widgetsHeight = this.widgets.reduce(
        (sum, w) => sum + (w.computeSize?.(this.size[0])[1] ?? LiteGraph.NODE_WIDGET_HEIGHT),
        0
      );
      widgetsHeight += 15;
      this.size[1] = baseHeight + widgetsHeight + 80; // Updated: Increased padding for overlay
      this.setSize([this.size[0], this.size[1]]);
      this.widgets.forEach((w) => {
        w.options.width =
          w.name === "Status" ? this.size[0] - 200 :
          w.name === "Select AVR" ? this.size[0] - 100 :
          w.name === "Source" ? this.size[0] - 100 :
          w.name === "Volume" ? 100 :
          w.name === "Debug Logs" ? 100 : 40;
      });
      this.setDirtyCanvas(true);
    };

    updateStatus = (message = null) => {
      const status = message ?? `✅ AVR "${this.properties.selectedAvrName}" is ${this.avrState.power}, Volume: ${(this.avrState.volume * 100).toFixed(0)}%`;
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

    onExecute = async () => {
      if (!this.isConfigured) {
        this.updateStatus("⚠️ Node is still configuring...");
        return;
      }
      try {
        if (!this.deviceManagerReady) await this.fetchAvrEntities();
        const now = Date.now();
        let stateChanged = false;
        if (!this.lastStateRefresh || now - this.lastStateRefresh > 10000) {
          if (this.properties.selectedAvrEntity && (await this.fetchAvrState())) {
            stateChanged = true;
          }
          this.lastStateRefresh = now;
        }
        const triggerInput = this.getInputData(0);
        const volumeInput = this.getInputData(1);
        const sourceInput = this.getInputData(2);
        if (triggerInput !== undefined && triggerInput !== this.lastTriggerInput) {
          this.lastTriggerInput = triggerInput;
          await this.updateAvrState({ power: triggerInput });
          stateChanged = true;
        }
        if (volumeInput !== undefined && volumeInput !== this.lastVolumeInput) {
          const clampedVolume = Math.max(0, Math.min(1, volumeInput));
          this.lastVolumeInput = volumeInput;
          this.queueVolumeUpdate(clampedVolume); // Updated: Use debounced volume update
          stateChanged = true;
        }
        if (sourceInput && sourceInput !== this.lastSourceInput) {
          const entity = this.avrEntities.find((e) => e.entity_id === this.properties.selectedAvrEntity);
          const validSources = entity?.state.source_list || [];
          if (validSources.includes(sourceInput)) {
            this.lastSourceInput = sourceInput;
            await this.onSourceSelected(sourceInput);
            stateChanged = true;
          } else {
            this.updateStatus(`⚠️ Invalid source input "${sourceInput}"`);
            this.log("sourceInputWarn", `Invalid source input "${sourceInput}"`, true);
          }
        }
        if (stateChanged) this.updateStatus();
        const avrData = {
          entity_id: this.properties.selectedAvrEntity,
          name: this.properties.selectedAvrName,
          power: this.avrState.power,
          volume: this.avrState.volume,
          source: this.avrState.source,
          soundMode: this.avrState.soundMode,
          status: this.properties.status
        };
        this.setOutputData(0, avrData);
        if (stateChanged) this.setDirtyCanvas(true);
      } catch (error) {
        this.log("onExecuteError", `Error during execution: ${error.message}`, true);
        this.updateStatus(`⚠️ Execution failed: ${error.message}`);
      }
    };

    onDrawForeground = (ctx) => {
      // New: Visual overlay for AVR state
      if (super.onDrawForeground) super.onDrawForeground(ctx);
      if (this.properties.isCollapsed) return;
      let widgetsHeight = this.widgets.reduce(
        (sum, w) => sum + (w.computeSize?.(this.size[0])[1] ?? LiteGraph.NODE_WIDGET_HEIGHT),
        0
      );
      widgetsHeight += 15;
      const overlayStartY = widgetsHeight + 95;

      if (this.properties.selectedAvrEntity) {
        const yPosition = overlayStartY;
        const name = this.properties.selectedAvrName;
        const state = this.avrState;

        // Draw AVR name
        ctx.fillStyle = "#E0E0E0";
        ctx.font = "14px Roboto, Arial, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(name, 10, yPosition);

        // Draw power indicator
        const stateX = this.size[0] - 100;
        ctx.fillStyle = state.power === "ON" ? "#00FF00" : "#FF0000";
        ctx.beginPath();
        ctx.arc(stateX, yPosition - 5, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 1;
        ctx.stroke();

        // Draw volume bar
        const meterX = stateX + 15;
        const meterWidth = 60;
        const meterHeight = 20;
        const volumePercent = Math.min(1, Math.max(0, state.volume));
        ctx.fillStyle = "#4CAF50";
        ctx.fillRect(meterX, yPosition - 15, meterWidth * volumePercent, meterHeight);
        ctx.strokeStyle = "#FFFFFF";
        ctx.strokeRect(meterX, yPosition - 15, meterWidth, meterHeight);
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "10px Roboto, Arial, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`${Math.round(volumePercent * 100)}%`, meterX + meterWidth / 2, yPosition - 2);

        // Draw source text
        ctx.fillStyle = "#E0E0E0";
        ctx.font = "12px Roboto, Arial, sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(state.source || "No Source", this.size[0] - 20, yPosition + 20);
      }
    };

    serialize = () => {
      const deepCopy = (obj) => JSON.parse(JSON.stringify(obj));
      return {
        ...super.serialize(),
        version: "1.3", // Updated: Increment version
        properties: deepCopy(this.properties),
        avrState: deepCopy(this.avrState),
        commandQueue: deepCopy(this.commandQueue),
        lastCommandTimestamp: this.lastCommandTimestamp,
        lastStateRefresh: this.lastStateRefresh,
        lastLogged: deepCopy(this.lastLogged),
        lastTriggerInput: this.lastTriggerInput,
        lastVolumeInput: this.lastVolumeInput,
        lastSourceInput: this.lastSourceInput,
        commandRetryCounts: Object.fromEntries(this.commandRetryCounts)
      };
    };

    configure = async (data) => {
      super.configure(data);
      const version = data.version || "1.0";
      this.properties = {
        selectedAvrEntity: data.properties?.selectedAvrEntity || null,
        selectedAvrName: data.properties?.selectedAvrName || "Select AVR",
        status: data.properties?.status || "No action yet",
        isCollapsed: data.properties?.isCollapsed || false,
        maxRetries: data.properties?.maxRetries || 3,
        debug: data.properties?.debug || true,
        volumeLevel: data.properties?.volumeLevel || 0.1
      };
      this.avrState = data.avrState || { power: "OFF", volume: 0, source: null, soundMode: null };
      this.commandQueue = [];
      this.commandRetryCounts = new Map(Object.entries(data.commandRetryCounts || {}));
      this.lastCommandTimestamp = data.lastCommandTimestamp || 0;
      this.lastStateRefresh = data.lastStateRefresh || 0;
      this.lastLogged = data.lastLogged || {};
      this.lastTriggerInput = data.lastTriggerInput ?? null;
      this.lastVolumeInput = data.lastVolumeInput ?? null;
      this.lastSourceInput = data.lastSourceInput ?? null;
      this.widgets = [];
      if (this.socket) {
        this.socket.disconnect();
        this.socket = null;
      }
      this.setupWidgets();
      this.initializeSocketIO();
      try {
        await this.fetchAvrEntities();
        if (this.properties.selectedAvrEntity) {
          await this.fetchAvrState();
          this.updateSourceOptions();
        }
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
      if (this.volumeDebounceTimer) clearTimeout(this.volumeDebounceTimer);
      if (this.socket) this.socket.disconnect();
    };
  }
  LiteGraph.registerNodeType("Audio/HADenonAVRControlNode", HADenonAVRControlNode);
}