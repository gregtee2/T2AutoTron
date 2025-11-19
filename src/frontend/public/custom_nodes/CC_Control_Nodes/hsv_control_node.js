class HSVControlNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.setupProperties();
        this.setupWidgets();
        this.setupInputsOutputs();
        this.setupColorOptions();
        this.bindMethods();
        this.updateSize();
        this.mouseOverBox = null;
    }

    setupProperties() {
        this.title = "HSV Control";
        this.size = [425, 420];
        this.properties = {
            hueShift: 10,
            saturation: 20,
            brightness: 128,
            transitionTime: 0,
            enableCommand: false,
            autoTriggerInterval: 5000,
            showColorOptions: true,
            lastHsvInfo: { hue: 0, saturation: 1.0, brightness: 254 },
            whiteAdjust: 4000
        };
        this.selectedColor = null;
        this.memoizedHSVToRGB = {};
        this.memoizedKelvinToHSV = {};
        this.debounceTimer = null;
        this.sliders = {};
        this.autoTriggerInterval = null;
        this.mode = LiteGraph.ALWAYS;

        this.presets = [
            { name: "Cool Blue", hue: 240, saturation: 100, brightness: 200 },
            { name: "Party Red", hue: 0, saturation: 100, brightness: 254 }
        ];
    }

    bindMethods() {
        this.onMouseDown = this.onMouseDown.bind(this);
        this.onMouseMove = this.onMouseMove.bind(this);
        this.onDrawForeground = this.onDrawForeground.bind(this);
        this.onExecute = this.onExecute.bind(this);
        this.onResize = this.onResize.bind(this);
        this.onStart = this.onStart.bind(this);
    }

    setupWidgets() {
        const slidersConfig = [
            { name: "Hue Shift", property: "hueShift", min: 0, max: 360, step: 1, tooltip: "Adjust the hue shift in degrees (0-360)." },
            { name: "Saturation", property: "saturation", min: 0, max: 100, step: 1, tooltip: "Adjust the saturation in percent (0-100)." },
            { name: "Brightness", property: "brightness", min: 0, max: 254, step: 1, tooltip: "Adjust the brightness (0-254)." }
        ];

        slidersConfig.forEach(({ name, property, min, max, step, tooltip }) => {
            const slider = this.addWidget("slider", name, this.properties[property], (value) => {
                this.properties[property] = Math.round(value);
                this.updateColorSwatch();
                this.debounceStoreAndSendHSV();
            }, { min, max, step });
            slider.tooltip = tooltip;
            this.sliders[property] = slider;
        });

        this.sliders.whiteAdjust = this.addWidget("slider", "White Adjust (K)", this.properties.whiteAdjust, (value) => {
            this.properties.whiteAdjust = Math.round(value);
            const hsv = this.kelvinToHSV(this.properties.whiteAdjust);
            this.properties.hueShift = hsv.hue;
            this.properties.saturation = hsv.saturation;
            this.sliders.hueShift.value = hsv.hue;
            this.sliders.saturation.value = hsv.saturation;
            this.properties.lastHsvInfo = {
                hue: hsv.hue / 360.0,
                saturation: hsv.saturation / 100.0,
                brightness: this.properties.brightness,
                transition: this.properties.transitionTime
            };
            this.updateColorSwatch();
            this.storeAndSendHSV();
        }, { min: 1800, max: 7500, step: 100, tooltip: "Adjust color temperature (1800K - 7500K)." });

        this.transitionSlider = this.addWidget("slider", "Transition (ms)", this.properties.transitionTime, (value) => {
            this.properties.transitionTime = Math.round(value);
            this.debounceStoreAndSendHSV();
        }, { min: 0, max: 5000, step: 100, tooltip: "Set transition time for HSV changes (0-5000 ms)." });

        const toggleWidget = this.addWidget("toggle", "Enable Auto-Trigger", this.properties.enableCommand, (value) => {
            this.properties.enableCommand = value;
            if (value) this.startAutoTrigger();
            else this.stopAutoTrigger();
        });
        toggleWidget.tooltip = "Enable to send HSV values periodically; set interval below.";

        this.intervalWidget = this.addWidget("number", "Interval (s)", this.properties.autoTriggerInterval / 1000, (value) => {
            this.properties.autoTriggerInterval = Math.max(1000, Math.min(30000, Math.round(value * 1000)));
            if (this.properties.enableCommand) {
                this.stopAutoTrigger();
                this.startAutoTrigger();
            }
        }, { min: 1, max: 30, step: 1 });
        this.intervalWidget.tooltip = "Set the auto-trigger interval in seconds (1-30).";

        this.addWidget("toggle", "Show Colors", this.properties.showColorOptions, (value) => {
            this.properties.showColorOptions = value;
            this.updateSize();
        }).tooltip = "Show or hide predefined color options.";

        this.addWidget("button", "Reset", "Reset", () => {
            this.properties.hueShift = 10;
            this.properties.saturation = 20;
            this.properties.brightness = 128;
            this.properties.transitionTime = 0;
            this.properties.whiteAdjust = 4000;
            this.sliders.hueShift.value = 10;
            this.sliders.saturation.value = 20;
            this.sliders.brightness.value = 128;
            this.sliders.whiteAdjust.value = 4000;
            this.transitionSlider.value = 0;
            this.updateColorSwatch();
            this.debounceStoreAndSendHSV();
        }).tooltip = "Reset HSV and transition to defaults (H:10, S:20, B:128, T:0, W:4000K).";

        // Add Paste HSV Settings button
        this.addWidget("button", "Paste HSV", "Paste HSV", () => this.pasteHSVSettings(), {
            tooltip: "Paste HSV settings from clipboard into sliders."
        });

        this.presets.forEach(preset => {
            this.addWidget("button", preset.name, preset.name, () => this.applyPreset(preset), {
                width: 100,
                tooltip: `Apply ${preset.name} (H:${preset.hue}, S:${preset.saturation}, B:${preset.brightness})`
            });
        });
    }

    setupInputsOutputs() {
        this.addInput("HSV In", "hsv_info");
        this.addInput("Scene HSV", "hsv_info");
        this.addOutput("HSV Info", "hsv_info");
    }

    setupColorOptions() {
        this.colorOptions = [
            { color: "#FF0000", hsv: { hue: 0, saturation: 100, brightness: 254 } },
            { color: "#FFA500", hsv: { hue: 30, saturation: 100, brightness: 254 } },
            { color: "#FFFF00", hsv: { hue: 60, saturation: 100, brightness: 254 } },
            { color: "#00FF00", hsv: { hue: 120, saturation: 100, brightness: 254 } },
            { color: "#0000FF", hsv: { hue: 240, saturation: 100, brightness: 254 } },
            { color: "#00FFFF", hsv: { hue: 180, saturation: 100, brightness: 254 } },
            { color: "#800080", hsv: { hue: 270, saturation: 100, brightness: 254 } },
            { color: "#FFFFFF", hsv: { hue: 0, saturation: 0, brightness: 254 } }
        ];
    }

    debounceStoreAndSendHSV() {
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => this.storeAndSendHSV(), 200);
    }

    storeAndSendHSV() {
        const hsvInfo = {
            hue: this.properties.hueShift / 360,
            saturation: this.properties.saturation / 100,
            brightness: this.properties.brightness,
            transition: this.properties.transitionTime
        };
        console.log("Sending HSV:", hsvInfo, "White Adjust:", this.properties.whiteAdjust);
        this.properties.lastHsvInfo = hsvInfo;
        this.setOutputData(0, hsvInfo);
    }

    updateColorSwatch() {
        const rgb = this.hsvToRgb(this.properties.hueShift / 360.0, this.properties.saturation / 100.0, this.properties.brightness / 254.0);
        this.boxcolor = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
        if (this.graph && this.graph.canvas) this.graph.canvas.draw(true, true);
    }

    hsvToRgb(h, s, v) {
        const key = `${h}-${s}-${v}`;
        if (this.memoizedHSVToRGB[key]) return this.memoizedHSVToRGB[key];

        const i = Math.floor(h * 6);
        const f = h * 6 - i;
        const p = v * (1 - s);
        const q = v * (1 - f * s);
        const t = v * (1 - (1 - f) * s);
        const mappings = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]];
        const [r, g, b] = mappings[i % 6];
        const result = [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];

        this.memoizedHSVToRGB[key] = result;
        if (Object.keys(this.memoizedHSVToRGB).length > 1000) this.memoizedHSVToRGB = {};
        return result;
    }

    kelvinToHSV(kelvin) {
        const key = `${kelvin}`;
        if (this.memoizedKelvinToHSV[key]) return this.memoizedKelvinToHSV[key];

        let r, g, b;
        kelvin = Math.max(1000, Math.min(10000, kelvin));
        const temp = kelvin / 100;
        if (temp <= 66) {
            r = 255;
            g = Math.min(255, Math.max(0, 99.4708025861 * Math.log(temp) - 161.1195681661));
            b = temp <= 19 ? 0 : Math.min(255, Math.max(0, 138.5177312231 * Math.log(temp - 10) - 305.0447927307));
        } else {
            r = Math.min(255, Math.max(0, 329.698727446 * Math.pow(temp - 60, -0.1332047592)));
            g = Math.min(255, Math.max(0, 288.1221695283 * Math.pow(temp - 60, -0.0755148492)));
            b = 255;
        }
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s;
        const d = max - min;
        s = max === 0 ? 0 : d / max;
        if (max === min) h = 0;
        else {
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        const result = {
            hue: Math.round(h * 360),
            saturation: Math.round(s * 100),
            brightness: this.properties.brightness
        };
        this.memoizedKelvinToHSV[key] = result;
        if (Object.keys(this.memoizedKelvinToHSV).length > 1000) this.memoizedKelvinToHSV = {};
        return result;
    }

    drawColorBoxes(ctx) {
        if (this.flags.collapsed || !this.properties.showColorOptions) return;

        const boxSize = 40;
        const margin = 10;
        const startX = 15;
        const startY = this.size[1] - 105;

        this.colorOptions.forEach((option, index) => {
            const x = startX + (index * (boxSize + margin));
            const y = startY;
            ctx.fillStyle = option.color;
            ctx.fillRect(x, y, boxSize, boxSize);

            if (this.mouseOverBox === index) {
                ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
                ctx.lineWidth = 2;
                ctx.strokeRect(x - 2, y - 2, boxSize + 4, boxSize + 4);
            }

            if (this.selectedColor === option.color) {
                ctx.strokeStyle = "black";
                ctx.lineWidth = 2;
                ctx.strokeRect(x, y, boxSize, boxSize);
            }
        });
    }

    onDrawForeground(ctx) {
        if (this.flags.collapsed) return;

        if (this.properties.showColorOptions) this.drawColorBoxes(ctx);

        // Draw gradient bar
        const gradientY = this.size[1] - 55;
        const gradientWidth = this.size[0] - 20;
        const gradientHeight = 20;
        const gradient = ctx.createLinearGradient(10, 0, gradientWidth + 10, 0);
        for (let i = 0; i <= 1; i += 0.1) {
            const kelvin = 1800 + i * (7500 - 1800);
            const hsv = this.kelvinToHSV(kelvin);
            const rgb = this.hsvToRgb(hsv.hue / 360.0, hsv.saturation / 100.0, hsv.brightness / 254.0);
            gradient.addColorStop(i, `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`);
        }
        ctx.fillStyle = gradient;
        ctx.fillRect(10, gradientY, gradientWidth, gradientHeight);
        ctx.strokeStyle = "#FFFFFF";
        ctx.strokeRect(10, gradientY, gradientWidth, gradientHeight);

        // Draw marker
        const kelvinRange = 7500 - 1800;
        const kelvinPos = (this.properties.whiteAdjust - 1800) / kelvinRange;
        const markerX = 10 + kelvinPos * gradientWidth;
        ctx.fillStyle = "#FFFFFF";
        ctx.beginPath();
        ctx.moveTo(markerX, gradientY - 5);
        ctx.lineTo(markerX - 5, gradientY);
        ctx.lineTo(markerX + 5, gradientY);
        ctx.fill();

        // Draw color swatch
        const swatchHeight = 20;
        const swatchY = this.size[1] - 25;
        ctx.fillStyle = this.boxcolor || 'black';
        ctx.fillRect(10, swatchY, this.size[0] - 20, swatchHeight);
        ctx.strokeStyle = this.properties.enableCommand ? "#00FF00" : "#FFFFFF";
        ctx.lineWidth = 1;
        ctx.strokeRect(10, swatchY, this.size[0] - 20, swatchHeight);

        // Draw HSV text
        ctx.fillStyle = "#FFF";
        ctx.font = "10px Arial";
        ctx.textAlign = "left";
        const hsvText = `H: ${this.properties.hueShift} S: ${this.properties.saturation} B: ${this.properties.brightness} T: ${this.properties.transitionTime} K: ${this.properties.whiteAdjust}`;
        ctx.fillText(hsvText, 15, swatchY - 5);

        ctx.font = "12px Arial";
        ctx.fillText("Current Color", 15, swatchY + 15);

        // Draw status indicator
        const statusX = this.size[0] - 15;
        const statusY = 10;
        ctx.beginPath();
        ctx.arc(statusX, statusY, 5, 0, 2 * Math.PI);
        ctx.fillStyle = this.properties.enableCommand ? "#0F0" : "#FF0";
        ctx.fill();

        // Visual feedback for Scene HSV input
        const sceneHSV = this.getInputData(1);
        if (sceneHSV) {
            ctx.fillStyle = "#FF0";
            ctx.font = "12px Arial";
            ctx.fillText("Scene Active", this.size[0] - 80, 25);
        }

        this.tooltip = `Current HSV: H${this.properties.hueShift} S${this.properties.saturation} B${this.properties.brightness} T${this.properties.transitionTime} K${this.properties.whiteAdjust}\nClick color boxes or preset buttons to set values.`;
    }

    onMouseMove(event, localPos) {
        if (this.flags.collapsed || !this.properties.showColorOptions) return;

        const boxSize = 40;
        const margin = 10;
        const startX = 10;
        const startY = this.size[1] - 130;
        let newHover = null;

        this.colorOptions.forEach((option, index) => {
            const x = startX + (index * (boxSize + margin));
            const y = startY;
            if (localPos[0] > x && localPos[0] < x + boxSize && localPos[1] > y && localPos[1] < y + boxSize) {
                newHover = index;
            }
        });

        if (newHover !== this.mouseOverBox) {
            this.mouseOverBox = newHover;
            this.setDirtyCanvas(true);
        }
    }

    onMouseDown(event, localPos, graphCanvas) {
        if (this.flags.collapsed || !this.properties.showColorOptions) return;

        const boxSize = 40;
        const margin = 10;
        const startX = 10;
        const startY = this.size[1] - 130;

        this.colorOptions.forEach((option, index) => {
            const x = startX + (index * (boxSize + margin));
            const y = startY;
            if (localPos[0] > x && localPos[0] < x + boxSize && localPos[1] > y && localPos[1] < y + boxSize) {
                this.selectedColor = option.color;
                this.setHSV(option.hsv);
            }
        });
    }

    setHSV(hsv) {
        this.properties.hueShift = Math.round(hsv.hue);
        this.properties.saturation = Math.round(hsv.saturation);
        this.properties.brightness = Math.round(hsv.brightness);
        if (this.sliders.hueShift) this.sliders.hueShift.value = this.properties.hueShift;
        if (this.sliders.saturation) this.sliders.saturation.value = this.properties.saturation;
        if (this.sliders.brightness) this.sliders.brightness.value = this.properties.brightness;
        this.setDirtyCanvas(true);
        this.updateColorSwatch();
        this.debounceStoreAndSendHSV();
    }

    applyPreset(preset) {
        this.properties.hueShift = preset.hue;
        this.properties.saturation = preset.saturation;
        this.properties.brightness = preset.brightness;
        this.sliders.hueShift.value = preset.hue;
        this.sliders.saturation.value = preset.saturation;
        this.sliders.brightness.value = preset.brightness;
        this.updateColorSwatch();
        this.debounceStoreAndSendHSV();
    }

    async pasteHSVSettings() {
        // Use IPC to read from clipboard via the main process
        try {
            if (window.api && window.api.readFromClipboard) {
                const result = await window.api.readFromClipboard();
                if (result.success) {
                    const text = result.text;
                    const hsv = JSON.parse(text);
                    if (
                        typeof hsv.hue === 'number' && hsv.hue >= 0 && hsv.hue <= 1 &&
                        typeof hsv.saturation === 'number' && hsv.saturation >= 0 && hsv.saturation <= 1 &&
                        typeof hsv.brightness === 'number' && hsv.brightness >= 0 && hsv.brightness <= 254
                    ) {
                        this.properties.hueShift = Math.round(hsv.hue * 360);
                        this.properties.saturation = Math.round(hsv.saturation * 100);
                        this.properties.brightness = Math.round(hsv.brightness);
                        this.sliders.hueShift.value = this.properties.hueShift;
                        this.sliders.saturation.value = this.properties.saturation;
                        this.sliders.brightness.value = this.properties.brightness;
                        this.updateColorSwatch();
                        this.debounceStoreAndSendHSV();
                        console.log("HSVControlNode - Pasted HSV settings:", hsv);
                        alert("HSV settings pasted successfully.");
                    } else {
                        throw new Error("Invalid HSV data format. Expected: {\"hue\":<0-1>,\"saturation\":<0-1>,\"brightness\":<0-254>}");
                    }
                } else {
                    throw new Error(result.error || 'Failed to read clipboard via IPC');
                }
            } else {
                throw new Error("Electron API not available for clipboard access");
            }
        } catch (err) {
            console.error("HSVControlNode - Failed to paste HSV settings:", err);
            const manualText = prompt("Failed to read clipboard. Please paste the HSV settings manually (e.g., {\"hue\":0.5,\"saturation\":0.8,\"brightness\":200}):", "");
            if (manualText) {
                try {
                    const hsv = JSON.parse(manualText);
                    if (
                        typeof hsv.hue === 'number' && hsv.hue >= 0 && hsv.hue <= 1 &&
                        typeof hsv.saturation === 'number' && hsv.saturation >= 0 && hsv.saturation <= 1 &&
                        typeof hsv.brightness === 'number' && hsv.brightness >= 0 && hsv.brightness <= 254
                    ) {
                        this.properties.hueShift = Math.round(hsv.hue * 360);
                        this.properties.saturation = Math.round(hsv.saturation * 100);
                        this.properties.brightness = Math.round(hsv.brightness);
                        this.sliders.hueShift.value = this.properties.hueShift;
                        this.sliders.saturation.value = this.properties.saturation;
                        this.sliders.brightness.value = this.properties.brightness;
                        this.updateColorSwatch();
                        this.debounceStoreAndSendHSV();
                        console.log("HSVControlNode - Manually pasted HSV settings:", hsv);
                        alert("HSV settings pasted successfully (manual input).");
                    } else {
                        alert("Invalid HSV data format. Expected: {\"hue\":<0-1>,\"saturation\":<0-1>,\"brightness\":<0-254>}");
                    }
                } catch (manualErr) {
                    console.error("HSVControlNode - Failed to parse manually pasted HSV settings:", manualErr);
                    alert("Failed to parse manually pasted HSV settings. Ensure the format is correct.");
                }
            } else {
                alert("No HSV settings provided. Please copy HSV settings first.");
            }
        }
    }

    onExecute() {
        const sceneHSV = this.getInputData(1); // Scene HSV is input 1
        if (sceneHSV) {
            this.setOutputData(0, sceneHSV);
        } else {
            const inputHSV = this.getInputData(0); // HSV In is input 0
            if (inputHSV) {
                console.log("Received HSV Input:", inputHSV);
                this.properties.hueShift = Math.round(inputHSV.hue * 360);
                this.properties.saturation = Math.round(inputHSV.saturation * 100);
                this.properties.brightness = Math.round(inputHSV.brightness);
                this.sliders.hueShift.value = this.properties.hueShift;
                this.sliders.saturation.value = this.properties.saturation;
                this.sliders.brightness.value = this.properties.brightness;
                this.updateColorSwatch();
            }
            if (!this.properties.enableCommand) {
                const hsvInfo = {
                    hue: this.properties.hueShift / 360,
                    saturation: this.properties.saturation / 100,
                    brightness: this.properties.brightness,
                    transition: this.properties.transitionTime
                };
                this.setOutputData(0, hsvInfo);
            }
        }
    }

    onResize() {
        const widgetHeight = this.widgets.length * LiteGraph.NODE_WIDGET_HEIGHT;
        const colorBoxHeight = this.properties.showColorOptions ? 90 : 0;
        const newHeight = Math.max(widgetHeight + colorBoxHeight + 85, 420);
        if (Math.abs(this.size[1] - newHeight) > 1) {
            this.size[1] = newHeight;
            this.size[0] = Math.max(this.size[0], 425);
            this.setDirtyCanvas(true);
        }
    }

    updateSize() {
        const widgetHeight = this.widgets.length * LiteGraph.NODE_WIDGET_HEIGHT;
        const colorBoxHeight = this.properties.showColorOptions ? 90 : 0;
        this.size[1] = Math.max(widgetHeight + colorBoxHeight + 85, 420);
        this.size[0] = Math.max(this.size[0], 425);
        this.setDirtyCanvas(true);
    }

    onStart() {
        this.updateSize();
        this.storeAndSendHSV();
    }

    startAutoTrigger() {
        if (!this.autoTriggerInterval) {
            this.autoTriggerInterval = setInterval(() => this.storeAndSendHSV(), this.properties.autoTriggerInterval);
        }
    }

    stopAutoTrigger() {
        if (this.autoTriggerInterval) {
            clearInterval(this.autoTriggerInterval);
            this.autoTriggerInterval = null;
        }
    }

    onRemoved() {
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.stopAutoTrigger();
    }

    serialize() {
        const data = super.serialize();
        data.properties = { ...this.properties };
        data.presets = this.presets;
        return data;
    }

    configure(data) {
        super.configure(data);
        this.properties = { ...this.properties, ...data.properties };
        this.presets = data.presets || this.presets;

        // Rebuild preset buttons
        this.widgets = this.widgets.filter(widget => !widget.name.includes("Cool Blue") && !widget.name.includes("Party Red"));
        this.presets.forEach(preset => {
            this.addWidget("button", preset.name, preset.name, () => this.applyPreset(preset), {
                width: 100,
                tooltip: `Apply ${preset.name} (H:${preset.hue}, S:${preset.saturation}, B:${preset.brightness})`
            });
        });

        // Restore slider values
        this.sliders.hueShift.value = this.properties.hueShift;
        this.sliders.saturation.value = this.properties.saturation;
        this.sliders.brightness.value = this.properties.brightness;
        this.sliders.whiteAdjust.value = this.properties.whiteAdjust;
        this.transitionSlider.value = this.properties.transitionTime;
        this.updateColorSwatch();
        this.storeAndSendHSV();
    }
}

LiteGraph.registerNodeType("CC_Control_Nodes/hsv_control", HSVControlNode);