// Define HueLightNode
class HueLightNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Hue Light";
        this.size = [260, 110];  // Ensure the size is set correctly
        this.properties = { light_id: 1, brightness: 100, color: { h: 0, s: 1 } };
        this.addInput("Brightness", "number");
        this.addInput("Color", "color");
        this.addOutput("Light Info", "light_info");
        this.lastBrightness = this.properties.brightness;  // Set to initial value
        this.lastColor = this.properties.color;  // Set to initial value
        this.debounceTimeout = null;  // Debounce timeout for the API requests
    }

    onExecute() {
        const brightness = this.getInputData(0);
        const color = this.getInputData(1);

        // Debugging: Log the received inputs
        console.log(`HueLightNode - Current brightness input: ${brightness}`);
        console.log(`HueLightNode - Current color input: ${color}`);

        let updated = false;  // Flag to check if we need to update the light

        // Store the received brightness and color data if they have changed
        if (brightness !== undefined && brightness !== this.lastBrightness) {
            this.properties.brightness = brightness;
            this.lastBrightness = brightness;
            console.log(`HueLightNode - Received and set Brightness: ${brightness}`);
            updated = true;
        }

        if (color !== undefined && color !== this.lastColor) {
            this.properties.color = color;
            this.lastColor = color;
            console.log(`HueLightNode - Received and set Color: ${color}`);
            updated = true;
        }

        // Only update the light state if there was a change in brightness or color
        if (updated) {
            clearTimeout(this.debounceTimeout);
            this.debounceTimeout = setTimeout(() => {
                this.updateLightState({
                    light_id: this.properties.light_id,
                    brightness: this.properties.brightness,
                    color: this.properties.color
                });
            }, 200);  // Adjust the debounce delay as needed
        }

        // Prepare the output data
        const outputData = {
            light_id: this.properties.light_id,
            brightness: this.properties.brightness,
            color: this.properties.color
        };
        this.setOutputData(0, outputData);
        console.log("HueLightNode - Outputting data:", outputData);
    }

    updateLightState(lightInfo) {
        console.log("HueLightNode - Updating light state with:", lightInfo);
        const data = {
            on: true,  // Keep the light on while updating brightness
            bri: lightInfo.brightness,
            color: lightInfo.color
        };

        fetch(`http://localhost:5000/api/light/${lightInfo.light_id}/state`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        }).then(response => response.json())
          .then(data => {
              console.log('HueLightNode - Light state updated successfully:', data);
          })
          .catch(error => {
              console.error('HueLightNode - Error updating light state:', error);
          });
    }
}

LiteGraph.registerNodeType("custom/hue_light", HueLightNode);


// PushButtonNode: Outputting state with debounce logic (similar to brightness control)
class PushButtonNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Simple On/Off";
        this.size = [200, 60];
        this.properties = { state: false };
        this.lastState = null; // Keep track of the last state
        this.debounceTimeout = null; // Timeout for debouncing
        this.addOutput("State", "boolean");
    }

    onExecute() {
        // Output the state only if it has changed
        if (this.properties.state !== this.lastState) {
            this.lastState = this.properties.state;
            clearTimeout(this.debounceTimeout);
            this.debounceTimeout = setTimeout(() => {
                this.setOutputData(0, this.properties.state);
                console.log(`PushButtonNode - Outputting state: ${this.properties.state}`);
                this.triggerSlot(0); // Propagate the value
            }, 200); // Adjust debounce delay if needed
        }
    }

    onMouseDown(e, pos) {
        if (pos[0] >= 0 && pos[0] <= this.size[0] && pos[1] >= 0 && pos[1] <= this.size[1]) {
            this.properties.state = !this.properties.state;
            this.setDirtyCanvas(true); // Redraw the canvas
            return true;
        }
        return false;
    }

    onDrawForeground(ctx) {
        ctx.fillStyle = this.properties.state ? "#6c6" : "#c66";
        ctx.fillRect(0, 0, this.size[0], this.size[1]);
        ctx.fillStyle = "#fff";
        ctx.font = "20px Arial";
        ctx.textAlign = "center";
        ctx.fillText(this.properties.state ? "ON" : "OFF", this.size[0] * 0.5, this.size[1] * 0.5 + 7);
    }

    onLoad() {
        this.setOutputData(0, this.properties.state);
    }
}

