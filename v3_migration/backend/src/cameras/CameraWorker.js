/**
 * CameraWorker - Manages frame extraction for a single camera
 * 
 * Handles RTSP/MJPEG stream → FFmpeg → JPEG frames → FrameBuffer
 */

const { spawn } = require('child_process');
const path = require('path');
const FrameBuffer = require('./FrameBuffer');

// RTSP paths by brand (mainstream = high res, substream = low res for ML)
const RTSP_PATHS = {
    reolink: {
        main: '/h264Preview_01_main',
        sub: '/h264Preview_01_sub'
    },
    amcrest: {
        main: '/cam/realmonitor?channel=1&subtype=0',
        sub: '/cam/realmonitor?channel=1&subtype=1'
    },
    dahua: {
        main: '/cam/realmonitor?channel=1&subtype=0',
        sub: '/cam/realmonitor?channel=1&subtype=1'
    },
    hikvision: {
        main: '/Streaming/Channels/101',
        sub: '/Streaming/Channels/102'
    },
    generic: {
        main: '/stream1',
        sub: '/stream2'
    }
};

// MJPEG paths by brand
const MJPEG_PATHS = {
    amcrest: '/cgi-bin/mjpg/video.cgi?channel=1&subtype=1',
    dahua: '/cgi-bin/mjpg/video.cgi?channel=1&subtype=1',
    axis: '/axis-cgi/mjpg/video.cgi',
    foscam: '/cgi-bin/CGIStream.cgi?cmd=GetMJStream',
    generic: '/video.mjpg'
};

class CameraWorker {
    /**
     * Create a camera worker
     * @param {Object} config Camera configuration
     * @param {string} config.ip - Camera IP address
     * @param {string} config.name - Camera name
     * @param {string} config.username - Camera username
     * @param {string} config.password - Camera password
     * @param {string} config.brand - Camera brand (reolink, amcrest, etc.)
     * @param {string} config.streamType - 'rtsp' or 'mjpeg'
     * @param {number} config.fps - Target frames per second (default: 5)
     * @param {number} config.bufferSize - Frame buffer size (default: 50)
     */
    constructor(config) {
        this.ip = config.ip;
        this.name = config.name || config.ip;
        this.username = config.username || 'admin';
        this.password = config.password || '';
        this.brand = config.brand || 'generic';
        this.streamType = config.streamType || 'rtsp';
        this.targetFps = config.fps || 30;  // Default 30fps for smooth video
        this.useHwAccel = config.useHwAccel !== false;  // Enable GPU by default
        // Use MAIN stream for full resolution (not sub stream)
        this.rtspPath = config.rtspPath || RTSP_PATHS[this.brand]?.main || RTSP_PATHS.generic.main;
        this.mjpegPath = config.mjpegPath || MJPEG_PATHS[this.brand] || MJPEG_PATHS.generic;
        
        this.frameBuffer = new FrameBuffer(config.bufferSize || 150);  // Larger buffer for 30fps
        this.process = null;
        this.running = false;
        this.restartAttempts = 0;
        this.maxRestartAttempts = 5;
        this.restartDelay = 5000;
        this.lastError = null;
        this.startTime = null;
        
        // For MJPEG parsing
        this.mjpegBuffer = Buffer.alloc(0);
        
        // Warmup: TIME-based warmup to avoid green/corrupt startup frames
        // Reolink cameras output garbage until decoder gets a keyframe
        // Use time-based instead of frame-count since FPS bursts at startup
        this.warmupStartTime = null;
        this.warmupDurationMs = 3000;  // Skip frames for first 3 seconds
        
        // FPS tracking
        this.fpsCounter = 0;
        this.lastFpsTime = Date.now();
        this.actualFps = 0;
    }

    /**
     * Get the RTSP URL for this camera
     */
    getRtspUrl() {
        return `rtsp://${this.username}:${this.password}@${this.ip}${this.rtspPath}`;
    }

    /**
     * Get the MJPEG URL for this camera
     */
    getMjpegUrl() {
        return `http://${this.ip}${this.mjpegPath}`;
    }

    /**
     * Start capturing frames
     */
    start() {
        if (this.running) {
            console.log(`[CameraWorker ${this.ip}] Already running`);
            return;
        }

        console.log(`[CameraWorker ${this.ip}] Starting ${this.streamType.toUpperCase()} capture @ ${this.targetFps}fps`);
        this.running = true;
        this.startTime = Date.now();
        this.warmupStartTime = Date.now();  // Start warmup timer

        if (this.streamType === 'mjpeg') {
            this._startMjpegCapture();
        } else {
            this._startRtspCapture();
        }
    }

