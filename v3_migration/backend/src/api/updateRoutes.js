/**
 * Update Routes - API endpoints for update checking and application
 */

const express = require('express');
const router = express.Router();
const updateService = require('../services/updateService');

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
 * GET /api/update/version
 * Get current version info
 */
router.get('/version', (req, res) => {
    res.json(updateService.getVersionInfo());
});

module.exports = router;
