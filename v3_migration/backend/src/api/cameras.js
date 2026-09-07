/**
 * Camera API Routes
 * Handles IP camera discovery and stream proxying
 */

const express = require('express');
const router = express.Router();
const net = require('net');
const http = require('http');
const https = require('https');
const { execSync } = require('child_process');
const requireLocalOrPin = require('./middleware/requireLocalOrPin');

// Stream manager for RTSP → HLS
const streamManager = require('../streams/StreamManager');

// Camera service for always-on frame capture
const { cameraService } = require('../cameras');

// Camera discovery (ONVIF + path probing)
const cameraDiscovery = require('../discovery/CameraDiscovery');

// Camera configuration stored in memory (could be persisted to file)
let cameraConfig = {
    cameras: [],
    defaultCredentials: {
        username: '',
        password: ''
    },
    subnet: '192.168.1.',
    rangeStart: 1,
    rangeEnd: 254
};

// Load saved config on startup
const fs = require('fs');
const path = require('path');
const configPath = path.join(__dirname, '../../config/cameras.json');

try {
    if (fs.existsSync(configPath)) {
        cameraConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        console.log(`[Cameras] Loaded ${cameraConfig.cameras?.length || 0} cameras from config`);
    }
} catch (err) {
    console.error('[Cameras] Error loading config:', err.message);
}

// Save config helper
function saveConfig() {
    try {
        const configDir = path.dirname(configPath);
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }
        fs.writeFileSync(configPath, JSON.stringify(cameraConfig, null, 2));
    } catch (err) {
        console.error('[Cameras] Error saving config:', err.message);
    }
}

/**
 * Check if a port is open on an IP
 */
function checkPort(ip, port, timeout = 1500) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(timeout);

        socket
            .connect(port, ip, () => {
                socket.destroy();
                resolve({ ip, port, status: 'open' });
            })
            .on('error', () => {
                resolve({ ip, port, status: 'closed' });
            })
            .on('timeout', () => {
                socket.destroy();
                resolve({ ip, port, status: 'closed' });
            });
    });
}

/**
 * POST /api/cameras/inspect - Inspect a camera to auto-detect make/model and RTSP path
 * This is the "Find/Inspect" feature like Blue Iris has
 */
