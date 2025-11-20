class BackdropGroup extends LiteGraph.LGraphNode {
    static backdropCounter = 0;

    constructor(title = "Backdrop Group") {
        super();
        this.title = title;
        this.size = [400, 300];
        this.color = "#334455";               // title bar color
        this.bgcolor = "rgba(30, 40, 60, 0.35)"; // backdrop fill
        this.properties = { muted: false };

        this.resizable = true;
        this.isDragging = false;
        this.lastPos = [0, 0];
        this.addOrder = BackdropGroup.backdropCounter++;

        // IMPORTANT: completely ignore mouse capture + hover
        this.flags = { capture_input: false };
        this.mouseOver = () => false;   // ← this is what finally fixes the "locked" nodes

        // Mute toggle
        this.addWidget("toggle", "Mute", false, (v) => {
            this.properties.muted = v;
            this.propagateMute();
            this.setDirtyCanvas(true, true);
        });

        // Force size again after widgets (prevents LiteGraph from shrinking it)
        this.size = [400, 300];
    }

    // ─────── MOUSE HANDLING – the only three you need ───────
    onMouseDown(e) {
        if (e.which === 3) return false; // right click → pass through

        const y = e.canvasY - this.pos[1];
        if (y > 35) return false;        // clicked inside → let nodes below get it

        // clicked title bar → drag the whole group
        this.isDragging = true;
        this.lastPos = [...this.pos];
        return true;
    }

    onMouseMove(e) {
        if (!this.isDragging) return false;

        const dx = this.pos[0] - this.lastPos[0];
        const dy = this.pos[1] - this.lastPos[1];
        if (dx || dy) {
            this.moveContainedNodes(dx, dy);
            this.lastPos = [...this.pos];
            this.graph.setDirtyCanvas(true, true);
        }
        return true;
    }

    onMouseUp() {
        this.isDragging = false;
        return false;
    }

    // ─────── CORE: move all contained nodes ───────
    moveContainedNodes(dx, dy) {
        this.updateContainedNodes();
        for (const node of this.containedNodes) {
            node.pos[0] += dx;
            node.pos[1] += dy;
            node.setDirtyCanvas(true);
        }
    }

    updateContainedNodes() {
        if (!this.graph?._nodes) {
            this.containedNodes = [];
            return;
        }
        const titleH = 35;
        this.containedNodes = this.graph._nodes.filter(n => {
            if (n === this || n instanceof BackdropGroup) return false;
            const nx = n.pos[0], ny = n.pos[1];
            const nw = n.size[0], nh = n.size[1];
            const gx = this.pos[0], gy = this.pos[1];
            const gw = this.size[0], gh = this.size[1];
            return nx >= gx && ny >= gy + titleH &&
                   nx + nw <= gx + gw && ny + nh <= gy + gh;
        });
    }

    // ─────── RESIZE – use setSize (never override onResize) ───────
    setSize(size) {
        super.setSize(size);
        this.updateContainedNodes();
        this.updateZOrder();
    }

    // ─────── Z-ORDER – backdrops always behind ───────
    updateZOrder() {
        if (!this.graph?._nodes) return;
        const backdrops = this.graph._nodes
            .filter(n => n instanceof BackdropGroup)
            .sort((a, b) => a.addOrder - b.addOrder);
        const others = this.graph._nodes.filter(n => !(n instanceof BackdropGroup));
        this.graph._nodes = [...backdrops, ...others];
        this.graph.setDirtyCanvas(true, true);
    }

    // ─────── MUTE ───────
    propagateMute() {
        this.updateContainedNodes();
        this.containedNodes.forEach(n => {
            if (!n.properties) n.properties = {};
            n.properties.muted = this.properties.muted;
            n.setDirtyCanvas(true);
        });
    }

    // ─────── DRAWING ───────
    onDrawBackground(ctx) {
        ctx.fillStyle = this.bgcolor;
        ctx.fillRect(0, 0, this.size[0], this.size[1]);
    }

    onDrawForeground(ctx) {
        // title bar
        ctx.fillStyle = this.mouseOverTitle ? "#556677" : this.color;
        ctx.fillRect(0, 0, this.size[0], 30);

        ctx.fillStyle = "#fff";
        ctx.font = "14px Arial";
        ctx.fillText(this.title, 12, 20);

        // muted overlay
        if (this.properties.muted) {
            ctx.fillStyle = "rgba(200,0,0,0.4)";
            ctx.fillRect(0, 30, this.size[0], this.size[1] - 30);
            ctx.fillStyle = "#fcc";
            ctx.font = "bold 20px Arial";
            ctx.textAlign = "center";
            ctx.fillText("MUTED", this.size[0] / 2, this.size[1] / 2);
        }

        // outline
        ctx.strokeStyle = "#889";
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, 0.5, this.size[0] - 1, this.size[1] - 1);
    }

    // ─────── SERIALIZATION ───────
    onSerialize(o) {
        o.properties = this.properties;
        o.size = this.size;
        o.addOrder = this.addOrder;
    }

    onConfigure(o) {
        if (o.properties) {
            this.properties = o.properties;
            this.propagateMute();
        }
        if (o.size) this.size = o.size;
        if (o.addOrder !== undefined) {
            this.addOrder = o.addOrder;
            BackdropGroup.backdropCounter = Math.max(BackdropGroup.backdropCounter, o.addOrder + 1);
        }
        this.updateZOrder();
    }

    onAdded() {
        this.updateZOrder();
        this.graph.addEventListener?.("node_added", () => this.updateZOrder());
        this.graph.addEventListener?.("node_removed", () => this.updateZOrder());
    }
}

// Register
LiteGraph.registerNodeType("group/Backdrop", BackdropGroup);