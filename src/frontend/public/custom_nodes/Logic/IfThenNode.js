// File: IfThenNode.js

class IfThenNode extends LiteGraph.LGraphNode {
    constructor() {
        super(); // Essential for proper inheritance

        this.title = "If-Then";
        this.color = "#FFAA00"; // Distinct color for visibility
        this.size = [180, 100];

        // Define Outputs
        this.addOutput("Action Performed", "action");

        // Define Properties
        this.properties = {
            monitorDeviceId: "",
            parameter: "",
            operator: "==",
            value: "",
            action: "turnOn",
            targetDeviceId: "",
            pollingInterval: 5000 // in milliseconds
        };

        // Internal State
        this.actionPerformed = false;
        this.intervalId = null;

        console.log("IfThenNode - Constructor complete.");
    }

    // Called when the node is added to the graph
    onAdded() {
        this.startPolling();
    }

    // Called when the node is removed from the graph
    onRemoved() {
        this.stopPolling();
    }

    // Start polling the monitor device's state
    startPolling() {
        if (this.intervalId) return; // Prevent multiple intervals

        this.intervalId = setInterval(async () => {
            try {
                const deviceState = await this.getDeviceState(this.properties.monitorDeviceId);
                const paramValue = deviceState[this.properties.parameter];
                this.evaluateCondition(paramValue);
            } catch (error) {
                console.error('IfThenNode - Error fetching device state:', error);
            }
        }, this.properties.pollingInterval);
    }

    // Stop polling
    stopPolling() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    // Fetch the current state of the monitor device via the backend API
    async getDeviceState(deviceId) {
        if (!deviceId) {
            console.warn("IfThenNode - Monitor Device ID is not set.");
            return {};
        }

        const response = await fetch(`/api/devices/${deviceId}/state`);
        if (!response.ok) {
            throw new Error(`IfThenNode - Failed to fetch device state: ${response.statusText}`);
        }
        const data = await response.json();
        return data.state || {}; // Adjust based on your API response structure
    }

    // Evaluate the condition based on the operator
    evaluateCondition(paramValue) {
        let conditionMet = false;
        const { operator, value } = this.properties;

        switch (operator) {
            case '==':
                conditionMet = paramValue == value;
                break;
            case '!=':
                conditionMet = paramValue != value;
                break;
            case '>':
                conditionMet = paramValue > value;
                break;
            case '<':
                conditionMet = paramValue < value;
                break;
            case '>=':
                conditionMet = paramValue >= value;
                break;
            case '<=':
                conditionMet = paramValue <= value;
                break;
            default:
                console.warn(`IfThenNode - Unsupported operator: ${operator}`);
        }

        if (conditionMet && !this.actionPerformed) {
            this.executeAction();
        } else if (!conditionMet) {
            this.actionPerformed = false; // Reset flag if condition no longer met
        }
    }

    // Execute the action on the target device via the backend API
    async executeAction() {
        try {
            const { action, targetDeviceId } = this.properties;

            if (!targetDeviceId) {
                console.warn("IfThenNode - Target Device ID is not set.");
                return;
            }

            const response = await fetch(`/api/devices/${targetDeviceId}/action`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: action })
            });

            if (response.ok) {
                console.log(`IfThenNode - Action '${action}' executed on device ${targetDeviceId}`);
                this.actionPerformed = true;

                // Emit output to trigger connected nodes
                this.triggerSlot(0, { deviceId: targetDeviceId, action: action });
            } else {
                console.error(`IfThenNode - Failed to execute action: ${response.statusText}`);
            }
        } catch (error) {
            console.error('IfThenNode - Error executing action:', error);
        }
    }

    // Serialize the node's state
    serialize() {
        const data = super.serialize();
        data.properties = { ...this.properties };
        return data;
    }

    // Deserialize the node's state
    configure(data) {
        super.configure(data);
        if (data.properties) {
            Object.assign(this.properties, data.properties);

            // Restart polling with updated interval
            this.stopPolling();
            this.startPolling();
        }
    }

    // Handle property changes dynamically
    onPropertyChanged(name, value) {
        this.properties[name] = value;

        if (name === "pollingInterval") {
            this.stopPolling();
            this.startPolling();
        }

        return true; // Indicate that the property change was handled
    }
}

// Register the node type with LiteGraph under 'Utility' category for visibility
LiteGraph.registerNodeType("Utility/IfThenNode", IfThenNode);
console.log("IfThenNode - Registered successfully under 'Utility' category.");
