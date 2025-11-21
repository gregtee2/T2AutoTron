class HybridTimerTriggerNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Hybrid Timer Trigger";
        this.size = [400, 700];  // Initial size setting

        const currentYear = new Date().getFullYear();

        // Define properties with default values
        this.properties = {
            start_hour: 12,
            start_minute: 0,
            start_ampm: "AM",
            start_state: true,
            end_hour: 12,
            end_minute: 0,
            end_ampm: "PM",
            end_state: false,
            year: currentYear,
            month: -1,
            day_of_week: -1,
            override: false,
            override_state: false,
            use_sun_times: false,
            sun_event_start: "Sunrise",
            sun_offset_start_hours: 0,
            sun_offset_start_minutes: 0,
            sun_offset_start_positive: true,
            sun_event_end: "Sunset",
            sun_offset_end_hours: 0,
            sun_offset_end_minutes: 0,
            sun_offset_end_positive: true,
            latitude: 0,
            longitude: 0,
            sunrise_time: "N/A",
            sunset_time: "N/A"
        };

        // Initialize widgets
        this.setupWidgets();

        this.addOutput("Trigger", "boolean");
    }

    onAdded() {
        // Force size when the node is added to the graph
        this.size = [400, 700];  // Ensure this size is applied
    }

    setupWidgets() {
        this.widgets = [];

        // Start Time Widgets
        console.log("Adding Start Hour Widget...");
        this.addWidget("combo", "Start Hour", this.properties.start_hour, (v) => {
            this.properties.start_hour = parseInt(v, 10);
            this.trigger("wchange");
        }, { values: Array.from({ length: 12 }, (_, i) => i + 1) });
        console.log("Start Hour Widget added.");

        console.log("Adding Start Minute Widget...");
        this.addWidget("combo", "Start Minute", this.properties.start_minute, (v) => {
            this.properties.start_minute = parseInt(v, 10);
            this.trigger("wchange");
        }, { values: Array.from({ length: 60 }, (_, i) => i) });
        console.log("Start Minute Widget added.");

        console.log("Adding Start AM/PM Widget...");
        this.addWidget("combo", "Start AM/PM", this.properties.start_ampm, (v) => {
            this.properties.start_ampm = v;
            this.trigger("wchange");
        }, { values: ["AM", "PM"] });
        console.log("Start AM/PM Widget added.");

        console.log("Adding Start State Widget...");
        this.addWidget("toggle", "Start State", this.properties.start_state, (v) => {
            this.properties.start_state = v;
            this.trigger("wchange");
        });
        console.log("Start State Widget added.");

        // End Time Widgets
        console.log("Adding End Hour Widget...");
        this.addWidget("combo", "End Hour", this.properties.end_hour, (v) => {
            this.properties.end_hour = parseInt(v, 10);
            this.trigger("wchange");
        }, { values: Array.from({ length: 12 }, (_, i) => i + 1) });
        console.log("End Hour Widget added.");

        console.log("Adding End Minute Widget...");
        this.addWidget("combo", "End Minute", this.properties.end_minute, (v) => {
            this.properties.end_minute = parseInt(v, 10);
            this.trigger("wchange");
        }, { values: Array.from({ length: 60 }, (_, i) => i) });
        console.log("End Minute Widget added.");

        console.log("Adding End AM/PM Widget...");
        this.addWidget("combo", "End AM/PM", this.properties.end_ampm, (v) => {
            this.properties.end_ampm = v;
            this.trigger("wchange");
        }, { values: ["AM", "PM"] });
        console.log("End AM/PM Widget added.");

        console.log("Adding End State Widget...");
        this.addWidget("toggle", "End State", this.properties.end_state, (v) => {
            this.properties.end_state = v;
            this.trigger("wchange");
        });
        console.log("End State Widget added.");

        // Sun Times Start Widgets
        console.log("Adding Use Sun Times Widget...");
        this.addWidget("toggle", "Use Sun Times", this.properties.use_sun_times, (v) => {
            this.properties.use_sun_times = v;
            this.trigger("wchange");
        });
        console.log("Use Sun Times Widget added.");

        console.log("Adding Sun Start Event Widget...");
        this.addWidget("combo", "Sun Start Event", this.properties.sun_event_start, (v) => {
            this.properties.sun_event_start = v;
            this.trigger("wchange");
        }, { values: ["Sunrise", "Sunset"] });
        console.log("Sun Start Event Widget added.");

        console.log("Adding Sun Start Offset Positive Widget...");
        this.addWidget("toggle", "Sun Start Offset Positive", this.properties.sun_offset_start_positive, (v) => {
            this.properties.sun_offset_start_positive = v;
            this.trigger("wchange");
        });
        console.log("Sun Start Offset Positive Widget added.");

        console.log("Adding Sun Start Offset Hours Widget...");
        this.addWidget("combo", "Sun Start Offset Hours", this.properties.sun_offset_start_hours, (v) => {
            this.properties.sun_offset_start_hours = parseInt(v, 10);
            this.trigger("wchange");
        }, { values: Array.from({ length: 24 }, (_, i) => i) });
        console.log("Sun Start Offset Hours Widget added.");

        console.log("Adding Sun Start Offset Minutes Widget...");
        this.addWidget("combo", "Sun Start Offset Minutes", this.properties.sun_offset_start_minutes, (v) => {
            this.properties.sun_offset_start_minutes = parseInt(v, 10);
            this.trigger("wchange");
        }, { values: Array.from({ length: 60 }, (_, i) => i) });
        console.log("Sun Start Offset Minutes Widget added.");

        // Sun Times End Widgets
        console.log("Adding Sun End Event Widget...");
        this.addWidget("combo", "Sun End Event", this.properties.sun_event_end, (v) => {
            this.properties.sun_event_end = v;
            this.trigger("wchange");
        }, { values: ["Sunrise", "Sunset"] });
        console.log("Sun End Event Widget added.");

        console.log("Adding Sun End Offset Positive Widget...");
        this.addWidget("toggle", "Sun End Offset Positive", this.properties.sun_offset_end_positive, (v) => {
            this.properties.sun_offset_end_positive = v;
            this.trigger("wchange");
        });
        console.log("Sun End Offset Positive Widget added.");

        console.log("Adding Sun End Offset Hours Widget...");
        this.addWidget("combo", "Sun End Offset Hours", this.properties.sun_offset_end_hours, (v) => {
            this.properties.sun_offset_end_hours = parseInt(v, 10);
            this.trigger("wchange");
        }, { values: Array.from({ length: 24 }, (_, i) => i) });
        console.log("Sun End Offset Hours Widget added.");

        console.log("Adding Sun End Offset Minutes Widget...");
        this.addWidget("combo", "Sun End Offset Minutes", this.properties.sun_offset_end_minutes, (v) => {
            this.properties.sun_offset_end_minutes = parseInt(v, 10);
            this.trigger("wchange");
        }, { values: Array.from({ length: 60 }, (_, i) => i) });
        console.log("Sun End Offset Minutes Widget added.");

        // Latitude and Longitude Widgets
        console.log("Adding Latitude Widget...");
        this.latitude_widget = this.addWidget("number", "Latitude", this.properties.latitude, (v) => {
            this.properties.latitude = parseFloat(v);
            this.trigger("wchange");
        });
        console.log("Latitude Widget added.");

        console.log("Adding Longitude Widget...");
        this.longitude_widget = this.addWidget("number", "Longitude", this.properties.longitude, (v) => {
            this.properties.longitude = parseFloat(v);
            this.trigger("wchange");
        });
        console.log("Longitude Widget added.");

        // Location Button
        console.log("Adding Get Location Button...");
        this.addWidget("button", "Get Location", null, () => {
            this.getLocation();
        });
        console.log("Get Location Button added.");

        // Display Sunrise and Sunset Times
        console.log("Adding Sunrise Text Widget...");
        this.addWidget("text", "Sunrise", this.properties.sunrise_time, null);
        console.log("Sunrise Text Widget added.");

        console.log("Adding Sunset Text Widget...");
        this.addWidget("text", "Sunset", this.properties.sunset_time, null);
        console.log("Sunset Text Widget added.");

        // Year, Month, Day of Week Widgets
        console.log("Adding Year Widget...");
        this.addWidget("number", "Year", this.properties.year, (v) => {
            this.properties.year = parseInt(v, 10);
            this.trigger("wchange");
        }, { step: 1 });
        console.log("Year Widget added.");

        console.log("Adding Month Widget...");
        this.addWidget("combo", "Month", this.properties.month, (v) => {
            this.properties.month = parseInt(v, 10);
            this.trigger("wchange");
        }, { values: { "-1": "Any", "0": "January", "1": "February", "2": "March", "3": "April", "4": "May", "5": "June", "6": "July", "7": "August", "8": "September", "9": "October", "10": "November", "11": "December" } });
        console.log("Month Widget added.");

        console.log("Adding Day of Week Widget...");
        this.addWidget("combo", "Day of Week", this.properties.day_of_week, (v) => {
            this.properties.day_of_week = parseInt(v, 10);
            this.trigger("wchange");
        }, { values: { "-1": "Any", "0": "Sunday", "1": "Monday", "2": "Tuesday", "3": "Wednesday", "4": "Thursday", "5": "Friday", "6": "Saturday" } });
        console.log("Day of Week Widget added.");

        // Override Widgets
        console.log("Adding Override Widget...");
        this.addWidget("toggle", "Override", this.properties.override, (v) => {
            this.properties.override = v;
            this.trigger("wchange");
        });
        console.log("Override Widget added.");

        console.log("Adding Override State Widget...");
        this.addWidget("toggle", "Override State", this.properties.override_state, (v) => {
            this.properties.override_state = v;
            this.trigger("wchange");
        });
        console.log("Override State Widget added.");
    }

    onConfigure(o) {
        this.properties = LiteGraph.cloneObject(o.properties);
        this.setupWidgets();

        // Force size here as well, to ensure consistency
        this.size = [800, 400]; 
    }

    getLocation() {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    this.properties.latitude = position.coords.latitude;
                    this.properties.longitude = position.coords.longitude;
                    this.latitude_widget.value = position.coords.latitude;
                    this.longitude_widget.value = position.coords.longitude;
                    console.log("Location updated:", this.properties.latitude, this.properties.longitude);
                    this.updateSunTimes(); // Update sun times when location is updated
                },
                (error) => {
                    console.error("Error getting location:", error);
                }
            );
        } else {
            console.error("Geolocation is not supported by this browser.");
        }
    }

    updateSunTimes() {
        if (typeof SunCalc === 'undefined') {
            console.error("SunCalc library is not loaded.");
            return;
        }

        const now = new Date();
        const sunTimes = SunCalc.getTimes(now, this.properties.latitude, this.properties.longitude);

        this.properties.sunrise_time = sunTimes.sunrise.toLocaleTimeString();
        this.properties.sunset_time = sunTimes.sunset.toLocaleTimeString();
        this.setupWidgets(); // Refresh widgets to update displayed sunrise/sunset times

        // Force the size again after widgets are updated
        this.size = [400, 700];  // Replace with your desired size
    }

    onExecute() {
        const now = new Date();
        let startHour = this.properties.start_ampm === "PM" && this.properties.start_hour !== 12 ? this.properties.start_hour + 12 : this.properties.start_hour;
        let endHour = this.properties.end_ampm === "PM" && this.properties.end_hour !== 12 ? this.properties.end_hour + 12 : this.properties.end_hour;

        if (this.properties.use_sun_times) {
            if (typeof SunCalc === 'undefined') {
                console.error("SunCalc library is not loaded.");
                return;
            }

            const sunTimes = SunCalc.getTimes(now, this.properties.latitude, this.properties.longitude);

            const sunStartTime = this.properties.sun_event_start === "Sunrise" ? sunTimes.sunrise : sunTimes.sunset;
            const sunStartOffset = (this.properties.sun_offset_start_positive ? 1 : -1) *
                ((this.properties.sun_offset_start_hours * 60 + this.properties.sun_offset_start_minutes) * 60000);
            const sunStartOffsetTime = new Date(sunStartTime.getTime() + sunStartOffset);
            startHour = sunStartOffsetTime.getHours();
            this.properties.start_minute = sunStartOffsetTime.getMinutes();

            const sunEndTime = this.properties.sun_event_end === "Sunrise" ? sunTimes.sunrise : sunTimes.sunset;
            const sunEndOffset = (this.properties.sun_offset_end_positive ? 1 : -1) *
                ((this.properties.sun_offset_end_hours * 60 + this.properties.sun_offset_end_minutes) * 60000);
            const sunEndOffsetTime = new Date(sunEndTime.getTime() + sunEndOffset);
            endHour = sunEndOffsetTime.getHours();
            this.properties.end_minute = sunEndOffsetTime.getMinutes();
        }

        // Handle Override
        if (this.properties.override) {
            this.setOutputData(0, this.properties.override_state);
            return;
        }

        const isStartTimeMatch =
            this.properties.year === now.getFullYear() &&
            (this.properties.month === -1 || this.properties.month === now.getMonth()) &&
            (this.properties.day_of_week === -1 || this.properties.day_of_week === now.getDay()) &&
            startHour === now.getHours() &&
            this.properties.start_minute === now.getMinutes();

        const isEndTimeMatch =
            this.properties.year === now.getFullYear() &&
            (this.properties.month === -1 || this.properties.month === now.getMonth()) &&
            (this.properties.day_of_week === -1 || this.properties.day_of_week === now.getDay()) &&
            endHour === now.getHours() &&
            this.properties.end_minute === now.getMinutes();

        if (isStartTimeMatch) {
            this.setOutputData(0, this.properties.start_state);
        } else if (isEndTimeMatch) {
            this.setOutputData(0, this.properties.end_state);
        } else {
            this.setOutputData(0, null);
        }
    }

    onSerialize(o) {
        o.properties = LiteGraph.cloneObject(this.properties);
    }
}

// Register the node
LiteGraph.registerNodeType("custom/hybrid_timer_trigger", HybridTimerTriggerNode);
