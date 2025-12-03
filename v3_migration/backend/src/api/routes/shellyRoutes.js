const express = require('express');
const Joi = require('joi');
const chalk = require('chalk');
const fetch = require('node-fetch');
const shellyManager = require('../../devices/managers/shellyManager'); // Fixed import

const logWithTimestamp = (message, level = 'info') => {
    const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
    const timestamp = `[${new Date().toISOString()}]`;
    let formattedMessage = `${timestamp} `;
    if (['error'].includes(level) || (LOG_LEVEL === 'info' && ['info', 'warn'].includes(level)) || LOG_LEVEL === level) {
        switch (level) {
            case 'error':
                formattedMessage += `${chalk.red('❌ ' + message)}`;
                break;
            case 'warn':
                formattedMessage += `${chalk.yellow('⚠️ ' + message)}`;
                break;
            case 'info':
            default:
                formattedMessage += `${chalk.green('✅ ' + message)}`;
                break;
        }
        console.log(formattedMessage);
    }
};

module.exports = function (io) {
    const router = express.Router();

    router.use((req, res, next) => {
        const devices = shellyManager.getShellyDevices();
        if (!devices || devices.length === 0) {
            logWithTimestamp('Shelly devices not initialized yet.', 'error');
            return res.status(503).json({ success: false, error: 'Shelly devices not initialized yet.' });
        }
        next();
    });

    const stateSchema = Joi.object({
        on: Joi.boolean()
    }).unknown(false);

    router.get('/', (req, res) => {
        try {
            const formattedDevices = shellyManager.getShellyDevices().map(device => ({
                id: `shellyplus1-${device.mac}`,
                name: device.name,
                ip: device.ip,
                type: "ShellyPlus1",
                state: device.state
            }));
            res.json({ success: true, devices: formattedDevices });
        } catch (error) {
            logWithTimestamp(`Error fetching all Shelly devices: ${error.message}`, 'error');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    router.get('/:id/state', async (req, res) => {
        const { id } = req.params;
        logWithTimestamp(`Fetching state of Shelly device ${id}`, 'info');
        try {
            const device = shellyManager.getShellyDevices().find(d => `shellyplus1-${d.mac}` === id);
            if (!device) {
                return res.status(404).json({ success: false, error: 'Shelly device not found' });
            }
            const response = await fetch(`http://${device.ip}/rpc/Switch.GetStatus?id=0`, { timeout: 5000 });
            if (!response.ok) throw new Error(`Shelly state fetch failed: ${response.status}`);
            const data = await response.json();
            const state = { on: data.output };
            device.state.on = state.on; // Update local state
            res.json({ success: true, state });
        } catch (error) {
            logWithTimestamp(`Error fetching Shelly device ${id}: ${error.message}`, 'error');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    router.put('/:id/state', async (req, res) => {
        const { id } = req.params;
        const { on } = req.body;
        logWithTimestamp(`PUT /api/lights/shelly/${id}/state: ${JSON.stringify(req.body)}`, 'info');

        const { error } = stateSchema.validate(req.body);
        if (error) {
            logWithTimestamp(`Validation error: ${error.details[0].message}`, 'error');
            return res.status(400).json({ success: false, error: error.details[0].message });
        }

        try {
            const device = shellyManager.getShellyDevices().find(d => `shellyplus1-${d.mac}` === id);
            if (!device) {
                logWithTimestamp(`Shelly device ${id} not found in shellyDevices`, 'error');
                return res.status(404).json({ success: false, error: 'Shelly device not found' });
            }
            const url = `http://${device.ip}/rpc/Switch.Set?id=0&on=${on}`;
            const response = await fetch(url, { timeout: 5000 });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Shelly state set failed: ${response.status} - ${errorText}`);
            }
            device.state.on = on;
            if (io) {
                io.emit('device-state-update', { id, on, vendor: "Shelly" });
            }
            logWithTimestamp(`Shelly ${id} state updated to ${on ? 'ON' : 'OFF'}`, 'info');
            res.json({ success: true, message: 'State updated successfully' });
        } catch (error) {
            logWithTimestamp(`Error setting Shelly device ${id}: ${error.message}`, 'error');
            return res.status(500).json({ success: false, error: error.message });
        }
    });

    router.post('/:id/off', async (req, res) => {
        const { id } = req.params;
        logWithTimestamp(`Turning off Shelly device ${id}`, 'info');
        try {
            const device = shellyManager.getShellyDevices().find(d => `shellyplus1-${d.mac}` === id);
            if (!device) {
                return res.status(404).json({ success: false, error: 'Shelly device not found' });
            }
            const response = await fetch(`http://${device.ip}/rpc/Switch.Set?id=0&on=false`, { timeout: 5000 });
            if (!response.ok) throw new Error(`Shelly turn off failed: ${response.status}`);
            device.state.on = false;
            if (io) {
                io.emit('device-state-update', { id, on: false, vendor: "Shelly" });
            }
            res.json({ success: true, message: 'Device turned off successfully' });
        } catch (error) {
            logWithTimestamp(`Error turning off Shelly device ${id}: ${error.message}`, 'error');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    return router;
};