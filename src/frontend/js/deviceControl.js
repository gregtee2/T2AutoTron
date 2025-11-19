// js/deviceControl.js - Centralized Device Control Module for Client-Side Toggling
function DeviceControl(socket) {
    this.socket = socket;
    this.maxRetries = 3;
    this.retryDelay = 1000; // 1 second
}

DeviceControl.prototype.sendCommand = async function(deviceId, vendor, action, options = {}) {
    const command = action === 'on' ? 'turnOn' : 'turnOff';
    return new Promise((resolve, reject) => {
        const payload = {
            deviceId,
            vendor,
            action,
            transition: options.transition || 0,
            brightness: options.brightness,
            hue: options.hue,
            saturation: options.saturation
        };
        console.log(`Sending ${command} to ${vendor} device ${deviceId} with payload:`, payload);

        this.socket.emit('device-toggle', payload, (response) => {
            if (response && response.success) {
                console.log(`Command ${command} succeeded for ${vendor} device ${deviceId}:`, response);
                this.socket.emit('device-state-update', {
                    id: deviceId,
                    on: action === 'on',
                    brightness: options.brightness,
                    hue: options.hue,
                    saturation: options.saturation,
                    vendor
                });
                resolve(true);
            } else {
                const errorMsg = response?.error || 'Unknown error';
                console.error(`Error sending ${command} to ${vendor} device ${deviceId}:`, errorMsg);
                if (options.retries < this.maxRetries) {
                    console.log(`Retrying (${options.retries + 1}/${this.maxRetries})...`);
                    setTimeout(() => {
                        this.sendCommand(deviceId, vendor, action, { ...options, retries: options.retries + 1 })
                            .then(resolve)
                            .catch(reject);
                    }, this.retryDelay);
                } else {
                    reject(new Error(`Max retries exceeded: ${errorMsg}`));
                }
            }
        });
        setTimeout(() => reject(new Error('Command timeout')), 5000);
    });
};

DeviceControl.prototype.turnOn = async function(deviceId, vendor, options = { retries: 0 }) {
    return this.sendCommand(deviceId, vendor, 'on', options);
};

DeviceControl.prototype.turnOff = async function(deviceId, vendor, options = { retries: 0 }) {
    return this.sendCommand(deviceId, vendor, 'off', options);
};

// Singleton pattern, exposed globally
let instance = null;
window.getDeviceControl = function(socket) {
    if (!instance || instance.socket !== socket) {
        instance = new DeviceControl(socket);
    }
    return instance;
};