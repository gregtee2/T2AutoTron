class DeviceInfoExtractorNode extends LiteGraph.LGraphNode {
  constructor() {
    super();
    this.title = "Device Info Extractor";
    this.size = [240, 180];

    // Properties
    this.properties = {
      selectedDevice: "First Available",
      propertyToExtract: "power",
      debug: false
    };

    // Inputs
    this.addInput("Device Info", "light_info");
    //this.addInput("Device Info", "device_info");

    // Outputs
    this.addOutput("Condition", "boolean");
    this.addOutput("Value", "number");
    this.addOutput("Text", "string");

    // Setup widgets
    this.setupWidgets();
  }

  setupWidgets() {
    // Dropdown to select the device
    this.deviceSelector = this.addWidget(
      "combo",
      "Select Device",
      this.properties.selectedDevice,
      (value) => {
        this.properties.selectedDevice = value;
        this.setDirtyCanvas(true);
      },
      {
        values: ["First Available"]
      }
    );

    // Dropdown to select the property to extract
    this.propertySelector = this.addWidget(
      "combo",
      "Property",
      this.properties.propertyToExtract,
      (value) => {
        this.properties.propertyToExtract = value;
        this.setDirtyCanvas(true);
      },
      {
        values: [
          "power",
          "status", // For light_info compatibility
          "hue",
          "saturation",
          "brightness",
          "energy",
          "volume",
          "source",
          "media_title",
          "temperature",
          "value",
          "battery",
          "position"
        ]
      }
    );

    // Debug toggle
    this.addWidget(
      "toggle",
      "Debug",
      this.properties.debug,
      (value) => {
        this.properties.debug = value;
        this.setDirtyCanvas(true);
      },
      {
        label: "Debug Logging"
      }
    );
  }

onExecute() {
  // Get input data
  const lightInfo = this.getInputData(0);
  const deviceInfo = this.getInputData(1);

  if (this.properties.debug) {
    console.log("[DeviceInfoExtractorNode] Light Info:", lightInfo);
    console.log("[DeviceInfoExtractorNode] Device Info:", deviceInfo);
    console.log("[DeviceInfoExtractorNode] Input types:", {
      lightInfo: this.inputs[0].type,
      deviceInfo: this.inputs[1].type
    });
  }

  // Determine which input to process
  let inputData = null;
  let deviceList = [];
  let sourceType = null;

  if (deviceInfo && deviceInfo.devices && deviceInfo.devices.length) {
    inputData = deviceInfo;
    deviceList = deviceInfo.devices;
    sourceType = "device_info";
  } else if (lightInfo && lightInfo.lights && lightInfo.lights.length) {
    inputData = lightInfo;
    deviceList = lightInfo.lights;
    sourceType = "light_info";
  } else {
    this.setOutputData(0, false);
    this.setOutputData(1, 0);
    this.setOutputData(2, "");
    if (this.properties.debug) {
      console.log("[DeviceInfoExtractorNode] No valid input data. Device Info:", deviceInfo, "Light Info:", lightInfo);
    }
    return;
  }


    // Update device selector options
    const deviceOptions = ["First Available", ...deviceList.map(device => {
      return sourceType === "light_info"
        ? `${device.name} (ID: ${device.light_id})`
        : `${device.name} (ID: ${device.entity_id})`;
    })];
    if (this.deviceSelector.options.values.join(",") !== deviceOptions.join(",")) {
      this.deviceSelector.options.values = deviceOptions;
      if (!deviceOptions.includes(this.properties.selectedDevice)) {
        this.properties.selectedDevice = "First Available";
        this.deviceSelector.value = "First Available";
      }
    }

    // Select the device
    let selectedDevice = null;
    if (this.properties.selectedDevice === "First Available") {
      selectedDevice = deviceList[0];
    } else {
      selectedDevice = deviceList.find(device => {
        const id = sourceType === "light_info" ? device.light_id : device.entity_id;
        return `${device.name} (ID: ${id})` === this.properties.selectedDevice;
      });
    }

    if (!selectedDevice) {
      this.setOutputData(0, false);
      this.setOutputData(1, 0);
      this.setOutputData(2, "");
      if (this.properties.debug) {
        console.log("[DeviceInfoExtractorNode] No device selected or found.");
      }
      return;
    }

    // Extract the selected property
    let condition = false;
    let value = 0;
    let text = "";

    switch (this.properties.propertyToExtract) {
      case "power":
        condition = sourceType === "light_info" ? selectedDevice.status === "On" : selectedDevice.power;
        value = condition ? 1 : 0;
        text = condition ? "On" : "Off";
        break;
      case "status": // For light_info compatibility
        if (sourceType === "light_info") {
          condition = selectedDevice.status === "On";
          value = condition ? 1 : 0;
          text = selectedDevice.status;
        } else {
          condition = selectedDevice.state !== "off" && selectedDevice.state !== "unknown";
          value = condition ? 1 : 0;
          text = selectedDevice.state;
        }
        break;
      case "hue":
        condition = selectedDevice.hue > 0;
        value = selectedDevice.hue || 0;
        text = value.toString();
        break;
      case "saturation":
        condition = selectedDevice.saturation > 0;
        value = selectedDevice.saturation || 0;
        text = value.toString();
        break;
      case "brightness":
        condition = selectedDevice.brightness > 0;
        value = selectedDevice.brightness || 0;
        text = value.toString();
        break;
      case "energy":
        condition = selectedDevice.energy > 0;
        value = selectedDevice.energy || 0;
        text = value.toString();
        break;
      case "volume":
        condition = selectedDevice.volume > 0;
        value = selectedDevice.volume || 0;
        text = value.toString();
        break;
      case "source":
        condition = !!selectedDevice.source;
        value = 0; // No numerical value for source
        text = selectedDevice.source || "";
        break;
      case "media_title":
        condition = !!selectedDevice.media_title;
        value = 0;
        text = selectedDevice.media_title || "";
        break;
      case "temperature":
        condition = selectedDevice.temperature != null;
        value = selectedDevice.temperature || 0;
        text = selectedDevice.temperature ? `${selectedDevice.temperature}${selectedDevice.unit || ""}` : "";
        break;
      case "value":
        condition = selectedDevice.value != null;
        value = selectedDevice.value || 0;
        text = selectedDevice.value ? `${selectedDevice.value}${selectedDevice.unit || ""}` : "";
        break;
      case "battery":
        condition = selectedDevice.battery === "OK";
        value = selectedDevice.battery === "OK" ? 1 : 0;
        text = selectedDevice.battery || "";
        break;
      case "position":
        condition = selectedDevice.position > 0;
        value = selectedDevice.position || 0;
        text = value.toString();
        break;
      default:
        condition = false;
        value = 0;
        text = "";
    }

    // Set outputs
    this.setOutputData(0, condition);
    this.setOutputData(1, value);
    this.setOutputData(2, text);

    if (this.properties.debug) {
      console.log(
        `[DeviceInfoExtractorNode] Device="${selectedDevice.name} (ID: ${sourceType === "light_info" ? selectedDevice.light_id : selectedDevice.entity_id})", ` +
        `Source=${sourceType}, ` +
        `Property=${this.properties.propertyToExtract}, ` +
        `Condition=${condition}, ` +
        `Value=${value}, ` +
        `Text=${text}`
      );
    }
  }

  serialize() {
    const data = super.serialize();
    data.properties = { ...this.properties };
    return data;
  }

  configure(data) {
    super.configure(data);
    this.properties = data.properties || this.properties;
    this.deviceSelector.value = this.properties.selectedDevice;
    this.propertySelector.value = this.properties.propertyToExtract;
  }
}

LiteGraph.registerNodeType("Utility/DeviceInfoExtractor", DeviceInfoExtractorNode);
console.log("DeviceInfoExtractorNode - Registered successfully under 'Utility' category.");