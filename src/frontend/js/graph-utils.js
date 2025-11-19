// graph-utils.js - FULL VERSION WITH 401 FIX
// Access lastStates from socket-handler.js
window.lastStates = window.lastStates || {};

function logEvent(message, type = "general") {
  const logContent = document.querySelector("#log-panel .log-content");
  if (!logContent) {
    console.warn("Log panel not found yet:", message);
    return;
  }
  const logEntry = document.createElement("div");
  const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
  logEntry.textContent = `[${timestamp}] ${message}`;
  if (type === "error") logEntry.classList.add("health-critical");
  else if (type === "warning") logEntry.classList.add("health-borderline");
  else logEntry.classList.add("health-normal");
  if (logContent.children.length > 100) logContent.removeChild(logContent.firstChild);
  logContent.appendChild(logEntry);
  logContent.scrollTop = logContent.scrollHeight;
  updateHealthHUD({ type });
}

function togglePanel(panelId, subSectionId = null) {
  const panel = document.getElementById(panelId);
  if (!panel) {
    console.warn(`Panel ${panelId} not found`);
    logEvent(`Panel ${panelId} not found`, "error");
    return;
  }

  if (subSectionId) {
    const subSection = document.getElementById(subSectionId);
    if (!subSection) {
      console.warn(`Sub-section ${subSectionId} not found`);
      logEvent(`Sub-section ${subSectionId} not found`, "error");
      return;
    }
    const isExpanded = subSection.getAttribute("data-expanded") === "true";
    console.log(`Before toggle: ${subSectionId} data-expanded=${isExpanded}`);
    subSection.setAttribute("data-expanded", !isExpanded);
    const content = subSection.querySelector(".sub-content");
    if (content) {
      console.log(`Toggling ${subSectionId} to expanded=${!isExpanded}, current content styles: display=${content.style.display}, max-height=${content.style.maxHeight}, opacity=${content.style.opacity}`);
      content.style.transition = "max-height 0.3s ease, opacity 0.3s ease";
      if (!isExpanded) {
        content.style.display = "block";
        setTimeout(() => {
          content.style.maxHeight = "200px";
          content.style.opacity = "1";
          console.log(`Expanded ${subSectionId}, new content styles: display=${content.style.display}, max-height=${content.style.maxHeight}, opacity=${content.style.opacity}`);
        }, 10);
      } else {
        content.style.maxHeight = "0";
        content.style.opacity = "0";
        setTimeout(() => {
          content.style.display = "none";
          console.log(`Collapsed ${subSectionId}, new content styles: display=${content.style.display}, max-height=${content.style.maxHeight}, opacity=${content.style.opacity}`);
        }, 300);
      }
    } else {
      console.warn(`Sub-content for ${subSectionId} not found`);
      logEvent(`Sub-content for ${subSectionId} not found`, "error");
    }
  } else {
    const isExpanded = panel.getAttribute("data-expanded") === "true";
    panel.setAttribute("data-expanded", !isExpanded);
    console.log(`${panelId} toggled to expanded=${!isExpanded}`);
  }
}

const healthStats = {
  memoryUsed: 0,
  memoryTotal: 0,
  nodeCount: 0,
  linkCount: 0,
  fps: 0,
  activeRequests: 0,
  lastApiStatus: "N/A",
  execTime: 0,
  errorCount: 0,
  warningCount: 0,
  bufferSize: 0,
  connectionStatus: "Disconnected",
  lastFrameTime: performance.now()
};

