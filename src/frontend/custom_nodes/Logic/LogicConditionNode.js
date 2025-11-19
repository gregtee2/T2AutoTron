// File: LogicConditionNode.js

class LogicConditionNode extends LiteGraph.LGraphNode {
    static NODE_WIDTH = 380;
    static NODE_HEIGHT = 200;
    static DEFAULT_PROPERTIES = {
        debug: false,
        selectedDeviceId: "",
        conditionOperator: "=",
        conditionValue: "",
        actionType: "None" // Options: None, Turn On, Turn Off, Set Value
    };

    constructor() {
        super();
        this.title = "Logic Condition";
        this.size = [LogicConditionNode.NODE_WIDTH, LogicConditionNode.NODE_HEIGHT];
        this.bgcolor = "rgb(50, 50, 50)";
        this.mode = LiteGraph.ON_EVENT;

        // Initialize properties
        this.properties = structuredClone(LogicConditionNode.DEFAULT_PROPERTIES);

        // Internal state
        this.state = {
            inputStates: [],
            lastOutput: null,
            customLabels: []
        };

        // Define widgets
        this.setupWidgets();

        // Define inputs and outputs
        this.setupIO();

        // Initialize device list
        this.deviceList = [];
        this.updateDeviceList();

        // Listen for device registry updates
        this.deviceRegistryListener = this.handleDeviceRegistryUpdate.bind(this);
        window.addEventListener('deviceRegistryUpdated', this.deviceRegistryListener);

        console.log(`LogicConditionNode - Node ${this.id} initialized.`);
    }

    setupWidgets() {
        const widgetWidth = 300;

        // Debug toggle
        this.addWidget(
            "toggle",
            "Debug",
            this.properties.debug,
            (v) => {
                this.properties.debug = v;
                this.logDebug(`Debug mode ${v ? "enabled" : "disabled"}`);
            },
            { width: widgetWidth, tooltip: "Enable debug logging." }
        );

        // Device selection dropdown
        this.deviceDropdown = this.addWidget(
            "dropdown",
            "Select Device",
            this.properties.selectedDeviceId,
            (v) => {
                this.properties.selectedDeviceId = v;
                this.updateConditionValueOptions();
                this.updateActionOptions();
                this.setDirtyCanvas(true);
            },
            { values: this.getDeviceDropdownOptions(), width: widgetWidth, tooltip: "Select a device to monitor." }
        );

        // Condition operator dropdown
        this.conditionOperatorDropdown = this.addWidget(
            "dropdown",
            "Condition Operator",
            this.properties.conditionOperator,
            (v) => {
                this.properties.conditionOperator = v;
                this.setDirtyCanvas(true);
            },
            { values: ["=", "<", ">", "<=", ">="], width: widgetWidth, tooltip: "Select a condition operator." }
        );

        // Condition value dropdown or number widget
        this.conditionValueWidget = this.addWidget(
            "dropdown",
            "Condition Value",
            this.properties.conditionValue,
            (v) => {
                this.properties.conditionValue = v;
                this.setDirtyCanvas(true);
            },
            { values: this.getConditionValueOptions(), width: widgetWidth, tooltip: "Select or enter a value for the condition." }
        );

        // Action type dropdown
        this.actionTypeDropdown = this.addWidget(
            "dropdown",
            "Then Action",
            this.properties.actionType,
            (v) => {
                this.properties.actionType = v;
                this.updateActionOptions();
                this.setDirtyCanvas(true);
            },
            { values: this.getActionOptions(), width: widgetWidth, tooltip: "Select an action to execute if condition is met." }
        );

        // Additional widget for setting value if action is 'Set Value'
        this.setValueWidget = this.addWidget(
            "number",
            "Set Value",
            0,
            (v) => {
                this.properties.conditionValue = v;
                this.setDirtyCanvas(true);
            },
            { min: -1000, max: 1000, step: 1, width: widgetWidth, visible: false, tooltip: "Value to set if action is 'Set Value'." }
        );

        // Listen for changes to show/hide the 'Set Value' widget
        this.actionTypeDropdown.onChange = (v) => {
            if (v === "Set Value") {
                this.setValueWidget.visible = true;
            } else {
                this.setValueWidget.visible = false;
            }
            this.setDirtyCanvas(true);
        };
    }

