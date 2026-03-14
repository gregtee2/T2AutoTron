// src/routes/matterRoutes.js
const express = require('express');
const router = express.Router();

module.exports = (io, matterManager) => {
    router.get('/homepod/status', async (req, res) => {
        try {
            const homePod = matterManager.getHomePod();
            if (!homePod) {
                return res.json({ success: false, error: 'HomePod not discovered' });
            }
            const connected = await matterManager.verifyHomePodConnection();
            res.json({ success: true, connected, details: homePod });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    router.get('/devices', (req, res) => {
        res.json({ success: true, devices: matterManager.getDevices() });
    });

    return router;
};