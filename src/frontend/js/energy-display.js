// Energy Display Module - FINAL + KASA BULBS FIXED (2025 T2Auto)
// This version WORKS — includes Kasa plugs AND Kasa bulbs from HA!
console.log('energy-display.js FINAL + KASA BULBS loaded');

(function () {
    'use strict';

    const devicePower = new Map();
    let totalPower = 0;
    let displayElement = null;

    function initEnergyDisplay() {
        console.log('Initializing energy display...');

        const panelContent = document.querySelector('#combined-panel .panel-content');
        const forecastSection = document.getElementById('forecast-section');

        if (!panelContent || !forecastSection) {
            console.error('Could not find panel elements');
            return;
        }

        const energySection = document.createElement('div');
        energySection.id = 'energy-section';
        energySection.className = 'sub-collapsible';
        energySection.setAttribute('data-expanded', 'true');
        energySection.innerHTML = `
      <div class="sub-header">Power Monitor</div>
      <div class="sub-content" id="energy-content" style="padding: 10px;">
        <div id="energy-display" style="font-size: 14px;">
          <div style="opacity: 0.7;">Loading power data...</div>
        </div>
      </div>
    `;

        forecastSection.parentNode.insertBefore(energySection, forecastSection.nextSibling);
        displayElement = document.getElementById('energy-display');
        console.log('Energy section created');

        updateDisplay();

        if (window.socket) {
            setupSocketListeners(window.socket);
        } else {
            const check = setInterval(() => {
                if (window.socket) {
                    setupSocketListeners(window.socket);
                    clearInterval(check);
                }
            }, 500);
            setTimeout(() => clearInterval(check), 10000);
        }
    }

    function setupSocketListeners(socket) {
        console.log('Setting up energy socket listeners...');

        // Real-time updates (plugs + bulbs)
        socket.on('device-state-update', (data) => {
            const power = getPowerFromDevice(data);
            if (power !== undefined || devicePower.has(data.id)) {
                devicePower.set(data.id, power ?? 0);
                calculateTotal();
                updateDisplay();
            }
        });

        // INITIAL LOAD — NOW SCANS EVERYTHING INCLUDING HA LIGHTS
        socket.on('device-list-update', (data) => {
            console.log('[Energy] device-list-update received:', data);

            const allDevices = [
                ...(Array.isArray(data.kasa) ? data.kasa : []),
                ...(Array.isArray(data.shelly) ? data.shelly : []),
                ...(Array.isArray(data.ha) ? data.ha : []),
                ...(Array.isArray(data.hue) ? data.hue : [])
            ];

            console.log(`[Energy] Scanning ${allDevices.length} total devices for power data`);

            let loaded = 0;
            allDevices.forEach(device => {
                if (!device || !device.id) return;

                const power = getPowerFromDevice(device);
                if (power !== undefined || devicePower.has(device.id)) {
                    devicePower.set(device.id, power ?? 0);
                    if (power > 0) loaded++;
                    console.log(`[Energy] ${device.name || device.id}: ${power?.toFixed(1) ?? 0}W`);
                }
            });

            calculateTotal();
            updateDisplay();
            console.log(`[Energy] SUCCESS: ${devicePower.size} devices loaded — ${loaded} active (including Kasa bulbs!)`);
        });
    }

    // CENTRAL POWER EXTRACTION — works for plugs AND HA bulbs
    function getPowerFromDevice(device) {
        // 1. Top-level (Kasa plugs)
        if (device.energyUsage?.power != null) return device.energyUsage.power;
        if (device.emeter?.power != null) return device.emeter.power;
        if (device.energy?.power != null) return device.energy.power;

        // 2. HA light entities (Kasa bulbs) — power is in attributes!
        if (device.attributes) {
            if (device.attributes.emeter?.power != null) return device.attributes.emeter.power;
            if (device.attributes.power != null) return device.attributes.power;
        }

        return undefined; // No power data
    }

    function calculateTotal() {
        totalPower = Array.from(devicePower.values())
            .filter(p => typeof p === 'number')
            .reduce((a, b) => a + b, 0);
    }

    function updateDisplay() {
        if (!displayElement) return;

        const activeCount = Array.from(devicePower.values()).filter(p => p > 0).length;

        if (totalPower > 0) {
            displayElement.innerHTML = `
        <div style="margin-bottom: 8px;">
          <div style="font-size: 28px; font-weight: bold; color: ${totalPower > 1000 ? '#ff4444' : '#00C851'};">
            ${totalPower.toFixed(1)}W
          </div>
          <div style="opacity: 0.7; font-size: 12px;">
            ${activeCount} active device${activeCount === 1 ? '' : 's'}
          </div>
        </div>
      `;
        } else {
            displayElement.innerHTML = `<div style="opacity: 0.5;">No devices consuming power</div>`;
        }
    }

    window.initEnergyDisplay = initEnergyDisplay;
    window.getEnergyStats = () => ({
        total: totalPower,
        devices: Object.fromEntries(devicePower),
        activeCount: Array.from(devicePower.values()).filter(p => p > 0).length
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initEnergyDisplay);
    } else {
        initEnergyDisplay();
    }
})();