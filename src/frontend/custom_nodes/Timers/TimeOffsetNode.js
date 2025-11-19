// File: TimeOffsetNode.js

class TimeOffsetNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Time Offset";
        this.size = [350, 350];
        this.bgcolor = "rgb(50, 68, 73)";

        this.properties = {
            on_offset_hours: 0,
            on_offset_minutes: 0,
            on_offset_seconds: 0,
            off_offset_hours: 0,
            off_offset_minutes: 0,
            off_offset_seconds: 0,
            debug: false,
            scheduledTime: null 
        };

        this.addInput("Trigger", "boolean");
        this.addOutput("Delayed Trigger", "boolean");

        this.currentTimeout = null;
        this.storedValue = null;
        this.storedCommand = null;
        this.lastEmittedValue = null;
        this.lastInputValue = null; // NEW: Track the last input to detect changes

        this._lastScheduledTime = null;
        this._cachedScheduledText = null;

        this.lastLogTime = 0;
        this.logInterval = 200;

        this.setupWidgets();
        this.log("TimeOffsetNode - Initialized.");
    }

    setupWidgets() {
        const sliderWidth = this.size[0] - 60;

        this.addWidget("text", "on_offset_label", "---- On Offset ----", null, { readonly: true });
        this.addWidget("slider", "on_offset_hours", this.properties.on_offset_hours, (v) => {
            this.properties.on_offset_hours = this.validateWholeNumber(v);
            this.updateDisplay();
            this.rescheduleTimeout();
            this.log(`On Hours -> ${this.properties.on_offset_hours}`);
        }, { min: 0, max: 24, step: 1, precision: 0, width: sliderWidth });
        this.addWidget("slider", "on_offset_minutes", this.properties.on_offset_minutes, (v) => {
            this.properties.on_offset_minutes = this.validateWholeNumber(v);
            this.updateDisplay();
            this.rescheduleTimeout();
            this.log(`On Minutes -> ${this.properties.on_offset_minutes}`);
        }, { min: 0, max: 59, step: 1, precision: 0, width: sliderWidth });
        this.addWidget("slider", "on_offset_seconds", this.properties.on_offset_seconds, (v) => {
            this.properties.on_offset_seconds = this.validateWholeNumber(v);
            this.updateDisplay();
            this.rescheduleTimeout();
            this.log(`On Seconds -> ${this.properties.on_offset_seconds}`);
        }, { min: 0, max: 59, step: 1, precision: 0, width: sliderWidth });

        this.addWidget("text", "off_offset_label", "---- Off Offset ----", null, { readonly: true });
        this.addWidget("slider", "off_offset_hours", this.properties.off_offset_hours, (v) => {
            this.properties.off_offset_hours = this.validateWholeNumber(v);
            this.updateDisplay();
            this.rescheduleTimeout();
            this.log(`Off Hours -> ${this.properties.off_offset_hours}`);
        }, { min: 0, max: 24, step: 1, precision: 0, width: sliderWidth });
        this.addWidget("slider", "off_offset_minutes", this.properties.off_offset_minutes, (v) => {
            this.properties.off_offset_minutes = this.validateWholeNumber(v);
            this.updateDisplay();
            this.rescheduleTimeout();
            this.log(`Off Minutes -> ${this.properties.off_offset_minutes}`);
        }, { min: 0, max: 59, step: 1, precision: 0, width: sliderWidth });
        this.addWidget("slider", "off_offset_seconds", this.properties.off_offset_seconds, (v) => {
            this.properties.off_offset_seconds = this.validateWholeNumber(v);
            this.updateDisplay();
            this.rescheduleTimeout();
            this.log(`Off Seconds -> ${this.properties.off_offset_seconds}`);
        }, { min: 0, max: 59, step: 1, precision: 0, width: sliderWidth });

        this.addWidget("toggle", "debug", this.properties.debug, (v) => {
            this.properties.debug = v;
            this.log(`Debug: ${this.properties.debug ? "on" : "off"}`);
        }, { width: sliderWidth });

        this.displayWidget = this.addWidget("text", "display", "", null, { readonly: true });
        this.updateDisplay();
    }

    log(msg) {
        if (!this.properties.debug) return;
        const now = Date.now();
        if (now - this.lastLogTime > this.logInterval) {
            console.log(`TimeOffsetNode - ${msg}`);
            this.lastLogTime = now;
        }
    }

    validateWholeNumber(value) {
        const n = parseInt(value, 10);
        if (isNaN(n) || n < 0) {
            this.log(`Invalid input (${value}), resetting to 0.`);
            return 0;
        }
        return n;
    }

    updateDisplay() {
        const onText = `${this.properties.on_offset_hours}h ${this.properties.on_offset_minutes}m ${this.properties.on_offset_seconds}s`;
        const offText = `${this.properties.off_offset_hours}h ${this.properties.off_offset_minutes}m ${this.properties.off_offset_seconds}s`;
        const combined = `On Offset: ${onText}\nOff Offset: ${offText}`;
        if (this.displayWidget) this.displayWidget.value = combined;
        this.setDirtyCanvas(true);
    }

    getOffsetInMilliseconds(cmd) {
        if (cmd === "on") {
            const { on_offset_hours:h, on_offset_minutes:m, on_offset_seconds:s } = this.properties;
            const ms = (h * 3600 + m * 60 + s) * 1000;
            this.log(`Calculated ${cmd} offset: ${ms}ms`);
            return ms;
        } else if (cmd === "off") {
            const { off_offset_hours:h, off_offset_minutes:m, off_offset_seconds:s } = this.properties;
            const ms = (h * 3600 + m * 60 + s) * 1000;
            this.log(`Calculated ${cmd} offset: ${ms}ms`);
            return ms;
        }
        this.log(`Invalid command (${cmd}), defaulting to 0ms`);
        return 0;
    }

    rescheduleTimeout() {
        if (this.storedValue !== null && this.storedCommand !== null) {
            this.scheduleTimeout();
        }
    }

    handleTrigger(value) {
        // NEW: Only process if the value has changed or no trigger is pending
        if (this.storedValue !== null && this.storedCommand !== null) {
            this.log("Ignored new trigger; one is already pending.");
            return;
        }
        if (this.lastInputValue === value) {
            this.log(`Ignored trigger ${value}; no change from last input.`);
            return;
        }

        this.storedValue = Boolean(value);
        this.storedCommand = this.storedValue ? "on" : "off";
        this.lastInputValue = this.storedValue; // Update last input
        this.log(`Received Trigger: ${this.storedValue ? "On" : "Off"}`);

        const now = new Date();
        const offsetMs = this.getOffsetInMilliseconds(this.storedCommand);
        const schedTime = new Date(now.getTime() + offsetMs);
        this.properties.scheduledTime = schedTime;
        this.log(`Scheduled Trigger Time: ${schedTime.toLocaleString()}`);

        this.scheduleTimeout();
        this.setDirtyCanvas(true);
    }

    scheduleTimeout() {
        if (this.currentTimeout) {
            clearTimeout(this.currentTimeout);
            this.currentTimeout = null;
            this.log("Cleared previous timeout.");
        }
        if (this.storedValue === null || this.storedCommand === null) return;

        const delay = this.getOffsetInMilliseconds(this.storedCommand);
        if (delay <= 0) {
            this.log("No offset or invalid offset, emitting immediately.");
            this.emitDelayedTrigger();
            return;
        }

        this.currentTimeout = setTimeout(() => {
            this.emitDelayedTrigger();
            this.currentTimeout = null;
        }, delay);
        this.log(`Scheduled ${this.storedCommand.toUpperCase()} in ${delay / 1000} seconds.`);
    }

    emitDelayedTrigger() {
        if (this.storedValue !== null) {
            if (this.storedValue !== this.lastEmittedValue) {
                this.setOutputData(0, this.storedValue);
                this.triggerSlot(0);
                this.log(`Emitted Delayed Trigger: ${this.storedValue ? "On" : "Off"}`);
                this.lastEmittedValue = this.storedValue;
            } else {
                this.log("Trigger matches last emission; skipping.");
            }

            this.storedValue = null;
            this.storedCommand = null;
            this.properties.scheduledTime = null;
            this.log("Reset scheduling data.");
            this.setDirtyCanvas(true);
        }
    }

    onExecute() {
        const triggerVal = this.getInputData(0);
        if (triggerVal !== undefined && triggerVal !== null) {
            this.handleTrigger(triggerVal);
        }
    }

    onRemoved() {
        if (this.currentTimeout) {
            clearTimeout(this.currentTimeout);
            this.currentTimeout = null;
            this.log("Cleared pending timeout on removal.");
        }
        this.properties.scheduledTime = null;
    }

    onDrawForeground(ctx) {
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "14px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";

        const onOffset = `${this.properties.on_offset_hours}h ${this.properties.on_offset_minutes}m ${this.properties.on_offset_seconds}s`;
        const offOffset = `${this.properties.off_offset_hours}h ${this.properties.off_offset_minutes}m ${this.properties.off_offset_seconds}s`;
        const offsetsText = `On Offset: ${onOffset} | Off Offset: ${offOffset}`;

        const offsetsX = this.size[0] / 2;
        const offsetsY = this.size[1] - 40;
        ctx.fillText(offsetsText, offsetsX, offsetsY);

        ctx.fillStyle = "#FFD700";
        ctx.font = "14px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";

        if (!this._lastScheduledTime || this._lastScheduledTime !== this.properties.scheduledTime) {
            this._lastScheduledTime = this.properties.scheduledTime;
            let scheduledText = "No trigger scheduled.";
            try {
                if (this.properties.scheduledTime instanceof Date && !isNaN(this.properties.scheduledTime)) {
                    const options = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
                    scheduledText = `Scheduled Trigger At: ${this.properties.scheduledTime.toLocaleTimeString(undefined, options)}`;
                } else if (this.properties.scheduledTime) {
                    console.error(`TimeOffsetNode - Invalid scheduledTime: ${this.properties.scheduledTime}`);
                    scheduledText = "Invalid scheduled time.";
                }
            } catch (e) {
                console.error(`TimeOffsetNode - Error formatting scheduledTime: ${e.message}`, this.properties.scheduledTime);
                scheduledText = "Error displaying time.";
            }
            this._cachedScheduledText = scheduledText;
        }

        const scheduledX = this.size[0] / 2;
        const scheduledY = this.size[1] - 10;
        ctx.fillText(this._cachedScheduledText || "No trigger scheduled.", scheduledX, scheduledY);
    }

    onSerialize(o) {
        o.properties = LiteGraph.cloneObject(this.properties);
        if (o.properties.scheduledTime instanceof Date) {
            o.properties.scheduledTime = o.properties.scheduledTime.toISOString();
        }
        o.storedValue = this.storedValue;
        o.storedCommand = this.storedCommand;
        o.lastEmittedValue = this.lastEmittedValue;
        o.lastInputValue = this.lastInputValue; // NEW: Serialize last input
    }

    onConfigure(o) {
        if (o.properties) {
            this.properties = LiteGraph.cloneObject(o.properties);
            if (this.properties.scheduledTime) {
                this.properties.scheduledTime = new Date(this.properties.scheduledTime);
                if (isNaN(this.properties.scheduledTime)) {
                    console.warn(`TimeOffsetNode - Invalid scheduledTime on load: ${this.properties.scheduledTime}, resetting to null.`);
                    this.properties.scheduledTime = null;
                }
            }
        }
        this.storedValue = o.storedValue || null;
        this.storedCommand = o.storedCommand || null;
        this.lastEmittedValue = o.lastEmittedValue || null;
        this.lastInputValue = o.lastInputValue || null; // NEW: Restore last input

        for (let w of this.widgets) {
            if (this.properties.hasOwnProperty(w.name)) {
                w.value = this.properties[w.name];
            }
        }
        this.updateDisplay();

        if (this.storedValue !== null && this.storedCommand !== null) {
            this.scheduleTimeout();
        }
        this.log("TimeOffsetNode - Loaded from saved config.");
    }

    forceSize() {
        this.size = [350, 350];
    }

    onAdded() {
        this.forceSize();
        this.scheduleTimeout();
    }
}

LiteGraph.registerNodeType("Timers/TimeOffsetNode", TimeOffsetNode);
console.log("TimeOffsetNode - Registered successfully under 'Timers' category.");