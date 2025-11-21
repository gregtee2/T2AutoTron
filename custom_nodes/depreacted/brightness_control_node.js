// brightness_control_node.js

// Define BrightnessControlNode
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

// Register the node
LiteGraph.registerNodeType("custom/brightness_control", BrightnessControlNode);

