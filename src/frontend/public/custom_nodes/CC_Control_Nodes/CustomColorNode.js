class CustomColorNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Custom Color Control";
        this.size = [552, 514];
        this.properties = {
            red: 128,
            green: 128,
            blue: 128,
            colorTemp: 4150, // Default CT value
            hue: 0.5,        // Default hue value (middle of the color wheel)
            saturation: 0,
            brightness: 128, // Default brightness
            lastColorTemp: 4150,
            virtualRed: 128,
            virtualGreen: 128,
            virtualBlue: 128
        };

        // Binding methods
        this.updateLuminanceFromRGB = this.updateLuminanceFromRGB.bind(this);
        this.updateHSVFromRGB = this.updateHSVFromRGB.bind(this);
        this.updateRGBSliders = this.updateRGBSliders.bind(this);
        this.resetSliders = this.resetSliders.bind(this);
        this.adjustRGBFromLuminance = this.adjustRGBFromLuminance.bind(this);
        this.adjustColorTempOffset = this.adjustColorTempOffset.bind(this);
        this.adjustHueRotation = this.adjustHueRotation.bind(this);

        // Sliders
        this.redSlider = this.addWidget("slider", "Red", this.properties.red, (value) => {
            this.properties.red = value;
            this.properties.virtualRed = value;
            this.updateLuminanceFromRGB();
            this.updateHSVFromRGB();
            this.updateLinkedSliders();
            this.updateColor();
        }, { min: 0, max: 255 });

        this.addSpacer();

        this.greenSlider = this.addWidget("slider", "Green", this.properties.green, (value) => {
            this.properties.green = value;
            this.properties.virtualGreen = value;
            this.updateLuminanceFromRGB();
            this.updateHSVFromRGB();
            this.updateLinkedSliders();
            this.updateColor();
        }, { min: 0, max: 255 });

        this.addSpacer();

        this.blueSlider = this.addWidget("slider", "Blue", this.properties.blue, (value) => {
            this.properties.blue = value;
            this.properties.virtualBlue = value;
            this.updateLuminanceFromRGB();
            this.updateHSVFromRGB();
            this.updateLinkedSliders();
            this.updateColor();
        }, { min: 0, max: 255 });

        this.addSpacer();

        // Color Temp, Hue, and Luminance Sliders
        this.colorTempSlider = this.addWidget("slider", "Color Temp", this.properties.colorTemp, (value) => {
            this.properties.colorTemp = value;
            this.adjustColorTempOffset(value);
            this.updateColor();
        }, { min: 1800, max: 6500 });

        this.addSpacer();

        this.hueSlider = this.addWidget("slider", "Hue", this.properties.hue, (value) => {
            this.properties.hue = value;
            this.adjustHueRotation(value);
            this.updateColor();
        }, { min: 0, max: 1, step: 0.01 });

        this.addSpacer();

        this.luminanceSlider = this.addWidget("slider", "Luminance", this.properties.brightness, (value) => {
            this.adjustRGBFromLuminance(value);
            this.updateHSVFromRGB();
            this.updateColor();
            this.updateRGBSliders();
        }, { min: 0, max: 255 });


        // Add a widget to display the current RGB and Luminance values
        this.rgbDisplay = this.addWidget("text", "RGB & Luminance", "R: 128, G: 128, B: 128, L: 128", null);

        this.addSpacer();

        this.addWidget("button", "Reset", null, this.resetSliders);

        this.addOutput("HSV Info", "hsv_info");

        this.updateColor(true);
    

        this.lastLogTime = 0;
        this.logInterval = 1000;
    }

    addSpacer() {
        this.widgets.push({ type: "null", name: "", value: null });
    }

    logThrottled(message) {
        const now = Date.now();
        if (now - this.lastLogTime > this.logInterval) {
            console.log(message);
            this.lastLogTime = now;
        }
    }

    updateLuminanceFromRGB() {
        const avgRGB = (this.properties.red + this.properties.green + this.properties.blue) / 3;
        this.properties.brightness = avgRGB;
        this.updateLuminanceWidget();
    }

    updateHSVFromRGB() {
        // Convert RGB to HSV to update Hue, Saturation, and Brightness
        const { hue, saturation, brightness } = this.rgbToHsv(this.properties.red, this.properties.green, this.properties.blue);
        this.properties.hue = hue;
        this.properties.saturation = saturation;
        this.properties.brightness = brightness * 255; // Update the brightness in HSV

        // Update the Hue and CT sliders to reflect the RGB values
        this.colorTempSlider.value = this.properties.colorTemp;
        this.hueSlider.value = this.properties.hue;
    }

    /*adjustColorTempOffset(tempValue) {
        // Calculate the red and blue target based on the CT value
        const redTarget = this.interpolate(tempValue, 1800, 6500, 255, 0);
        const blueTarget = this.interpolate(tempValue, 1800, 6500, 0, 255);

        // Instead of scaling, offset the virtual values
        const redOffset = redTarget - this.properties.virtualRed;
        const blueOffset = blueTarget - this.properties.virtualBlue;

        this.properties.virtualRed += redOffset * 0.3; // Apply the offset incrementally
        this.properties.virtualBlue += blueOffset * 0.3;

        // Update the actual RGB properties based on the adjusted virtual values
        this.properties.red = Math.min(255, Math.max(0, this.properties.virtualRed));
        this.properties.blue = Math.min(255, Math.max(0, this.properties.virtualBlue));

        // Store the last known CT value
        this.properties.lastColorTemp = tempValue;

        // Ensure Luminance remains independent of CT adjustments
        this.updateRGBSliders();
        this.updateLuminanceFromRGB(); // This should be brightness-only
        this.updateHSVFromRGB();
        this.updateColor();
    }*/


       //this version works great overall, best so far.  
    /*adjustColorTempOffset(tempValue) {
        // Calculate a proportional offset based on the color temp slider value
        const ctOffset = (tempValue - this.properties.lastColorTemp) / (6500 - 1800); // Normalize CT to [0,1]
        
        // Adjust red and blue with consistent offsets
        const redOffset = -ctOffset * 255; // Red decreases as CT increases
        const blueOffset = ctOffset * 255; // Blue increases as CT increases
        
        // Apply the offsets to the current red and blue values
        this.properties.red = Math.min(255, Math.max(0, this.properties.red + redOffset));
        this.properties.blue = Math.min(255, Math.max(0, this.properties.blue + blueOffset));

        // Store the last known CT value to calculate the next offset relative to the current one
        this.properties.lastColorTemp = tempValue;

        // Ensure the luminance remains consistent after the adjustment
        this.updateRGBSliders();
        this.updateLuminanceFromRGB();
        this.updateHSVFromRGB();
        this.updateColor();
    }*/


    adjustRGBFromLuminance(luminance) {
        // Check for valid virtual or actual RGB values
        const baseRed = this.properties.virtualRed ?? this.properties.red;
        const baseGreen = this.properties.virtualGreen ?? this.properties.green;
        const baseBlue = this.properties.virtualBlue ?? this.properties.blue;

        // Calculate the current brightness (average of RGB values)
        const currentBrightness = (baseRed + baseGreen + baseBlue) / 3;

        // Calculate the difference between target luminance and current brightness
        const brightnessDiff = luminance - currentBrightness;

        // Adjust RGB values based on the brightness difference
        this.properties.virtualRed = Math.min(255, Math.max(0, baseRed + brightnessDiff));
        this.properties.virtualGreen = Math.min(255, Math.max(0, baseGreen + brightnessDiff));
        this.properties.virtualBlue = Math.min(255, Math.max(0, baseBlue + brightnessDiff));

        // Update the actual RGB properties
        this.properties.red = this.properties.virtualRed;
        this.properties.green = this.properties.virtualGreen;
        this.properties.blue = this.properties.virtualBlue;

        // Update brightness property
        this.properties.brightness = luminance;

        // Refresh the UI
        this.updateRGBSliders();
        this.updateLuminanceWidget();
        this.updateHSVFromRGB();
    }

    adjustColorTempOffset(tempValue) {
        // Calculate target red and blue based on the color temperature slider value
        const redTarget = this.interpolate(tempValue, 1800, 6500, 255, 0);
        const blueTarget = this.interpolate(tempValue, 1800, 6500, 0, 255);

        // Offset red and blue without snapping
        const redOffset = redTarget - this.properties.virtualRed;
        const blueOffset = blueTarget - this.properties.virtualBlue;

        this.properties.virtualRed += redOffset * 0.3;
        this.properties.virtualBlue += blueOffset * 0.3;

        // Update the actual RGB properties
        this.properties.red = Math.min(255, Math.max(0, this.properties.virtualRed));
        this.properties.blue = Math.min(255, Math.max(0, this.properties.virtualBlue));

        // Ensure luminance remains unchanged when adjusting color temperature
        this.updateRGBSliders();
        this.updateHSVFromRGB();
        this.updateColor();
    }










    adjustHueRotation(hueValue) {
        // Get the current saturation and brightness (luminance) from the RGB values
        let { hue, saturation, brightness } = this.rgbToHsv(
            this.properties.red,
            this.properties.green,
            this.properties.blue
        );
        
        // Update hue but leave brightness (luminance) unchanged
        hue = hueValue;  // Rotate the hue without changing brightness

        // Convert the adjusted HSV values back to RGB, maintaining the same brightness
        const [newRed, newGreen, newBlue] = this.hsvToRgb(hue, saturation, brightness);

        // Update the RGB properties with the new hue-adjusted values
        this.properties.virtualRed = newRed;
        this.properties.virtualGreen = newGreen;
        this.properties.virtualBlue = newBlue;

        // Apply the changes to the actual RGB sliders
        this.properties.red = Math.min(255, Math.max(0, newRed));
        this.properties.green = Math.min(255, Math.max(0, newGreen));
        this.properties.blue = Math.min(255, Math.max(0, newBlue));

        this.properties.lastHue = hueValue;

        // Update the sliders visually
        this.updateRGBSliders();
        this.updateColor();
    }

    // Luminance adjustment logic remains unchanged, and hue won't affect it:
    adjustRGBFromLuminance(luminance) {
        const currentBrightness = (this.properties.virtualRed + this.properties.virtualGreen + this.properties.virtualBlue) / 3;
        const diff = luminance - currentBrightness;

        // Adjust the virtual RGB values based on luminance changes
        this.properties.virtualRed += diff;
        this.properties.virtualGreen += diff;
        this.properties.virtualBlue += diff;

        // Update the RGB sliders without affecting hue or saturation
        this.properties.red = Math.min(255, Math.max(0, this.properties.virtualRed));
        this.properties.green = Math.min(255, Math.max(0, this.properties.virtualGreen));
        this.properties.blue = Math.min(255, Math.max(0, this.properties.virtualBlue));

        this.properties.brightness = luminance; // Update brightness property

        this.updateLuminanceWidget();
        this.updateRGBSliders();
    }


    updateLinkedSliders() {
        this.colorTempSlider.value = this.properties.lastColorTemp;

        const { hue } = this.rgbToHsv(this.properties.red, this.properties.green, this.properties.blue);
        this.hueSlider.value = hue;
    }

    interpolate(value, minVal, maxVal, start, end) {
        return start + ((value - minVal) / (maxVal - minVal)) * (end - start);
    }

    // Function to update the color and the RGB/Luminance display
    updateColor(initial = false) {
        const hsv = {
            hue: this.properties.hue,
            saturation: this.properties.saturation,
            brightness: this.properties.brightness
        };

        const rgb = this.hsvToRgb(hsv.hue, hsv.saturation, hsv.brightness / 255);

        if (!initial) {
            this.setOutputData(0, hsv);
        }

        // Update the RGB & Luminance display
        this.rgbDisplay.value = `R: ${Math.round(this.properties.red)}, G: ${Math.round(this.properties.green)}, B: ${Math.round(this.properties.blue)}, L: ${Math.round(this.properties.brightness)}`;

        if (rgb && rgb.length === 3) {
            this.boxcolor = this.rgbToHex(rgb[0], rgb[1], rgb[2]);
        } else {
            console.error("Error in HSV to RGB conversion:", rgb);
            this.boxcolor = '#808080';
        }

        if (this.graph && this.graph.canvas) {
            this.graph.canvas.draw(true, true);
        }
    }

    updateLuminanceWidget() {
        const luminanceWidget = this.widgets.find(widget => widget.name === "Luminance");
        if (luminanceWidget) {
            luminanceWidget.value = this.properties.brightness;
        }
    }

    updateRGBSliders() {
        if (this.redSlider) this.redSlider.value = this.properties.red;
        if (this.greenSlider) this.greenSlider.value = this.properties.green;
        if (this.blueSlider) this.blueSlider.value = this.properties.blue;
    }

    resetSliders() {
        this.properties.red = 128;
        this.properties.green = 128;
        this.properties.blue = 128;

        // Reset virtual values as well
        this.properties.virtualRed = 128;
        this.properties.virtualGreen = 128;
        this.properties.virtualBlue = 128;

        this.properties.colorTemp = 4150;
        this.properties.hue = 0.5;
        this.properties.saturation = 0;
        this.properties.brightness = 128;
        this.properties.lastColorTemp = 4150;

        this.updateRGBSliders();
        this.updateColor();
        this.updateLuminanceWidget();

        this.colorTempSlider.value = this.properties.colorTemp;
        this.hueSlider.value = this.properties.hue;
    }

    rgbToHsv(r, g, b) {
        r /= 255;
        g /= 255;
        b /= 255;
        let max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, v = max;
        let d = max - min;
        s = max === 0 ? 0 : d / max;
        if (max === min) {
            h = 0; // achromatic
        } else {
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4.25; break;
            }
            h /= 6;
        }
        return { hue: h, saturation: s, brightness: v };
    }

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

    rgbToHex(r, g, b) {
        const toHex = (n) => Math.round(n).toString(16).padStart(2, '0').toUpperCase();
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }

    onDrawForeground(ctx) {
        const swatchHeight = 60;
        ctx.fillStyle = this.boxcolor || 'gray';
        ctx.fillRect(10, this.size[1] - swatchHeight - 10, this.size[0] - 20, swatchHeight);
    }

    onExecute() {
        this.updateColor();
    }

    onResize() {
        this.size = [552, 515];
    }
}

