class ToggleButtonNode {
    constructor() {
        this.title = "Toggle Button";
        this.size = [140, 20];
        this.addOutput("State", "boolean");
        this.state = false;
        this.changed = false;
    }

    onExecute() {
        if (this.changed) {
            this.setOutputData(0, this.state);
            console.log("ToggleButtonNode: Outputting state:", this.state);
            this.changed = false;
        }
    }

    onMouseDown() {
        this.state = !this.state;
        console.log("ToggleButtonNode: Toggled to:", this.state);
        this.changed = true;
    }

    onDrawForeground(ctx) {
        ctx.fillStyle = this.state ? "#6c6" : "#c66";
        ctx.fillRect(0, 0, this.size[0], this.size[1]);
        ctx.fillStyle = "#fff";
        ctx.font = "20px Arial";
        ctx.textAlign = "center";
        ctx.fillText(this.state ? "ON" : "OFF", this.size[0] * 0.5, this.size[1] * 0.5 + 7);
    }
}
LiteGraph.registerNodeType("custom/toggle_button", ToggleButtonNode);

class LightFunctionBasicNode {
    constructor() {
        this.title = "Light Function";
        this.size = [160, 90];
        this.addInput("Light", "LIGHT");
        this.addInput("On_Off", "boolean");
        this.addOutput("Out", "LIGHT");
        this.prevLight = null;
        this.prevOnOffState = null;
        this.debounceTimeout = null;
    }

    onExecute() {
        const light = this.getInputData(0);
        const onOffState = this.getInputData(1);

        console.log("LightFunctionBasicNode: Received Light:", light, "On/Off state:", onOffState);

        if (light !== undefined && onOffState !== undefined && this.hasStateChanged(light, onOffState)) {
            this.prevLight = light;
            this.prevOnOffState = onOffState;
            if (this.debounceTimeout) {
                clearTimeout(this.debounceTimeout);
            }
            this.debounceTimeout = setTimeout(() => {
                const outputData = { light, onOffState };
                this.setOutputData(0, outputData);
                console.log("LightFunctionBasicNode: Output set with Light:", light, "On/Off state:", onOffState);
            }, 100);
        } else {
            console.log("LightFunctionBasicNode: No valid input data or state unchanged, stopping execution.");
        }
    }

    hasStateChanged(light, onOffState) {
        return this.prevLight !== light || this.prevOnOffState !== onOffState;
    }
}
LiteGraph.registerNodeType("custom/light_function_basic", LightFunctionBasicNode);

class ExecuteNode {
    constructor() {
        this.title = "Execute";
        this.size = [140, 20];
        this.addInput("Light", "LIGHT");
        this.prevLightData = null;
        this.debounceTimeout = null;
    }

    onExecute() {
        const lightData = this.getInputData(0);
        console.log("ExecuteNode: Received light data:", lightData);

        if (lightData !== undefined && lightData !== null && this.hasLightDataChanged(lightData)) {
            this.prevLightData = lightData;
            if (this.debounceTimeout) {
                clearTimeout(this.debounceTimeout);
            }
            this.debounceTimeout = setTimeout(() => {
                executeLightFunction(lightData);
                console.log("ExecuteNode: Executing light function with data:", lightData);
            }, 100);
        } else {
            console.log("ExecuteNode: No light data received or data unchanged, stopping execution.");
        }
    }

    hasLightDataChanged(lightData) {
        return this.prevLightData !== lightData;
    }
}
LiteGraph.registerNodeType("custom/execute", ExecuteNode);

async function executeLightFunction(lightData) {
    console.log("Preparing to execute light function with data:", lightData);
    try {
        const response = await fetch(`http://192.168.1.39/api/axFkrI758PBF6uB9wJYh5BSA4fSF-XoP759RKiOU/lights/${lightData.light}/state`, {
            method: 'PUT',
            body: JSON.stringify({
                on: lightData.onOffState
            }),
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log("Executed light function successfully:", data);
    } catch (error) {
        console.error("Error executing light function:", error);
    }
}

class LightSwitchNode {
    constructor() {
        this.title = "Light Switch";
        this.size = [140, 20];
        this.addOutput("State", "boolean");
        this.state = false;
        this.changed = false;
    }

    onExecute() {
        if (this.changed) {
            this.setOutputData(0, this.state);
            console.log("LightSwitchNode: Sent state:", this.state);
            this.changed = false;
        }
    }

    onMouseDown() {
        this.state = !this.state;
        console.log("LightSwitchNode: Toggled to:", this.state);
        this.changed = true;
    }

    onDrawForeground(ctx) {
        ctx.fillStyle = this.state ? "#6c6" : "#c66";
        ctx.fillRect(0, 0, this.size[0], this.size[1]);
        ctx.fillStyle = "#fff";
        ctx.font = "20px Arial";
        ctx.textAlign = "center";
        ctx.fillText(this.state ? "ON" : "OFF", this.size[0] * 0.5, this.size[1] * 0.5 + 7);
    }
}
LiteGraph.registerNodeType("custom/button", LightSwitchNode);
