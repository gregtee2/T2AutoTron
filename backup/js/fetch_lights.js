function toggleLightList() {
    console.log("Toggle Light List button clicked"); // Debugging line
    const lightList = document.getElementById('lightList');
    if (lightList.style.display === 'none') {
        fetchLights();
    } else {
        lightList.style.display = 'none';
    }
}

function fetchLights() {
    console.log("Fetching lights"); // Debugging line
    fetch('http://127.0.0.1:5000/api/lights')  // Use the correct URL
        .then(response => response.json())
        .then(data => {
            console.log('Lights:', data);
            displayLights(data);
        })
        .catch((error) => {
            console.error('Error:', error);
            alert('Failed to fetch lights. Please ensure the server is running.');
        });
}

function displayLights(data) {
    const lightList = document.getElementById('lightList');
    lightList.innerHTML = '';
    for (const [name, info] of Object.entries(data)) {
        const button = document.createElement('button');
        button.innerText = name;
        button.onclick = () => addLightNode(info.id, name);
        lightList.appendChild(button);
    }
    lightList.style.display = 'block';
}

function addLightNode(lightId, lightName) {
    console.log("Adding light node:", lightId, lightName); // Debugging line
    const node = LiteGraph.createNode('custom/hue_light');
    node.pos = [Math.random() * 800, Math.random() * 600];
    node.properties.light_id = lightId;
    node.title = lightName;
    graph.add(node);
}