function initHealthHUD(graph) {
  if (!graph) {
    console.error("Graph is undefined or null");
    return;
  }
  const combinedPanel = document.getElementById("combined-panel");
  if (!combinedPanel) {
    console.error("Combined panel not found");
    return;
  }
  const header = combinedPanel.querySelector(".panel-header");
  const forecastHeader = document.querySelector("#forecast-section .sub-header");
  const resourceHeader = document.querySelector("#resource-section .sub-header");
  const overviewHeader = document.querySelector("#overview-section .sub-header");
  const devicesHeader = document.querySelector("#devices-section .sub-header");

  if (header) header.addEventListener("click", () => togglePanel("combined-panel"));
  if (forecastHeader) forecastHeader.addEventListener("click", () => togglePanel("combined-panel", "forecast-section"));
  if (resourceHeader) resourceHeader.addEventListener("click", () => togglePanel("combined-panel", "resource-section"));
  if (overviewHeader) overviewHeader.addEventListener("click", () => togglePanel("combined-panel", "overview-section"));
  if (devicesHeader) {
    console.log("Adding click event listener to Devices Overview header");
    devicesHeader.addEventListener("click", () => {
      console.log("Devices Overview header clicked");
      togglePanel("combined-panel", "devices-section");
    });
  } else {
    console.error("Devices section header not found");
    logEvent("Devices section header not found", "error");
  }

  const resetBtn = document.querySelector("#reset-errors-btn");
  if (resetBtn) resetBtn.addEventListener("click", () => resetHealthStats());

  const syncBtn = document.querySelector("#sync-graph-btn");
  if (syncBtn) syncBtn.addEventListener("click", () => syncGraphState());

  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    healthStats.activeRequests++;
    updateHealthHUD();
    try {
      const response = await originalFetch.apply(this, args);
      healthStats.activeRequests--;
      healthStats.lastApiStatus = response.ok ? "OK" : "Failed";
      updateHealthHUD();
      return response;
    } catch (err) {
      healthStats.activeRequests--;
      healthStats.lastApiStatus = "Error";
      updateHealthHUD();
      throw err;
    }
  };

  let lastTick = performance.now();
  graph.onBeforeStep = () => {
    const start = performance.now();
    healthStats.execTime = start - lastTick;
    lastTick = start;
  };

  graph.onAfterStep = () => {
    const now = performance.now();
    healthStats.fps = Math.round(1000 / (now - healthStats.lastFrameTime));
    healthStats.lastFrameTime = now;
    updateHealthHUD({ graph });
  };

  updateHealthHUD({ graph });
}

function updateHealthHUD(data = {}) {
  const resourceSection = document.getElementById("resource-section");
  if (!resourceSection) {
    console.warn("updateHealthHUD: Resource section not found in DOM");
    return;
  }
  if (data.graph) {
    healthStats.nodeCount = data.graph._nodes ? data.graph._nodes.length : 0;
    healthStats.linkCount = data.graph._links ? Object.keys(data.graph._links).length : 0;
    healthStats.bufferSize = Object.keys(window.SenderNodeSharedBuffer || {}).length;
    healthStats.connectionStatus = LiteGraph.LGraphNode.prototype.sharedSocket?.connected ? "Connected" : "Disconnected";
  }
  if (data.type === "error") healthStats.errorCount++;
  if (data.type === "warning") healthStats.warningCount++;
  if ("memory" in performance) {
    healthStats.memoryUsed = (performance.memory.usedJSHeapSize / 1048576).toFixed(1);
    healthStats.memoryTotal = (performance.memory.totalJSHeapSize / 1048576).toFixed(1);
  } else {
    healthStats.memoryUsed = "N/A";
    healthStats.memoryTotal = "N/A";
    if (navigator.deviceMemory) {
      healthStats.memoryTotal = navigator.deviceMemory * 1024;
      healthStats.memoryUsed = "Est. " + (healthStats.memoryTotal * 0.5).toFixed(1);
    }
  }
  const memoryPercent = (typeof healthStats.memoryUsed === "number" && healthStats.memoryTotal > 0)
    ? (healthStats.memoryUsed / healthStats.memoryTotal) * 100 : 0;
  const isCritical = memoryPercent > 90 || healthStats.errorCount > 5 || healthStats.connectionStatus === "Disconnected";
  const isBorderline = (memoryPercent >= 70 && memoryPercent <= 90) || healthStats.errorCount > 0 || healthStats.warningCount > 5;
  const setHealthColor = (elementId, value) => {
    const el = resourceSection.querySelector(`#${elementId}`);
    if (el) {
      el.textContent = value;
      el.classList.remove("health-critical", "health-borderline", "health-normal");
      if (isCritical) {
        el.classList.add("health-critical");
      } else if (isBorderline) {
        el.classList.add("health-borderline");
      } else {
        el.classList.add("health-normal");
      }
    } else {
      console.warn(`Element #${elementId} not found`);
    }
  };
  setHealthColor("hud-memory", `${healthStats.memoryUsed}/${healthStats.memoryTotal} MB`);
  setHealthColor("hud-nodes", healthStats.nodeCount);
  setHealthColor("hud-links", healthStats.linkCount);
  setHealthColor("hud-fps", healthStats.fps);
  setHealthColor("hud-connection", healthStats.connectionStatus);
  setHealthColor("hud-exec", `${healthStats.execTime.toFixed(1)} ms`);
  setHealthColor("hud-errors", healthStats.errorCount);
  setHealthColor("hud-warnings", healthStats.warningCount);
  setHealthColor("hud-buffers", healthStats.bufferSize);
}