// Register the node type with LiteGraph
LiteGraph.registerNodeType("Lighting/CC_Control_Nodes/CustomColorNode", CustomColorNode);















/*
//Code to plot the curve

class CustomColorControl extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Custom Color Control";
        this.size = [400, 300];
        this.properties = {
            red: 255,
            green: 255,
            blue: 255,
            brightness: 255,
            redOffset: 0,
            greenOffset: 0,
            blueOffset: 0,
        };

        // RGB Sliders
        this.redSlider = this.addWidget("slider", "Red", this.properties.red, (value) => {
            this.properties.red = value;
            this.updateColor();
        }, { min: 0, max: 255 });

        this.greenSlider = this.addWidget("slider", "Green", this.properties.green, (value) => {
            this.properties.green = value;
            this.updateColor();
        }, { min: 0, max: 255 });

        this.blueSlider = this.addWidget("slider", "Blue", this.properties.blue, (value) => {
            this.properties.blue = value;
            this.updateColor();
        }, { min: 0, max: 255 });

        // Luminance Slider
        this.luminanceSlider = this.addWidget("slider", "Luminance", this.properties.brightness, (value) => {
            this.properties.brightness = value;
            this.updateColor();
        }, { min: 0, max: 255 });

        // Offset Trim Sliders (can go up to 100 for testing purposes)
        this.redOffsetSlider = this.addWidget("slider", "Red Offset", this.properties.redOffset, (value) => {
            this.properties.redOffset = value;
            this.updateColor();
        }, { min: -100, max: 100 });

        this.greenOffsetSlider = this.addWidget("slider", "Green Offset", this.properties.greenOffset, (value) => {
            this.properties.greenOffset = value;
            this.updateColor();
        }, { min: -100, max: 100 });

        this.blueOffsetSlider = this.addWidget("slider", "Blue Offset", this.properties.blueOffset, (value) => {
            this.properties.blueOffset = value;
            this.updateColor();
        }, { min: -100, max: 100 });

        // Reset Button
        this.addWidget("button", "Reset", null, () => {
            this.resetSliders();
        });

        // Output that matches HSV Input of light node
        this.addOutput("HSV Info", "hsv_info");

        this.updateColor(true);
    }

    updateColor() {
        // Apply the necessary offsets directly in the RGB calculation
        let r = Math.max(0, Math.min(255, this.properties.red + this.properties.redOffset));
        let g = Math.max(0, Math.min(255, this.properties.green + this.properties.greenOffset));
        let b = Math.max(0, Math.min(255, this.properties.blue + this.properties.blueOffset));

        // Adjust the RGB values based on the brightness
        const brightnessFactor = this.properties.brightness / 255;
        r = Math.round(r * brightnessFactor);
        g = Math.round(g * brightnessFactor);
        b = Math.round(b * brightnessFactor);

        console.log(`Corrected RGB: ${r}, ${g}, ${b}`);

        // Convert RGB to HSV
        const hsv = this.rgbToHsv(r, g, b);

        console.log(`Converted HSV: ${JSON.stringify(hsv)}`);

        // Send the HSV values to the output
        this.setOutputData(0, hsv);

        // Update color display (for node UI)
        this.boxcolor = this.rgbToHex(r, g, b);

        if (this.graph && this.graph.canvas) {
            this.graph.canvas.draw(true, true);
        }
    }

    rgbToHsv(r, g, b) {
        r /= 255, g /= 255, b /= 255;
        let max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, v = max;
        let d = max - min;
        s = max === 0 ? 0 : d / max;
        if (max === min) {
            h = 0; // achromatic
        } else {
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4.25; break;
            }
            h /= 6;
        }
        return { hue: h, saturation: s, brightness: v * 255 };
    }

    rgbToHex(r, g, b) {
        const toHex = (n) => Math.round(n).toString(16).padStart(2, '0').toUpperCase();
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }

    resetSliders() {
        this.properties.red = 255;
        this.properties.green = 255;
        this.properties.blue = 255;
        this.properties.brightness = 255;

        this.properties.redOffset = 0;
        this.properties.greenOffset = 0;
        this.properties.blueOffset = 0;

        // Update sliders visually
        this.redSlider.value = this.properties.red;
        this.greenSlider.value = this.properties.green;
        this.blueSlider.value = this.properties.blue;
        this.luminanceSlider.value = this.properties.brightness;
        this.redOffsetSlider.value = this.properties.redOffset;
        this.greenOffsetSlider.value = this.properties.greenOffset;
        this.blueOffsetSlider.value = this.properties.blueOffset;

        this.updateColor();
    }

    onExecute() {
        this.updateColor();
    }
}

// Register the node type
LiteGraph.registerNodeType("custom/color_control", CustomColorControl);*/












