class HueBridgeConfigNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Hue Bridge Config";
        this.size = [300, 150];

        // Properties to store IP and API key
        this.properties = {
            bridge_ip: "192.168.1.39",
            api_key: null // This will store the API key
        };

        this.addWidget("text", "Bridge IP", this.properties.bridge_ip, (value) => {
            this.properties.bridge_ip = value;
        });

        this.addWidget("button", "Get API Key", null, () => {
            this.getAPIKey();
        });

        // Add a text widget to display the API key once obtained
        this.apiKeyWidget = this.addWidget("text", "API Key", this.properties.api_key || "Not obtained yet", null);

        this.addOutput("Bridge Info", "bridge_info");
    }

    getAPIKey() {
        fetch(`http://${this.properties.bridge_ip}/api`, {
            method: "POST",
            body: JSON.stringify({ devicetype: "my_hue_app" }),
        })
        .then(response => response.json())
        .then(data => {
            if (data[0] && data[0].success) {
                const apiKey = data[0].success.username;
                this.properties.api_key = apiKey;

                // Update the widget to display the obtained API key
                this.apiKeyWidget.value = apiKey;

                console.log("API Key obtained:", apiKey);
                this.setDirtyCanvas(true);
            } else {
                console.error("Failed to obtain API key:", data);
            }
        })
        .catch(error => {
            console.error("Error obtaining API key:", error);
        });
    }

    onExecute() {
        const bridgeInfo = {
            bridge_ip: this.properties.bridge_ip,
            api_key: this.properties.api_key,
        };

        // Output the bridge info, including the API key
        this.setOutputData(0, bridgeInfo);
    }
}

// Register the node type with LiteGraph
LiteGraph.registerNodeType("custom/hue_bridge_config", HueBridgeConfigNode);
