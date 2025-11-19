class DayOfWeekComparisonNode extends LiteGraph.LGraphNode {
    static DAY_NAMES = [
        "Sunday", "Monday", "Tuesday", "Wednesday",
        "Thursday", "Friday", "Saturday"
    ];

    constructor() {
        super();
        this.title = "Day of Week Comparison";
        this.size = [250, 210];

        // Node properties
        this.properties = {
            mode: "single",      // can be "single", "range", or "all"
            singleDay: 1,        // (Monday)
            startDay: 1,         // (Monday)
            endDay: 5,           // (Friday)
            debug: false
        };

        // Single boolean output
        this.addOutput("IsInRange", "boolean");

        // Initialize widgets
        this.initWidgets();
    }

    /**
     * Creates the widgets (combo, sliders, debug toggle).
     */
    initWidgets() {
        // Clear existing widgets first (when re-loading from .configure)
        this.widgets = [];

        // Mode selection: single, range, or all
        this.addWidget("combo", "Mode", this.properties.mode, (val) => {
            this.properties.mode = val;
        }, { values: ["single", "range", "all"] });

        // Single day slider (shown regardless of mode, but only used if mode=="single")
        this.addWidget("slider", "Single Day", this.properties.singleDay, (val) => {
            this.properties.singleDay = parseInt(val);
        }, { min: 0, max: 6, step: 1, precision: 0 });

        // Separator
        this.addWidget("info", "--- Range ---");

        // Start Day
        this.addWidget("slider", "Start Day", this.properties.startDay, (val) => {
            this.properties.startDay = parseInt(val);
        }, { min: 0, max: 6, step: 1, precision: 0 });

        // End Day
        this.addWidget("slider", "End Day", this.properties.endDay, (val) => {
            this.properties.endDay = parseInt(val);
        }, { min: 0, max: 6, step: 1, precision: 0 });

        // Debug toggle
        this.addWidget("toggle", "Debug", this.properties.debug, (val) => {
            this.properties.debug = val;
        });
    }

    /**
     * Serialize the node so we can save graph state.
     */
    serialize() {
        const data = super.serialize();
        data.properties = { ...this.properties }; // Clone properties
        return data;
    }

    /**
     * Restore node state from serialized data.
     */
    configure(data) {
        super.configure(data);
        if (data.properties) {
            Object.assign(this.properties, data.properties);
        }
        this.initWidgets(); // Reinitialize widgets to reflect restored properties
    }

    /**
     * Called every frame/tick while the graph is running.
     */
    onExecute() {
        const now = new Date();
        const currentDayOfWeek = now.getDay(); // 0..6 (Sunday=0, Monday=1, etc.)

        let isInRange = false;
        switch (this.properties.mode) {
            case "all":
                // Entire week => always true
                isInRange = true;
                break;

            case "single":
                // Single day => check exact match
                isInRange = (currentDayOfWeek === this.properties.singleDay);
                break;

            case "range":
                // Range => [startDay..endDay], inclusive
                // (if start > end, swap them so it doesn't break)
                let s = this.properties.startDay;
                let e = this.properties.endDay;
                if (s > e) [s, e] = [e, s];

                isInRange = (currentDayOfWeek >= s && currentDayOfWeek <= e);
                break;
        }

        // Output the boolean
        this.setOutputData(0, isInRange);

        // Debug logging
        if (this.properties.debug) {
            const modeText = this.properties.mode.toUpperCase();
            console.log(
                `[DayOfWeekComparisonNode] MODE=${modeText}, ` +
                `Current=${DayOfWeekComparisonNode.DAY_NAMES[currentDayOfWeek]}, ` +
                `Result=${isInRange}`
            );
        }
    }

    /**
     * Renders a user-friendly text overlay at the bottom.
     */
    onDrawForeground(ctx) {
        super.onDrawForeground?.(ctx);

        // Get the output value (boolean)
        const isInRange = this.getOutputData(0) || false; // Default to false if undefined

        // Draw colored outline based on output
        ctx.strokeStyle = isInRange ? "#00FF00" : "#FF0000"; // Green if true, Red if false
        ctx.lineWidth = 3; // Outline thickness
        ctx.strokeRect(2, 2, this.size[0] - 4, this.size[1] - 4); // Draw border slightly inset

        // Draw the text (existing code)
        ctx.fillStyle = "#FFF";
        ctx.font = "12px Arial";
        ctx.textAlign = "left";

        const textY = this.size[1] - 8;
        let text = "";

        switch (this.properties.mode) {
            case "all":
                text = "All Week: Always True";
                break;

            case "single":
                text = `Single Day: ${DayOfWeekComparisonNode.DAY_NAMES[this.properties.singleDay]}`;
                break;

            case "range": {
                const s = this.properties.startDay;
                const e = this.properties.endDay;
                const startName = DayOfWeekComparisonNode.DAY_NAMES[s];
                const endName = DayOfWeekComparisonNode.DAY_NAMES[e];
                text = `Range: ${startName} - ${endName}`;
                break;
            }
        }

        ctx.fillText(text, 10, textY);
    }
}

// Register the node with a unique ID under "Logic"
LiteGraph.registerNodeType("Logic/DayOfWeekComparison", DayOfWeekComparisonNode);