router.post('/inspect', async (req, res) => {
    const { ip, username, password, onvifPort = 80, rtspPort = 554 } = req.body;
    
    if (!ip) {
        return res.status(400).json({ error: 'IP address is required' });
    }
    
    console.log(`[Cameras] Inspecting camera at ${ip}...`);
    
    try {
        const result = await cameraDiscovery.inspectCamera(ip, username, password, {
            onvifPort,
            rtspPort
        });
        
        console.log(`[Cameras] Inspection result: ${result.success ? 'SUCCESS' : 'FAILED'} - ${result.method || 'no method'}`);
        
        res.json(result);
    } catch (err) {
        console.error(`[Cameras] Inspection error:`, err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/cameras - List configured cameras
 */
router.get('/', (req, res) => {
    res.json({
        cameras: cameraConfig.cameras,
        defaultCredentials: {
            username: cameraConfig.defaultCredentials?.username || '',
            hasPassword: !!cameraConfig.defaultCredentials?.password
        }
    });
});

/**
 * POST /api/cameras - Add or update a camera
 */
router.post('/', requireLocalOrPin, (req, res) => {
    const { ip, name, username, password, snapshotPath, rtspPath } = req.body;
    
    if (!ip) {
        return res.status(400).json({ error: 'IP address is required' });
    }
    
    // Check if camera already exists
    const existingIndex = cameraConfig.cameras.findIndex(c => c.ip === ip);
    const existingCamera = existingIndex >= 0 ? cameraConfig.cameras[existingIndex] : null;
    
    const camera = {
        ip,
        name: name || existingCamera?.name || `Camera ${ip}`,
        username: username !== undefined ? username : (existingCamera?.username || cameraConfig.defaultCredentials?.username || ''),
        // Only update password if a new one is provided (non-empty string)
        password: password ? password : (existingCamera?.password || cameraConfig.defaultCredentials?.password || ''),
        snapshotPath: snapshotPath || existingCamera?.snapshotPath || '/cgi-bin/snapshot.cgi',
        rtspPath: rtspPath || existingCamera?.rtspPath || '/stream1',
        addedAt: existingCamera?.addedAt || new Date().toISOString()
    };
    
    if (existingIndex >= 0) {
        cameraConfig.cameras[existingIndex] = camera;
    } else {
        cameraConfig.cameras.push(camera);
    }
    
    saveConfig();
    res.json({ success: true, camera });
});

/**
 * DELETE /api/cameras/:ip - Remove a camera
 */
router.delete('/:ip', requireLocalOrPin, (req, res) => {
    const ip = req.params.ip;
    const initialLength = cameraConfig.cameras.length;
    cameraConfig.cameras = cameraConfig.cameras.filter(c => c.ip !== ip);
    
    if (cameraConfig.cameras.length < initialLength) {
        saveConfig();
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Camera not found' });
    }
});

/**
 * POST /api/cameras/credentials - Set default credentials
 */
router.post('/credentials', requireLocalOrPin, (req, res) => {
    const { username, password } = req.body;
    cameraConfig.defaultCredentials = { username, password };
    saveConfig();
    res.json({ success: true });
});

/**
 * POST /api/cameras/discover - Scan network for cameras
 */
router.post('/discover', async (req, res) => {
    const { subnet, rangeStart, rangeEnd } = req.body;
    
    const scanSubnet = subnet || cameraConfig.subnet || '192.168.1.';
    const start = rangeStart || cameraConfig.rangeStart || 1;
    const end = rangeEnd || cameraConfig.rangeEnd || 254;
    
    console.log(`[Cameras] Starting discovery on ${scanSubnet}${start}-${end}`);
    
    const PORTS = [80, 554, 8080]; // HTTP, RTSP, Alt HTTP
    const CONCURRENCY = 30;
    const TIMEOUT = 1000;
    
    const ipList = Array.from({ length: end - start + 1 }, (_, i) => `${scanSubnet}${i + start}`);
    const results = [];
    
    // Process in batches
    for (let i = 0; i < ipList.length; i += CONCURRENCY) {
        const batch = ipList.slice(i, i + CONCURRENCY);
        const batchResults = await Promise.all(
            batch.flatMap(ip => PORTS.map(port => checkPort(ip, port, TIMEOUT)))
        );
        
        // Group by IP
        batchResults.forEach(result => {
            if (result.status === 'open') {
                const existing = results.find(r => r.ip === result.ip);
                if (existing) {
                    existing.ports.push(result.port);
                } else {
                    results.push({ ip: result.ip, ports: [result.port] });
                }
            }
        });
    }
    
    // Filter to likely cameras (have RTSP or multiple ports)
    const likelyCameras = results.filter(r => 
        r.ports.includes(554) || r.ports.length >= 2
    );
    
    console.log(`[Cameras] Discovery complete. Found ${likelyCameras.length} potential cameras`);
    
    res.json({
        success: true,
        found: likelyCameras,
        scanned: { subnet: scanSubnet, start, end }
    });
});

/**
 * Fetch snapshot using curl with digest auth support
 * Many cameras (Amcrest, Dahua) require digest auth which Node.js http doesn't support natively
 */
function fetchSnapshotWithCurl(url, username, password) {
    try {
        // Build curl command with both basic and digest auth support
        const authArgs = username && password ? `--anyauth -u "${username}:${password}"` : '';
        const cmd = `curl ${authArgs} "${url}" --max-time 10 --silent --output -`;
        
        // Execute curl and capture binary output
        const buffer = execSync(cmd, { 
            encoding: 'buffer',
            maxBuffer: 10 * 1024 * 1024  // 10MB max
        });
        
        // Verify it's a JPEG (starts with 0xFF 0xD8)
        if (buffer.length > 2 && buffer[0] === 0xFF && buffer[1] === 0xD8) {
            return buffer;
        }
        return null;
    } catch (err) {
        return null;
    }
}

/**
 * GET /api/cameras/snapshot/:ip - Proxy camera snapshot
 * Fetches JPEG snapshot from camera and returns it
 * Supports both basic and digest authentication via curl
 */
router.get('/snapshot/:ip', async (req, res) => {
    const ip = req.params.ip;
    const camera = cameraConfig.cameras.find(c => c.ip === ip);
    
    if (!camera) {
        return res.status(404).json({ error: 'Camera not configured' });
    }
    
    // Use camera-specific credentials, fall back to default credentials
    const username = camera.username || cameraConfig.defaultCredentials?.username || '';
    const password = camera.password || cameraConfig.defaultCredentials?.password || '';
    
    // Common snapshot paths to try (includes Reolink, Hikvision, Dahua, Amcrest, etc.)
    const snapshotPaths = [
        camera.snapshotPath,
        // Reolink
        `/cgi-bin/api.cgi?cmd=Snap&channel=0&user=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
        // Generic CGI
        '/cgi-bin/snapshot.cgi',
        '/snapshot.jpg',
        '/image/jpeg.cgi',
        '/jpg/image.jpg',
        '/snap.jpg',
        '/onvif/snapshot',
        // Hikvision
        '/Streaming/Channels/1/picture',
        '/ISAPI/Streaming/channels/1/picture',
        // Dahua / Amcrest
        '/cgi-bin/snapshot.cgi?channel=1',
        // Foscam
        '/snapshot.cgi',
        '/cgi-bin/CGIProxy.fcgi?cmd=snapPicture2'
    ].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i); // Remove nulls and duplicates
    
    for (const snapshotPath of snapshotPaths) {
        try {
            const url = `http://${ip}${snapshotPath}`;
            
            // Use curl for snapshot (supports both basic and digest auth)
            const imageData = fetchSnapshotWithCurl(url, username, password);
            
            if (imageData && imageData.length > 1000) {
                // Success - update camera config with working path
                if (camera.snapshotPath !== snapshotPath) {
                    camera.snapshotPath = snapshotPath;
                    saveConfig();
                }
                
                res.set('Content-Type', 'image/jpeg');
                res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
                return res.send(imageData);
            }
            
        } catch (err) {
            // Try next path
            continue;
        }
    }
    
    res.status(502).json({ error: 'Could not fetch snapshot from camera' });
});

/**
 * GET /api/cameras/test/:ip - Test camera connection
 */
router.get('/test/:ip', async (req, res) => {
    const ip = req.params.ip;
    const camera = cameraConfig.cameras.find(c => c.ip === ip);
    
    const results = {
        ip,
        http: false,
        rtsp: false,
        snapshot: false
    };
    
    // Test HTTP port
    const httpResult = await checkPort(ip, 80, 2000);
    results.http = httpResult.status === 'open';
    
    // Test RTSP port  
    const rtspResult = await checkPort(ip, 554, 2000);
    results.rtsp = rtspResult.status === 'open';
    
    // Test snapshot if camera is configured
    if (camera) {
        try {
            const auth = camera.username && camera.password 
                ? `${camera.username}:${camera.password}@` 
                : '';
            const url = `http://${auth}${ip}${camera.snapshotPath || '/cgi-bin/snapshot.cgi'}`;
            
            await new Promise((resolve, reject) => {
                const request = http.get(url, { timeout: 3000 }, (response) => {
                    if (response.statusCode === 200) {
                        results.snapshot = true;
                    }
                    response.destroy();
                    resolve();
                });
                request.on('error', () => resolve());
                request.on('timeout', () => { request.destroy(); resolve(); });
            });
        } catch (err) {
            // Snapshot test failed
        }
    }
    
    res.json(results);
});

// =============================================================================
// RTSP STREAMING ROUTES
// =============================================================================

/**
 * POST /api/cameras/stream/:ip/start - Start RTSP → HLS stream
 */
router.post('/stream/:ip/start', (req, res) => {
    const ip = req.params.ip;
    const camera = cameraConfig.cameras.find(c => c.ip === ip);
    
    if (!camera) {
        return res.status(404).json({ error: 'Camera not found', ip });
    }
    
    // Build camera config for stream manager
    // Use camera-specific creds, fall back to defaults
    const username = camera.username || cameraConfig.defaultCredentials?.username || '';
    const password = camera.password || cameraConfig.defaultCredentials?.password || '';
    
    const streamConfig = {
        ip: camera.ip,
        username: username,
        password: password,
        rtspPort: camera.rtspPort || 554,
        rtspPath: camera.rtspPath || 'amcrest-main',  // Default to Amcrest since that's what user has
        rtspUrl: camera.rtspUrl  // Optional explicit URL
    };
    
    console.log(`[Cameras] Starting stream for ${ip}`);
    console.log(`[Cameras] Using credentials: user=${username ? username : '(none)'}, pass=${password ? '****' : '(none)'}, path=${streamConfig.rtspPath}`);
    const result = streamManager.startStream(streamConfig);
    
    res.json(result);
});

/**
 * POST /api/cameras/stream/:ip/stop - Stop RTSP stream
 */
router.post('/stream/:ip/stop', (req, res) => {
    const ip = req.params.ip;
    const force = req.body.force === true;
    
    console.log(`[Cameras] Stopping stream for ${ip} (force=${force})`);
    const result = streamManager.stopStream(ip, force);
    
    res.json(result);
});

/**
 * GET /api/cameras/stream/:ip/status - Check if stream is active
 */
router.get('/stream/:ip/status', (req, res) => {
    const ip = req.params.ip;
    const isActive = streamManager.isStreamActive(ip);
    const safeId = ip.replace(/\./g, '_');
    
    res.json({
        ip,
        active: isActive,
        playlistUrl: isActive ? `/streams/${safeId}/index.m3u8` : null
    });
});

/**
 * GET /api/cameras/streams - List all active streams
 */
router.get('/streams', (req, res) => {
    res.json({
        streams: streamManager.getActiveStreams()
    });
});

/**
 * GET /api/cameras/rtsp-presets - Get RTSP path presets for common camera brands
 */
router.get('/rtsp-presets', (req, res) => {
    res.json({
        presets: streamManager.RTSP_PRESETS
    });
});

/**
 * PUT /api/cameras/:ip/rtsp - Update camera RTSP settings
 */
router.put('/:ip/rtsp', requireLocalOrPin, (req, res) => {
    const ip = req.params.ip;
    const { rtspPort, rtspPath, rtspUrl } = req.body;
    
    const camera = cameraConfig.cameras.find(c => c.ip === ip);
    if (!camera) {
        return res.status(404).json({ error: 'Camera not found' });
    }
    
    // Update RTSP settings
    if (rtspPort !== undefined) camera.rtspPort = rtspPort;
    if (rtspPath !== undefined) camera.rtspPath = rtspPath;
    if (rtspUrl !== undefined) camera.rtspUrl = rtspUrl;
    
    saveConfig();
    
    res.json({ success: true, camera });
});

// =============================================================================
// MJPEG Live Stream Proxy
// =============================================================================

/**
 * Common MJPEG paths by camera brand
 * subtype=1 is usually the substream (lower quality, less bandwidth)
 */
const MJPEG_PATHS = {
    'amcrest': '/cgi-bin/mjpg/video.cgi?channel=1&subtype=1',
    'dahua': '/cgi-bin/mjpg/video.cgi?channel=1&subtype=1',
    'hikvision': '/ISAPI/Streaming/channels/102/httpPreview',  // 102 = channel 1, substream
    'foscam': '/cgi-bin/CGIStream.cgi?cmd=GetMJStream&usr={user}&pwd={pass}',
    'reolink': null,  // Reolink doesn't have native MJPEG, use RTSP→MJPEG conversion
    'generic': '/mjpg/video.mjpg'
};

/**
 * GET /api/cameras/mjpeg/:ip - Proxy MJPEG stream from camera
 * 
 * This provides a live video stream that can be used directly in an <img> tag:
 *   <img src="/api/cameras/mjpeg/192.168.1.69" />
 * 
 * The browser will continuously receive JPEG frames - true live video with no JS!
 */
router.get('/mjpeg/:ip', async (req, res) => {
    const ip = req.params.ip;
    const camera = cameraConfig.cameras.find(c => c.ip === ip);
    
    if (!camera) {
        return res.status(404).json({ error: 'Camera not configured' });
    }
    
    const username = camera.username || cameraConfig.defaultCredentials?.username || '';
    const password = camera.password || cameraConfig.defaultCredentials?.password || '';
    
    // Determine MJPEG path based on camera type or use stored mjpegPath
    let mjpegPath = camera.mjpegPath;
    if (!mjpegPath) {
        // Try to detect from camera type or use Amcrest/Dahua as default
        mjpegPath = MJPEG_PATHS['amcrest'];  // Most common
    }
    
    // Replace {user} and {pass} placeholders if present
    mjpegPath = mjpegPath.replace('{user}', encodeURIComponent(username))
                         .replace('{pass}', encodeURIComponent(password));
    
    const url = `http://${ip}${mjpegPath}`;
    
    console.log(`[Cameras] MJPEG proxy starting for ${ip}: ${mjpegPath}`);
    
    // We need to use a child process with curl for digest auth support
    // Stream the output directly to the response
    const { spawn } = require('child_process');
    
    const curlArgs = [
        '--digest',  // Support digest auth
        '-u', `${username}:${password}`,
        '-s',  // Silent
        '-N',  // No buffering
        url
    ];
    
    const curl = spawn('curl', curlArgs);
    
    // Set response headers for MJPEG
    res.setHeader('Content-Type', 'multipart/x-mixed-replace; boundary=myboundary');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Pipe curl output directly to response
    curl.stdout.pipe(res);
    
    curl.stderr.on('data', (data) => {
        const msg = data.toString();
        if (msg.includes('error') || msg.includes('Error')) {
            console.error(`[Cameras] MJPEG curl error for ${ip}:`, msg);
        }
    });
    
    curl.on('error', (err) => {
        console.error(`[Cameras] MJPEG spawn error for ${ip}:`, err.message);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to start MJPEG stream' });
        }
    });
    
    curl.on('exit', (code) => {
        if (code !== 0) {
            console.log(`[Cameras] MJPEG stream for ${ip} ended with code ${code}`);
        }
    });
    
    // Clean up when client disconnects
    req.on('close', () => {
        console.log(`[Cameras] MJPEG client disconnected for ${ip}`);
        curl.kill('SIGTERM');
    });
});

/**
 * PUT /api/cameras/:ip/mjpeg - Update camera MJPEG path
 */
router.put('/:ip/mjpeg', requireLocalOrPin, (req, res) => {
    const ip = req.params.ip;
    const { mjpegPath } = req.body;
    
    const camera = cameraConfig.cameras.find(c => c.ip === ip);
    if (!camera) {
        return res.status(404).json({ error: 'Camera not found' });
    }
    
    camera.mjpegPath = mjpegPath;
    saveConfig();
    
    res.json({ success: true, camera });
});

/**
 * GET /api/cameras/mjpeg-paths - Get available MJPEG path presets
 */
router.get('/mjpeg-paths', (req, res) => {
    res.json({ presets: MJPEG_PATHS });
});

// ============================================================================
// CAMERA SERVICE ENDPOINTS (Always-on frame capture for ML)
// ============================================================================

/**
 * GET /api/cameras/service/status - Get camera service status
 */
router.get('/service/status', (req, res) => {
    try {
        const status = cameraService.getAllStatus();
        res.json(status);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/cameras/service/start - Start all camera workers
 */
router.post('/service/start', requireLocalOrPin, (req, res) => {
    try {
        cameraService.startAll();
        res.json({ success: true, message: 'All cameras started' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/cameras/service/stop - Stop all camera workers
 */
router.post('/service/stop', requireLocalOrPin, (req, res) => {
    try {
        cameraService.stopAll();
        res.json({ success: true, message: 'All cameras stopped' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/cameras/service/reload - Reload cameras from config
 */
router.post('/service/reload', requireLocalOrPin, async (req, res) => {
    try {
        await cameraService.reload();
        cameraService.startAll();
        res.json({ success: true, message: 'Camera service reloaded' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/cameras/frame/:ip - Get latest frame from camera service
 * Returns JPEG image from the always-on frame buffer
 */
router.get('/frame/:ip', (req, res) => {
    const { ip } = req.params;
    
    try {
        const frame = cameraService.getLatestFrame(ip);
        
        if (!frame) {
            // Camera not active or no frames yet
            return res.status(404).json({ 
                error: 'No frame available',
                hint: 'Camera may not be started or still buffering'
            });
        }
        
        res.set('Content-Type', 'image/jpeg');
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.send(frame);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/cameras/frames/:ip - Get frame buffer for ML (multiple frames)
 * Query params: count (number of frames, default 10)
 */
router.get('/frames/:ip', (req, res) => {
    const { ip } = req.params;
    const count = parseInt(req.query.count) || 10;
    
    try {
        const frames = cameraService.getFrameBuffer(ip, count);
        
        if (frames.length === 0) {
            return res.status(404).json({ 
                error: 'No frames available',
                hint: 'Camera may not be started'
            });
        }
        
        // Return frame metadata (not the actual image data - that would be huge)
        // ML service can request individual frames by index
        res.json({
            cameraIp: ip,
            frameCount: frames.length,
            frames: frames.map(f => ({
                index: f.index,
                timestamp: f.timestamp,
                size: f.data.length
            }))
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/cameras/frame/:ip/:index - Get specific frame by index
 */
router.get('/frame/:ip/:index', (req, res) => {
    const { ip, index } = req.params;
    const frameIndex = parseInt(index);
    
    try {
        const frames = cameraService.getFrameBuffer(ip);
        const frame = frames.find(f => f.index === frameIndex);
        
        if (!frame) {
            return res.status(404).json({ error: 'Frame not found' });
        }
        
        res.set('Content-Type', 'image/jpeg');
        res.set('X-Frame-Index', frame.index);
        res.set('X-Frame-Timestamp', frame.timestamp);
        res.send(frame.data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/cameras/service/camera/:ip/start - Start specific camera
 */
router.post('/service/camera/:ip/start', requireLocalOrPin, (req, res) => {
    const { ip } = req.params;
    
    const success = cameraService.startCamera(ip);
    if (success) {
        res.json({ success: true, message: `Camera ${ip} started` });
    } else {
        res.status(404).json({ error: `Camera ${ip} not found` });
    }
});

/**
 * POST /api/cameras/service/camera/:ip/stop - Stop specific camera
 */
router.post('/service/camera/:ip/stop', requireLocalOrPin, (req, res) => {
    const { ip } = req.params;
    
    const success = cameraService.stopCamera(ip);
    if (success) {
        res.json({ success: true, message: `Camera ${ip} stopped` });
    } else {
        res.status(404).json({ error: `Camera ${ip} not found` });
    }
});

/**
 * GET /api/cameras/service/camera/:ip/status - Get specific camera status
 */
router.get('/service/camera/:ip/status', (req, res) => {
    const { ip } = req.params;
    
    const status = cameraService.getCameraStatus(ip);
    if (status) {
        res.json(status);
    } else {
        res.status(404).json({ error: `Camera ${ip} not found` });
    }
});

/**
 * GET /api/cameras/mjpeg/:ip - MJPEG streaming endpoint
 * Returns continuous MJPEG stream for smooth real-time playback
 * Query params: fps (target fps, default 15, max 30)
 */
router.get('/mjpeg/:ip', (req, res) => {
    const { ip } = req.params;
    const targetFps = Math.min(30, Math.max(1, parseInt(req.query.fps) || 15));
    const frameInterval = Math.floor(1000 / targetFps);
    
    console.log(`[Cameras] Starting MJPEG stream for ${ip} @ ${targetFps}fps (interval: ${frameInterval}ms)`);
    
    // Check if camera exists
    const status = cameraService.getCameraStatus(ip);
    if (!status) {
        return res.status(404).json({ error: `Camera ${ip} not found` });
    }
    
    // Set up MJPEG stream headers
    res.setHeader('Content-Type', 'multipart/x-mixed-replace; boundary=frame');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    let isStreaming = true;
    let framesSent = 0;
    
    // Function to send a frame
    const sendFrame = () => {
        if (!isStreaming) return false;
        
        try {
            const frame = cameraService.getLatestFrame(ip);
            if (!frame) {
                return false;
            }
            
            // Write MJPEG frame with boundary
            res.write('--frame\r\n');
            res.write('Content-Type: image/jpeg\r\n');
            res.write(`Content-Length: ${frame.length}\r\n`);
            res.write('\r\n');
            res.write(frame);
            res.write('\r\n');
            framesSent++;
            return true;
        } catch (err) {
            console.log(`[Cameras] MJPEG write error for ${ip}: ${err.message}`);
            return false;
        }
    };
    
    // Send first frame immediately
    sendFrame();
    
    // Stream frames at target FPS
    const streamInterval = setInterval(() => {
        if (!isStreaming) {
            clearInterval(streamInterval);
            return;
        }
        
        if (!sendFrame()) {
            // Failed to send - client may have disconnected
        }
    }, frameInterval);
    
    // Clean up on client disconnect
    req.on('close', () => {
        console.log(`[Cameras] MJPEG stream closed for ${ip} (sent ${framesSent} frames)`);
        isStreaming = false;
        clearInterval(streamInterval);
    });
    
    res.on('error', () => {
        isStreaming = false;
        clearInterval(streamInterval);
    });
});

module.exports = router;
