// C:\X_T2_AutoTron3.0\src\frontend\js\main.js - Main Frontend Initialization
console.log("js/main.js script loaded");

document.addEventListener("DOMContentLoaded", () => {
    console.log("DOMContentLoaded fired in js/main.js");
    window.DateTime = luxon.DateTime;

    // Clear EventScheduler on load to start fresh
    window.EventScheduler.clear();
    console.log("EventScheduler cleared on startup");

    const canvas = document.getElementById("graphcanvas");
    if (!canvas) {
        console.error("Canvas element not found!");
        logEvent("Canvas element not found!", "error");
        return;
    }
    console.log("Canvas found:", canvas);

    const graph = new LGraph();
    console.log("Graph created:", graph);
    console.log("Graph links after creation:", graph._links);

    const editor = new LGraphCanvas(canvas, graph);
    console.log("Editor created:", editor);
    console.log("Graph links after editor:", graph._links);

    // Enable editor features
    editor.allow_dragcanvas = true;
    editor.allow_dragnodes = true;
    editor.allow_interaction = true;
    editor.allow_searchbox = true;
    editor.allow_menu = true;

    // Custom property to track highlighted nodes for path tracing
    editor.highlightedNodes = new Set();

    // Override drawNode for custom highlighting with a bold neon green outline
    const originalDrawNode = editor.drawNode;
    editor.drawNode = function(node, ctx) {
        // Draw the node normally first
        originalDrawNode.call(this, node, ctx);

        // Apply custom highlighting if the node is in our highlightedNodes set
        if (this.highlightedNodes.has(node.id)) {
            // Convert graph coordinates to canvas coordinates using convertOffsetToCanvas
            const pos = this.convertOffsetToCanvas(node.pos);
            const scale = this.ds.scale; // Get the current zoom scale

            // Scale the size of the node
            const size = [node.size[0] * scale, node.size[1] * scale];

            // Save the current context state
            ctx.save();

            // Reset transformations to draw in canvas coordinates
            ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset to identity matrix

            // Adjust position and size to account for potential padding or offsets in LiteGraph's rendering
            const padding = 2; // Small adjustment for padding/border
            const adjustedPos = [pos[0] - padding, pos[1] - padding];
            const adjustedSize = [size[0] + padding * 2, size[1] + padding * 2];

            // Neon green highlight
            ctx.strokeStyle = "#00FF00"; // Bright neon green outline
            ctx.lineWidth = 5; // Thicker outline for emphasis
            ctx.shadowColor = "#00FF00"; // Neon green glow
            ctx.shadowBlur = 15; // Stronger glow effect

            // Draw the outline
            ctx.strokeRect(adjustedPos[0], adjustedPos[1], adjustedSize[0], adjustedSize[1]);

            // Add a semi-transparent fill for extra emphasis
            ctx.fillStyle = "rgba(0, 255, 0, 0.2)"; // Semi-transparent neon green fill
            ctx.fillRect(adjustedPos[0], adjustedPos[1], adjustedSize[0], adjustedSize[1]);

            // Restore the context state to reset transformations and styles
            ctx.restore();
        }
    };

    // Add keyboard event listener to clear highlights when spacebar is pressed
    window.addEventListener("keydown", (e) => {
        if (e.code === "Space" && !e.repeat) { // Only trigger on initial press, not hold
            e.preventDefault(); // Prevent default spacebar behavior (e.g., scrolling)
            if (editor.highlightedNodes.size > 0) {
                editor.highlightedNodes.clear();
                editor.setDirty(true, true); // Redraw the canvas to remove highlights
                logEvent("Cleared highlighted path by pressing Spacebar", "general");
            }
        }
    }, { capture: true }); // Use capture phase to ensure the event is handled early

    // Debug connection changes
    graph.onConnectionChange = function() {
        console.log("Connection changed, current _links:", graph._links);
        console.log("Nodes:", graph._nodes.map(n => ({ id: n.id, type: n.type })));
        graph._nodes.forEach(node => {
            console.log(`Node ${node.id} (${node.type}) inputs:`, node.inputs);
        });
    };

    // Debug editor link creation
    editor.onConnectionCreated = function(link) {
        console.log("Editor created link:", link);
    };

    // Ensure outputs are updated after each step
    graph.onAfterStep = function() {
        graph._nodes.forEach(node => {
            if (node.onExecute) node.onExecute();
        });
    };

    // NEW: Use setInterval instead of requestAnimationFrame for graph execution
    let lastFrameTime = Date.now();
    function stepGraph() {
        const now = Date.now();
        const dt = (now - lastFrameTime) / 1000; // Delta time in seconds
        lastFrameTime = now;

        // Update graph state
        if (graph._is_running) {
            graph.runStep(dt);
            graph.onAfterStep && graph.onAfterStep();
        }
    }
    setInterval(stepGraph, 1000 / 60); // Run at ~60 FPS
    graph.start = function() {
        this._is_running = true;
        console.log("Graph started with setInterval");
    };
    graph.stop = function() {
        this._is_running = false;
        console.log("Graph stopped");
    };
    graph.start();
    console.log("Graph links after start:", graph._links);
    logEvent("Graph execution started with setInterval.", "general");

    function resizeCanvas() {
        // MODIFIED: Account for sidebar and other UI elements
        const sidebarWidth = 120; // Matches --sidebar-width in styles.css
        const weatherBannerHeight = 25; // Matches --weather-banner-height
        const statusBarHeight = 25; // Matches --status-bar-height
        const logPanelHeight = 200; // Matches --log-panel-height
        const devicePanelWidth = document.getElementById("device-panel").getAttribute("data-expanded") === "true" ? 250 : 0;
        canvas.width = window.innerWidth - sidebarWidth - devicePanelWidth;
        canvas.height = window.innerHeight - (weatherBannerHeight + statusBarHeight + logPanelHeight);
        editor.setDirty(true, true); // Redraw canvas
        console.log('Canvas resized:', { width: canvas.width, height: canvas.height }); // Debug
    }
    window.addEventListener("resize", resizeCanvas);
    resizeCanvas();

    let socket;
    console.log("Setting up socket...");
    try {
        if (typeof window.setupSocket !== 'function') {
            throw new Error("window.setupSocket is not defined. Check script load order.");
        }
        socket = window.setupSocket(graph, updateStatusBar);
        if (!socket) {
            throw new Error("setupSocket returned undefined");
        }
        socket.on("connect", () => {
            console.log("Socket connected to backend");
            logEvent("Connected to backend server", "general");
            updateStatusBar("Connected", graph._nodes.length, Object.keys(lastStates).length);
            socket.emit('request-weather-update');
        });
        socket.on("disconnect", (reason) => {
            console.log(`Socket disconnected: ${reason}`);
            logEvent(`Socket disconnected: ${reason}`, "warning");
            updateStatusBar("Disconnected", graph._nodes.length, Object.keys(lastStates).length);
            if (reason !== "io client disconnect") {
                console.log("Attempting to reconnect...");
                socket.connect();
            }
        });
        socket.on("reconnect", (attempt) => {
            console.log(`Reconnected to backend after ${attempt} attempts`);
            logEvent("Reconnected to backend server", "general");
            graph._nodes.forEach(node => {
                if (node.connectToServer && typeof node.connectToServer === "function") {
                    console.log(`Reconnecting node ${node.type} (id: ${node.id})`);
                    node.connectToServer();
                }
            });
        });
        socket.on("reconnect_attempt", (attempt) => {
            console.log(`Reconnection attempt #${attempt}`);
        });
        socket.on("reconnect_error", (error) => {
            console.error("Reconnection error:", error);
            logEvent(`Reconnection error: ${error.message}`, "error");
        });
        socket.on("reconnect_failed", () => {
            console.error("Reconnection failed after max attempts");
            logEvent("Reconnection failed", "error");
        });

        setInterval(() => {
            if (socket && !socket.connected) {
                console.log("Socket not connected, forcing reconnect...");
                logEvent("Socket not connected, attempting reconnect", "warning");
                socket.connect();
            }
        }, 5000);
        console.log("Socket setup completed successfully");
    } catch (error) {
        console.error("Error in socket setup:", error);
        logEvent(`Socket setup failed: ${error.message}`, "error");
        updateStatusBar("Disconnected", graph._nodes.length, 0);
    }
    console.log("Socket setup complete, socket:", socket);

    console.log("Setting up controls with graph:", graph);
    try {
        setupControls(graph);
        console.log("Graph links after setupControls:", graph._links);
    } catch (error) {
        console.error("Error in setupControls:", error);
    }
    console.log("Setup complete.");

    // Log messages from the main process
    window.api.receive('log-message', (message) => {
        //console.log(message);
    });

    // IPC listeners using window.api.receive
    window.api.receive('graph-saved', (filePath) => {
        logEvent(`Graph saved to ${filePath}`, "general");
        toastr.success(`Graph saved to ${filePath}`);
    });
    window.api.receive('logic-saved', (filePath) => {
        logEvent(`Logic saved to ${filePath}`, "general");
        toastr.success(`Logic saved to ${filePath}`);
    });
    window.api.receive('save-error', (errorMessage) => {
        logEvent(`Save error: ${errorMessage}`, "error");
        toastr.error("Failed to save file.");
    });
    window.api.receive('api-keys-saved', (message) => {
        logEvent(`API keys: ${message}`, message.includes('Error') ? "error" : "general");
        if (message.includes('Error')) {
            toastr.error(message);
        } else {
            toastr.success(message);
            toggleModal('api-config-modal', false);
        }
    });

    // Hue API Key Fetch Controls
    window.api.receive('hue-key-fetched', (result) => {
        console.log('Renderer: Received hue-key-fetched reply (raw):', result);
        console.log('Renderer: Type of result:', typeof result);
        console.log('Renderer: Result properties:', Object.keys(result || {}));
        const fetchBtn = document.getElementById('fetch-hue-btn');
        if (fetchBtn) fetchBtn.textContent = 'Fetch from Bridge'; // Reset button text
        if (result && result.success) {
            // Ensure result.key is a string before setting it
            const apiKey = typeof result.key === 'string' ? result.key : (result.key && result.key.username ? result.key.username : JSON.stringify(result.key));
            document.getElementById('hue-key').value = apiKey;
            logEvent(`Hue API key fetched: ${apiKey}`, "general");
            toastr.success("Hue API key fetched successfully!");
        } else {
            const errorMessage = result ? (result.error || result.message || 'Unknown error') : 'No result received';
            logEvent(`Failed to fetch Hue key: ${errorMessage}`, "error");
            toastr.error(`Failed to fetch Hue key: ${errorMessage}`);
        }
    });

    // Custom IP Input Dialog Controls
    window.api.receive('request-hue-ip', () => {
        console.log('Renderer: Received request-hue-ip IPC');
        const ipModal = document.getElementById('ip-input-modal');
        const ipInput = document.getElementById('hue-ip-input');
        const submitIpBtn = document.getElementById('submit-ip-btn');
        const cancelIpBtn = document.getElementById('cancel-ip-btn');
        const backdrop = document.getElementById('ip-input-backdrop');
        const hueBridgeIpInput = document.getElementById('hue-bridge-ip'); // Hidden input to store the IP

        // Log whether the modal elements were found
        console.log('Renderer: ipModal found:', !!ipModal);
        console.log('Renderer: ipInput found:', !!ipInput);
        console.log('Renderer: submitIpBtn found:', !!submitIpBtn);
        console.log('Renderer: cancelIpBtn found:', !!cancelIpBtn);
        console.log('Renderer: backdrop found:', !!backdrop);
        console.log('Renderer: hueBridgeIpInput found:', !!hueBridgeIpInput);

        if (!ipModal || !ipInput || !submitIpBtn || !cancelIpBtn || !backdrop || !hueBridgeIpInput) {
            console.error('Renderer: One or more IP input modal elements not found');
            logEvent('IP input modal elements missing', "error");
            window.api.send('fetch-hue-key-response', null);
            console.log('Renderer: Sent fetch-hue-key-response with null (modal elements missing)');
            return;
        }

        console.log('Renderer: Showing IP input modal and backdrop');
        backdrop.style.display = 'block';
        ipModal.style.display = 'block';

        // Ensure the input field is interactable
        ipInput.disabled = false;
        ipInput.readOnly = false;
        ipInput.focus(); // Automatically focus the input field

        // Log the modal's computed style to confirm visibility
        const computedStyle = window.getComputedStyle(ipModal);
        console.log('Renderer: IP modal visibility:', computedStyle.display);
        console.log('Renderer: IP modal position:', computedStyle.position, computedStyle.top, computedStyle.left);
        console.log('Renderer: IP modal z-index:', computedStyle.zIndex);

        // Remove existing event listeners to prevent duplicates
        const submitClone = submitIpBtn.cloneNode(true);
        submitIpBtn.parentNode.replaceChild(submitClone, submitIpBtn);
        const cancelClone = cancelIpBtn.cloneNode(true);
        cancelIpBtn.parentNode.replaceChild(cancelClone, cancelIpBtn);

        // Add new event listeners with additional logging
        submitClone.addEventListener('click', () => {
            console.log('Renderer: Submit button clicked');
            const bridgeIp = ipInput.value.trim();
            console.log('Renderer: IP entered:', bridgeIp);
            if (!bridgeIp) {
                console.log('Renderer: No IP provided');
                logEvent('IP entry cancelled', "warning");
                ipModal.style.display = 'none';
                backdrop.style.display = 'none';
                window.api.send('fetch-hue-key-response', null);
                console.log('Renderer: Sent fetch-hue-key-response with null (no IP)');
                return;
            }
            if (!bridgeIp.match(/^\d+\.\d+\.\d+\.\d+$/)) {
                console.log('Renderer: Invalid IP format:', bridgeIp);
                logEvent('Invalid IP format', "error");
                ipModal.style.display = 'none';
                backdrop.style.display = 'none';
                window.api.send('fetch-hue-key-response', null);
                console.log('Renderer: Sent fetch-hue-key-response with null (invalid IP)');
                return;
            }
            // Store the IP in the hidden input field
            hueBridgeIpInput.value = bridgeIp;
            console.log('Renderer: Stored Hue Bridge IP:', hueBridgeIpInput.value);
            console.log('Renderer: Sending fetch-hue-key-response with IP:', bridgeIp);
            ipModal.style.display = 'none';
            backdrop.style.display = 'none';
            window.api.send('fetch-hue-key-response', bridgeIp);
            console.log('Renderer: Sent fetch-hue-key-response with IP:', bridgeIp);
        });

        cancelClone.addEventListener('click', () => {
            console.log('Renderer: Cancel button clicked');
            logEvent('IP entry cancelled', "warning");
            ipModal.style.display = 'none';
            backdrop.style.display = 'none';
            window.api.send('fetch-hue-key-response', null);
            console.log('Renderer: Sent fetch-hue-key-response with null (cancelled)');
        });
    });

    // API Configuration Modal Controls
    const configApiKeysBtn = document.getElementById('configApiKeysBtn');
    const saveApiBtn = document.getElementById('save-api-btn');
    const cancelApiBtn = document.getElementById('cancel-api-btn');

    if (configApiKeysBtn) {
        configApiKeysBtn.addEventListener('click', () => {
            toggleModal('api-config-modal', true);
        });
    }
    if (saveApiBtn) {
        saveApiBtn.addEventListener('click', () => {
            const keys = {
                hue: document.getElementById('hue-key').value,
                hueBridgeIp: document.getElementById('hue-bridge-ip').value, // Include the Hue Bridge IP
                telegram: document.getElementById('telegram-key').value,
                openweather: document.getElementById('openweather-key').value,
                ambientweather: document.getElementById('ambientweather-key').value
            };
            window.api.send('save-api-keys', keys);
        });
    }
    if (cancelApiBtn) {
        cancelApiBtn.addEventListener('click', () => {
            toggleModal('api-config-modal', false);
        });
    }

    // Hue API Key Fetch Controls (button event listener)
    const fetchHueBtn = document.getElementById('fetch-hue-btn');
    if (fetchHueBtn) {
        fetchHueBtn.addEventListener('click', () => {
            fetchHueBtn.textContent = 'Fetching...';
            try {
                console.log('Renderer: Sending fetch-hue-key IPC');
                window.api.send('fetch-hue-key');
                logEvent("Fetching Hue API key...", "general");
            } catch (error) {
                console.error('Renderer: Error in fetchHueBtn listener:', error);
                logEvent(`Error fetching Hue key: ${error.message}`, "error");
                fetchHueBtn.textContent = 'Fetch from Bridge';
            }
        });
    }

    
}); // End of DOMContentLoaded

