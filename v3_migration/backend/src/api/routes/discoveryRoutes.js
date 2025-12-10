/**
 * discoveryRoutes.js - API endpoints for network device discovery
 */

const express = require('express');
const discoveryService = require('../../devices/services/discoveryService');

module.exports = (io, deviceService) => {
    const router = express.Router();

    /**
     * POST /api/discovery/scan
     * Start a network scan for devices
     * 
     * Body: { timeout: 5000 } (optional, in milliseconds)
     */
    router.post('/scan', async (req, res) => {
        try {
            const timeout = req.body.timeout || 5000;
            
            if (discoveryService.isScanInProgress()) {
                return res.status(409).json({
                    success: false,
                    error: 'Scan already in progress',
                    devices: discoveryService.getDiscoveredDevices()
                });
            }

            console.log(`[Discovery] Starting network scan (${timeout}ms timeout)...`);
            const devices = await discoveryService.scan(timeout);

            // Emit discovery results via Socket.IO
            if (io) {
                io.emit('discovery-complete', { count: devices.length, devices });
            }

            res.json({
                success: true,
                count: devices.length,
                devices: devices,
                scanDuration: timeout
            });

        } catch (error) {
            console.error('[Discovery] Scan error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * GET /api/discovery/devices
     * Get last discovered devices (without rescanning)
     */
    router.get('/devices', (req, res) => {
        try {
            const devices = discoveryService.getDiscoveredDevices();
            res.json({
                success: true,
                count: devices.length,
                devices: devices
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * GET /api/discovery/status
     * Check if a scan is in progress
     */
    router.get('/status', (req, res) => {
        res.json({
            success: true,
            scanning: discoveryService.isScanInProgress()
        });
    });

    return router;
};
