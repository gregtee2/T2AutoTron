class HSVRotationNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "HSV Rotation";
        this.size = [361, 256]; // Set the desired size here
        this.properties = {
            speed: 0.5,
            throttle: 1000,
            brightness: 254,
            hueStart: 0,
            hueEnd: 360,
            bounce: false,
            hueShift: 0
        };

        this.hue = 0;
        this.startTime = Date.now();
        this.lastUpdateTime = 0;
        this.direction = 1;  // To manage the bounce effect

        // Add widgets for speed, throttle, brightness, hue range, bounce toggle, and hue shift
        this.addWidget("slider", "Speed", this.properties.speed, (value) => {
            this.properties.speed = value;
        }, { min: 0, max: 50 });

        this.addWidget("slider", "Throttle (ms)", this.properties.throttle, (value) => {
            this.properties.throttle = value;
        }, { min: 100, max: 5000 });

        this.addWidget("slider", "Brightness", this.properties.brightness, (value) => {
            this.properties.brightness = value;
        }, { min: 0, max: 254 });

        this.addWidget("slider", "Hue Start", this.properties.hueStart, (value) => {
            this.properties.hueStart = Math.round(value);  // Ensure whole number
            this.updateColorSwatch();  // Update color swatch
            this.setDirtyCanvas(true);
        }, { min: 0, max: 360 });

        this.addWidget("slider", "Hue End", this.properties.hueEnd, (value) => {
            this.properties.hueEnd = Math.round(value);  // Ensure whole number
            this.updateColorSwatch();  // Update color swatch
            this.setDirtyCanvas(true);
        }, { min: 0, max: 360 });

        this.addWidget("toggle", "Bounce", this.properties.bounce, (value) => {
            this.properties.bounce = value;
        });

        // Add slider and numeric input for Hue Shift
        this.hueShiftSlider = this.addWidget("slider", "Hue Shift", this.properties.hueShift, (value) => {
            this.properties.hueShift = Math.round(value); // Ensure whole number
            this.updateHueShiftWidgets();  // Sync the input field with the slider
            this.updateColorSwatch();
        }, { min: 0, max: 360 });

        this.hueShiftInput = this.addWidget("number", "Hue Shift Value", this.properties.hueShift, (value) => {
            this.properties.hueShift = Math.round(value); // Ensure whole number
            this.updateHueShiftWidgets();  // Sync the slider with the input field
            this.updateColorSwatch();
        }, { step: 100 }); // Increment in steps of 1

        this.addOutput("HSV Info", "hsv_info");

        this.updateColorSwatch();
    }

    onResize() {
        // Override the onResize to force the desired size
        this.size = [360, 256]; // Force the node to keep this size
    }

    onExecute() {
        const currentTime = Date.now();

        // Throttle updates based on the throttle value
        if (currentTime - this.lastUpdateTime < this.properties.throttle) {
            return; // Skip update if it's too soon
        }

        this.lastUpdateTime = currentTime;

        // Update the hue based on time, speed, and range
        const elapsedTime = (currentTime - this.startTime) / 1000; // in seconds
        let hueRange = this.properties.hueEnd - this.properties.hueStart;

        if (this.properties.bounce) {
            this.hue += this.direction * (elapsedTime * this.properties.speed) % 360;
            if (this.hue > this.properties.hueEnd || this.hue < this.properties.hueStart) {
                this.direction *= -1;  // Reverse direction when limits are hit
            }
        } else {
            this.hue = (elapsedTime * this.properties.speed) % hueRange + this.properties.hueStart;
        }

        // Apply hue shift
        const shiftedHue = (this.hue + this.properties.hueShift) % 360;

        const hsvInfo = {
            hue: shiftedHue / 360, // Normalize to 0-1
            saturation: 1.0, // Fixed at full saturation
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
        // Calculate and apply the hue range and shift
        const startHue = this.properties.hueStart;
        const endHue = this.properties.hueEnd;
        const hueShift = this.properties.hueShift;

        // Update the node border color
        const hue = (startHue + hueShift) % 360;
        const color = `hsl(${hue}, 100%, 50%)`;
        this.boxcolor = color;

        if (this.graph && this.graph.canvas) {
            this.graph.canvas.draw(true, true);
        }
    }

    onDrawForeground(ctx) {
        // Draw a color swatch that reflects the hueStart, hueEnd, and hueShift
        const gradient = ctx.createLinearGradient(10, this.size[1] - 30, this.size[0] - 10, this.size[1] - 30);

        for (let i = 0; i <= 10; i++) {
            const hue = (this.properties.hueStart + this.properties.hueShift + (this.properties.hueEnd - this.properties.hueStart) * (i / 10)) % 360;
            gradient.addColorStop(i / 10, `hsl(${hue}, 100%, 50%)`);
        }

        ctx.fillStyle = gradient;
        ctx.fillRect(10, this.size[1] - 30, this.size[0] - 20, 20);
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
            speed: 0.5, throttle: 1000, brightness: 254, 
            hueStart: 0, hueEnd: 360, bounce: false, hueShift: 0
        };

        // Update the widget values
        this.widgets[0].value = this.properties.speed;
        this.widgets[1].value = this.properties.throttle;
        this.widgets[2].value = this.properties.brightness;
        this.widgets[3].value = this.properties.hueStart;
        this.widgets[4].value = this.properties.hueEnd;
        this.widgets[5].value = this.properties.bounce;
        this.updateHueShiftWidgets();
        this.updateColorSwatch();
    }

    onStart() {
        // Force the node to have a specific size when added to the graph
        this.size = [360, 256]; // Set size when the graph starts
    }
}

// Register the node type with LiteGraph
LiteGraph.registerNodeType("custom/hsv_rotation", HSVRotationNode);