function resetHealthStats() {
  healthStats.errorCount = 0;
  healthStats.warningCount = 0;
  updateHealthHUD();
}

function syncGraphState() {
  const graph = window.graph;
  if (!graph) {
    console.error("Graph not found");
    logEvent("Graph not found for state sync", "error");
    return;
  }
  const socket = LiteGraph.LGraphNode.prototype.sharedSocket;
  if (!socket || !socket.connected) {
    console.error("Socket not connected");
    logEvent("Socket not connected, cannot sync state", "warning");
    return;
  }
  const intendedStates = {};
  const links = graph._links || {};
  graph._nodes.forEach(node => {
    let deviceType, deviceIdsProp;
    if (node.type === "Lighting/KasaLightControlNode" || node.type === "Power/KasaPlugControlNode") {
      deviceType = "kasa";
      deviceIdsProp = node.type === "Lighting/KasaLightControlNode" ? "selectedLightIds" : "selectedPlugIds";
    } else if (node.type === "Lighting/HueLightControlNode") {
      deviceType = "hue";
      deviceIdsProp = "selectedLightIds";
    } else {
      return;
    }
    const deviceIds = node.properties[deviceIdsProp] || [];
    if (!Array.isArray(deviceIds) || deviceIds.length === 0) {
      return;
    }
    let inputNodes = [];
    if (Object.keys(links).length > 0) {
      Object.values(links).forEach(link => {
        if (link.target_id === node.id && link.target_slot === 0) {
          const inputNode = graph._nodes.find(n => n.id === link.origin_id);
          if (inputNode) inputNodes.push(inputNode);
        }
      });
    }
    if (inputNodes.length === 0 && node.inputs) {
      node.inputs.forEach((input, slot) => {
        if (input.link) {
          graph._nodes.forEach(potentialInputNode => {
            if (potentialInputNode.outputs) {
              potentialInputNode.outputs.forEach((output, outputSlot) => {
                if (output.links && output.links.includes(input.link)) {
                  inputNodes.push(potentialInputNode);
                }
              });
            }
          });
        }
      });
    }
    let intendedState = null;
    let latestTimestamp = 0;
    inputNodes.forEach(inputNode => {
      let state = null;
      let timestamp = 0;
      if (inputNode.type === "Execution/pushbutton") {
        state = inputNode.properties?.state;
        timestamp = inputNode.lastTriggered || 0;
      } else if (inputNode.type === "Timers/sunrise_sunset_trigger") {
        state = inputNode.currentState;
        timestamp = inputNode.lastStateChange || 0;
      } else if (inputNode.type === "basic/const_boolean") {
        state = inputNode.getOutputData(0);
        timestamp = Infinity;
      }
      if (state !== null && state !== undefined && timestamp > latestTimestamp) {
        intendedState = state;
        latestTimestamp = timestamp;
      }
    });
    if (intendedState !== null && intendedState !== undefined) {
      deviceIds.forEach(deviceId => {
        const rawId = deviceId.startsWith('kasa_') ? deviceId.replace('kasa_', '') : deviceId;
        intendedStates[rawId] = { on: intendedState, type: deviceType };
      });
    }
  });
  Object.entries(intendedStates).forEach(([deviceId, intended]) => {
    const actualState = lastStates[`${intended.type}_${deviceId}`]?.on;
    if (actualState !== undefined && actualState !== intended.on) {
      const prefixedId = `${intended.type}_${deviceId}`;
      socket.emit("device-control", { id: prefixedId, on: intended.on });
      logEvent(`Correcting ${deviceId} to ${intended.on ? "ON" : "OFF"}`, "general");
    }
  });
  logEvent("Graph state sync completed", "general");
  toastr.success("Graph state synced successfully.");
}

