// File: TimeBasedLogicNode.js

class TimeBasedLogicNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Time-Based Logic (Daily)";
        this.size = [320, 520]; // A bit taller to accommodate extra overlay text
        this.bgcolor = "rgb(70, 130, 180)"; // Steel Blue

        // Node properties
        this.properties = {
            // Duration settings
            durationHours: 0,
            durationMinutes: 0,
            durationSeconds: 0,
            // Interval settings
            intervalHours: 0,
            intervalMinutes: 0,
            intervalSeconds: 0,
            // Start time-of-day (daily)
            startHour: 0,
            startMinute: 0,
            // Debug toggle
            debug: false
        };

        // Single boolean output
        this.addOutput("Signal", "boolean");

        // Create widgets for duration, interval, start time, and debug
        this.setupWidgets();

        // Internal state
        this.lastEmitTime = null;         // Last emission time (Date.now())
        this.isActive = false;            // Are we in "True" phase right now?
        this.lastOutput = null;           // Tracks last output (true/false) to prevent spamming
        this.startCycleActive = false;    // Have we started today's interval/duration cycle yet?
        this.nextStartTime = null;        // Next daily start time in ms
    }

    // ----------------------------------------------------------------
    // Setup the UI sliders/toggles
    // ----------------------------------------------------------------
    setupWidgets() {
        const widgetWidth = this.size[0] - 40;

        // Duration Sliders
        this.addWidget("slider", "Duration Hours", this.properties.durationHours, (value) => {
            this.properties.durationHours = Math.round(value);
        }, { min: 0, max: 23, step: 1, precision: 0, width: widgetWidth });

        this.addWidget("slider", "Duration Minutes", this.properties.durationMinutes, (value) => {
            this.properties.durationMinutes = Math.round(value);
        }, { min: 0, max: 59, step: 1, precision: 0, width: widgetWidth });

        this.addWidget("slider", "Duration Seconds", this.properties.durationSeconds, (value) => {
            this.properties.durationSeconds = Math.round(value);
        }, { min: 0, max: 59, step: 1, precision: 0, width: widgetWidth });

        // Interval Sliders
        this.addWidget("slider", "Interval Hours", this.properties.intervalHours, (value) => {
            this.properties.intervalHours = Math.round(value);
        }, { min: 0, max: 23, step: 1, precision: 0, width: widgetWidth });

        this.addWidget("slider", "Interval Minutes", this.properties.intervalMinutes, (value) => {
            this.properties.intervalMinutes = Math.round(value);
        }, { min: 0, max: 59, step: 1, precision: 0, width: widgetWidth });

        this.addWidget("slider", "Interval Seconds", this.properties.intervalSeconds, (value) => {
            this.properties.intervalSeconds = Math.round(value);
        }, { min: 0, max: 59, step: 1, precision: 0, width: widgetWidth });

        // Start Time Sliders
        this.addWidget("slider", "Start Hour", this.properties.startHour, (value) => {
            this.properties.startHour = Math.round(value);
            this.calculateNextStartTime();
        }, { min: 0, max: 23, step: 1, precision: 0, width: widgetWidth });

        this.addWidget("slider", "Start Minute", this.properties.startMinute, (value) => {
            this.properties.startMinute = Math.round(value);
            this.calculateNextStartTime();
        }, { min: 0, max: 59, step: 1, precision: 0, width: widgetWidth });

        // Debug Toggle
        this.addWidget("toggle", "Debug", this.properties.debug, (value) => {
            this.properties.debug = value;
            console.log(`[TimeBasedLogicNode] Debug mode ${value ? "enabled" : "disabled"}`);
        }, { width: widgetWidth });
    }

    // ----------------------------------------------------------------
    // Helper methods
    // ----------------------------------------------------------------
    getDurationMs() {
        return (
            (this.properties.durationHours * 3600 +
             this.properties.durationMinutes * 60 +
             this.properties.durationSeconds) * 1000
        );
    }

    getIntervalMs() {
        return (
            (this.properties.intervalHours * 3600 +
             this.properties.intervalMinutes * 60 +
             this.properties.intervalSeconds) * 1000
        );
    }

    getDurationString() {
        return `${this.properties.durationHours}h ${this.properties.durationMinutes}m ${this.properties.durationSeconds}s`;
    }

    getIntervalString() {
        return `${this.properties.intervalHours}h ${this.properties.intervalMinutes}m ${this.properties.intervalSeconds}s`;
    }

    /**
     * Converts 24-hour time to 12-hour format with AM/PM.
     */
    formatAMPM(hour, minute) {
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const hour12 = hour % 12 === 0 ? 12 : hour % 12;
        const minuteStr = minute < 10 ? `0${minute}` : minute;
        return `${hour12}:${minuteStr} ${ampm}`;
    }

    /**
     * Calculate the next daily start time (in ms).
     * If today's chosen time already passed, schedule tomorrow.
     */
    calculateNextStartTime() {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        const day = now.getDate();

        let candidate = new Date(year, month, day, this.properties.startHour, this.properties.startMinute, 0, 0);

        if (candidate.getTime() <= now.getTime()) {
            // Start time for today has passed => schedule tomorrow
            candidate.setDate(candidate.getDate() + 1);
        }
        this.nextStartTime = candidate.getTime();
        if (this.properties.debug) {
            console.log(`[TimeBasedLogicNode] Next Start Time => ${candidate.toString()}`);
        }
    }

    // ----------------------------------------------------------------
    // onExecute: Core logic each frame
    // ----------------------------------------------------------------
    onExecute() {
        const now = Date.now();

        // 1) If we haven't scheduled nextStartTime yet, do so
        if (!this.nextStartTime) {
            this.calculateNextStartTime();
        }

        // 2) If now < nextStartTime => we haven't hit today's start => emit false once
        if (now < this.nextStartTime && !this.startCycleActive) {
            if (this.lastOutput !== false) {
                this.setOutputData(0, false);
                this.lastOutput = false;
                if (this.properties.debug) {
                    console.log("[TimeBasedLogicNode] Before nextStartTime => Emitting False once.");
                }
            }
            return;
        }

        // 3) If now >= nextStartTime && we haven’t begun today's cycle => start now
        if (now >= this.nextStartTime && !this.startCycleActive) {
            this.startCycleActive = true;
            this.lastEmitTime = now;
            // Emit True immediately at start time
            this.emitTrue();
            this.isActive = true;
            if (this.properties.debug) {
                console.log(`[TimeBasedLogicNode] => Start time reached => Immediate True at ${new Date().toLocaleTimeString()}.`);
            }
            return;
        }

        // 4) If we're in the daily cycle, handle interval/duration
        if (this.startCycleActive) {
            const elapsed = now - this.lastEmitTime;

            if (!this.isActive && elapsed >= this.getIntervalMs()) {
                // Time to emit True
                this.emitTrue();
                this.lastEmitTime = now;
                this.isActive = true;
                if (this.properties.debug) {
                    console.log(`[TimeBasedLogicNode] Emitting True => ${new Date().toLocaleTimeString()}`);
                }
            }
            else if (this.isActive && elapsed >= this.getDurationMs()) {
                // Time to emit False
                if (this.lastOutput !== false) {
                    this.setOutputData(0, false);
                    this.lastOutput = false;
                    this.isActive = false;
                    this.lastEmitTime = now;
                    if (this.properties.debug) {
                        console.log(`[TimeBasedLogicNode] Emitting False => ${new Date().toLocaleTimeString()}`);
                    }
                }

                // If you only want **one** daily True/False, uncomment:
                /*
                this.startCycleActive = false;
                this.calculateNextStartTime(); // schedule for tomorrow
                if (this.properties.debug) {
                    console.log("[TimeBasedLogicNode] Daily cycle ended. Next start => tomorrow.");
                }
                */
            }
        }
    }

    /**
     * Immediately emit True, updating internal states.
     */
    emitTrue() {
        this.setOutputData(0, true);
        this.lastOutput = true;
        this.isActive = true;
    }

    /**
     * onDrawForeground: display current config & state.
     */
    onDrawForeground(ctx) {
        super.onDrawForeground?.(ctx);

        // Force the node size to 550x850
        if (this.size[0] !== 350 || this.size[1] !== 350) {
            this.size = [350, 350];
            //console.log(`SunriseSunsetTrigger - Node ${this.id} size forced to: ${this.size[0]}x${this.size[1]}`);
            if (this.graph && this.graph.canvas) {
                this.graph.canvas.setDirty(true, true); // Redraw the canvas
            }
        }
    

        const durationLabel = this.getDurationString();
        const intervalLabel = this.getIntervalString();
        const stateText = this.isActive ? "Active" : "Inactive";
        const startTimeLabel = this.formatAMPM(this.properties.startHour, this.properties.startMinute);

        ctx.fillStyle = "#FFF";
        ctx.font = "12px Arial";
        ctx.textAlign = "left";

        const baseY = this.size[1] - 90;
        ctx.fillText(`Duration: ${durationLabel}`, 10, baseY);
        ctx.fillText(`Interval: ${intervalLabel}`, 10, baseY + 15);
        ctx.fillText(`State: ${stateText}`, 10, baseY + 30);
        ctx.fillText(`Start Time: ${startTimeLabel}`, 10, baseY + 45);

        // Optionally display nextStartTime or next event
        if (this.nextStartTime) {
            const dt = new Date(this.nextStartTime);
            ctx.fillText(`Next Start: ${dt.toLocaleString()}`, 10, baseY + 60);
        }

        // If you'd like to display the "Next Event" (like next True or next False)
        // we can do so as well:
        const nextEventMs = this.getNextEventTime(); 
        if (nextEventMs) {
            const dtEvent = new Date(nextEventMs).toLocaleString();
            ctx.fillText(`Next Event: ${dtEvent}`, 10, baseY + 75);
        }
    }

    /**
     * Optionally get the "Next Event" time: 
     * if not started daily cycle => nextStartTime
     * else if isActive => next time we turn false => lastEmitTime + duration
     * else => next time we turn true => lastEmitTime + interval
     */
    getNextEventTime() {
        if (!this.startCycleActive) {
            // we haven't started => next event is the daily start time
            return this.nextStartTime;
        }
        // we are in the cycle
        if (this.isActive) {
            // next event is turning false
            return this.lastEmitTime + this.getDurationMs();
        } else {
            // next event is turning true
            return this.lastEmitTime + this.getIntervalMs();
        }
    }

    /**
     * Save node state
     */
    serialize() {
        const data = super.serialize();
        data.properties = { ...this.properties };
        return data;
    }

    /**
     * Load node state
     */
    configure(data) {
        super.configure(data);
        if (data.properties) {
            Object.assign(this.properties, data.properties);
            this.widgets = [];
            this.setupWidgets();
        }
        // Reset internal states
        this.lastEmitTime = null;
        this.isActive = false;
        this.lastOutput = null;
        this.startCycleActive = false;
        this.nextStartTime = null;
    }

    /**
     * onClose => reset states
     */
    onClose() {
        this.lastEmitTime = null;
        this.isActive = false;
        this.lastOutput = null;
        this.startCycleActive = false;
        this.nextStartTime = null;
        if (this.properties.debug) {
            console.log("[TimeBasedLogicNode] Node closed => state reset.");
        }
    }
}

// Register node
LiteGraph.registerNodeType("Logic/TimeBasedLogicNode", TimeBasedLogicNode);
console.log("TimeBasedLogicNode - Registered successfully under 'Logic' category.");
