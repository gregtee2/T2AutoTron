// hsv_control_node.js

// Define HSVControlNode
class HSVControlNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "HSV Control";
        this.size = [320, 190];
        this.properties = { brightness: 100, hue: 0, saturation: 1, color: { r: 255, g: 0, b: 0 } };
        this.lastBrightness = null;
        this.lastHue = null;
        this.lastSaturation = null;
        this.debounceTimeout = null;

        this.addOutput("HSV Info", "hsv_info");

        // Brightness Slider
        this.addWidget("slider", "Brightness", this.properties.brightness, (v) => {
            this.properties.brightness = Math.round(v);
            this.setDirtyCanvas(true);
        }, { min: 0, max: 100 });

        // Hue Color Picker Button
        this.hueButton = this.addWidget("button", "Pick Hue", null, () => {
            this.showColorPicker();
        });

        // Saturation Slider
        this.addWidget("slider", "Saturation", this.properties.saturation * 100, (v) => {
            this.properties.saturation = v / 100;
            this.setDirtyCanvas(true);
        }, { min: 0, max: 100 });
    }

    showColorPicker() {
        const pickerContainer = document.createElement("div");
        const colorPicker = document.createElement("input");
        colorPicker.type = "color";
        colorPicker.value = this.rgbToHex(this.properties.color);

        const closeButton = document.createElement("button");
        closeButton.innerText = "Close Picker";

        pickerContainer.style.position = "fixed";
        pickerContainer.style.left = "10px";
        pickerContainer.style.top = "10px";
        pickerContainer.style.padding = "10px";
        pickerContainer.style.backgroundColor = "#333";
        pickerContainer.style.border = "1px solid #666";
        pickerContainer.style.zIndex = "10000";

        pickerContainer.appendChild(colorPicker);
        pickerContainer.appendChild(closeButton);
        document.body.appendChild(pickerContainer);

        colorPicker.addEventListener("input", () => {
            const color = this.hexToRgb(colorPicker.value);
            this.properties.hue = this.rgbToHue(color);
            this.properties.color = color;
            this.setDirtyCanvas(true);

            // Update the button color to reflect the selected hue
            this.hueButton.color = `rgb(${color.r}, ${color.g}, ${color.b})`;

        });

        closeButton.addEventListener("click", () => {
            document.body.removeChild(pickerContainer);
        });
    }

    rgbToHex(rgb) {
        return `#${((1 << 24) + (rgb.r << 16) + (rgb.g << 8) + rgb.b).toString(16).slice(1).toUpperCase()}`;
    }

    hexToRgb(hex) {
        const bigint = parseInt(hex.slice(1), 16);
        return {
            r: (bigint >> 16) & 255,
            g: (bigint >> 8) & 255,
            b: bigint & 255
        };
    }

    rgbToHue(rgb) {
        let r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255;
        let max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h;
        if (max === min) {
            h = 0;
        } else {
            switch (max) {
                case r: h = ((g - b) / (max - min)) + (g < b ? 6 : 0); break;
                case g: h = (b - r) / (max - min) + 2; break;
                case b: h = (r - g) / (max - min) + 4; break;
            }
            h /= 6;
        }
        return h;
    }

    onExecute() {
        const brightness = Math.round(this.properties.brightness);
        const hue = this.properties.hue;
        const saturation = this.properties.saturation;

        let updated = false;

        if (brightness !== this.lastBrightness) {
            this.lastBrightness = brightness;
            updated = true;
        }

        if (hue !== this.lastHue) {
            this.lastHue = hue;
            updated = true;
        }

        if (saturation !== this.lastSaturation) {
            this.lastSaturation = saturation;
            updated = true;
        }

        if (updated) {
            clearTimeout(this.debounceTimeout);
            this.debounceTimeout = setTimeout(() => {
                const hsvInfo = {
                    brightness: this.lastBrightness,
                    hue: this.lastHue,
                    saturation: this.lastSaturation
                };
                this.setOutputData(0, hsvInfo);
                this.triggerSlot(0);
            }, 200);
        }
    }

    onDrawForeground(ctx) {
        ctx.clearRect(0, 0, this.size[0], this.size[1]);
        ctx.fillStyle = "#999";
        ctx.fillRect(10, 40, this.size[0] - 20, 3);

        // Set the button color to reflect the current hue
        ctx.fillStyle = this.properties.color ? `rgb(${this.properties.color.r},${this.properties.color.g},${this.properties.color.b})` : "#fff";
        ctx.fillRect(15, 80, this.size[0] - 30, 30);

        ctx.fillStyle = "#fff";
        ctx.font = "20px Arial";
        ctx.textAlign = "center";
        ctx.fillText(`B: ${this.properties.brightness} H: ${Math.round(this.properties.hue * 360)} S: ${Math.round(this.properties.saturation * 100)}`, this.size[0] * 0.5, 140);
    }
}

// Register the HSVControlNode
LiteGraph.registerNodeType("custom/hsv_control", HSVControlNode);

