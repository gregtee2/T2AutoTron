class SenderNode extends LiteGraph.LGraphNode {
    static sharedBuffer = {};

    constructor() {
        super();
        this.title = "Sender Node";
        this.size = [200, 200];
        this.bgcolor = "rgb(70, 120, 150)";
        this.bgGradient = null;

        this.addInput("Input", "*");

        this.properties = { bufferName: "Default", bufferToDelete: null, errorState: null };
        this.bufferNameWidget = this.addWidget("text", "Buffer Name", this.properties.bufferName, (value) => {
            if (!value.trim()) {
                this.properties.errorState = "Buffer name cannot be empty";
                this.statusWidget.value = "⚠️ Buffer name cannot be empty";
                return;
            }
            const normalizedValue = value.replace(/^\[[^\]]+\]/, "").trim() || "Default";
            this.properties.bufferName = normalizedValue;
            this.properties.errorState = null;
            this.updateBuffer();
            console.log(`[SenderNode] Buffer name set to: ${normalizedValue}`);
        });

        this.deleteBufferWidget = this.addWidget("combo", "Buffer to Delete", this.properties.bufferToDelete || "None", (value) => {
            this.properties.bufferToDelete = value === "None" ? null : value;
            console.log(`[SenderNode] Selected buffer to delete: ${this.properties.bufferToDelete}`);
        }, {
            values: () => {
                const buffers = Object.keys(SenderNode.sharedBuffer || {}).sort();
                return buffers.length > 0 ? ["None", ...buffers] : ["None"];
            }
        });

        this.deleteButton = this.addWidget("button", "Delete Selected", "Delete", () => {
            console.log(`[SenderNode] Delete button clicked for buffer: ${this.properties.bufferToDelete}`);
            this.deleteBuffer();
        });

        this.clearAllButton = this.addWidget("button", "Clear All", "Clear All Buffers", () => {
            SenderNode.sharedBuffer = {};
            this.statusWidget.value = "All buffers cleared";
            this.deleteBufferWidget.options.values = ["None"];
            this.deleteBufferWidget.value = "None";
            this.refreshReceiverNodes();
            this.setDirtyCanvas(true);
            console.log("[SenderNode] All buffers cleared");
        });

        this.statusWidget = this.addWidget("text", "Status", "Idle", null, { readonly: true });

        if (!SenderNode.sharedBuffer) {
            SenderNode.sharedBuffer = {};
        }

        this.lastInputValue = null;
        this.updateBuffer();
    }

    detectDataType(data) {
        if (data === null || data === undefined) {
            return "[Unknown]";
        }
        if (typeof data === "boolean") {
            return "[Trigger]";
        }
        if (typeof data === "number") {
            return "[Number]";
        }
        if (typeof data === "string") {
            return "[String]";
        }
        if (typeof data === "object" && data !== null) {
            if (
                data.hasOwnProperty("hue") &&
                data.hasOwnProperty("saturation") &&
                data.hasOwnProperty("brightness") &&
                typeof data.hue === "number" &&
                typeof data.saturation === "number" &&
                typeof data.brightness === "number"
            ) {
                return "[HSV]";
            }
            if (Array.isArray(data)) {
                return "[Array]";
            }
            return "[Object]";
        }
        return "[Unknown]";
    }

    getPrefixedBufferName(baseName, data) {
        const prefix = this.detectDataType(data);
        if (baseName.startsWith(prefix)) {
            return baseName;
        }
        return `${prefix}${baseName}`;
    }

    updateBuffer() {
        let bufferName = this.properties.bufferName;
        if (bufferName) {
            const inputData = this.getInputData(0);
            if (inputData !== undefined && inputData !== this.lastInputValue) {
                bufferName = this.getPrefixedBufferName(bufferName, inputData);
                // Allow updating existing buffer if data type matches
                const existingPrefix = Object.keys(SenderNode.sharedBuffer || {}).find(key => key === bufferName)?.match(/^\[[^\]]+\]/)?.[0];
                if (existingPrefix && existingPrefix !== this.detectDataType(inputData)) {
                    this.statusWidget.value = `⚠️ Buffer ${bufferName} has different type`;
                    this.properties.errorState = "Buffer type conflict";
                    console.log(`[SenderNode] Type conflict for buffer ${bufferName}: existing=${existingPrefix}, new=${this.detectDataType(inputData)}`);
                    return;
                }
                SenderNode.sharedBuffer[bufferName] = inputData;
                this.lastInputValue = inputData;
                this.statusWidget.value = `Stored: ${bufferName}`;
                this.properties.errorState = null;
                this.setDirtyCanvas(true);
                const buffers = Object.keys(SenderNode.sharedBuffer || {}).sort();
                this.deleteBufferWidget.options.values = buffers.length > 0 ? ["None", ...buffers] : ["None"];
                this.refreshReceiverNodes();
                //console.log(`[SenderNode] Stored buffer: ${bufferName}, value: ${JSON.stringify(inputData)}`);
            }
        }
    }

    deleteBuffer() {
        const bufferName = this.properties.bufferToDelete;
        if (bufferName && bufferName !== "None") {
            if (bufferName in SenderNode.sharedBuffer) {
                delete SenderNode.sharedBuffer[bufferName];
                this.statusWidget.value = `Deleted: ${bufferName}`;
            } else {
                this.statusWidget.value = `Not found: ${bufferName}`;
            }
            const normalizedCurrent = this.properties.bufferName;
            const possiblePrefixes = ["[Trigger]", "[HSV]", "[Number]", "[String]", "[Array]", "[Object]", "[Unknown]"];
            if (possiblePrefixes.some(prefix => `${prefix}${normalizedCurrent}` === bufferName)) {
                this.properties.bufferName = "Default";
                this.bufferNameWidget.value = "Default";
            }
            this.properties.bufferToDelete = null;
            this.deleteBufferWidget.value = "None";
            const buffers = Object.keys(SenderNode.sharedBuffer || {}).sort();
            this.deleteBufferWidget.options.values = buffers.length > 0 ? ["None", ...buffers] : ["None"];
            this.setDirtyCanvas(true);
            this.refreshReceiverNodes();
            console.log(`[SenderNode] Deleted buffer: ${bufferName}`);
        } else {
            this.statusWidget.value = "Select a buffer to delete";
        }
    }

    refreshReceiverNodes() {
        if (this.graph && this.graph.list_of_nodes && Array.isArray(this.graph.list_of_nodes)) {
            const receiverNodes = this.graph.list_of_nodes.filter(node => node.type === "Utility/ReceiverNode");
            receiverNodes.forEach(node => {
                if (node.bufferWidget) {
                    const buffers = Object.keys(SenderNode.sharedBuffer || {}).sort();
                    node.bufferWidget.options.values = buffers.length > 0 ? ["None", ...buffers] : ["None"];
                    if (!(node.properties.selectedBuffer in SenderNode.sharedBuffer)) {
                        node.properties.selectedBuffer = null;
                        node.bufferWidget.value = "None";
                    }
                    node.onExecute();
                    node.setDirtyCanvas(true, true);
                    console.log(`[SenderNode] Refreshed ReceiverNode: ${node.title}, buffers: ${buffers.join(", ")}`);
                }
            });
        }
    }

    onExecute() {
        this.updateBuffer();
    }

    onDrawBackground(ctx) {
        if (super.onDrawBackground) super.onDrawBackground(ctx);
        if (!this.bgGradient) {
            this.bgGradient = ctx.createLinearGradient(0, 0, 0, this.size[1]);
            this.bgGradient.addColorStop(0, "rgba(70, 120, 150, 0.9)");
            this.bgGradient.addColorStop(1, "rgba(50, 100, 130, 0.8)");
        }
        ctx.fillStyle = this.bgGradient;
        ctx.fillRect(0, 0, this.size[0], this.size[1]);
    }

    onDrawForeground(ctx) {
        if (super.onDrawForeground) super.onDrawForeground(ctx);
        if (this.properties.errorState) {
            ctx.fillStyle = "#FF5555";
            ctx.fillRect(0, 0, this.size[0], 5);
        }
    }

    onSerialize(o) {
        o.properties = { ...this.properties };
    }

    onConfigure(o) {
        if (o.properties) {
            this.properties = { ...o.properties };
            if (this.bufferNameWidget) {
                let normalizedName = this.properties.bufferName;
                const possiblePrefixes = ["[Trigger]", "[HSV]", "[Number]", "[String]", "[Array]", "[Object]", "[Unknown]"];
                possiblePrefixes.forEach(prefix => {
                    if (normalizedName.startsWith(prefix)) {
                        normalizedName = normalizedName.slice(prefix.length);
                    }
                });
                this.properties.bufferName = normalizedName || "Default";
                this.bufferNameWidget.value = this.properties.bufferName;
            }
            if (this.deleteBufferWidget) {
                this.deleteBufferWidget.value = this.properties.bufferToDelete || "None";
            }
            if (this.properties.bufferName && SenderNode.sharedBuffer) {
                const inputData = this.getInputData(0);
                if (inputData !== undefined) {
                    const prefixedName = this.getPrefixedBufferName(this.properties.bufferName, inputData);
                    SenderNode.sharedBuffer[prefixedName] = inputData;
                }
            }
        }
    }

    onRemoved() {
        const possiblePrefixes = ["[Trigger]", "[HSV]", "[Number]", "[String]", "[Array]", "[Object]", "[Unknown]"];
        const bufferName = this.properties.bufferName;
        possiblePrefixes.forEach(prefix => {
            const prefixedName = `${prefix}${bufferName}`;
            if (prefixedName in SenderNode.sharedBuffer) {
                delete SenderNode.sharedBuffer[prefixedName];
            }
        });
        this.refreshReceiverNodes();
    }
}

LiteGraph.registerNodeType("Utility/SenderNode", SenderNode);