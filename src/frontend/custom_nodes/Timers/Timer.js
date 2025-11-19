if (!LiteGraph.registered_nodes || !LiteGraph.registered_nodes["Timers/Timer"]) {
    class TimerNode extends LiteGraph.LGraphNode {
        constructor() {
            super();
            this.title = "Timer";
            this.size = [350, 300];
            this.bgcolor = "rgb(50, 68, 73)";

            // Initialize properties
            this.properties = {
                hours: 0,
                minutes: 0,
                seconds: 0,
                isRunning: false,
                startTime: 0,
                durationMs: 0,
                outputState: false
            };

            // Inputs and Outputs
            this.addInput("Trigger", "boolean");
            this.addInput("Reset", "boolean"); // NEW: Reset input
            this.addOutput("On/Off", "boolean");

            // Widgets in reverse order: Seconds, Minutes, Hours
            this.secondsWidget = this.addWidget("slider", "Seconds", this.properties.seconds, (value) => {
                this.properties.seconds = Math.floor(value);
                this.updateDuration();
                this.setDirtyCanvas(true);
            }, { min: 0, max: 59, step: 1, precision: 0 });

            this.minutesWidget = this.addWidget("slider", "Minutes", this.properties.minutes, (value) => {
                this.properties.minutes = Math.floor(value);
                this.updateDuration();
                this.setDirtyCanvas(true);
            }, { min: 0, max: 59, step: 1, precision: 0 });

            this.hoursWidget = this.addWidget("slider", "Hours", this.properties.hours, (value) => {
                this.properties.hours = Math.floor(value);
                this.updateDuration();
                this.setDirtyCanvas(true);
            }, { min: 0, max: 23, step: 1, precision: 0 });

            this.syncWidgets();
            this.adjustNodeSize();
        }

        /**
         * Updates the total duration in milliseconds based on slider values.
         */
        updateDuration() {
            this.properties.durationMs =
                (this.properties.hours * 3600 +
                 this.properties.minutes * 60 +
                 this.properties.seconds) * 1000;
        }

        /**
         * Adjusts node size to fit sliders and text overlay.
         */
        adjustNodeSize() {
            const widgetHeight = 40;
            const numWidgets = 3;
            const titleHeight = 30;
            const padding = 10;
            const lineHeight = 18;
            const numTextLines = 3;
            const textHeight = lineHeight * numTextLines + padding * 2;

            const minHeight = titleHeight + (numWidgets * widgetHeight) + textHeight + padding;
            const minWidth = 350;

            this.size[0] = Math.max(this.size[0], minWidth);
            this.size[1] = Math.max(this.size[1], minHeight);

            this.setDirtyCanvas(true);
        }

        /**
         * Handles timer logic during execution.
         */
        onExecute() {
            const trigger = this.getInputData(0);
            const reset = this.getInputData(1); // NEW: Check reset input

            // Handle reset input
            if (reset) {
                this.properties.isRunning = false;
                this.properties.outputState = false;
                console.log(`[TimerNode ${this.id}] Reset via input`);
                this.setDirtyCanvas(true);
            }

            // Start the timer if triggered and not already running
            if (trigger && !this.properties.isRunning && !reset) {
                if (this.properties.durationMs > 0) {
                    this.properties.isRunning = true;
                    this.properties.startTime = Date.now();
                    this.properties.outputState = false;
                    console.log(`[TimerNode ${this.id}] Started with duration ${this.properties.durationMs}ms`);
                }
            }

            // Check timer status
            if (this.properties.isRunning) {
                const elapsed = Date.now() - this.properties.startTime;
                if (elapsed >= this.properties.durationMs) {
                    this.properties.outputState = true;
                    this.properties.isRunning = false;
                    console.log(`[TimerNode ${this.id}] Countdown complete`);
                    // Schedule reset after 500ms pulse
                    setTimeout(() => {
                        this.properties.outputState = false;
                        this.setDirtyCanvas(true);
                        console.log(`[TimerNode ${this.id}] Reset output to false after pulse`);
                    }, 5000); // 500ms pulse
                }
            }

            this.setOutputData(0, this.properties.outputState);
            this.setDirtyCanvas(true);
        }

        /**
         * Draws the border and text overlay showing the timer settings.
         */
        onDrawForeground(ctx) {
            if (this.flags.collapsed) {
                return;
            }

            // Draw border (green if output is true, red if false)
            ctx.lineWidth = 4;
            ctx.strokeStyle = this.properties.outputState ? "green" : "red";
            ctx.strokeRect(0, 0, this.size[0], this.size[1]);

            // Draw text overlay
            ctx.font = "14px Arial";
            ctx.fillStyle = "white";
            ctx.textAlign = "center";

            // Prepare text lines
            const hoursText = `Hours: ${this.properties.hours}`;
            const minutesText = `Minutes: ${this.properties.minutes}`;
            const secondsText = `Seconds: ${this.properties.seconds}`;

            // Calculate positions
            const padding = 10;
            const lineHeight = 18;
            const totalTextHeight = lineHeight * 3;
            const startY = this.size[1] - padding - totalTextHeight;

            // Draw each line of text
            ctx.fillText(secondsText, this.size[0] / 2, startY + lineHeight);
            ctx.fillText(minutesText, this.size[0] / 2, startY + lineHeight * 2);
            ctx.fillText(hoursText, this.size[0] / 2, startY + lineHeight * 3);
        }

        /**
         * Syncs widget values with properties.
         */
        syncWidgets() {
            this.secondsWidget.value = this.properties.seconds;
            this.minutesWidget.value = this.properties.minutes;
            this.hoursWidget.value = this.properties.hours;
        }

        /**
         * Serializes the node's properties.
         */
        onSerialize(o) {
            o.properties = LiteGraph.cloneObject(this.properties);
            console.log(`[TimerNode ${this.id}] Serialized properties:`, this.properties);
        }

        /**
         * Configures the node from serialized data.
         */
        onConfigure(o) {
            this.properties = LiteGraph.cloneObject(o.properties || {});
            this.updateDuration();
            this.syncWidgets();
            this.adjustNodeSize();
            console.log(`[TimerNode ${this.id}] Configured with properties:`, this.properties);
        }
    }

    LiteGraph.registerNodeType("Timers/Timer", TimerNode);
    console.log("[TimerNode] Node registered successfully under 'Timers' category.");
} else {
    console.log("[TimerNode] Node is already registered.");
}