function toggleModal(modalId, show) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = show ? 'block' : 'none';
    }
}

function logEvent(message, type = "general") {
    const logContent = document.querySelector("#log-panel .log-content");
    if (!logContent) {
        console.warn("Log panel not found yet:", message);
        return;
    }
    const logEntry = document.createElement("div");
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
    logEntry.textContent = `[${timestamp}] ${message}`;

    if (type === "error") logEntry.style.color = "red";
    else if (type === "warning") logEntry.style.color = "yellow";
    else logEntry.style.color = document.body.classList.contains("light-theme") ? "#333" : "white";

    if (logContent.children.length > 100) logContent.removeChild(logContent.firstChild);
    logContent.appendChild(logEntry);
    logContent.scrollTop = logContent.scrollHeight;

    // Also send the log to the main process for persistence
    window.api.send('log', { level: type, message });
}

function updateStatusBar(status, nodeCount, deviceCount) {
    const serverStatus = document.getElementById("server-status");
    serverStatus.textContent = `Server: ${status}`;
    serverStatus.classList.toggle("connected", status === "Connected");
    serverStatus.classList.toggle("disconnected", status === "Disconnected");
    document.getElementById("node-count").textContent = `Nodes: ${nodeCount}`;
    document.getElementById("device-count").textContent = `Devices: ${deviceCount}`;
    const indicator = document.getElementById("server-indicator");
    indicator.classList.toggle("connected", status === "Connected");
}

