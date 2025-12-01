// src/routes/matterRoutes.js
const express = require('express');
const router = express.Router();

module.exports = (io, matterManager) => {
    router.get('/homepod/status', async (req, res) => {
        const homePod = matterManager.getHomePod();
        if (!homePod) {
            res.json({ success: false, message: 'HomePod not discovered' });
        } else {
            const connected = await matterManager.verifyHomePodConnection();
            res.json({ success: true, connected, details: homePod });
        }
    });

    router.get('/devices', (req, res) => {
        res.json({ success: true, devices: matterManager.getDevices() });
    });

    return router;
};