function saveGraph(graph) {
  try {
    const graphData = JSON.stringify(graph.serialize());
    const blob = new Blob([graphData], { type: 'application/json' });
    const defaultFilename = `graph_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = defaultFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    logEvent("Graph saved successfully.");
    toastr.success("Graph saved successfully.");
  } catch (error) {
    logEvent(`Error saving graph: ${error.message}`, "error");
    toastr.error("Failed to save graph.");
  }
}

function loadGraphFromFile(graph, file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      console.log("Starting graph load from file:", file.name);
      const graphData = JSON.parse(e.target.result);
      graph.clear();
      graph.configure(graphData);
      graph.start();
      const socket = LiteGraph.LGraphNode.prototype.sharedSocket;
      graph._nodes.forEach(node => {
        if (node.connectToServer && typeof node.connectToServer === "function") {
          console.log(`Forcing connection for node ${node.type} (id: ${node.id})`);
          node.connectToServer();
        }
      });
      // Force Logic Overview to start collapsed
      const overviewSection = document.getElementById("overview-section");
      if (overviewSection) {
        overviewSection.setAttribute("data-expanded", "false");
        const content = overviewSection.querySelector(".sub-content");
        if (content) {
          content.style.display = "none";
          content.style.maxHeight = "0";
          content.style.opacity = "0";
          content.style.overflow = "hidden"; // Extra safety for scrollbar
          console.log("Forced Logic Overview to collapsed state after graph load");
        }
      }
      updateDevicesOverview(graph);
      updateLogicOverview(graph);
      logEvent("Graph loaded successfully from file.");
      toastr.success("Graph loaded successfully.");
    } catch (err) {
      console.error("Error loading graph:", err);
      logEvent(`Error loading graph from file: ${err.message}`, "error");
      toastr.error("Failed to load graph.");
    }
  };
  reader.onerror = (err) => {
    console.error("File reader error:", err);
    logEvent(`File read error: ${err.message}`, "error");
    toastr.error("Failed to load graph file.");
  };
  reader.readAsText(file);
}

function mergePreMadeGraph(graph, file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const preMadeGraphData = JSON.parse(e.target.result);
      const preMadeGraph = new LGraph();
      preMadeGraph.configure(preMadeGraphData);
      const offsetX = 200, offsetY = 200;
      const nodeIdMap = {};
      preMadeGraph._nodes.forEach(node => {
        if (!LiteGraph.node_types[node.type]) return;
        const newPos = [node.pos[0] + offsetX, node.pos[1] + offsetY];
        const newNode = LiteGraph.createNode(node.type);
        newNode.pos = newPos;
        graph.add(newNode);
        if (newNode && typeof newNode.configure === "function") {
          newNode.configure(node.properties || {});
        }
        nodeIdMap[node.id] = newNode;
      });
      if (preMadeGraph._links) {
        Object.values(preMadeGraph._links).forEach(link => {
          const originNode = nodeIdMap[link.origin_id];
          const targetNode = nodeIdMap[link.target_id];
          if (originNode && targetNode) {
            graph.connect(originNode.id, link.origin_slot, targetNode.id, link.target_slot);
          }
        });
      }
      logEvent("Pre-made graph merged successfully.");
      toastr.success("Pre-made graph imported successfully!");
    } catch (error) {
      console.error("Error merging pre-made graph:", error);
      logEvent(`Error merging pre-made graph: ${error.message}`, "error");
      toastr.error("Failed to import pre-made graph.");
    }
  };
  reader.readAsText(file);
}

function handleFileInput(graph, inputId, callback) {
  const input = document.getElementById(inputId);
  if (!input) {
    console.error(`Input element #${inputId} not found`);
    return;
  }
  input.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
      callback(graph, file);
      event.target.value = "";
    }
  });
}

function updateDateTimeDisplay() {
  const dateTimeDisplay = document.getElementById("dateTimeDisplay");
  if (!dateTimeDisplay) {
    console.warn("dateTimeDisplay element not found");
    return;
  }
  try {
    const now = new Date();
    const date = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const time = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    dateTimeDisplay.textContent = `${date} ${time}`;
  } catch (err) {
    console.error("Error updating dateTimeDisplay:", err);
  }
}

