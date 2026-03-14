/**
 * CameraService - Always-on camera management service
 * 
 * Starts with the server and manages all camera streams.
 * Provides frames to both UI and ML pipeline.
 * 
 * Architecture:
 * ┌─────────────────────────────────────────────────────────────┐
 * │                     CameraService                            │
 * │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
 * │  │CameraWorker │  │CameraWorker │  │CameraWorker │  ...    │
 * │  │  (cam 1)    │  │  (cam 2)    │  │  (cam 3)    │         │
 * │  │ FrameBuffer │  │ FrameBuffer │  │ FrameBuffer │         │
 * │  └─────────────┘  └─────────────┘  └─────────────┘         │
 * │         │                │                │                 │
 * │         ▼                ▼                ▼                 │
 * │  ┌───────────────────────────────────────────────────────┐ │
 * │  │              Frame Access API                          │ │
 * │  │  • getLatestFrame(ip) - UI thumbnails                  │ │
 * │  │  • getFrameBuffer(ip) - ML frame history               │ │
 * │  │  • getAllStatus() - Dashboard                          │ │
 * │  └───────────────────────────────────────────────────────┘ │
 * └─────────────────────────────────────────────────────────────┘
 */

const fs = require('fs');
const path = require('path');
const CameraWorker = require('./CameraWorker');

// Path to cameras config (same location as cameras.js API uses)
const CAMERAS_FILE = path.join(__dirname, '..', '..', 'config', 'cameras.json');

class CameraService {
    constructor() {
        this.workers = new Map();  // ip -> CameraWorker
        this.running = false;
        this.config = {
            autoStart: true,           // Start capturing on service start
            defaultFps: 30,            // Default 30fps for smooth video
            bufferSize: 150,           // Frames to keep in memory per camera
            healthCheckInterval: 30000 // Check camera health every 30s
        };
        this.healthCheckTimer = null;
    }

    /**
     * Initialize the service and load cameras from config
     */
    async initialize() {
        console.log('[CameraService] Initializing...');
        
        // Load cameras from config
        const cameras = this._loadCamerasConfig();
        
        if (cameras.length === 0) {
            console.log('[CameraService] No cameras configured. Add cameras via Settings or API.');
            return;
        }

        console.log(`[CameraService] Found ${cameras.length} cameras in config`);

        // Create workers for each camera
        for (const camera of cameras) {
            this._createWorker(camera);
        }

        // Start health check
        this._startHealthCheck();

        this.running = true;
        console.log('[CameraService] Initialized successfully');
    }

    /**
     * Load cameras from JSON config
     */
    _loadCamerasConfig() {
        try {
            if (!fs.existsSync(CAMERAS_FILE)) {
                console.log('[CameraService] No cameras.json found');
                return [];
            }

            const data = fs.readFileSync(CAMERAS_FILE, 'utf8');
            const config = JSON.parse(data);
            
            // Config can be { cameras: [...] } or just [...]
            const cameras = config.cameras || (Array.isArray(config) ? config : []);
            return cameras;
        } catch (err) {
            console.error('[CameraService] Error loading cameras.json:', err.message);
            return [];
        }
    }

    /**
     * Create a worker for a camera
     */
    _createWorker(camera) {
        // Auto-detect brand from rtspPath if not specified
        let brand = camera.brand;
        if (!brand && camera.rtspPath) {
            if (camera.rtspPath.includes('h264Preview')) {
                brand = 'reolink';
            } else if (camera.rtspPath.includes('realmonitor')) {
                brand = 'amcrest';  // Also Dahua (same protocol)
            } else if (camera.rtspPath.includes('Streaming/Channels')) {
                brand = 'hikvision';
            }
        }
        brand = brand || 'generic';
        
        // Use the configured rtspPath directly (main stream for full quality)
        // Note: For future ML pipeline, create a separate sub-stream worker
        const rtspPath = camera.rtspPath;
        
        const config = {
            ip: camera.ip,
            name: camera.name || camera.ip,
            username: camera.username || 'admin',
            password: camera.password || '',
            brand: brand,
            streamType: camera.mjpegPath ? 'mjpeg' : 'rtsp',
            rtspPath: rtspPath || camera.rtspPath,
            mjpegPath: camera.mjpegPath,
            fps: camera.fps || this.config.defaultFps,
            bufferSize: this.config.bufferSize
        };

        const worker = new CameraWorker(config);
        this.workers.set(camera.ip, worker);
        
        console.log(`[CameraService] Created worker for ${camera.name || camera.ip} (${camera.ip})`);
        
        return worker;
    }

