if (!LiteGraph.registered_node_types["Animation/SplineHSVTime"]) {

    class SplineHSVTimeNode extends LiteGraph.LGraphNode {
        constructor() {
            super();
            this.title = "Spline HSV Time";
            this.size = []; // Will be set in onAdded
            this.properties = {
                timeScale: "seconds",
                duration: 60,
                showH: true,
                showS: true,
                showV: true,
                anchorPoints: [
                    { time: 0, hsv: { h: 0, s: 0, v: 0 }, id: `point-0` },
                    { time: 1, hsv: { h: 0, s: 0, v: 0 }, id: `point-1` }
                ],
                debug: true,
                clickRadius: 20
            };

            // Initialize critical properties early
            this.widgets = [];
            this.curveEditorHeight = 250;
            this.widgetHeight = 0;

            this.setupWidgets(); // Call before addInput/addOutput

            this.addInput("Start", "boolean");
            this.addOutput("HSV Out", "hsv_info");

            this.startTime = null;
            this.isPlaying = false;
            this.currentTime = 0;
            this.selectedPoint = null;
            this.dragging = false;
            this.draggingComponent = null;
            this.nextPointId = 2;
            this.canvasOffset = [0, 0];

            this.bindMethods();

            if (this.properties.debug) {
                console.log(`Constructor: Initial size set to ${this.size}`);
                console.log(`Constructor: widgetHeight=${this.widgetHeight}`);
            }
        }

        bindMethods() {
            this.onMouseDown = this.onMouseDown.bind(this);
            this.onMouseMove = this.onMouseMove.bind(this);
            this.onMouseUp = this.onMouseUp.bind(this);
            this.onDblClick = this.onDblClick.bind(this);
            this.onKeyDown = this.onKeyDown.bind(this);
            this.onExecute = this.onExecute.bind(this);
            this.drawForeground = this.drawForeground.bind(this);
            this.globalToLocal = this.globalToLocal.bind(this);
            this.catmullRom = this.catmullRom.bind(this);
            this.interpolateHSV = this.interpolateHSV.bind(this);
            this.onNodeCreated = this.onNodeCreated.bind(this);
            this.onDrawBackground = this.onDrawBackground.bind(this);
            this.onAdded = this.onAdded.bind(this);
            this.onConfigure = this.onConfigure.bind(this);
            this.computeSize = this.computeSize.bind(this);
        }

        setupWidgets() {
            this.widgets = [];
            this.addWidget("combo", "Time Scale", this.properties.timeScale, (value) => {
                this.properties.timeScale = value;
            }, { values: ["seconds", "minutes", "hours"], width: 300 });
            this.addWidget("number", "Duration", this.properties.duration, (value) => {
                this.properties.duration = Math.max(1, value);
            }, { min: 1, step: 1, width: 300 });
            this.addWidget("toggle", "Show H Curve", this.properties.showH, (value) => {
                this.properties.showH = value;
                this.redraw();
            }, { width: 300 });
            this.addWidget("toggle", "Show S Curve", this.properties.showS, (value) => {
                this.properties.showS = value;
                this.redraw();
            }, { width: 300 });
            this.addWidget("toggle", "Show V Curve", this.properties.showV, (value) => {
                this.properties.showV = value;
                this.redraw();
            }, { width: 300 });
            this.addWidget("toggle", "Debug", this.properties.debug, (value) => {
                this.properties.debug = value;
            }, { width: 300 });
            this.addWidget("number", "Click Radius", this.properties.clickRadius, (value) => {
                this.properties.clickRadius = Math.max(5, value);
            }, { min: 5, step: 1, width: 300 });

            this.widgetHeight = this.widgets.length * LiteGraph.NODE_WIDGET_HEIGHT;
            this.size[1] = this.widgets.length * LiteGraph.NODE_WIDGET_HEIGHT + this.curveEditorHeight + 50;

            if (this.properties.debug) {
                console.log(`setupWidgets: Size after widget setup: ${this.size}`);
                console.log(`setupWidgets: widgetHeight=${this.widgetHeight}`);
            }
        }

        computeSize() {
            const height = this.widgets.length * LiteGraph.NODE_WIDGET_HEIGHT + this.curveEditorHeight + 50;
            const size = [1200, height];
            if (this.properties.debug) {
                console.log(`computeSize: Enforcing size=${size}`);
            }
            return size;
        }

        onAdded() {
            this.size = [1200, 450];
            this.setDirtyCanvas(true);
            if (this.properties.debug) {
                console.log(`onAdded: Size set to ${this.size}`);
            }
        }

        onConfigure(info) {
            this.properties = Object.assign(this.properties, info.properties);
            this.size = [1200, 450];
            this.setupWidgets();
            this.redraw();
            if (this.properties.debug) {
                console.log(`onConfigure: Size set to ${this.size}`);
            }
        }

        onNodeCreated() {
            this.editorElement = document.createElement("div");
            this.editorElement.id = `spline-hsv-editor-${Math.random().toString(36).substr(2, 9)}`;
            this.editorElement.style.width = `${this.size[0]}px`;
            this.editorElement.style.height = `${this.curveEditorHeight}px`;
            this.editorElement.style.background = "#222";
            this.editorElement.style.position = "relative";

            this.canvas = document.createElement("canvas");
            this.canvas.width = this.size[0]; // Pixel width
            this.canvas.height = this.curveEditorHeight; // Pixel height
            // Set CSS dimensions to ensure the canvas is visible and sized
            this.canvas.style.width = `${this.size[0]}px`;
            this.canvas.style.height = `${this.curveEditorHeight}px`;
            this.editorElement.appendChild(this.canvas);

            if (this.canvas) {
                this.canvas.addEventListener("mousedown", this.onMouseDown);
                this.canvas.addEventListener("mousemove", this.onMouseMove);
                this.canvas.addEventListener("mouseup", this.onMouseUp);
                this.canvas.addEventListener("dblclick", this.onDblClick);
                this.canvas.addEventListener("keydown", this.onKeyDown);
                this.canvas.tabIndex = 0;
                const rect = this.canvas.getBoundingClientRect();
                this.canvasOffset = [rect.left, rect.top];
                if (this.properties.debug) {
                    console.log(`onNodeCreated: Canvas offset cached at ${this.canvasOffset}`);
                    console.log(`onNodeCreated: Graph=${!!this.graph}, Canvas=${!!this.graph?.canvas}, ConvertEvent=${!!this.graph?.canvas?.convertEventToCanvasOffset}, DS=${!!this.graph?.canvas?.ds}`);
                    console.log(`onNodeCreated: Canvas DOM size: width=${rect.width}px, height=${rect.height}px`);
                }
            } else if (this.properties.debug) {
                console.warn("onNodeCreated: Canvas creation failed");
            }

            this.redraw();
        }

        onDrawBackground(ctx) {
            if (this.editorElement && this.canvas) {
                ctx.drawImage(this.canvas, 0, this.widgetHeight, this.size[0], this.curveEditorHeight);
            }
        }

        redraw() {
            if (!this.canvas) return;
            const ctx = this.canvas.getContext("2d");
            this.drawForeground(ctx);
            this.setDirtyCanvas(true);
        }

        globalToLocal(x, y) {
            const pos = this.pos || [0, 0];
            const ds = this.graph && this.graph.canvas && this.graph.canvas.ds
                ? this.graph.canvas.ds
                : { offset: [0, 0], scale: 1 };

            const editorX = 60; // Left margin of the editor canvas within the node
            const titleBarHeight = 26; // Typical LiteGraph node title height

            if (!this.graph || !this.graph.canvas || !this.graph.canvas.ds) {
                if (this.properties.debug) {
                    console.warn("globalToLocal: Graph canvas unavailable, using fallback");
                }
            }

            // Align coordinates with the editor's canvas within the node
            const localX = (x - pos[0] - editorX) / ds.scale; // Reintroduce pos[0] subtraction
            const localY = (y - pos[1] - this.widgetHeight - titleBarHeight) / ds.scale;

            if (this.properties.debug) {
                console.log(`globalToLocal: x=${x}, y=${y}, pos=[${pos[0]},${pos[1]}], canvasOffset=[${this.canvasOffset[0]},${this.canvasOffset[1]}], widgetHeight=${this.widgetHeight}, titleBarHeight=${titleBarHeight}, scale=${ds.scale}, editorX=${editorX}, localPos=[${localX.toFixed(0)},${localY.toFixed(0)}]`);
            }

            return [localX, localY];
        }

        getPointAtTime(t) {
            const points = this.properties.anchorPoints;
            if (!points || points.length < 2) return { h: 0, s: 0, v: 0 };
            return this.interpolateHSV(t);
        }

        onDblClick(event) {
            if (!this.canvas || !this.graph) return;

            const rect = this.canvas.getBoundingClientRect();
            this.canvasOffset = [rect.left, rect.top];
            let canvasX = event.clientX - rect.left;
            let canvasY = event.clientY - rect.top;

            if (this.graph.canvas && this.graph.canvas.convertEventToCanvasOffset) {
                const canvasPos = this.graph.canvas.convertEventToCanvasOffset(event);
                canvasX = canvasPos[0];
                canvasY = canvasPos[1];
                if (this.properties.debug) console.log(`onDblClick: Converted to canvas coordinates: x=${canvasX.toFixed(0)}, y=${canvasY.toFixed(0)}`);
            } else {
                canvasX = event.clientX - this.canvasOffset[0];
                canvasY = event.clientY - this.canvasOffset[1];
                if (this.properties.debug) console.log(`onDblClick: Using cached DOM coordinates: x=${canvasX.toFixed(0)}, y=${canvasY.toFixed(0)}`);
            }

            const ds = this.graph.canvas && this.graph.canvas.ds
                ? this.graph.canvas.ds
                : { offset: [0, 0], scale: 1 };
            const adjustedX = canvasX / ds.scale;
            const adjustedY = canvasY / ds.scale;
            const localPos = this.globalToLocal(adjustedX, adjustedY);

            const editorX = 60;
            const editorWidth = this.size[0] - 120;
            const editorY = 0;
            const editorHeight = this.curveEditorHeight;

            if (
                localPos[0] >= editorX &&
                localPos[0] <= editorX + editorWidth &&
                localPos[1] >= editorY &&
                localPos[1] <= editorY + editorHeight
            ) {
                const time = (localPos[0] - editorX) / editorWidth;
                const hsv = this.getPointAtTime(time);
                const newPoint = {
                    time,
                    hsv,
                    id: `point-${this.nextPointId++}`
                };
                this.properties.anchorPoints.push(newPoint);
                this.properties.anchorPoints.sort((a, b) => a.time - b.time);
                this.redraw();
                if (this.properties.debug) console.log(`Added anchor point ${newPoint.id} at time=${time.toFixed(2)}`);
            }
        }

        onKeyDown(event) {
            if (event.key === "Delete" && this.selectedPoint) {
                const index = this.properties.anchorPoints.findIndex(p => p.id === this.selectedPoint.id);
                if (index !== -1 && this.properties.anchorPoints.length > 2) {
                    this.properties.anchorPoints.splice(index, 1);
                    this.selectedPoint = null;
                    this.dragging = false;
                    this.draggingComponent = null;
                    this.redraw();
                    if (this.properties.debug) console.log(`Deleted anchor point ${index}`);
                }
            }
        }

        findClosestSegment(localX, localY, component) {
            const points = this.properties.anchorPoints;
            const editorX = 60;
            const editorWidth = this.size[0] - 120;
            const editorY = 0;
            const editorHeight = this.curveEditorHeight;
            let minDistance = Infinity;
            let closestSegment = null;

            for (let i = 0; i < points.length - 1; i++) {
                const p0 = points[i];
                const p1 = points[i + 1];
                const x0 = editorX + p0.time * editorWidth;
                const x1 = editorX + p1.time * editorWidth;
                const y0 = editorY + (1 - p0.hsv[component]) * editorHeight;
                const y1 = editorY + (1 - p1.hsv[component]) * editorHeight;

                const dx = x1 - x0;
                const dy = y1 - y0;
                const len = Math.sqrt(dx * dx + dy * dy);
                if (len === 0) continue;

                const t = Math.max(0, Math.min(1, ((localX - x0) * dx + (localY - y0) * dy) / (len * len)));
                const projX = x0 + t * dx;
                const projY = y0 + t * dy;
                const distance = Math.sqrt(Math.pow(localX - projX, 2) + Math.pow(localY - projY, 2));

                if (distance < minDistance && distance < this.properties.clickRadius) {
                    minDistance = distance;
                    closestSegment = { index: i, time: p0.time + t * (p1.time - p0.time) };
                }
            }
            return closestSegment;
        }

        onMouseDown(event) {
            if (!this.canvas || !this.graph) {
                if (this.properties.debug) console.warn("onMouseDown: Canvas or graph unavailable");
                return false;
            }

            // Store the event for processing in drawForeground
            this.pendingMouseEvent = event;
            this.setDirtyCanvas(true, true); // Trigger redraw

            return true; // Prevent immediate event propagation
        }

        drawForeground(ctx) {
            const editorX = 60;
            const editorWidth = this.size[0] - 120;
            const editorY = 0;
            const editorHeight = this.curveEditorHeight;

            if (this.properties.debug) {
                console.log(`drawForeground: Node size at draw: width=${this.size[0]}, height=${this.size[1]}`);
                console.log(`drawForeground: Editor width=${editorWidth}, height=${editorHeight}`);
            }

            ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

            ctx.fillStyle = "white";
            ctx.font = "14px Arial";
            ctx.textAlign = "right";
            ctx.fillText("1", editorX - 10, editorY + 14);
            ctx.fillText("0.5", editorX - 10, editorY + editorHeight / 2 + 5);
            ctx.fillText("0", editorX - 10, editorY + editorHeight);

            ctx.fillStyle = "#222";
            ctx.fillRect(editorX, editorY, editorWidth, editorHeight);
            ctx.strokeStyle = "#666";
            ctx.strokeRect(editorX, editorY, editorWidth, editorHeight);

            // Process pending mouse event
            if (this.pendingMouseEvent) {
                const event = this.pendingMouseEvent;
                this.pendingMouseEvent = null;

                const rect = this.canvas.getBoundingClientRect();
                this.canvasOffset = [rect.left, rect.top];
                let canvasX = event.clientX - rect.left;
                let canvasY = event.clientY - rect.top;

                if (this.graph.canvas && this.graph.canvas.convertEventToCanvasOffset) {
                    const canvasPos = this.graph.canvas.convertEventToCanvasOffset(event);
                    canvasX = canvasPos[0];
                    canvasY = canvasPos[1];
                    if (this.properties.debug) console.log(`drawForeground: Converted to canvas coordinates: x=${canvasX.toFixed(0)}, y=${canvasY.toFixed(0)}`);
                } else {
                    canvasX = event.clientX - this.canvasOffset[0];
                    canvasY = event.clientY - this.canvasOffset[1];
                    if (this.properties.debug) console.log(`drawForeground: Using cached DOM coordinates: x=${canvasX.toFixed(0)}, y=${canvasY.toFixed(0)}`);
                }

                if (this.properties.debug) {
                    console.log(`drawForeground: Canvas bounding rect: left=${rect.left}, top=${rect.top}, width=${rect.width}, height=${rect.height}`);
                }

                const ds = this.graph.canvas && this.graph.canvas.ds
                    ? this.graph.canvas.ds
                    : { offset: [0, 0], scale: 1 };
                const adjustedX = canvasX / ds.scale;
                const adjustedY = canvasY / ds.scale;
                const localPos = this.globalToLocal(adjustedX, adjustedY);

                if (this.properties.debug) {
                    console.log(`Mouse down at canvas pos=${canvasX.toFixed(0)},${canvasY.toFixed(0)}, adjusted pos=${adjustedX.toFixed(0)},${adjustedY.toFixed(0)}, local pos=${localPos[0].toFixed(0)},${localPos[1].toFixed(0)}`);
                    console.log(`Editor bounds: x=${editorX} to ${editorX + editorWidth}, y=${editorY} to ${editorY + editorHeight}`);
                    console.log(`Node position: x=${this.pos ? this.pos[0] : 'unknown'}, y=${this.pos ? this.pos[1] : 'unknown'}, scale=${ds.scale}`);
                    console.log(`Node size at mouse down: width=${this.size[0]}, height=${this.size[1]}`);
                    console.log("Anchor points:", this.properties.anchorPoints.map(p => `id=${p.id}, time=${p.time.toFixed(3)}`));
                    this.lastClickPos = [localPos[0], localPos[1]];
                }

                if (
                    localPos[0] >= editorX &&
                    localPos[0] <= editorX + editorWidth &&
                    localPos[1] >= editorY &&
                    localPos[1] <= editorY + editorHeight
                ) {
                    const x = (localPos[0] - editorX) / editorWidth;
                    const y = 1 - (localPos[1] - editorY) / editorHeight;
                    const clickRadius = this.properties.clickRadius / ds.scale;

                    if (event.button === 0) {
                        this.selectedPoint = null;
                        this.draggingComponent = null;

                        for (const point of this.properties.anchorPoints) {
                            const pointX = editorX + point.time * editorWidth;

                            if (this.properties.showH) {
                                const pointYH = editorY + (1 - point.hsv.h) * editorHeight;
                                const distanceH = Math.sqrt(
                                    Math.pow(localPos[0] - pointX, 2) +
                                    Math.pow(localPos[1] - pointYH, 2)
                                );
                                if (this.properties.debug) {
                                    console.log(`H anchor ${point.id}: x=${pointX.toFixed(0)}, y=${pointYH.toFixed(0)}, distance=${distanceH.toFixed(2)}, radius=${clickRadius.toFixed(2)}`);
                                }
                                if (distanceH < clickRadius) {
                                    this.selectedPoint = point;
                                    this.draggingComponent = "h";
                                    this.dragging = true;
                                    if (this.properties.debug) console.log(`Selected H anchor point ${point.id}`);
                                    return true;
                                }
                            }

                            if (this.properties.showS) {
                                const pointYS = editorY + (1 - point.hsv.s) * editorHeight;
                                const distanceS = Math.sqrt(
                                    Math.pow(localPos[0] - pointX, 2) +
                                    Math.pow(localPos[1] - pointYS, 2)
                                );
                                if (this.properties.debug) {
                                    console.log(`S anchor ${point.id}: x=${pointX.toFixed(0)}, y=${pointYS.toFixed(0)}, distance=${distanceS.toFixed(2)}, radius=${clickRadius.toFixed(2)}`);
                                }
                                if (distanceS < clickRadius) {
                                    this.selectedPoint = point;
                                    this.draggingComponent = "s";
                                    this.dragging = true;
                                    if (this.properties.debug) console.log(`Selected S anchor point ${point.id}`);
                                    return true;
                                }
                            }

                            if (this.properties.showV) {
                                const pointYV = editorY + (1 - point.hsv.v) * editorHeight;
                                const distanceV = Math.sqrt(
                                    Math.pow(localPos[0] - pointX, 2) +
                                    Math.pow(localPos[1] - pointYV, 2)
                                );
                                if (this.properties.debug) {
                                    console.log(`V anchor ${point.id}: x=${pointX.toFixed(0)}, y=${pointYV.toFixed(0)}, distance=${distanceV.toFixed(2)}, radius=${clickRadius.toFixed(2)}`);
                                }
                                if (distanceV < clickRadius) {
                                    this.selectedPoint = point;
                                    this.draggingComponent = "v";
                                    this.dragging = true;
                                    if (this.properties.debug) console.log(`Selected V anchor point ${point.id}`);
                                    return true;
                                }
                            }
                        }

                        const components = [];
                        if (this.properties.showH) components.push("h");
                        if (this.properties.showS) components.push("s");
                        if (this.properties.showV) components.push("v");

                        for (const comp of components) {
                            const segment = this.findClosestSegment(localPos[0], localPos[1], comp);
                            if (segment) {
                                const hsv = this.getPointAtTime(segment.time);
                                const newPoint = {
                                    time: segment.time,
                                    hsv,
                                    id: `point-${this.nextPointId++}`
                                };
                                this.properties.anchorPoints.push(newPoint);
                                this.properties.anchorPoints.sort((a, b) => a.time - b.time);
                                this.redraw();
                                if (this.properties.debug) console.log(`Inserted anchor point ${newPoint.id} at time=${segment.time.toFixed(2)} on ${comp} curve`);
                                return true;
                            }
                        }

                        let canvasX = event.clientX - rect.left;
                        let canvasY = event.clientY - rect.top;

                        if (this.graph && this.graph.canvas && this.graph.canvas.convertEventToCanvasOffset) {
                            const canvasPos = this.graph.canvas.convertEventToCanvasOffset(event);
                            canvasX = canvasPos[0];
                            canvasY = canvasPos[1];
                            if (this.properties.debug) console.log(`onMouseMove: Converted to canvas coordinates: x=${canvasX.toFixed(0)}, y=${canvasY.toFixed(0)}`);
                        } else {
                            canvasX = event.clientX - this.canvasOffset[0];
                            canvasY = event.clientY - this.canvasOffset[1];
                            if (this.properties.debug) console.log(`onMouseMove: Using cached DOM coordinates: x=${canvasX.toFixed(0)}, y=${canvasY.toFixed(0)}`);
                        }

                        const ds = this.graph && this.graph.canvas && this.graph.canvas.ds
                            ? this.graph.canvas.ds
                            : { offset: [0, 0], scale: 1 };
                        const adjustedX = canvasX / ds.scale;
                        const adjustedY = canvasY / ds.scale;
                        const localPos = this.globalToLocal(adjustedX, adjustedY);

                        const editorX = 60;
                        const editorWidth = this.size[0] - 120;
                        const editorY = 0;
                        const editorHeight = this.curveEditorHeight;

                        const x = (localPos[0] - editorX) / editorWidth;
                        const y = 1 - (localPos[1] - editorY) / editorHeight;

                        const clampedX = Math.max(0, Math.min(1, x));
                        const clampedY = Math.max(0, Math.min(1, y));

                        this.selectedPoint.time = clampedX;
                        if (this.draggingComponent === "h") {
                            this.selectedPoint.hsv.h = clampedY;
                        } else if (this.draggingComponent === "s") {
                            this.selectedPoint.hsv.s = clampedY;
                        } else if (this.draggingComponent === "v") {
                            this.selectedPoint.hsv.v = clampedY;
                        }
                        this.properties.anchorPoints.sort((a, b) => a.time - b.time);
                        this.redraw();
                        if (this.properties.debug) {
                            console.log(`Moved ${this.draggingComponent} anchor point ${this.selectedPoint.id} to time=${clampedX.toFixed(2)}, value=${clampedY.toFixed(2)}`);
                        }
                    }

                    onMouseUp(event) {
                        if (this.dragging && this.properties.debug) {
                            console.log(`Mouse up: Stopped dragging ${this.draggingComponent} anchor point ${this.selectedPoint ? this.selectedPoint.id : 'none'}`);
                        }
                        this.dragging = false;
                        this.selectedPoint = null;
                        this.draggingComponent = null;
                        this.redraw();
                    }

                    catmullRom(t, p0, p1, p2, p3) {
                        const t2 = t * t;
                        const t3 = t2 * t;
                        return 0.5 * (
                            (2 * p1) +
                            (-p0 + p2) * t +
                            (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
                            (-p0 + 3 * p1 - 3 * p2 + p3) * t3
                        );
                    }

                    interpolateHSV(t) {
                        const points = this.properties.anchorPoints;
                        if (!points || points.length === 0) {
                            if (this.properties.debug) console.warn("interpolateHSV: No anchor points");
                            return { h: 0, s: 0, v: 0 };
                        }
                        if (points.length === 1) return points[0].hsv;

                        let i = 0;
                        while (i < points.length - 1 && t > points[i + 1].time) {
                            i++;
                        }

                        if (i === points.length - 1) return points[points.length - 1].hsv;

                        const p0 = i > 0 ? points[i - 1].hsv : points[0].hsv;
                        const p1 = points[i].hsv;
                        const p2 = points[i + 1].hsv;
                        const p3 = i + 2 < points.length ? points[i + 2].hsv : points[i + 1].hsv;

                        const t0 = points[i].time;
                        const t1 = points[i + 1].time;
                        const localT = (t - t0) / (t1 - t0);

                        const h = this.catmullRom(localT, p0.h, p1.h, p2.h, p3.h);
                        const s = this.catmullRom(localT, p0.s, p1.s, p2.s, p3.s);
                        const v = this.catmullRom(localT, p0.v, p1.v, p2.v, p3.v);

                        return {
                            h: Math.max(0, Math.min(1, h)),
                            s: Math.max(0, Math.min(1, s)),
                            v: Math.max(0, Math.min(1, v))
                        };
                    }

                    onExecute() {
                        const startInput = this.getInputData(0);

                        if (startInput === true && !this.isPlaying) {
                            this.startTime = Date.now();
                            this.isPlaying = true;
                            if (this.properties.debug) console.log("Timeline started");
                        } else if (startInput === false && this.isPlaying) {
                            this.isPlaying = false;
                            this.currentTime = 0;
                            if (this.properties.debug) console.log("Timeline stopped");
                        }

                        if (this.isPlaying) {
                            const elapsed = (Date.now() - this.startTime) / 1000;
                            let durationInSeconds = this.properties.duration;
                            if (this.properties.timeScale === "minutes") {
                                durationInSeconds *= 60;
                            } else if (this.properties.timeScale === "hours") {
                                durationInSeconds *= 3600;
                            }

                            this.currentTime = elapsed / durationInSeconds;
                            if (this.currentTime >= 1) {
                                this.currentTime = 1;
                                this.isPlaying = false;
                                if (this.properties.debug) console.log("Timeline finished");
                            }

                            const hsv = this.interpolateHSV(this.currentTime);
                            this.setOutputData(0, hsv);
                            this.redraw();
                        }
                    }

                    drawForeground(ctx) {
                        const editorX = 60;
                        const editorWidth = this.size[0] - 120;
                        const editorY = 0;
                        const editorHeight = this.curveEditorHeight;

                        if (this.properties.debug) {
                            console.log(`drawForeground: Node size at draw: width=${this.size[0]}, height=${this.size[1]}`);
                            console.log(`drawForeground: Editor width=${editorWidth}, height=${editorHeight}`);
                        }

                        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

                        ctx.fillStyle = "white";
                        ctx.font = "14px Arial";
                        ctx.textAlign = "right";
                        ctx.fillText("1", editorX - 10, editorY + 14);
                        ctx.fillText("0.5", editorX - 10, editorY + editorHeight / 2 + 5);
                        ctx.fillText("0", editorX - 10, editorY + editorHeight);

                        ctx.fillStyle = "#222";
                        ctx.fillRect(editorX, editorY, editorWidth, editorHeight);
                        ctx.strokeStyle = "#666";
                        ctx.strokeRect(editorX, editorY, editorWidth, editorHeight);

                        let durationInUnits = this.properties.duration;
                        let unitLabel = "s";
                        if (this.properties.timeScale === "minutes") {
                            durationInUnits = this.properties.duration;
                            unitLabel = "m";
                        } else if (this.properties.timeScale === "hours") {
                            durationInUnits = this.properties.duration;
                            unitLabel = "h";
                        }

                        const numMarks = Math.min(10, durationInUnits);
                        const markInterval = durationInUnits / numMarks;
                        ctx.fillStyle = "white";
                        ctx.textAlign = "center";
                        for (let i = 0; i <= numMarks; i++) {
                            const time = i * markInterval;
                            const x = editorX + (i / numMarks) * editorWidth;
                            ctx.fillText(`${Math.round(time)}${unitLabel}`, x, editorY + editorHeight + 20);
                            ctx.beginPath();
                            ctx.moveTo(x, editorY + editorHeight);
                            ctx.lineTo(x, editorY + editorHeight + 8);
                            ctx.strokeStyle = "white";
                            ctx.stroke();
                        }

                        const points = this.properties.anchorPoints;
                        if (!points || points.length < 2) {
                            if (this.properties.debug) console.warn("drawForeground: Need at least 2 anchor points");
                            return;
                        }

                        const steps = 100;
                        const stepSize = 1 / steps;

                        if (this.properties.showH) {
                            ctx.beginPath();
                            ctx.strokeStyle = "red";
                            for (let i = 0; i <= steps; i++) {
                                const t = i * stepSize;
                                const hsv = this.interpolateHSV(t);
                                const x = editorX + t * editorWidth;
                                const y = editorY + (1 - hsv.h) * editorHeight;
                                if (i === 0) ctx.moveTo(x, y);
                                else ctx.lineTo(x, y);
                            }
                            ctx.stroke();
                        }

                        if (this.properties.showS) {
                            ctx.beginPath();
                            ctx.strokeStyle = "green";
                            for (let i = 0; i <= steps; i++) {
                                const t = i * stepSize;
                                const hsv = this.interpolateHSV(t);
                                const x = editorX + t * editorWidth;
                                const y = editorY + (1 - hsv.s) * editorHeight;
                                if (i === 0) ctx.moveTo(x, y);
                                else ctx.lineTo(x, y);
                            }
                            ctx.stroke();
                        }

                        if (this.properties.showV) {
                            ctx.beginPath();
                            ctx.strokeStyle = "blue";
                            for (let i = 0; i <= steps; i++) {
                                const t = i * stepSize;
                                const hsv = this.interpolateHSV(t);
                                const x = editorX + t * editorWidth;
                                const y = editorY + (1 - hsv.v) * editorHeight;
                                if (i === 0) ctx.moveTo(x, y);
                                else ctx.lineTo(x, y);
                            }
                            ctx.stroke();
                        }

                        for (let i = 0; i < points.length - 1; i++) {
                            const p0 = points[i];
                            const p1 = points[i + 1];
                            const x0 = editorX + p0.time * editorWidth;
                            const x1 = editorX + p1.time * editorWidth;

                            if (this.properties.showH) {
                                const y0 = editorY + (1 - p0.hsv.h) * editorHeight;
                                const y1 = editorY + (1 - p1.hsv.h) * editorHeight;
                                ctx.beginPath();
                                ctx.moveTo(x0, y0);
                                ctx.lineTo(x1, y1);
                                ctx.strokeStyle = "rgba(255, 0, 0, 0.3)";
                                ctx.stroke();
                            }

                            if (this.properties.showS) {
                                const y0 = editorY + (1 - p0.hsv.s) * editorHeight;
                                const y1 = editorY + (1 - p1.hsv.s) * editorHeight;
                                ctx.beginPath();
                                ctx.moveTo(x0, y0);
                                ctx.lineTo(x1, y1);
                                ctx.strokeStyle = "rgba(0, 255, 0, 0.3)";
                                ctx.stroke();
                            }

                            if (this.properties.showV) {
                                const y0 = editorY + (1 - p0.hsv.v) * editorHeight;
                                const y1 = editorY + (1 - p1.hsv.v) * editorHeight;
                                ctx.beginPath();
                                ctx.moveTo(x0, y0);
                                ctx.lineTo(x1, y1);
                                ctx.strokeStyle = "rgba(0, 0, 255, 0.3)";
                                ctx.stroke();
                            }
                        }

                        const ds = this.graph && this.graph.canvas && this.graph.canvas.ds
                            ? this.graph.canvas.ds
                            : { offset: [0, 0], scale: 1 };
                        const clickRadius = this.properties.clickRadius / ds.scale;

                        for (const point of points) {
                            const x = editorX + point.time * editorWidth;
                            const yH = editorY + (1 - point.hsv.h) * editorHeight;
                            const yS = editorY + (1 - point.hsv.s) * editorHeight;
                            const yV = editorY + (1 - point.hsv.v) * editorHeight;
                            const isSelected = this.selectedPoint && this.selectedPoint.id === point.id;

                            if (this.properties.showH) {
                                ctx.fillStyle = isSelected && this.draggingComponent === "h" ? "yellow" : "red";
                                ctx.beginPath();
                                ctx.arc(x, yH, isSelected && this.draggingComponent === "h" ? 8 : 6, 0, Math.PI * 2);
                                ctx.fill();
                                if (this.properties.debug) {
                                    ctx.beginPath();
                                    ctx.arc(x, yH, clickRadius, 0, Math.PI * 2);
                                    ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
                                    ctx.stroke();
                                }
                            }

                            if (this.properties.showS) {
                                ctx.fillStyle = isSelected && this.draggingComponent === "s" ? "yellow" : "green";
                                ctx.beginPath();
                                ctx.arc(x, yS, isSelected && this.draggingComponent === "s" ? 8 : 6, 0, Math.PI * 2);
                                ctx.fill();
                                if (this.properties.debug) {
                                    ctx.beginPath();
                                    ctx.arc(x, yS, clickRadius, 0, Math.PI * 2);
                                    ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
                                    ctx.stroke();
                                }
                            }

                            if (this.properties.showV) {
                                ctx.fillStyle = isSelected && this.draggingComponent === "v" ? "yellow" : "blue";
                                ctx.beginPath();
                                ctx.arc(x, yV, isSelected && this.draggingComponent === "v" ? 8 : 6, 0, Math.PI * 2);
                                ctx.fill();
                                if (this.properties.debug) {
                                    ctx.beginPath();
                                    ctx.arc(x, yV, clickRadius, 0, Math.PI * 2);
                                    ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
                                    ctx.stroke();
                                }
                            }
                        }

                        if (this.isPlaying) {
                            const x = editorX + this.currentTime * editorWidth;
                            ctx.strokeStyle = "white";
                            ctx.beginPath();
                            ctx.moveTo(x, editorY);
                            ctx.lineTo(x, editorY + editorHeight);
                            ctx.stroke();
                        }

                        if (this.properties.debug && this.lastClickPos) {
                            ctx.beginPath();
                            ctx.arc(this.lastClickPos[0], this.lastClickPos[1], 8, 0, Math.PI * 2);
                            ctx.fillStyle = "cyan";
                            ctx.fill();
                        }

                        if (this.properties.debug) {
                            ctx.beginPath();
                            ctx.moveTo(editorX, editorY + 10);
                            ctx.lineTo(editorX + editorWidth, editorY + 10);
                            ctx.strokeStyle = "yellow";
                            ctx.stroke();
                            ctx.fillStyle = "yellow";
                            ctx.font = "14px Arial";
                            ctx.fillText(`Editor Width: ${editorWidth}px`, editorX + editorWidth / 2, editorY + 25);
                        }
                    }

                    serialize() {
                        const data = super.serialize();
                        data.properties = { ...this.properties };
                        data.nextPointId = this.nextPointId;
                        data.canvasOffset = this.canvasOffset;
                        return data;
                    }

                    configure(data) {
                        super.configure(data);
                        if (data.properties) {
                            this.properties = { ...this.properties, ...data.properties };
                            this.properties.anchorPoints = data.properties.anchorPoints || this.properties.anchorPoints;
                        }
                        this.nextPointId = data.nextPointId || this.nextPointId;
                        this.canvasOffset = data.canvasOffset || this.canvasOffset;
                        this.onConfigure(data);
                    }
                }

                LiteGraph.registerNodeType("Animation/SplineHSVTime", SplineHSVTimeNode);
                console.log("SplineHSVTimeNode - Registered successfully.");
            }