function updateLogicOverview(graph) {
  const summaryList = document.getElementById("overview-summary");
  const groupsList = document.getElementById("overview-groups");
  const overviewSection = document.getElementById("overview-section");
  if (!summaryList || !groupsList || !overviewSection) {
    console.warn("Logic Overview elements not found");
    return;
  }
  console.log("Updating Logic Overview, data-expanded=", overviewSection.getAttribute("data-expanded"));

  try {
    summaryList.innerHTML = "";
    groupsList.innerHTML = "";
    if (!graph || !graph._nodes) {
      console.warn("Graph or nodes not available for Logic Overview");
      const summaryItem = document.createElement("li");
      summaryItem.textContent = "No nodes available";
      summaryList.appendChild(summaryItem);
      return;
    }
    const nodeCount = graph._nodes.length;
    const linkCount = graph._links ? Object.keys(graph._links).length : 0;
    const summaryItems = [
      `Total Nodes: ${nodeCount}`,
      `Total Links: ${linkCount}`
    ];
    summaryItems.forEach(item => {
      const li = document.createElement("li");
      li.textContent = item;
      summaryList.appendChild(li);
    });
    const groups = {};
    graph._nodes.forEach(node => {
      const group = node.group || "Ungrouped";
      if (!groups[group]) groups[group] = 0;
      groups[group]++;
    });
    Object.entries(groups).forEach(([group, count]) => {
      const li = document.createElement("li");
      li.textContent = `${group}: ${count} nodes`;
      groupsList.appendChild(li);
    });
    console.log("Logic Overview updated, data-expanded unchanged=", overviewSection.getAttribute("data-expanded"));
  } catch (err) {
    console.error("Error updating Logic Overview:", err);
    logEvent(`Error updating Logic Overview: ${err.message}`, "error");
  }
}