    /**
     * Start all camera captures
     */
    startAll() {
        console.log(`[CameraService] Starting all ${this.workers.size} camera workers...`);
        
        for (const [ip, worker] of this.workers) {
            worker.start();
        }
    }

    /**
     * Stop all camera captures
     */
    stopAll() {
        console.log('[CameraService] Stopping all camera workers...');
        
        for (const [ip, worker] of this.workers) {
            worker.stop();
        }
    }

    /**
     * Start capture for a specific camera
     * @param {string} ip - Camera IP
     */
    startCamera(ip) {
        const worker = this.workers.get(ip);
        if (worker) {
            worker.start();
            return true;
        }
        return false;
    }

    /**
     * Stop capture for a specific camera
     * @param {string} ip - Camera IP
     */
    stopCamera(ip) {
        const worker = this.workers.get(ip);
        if (worker) {
            worker.stop();
            return true;
        }
        return false;
    }

    /**
     * Add a new camera (runtime, also saves to config)
     * @param {Object} camera - Camera config
     */
    addCamera(camera) {
        if (this.workers.has(camera.ip)) {
            console.log(`[CameraService] Camera ${camera.ip} already exists`);
            return false;
        }

        const worker = this._createWorker(camera);
        
        if (this.config.autoStart) {
            worker.start();
        }

        return true;
    }

    /**
     * Remove a camera
     * @param {string} ip - Camera IP
     */
    removeCamera(ip) {
        const worker = this.workers.get(ip);
        if (worker) {
            worker.stop();
            this.workers.delete(ip);
            return true;
        }
        return false;
    }

    /**
     * Get latest frame for a camera
     * @param {string} ip - Camera IP
     * @returns {Buffer|null} JPEG frame data
     */
    getLatestFrame(ip) {
        const worker = this.workers.get(ip);
        if (!worker) return null;
        return worker.getLatestFrame();
    }

    /**
     * Get frame buffer for ML access (last N frames)
     * @param {string} ip - Camera IP
     * @param {number} count - Number of frames (default: all in buffer)
     * @returns {Array} Array of frame objects
     */
    getFrameBuffer(ip, count) {
        const worker = this.workers.get(ip);
        if (!worker) return [];
        
        if (count) {
            return worker.frameBuffer.getRecent(count);
        }
        return worker.frameBuffer.getAll();
    }

    /**
     * Get status of a specific camera
     * @param {string} ip - Camera IP
     */
    getCameraStatus(ip) {
        const worker = this.workers.get(ip);
        if (!worker) return null;
        return worker.getStatus();
    }

    /**
     * Get status of all cameras
     */
    getAllStatus() {
        const status = {
            running: this.running,
            cameraCount: this.workers.size,
            cameras: []
        };

        for (const [ip, worker] of this.workers) {
            status.cameras.push(worker.getStatus());
        }

        // Summary stats
        const activeWorkers = status.cameras.filter(c => c.running && c.hasProcess);
        status.activeCameras = activeWorkers.length;
        status.totalFrames = status.cameras.reduce((sum, c) => sum + c.totalFrames, 0);
        status.totalMemoryMB = Math.round(
            status.cameras.reduce((sum, c) => sum + c.memoryUsageMB, 0) * 100
        ) / 100;

        return status;
    }

