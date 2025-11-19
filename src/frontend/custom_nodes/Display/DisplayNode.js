class DisplayNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Debug Display";
        this.size = [240, 120];
        this.bgcolor = "#2c2f33";

        // Use empty strings for input names to suppress LiteGraph labels
        this.addInput("", "*");
        this.addInput("", "*");
        this.addInput("", "*");

        this.currentValues = [];
        this.inputLabels = ["Input 1", "Input 2", "Input 3"];
        this.wrappedLines = [];
        this.statusMessage = null;
        this.statusTimeout = null;
        this.contentHeight = 0;
        this.buttonHeight = 30;
        this.buttonWidth = 100;

        // Initialize without widgets
        this.widgets = [];
        this.setupWidgets();
    }

    setupWidgets() {
        // No widgets are added since the button is drawn manually
        this.widgets = [];
    }

    getClipboardText() {
        let text = "";
        this.wrappedLines.forEach(lines => {
            if (lines.length > 0) {
                lines.forEach(line => {
                    text += line.text + "\n";
                });
                text += "\n";
            }
        });
        return text.trim();
    }

    async copyToClipboard() {
        const text = this.getClipboardText();
        if (!text) {
            this.setStatus("No data to copy", 2000);
            return;
        }

        try {
            if (window.api && window.api.copyToClipboard) {
                const result = await window.api.copyToClipboard(text);
                if (result.success) {
                    this.setStatus("Copied to clipboard!", 2000);
                } else {
                    throw new Error(result.error || "Failed to copy via IPC");
                }
            } else {
                console.error("DisplayNode - Electron API not available for clipboard access.");
                this.setStatus("Clipboard access not available. Manually copy the displayed text.", 3000);
            }
        } catch (err) {
            console.error("DisplayNode - Failed to copy:", err);
            this.setStatus(`Failed to copy: ${err.message}`, 3000);
        }
    }

    setStatus(message, duration) {
        this.statusMessage = message;
        if (this.statusTimeout) clearTimeout(this.statusTimeout);
        this.setDirtyCanvas(true);
        if (duration) {
            this.statusTimeout = setTimeout(() => {
                this.statusMessage = null;
                this.setDirtyCanvas(true);
            }, duration);
        }
    }

    onExecute() {
        this.currentValues = [];
        for (let i = 0; i < this.inputs.length; i++) {
            const inputData = this.getInputData(i);
            this.currentValues[i] = inputData !== undefined ? inputData : null;
        }

        this.updateWrappedText();
        this.updateNodeSize();
    }

    formatValue(value) {
        if (value === null || value === undefined) return "null";
        if (Array.isArray(value)) {
            if (value.length === 0) return "[]";
            if (value.length > 5) return `[${value.length} items]`;
            return `[${value.map(v => this.formatValue(v)).join(", ")}]`;
        }
        if (typeof value === "object") {
            try {
                const str = JSON.stringify(value, null, 2);
                return str.split("\n");
            } catch (e) {
                return ["[Object]"];
            }
        }
        return [String(value)];
    }

    wrapText(ctx, text, maxWidth) {
        const words = text.split(" ");
        const lines = [];
        let currentLine = words[0] || "";

        for (let i = 1; i < words.length; i++) {
            const word = words[i];
            const width = ctx.measureText(currentLine + " " + word).width;
            if (width < maxWidth) {
                currentLine += " " + word;
            } else {
                lines.push(currentLine);
                currentLine = word;
            }
        }
        if (currentLine) lines.push(currentLine);
        return lines;
    }

    updateWrappedText() {
        const ctx = this.graph?.canvas?.ctx || document.createElement("canvas").getContext("2d");
        ctx.font = "14px 'Roboto', Arial, sans-serif";
        const maxTextWidth = this.size[0] - 40;

        this.wrappedLines = [];
        this.currentValues.forEach((value, index) => {
            const label = `${this.inputLabels[index]}: `;
            const formattedValue = this.formatValue(value);

            const lines = [];
            if (Array.isArray(formattedValue)) {
                formattedValue.forEach((line, lineIndex) => {
                    const isNested = lineIndex > 0;
                    const text = isNested ? `    ${line}` : (value === null ? label + "null" : label + line);
                    const wrapped = this.wrapText(ctx, text, maxTextWidth);
                    wrapped.forEach((wrappedLine, wrapIndex) => {
                        const indent = isNested || wrapIndex > 0 ? "    " : "";
                        lines.push({ label, text: indent + wrappedLine, isNested });
                    });
                });
            } else {
                const text = value === null ? label + "null" : label + formattedValue;
                const wrapped = this.wrapText(ctx, text, maxTextWidth);
                wrapped.forEach((wrappedLine, wrapIndex) => {
                    const indent = wrapIndex > 0 ? "    " : "";
                    lines.push({ label, text: indent + wrappedLine, isNested: false });
                });
            }
            this.wrappedLines[index] = lines;
        });
    }

    updateNodeSize() {
        const ctx = this.graph?.canvas?.ctx || document.createElement("canvas").getContext("2d");
        ctx.font = "14px 'Roboto', Arial, sans-serif";

        let maxWidth = 240;
        let totalHeight = 40; // Base height for title

        // Calculate height for wrapped text
        this.wrappedLines.forEach(lines => {
            if (lines.length > 0) {
                lines.forEach(() => {
                    const lineWidth = ctx.measureText(lines[0].text).width + 40;
                    maxWidth = Math.max(maxWidth, lineWidth);
                    totalHeight += 20;
                });
                totalHeight += 5; // Gap between inputs
            }
        });

        // Add height for status message
        if (this.statusMessage) {
            totalHeight += 20;
            totalHeight += 5;
        }

        // Store the content height
        this.contentHeight = totalHeight;

        // Add padding before button
        totalHeight += 10;

        // Add height for manually drawn button
        totalHeight += this.buttonHeight;

        // Add bottom padding
        totalHeight += 20;

        // Update node size
        this.size = [Math.max(maxWidth, 240), totalHeight];
        this.setDirtyCanvas(true, true);
    }

    onDrawForeground(ctx) {
        ctx.font = "12px 'Roboto', Arial, sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";

        let yOffset = 15; // Start below title
        this.wrappedLines.forEach(lines => {
            if (lines.length > 0) {
                lines.forEach(line => {
                    ctx.fillStyle = line.isNested ? "#b0b0b0" : "#e0e0e0";
                    ctx.fillText(line.text, 10, yOffset);
                    yOffset += 20;
                });
                yOffset += 5; // Gap between inputs
            }
        });

        // Draw status message
        if (this.statusMessage) {
            ctx.fillStyle = "#00ff00";
            ctx.fillText(this.statusMessage, 10, yOffset);
            yOffset += 20;
            yOffset += 5;
        }

        // Manually draw the button
        yOffset += 10; // Padding before button
        const buttonX = 10;
        const buttonY = yOffset;
        ctx.fillStyle = "#4a4a4a";
        ctx.fillRect(buttonX, buttonY, this.buttonWidth, this.buttonHeight);
        ctx.strokeStyle = "#ffffff";
        ctx.strokeRect(buttonX, buttonY, this.buttonWidth, this.buttonHeight);
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.fillText("Copy Data", buttonX + this.buttonWidth / 2, buttonY + this.buttonHeight / 2);
        ctx.textAlign = "left"; // Reset alignment
        // Store button position for click handling
        this.buttonPos = { x: buttonX, y: buttonY, width: this.buttonWidth, height: this.buttonHeight };
    }

    onMouseDown(event, pos) {
        // Handle click on manually drawn button
        if (this.buttonPos) {
            const { x, y, width, height } = this.buttonPos;
            if (pos[0] >= x && pos[0] <= x + width && pos[1] >= y && pos[1] <= y + height) {
                this.copyToClipboard();
                return true; // Event handled
            }
        }
        return false; // Let LiteGraph handle other events
    }

    onDrawBackground(ctx) {
        const gradient = ctx.createLinearGradient(0, 0, 0, this.size[1]);
        gradient.addColorStop(0, this.currentValues.some(v => v !== null) ? "#3a3f44" : "#2c2f33");
        gradient.addColorStop(1, "#2c2f33");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, this.size[0], this.size[1]);

        ctx.strokeStyle = "#555";
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, this.size[0], this.size[1]);
    }

    onGetInputs() {
        // Return inputs with empty names to suppress LiteGraph labels
        return [
            ["", "*"],
            ["", "*"],
            ["", "*"]
        ];
    }

    onGetOutputs() {
        return [];
    }

    serialize() {
        const data = super.serialize();
        data.currentValues = this.currentValues;
        data.inputLabels = this.inputLabels;
        // Ensure widgets are not serialized
        data.widgets = [];
        return data;
    }

    configure(data) {
        super.configure(data);
        if (data.currentValues !== undefined) {
            this.currentValues = data.currentValues;
        }
        if (data.inputLabels !== undefined) {
            this.inputLabels = data.inputLabels;
        }
        // Clear any deserialized widgets
        this.widgets = [];
        this.setupWidgets();
        this.updateWrappedText();
        this.updateNodeSize();
    }

    // Prevent any widget rendering
    onDrawWidgets(ctx) {
        // Explicitly do nothing
        return;
    }
}

// Register the node
LiteGraph.registerNodeType("Debug/DisplayNode", DisplayNode);