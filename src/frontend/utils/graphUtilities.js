// js/graph-utils.js
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
    updateHealthHUD({ type });
}

function togglePanel(panelId) {
    const panel = document.getElementById(panelId);
    if (!panel) return;
    const isExpanded = panel.getAttribute("data-expanded") === "true";
    panel.setAttribute("data-expanded", !isExpanded);
    console.log(`${panelId} toggled to ${panel.getAttribute("data-expanded")}`);
    const content = panel.querySelector("#health-content");
    if (content) content.style.display = !isExpanded ? "block" : "none";
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
    lastFrameTime: performance.now()
};

function initHealthHUD(graph) {
    console.log("initHealthHUD called with graph:", graph);
    let hud = document.getElementById("health-hud");
    if (!hud) {
        console.log("Creating health-hud element...");
        hud = document.createElement("div");
        hud.id = "health-hud";
        hud.setAttribute("data-expanded", "true");
        hud.style.display = "block"; // Force visibility
        hud.style.zIndex = "10000";  // Higher than temporary HUD
        hud.innerHTML = `
            <div style="cursor: pointer;" onclick="togglePanel('health-hud')">Resource HUD ▼</div>
            <div id="health-content">
                <div>Memory: <span id="hud-memory">0/0 MB</span></div>
                <div>Nodes: <span id="hud-nodes">0</span></div>
                <div>Links: <span id="hud-links">0</span></div>
                <div>FPS: <span id="hud-fps">0</span></div>
                <div>Net: <span id="hud-net">0 reqs</span></div>
                <div>Exec: <span id="hud-exec">0 ms</span></div>
                <div>Errors: <span id="hud-errors">0</span></div>
                <div>Buffers: <span id="hud-buffers">0</span></div>
                <button onclick="resetHealthStats()">Reset Errors</button>
            </div>
        `;
        document.body.appendChild(hud);
        console.log("HUD element created and appended:", hud);
    } else {
        console.log("health-hud already exists:", hud);
    }

    const originalFetch = window.fetch;
    window.fetch = function (...args) {
        healthStats.activeRequests++;
        updateHealthHUD();
        return originalFetch.apply(this, args).then(response => {
            healthStats.activeRequests--;
            healthStats.lastApiStatus = response.ok ? "OK" : "Failed";
            updateHealthHUD();
            return response;
        }).catch(err => {
            healthStats.activeRequests--;
            healthStats.lastApiStatus = "Error";
            updateHealthHUD();
            throw err;
        });
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
    const hud = document.getElementById("health-hud");
    if (!hud) {
        console.warn("updateHealthHUD: HUD not found in DOM");
        return;
    }

    if (data.graph) {
        healthStats.nodeCount = data.graph._nodes.length;
        healthStats.linkCount = Object.keys(data.graph._links).length;
        healthStats.bufferSize = Object.keys(window.SenderNode?.sharedBuffer || {}).length;
    }

    if (data.type === "error") healthStats.errorCount++;
    if (data.type === "warning") healthStats.warningCount++;

    if ("memory" in performance) {
        healthStats.memoryUsed = (performance.memory.usedJSHeapSize / 1048576).toFixed(1);
        healthStats.memoryTotal = (performance.memory.totalJSHeapSize / 1048576).toFixed(1);
    } else {
        healthStats.memoryUsed = "N/A";
        healthStats.memoryTotal = "N/A";
    }

    document.getElementById("hud-memory").textContent = `${healthStats.memoryUsed}/${healthStats.memoryTotal} MB`;
    document.getElementById("hud-nodes").textContent = healthStats.nodeCount;
    document.getElementById("hud-links").textContent = healthStats.linkCount;
    document.getElementById("hud-fps").textContent = healthStats.fps;
    document.getElementById("hud-net").textContent = `${healthStats.activeRequests} reqs (${healthStats.lastApiStatus})`;
    document.getElementById("hud-exec").textContent = `${healthStats.execTime.toFixed(1)} ms`;
    document.getElementById("hud-errors").textContent = `${healthStats.errorCount} (W:${healthStats.warningCount})`;
    document.getElementById("hud-buffers").textContent = healthStats.bufferSize;

    if (healthStats.errorCount > 5 || (typeof healthStats.memoryUsed === "number" && healthStats.memoryUsed > healthStats.memoryTotal * 0.9)) {
        hud.style.background = "rgba(255, 0, 0, 0.7)";
    } else {
        hud.style.background = "rgba(0, 0, 0, 0.7)";
    }
}

function resetHealthStats() {
    healthStats.errorCount = 0;
    healthStats.warningCount = 0;
    updateHealthHUD();
}

function saveGraph(graph) {
    try {
        const graphData = JSON.stringify(graph.serialize());
        const blob = new Blob([graphData], { type: 'application/json' });
        const defaultFilename = `graph_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = defaultFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        logEvent("Graph saved successfully.");
    } catch (error) {
        logEvent(`Error saving graph: ${error}`, "error");
    }
}

function loadGraphFromFile(graph, file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const graphData = JSON.parse(e.target.result);
            graph.clear();
            graph.configure(graphData);
            graph.start();
            logEvent("Graph loaded successfully from file.");
        } catch (err) {
            logEvent(`Error loading graph from file: ${err.message}`, "error");
        }
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
                if (newNode && typeof newNode.configure === 'function') newNode.configure(node.properties || {});
                nodeIdMap[node.id] = newNode;
            });

            preMadeGraph._links.forEach(link => {
                const originNode = nodeIdMap[link[0]];
                const targetNode = nodeIdMap[link[2]];
                if (originNode && targetNode) {
                    graph.connect(originNode.id, link[1], targetNode.id, link[3]);
                }
            });

            logEvent("Pre-made graph merged successfully.");
        } catch (error) {
            logEvent(`Error merging pre-made graph: ${error}`, "error");
        }
    };
    reader.readAsText(file);
}

function setupControls(graph) {
    console.log("setupControls called with graph:", graph);
    document.getElementById("saveGraphBtn").addEventListener("click", () => saveGraph(graph));
    document.getElementById("loadGraphBtn").addEventListener("click", () => document.getElementById("fileInputLoad").click());
    document.getElementById("importCustomGraphBtn").addEventListener("click", () => document.getElementById("fileInputImport").click());
    document.getElementById("fileInputLoad").addEventListener("change", (event) => {
        const file = event.target.files[0];
        if (file) loadGraphFromFile(graph, file);
    });
    document.getElementById("fileInputImport").addEventListener("change", (event) => {
        const file = event.target.files[0];
        if (file) mergePreMadeGraph(graph, file);
    });
    initHealthHUD(graph);
    console.log("setupControls completed.");
}