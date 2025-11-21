// File: C:\homeauto\custom_nodes\Timers\days_of_the_week.js

// Registration Guard: Ensure the node is registered only once
if (!LiteGraph.registered_nodes || !LiteGraph.registered_nodes["Timers/days_of_the_week"]) {
    class DaysOfTheWeekNode extends LiteGraph.LGraphNode {
        constructor() {
            super();
            this.title = "Days of the Week";
            this.size = [360, 420]; // Adjust size to accommodate new widgets
            this.bgcolor = "rgb(50, 68, 73)"; // Valid RGB color

            // Properties that will be editable through the UI
            this.properties = {
                days: {
                    Sunday: false,
                    Monday: false,
                    Tuesday: false,
                    Wednesday: false,
                    Thursday: false,
                    Friday: false,
                    Saturday: false
                },
                everyday: false,
                weekdays: false,
                weekends: false,
                even_days: false,
                odd_days: false,
                special_days: [] // Array of objects with date and repeat status
            };

            // Define inputs and outputs
            this.addInput("Trigger", "boolean");  // Input from TimeOfDayNode or other trigger
            this.addInput("HSV Info", "hsv_info");
            this.addOutput("On/Off", "boolean");
            this.addOutput("HSV Info", "hsv_info");

            // Initialize widgets
            this.setupWidgets();

            // Force the size after widgets are added
            this.forceSize();

            console.log("DaysOfTheWeekNode - Initialized.");
        }

        /**
         * Sets up all widgets with proper callbacks or property bindings.
         */
        setupWidgets() {
            // Days of the Week Checkboxes
            for (let day in this.properties.days) {
                this.addWidget("toggle", day, this.properties.days[day], (value) => {
                    this.properties.days[day] = value;
                    this.updateState();
                });
            }

            // Everyday Toggle
            this.addWidget("toggle", "Everyday", this.properties.everyday, (value) => {
                this.properties.everyday = value;
                this.setEveryday(value);
                this.updateState();
            });

            // Weekdays Toggle
            this.addWidget("toggle", "Weekdays", this.properties.weekdays, (value) => {
                this.properties.weekdays = value;
                if (value) {
                    this.setWeekdays(true);
                    this.properties.weekends = false; // Disable Weekends if Weekdays is selected
                } else {
                    this.setWeekdays(false); // Clear Weekdays when untoggled
                }
                this.updateState();
            });

            // Weekends Toggle
            this.addWidget("toggle", "Weekends", this.properties.weekends, (value) => {
                this.properties.weekends = value;
                if (value) {
                    this.setWeekends(true);
                    this.properties.weekdays = false; // Disable Weekdays if Weekends is selected
                } else {
                    this.setWeekends(false); // Clear Weekends when untoggled
                }
                this.updateState();
            });

            // Even/Odd Day Toggle
            this.addWidget("toggle", "Even Days", this.properties.even_days, (value) => {
                this.properties.even_days = value;
                if (value) {
                    this.properties.odd_days = false;
                }
                this.updateState();
            });

            this.addWidget("toggle", "Odd Days", this.properties.odd_days, (value) => {
                this.properties.odd_days = value;
                if (value) {
                    this.properties.even_days = false;
                }
                this.updateState();
            });

            // Special Days Input and List
            this.addWidget("text", "Add Special Day (MM/DD)", "", (value) => {
                if (value.trim() === "") {
                    if (this.properties.special_days.length > 0) {
                        this.properties.special_days.pop(); // Remove the last entry
                        this.updateSpecialDaysList();
                        this.setDirtyCanvas(true);
                    }
                } else if (this.isValidDate(value)) {
                    this.properties.special_days.push({ date: value, repeat: false });
                    this.updateSpecialDaysList();
                    this.setDirtyCanvas(true);
                } else {
                    console.warn("DaysOfTheWeekNode - Invalid date format. Use MM/DD.");
                }
            });

            // Toggle for Annual Repeat
            this.addWidget("toggle", "Repeat Annually", false, (value) => {
                if (this.properties.special_days.length > 0) {
                    this.properties.special_days[this.properties.special_days.length - 1].repeat = value;
                    this.updateSpecialDaysList();
                    this.setDirtyCanvas(true);
                }
            });

            // Display the Special Days List (Read-Only)
            this.specialDaysWidget = this.addWidget("info", "Special Days", this.getSpecialDaysList());

            console.log("DaysOfTheWeekNode - Widgets set up.");
        }

        /**
         * Updates the special days list display.
         */
        updateSpecialDaysList() {
            if (this.specialDaysWidget) {
                this.specialDaysWidget.value = this.getSpecialDaysList();
                this.setDirtyCanvas(true); // Mark canvas as needing redraw
            }
        }

        /**
         * Validates the date string in MM/DD format.
         * @param {string} dateStr - Date string to validate.
         * @returns {boolean} - True if valid, else false.
         */
        isValidDate(dateStr) {
            const datePattern = /^(0[1-9]|1[0-2])\/(0[1-9]|[12][0-9]|3[01])$/;
            return datePattern.test(dateStr);
        }

        /**
         * Generates a string representation of special days.
         * @returns {string} - Comma-separated list of special days.
         */
        getSpecialDaysList() {
            if (this.properties.special_days.length === 0) return "None";
            return this.properties.special_days
                .map(sd => `${sd.date}${sd.repeat ? " (Annual)" : ""}`)
                .join(", ");
        }

        /**
         * Sets all days to enabled or disabled.
         * @param {boolean} enabled - Whether to enable or disable all days.
         */
        setEveryday(enabled) {
            for (let day in this.properties.days) {
                this.properties.days[day] = enabled;
            }
        }

        /**
         * Sets weekdays to enabled or disabled.
         * @param {boolean} enabled - Whether to enable or disable weekdays.
         */
        setWeekdays(enabled) {
            this.properties.days.Monday = enabled;
            this.properties.days.Tuesday = enabled;
            this.properties.days.Wednesday = enabled;
            this.properties.days.Thursday = enabled;
            this.properties.days.Friday = enabled;

            if (!enabled) {
                // Clear the weekdays toggle if it's turned off
                this.properties.weekdays = false;
            }
        }

        /**
         * Sets weekends to enabled or disabled.
         * @param {boolean} enabled - Whether to enable or disable weekends.
         */
        setWeekends(enabled) {
            this.properties.days.Saturday = enabled;
            this.properties.days.Sunday = enabled;

            if (!enabled) {
                // Clear the weekends toggle if it's turned off
                this.properties.weekends = false;
            }
        }

        /**
         * Updates the state based on widget interactions.
         */
        updateState() {
            const days = this.properties.days;

            // Update Everyday, Weekdays, and Weekends based on individual day selections
            this.properties.everyday = Object.values(days).every(Boolean);
            this.properties.weekdays = days.Monday && days.Tuesday && days.Wednesday && days.Thursday && days.Friday;
            this.properties.weekends = days.Saturday && days.Sunday;

            // Ensure consistency in toggles
            if (!this.properties.weekdays) {
                this.properties.weekdays = false;
            }

            if (!this.properties.weekends) {
                this.properties.weekends = false;
            }

            if (!this.properties.everyday) {
                this.properties.everyday = false;
            }

            this.updateSpecialDaysList(); // Update the special days list display
            this.setDirtyCanvas(true); // Mark canvas as needing to redraw

            console.log("DaysOfTheWeekNode - State updated.");
        }

        /**
         * Determines if today matches any of the active day conditions.
         * @returns {boolean} - True if today is valid, else false.
         */
        isTodayValid() {
            const today = new Date();
            const dayOfWeek = today.toLocaleString('en-US', { weekday: 'long' });
            const dayOfMonth = today.getDate();
            const month = today.getMonth() + 1;
            const todayStr = `${String(month).padStart(2, '0')}/${String(dayOfMonth).padStart(2, '0')}`;

            // Check if today is a special day
            for (let sd of this.properties.special_days) {
                if (sd.date === todayStr) {
                    // If today is a special day, consider it valid
                    return true;
                }
                if (sd.repeat && sd.date === todayStr) {
                    return true;
                }
            }

            // If any special day exists but today is not that day, return false
            if (this.properties.special_days.length > 0) {
                return false;
            }

            // Check for even/odd days
            if (this.properties.even_days && dayOfMonth % 2 === 0) {
                return true;
            }

            if (this.properties.odd_days && dayOfMonth % 2 !== 0) {
                return true;
            }

            // Return the state based on regular day selections if no special day is active
            return this.properties.days[dayOfWeek] || false;
        }

        /**
         * Executes the node's main functionality.
         */
        onExecute() {
            const trigger = this.getInputData(0);
            const hsvInfo = this.getInputData(1);  // Input for HSV Info

            // Determine if today is valid based on the selected days
            const todayValid = this.isTodayValid();

            // Output based on the validation
            if (todayValid && trigger) {
                this.setOutputData(0, true);  // Pass On/Off signal
                this.setOutputData(1, hsvInfo);  // Pass HSV info if available
                console.log(`DaysOfTheWeekNode - Today is valid, outputting: true`);
            } else {
                this.setOutputData(0, false);  // Pass Off signal
                this.setOutputData(1, null);   // Nullify HSV output if conditions are not met
                console.log("DaysOfTheWeekNode - Today is not valid, outputting: false");
            }
        }

        /**
         * Custom drawing on the node's foreground.
         * Displays a summary of selected days.
         * @param {CanvasRenderingContext2D} ctx
         * @param {object} graph_canvas
         */
        onDrawForeground(ctx, graph_canvas) {
            // Calculate the position for the text with some padding
            const padding = 10; // Padding on the left and right
            const textX = padding;
            const textY = this.size[1] - 20;
            const textHeight = 20; // Height of the text area to be cleared

            // Clear the area where the summary text will be drawn, with padding applied
            ctx.clearRect(textX - padding, textY - textHeight, this.size[0] - 2 * padding, textHeight);

            // Set the background color using the specified RGB value
            ctx.fillStyle = "rgb(53, 53, 53)"; // Background color to match the node
            ctx.fillRect(textX - padding, textY - textHeight, this.size[0] - 2 * padding, textHeight);

            // Display selected days summary with green text color
            const selectedDays = Object.keys(this.properties.days).filter(day => this.properties.days[day]);
            let summary = `Days: ${selectedDays.join(', ')}`;
            if (this.properties.even_days) summary = "Days: Even";
            if (this.properties.odd_days) summary = "Days: Odd";
            if (this.properties.special_days.length > 0) {
                summary += `, Special Days: ${this.getSpecialDaysList()}`;
            }

            ctx.fillStyle = "#006400"; // Green text color
            ctx.font = "14px Arial";
            ctx.textAlign = "left";
            ctx.fillText(summary, textX, textY);
        }

        /**
         * Serializes the node's state for saving.
         * @returns {object} Serialized data.
         */
        serialize() {
            const data = super.serialize();
            data.properties = this.properties;
            return data;
        }

        /**
         * Configures the node from serialized data.
         * @param {object} data Serialized data.
         */
        configure(data) {
            super.configure(data);
            this.properties = data.properties || this.properties;

            // Update widgets to reflect loaded properties
            for (let day in this.properties.days) {
                const widget = this.widgets.find(w => w.name === day);
                if (widget) widget.value = this.properties.days[day];
            }

            const everydayWidget = this.widgets.find(w => w.name === "Everyday");
            if (everydayWidget) everydayWidget.value = this.properties.everyday;

            const weekdaysWidget = this.widgets.find(w => w.name === "Weekdays");
            if (weekdaysWidget) weekdaysWidget.value = this.properties.weekdays;

            const weekendsWidget = this.widgets.find(w => w.name === "Weekends");
            if (weekendsWidget) weekendsWidget.value = this.properties.weekends;

            const evenDaysWidget = this.widgets.find(w => w.name === "Even Days");
            if (evenDaysWidget) evenDaysWidget.value = this.properties.even_days;

            const oddDaysWidget = this.widgets.find(w => w.name === "Odd Days");
            if (oddDaysWidget) oddDaysWidget.value = this.properties.odd_days;

            const specialDaysWidget = this.widgets.find(w => w.name === "Special Days");
            if (specialDaysWidget) specialDaysWidget.value = this.getSpecialDaysList();

            console.log("DaysOfTheWeekNode - Configured with properties:", this.properties);
            this.setDirtyCanvas(true);
        }

        /**
         * Forces the node to maintain a specific size.
         */
        forceSize() {
            this.size = [360, 420]; // Ensure the size is consistently applied
        }

        /**
         * Ensures the node size is set when added to the graph.
         */
        onAdded() {
            this.forceSize();
        }

        /**
         * Cleans up when the node is removed from the graph.
         */
        onRemoved() {
            console.log("DaysOfTheWeekNode - Removed from graph. Cleaning up.");
            // Perform any necessary cleanup here
        }
    }

    // Register the node with LiteGraph under the "Timers" category
    LiteGraph.registerNodeType("Timers/days_of_the_week", DaysOfTheWeekNode);
    console.log("DaysOfTheWeekNode - Registered successfully under 'Timers' category.");
}
