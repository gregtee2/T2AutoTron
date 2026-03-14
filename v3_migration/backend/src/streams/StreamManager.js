/**
 * StreamManager.js - Manages RTSP → HLS transcoding via FFmpeg
 * 
 * Spawns FFmpeg processes to convert RTSP camera streams to HLS format
 * that can be played in browsers using HLS.js
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Directory where HLS segments are stored
const STREAMS_DIR = path.join(__dirname, '../../streams');

// Active streams: Map<cameraIp, { process, startTime, viewers }>
const activeStreams = new Map();

// Ensure streams directory exists
function ensureStreamsDir() {
    if (!fs.existsSync(STREAMS_DIR)) {
        fs.mkdirSync(STREAMS_DIR, { recursive: true });
    }
}

/**
 * Common RTSP path templates by brand
 * Use these as presets in the UI
 */
const RTSP_PRESETS = {
    // Generic
    'generic': '/stream1',
    'generic-main': '/live/ch00_0',
    'generic-sub': '/live/ch00_1',
    
    // Amcrest / Dahua (same protocol)
    'amcrest-main': '/cam/realmonitor?channel=1&subtype=0',
    'amcrest-sub': '/cam/realmonitor?channel=1&subtype=1',
    
    // Hikvision
    'hikvision-main': '/Streaming/Channels/101',
    'hikvision-sub': '/Streaming/Channels/102',
    
    // Reolink
    'reolink-main': '/h264Preview_01_main',
    'reolink-sub': '/h264Preview_01_sub',
    
    // Foscam
    'foscam': '/videoMain',
    
    // ONVIF generic
    'onvif': '/onvif1',
    
    // TP-Link Tapo
    'tapo-main': '/stream1',
    'tapo-sub': '/stream2'
};

/**
 * Build RTSP URL from camera config
 */
function buildRtspUrl(camera) {
    // If camera has explicit rtspUrl, use it directly
    if (camera.rtspUrl) {
        return camera.rtspUrl;
    }
    
    // Otherwise build from components
    const user = camera.username || '';
    const pass = camera.password || '';
    const ip = camera.ip;
    const port = camera.rtspPort || 554;
    
    // Resolve RTSP path - check if it's a preset name or a direct path
    let rtspPath = camera.rtspPath || '/stream1';
    if (RTSP_PRESETS[rtspPath]) {
        rtspPath = RTSP_PRESETS[rtspPath];
    }
    // Ensure path starts with /
    if (!rtspPath.startsWith('/')) {
        rtspPath = '/' + rtspPath;
    }
    
    // Build URL with or without credentials
    if (user && pass) {
        return `rtsp://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${ip}:${port}${rtspPath}`;
    } else if (user) {
        return `rtsp://${encodeURIComponent(user)}@${ip}:${port}${rtspPath}`;
    }
    return `rtsp://${ip}:${port}${rtspPath}`;
}

/**
 * Get safe filename from IP (replace dots with underscores)
 */
function getSafeId(ip) {
    return ip.replace(/\./g, '_');
}

/**
 * Start streaming for a camera
 * @param {Object} camera - Camera config { ip, username, password, rtspPort, rtspPath, rtspUrl }
 * @returns {Object} { success, playlistUrl, error }
 */
