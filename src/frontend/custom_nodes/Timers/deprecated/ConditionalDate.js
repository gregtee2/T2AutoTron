if (!LiteGraph.registered_nodes || !LiteGraph.registered_nodes["Timers/ConditionalDate"]) {
    class ConditionalLogicNode extends LiteGraph.LGraphNode {
        constructor() {
            super();
            this.title = "Conditional Date";
            this.size = [350, 250];
            this.bgcolor = "rgb(50, 68, 73)"; // Valid RGB color

            // Initialize properties
            this.properties = {
                startDay: 1,
                endDay: 31,
                startMonth: 1,
                endMonth: 12,
                logicType: "AND" // Could be "AND" or "OR"
            };

            // Inputs and Outputs
            this.addInput("Trigger", "boolean"); // Input from TimeOfDayNode or other trigger
            this.addInput("HSV Info", "hsv_info");
            this.addOutput("On/Off", "boolean");
            this.addOutput("HSV Info", "hsv_info");

            // Widgets for Day and Month selection
            this.startDayWidget = this.addWidget("slider", "Start Day", this.properties.startDay, (value) => {
                this.properties.startDay = Math.round(value);
                this.setDirtyCanvas(true);
            }, { min: 1, max: 31, step: 1 });

            this.endDayWidget = this.addWidget("slider", "End Day", this.properties.endDay, (value) => {
                this.properties.endDay = Math.round(value);
                this.setDirtyCanvas(true);
            }, { min: 1, max: 31, step: 1 });

            this.startMonthWidget = this.addWidget("slider", "Start Month", this.properties.startMonth, (value) => {
                this.properties.startMonth = Math.round(value);
                this.setDirtyCanvas(true);
            }, { min: 1, max: 12, step: 1 });

            this.endMonthWidget = this.addWidget("slider", "End Month", this.properties.endMonth, (value) => {
                this.properties.endMonth = Math.round(value);
                this.setDirtyCanvas(true);
            }, { min: 1, max: 12, step: 1 });

            this.logicTypeWidget = this.addWidget("combo", "Logic Type", this.properties.logicType, (value) => {
                this.properties.logicType = value;
                this.setDirtyCanvas(true);
            }, { values: ["AND", "OR"] });

            this.syncWidgets();
        }

        /**
         * The core date-checking logic we can reuse for display or execution.
         * @returns {boolean} true if conditions are satisfied, false otherwise.
         */
        areConditionsMet() {
            const currentTime = new Date();
            const currentDay = currentTime.getDate();
            const currentMonth = currentTime.getMonth() + 1;

            const dayCondition = currentDay >= this.properties.startDay && currentDay <= this.properties.endDay;
            const monthCondition = currentMonth >= this.properties.startMonth && currentMonth <= this.properties.endMonth;

            if (this.properties.logicType === "AND") {
                return dayCondition && monthCondition;
            } else {
                // "OR"
                return dayCondition || monthCondition;
            }
        }

        onExecute() {
            // Evaluate date conditions
            const logicSatisfied = this.areConditionsMet();

            // Pass the trigger signal and HSV info if conditions are met
            const trigger = this.getInputData(0); // Input from TimeOfDayNode or other signal
            if (logicSatisfied && trigger) {
                this.setOutputData(0, true); // Pass On/Off signal
                const hsvInfo = this.getInputData(1); // Input for HSV Info
                this.setOutputData(1, hsvInfo); // Pass HSV info if available
                console.log("[Conditional Logic] Conditions met. Sending On/Off and HSV Info.");
            } else {
                this.setOutputData(0, false); // Pass Off signal if conditions not met
                this.setOutputData(1, null); // Nullify HSV output if conditions not met
                //console.log("[Conditional Logic] Conditions not met. Sending Off and null HSV Info.");
            }
        }

        /**
         * onDrawForeground is where we can do custom rendering.
         * We draw a border in green or red depending on whether conditions are met.
         * Additionally, we add a text overlay showing the selected date ranges and logic type.
         */
        onDrawForeground(ctx) {
            // If the node is collapsed, do not draw custom border or text
            if (this.flags.collapsed) {
                return;
            }

            // Evaluate the same conditions
            const logicSatisfied = this.areConditionsMet();

            // Choose border color
            ctx.lineWidth = 4;
            ctx.strokeStyle = logicSatisfied ? "green" : "red";

            // Draw border around the node
            ctx.strokeRect(0, 0, this.size[0], this.size[1]);

            // Draw the text overlay
            ctx.font = "14px Arial";
            ctx.fillStyle = "white";
            ctx.textAlign = "center";

            // Prepare the text lines
            const startDate = `Start: ${this.properties.startMonth}/${this.properties.startDay}`;
            const endDate = `End: ${this.properties.endMonth}/${this.properties.endDay}`;
            const logicType = `Logic: ${this.properties.logicType}`;

            // Calculate positions
            const padding = 10;
            const lineHeight = 18;
            const totalTextHeight = lineHeight * 3; // Three lines
            const startY = this.size[1] - padding - totalTextHeight;

            // Draw each line of text
            ctx.fillText(startDate, this.size[0] / 2, startY + lineHeight);
            ctx.fillText(endDate, this.size[0] / 2, startY + lineHeight * 2);
            ctx.fillText(logicType, this.size[0] / 2, startY + lineHeight * 3);

            // Optionally call parent method if needed
            if (super.onDrawForeground) {
                super.onDrawForeground(ctx);
            }
        }

        syncWidgets() {
            this.startDayWidget.value = this.properties.startDay;
            this.endDayWidget.value = this.properties.endDay;
            this.startMonthWidget.value = this.properties.startMonth;
            this.endMonthWidget.value = this.properties.endMonth;
            this.logicTypeWidget.value = this.properties.logicType;
        }

        /**
         * Serializes the node's properties for saving.
         */
        onSerialize(o) {
            o.properties = LiteGraph.cloneObject(this.properties);
            console.log("[Conditional Date] Serialized properties:", this.properties);
        }

        /**
         * Configures the node based on serialized data.
         */
        onConfigure(o) {
            this.properties = LiteGraph.cloneObject(o.properties || {});
            console.log("[Conditional Date] Configured with properties:", this.properties);
            this.syncWidgets();
        }
    }

    LiteGraph.registerNodeType("Timers/ConditionalDate", ConditionalLogicNode);
    console.log("[Conditional Date] Node registered successfully under 'Timers' category.");
} else {
    console.log("[Conditional Date] Node is already registered.");
}
