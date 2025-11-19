class ThreeTimeStackNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Three Time Stack with Sliders";
        this.size = [370, 410]; // Base size
        this.bgcolor = "rgb(50, 68, 73)"; // Valid RGB color


        // Default properties
        this.properties = {
            event1_enabled: true,
            event2_enabled: true,
            event3_enabled: true,
            event1_hour: 6, event1_minute: 0, event1_ampm: "AM",
            event2_hour: 8, event2_minute: 0, event2_ampm: "PM",
            event3_hour: 10, event3_minute: 0, event3_ampm: "PM",
        };

        // Outputs
        this.addOutput("Event1 On", "boolean");
        this.addOutput("Event2 On", "boolean");
        this.addOutput("Event3 On", "boolean");

        // Inputs
        this.addInput("Event1 Override", "boolean");
        this.addInput("Event2 Override", "boolean");
        this.addInput("Event3 Override", "boolean");

        const w = 200; // Widget width

        // Widgets for Event 1
        this.addWidget("toggle", "Enable Event1", this.properties.event1_enabled, (v) => {
            this.properties.event1_enabled = v;
            this.setDirtyCanvas(true);
        }, { width: w });

        this.addWidget("slider", "Event1 Hour", this.properties.event1_hour, (v) => {
            this.properties.event1_hour = Math.round(v);
            this.setDirtyCanvas(true);
        }, { min: 1, max: 12, step: 1, precision: 0, width: w });

        this.addWidget("slider", "Event1 Minute", this.properties.event1_minute, (v) => {
            this.properties.event1_minute = Math.round(v);
            this.setDirtyCanvas(true);
        }, { min: 0, max: 59, step: 1, precision: 0, width: w });

        this.addWidget("combo", "Event1 AM/PM", this.properties.event1_ampm, (v) => {
            this.properties.event1_ampm = v;
            this.setDirtyCanvas(true);
        }, { values: ["AM", "PM"], width: w });

        // Widgets for Event 2
        this.addWidget("toggle", "Enable Event2", this.properties.event2_enabled, (v) => {
            this.properties.event2_enabled = v;
            this.setDirtyCanvas(true);
        }, { width: w });

        this.addWidget("slider", "Event2 Hour", this.properties.event2_hour, (v) => {
            this.properties.event2_hour = Math.round(v);
            this.setDirtyCanvas(true);
        }, { min: 1, max: 12, step: 1, precision: 0, width: w });

        this.addWidget("slider", "Event2 Minute", this.properties.event2_minute, (v) => {
            this.properties.event2_minute = Math.round(v);
            this.setDirtyCanvas(true);
        }, { min: 0, max: 59, step: 1, precision: 0, width: w });

        this.addWidget("combo", "Event2 AM/PM", this.properties.event2_ampm, (v) => {
            this.properties.event2_ampm = v;
            this.setDirtyCanvas(true);
        }, { values: ["AM", "PM"], width: w });

        // Widgets for Event 3
        this.addWidget("toggle", "Enable Event3", this.properties.event3_enabled, (v) => {
            this.properties.event3_enabled = v;
            this.setDirtyCanvas(true);
        }, { width: w });

        this.addWidget("slider", "Event3 Hour", this.properties.event3_hour, (v) => {
            this.properties.event3_hour = Math.round(v);
            this.setDirtyCanvas(true);
        }, { min: 1, max: 12, step: 1, precision: 0, width: w });

        this.addWidget("slider", "Event3 Minute", this.properties.event3_minute, (v) => {
            this.properties.event3_minute = Math.round(v);
            this.setDirtyCanvas(true);
        }, { min: 0, max: 59, step: 1, precision: 0, width: w });

        this.addWidget("combo", "Event3 AM/PM", this.properties.event3_ampm, (v) => {
            this.properties.event3_ampm = v;
            this.setDirtyCanvas(true);
        }, { values: ["AM", "PM"], width: w });

        this.forceSize();
    }

    forceSize() {
        this.size = [370, 410];
    }

    onAdded() {
        this.forceSize();
    }

    /**
     * Restore properties when loading the graph.
     */
    onConfigure(o) {
        if (o.properties) {
            this.properties = LiteGraph.cloneObject(o.properties);
        }
        this.forceSize();
        this.syncWidgets(); // Ensure UI reflects restored values
    }

    /**
     * Save properties when saving the graph.
     */
    onSerialize(o) {
        o.properties = LiteGraph.cloneObject(this.properties);
    }

    /**
     * Sync widgets with property values (optional, ensures UI consistency).
     */
    syncWidgets() {
        // Event1
        this.widgets[0].value = this.properties.event1_enabled;
        this.widgets[1].value = this.properties.event1_hour;
        this.widgets[2].value = this.properties.event1_minute;
        this.widgets[3].value = this.properties.event1_ampm;

        // Event2
        this.widgets[4].value = this.properties.event2_enabled;
        this.widgets[5].value = this.properties.event2_hour;
        this.widgets[6].value = this.properties.event2_minute;
        this.widgets[7].value = this.properties.event2_ampm;

        // Event3
        this.widgets[8].value = this.properties.event3_enabled;
        this.widgets[9].value = this.properties.event3_hour;
        this.widgets[10].value = this.properties.event3_minute;
        this.widgets[11].value = this.properties.event3_ampm;

        this.setDirtyCanvas(true);
    }

    _timeToMinutes(hour, minute, ampm) {
        let h = hour % 12;
        if (ampm === "PM") h += 12;
        return h * 60 + minute;
    }

    onExecute() {
        const ev1Override = this.getInputData(0);
        const ev2Override = this.getInputData(1);
        const ev3Override = this.getInputData(2);

        let ev1On = false,
            ev2On = false,
            ev3On = false;

        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();

        if (this.properties.event3_enabled) {
            const e3 = this._timeToMinutes(this.properties.event3_hour, this.properties.event3_minute, this.properties.event3_ampm);
            ev3On = ev3Override ?? currentMinutes >= e3;
        }

        if (!ev3On && this.properties.event2_enabled) {
            const e2 = this._timeToMinutes(this.properties.event2_hour, this.properties.event2_minute, this.properties.event2_ampm);
            ev2On = ev2Override ?? currentMinutes >= e2;
        }

        if (!ev3On && !ev2On && this.properties.event1_enabled) {
            const e1 = this._timeToMinutes(this.properties.event1_hour, this.properties.event1_minute, this.properties.event1_ampm);
            ev1On = ev1Override ?? currentMinutes >= e1;
        }

        this.setOutputData(0, ev1On);
        this.setOutputData(1, ev2On);
        this.setOutputData(2, ev3On);
    }
}

// Register the node
LiteGraph.registerNodeType("Timers/ThreeTimeStack", ThreeTimeStackNode);
console.log("ThreeTimeStackNode (serialization fixed) registered.");
