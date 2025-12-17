// src/routes/hueRoutes.js
const express = require('express');
const { LightState } = require('node-hue-api').v3.lightStates;
const Joi = require('joi');
const chalk = require('chalk');

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

module.exports = function (hueApi, hueLights, io) { // Added io parameter
    const router = express.Router();

    router.use((req, res, next) => {
        if (!hueLights || hueLights.length === 0) {
            logWithTimestamp('Hue lights not initialized yet.', 'error');
            return res.status(503).json({ success: false, error: 'Hue lights not initialized yet.' });
        }
        next();
    });

    const stateSchema = Joi.object({
        on: Joi.boolean(),
        hue: Joi.number().integer().min(0).max(65535),
        sat: Joi.number().integer().min(0).max(254),
        bri: Joi.number().integer().min(1).max(254),
        effect: Joi.string().valid('none', 'colorloop', 'candle', 'fireplace'),
        transitiontime: Joi.number().integer().min(0).max(65535) // Transition time in 100ms units
    }).unknown(false);

    router.get('/', async (req, res) => {
        try {
            const formattedLights = hueLights.map(light => ({
                id: light.id,
                name: light.name,
                type: light.type,
                modelId: light.modelId,
                state: light.state
            }));
            res.json({ success: true, lights: formattedLights });
        } catch (error) {
            logWithTimestamp(`Error fetching all Hue lights: ${error.message}`, 'error');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    router.get('/:id', async (req, res) => {
        const { id } = req.params;
        logWithTimestamp(`Fetching state of Hue light ${id}`, 'info');
        try {
            if (!id || isNaN(parseInt(id, 10))) {
                return res.status(400).json({ success: false, error: 'Invalid light ID' });
            }
            const light = hueLights.find(l => l.id === id);
            if (!light) {
                return res.status(404).json({ success: false, error: 'Light not found' });
            }
            const { on, bri, hue, sat, alert, effect, colorTemp, xy } = light.state || {};
            res.json({
                success: true,
                light: {
                    id: light.id,
                    name: light.name,
                    type: light.type,
                    modelId: light.modelId,
                    state: {
                        on: on ?? false,
                        bri: bri ?? 0,
                        hue: hue ?? 0,
                        sat: sat ?? 0,
                        alert: alert ?? 'none',
                        effect: effect ?? 'none',
                        ct: colorTemp ?? 0,
                        xy: xy ?? [0, 0]
                    }
                }
            });
        } catch (error) {
            logWithTimestamp(`Error fetching Hue light ${id}: ${error.message}`, 'error');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    router.put('/:id/state', async (req, res) => {
        const { id } = req.params;
        const { on, hue, sat, bri, effect, transitiontime } = req.body;
        logWithTimestamp(`PUT /api/lights/hue/${id}/state: ${JSON.stringify(req.body)}`, 'info');

        const { error } = stateSchema.validate(req.body);
        if (error) {
            logWithTimestamp(`Validation error: ${error.details[0].message}`, 'error');
            return res.status(400).json({ success: false, error: error.details[0].message });
        }

        try {
            if (!id || isNaN(parseInt(id, 10))) {
                return res.status(400).json({ success: false, error: 'Invalid light ID' });
            }
            const light = hueLights.find(l => l.id === id);
            if (!light) {
                return res.status(404).json({ success: false, error: 'Light not found' });
            }

            const state = new LightState();
            if (typeof on === 'boolean') state.on(on);
            if (on === true || on === undefined) {
                if (typeof hue === 'number') state.hue(Math.min(Math.max(hue, 0), 65535));
                if (typeof sat === 'number') state.sat(Math.min(Math.max(sat, 0), 254));
                if (typeof bri === 'number') state.bri(Math.min(Math.max(bri, 1), 254));
            }
            if (typeof transitiontime === 'number') state.transitiontime(transitiontime);
            if (typeof effect === 'string' && ['none', 'colorloop', 'candle', 'fireplace'].includes(effect.toLowerCase())) {
                state.effect(effect.toLowerCase());
            } else if (effect !== undefined) {
                return res.status(400).json({ success: false, error: 'Invalid effect value' });
            }

            logWithTimestamp(`Setting Hue light ${id} state: ${JSON.stringify(state.getPayload())}`, 'info');
            await light.hueApi.lights.setLightState(id, state);
            // Emit state update if io is available (use prefixed IDs to match /api/devices)
            if (io) {
                io.emit('device-state-update', { id: `hue_${id}`, name: light.name, ...state.getPayload() });
            } else {
                logWithTimestamp(`Socket.IO not available for light ${id} update`, 'warn');
            }

            res.json({ success: true, message: 'State updated successfully' });
        } catch (error) {
            logWithTimestamp(`Error setting Hue light ${id}: ${error.message}`, 'error');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    router.post('/:id/off', async (req, res) => {
        const { id } = req.params;
        logWithTimestamp(`Turning off Hue light ${id}`, 'info');
        try {
            const light = hueLights.find(l => l.id === id);
            if (!light) {
                return res.status(404).json({ success: false, error: 'Light not found' });
            }
            await light.hueApi.lights.setLightState(id, new LightState().off());
            if (io) {
                io.emit('device-state-update', { id: `hue_${id}`, name: light.name, on: false });
            }
            res.json({ success: true, message: 'Light turned off successfully' });
        } catch (error) {
            logWithTimestamp(`Error turning off Hue light ${id}: ${error.message}`, 'error');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    return router;
};