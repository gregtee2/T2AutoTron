// Define HueLightNode
class HueLightNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Hue Light";
        this.size = [260, 150];
        this.properties = { 
            light_id: 2, 
            hsv: { hue: 0, saturation: 1, brightness: 254 },
            on: true,
            api_key: "slMTFvqVvFbReK3e2UwrKx2HfaKqxiUymbZ-Bdlk",
            bridge_ip: "192.168.1.39"
        };
        this.addInput("HSV Info", "hsv_info");
        this.addInput("On/Off", "boolean");
        this.addOutput("Light Info", "light_info");
        this.lastState = {
            hsv: JSON.stringify(this.properties.hsv),
            on: this.properties.on
        };
        this.debounceTimeout = null;
    }

    onExecute() {
        const hsvInput = this.getInputData(0);  // HSV input
        //const onOffInput = this.getInputData(1);  // On/Off input

        // Update HSV if input is provided
        if (hsvInput !== undefined) {
            const hsvString = JSON.stringify(hsvInput);
            if (hsvString !== this.lastState.hsv) {
                this.properties.hsv = hsvInput;
                this.lastState.hsv = hsvString;
                this.scheduleUpdate();
            }
        }

        // Update On/Off state if input is provided
        //if (onOffInput !== undefined && onOffInput !== this.lastState.on) {
            //this.properties.on = onOffInput;
            //this.lastState.on = onOffInput;
            //this.scheduleUpdate();
        //}

        // Prepare and set the output data
        const outputData = {
            light_id: this.properties.light_id,
            hsv: this.properties.hsv,
            on: this.properties.on
        };
        this.setOutputData(0, outputData);
    }

    scheduleUpdate() {
        clearTimeout(this.debounceTimeout);
        this.debounceTimeout = setTimeout(() => {
            this.updateLightState({
                light_id: this.properties.light_id,
                hsv: this.properties.hsv,
                on: this.properties.on
            });
        }, 300);  // Debounce time reduced for more responsive updates
    }

    updateLightState(lightInfo) {
        // Scale hue from 0-1 to 0-65535
        const hueScaled = Math.round(lightInfo.hsv.hue * 65535);
        const satScaled = Math.round(lightInfo.hsv.saturation * 254);
        const briScaled = Math.round(lightInfo.hsv.brightness);

        const data = {
            on: lightInfo.on,
            bri: briScaled,
            hue: hueScaled,
            sat: satScaled
        };

        fetch(`http://${this.properties.bridge_ip}/api/${this.properties.api_key}/lights/${lightInfo.light_id}/state`, {
            method: 'PUT',  // Use PUT method
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        })
        .then(response => response.json())
        .then(responseData => {
            // console.log('HueLightNode - Light state updated successfully:', responseData);
        })
        .catch(error => {
            console.error('HueLightNode - Error updating light state:', error);
        });
    }
}  // <--- This closing brace correctly ends the HueLightNode class

// Register the node type with LiteGraph
LiteGraph.registerNodeType("custom/hue_light", HueLightNode);