function saveGraph(graph) {
    try {
        const graphData = graph.serialize();
        window.api.send('save-graph', graphData);
        logEvent("Graph save initiated.", "general");
    } catch (error) {
        logEvent(`Error saving graph: ${error.message}`, "error");
        toastr.error("Failed to save graph.");
    }
}

function saveLogic(graph) {
    try {
        const graphData = graph.serialize();
        const logicData = distillLogic(graphData);
        window.api.send('save-logic', logicData);
        logEvent("Logic save initiated.", "general");
    } catch (error) {
        logEvent(`Error saving logic: ${error.message}`, "error");
        toastr.error("Failed to save logic.");
    }
}

function distillLogic(graphData) {
    const logicData = {
        nodes: [],
        links: graphData.links || [],
        version: graphData.version || 0.4,
    };

    for (const node of graphData.nodes) {
        const distilledNode = {
            id: node.id,
            type: node.type,
            inputs: node.inputs ? node.inputs.map(input => ({
                name: input.name,
                type: input.type,
                link: input.link,
            })) : [],
            outputs: node.outputs ? node.outputs.map(output => ({
                name: output.name,
                type: output.type,
                links: output.links || [],
            })) : [],
            properties: filterProperties(node.type, node.properties || {}),
        };
        logicData.nodes.push(distilledNode);
    }

    return logicData;
}

