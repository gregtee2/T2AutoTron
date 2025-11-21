// Define PushButtonNode
class PushButtonNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "PushButton";
        this.size = [200, 60];
        this.properties = { state: false };
        this.addOutput("State", "boolean");
    }

    onExecute() {
        this.setOutputData(0, this.properties.state);
    }

    onDrawForeground(ctx) {
        ctx.fillStyle = this.properties.state ? "#6c6" : "#c66";
        ctx.fillRect(0, 0, this.size[0], this.size[1]);

        ctx.fillStyle = "#fff";
        ctx.font = "20px Arial";
        ctx.textAlign = "center";
        ctx.fillText(this.properties.state ? "ON" : "OFF", this.size[0] * 0.5, this.size[1] * 0.5 + 7);
    }

    onMouseDown(e, pos) {
        if (pos[0] >= 0 && pos[0] <= this.size[0] && pos[1] >= 0 && pos[1] <= this.size[1]) {
            this.properties.state = !this.properties.state;
            this.setDirtyCanvas(true);
            console.log("Button state:", this.properties.state);
            return true;  // Prevents propagation
        }
        return false;
    }
}

LiteGraph.registerNodeType("custom/pushbutton", PushButtonNode);

// Define a debounce function to limit the frequency of updates
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// Update HueLightNode to handle dynamic brightness updates with debounce
class HueLightNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Hue Light";
        this.size = [200, 60];
        this.properties = { light_id: 1, brightness: 100, color: { h: 0, s: 1 } };
        this.addInput("Brightness", "number");
        this.addInput("Color", "color");
        this.addOutput("Light ID", "light_info");

        // Debounce updateLightState to avoid overwhelming the server
        this.debouncedUpdate = debounce(this.updateLightState.bind(this), 200);
    }

    updateLightState() {
        const data = { 
            bri: this.properties.brightness,
            on: true
        };

        if (this.properties.color) {
            data.color = this.properties.color;
        }

        fetch(`http://localhost:5000/api/light/${this.properties.light_id}/state`, {
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
        const brightness = this.getInputData(0);
        const color = this.getInputData(1);

        if (brightness !== undefined) {
            this.properties.brightness = brightness;
            console.log(`Brightness received: ${brightness}`);
            this.debouncedUpdate();  // Update light brightness dynamically with debounce
        }

        if (color !== undefined) {
            this.properties.color = color;
            console.log(`Color received:`, color);
        }

        this.setOutputData(0, {
            light_id: this.properties.light_id,
            brightness: this.properties.brightness,
            color: this.properties.color
        });
    }

    onDrawForeground(ctx) {
        ctx.fillStyle = "#999";
        ctx.fillRect(0, 0, this.size[0], this.size[1]);
        ctx.fillStyle = "#fff";
        ctx.font = "20px Arial";
        ctx.textAlign = "center";
        ctx.fillText("Hue Light", this.size[0] * 0.5, this.size[1] * 0.5 + 7);
    }
}

LiteGraph.registerNodeType("custom/hue_light", HueLightNode);

// Define TriggerNode
class TriggerNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Trigger";
        this.size = [200, 60];
        this.properties = { state: false };
        this.addInput("Light Info", "light_info");
        this.addInput("State", "boolean");

        this.lastState = null;  // To store the last state
        this.debounceTimeout = null;  // To store the debounce timeout
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
                if (this.debounceTimeout) {
                    clearTimeout(this.debounceTimeout);
                }

                this.debounceTimeout = setTimeout(() => {
                    this.updateLightState(lightInfo);
                }, 300);  // Debounce time in milliseconds
            }
        }
    }

    onDrawForeground(ctx) {
        ctx.fillStyle = this.properties.state ? "#6c6" : "#c66";
        ctx.fillRect(0, 0, this.size[0], this.size[1]);
        ctx.fillStyle = "#fff";
        ctx.font = "20px Arial";
        ctx.textAlign = "center";
        ctx.fillText(this.properties.state ? "ON" : "OFF", this.size[0] * 0.5, this.size[1] * 0.5 + 7);
    }
}

LiteGraph.registerNodeType("custom/trigger", TriggerNode);

// Define BrightnessControlNode
class BrightnessControlNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Brightness Control";
        this.size = [200, 60];
        this.properties = { brightness: 100 };
        this.addInput("Brightness Value", "number");
        this.addOutput("Brightness", "number");

        // Add a slider widget to control brightness
        this.sliderWidget = this.addWidget("slider", "Brightness", this.properties.brightness, (v) => {
            this.properties.brightness = v;
            console.log(`Slider value set to: ${this.properties.brightness}`);
            this.setDirtyCanvas(true);
        }, { min: 0, max: 100, step: 1 });

        this.sliderDragging = false;
    }

    onExecute() {
        const brightness = this.getInputData(0);
        if (brightness !== undefined) {
            this.properties.brightness = brightness;
            console.log(`Brightness input received: ${brightness}`);
        }
        this.setOutputData(0, this.properties.brightness);
        console.log(`Brightness output set to: ${this.properties.brightness}`);
    }

    onDrawForeground(ctx) {
        ctx.fillStyle = "#999";
        ctx.fillRect(0, 0, this.size[0], this.size[1]);
        ctx.fillStyle = "#fff";
        ctx.font = "20px Arial";
        ctx.textAlign = "center";
        ctx.fillText(`Brightness: ${this.properties.brightness}`, this.size[0] * 0.5, this.size[1] * 0.5 + 7);
    }

    onMouseDown(event, pos) {
        if (this.sliderWidget && this.isPointInside(pos, [0, 0, this.size[0], this.size[1]])) {
            this.sliderDragging = true;
            console.log("Slider dragging started");
            return true;
        }
        return false;
    }

    onMouseUp(event, pos) {
        if (this.sliderDragging) {
            this.sliderDragging = false;
            this.setOutputData(0, this.properties.brightness);
            console.log(`Mouse released, brightness set to: ${this.properties.brightness}`);
            this.setDirtyCanvas(true);
            return true;
        }
        return false;
    }

    onMouseMove(event, pos) {
        if (this.sliderDragging) {
            const sliderRange = this.sliderWidget.options.max - this.sliderWidget.options.min;
            const sliderValue = ((pos[0] - this.sliderWidget.pos[0]) / this.sliderWidget.size[0]) * sliderRange + this.sliderWidget.options.min;
            this.sliderWidget.value = Math.min(Math.max(sliderValue, this.sliderWidget.options.min), this.sliderWidget.options.max);
            this.properties.brightness = this.sliderWidget.value;
            console.log(`Slider moved, brightness set to: ${this.properties.brightness}`);
            this.setDirtyCanvas(true);
        }
    }
}

LiteGraph.registerNodeType("custom/brightness_control", BrightnessControlNode);

// Define functions to save and load the graph

function saveGraph(graph, filename) {
    const data = graph.serialize();
    const jsonStr = JSON.stringify(data);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function loadGraph(graph, file) {
    const reader = new FileReader();
    reader.onload = function(event) {
        const jsonStr = event.target.result;
        const data = JSON.parse(jsonStr);
        graph.configure(data);
    };
    reader.readAsText(file);
}

// Example usage
const graph = new LiteGraph.LGraph();
const canvas = new LiteGraph.LGraphCanvas("#mycanvas", graph);
graph.start();

document.getElementById("saveButton").addEventListener("click", function() {
    saveGraph(graph, "my_graph.json");
});

document.getElementById("loadInput").addEventListener("change", function(event) {
    const file = event.target.files[0];
    if (file) {
        loadGraph(graph, file);
    }
});
