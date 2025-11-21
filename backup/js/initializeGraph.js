// initializeGraph.js

let graph;
let canvas;

// Function to resize the canvas based on window size
function resizeCanvas() {
    if (canvas && canvas.canvas) {
        canvas.canvas.width = window.innerWidth;
        canvas.canvas.height = window.innerHeight;
        canvas.resize();
    }
}

// Function to fetch and display the list of available lights
function fetchAndDisplayLightList() {
    fetch('http://localhost:5000/api/lights')
        .then(response => response.json())
        .then(data => {
            const lightListElement = document.getElementById('lightList');
            lightListElement.innerHTML = ''; // Clear existing list

            data.lights.forEach(light => {
                const li = document.createElement('li');
                li.textContent = `ID: ${light.id}, Name: ${light.name}`;
                lightListElement.appendChild(li);
            });
        })
        .catch(error => {
            console.error('Error fetching lights:', error);
        });
}

// Function to toggle the visibility of the Light List panel
function toggleLightList() {
    const panel = document.getElementById('lightListPanel');
    if (panel.style.display === 'none' || panel.style.display === '') {
        fetchAndDisplayLightList(); // Refresh the list every time it's shown
        panel.style.display = 'block';
    } else {
        panel.style.display = 'none';
    }
}

// Function to initialize the LiteGraph and canvas
function initializeGraph() {
    // Create the LiteGraph and canvas
    graph = new LiteGraph.LGraph();
    canvas = new LiteGraph.LGraphCanvas("#graphcanvas", graph);
    graph.start();

    // Add custom nodes to the graph
    addCustomNodesToGraph();

    // Resize canvas to fit window
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Set up the Toggle Light List button
    const toggleButton = document.getElementById('toggleLightListBtn');
    toggleButton.addEventListener('click', toggleLightList);
}

// Function to add custom nodes to the graph and connect them
function addCustomNodesToGraph() {
    // Create instances of custom nodes
    const hueLightNode = LiteGraph.createNode("custom/hue_light");
    hueLightNode.pos = [300, 200];
    graph.add(hueLightNode);

    const triggerNode = LiteGraph.createNode("custom/trigger");
    triggerNode.pos = [600, 200];
    graph.add(triggerNode);

    const brightnessControlNode = LiteGraph.createNode("custom/brightness_control");
    brightnessControlNode.pos = [300, 400];
    graph.add(brightnessControlNode);

    const pushButtonNode = LiteGraph.createNode("custom/pushbutton");
    pushButtonNode.pos = [600, 400];
    graph.add(pushButtonNode);

    // Connect nodes
    brightnessControlNode.connect(0, hueLightNode, 0); // Brightness to Hue Light
    hueLightNode.connect(0, triggerNode, 0); // Light Info to Trigger
    pushButtonNode.connect(0, triggerNode, 1); // Button State to Trigger
}

// Initialize the graph once the window loads
window.addEventListener('load', initializeGraph);
