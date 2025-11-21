document.addEventListener("DOMContentLoaded", function () {
    const toggleButton = document.getElementById("toggleLightListBtn");
    const lightListPanel = document.getElementById("lightListPanel");
    const lightList = document.getElementById("lightList");

    if (!toggleButton) {
        console.error("Toggle Button not found!");
        return;
    }

    toggleButton.addEventListener("click", function () {
        console.log("Toggle button clicked. LightListPanel display is currently:", lightListPanel.style.display);
        if (lightListPanel.style.display === "none" || lightListPanel.style.display === "") {
            lightListPanel.style.display = "block";
            fetchLights(); // Fetch and display lights
        } else {
            lightListPanel.style.display = "none";
        }
    });

    function fetchLights() {
        console.log("Fetching lights...");
        fetch('http://127.0.0.1:5000/api/lights')
            .then(response => response.json())
            .then(data => {
                console.log('Fetched Lights:', data);
                displayLights(data);
            })
            .catch(error => {
                console.error('Error fetching lights:', error);
                alert('Failed to fetch lights. Please ensure the server is running.');
            });
    }

    function displayLights(data) {
        console.log("Populating light list...");
        lightList.innerHTML = ''; // Clear existing lights
        for (const [name, info] of Object.entries(data)) {
            const listItem = document.createElement('li');
            listItem.textContent = `${name} (ID: ${info.id}) - State: ${info.state ? 'On' : 'Off'}`;
            listItem.dataset.lightId = info.id;
            listItem.addEventListener("click", function () {
                console.log(`Selected Light: ${name} with ID: ${info.id}`);
                addLightNode(info.id, name);
            });
            lightList.appendChild(listItem);
        }
        lightListPanel.style.display = "block";  // Ensure it's displayed after population
        console.log("Light list population complete and displayed.");
    }

    function addLightNode(lightId, lightName) {
        console.log("Adding light node:", lightId, lightName);
        const node = LiteGraph.createNode('custom/hue_light');
        node.pos = [Math.random() * 800, Math.random() * 600];
        node.properties.light_id = lightId;
        node.title = lightName;
        graph.add(node);
    }
});