function updateDevicesOverview(graph) {
  const devicesList = document.getElementById("devices-list");
  const filterCheckbox = document.getElementById("filter-on-devices");
  const devicesSection = document.getElementById("devices-section");
  if (!devicesList || !filterCheckbox || !devicesSection) {
    console.warn("Devices Overview elements not found");
    logEvent("Devices Overview elements not found", "error");
    return;
  }
  // Track previous states to detect changes
  const previousStates = new Map();
  // Store current states before updating
  document.querySelectorAll("#devices-list .device-item").forEach(item => {
    const name = item.querySelector("span:nth-child(2)").textContent.split(": ")[0];
    const state = item.dataset.state;
    previousStates.set(name, state);
  });
  try {
    devicesList.innerHTML = "";
    console.log("Updating Devices Overview, graph nodes:", graph?._nodes?.length || 0);
    console.log("Current lastStates:", lastStates);
    console.log("lastStates keys:", Object.keys(lastStates));
    // Force sub-content visibility based on data-expanded
    const isExpanded = devicesSection.getAttribute("data-expanded") === "true";
    const subContent = devicesSection.querySelector(".sub-content");
    if (subContent) {
      subContent.style.display = isExpanded ? "block" : "none";
      subContent.style.maxHeight = isExpanded ? "200px" : "0";
      subContent.style.opacity = isExpanded ? "1" : "0";
      console.log(`Forced sub-content for devices-section, display: ${subContent.style.display}, max-height: ${subContent.style.maxHeight}, opacity: ${subContent.style.opacity}`);
    } else {
      console.warn("Devices section sub-content not found");
      logEvent("Devices section sub-content not found", "error");
    }
    if (!graph || !graph._nodes) {
      console.warn("Graph or nodes not available for Devices Overview");
      const noDevices = document.createElement("div");
      noDevices.textContent = "No devices available";
      noDevices.classList.add("health-normal");
      devicesList.appendChild(noDevices);
      return;
    }
    const devices = [];
    // Include devices from graph nodes
    graph._nodes.forEach(node => {
      let deviceType, deviceIdsProp, deviceNamesProp, vendor;
      if (node.type === "Lighting/HueLightControlNode") {
        deviceType = "hue";
        deviceIdsProp = "selectedLightIds";
        deviceNamesProp = "selectedLightNames";
        vendor = "Hue";
      } else if (node.type === "Lighting/KasaLightControlNode") {
        deviceType = "kasa";
        deviceIdsProp = "selectedLightIds";
        deviceNamesProp = "selectedLightNames";
        vendor = "Kasa";
      } else if (node.type === "Power/KasaPlugControlNode") {
        deviceType = "kasa";
        deviceIdsProp = "selectedPlugIds";
        deviceNamesProp = "selectedPlugNames";
        vendor = "Kasa";
      } else {
        return; // Skip non-device nodes
      }
      console.log(`Processing node ${node.type} (ID: ${node.id}), properties:`, node.properties);
      const deviceIds = node.properties[deviceIdsProp] || [];
      const deviceNames = node.properties[deviceNamesProp] || [];
      if (!Array.isArray(deviceIds)) {
        console.warn(`Invalid ${deviceIdsProp} for node ${node.id}:`, deviceIds);
        return;
      }
      deviceIds.forEach((id, index) => {
        if (id === null || id === undefined) {
          console.warn(`Skipping null/undefined device ID at index ${index} for node ${node.id}`);
          return;
        }
        let stateObj = null;
        let lookupKey = null;
        lookupKey = `${deviceType}_${id}`;
        stateObj = lastStates[lookupKey];
        if (stateObj) {
          console.log(`Found stateObj for key ${lookupKey}:`, stateObj);
        }
        if (!stateObj) {
          lookupKey = id;
          stateObj = lastStates[lookupKey];
          if (stateObj) {
            console.log(`Found stateObj for key ${lookupKey}:`, stateObj);
          }
        }
        if (!stateObj) {
          const matchingKey = Object.keys(lastStates).find(key => key.includes(id));
          if (matchingKey) {
            lookupKey = matchingKey;
            stateObj = lastStates[matchingKey];
            console.log(`Found stateObj for key ${lookupKey} (via search):`, stateObj);
          }
        }
        if (!stateObj) {
          console.warn(`No stateObj found for ID ${id} (type: ${deviceType}) with lookups: ${deviceType}_${id}, ${id}`);
          stateObj = {};
        }
        const state = stateObj.on === null || stateObj.on === undefined ? "Unknown" : stateObj.on ? "On" : "Off";
        const name = stateObj.name || (deviceNames[index] || "Unknown Device");
        console.log(`Device ID: ${id}, Lookup Key: ${lookupKey || 'none'}, Type: ${deviceType}, Vendor: ${vendor}, Name: ${name}, State: ${state}, lastStates entry:`, stateObj);
        devices.push({
          id: id,
          type: deviceType,
          vendor: vendor,
          name: name,
          state: state
        });
      });
    });
    Object.keys(lastStates).forEach(id => {
      if (!devices.some(d => d.id === id || `${d.type}_${d.id}` === id)) {
        const stateObj = lastStates[id];
        const state = stateObj.on === null || stateObj.on === undefined ? "Unknown" : stateObj.on ? "On" : "Off";
        const vendor = stateObj.vendor || "Unknown";
        const name = stateObj.name || `Device ${id}`;
        devices.push({
          id: id,
          type: vendor.toLowerCase(),
          vendor: vendor,
          name: name,
          state: state
        });
      }
    });
    console.log("Devices found:", devices);
    if (devices.length === 0) {
      console.warn("No devices found");
      const noDevices = document.createElement("div");
      noDevices.textContent = "No devices found";
      noDevices.classList.add("health-normal");
      devicesList.appendChild(noDevices);
      return;
    }
    devices.sort((a, b) => a.name.localeCompare(b.name));
    devices.forEach(device => {
      const deviceItem = document.createElement("div");
      deviceItem.classList.add("device-item");
      deviceItem.dataset.state = device.state.toLowerCase();

      const iconSpan = document.createElement("span");
      iconSpan.classList.add("state-icon", `state-icon-${device.state.toLowerCase()}`);
      iconSpan.textContent = device.state === "On" ? "ON" : device.state === "Off" ? "OFF" : "UNKNOWN";
      iconSpan.setAttribute("data-fallback", device.state === "On" ? "(on)" : device.state === "Off" ? "(off)" : "(?)");

      const textSpan = document.createElement("span");
      textSpan.textContent = `${device.name}: ${device.state}`;

      deviceItem.appendChild(iconSpan);
      deviceItem.appendChild(textSpan);
      devicesList.appendChild(deviceItem);
      // Log only if the state has changed
      const previousState = previousStates.get(device.name);
      if (previousState !== undefined && previousState !== device.state.toLowerCase()) {
        console.log(`Updated device state: ${device.name}, state=${device.state}, icon=state-icon-${device.state.toLowerCase()}`);
      }
    });
    const applyFilter = () => {
      const showOnlyOn = filterCheckbox.checked;
      console.log("Applying filter, showOnlyOn:", showOnlyOn);
      document.querySelectorAll("#devices-list .device-item").forEach(item => {
        item.style.display = showOnlyOn && item.dataset.state !== "on" ? "none" : "block";
      });
    };
    applyFilter();
    filterCheckbox.removeEventListener("change", applyFilter);
    filterCheckbox.addEventListener("change", applyFilter);
    console.log("Devices Overview updated successfully");
  } catch (err) {
    console.error("Error updating Devices Overview:", err);
    logEvent(`Error updating Devices Overview: ${err.message}`, "error");
  }
}

