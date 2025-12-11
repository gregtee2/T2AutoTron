/**
 * Camera API Routes
 * Handles IP camera discovery and stream proxying
 */

const express = require('express');
const router = express.Router();
const net = require('net');
const http = require('http');
const https = require('https');

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
router.post('/', (req, res) => {
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
router.delete('/:ip', (req, res) => {
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
router.post('/credentials', (req, res) => {
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
 * GET /api/cameras/snapshot/:ip - Proxy camera snapshot
 * Fetches JPEG snapshot from camera and returns it
 */
router.get('/snapshot/:ip', async (req, res) => {
    const ip = req.params.ip;
    const camera = cameraConfig.cameras.find(c => c.ip === ip);
    
    if (!camera) {
        return res.status(404).json({ error: 'Camera not configured' });
    }
    
    // Common snapshot paths to try
    const snapshotPaths = [
        camera.snapshotPath,
        '/cgi-bin/snapshot.cgi',
        '/snapshot.jpg',
        '/image/jpeg.cgi',
        '/jpg/image.jpg',
        '/snap.jpg',
        '/onvif/snapshot',
        '/Streaming/Channels/1/picture'
    ].filter((v, i, a) => a.indexOf(v) === i); // Remove duplicates
    
    const auth = camera.username && camera.password 
        ? `${camera.username}:${camera.password}@` 
        : '';
    
    for (const snapshotPath of snapshotPaths) {
        try {
            const url = `http://${auth}${ip}${snapshotPath}`;
            
            const imageData = await new Promise((resolve, reject) => {
                const request = http.get(url, { timeout: 5000 }, (response) => {
                    if (response.statusCode === 401) {
                        reject(new Error('Authentication required'));
                        return;
                    }
                    if (response.statusCode !== 200) {
                        reject(new Error(`HTTP ${response.statusCode}`));
                        return;
                    }
                    
                    const chunks = [];
                    response.on('data', chunk => chunks.push(chunk));
                    response.on('end', () => resolve(Buffer.concat(chunks)));
                    response.on('error', reject);
                });
                
                request.on('error', reject);
                request.on('timeout', () => {
                    request.destroy();
                    reject(new Error('Timeout'));
                });
            });
            
            // Success - update camera config with working path
            if (camera.snapshotPath !== snapshotPath) {
                camera.snapshotPath = snapshotPath;
                saveConfig();
            }
            
            res.set('Content-Type', 'image/jpeg');
            res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
            return res.send(imageData);
            
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

module.exports = router;