function startStream(camera) {
    ensureStreamsDir();
    
    const ip = camera.ip;
    const safeId = getSafeId(ip);
    
    // Check if already streaming
    if (activeStreams.has(ip)) {
        const stream = activeStreams.get(ip);
        
        // Verify the FFmpeg process is actually still alive
        if (stream.process && !stream.process.killed) {
            try {
                // Send signal 0 to check if process exists (doesn't actually send a signal)
                process.kill(stream.process.pid, 0);
                // Process is alive, increment viewers
                stream.viewers++;
                console.log(`[StreamManager] Stream ${ip} already active, viewers: ${stream.viewers}`);
                return {
                    success: true,
                    playlistUrl: `/streams/${safeId}/index.m3u8`,
                    alreadyRunning: true
                };
            } catch (e) {
                // Process is dead, clean up stale entry
                console.log(`[StreamManager] Cleaning up stale stream entry for ${ip}`);
                activeStreams.delete(ip);
            }
        } else {
            // Process reference is null or marked killed, clean up
            console.log(`[StreamManager] Removing dead stream entry for ${ip}`);
            activeStreams.delete(ip);
        }
    }
    
    // Create output directory for this camera
    const outputDir = path.join(STREAMS_DIR, safeId);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const rtspUrl = buildRtspUrl(camera);
    const playlistPath = path.join(outputDir, 'index.m3u8');
    
    console.log(`[StreamManager] Starting stream for ${ip}`);
    console.log(`[StreamManager] RTSP URL: ${rtspUrl.replace(/:[^:@]+@/, ':****@')}`); // Hide password in logs
    
    // FFmpeg command for RTSP → HLS
    // - Low latency settings for near-realtime viewing
    // - H.264 copy if source is H.264, otherwise transcode
    // - Short segments (2 sec) with small playlist (3 segments)
    // - Audio DISABLED - many IP cameras have incompatible audio codecs (G.711, etc.)
    //   that cause browser buffer errors. Enable later if needed.
    const ffmpegArgs = [
        // Input options
        '-rtsp_transport', 'tcp',           // Use TCP for reliability
        '-i', rtspUrl,                       // Input RTSP stream
        
        // Video options - try to copy codec, fallback to transcode
        '-c:v', 'copy',                      // Copy video codec (no transcode if H.264)
        // '-c:v', 'libx264',                // Uncomment to force transcode
        // '-preset', 'ultrafast',           // Fast encoding if transcoding
        // '-tune', 'zerolatency',           // Low latency if transcoding
        
        // Audio options - DISABLED to avoid codec compatibility issues
        '-an',                               // No audio (prevents bufferAppendError)
        // '-c:a', 'aac',                    // Transcode audio to AAC (enable if audio needed)
        // '-b:a', '128k',                   // Audio bitrate
        
        // HLS options
        '-f', 'hls',                         // Output format
        '-hls_time', '2',                    // Segment duration (seconds)
        '-hls_list_size', '3',               // Number of segments in playlist
        '-hls_flags', 'delete_segments+append_list', // Clean up old segments
        '-hls_segment_filename', path.join(outputDir, 'segment_%03d.ts'),
        
        // Output playlist
        playlistPath
    ];
    
    // Log FFmpeg command without exposing password
    console.log(`[StreamManager] FFmpeg args: ffmpeg -rtsp_transport tcp -i ${rtspUrl.replace(/:[^:@]+@/, ':****@')} ... ${playlistPath}`);
    
    try {
        const ffmpeg = spawn('ffmpeg', ffmpegArgs, {
            stdio: ['ignore', 'pipe', 'pipe']
            // Note: Don't use windowsVerbatimArguments - it breaks argument parsing
        });
        
        // Log immediately if FFmpeg starts
        console.log(`[StreamManager] FFmpeg spawned with PID: ${ffmpeg.pid}`);
        
        let lastError = '';
        let ffmpegOutput = '';
        
        ffmpeg.stderr.on('data', (data) => {
            const msg = data.toString();
            ffmpegOutput += msg;
            // Only log errors/warnings, not the constant status updates
            if (msg.includes('error') || msg.includes('Error') || msg.includes('warning') || msg.includes('Invalid')) {
                console.error(`[StreamManager] FFmpeg ${ip}: ${msg.trim()}`);
                lastError = msg.trim();
            }
        });
        
        ffmpeg.on('error', (err) => {
            console.error(`[StreamManager] FFmpeg spawn error for ${ip}:`, err.message);
            activeStreams.delete(ip);
        });
        
        ffmpeg.on('exit', (code, signal) => {
            console.log(`[StreamManager] FFmpeg for ${ip} exited with code ${code}, signal ${signal}`);
            if (code !== 0 && lastError) {
                console.error(`[StreamManager] Last error for ${ip}: ${lastError}`);
            }
            // Log last 500 chars of output on non-zero exit
            if (code !== 0 && ffmpegOutput) {
                console.error(`[StreamManager] FFmpeg output tail for ${ip}:`, ffmpegOutput.slice(-500));
            }
            activeStreams.delete(ip);
            // Clean up segment files
            cleanupStreamDir(outputDir);
        });
        
        // Store active stream
        activeStreams.set(ip, {
            process: ffmpeg,
            startTime: Date.now(),
            viewers: 1,
            outputDir
        });
        
        return {
            success: true,
            playlistUrl: `/streams/${safeId}/index.m3u8`
        };
        
    } catch (err) {
        console.error(`[StreamManager] Failed to start stream for ${ip}:`, err.message);
        return {
            success: false,
            error: err.message
        };
    }
}

