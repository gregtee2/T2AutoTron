// File: AdvancedTimeOfDayNode.js

class AdvancedTimeOfDayNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Advanced Time of Day";
        this.size = [300, 200];

        // Properties
        this.properties = {
            schedules: [],  // Array to hold multiple schedules
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone // Default to user's local timezone
        };

        // Widgets
        this.widgets = [];

        // Add Timezone Widget
        this.addWidget("text", "Timezone", this.properties.timezone, (v) => {
            this.properties.timezone = v;
        });

        // Initialize the first schedule
        this.addSchedule();

        // Internal state
        this.currentState = null;
        this.timeoutIds = [];

        // Listen for visibility changes to handle tab activation
        document.addEventListener("visibilitychange", this.handleVisibilityChange.bind(this));
    }

    addSchedule() {
        const scheduleIndex = this.properties.schedules.length;
        const defaultSchedule = {
            start_time: "6:00 AM",
            stop_time: "6:00 PM",
            devices: []
        };
        this.properties.schedules.push(defaultSchedule);

        // Widgets for the schedule
        this.addWidget("separator", `Schedule ${scheduleIndex + 1}`, null, null);

        // Start Time Widget
        this.addWidget("text", `Start Time ${scheduleIndex + 1}`, defaultSchedule.start_time, (v) => {
            defaultSchedule.start_time = v;
            this.scheduleNextCheck();
        });

        // Stop Time Widget
        this.addWidget("text", `Stop Time ${scheduleIndex + 1}`, defaultSchedule.stop_time, (v) => {
            defaultSchedule.stop_time = v;
            this.scheduleNextCheck();
        });

        // Input for HSV values
        this.addInput(`HSV In ${scheduleIndex + 1}`, "hsv");

        // Output to trigger devices
        this.addOutput(`Trigger Out ${scheduleIndex + 1}`, "boolean");

        // Force the size after adding widgets
        this.forceSize();
    }

    // Override onExecute
    onExecute() {
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();

        for (let i = 0; i < this.properties.schedules.length; i++) {
            const schedule = this.properties.schedules[i];
            const startMinutes = this.parseTimeToMinutes(schedule.start_time);
            const stopMinutes = this.parseTimeToMinutes(schedule.stop_time);

            let isActive = false;

            if (startMinutes < stopMinutes) {
                isActive = currentMinutes >= startMinutes && currentMinutes < stopMinutes;
            } else {
                isActive = currentMinutes >= startMinutes || currentMinutes < stopMinutes;
            }

            // Get HSV input value if connected
            const hsvValue = this.getInputData(i);

            // Output the state
            this.setOutputData(i, isActive);

            // Send HSV value if active
            if (isActive && hsvValue) {
                // Store the HSV value in the schedule for backend processing
                schedule.hsv = hsvValue;
            }
        }
    }

    parseTimeToMinutes(timeStr) {
        const match = timeStr.match(/^(\d+):(\d+)\s?(AM|PM)$/i);
        if (!match) {
            console.error(`Invalid time format: '${timeStr}'. Expected format 'HH:MM AM/PM'.`);
            return 0;
        }
        let [_, hour, minute, ampm] = match;
        hour = parseInt(hour, 10);
        minute = parseInt(minute, 10);
        if (ampm.toUpperCase() === 'PM' && hour !== 12) {
            hour += 12;
        }
        if (ampm.toUpperCase() === 'AM' && hour === 12) {
            hour = 0;
        }
        return hour * 60 + minute;
    }

    onDrawForeground(ctx) {
        ctx.fillStyle = "#000";
        ctx.font = "14px Arial";
        ctx.textAlign = "left";
        ctx.fillText(`Schedules: ${this.properties.schedules.length}`, 10, this.size[1] - 10);
    }

    scheduleNextCheck() {
        // Implement scheduling logic if needed on the frontend
        // Since the backend handles actual scheduling, this may be minimal
    }

    handleVisibilityChange() {
        if (!document.hidden) {
            // Perform any necessary updates when the tab becomes active
        }
    }

    onSerialize(o) {
        o.properties = LiteGraph.cloneObject(this.properties);
    }

    onConfigure(o) {
        this.properties = LiteGraph.cloneObject(o.properties);
        // Recreate widgets based on restored properties
        this.widgets = [];
        this.inputs = [];
        this.outputs = [];
        this.addWidget("text", "Timezone", this.properties.timezone, (v) => {
            this.properties.timezone = v;
        });

        // Recreate schedules
        for (let i = 0; i < this.properties.schedules.length; i++) {
            this.addScheduleWidgets(i);
        }

        this.forceSize();
    }

    addScheduleWidgets(scheduleIndex) {
        const schedule = this.properties.schedules[scheduleIndex];

        this.addWidget("separator", `Schedule ${scheduleIndex + 1}`, null, null);

        this.addWidget("text", `Start Time ${scheduleIndex + 1}`, schedule.start_time, (v) => {
            schedule.start_time = v;
            this.scheduleNextCheck();
        });

        this.addWidget("text", `Stop Time ${scheduleIndex + 1}`, schedule.stop_time, (v) => {
            schedule.stop_time = v;
            this.scheduleNextCheck();
        });

        // Input for HSV values
        this.addInput(`HSV In ${scheduleIndex + 1}`, "hsv");

        // Output to trigger devices
        this.addOutput(`Trigger Out ${scheduleIndex + 1}`, "boolean");
    }

    forceSize() {
        this.size = [300, 100 + this.properties.schedules.length * 80];
    }

    onAdded() {
        this.forceSize();
        this.scheduleNextCheck();
    }

    onRemoved() {
        // Clear any existing timeouts
        this.timeoutIds.forEach(id => clearTimeout(id));
        this.timeoutIds = [];

        // Remove visibility change listener
        document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    }

    // Add method to allow adding more schedules dynamically
    onGetInputs() {
        return [["Add Schedule", LiteGraph.ACTION]];
    }

    onAction(action, param) {
        if (action === "Add Schedule") {
            this.addSchedule();
        }
    }
}

// Register the node with LiteGraph under the "Timers" category
LiteGraph.registerNodeType("Timers/advanced_time_of_day", AdvancedTimeOfDayNode);
