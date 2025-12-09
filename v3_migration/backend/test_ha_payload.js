const fetch = require('node-fetch');
require('dotenv').config();

async function testHA() {
    const token = process.env.HA_TOKEN;
    if (!token) {
        console.error('Error: HA_TOKEN not set in .env file');
        process.exit(1);
    }
    const apiUrl = 'http://localhost:3000/api/lights/ha';
    const deviceId = 'ha_light.downstairs_fire_extinguisher'; 

    console.log(`Testing device: ${deviceId}`);
    
    const payload = {
        on: true,
        state: 'on',
        hs_color: [240, 100], 
        brightness: 255,
        transition: 1000
    };

    console.log('Sending payload:', payload);
    
    try {
        const updateRes = await fetch(`${apiUrl}/${deviceId}/state`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        const status = updateRes.status;
        console.log(`Response Status: ${status}`);
        
        const responseText = await updateRes.text();
        console.log('Response Body:', responseText);

    } catch (e) {
        console.error('Error:', e);
    }
}

testHA();