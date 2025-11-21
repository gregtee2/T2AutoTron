class APICallTrackerNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "API Call Tracker";
        this.size = [200, 100];
        this.properties = { callCount: 0, resetInterval: 60000 }; // Reset every 60 seconds
        this.callsThisMinute = 0;
        this.lastResetTime = Date.now();

        // Add a custom field to show the count on the node
        this.addWidget("text", "Calls per minute", this.callsThisMinute, null, { readonly: true });

        // Start a timer to reset the counter every 60 seconds
        this.startResetTimer();
    }

    startResetTimer() {
        setInterval(() => {
            this.callsThisMinute = 0;
            this.lastResetTime = Date.now();
            this.setDirtyCanvas(true);  // Redraw the node to update the display
            console.log("Reset API call count for the new minute");
        }, this.properties.resetInterval);
    }

    onExecute() {
        // Just update the display without resetting it
        this.widgets[0].value = this.callsThisMinute;
    }

    // Function to increment the API call count
    trackAPICall() {
        this.callsThisMinute++;
        this.setDirtyCanvas(true);  // Redraw the node to update the display
        console.log(`Tracked API call. Total for this minute: ${this.callsThisMinute}`);
    }
}

LiteGraph.registerNodeType("Utility/api_call_tracker", APICallTrackerNode);
