class HSVControlNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "HSV Control";
        this.size = [360, 256]; // Adjusted size to accommodate all elements
        this.properties = {
            hueShift: 0,
            saturation: 1.0,
            brightness: 254
        };

        // Add widgets for hue shift, saturation, and brightness
        this.hueShiftSlider = this.addWidget("slider", "Hue Shift", this.properties.hueShift, (value) => {
            this.properties.hueShift = Math.round(value); // Ensure whole number
            this.updateHueShiftWidgets();  // Sync the input field with the slider
            this.updateColorSwatch();
        }, { min: 0, max: 360 });

        this.hueShiftInput = this.addWidget("number", "Hue Shift Value", this.properties.hueShift, (value) => {
            this.properties.hueShift = Math.round(value); // Ensure whole number
            this.updateHueShiftWidgets();  // Sync the slider with the input field
            this.updateColorSwatch();
        }, { step: 50 }); // Increment in steps of 1

        this.addWidget("slider", "Saturation", this.properties.saturation, (value) => {
            this.properties.saturation = value;
            this.updateColorSwatch();
        }, { min: 0, max: 1 });

        this.addWidget("slider", "Brightness", this.properties.brightness, (value) => {
            this.properties.brightness = value;
            this.updateColorSwatch();
        }, { min: 0, max: 254 });

        this.addOutput("HSV Info", "hsv_info");

        this.updateColorSwatch();
    }

    onResize() {
        // Override the onResize to force the desired size
        this.size = [360, 256]; // Force the node to keep this size
    }

    onExecute() {
        const hsvInfo = {
            hue: this.properties.hueShift / 360, // Normalize to 0-1
            saturation: this.properties.saturation, // Use saturation from slider
            brightness: this.properties.brightness // Adjustable brightness
        };

        // Output the HSV info
        this.setOutputData(0, hsvInfo);
        this.updateColorSwatch();
    }

    updateHueShiftWidgets() {
        // Sync the slider and input field
        this.hueShiftSlider.value = this.properties.hueShift;
        this.hueShiftInput.value = this.properties.hueShift;
    }

    updateColorSwatch() {
        // Convert HSV to RGB for accurate color display
        const rgb = this.hsvToRgb(this.properties.hueShift / 360, this.properties.saturation, this.properties.brightness / 254);
        const color = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
        this.boxcolor = color;

        if (this.graph && this.graph.canvas) {
            this.graph.canvas.draw(true, true);
        }
    }

    hsvToRgb(h, s, v) {
        let r, g, b;
        let i = Math.floor(h * 6);
        let f = h * 6 - i;
        let p = v * (1 - s);
        let q = v * (1 - f * s);
        let t = v * (1 - (1 - f) * s);

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

    onDrawForeground(ctx) {
        const swatchHeight = 20;

        // Draw the final color swatch
        ctx.fillStyle = this.boxcolor || 'black';
        ctx.fillRect(10, this.size[1] - swatchHeight - 10, this.size[0] - 20, swatchHeight);
    }

    // Serialize the node's properties to save its state
    serialize() {
        const data = super.serialize();
        data.properties = this.properties;
        return data;
    }

    // Configure the node's properties when loading from a saved state
    configure(data) {
        super.configure(data);
        this.properties = data.properties || {
            hueShift: 0, saturation: 1.0, brightness: 254
        };

        // Update the widget values
        this.updateHueShiftWidgets();
        this.updateColorSwatch();
    }

    onStart() {
        // Force the node to have a specific size when added to the graph
        this.size = [360, 256]; // Set size when the graph starts
    }
}

// Register the node type with LiteGraph
LiteGraph.registerNodeType("custom/hsv_control", HSVControlNode);
