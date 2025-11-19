class LightInfoExtractorNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Light Info Extractor";
        this.size = [220, 150];

        // Properties
        this.properties = {
            selectedLight: "First Available", // Default to first light in the list
            propertyToExtract: "status", // Default property to extract
            debug: false
        };

        // Input
        this.addInput("Light Info", "light_info");

        // Outputs
        this.addOutput("Condition", "boolean"); // For boolean properties like status
        this.addOutput("Value", "number");      // For numerical properties like brightness, energy

        // Setup widgets
        this.setupWidgets();
    }

    setupWidgets() {
        // Dropdown to select the light
        this.lightSelector = this.addWidget(
            "combo",
            "Select Light",
            this.properties.selectedLight,
            (value) => {
                this.properties.selectedLight = value;
                this.setDirtyCanvas(true);
            },
            {
                values: ["First Available"] // Will be updated dynamically
            }
        );

        // Dropdown to select the property to extract
        this.propertySelector = this.addWidget(
            "combo",
            "Property",
            this.properties.propertyToExtract,
            (value) => {
                this.properties.propertyToExtract = value;
                this.setDirtyCanvas(true);
            },
            {
                values: ["status", "hue", "saturation", "brightness", "energy"]
            }
        );

        // Debug toggle
        this.addWidget(
            "toggle",
            "Debug",
            this.properties.debug,
            (value) => {
                this.properties.debug = value;
                this.setDirtyCanvas(true);
            },
            {
                label: "Debug Logging"
            }
        );
    }

    onExecute() {
        const lightInfo = this.getInputData(0);
        if (!lightInfo || !lightInfo.lights || !lightInfo.lights.length) {
            this.setOutputData(0, false); // Condition
            this.setOutputData(1, 0);    // Value
            if (this.properties.debug) {
                console.log("[LightInfoExtractorNode] No light info available.");
            }
            return;
        }

        // Update the light selector options dynamically
        const lightOptions = ["First Available", ...lightInfo.lights.map(light => `${light.name} (ID: ${light.light_id})`)];
        if (this.lightSelector.options.values.join(",") !== lightOptions.join(",")) {
            this.lightSelector.options.values = lightOptions;
            if (!lightOptions.includes(this.properties.selectedLight)) {
                this.properties.selectedLight = "First Available";
                this.lightSelector.value = "First Available";
            }
        }

        // Select the light to extract data from
        let selectedLight = null;
        if (this.properties.selectedLight === "First Available") {
            selectedLight = lightInfo.lights[0];
        } else {
            selectedLight = lightInfo.lights.find(light => `${light.name} (ID: ${light.light_id})` === this.properties.selectedLight);
        }

        if (!selectedLight) {
            this.setOutputData(0, false);
            this.setOutputData(1, 0);
            if (this.properties.debug) {
                console.log("[LightInfoExtractorNode] No light selected or found.");
            }
            return;
        }

        // Extract the selected property
        let condition = false;
        let value = 0;

        switch (this.properties.propertyToExtract) {
            case "status":
                condition = selectedLight.status === "On";
                value = condition ? 1 : 0; // Map to 1 or 0 for numerical output
                break;
            case "hue":
                condition = selectedLight.hue > 0; // Arbitrary condition for boolean output
                value = selectedLight.hue || 0;
                break;
            case "saturation":
                condition = selectedLight.saturation > 0;
                value = selectedLight.saturation || 0;
                break;
            case "brightness":
                condition = selectedLight.brightness > 0;
                value = selectedLight.brightness || 0;
                break;
            case "energy":
                condition = selectedLight.energy > 0;
                value = selectedLight.energy || 0;
                break;
            default:
                condition = false;
                value = 0;
        }

        // Set outputs
        this.setOutputData(0, condition); // Boolean output
        this.setOutputData(1, value);     // Numerical output

        if (this.properties.debug) {
            console.log(
                `[LightInfoExtractorNode] Light="${selectedLight.name} (ID: ${selectedLight.light_id})", ` +
                `Property=${this.properties.propertyToExtract}, ` +
                `Condition=${condition}, ` +
                `Value=${value}`
            );
        }
    }

    serialize() {
        const data = super.serialize();
        data.properties = { ...this.properties };
        return data;
    }

    configure(data) {
        super.configure(data);
        this.properties = data.properties || this.properties;
        this.lightSelector.value = this.properties.selectedLight;
        this.propertySelector.value = this.properties.propertyToExtract;
    }
}

LiteGraph.registerNodeType("Utility/LightInfoExtractor", LightInfoExtractorNode);
console.log("LightInfoExtractorNode - Registered successfully under 'Utility' category.");