function updateEventsList() {
  const eventsList = document.getElementById("events-list");
  if (!eventsList) {
    console.error("Events list container not found!");
    return;
  }
  const graph = window.graph;
  const events = EventScheduler.getScheduledEvents();
  eventsList.innerHTML = "";
  if (!graph || !graph._nodes || graph._nodes.length === 0) {
    const noEvents = document.createElement("div");
    noEvents.textContent = "No nodes in graph.";
    eventsList.appendChild(noEvents);
    return;
  }
  const activeNodeIds = new Set(graph._nodes.map(node => node.id.toString()));
  const activeEvents = events.filter(event => {
    const baseNodeId = event.nodeId.split("_")[0];
    return activeNodeIds.has(baseNodeId);
  });
  if (activeEvents.length === 0) {
    const noEvents = document.createElement("div");
    noEvents.textContent = "No scheduled events for active nodes.";
    eventsList.appendChild(noEvents);
    return;
  }
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  activeEvents.forEach(event => {
    const eventItem = document.createElement("div");

    const description = event.description || "Unnamed Event";
    const time = new Date(event.time).toLocaleTimeString('en-US', { hour12: true });
    const parts = description.split(" - ");
    const title = parts[0];
    const command = parts[1] || "Unknown";
    const eventDate = new Date(event.time);
    const eventDayStart = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
    const isTomorrow = eventDayStart > today;
    const timeText = `${time}${isTomorrow ? " tomorrow" : ""}`;
    const titleSpan = document.createElement("span");
    titleSpan.textContent = `${title} - `;
    titleSpan.classList.add("health-normal");
    const commandSpan = document.createElement("span");
    commandSpan.textContent = `${command} ${timeText}`;
    commandSpan.className = `event-${command.toLowerCase()}`;
    eventItem.appendChild(titleSpan);
    eventItem.appendChild(commandSpan);
    eventsList.appendChild(eventItem);
  });
}

function refreshEventsPanel() {
  console.log("Manually refreshing events panel...");
  updateEventsList();
}

