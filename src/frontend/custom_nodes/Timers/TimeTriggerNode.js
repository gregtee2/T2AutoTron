class TimeTriggerNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.size = [200, 60]; // Set default size
        this.addInput("Device List", "array"); // Accept a list of devices (Hue, Govee, etc.)
        this.addWidget("time", "Trigger Time", "18:00", this.onTimeChanged.bind(this)); // Set the trigger time
        
        this.properties = {
            devices: [], // List of devices to control
            trigger_time: "18:00", // Default trigger time
            action: "turn_on" // Action to take (turn on, turn off, etc.)
        };
    }

    onExecute() {
        const currentTime = this.getCurrentTime(); // Get the current time

        // Check if the current time matches the trigger time
        if (currentTime === this.properties.trigger_time) {
            // Publish event to Event Bus
            EventBus.publish("time_trigger", {
                event_type: "time_trigger",
                trigger: "sunset",
                action: this.properties.action,
                devices: this.properties.devices // Pass the device list
            });
        }

        this.setDirtyCanvas(true);  // Force canvas redraw
    }

    onTimeChanged(newTime) {
        this.properties.trigger_time = newTime; // Update the trigger time
    }

    getCurrentTime() {
        // Logic to get the current system time or compare against a time event like sunset
        const now = new Date();
        const currentHours = now.getHours().toString().padStart(2, '0');
        const currentMinutes = now.getMinutes().toString().padStart(2, '0');
        return `${currentHours}:${currentMinutes}`; // e.g., "18:00"
    }
}

LiteGraph.registerNodeType("Timers/time_trigger", TimeTriggerNode);