function filterProperties(nodeType, properties) {
    const essentialProps = {};
    switch (nodeType) {
        case 'CC_Control_Nodes/hsv_control':
            ['hueShift', 'saturation', 'brightness', 'transitionTime'].forEach(key => {
                if (properties[key] !== undefined) essentialProps[key] = properties[key];
            });
            break;
        case 'Lighting/KasaLightControlNode':
            ['selectedLightIds', 'status'].forEach(key => {
                if (properties[key] !== undefined) essentialProps[key] = properties[key];
            });
            break;
        case 'Lighting/HueLightControlNode':
            ['selectedLightIds', 'status', 'hue', 'saturation', 'brightness'].forEach(key => {
                if (properties[key] !== undefined) essentialProps[key] = properties[key];
            });
            break;
        case 'Power/KasaPlugControlNode':
            ['selectedPlugIds', 'status'].forEach(key => {
                if (properties[key] !== undefined) essentialProps[key] = properties[key];
            });
            break;
        case 'Timers/time_of_day':
            ['start_hour', 'start_minute', 'stop_hour', 'stop_minute'].forEach(key => {
                if (properties[key] !== undefined) essentialProps[key] = properties[key];
            });
            break;
        case 'Logic/ConditionalSwitch':
            ['numberOfInputs', 'clampSelect'].forEach(key => {
                if (properties[key] !== undefined) essentialProps[key] = properties[key];
            });
            break;
        case 'Timers/sunrise_sunset_trigger':
            ['on_offset_hours', 'on_offset_minutes', 'off_offset_hours', 'off_offset_minutes', 'latitude', 'longitude'].forEach(key => {
                if (properties[key] !== undefined) essentialProps[key] = properties[key];
            });
            break;
        default:
            Object.assign(essentialProps, properties);
    }
    return essentialProps;
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

            // After loading the graph, distill its logic and render the overview
            const logicData = distillLogic(graphData);
            const summary = summarizeLogic(logicData, graph);
            renderOverview(summary);

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

function summarizeLogic(logicData, graph) {
    const summary = {
        inputs: [],
        logic: [],
        outputs: [],
        groups: {},
        editor: graph ? LGraphCanvas.active_canvas : null,
        links: logicData.links,
        nodes: logicData.nodes // Store all nodes for buffer lookups
    };

    logicData.nodes.forEach(node => {
        const type = node.type.split('/')[1] || node.type;
        if (['pushbutton', 'time_of_day', 'sunrise_sunset_trigger', 'WeatherLogic'].includes(type)) {
            summary.inputs.push({ id: node.id, type, label: `${type} (ID: ${node.id})` });
        } else if (['ConditionalSwitch', 'AND_OR_Otherwise', 'LogicOperations', 'ConditionalIntegerOutput'].includes(type)) {
            summary.logic.push({ id: node.id, type, label: `${type} (ID: ${node.id})` });
        } else if (['KasaLightControlNode', 'HueLightControlNode', 'KasaPlugControlNode'].includes(type)) {
            const devices = node.properties.selectedLightIds || node.properties.selectedPlugIds || [];
            summary.outputs.push({ id: node.id, type, label: `${type} (ID: ${node.id}) - ${devices.length} devices` });
        }

        const group = node.type.split('/')[0] || 'Other';
        summary.groups[group] = summary.groups[group] || { nodes: [], visible: true, expanded: false };
        summary.groups[group].nodes.push({ id: node.id, type, properties: node.properties });
    });

    summary.inputCount = summary.inputs.length;
    summary.logicCount = summary.logic.length;
    summary.outputCount = summary.outputs.length;
    summary.groupCount = Object.keys(summary.groups).length;

    return summary;
}

function loadAndSummarizeLogic(file, graph) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const logicData = JSON.parse(e.target.result);
            const summary = summarizeLogic(logicData, graph);
            renderOverview(summary);
            logEvent(`Logic overview loaded from ${file.name}`, "general");
            toastr.success("Logic overview loaded.");
        } catch (error) {
            logEvent(`Error loading logic: ${error.message}`, "error");
            toastr.error("Failed to load logic.");
        }
    };
    reader.readAsText(file);
}

