class BackdropGroup extends LiteGraph.LGraphNode {
    static backdropCounter = 0; // Track addition order

    constructor() {
        super();
        this.title = "Backdrop Group";
        this.size = [400, 300]; // Default size
        this.bgcolor = "rgba(0, 0, 0, 0.2)";
        this.properties = {
            muted: false
        };

        // Enable resizing and dragging, disable input capture
        this.resizable = true;
        this.flags = { skip_dragging: false, capture_input: false };

        // Track contained nodes and last position
        this.containedNodes = [];
        this.lastPos = [0, 0];
        this.isDragging = false;

        // Assign unique addition order
        this.addOrder = BackdropGroup.backdropCounter++;

        // Add toggle widget after setting size
        this.addWidget(
            "toggle",
            "Mute",
            this.properties.muted,
            (v) => {
                this.toggleMute();
            },
            { width: 100, label_width: 50 }
        );

        // Ensure size isn't overwritten by widget
        this.size = [400, 300];
    }

    /**
     * Update the list of contained nodes based on boundaries
     */
    updateContainedNodes() {
        if (!this.graph || !this.graph._nodes) {
            console.log("updateContainedNodes skipped: graph not ready");
            this.containedNodes = [];
            return;
        }

        // Log all nodes in the graph
        console.log(`Graph contains ${this.graph._nodes.length} nodes: ` +
                    this.graph._nodes.map(n => `${n.title} at [${n.pos[0]}, ${n.pos[1]}]`).join(", "));

        this.containedNodes = this.graph._nodes.filter((node) => {
            if (node === this) return false; // Exclude self
            const [nodeX, nodeY] = node.pos;
            const [nodeWidth, nodeHeight] = node.size;
            const [groupX, groupY] = this.pos;
            const [groupWidth, groupHeight] = this.size;

            // Adjust for title bar offset
            const titleBarOffset = 30;
            const isContained = (
                nodeX >= groupX &&
                nodeY >= groupY + titleBarOffset &&
                nodeX + nodeWidth <= groupX + groupWidth &&
                nodeY + nodeHeight <= groupY + groupHeight + titleBarOffset
            );

            console.log(`Node ${node.title} at [${nodeX}, ${nodeY}] size [${nodeWidth}, ${nodeHeight}] ` +
                        `vs Backdrop at [${groupX}, ${groupY}] size [${groupWidth}, ${groupHeight}] ` +
                        `-> Contained: ${isContained}`);
            return isContained;
        });
        console.log(`Contained nodes: ${this.containedNodes.map(n => n.title).join(", ")}`);
    }

    /**
     * Override setSize to update capture area
     * @param {Array} size [width, height]
     */
    setSize(size) {
        this.size = [Math.max(size[0], 200), Math.max(size[1], 100)];
        console.log(`Backdrop resized to size: [${this.size[0]}, ${this.size[1]}], pos: [${this.pos[0]}, ${this.pos[1]}]`);
        if (this.graph) {
            this.updateContainedNodes();
            this.updateZOrder();
            this.graph.setDirtyCanvas(true, true);
        }
    }

    /**
     * Override setPosition to move contained nodes
     * @param {number} x
     * @param {number} y
     */
    setPosition(x, y) {
        console.log(`setPosition called with x: ${x}, y: ${y}`);
        const deltaX = x - this.pos[0];
        const deltaY = y - this.pos[1];

        // Update contained nodes' positions
        this.updateContainedNodes();
        this.containedNodes.forEach((node) => {
            node.pos[0] += deltaX;
            node.pos[1] += deltaY;
            node.setDirtyCanvas(true);
            console.log(`Moved node ${node.title} to [${node.pos[0]}, ${node.pos[1]}]`);
        });

        // Update own position
        this.pos[0] = x;
        this.pos[1] = y;
        this.lastPos[0] = x;
        this.lastPos[1] = y;
        this.graph?.setDirtyCanvas(true, true);
    }

