class BackdropGroup extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Backdrop Group";
        this.size = [300, 200]; // Adjust size as needed
        this.bgcolor = "rgba(0, 0, 0, 0.2)";
        this.properties = {
            muted: false // Mute state
        };

        // Add a toggle widget for muting
        this.addWidget(
            "toggle",
            "Mute",
            this.properties.muted,
            (v) => {
                this.toggleMute();
            },
            { width: 100, label_width: 50 }
        );
    }

    /**
     * Toggle the mute state of the group
     */
    toggleMute() {
        this.properties.muted = !this.properties.muted;
        this.propagateMuteState();
        this.setDirtyCanvas(true);
        // Optional: Notify the graph to re-evaluate execution order
        this.graph?.updateExecutionOrder();
    }

    /**
     * Propagate the mute state to all contained nodes
     */
    propagateMuteState() {
        const containedNodes = this.getContainedNodes();
        containedNodes.forEach((node) => {
            node.properties = node.properties || {};
            node.properties.muted = this.properties.muted;
            node.setDirtyCanvas(true);
        });
    }

    /**
     * Get all nodes contained within the group's boundaries
     * @return {Array} Array of nodes within the group
     */
    getContainedNodes() {
        return this.graph._nodes.filter((node) => {
            const [nodeX, nodeY] = node.pos;
            const [nodeWidth, nodeHeight] = node.size;
            const [groupX, groupY] = this.pos;
            const [groupWidth, groupHeight] = this.size;

            return (
                nodeX >= groupX &&
                nodeY >= groupY &&
                nodeX + nodeWidth <= groupX + groupWidth &&
                nodeY + nodeHeight <= groupY + groupHeight
            );
        });
    }

    /**
     * Add context menu options
     * @method getContextMenuOptions
     * @return {Array} Array of context menu options
     */
    getContextMenuOptions(options) {
        if (!options) {
            options = [];
        }

        options.push({
            content: this.properties.muted ? "Unmute Group" : "Mute Group",
            callback: () => {
                this.toggleMute();
            },
        });

        return options;
    }

    /**
     * Handle double-click event to toggle mute
     * @method onMouseDoubleClick
     * @param {Object} event Mouse event
     */
    onMouseDoubleClick(event) {
        this.toggleMute();
    }

    /**
     * Visual feedback for muted state
     * @method onDrawForeground
     * @param {CanvasRenderingContext2D} ctx
     */
    onDrawForeground(ctx) {
        if (this.properties.muted) {
            ctx.fillStyle = "rgba(255, 0, 0, 0.3)"; // Semi-transparent red overlay
            ctx.fillRect(0, 0, this.size[0], this.size[1]);

            ctx.fillStyle = "#FFFFFF"; // White text
            ctx.font = "16px Arial";
            ctx.textAlign = "center";
            ctx.fillText("Muted", this.size[0] / 2, this.size[1] / 2);
        }
    }

    /**
     * Serialize the node's properties, including the muted state
     * @method onSerialize
     * @param {Object} o The object to serialize into
     */
    onSerialize(o) {
        o.properties = this.properties;
        o.size = this.size;
    }

    /**
     * Deserialize the node's properties, restoring the muted state
     * @method onConfigure
     * @param {Object} o The serialized object
     */
    onConfigure(o) {
        if (o.properties) {
            this.properties = o.properties;
            this.propagateMuteState();
        }
        if (o.size) {
            this.size = o.size;
        }
    }
}

// Register BackdropGroup as a node type
LiteGraph.registerNodeType("Groups/BackdropGroup", BackdropGroup);