function traceLogicFlow(summary, triggerId) {
    const path = { nodes: new Set([triggerId]), links: new Set() };
    let currentNodes = [triggerId];

    while (currentNodes.length > 0) {
        const nextNodes = [];
        currentNodes.forEach(nodeId => {
            // Trace direct links
            summary.links.forEach(link => {
                if (link[1] === nodeId) { // link[1] is origin_id
                    const targetId = link[3]; // link[3] is target_id
                    if (!path.nodes.has(targetId)) {
                        path.nodes.add(targetId);
                        nextNodes.push(targetId);
                    }
                    path.links.add(link[0]); // link[0] is the link ID
                }
            });

            // Check for SenderNode to ReceiverNode connections via buffers
            const node = summary.nodes.find(n => n.id === nodeId);
            if (node && node.type === "Utility/SenderNode" && node.properties.bufferName) {
                const bufferName = node.properties.bufferName;
                summary.nodes.forEach(receiver => {
                    if (receiver.type === "Utility/ReceiverNode" && receiver.properties.selectedBuffer === bufferName) {
                        if (!path.nodes.has(receiver.id)) {
                            path.nodes.add(receiver.id);
                            nextNodes.push(receiver.id);
                        }
                    }
                });
            }
        });
        currentNodes = nextNodes;
    }

    return path;
}

