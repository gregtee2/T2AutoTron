class HSVRotationNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "HSV Rotation";
        this.size = [361, 276];
        this.properties = {
            speed: 0.5,
            throttle: 1000,
            brightness: 254,
            hueStart: 0,
            hueEnd: 360,
            bounce: false,
            hueShift: 0,
            saturation: 1.0
        };

        this.hue = 0;
        this.startTime = Date.now();
        this.lastUpdateTime = 0;
        this.direction = 1;

        // Add widgets for speed, throttle, brightness, hue range, bounce toggle, hue shift, and saturation
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
            this.properties.hueStart = Math.round(value);
            this.updateColorSwatch();
            this.setDirtyCanvas(true);
        }, { min: 0, max: 360 });

        this.addWidget("slider", "Hue End", this.properties.hueEnd, (value) => {
            this.properties.hueEnd = Math.round(value);
            this.updateColorSwatch();
            this.setDirtyCanvas(true);
        }, { min: 0, max: 360 });

        this.addWidget("toggle", "Bounce", this.properties.bounce, (value) => {
            this.properties.bounce = value;
        });

        this.hueShiftSlider = this.addWidget("slider", "Hue Shift", this.properties.hueShift, (value) => {
            this.properties.hueShift = Math.round(value);
            this.updateHueShiftWidgets();
            this.updateColorSwatch();
        }, { min: 0, max: 360 });

        this.hueShiftInput = this.addWidget("number", "Hue Shift Value", this.properties.hueShift, (value) => {
            this.properties.hueShift = Math.round(value);
            this.updateHueShiftWidgets();
            this.updateColorSwatch();
        }, { step: 1 });

        this.addWidget("slider", "Saturation", this.properties.saturation, (value) => {
            this.properties.saturation = Math.max(0, Math.min(1, value));
            this.updateColorSwatch();
        }, { min: 0, max: 1, step: 0.01 });

        this.addOutput("HSV Info", "hsv_info");

        this.updateColorSwatch();
    }

    onResize() {
        this.size = [360, 276];
    }

    onExecute() {
        const currentTime = Date.now();

        if (currentTime - this.lastUpdateTime < this.properties.throttle) {
            return;
        }

        this.lastUpdateTime = currentTime;

        const elapsedTime = (currentTime - this.startTime) / 1000;
        let hueRange = this.properties.hueEnd - this.properties.hueStart;

        if (this.properties.bounce) {
            this.hue += this.direction * (elapsedTime * this.properties.speed) % 360;
            if (this.hue > this.properties.hueEnd || this.hue < this.properties.hueStart) {
                this.direction *= -1;
            }
        } else {
            this.hue = (elapsedTime * this.properties.speed) % hueRange + this.properties.hueStart;
        }

        const shiftedHue = (this.hue + this.properties.hueShift) % 360;

        const hsvInfo = {
            hue: shiftedHue / 360,
            saturation: this.properties.saturation,
            brightness: this.properties.brightness,
            hueStart: this.properties.hueStart, // Include hueStart
            hueEnd: this.properties.hueEnd      // Include hueEnd
        };

        this.setOutputData(0, hsvInfo);
        this.updateColorSwatch();
    }

    updateHueShiftWidgets() {
        this.hueShiftSlider.value = this.properties.hueShift;
        this.hueShiftInput.value = this.properties.hueShift;
    }

    updateColorSwatch() {
        const startHue = this.properties.hueStart;
        const endHue = this.properties.hueEnd;
        const hueShift = this.properties.hueShift;
        const saturation = this.properties.saturation;

        const hue = (startHue + hueShift) % 360;
        const color = `hsl(${hue}, ${saturation * 100}%, 50%)`;
        this.boxcolor = color;

        if (this.graph && this.graph.canvas) {
            this.graph.canvas.draw(true, true);
        }
    }

    onDrawForeground(ctx) {
        const gradient = ctx.createLinearGradient(10, this.size[1] - 30, this.size[0] - 10, this.size[1] - 30);

        for (let i = 0; i <= 10; i++) {
            const hue = (this.properties.hueStart + this.properties.hueShift + (this.properties.hueEnd - this.properties.hueStart) * (i / 10)) % 360;
            gradient.addColorStop(i / 10, `hsl(${hue}, ${this.properties.saturation * 100}%, 50%)`);
        }

        ctx.fillStyle = gradient;
        ctx.fillRect(10, this.size[1] - 30, this.size[0] - 20, 20);
    }

    serialize() {
        const data = super.serialize();
        data.properties = this.properties;
        return data;
    }

    configure(data) {
        super.configure(data);
        this.properties = data.properties || {
            speed: 0.5, throttle: 1000, brightness: 254, 
            hueStart: 0, hueEnd: 360, bounce: false, hueShift: 0, saturation: 1.0
        };

        this.widgets[0].value = this.properties.speed;
        this.widgets[1].value = this.properties.throttle;
        this.widgets[2].value = this.properties.brightness;
        this.widgets[3].value = this.properties.hueStart;
        this.widgets[4].value = this.properties.hueEnd;
        this.widgets[5].value = this.properties.bounce;
        this.widgets[6].value = this.properties.saturation;
        this.updateHueShiftWidgets();
        this.updateColorSwatch();
    }

    onStart() {
        this.size = [360, 276];
    }
}

LiteGraph.registerNodeType("Lighting/CC_Control_Nodes/hsv_rotation", HSVRotationNode);