/*class CustomColorControl extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Custom Color Control";
        this.size = [400, 300];
        this.properties = {
            red: 128,
            green: 128,
            blue: 128,
            brightness: 128,
            redOffset: -87,
            greenOffset: -85,
            blueOffset: -73,
        };

        // RGB Sliders
        this.redSlider = this.addWidget("slider", "Red", this.properties.red, (value) => {
            this.properties.red = value;
            this.updateColor();
        }, { min: 0, max: 255 });

        this.greenSlider = this.addWidget("slider", "Green", this.properties.green, (value) => {
            this.properties.green = value;
            this.updateColor();
        }, { min: 0, max: 255 });

        this.blueSlider = this.addWidget("slider", "Blue", this.properties.blue, (value) => {
            this.properties.blue = value;
            this.updateColor();
        }, { min: 0, max: 255 });

        // Luminance Slider
        this.luminanceSlider = this.addWidget("slider", "Luminance", this.properties.brightness, (value) => {
            this.adjustRGBFromLuminance(value);
        }, { min: 0, max: 255 });

        // Offset Trim Sliders
        this.redOffsetSlider = this.addWidget("slider", "Red Offset", this.properties.redOffset, (value) => {
            this.properties.redOffset = value;
            this.updateColor();
        }, { min: -100, max: 100 });

        this.greenOffsetSlider = this.addWidget("slider", "Green Offset", this.properties.greenOffset, (value) => {
            this.properties.greenOffset = value;
            this.updateColor();
        }, { min: -100, max: 100 });

        this.blueOffsetSlider = this.addWidget("slider", "Blue Offset", this.properties.blueOffset, (value) => {
            this.properties.blueOffset = value;
            this.updateColor();
        }, { min: -100, max: 100 });

        // Reset Button
        this.addWidget("button", "Reset", null, () => {
            this.resetSliders();
        });

        // Correct output type to match light node
        this.addOutput("HSV Info", "hsv_info");

        this.updateColor(true);
    }

    applyGammaCorrection(value) {
        // Apply gamma correction with the derived curve
        const gamma = 2.2;
        return Math.pow(value / 255, gamma) * 255;
    }

    updateColor() {
        // Apply the necessary offsets directly in the RGB calculation
        let r = Math.max(0, Math.min(255, this.applyGammaCorrection(this.properties.red + this.properties.redOffset)));
        let g = Math.max(0, Math.min(255, this.applyGammaCorrection(this.properties.green + this.properties.greenOffset)));
        let b = Math.max(0, Math.min(255, this.applyGammaCorrection(this.properties.blue + this.properties.blueOffset)));

        console.log(`Corrected RGB with Gamma: ${r}, ${g}, ${b}`);

        // Convert RGB to HSV
        const hsv = this.rgbToHsv(r, g, b);

        console.log(`Converted HSV: ${JSON.stringify(hsv)}`);

        // Send the HSV values to the output
        this.setOutputData(0, hsv); // Correct output format

        // Update color display (for node UI)
        this.boxcolor = this.rgbToHex(r, g, b);

        if (this.graph && this.graph.canvas) {
            this.graph.canvas.draw(true, true);
        }
    }

    adjustRGBFromLuminance(luminanceValue) {
        // Store the previous brightness to calculate the ratio
        let prevBrightness = this.properties.brightness;
        this.properties.brightness = luminanceValue;

        if (prevBrightness > 0) {
            let ratio = luminanceValue / prevBrightness;

            // Adjust the red, green, and blue values proportionally based on the ratio
            this.properties.red = Math.max(0, Math.min(255, this.properties.red * ratio));
            this.properties.green = Math.max(0, Math.min(255, this.properties.green * ratio));
            this.properties.blue = Math.max(0, Math.min(255, this.properties.blue * ratio));
        }

        // Update the sliders and the color output
        this.redSlider.value = this.properties.red;
        this.greenSlider.value = this.properties.green;
        this.blueSlider.value = this.properties.blue;

        this.updateColor();
    }

    rgbToHsv(r, g, b) {
        r /= 255, g /= 255, b /= 255;
        let max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, v = max;
        let d = max - min;
        s = max === 0 ? 0 : d / max;
        if (max === min) {
            h = 0; // achromatic
        } else {
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return { hue: h, saturation: s, brightness: v * 255 };
    }

    rgbToHex(r, g, b) {
        const toHex = (n) => Math.round(n).toString(16).padStart(2, '0').toUpperCase();
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }

    resetSliders() {
        this.properties.red = 128;
        this.properties.green = 128;
        this.properties.blue = 128;
        this.properties.brightness = 128;

        this.properties.redOffset = -87;
        this.properties.greenOffset = -85;
        this.properties.blueOffset = -73;

        // Update sliders visually
        this.redSlider.value = this.properties.red;
        this.greenSlider.value = this.properties.green;
        this.blueSlider.value = this.properties.blue;
        this.luminanceSlider.value = this.properties.brightness;
        this.redOffsetSlider.value = this.properties.redOffset;
        this.greenOffsetSlider.value = this.properties.greenOffset;
        this.blueOffsetSlider.value = this.properties.blueOffset;

        this.updateColor();
    }

    onExecute() {
        this.updateColor();
    }
}

// Register the node type
LiteGraph.registerNodeType("custom/color_control", CustomColorControl);







224.137, 224.018, 224.133, 224.133     -61.247, -40.379, -6.052  RGB: 225, 225, 225
Brightness: 192


192.150, 192.150, 182.150, 192.047      -58.693, -40.379, -12.707  RGB: 192, 192, 191
Brightness: 135


160.056, 160.056, 160.056, 160.056       -53.530, -39.572, -16.257  RGB: 160, 160, 159
Brightness: 90

128.066, 128.066, 128.066, 128.066        -46.591, -37.152, -18.838,  RGB: 128, 128, 128
Brightness: 55

96.075, 96.075, 96.075, 96.076,               -37.394, -28.923, -17.628    RGB: 96, 96, 97
Brightness: 30

64.084, 64.084, 68.084, 68.084,               -25.292, -20.048, -13.110,   RGB: 63, 64, 64
Brightness: 13


32.094, 32.094, 32.094, 32.094,                 -11.981, -10.044, -3.832    RGB: 63, 64, 64
Brightness: 13

0.000, 0.000, 0.000, 0.000                             Offset doesn't seem to matter    RGB: 63, 64, 64
Brightness: 13


      ok, so to recap, first 4 values are the RGBL, the next three are the offsets, rgb, and last RGB and Brightness are what the Bridge reported for each line item.  
















Input RGB: 0, 0, 0
Reported RGB: 0, 0, 0
Reported Brightness: 0

Input RGB: 32.722, 32.722, 32.722
Reported RGB: 106, 98, 76
Reported Brightness: 32

Input RGB: 64, 64, 64
Reported RGB: 146, 135, 107
Reported Brightness: 64

Input RGB: 96, 96, 96
Reported RGB: 176, 162, 129
Reported Brightness: 96

Input RGB: 128, 128, 128
Reported RGB: 200, 185, 147
Reported Brightness: 128

Input RGB: 160, 160, 160
Reported RGB: 221, 204, 163
Reported Brightness: 160

Input RGB: 192, 192, 192
Reported RGB: 240, 221, 177
Reported Brightness: 192

Input RGB: 255, 255, 255
Reported RGB: 255, 251, 200
Reported Brightness: 254




































/*class CustomColorNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Custom Color Control";
        this.size = [552.12, 414.89];
        this.properties = {
            red: 128,
            green: 128,
            blue: 128,
            colorTemp: 4150, // Default CT value
            hue: 0.5,        // Default hue value (middle of the color wheel)
            saturation: 0,
            brightness: 128, // Default brightness
            lastColorTemp: 4150,
            virtualRed: 128,
            virtualGreen: 128,
            virtualBlue: 128
        };

        // Binding methods
        this.updateLuminanceFromRGB = this.updateLuminanceFromRGB.bind(this);
        this.updateHSVFromRGB = this.updateHSVFromRGB.bind(this);
        this.updateRGBSliders = this.updateRGBSliders.bind(this);
        this.resetSliders = this.resetSliders.bind(this);
        this.adjustRGBFromLuminance = this.adjustRGBFromLuminance.bind(this);
        this.adjustColorTempOffset = this.adjustColorTempOffset.bind(this);
        this.adjustHueRotation = this.adjustHueRotation.bind(this);

        // Sliders
        this.redSlider = this.addWidget("slider", "Red", this.properties.red, (value) => {
            this.properties.red = value;
            this.properties.virtualRed = value;
            this.updateLuminanceFromRGB();
            this.updateHSVFromRGB();
            this.updateLinkedSliders();
            this.updateColor();
        }, { min: 0, max: 255 });

        this.addSpacer();

        this.greenSlider = this.addWidget("slider", "Green", this.properties.green, (value) => {
            this.properties.green = value;
            this.properties.virtualGreen = value;
            this.updateLuminanceFromRGB();
            this.updateHSVFromRGB();
            this.updateLinkedSliders();
            this.updateColor();
        }, { min: 0, max: 255 });

        this.addSpacer();

        this.blueSlider = this.addWidget("slider", "Blue", this.properties.blue, (value) => {
            this.properties.blue = value;
            this.properties.virtualBlue = value;
            this.updateLuminanceFromRGB();
            this.updateHSVFromRGB();
            this.updateLinkedSliders();
            this.updateColor();
        }, { min: 0, max: 255 });

        this.addSpacer();

        // Color Temp, Hue, and Luminance Sliders
        this.colorTempSlider = this.addWidget("slider", "Color Temp", this.properties.colorTemp, (value) => {
            this.properties.colorTemp = value;
            this.adjustColorTempOffset(value);
            this.updateColor();
        }, { min: 1800, max: 6500 });

        this.addSpacer();

        this.hueSlider = this.addWidget("slider", "Hue", this.properties.hue, (value) => {
            this.properties.hue = value;
            this.adjustHueRotation(value);
            this.updateColor();
        }, { min: 0, max: 1, step: 0.01 });

        this.addSpacer();

        this.luminanceSlider = this.addWidget("slider", "Luminance", this.properties.brightness, (value) => {
            this.adjustRGBFromLuminance(value);
            this.updateHSVFromRGB();
            this.updateColor();
            this.updateRGBSliders();
        }, { min: 0, max: 255 });

        this.addSpacer();

        this.addWidget("button", "Reset", null, this.resetSliders);

        this.addOutput("HSV Info", "hsv_info");

        this.updateColor(true);
    

        this.lastLogTime = 0;
        this.logInterval = 1000;
    }

    addSpacer() {
        this.widgets.push({ type: "null", name: "", value: null });
    }

    logThrottled(message) {
        const now = Date.now();
        if (now - this.lastLogTime > this.logInterval) {
            console.log(message);
            this.lastLogTime = now;
        }
    }

    updateLuminanceFromRGB() {
        const avgRGB = (this.properties.red + this.properties.green + this.properties.blue) / 3;
        this.properties.brightness = avgRGB;
        this.updateLuminanceWidget();
    }

    updateHSVFromRGB() {
        // Convert RGB to HSV to update Hue, Saturation, and Brightness
        const { hue, saturation, brightness } = this.rgbToHsv(this.properties.red, this.properties.green, this.properties.blue);
        this.properties.hue = hue;
        this.properties.saturation = saturation;
        this.properties.brightness = brightness * 255; // Update the brightness in HSV

        // Update the Hue and CT sliders to reflect the RGB values
        this.colorTempSlider.value = this.properties.colorTemp;
        this.hueSlider.value = this.properties.hue;
    }

    adjustColorTempOffset(tempValue) {
        // Calculate the red and blue target based on the CT value
        const redTarget = this.interpolate(tempValue, 1800, 6500, 255, 0);
        const blueTarget = this.interpolate(tempValue, 1800, 6500, 0, 255);

        // Instead of scaling, offset the virtual values
        const redOffset = redTarget - this.properties.virtualRed;
        const blueOffset = blueTarget - this.properties.virtualBlue;

        this.properties.virtualRed += redOffset * 0.3; // Apply the offset incrementally
        this.properties.virtualBlue += blueOffset * 0.3;

        // Update the actual RGB properties based on the adjusted virtual values
        this.properties.red = Math.min(255, Math.max(0, this.properties.virtualRed));
        this.properties.blue = Math.min(255, Math.max(0, this.properties.virtualBlue));

        // Store the last known CT value
        this.properties.lastColorTemp = tempValue;

        // Ensure Luminance remains independent of CT adjustments
        this.updateRGBSliders();
        this.updateLuminanceFromRGB(); // This should be brightness-only
        this.updateHSVFromRGB();
        this.updateColor();
    }


    adjustHueRotation(hueValue) {
        // Get the current saturation and brightness (luminance) from the RGB values
        let { hue, saturation, brightness } = this.rgbToHsv(
            this.properties.red,
            this.properties.green,
            this.properties.blue
        );
        
        // Update hue but leave brightness (luminance) unchanged
        hue = hueValue;  // Rotate the hue without changing brightness

        // Convert the adjusted HSV values back to RGB, maintaining the same brightness
        const [newRed, newGreen, newBlue] = this.hsvToRgb(hue, saturation, brightness);

        // Update the RGB properties with the new hue-adjusted values
        this.properties.virtualRed = newRed;
        this.properties.virtualGreen = newGreen;
        this.properties.virtualBlue = newBlue;

        // Apply the changes to the actual RGB sliders
        this.properties.red = Math.min(255, Math.max(0, newRed));
        this.properties.green = Math.min(255, Math.max(0, newGreen));
        this.properties.blue = Math.min(255, Math.max(0, newBlue));

        this.properties.lastHue = hueValue;

        // Update the sliders visually
        this.updateRGBSliders();
        this.updateColor();
    }

    // Luminance adjustment logic remains unchanged, and hue won't affect it:
    adjustRGBFromLuminance(luminance) {
        const currentBrightness = (this.properties.virtualRed + this.properties.virtualGreen + this.properties.virtualBlue) / 3;
        const diff = luminance - currentBrightness;

        // Adjust the virtual RGB values based on luminance changes
        this.properties.virtualRed += diff;
        this.properties.virtualGreen += diff;
        this.properties.virtualBlue += diff;

        // Update the RGB sliders without affecting hue or saturation
        this.properties.red = Math.min(255, Math.max(0, this.properties.virtualRed));
        this.properties.green = Math.min(255, Math.max(0, this.properties.virtualGreen));
        this.properties.blue = Math.min(255, Math.max(0, this.properties.virtualBlue));

        this.properties.brightness = luminance; // Update brightness property

        this.updateLuminanceWidget();
        this.updateRGBSliders();
    }


    updateLinkedSliders() {
        this.colorTempSlider.value = this.properties.lastColorTemp;

        const { hue } = this.rgbToHsv(this.properties.red, this.properties.green, this.properties.blue);
        this.hueSlider.value = hue;
    }

    interpolate(value, minVal, maxVal, start, end) {
        return start + ((value - minVal) / (maxVal - minVal)) * (end - start);
    }

    updateColor(initial = false) {
        const hsv = {
            hue: this.properties.hue,
            saturation: this.properties.saturation,
            brightness: this.properties.brightness
        };

        if (!initial) {
            this.setOutputData(0, hsv);
        }

        const rgb = this.hsvToRgb(hsv.hue, hsv.saturation, hsv.brightness / 255);

        if (rgb && rgb.length === 3) {
            this.boxcolor = this.rgbToHex(rgb[0], rgb[1], rgb[2]);
        } else {
            console.error("Error in HSV to RGB conversion:", rgb);
            this.boxcolor = '#808080';
        }

        this.logThrottled(`HSV values: ${JSON.stringify(hsv)} | RGB values: ${JSON.stringify(rgb)}`);

        if (this.graph && this.graph.canvas) {
            this.graph.canvas.draw(true, true);
        }
    }

    updateLuminanceWidget() {
        const luminanceWidget = this.widgets.find(widget => widget.name === "Luminance");
        if (luminanceWidget) {
            luminanceWidget.value = this.properties.brightness;
        }
    }

    updateRGBSliders() {
        if (this.redSlider) this.redSlider.value = this.properties.red;
        if (this.greenSlider) this.greenSlider.value = this.properties.green;
        if (this.blueSlider) this.blueSlider.value = this.properties.blue;
    }

    resetSliders() {
        this.properties.red = 128;
        this.properties.green = 128;
        this.properties.blue = 128;

        // Reset virtual values as well
        this.properties.virtualRed = 128;
        this.properties.virtualGreen = 128;
        this.properties.virtualBlue = 128;

        this.properties.colorTemp = 4150;
        this.properties.hue = 0.5;
        this.properties.saturation = 0;
        this.properties.brightness = 128;
        this.properties.lastColorTemp = 4150;

        this.updateRGBSliders();
        this.updateColor();
        this.updateLuminanceWidget();

        this.colorTempSlider.value = this.properties.colorTemp;
        this.hueSlider.value = this.properties.hue;
    }

    rgbToHsv(r, g, b) {
        r /= 255;
        g /= 255;
        b /= 255;
        let max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, v = max;
        let d = max - min;
        s = max === 0 ? 0 : d / max;
        if (max === min) {
            h = 0; // achromatic
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

    rgbToHex(r, g, b) {
        const toHex = (n) => Math.round(n).toString(16).padStart(2, '0').toUpperCase();
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }

    onDrawForeground(ctx) {
        const swatchHeight = 60;
        ctx.fillStyle = this.boxcolor || 'gray';
        ctx.fillRect(10, this.size[1] - swatchHeight - 10, this.size[0] - 20, swatchHeight);
    }

    onExecute() {
        this.updateColor();
    }

    onResize() {
        this.size = [552.12, 414.89];
    }
}

// Register the node type with LiteGraph
LiteGraph.registerNodeType("custom/color_control", CustomColorNode);






































Suggested Order of Attack:
Reset Functionality:

Ensure that all sliders reset correctly, including Color Temp, Hue, and Luminance. This will provide a reliable baseline to test other functionalities.
Color Box Default Color:

Fix the initialization so that the colorbox starts as neutral gray. This will ensure we have a consistent visual reference when testing the other sliders.
Color Temp Slider:

Address the issue with the Color Temp slider returning gray values and snapping the RGB channels. Fixing this early will help when we adjust the Hue and Luminance sliders, as Color Temp often interacts with these values.
Hue Slider:

Adjust the Hue slider to cover only the magenta-to-green range and ensure it properly influences the RGB sliders.
Luminance Slider:

Correct the Luminance slider's behavior to prevent extreme shifts in RGB values, especially when they are offset.
Inter-relationship Between Color Temp and Hue Sliders:

After the individual sliders are functioning correctly, focus on ensuring that adjustments to one slider (e.g., Color Temp) appropriately update the others (e.g., Hue), reinforcing the interconnected logic.




































class CustomColorNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Custom Color Control";
        this.size = [552.12, 414.89];
        this.properties = {
            red: 128,
            green: 128,
            blue: 128,
            brightness: 128,
        };

        this.lastRGB = { r: null, g: null, b: null }; // Store the last RGB values

        this.updateRGBSliders = this.updateRGBSliders.bind(this);
        this.resetSliders = this.resetSliders.bind(this);
        this.adjustRGBFromLuminance = this.adjustRGBFromLuminance.bind(this);

        // RGB sliders
        this.redSlider = this.addWidget("slider", "Red", this.properties.red, (value) => {
            this.properties.red = value;
            this.updateColor();  // Directly update only based on RGB
        }, { min: 0, max: 255 });

        this.greenSlider = this.addWidget("slider", "Green", this.properties.green, (value) => {
            this.properties.green = value;
            this.updateColor();  // Directly update only based on RGB
        }, { min: 0, max: 255 });

        this.blueSlider = this.addWidget("slider", "Blue", this.properties.blue, (value) => {
            this.properties.blue = value;
            this.updateColor();  // Directly update only based on RGB
        }, { min: 0, max: 255 });

        // Luminance slider
        this.luminanceSlider = this.addWidget("slider", "Luminance", this.properties.brightness, (value) => {
            this.adjustRGBFromLuminance(value);
            this.updateRGBSliders();
        }, { min: 0, max: 255 });

        this.addWidget("button", "Reset", null, this.resetSliders);
        this.addOutput("RGB Info", "rgb_info");

        this.updateColor(true);
    }

    updateColor(initial = false) {
        const rgb = [this.properties.red, this.properties.green, this.properties.blue];
        this.boxcolor = this.rgbToHex(rgb[0], rgb[1], rgb[2]);

        // Only output or draw if not initial
        if (!initial) {
            this.setOutputData(0, rgb);
        }

        if (this.graph && this.graph.canvas) {
            this.graph.canvas.draw(true, true);
        }
    }

    // Adjust brightness based on RGB luminance
    adjustRGBFromLuminance(luminanceValue) {
        const luminanceChange = luminanceValue - this.properties.brightness;

        // Adjust the RGB values uniformly based on luminance
        this.properties.red = Math.min(255, Math.max(0, this.properties.red + luminanceChange));
        this.properties.green = Math.min(255, Math.max(0, this.properties.green + luminanceChange));
        this.properties.blue = Math.min(255, Math.max(0, this.properties.blue + luminanceChange));

        this.properties.brightness = luminanceValue;
        this.updateRGBSliders();
        this.updateColor();
    }

    // Update RGB sliders based on property changes
    updateRGBSliders() {
        if (this.redSlider) this.redSlider.value = this.properties.red;
        if (this.greenSlider) this.greenSlider.value = this.properties.green;
        if (this.blueSlider) this.blueSlider.value = this.properties.blue;
    }

    // Reset all sliders
    resetSliders() {
        this.properties.red = 128;
        this.properties.green = 128;
        this.properties.blue = 128;
        this.properties.brightness = 128;

        this.updateRGBSliders();
        this.updateColor();
    }

    rgbToHex(r, g, b) {
        const toHex = (n) => Math.round(n).toString(16).padStart(2, '0').toUpperCase();
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }

    onExecute() {
        this.updateColor();
    }
}

LiteGraph.registerNodeType("custom/color_control", CustomColorNode);


*/