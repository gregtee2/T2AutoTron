class HueLightNodePlus extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Hue Light Plus";
        this.size = [260, 150];

        // Fetch IP and API key from localStorage
        const hueGlobals = JSON.parse(localStorage.getItem('hue_globals')) || {};
        this.properties = { 
            light_id: null,  // Initially null, will be set by dropdown
            light_name: "Select Light", // Placeholder name
            hsv: { hue: 0, saturation: 1, brightness: 254 },
            api_key: hueGlobals.apiKey || this.getApiKeyFromLocalStorage(),
            bridge_ip: hueGlobals.bridgeIp || this.getBridgeIpFromLocalStorage()
        };

        this.addInput("HSV Info", "hsv_info");
        this.addOutput("Light Info", "light_info");

        // Fetch the list of lights and add the dropdown
        this.fetchAndAddLightDropdown();
    }

    // Function to fetch API key from localStorage
    getApiKeyFromLocalStorage() {
        const apiKey = localStorage.getItem('apiKey');
        if (!apiKey) {
            console.error("API Key not found in localStorage!");
        }
        return apiKey;
    }

    // Function to fetch Bridge IP from localStorage
    getBridgeIpFromLocalStorage() {
        const bridgeIp = localStorage.getItem('bridgeIp');
        if (!bridgeIp) {
            console.error("Bridge IP not found in localStorage!");
        }
        return bridgeIp;
    }

    fetchAndAddLightDropdown() {
        const url = `http://${this.properties.bridge_ip}/api/${this.properties.api_key}/lights`;
        console.log("Fetching lights from:", url); // Log the URL

        fetch(url)
            .then(response => response.json())
            .then(data => {
                const lights = data;
                const lightOptions = Object.entries(lights).map(([id, light]) => ({
                    id: id,
                    name: light.name
                }));

                // Add a dropdown widget for light selection
                this.addWidget("combo", "Light", this.properties.light_name, (selectedLight) => {
                    const selected = lightOptions.find(light => light.name === selectedLight);
                    if (selected) {
                        this.properties.light_id = selected.id;
                        this.properties.light_name = selected.name;
                        this.title = `Hue Light - ${this.properties.light_name}`;
                    }
                }, { values: lightOptions.map(light => light.name) });

                // Set the node title to the currently selected light
                if (this.properties.light_id) {
                    const selected = lightOptions.find(light => light.id === this.properties.light_id);
                    if (selected) {
                        this.title = `Hue Light - ${selected.name}`;
                    }
                }
            })
            .catch(error => {
                console.error('Error fetching lights:', error);
            });
    }

    onExecute() {
        if (!this.properties.light_id || !this.properties.bridge_ip || !this.properties.api_key) {
            console.error("Missing bridge_ip or api_key for light:", this.properties.light_id);
            return; // Exit if no light is selected or if bridge IP/API key is missing
        }

        const hsvInput = this.getInputData(0);  // HSV input

        if (hsvInput !== undefined) {
            const hsvString = JSON.stringify(hsvInput);
            if (hsvString !== JSON.stringify(this.properties.hsv)) {
                this.properties.hsv = hsvInput;
                this.updateLightState();
            }
        }

        const outputData = {
            light_id: this.properties.light_id,
            hsv: this.properties.hsv,
            bridge_ip: this.properties.bridge_ip,  // Include bridge IP
            api_key: this.properties.api_key       // Include API key
        };
        this.setOutputData(0, outputData);

        // Update color swatch on the node
        this.updateColorSwatch();
    }

    updateLightState() {
        const hueScaled = Math.round(this.properties.hsv.hue * 65535);
        const satScaled = Math.round(this.properties.hsv.saturation * 254);
        const briScaled = Math.round(this.properties.hsv.brightness);

        const data = {
            bri: briScaled,
            hue: hueScaled,
            sat: satScaled
        };

        const url = `http://${this.properties.bridge_ip}/api/${this.properties.api_key}/lights/${this.properties.light_id}/state`;
        console.log('Sending PUT request to:', url);  // Log the URL

        fetch(url, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        })
        .then(response => response.json())
        .catch(error => {
            console.error('HueLightNodePlus - Error updating light state:', error);
        });
    }

    updateColorSwatch() {
        const hsv = this.properties.hsv;
        const rgb = this.hsvToRgb(hsv.hue, hsv.saturation, hsv.brightness / 254);
        const colorHex = this.rgbToHex(rgb[0], rgb[1], rgb[2]);

        this.boxcolor = colorHex; // Set the border color to the current light color

        if (this.graph && this.graph.canvas) {
            this.graph.canvas.draw(true, true);
        }
    }

    hsvToRgb(h, s, v) {
        let r, g, b;
        const i = Math.floor(h * 6);
        const f = h * 6 - i;
        const p = v * (1 - s);
        const q = v * (1 - f * s);
        const t = v * (1 - (1 - f) * s);
        switch (i % 6) {
            case 0: r = v, g = t, b = p; break;
            case 1: r = q, g = v, b = p; break;
            case 2: r = p, g = v, b = t; break;
            case 3: r = p, g = q, b = v; break;
            case 4: r = t, g = p, b = v; break;
            case 5: r = v, g = p, b = q; break;
        }
        return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    }

    rgbToHex(r, g, b) {
        return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
    }

    // Override the serialize method to include custom properties
    serialize() {
        const data = super.serialize();
        data.properties = this.properties;
        return data;
    }

    // Override the configure method to restore saved properties
    configure(data) {
        super.configure(data);
        this.properties = data.properties || this.properties;
        this.title = `Hue Light - ${this.properties.light_name}`;
        this.updateColorSwatch(); // Update the swatch color on load
    }
}

// Register the new node type with LiteGraph
LiteGraph.registerNodeType("custom/hue_light_plus", HueLightNodePlus);
