// File: src/nodes/StackedTimedEventsNode.js

if (!LiteGraph.registered_nodes || !LiteGraph.registered_nodes["Timing/StackedTimedEvents"]) {
    class StackedTimedEventsNode extends LiteGraph.LGraphNode {
        constructor() {
            super();
            this.title = "Stacked Timed Events";
            
            // Define properties
            // Example event list:
            // [
            //   { time: "19:00", on: true },
            //   { time: "20:00", on: true },
            //   { time: "22:00", on: true },
            //   { time: "23:00", on: false }
            // ]
            this.properties = {
                events: [
                    { time: "19:00", on: true },
                    { time: "20:00", on: true },
                    { time: "22:00", on: true },
                    { time: "23:00", on: false }
                ]
            };

            this.addInput("Refresh", "boolean"); // optional trigger to re-check
            this.addOutput("State", "boolean");  // current On/Off state
            this.addOutput("Event Index", "number"); // current active event index

            this._activeEventIndex = -1; // -1 means no event active
            this._lastCheckTime = null;  // track last check to avoid constant processing if needed
        }

        onExecute() {
            // Optional: if you want to trigger only on a refresh input
            const refreshTrigger = this.getInputData(0);
            // If refreshTrigger is defined and false, we could skip, but let's just run each onExecute

            // Get current time
            const now = new Date();
            const currentMinutes = now.getHours() * 60 + now.getMinutes();

            // Determine which event should be active
            // We'll assume the last event whose time is <= current time is the active one.
            // If no event time is <= current time, we default to Off (no active event).
            
            let activeIndex = -1;
            for (let i = 0; i < this.properties.events.length; i++) {
                const evt = this.properties.events[i];
                const evtMinutes = this._timeToMinutes(evt.time);
                
                if (evtMinutes <= currentMinutes) {
                    activeIndex = i;
                } else {
                    // As soon as we find an event time greater than current time,
                    // we stop, since events should be in chronological order.
                    break;
                }
            }

            // Update active event index if changed
            if (this._activeEventIndex !== activeIndex) {
                this._activeEventIndex = activeIndex;
                this.setDirtyCanvas(true, true);
            }

            // Determine the output state
            let currentState = false;
            if (this._activeEventIndex >= 0) {
                currentState = this.properties.events[this._activeEventIndex].on;
            }

            // Set outputs
            this.setOutputData(0, currentState);
            this.setOutputData(1, this._activeEventIndex);

            // Optional: You could store lastCheckTime if needed
        }

        _timeToMinutes(timeStr) {
            // timeStr expected in "HH:MM"
            const parts = timeStr.split(":");
            if (parts.length !== 2) return 0;
            const h = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10);
            return h * 60 + m;
        }

        onDrawForeground(ctx) {
            // Optional: Draw info about the current event
            ctx.fillStyle = "#FFFFFF";
            ctx.font = "12px Arial";
            ctx.textAlign = "left";

            if (this._activeEventIndex === -1) {
                ctx.fillText("No active event", 10, 20);
            } else {
                const activeEvt = this.properties.events[this._activeEventIndex];
                ctx.fillText(`Active Event #${this._activeEventIndex + 1}: ${activeEvt.time} - ${activeEvt.on ? "On" : "Off"}`, 10, 20);
            }
        }

        // Serialize and configure to save/load event list
        serialize() {
            const data = super.serialize();
            data.properties = this.properties;
            data._activeEventIndex = this._activeEventIndex;
            return data;
        }

        configure(data) {
            super.configure(data);
            if (data.properties) {
                this.properties = data.properties;
            }
            if (data._activeEventIndex !== undefined) {
                this._activeEventIndex = data._activeEventIndex;
            }
        }
    }

    LiteGraph.registerNodeType("Timing/StackedTimedEvents", StackedTimedEventsNode);
    console.log("StackedTimedEventsNode registered.");
}
