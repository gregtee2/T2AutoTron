// Define ExecuteNode
class ExecuteNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Execute";
        this.size = [200, 80];
        this.properties = { state: true, enable: false }; // Added enable property

        this.addInput("Light Info", "light_info");
        this.addInput("State", "boolean");

        this.addWidget("toggle", "Enable", this.properties.enable, (value) => {
            this.properties.enable = value;
        });

        this.lastState = null;
        this.debounceTimeout = null;

        // For debouncing logs
        this.lastLogTime = 0;
        this.logInterval = 1000; // Log once every 1000ms
    }

    onExecute() {
        // Check if the node is enabled before proceeding
        if (!this.properties.enable) {
            console.log(`ExecuteNode is disabled. Skipping execution.`);
            return;
        }

        const lightInfo = this.getInputData(0);
        let state = this.getInputData(1);

        // Use default state if input state is undefined
        if (state === undefined) {
            state = this.properties.state;
        }

        // If lightInfo is invalid, exit early
        if (!lightInfo || (!Array.isArray(lightInfo.device_ids) && !lightInfo.light_id)) {
            return;
        }

        // Check if state has changed
        if (state !== this.lastState) {
            this.lastState = state;
            this.properties.state = state;

            // Debounce the input checking and state triggering
            if (this.debounceTimeout) {
                clearTimeout(this.debounceTimeout);
            }

            this.debounceTimeout = setTimeout(() => {
                let deviceIds = lightInfo.device_ids;

                // Fallback to single light_id if device_ids is not provided
                if (!Array.isArray(deviceIds) && lightInfo.light_id) {
                    deviceIds = [lightInfo.light_id];
                }

                if (!Array.isArray(deviceIds)) {
                    return;
                }

                deviceIds.forEach(light_id => {
                    if (light_id && lightInfo.bridge_ip && lightInfo.api_key) {
                        const url = `http://${lightInfo.bridge_ip}/api/${lightInfo.api_key}/lights/${light_id}/state`;
                        console.log('Triggering light state update with URL:', url);

                        fetch(url, {
                            method: 'PUT',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({ on: state })
                        })
                        .then(response => response.json())
                        .then(responseData => {
                            console.log(`Light ${light_id} - State triggered successfully:`, responseData);
                        })
                        .catch(error => {
                            console.error(`Light ${light_id} - Error triggering state:`, error);
                        });
                    } else {
                        console.error(`Missing bridge_ip or api_key for light ${light_id}`);
                    }
                });
            }, 500); // Wait 500ms before processing, to avoid rapid re-triggers
        }
    }

    // Override configure to reset enable to false when loading from a saved graph
    configure(data) {
        super.configure(data);
        this.properties.enable = false; // Reset enable to false on load
    }
}

// Register the node type
LiteGraph.registerNodeType("custom/execute", ExecuteNode);
