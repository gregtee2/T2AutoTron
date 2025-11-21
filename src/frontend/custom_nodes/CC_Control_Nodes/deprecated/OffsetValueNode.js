class OffsetValueNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Offset Value";
        this.size = [200, 120];
        this.properties = {
            offset: 0,
            minHue: 0,
            maxHue: 360
        };

        this.addInput("Input", "hsv_info");
        this.addOutput("Output", "hsv_info");

        this.addWidget("number", "Offset", this.properties.offset, (value) => {
            this.properties.offset = value;
        });

        this.addWidget("number", "Min Hue", this.properties.minHue, (value) => {
            this.properties.minHue = value;
        });
        this.addWidget("number", "Max Hue", this.properties.maxHue, (value) => {
            this.properties.maxHue = value;
        });

        this.addWidget("button", "Fetch Range", null, () => {
            this.fetchHueRangeFromInput();
        });
    }

    fetchHueRangeFromInput() {
        const hsvInfo = this.getInputData(0);

        console.log("Fetched HSV Info:", hsvInfo);

        if (hsvInfo && hsvInfo.hueStart !== undefined && hsvInfo.hueEnd !== undefined) {
            console.log("Updating Min Hue and Max Hue based on input data.");

            this.properties.minHue = hsvInfo.hueStart;
            this.properties.maxHue = hsvInfo.hueEnd;

            this.widgets[1].value = this.properties.minHue;
            this.widgets[2].value = this.properties.maxHue;
            this.setDirtyCanvas(true);
        } else {
            console.warn("Input data does not contain 'hueStart' or 'hueEnd' properties.");
        }
    }

    onExecute() {
        const hsvInfo = this.getInputData(0);

        if (hsvInfo) {
            let offsetHue = (hsvInfo.hue * 360 + this.properties.offset) % 360;

            if (offsetHue < this.properties.minHue) {
                offsetHue += 360;
            }
            if (offsetHue > this.properties.maxHue) {
                offsetHue = this.properties.minHue + (offsetHue - this.properties.maxHue);
            }

            const normalizedHue = offsetHue / 360;

            const offsetHSVInfo = {
                hue: normalizedHue,
                saturation: hsvInfo.saturation,
                brightness: hsvInfo.brightness
            };

            this.setOutputData(0, offsetHSVInfo);
        }
    }

    serialize() {
        const data = super.serialize();
        data.properties = this.properties;
        return data;
    }

    configure(data) {
        super.configure(data);
        this.properties = data.properties || { offset: 0, minHue: 0, maxHue: 360 };
        this.widgets[0].value = this.properties.offset;
        this.widgets[1].value = this.properties.minHue;
        this.widgets[2].value = this.properties.maxHue;
    }
}

// Register the node type with LiteGraph
LiteGraph.registerNodeType("CC_Control_Nodes/offset_value", OffsetValueNode);