LiteGraph.registerNodeType("custom/pushbutton", PushButtonNode);

// Define TriggerNode
class TriggerNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Execute";
        this.size = [200, 60];
        this.properties = { state: false };
        this.addInput("Light Info", "light_info");
        this.addInput("State", "boolean");

        this.lastState = null;
        this.debounceTimeout = null;
    }

    updateLightState(lightInfo) {
        const data = {
            on: this.properties.state,
            bri: lightInfo.brightness,
            color: lightInfo.color
        };

        fetch(`http://localhost:5000/api/light/${lightInfo.light_id}/state`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        }).then(response => response.json())
          .then(data => {
              console.log('Light state updated:', data);
          })
          .catch(error => {
              console.error('Error:', error);
          });
    }

    onExecute() {
        const lightInfo = this.getInputData(0);
        const state = this.getInputData(1);
        
        if (state !== undefined && state !== this.lastState) {
            this.properties.state = state;
            this.lastState = state;

            if (lightInfo) {
                this.updateLightState(lightInfo);
            }
        }
    }
}

LiteGraph.registerNodeType("custom/trigger", TriggerNode);

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
            console.log(`HSVControlNode - Brightness: ${this.properties.brightness}`);
            this.setDirtyCanvas(true);
        }, { min: 0, max: 100 });

        // Hue Color Picker Button
        this.hueButton = this.addWidget("button", "Pick Hue", null, () => {
            this.showColorPicker();
        });

        // Saturation Slider
        this.addWidget("slider", "Saturation", this.properties.saturation * 100, (v) => {
            this.properties.saturation = v / 100;
            console.log(`HSVControlNode - Saturation: ${this.properties.saturation}`);
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

            console.log(`HSVControlNode - Hue set to: ${this.properties.hue}`);
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
                console.log("HSVControlNode - Outputting data:", hsvInfo);
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

    onPropertyChanged(name, value) {
        if (name === "brightness") {
            this.properties.brightness = Math.round(value);
            console.log(`HSVControlNode - Brightness changed to: ${this.properties.brightness}`);
        }
    }
}

// Register the HSVControlNode
LiteGraph.registerNodeType("custom/hsv_control", HSVControlNode);

class BrightnessControlNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Brightness Control";
        this.size = [260, 110];
        this.properties = { brightness: 100 };
        this.lastBrightness = null;
        this.debounceTimeout = null;  // Timeout for debouncing
        this.addOutput("Brightness", "number");

        // Properly set up the slider widget
        this.addWidget("slider", "Brightness", this.properties.brightness, (v) => {
            this.properties.brightness = Math.round(v);
            
            // Clear previous timeout and set a new one to debounce the update
            clearTimeout(this.debounceTimeout);
            this.debounceTimeout = setTimeout(() => {
                this.setOutputData(0, this.properties.brightness);
                this.triggerSlot(0);  // Trigger the output slot to propagate the value
            }, 200);  // Adjust the delay as needed
        }, { min: 0, max: 100 });

        // Properly set up the text widget for displaying the brightness value
        this.addWidget("text", "Brightness Value", this.properties.brightness.toString(), null, { centered: true });
    }

    onExecute() {
        const brightness = Math.round(this.properties.brightness);  // Ensure whole numbers
        if (brightness !== this.lastBrightness) {
            this.lastBrightness = brightness;
            this.setOutputData(0, brightness);
        }

        // Update the number display widget
        if (this.widgets && this.widgets[1]) {
            this.widgets[1].value = brightness.toString();  // Assuming the text widget is the second one added
        }
    }
}

LiteGraph.registerNodeType("custom/brightness_control", BrightnessControlNode);