    /**
     * Start RTSP capture using FFmpeg
     */
    _startRtspCapture() {
        const rtspUrl = this.getRtspUrl();
        
        // FFmpeg command to extract frames from RTSP
        // Maximum quality for real-time viewing with RTX 6000
        const args = [];
        
        // NVIDIA hardware decode
        if (this.useHwAccel) {
            args.push('-hwaccel', 'cuda');
        }
        
        // Input options - robust handling for all camera brands
        args.push(
            '-rtsp_transport', 'tcp',
            '-fflags', '+discardcorrupt+genpts+nobuffer',  // Discard corrupt, generate timestamps, no buffering
            '-flags', 'low_delay',
            '-thread_queue_size', '4096',           // Larger input buffer for high-res streams
            '-analyzeduration', '5000000',          // 5 sec - longer analysis for Reolink
            '-probesize', '5000000',                // 5 MB - bigger probe for high bitrate
            '-i', rtspUrl,
            '-an'  // No audio
        );
        
        // Output as individual JPEG files to pipe
        // -q:v 2 = high quality JPEG (1-31 scale, lower = better)
        args.push(
            '-vf', `fps=${this.targetFps}`,
            '-f', 'image2pipe',
            '-vcodec', 'mjpeg',
            '-q:v', '2',
            '-'
        );

        this._spawnFfmpeg(args);
    }

    /**
     * Start MJPEG capture using FFmpeg (for cameras with native MJPEG)
     */
    _startMjpegCapture() {
        const mjpegUrl = this.getMjpegUrl();
        
        // For MJPEG, we need to handle auth. Using FFmpeg with http input
        const authUrl = `http://${this.username}:${this.password}@${this.ip}${this.mjpegPath}`;
        
        const args = [
            '-fflags', 'nobuffer',
            '-flags', 'low_delay',
            '-i', authUrl,
            '-an',
            '-vf', `fps=${this.targetFps}`,
            '-f', 'image2pipe',
            '-vcodec', 'mjpeg',
            '-q:v', '5',
            '-'
        ];

        this._spawnFfmpeg(args);
    }