function setupControls(graph) {
  console.log("setupControls called with graph:", graph);
  console.log("Graph nodes:", graph._nodes ? graph._nodes.length : "No nodes");

  const saveGraphBtn = document.getElementById("saveGraphBtn");
  const loadGraphBtn = document.getElementById("loadGraphBtn");
  const importCustomGraphBtn = document.getElementById("importCustomGraphBtn");
  const fileInput = document.getElementById("fileInput");

  if (!saveGraphBtn) console.error("saveGraphBtn not found");
  if (!loadGraphBtn) console.error("loadGraphBtn not found");
  if (!importCustomGraphBtn) console.error("importCustomGraphBtn not found");
  if (!fileInput) console.error("fileInput not found");

  if (saveGraphBtn) saveGraphBtn.addEventListener("click", () => saveGraph(graph));
  if (loadGraphBtn) loadGraphBtn.addEventListener("click", () => {
    if (fileInput) {
      fileInput.dataset.action = "load";
      fileInput.click();
    }
  });
  if (importCustomGraphBtn) importCustomGraphBtn.addEventListener("click", () => {
    if (fileInput) {
      fileInput.dataset.action = "import";
      fileInput.click();
    }
  });

  if (fileInput) {
    fileInput.addEventListener("change", (event) => {
      const file = event.target.files[0];
      if (file) {
        if (event.target.dataset.action === "load") {
          loadGraphFromFile(graph, file);
        } else {
          mergePreMadeGraph(graph, file);
        }
      }
    });
  }

  window.graph = graph;
  if (graph) {
    graph.start();
    console.log("Graph started in setupControls");
  } else {
    console.error("Graph is undefined in setupControls");
  }

  initHealthHUD(graph);

  // Initialize all sub-section headers
  const combinedPanel = document.getElementById("combined-panel");
  if (!combinedPanel) {
    console.error("Combined panel not found in DOM");
    logEvent("Combined panel not found in DOM", "error");
  } else {
    console.log("Combined panel found in DOM");
    const panelHeader = combinedPanel.querySelector(".panel-header");
    if (panelHeader) {
      panelHeader.addEventListener("click", () => togglePanel("combined-panel"));
      console.log("Added click event listener to combined panel header");
    }
  }

  const subSections = [
    { id: "forecast-section", name: "Forecast" },
    { id: "overview-section", name: "Logic Overview" },
    { id: "devices-section", name: "Devices Overview" },
    { id: "resource-section", name: "Resource HUD" }
  ];

  subSections.forEach(section => {
    const subSection = document.getElementById(section.id);
    if (!subSection) {
      console.error(`${section.name} section not found in DOM`);
      logEvent(`${section.name} section not found in DOM`, "error");
      return;
    }
    const subHeader = subSection.querySelector(".sub-header");
    if (subHeader) {
      // Clear existing listeners by replacing the element
      const newHeader = subHeader.cloneNode(true);
      subHeader.parentNode.replaceChild(newHeader, subHeader);
      console.log(`Adding click event listener to ${section.name} header`);
      newHeader.addEventListener("click", (event) => {
        event.stopPropagation(); // Prevent bubbling to scrollbar
        event.preventDefault(); // Prevent default behavior
        console.log(`${section.name} header clicked, current data-expanded=${subSection.getAttribute("data-expanded")}`);
        if (section.id === "overview-section") {
          const content = subSection.querySelector(".sub-content");
          console.log(`LOGIC OVERVIEW BUTTON CLICKED: data-expanded=${subSection.getAttribute("data-expanded")}, content styles: display=${content?.style.display}, max-height=${content?.style.maxHeight}, opacity=${content?.style.opacity}`);
        }
        togglePanel("combined-panel", section.id);
        console.log(`${section.name} after toggle, data-expanded=${subSection.getAttribute("data-expanded")}`);
      }, { once: false }); // Ensure single listener
    } else {
      console.error(`${section.name} section header not found`);
      logEvent(`${section.name} section header not found`, "error");
    }
  });

  updateEventsList();
  setInterval(updateEventsList, 5000);
  updateDateTimeDisplay();
  setInterval(updateDateTimeDisplay, 1000);
  updateLogicOverview(graph);
  updateDevicesOverview(graph);

  // Update Devices Overview on graph changes
  graph.onNodeAdded = () => {
    console.log("Node added, updating Devices Overview");
    updateDevicesOverview(graph);
    updateLogicOverview(graph);
  };
  graph.onNodeRemoved = () => {
    console.log("Node removed, updating Devices Overview");
    updateDevicesOverview(graph);
    updateLogicOverview(graph);
  };
  graph.onConnectionChange = () => {
    console.log("Connection changed, updating Devices Overview");
    updateDevicesOverview(graph);
    updateLogicOverview(graph);
  };

  // Periodic polling for Devices Overview updates
  setInterval(() => {
    if (window.graph && window.lastStates) {
      console.log("Polling lastStates:", window.lastStates);
      updateDevicesOverview(window.graph);
      console.log("Devices Overview refreshed via periodic polling");
    }
  }, 5000);

  console.log("setupControls completed.");
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { initHealthHUD, updateHealthHUD, setupControls, refreshEventsPanel, updateDevicesOverview };
} else {
  window.updateDevicesOverview = updateDevicesOverview;
  window.refreshEventsPanel = refreshEventsPanel;
}