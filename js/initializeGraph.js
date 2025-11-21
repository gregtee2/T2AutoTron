let graph;
let canvas;

function resizeCanvas() {
    const ratio = window.devicePixelRatio || 1;
    canvas.canvas.width = window.innerWidth * ratio;
    canvas.canvas.height = window.innerHeight * ratio;
    canvas.canvas.style.width = window.innerWidth + "px";
    canvas.canvas.style.height = window.innerHeight + "px";
    canvas.setDirty(true, true);
}

function initializeGraph() {
    console.log("Initializing graph...");

    graph = new LiteGraph.LGraph();  // Initialize graph
    canvas = new LiteGraph.LGraphCanvas("#graphcanvas", graph);
    graph.start();
    resizeCanvas();

    // Add onLoad call to reinitialize nodes after loading the graph
    graph.onAfterLoad = function() {
        console.log("Executing nodes after graph load...");
        for (const node of graph._nodes) {
            if (node.onLoad) {
                node.onLoad();  // Call the onLoad function if it exists
                console.log(`Node ${node.title} - onLoad called`);
            }
            if (node.onExecute) {
                node.onExecute();  // Trigger execution on all nodes
                console.log(`Node ${node.title} - onExecute called`);
            }
        }

        // Manually trigger data flow from Brightness Control to HueLightNode
        const brightnessControlNode = graph.findNodeByTitle("Brightness Control");
        const executeNode = graph.findNodeByTitle("Execute");
        if (brightnessControlNode && executeNode) {
            brightnessControlNode.onExecute();
            executeNode.onExecute();
            console.log("Brightness and Execute nodes manually executed after load.");
        }

        graph.start();  // Ensure the graph is running after loading
        console.log('Graph has been initialized and is running after loading');
    };
}

window.addEventListener("load", initializeGraph);
window.addEventListener('resize', resizeCanvas);

// Flag to prevent multiple dialogs
let isDialogOpen = false;

// Client-side save functionality
const saveButton = document.getElementById("saveGraphBtn");
if (saveButton) {
    saveButton.addEventListener("click", handleSaveGraph);
} else {
    console.error("saveGraphBtn not found.");
}

function handleSaveGraph(event) {
    if (isDialogOpen) {
        console.log("Dialog already open. Skipping save.");
        return; // Prevent opening another dialog
    }

    isDialogOpen = true;
    console.log("Opening save dialog.");

    // Prevent default behavior and stop the event from propagating
    event.preventDefault();
    event.stopPropagation();

    const graphData = JSON.stringify(graph.serialize());

    // Create a Blob from the graph data
    const blob = new Blob([graphData], { type: 'application/json' });

    // Generate a default filename with timestamp
    const defaultFilename = `graph_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;

    // Use the native file save dialog
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = defaultFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    console.log("Graph saved successfully on client-side.");

    isDialogOpen = false; // Reset the flag once the save is complete
}

function displayApiKeyStatus() {
    // Retrieve the globalVars object from localStorage
    const globalVars = JSON.parse(localStorage.getItem('globalVars')) || {};
    const bridgeIP = globalVars.hueBridgeIP || 'Not Set';
    const apiKey = globalVars.hueApiKey || 'Not Set';

    const ipElement = document.getElementById("bridgeIP");
    const apiKeyElement = document.getElementById("apiKey");

    if (ipElement && apiKeyElement) {
        ipElement.textContent = `Bridge IP: ${bridgeIP}`;
        apiKeyElement.textContent = `API Key: ${apiKey}`;
    } else {
        console.error("IP Address or API Key elements not found.");
    }
}

// Client-side load functionality
document.getElementById("loadGraphBtn").addEventListener("click", function (event) {
    if (isDialogOpen) {
        console.log("Dialog already open. Skipping load.");
        return; // Prevent opening another dialog
    }

    isDialogOpen = true;
    console.log("Opening load dialog.");

    // Prevent default behavior and stop the event from propagating
    event.preventDefault();
    event.stopPropagation();

    console.log("Load button clicked. Opening file dialog...");
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';

    fileInput.addEventListener('change', function (event) {
        const file = event.target.files[0];
        if (file) {
            console.log(`File selected: ${file.name}`);
            const reader = new FileReader();
            reader.onload = function(e) {
                const graphData = e.target.result;
                console.log("Graph data loaded from file.");

                // Clear the graph and reset it without reloading the UI
                graph.clear();
                graph.configure(JSON.parse(graphData));
                console.log("Graph reconfigured within the same session.");

                // Reinitialize and execute nodes
                graph.onAfterLoad();
            };
            reader.readAsText(file);
        } else {
            console.log("No file selected.");
        }

        isDialogOpen = false; // Reset the flag once loading is complete
    });

    fileInput.click();
});
