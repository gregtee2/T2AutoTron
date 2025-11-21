class CustomLayoutNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Custom Layout (Dropdowns)";
        this.size = [350, 250]; // Adjust size to fit dropdowns

        // Properties
        this.properties = {
            start_hour: 8,
            start_minute: 0,
            start_ampm: "AM",
            stop_hour: 6,
            stop_minute: 0,
            stop_ampm: "PM",
            start_enabled: true,
            stop_enabled: true,
        };

        // Add Output
        this.addOutput("State", "boolean");

        // Internal state
        this.currentState = false; // Tracks the current state (on/off)
        this.timeoutId = null;     // ID of the scheduled timeout

        this.setupDropdowns();
        this.scheduleNextCheck(); // Schedule the first check

        console.log("CustomLayoutNode - Initialized with dropdowns.");
    }

    setupDropdowns() {
        const dropdownWidth = 100;

        // Start Time Widgets
        this.addWidget("combo", "Start Hour", this.properties.start_hour, (v) => {
            this.properties.start_hour = parseInt(v, 10);
            this.updateTimes();
        }, { values: Array.from({ length: 12 }, (_, i) => i + 1), width: dropdownWidth });

        this.addWidget("combo", "Start Minute", this.properties.start_minute, (v) => {
            this.properties.start_minute = parseInt(v, 10);
            this.updateTimes();
        }, { values: Array.from({ length: 60 }, (_, i) => this.formatMinute(i)), width: dropdownWidth });

        this.addWidget("combo", "Start AM/PM", this.properties.start_ampm, (v) => {
            this.properties.start_ampm = v;
            this.updateTimes();
        }, { values: ["AM", "PM"], width: dropdownWidth });

        this.addWidget("toggle", "Enable Start", this.properties.start_enabled, (v) => {
            this.properties.start_enabled = v;
        });

        // Stop Time Widgets
        this.addWidget("combo", "Stop Hour", this.properties.stop_hour, (v) => {
            this.properties.stop_hour = parseInt(v, 10);
            this.updateTimes();
        }, { values: Array.from({ length: 12 }, (_, i) => i + 1), width: dropdownWidth });

        this.addWidget("combo", "Stop Minute", this.properties.stop_minute, (v) => {
            this.properties.stop_minute = parseInt(v, 10);
            this.updateTimes();
        }, { values: Array.from({ length: 60 }, (_, i) => this.formatMinute(i)), width: dropdownWidth });

        this.addWidget("combo", "Stop AM/PM", this.properties.stop_ampm, (v) => {
            this.properties.stop_ampm = v;
            this.updateTimes();
        }, { values: ["AM", "PM"], width: dropdownWidth });

        this.addWidget("toggle", "Enable Stop", this.properties.stop_enabled, (v) => {
            this.properties.stop_enabled = v;
        });
    }

    formatMinute(minute) {
        return minute < 10 ? `0${minute}` : `${minute}`;
    }

    updateTimes() {
        this.scheduleNextCheck();
        this.setDirtyCanvas(true); // Redraw the canvas to reflect changes
    }

    isCurrentTimeWithinRange() {
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();

        const startMinutes = this.parseTime(this.properties.start_hour, this.properties.start_minute, this.properties.start_ampm);
        const stopMinutes = this.parseTime(this.properties.stop_hour, this.properties.stop_minute, this.properties.stop_ampm);

        return (startMinutes < stopMinutes)
            ? currentMinutes >= startMinutes && currentMinutes < stopMinutes
            : currentMinutes >= startMinutes || currentMinutes < stopMinutes;
    }

    parseTime(hour, minute, ampm) {
        if (ampm === "PM" && hour !== 12) {
            hour += 12;
        }
        if (ampm === "AM" && hour === 12) {
            hour = 0;
        }
        return hour * 60 + minute;
    }

    scheduleNextCheck() {
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
        }

        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();

        const startMinutes = this.parseTime(this.properties.start_hour, this.properties.start_minute, this.properties.start_ampm);
        const stopMinutes = this.parseTime(this.properties.stop_hour, this.properties.stop_minute, this.properties.stop_ampm);

        let nextChange;
        if (startMinutes < stopMinutes) {
            nextChange = (currentMinutes < startMinutes) ? startMinutes : stopMinutes;
        } else {
            nextChange = (currentMinutes < stopMinutes) ? stopMinutes : startMinutes + (24 * 60); // Add a day if overnight
        }

        const delayInMillis = (nextChange * 60 * 1000) - (now.getTime() % (24 * 60 * 60 * 1000));

        this.timeoutId = setTimeout(() => {
            this.checkAndUpdateState();
            this.scheduleNextCheck();
        }, delayInMillis);
    }

    checkAndUpdateState() {
        const enabled = this.properties.start_enabled || this.properties.stop_enabled;
        const currentState = enabled && this.isCurrentTimeWithinRange();

        if (currentState !== this.currentState) {
            this.currentState = currentState;
            this.setOutputData(0, this.currentState);
            console.log(`CustomLayoutNode - State changed to: ${this.currentState ? "on" : "off"}`);
        }
    }

    onExecute() {
        this.checkAndUpdateState();
    }

    onRemoved() {
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
        }
    }
}

LiteGraph.registerNodeType("Custom/custom_layout_dropdown", CustomLayoutNode);
