class LightMergeNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Light Merge";
        this.size = [300, 150];
        this.properties = { mergedLights: [] };

        // Initial input
        this.addInput("Light 1", "light_info");
        this.numInputs = 1; // Start with one input

        this.addOutput("Merged Light Info", "light_info");

        this.lastLogTime = 0;
        this.logInterval = 1000;
        this.lastMergedIds = "";
    }

    onExecute() {
        let mergedLights = [];

        for (let i = 0; i < this.numInputs; i++) {
            const lightInfo = this.getInputData(i);
            if (lightInfo) {
                mergedLights.push(lightInfo);
            }
        }

        const mergedIds = mergedLights.map(light => light.light_id).join(",");

        this.setOutputData(0, { device_ids: mergedLights.map(light => light.light_id) });

        const currentTime = Date.now();
        if (currentTime - this.lastLogTime > this.logInterval && mergedIds !== this.lastMergedIds) {
            if (mergedLights.length > 0) {
                console.log("LightMergeNode: Merged device IDs:", mergedLights.map(light => light.light_id));
                this.lastMergedIds = mergedIds;
            }
            this.lastLogTime = currentTime;
        }

        this.adjustInputs(mergedLights.length);
    }

    adjustInputs(connectedLightsCount) {
        const expectedInputs = connectedLightsCount + 1;

        // Reset inputs to avoid duplicates
        while (this.inputs.length > 1) {
            this.removeInput(this.inputs.length - 1);
            this.numInputs--;
        }

        // Add inputs if necessary
        while (this.numInputs < expectedInputs) {
            this.addNewInput();
        }

        this.size[1] = Math.max(150, 50 + this.numInputs * 30);
    }

    addNewInput() {
        const inputLabel = `Light ${this.numInputs + 1}`;
        this.addInput(inputLabel, "light_info");
        console.log(`LightMergeNode: Adding ${inputLabel} as input ${this.numInputs + 1}`);
        this.numInputs++;
    }

    onConnectionsChange(type, slot) {
        if (type === LiteGraph.INPUT) {
            this.adjustInputs(this.numInputs);
        }
    }
}

// Register the node
LiteGraph.registerNodeType("custom/light_merge", LightMergeNode);
