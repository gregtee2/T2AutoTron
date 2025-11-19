// File: TimeRangeNode.js

class TimeRangeNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Time Range (Continuous)";
        this.size = [300, 200];
        this.resizable = true;
        this.bgcolor = "rgb(50, 68, 73)"; // Valid RGB color

        // Node properties: hours 0..23, minutes 0..59, plus debug toggle
        this.properties = {
            startHour: 19,   // e.g., 7 PM
            startMinute: 0,
            endHour: 21,     // e.g., 9 PM
            endMinute: 0,
            debug: false
        };

        // Single boolean output
        this.addOutput("IsInRange", "boolean");

        // Create sliders for start/end hour/minute, plus debug toggle
        this.setupWidgets();
    }

    /**
     * Create the UI widgets (sliders and debug toggle).
     */
    setupWidgets() {
        const widgetWidth = this.size[0] - 40;

        // Start Hour: integer slider [0..23]
        this.addWidget("slider", "Start Hour", this.properties.startHour, (value) => {
            this.properties.startHour = Math.round(value);
            if (this.properties.debug) {
                console.log(`[TimeRangeNode] Start Hour set to ${this.properties.startHour}`);
            }
        }, { min: 0, max: 23, step: 1, precision: 0, width: widgetWidth });

        // Start Minute: integer slider [0..59]
        this.addWidget("slider", "Start Minute", this.properties.startMinute, (value) => {
            this.properties.startMinute = Math.round(value);
            if (this.properties.debug) {
                console.log(`[TimeRangeNode] Start Minute set to ${this.properties.startMinute}`);
            }
        }, { min: 0, max: 59, step: 1, precision: 0, width: widgetWidth });

        // End Hour: integer slider [0..23]
        this.addWidget("slider", "End Hour", this.properties.endHour, (value) => {
            this.properties.endHour = Math.round(value);
            if (this.properties.debug) {
                console.log(`[TimeRangeNode] End Hour set to ${this.properties.endHour}`);
            }
        }, { min: 0, max: 23, step: 1, precision: 0, width: widgetWidth });

        // End Minute: integer slider [0..59]
        this.addWidget("slider", "End Minute", this.properties.endMinute, (value) => {
            this.properties.endMinute = Math.round(value);
            if (this.properties.debug) {
                console.log(`[TimeRangeNode] End Minute set to ${this.properties.endMinute}`);
            }
        }, { min: 0, max: 59, step: 1, precision: 0, width: widgetWidth });

        // Debug toggle
        this.addWidget("toggle", "Debug", this.properties.debug, (value) => {
            this.properties.debug = value;
            console.log(`[TimeRangeNode] Debug mode ${value ? "enabled" : "disabled"}`);
        }, { width: widgetWidth });
    }

    /**
     * onExecute: called every frame/tick while the graph is running.
     * Continuously outputs `true` if current local time is in [start, end), else `false`.
     */
    onExecute() {
        // Convert current time to total minutes
        const now = new Date();
        const hour = now.getHours();
        const minute = now.getMinutes();
        const currentTotal = this.timeToMinutes(hour, minute);

        // Convert user’s start/end
        const startTotal = this.timeToMinutes(this.properties.startHour, this.properties.startMinute);
        const endTotal   = this.timeToMinutes(this.properties.endHour,   this.properties.endMinute);

        let inRange = false;

        if (startTotal < endTotal) {
            // Normal case (e.g., 08:00 to 18:00)
            inRange = (currentTotal >= startTotal) && (currentTotal < endTotal);
        } else if (startTotal > endTotal) {
            // Cross midnight (e.g., 22:00 to 02:00 next day)
            inRange = (currentTotal >= startTotal) || (currentTotal < endTotal);
        } else {
            // Same start/end => entire day
            inRange = true;
        }

        // Output continuously (like the simplified version).
        this.setOutputData(0, inRange);

        // Optional debug logging
        if (this.properties.debug) {
            console.log(
                `[TimeRangeNode] hour=${hour}:${minute}, range=[${this.properties.startHour}:${this.properties.startMinute}, ${this.properties.endHour}:${this.properties.endMinute}), inRange=${inRange}`
            );
        }
    }

    /**
     * Convert hour/minute to total minutes from midnight.
     */
    timeToMinutes(h, m) {
        return (h * 60) + m;
    }

    /**
     * Renders text in the lower region to show user the times in AM/PM format.
     */
    onDrawForeground(ctx) {

        // Force the node size to 550x850
        if (this.size[0] !== 300 || this.size[1] !== 230) {
            this.size = [300, 230];
            //console.log(`SunriseSunsetTrigger - Node ${this.id} size forced to: ${this.size[0]}x${this.size[1]}`);
            if (this.graph && this.graph.canvas) {
                this.graph.canvas.setDirty(true, true); // Redraw the canvas
            }
        }
        super.onDrawForeground?.(ctx);

        const startLabel = this.formatAmPm(this.properties.startHour, this.properties.startMinute);
        const endLabel   = this.formatAmPm(this.properties.endHour,   this.properties.endMinute);

        ctx.fillStyle = "#FFF";
        ctx.font = "12px Arial";
        ctx.textAlign = "left";

        const textY = this.size[1] - 8;
        const text = `Time Range: ${startLabel} to ${endLabel}`;
        ctx.fillText(text, 10, textY);
    }

    /**
     * Format a 24-hour hour & minute to e.g. "7:05 PM".
     */
    formatAmPm(hour24, minute) {
        const ampm = hour24 < 12 ? "AM" : "PM";
        let hour12 = hour24 % 12;
        if (hour12 === 0) hour12 = 12;
        const minuteStr = minute < 10 ? `0${minute}` : `${minute}`;
        return `${hour12}:${minuteStr} ${ampm}`;
    }

    /**
     * If you want to save user’s settings, handle serialization.
     */
    serialize() {
        // Call parent serialization and clone properties
        const data = super.serialize();
        data.properties = { ...this.properties };
        if (this.properties.debug) {
            console.log("[TimeRangeNode] Serialized:", data.properties);
        }
        return data;
    }

    configure(data) {
        // Restore properties and reinitialize widgets
        super.configure(data);
        if (data.properties) {
            Object.assign(this.properties, data.properties);
            if (this.properties.debug) {
                console.log("[TimeRangeNode] Restored properties:", this.properties);
            }
            // Reinitialize widgets to reflect restored properties
            this.widgets = []; // Clear existing widgets
            this.setupWidgets();
        }
    }

}

// Finally, register the node with a unique string ID under "Logic"
LiteGraph.registerNodeType("Logic/TimeRangeNode", TimeRangeNode);
console.log("TimeRangeNode - Registered successfully under 'Logic' category.");
