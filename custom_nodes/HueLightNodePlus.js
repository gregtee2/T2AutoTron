class HueLightNodePlus extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Hue Light Plus";
        this.size = [210, 58];

        this.properties = {
            light_id: "",
            light_name: "Select Light",
            hsv: { hue: 0, saturation: 1, brightness: 254 },
            api_key: this.getApiKeyFromLocalStorage(),
            bridge_ip: this.getBridgeIpFromLocalStorage(),
            lights_fetched: false
        };

        this.addInput("HSV Info", "hsv_info");
        this.addOutput("Light Info", "light_info");

        // Initialize the widget array
        this.widgets_up = true;

        // Fetch and populate the light dropdown if we have the necessary info
        if (this.properties.api_key && this.properties.bridge_ip) {
            this.fetchAndAddLightDropdown();
        } else {
            console.error("API Key or Bridge IP is missing. Please check localStorage.");
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

    getApiKeyFromLocalStorage() {
        const apiKey = localStorage.getItem('apiKey');
        if (!apiKey) {
            console.error("API Key not found in localStorage!");
        }
        return apiKey;
    }

    getBridgeIpFromLocalStorage() {
        const bridgeIp = localStorage.getItem('bridgeIp');
        if (!bridgeIp) {
            console.error("Bridge IP not found in localStorage!");
        }
        return bridgeIp;
    }

    fetchAndAddLightDropdown() {
        const url = `http://${this.properties.bridge_ip}/api/${this.properties.api_key}/lights`;
        console.log("Fetching lights from:", url);

        fetch(url)
            .then(response => response.json())
            .then(data => {
                const lights = data;
                const lightOptions = Object.entries(lights).map(([id, light]) => ({
                    id: id,
                    name: light.name
                }));

                // Clear any existing widgets to prevent duplicates
                this.widgets = [];

                // Add the dropdown widget for selecting a light
                this.addWidget("combo", "Light", this.properties.light_name, (selectedLight) => {
                    const selected = lightOptions.find(light => light.name === selectedLight);
                    if (selected) {
                        this.properties.light_id = selected.id;
                        this.properties.light_name = selected.name;
                        this.title = `Hue Light - ${this.properties.light_name}`;
                    }
                }, { values: lightOptions.map(light => light.name) });

                // Update title if a light is already selected
                if (this.properties.light_id) {
                    const selected = lightOptions.find(light => light.id === this.properties.light_id);
                    if (selected) {
                        this.title = `Hue Light - ${selected.name}`;
                    }
                }

                this.properties.lights_fetched = true; // Mark lights as fetched
            })
            .catch(error => {
                console.error('Error fetching lights:', error);
            });
    }

    onExecute() {
        if (!this.properties.bridge_ip || !this.properties.api_key) {
            console.error("Missing bridge_ip or api_key for light:", this.properties.light_id);
            return;
        }

        // Fetch lights if not already done
        if (!this.properties.lights_fetched) {
            this.fetchAndAddLightDropdown();
        }

        const hsvInput = this.getInputData(0);
        if (hsvInput !== undefined) {
            this.properties.hsv = hsvInput;
        }

        const outputData = {
            light_id: this.properties.light_id,
            hsv: this.properties.hsv,
            bridge_ip: this.properties.bridge_ip,
            api_key: this.properties.api_key
        };
        this.setOutputData(0, outputData);

        this.updateColorSwatch();
    }

    updateColorSwatch() {
        const hsv = this.properties.hsv;
        const rgb = this.hsvToRgb(hsv.hue, hsv.saturation, hsv.brightness / 254);
        const colorHex = this.rgbToHex(rgb[0], rgb[1], rgb[2]);

        this.boxcolor = colorHex;

        if (this.graph && this.graph.canvas) {
            this.graph.canvas.draw(true, true);
        }
    }

    // Override the serialize method to save the node's state
    serialize() {
        const data = super.serialize();
        data.properties = this.properties;
        return data;
    }

    // Override the configure method to restore the node's state
    configure(data) {
        super.configure(data);
        this.properties = data.properties || this.properties;
        this.title = `Hue Light - ${this.properties.light_name}`;
        this.updateColorSwatch();
        this.fetchAndAddLightDropdown(); // Re-fetch lights to update the dropdown
    }
}

LiteGraph.registerNodeType("custom/hue_light_plus", HueLightNodePlus);
