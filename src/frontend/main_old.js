// File: frontend/main.js
document.addEventListener("DOMContentLoaded", function() {
    console.log("Renderer process started. DOM fully loaded.");
    window.api.log('info', "Renderer process started. DOM fully loaded.");

    // Add immediate test log to confirm IPC
    console.log("Sending initial test log");
    window.api.log('info', "Sending initial test log");

    // Force HUD creation for debugging
    console.log("Forcing HUD creation for debugging...");
    window.api.log('info', "Forcing HUD creation for debugging...");
    const tempHud = document.createElement("div");
    tempHud.id = "temp-health-hud";
    tempHud.style.position = "fixed";
    tempHud.style.top = "40px";
    tempHud.style.right = "10px";
    tempHud.style.background = "rgba(0, 255, 0, 0.7)";
    tempHud.style.color = "black";
    tempHud.style.padding = "10px";
    tempHud.style.zIndex = "9999";
    tempHud.textContent = "Temporary HUD for Debugging";
    document.body.appendChild(tempHud);
    console.log("Temporary HUD appended:", tempHud);
    window.api.log('info', "Temporary HUD appended");

    // Global error handlers
    window.onerror = (msg, url, lineNo, columnNo, error) => {
        const errorMsg = `Renderer Error: ${msg} at ${url}:${lineNo}:${columnNo}\nStack: ${error?.stack || 'No stack'}`;
        console.error(errorMsg);
        window.api.log('error', errorMsg);
        // Delay crash to ensure logs flush
        setTimeout(() => {
            console.log("Triggering renderer crash");
            window.api.log('info', "Triggering renderer crash");
            window.api.send('crash-renderer');
        }, 1000);
    };

    process.on('uncaughtException', (error) => {
        const errorMsg = `Renderer Uncaught Exception: ${error.message}\nStack: ${error.stack}`;
        console.error(errorMsg);
        window.api.log('error', errorMsg);
    });

    // Override console for logging
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;
    console.log = (...args) => {
        window.api.log('info', args.join(' '));
        originalConsoleLog(...args);
    };
    console.error = (...args) => {
        window.api.log('error', args.join(' '));
        originalConsoleError(...args);
    };

    async function initialize() {
        try {
            const data = await fetchWithRetry('http://localhost:3000/api/devices');
            if (data.success) {
                populateDevices(data.devices);
            } else {
                console.warn('Failed to fetch devices:', data.error);
                logEvent('Failed to fetch devices: ' + data.error, 'error');
            }
        } catch (error) {
            console.error('Error fetching devices:', error);
            logEvent('Error fetching devices: ' + error.message, 'error');
        }
    }

    async function fetchWithRetry(url, retries = 3, delayMs = 5000) {
        for (let i = 0; i < retries; i++) {
            try {
                const response = await fetch(url);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return await response.json();
            } catch (error) {
                if (i === retries - 1) throw error;
                console.warn(`Fetch attempt ${i + 1} failed: ${error.message}. Retrying in ${delayMs}ms...`);
                logEvent(`Fetch attempt ${i + 1} failed: ${error.message}. Retrying...`, "warning");
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
    }

    function populateDevices(devices) {
        const deviceList = document.getElementById('deviceList');
        deviceList.innerHTML = '';

        devices.hue.forEach(device => {
            const deviceDiv = createDeviceElement(device, 'hue');
            deviceList.appendChild(deviceDiv);
        });

        devices.kasa.forEach(device => {
            const deviceDiv = createDeviceElement(device, 'kasa');
            deviceList.appendChild(deviceDiv);
        });

        if (devices.hue.length === 0) {
            console.warn('No Hue devices found.');
        }
        if (devices.kasa.length === 0) {
            console.warn('No Kasa devices found.');
        }
    }

    function createDeviceElement(device, type) {
        const deviceDiv = document.createElement('div');
        deviceDiv.id = `device-${device.id}`;
        deviceDiv.className = 'device';

        const name = document.createElement('h3');
        name.textContent = device.name || `Device ${device.id}`;
        deviceDiv.appendChild(name);

        const stateList = document.createElement('div');
        stateList.innerHTML = `
            <p><strong>State:</strong> ${device.state.on ? 'ON' : 'OFF'}</p>
            <p><strong>Brightness:</strong> ${device.state.brightness}</p>
            <p><strong>Hue:</strong> ${device.state.hue}</p>
            <p><strong>Saturation:</strong> ${device.state.saturation}</p>
            <p><strong>Color Temp:</strong> ${device.state.colorTemp}</p>
            <p><strong>XY:</strong> [${device.state.xy.join(', ')}]</p>
        `;
        deviceDiv.appendChild(stateList);

        const controlButton = document.createElement('button');
        controlButton.textContent = device.state.on ? 'Turn Off' : 'Turn On';
        controlButton.className = device.state.on ? 'off' : '';
        controlButton.addEventListener('click', () => {
            toggleDevice(device.id, device.state.on, type);
        });
        deviceDiv.appendChild(controlButton);

        return deviceDiv;
    }

    async function toggleDevice(deviceId, currentState, type) {
        console.log(`Toggling device ${deviceId} (${type}) to ${currentState ? 'OFF' : 'ON'}`);
        try {
            const action = currentState ? 'off' : 'on';
            const result = await window.api.controlKasaDevice(deviceId, action);
            console.log("Toggle result:", result);
            if (result.success) {
                logEvent(`Device ${deviceId} turned ${currentState ? 'OFF' : 'ON'}.`, 'general');
                updateDeviceState(deviceId, { on: !currentState });
            } else {
                logEvent(`Failed to toggle device ${deviceId}: ${result.error}`, "error");
            }
        } catch (error) {
            logEvent(`Error toggling device ${deviceId}: ${error.message}`, "error");
            console.error("Toggle error:", error);
        }
    }

    function capitalizeFirstLetter(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    function formatSeconds(seconds) {
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    window.api.receive('fromBackend', (data) => {
        console.log('Received from backend:', data);
        logEvent(`Message from backend: ${data}`, "general");
    });

    let isConnected = false;
    if (typeof io !== 'undefined') {
        console.log("Initializing Socket.io...");
        const socket = io("http://localhost:3000", {
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 20000
        });

        socket.on('connect', () => {
            isConnected = true;
            updateConnectivityStatus(true);
            console.log("Connected to backend via Socket.io");
            logEvent("Connected to backend via Socket.io", "general");
            initialize();
        });

        socket.on('reconnect', (attempt) => {
            isConnected = true;
            updateConnectivityStatus(true);
            console.log(`Reconnected to backend after ${attempt} attempts`);
            logEvent(`Reconnected to backend after ${attempt} attempts`, "general");
            initialize();
        });

        socket.on('disconnect', () => {
            isConnected = false;
            updateConnectivityStatus(false);
            console.log("Disconnected from backend");
            logEvent("Disconnected from backend", "warning");
        });

        socket.on('reconnect_error', (error) => {
            console.error(`Reconnect error: ${error.message}`);
            logEvent(`Reconnect error: ${error.message}`, "error");
        });

        socket.on('connect_error', (error) => {
            console.error(`Socket connect error: ${error.message}`);
            logEvent(`Socket connect error: ${error.message}`, "error");
        });

        socket.on('deviceAdded', (device) => {
            logEvent(`New Device Added: ${device.alias} (${device.deviceId})`, "general");
            populateDevices({ hue: [], kasa: [device] });
        });

        socket.on('deviceStateChanged', ({ deviceId, on }) => {
            logEvent(`Device ${deviceId} turned ${on ? 'ON' : 'OFF'}`, "general");
            updateDeviceState(deviceId, { on });
        });

        socket.on('energyDataUpdated', ({ deviceId, energyData }) => {
            logEvent(`Energy data updated for ${deviceId}: ${JSON.stringify(energyData)}`, "general");
            updateDeviceEnergyData(deviceId, energyData);
        });

        socket.on('energyDataCleared', ({ deviceId }) => {
            logEvent(`Energy data cleared for device ${deviceId}.`, "warning");
            clearDeviceEnergyData(deviceId);
        });

        socket.on('hueLightStateUpdated', ({ id, state }) => {
            logEvent(`Hue Light ${id} state updated: ${JSON.stringify(state)}`, "general");
            updateHueLightState(id, state);
        });

        socket.on('hueLightStateChanged', ({ id, state }) => {
            logEvent(`Hue Light ${id} state changed: ${JSON.stringify(state)}`, "general");
            updateHueLightState(id, state);
        });

        socket.on('error', (errorMessage) => {
            logEvent(`Error: ${errorMessage}`, "error");
        });

        socket.on('info', (infoMessage) => {
            logEvent(`Info: ${infoMessage}`, "general");
        });
    } else {
        console.error("Socket.io is not loaded.");
        logEvent("Socket.io is not loaded.", "error");
    }

    function updateDeviceState(deviceId, updatedState) {
        console.log(`Updating state for device ${deviceId}:`, updatedState);
        const deviceDiv = document.getElementById(`device-${deviceId}`);
        if (deviceDiv) {
            const pElements = deviceDiv.querySelectorAll('p');
            if (pElements.length > 0) {
                pElements[0].innerHTML = `<strong>State:</strong> ${updatedState.on ? 'ON' : 'OFF'}`;
            }

            const controlButton = deviceDiv.querySelector('button');
            if (controlButton) {
                controlButton.textContent = updatedState.on ? 'Turn Off' : 'Turn On';
                if (updatedState.on) {
                    controlButton.classList.add('off');
                } else {
                    controlButton.classList.remove('off');
                }
            }
        } else {
            console.warn(`Device element for ${deviceId} not found.`);
        }
    }

    function updateDeviceEnergyData(deviceId, energyData) {
        console.log(`Updating energy data for device ${deviceId}:`, energyData);
        const deviceDiv = document.getElementById(`device-${deviceId}`);
        if (deviceDiv) {
            const paragraphs = deviceDiv.querySelectorAll('p');
            let energyParagraph = null;
            for (let p of paragraphs) {
                if (p.innerHTML.includes('Energy Usage:')) {
                    energyParagraph = p;
                    break;
                }
            }

            if (!energyParagraph) {
                energyParagraph = document.createElement('p');
                energyParagraph.innerHTML = `<strong>Energy Usage:</strong> ${JSON.stringify(energyData)}`;
                deviceDiv.appendChild(energyParagraph);
            } else {
                energyParagraph.innerHTML = `<strong>Energy Usage:</strong> ${JSON.stringify(energyData)}`;
            }
        } else {
            console.warn(`Device element for ${deviceId} not found.`);
        }
    }

    function clearDeviceEnergyData(deviceId) {
        console.log(`Clearing energy data for device ${deviceId}`);
        const deviceDiv = document.getElementById(`device-${deviceId}`);
        if (deviceDiv) {
            const paragraphs = deviceDiv.querySelectorAll('p');
            for (let p of paragraphs) {
                if (p.innerHTML.includes('Energy Usage:')) {
                    p.innerHTML = `<strong>Energy Usage:</strong> N/A`;
                    break;
                }
            }
        } else {
            console.warn(`Device element for ${deviceId} not found.`);
        }
    }

    function updateHueLightState(lightId, state) {
        console.log(`Updating state for Hue Light ${lightId}:`, state);
        const deviceDiv = document.getElementById(`device-${lightId}`);
        if (deviceDiv) {
            const htmlSnippet = `
                <p><strong>State:</strong> ${state.on ? 'ON' : 'OFF'}</p>
                <p><strong>Brightness:</strong> ${state.brightness}</p>
                <p><strong>Hue:</strong> ${state.hue}</p>
                <p><strong>Saturation:</strong> ${state.saturation}</p>
                <p><strong>Color Temp:</strong> ${state.colorTemp}</p>
                <p><strong>XY:</strong> [${state.xy.join(', ')}]</p>
            `;

            const oldPs = deviceDiv.querySelectorAll('p');
            oldPs.forEach(p => p.remove());
            deviceDiv.insertAdjacentHTML('beforeend', htmlSnippet);

            const controlButton = deviceDiv.querySelector('button');
            if (controlButton) {
                controlButton.textContent = state.on ? 'Turn Off' : 'Turn On';
                if (state.on) {
                    controlButton.classList.add('off');
                } else {
                    controlButton.classList.remove('off');
                }
            }
        } else {
            console.warn(`Hue Light element for ${lightId} not found.`);
        }
    }

    function updateConnectivityStatus(connected) {
        const statusElement = document.getElementById('connectivityStatus') || document.createElement('div');
        statusElement.id = 'connectivityStatus';
        statusElement.style.position = 'fixed';
        statusElement.style.top = '10px';
        statusElement.style.right = '10px';
        statusElement.style.padding = '5px 10px';
        statusElement.style.backgroundColor = connected ? 'green' : 'red';
        statusElement.style.color = 'white';
        statusElement.textContent = connected ? 'Connected' : 'Disconnected';
        if (!document.getElementById('connectivityStatus')) document.body.appendChild(statusElement);
    }

    document.getElementById("pushToBackendBtn").addEventListener("click", () => {
        console.log("Push to Backend button clicked.");
        window.api.send('toBackend', 'Push to backend triggered from renderer.');
        logEvent("Push to Backend action initiated.", "general");
    });

    document.getElementById("triggerPushButtonBtn").addEventListener("click", () => {
        console.log("Trigger Push Button clicked.");
        logEvent("Push Button Triggered.", "general");
        window.api.send('toBackend', 'Push Button Triggered.');
    });

    document.getElementById("setLocationBtn").addEventListener("click", () => {
        console.log("Set Location button clicked.");
        logEvent("Set Location button clicked.", "general");
        const latitude = prompt("Enter Latitude:");
        const longitude = prompt("Enter Longitude:");
        if (latitude && longitude) {
            const lat = parseFloat(latitude);
            const lon = parseFloat(longitude);
            if (!isNaN(lat) && !isNaN(lon)) {
                window.api.send('setLocation', { latitude: lat, longitude: lon });
                logEvent(`Location set to Latitude: ${lat}, Longitude: ${lon}`, "general");
            } else {
                logEvent("Invalid latitude or longitude input.", "warning");
                console.warn("Invalid latitude or longitude input.");
            }
        } else {
            logEvent("Location setting cancelled or invalid input.", "warning");
            console.warn("Location setting cancelled or invalid input.");
        }
    });

    setTimeout(initialize, 5000);

    function updateDateTime() {
        const now = new Date();
        const options = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true };
        const timeString = now.toLocaleTimeString('en-US', options);
        const dateString = now.toLocaleDateString('en-US');
        document.getElementById('dateTimeDisplay').textContent = `${dateString}, ${timeString}`;
    }
    setInterval(updateDateTime, 1000);

    console.log("Initializing LiteGraph...");
    const canvas = document.getElementById("graphcanvas");
    if (!canvas) {
        console.error("Canvas element not found!");
        logEvent("Canvas element not found!", "error");
        return;
    }

    const graph = new LGraph();
    console.log("LGraph instance created:", graph);

    const editor = new LGraphCanvas(canvas, graph);
    console.log("LGraphCanvas instance created:", editor);

    editor.allow_dragcanvas = true;
    editor.allow_dragnodes = true;
    editor.allow_interaction = true;
    editor.allow_searchbox = true;
    editor.allow_menu = true;

    graph.start();
    console.log("Graph execution started.");
    logEvent("Graph execution started.", "general");

    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight - 200;
        editor.resize();
    }
    window.addEventListener("resize", resizeCanvas);
    resizeCanvas();

    function determineDeviceType(node) {
        switch (node.type) {
            case "Lighting/HueLightControlNode":
                return "hue";
            case "Power/KasaPlugControlNode":
                return "kasa";
            case "Lighting/KasaLightControlNode":
                return "kasa";
            case "CC_Control_Nodes/hsv_control":
                return null;
            default:
                return "unknown";
        }
    }

    function formatTimeComponent(value) {
        return value !== undefined ? value.toString().padStart(2, '0') : "00";
    }

    function saveGraphLocal() {
        try {
            console.log("Saving graph...");
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
            console.log("Graph saved successfully.");
        } catch (error) {
            console.error("Error saving graph:", error);
            logEvent(`Error saving graph: ${error}`, "error");
        }
    }

    function loadGraphFromFileLocal(file) {
        console.log(`Loading graph from file: ${file.name}`);
        const reader = new FileReader();
        reader.onload = function(e) {
            const graphData = e.target.result;
            try {
                graph.clear();
                graph.configure(JSON.parse(graphData));
                graph.start();
                console.log("Graph loaded successfully from file");
                logEvent("Graph loaded successfully from file.");
                console.log("Graph execution started after loading.");
                logEvent("Graph execution started after loading.", "general");
            } catch (err) {
                console.error("Error loading graph from file:", err);
                logEvent(`Error loading graph from file: ${err}`, "error");
            }
        };
        reader.readAsText(file);
    }

    document.getElementById("saveGraphBtn").addEventListener("click", saveGraphLocal);
    document.getElementById("loadGraphBtn").addEventListener("click", () => {
        document.getElementById('fileInput').click();
    });
    document.getElementById('fileInput').addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            loadGraphFromFileLocal(file);
        }
    });

    console.log("Calling setupControls...");
    setupControls(graph);
    console.log("setupControls called successfully.");
});

function logEvent(message, level = "general") {
    console.log(`[${level.toUpperCase()}] ${message}`);
}