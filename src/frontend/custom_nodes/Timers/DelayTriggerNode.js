if (!LiteGraph.registered_node_types["Timers/delay_trigger"]) {

    const { DateTime } = luxon;

    class DelayTriggerNode extends LiteGraph.LGraphNode {
        constructor() {
            super();
            this.title = "Delay Trigger";
            this.size = [400, 500];
            this.bgcolor = "rgb(50, 68, 73)";

            this.properties = {
                on_delay_hours: 0, // Default 0 hours
                on_delay_minutes: 10, // Default 10 minutes
                on_enabled: true, // Enable/disable On delay
                off_delay_hours: 0, // Default 0 hours
                off_delay_minutes: 10, // Default 10 minutes
                off_enabled: true, // Enable/disable Off delay
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                debug: false,
                status: "Waiting for input...",
                countdown: "N/A",
                last_toggle_time: null, // Time of last toggle
                last_toggle_state: null, // State of last toggle (true/false)
                next_trigger_time: null, // Time of next output trigger
                next_trigger_state: null // State to output at next trigger
            };

            this.addInput("State In", "boolean");
            this.addOutput("State", "boolean");

            this.currentState = false; // Current output state
            this.timeoutId = null; // Timeout for scheduled trigger
            this.countdownIntervalId = null; // Interval for countdown display

            this.setupWidgets();
            this.forceSize();

            // Load persisted state from localStorage
            this.loadPersistedState();

            // Initialize state and schedule any pending trigger
            this.checkAndEmitState();
            this.startCountdown();
            console.log("DelayTriggerNode - Initialized.");
        }

        setupWidgets() {
            this.widgets = [];
            const sliderWidth = 300;

            // On Delay Section
            this.addWidget("text", "On Delay Settings", "", null, { readonly: true });
            this.onEnabledLabelWidget = this.addWidget("text", "On Delay Status", this.properties.on_enabled ? "Enabled" : "Disabled", null, {
                readonly: true,
                color: this.properties.on_enabled ? "green" : "red",
                width: sliderWidth
            });
            this.onDelayHoursWidget = this.addWidget("slider", "On Delay Hours", this.properties.on_delay_hours, v => {
                this.properties.on_delay_hours = Math.round(v);
                this.scheduleTrigger();
            }, { min: 0, max: 23, step: 1, precision: 0, width: sliderWidth, disabled: !this.properties.on_enabled });
            this.onDelayMinutesWidget = this.addWidget("slider", "On Delay Minutes", this.properties.on_delay_minutes, v => {
                this.properties.on_delay_minutes = Math.round(v);
                this.scheduleTrigger();
            }, { min: 0, max: 59, step: 1, precision: 0, width: sliderWidth, disabled: !this.properties.on_enabled });
            this.onEnabledWidget = this.addWidget("toggle", "On Delay Enabled", this.properties.on_enabled, v => {
                this.properties.on_enabled = v;
                this.onEnabledLabelWidget.value = v ? "Enabled" : "Disabled";
                this.onEnabledLabelWidget.color = v ? "green" : "red";
                this.onDelayHoursWidget.disabled = !v;
                this.onDelayMinutesWidget.disabled = !v;
                this.scheduleTrigger();
                this.setDirtyCanvas(true);
            }, { width: sliderWidth });

            // Off Delay Section
            this.addWidget("text", "Off Delay Settings", "", null, { readonly: true });
            this.offEnabledLabelWidget = this.addWidget("text", "Off Delay Status", this.properties.off_enabled ? "Enabled" : "Disabled", null, {
                readonly: true,
                color: this.properties.off_enabled ? "green" : "red",
                width: sliderWidth
            });
            this.offDelayHoursWidget = this.addWidget("slider", "Off Delay Hours", this.properties.off_delay_hours, v => {
                this.properties.off_delay_hours = Math.round(v);
                this.scheduleTrigger();
            }, { min: 0, max: 23, step: 1, precision: 0, width: sliderWidth, disabled: !this.properties.off_enabled });
            this.offDelayMinutesWidget = this.addWidget("slider", "Off Delay Minutes", this.properties.off_delay_minutes, v => {
                this.properties.off_delay_minutes = Math.round(v);
                this.scheduleTrigger();
            }, { min: 0, max: 59, step: 1, precision: 0, width: sliderWidth, disabled: !this.properties.off_enabled });
            this.offEnabledWidget = this.addWidget("toggle", "Off Delay Enabled", this.properties.off_enabled, v => {
                this.properties.off_enabled = v;
                this.offEnabledLabelWidget.value = v ? "Enabled" : "Disabled";
                this.offEnabledLabelWidget.color = v ? "green" : "red";
                this.offDelayHoursWidget.disabled = !v;
                this.offDelayMinutesWidget.disabled = !v;
                this.scheduleTrigger();
                this.setDirtyCanvas(true);
            }, { width: sliderWidth });

            // Timezone and Status
            this.timezoneWidget = this.addWidget("combo", "Timezone", this.properties.timezone, v => {
                if (DateTime.local().setZone(v).isValid) {
                    this.properties.timezone = v;
                    this.scheduleTrigger();
                } else {
                    this.updateStatus("Invalid Timezone");
                }
            }, { values: Intl.supportedValuesOf('timeZone'), width: sliderWidth });
            this.statusWidget = this.addWidget("text", "Status", this.properties.status, null, { readonly: true, width: sliderWidth });
            this.countdownWidget = this.addWidget("text", "Countdown", this.properties.countdown, null, { readonly: true, width: sliderWidth });
            this.debugWidget = this.addWidget("toggle", "Debug", this.properties.debug, v => {
                this.properties.debug = v;
                console.log(`Debug ${v ? "enabled" : "disabled"}`);
            }, { width: sliderWidth });
        }

        forceSize() {
            this.size = [400, this.widgets.length * 25 + 100];
            this.setDirtyCanvas(true);
        }

        updateStatus(newStatus) {
            this.properties.status = newStatus;
            if (this.statusWidget) {
                this.statusWidget.value = newStatus;
                this.statusWidget.color = newStatus.includes("Error") ? "red" : newStatus.includes("Triggered") ? "green" : "white";
            }
            this.setDirtyCanvas(true);
            if (this.properties.debug) console.log(`Status: ${newStatus}`);
        }

        loadPersistedState() {
            const stored = localStorage.getItem(`delayTrigger_${this.id}`);
            if (stored) {
                const data = JSON.parse(stored);
                this.properties.last_toggle_time = data.last_toggle_time ? new Date(data.last_toggle_time) : null;
                this.properties.last_toggle_state = data.last_toggle_state;
                this.properties.next_trigger_time = data.next_trigger_time ? new Date(data.next_trigger_time) : null;
                this.properties.next_trigger_state = data.next_trigger_state;
                if (this.properties.debug) console.log(`Loaded from localStorage: ${JSON.stringify(data)}`);
            }
        }

        savePersistedState() {
            localStorage.setItem(`delayTrigger_${this.id}`, JSON.stringify({
                last_toggle_time: this.properties.last_toggle_time?.toISOString(),
                last_toggle_state: this.properties.last_toggle_state,
                next_trigger_time: this.properties.next_trigger_time?.toISOString(),
                next_trigger_state: this.properties.next_trigger_state
            }));
        }

        getDelayInMilliseconds(hours, minutes) {
            return ((hours * 3600) + (minutes * 60)) * 1000;
        }

        scheduleTrigger() {
            // Clear existing timeout
            if (this.timeoutId) {
                clearTimeout(this.timeoutId);
                this.timeoutId = null;
            }

            const now = new Date();
            now.setMilliseconds(0); // Ensure precision to the second
            const toggleTime = this.properties.last_toggle_time;
            const toggleState = this.properties.last_toggle_state;

            if (toggleTime && toggleState !== null) {
                // Ensure toggleTime is precise to the second
                const preciseToggleTime = new Date(toggleTime);
                preciseToggleTime.setMilliseconds(0);

                const isOn = toggleState;
                const enabled = isOn ? this.properties.on_enabled : this.properties.off_enabled;

                if (!enabled) {
                    // If delay is disabled, emit immediately
                    this.currentState = toggleState;
                    this.setOutputData(0, this.currentState);
                    this.properties.next_trigger_time = null;
                    this.properties.next_trigger_state = null;
                    this.updateStatus(`Triggered: ${toggleState ? "On" : "Off"} (Delay Disabled)`);
                    if (this.properties.debug) console.log(`Trigger fired immediately: ${toggleState ? "On" : "Off"} (delay disabled) at ${new Date().toISOString()}`);
                } else {
                    const delay = isOn
                        ? this.getDelayInMilliseconds(this.properties.on_delay_hours, this.properties.on_delay_minutes)
                        : this.getDelayInMilliseconds(this.properties.off_delay_hours, this.properties.off_delay_minutes);
                    const triggerTime = new Date(preciseToggleTime.getTime() + delay);
                    triggerTime.setMilliseconds(0); // Ensure trigger time is precise

                    if (triggerTime > now) {
                        this.properties.next_trigger_time = triggerTime;
                        this.properties.next_trigger_state = toggleState;
                        const timeoutDuration = triggerTime - now - 100; // Fire 100ms early to account for latency
                        if (this.properties.debug) {
                            console.log(`Scheduling trigger for ${toggleState ? "On" : "Off"} at ${triggerTime.toISOString()} (in ${timeoutDuration}ms)`);
                        }
                        this.timeoutId = setTimeout(() => {
                            // Wait until the exact second to fire
                            const currentTime = new Date();
                            const waitUntil = triggerTime.getTime();
                            const waitMs = waitUntil - currentTime.getTime();
                            if (waitMs > 0) {
                                setTimeout(() => {
                                    this.currentState = toggleState;
                                    this.setOutputData(0, this.currentState);
                                    this.properties.next_trigger_time = null;
                                    this.properties.next_trigger_state = null;
                                    this.updateStatus(`Triggered: ${toggleState ? "On" : "Off"} at ${DateTime.fromJSDate(new Date()).toFormat("hh:mm:ss a")}`);
                                    if (this.properties.debug) console.log(`Trigger fired: ${toggleState ? "On" : "Off"} at ${new Date().toISOString()}`);
                                    this.savePersistedState();
                                }, waitMs);
                            } else {
                                this.currentState = toggleState;
                                this.setOutputData(0, this.currentState);
                                this.properties.next_trigger_time = null;
                                this.properties.next_trigger_state = null;
                                this.updateStatus(`Triggered: ${toggleState ? "On" : "Off"} at ${DateTime.fromJSDate(new Date()).toFormat("hh:mm:ss a")}`);
                                if (this.properties.debug) console.log(`Trigger fired: ${toggleState ? "On" : "Off"} at ${new Date().toISOString()}`);
                                this.savePersistedState();
                            }
                        }, Math.max(timeoutDuration, 0));
                        this.updateStatus(`Waiting to trigger ${toggleState ? "On" : "Off"} at ${DateTime.fromJSDate(triggerTime).toFormat("hh:mm:ss a")}`);
                        if (this.properties.debug) console.log(`Scheduled trigger for ${toggleState ? "On" : "Off"} at ${triggerTime.toISOString()}`);
                    } else {
                        // Trigger time is in the past; emit immediately
                        this.currentState = toggleState;
                        this.setOutputData(0, this.currentState);
                        this.properties.next_trigger_time = null;
                        this.properties.next_trigger_state = null;
                        this.updateStatus(`Triggered: ${toggleState ? "On" : "Off"} (Past due)`);
                        if (this.properties.debug) console.log(`Trigger fired immediately: ${toggleState ? "On" : "Off"} (past due) at ${new Date().toISOString()}`);
                    }
                }
            } else {
                this.updateStatus("Waiting for input...");
            }

            this.savePersistedState();
            this.setDirtyCanvas(true);
        }

        checkAndEmitState() {
            const inputState = this.getInputData(0);
            const now = new Date();
            now.setMilliseconds(0); // Ensure precision

            // Check for new toggle input
            if (inputState !== undefined && inputState !== this.properties.last_toggle_state) {
                if (!this.properties.on_enabled && !this.properties.off_enabled) {
                    // If both delays are disabled, pass through immediately
                    this.currentState = inputState;
                    this.setOutputData(0, this.currentState);
                    this.properties.last_toggle_time = null;
                    this.properties.last_toggle_state = null;
                    this.properties.next_trigger_time = null;
                    this.properties.next_trigger_state = null;
                    this.updateStatus(`Passed through: ${inputState ? "On" : "Off"} (Both Delays Disabled)`);
                    if (this.properties.debug) console.log(`Passed through: ${inputState ? "On" : "Off"} (both delays disabled) at ${now.toISOString()}`);
                } else {
                    this.properties.last_toggle_time = now;
                    this.properties.last_toggle_state = inputState;
                    this.scheduleTrigger();
                    if (this.properties.debug) console.log(`New toggle received: ${inputState} at ${now.toISOString()}`);
                }
            }

            // Emit current state
            this.setOutputData(0, this.currentState);
        }

        startCountdown() {
            if (this.countdownIntervalId) clearInterval(this.countdownIntervalId);
            this.countdownIntervalId = setInterval(() => {
                const now = new Date();
                now.setMilliseconds(0);
                const nextTrigger = this.properties.next_trigger_time;

                if (nextTrigger && nextTrigger > now) {
                    const diff = nextTrigger - now;
                    const hours = Math.floor(diff / 3600000);
                    const minutes = Math.floor((diff % 3600000) / 60000);
                    const seconds = Math.floor((diff % 60000) / 1000);
                    this.properties.countdown = `${hours}h ${minutes}m ${seconds}s`;
                } else {
                    this.properties.countdown = "N/A";
                }

                this.countdownWidget.value = this.properties.countdown;
                this.setDirtyCanvas(true);
            }, 1000);
        }

        onExecute() {
            this.checkAndEmitState();
            if (this.properties.debug) console.log(`[onExecute] Output set to ${this.currentState} at ${new Date().toISOString()}`);
        }

        onDrawForeground(ctx) {
            ctx.font = "14px Arial";
            let yOffset = this.size[1] - 70;
            ctx.fillStyle = "rgb(34, 139, 34)";
            ctx.fillText(`Last Toggle: ${this.properties.last_toggle_time ? DateTime.fromJSDate(this.properties.last_toggle_time).toFormat("hh:mm:ss a") + ` (${this.properties.last_toggle_state ? "On" : "Off"})` : "N/A"}`, 10, yOffset);
            yOffset += 20;
            ctx.fillStyle = "rgb(255, 215, 0)";
            ctx.fillText(`Next On Trigger: ${this.properties.next_trigger_time && this.properties.next_trigger_state ? DateTime.fromJSDate(this.properties.next_trigger_time).toFormat("hh:mm:ss a") : "N/A"}`, 10, yOffset);
            yOffset += 20;
            ctx.fillStyle = "rgb(255, 99, 71)";
            ctx.fillText(`Next Off Trigger: ${this.properties.next_trigger_time && !this.properties.next_trigger_state ? DateTime.fromJSDate(this.properties.next_trigger_time).toFormat("hh:mm:ss a") : "N/A"}`, 10, yOffset);
            yOffset += 20;
            ctx.fillStyle = "rgb(224, 153, 57)";
            ctx.fillText(`Countdown: ${this.properties.countdown}`, 10, yOffset);
        }

        onRemoved() {
            if (this.timeoutId) clearTimeout(this.timeoutId);
            if (this.countdownIntervalId) clearInterval(this.countdownIntervalId);
        }

        onConfigure(o) {
            Object.assign(this.properties, o.properties);
            this.properties.last_toggle_time = o.properties.last_toggle_time ? new Date(o.properties.last_toggle_time) : null;
            this.properties.next_trigger_time = o.properties.next_trigger_time ? new Date(o.properties.next_trigger_time) : null;

            if (this.onDelayHoursWidget) this.onDelayHoursWidget.value = this.properties.on_delay_hours;
            if (this.onDelayMinutesWidget) this.onDelayMinutesWidget.value = this.properties.on_delay_minutes;
            if (this.onEnabledWidget) this.onEnabledWidget.value = this.properties.on_enabled;
            if (this.onEnabledLabelWidget) {
                this.onEnabledLabelWidget.value = this.properties.on_enabled ? "Enabled" : "Disabled";
                this.onEnabledLabelWidget.color = this.properties.on_enabled ? "green" : "red";
            }
            if (this.offDelayHoursWidget) this.offDelayHoursWidget.value = this.properties.off_delay_hours;
            if (this.offDelayMinutesWidget) this.offDelayMinutesWidget.value = this.properties.off_delay_minutes;
            if (this.offEnabledWidget) this.offEnabledWidget.value = this.properties.off_enabled;
            if (this.offEnabledLabelWidget) {
                this.offEnabledLabelWidget.value = this.properties.off_enabled ? "Enabled" : "Disabled";
                this.offEnabledLabelWidget.color = this.properties.off_enabled ? "green" : "red";
            }
            if (this.timezoneWidget) this.timezoneWidget.value = this.properties.timezone;
            if (this.statusWidget) this.statusWidget.value = this.properties.status;
            if (this.countdownWidget) this.countdownWidget.value = this.properties.countdown;
            if (this.debugWidget) this.debugWidget.value = this.properties.debug;

            // Update widget states based on enable/disable
            if (this.onDelayHoursWidget) this.onDelayHoursWidget.disabled = !this.properties.on_enabled;
            if (this.onDelayMinutesWidget) this.onDelayMinutesWidget.disabled = !this.properties.on_enabled;
            if (this.offDelayHoursWidget) this.offDelayHoursWidget.disabled = !this.properties.off_enabled;
            if (this.offDelayMinutesWidget) this.offDelayMinutesWidget.disabled = !this.properties.off_enabled;

            this.checkAndEmitState();
            this.scheduleTrigger();
            this.startCountdown();
        }
    }

    LiteGraph.registerNodeType("Timers/delay_trigger", DelayTriggerNode);
    console.log("DelayTriggerNode - Registered successfully.");
}