function DeviceControlNode() {
  this.addInput('trigger', 'boolean');
  this.addOutput('state', 'object');
  this.properties = { deviceId: '', on: false, brightness: 50 }; // Set in UI (e.g., 'insteon_123456')

  this.onExecute = function() {
    if (this.getInputData(0)) {
      fetch('http://localhost:3000/api/devices/devices', {
        method: 'POST', // Matches deviceRoutes.js
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: this.properties.deviceId, state: { on: this.properties.on, brightness: this.properties.brightness } })
      })
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            this.setOutputData(0, { id: this.properties.deviceId, on: this.properties.on, brightness: this.properties.brightness });
          }
        })
        .catch(error => console.error(`Error controlling device ${this.properties.deviceId}: ${error.message}`));
    }
  };
}

export default [
  { type: 'generic/device_control', constructor: DeviceControlNode }
];