#!/usr/bin/env node
/**
 * Light State Poller - Polls actual light states from HA and Hue
 * Run: node poll_lights.js
 */

const http = require('http');

function fetch(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error(`Failed to parse JSON from ${url}: ${data}`));
                }
            });
        }).on('error', reject);
    });
}

async function main() {
    const showOnlyOn = process.argv.includes('--on-only');
    const continuous = process.argv.includes('--watch');
    
    const poll = async () => {
        const timestamp = new Date().toLocaleTimeString();
        console.log('\n========================================');
        console.log(`    LIGHT STATES @ ${timestamp}`);
        console.log('========================================\n');

        try {
            const response = await fetch('http://localhost:3000/api/devices');
            const devices = response.devices || response;
        
        // HUE LIGHTS
        console.log('--- HUE LIGHTS ---');
        const hueLights = devices['hue_'] || [];
        for (const light of hueLights) {
            const state = light.state || {};
            const isOn = state.on === true;
            if (showOnlyOn && !isOn) continue;
            
            const status = isOn ? '🟢 ON' : '⚫ OFF';
            const hue = state.hue || 0;
            const sat = state.sat || 0;
            const bri = state.bri || 0;
            // Convert Hue API hue (0-65535) to degrees (0-360)
            const hueDegrees = Math.round((hue / 65535) * 360);
            // Convert sat to % (0-254 -> 0-100%)
            const satPercent = Math.round((sat / 254) * 100);
            // Convert bri to % (0-254 -> 0-100%)
            const briPercent = Math.round((bri / 254) * 100);
            
            if (isOn) {
                console.log(`  ${status} ${light.name}: Hue=${hueDegrees}° Sat=${satPercent}% Bri=${briPercent}%`);
            } else {
                console.log(`  ${status} ${light.name}`);
            }
        }
        
        // HA LIGHTS
        console.log('\n--- HOME ASSISTANT LIGHTS ---');
        const haLights = devices['ha_light_'] || [];
        for (const light of haLights) {
            const state = light.state || {};
            const isOn = state.on === true || state.state === 'on';
            if (showOnlyOn && !isOn) continue;
            
            const status = isOn ? '🟢 ON' : '⚫ OFF';
            const hs = state.hs_color || [0, 0];
            const bri = state.brightness || 0;
            
            if (isOn) {
                console.log(`  ${status} ${light.name}: Hue=${Math.round(hs[0])}° Sat=${Math.round(hs[1])}% Bri=${bri}`);
            } else {
                console.log(`  ${status} ${light.name}`);
            }
        }
        
        // KASA LIGHTS
        console.log('\n--- KASA BULBS ---');
        const kasaDevices = devices['kasa_'] || [];
        const kasaBulbs = kasaDevices.filter(d => d.type === 'IOT.SMARTBULB');
        for (const light of kasaBulbs) {
            const state = light.state || {};
            const isOn = state.on === true;
            if (showOnlyOn && !isOn) continue;
            
            const status = isOn ? '🟢 ON' : '⚫ OFF';
            const hue = state.hue || 0;
            const sat = state.saturation || 0;
            const bri = state.brightness || 0;
            
            if (state.on) {
                console.log(`  ${status} ${light.name}: Hue=${hue}° Sat=${sat}% Bri=${bri}%`);
            } else {
                console.log(`  ${status} ${light.name}`);
            }
        }
        
        console.log('========================================\n');
        
    } catch (err) {
        console.error('Error:', err.message);
        if (!continuous) process.exit(1);
    }
    };
    
    // Run once
    await poll();
    
    // If --watch, repeat every 10 seconds
    if (continuous) {
        console.log('Watching for changes every 10 seconds... (Ctrl+C to stop)\n');
        setInterval(poll, 10000);
    }
}

main();
