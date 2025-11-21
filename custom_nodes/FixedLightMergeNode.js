class FixedLightMergeNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Fixed Light Merge";
        this.size = [300, 150];

        // Add 5 fixed inputs
        for (let i = 1; i <= 5; i++) {
            this.addInput(`Light ${i}`, "light_info");
        }

        // Single output for the merged light info
        this.addOutput("Merged Light Info", "light_info");

        // Store the last merged IDs to prevent repeated logging
        this.lastMergedIds = "";
    }

    onExecute() {
        let mergedLights = [];
        let bridge_ip = null;
        let api_key = null;

        // Collect data from all inputs
        for (let i = 0; i < this.inputs.length; i++) {
            const lightInfo = this.getInputData(i);
            if (lightInfo) {
                // Merge the lights while preserving their individual info
                if (lightInfo.device_ids && Array.isArray(lightInfo.device_ids)) {
                    mergedLights = mergedLights.concat(lightInfo.device_ids.map(id => ({
                        light_id: id,
                        hsv: lightInfo.hsv
                    })));
                } else {
                    mergedLights.push(lightInfo);
                }

                // Capture the bridge_ip and api_key from the first valid input
                if (!bridge_ip && lightInfo.bridge_ip) {
                    bridge_ip = lightInfo.bridge_ip;
                }
                if (!api_key && lightInfo.api_key) {
                    api_key = lightInfo.api_key;
                }
            }
        }

        if (mergedLights.length > 0) {
            const mergedIds = mergedLights.map(light => light.light_id).join(",");

            // Only log if the merged IDs have changed
            if (mergedIds !== this.lastMergedIds) {
                console.log("FixedLightMergeNode: Merged device IDs:", mergedIds);
                this.lastMergedIds = mergedIds; // Update last merged IDs
            }

            // Set the combined light info as the output
            this.setOutputData(0, { 
                device_ids: mergedLights.map(light => light.light_id),
                lights: mergedLights, // Pass through individual light info
                bridge_ip: bridge_ip,  // Include bridge_ip
                api_key: api_key       // Include api_key
            });
        } else {
            // If no lights are connected, ensure we don't send an empty output
            this.setOutputData(0, null);
        }
    }
}

// Register the node type
LiteGraph.registerNodeType("custom/fixed_light_merge", FixedLightMergeNode);
