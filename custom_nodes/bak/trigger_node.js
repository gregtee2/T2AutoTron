// trigger_node.js

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

// Register the node
LiteGraph.registerNodeType("custom/trigger", TriggerNode);

