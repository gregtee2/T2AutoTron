class LightMergeNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Light Merge";
        this.size = [300, 150];
        this.properties = { mergedLights: [] };

        // Initial input for at least one light
        this.addInput("Light 1", "light_info");

        // Output for the merged light info
        this.addOutput("Merged Light Info", "light_info");

        // Track the number of inputs
        this.numInputs = 1;
    }

    onExecute() {
        let mergedLights = [];

        for (let i = 0; i < this.numInputs; i++) {
            const lightInfo = this.getInputData(i);
            if (lightInfo) {
                mergedLights.push(lightInfo);
            }
        }

        // Set the combined light info as the output
        this.setOutputData(0, { device_ids: mergedLights.map(light => light.light_id) });
    }

    // Method to dynamically add more inputs as needed
    addNewInput() {
        this.numInputs++;
        this.addInput(`Light ${this.numInputs}`, "light_info");
        this.size[1] += 30; // Adjust the node height to fit more inputs
    }
}

// Register the node type
LiteGraph.registerNodeType("custom/light_merge", LightMergeNode);
