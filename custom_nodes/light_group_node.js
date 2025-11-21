class LightGroupNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Light Group";

        // Set initial size of the node
        this.size = [400, 300];  // Adjust these dimensions as needed

        // Only one input for HSV
        this.addInput("HSV Info", "hsv_info");

        // Output for aggregated light info (device IDs)
        this.addOutput("Light Info", "light_info");

        // Internal storage for selected light nodes
        this.selectedLights = [];
        
        // Available lights in the graph
        this.availableLights = [];

        // Widget to fetch lights from the Hue Bridge
        this.addWidget("button", "Fetch Lights", null, () => {
            this.fetchLights();
        });

        // Track the combo widgets for light selection
        this.lightSelectionWidgets = [];
        this.addLightSelectionWidget();
    }

    fetchLights() {
        fetch('http://localhost:5000/api/lights')
            .then(response => response.json())
            .then(data => {
                // Process the lights and update the availableLights list
                this.availableLights = Object.entries(data).map(([name, info]) => ({
                    title: name,
                    properties: { 
                        light_id: info.id, 
                        bridge_ip: "192.168.1.39",  // Use the bridge_ip from your config
                        api_key: "slMTFvqVvFbReK3e2UwrKx2HfaKqxiUymbZ-Bdlk"  // Use the api_key from your config
                    }
                }));

                console.log("Available lights fetched:", this.availableLights);

                // Update the first light selection widget with the available lights
                this.updateLightSelectionWidget(0);
                this.graph.dirty_canvas = true; // Mark the canvas as needing a redraw
            })
            .catch(error => {
                console.error('Error fetching lights:', error);
            });
    }

    addLightSelectionWidget() {
        // Add a new combo widget for light selection
        const index = this.lightSelectionWidgets.length;
        const widget = this.addWidget("combo", `Select Light ${index + 1}`, null, (value) => {
            this.toggleLightSelection(value, index);
            this.addLightSelectionWidget(); // Add another widget for the next light
            this.forceResize();  // Force resize after adding a new widget
        }, { values: this.availableLights.map(light => light.title) });

        this.lightSelectionWidgets.push(widget);
        this.forceResize();  // Force resize after adding a new widget
    }

    updateLightSelectionWidget(index) {
        // Update the available options for a specific widget based on current selection
        const selectedTitles = this.selectedLights.map(light => light.title);
        const availableTitles = this.availableLights
            .map(light => light.title)
            .filter(title => !selectedTitles.includes(title));

        this.lightSelectionWidgets[index].options.values = availableTitles;
        this.graph.dirty_canvas = true; // Mark the canvas as needing a redraw
    }

    toggleLightSelection(lightTitle, widgetIndex) {
        // Find the light node by title
        const lightNode = this.availableLights.find(light => light.title === lightTitle);
        if (lightNode && !this.selectedLights.includes(lightNode)) {
            this.selectedLights.push(lightNode); // Add to selected lights
            console.log("Selected lights:", this.selectedLights);

            // Update the remaining widgets to exclude the selected light
            this.lightSelectionWidgets.forEach((widget, index) => {
                if (index > widgetIndex) {
                    this.updateLightSelectionWidget(index);
                }
            });

            this.forceResize();  // Force resize after updating selection
        }
    }

    forceResize() {
        // Adjust this size as needed to fit the widgets comfortably
        const minHeight = 300 + (this.lightSelectionWidgets.length * 30);
        this.size = [400, Math.max(minHeight, this.size[1])];
    }

    onConfigure() {
        // Force size when node is reconfigured
        this.forceResize();
    }

    onExecute() {
        const hsvInfo = this.getInputData(0);

        if (hsvInfo) {
            const delay = 200; // Delay in milliseconds between requests
            this.selectedLights.forEach((lightNode, index) => {
                setTimeout(() => {
                    const light_id = lightNode.properties.light_id;
                    const bridge_ip = lightNode.properties.bridge_ip;
                    const api_key = lightNode.properties.api_key;

                    if (light_id && bridge_ip && api_key) {
                        console.log(`Light ID: ${light_id}, Bridge IP: ${bridge_ip}, API Key: ${api_key}`);

                        const hueScaled = Math.round(hsvInfo.hue * 65535);
                        const satScaled = Math.round(hsvInfo.saturation * 254);
                        const briScaled = Math.round(hsvInfo.brightness);

                        const data = {
                            on: lightNode.properties.on,
                            bri: briScaled,
                            hue: hueScaled,
                            sat: satScaled
                        };

                        fetch(`http://${bridge_ip}/api/${api_key}/lights/${light_id}/state`, {
                            method: 'PUT',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify(data)
                        })
                        .then(response => response.json())
                        .then(responseData => {
                            console.log(`Light ${light_id} - State updated successfully:`, responseData);
                        })
                        .catch(error => {
                            console.error(`Light ${light_id} - Error updating state:`, error);
                        });
                    } else {
                        console.error("Light ID, Bridge IP, or API Key is undefined for one of the selected lights.");
                    }
                }, index * delay);  // Stagger the requests by the specified delay
            });
        }

        // Ensure device IDs are outputted correctly
        const deviceIDs = this.selectedLights.map(light => light.properties.light_id);
        
        // Add the debug logs here
        console.log("LightGroupNode outputting device IDs:", deviceIDs);
        console.log("Selected lights data:", this.selectedLights);

        this.setOutputData(0, { device_ids: deviceIDs });
    }
}

// Register the node type
LiteGraph.registerNodeType("custom/light_group", LightGroupNode);
