class TriggerBusNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Trigger Bus";
        this.size = [380, 180];
        this.bgcolor = "rgb(88, 72, 18)";
        this.mode = LiteGraph.ALWAYS;

        this.numInputs = 10;
        for (let i = 0; i < this.numInputs; i++) {
            this.addInput("", "*");
        }
        this.addOutput("", "*");

        this.inputStates = new Array(this.numInputs).fill(null);
        this.lastUpdateTimes = new Array(this.numInputs).fill(0);
        this.highestActiveIndex = -1;
        this.lastOutput = null;

        this.properties = {
            debug: false,
            timeoutSeconds: 5,
            defaultOutput: false,
            stickyMode: false,
            pulseCount: 1,
            pulseInterval: 5000
        };

        this.inputCountWidget = this.addWidget("number", "Input Count", this.numInputs, v => {
            const newCount = Math.max(1, Math.min(10, Math.round(v)));
            this.numInputs = newCount;
            this.updateInputs();
        }, { min: 1, max: 10, step: 1, precision: 0 });

        this.timeoutWidget = this.addWidget("number", "Timeout (s)", this.properties.timeoutSeconds, v => {
            this.properties.timeoutSeconds = Math.max(0, v);
        }, { min: 0, max: 3600, step: 1 });

        this.debugWidget = this.addWidget("toggle", "Debug", this.properties.debug, v => {
            this.properties.debug = v;
            console.log(`Debug ${v ? "enabled" : "disabled"}`);
        });

        this.defaultOutputWidget = this.addWidget("combo", "Default Output", "false", v => {
            this.properties.defaultOutput = v === "true" ? true : (v === "false" ? false : null);
        }, { values: ["false", "true", "null"] });

        this.stickyModeWidget = this.addWidget("toggle", "Sticky Mode", false, v => {
            this.properties.stickyMode = v;
        });

        this.pulseCountWidget = this.addWidget("number", "Pulse Count", this.properties.pulseCount, v => {
            this.properties.pulseCount = Math.max(1, Math.min(10, Math.round(v)));
        }, { min: 1, max: 10, step: 1, precision: 0 });

        this.pulseIntervalWidget = this.addWidget("number", "Pulse Interval (ms)", this.properties.pulseInterval, v => {
            this.properties.pulseInterval = Math.max(10, Math.min(1000, Math.round(v)));
        }, { min: 10, max: 1000, step: 10, precision: 0 });

        this.statusWidget = this.addWidget("text", "Status", "No active input", null, { readonly: true });

        console.log("TriggerBusNode - Constructor complete.");
    }

    updateInputs() {
        const currentCount = this.inputs.length;
        const newCount = this.numInputs;

        for (let i = currentCount; i < newCount; i++) {
            this.addInput("", "*");
        }
        while (this.inputs.length > newCount) {
            this.removeInput(this.inputs.length - 1);
        }

        this.inputStates = this.inputStates.slice(0, newCount).concat(Array(Math.max(0, newCount - this.inputStates.length)).fill(null));
        this.lastUpdateTimes = this.lastUpdateTimes.slice(0, newCount).concat(Array(Math.max(0, newCount - this.lastUpdateTimes.length)).fill(0));
        this.setDirtyCanvas(true);
    }

    // Helper function to format seconds into a human-readable string
    formatTime(seconds) {
        seconds = Math.round(seconds); // Ensure whole seconds
        if (seconds < 60) {
            return `${seconds} second${seconds !== 1 ? "s" : ""}`;
        } else if (seconds < 3600) {
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = seconds % 60;
            return `${minutes} minute${minutes !== 1 ? "s" : ""}${remainingSeconds > 0 ? `, ${remainingSeconds} second${remainingSeconds !== 1 ? "s" : ""}` : ""}`;
        } else {
            const hours = Math.floor(seconds / 3600);
            const remainingMinutes = Math.floor((seconds % 3600) / 60);
            const remainingSeconds = seconds % 60;
            let result = `${hours} hour${hours !== 1 ? "s" : ""}`;
            if (remainingMinutes > 0) result += `, ${remainingMinutes} minute${remainingMinutes !== 1 ? "s" : ""}`;
            if (remainingSeconds > 0) result += `, ${remainingSeconds} second${remainingSeconds !== 1 ? "s" : ""}`;
            return result;
        }
    }

    onExecute() {
        const now = Date.now();

        let stateChanged = false;
        for (let i = 0; i < this.numInputs; i++) {
            const val = this.getInputData(i);
            if (val !== undefined && val !== this.inputStates[i]) {
                this.inputStates[i] = val;
                this.lastUpdateTimes[i] = now;
                stateChanged = true;
                if (this.properties.debug) console.log(`Input ${i + 1} changed to ${val} at ${new Date()}`);
            }
        }

        let newHighestActiveIndex = -1;
        for (let i = this.numInputs - 1; i >= 0; i--) {
            if (this.inputStates[i] !== null && (this.properties.stickyMode || (now - this.lastUpdateTimes[i]) / 1000 <= this.properties.timeoutSeconds)) {
                newHighestActiveIndex = i;
                break;
            }
        }

        let outData;
        if (newHighestActiveIndex !== -1) {
            outData = this.inputStates[newHighestActiveIndex];
            this.highestActiveIndex = newHighestActiveIndex;
            const timeSince = (now - this.lastUpdateTimes[newHighestActiveIndex]) / 1000;
            this.statusWidget.value = `Active: Input ${newHighestActiveIndex + 1} (${outData ? "On" : "Off"}) - ${this.formatTime(timeSince)}`;
        } else if (this.highestActiveIndex !== -1) {
            outData = this.lastOutput;
            const timeSince = (now - this.lastUpdateTimes[this.highestActiveIndex]) / 1000;
            this.statusWidget.value = `Holding: Input ${this.highestActiveIndex + 1} (${outData ? "On" : "Off"}) - ${this.formatTime(timeSince)}`;
        } else {
            outData = this.properties.defaultOutput;
            this.statusWidget.value = "No active input";
        }

        this.setOutputData(0, outData);
        if (outData !== this.lastOutput) {
            this.lastOutput = outData;
            if (this.properties.debug) console.log(`Output changed to ${outData} from Input ${this.highestActiveIndex + 1 || "default"} at ${new Date()}`);
        }
    }

    scheduleOutputPulses() {
        const pulseCount = this.properties.pulseCount;
        const pulseInterval = this.properties.pulseInterval;

        for (let i = 0; i < pulseCount; i++) {
            setTimeout(() => {
                this.onExecute(); // Reuse existing logic to compute and set output
                if (this.properties.debug) {
                    console.log(`Pulse ${i + 1}/${pulseCount} sent with output: ${this.lastOutput} at ${new Date()}`);
                }
            }, i * pulseInterval);
        }
    }

    onDrawForeground(ctx) {
        const now = Date.now();
        const currentTime = now / 1000;
        const pulsingFactor = 0.5 * (1 + Math.sin(currentTime * 2 * Math.PI));
        const pulsingGreen = Math.floor(255 * pulsingFactor);
        const activeColor = `rgb(0, ${pulsingGreen}, 0)`;
        const inactiveColor = "#FFFFFF";
        const withinTimeoutColor = "#FFFF00";

        ctx.font = "12px Arial";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";

        const labelStartX = 20;
        const labelStartY = -15;
        const labelSpacing = 20;

        for (let i = 0; i < this.numInputs; i++) {
            const label = `Trigger ${i + 1}`;
            const isActive = this.inputStates[i] !== null && (this.properties.stickyMode || (now - this.lastUpdateTimes[i]) / 1000 <= this.properties.timeoutSeconds);
            const isHighest = this.highestActiveIndex === i;
            ctx.fillStyle = isHighest ? activeColor : (isActive ? withinTimeoutColor : inactiveColor);
            const y = labelStartY + i * labelSpacing + 30;
            ctx.fillText(label, labelStartX + 15, y);
            ctx.beginPath();
            ctx.arc(labelStartX, y, 5, 0, 2 * Math.PI);
            ctx.fill();
        }

        ctx.fillStyle = "#FFFFFF";
        ctx.fillText("Out", this.size[0] - 35, 15);
    }

    onDrawBackground(ctx) {
        ctx.strokeStyle = this.lastOutput === false ? "#FF0000" : "#00FF00";
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, this.size[0], this.size[1]);
    }

    serialize() {
        const data = super.serialize();
        data.properties = { ...this.properties };
        data.numInputs = this.numInputs;
        data.inputStates = [...this.inputStates];
        data.lastUpdateTimes = [...this.lastUpdateTimes];
        data.highestActiveIndex = this.highestActiveIndex;
        return data;
    }

    configure(data) {
        super.configure(data);
        if (data.properties) Object.assign(this.properties, data.properties);
        this.numInputs = data.numInputs || 10;
        this.inputStates = data.inputStates || new Array(this.numInputs).fill(null);
        this.lastUpdateTimes = data.lastUpdateTimes || new Array(this.numInputs).fill(0);
        this.highestActiveIndex = data.highestActiveIndex || -1;
        this.lastOutput = null; // Reset lastOutput to ensure fresh computation
        this.updateInputs();
        this.inputCountWidget.value = this.numInputs;
        this.timeoutWidget.value = this.properties.timeoutSeconds;
        this.debugWidget.value = this.properties.debug;
        this.defaultOutputWidget.value = this.properties.defaultOutput === true ? "true" : (this.properties.defaultOutput === false ? "false" : "null");
        this.stickyModeWidget.value = this.properties.stickyMode;
        this.pulseCountWidget.value = this.properties.pulseCount;
        this.pulseIntervalWidget.value = this.properties.pulseInterval;

        // Trigger pulses to wake up downstream nodes
        this.scheduleOutputPulses();
    }
}

LiteGraph.registerNodeType("Utility/TriggerBus", TriggerBusNode);
console.log("TriggerBusNode - Registered successfully under 'Utility' category.");