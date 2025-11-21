class ExecuteNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Execute";
        this.size = [200, 80];
        this.properties = { state: true, enable: false };

        this.addInput("Light Info", "light_info");
        this.addInput("State", "boolean");

        this.addWidget("toggle", "Enable", this.properties.enable, (value) => {
            this.properties.enable = value;
        });

        this.lastState = null;
        this.lastHsvs = {}; // Track last HSV values per light
        this.debounceTimeout = null;

        this.lastLogTime = 0;
        this.logInterval = 1000; // Log once every 1000ms
    }

    onExecute() {
        if (!this.properties.enable) {
            return;
        }

        const lightInfo = this.getInputData(0);
        let state = this.getInputData(1);

        if (state === undefined) {
            state = this.properties.state;
        }

        if (!lightInfo || !Array.isArray(lightInfo.device_ids)) {
            return;
        }

        let shouldUpdate = false;

        // Check for state changes
        if (state !== this.lastState) {
            this.lastState = state;
            this.properties.state = state;
            shouldUpdate = true;
        }

        // Check for HSV changes in each light
        let lights = lightInfo.lights || [];
        lights.forEach(light => {
            const lastHsv = this.lastHsvs[light.light_id] || {};
            const hsvChanged = 
                light.hsv.hue !== lastHsv.hue ||
                light.hsv.saturation !== lastHsv.saturation ||
                light.hsv.brightness !== lastHsv.brightness;

            if (hsvChanged) {
                this.lastHsvs[light.light_id] = { ...light.hsv };
                shouldUpdate = true;
            }
        });

        if (shouldUpdate) {
            if (this.debounceTimeout) {
                clearTimeout(this.debounceTimeout);
            }

            this.debounceTimeout = setTimeout(() => {
                lights.forEach(light => {
                    if (light.light_id && lightInfo.bridge_ip && lightInfo.api_key) {
                        const url = `http://${lightInfo.bridge_ip}/api/${lightInfo.api_key}/lights/${light.light_id}/state`;

                        const bodyData = {
                            on: state,
                            hue: Math.round(light.hsv.hue * 65535), // Hue in range [0, 65535]
                            sat: Math.round(light.hsv.saturation * 254),  // Saturation in range [0, 254]
                            bri: Math.round(light.hsv.brightness)        // Brightness in range [1, 254]
                        };

                        fetch(url, {
                            method: 'PUT',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify(bodyData)
                        })
                        .then(response => response.json())
                        .then(responseData => {
                            console.log(`Light ${light.light_id} - State triggered successfully:`, responseData);
                        })
                        .catch(error => {
                            console.error(`Light ${light.light_id} - Error triggering state:`, error);
                        });
                    } else {
                        console.error(`Missing bridge_ip or api_key for light ${light.light_id}`);
                    }
                });
            }, 500); // Wait 500ms before processing
        }
    }

    configure(data) {
        super.configure(data);
        this.properties.enable = false; // Reset enable to false on load
    }
}

LiteGraph.registerNodeType("custom/execute", ExecuteNode);
