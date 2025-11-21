class InsteonDeviceNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Insteon Device";
        this.size = [260, 150];
        this.properties = { 
            device_id: null, 
            device_name: "Select Device", 
            command: "On",  // Example commands: "On", "Off", "Dim"
            level: 100  // Used for dimming, 0-100%
        };

        this.addInput("Command", "string");
        this.addOutput("Status", "string");

        // Fetch the list of Insteon devices from HomeSeer and add the dropdown
        this.fetchAndAddDeviceDropdown();
    }

    fetchAndAddDeviceDropdown() {
        fetch(`http://YOUR_HOMESERVER_IP/api/devices`)
            .then(response => response.json())
            .then(data => {
                const devices = data;
                const deviceOptions = devices.map(device => ({
                    id: device.ref,  // Use the appropriate identifier
                    name: device.name
                }));

                // Add a dropdown widget for device selection
                this.addWidget("combo", "Device", this.properties.device_name, (selectedDevice) => {
                    const selected = deviceOptions.find(device => device.name === selectedDevice);
                    if (selected) {
                        this.properties.device_id = selected.id;
                        this.properties.device_name = selected.name;
                        this.title = `Insteon Device - ${this.properties.device_name}`;
                    }
                }, { values: deviceOptions.map(device => device.name) });

                // Set the node title to the currently selected device
                if (this.properties.device_id) {
                    const selected = deviceOptions.find(device => device.id === this.properties.device_id);
                    if (selected) {
                        this.title = `Insteon Device - ${selected.name}`;
                    }
                }
            })
            .catch(error => {
                console.error('Error fetching Insteon devices:', error);
            });
    }

    onExecute() {
        if (!this.properties.device_id) {
            return; // Exit if no device is selected
        }

        const commandInput = this.getInputData(0);  // Command input

        if (commandInput !== undefined) {
            this.properties.command = commandInput;
            this.sendCommandToInsteonDevice();
        }

        const outputData = {
            device_id: this.properties.device_id,
            command: this.properties.command,
            level: this.properties.level  // Include dim level if applicable
        };
        this.setOutputData(0, outputData);
    }

    sendCommandToInsteonDevice() {
        const commandUrl = `http://YOUR_HOMESERVER_IP/api/device/${this.properties.device_id}/command/${this.properties.command}`;
        
        fetch(commandUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ level: this.properties.level })  // Include level for dimming
        })
        .then(response => response.json())
        .catch(error => {
            console.error('InsteonDeviceNode - Error sending command:', error);
        });
    }

    // Optional: Include a serialize/deserialize method if needed
}

// Register the new node type with LiteGraph
LiteGraph.registerNodeType("custom/insteon_device", InsteonDeviceNode);
