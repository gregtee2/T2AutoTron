const fetch = require('./v3_migration/backend/node_modules/node-fetch');

async function checkDevice() {
    try {
        const response = await fetch('http://localhost:3000/api/lights/ha/ha_switch.dads_shark/state');
        const data = await response.json();
        console.log(JSON.stringify(data, null, 2));
    } catch (e) {
        console.error(e);
    }
}

checkDevice();