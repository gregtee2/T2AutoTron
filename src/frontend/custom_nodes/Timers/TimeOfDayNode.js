if (!LiteGraph.registered_node_types["Timers/time_of_day"]) {

    const { DateTime } = luxon;

    class TimeOfDayNode extends LiteGraph.LGraphNode {
        constructor() {
            super();
            this.title = "Time of Day";
            this.size = [550, 850];
            this.bgcolor = "rgb(50, 68, 73)";

            this.properties = {
                start_hour: 8,
                start_minute: 0,
                start_ampm: "AM",
                start_enabled: true,
                stop_hour: 6,
                stop_minute: 0,
                stop_ampm: "PM",
                stop_enabled: true,
                cycle_hour: 4,
                cycle_minute: 45,
                cycle_ampm: "AM",
                cycle_duration: 10,
                cycle_enabled: false,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                debug: false,
                status: "Initializing...",
                countdown: "Calculating...",
                next_on_date: null,
                next_off_date: null,
                next_cycle_date: null
            };

            this.addInput("State In", "boolean");
            this.addOutput("State", "boolean");

            this.currentState = false;
            this.previousState = this.currentState; // Track previous state to emit only on change
            this.onTimeoutId = null;
            this.offTimeoutId = null;
            this.cycleTimeoutId = null;
            this.cycleOffTimeoutId = null;
            this.countdownIntervalId = null;
            this.isCycling = false;
            this.isInitialLoad = true;

            this.setupWidgets();
            this.forceSize();
            document.addEventListener("visibilitychange", this.handleVisibilityChange.bind(this));

            this.scheduleEvents();
            this.startCountdown();
            const stored = localStorage.getItem(`timeOfDay_${this.id}`);
            if (stored && this.properties.debug) console.log(`Loaded from localStorage: ${stored}`);
            console.log("TimeOfDayNode - Initialized.");
        }

        setupWidgets() {
            this.widgets = [];
            const sliderWidth = 300;

            this.addWidget("text", "Start Time", "", null, { readonly: true });
            this.startEnabledLabelWidget = this.addWidget("text", "Start Enabled", this.properties.start_enabled ? "Enabled" : "Disabled", null, {
                readonly: true,
                color: this.properties.start_enabled ? "green" : "red",
                width: sliderWidth
            });
            this.startHourWidget = this.addWidget("slider", "Hour", this.properties.start_hour, v => {
                this.properties.start_hour = Math.round(v);
                this.scheduleEvents();
            }, { min: 1, max: 12, step: 1, precision: 0, width: sliderWidth, disabled: !this.properties.start_enabled });
            this.startMinuteWidget = this.addWidget("slider", "Minute", this.properties.start_minute, v => {
                this.properties.start_minute = Math.round(v);
                this.scheduleEvents();
            }, { min: 0, max: 59, step: 1, precision: 0, width: sliderWidth, disabled: !this.properties.start_enabled });
            this.startAmpmWidget = this.addWidget("combo", "AM/PM", this.properties.start_ampm, v => {
                this.properties.start_ampm = v;
                this.scheduleEvents();
            }, { values: ["AM", "PM"], width: sliderWidth, disabled: !this.properties.start_enabled });
            this.startEnabledWidget = this.addWidget("toggle", "Enabled", this.properties.start_enabled, v => {
                this.properties.start_enabled = v;
                this.startEnabledLabelWidget.value = v ? "Enabled" : "Disabled";
                this.startEnabledLabelWidget.color = v ? "green" : "red";
                this.startHourWidget.disabled = !v;
                this.startMinuteWidget.disabled = !v;
                this.startAmpmWidget.disabled = !v;
                this.scheduleEvents();
                this.setDirtyCanvas(true);
            }, { width: sliderWidth });

            this.addWidget("text", "Stop Time", "", null, { readonly: true });
            this.stopEnabledLabelWidget = this.addWidget("text", "Stop Enabled", this.properties.stop_enabled ? "Enabled" : "Disabled", null, {
                readonly: true,
                color: this.properties.stop_enabled ? "green" : "red",
                width: sliderWidth
            });
            this.stopHourWidget = this.addWidget("slider", "Hour", this.properties.stop_hour, v => {
                this.properties.stop_hour = Math.round(v);
                this.scheduleEvents();
            }, { min: 1, max: 12, step: 1, precision: 0, width: sliderWidth, disabled: !this.properties.stop_enabled });
            this.stopMinuteWidget = this.addWidget("slider", "Minute", this.properties.stop_minute, v => {
                this.properties.stop_minute = Math.round(v);
                this.scheduleEvents();
            }, { min: 0, max: 59, step: 1, precision: 0, width: sliderWidth, disabled: !this.properties.stop_enabled });
            this.stopAmpmWidget = this.addWidget("combo", "AM/PM", this.properties.stop_ampm, v => {
                this.properties.stop_ampm = v;
                this.scheduleEvents();
            }, { values: ["AM", "PM"], width: sliderWidth, disabled: !this.properties.stop_enabled });
            this.stopEnabledWidget = this.addWidget("toggle", "Enabled", this.properties.stop_enabled, v => {
                this.properties.stop_enabled = v;
                this.stopEnabledLabelWidget.value = v ? "Enabled" : "Disabled";
                this.stopEnabledLabelWidget.color = v ? "green" : "red";
                this.stopHourWidget.disabled = !v;
                this.stopMinuteWidget.disabled = !v;
                this.stopAmpmWidget.disabled = !v;
                this.scheduleEvents();
                this.setDirtyCanvas(true);
            }, { width: sliderWidth });

            this.addWidget("text", "Power Cycle", "", null, { readonly: true });
            this.cycleEnabledLabelWidget = this.addWidget("text", "Cycle Enabled", this.properties.cycle_enabled ? "Enabled" : "Disabled", null, {
                readonly: true,
                color: this.properties.cycle_enabled ? "green" : "red",
                width: sliderWidth
            });
            this.cycleHourWidget = this.addWidget("slider", "Hour", this.properties.cycle_hour, v => {
                this.properties.cycle_hour = Math.round(v);
                this.scheduleEvents();
            }, { min: 1, max: 12, step: 1, precision: 0, width: sliderWidth, disabled: !this.properties.cycle_enabled });
            this.cycleMinuteWidget = this.addWidget("slider", "Minute", this.properties.cycle_minute, v => {
                this.properties.cycle_minute = Math.round(v);
                this.scheduleEvents();
            }, { min: 0, max: 59, step: 1, precision: 0, width: sliderWidth, disabled: !this.properties.cycle_enabled });
            this.cycleAmpmWidget = this.addWidget("combo", "AM/PM", this.properties.cycle_ampm, v => {
                this.properties.cycle_ampm = v;
                this.scheduleEvents();
            }, { values: ["AM", "PM"], width: sliderWidth, disabled: !this.properties.cycle_enabled });
            this.cycleDurationWidget = this.addWidget("number", "Cycle Duration (s)", this.properties.cycle_duration, v => {
                this.properties.cycle_duration = Math.max(1, Math.round(v));
                this.scheduleEvents();
            }, { min: 1, max: 60, step: 1, width: sliderWidth, disabled: !this.properties.cycle_enabled });
            this.cycleEnabledWidget = this.addWidget("toggle", "Cycle Enabled", this.properties.cycle_enabled, v => {
                this.properties.cycle_enabled = v;
                this.cycleEnabledLabelWidget.value = v ? "Enabled" : "Disabled";
                this.cycleEnabledLabelWidget.color = v ? "green" : "red";
                this.cycleHourWidget.disabled = !v;
                this.cycleMinuteWidget.disabled = !v;
                this.cycleAmpmWidget.disabled = !v;
                this.cycleDurationWidget.disabled = !v;
                this.scheduleEvents();
                this.setDirtyCanvas(true);
            }, { width: sliderWidth });

            this.timezoneWidget = this.addWidget("combo", "Timezone", this.properties.timezone, v => {
                if (DateTime.local().setZone(v).isValid) {
                    this.properties.timezone = v;
                    this.scheduleEvents();
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
            this.size = [550, this.widgets.length * 25 + 100];
            this.setDirtyCanvas(true);
        }

        updateStatus(newStatus) {
            this.properties.status = newStatus;
            if (this.statusWidget) {
                this.statusWidget.value = newStatus;
                this.statusWidget.color = newStatus.includes("Error") ? "red" : newStatus.includes("success") ? "green" : "white";
            }
            this.setDirtyCanvas(true);
            if (this.properties.debug) console.log(`Status: ${newStatus}`);
        }

        computeNextEvents() {
            const now = DateTime.local().setZone(this.properties.timezone);
            this.properties.next_on_date = this.properties.start_enabled ? this.getNextDateTime(this.properties.start_hour, this.properties.start_minute, this.properties.start_ampm) : null;
            this.properties.next_off_date = this.properties.stop_enabled ? this.getNextDateTime(this.properties.stop_hour, this.properties.stop_minute, this.properties.stop_ampm) : null;
            this.properties.next_cycle_date = this.properties.cycle_enabled ? this.getNextDateTime(this.properties.cycle_hour, this.properties.cycle_minute, this.properties.cycle_ampm) : null;

            if (this.properties.debug) {
                console.log(`Next On: ${this.properties.next_on_date?.toISOString()}, Next Off: ${this.properties.next_off_date?.toISOString()}, Next Cycle: ${this.properties.next_cycle_date?.toISOString()}`);
            }
        }

        getNextDateTime(hour, minute, ampm) {
            let h24 = hour % 12;
            if (ampm === "PM") h24 += 12;
            let date = DateTime.local().setZone(this.properties.timezone).set({ hour: h24, minute, second: 0, millisecond: 0 });
            if (date <= DateTime.local().setZone(this.properties.timezone)) date = date.plus({ days: 1 });
            if (this.properties.debug) console.log(`Computed next date for ${hour}:${minute} ${ampm}: ${date.toISOString()}`);
            return date.toJSDate();
        }

        scheduleEvents() {
            // Clear existing timeouts
            if (this.onTimeoutId) clearTimeout(this.onTimeoutId);
            if (this.offTimeoutId) clearTimeout(this.offTimeoutId);
            if (this.cycleTimeoutId) clearTimeout(this.cycleTimeoutId);
            if (!this.isCycling && this.cycleOffTimeoutId) {
                clearTimeout(this.cycleOffTimeoutId);
                if (this.properties.debug) console.log(`Cleared cycleOffTimeoutId at ${new Date()}`);
            }
            this.onTimeoutId = null;
            this.offTimeoutId = null;
            this.cycleTimeoutId = null;
            if (!this.isCycling) this.cycleOffTimeoutId = null;

            // Compute next events
            this.computeNextEvents();

            const now = new Date();
            const nextOn = this.properties.next_on_date;
            const nextOff = this.properties.next_off_date;
            const nextCycle = this.properties.next_cycle_date;

            // Schedule start event
            if (this.properties.start_enabled && nextOn) {
                const delayOn = nextOn - now;
                if (delayOn > -1000) {
                    this.onTimeoutId = setTimeout(() => {
                        this.currentState = true;
                        if (this.currentState !== this.previousState) {
                            this.setOutputData(0, this.currentState);
                            this.previousState = this.currentState;
                            if (this.properties.debug) console.log(`On event: State changed to ${this.currentState} at ${new Date()}`);
                        }
                        this.updateStatus(`State: On | Next: Off at ${nextOff ? DateTime.fromJSDate(nextOff).toFormat("hh:mm a") : "N/A"}`);
                        if (this.properties.debug) console.log(`On event triggered at ${new Date()}`);
                        this.scheduleEvents();
                    }, Math.max(delayOn, 0));
                }
            }

            // Schedule stop event
            if (this.properties.stop_enabled && nextOff) {
                const delayOff = nextOff - now;
                if (delayOff > -1000) {
                    this.offTimeoutId = setTimeout(() => {
                        this.currentState = false;
                        if (this.currentState !== this.previousState) {
                            this.setOutputData(0, this.currentState);
                            this.previousState = this.currentState;
                            if (this.properties.debug) console.log(`Off event: State changed to ${this.currentState} at ${new Date()}`);
                        }
                        this.updateStatus(`State: Off | Next: On at ${nextOn ? DateTime.fromJSDate(nextOn).toFormat("hh:mm a") : "N/A"}`);
                        if (this.properties.debug) console.log(`Off event triggered at ${new Date()}`);
                        this.scheduleEvents();
                    }, Math.max(delayOff, 0));
                }
            }

            // Schedule cycle event
            if (this.properties.cycle_enabled && nextCycle) {
                const delayCycle = nextCycle - now;
                if (delayCycle > -1000) {
                    this.cycleTimeoutId = setTimeout(() => {
                        if (!this.isCycling) {
                            this.isCycling = true;
                            this.currentState = false;
                            if (this.currentState !== this.previousState) {
                                this.setOutputData(0, this.currentState);
                                this.previousState = this.currentState;
                                if (this.properties.debug) console.log(`Cycle event: State changed to ${this.currentState} at ${new Date()}`);
                            }
                            this.updateStatus(`State: Off | Power Cycle Started`);
                            if (this.properties.debug) console.log(`Power cycle started: Off at ${new Date()}`);
                            if (this.properties.debug) console.log(`Scheduling cycleOffTimeoutId for ${this.properties.cycle_duration} seconds`);

                            this.cycleOffTimeoutId = setTimeout(() => {
                                this.currentState = true;
                                if (this.currentState !== this.previousState) {
                                    this.setOutputData(0, this.currentState);
                                    this.previousState = this.currentState;
                                    if (this.properties.debug) console.log(`Cycle end: State changed to ${this.currentState} at ${new Date()}`);
                                }
                                this.isCycling = false;
                                this.updateStatus(`State: On | Power Cycle Completed`);
                                if (this.properties.debug) console.log(`Power cycle completed: On at ${new Date()}`);
                                this.scheduleEvents();
                            }, this.properties.cycle_duration * 1000);
                        } else {
                            if (this.properties.debug) console.log(`Cycle skipped: Already cycling at ${new Date()}`);
                        }
                        this.scheduleEvents();
                    }, Math.max(delayCycle, 0));
                }
            }

            // Save to localStorage
            localStorage.setItem(`timeOfDay_${this.id}`, JSON.stringify({
                nextOn: nextOn?.toISOString(),
                nextOff: nextOff?.toISOString(),
                nextCycle: nextCycle?.toISOString()
            }));

            // Always compute and emit the current state after scheduling events
            this.checkAndEmitState();
        }

        checkAndEmitState() {
            const newState = this.isCurrentTimeWithinRange();
            if (newState !== this.previousState || this.isInitialLoad) {
                this.currentState = newState;
                this.setOutputData(0, this.currentState);
                this.previousState = this.currentState;
                if (this.properties.debug) {
                    console.log(`${this.isInitialLoad ? "Initial load in " : ""}checkAndEmitState: State changed to ${this.currentState} at ${DateTime.local().setZone(this.properties.timezone)}`);
                }
            }

            const nextOn = this.properties.next_on_date ? DateTime.fromJSDate(this.properties.next_on_date) : null;
            const nextOff = this.properties.next_off_date ? DateTime.fromJSDate(this.properties.next_off_date) : null;
            const nextCycle = this.properties.next_cycle_date ? DateTime.fromJSDate(this.properties.next_cycle_date) : null;
            const nextEvent = this.currentState ? (nextCycle && nextCycle < nextOff ? nextCycle : nextOff) : nextOn;
            this.updateStatus(`State: ${this.currentState ? "On" : "Off"} | Next: ${nextEvent ? (this.currentState ? (nextEvent === nextCycle ? "Cycle" : "Off") : "On") : "N/A"} at ${nextEvent ? DateTime.fromJSDate(nextEvent).toFormat("hh:mm a") : "N/A"}`);
            if (this.properties.debug) console.log(`State checked: ${this.currentState} at ${DateTime.local().setZone(this.properties.timezone)}, isCycling=${this.isCycling}`);
        }

        isCurrentTimeWithinRange() {
            const now = DateTime.local().setZone(this.properties.timezone);
            const inputState = this.getInputData(0);

            if (inputState !== undefined) {
                if (this.properties.debug) console.log(`Input state available: ${inputState}, using it directly`);
                return inputState;
            }

            let startH24 = this.properties.start_hour % 12;
            if (this.properties.start_ampm === "PM") startH24 += 12;
            let todayStart = DateTime.local().setZone(this.properties.timezone).set({
                hour: startH24,
                minute: this.properties.start_minute,
                second: 0,
                millisecond: 0
            });

            let stopH24 = this.properties.stop_hour % 12;
            if (this.properties.stop_ampm === "PM") stopH24 += 12;
            let todayStop = DateTime.local().setZone(this.properties.timezone).set({
                hour: stopH24,
                minute: this.properties.stop_minute,
                second: 0,
                millisecond: 0
            });

            let isOvernight = false;
            if (this.properties.stop_enabled && (stopH24 < startH24 || (stopH24 === startH24 && this.properties.stop_minute <= this.properties.start_minute))) {
                todayStop = todayStop.plus({ days: 1 });
                isOvernight = true;
            }

            if (isOvernight) {
                if (now < todayStart) {
                    let yesterdayStop = todayStop.minus({ days: 1 });
                    if (now >= yesterdayStop) {
                        if (this.properties.debug) console.log(`Between yesterday's stop (${yesterdayStop.toFormat("hh:mm a")}) and today's start (${todayStart.toFormat("hh:mm a")}), state: Off`);
                        return false;
                    } else {
                        todayStart = todayStart.minus({ days: 1 });
                    }
                }
            } else {
                if (now < todayStart) {
                    todayStop = todayStop.minus({ days: 1 });
                }
            }

            if (!this.properties.start_enabled && !this.properties.stop_enabled) {
                if (this.properties.debug) console.log(`Both start and stop disabled, defaulting to false since input is unavailable`);
                return false;
            }

            if (!this.properties.start_enabled) {
                if (this.properties.debug) console.log(`Start disabled, defaulting to false since input is unavailable`);
                return false;
            }

            if (this.properties.stop_enabled && now >= todayStop) {
                if (this.properties.debug) console.log(`Stop time reached (${todayStop.toFormat("hh:mm a")}), forcing Off`);
                return false;
            }

            let isInRange = now >= todayStart && (isOvernight || now < todayStop);
            if (this.properties.debug) {
                console.log(`Time range check: now=${now.toFormat("hh:mm a")} (${now.toISO()}), start=${todayStart.toFormat("hh:mm a")} (${todayStart.toISO()}), stop=${todayStop.toFormat("hh:mm a")} (${todayStop.toISO()}), isOvernight=${isOvernight}, isInRange=${isInRange}`);
            }

            return isInRange;
        }

        startCountdown() {
            if (this.countdownIntervalId) clearInterval(this.countdownIntervalId);
            this.countdownIntervalId = setInterval(() => {
                const now = new Date();
                const nextOn = this.properties.next_on_date;
                const nextOff = this.properties.next_off_date;
                const nextCycle = this.properties.next_cycle_date;

                let nextEvent = null;
                if (this.currentState) {
                    if (this.properties.cycle_enabled && nextCycle && (!nextOff || nextCycle < nextOff)) {
                        nextEvent = nextCycle;
                    } else if (this.properties.stop_enabled && nextOff) {
                        nextEvent = nextOff;
                    }
                } else if (this.properties.start_enabled && nextOn) {
                    nextEvent = nextOn;
                }

                if (nextEvent) {
                    const diff = nextEvent - now;
                    if (diff > 0) {
                        const hours = Math.floor(diff / 3600000);
                        const minutes = Math.floor((diff % 3600000) / 60000);
                        const seconds = Math.floor((diff % 60000) / 1000);
                        this.properties.countdown = `${hours}h ${minutes}m ${seconds}s`;
                    } else {
                        this.properties.countdown = "Event triggered, rescheduling...";
                        this.scheduleEvents();
                    }
                } else {
                    this.properties.countdown = "No events scheduled";
                }

                this.countdownWidget.value = this.properties.countdown;
                this.setDirtyCanvas(true);
            }, 1000);
        }

        onExecute() {
            const inputState = this.getInputData(0);

            if (this.isInitialLoad) {
                // State already set in constructor or onConfigure, just mark as loaded
                this.isInitialLoad = false;
                if (this.properties.debug) console.log(`onExecute: Initial load complete, state already set to ${this.currentState} at ${new Date()}`);
            }

            if (!this.isCycling) {
                const newState = this.isCurrentTimeWithinRange();
                if (newState !== this.previousState) {
                    this.currentState = newState;
                    this.setOutputData(0, this.currentState);
                    this.previousState = this.currentState;
                    if (this.properties.debug) console.log(`[onExecute] State changed to ${this.currentState} at ${new Date()}`);
                }
            }
            if (this.properties.debug) console.log(`[onExecute] State: ${this.currentState} at ${new Date()}, inputState=${inputState}, isCycling=${this.isCycling}`);
        }

        onDrawForeground(ctx) {
            // Call parent method if it exists
            super.onDrawForeground?.(ctx);

            // Draw colored outline based on current state
            const isOn = this.currentState; // Use currentState to determine output
            ctx.strokeStyle = isOn ? "#00FF00" : "#FF0000"; // Green if true, Red if false
            ctx.lineWidth = 3; // Outline thickness
            ctx.strokeRect(2, 2, this.size[0] - 4, this.size[1] - 4); // Draw border slightly inset

            // Existing text drawing
            ctx.fillStyle = "rgb(34, 139, 34)"; // Green for Next On
            ctx.font = "18px Arial";
            ctx.fillText(
                `Next On: ${this.properties.next_on_date ? DateTime.fromJSDate(this.properties.next_on_date).toFormat("hh:mm a") : "N/A"}`,
                10,
                this.size[1] - 70
            );
            ctx.fillStyle = "#FF0000"; // Red for Next Off
            ctx.fillText(
                `Next Off: ${this.properties.next_off_date ? DateTime.fromJSDate(this.properties.next_off_date).toFormat("hh:mm a") : "N/A"}`,
                10,
                this.size[1] - 50
            );
            ctx.fillStyle = "rgb(255, 215, 0)"; // Yellow for Next Cycle
            ctx.fillText(
                `Next Cycle: ${this.properties.next_cycle_date ? DateTime.fromJSDate(this.properties.next_cycle_date).toFormat("hh:mm a") : "N/A"}`,
                10,
                this.size[1] - 30
            );
            ctx.fillStyle = "rgb(224, 153, 57)"; // Orange for Next Event
            ctx.fillText(`Next Event: ${this.properties.countdown}`, 10, this.size[1] - 10);
        }

        handleVisibilityChange() {
            if (!document.hidden) {
                this.checkAndEmitState();
                this.scheduleEvents();
            }
        }

        onRemoved() {
            if (this.onTimeoutId) clearTimeout(this.onTimeoutId);
            if (this.offTimeoutId) clearTimeout(this.offTimeoutId);
            if (this.cycleTimeoutId) clearTimeout(this.cycleTimeoutId);
            if (this.cycleOffTimeoutId) clearTimeout(this.cycleOffTimeoutId);
            if (this.countdownIntervalId) clearInterval(this.countdownIntervalId);
            document.removeEventListener("visibilitychange", this.handleVisibilityChange);
        }

        onConfigure(o) {
            Object.assign(this.properties, o.properties);
            this.properties.next_on_date = o.properties.next_on_date ? new Date(o.properties.next_on_date) : null;
            this.properties.next_off_date = o.properties.next_off_date ? new Date(o.properties.next_off_date) : null;
            this.properties.next_cycle_date = o.properties.next_cycle_date ? new Date(o.properties.next_cycle_date) : null;

            // Update widget values
            if (this.startHourWidget) {
                this.startHourWidget.value = this.properties.start_hour;
                this.startHourWidget.disabled = !this.properties.start_enabled;
            }
            if (this.startMinuteWidget) {
                this.startMinuteWidget.value = this.properties.start_minute;
                this.startMinuteWidget.disabled = !this.properties.start_enabled;
            }
            if (this.startAmpmWidget) {
                this.startAmpmWidget.value = this.properties.start_ampm;
                this.startAmpmWidget.disabled = !this.properties.start_enabled;
            }
            if (this.startEnabledWidget) this.startEnabledWidget.value = this.properties.start_enabled;
            if (this.stopHourWidget) {
                this.stopHourWidget.value = this.properties.stop_hour;
                this.stopHourWidget.disabled = !this.properties.stop_enabled;
            }
            if (this.stopMinuteWidget) {
                this.stopMinuteWidget.value = this.properties.stop_minute;
                this.stopMinuteWidget.disabled = !this.properties.stop_enabled;
            }
            if (this.stopAmpmWidget) {
                this.startAmpmWidget.value = this.properties.stop_ampm;
                this.stopAmpmWidget.disabled = !this.properties.stop_enabled;
            }
            if (this.stopEnabledWidget) this.stopEnabledWidget.value = this.properties.stop_enabled;
            if (this.cycleHourWidget) {
                this.cycleHourWidget.value = this.properties.cycle_hour;
                this.cycleHourWidget.disabled = !this.properties.cycle_enabled;
            }
            if (this.cycleMinuteWidget) {
                this.cycleMinuteWidget.value = this.properties.cycle_minute;
                this.cycleMinuteWidget.disabled = !this.properties.cycle_enabled;
            }
            if (this.cycleAmpmWidget) {
                this.cycleAmpmWidget.value = this.properties.cycle_ampm;
                this.cycleAmpmWidget.disabled = !this.properties.cycle_enabled;
            }
            if (this.cycleDurationWidget) {
                this.cycleDurationWidget.value = this.properties.cycle_duration;
                this.cycleDurationWidget.disabled = !this.properties.cycle_enabled;
            }
            if (this.cycleEnabledWidget) this.cycleEnabledWidget.value = this.properties.cycle_enabled;
            if (this.timezoneWidget) this.timezoneWidget.value = this.properties.timezone;
            if (this.statusWidget) this.statusWidget.value = this.properties.status;
            if (this.countdownWidget) this.countdownWidget.value = this.properties.countdown;
            if (this.debugWidget) this.debugWidget.value = this.properties.debug;
            if (this.startEnabledLabelWidget) {
                this.startEnabledLabelWidget.value = this.properties.start_enabled ? "Enabled" : "Disabled";
                this.startEnabledLabelWidget.color = this.properties.start_enabled ? "green" : "red";
            }
            if (this.stopEnabledLabelWidget) {
                this.stopEnabledLabelWidget.value = this.properties.stop_enabled ? "Enabled" : "Disabled";
                this.stopEnabledLabelWidget.color = this.properties.stop_enabled ? "green" : "red";
            }
            if (this.cycleEnabledLabelWidget) {
                this.cycleEnabledLabelWidget.value = this.properties.cycle_enabled ? "Enabled" : "Disabled";
                this.cycleEnabledLabelWidget.color = this.properties.cycle_enabled ? "green" : "red";
            }

            this.isInitialLoad = true;
            if (this.properties.debug) console.log(`onConfigure: Initializing state and scheduling events`);
            this.scheduleEvents();
            this.startCountdown();
            // Force immediate state emission
            this.checkAndEmitState();
            this.isInitialLoad = false; // Mark as loaded to avoid redundant checks in onExecute
        }
    }

    LiteGraph.registerNodeType("Timers/time_of_day", TimeOfDayNode);
    console.log("TimeOfDayNode - Registered successfully.");
}