    /**
     * Periodic health check for camera workers
     * Auto-restarts cameras that are stuck (0fps for too long)
     * Gives up after max attempts to avoid restart loops
     */
    _startHealthCheck() {
        // Track consecutive zero-fps checks per camera
        this.zeroFpsCount = this.zeroFpsCount || new Map();
        // Track total restart attempts per camera (resets on success)
        this.restartAttempts = this.restartAttempts || new Map();
        
        const AUTO_RESTART_AFTER_CHECKS = 3;  // Restart after 3 consecutive 0fps checks (90s)
        const MAX_RESTART_ATTEMPTS = 3;       // Give up after 3 failed restarts
        
        this.healthCheckTimer = setInterval(() => {
            const status = this.getAllStatus();
            
            // Build FPS summary per camera
            const fpsInfo = status.cameras
                .filter(c => c.running)
                .map(c => `${c.name.replace('Camera ', '')}:${c.actualFps}fps`)
                .join(', ');
            
            // Log summary with per-camera FPS
            if (process.env.VERBOSE_LOGGING === 'true') console.log(`[CameraService] Health: ${status.activeCameras}/${status.cameraCount} active, ${status.totalMemoryMB}MB | ${fpsInfo || 'no active cameras'}`);

            // Check for stuck cameras (0fps) and auto-restart
            for (const cam of status.cameras) {
                if (!cam.running) continue;
                
                if (cam.actualFps === 0 && cam.frameCount === 0) {
                    // Camera is stuck - increment counter
                    const count = (this.zeroFpsCount.get(cam.ip) || 0) + 1;
                    this.zeroFpsCount.set(cam.ip, count);
                    
                    const attempts = this.restartAttempts.get(cam.ip) || 0;
                    
                    if (count >= AUTO_RESTART_AFTER_CHECKS) {
                        if (attempts >= MAX_RESTART_ATTEMPTS) {
                            // Already tried too many times - don't spam restarts
                            // Only log once when we first hit the limit
                            if (attempts === MAX_RESTART_ATTEMPTS) {
                                console.error(`[CameraService] ❌ Camera ${cam.ip} failed after ${MAX_RESTART_ATTEMPTS} restart attempts - giving up (check camera/network)`);
                                this.restartAttempts.set(cam.ip, attempts + 1);  // Increment so we don't log again
                            }
                        } else {
                            console.warn(`[CameraService] ⚠️ Camera ${cam.ip} stuck at 0fps - restart attempt ${attempts + 1}/${MAX_RESTART_ATTEMPTS}`);
                            this._restartCamera(cam.ip);
                            this.restartAttempts.set(cam.ip, attempts + 1);
                            this.zeroFpsCount.set(cam.ip, 0);  // Reset check counter
                        }
                    }
                    // Don't log every check - too spammy
                } else {
                    // Camera is healthy - reset ALL counters
                    this.zeroFpsCount.set(cam.ip, 0);
                    this.restartAttempts.set(cam.ip, 0);  // Success! Reset restart attempts
                }
                
                // Also check for stale cameras (no NEW frames in 60s but buffer has old ones)
                if (cam.running && cam.lastFrameAge > 60000 && cam.frameCount > 0) {
                    console.warn(`[CameraService] Camera ${cam.ip} stale - no new frames in ${Math.round(cam.lastFrameAge/1000)}s`);
                }
            }
        }, this.config.healthCheckInterval);
    }

    /**
     * Restart a camera worker (stop + start)
     * @param {string} ip - Camera IP
     */
    async _restartCamera(ip) {
        const worker = this.workers.get(ip);
        if (!worker) return false;
        
        worker.stop();
        // Brief delay to ensure FFmpeg cleans up
        await new Promise(resolve => setTimeout(resolve, 1000));
        worker.start();
        return true;
    }

    /**
     * Reload cameras from config (for when settings change)
     */
    async reload() {
        console.log('[CameraService] Reloading configuration...');
        
        // Stop all current workers
        this.stopAll();
        this.workers.clear();

        // Reinitialize
        await this.initialize();
        
        if (this.config.autoStart) {
            this.startAll();
        }
    }

    /**
     * Shutdown the service
     */
    shutdown() {
        console.log('[CameraService] Shutting down...');
        
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
        }
        
        this.stopAll();
        this.running = false;
    }
}

// Singleton instance
const cameraService = new CameraService();

module.exports = cameraService;
