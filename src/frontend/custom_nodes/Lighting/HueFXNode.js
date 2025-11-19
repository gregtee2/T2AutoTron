if (!LiteGraph.registered_node_types || !LiteGraph.registered_node_types["Lighting/HueFXNode"]) {
    class HueFXNode extends LiteGraph.LGraphNode {
        constructor() {
            super();
            this.title = "Hue FX Effect";
            this.resizable = true;
            this.bgcolor = "rgb(90, 140, 60)";

            this.properties = {
                selectedEffect: "Candle",
                speed: 1.0, // 0.1 to 10x speed
                intensity: 1.0, // 0 to 1
                baseColor: { hue: 0, saturation: 1 }, // For customizable effects
                status: "No effect selected"
            };

            this.effectDefinitions = {
                "Candle": { params: ["speed", "intensity", "baseColor"], description: "Flickering candle glow", apiCommand: "candle" },
                "Fireplace": { params: ["speed", "intensity", "baseColor"], description: "Flickering fireplace", apiCommand: "fireplace" },
                "Prism": { params: ["speed", "intensity"], description: "Multi-color loop with gradients", emulate: true },
                "Sparkle": { params: ["speed", "intensity"], description: "Twinkling lights", emulate: true },
                "Cosmos": { params: ["speed", "intensity"], description: "Starry night sky", emulate: true },
                "Underwater": { params: ["speed", "intensity"], description: "Flowing water effect", emulate: true },
                "Enchant": { params: ["speed", "intensity"], description: "Smooth color transitions", emulate: true },
                "Sunbeam": { params: ["speed", "intensity"], description: "Filtered sunlight", emulate: true },
                "Colorloop": { params: ["speed", "intensity"], description: "Simple color cycle", apiCommand: "colorloop" },
                "Scattered": { params: ["speed", "intensity"], description: "Uneven gradient colors", emulate: true }
            };

            this.setupWidgets();
            this.addOutput("FX Effect", "fx_effect"); // CHANGED: From "HSV Info", "hsv_info" to "FX Effect", "fx_effect"
            this.addInput("Trigger", "boolean");
            this.addInput("Audio Input", "audio_data"); // Future use

            this.isRunning = false;
            this.lastTrigger = null;
            this.effectState = {};
            this.lastUpdate = Date.now();

            console.log("HueFXNode - Initialized.");
        }

        setupWidgets() {
            try {
                this.addWidget(
                    "combo",
                    "Effect",
                    this.properties.selectedEffect,
                    (value) => {
                        this.properties.selectedEffect = value;
                        this.updateStatus(`Selected effect: ${value}`);
                        this.updateEffectParams();
                    },
                    { values: Object.keys(this.effectDefinitions), width: this.size[0] - 20 }
                );
                this.speedWidget = this.addWidget(
                    "number",
                    "Speed",
                    this.properties.speed,
                    (value) => { this.properties.speed = Math.max(0.1, Math.min(10, value)); },
                    { min: 0.1, max: 10, step: 0.1, width: 80 }
                );
                this.intensityWidget = this.addWidget(
                    "number",
                    "Intensity",
                    this.properties.intensity,
                    (value) => { this.properties.intensity = Math.max(0, Math.min(1, value)); },
                    { min: 0, max: 1, step: 0.01, width: 80 }
                );
                this.colorWidget = this.addWidget(
                    "color",
                    "Base Color",
                    this.rgbToHex(
                        ...this.hsvToRgb(
                            this.properties.baseColor.hue / 360,
                            this.properties.baseColor.saturation,
                            1
                        )
                    ),
                    (value) => {
                        const rgb = hexToRgb(value);
                        const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
                        this.properties.baseColor = { hue: hsv.h * 360, saturation: hsv.s };
                    },
                    { width: 80 }
                );
                this.statusWidget = this.addWidget(
                    "text",
                    "Status",
                    this.properties.status,
                    null,
                    { readonly: true, width: this.size[0] - 20 }
                );
            } catch (error) {
                console.error("HueFXNode - Error setting up widgets:", error);
                this.updateStatus(`⚠️ Error: ${error.message}`);
            }
        }

        updateEffectParams() {
            const effect = this.effectDefinitions[this.properties.selectedEffect];
            this.speedWidget.disabled = !effect.params.includes("speed");
            this.intensityWidget.disabled = !effect.params.includes("intensity");
            this.colorWidget.disabled = !effect.params.includes("baseColor");
            this.setDirtyCanvas(true);
        }

        updateStatus(newStatus) {
            this.properties.status = newStatus;
            this.statusWidget.value = newStatus;
            this.setDirtyCanvas(true);
        }

        hsvToRgb(h, s, v) {
            h = h % 1;
            const i = Math.floor(h * 6);
            const f = h * 6 - i;
            const p = v * (1 - s);
            const q = v * (1 - f * s);
            const t = v * (1 - (1 - f) * s);
            let r, g, b;
            switch (i % 6) {
                case 0: r = v; g = t; b = p; break;
                case 1: r = q; g = v; b = p; break;
                case 2: r = p; g = v; b = t; break;
                case 3: r = p; g = q; b = v; break;
                case 4: r = t; g = p; b = v; break;
                case 5: r = v; g = p; b = q; break;
            }
            return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
        }

        rgbToHex(r, g, b) {
            return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
        }

        generateEffectFrame(timestamp) {
            const effect = this.properties.selectedEffect;
            const speed = this.properties.speed;
            const intensity = this.properties.intensity;
            const baseColor = this.properties.baseColor;
            const deltaTime = (timestamp - this.lastUpdate) / 1000;
            const effectDef = this.effectDefinitions[effect];

            if (effectDef.apiCommand) {
                // Effects like Candle, Fireplace, Colorloop use API commands
                return {
                    effectCommand: effectDef.apiCommand,
                    intensity,
                    baseColor: effectDef.params.includes("baseColor") ? baseColor : null
                };
            }

            // Emulated effects generate HSV streams
            let hsv = { hue: baseColor.hue, saturation: baseColor.saturation, brightness: intensity };

            switch (effect) {
                case "Prism":
                    hsv.hue = ((timestamp / 1000) * speed) % 360;
                    hsv.saturation = 1;
                    hsv.brightness = intensity;
                    break;
                case "Sparkle":
                    if (!this.effectState.lastSparkle || deltaTime > 0.1 / speed) {
                        hsv.brightness = Math.random() > 0.5 ? intensity : 0;
                        this.effectState.lastSparkle = timestamp;
                    }
                    break;
                case "Cosmos":
                    hsv.hue = 240 + Math.sin((timestamp / 1000) * speed) * 30;
                    hsv.saturation = 0.8;
                    hsv.brightness = (Math.random() * 0.5 + 0.5) * intensity;
                    break;
                case "Underwater":
                    hsv.hue = 180 + Math.sin((timestamp / 1000) * speed) * 30;
                    hsv.saturation = 1;
                    hsv.brightness = (Math.sin((timestamp / 1000) * speed * 2) * 0.3 + 0.7) * intensity;
                    break;
                case "Enchant":
                    hsv.hue = ((timestamp / 1000) * speed * 0.5) % 360;
                    hsv.saturation = 0.7;
                    hsv.brightness = intensity;
                    break;
                case "Sunbeam":
                    hsv.hue = 30 + Math.sin((timestamp / 1000) * speed) * 20;
                    hsv.saturation = 0.9;
                    hsv.brightness = (Math.sin((timestamp / 1000) * speed * 1.5) * 0.2 + 0.8) * intensity;
                    break;
                case "Scattered":
                    hsv.hue = ((timestamp / 1000) * speed + Math.random() * 60) % 360;
                    hsv.saturation = 1;
                    hsv.brightness = intensity;
                    break;
            }

            this.effectState.lastHSV = hsv;
            return hsv;
        }

        onExecute() {
            const trigger = this.getInputData(0);
            if (trigger !== undefined && trigger !== this.lastTrigger) {
                this.isRunning = trigger;
                this.updateStatus(trigger ? `Running ${this.properties.selectedEffect}` : "Effect stopped");
                this.lastTrigger = trigger;
                this.effectState = {};
            }

            if (!this.isRunning) {
                this.setOutputData(0, null);
                return;
            }

            const now = Date.now();
            const effectData = this.generateEffectFrame(now);
            this.setOutputData(0, effectData);
            this.lastUpdate = now;
            this.setDirtyCanvas(true);
        }

        onDrawBackground(ctx) {
            ctx.fillStyle = "rgba(90, 140, 60, 0.9)";
            ctx.fillRect(0, 0, this.size[0], this.size[1]);
        }
    }

    LiteGraph.registerNodeType("Lighting/HueFXNode", HueFXNode);
    console.log("HueFXNode - Registered successfully under 'Lighting' category.");
}