    /**
     * Handle mouse drag to move contained nodes
     */
    onMouseDrag(event) {
        if (!this.isDragging) return;
        console.log(`onMouseDrag called, pos: [${this.pos[0]}, ${this.pos[1]}]`);

        const deltaX = this.pos[0] - this.lastPos[0];
        const deltaY = this.pos[1] - this.lastPos[1];

        if (deltaX !== 0 || deltaY !== 0) {
            this.updateContainedNodes();
            this.containedNodes.forEach((node) => {
                node.pos[0] += deltaX;
                node.pos[1] += deltaY;
                node.setDirtyCanvas(true);
                console.log(`Dragged node ${node.title} to [${node.pos[0]}, ${node.pos[1]}]`);
            });
            this.lastPos[0] = this.pos[0];
            this.lastPos[1] = this.pos[1];
            this.graph?.setDirtyCanvas(true, true);
        }
    }

    /**
     * Fallback to detect position changes during drag
     */
    onMouseMove(event) {
        if (!this.isDragging) return;
        console.log(`onMouseMove called, pos: [${this.pos[0]}, ${this.pos[1]}]`);

        const deltaX = this.pos[0] - this.lastPos[0];
        const deltaY = this.pos[1] - this.lastPos[1];

        if (deltaX !== 0 || deltaY !== 0) {
            this.updateContainedNodes();
            this.containedNodes.forEach((node) => {
                node.pos[0] += deltaX;
                node.pos[1] += deltaY;
                node.setDirtyCanvas(true);
                console.log(`Moved node ${node.title} to [${node.pos[0]}, ${node.pos[1]}] (via onMouseMove)`);
            });
            this.lastPos[0] = this.pos[0];
            this.lastPos[1] = this.pos[1];
            this.graph?.setDirtyCanvas(true, true);
        }
    }

    /**
     * Custom drag detection
     */
    onMouseDown(event) {
        this.isDragging = true;
        this.lastPos[0] = this.pos[0];
        this.lastPos[1] = this.pos[1];
        console.log(`Mouse down, drag started, pos: [${this.pos[0]}, ${this.pos[1]}]`);
    }

    /**
     * End custom drag
     */
    onMouseUp(event) {
        this.isDragging = false;
        console.log("Mouse up, drag ended");
    }

    /**
     * Handle drag start
     */
    onDragStart(event) {
        this.isDragging = true;
        this.lastPos[0] = this.pos[0];
        this.lastPos[1] = this.pos[1];
        console.log(`Drag started, initial pos: [${this.lastPos[0]}, ${this.pos[1]}]`);
    }

    /**
     * Handle drag end
     */
    onDragEnd(event) {
        this.isDragging = false;
        console.log("Drag ended");
        this.updateZOrder();
    }

    /**
     * Fallback to detect position changes in update loop
     */
    onExecute() {
        if (this.pos[0] !== this.lastPos[0] || this.pos[1] !== this.lastPos[1]) {
            console.log(`Position changed in onExecute, pos: [${this.pos[0]}, ${this.pos[1]}]`);
            const deltaX = this.pos[0] - this.lastPos[0];
            const deltaY = this.pos[1] - this.lastPos[1];

            this.updateContainedNodes();
            this.containedNodes.forEach((node) => {
                node.pos[0] += deltaX;
                node.pos[1] += deltaY;
                node.setDirtyCanvas(true);
                console.log(`Moved node ${node.title} to [${node.pos[0]}, ${node.pos[1]}] (via onExecute)`);
            });

            this.lastPos[0] = this.pos[0];
            this.lastPos[1] = this.pos[1];
            this.graph?.setDirtyCanvas(true, true);
        }
    }

    /**
     * Toggle the mute state of the group
     */
    toggleMute() {
        this.properties.muted = !this.properties.muted;
        this.propagateMuteState();
        this.setDirtyCanvas(true);
        this.graph?.updateExecutionOrder();
    }

    /**
     * Propagate the mute state to all contained nodes
     */
    propagateMuteState() {
        this.updateContainedNodes();
        this.containedNodes.forEach((node) => {
            node.properties = node.properties || {};
            node.properties.muted = this.properties.muted;
            node.setDirtyCanvas(true);
        });
    }

