if (!LiteGraph.registered_node_types["Timers/sunrise_sunset_trigger"]) {

    const { DateTime } = luxon;

    class SunriseSunsetTrigger extends LiteGraph.LGraphNode {
        constructor() {
            super();
            this.title = "Sunrise/Sunset Trigger";
            this.size = [550, 950];
            this.bgcolor = "rgb(50, 68, 73)";

            this.properties = {
                on_offset_hours: 0,
                on_offset_minutes: 30,
                on_offset_direction: "Before",
                on_enabled: true,
                fixed_on_hour: 6,
                fixed_on_minute: 0,
                fixed_on_ampm: "PM",
                fixed_on_enabled: false,
                off_offset_hours: 0,
                off_offset_minutes: 0,
                off_offset_direction: "Before",
                off_enabled: true,
                fixed_stop_hour: 10,
                fixed_stop_minute: 30,
                fixed_stop_ampm: "PM",
                fixed_stop_enabledjade: true,
                latitude: null,
                longitude: null,
                city: "",
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
                final_on_time: "",
                final_off_time: "",
                status: "Initializing...",
                sunrise_time: null,
                sunset_time: null,
                next_on_date: null,
                next_off_date: null,
                countdown: "Calculating...",
                debug: false
            };

            this.addOutput("State", "boolean");

            this.currentState = false;
            this.onTimeoutId = null;
            this.offTimeoutId = null;
            this.countdownIntervalId = null;

            // Bind methods to prevent context loss
            this.checkAndEmitState = this.checkAndEmitState.bind(this);
            this.scheduleSunEvents = this.scheduleSunEvents.bind(this);
            this.fetchSunTimes = this.fetchSunTimes.bind(this);
            this.startCountdown = this.startCountdown.bind(this);
            this.handleVisibilityChange = this.handleVisibilityChange.bind(this);

            this.setupWidgets();
            document.addEventListener("visibilitychange", this.handleVisibilityChange);

            try {
                this.fetchSunTimes();
                this.startCountdown();
                if (typeof this.checkAndEmitState === 'function') {
                    this.checkAndEmitState();
                } else {
                    console.error("checkAndEmitState is not a function. Check class definition.");
                    this.updateStatus("Error: checkAndEmitState method missing");
                }
            } catch (error) {
                console.error("Error in constructor:", error);
                this.updateStatus(`Constructor error: ${error.message}`);
            }
        }

        setupWidgets() {
            this.widgets = [];
            const sliderWidth = 350; // Standardized width for consistency

            // Helper for section headers
            const addSectionHeader = (title) => {
                this.addWidget("text", title, "", null, { readonly: true, font_size: 16, bold: true });
            };

            // On Offset (Sunset)
            addSectionHeader("On Offset (Sunset)");
            this.event1EnabledLabelWidget = this.addWidget("text", "On Offset Enabled", this.properties.on_enabled ? "Enabled" : "Disabled", null, {
                readonly: true,
                color: this.properties.on_enabled ? "green" : "red",
                width: sliderWidth
            });
            this.event1HourWidget = this.addWidget("slider", "Hours", this.properties.on_offset_hours, v => {
                const intValue = parseInt(v, 10);
                if (this.validateRange(intValue, 0, 23, "On Offset Hours")) {
                    this.properties.on_offset_hours = intValue;
                    this.updateFinalTimes();
                    this.scheduleSunEvents();
                }
            }, { min: 0, max: 23, step: 1, precision: 0, width: sliderWidth, disabled: !this.properties.on_enabled });

            this.event1MinuteWidget = this.addWidget("slider", "Minutes", this.properties.on_offset_minutes, v => {
                const intValue = parseInt(v, 10);
                if (this.validateRange(intValue, 0, 59, "On Offset Minutes")) {
                    this.properties.on_offset_minutes = intValue;
                    this.updateFinalTimes();
                    this.scheduleSunEvents();
                }
            }, { min: 0, max: 59, step: 1, precision: 0, width: sliderWidth, disabled: !this.properties.on_enabled });

            this.event1DirectionWidget = this.addWidget("combo", "Direction", this.properties.on_offset_direction, v => {
                if (this.validateDirection(v, "On Offset Direction")) {
                    this.properties.on_offset_direction = v;
                    this.updateFinalTimes();
                    this.scheduleSunEvents();
                }
            }, { values: ["Before", "After"], width: sliderWidth, disabled: !this.properties.on_enabled });

            this.event1EnabledWidget = this.addWidget("toggle", "Enabled", this.properties.on_enabled, v => {
                this.properties.on_enabled = v;
                // Update label color and text
                this.event1EnabledLabelWidget.value = v ? "Enabled" : "Disabled";
                this.event1EnabledLabelWidget.color = v ? "green" : "red";
                // Enable/disable related widgets
                this.event1HourWidget.disabled = !v;
                this.event1MinuteWidget.disabled = !v;
                this.event1DirectionWidget.disabled = !v;
                this.scheduleSunEvents();
                this.setDirtyCanvas(true);
            }, { width: sliderWidth });

            // Fixed On Time
            addSectionHeader("Fixed On Time");
            this.fixedOnEnabledLabelWidget = this.addWidget("text", "Fixed On Enabled", this.properties.fixed_on_enabled ? "Enabled" : "Disabled", null, {
                readonly: true,
                color: this.properties.fixed_on_enabled ? "green" : "red",
                width: sliderWidth
            });
            this.fixedOnHourWidget = this.addWidget("slider", "Hour", this.properties.fixed_on_hour, v => {
                const intValue = parseInt(v, 10);
                if (this.validateRange(intValue, 1, 12, "Fixed On Hour")) {
                    this.properties.fixed_on_hour = intValue;
                    this.updateFinalTimes();
                    this.scheduleSunEvents();
                }
            }, { min: 1, max: 12, step: 1, precision: 0, width: sliderWidth, disabled: !this.properties.fixed_on_enabled });

            this.fixedOnMinuteWidget = this.addWidget("slider", "Minute", this.properties.fixed_on_minute, v => {
                const intValue = parseInt(v, 10);
                if (this.validateRange(intValue, 0, 59, "Fixed On Minute")) {
                    this.properties.fixed_on_minute = intValue;
                    this.updateFinalTimes();
                    this.scheduleSunEvents();
                }
            }, { min: 0, max: 59, step: 1, precision: 0, width: sliderWidth, disabled: !this.properties.fixed_on_enabled });

            this.fixedOnAmpmWidget = this.addWidget("combo", "AM/PM", this.properties.fixed_on_ampm, v => {
                if (v === "AM" || v === "PM") {
                    this.properties.fixed_on_ampm = v;
                    this.updateFinalTimes();
                    this.scheduleSunEvents();
                }
            }, { values: ["AM", "PM"], width: sliderWidth, disabled: !this.properties.fixed_on_enabled });

            this.fixedOnEnabledWidget = this.addWidget("toggle", "Enabled", this.properties.fixed_on_enabled, v => {
                this.properties.fixed_on_enabled = v;
                // Update label color and text
                this.fixedOnEnabledLabelWidget.value = v ? "Enabled" : "Disabled";
                this.fixedOnEnabledLabelWidget.color = v ? "green" : "red";
                // Enable/disable related widgets
                this.fixedOnHourWidget.disabled = !v;
                this.fixedOnMinuteWidget.disabled = !v;
                this.fixedOnAmpmWidget.disabled = !v;
                this.updateFinalTimes();
                this.scheduleSunEvents();
                this.setDirtyCanvas(true);
            }, { width: sliderWidth });

            // Off Offset (Sunrise)
            addSectionHeader("Off Offset (Sunrise)");
            this.event2EnabledLabelWidget = this.addWidget("text", "Off Offset Enabled", this.properties.off_enabled ? "Enabled" : "Disabled", null, {
                readonly: true,
                color: this.properties.off_enabled ? "green" : "red",
                width: sliderWidth
            });
            this.event2HourWidget = this.addWidget("slider", "Hours", this.properties.off_offset_hours, v => {
                const intValue = parseInt(v, 10);
                if (this.validateRange(intValue, 0, 23, "Off Offset Hours")) {
                    this.properties.off_offset_hours = intValue;
                    this.updateFinalTimes();
                    this.scheduleSunEvents();
                }
            }, { min: 0, max: 23, step: 1, precision: 0, width: sliderWidth, disabled: !this.properties.off_enabled });

            this.event2MinuteWidget = this.addWidget("slider", "Minutes", this.properties.off_offset_minutes, v => {
                const intValue = parseInt(v, 10);
                if (this.validateRange(intValue, 0, 59, "Off Offset Minutes")) {
                    this.properties.off_offset_minutes = intValue;
                    this.updateFinalTimes();
                    this.scheduleSunEvents();
                }
            }, { min: 0, max: 59, step: 1, precision: 0, width: sliderWidth, disabled: !this.properties.off_enabled });

            this.event2DirectionWidget = this.addWidget("combo", "Direction", this.properties.off_offset_direction, v => {
                if (this.validateDirection(v, "Off Offset Direction")) {
                    this.properties.off_offset_direction = v;
                    this.updateFinalTimes();
                    this.scheduleSunEvents();
                }
            }, { values: ["Before", "After"], width: sliderWidth, disabled: !this.properties.off_enabled });

            this.event2EnabledWidget = this.addWidget("toggle", "Enabled", this.properties.off_enabled, v => {
                this.properties.off_enabled = v;
                // Update label color and text
                this.event2EnabledLabelWidget.value = v ? "Enabled" : "Disabled";
                this.event2EnabledLabelWidget.color = v ? "green" : "red";
                // Enable/disable related widgets
                this.event2HourWidget.disabled = !v;
                this.event2MinuteWidget.disabled = !v;
                this.event2DirectionWidget.disabled = !v;
                this.scheduleSunEvents();
                this.setDirtyCanvas(true);
            }, { width: sliderWidth });

            // Fixed Stop Time
            addSectionHeader("Fixed Stop Time");
            this.fixedStopEnabledLabelWidget = this.addWidget("text", "Fixed Stop Enabled", this.properties.fixed_stop_enabled ? "Enabled" : "Disabled", null, {
                readonly: true,
                color: this.properties.fixed_stop_enabled ? "green" : "red",
                width: sliderWidth
            });
            this.fixedStopHourWidget = this.addWidget("slider", "Hour", this.properties.fixed_stop_hour, v => {
                const intValue = parseInt(v, 10);
                if (this.validateRange(intValue, 1, 12, "Fixed Stop Hour")) {
                    this.properties.fixed_stop_hour = intValue;
                    this.updateFinalTimes();
                    this.scheduleSunEvents();
                }
            }, { min: 1, max: 12, step: 1, precision: 0, width: sliderWidth, disabled: !this.properties.fixed_stop_enabled });

            this.fixedStopMinuteWidget = this.addWidget("slider", "Minute", this.properties.fixed_stop_minute, v => {
                const intValue = parseInt(v, 10);
                if (this.validateRange(intValue, 0, 59, "Fixed Stop Minute")) {
                    this.properties.fixed_stop_minute = intValue;
                    this.updateFinalTimes();
                    this.scheduleSunEvents();
                }
            }, { min: 0, max: 59, step: 1, precision: 0, width: sliderWidth, disabled: !this.properties.fixed_stop_enabled });

            this.fixedStopAmpmWidget = this.addWidget("combo", "AM/PM", this.properties.fixed_stop_ampm, v => {
                if (v === "AM" || v === "PM") {
                    this.properties.fixed_stop_ampm = v;
                    this.updateFinalTimes();
                    this.scheduleSunEvents();
                }
            }, { values: ["AM", "PM"], width: sliderWidth, disabled: !this.properties.fixed_stop_enabled });

            this.fixedStopEnabledWidget = this.addWidget("toggle", "Enabled", this.properties.fixed_stop_enabled, v => {
                this.properties.fixed_stop_enabled = v;
                // Update label color and text
                this.fixedStopEnabledLabelWidget.value = v ? "Enabled" : "Disabled";
                this.fixedStopEnabledLabelWidget.color = v ? "green" : "red";
                // Enable/disable related widgets
                this.fixedStopHourWidget.disabled = !v;
                this.fixedStopMinuteWidget.disabled = !v;
                this.fixedStopAmpmWidget.disabled = !v;
                this.updateFinalTimes();
                this.scheduleSunEvents();
                this.setDirtyCanvas(true);
            }, { width: sliderWidth });

            // Location and Other Widgets
            addSectionHeader("Location");
            this.latitudeWidget = this.addWidget("text", "Latitude", this.properties.latitude !== null ? this.properties.latitude.toString() : "Fetching...", v => {
                const num = parseFloat(v);
                if (!isNaN(num)) {
                    this.properties.latitude = num;
                    this.fetchSunTimes(0);
                }
            }, { width: sliderWidth });

            this.longitudeWidget = this.addWidget("text", "Longitude", this.properties.longitude !== null ? this.properties.longitude.toString() : "Fetching...", v => {
                const num = parseFloat(v);
                if (!isNaN(num)) {
                    this.properties.longitude = num;
                    this.fetchSunTimes(0);
                }
            }, { width: sliderWidth });

            this.timezoneWidget = this.addWidget("combo", "Timezone", this.properties.timezone, v => {
                if (DateTime.local().setZone(v).isValid) {
                    this.properties.timezone = v;
                    this.updateFinalTimes();
                    this.scheduleSunEvents();
                } else {
                    this.updateStatus("Invalid Timezone");
                }
            }, { values: Intl.supportedValuesOf('timeZone'), width: sliderWidth });

            this.cityWidget = this.addWidget("text", "City", "", v => {
                if (v.trim()) this.properties.city = v.trim();
            }, { width: sliderWidth });

            // Status and Debug
            addSectionHeader("Status & Debug");
            this.finalOnTimeWidget = this.addWidget("text", "On Time", "", null, { readonly: true, width: sliderWidth });
            this.finalOffTimeWidget = this.addWidget("text", "Off Time", "", null, { readonly: true, width: sliderWidth });
            this.statusWidget = this.addWidget("text", "Status", "Initializing...", null, { readonly: true, width: sliderWidth + 50 });
            this.countdownWidget = this.addWidget("text", "Next Event", "Calculating...", null, { readonly: true, width: sliderWidth });
            this.debugWidget = this.addWidget("toggle", "Debug", this.properties.debug, v => {
                this.properties.debug = v;
                console.log(`Debug ${v ? "enabled" : "disabled"}`);
            }, { width: sliderWidth });
        }

        validateRange(value, min, max, fieldName) {
            if (isNaN(value) || value < min || value > max) {
                this.updateStatus(`${fieldName} must be between ${min} and ${max}.`);
                return false;
            }
            return true;
        }

        validateDirection(value, fieldName) {
            if (value !== "Before" && value !== "After") {
                this.updateStatus(`${fieldName} must be 'Before' or 'After'.`);
                return false;
            }
            return true;
        }

        updateStatus(newStatus) {
            this.properties.status = newStatus;
            if (this.statusWidget) {
                this.statusWidget.value = newStatus;
                this.statusWidget.color = newStatus.includes("Error") ? "red" : newStatus.includes("success") ? "green" : "white";
            }
            this.setDirtyCanvas(true);
            if (this.properties.debug) console.log(`Status updated: ${newStatus}`);
        }

        async fetchSunTimes(retries = 3, delay = 2000) {
            this.updateStatus("Fetching sun times...");
            try {
                if (!window.api || !window.api.fetchSunTimes) {
                    throw new Error("API not available in window.api.");
                }
                console.log("Attempting to fetch sun times via window.api.fetchSunTimes...");
                const data = await window.api.fetchSunTimes({
                    latitude: this.properties.latitude || 34.0522,
                    longitude: this.properties.longitude || -118.2437
                });
                console.log("Fetch response:", data);
                if (!data || !data.success) throw new Error(data?.error || "Invalid response from API.");

                const { sunrise, sunset, timezone, latitude, longitude, city } = data;
                this.properties.sunrise_time = sunrise ? new Date(sunrise) : null;
                this.properties.sunset_time = sunset ? new Date(sunset) : null;
                this.properties.latitude = latitude !== undefined ? latitude : 34.0522;
                this.properties.longitude = longitude !== undefined ? longitude : -118.2437;
                this.properties.city = city || "Los Angeles";
                this.properties.timezone = timezone || this.properties.timezone;

                if (this.latitudeWidget) this.latitudeWidget.value = this.properties.latitude.toString();
                if (this.longitudeWidget) this.longitudeWidget.value = this.properties.longitude.toString();
                if (this.timezoneWidget) this.timezoneWidget.value = this.properties.timezone;
                if (this.cityWidget) this.cityWidget.value = this.properties.city;

                this.updateStatus("Sun times fetched successfully.");
                this.updateFinalTimes();
                this.scheduleSunEvents();
            } catch (error) {
                console.error(`Fetch error: ${error.message}`);
                if (retries > 0) {
                    this.updateStatus(`Retrying fetch (${4 - retries}/3)...`);
                    setTimeout(() => this.fetchSunTimes(retries - 1, delay * 2), delay);
                } else {
                    console.log("Using default coordinates after fetch failure.");
                    this.properties.latitude = this.properties.latitude || 34.0522;
                    this.properties.longitude = this.properties.longitude || -118.2437;
                    this.properties.city = this.properties.city || "Los Angeles";
                    this.properties.sunrise_time = new Date(DateTime.local().set({ hour: 6, minute: 0 }).toISO());
                    this.properties.sunset_time = new Date(DateTime.local().set({ hour: 18, minute: 0 }).toISO());

                    if (this.latitudeWidget) this.latitudeWidget.value = this.properties.latitude.toString();
                    if (this.longitudeWidget) this.longitudeWidget.value = this.properties.longitude.toString();
                    if (this.cityWidget) this.cityWidget.value = this.properties.city;

                    this.updateStatus("Using default coordinates.");
                    this.updateFinalTimes();
                    this.scheduleSunEvents();
                }
            }
        }

        updateFinalTimes() {
            if (!this.properties.sunrise_time || !this.properties.sunset_time) return;

            const now = DateTime.local().setZone(this.properties.timezone);
            const todaySunrise = DateTime.fromJSDate(this.properties.sunrise_time).setZone(this.properties.timezone).set({
                year: now.year,
                month: now.month,
                day: now.day
            });
            const todaySunset = DateTime.fromJSDate(this.properties.sunset_time).setZone(this.properties.timezone).set({
                year: now.year,
                month: now.month,
                day: now.day
            });

            let finalOnDate;
            if (this.properties.fixed_on_enabled) {
                let h24 = this.properties.fixed_on_hour % 12;
                if (this.properties.fixed_on_ampm === "PM") h24 += 12;
                finalOnDate = now.set({
                    hour: h24,
                    minute: this.properties.fixed_on_minute,
                    second: 0,
                    millisecond: 0
                }).toJSDate();
                if (finalOnDate <= now) finalOnDate = DateTime.fromJSDate(finalOnDate).plus({ days: 1 }).toJSDate();
            } else {
                finalOnDate = todaySunset.plus({
                    hours: this.properties.on_offset_direction === "After" ? this.properties.on_offset_hours : -this.properties.on_offset_hours,
                    minutes: this.properties.on_offset_direction === "After" ? this.properties.on_offset_minutes : -this.properties.on_offset_minutes
                }).toJSDate();
            }

            let finalOffDate;
            if (this.properties.fixed_stop_enabled) {
                let h24 = this.properties.fixed_stop_hour % 12;
                if (this.properties.fixed_stop_ampm === "PM") h24 += 12;
                finalOffDate = now.set({
                    hour: h24,
                    minute: this.properties.fixed_stop_minute,
                    second: 0,
                    millisecond: 0
                }).toJSDate();
                if (finalOffDate <= now) finalOffDate = DateTime.fromJSDate(finalOffDate).plus({ days: 1 }).toJSDate();
            } else {
                finalOffDate = todaySunrise.plus({
                    hours: this.properties.off_offset_direction === "After" ? this.properties.off_offset_hours : -this.properties.off_offset_hours,
                    minutes: this.properties.off_offset_direction === "After" ? this.properties.off_offset_minutes : -this.properties.off_offset_minutes
                }).toJSDate();
            }

            this.properties.final_on_time = DateTime.fromJSDate(finalOnDate).toLocaleString(DateTime.TIME_SIMPLE);
            this.properties.final_off_time = DateTime.fromJSDate(finalOffDate).toLocaleString(DateTime.TIME_SIMPLE);

            if (this.finalOnTimeWidget) this.finalOnTimeWidget.value = this.properties.final_on_time;
            if (this.finalOffTimeWidget) this.finalOffTimeWidget.value = this.properties.final_off_time;
            this.setDirtyCanvas(true);
        }

        computeNextEvents() {
            const now = DateTime.local().setZone(this.properties.timezone);
            let nextOn;
            if (this.properties.fixed_on_enabled) {
                let h24 = this.properties.fixed_on_hour % 12;
                if (this.properties.fixed_on_ampm === "PM") h24 += 12;
                nextOn = now.set({
                    hour: h24,
                    minute: this.properties.fixed_on_minute,
                    second: 0,
                    millisecond: 0
                });
                if (nextOn <= now) nextOn = nextOn.plus({ days: 1 });
            } else if (this.properties.on_enabled) {
                nextOn = DateTime.fromJSDate(this.getFinalOnDate()).setZone(this.properties.timezone);
            } else {
                nextOn = null;
            }

            let nextOff;
            if (this.properties.fixed_stop_enabled) {
                let h24 = this.properties.fixed_stop_hour % 12;
                if (this.properties.fixed_stop_ampm === "PM") h24 += 12;
                nextOff = now.set({
                    hour: h24,
                    minute: this.properties.fixed_stop_minute,
                    second: 0,
                    millisecond: 0
                });
                if (nextOff <= now) nextOff = nextOff.plus({ days: 1 });
            } else if (this.properties.off_enabled) {
                nextOff = DateTime.fromJSDate(this.getFinalOffDate()).setZone(this.properties.timezone);
            } else {
                nextOff = null;
            }

            if (nextOn) {
                while (nextOn <= now) nextOn = nextOn.plus({ days: 1 });
                this.properties.next_on_date = nextOn.toJSDate();
            } else {
                this.properties.next_on_date = null;
            }

            if (nextOff) {
                while (nextOff <= now) nextOff = nextOff.plus({ days: 1 });
                this.properties.next_off_date = nextOff.toJSDate();
            } else {
                this.properties.next_off_date = null;
            }

            if (this.properties.debug) {
                console.log(`Next On: ${this.properties.next_on_date?.toISOString()}, Next Off: ${this.properties.next_off_date?.toISOString()}`);
            }
        }

        scheduleSunEvents() {
            if (this.scheduling) return;
            this.scheduling = true;

            if (this.onTimeoutId) clearTimeout(this.onTimeoutId);
            if (this.offTimeoutId) clearTimeout(this.offTimeoutId);

            this.computeNextEvents();

            const now = new Date();
            const nextOn = this.properties.next_on_date;
            const nextOff = this.properties.next_off_date;

            if ((this.properties.on_enabled || this.properties.fixed_on_enabled) && nextOn) {
                EventScheduler.registerEvent(`${this.id}_on`, {
                    time: nextOn.getTime(),
                    description: `${this.title} - On`
                });
                const delayOn = nextOn - now;
                if (delayOn > -1000) {
                    this.onTimeoutId = setTimeout(() => {
                        this.currentState = true;
                        this.setOutputData(0, this.currentState);
                        this.updateStatus(`State: On | Next: Off at ${nextOff ? DateTime.fromJSDate(nextOff).toFormat("hh:mm a") : "N/A"}`);
                        if (this.properties.debug) console.log(`On event triggered at ${new Date()}`);
                        this.scheduleSunEvents();
                    }, Math.max(delayOn, 0));
                }
            } else {
                EventScheduler.unregisterEvent(`${this.id}_on`);
            }

            if ((this.properties.off_enabled || this.properties.fixed_stop_enabled) && nextOff) {
                EventScheduler.registerEvent(`${this.id}_off`, {
                    time: nextOff.getTime(),
                    description: `${this.title} - Off`
                });
                const delayOff = nextOff - now;
                if (delayOff > -1000) {
                    this.offTimeoutId = setTimeout(() => {
                        this.currentState = false;
                        this.setOutputData(0, this.currentState);
                        this.updateStatus(`State: Off | Next: On at ${nextOn ? DateTime.fromJSDate(nextOn).toFormat("hh:mm a") : "N/A"}`);
                        if (this.properties.debug) console.log(`Off event triggered at ${new Date()}`);
                        this.scheduleSunEvents();
                    }, Math.max(delayOff, 0));
                }
            } else {
                EventScheduler.unregisterEvent(`${this.id}_off`);
            }

            localStorage.setItem(`sunTrigger_${this.id}`, JSON.stringify({
                nextOn: nextOn?.toISOString(),
                nextOff: nextOff?.toISOString()
            }));

            this.checkAndEmitState();
            this.scheduling = false;

            if (window.refreshEventsPanel) {
                window.refreshEventsPanel();
            }
        }

        triggerOutput(state) {
            this.currentState = state;
            this.setOutputData(0, state);
            this.updateStatus(`State: ${state ? "On" : "Off"} | Next: ${this.getNextEventLabel()}`);
            this.setDirtyCanvas(true);
            if (this.properties.debug) console.log(`Triggered state: ${state} at ${new Date()}`);
        }

        getFinalOnDate() {
            const now = DateTime.local().setZone(this.properties.timezone);
            let date = DateTime.fromJSDate(this.properties.sunset_time)
                .set({ year: now.year, month: now.month, day: now.day })
                .plus({
                    hours: this.properties.on_offset_direction === "After" ? this.properties.on_offset_hours : -this.properties.on_offset_hours,
                    minutes: this.properties.on_offset_direction === "After" ? this.properties.on_offset_minutes : -this.properties.on_offset_minutes
                })
                .toJSDate();
            return date;
        }

        getFinalOffDate() {
            const now = DateTime.local().setZone(this.properties.timezone);
            let date = DateTime.fromJSDate(this.properties.sunrise_time)
                .set({ year: now.year, month: now.month, day: now.day })
                .plus({
                    hours: this.properties.off_offset_direction === "After" ? this.properties.off_offset_hours : -this.properties.off_offset_hours,
                    minutes: this.properties.off_offset_direction === "After" ? this.properties.off_offset_minutes : -this.properties.off_offset_minutes
                })
                .toJSDate();
            return date;
        }

        checkAndEmitState() {
            const now = DateTime.local().setZone(this.properties.timezone);
            this.currentState = this.isCurrentTimeWithinRange(now);
            this.setOutputData(0, this.currentState);
            const nextOn = this.properties.next_on_date ? DateTime.fromJSDate(this.properties.next_on_date) : null;
            const nextOff = this.properties.next_off_date ? DateTime.fromJSDate(this.properties.next_off_date) : null;
            const nextEvent = this.currentState ? nextOff : nextOn;
            this.updateStatus(`State: ${this.currentState ? "On" : "Off"} | Next: ${nextEvent ? (this.currentState ? "Off" : "On") : "N/A"} at ${nextEvent ? nextEvent.toFormat("hh:mm a") : "N/A"}`);
            if (this.properties.debug) console.log(`State checked: ${this.currentState} at ${now}`);
        }

        isCurrentTimeWithinRange(now) {
            if (!this.properties.on_enabled && !this.properties.fixed_on_enabled && !this.properties.off_enabled && !this.properties.fixed_stop_enabled) {
                return false;
            }

            const todayOn = this.properties.next_on_date
                ? DateTime.fromJSDate(this.properties.next_on_date).setZone(this.properties.timezone)
                : null;
            const todayOff = this.properties.next_off_date
                ? DateTime.fromJSDate(this.properties.next_off_date).setZone(this.properties.timezone)
                : null;

            if (this.properties.fixed_stop_enabled && todayOff && now >= todayOff) {
                if (this.properties.debug) console.log(`Fixed stop time reached (${now.toFormat("hh:mm a")}), forcing Off`);
                return false;
            }

            if (!this.properties.on_enabled && !this.properties.fixed_on_enabled && (this.properties.off_enabled || this.properties.fixed_stop_enabled) && todayOff) {
                return now < todayOff;
            }

            if (!todayOn) {
                return false;
            }

            if (todayOff) {
                if (todayOn < todayOff) {
                    return now >= todayOn && now < todayOff;
                } else {
                    return now >= todayOn || now < todayOff;
                }
            }

            return now >= todayOn;
        }

        handleVisibilityChange() {
            if (!document.hidden) {
                this.checkAndEmitState();
                this.scheduleSunEvents();
            }
        }

        onExecute() {
            const now = new Date();
            const nextOn = this.properties.next_on_date;
            const nextOff = this.properties.next_off_date;

            if ((this.properties.on_enabled || this.properties.fixed_on_enabled) && nextOn && Math.abs(nextOn - now) <= 1000) {
                this.triggerOutput(true);
                this.scheduleSunEvents();
            } else if ((this.properties.off_enabled || this.properties.fixed_stop_enabled) && nextOff && Math.abs(nextOff - now) <= 1000) {
                this.triggerOutput(false);
                this.scheduleSunEvents();
            } else {
                this.setOutputData(0, this.currentState);
            }

            if (this.properties.debug) console.log(`[onExecute] Output: ${this.currentState} at ${now}`);
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
            ctx.textAlign = "left";
            ctx.fillText(
                `Next On: ${this.properties.next_on_date ? DateTime.fromJSDate(this.properties.next_on_date).toFormat("hh:mm a") : "N/A"}`,
                10,
                this.size[1] - 50
            );

            ctx.fillStyle = "#FF0000"; // Red for Next Off
            ctx.fillText(
                `Next Off: ${this.properties.next_off_date ? DateTime.fromJSDate(this.properties.next_off_date).toFormat("hh:mm a") : "N/A"}`,
                10,
                this.size[1] - 30
            );

            ctx.fillStyle = "rgb(224, 153, 57)"; // Orange for Countdown
            ctx.fillText(this.properties.countdown, 10, this.size[1] - 10);
        }

        startCountdown() {
            if (this.countdownIntervalId) clearInterval(this.countdownIntervalId);

            const now = new Date();
            const delayToNextSecond = 1000 - (now.getTime() % 1000);
            setTimeout(() => {
                this.countdownIntervalId = setInterval(() => {
                    const now = new Date();
                    const nextOn = this.properties.next_on_date;
                    const nextOff = this.properties.next_off_date;

                    let nextEvent = null;
                    if (this.currentState && (this.properties.off_enabled || this.properties.fixed_stop_enabled) && nextOff) {
                        nextEvent = nextOff;
                    } else if (!this.currentState && (this.properties.on_enabled || this.properties.fixed_on_enabled) && nextOn) {
                        nextEvent = nextOn;
                    }

                    if (nextEvent) {
                        const diff = nextEvent - now;
                        if (diff > 0) {
                            const hours = Math.floor(diff / 3600000);
                            const minutes = Math.floor((diff % 3600000) / 60000);
                            const seconds = Math.floor((diff % 60000) / 1000);
                            this.properties.countdown = `Next Event: ${hours}h ${minutes}m ${seconds}s`;
                        } else {
                            this.properties.countdown = "Next Event: Calculating...";
                            this.scheduleSunEvents();
                        }
                    } else {
                        this.properties.countdown = "Next Event: No events scheduled";
                    }

                    if (this.countdownWidget) this.countdownWidget.value = this.properties.countdown;
                    this.setDirtyCanvas(true);
                }, 1000);
            }, delayToNextSecond);
        }

        onRemoved() {
            if (this.onTimeoutId) clearTimeout(this.onTimeoutId);
            if (this.offTimeoutId) clearTimeout(this.offTimeoutId);
            if (this.countdownIntervalId) clearInterval(this.countdownIntervalId);
            document.removeEventListener("visibilitychange", this.handleVisibilityChange);
            EventScheduler.unregisterEvent(`${this.id}_on`);
            EventScheduler.unregisterEvent(`${this.id}_off`);
        }

        onConfigure(o) {
            Object.assign(this.properties, o.properties);
            this.properties.sunrise_time = o.properties.sunrise_time ? new Date(o.properties.sunrise_time) : null;
            this.properties.sunset_time = o.properties.sunset_time ? new Date(o.properties.sunset_time) : null;
            this.properties.next_on_date = o.properties.next_on_date ? new Date(o.properties.next_on_date) : null;
            this.properties.next_off_date = o.properties.next_off_date ? new Date(o.properties.next_off_date) : null;

            if (this.event1HourWidget) {
                this.event1HourWidget.value = this.properties.on_offset_hours;
                this.event1HourWidget.disabled = !this.properties.on_enabled;
            }
            if (this.event1MinuteWidget) {
                this.event1MinuteWidget.value = this.properties.on_offset_minutes;
                this.event1MinuteWidget.disabled = !this.properties.on_enabled;
            }
            if (this.event1DirectionWidget) {
                this.event1DirectionWidget.value = this.properties.on_offset_direction;
                this.event1DirectionWidget.disabled = !this.properties.on_enabled;
            }
            if (this.event1EnabledWidget) this.event1EnabledWidget.value = this.properties.on_enabled;
            if (this.fixedOnHourWidget) {
                this.fixedOnHourWidget.value = this.properties.fixed_on_hour;
                this.fixedOnHourWidget.disabled = !this.properties.fixed_on_enabled;
            }
            if (this.fixedOnMinuteWidget) {
                this.fixedOnMinuteWidget.value = this.properties.fixed_on_minute;
                this.fixedOnMinuteWidget.disabled = !this.properties.fixed_on_enabled;
            }
            if (this.fixedOnAmpmWidget) {
                this.fixedOnAmpmWidget.value = this.properties.fixed_on_ampm;
                this.fixedOnAmpmWidget.disabled = !this.properties.fixed_on_enabled;
            }
            if (this.fixedOnEnabledWidget) this.fixedOnEnabledWidget.value = this.properties.fixed_on_enabled;
            if (this.event2HourWidget) {
                this.event2HourWidget.value = this.properties.off_offset_hours;
                this.event2HourWidget.disabled = !this.properties.off_enabled;
            }
            if (this.event2MinuteWidget) {
                this.event2MinuteWidget.value = this.properties.off_offset_minutes;
                this.event2MinuteWidget.disabled = !this.properties.off_enabled;
            }
            if (this.event2DirectionWidget) {
                this.event2DirectionWidget.value = this.properties.off_offset_direction;
                this.event2DirectionWidget.disabled = !this.properties.off_enabled;
            }
            if (this.event2EnabledWidget) this.event2EnabledWidget.value = this.properties.off_enabled;
            if (this.fixedStopHourWidget) {
                this.fixedStopHourWidget.value = this.properties.fixed_stop_hour;
                this.fixedStopHourWidget.disabled = !this.properties.fixed_stop_enabled;
            }
            if (this.fixedStopMinuteWidget) {
                this.fixedStopMinuteWidget.value = this.properties.fixed_stop_minute;
                this.fixedStopMinuteWidget.disabled = !this.properties.fixed_stop_enabled;
            }
            if (this.fixedStopAmpmWidget) {
                this.fixedStopAmpmWidget.value = this.properties.fixed_stop_ampm;
                this.fixedStopAmpmWidget.disabled = !this.properties.fixed_stop_enabled;
            }
            if (this.fixedStopEnabledWidget) this.fixedStopEnabledWidget.value = this.properties.fixed_stop_enabled;
            if (this.latitudeWidget) this.latitudeWidget.value = this.properties.latitude !== null ? this.properties.latitude.toString() : "Fetching...";
            if (this.longitudeWidget) this.longitudeWidget.value = this.properties.longitude !== null ? this.properties.longitude.toString() : "Fetching...";
            if (this.timezoneWidget) this.timezoneWidget.value = this.properties.timezone;
            if (this.cityWidget) this.cityWidget.value = this.properties.city;
            if (this.finalOnTimeWidget) this.finalOnTimeWidget.value = this.properties.final_on_time;
            if (this.finalOffTimeWidget) this.finalOffTimeWidget.value = this.properties.final_off_time;
            if (this.statusWidget) this.statusWidget.value = this.properties.status;
            if (this.countdownWidget) this.countdownWidget.value = this.properties.countdown;
            if (this.debugWidget) this.debugWidget.value = this.properties.debug;
            // Update label widgets
            if (this.event1EnabledLabelWidget) {
                this.event1EnabledLabelWidget.value = this.properties.on_enabled ? "Enabled" : "Disabled";
                this.event1EnabledLabelWidget.color = this.properties.on_enabled ? "green" : "red";
            }
            if (this.fixedOnEnabledLabelWidget) {
                this.fixedOnEnabledLabelWidget.value = this.properties.fixed_on_enabled ? "Enabled" : "Disabled";
                this.fixedOnEnabledLabelWidget.color = this.properties.fixed_on_enabled ? "green" : "red";
            }
            if (this.event2EnabledLabelWidget) {
                this.event2EnabledLabelWidget.value = this.properties.off_enabled ? "Enabled" : "Disabled";
                this.event2EnabledLabelWidget.color = this.properties.off_enabled ? "green" : "red";
            }
            if (this.fixedStopEnabledLabelWidget) {
                this.fixedStopEnabledLabelWidget.value = this.properties.fixed_stop_enabled ? "Enabled" : "Disabled";
                this.fixedStopEnabledLabelWidget.color = this.properties.fixed_stop_enabled ? "green" : "red";
            }

            this.fetchSunTimes().then(() => {
                this.updateFinalTimes();
                this.computeNextEvents();
                this.checkAndEmitState();
                this.scheduleSunEvents();
                this.startCountdown();
            });

            this.setDirtyCanvas(true);
        }

        getNextEventLabel() {
            const nextOn = this.properties.next_on_date;
            const nextOff = this.properties.next_off_date;
            if (!nextOn && !nextOff) return "N/A";
            return nextOn && (!nextOff || nextOn < nextOff)
                ? `On at ${this.properties.final_on_time}`
                : `Off at ${this.properties.final_off_time}`;
        }
    }

    LiteGraph.registerNodeType("Timers/sunrise_sunset_trigger", SunriseSunsetTrigger);
    console.log("SunriseSunsetTrigger - Node registered successfully.");
}