    setupIO() {
        // Clear existing inputs/outputs
        this.inputs = [];
        this.outputs = [];

        // Add an input to receive external triggers (optional)
        this.addInput("Trigger", "trigger");

        // Outputs:
        // 1. Condition Met Trigger
        this.addOutput("Condition Met", "trigger");

        // 2. Action Output (data)
        this.addOutput("Action", "object");
    }

    updateDeviceList() {
        if (window.deviceRegistry && Array.isArray(window.deviceRegistry)) {
            this.deviceList = window.deviceRegistry;
            this.updateDeviceDropdown();
        } else {
            this.deviceList = [];
            this.updateDeviceDropdown();
            this.updateStatus("Device registry not found.", "error");
            this.logDebug("Device registry not found.");
        }
    }

    getDeviceDropdownOptions() {
        if (!this.deviceList || this.deviceList.length === 0) {
            return ["No Devices Available"];
        }
        return this.deviceList.map(device => ({
            name: device.name,
            value: device.id
        }));
    }

    updateDeviceDropdown() {
        const options = this.getDeviceDropdownOptions();
        this.deviceDropdown.options = options;

        if (!options.find(opt => opt.value === this.properties.selectedDeviceId)) {
            // Reset selected device if it's no longer available
            this.properties.selectedDeviceId = options.length > 0 ? options[0].value : "";
            this.deviceDropdown.value = this.properties.selectedDeviceId;
            this.updateConditionValueOptions();
            this.updateActionOptions();
            this.setDirtyCanvas(true);
        }
    }

    getConditionValueOptions() {
        if (!this.deviceList) return ["N/A"];

        const selectedDevice = this.deviceList.find(d => d.id === this.properties.selectedDeviceId);
        if (!selectedDevice) {
            return ["N/A"];
        }

        if (selectedDevice.type === "boolean") {
            return ["On", "Off"];
        } else if (selectedDevice.type === "numeric") {
            // For numeric devices, allow free input via number widget
            // Thus, no predefined options
            return [];
        } else {
            return ["Unsupported Device Type"];
        }
    }

    updateConditionValueOptions() {
        const selectedDevice = this.deviceList.find(d => d.id === this.properties.selectedDeviceId);
        if (!selectedDevice) {
            this.conditionValueWidget.visible = false;
            this.conditionValueWidget.value = "";
            return;
        }

        if (selectedDevice.type === "boolean") {
            this.conditionValueWidget.visible = true;
            this.conditionValueWidget.type = "dropdown";
            this.conditionValueWidget.options = ["On", "Off"];
            this.conditionValueWidget.value = this.properties.conditionValue || "On";
        } else if (selectedDevice.type === "numeric") {
            this.conditionValueWidget.visible = true;
            this.conditionValueWidget.type = "number";
            this.conditionValueWidget.options = [];
            this.conditionValueWidget.value = this.properties.conditionValue || 0;
        } else {
            this.conditionValueWidget.visible = false;
            this.conditionValueWidget.value = "Unsupported";
        }

        this.setDirtyCanvas(true);
    }

    getActionOptions() {
        return ["None", "Turn On", "Turn Off", "Set Value"];
    }

    updateActionOptions() {
        const actionOptions = this.getActionOptions();
        this.actionTypeDropdown.options = actionOptions;
        if (!actionOptions.includes(this.properties.actionType)) {
            this.properties.actionType = "None";
            this.actionTypeDropdown.value = this.properties.actionType;
        }

        // Show or hide the 'Set Value' widget based on selected action
        if (this.properties.actionType === "Set Value") {
            this.setValueWidget.visible = true;
        } else {
            this.setValueWidget.visible = false;
        }

        this.setDirtyCanvas(true);
    }