    /**
     * Add context menu options
     */
    getContextMenuOptions(options) {
        options = options || [];
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
     */
    onMouseDoubleClick(event) {
        this.toggleMute();
    }

    /**
     * Draw background to ensure backdrop is behind
     */
    onDrawBackground(ctx) {
        ctx.fillStyle = this.bgcolor;
        ctx.fillRect(0, 0, this.size[0], this.size[1]);
    }

    /**
     * Visual feedback for muted state and bounding box
     */
    onDrawForeground(ctx) {
        // Draw bounding box for debugging
        ctx.strokeStyle = "rgba(0, 255, 0, 0.5)"; // Green outline
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, this.size[0], this.size[1]);

        // Draw position label with add order
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "12px Arial";
        ctx.textAlign = "left";
        ctx.fillText(`Pos: [${this.pos[0]}, ${this.pos[1]}] Order: ${this.addOrder}`, 5, 15);

        if (this.properties.muted) {
            ctx.fillStyle = "rgba(255, 0, 0, 0.3)";
            ctx.fillRect(0, 0, this.size[0], this.size[1]);

            ctx.fillStyle = "#FFFFFF";
            ctx.font = "16px Arial";
            ctx.textAlign = "center";
            ctx.fillText("Muted", this.size[0] / 2, this.size[1] / 2);
        }
    }

    /**
     * Ensure backdrop is rendered furthest back
     */
    updateZOrder() {
        if (!this.graph || !this.graph._nodes) return;

        // Collect all BackdropGroup nodes and others
        const backdrops = [];
        const otherNodes = [];
        for (const node of this.graph._nodes) {
            if (node instanceof BackdropGroup) {
                backdrops.push(node);
            } else {
                otherNodes.push(node);
            }
        }

        // Sort backdrops by addOrder (earliest first)
        backdrops.sort((a, b) => a.addOrder - b.addOrder);

        // Rebuild graph._nodes: backdrops first, then others
        this.graph._nodes = [...backdrops, ...otherNodes];
        const newIndex = this.graph._nodes.indexOf(this);
        console.log(`Updated Z-order for ${this.title}, addOrder: ${this.addOrder}, new index: ${newIndex}`);
        console.log(`Node order: ${this.graph._nodes.map(n => `${n.title} (order: ${n.addOrder || 'N/A'})`).join(", ")}`);
        this.graph.setDirtyCanvas(true, true);
    }

    /**
     * Serialize the node's properties
     */
    onSerialize(o) {
        o.properties = this.properties;
        o.size = this.size;
        o.addOrder = this.addOrder;
    }

    /**
     * Deserialize the node's properties
     */
    onConfigure(o) {
        if (o.properties) {
            this.properties = o.properties;
            this.propagateMuteState();
        }
        if (o.size) {
            this.size = o.size;
        }
        if (o.addOrder) {
            this.addOrder = o.addOrder;
            BackdropGroup.backdropCounter = Math.max(BackdropGroup.backdropCounter, o.addOrder + 1);
        }
        this.lastPos = [this.pos[0], this.pos[1]];
    }

    /**
     * Initialize contained nodes list and Z-order when added to graph
     */
    onAdded(graph) {
        this.graph = graph;
        this.updateContainedNodes();
        this.updateZOrder();
        console.log("Backdrop added to graph");

        // Add graph-level move listener
        this.graph.onNodeMoved = (node) => {
            if (node === this) {
                console.log(`Graph detected node move, pos: [${this.pos[0]}, ${this.pos[1]}]`);
                const deltaX = this.pos[0] - this.lastPos[0];
                const deltaY = this.pos[1] - this.lastPos[1];
                if (deltaX !== 0 || deltaY !== 0) {
                    this.updateContainedNodes();
                    this.containedNodes.forEach((n) => {
                        n.pos[0] += deltaX;
                        n.pos[1] += deltaY;
                        n.setDirtyCanvas(true);
                        console.log(`Moved node ${n.title} to [${n.pos[0]}, ${n.pos[1]}] (via graph)`);
                    });
                    this.lastPos[0] = this.pos[0];
                    this.lastPos[1] = this.pos[1];
                    this.graph.setDirtyCanvas(true, true);
                }
            }
        };
    }
}

// Register BackdropGroup as a node type
LiteGraph.registerNodeType("Groups/BackdropGroup", BackdropGroup);