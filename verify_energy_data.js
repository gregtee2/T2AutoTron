const io = require('socket.io-client');

const socket = io('http://localhost:3000');

console.log('Connecting to socket server...');

socket.on('connect', () => {
    console.log('Connected to socket server with ID:', socket.id);

    // Authenticate
    // Assuming APP_PIN is 1234 or similar, but we can try to listen without auth for some events if possible,
    // but socketHandlers.js requires auth for most things.
    // Let's try to authenticate with a common pin or just listen.
    // Wait, the user said "No devices consuming power", which implies they are authenticated and seeing the UI.
    // So I should try to authenticate. I'll check .env for APP_PIN if I can, or just try '1234'.
    // Actually, I'll just listen for 'device-list-update' which might be broadcasted or sent upon request.

    // Try to authenticate with default pin if known, otherwise just listen
    socket.emit('authenticate', '1234');

    // Also try to request device list
    socket.emit('request-device-list');
});

socket.on('auth-success', () => {
    console.log('Authentication successful!');
    socket.emit('request-device-list');
});

socket.on('auth-failed', () => {
    console.log('Authentication failed (expected if PIN is wrong). Still listening for events...');
});

socket.on('device-list-update', (data) => {
    console.log('Received device-list-update:');
    // console.log(JSON.stringify(data, null, 2));

    let foundPower = false;

    if (data.kasa) {
        console.log(`Kasa devices: ${data.kasa.length}`);
        data.kasa.forEach(d => {
            console.log(`- ${d.name} (${d.id}): Energy:`, d.energyUsage || d.energy || d.emeter);
            if (d.energyUsage || d.energy || d.emeter) foundPower = true;
        });
    }

    if (data.ha) {
        console.log(`HA devices: ${data.ha.length}`);
        data.ha.forEach(d => {
            console.log(`- ${d.name} (${d.id}): Attributes:`, d.attributes);
            if (d.attributes && (d.attributes.power || d.attributes.current_power_w)) foundPower = true;
        });
    }

    if (foundPower) {
        console.log('SUCCESS: Power data found in device list!');
    } else {
        console.log('FAILURE: No power data found in device list.');
    }

    // Exit after receiving data
    // process.exit(0);
});

socket.on('device-state-update', (data) => {
    console.log('Received device-state-update:', data);
    if (data.energyUsage || data.energy || data.emeter || (data.attributes && (data.attributes.power || data.attributes.current_power_w))) {
        console.log('SUCCESS: Power data found in state update!');
    }
});

socket.on('disconnect', () => {
    console.log('Disconnected from socket server');
});

// Keep alive for a bit
setTimeout(() => {
    console.log('Timeout reached, exiting...');
    process.exit(0);
}, 10000);
