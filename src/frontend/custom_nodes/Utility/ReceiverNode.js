class ReceiverNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Receiver Node";
        this.size = [200, 150]; // Initial size
        this.bgcolor = "rgb(150, 120, 70)";
        this.bgGradient = null;

        this.valueHistory = [];
        this.lastOutputValue = null;
        this.lastBufferValue = null;

        this.addOutput("Output", "*");
        this.addOutput("Change", "boolean");

        this.properties = {
            selectedBuffer: null,
            debug: false,
            errorState: null,
            pulseCount: 1,
            pulseInterval: 1000
        };

        this.bufferWidget = this.addWidget("combo", "Select Buffer", this.properties.selectedBuffer || "None", (value) => {
            this.properties.selectedBuffer = value === "None" ? null : value;
            this.onExecute();
            console.log(`[ReceiverNode] Selected buffer: ${this.properties.selectedBuffer}`);
        }, {
            values: () => {
                const buffers = Object.keys(SenderNode.sharedBuffer || {}).sort();
                return buffers.length > 0 ? ["None", ...buffers] : ["None"];
            }
        });

        this.statusWidget = this.addWidget("text", "Status", "Idle", null, { readonly: true });

        this.debugWidget = this.addWidget("toggle", "Debug", this.properties.debug, (v) => {
            this.properties.debug = v;
            console.log(`[ReceiverNode] Debug ${v ? "enabled" : "disabled"}`);
        });

        this.pulseCountWidget = this.addWidget("number", "Pulse Count", this.properties.pulseCount, (v) => {
            this.properties.pulseCount = Math.max(1, Math.min(10, Math.round(v)));
        }, { min: 1, max: 10, step: 1, precision: 0 });

        this.pulseIntervalWidget = this.addWidget("number", "Pulse Interval (ms)", this.properties.pulseInterval, (v) => {
            this.properties.pulseInterval = Math.max(10, Math.min(1000, Math.round(v)));
        }, { min: 10, max: 1000, step: 10, precision: 0 });

        this.pulseCountWidget.value = this.properties.pulseCount;
        this.pulseIntervalWidget.value = this.properties.pulseInterval;

        console.log("[ReceiverNode] Constructor complete.");
    }

    // Helper function for deep equality comparison
    deepEqual(a, b) {
        if (a === b) return true;
        if (a == null || b == null) return false;
        if (typeof a !== "object" || typeof b !== "object") return a === b;

        const keysA = Object.keys(a);
        const keysB = Object.keys(b);
        if (keysA.length !== keysB.length) return false;

        for (const key of keysA) {
            if (!keysB.includes(key) || !this.deepEqual(a[key], b[key])) return false;
        }
        return true;
    }

    // NEW: Method to dynamically update node size based on content
    updateSize() {
        const gapBetweenElements = 10;
        const historyEntryHeight = 15;
        const colorBoxHeight = 20;
        const minHeight = 150; // Minimum height to ensure node is usable
        const widgetHeight = LiteGraph.NODE_WIDGET_HEIGHT; // Default widget height from LiteGraph

        // Calculate height for widgets
        let widgetsHeight = 0;
        this.widgets.forEach(widget => {
            widgetsHeight += widget.computeSize ? widget.computeSize(this.size[0])[1] : widgetHeight;
        });

        // Calculate height for history entries
        const historyHeight = this.valueHistory.length * historyEntryHeight;

        // Calculate total height
        const totalHeight = (
            LiteGraph.NODE_TITLE_HEIGHT + // Title bar
            widgetsHeight + // Widgets
            gapBetweenElements + // Gap between widgets and history
            historyHeight + // History entries
            colorBoxHeight + // Color box at the bottom
            40 // Additional padding for status text and margins
        );

        // Update size, ensuring it doesn't shrink below initial/minimum size
        this.size = [
            Math.max(this.size[0], 200), // Maintain minimum width
            Math.max(totalHeight, minHeight) // Ensure minimum height
        ];

        // Mark canvas as dirty to reflect size change
        this.setDirtyCanvas(true);
    }

    onExecute() {
        const bufferName = this.properties.selectedBuffer;
        const buffer = SenderNode.sharedBuffer || {};
        const bufferValue = buffer[bufferName];

        if (this.properties.debug) {
            console.log(`[ReceiverNode] Buffer Name: ${bufferName}, Value: ${JSON.stringify(bufferValue)}`);
        }

        let outputValue = null;
        if (bufferName && bufferValue !== undefined) {
            outputValue = bufferValue;
            this.properties.errorState = null;
            this.setOutputData(0, outputValue);
            this.statusWidget.value = `Reading: ${bufferName}`;
        } else {
            outputValue = null;
            this.setOutputData(0, null);
            this.statusWidget.value = bufferName ? `Buffer '${bufferName}' not found` : "No buffer selected";
            this.properties.errorState = bufferName ? `Buffer '${bufferName}' not found` : null;
        }

        // Detect if buffer instance changed (for Change output)
        const hasBufferChanged = this.lastBufferValue !== bufferValue;
        this.setOutputData(1, hasBufferChanged);

        // Detect if output value content changed (for valueHistory)
        const hasValueChanged = !this.deepEqual(this.lastOutputValue, outputValue);
        if (hasValueChanged) {
            this.lastOutputValue = outputValue;
            this.valueHistory.push({ value: outputValue, timestamp: new Date().toLocaleTimeString() });
            if (this.valueHistory.length > 5) this.valueHistory.shift();
            this.updateSize(); // Call the new method to adjust size
            if (this.properties.debug) {
                console.log(`[ReceiverNode] Value changed, added to history: ${JSON.stringify(outputValue)}`);
            }
        } else if (this.properties.debug) {
            console.log(`[ReceiverNode] Value unchanged, skipping history update: ${JSON.stringify(outputValue)}`);
        }

        // Update lastBufferValue for next iteration
        this.lastBufferValue = bufferValue;

        // Redraw canvas if output or history changed
        if (hasValueChanged || hasBufferChanged) {
            this.setDirtyCanvas(true);
        }
    }

    scheduleOutputPulses() {
        const pulseCount = Number.isFinite(this.properties.pulseCount) ? this.properties.pulseCount : 1;
        const pulseInterval = Number.isFinite(this.properties.pulseInterval) ? this.properties.pulseInterval : 1000;

        for (let i = 0; i < pulseCount; i++) {
            setTimeout(() => {
                this.onExecute();
                if (this.properties.debug) {
                    console.log(`[ReceiverNode] Pulse ${i + 1}/${pulseCount} sent with output: ${JSON.stringify(this.lastOutputValue)} at ${new Date()}`);
                }
            }, i * pulseInterval);
        }
    }

    hsvToRgb(h, s, v) {
        const vNormalized = v / 254;
        const i = Math.floor(h * 6);
        const f = h * 6 - i;
        const p = vNormalized * (1 - s);
        const q = vNormalized * (1 - f * s);
        const t = vNormalized * (1 - (1 - f) * s);

        const mappings = [
            [vNormalized, t, p], [q, vNormalized, p], [p, vNormalized, t],
            [p, q, vNormalized], [t, p, vNormalized], [vNormalized, p, q]
        ];

        const [r, g, b] = mappings[i % 6];
        return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    }

    onDrawBackground(ctx) {
        if (super.onDrawBackground) super.onDrawBackground(ctx);
        if (!this.bgGradient) {
            this.bgGradient = ctx.createLinearGradient(0, 0, 0, this.size[1]);
            this.bgGradient.addColorStop(0, "rgba(150, 120, 70, 0.9)");
            this.bgGradient.addColorStop(1, "rgba(130, 100, 50, 0.8)");
        }
        ctx.fillStyle = this.bgGradient;
        ctx.fillRect(0, 0, this.size[0], this.size[1]);
    }

    onDrawForeground(ctx, graphcanvas) {
        if (!this.flags.collapsed) {
            let widgetsHeight = 0;
            this.widgets.forEach(widget => {
                widgetsHeight += widget.computeSize ? widget.computeSize(this.size[0])[1] : LiteGraph.NODE_WIDGET_HEIGHT;
            });

            const gapBetweenElements = 10;
            const historyEntryHeight = 15;
            const colorBoxHeight = 20;

            const historyYStart = LiteGraph.NODE_TITLE_HEIGHT + widgetsHeight + gapBetweenElements + 30;

            this.valueHistory.forEach((entry, index) => {
                const historyY = historyYStart + (index * historyEntryHeight);
                ctx.fillStyle = "#FFF";
                ctx.font = "10px Arial";
                ctx.textAlign = "left";
                ctx.fillText(`${entry.timestamp}: ${JSON.stringify(entry.value)}`, 5, historyY);
            });

            const historyHeight = this.valueHistory.length * historyEntryHeight;

            // MODIFIED: Adjust color box position based on current height
            const colorBoxY = this.size[1] - colorBoxHeight - 5;

            if (this.properties.errorState) {
                ctx.fillStyle = "#FF5555";
                ctx.fillRect(0, 0, this.size[0], 5);
            }

            let fillColor = "#444";
            let text = "No Data";
            if (this.lastOutputValue !== null && this.lastOutputValue !== undefined) {
                if (typeof this.lastOutputValue === "boolean") {
                    fillColor = this.lastOutputValue ? "#0F0" : "#F00";
                    text = `[Trigger] ${this.lastOutputValue}`;
                } else if (typeof this.lastOutputValue === "number") {
                    fillColor = "#08F";
                    text = `[Number] ${this.lastOutputValue}`;
                } else if (typeof this.lastOutputValue === "string") {
                    fillColor = "#F80";
                    text = `[String] ${this.lastOutputValue}`;
                } else if (typeof this.lastOutputValue === "object" &&
                           "hue" in this.lastOutputValue &&
                           "saturation" in this.lastOutputValue &&
                           "brightness" in this.lastOutputValue) {
                    const { hue, saturation, brightness } = this.lastOutputValue;
                    const [r, g, b] = this.hsvToRgb(hue, saturation, brightness);
                    fillColor = `rgb(${r}, ${g}, ${b})`;
                    text = `[HSV] H${Math.round(hue * 360)} S${Math.round(saturation * 100)} B${brightness}`;
                } else if (Array.isArray(this.lastOutputValue)) {
                    fillColor = "#A0F";
                    text = `[Array] ${JSON.stringify(this.lastOutputValue)}`;
                } else {
                    fillColor = "#888";
                    text = `[Object] ${JSON.stringify(this.lastOutputValue)}`;
                }
            }

            ctx.fillStyle = fillColor;
            ctx.fillRect(5, colorBoxY, this.size[0] - 10, colorBoxHeight);

            ctx.fillStyle = "#FFF";
            ctx.font = "12px Arial";
            ctx.textAlign = "center";
            ctx.fillText(text, this.size[0] / 2, colorBoxY + 15);
        }
    }

    onSerialize(o) {
        o.properties = { ...this.properties };
    }

    onConfigure(o) {
        if (o.properties) {
            this.properties = {
                selectedBuffer: null,
                debug: false,
                errorState: null,
                pulseCount: 1,
                pulseInterval: 1000,
                ...o.properties
            };
        }
        if (this.bufferWidget) {
            this.bufferWidget.value = this.properties.selectedBuffer || "None";
        }
        if (this.debugWidget) {
            this.debugWidget.value = this.properties.debug;
        }
        if (this.pulseCountWidget) {
            this.pulseCountWidget.value = Number.isFinite(this.properties.pulseCount) ? this.properties.pulseCount : 1;
        }
        if (this.pulseIntervalWidget) {
            this.pulseIntervalWidget.value = Number.isFinite(this.properties.pulseInterval) ? this.properties.pulseInterval : 1000;
        }
        this.lastOutputValue = null;
        this.lastBufferValue = null;
        this.scheduleOutputPulses();
    }

    clone() {
        const newNode = super.clone();
        newNode.properties = { ...this.properties };
        return newNode;
    }
}

LiteGraph.registerNodeType("Utility/ReceiverNode", ReceiverNode);