function highlightPath(summary, path) {
    if (!summary.editor) {
        logEvent("No graph loaded to highlight path", "warning");
        return;
    }

    // Clear previous highlights
    summary.editor.deselectAllNodes();
    summary.editor.highlightedNodes.clear();

    // Add nodes to our custom highlightedNodes set
    path.nodes.forEach(nodeId => {
        const node = summary.editor.graph.getNodeById(nodeId);
        if (node) {
            summary.editor.highlightedNodes.add(nodeId);
        }
    });

    // Calculate the bounding box of all nodes in the graph (not just the path)
    const nodes = summary.editor.graph._nodes;
    if (nodes.length > 0) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        nodes.forEach(node => {
            const x = node.pos[0];
            const y = node.pos[1];
            const width = node.size[0];
            const height = node.size[1];
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x + width);
            maxY = Math.max(maxY, y + height);
        });

        // Add some padding around the bounding box
        const padding = 50;
        minX -= padding;
        minY -= padding;
        maxX += padding;
        maxY += padding;

        // Calculate the center of the bounding box
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;

        // Calculate the required zoom to fit the bounding box within the canvas
        const canvasWidth = summary.editor.canvas.width;
        const canvasHeight = summary.editor.canvas.height;
        const graphWidth = maxX - minX;
        const graphHeight = maxY - minY;
        const zoomX = canvasWidth / graphWidth;
        const zoomY = canvasHeight / graphHeight;
        const newZoom = Math.min(zoomX, zoomY, 1); // Cap zoom at 1 to avoid zooming in too much

        // Set the new zoom level
        summary.editor.setZoom(newZoom);

        // Calculate the new offset to center the bounding box
        const newOffsetX = (canvasWidth / 2) / newZoom - centerX;
        const newOffsetY = (canvasHeight / 2) / newZoom - centerY;
        summary.editor.ds.offset = [newOffsetX, newOffsetY];
    }

    // Redraw canvas to apply custom highlighting and new zoom/offset
    summary.editor.setDirty(true, true);

    // Log the path
    const pathStr = [...path.nodes].map(id => {
        const node = summary.editor.graph.getNodeById(id);
        return node ? `${node.type} (ID: ${id})` : `ID: ${id}`;
    }).join(" → ");
    logEvent(`Highlighted path: ${pathStr}`, "general");
}

