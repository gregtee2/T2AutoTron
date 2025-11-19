// File: C:\homeauto\custom_nodes\Timers\conditional-logic.js

// Registration Guard: Ensure the node is registered only once
if (!LiteGraph.registered_nodes || !LiteGraph.registered_nodes["Timers/conditional_logic"]) {
    class ConditionalLogicNode extends LiteGraph.LGraphNode {
        constructor() {
            super();
            this.title = "Conditional Logic";
            this.size = [350, 220]; // Adjust size for additional widgets

            // Add inputs: 'Trigger' (boolean) and 'HSV Info'
            this.addInput("Trigger", "boolean");  // Boolean trigger input
            this.addInput("HSV Info", "hsv_info"); // HSV information input

            // Add outputs: 'On/Off' (boolean) and 'HSV Info'
            this.addOutput("On/Off", "boolean");  // Boolean output for On/Off
            this.addOutput("HSV Info", "hsv_info"); // HSV info output

            // Initialize properties for logic conditions
            this.properties = {
                startHour: 0,
                endHour: 23,
                startDay: 1,
                endDay: 31,
                startMonth: 1,
                endMonth: 12,
                logicType: "AND" // AND/OR logic selection
            };

            // Add dropdown widgets for setting time, date, and logic conditions
            this.addWidget("combo", "Start Hour", this.properties.startHour, (value) => {
                this.properties.startHour = value;
            }, { values: [...Array(24).keys()] });

            this.addWidget("combo", "End Hour", this.properties.endHour, (value) => {
                this.properties.endHour = value;
            }, { values: [...Array(24).keys()] });

            this.addWidget("combo", "Start Day", this.properties.startDay, (value) => {
                this.properties.startDay = value;
            }, { values: [...Array(31).keys()].map(i => i + 1) });

            this.addWidget("combo", "End Day", this.properties.endDay, (value) => {
                this.properties.endDay = value;
            }, { values: [...Array(31).keys()].map(i => i + 1) });

            this.addWidget("combo", "Start Month", this.properties.startMonth, (value) => {
                this.properties.startMonth = value;
            }, { values: [...Array(12).keys()].map(i => i + 1) });

            this.addWidget("combo", "End Month", this.properties.endMonth, (value) => {
                this.properties.endMonth = value;
            }, { values: [...Array(12).keys()].map(i => i + 1) });

            this.addWidget("combo", "Logic Type", this.properties.logicType, (value) => {
                this.properties.logicType = value;
            }, { values: ["AND", "OR"] });

            console.log("[Conditional Logic] Node created with initial properties.");
        }

        /**
         * Executes the conditional logic based on the set parameters.
         */
        onExecute() {
            const currentTime = new Date();
            const currentHour = currentTime.getHours();
            const currentDay = currentTime.getDate();
            const currentMonth = currentTime.getMonth() + 1;

            // Check if the current time falls within the defined ranges
            const hourCondition = currentHour >= this.properties.startHour && currentHour <= this.properties.endHour;
            const dayCondition = currentDay >= this.properties.startDay && currentDay <= this.properties.endDay;
            const monthCondition = currentMonth >= this.properties.startMonth && currentMonth <= this.properties.endMonth;

            let logicSatisfied = false;
            if (this.properties.logicType === "AND") {
                logicSatisfied = hourCondition && dayCondition && monthCondition;
            } else if (this.properties.logicType === "OR") {
                logicSatisfied = hourCondition || dayCondition || monthCondition;
            }

            const trigger = this.getInputData(0); // Get the boolean trigger input
            const hsvInfo = this.getInputData(1); // Get the HSV info input

            if (logicSatisfied && trigger) {
                this.setOutputData(0, true); // Pass On signal
                this.setOutputData(1, hsvInfo); // Pass HSV info
                console.log("[Conditional Logic] Conditions met, outputting ON and HSV info.");
            } else {
                this.setOutputData(0, false); // Pass Off signal
                this.setOutputData(1, null);  // No HSV info
                console.log("[Conditional Logic] Conditions not met, outputting OFF.");
            }
        }
    }

    // Register the node with LiteGraph under the "Timers" category
    LiteGraph.registerNodeType("Timers/conditional_logic", ConditionalLogicNode);
    console.log("[Conditional Logic] Node registered successfully under 'Timers' category.");
} else {
    console.log("[Conditional Logic] Node is already registered.");
}
