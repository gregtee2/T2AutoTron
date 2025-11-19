class DateComparisonNode extends LiteGraph.LGraphNode {
    static MONTH_NAMES = [
        "January", "February", "March",    "April",   "May",      "June",
        "July",    "August",   "September","October", "November", "December"
    ];

    constructor() {
        super();
        this.title = "Date Comparison (Range)";
        this.size = [260, 250];
        this.bgcolor = "rgb(50, 68, 73)"; // Valid RGB color

        // Node properties
        this.properties = {
            useRange: false,   // toggle between single date vs. date range
            month: 4,          // single date
            day: 17,
            startMonth: 4,     // range start
            startDay: 10,
            endMonth: 4,       // range end
            endDay: 20,
            debug: false,
        };

        // Single Boolean output
        this.addOutput("IsInRange", "boolean");

        // Initialize widgets
        this.initWidgets();
    }

    /**
     * Initialize widgets to reflect current properties.
     */
    initWidgets() {
        this.widgets = []; // Clear existing widgets to avoid duplicates

        // Toggle for single vs. range
        this.addWidget("toggle", "Use Range?", this.properties.useRange, (value) => {
            this.properties.useRange = value;
        });

        // Single Date
        this.addWidget("slider", "Month", this.properties.month, (value) => {
            this.properties.month = parseInt(value);
        }, { min: 1, max: 12, step: 1, precision: 0 });

        this.addWidget("slider", "Day", this.properties.day, (value) => {
            this.properties.day = parseInt(value);
        }, { min: 1, max: 31, step: 1, precision: 0 });

        // Separator (info widget)
        this.addWidget("info", "--- Range ---");

        // Range Start
        this.addWidget("slider", "Start Month", this.properties.startMonth, (value) => {
            this.properties.startMonth = parseInt(value);
        }, { min: 1, max: 12, step: 1, precision: 0 });

        this.addWidget("slider", "Start Day", this.properties.startDay, (value) => {
            this.properties.startDay = parseInt(value);
        }, { min: 1, max: 31, step: 1, precision: 0 });

        // Range End
        this.addWidget("slider", "End Month", this.properties.endMonth, (value) => {
            this.properties.endMonth = parseInt(value);
        }, { min: 1, max: 12, step: 1, precision: 0 });

        this.addWidget("slider", "End Day", this.properties.endDay, (value) => {
            this.properties.endDay = parseInt(value);
        }, { min: 1, max: 31, step: 1, precision: 0 });

        // Debug toggle
        this.addWidget("toggle", "Debug", this.properties.debug, (value) => {
            this.properties.debug = value;
        });
    }

    /**
     * Serialize node properties and state for saving.
     */
    serialize() {
        const data = super.serialize();
        data.properties = { ...this.properties }; // Clone properties
        return data;
    }

    /**
     * Restore node state and properties from serialized data.
     */
    configure(data) {
        super.configure(data);
        if (data.properties) {
            Object.assign(this.properties, data.properties);
        }
        this.initWidgets(); // Reinitialize widgets to reflect restored properties
    }

    onExecute() {
        const now = new Date();
        const currentMonth = now.getMonth() + 1; // zero-based index => +1
        const currentDay = now.getDate();

        let isInRange = false;

        if (!this.properties.useRange) {
            // Single-date mode
            isInRange = (
                currentMonth === this.properties.month &&
                currentDay === this.properties.day
            );
        } else {
            // Range mode
            const currentYear = now.getFullYear();

            // Construct start/end Date objects
            let startDate = new Date(
                currentYear,
                this.properties.startMonth - 1,
                this.properties.startDay
            );
            let endDate = new Date(
                currentYear,
                this.properties.endMonth - 1,
                this.properties.endDay
            );

            // If start > end, swap
            if (startDate > endDate) {
                [startDate, endDate] = [endDate, startDate];
            }

            // Check inclusively if today is within [startDate, endDate]
            isInRange = (now >= startDate && now <= endDate);
        }

        // Output
        this.setOutputData(0, isInRange);

        // Debug
        if (this.properties.debug) {
            if (!this.properties.useRange) {
                console.log(
                    `[DateComparisonNode] SINGLE DATE check: ` +
                    `Wanted=${this.properties.month}/${this.properties.day}, ` +
                    `Current=${currentMonth}/${currentDay}, ` +
                    `Result=${isInRange}`
                );
            } else {
                console.log(
                    `[DateComparisonNode] RANGE check: ` +
                    `Start=${this.properties.startMonth}/${this.properties.startDay}, ` +
                    `End=${this.properties.endMonth}/${this.properties.endDay}, ` +
                    `Current=${currentMonth}/${currentDay}, ` +
                    `Result=${isInRange}`
                );
            }
        }
    }

    onDrawForeground(ctx) {
        super.onDrawForeground?.(ctx);

        // Force the node size to 250x280
        if (this.size[0] !== 250 || this.size[1] !== 280) {
            this.size = [250, 280];
            if (this.graph && this.graph.canvas) {
                this.graph.canvas.setDirty(true, true); // Redraw the canvas
            }
        }

        // Get the output value (boolean)
        const isInRange = this.getOutputData(0); // Retrieve the boolean output

        // Draw colored outline based on output
        ctx.strokeStyle = isInRange ? "#00FF00" : "#FF0000"; // Green if true, Red if false
        ctx.lineWidth = 3; // Outline thickness
        ctx.strokeRect(2, 2, this.size[0] - 4, this.size[1] - 4); // Draw border slightly inset

        // Draw the text (existing code)
        ctx.fillStyle = "#FFF";
        ctx.font = "12px Arial";
        ctx.textAlign = "left";

        const textY = this.size[1] - 8;

        if (!this.properties.useRange) {
            const monthName = DateComparisonNode.MONTH_NAMES[this.properties.month - 1];
            const text = `Single Date: ${monthName} ${this.properties.day}`;
            ctx.fillText(text, 10, textY);
        } else {
            const startMonthName = DateComparisonNode.MONTH_NAMES[this.properties.startMonth - 1];
            const endMonthName = DateComparisonNode.MONTH_NAMES[this.properties.endMonth - 1];
            const text = `Range: ${startMonthName} ${this.properties.startDay} - ${endMonthName} ${this.properties.endDay}`;
            ctx.fillText(text, 10, textY);
        }
    }
}

LiteGraph.registerNodeType("Logic/DateComparison", DateComparisonNode);
