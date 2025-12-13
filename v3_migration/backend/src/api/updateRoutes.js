/**
 * Update Routes - API endpoints for update checking and application
 */

const express = require('express');
const router = express.Router();
const updateService = require('../services/updateService');
const requireLocalOrPin = require('./middleware/requireLocalOrPin');

// Updates are a high-risk operation: restrict to localhost or valid PIN
router.use(requireLocalOrPin);

/**
 * GET /api/update/check
 * Check for available updates
 */
router.get('/check', async (req, res) => {
    try {
        const forceCheck = req.query.force === 'true';
        const updateInfo = await updateService.checkForUpdates(forceCheck);
        res.json(updateInfo);
    } catch (err) {
        console.error('[UpdateRoutes] Check failed:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/update/apply
 * Apply available update (git pull + restart)
 */
router.post('/apply', async (req, res) => {
    try {
        // Send immediate response
        res.json({ status: 'updating', message: 'Update process started...' });
        
        // Apply update (this will restart the server)
        const result = await updateService.applyUpdate();
        
        // If we get here, something went wrong (server should have restarted)
        if (!result.success) {
            console.error('[UpdateRoutes] Update failed:', result.error);
        }
    } catch (err) {
        console.error('[UpdateRoutes] Apply failed:', err);
        // Can't send response here as we already sent one
    }
});

/**
 * POST /api/update/plugins
 * Hot-update plugins only (no server restart needed)
 * This pulls only the plugins folder from stable branch
 */
router.post('/plugins', async (req, res) => {
    try {
        const result = await updateService.updatePluginsOnly();
        res.json(result);
    } catch (err) {
        console.error('[UpdateRoutes] Plugin update failed:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/update/plugins/check
 * Check if plugin updates are available
 */
router.get('/plugins/check', async (req, res) => {
    try {
        const result = await updateService.checkPluginUpdates();
        res.json(result);
    } catch (err) {
        console.error('[UpdateRoutes] Plugin check failed:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/update/version
 * Get current version info
 */
router.get('/version', (req, res) => {
    res.json(updateService.getVersionInfo());
});

module.exports = router;