function renderOverview(summary) {
    const summaryList = document.getElementById("overview-summary");
    summaryList.innerHTML = `
        <h4>Inputs</h4>
        <ul>
            ${summary.inputs.map(input => `
                <li><a href="#" class="trigger-link" data-trigger-id="${input.id}">${input.label}</a></li>
            `).join('')}
        </ul>
        <li>Inputs: ${summary.inputCount} (e.g., timers, buttons)</li>
        <li>Logic Nodes: ${summary.logicCount} (e.g., switches, conditions)</li>
        <li>Outputs: ${summary.outputCount} (e.g., lights, plugs)</li>
        <li>Functional Groups: ${summary.groupCount}</li>
    `;

    const groupsList = document.getElementById("overview-groups");
    groupsList.innerHTML = Object.entries(summary.groups).map(([group, data]) => {
        const nodesToShow = data.expanded ? data.nodes : data.nodes.slice(0, 3);
        return `
            <li>
                <input type="checkbox" class="group-toggle" data-group="${group}" ${data.visible ? 'checked' : ''}> 
                ${group}: ${data.nodes.length} nodes
                <ul>
                    ${nodesToShow.map(n => `
                        <li><a href="#" class="node-link" data-node-id="${n.id}">${n.type} (ID: ${n.id})</a></li>
                    `).join('')}
                    ${data.nodes.length > 3 && !data.expanded ? 
                        `<li><a href="#" class="expand-link" data-group="${group}">Show more</a></li>` : 
                        (data.expanded ? `<li><a href="#" class="expand-link" data-group="${group}">Show less</a></li>` : '')}
                </ul>
            </li>
        `;
    }).join('');

    // Add event listeners for navigation
    document.querySelectorAll(".node-link").forEach(link => {
        link.addEventListener("click", (e) => {
            e.preventDefault();
            const nodeId = parseInt(e.target.dataset.nodeId);
            if (summary.editor) {
                const node = summary.editor.graph.getNodeById(nodeId);
                if (node) {
                    summary.editor.centerOnNode(node);
                    summary.editor.selectNode(node);
                    logEvent(`Navigated to node ${nodeId}`, "general");
                } else {
                    logEvent(`Node ${nodeId} not found in current graph`, "warning");
                }
            }
        });
    });

    // Add event listeners for group toggling
    document.querySelectorAll(".group-toggle").forEach(toggle => {
        toggle.addEventListener("change", (e) => {
            const group = e.target.dataset.group;
            summary.groups[group].visible = e.target.checked;
            if (summary.editor) {
                summary.editor.graph._nodes.forEach(node => {
                    if (node.type.startsWith(group + '/')) {
                        node.flags.collapsed = !e.target.checked;
                        summary.editor.setDirty(true, true);
                    }
                });
                logEvent(`${group} group ${e.target.checked ? 'shown' : 'hidden'}`, "general");
            }
        });
    });

    // Add event listeners for expanding/collapsing
    document.querySelectorAll(".expand-link").forEach(link => {
        link.addEventListener("click", (e) => {
            e.preventDefault();
            const group = e.target.dataset.group;
            summary.groups[group].expanded = !summary.groups[group].expanded;
            renderOverview(summary);
            logEvent(`${group} group ${summary.groups[group].expanded ? 'expanded' : 'collapsed'}`, "general");
        });
    });

    // Add event listeners for trigger path highlighting
    document.querySelectorAll(".trigger-link").forEach(link => {
        link.addEventListener("click", (e) => {
            e.preventDefault();
            const triggerId = parseInt(e.target.dataset.triggerId);
            const path = traceLogicFlow(summary, triggerId);
            highlightPath(summary, path);
        });
    });

    const overviewSection = document.getElementById("overview-section");
    if (overviewSection.getAttribute("data-expanded") !== "true") {
        togglePanel("combined-panel", "overview-section");
    }
}

