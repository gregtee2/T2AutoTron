class HybridTimerTriggerNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Hybrid Timer Trigger";
        this.size = [260, 220];

        const currentYear = new Date().getFullYear();

        // Define properties with default values
        this.properties = {
            start_hour: 8,
            start_minute: 0,
            start_ampm: "AM",
            start_state: true, // Default start state to On
            end_hour: 9,
            end_minute: 0,
            end_ampm: "PM",
            end_state: false, // Default end state to Off
            year: currentYear,
            month: -1,
            day_of_week: -1,
            override: false, // Default override to off
            override_state: false // Default override state to off
        };

        // Start Time Widgets
        this.addWidget("combo", "Start Hour", this.properties.start_hour, (v) => {
            this.properties.start_hour = parseInt(v, 10);
        }, { values: Array.from({ length: 12 }, (_, i) => i + 1) });
        this.addWidget("combo", "Start Minute", this.properties.start_minute, (v) => {
            this.properties.start_minute = parseInt(v, 10);
        }, { values: Array.from({ length: 60 }, (_, i) => i) });
        this.addWidget("combo", "Start AM/PM", this.properties.start_ampm, (v) => {
            this.properties.start_ampm = v;
        }, { values: ["AM", "PM"] });
        this.addWidget("toggle", "Start State", this.properties.start_state, (v) => {
            this.properties.start_state = v;
        });

        // End Time Widgets
        this.addWidget("combo", "End Hour", this.properties.end_hour, (v) => {
            this.properties.end_hour = parseInt(v, 10);
        }, { values: Array.from({ length: 12 }, (_, i) => i + 1) });
        this.addWidget("combo", "End Minute", this.properties.end_minute, (v) => {
            this.properties.end_minute = parseInt(v, 10);
        }, { values: Array.from({ length: 60 }, (_, i) => i) });
        this.addWidget("combo", "End AM/PM", this.properties.end_ampm, (v) => {
            this.properties.end_ampm = v;
        }, { values: ["AM", "PM"] });
        this.addWidget("toggle", "End State", this.properties.end_state, (v) => {
            this.properties.end_state = v;
        });

        // Other Widgets (Year, Month, Day of Week)
        this.addWidget("number", "Year", this.properties.year, (v) => {
            this.properties.year = parseInt(v, 10);
        });
        this.addWidget("combo", "Month", this.properties.month, (v) => {
            this.properties.month = parseInt(v, 10);
        }, { values: { "-1": "Any", "0": "January", "1": "February", "2": "March", "4": "April", "5": "May", "6": "June", "7": "July", "8": "August", "9": "September", "10": "October", "11": "November", "12": "December" } });
        this.addWidget("combo", "Day of Week", this.properties.day_of_week, (v) => {
            this.properties.day_of_week = parseInt(v, 10);
        }, { values: { "-1": "Any", "0": "Sunday", "1": "Monday", "2": "Tuesday", "3": "Wednesday", "4": "Thursday", "5": "Friday", "6": "Saturday" } });

        // Manual Override
        this.addWidget("toggle", "Override", this.properties.override, (v) => {
            this.properties.override = v;
        });
        this.addWidget("toggle", "Override State", this.properties.override_state, (v) => {
            this.properties.override_state = v;
        });

        this.addOutput("Trigger", "boolean");
    }

    onExecute() {
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();
        const currentDayOfWeek = now.getDay();

        const startHour = this.properties.start_ampm === "PM" && this.properties.start_hour !== 12 ?
            this.properties.start_hour + 12 : this.properties.start_hour;
        const endHour = this.properties.end_ampm === "PM" && this.properties.end_hour !== 12 ?
            this.properties.end_hour + 12 : this.properties.end_hour;

        // Handle Override
        if (this.properties.override) {
            this.setOutputData(0, this.properties.override_state);
            return;
        }

        const isStartTimeMatch = 
            this.properties.year === currentYear &&
            (this.properties.month === -1 || this.properties.month === currentMonth) &&
            (this.properties.day_of_week === -1 || this.properties.day_of_week === currentDayOfWeek) &&
            startHour === currentHour &&
            this.properties.start_minute === currentMinute;

        const isEndTimeMatch = 
            this.properties.year === currentYear &&
            (this.properties.month === -1 || this.properties.month === currentMonth) &&
            (this.properties.day_of_week === -1 || this.properties.day_of_week === currentDayOfWeek) &&
            endHour === currentHour &&
            this.properties.end_minute === currentMinute;

        if (isStartTimeMatch) {
            this.setOutputData(0, this.properties.start_state);
        } else if (isEndTimeMatch) {
            this.setOutputData(0, this.properties.end_state);
        } else {
            this.setOutputData(0, null);  // No trigger
        }
    }

    onSerialize(o) {
        o.properties = LiteGraph.cloneObject(this.properties);
    }

    onConfigure(o) {
        this.properties = LiteGraph.cloneObject(o.properties);

        // Re-create the widgets with the restored values
        this.widgets = [];
        this.addWidget("combo", "Start Hour", this.properties.start_hour, (v) => {
            this.properties.start_hour = parseInt(v, 10);
        }, { values: Array.from({ length: 12 }, (_, i) => i + 1) });
        this.addWidget("combo", "Start Minute", this.properties.start_minute, (v) => {
            this.properties.start_minute = parseInt(v, 10);
        }, { values: Array.from({ length: 60 }, (_, i) => i) });
        this.addWidget("combo", "Start AM/PM", this.properties.start_ampm, (v) => {
            this.properties.start_ampm = v;
        }, { values: ["AM", "PM"] });
        this.addWidget("toggle", "Start State", this.properties.start_state, (v) => {
            this.properties.start_state = v;
        });

        this.addWidget("combo", "End Hour", this.properties.end_hour, (v) => {
            this.properties.end_hour = parseInt(v, 10);
        }, { values: Array.from({ length: 12 }, (_, i) => i + 1) });
        this.addWidget("combo", "End Minute", this.properties.end_minute, (v) => {
            this.properties.end_minute = parseInt(v, 10);
        }, { values: Array.from({ length: 60 }, (_, i) => i) });
        this.addWidget("combo", "End AM/PM", this.properties.end_ampm, (v) => {
            this.properties.end_ampm = v;
        }, { values: ["AM", "PM"] });
        this.addWidget("toggle", "End State", this.properties.end_state, (v) => {
            this.properties.end_state = v;
        });

        this.addWidget("number", "Year", this.properties.year, (v) => {
            this.properties.year = parseInt(v, 10);
        });
        this.addWidget("combo", "Month", this.properties.month, (v) => {
            this.properties.month = parseInt(v, 10);
        }, { values: { "-1": "Any", "0": "January", "1": "February", "2": "March", "4": "April", "5": "May", "6": "June", "7": "July", "8": "August", "9": "September", "10": "October", "11": "November", "12": "December" } });
        this.addWidget("combo", "Day of Week", this.properties.day_of_week, (v) => {
            this.properties.day_of_week = parseInt(v, 10);
        }, { values: { "-1": "Any", "0": "Sunday", "1": "Monday", "2": "Tuesday", "3": "Wednesday", "4": "Thursday", "5": "Friday", "6": "Saturday" } });

        this.addWidget("toggle", "Override", this.properties.override, (v) => {
            this.properties.override = v;
        });
        this.addWidget("toggle", "Override State", this.properties.override_state, (v) => {
            this.properties.override_state = v;
        });
    }
}

// Register the node
LiteGraph.registerNodeType("custom/hybrid_timer_trigger", HybridTimerTriggerNode);
