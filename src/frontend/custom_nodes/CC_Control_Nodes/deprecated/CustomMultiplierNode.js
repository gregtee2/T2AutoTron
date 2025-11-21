class CustomMultiplierNode {
    constructor() {
        this.addInput("HSV Info", "hsv_info");
        this.addOutput("HSV Info", "hsv_info");
        this.addOutput("LUT", "lut_data");

        // Define properties for each luminance level and multiplier
        this.addProperty("lum255_red_multiplier", 1.0, "number");
        this.addProperty("lum255_green_multiplier", 1.0, "number");
        this.addProperty("lum255_blue_multiplier", 1.0, "number");

        this.addProperty("lum190_red_multiplier", 1.0, "number");
        this.addProperty("lum190_green_multiplier", 1.0, "number");
        this.addProperty("lum190_blue_multiplier", 1.0, "number");

        this.addProperty("lum160_red_multiplier", 1.0, "number");
        this.addProperty("lum160_green_multiplier", 1.0, "number");
        this.addProperty("lum160_blue_multiplier", 1.0, "number");

        this.addProperty("lum128_red_multiplier", 1.0, "number");
        this.addProperty("lum128_green_multiplier", 1.0, "number");
        this.addProperty("lum128_blue_multiplier", 1.0, "number");

        this.addProperty("lum96_red_multiplier", 1.0, "number");
        this.addProperty("lum96_green_multiplier", 1.0, "number");
        this.addProperty("lum96_blue_multiplier", 1.0, "number");

        this.addProperty("lum64_red_multiplier", 1.0, "number");
        this.addProperty("lum64_green_multiplier", 1.0, "number");
        this.addProperty("lum64_blue_multiplier", 1.0, "number");

        this.addProperty("lum32_red_multiplier", 1.0, "number");
        this.addProperty("lum32_green_multiplier", 1.0, "number");
        this.addProperty("lum32_blue_multiplier", 1.0, "number");

        this.addProperty("lum0_red_multiplier", 1.0, "number");
        this.addProperty("lum0_green_multiplier", 1.0, "number");
        this.addProperty("lum0_blue_multiplier", 1.0, "number");

        // Add sliders and sync them with the properties
        this.addWidgets();

        // Initialize LUT after widgets
        this.lut = this.generateLUT();
    }

    // Method to add widgets and initialize with property values
    addWidgets() {
        this.widgets = []; // Clear existing widgets before adding
        this.addWidget("slider", "Lum 255 Red", this.properties.lum255_red_multiplier, (value) => {
            this.properties.lum255_red_multiplier = value;
        }, { min: 0, max: 2 }).value = this.properties.lum255_red_multiplier;

        this.addWidget("slider", "Lum 255 Green", this.properties.lum255_green_multiplier, (value) => {
            this.properties.lum255_green_multiplier = value;
        }, { min: 0, max: 2 }).value = this.properties.lum255_green_multiplier;

        this.addWidget("slider", "Lum 255 Blue", this.properties.lum255_blue_multiplier, (value) => {
            this.properties.lum255_blue_multiplier = value;
        }, { min: 0, max: 2 }).value = this.properties.lum255_blue_multiplier;

        this.addWidget("slider", "Lum 190 Red", this.properties.lum190_red_multiplier, (value) => {
            this.properties.lum190_red_multiplier = value;
        }, { min: 0, max: 2 }).value = this.properties.lum190_red_multiplier;

        this.addWidget("slider", "Lum 190 Green", this.properties.lum190_green_multiplier, (value) => {
            this.properties.lum190_green_multiplier = value;
        }, { min: 0, max: 2 }).value = this.properties.lum190_green_multiplier;

        this.addWidget("slider", "Lum 190 Blue", this.properties.lum190_blue_multiplier, (value) => {
            this.properties.lum190_blue_multiplier = value;
        }, { min: 0, max: 2 }).value = this.properties.lum190_blue_multiplier;

        this.addWidget("slider", "Lum 160 Red", this.properties.lum160_red_multiplier, (value) => {
            this.properties.lum160_red_multiplier = value;
        }, { min: 0, max: 2 }).value = this.properties.lum160_red_multiplier;

        this.addWidget("slider", "Lum 160 Green", this.properties.lum160_green_multiplier, (value) => {
            this.properties.lum160_green_multiplier = value;
        }, { min: 0, max: 2 }).value = this.properties.lum160_green_multiplier;

        this.addWidget("slider", "Lum 160 Blue", this.properties.lum160_blue_multiplier, (value) => {
            this.properties.lum160_blue_multiplier = value;
        }, { min: 0, max: 2 }).value = this.properties.lum160_blue_multiplier;

        this.addWidget("slider", "Lum 128 Red", this.properties.lum128_red_multiplier, (value) => {
            this.properties.lum128_red_multiplier = value;
        }, { min: 0, max: 2 }).value = this.properties.lum128_red_multiplier;

        this.addWidget("slider", "Lum 128 Green", this.properties.lum128_green_multiplier, (value) => {
            this.properties.lum128_green_multiplier = value;
        }, { min: 0, max: 2 }).value = this.properties.lum128_green_multiplier;

        this.addWidget("slider", "Lum 128 Blue", this.properties.lum128_blue_multiplier, (value) => {
            this.properties.lum128_blue_multiplier = value;
        }, { min: 0, max: 2 }).value = this.properties.lum128_blue_multiplier;

        this.addWidget("slider", "Lum 96 Red", this.properties.lum96_red_multiplier, (value) => {
            this.properties.lum96_red_multiplier = value;
        }, { min: 0, max: 2 }).value = this.properties.lum96_red_multiplier;

        this.addWidget("slider", "Lum 96 Green", this.properties.lum96_green_multiplier, (value) => {
            this.properties.lum96_green_multiplier = value;
        }, { min: 0, max: 2 }).value = this.properties.lum96_green_multiplier;

        this.addWidget("slider", "Lum 96 Blue", this.properties.lum96_blue_multiplier, (value) => {
            this.properties.lum96_blue_multiplier = value;
        }, { min: 0, max: 2 }).value = this.properties.lum96_blue_multiplier;

        this.addWidget("slider", "Lum 64 Red", this.properties.lum64_red_multiplier, (value) => {
            this.properties.lum64_red_multiplier = value;
        }, { min: 0, max: 2 }).value = this.properties.lum64_red_multiplier;

        this.addWidget("slider", "Lum 64 Green", this.properties.lum64_green_multiplier, (value) => {
            this.properties.lum64_green_multiplier = value;
        }, { min: 0, max: 2 }).value = this.properties.lum64_green_multiplier;

        this.addWidget("slider", "Lum 64 Blue", this.properties.lum64_blue_multiplier, (value) => {
            this.properties.lum64_blue_multiplier = value;
        }, { min: 0, max: 2 }).value = this.properties.lum64_blue_multiplier;

        this.addWidget("slider", "Lum 32 Red", this.properties.lum32_red_multiplier, (value) => {
            this.properties.lum32_red_multiplier = value;
        }, { min: 0, max: 2 }).value = this.properties.lum32_red_multiplier;

        this.addWidget("slider", "Lum 32 Green", this.properties.lum32_green_multiplier, (value) => {
            this.properties.lum32_green_multiplier = value;
        }, { min: 0, max: 2 }).value = this.properties.lum32_green_multiplier;

        this.addWidget("slider", "Lum 32 Blue", this.properties.lum32_blue_multiplier, (value) => {
            this.properties.lum32_blue_multiplier = value;
        }, { min: 0, max: 2 }).value = this.properties.lum32_blue_multiplier;

        this.addWidget("slider", "Lum 0 Red", this.properties.lum0_red_multiplier, (value) => {
            this.properties.lum0_red_multiplier = value;
        }, { min: 0, max: 2 }).value = this.properties.lum0_red_multiplier;

        this.addWidget("slider", "Lum 0 Green", this.properties.lum0_green_multiplier, (value) => {
            this.properties.lum0_green_multiplier = value;
        }, { min: 0, max: 2 }).value = this.properties.lum0_green_multiplier;

        this.addWidget("slider", "Lum 0 Blue", this.properties.lum0_blue_multiplier, (value) => {
            this.properties.lum0_blue_multiplier = value;
        }, { min: 0, max: 2 }).value = this.properties.lum0_blue_multiplier;
    }

    // Serialization: Save node properties (including slider values)
    onSerialize(o) {
        o.properties = { ...this.properties };  // Ensure all custom properties are saved
    }

    // Deserialization: Restore node properties and sync widget values
    onDeserialize(o) {
        if (o.properties) {
            this.properties = { ...o.properties };

            // Update the widget values without recreating them
            if (this.widgets.length > 0) {
                this.widgets.forEach(widget => {
                    switch (widget.name) {
                        case "Lum 255 Red":
                            widget.value = this.properties.lum255_red_multiplier;
                            break;
                        case "Lum 255 Green":
                            widget.value = this.properties.lum255_green_multiplier;
                            break;
                        case "Lum 255 Blue":
                            widget.value = this.properties.lum255_blue_multiplier;
                            break;
                        case "Lum 190 Red":
                            widget.value = this.properties.lum190_red_multiplier;
                            break;
                        case "Lum 190 Green":
                            widget.value = this.properties.lum190_green_multiplier;
                            break;
                        case "Lum 190 Blue":
                            widget.value = this.properties.lum190_blue_multiplier;
                            break;
                        case "Lum 160 Red":
                            widget.value = this.properties.lum160_red_multiplier;
                            break;
                        case "Lum 160 Green":
                            widget.value = this.properties.lum160_green_multiplier;
                            break;
                        case "Lum 160 Blue":
                            widget.value = this.properties.lum160_blue_multiplier;
                            break;
                        case "Lum 128 Red":
                            widget.value = this.properties.lum128_red_multiplier;
                            break;
                        case "Lum 128 Green":
                            widget.value = this.properties.lum128_green_multiplier;
                            break;
                        case "Lum 128 Blue":
                            widget.value = this.properties.lum128_blue_multiplier;
                            break;
                        case "Lum 96 Red":
                            widget.value = this.properties.lum96_red_multiplier;
                            break;
                        case "Lum 96 Green":
                            widget.value = this.properties.lum96_green_multiplier;
                            break;
                        case "Lum 96 Blue":
                            widget.value = this.properties.lum96_blue_multiplier;
                            break;
                        case "Lum 64 Red":
                            widget.value = this.properties.lum64_red_multiplier;
                            break;
                        case "Lum 64 Green":
                            widget.value = this.properties.lum64_green_multiplier;
                            break;
                        case "Lum 64 Blue":
                            widget.value = this.properties.lum64_blue_multiplier;
                            break;
                        case "Lum 32 Red":
                            widget.value = this.properties.lum32_red_multiplier;
                            break;
                        case "Lum 32 Green":
                            widget.value = this.properties.lum32_green_multiplier;
                            break;
                        case "Lum 32 Blue":
                            widget.value = this.properties.lum32_blue_multiplier;
                            break;
                        case "Lum 0 Red":
                            widget.value = this.properties.lum0_red_multiplier;
                            break;
                        case "Lum 0 Green":
                            widget.value = this.properties.lum0_green_multiplier;
                            break;
                        case "Lum 0 Blue":
                            widget.value = this.properties.lum0_blue_multiplier;
                            break;
                    }
                });
            }
        }
    }

    generateLUT() {
        const lut = {
            red: {},
            green: {},
            blue: {}
        };

        // Define points with the new multiplier values
        const points = [
            { input: 255, redMultiplier: this.properties.lum255_red_multiplier, greenMultiplier: this.properties.lum255_green_multiplier, blueMultiplier: this.properties.lum255_blue_multiplier },
            { input: 190, redMultiplier: this.properties.lum190_red_multiplier, greenMultiplier: this.properties.lum190_green_multiplier, blueMultiplier: this.properties.lum190_blue_multiplier },
            { input: 160, redMultiplier: this.properties.lum160_red_multiplier, greenMultiplier: this.properties.lum160_green_multiplier, blueMultiplier: this.properties.lum160_blue_multiplier },
            { input: 128, redMultiplier: this.properties.lum128_red_multiplier, greenMultiplier: this.properties.lum128_green_multiplier, blueMultiplier: this.properties.lum128_blue_multiplier },
            { input: 96, redMultiplier: this.properties.lum96_red_multiplier, greenMultiplier: this.properties.lum96_green_multiplier, blueMultiplier: this.properties.lum96_blue_multiplier },
            { input: 64, redMultiplier: this.properties.lum64_red_multiplier, greenMultiplier: this.properties.lum64_green_multiplier, blueMultiplier: this.properties.lum64_blue_multiplier },
            { input: 32, redMultiplier: this.properties.lum32_red_multiplier, greenMultiplier: this.properties.lum32_green_multiplier, blueMultiplier: this.properties.lum32_blue_multiplier },
            { input: 0, redMultiplier: this.properties.lum0_red_multiplier, greenMultiplier: this.properties.lum0_green_multiplier, blueMultiplier: this.properties.lum0_blue_multiplier }
        ];

        const interpolate = (start, end, t) => start + t * (end - start);

        for (let i = 0; i <= 255; i++) {
            let lowerPoint = points[0];
            let upperPoint = points[points.length - 1];

            // Find the correct interval for interpolation
            for (let j = 0; j < points.length - 1; j++) {
                if (i >= points[j].input && i <= points[j + 1].input) {
                    lowerPoint = points[j];
                    upperPoint = points[j + 1];
                    break;
                }
            }

            const t = (i - lowerPoint.input) / (upperPoint.input - lowerPoint.input);

            lut.red[i] = interpolate(lowerPoint.redMultiplier, upperPoint.redMultiplier, t);
            lut.green[i] = interpolate(lowerPoint.greenMultiplier, upperPoint.greenMultiplier, t);
            lut.blue[i] = interpolate(lowerPoint.blueMultiplier, upperPoint.blueMultiplier, t);
        }

        return lut;
    }

  onExecute() {
        const inputHSV = this.getInputData(0);  // Expecting HSV input from the color node
        if (!inputHSV) return;

        // Ensure the HSV input is in the correct format
        const { hue, saturation, brightness } = inputHSV;

        let rgb = this.hsvToRgb(hue, saturation, brightness / 255);

        // Select the correct luminance multipliers based on brightness
        let redMultiplier, greenMultiplier, blueMultiplier;

        if (brightness >= 255) {
            redMultiplier = this.properties.lum255_red_multiplier;
            greenMultiplier = this.properties.lum255_green_multiplier;
            blueMultiplier = this.properties.lum255_blue_multiplier;
        } else if (brightness >= 192) {
            redMultiplier = this.properties.lum192_red_multiplier;
            greenMultiplier = this.properties.lum192_green_multiplier;
            blueMultiplier = this.properties.lum192_blue_multiplier;
        } else if (brightness >= 160) {
            redMultiplier = this.properties.lum160_red_multiplier;
            greenMultiplier = this.properties.lum160_green_multiplier;
            blueMultiplier = this.properties.lum160_blue_multiplier;
        } else if (brightness >= 128) {
            redMultiplier = this.properties.lum128_red_multiplier;
            greenMultiplier = this.properties.lum128_green_multiplier;
            blueMultiplier = this.properties.lum128_blue_multiplier;
        } else if (brightness >= 96) {
            redMultiplier = this.properties.lum96_red_multiplier;
            greenMultiplier = this.properties.lum96_green_multiplier;
            blueMultiplier = this.properties.lum96_blue_multiplier;
        } else if (brightness >= 64) {
            redMultiplier = this.properties.lum64_red_multiplier;
            greenMultiplier = this.properties.lum64_green_multiplier;
            blueMultiplier = this.properties.lum64_blue_multiplier;
        } else if (brightness >= 32) {
            redMultiplier = this.properties.lum32_red_multiplier;
            greenMultiplier = this.properties.lum32_green_multiplier;
            blueMultiplier = this.properties.lum32_blue_multiplier;
        } else {
            redMultiplier = this.properties.lum0_red_multiplier;
            greenMultiplier = this.properties.lum0_green_multiplier;
            blueMultiplier = this.properties.lum0_blue_multiplier;
        }

        // Apply the multipliers to RGB values
        rgb[0] = Math.min(255, rgb[0] * redMultiplier);
        rgb[1] = Math.min(255, rgb[1] * greenMultiplier);
        rgb[2] = Math.min(255, rgb[2] * blueMultiplier);

        // Convert back to HSV
        const outputHSV = this.rgbToHsv(rgb[0], rgb[1], rgb[2]);

        // Output the modified HSV values
        this.setOutputData(0, {
            hue: outputHSV.hue,
            saturation: outputHSV.saturation,
            brightness: outputHSV.brightness * 255
        });

        // Now generate and output the LUT based on current multipliers
        const lut = this.generateLUT();
        this.setOutputData(1, lut);  // Output the LUT data on a second output
    }

    // Function to generate the LUT (Lookup Table)
    generateLUT() {
        const lut = {
            red: {}, green: {}, blue: {}
        };

        // Points with luminance levels and their respective multipliers
        const points = [
            { input: 255, redMultiplier: this.properties.lum255_red_multiplier, greenMultiplier: this.properties.lum255_green_multiplier, blueMultiplier: this.properties.lum255_blue_multiplier },
            { input: 192, redMultiplier: this.properties.lum192_red_multiplier, greenMultiplier: this.properties.lum192_green_multiplier, blueMultiplier: this.properties.lum192_blue_multiplier },
            { input: 160, redMultiplier: this.properties.lum160_red_multiplier, greenMultiplier: this.properties.lum160_green_multiplier, blueMultiplier: this.properties.lum160_blue_multiplier },
            { input: 128, redMultiplier: this.properties.lum128_red_multiplier, greenMultiplier: this.properties.lum128_green_multiplier, blueMultiplier: this.properties.lum128_blue_multiplier },
            { input: 96, redMultiplier: this.properties.lum96_red_multiplier, greenMultiplier: this.properties.lum96_green_multiplier, blueMultiplier: this.properties.lum96_blue_multiplier },
            { input: 64, redMultiplier: this.properties.lum64_red_multiplier, greenMultiplier: this.properties.lum64_green_multiplier, blueMultiplier: this.properties.lum64_blue_multiplier },
            { input: 32, redMultiplier: this.properties.lum32_red_multiplier, greenMultiplier: this.properties.lum32_green_multiplier, blueMultiplier: this.properties.lum32_blue_multiplier },
            { input: 0, redMultiplier: this.properties.lum0_red_multiplier, greenMultiplier: this.properties.lum0_green_multiplier, blueMultiplier: this.properties.lum0_blue_multiplier }
        ];

        const interpolate = (start, end, t) => start + t * (end - start);

        for (let i = 0; i <= 255; i++) {
            let lowerPoint = points[0];
            let upperPoint = points[points.length - 1];

            // Find the correct interval for interpolation
            for (let j = 0; j < points.length - 1; j++) {
                if (i >= points[j].input && i <= points[j + 1].input) {
                    lowerPoint = points[j];
                    upperPoint = points[j + 1];
                    break;
                }
            }

            const t = (i - lowerPoint.input) / (upperPoint.input - lowerPoint.input);

            lut.red[i] = interpolate(lowerPoint.redMultiplier, upperPoint.redMultiplier, t);
            lut.green[i] = interpolate(lowerPoint.greenMultiplier, upperPoint.greenMultiplier, t);
            lut.blue[i] = interpolate(lowerPoint.blueMultiplier, upperPoint.blueMultiplier, t);
        }

        return lut;
    }

    // Convert HSV to RGB
    hsvToRgb(h, s, v) {
        let r, g, b;
        const i = Math.floor(h * 6);
        const f = h * 6 - i;
        const p = v * (1 - s);
        const q = v * (1 - f * s);
        const t = v * (1 - (1 - f) * s);

        switch (i % 6) {
            case 0: r = v, g = t, b = p; break;
            case 1: r = q, g = v, b = p; break;
            case 2: r = p, g = v, b = t; break;
            case 3: r = p, g = q, b = v; break;
            case 4: r = t, g = p, b = v; break;
            case 5: r = v, g = p, b = q; break;
        }

        return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    }

    // Convert RGB to HSV
    rgbToHsv(r, g, b) {
        r /= 255;
        g /= 255;
        b /= 255;
        let max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, v = max;
        let d = max - min;
        s = max === 0 ? 0 : d / max;

        if (max === min) {
            h = 0;
        } else {
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }

        return { hue: h, saturation: s, brightness: v };
    }
}

// Register the node type with LiteGraph
LiteGraph.registerNodeType("Lighting/CC_Control_Nodes/CustomMultiplierNode", CustomMultiplierNode);