    /**
     * Spawn FFmpeg process and handle output
     */
    _spawnFfmpeg(args) {
        // Use ffmpeg from PATH (same as StreamManager)
        // If you need a specific path, set FFMPEG_PATH environment variable
        const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';

        // Log full command for debugging
        const redactedArgs = args.map(a => a.includes('@') ? a.replace(/:([^:@]+)@/, ':***@') : a);
        console.log(`[CameraWorker ${this.ip}] FFmpeg command: ${ffmpegPath} ${redactedArgs.join(' ')}`);
        console.log(`[CameraWorker ${this.ip}] Spawning FFmpeg...`);
        
        this.process = spawn(ffmpegPath, args, {
            stdio: ['ignore', 'pipe', 'pipe']
        });

        // Buffer to accumulate JPEG data
        let jpegBuffer = Buffer.alloc(0);
        const SOI = Buffer.from([0xFF, 0xD8]);  // JPEG Start Of Image
        const EOI = Buffer.from([0xFF, 0xD9]);  // JPEG End Of Image

        this.process.stdout.on('data', (chunk) => {
            // Append new data
            jpegBuffer = Buffer.concat([jpegBuffer, chunk]);

            // Look for complete JPEG frames
            while (true) {
                const soiIndex = jpegBuffer.indexOf(SOI);
                if (soiIndex === -1) {
                    jpegBuffer = Buffer.alloc(0);
                    break;
                }

                // Trim anything before SOI
                if (soiIndex > 0) {
                    jpegBuffer = jpegBuffer.slice(soiIndex);
                }

                const eoiIndex = jpegBuffer.indexOf(EOI);
                if (eoiIndex === -1) {
                    // No complete frame yet
                    break;
                }

                // Extract complete JPEG frame
                const frameEnd = eoiIndex + 2;
                const frameData = jpegBuffer.slice(0, frameEnd);
                jpegBuffer = jpegBuffer.slice(frameEnd);

                // Skip suspiciously small frames (likely corrupt/green)
                // A valid JPEG should be at least 5KB
                const frameSizeKB = frameData.length / 1024;
                
                if (frameSizeKB < 5) {
                    // Skip this frame - definitely corrupt
                    continue;
                }

                // Time-based warmup: skip frames during initial warmup period
                // This avoids green frames from decoder startup
                const warmupNow = Date.now();
                if (this.warmupStartTime && (warmupNow - this.warmupStartTime) < this.warmupDurationMs) {
                    // Still in warmup period - skip this frame
                    continue;
                }

                // Store frame in buffer
                this.frameBuffer.push(frameData);
                
                // Track actual FPS
                this.fpsCounter++;
                const now = Date.now();
                if (now - this.lastFpsTime >= 1000) {
                    this.actualFps = this.fpsCounter;
                    this.fpsCounter = 0;
                    this.lastFpsTime = now;
                }
            }
        });

        // Throttle FFmpeg error logging to avoid spam
        let lastErrorLogTime = 0;
        let errorCount = 0;
        
        this.process.stderr.on('data', (data) => {
            const msg = data.toString();
            // Only log actual errors, not status messages
            if (msg.includes('error') || msg.includes('Error') || msg.includes('failed') || msg.includes('concealing')) {
                this.lastError = msg.trim();
                errorCount++;
                
                // Throttle: only log errors once per 10 seconds per camera
                const now = Date.now();
                if (now - lastErrorLogTime > 10000) {
                    if (errorCount > 1) {
                        console.error(`[CameraWorker ${this.ip}] FFmpeg: ${errorCount} errors (last: ${msg.trim().substring(0, 100)})`);
                    } else {
                        console.error(`[CameraWorker ${this.ip}] FFmpeg error: ${msg.trim().substring(0, 150)}`);
                    }
                    lastErrorLogTime = now;
                    errorCount = 0;
                }
            }
        });

        this.process.on('close', (code) => {
            console.log(`[CameraWorker ${this.ip}] FFmpeg exited with code ${code}`);
            this.process = null;
            
            if (this.running) {
                // Unexpected exit - try to restart
                this._handleRestart();
            }
        });

        this.process.on('error', (err) => {
            console.error(`[CameraWorker ${this.ip}] FFmpeg spawn error:`, err.message);
            this.lastError = err.message;
            this.process = null;
            
            if (this.running) {
                this._handleRestart();
            }
        });
    }

    /**
     * Handle automatic restart after failure
     */
    _handleRestart() {
        this.restartAttempts++;
        
        if (this.restartAttempts > this.maxRestartAttempts) {
            console.error(`[CameraWorker ${this.ip}] Max restart attempts (${this.maxRestartAttempts}) reached. Giving up.`);
            this.running = false;
            return;
        }

        const delay = this.restartDelay * this.restartAttempts;
        console.log(`[CameraWorker ${this.ip}] Restarting in ${delay}ms (attempt ${this.restartAttempts}/${this.maxRestartAttempts})`);
        
        setTimeout(() => {
            if (this.running) {
                if (this.streamType === 'mjpeg') {
                    this._startMjpegCapture();
                } else {
                    this._startRtspCapture();
                }
            }
        }, delay);
    }

    /**
     * Stop capturing frames
     */
    stop() {
        console.log(`[CameraWorker ${this.ip}] Stopping...`);
        this.running = false;
        
        if (this.process) {
            this.process.kill('SIGTERM');
            this.process = null;
        }
    }

    /**
     * Get the latest frame
     * @returns {Buffer|null} JPEG data or null
     */
    getLatestFrame() {
        const frame = this.frameBuffer.getLatest();
        return frame ? frame.data : null;
    }

    /**
     * Get worker status
     */
    getStatus() {
        const stats = this.frameBuffer.getStats();
        
        return {
            ip: this.ip,
            name: this.name,
            brand: this.brand,
            streamType: this.streamType,
            running: this.running,
            hasProcess: !!this.process,
            targetFps: this.targetFps,
            actualFps: this.actualFps,  // Real measured FPS
            frameCount: stats.frameCount,
            totalFrames: stats.totalFramesReceived,
            lastFrameAge: stats.lastFrameAge,
            bufferDuration: stats.bufferDuration,
            memoryUsageMB: Math.round(stats.memoryUsage / 1024 / 1024 * 100) / 100,
            uptime: this.startTime ? Date.now() - this.startTime : 0,
            restartAttempts: this.restartAttempts,
            lastError: this.lastError
        };
    }
}

module.exports = CameraWorker;