/**
 * Stop streaming for a camera
 * @param {string} ip - Camera IP
 * @param {boolean} force - Force stop even if viewers remain
 */
function stopStream(ip, force = false) {
    const stream = activeStreams.get(ip);
    if (!stream) {
        console.log(`[StreamManager] No active stream for ${ip}`);
        return { success: true, wasRunning: false };
    }
    
    stream.viewers--;
    
    if (stream.viewers > 0 && !force) {
        console.log(`[StreamManager] Stream ${ip} still has ${stream.viewers} viewers`);
        return { success: true, stopped: false, viewers: stream.viewers };
    }
    
    console.log(`[StreamManager] Stopping stream for ${ip}`);
    
    try {
        stream.process.kill('SIGTERM');
        
        // Give it a moment, then force kill if needed
        setTimeout(() => {
            if (activeStreams.has(ip)) {
                const s = activeStreams.get(ip);
                if (s.process && !s.process.killed) {
                    s.process.kill('SIGKILL');
                }
                activeStreams.delete(ip);
            }
        }, 2000);
        
        return { success: true, stopped: true };
    } catch (err) {
        console.error(`[StreamManager] Error stopping stream ${ip}:`, err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Clean up HLS segment files for a stream
 */
function cleanupStreamDir(outputDir) {
    try {
        if (fs.existsSync(outputDir)) {
            const files = fs.readdirSync(outputDir);
            for (const file of files) {
                fs.unlinkSync(path.join(outputDir, file));
            }
            fs.rmdirSync(outputDir);
            console.log(`[StreamManager] Cleaned up ${outputDir}`);
        }
    } catch (err) {
        console.error(`[StreamManager] Cleanup error:`, err.message);
    }
}

/**
 * Get status of all active streams
 */
function getActiveStreams() {
    const streams = [];
    for (const [ip, stream] of activeStreams) {
        streams.push({
            ip,
            viewers: stream.viewers,
            uptime: Math.round((Date.now() - stream.startTime) / 1000),
            playlistUrl: `/streams/${getSafeId(ip)}/index.m3u8`
        });
    }
    return streams;
}

/**
 * Check if a stream is active
 */
function isStreamActive(ip) {
    return activeStreams.has(ip);
}

/**
 * Stop all streams (for graceful shutdown)
 */
function stopAllStreams() {
    console.log(`[StreamManager] Stopping all ${activeStreams.size} streams`);
    for (const ip of activeStreams.keys()) {
        stopStream(ip, true);
    }
}

// Clean up on process exit
process.on('exit', stopAllStreams);

// Only handle SIGINT/SIGTERM in HA add-on mode (Docker container)
// In desktop mode, don't exit on signals - the user might just be pressing Ctrl+C in another terminal
const IS_HA_ADDON = !!process.env.SUPERVISOR_TOKEN;
if (IS_HA_ADDON) {
    process.on('SIGINT', () => { stopAllStreams(); process.exit(); });
    process.on('SIGTERM', () => { stopAllStreams(); process.exit(); });
} else {
    // Desktop mode: just stop streams but don't exit
    process.on('SIGINT', () => { 
        console.log('[StreamManager] SIGINT received but ignoring exit (desktop mode)');
        stopAllStreams(); 
    });
    process.on('SIGTERM', () => { 
        console.log('[StreamManager] SIGTERM received but ignoring exit (desktop mode)');
        stopAllStreams(); 
    });
}

module.exports = {
    startStream,
    stopStream,
    getActiveStreams,
    isStreamActive,
    stopAllStreams,
    STREAMS_DIR,
    RTSP_PRESETS  // Export presets for UI dropdown
};
