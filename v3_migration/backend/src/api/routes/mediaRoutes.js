/**
 * mediaRoutes.js
 * 
 * REST API routes for media player control via Home Assistant.
 * Handles streaming audio, volume control, and playback state.
 * 
 * 🦴 CAVEMAN VERSION:
 * These are the buttons for your jukebox:
 * - /play - Start playing music on a speaker
 * - /stop - Stop the music
 * - /volume - Turn the volume up or down
 * - /pause - Pause playback
 * - /resume - Resume playback
 */

const express = require('express');
const router = express.Router();
const homeAssistantManager = require('../../devices/managers/homeAssistantManager');
const logWithTimestamp = require('../../logging/logWithTimestamp');
const requireLocalOrPin = require('../middleware/requireLocalOrPin');

// Verbose logging flag
const VERBOSE = process.env.VERBOSE_LOGGING === 'true';

/**
 * Initialize media routes
 * @param {object} io - Socket.IO instance
 * @returns {express.Router}
 */
function createMediaRoutes(io) {

    /**
     * POST /play - Play media on a speaker
     * Body: { entityId, mediaUrl, mediaType, volume }
     */
    router.post('/play', requireLocalOrPin, async (req, res) => {
        const { entityId, mediaUrl, mediaType = 'music', volume } = req.body;

        if (!entityId || !mediaUrl) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required fields: entityId and mediaUrl' 
            });
        }

        try {
            // Set volume first if provided
            if (volume !== undefined) {
                await homeAssistantManager.callService('media_player', 'volume_set', {
                    entity_id: entityId,
                    volume_level: volume
                });
            }

            // Play the media
            await homeAssistantManager.callService('media_player', 'play_media', {
                entity_id: entityId,
                media_content_id: mediaUrl,
                media_content_type: mediaType
            });

            if (VERBOSE) logWithTimestamp(`▶️ Playing media on ${entityId}: ${mediaUrl}`, 'info');

            // Emit socket event for UI updates
            if (io) {
                io.emit('media-state-update', {
                    entityId,
                    state: 'playing',
                    mediaUrl
                });
            }

            res.json({ success: true, message: 'Playback started' });
        } catch (error) {
            logWithTimestamp(`❌ Media play error: ${error.message}`, 'error');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * POST /stop - Stop media playback
     * Body: { entityId }
     */
    router.post('/stop', requireLocalOrPin, async (req, res) => {
        const { entityId } = req.body;

        if (!entityId) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required field: entityId' 
            });
        }

        try {
            await homeAssistantManager.callService('media_player', 'media_stop', {
                entity_id: entityId
            });

            if (VERBOSE) logWithTimestamp(`⏹️ Stopped media on ${entityId}`, 'info');

            if (io) {
                io.emit('media-state-update', {
                    entityId,
                    state: 'stopped'
                });
            }

            res.json({ success: true, message: 'Playback stopped' });
        } catch (error) {
            logWithTimestamp(`❌ Media stop error: ${error.message}`, 'error');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * POST /pause - Pause media playback
     * Body: { entityId }
     */
    router.post('/pause', requireLocalOrPin, async (req, res) => {
        const { entityId } = req.body;

        if (!entityId) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required field: entityId' 
            });
        }

        try {
            await homeAssistantManager.callService('media_player', 'media_pause', {
                entity_id: entityId
            });

            logWithTimestamp(`⏸️ Paused media on ${entityId}`, 'info');

            if (io) {
                io.emit('media-state-update', {
                    entityId,
                    state: 'paused'
                });
            }

            res.json({ success: true, message: 'Playback paused' });
        } catch (error) {
            logWithTimestamp(`❌ Media pause error: ${error.message}`, 'error');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * POST /resume - Resume media playback
     * Body: { entityId }
     */
    router.post('/resume', requireLocalOrPin, async (req, res) => {
        const { entityId } = req.body;

        if (!entityId) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required field: entityId' 
            });
        }

        try {
            await homeAssistantManager.callService('media_player', 'media_play', {
                entity_id: entityId
            });

            logWithTimestamp(`▶️ Resumed media on ${entityId}`, 'info');

            if (io) {
                io.emit('media-state-update', {
                    entityId,
                    state: 'playing'
                });
            }

            res.json({ success: true, message: 'Playback resumed' });
        } catch (error) {
            logWithTimestamp(`❌ Media resume error: ${error.message}`, 'error');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * POST /volume - Set volume level
     * Body: { entityId, volume (0-1) }
     */
    router.post('/volume', requireLocalOrPin, async (req, res) => {
        const { entityId, volume } = req.body;

        if (!entityId || volume === undefined) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required fields: entityId and volume' 
            });
        }

        try {
            await homeAssistantManager.callService('media_player', 'volume_set', {
                entity_id: entityId,
                volume_level: Math.max(0, Math.min(1, volume))
            });

            logWithTimestamp(`🔊 Set volume on ${entityId} to ${Math.round(volume * 100)}%`, 'info');

            if (io) {
                io.emit('media-state-update', {
                    entityId,
                    volume: volume
                });
            }

            res.json({ success: true, message: 'Volume set' });
        } catch (error) {
            logWithTimestamp(`❌ Volume set error: ${error.message}`, 'error');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * GET /players - Get list of media players
     */
    router.get('/players', async (req, res) => {
        try {
            const devices = homeAssistantManager.getDevices();
            const mediaPlayers = devices.filter(d => 
                d.id?.includes('media_player') || 
                d.type === 'media_player'
            );

            res.json({ success: true, players: mediaPlayers });
        } catch (error) {
            logWithTimestamp(`❌ Get players error: ${error.message}`, 'error');
            res.status(500).json({ success: false, error: error.message });
        }
    });

    return router;
}

module.exports = createMediaRoutes;
