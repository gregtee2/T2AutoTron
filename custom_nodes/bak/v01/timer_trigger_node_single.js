class TimerTriggerNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Timer Trigger";
        this.size = [260, 140];

        const currentYear = new Date().getFullYear();

        // Define the properties with default values
        this.properties = {
            year: currentYear, // Default to the current year
            month: -1, // -1 means any month, 0-11 for January-December
            day_of_week: -1, // -1 means any day of the week, 0-6 for Sunday-Saturday
            hour: 12, // Default to 12 PM
            minute: 0,
            am_pm: true, // true for AM, false for PM
            state: true, // Default state to true
            triggered: false // Track if the node has already triggered
        };

        // Widgets
        this.addWidget("number", "Year", this.properties.year, (v) => {
            this.properties.year = this.validateYear(parseInt(v, 10));
        });

        this.addWidget("combo", "Month", this.properties.month, (v) => {
            this.properties.month = parseInt(v, 10);
        }, { values: { "-1": "Any", "0": "January", "1": "February", "2": "March", "3": "April", "4": "May", "5": "June", "6": "July", "7": "August", "8": "September", "9": "October", "10": "November", "11": "December" } });

        this.addWidget("combo", "Day of Week", this.properties.day_of_week, (v) => {
            this.properties.day_of_week = parseInt(v, 10);
        }, { values: { "-1": "Any", "0": "Sunday", "1": "Monday", "2": "Tuesday", "3": "Wednesday", "4": "Thursday", "5": "Friday", "6": "Saturday" } });

        this.addWidget("combo", "Hour", this.properties.hour, (v) => {
            this.properties.hour = parseInt(v, 10);
        }, { values: Array.from({ length: 12 }, (_, i) => i + 1) }); // 1-12 for 12-hour format

        this.addWidget("combo", "Minute", this.properties.minute, (v) => {
            this.properties.minute = parseInt(v, 10);
        }, { values: Array.from({ length: 60 }, (_, i) => i) });

        // Use a toggle widget for AM/PM
        this.addWidget("toggle", "AM/PM", this.properties.am_pm, (v) => {
            this.properties.am_pm = v;
        }, { on: "AM", off: "PM" });

        this.addWidget("toggle", "State", this.properties.state, (v) => {
            this.properties.state = v;
        });

        this.addOutput("Trigger", "boolean");
    }

    validateYear(year) {
        const currentYear = new Date().getFullYear();
        return year >= currentYear ? year : currentYear;
    }

    convertTo24Hour(hour, am_pm) {
        if (!am_pm && hour < 12) {
            return hour + 12;
        } else if (am_pm && hour === 12) {
            return 0;
        }
        return hour;
    }

    onExecute() {
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();
        const currentDayOfWeek = now.getDay();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();

        const triggerHour = this.convertTo24Hour(this.properties.hour, this.properties.am_pm);

        const isTimeMatch = (this.properties.year === currentYear) &&
            (this.properties.month === -1 || this.properties.month === currentMonth) &&
            (this.properties.day_of_week === -1 || this.properties.day_of_week === currentDayOfWeek) &&
            (triggerHour === currentHour) &&
            (this.properties.minute === currentMinute);

        if (isTimeMatch && !this.properties.triggered) {
            this.properties.triggered = true;
            this.setOutputData(0, this.properties.state);
            console.log("TimerTriggerNode - Triggering Execute node with state:", this.properties.state);
        } else if (!isTimeMatch) {
            this.properties.triggered = false; // Reset the trigger for the next matching time
        }
    }

    onSerialize(o) {
        o.properties = LiteGraph.cloneObject(this.properties);
    }

    onConfigure(o) {
        this.properties = LiteGraph.cloneObject(o.properties);

        // Re-create the widgets with the restored values
        this.widgets = [];
        this.addWidget("number", "Year", this.properties.year, (v) => {
            this.properties.year = this.validateYear(parseInt(v, 10));
        });

        this.addWidget("combo", "Month", this.properties.month, (v) => {
            this.properties.month = parseInt(v, 10);
        }, { values: { "-1": "Any", "0": "January", "1": "February", "2": "March", "3": "April", "4": "May", "5": "June", "6": "July", "7": "August", "8": "September", "9": "October", "10": "November", "11": "December" } });

        this.addWidget("combo", "Day of Week", this.properties.day_of_week, (v) => {
            this.properties.day_of_week = parseInt(v, 10);
        }, { values: { "-1": "Any", "0": "Sunday", "1": "Monday", "2": "Tuesday", "3": "Wednesday", "4": "Thursday", "5": "Friday", "6": "Saturday" } });

        this.addWidget("combo", "Hour", this.properties.hour, (v) => {
            this.properties.hour = parseInt(v, 10);
        }, { values: Array.from({ length: 12 }, (_, i) => i + 1) }); // 1-12 for 12-hour format

        this.addWidget("combo", "Minute", this.properties.minute, (v) => {
            this.properties.minute = parseInt(v, 10);
        }, { values: Array.from({ length: 60 }, (_, i) => i) });

        // Re-create the toggle widget for AM/PM
        this.addWidget("toggle", "AM/PM", this.properties.am_pm, (v) => {
            this.properties.am_pm = v;
        }, { on: "AM", off: "PM" });

        this.addWidget("toggle", "State", this.properties.state, (v) => {
            this.properties.state = v;
        });
    }
}

// Register the node type
LiteGraph.registerNodeType("custom/timer_trigger", TimerTriggerNode);