function togglePanel(panelId, subSectionId = null) {
    const panel = document.getElementById(panelId);
    if (!panel) {
        console.warn(`Panel ${panelId} not found`);
        return;
    }
    
    if (subSectionId) {
        const subSection = document.getElementById(subSectionId);
        if (!subSection) {
            console.warn(`Sub-section ${subSectionId} not found`);
            return;
        }
        const isExpanded = subSection.getAttribute("data-expanded") === "true";
        subSection.setAttribute("data-expanded", !isExpanded);
        const content = subSection.querySelector(".sub-content");
        if (content) {
            content.style.transition = "max-height 0.3s ease, opacity 0.3s ease";
            if (!isExpanded) {
                content.style.display = "block";
                setTimeout(() => {
                    content.style.maxHeight = "300px";
                    content.style.opacity = "1";
                }, 10);
            } else {
                content.style.maxHeight = "0";
                content.style.opacity = "0";
                setTimeout(() => content.style.display = "none", 300);
            }
        }
    } else {
        const isExpanded = panel.getAttribute("data-expanded") === "true";
        panel.setAttribute("data-expanded", !isExpanded);
        console.log(`${panelId} toggled to ${!isExpanded}`);
    }
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
        const time = now.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        dateTimeDisplay.textContent = `${date} ${time}`;
    } catch (err) {
        console.error("Error updating dateTimeDisplay:", err);
    }
}

function setupControls(graph) {
    console.log("setupControls started");
    console.log("setupControls called with graph:", graph);
    console.log("Graph nodes:", graph._nodes ? graph._nodes.length : "No nodes");
    
    const saveGraphBtn = document.getElementById("saveGraphBtn");
    const loadGraphBtn = document.getElementById("loadGraphBtn");
    const importCustomGraphBtn = document.getElementById("importCustomGraphBtn");
    const saveLogicBtn = document.getElementById("saveLogicBtn");
    const loadLogicBtn = document.getElementById("loadLogicBtn");
    const fileInput = document.getElementById("fileInput");

    if (!saveGraphBtn) console.error("saveGraphBtn not found");
    if (!loadGraphBtn) console.error("loadGraphBtn not found");
    if (!importCustomGraphBtn) console.error("importCustomGraphBtn not found");
    if (!saveLogicBtn) console.error("saveLogicBtn not found");
    if (!loadLogicBtn) console.error("loadLogicBtn not found");
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
    if (saveLogicBtn) saveLogicBtn.addEventListener("click", () => saveLogic(graph));
    if (loadLogicBtn) loadLogicBtn.addEventListener("click", () => {
        if (fileInput) {
            fileInput.dataset.action = "load-logic";
            fileInput.click();
        }
    });

    if (fileInput) {
        fileInput.addEventListener("change", (event) => {
            const file = event.target.files[0];
            if (file) {
                if (event.target.dataset.action === "load") {
                    loadGraphFromFile(graph, file);
                } else if (event.target.dataset.action === "import") {
                    mergePreMadeGraph(graph, file);
                } else if (event.target.dataset.action === "load-logic") {
                    loadAndSummarizeLogic(file, graph);
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

    updateEventsList();
    setInterval(updateEventsList, 5000);

    console.log("Calling updateDateTimeDisplay");
    updateDateTimeDisplay();
    console.log("Setting interval for updateDateTimeDisplay");
    setInterval(updateDateTimeDisplay, 1000);

    updateLogicOverview(graph);

    // Add panel toggle listeners
    const overviewHeader = document.querySelector("#overview-section .sub-header");
    if (overviewHeader) {
        overviewHeader.addEventListener("click", () => togglePanel("combined-panel", "overview-section"));
    }
    const combinedHeader = document.querySelector("#combined-panel .panel-header");
    if (combinedHeader) {
        combinedHeader.addEventListener("click", () => togglePanel("combined-panel"));
    }

    console.log("setupControls completed.");
}



// NEW: Patch LiteGraph to fix mouse coordinate misalignment
if (typeof LiteGraph !== 'undefined' && typeof LGraphCanvas !== 'undefined') {
    // Store original method
    const originalConvertEventToCanvas = LGraphCanvas.prototype.convertEventToCanvas;

    // Override to adjust for canvas offset
    LGraphCanvas.prototype.convertEventToCanvas = function(e) {
        var rect = this.canvas.getBoundingClientRect();
        var x = e.clientX - rect.left;
        var y = e.clientY - rect.top;
        console.log('Mouse event:', { clientX: e.clientX, clientY: e.clientY, rectLeft: rect.left, canvasX: x }); // Debug
        return [x, y];
    };
}