    handleDeviceRegistryUpdate(event) {
        this.updateDeviceList();
        this.setDirtyCanvas(true);
    }

    onExecute() {
        // This node responds to triggers; it can be executed manually or via connected triggers
        // For simplicity, we'll execute conditions every time it's triggered

        // Fetch the latest state of the selected device
        const selectedDevice = this.deviceList.find(d => d.id === this.properties.selectedDeviceId);
        if (!selectedDevice) {
            this.updateStatus("Selected device not found.", "error");
            this.logDebug("Selected device not found.");
            return;
        }

        let deviceState = selectedDevice.state;
        if (selectedDevice.type === "boolean") {
            deviceState = deviceState ? "On" : "Off";
        }

        // Evaluate condition
        let conditionMet = false;
        const conditionValue = this.properties.conditionValue;

        switch (this.properties.conditionOperator) {
            case "=":
                conditionMet = deviceState === conditionValue;
                break;
            case "<":
                conditionMet = parseFloat(deviceState) < parseFloat(conditionValue);
                break;
            case ">":
                conditionMet = parseFloat(deviceState) > parseFloat(conditionValue);
                break;
            case "<=":
                conditionMet = parseFloat(deviceState) <= parseFloat(conditionValue);
                break;
            case ">=":
                conditionMet = parseFloat(deviceState) >= parseFloat(conditionValue);
                break;
            default:
                this.logDebug(`Unknown condition operator: ${this.properties.conditionOperator}`);
        }

        this.logDebug(`Condition: ${selectedDevice.name} (${deviceState}) ${this.properties.conditionOperator} ${conditionValue} => ${conditionMet}`);

        if (conditionMet) {
            // Emit 'Condition Met' trigger
            this.setOutputData(0, true);
            this.logDebug("Condition met. Emitting trigger.");

            // Prepare action data
            let actionData = {
                deviceId: selectedDevice.id,
                actionType: this.properties.actionType
            };

            if (this.properties.actionType === "Set Value") {
                actionData.value = this.setValueWidget.value;
            }

            // Emit 'Action' output
            this.setOutputData(1, actionData);
            this.logDebug("Action data emitted:", actionData);
        }
    }

    onDrawForeground(ctx) {
        // Custom drawing can be added here if needed
        // For this node, default drawing is sufficient
    }

    onDrawBackground(ctx) {
        // Optional: Draw condition and action summary
        ctx.font = "14px Arial";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillStyle = "#FFFFFF";

        const condition = `IF ${this.getDeviceName()} ${this.properties.conditionOperator} ${this.properties.conditionValue}`;
        const action = `THEN ${this.properties.actionType}`;
        ctx.fillText(condition, 10, 10);
        ctx.fillText(action, 10, 30);
    }

    getDeviceName() {
        const device = this.deviceList.find(d => d.id === this.properties.selectedDeviceId);
        return device ? device.name : "Unknown Device";
    }

    logDebug(...args) {
        if (this.properties.debug) {
            console.log("[LogicConditionNode]", ...args);
        }
    }

    onSerialize(o) {
        o.properties = structuredClone(this.properties);
    }

    onConfigure(o) {
        if (o.properties) {
            this.properties = structuredClone(o.properties);

            // Update device list in case devices have changed
            this.updateDeviceList();

            // Update widgets based on restored properties
            this.updateConditionValueOptions();
            this.updateActionOptions();

            this.setDirtyCanvas(true);
        }
    }

    onRemoved() {
        // Clean up event listener
        window.removeEventListener('deviceRegistryUpdated', this.deviceRegistryListener);
    }
}

// Register the node with LiteGraph under the "Logic" category
LiteGraph.registerNodeType("Logic/LogicConditionNode", LogicConditionNode);
console.log("LogicConditionNode - Node registered successfully.");
