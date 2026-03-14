/**
 * CameraDiscovery.js - Auto-detect camera make/model and RTSP paths
 * 
 * Inspired by Blue Iris's "Find/Inspect" feature.
 * Tries ONVIF discovery first, then falls back to probing common RTSP paths.
 */

const http = require('http');
const https = require('https');
const net = require('net');
const { spawn } = require('child_process');

/**
 * Common RTSP paths to probe if ONVIF fails
 * Ordered by popularity/likelihood
 */
const COMMON_RTSP_PATHS = [
    // Amcrest / Dahua
    { path: '/cam/realmonitor?channel=1&subtype=0', brand: 'Amcrest/Dahua', quality: 'main' },
    { path: '/cam/realmonitor?channel=1&subtype=1', brand: 'Amcrest/Dahua', quality: 'sub' },
    
    // Hikvision
    { path: '/Streaming/Channels/101', brand: 'Hikvision', quality: 'main' },
    { path: '/Streaming/Channels/102', brand: 'Hikvision', quality: 'sub' },
    { path: '/ISAPI/Streaming/channels/101', brand: 'Hikvision', quality: 'main' },
    
    // Reolink
    { path: '/h264Preview_01_main', brand: 'Reolink', quality: 'main' },
    { path: '/h264Preview_01_sub', brand: 'Reolink', quality: 'sub' },
    
    // Generic ONVIF
    { path: '/onvif1', brand: 'Generic ONVIF', quality: 'main' },
    { path: '/onvif2', brand: 'Generic ONVIF', quality: 'sub' },
    
    // Foscam
    { path: '/videoMain', brand: 'Foscam', quality: 'main' },
    { path: '/videoSub', brand: 'Foscam', quality: 'sub' },
    
    // TP-Link / Tapo
    { path: '/stream1', brand: 'Generic/Tapo', quality: 'main' },
    { path: '/stream2', brand: 'Generic/Tapo', quality: 'sub' },
    
    // Axis
    { path: '/axis-media/media.amp', brand: 'Axis', quality: 'main' },
    
    // Ubiquiti
    { path: '/s0', brand: 'Ubiquiti', quality: 'main' },
    { path: '/s1', brand: 'Ubiquiti', quality: 'sub' },
    
    // Generic fallbacks
    { path: '/live/ch00_0', brand: 'Generic', quality: 'main' },
    { path: '/live/ch00_1', brand: 'Generic', quality: 'sub' },
    { path: '/video1', brand: 'Generic', quality: 'main' },
    { path: '/video', brand: 'Generic', quality: 'main' },
    { path: '/', brand: 'Generic', quality: 'main' }
];

/**
 * ONVIF SOAP envelope for GetSystemDateAndTime (simple ping)
 */
const ONVIF_GET_DATE_TIME = `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">
  <s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
    <GetSystemDateAndTime xmlns="http://www.onvif.org/ver10/device/wsdl"/>
  </s:Body>
</s:Envelope>`;

/**
 * ONVIF SOAP envelope for GetDeviceInformation
 */
function buildGetDeviceInfo(username, password) {
    // For now, try without auth first (some cameras allow this)
    return `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">
  <s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
    <GetDeviceInformation xmlns="http://www.onvif.org/ver10/device/wsdl"/>
  </s:Body>
</s:Envelope>`;
}

/**
 * ONVIF SOAP envelope for GetCapabilities
 */
const ONVIF_GET_CAPABILITIES = `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">
  <s:Body>
    <GetCapabilities xmlns="http://www.onvif.org/ver10/device/wsdl">
      <Category>All</Category>
    </GetCapabilities>
  </s:Body>
</s:Envelope>`;

/**
 * ONVIF SOAP envelope for GetProfiles (media service)
 */
const ONVIF_GET_PROFILES = `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">
  <s:Body>
    <GetProfiles xmlns="http://www.onvif.org/ver10/media/wsdl"/>
  </s:Body>
</s:Envelope>`;

/**
 * Build GetStreamUri request for a profile
 */
function buildGetStreamUri(profileToken) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">
  <s:Body>
    <GetStreamUri xmlns="http://www.onvif.org/ver10/media/wsdl">
      <StreamSetup>
        <Stream xmlns="http://www.onvif.org/ver10/schema">RTP-Unicast</Stream>
        <Transport xmlns="http://www.onvif.org/ver10/schema">
          <Protocol>RTSP</Protocol>
        </Transport>
      </StreamSetup>
      <ProfileToken>${profileToken}</ProfileToken>
    </GetStreamUri>
  </s:Body>
</s:Envelope>`;
}

/**
 * Make HTTP request with timeout
 */
function httpRequest(options, body = null, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, data }));
        });
        
        req.setTimeout(timeout, () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
        
        req.on('error', reject);
        
        if (body) {
            req.write(body);
        }
        req.end();
    });
}

/**
 * Check if a port is open
 */
function checkPort(ip, port, timeout = 2000) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(timeout);
        
        socket.connect(port, ip, () => {
            socket.destroy();
            resolve(true);
        });
        
        socket.on('error', () => resolve(false));
        socket.on('timeout', () => {
            socket.destroy();
            resolve(false);
        });
    });
}

/**
 * Try ONVIF discovery on a camera
 */
async function tryOnvifDiscovery(ip, port = 80, username = '', password = '') {
    console.log(`[Discovery] Trying ONVIF on ${ip}:${port}...`);
    
    const result = {
        success: false,
        manufacturer: null,
        model: null,
        firmware: null,
        profiles: [],
        rtspUrls: [],
        mediaServicePath: null
    };
    
    try {
        // Step 1: Try GetSystemDateAndTime (basic connectivity check)
        const dateTimeOptions = {
            hostname: ip,
            port: port,
            path: '/onvif/device_service',
            method: 'POST',
            headers: {
                'Content-Type': 'application/soap+xml; charset=utf-8'
            }
        };
        
        const dateTimeRes = await httpRequest(dateTimeOptions, ONVIF_GET_DATE_TIME, 5000);
        
        if (dateTimeRes.status !== 200) {
            console.log(`[Discovery] ONVIF GetSystemDateAndTime failed: HTTP ${dateTimeRes.status}`);
            return result;
        }
        
        console.log(`[Discovery] ONVIF responded on ${ip}`);
        
        // Step 2: Get device information
        const deviceInfoRes = await httpRequest(dateTimeOptions, buildGetDeviceInfo(username, password), 5000);
        
        if (deviceInfoRes.status === 200) {
            // Parse manufacturer/model from XML
            const mfgMatch = deviceInfoRes.data.match(/<(?:\w+:)?Manufacturer>([^<]+)<\/(?:\w+:)?Manufacturer>/);
            const modelMatch = deviceInfoRes.data.match(/<(?:\w+:)?Model>([^<]+)<\/(?:\w+:)?Model>/);
            const fwMatch = deviceInfoRes.data.match(/<(?:\w+:)?FirmwareVersion>([^<]+)<\/(?:\w+:)?FirmwareVersion>/);
            
            result.manufacturer = mfgMatch ? mfgMatch[1] : null;
            result.model = modelMatch ? modelMatch[1] : null;
            result.firmware = fwMatch ? fwMatch[1] : null;
            
            console.log(`[Discovery] Device: ${result.manufacturer} ${result.model}`);
        }
        
        // Step 3: Get capabilities to find media service path
        const capabilitiesRes = await httpRequest(dateTimeOptions, ONVIF_GET_CAPABILITIES, 5000);
        
        if (capabilitiesRes.status === 200) {
            // Find media service URL
            const mediaMatch = capabilitiesRes.data.match(/<(?:\w+:)?Media[^>]*>[\s\S]*?<(?:\w+:)?XAddr>([^<]+)<\/(?:\w+:)?XAddr>/);
            if (mediaMatch) {
                // Extract path from URL
                const mediaUrl = mediaMatch[1];
                const pathMatch = mediaUrl.match(/https?:\/\/[^\/]+(\/.*)/);
                result.mediaServicePath = pathMatch ? pathMatch[1] : '/onvif/media_service';
                console.log(`[Discovery] Media service: ${result.mediaServicePath}`);
            }
        }
        
        // Step 4: Get stream profiles
        const mediaPath = result.mediaServicePath || '/onvif/media_service';
        const mediaOptions = {
            hostname: ip,
            port: port,
            path: mediaPath,
            method: 'POST',
            headers: {
                'Content-Type': 'application/soap+xml; charset=utf-8'
            }
        };
        
        const profilesRes = await httpRequest(mediaOptions, ONVIF_GET_PROFILES, 5000);
        
        if (profilesRes.status === 200) {
            // Extract profile tokens
            const tokenMatches = profilesRes.data.matchAll(/<(?:\w+:)?Profiles[^>]*token="([^"]+)"[^>]*>/g);
            const nameMatches = profilesRes.data.matchAll(/<(?:\w+:)?Name>([^<]+)<\/(?:\w+:)?Name>/g);
            
            const tokens = [...tokenMatches].map(m => m[1]);
            const names = [...nameMatches].map(m => m[1]);
            
            console.log(`[Discovery] Found ${tokens.length} profiles`);
            
            // Step 5: Get stream URI for each profile
            for (let i = 0; i < tokens.length; i++) {
                const token = tokens[i];
                const name = names[i] || `Profile ${i + 1}`;
                
                const uriRes = await httpRequest(mediaOptions, buildGetStreamUri(token), 5000);
                
                if (uriRes.status === 200) {
                    const uriMatch = uriRes.data.match(/<(?:\w+:)?Uri>([^<]+)<\/(?:\w+:)?Uri>/);
                    if (uriMatch) {
                        let rtspUrl = uriMatch[1];
                        // Decode HTML entities
                        rtspUrl = rtspUrl.replace(/&amp;/g, '&');
                        
                        // Extract just the path portion
                        const pathMatch = rtspUrl.match(/rtsp:\/\/[^\/]+(\/.*)/);
                        const path = pathMatch ? pathMatch[1] : rtspUrl;
                        
                        result.profiles.push({
                            name: name,
                            token: token,
                            rtspPath: path,
                            rtspUrl: rtspUrl
                        });
                        result.rtspUrls.push(rtspUrl);
                        
                        console.log(`[Discovery] Profile "${name}": ${path}`);
                    }
                }
            }
        }
        
        result.success = result.profiles.length > 0;
        return result;
        
    } catch (err) {
        console.log(`[Discovery] ONVIF error: ${err.message}`);
        return result;
    }
}

/**
 * Probe RTSP path with FFprobe to check if it works
 */
function probeRtspPath(ip, port, path, username, password, timeout = 5000) {
    return new Promise((resolve) => {
        // Build RTSP URL
        let rtspUrl;
        if (username && password) {
            rtspUrl = `rtsp://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${ip}:${port}${path}`;
        } else {
            rtspUrl = `rtsp://${ip}:${port}${path}`;
        }
        
        // Use FFprobe to test if stream is valid
        const ffprobe = spawn('ffprobe', [
            '-rtsp_transport', 'tcp',
            '-i', rtspUrl,
            '-v', 'error',
            '-show_entries', 'stream=codec_type,codec_name,width,height',
            '-of', 'json'
        ]);
        
        let stdout = '';
        let stderr = '';
        
        const timer = setTimeout(() => {
            ffprobe.kill('SIGTERM');
            resolve({ success: false, error: 'Timeout' });
        }, timeout);
        
        ffprobe.stdout.on('data', (data) => stdout += data);
        ffprobe.stderr.on('data', (data) => stderr += data);
        
        ffprobe.on('close', (code) => {
            clearTimeout(timer);
            
            if (code === 0 && stdout) {
                try {
                    const info = JSON.parse(stdout);
                    const streams = info.streams || [];
                    const video = streams.find(s => s.codec_type === 'video');
                    
                    resolve({
                        success: true,
                        path: path,
                        rtspUrl: rtspUrl.replace(/:[^:@]+@/, ':****@'), // Hide password
                        codec: video?.codec_name,
                        width: video?.width,
                        height: video?.height
                    });
                } catch (e) {
                    resolve({ success: false, error: 'Parse error' });
                }
            } else {
                resolve({ success: false, error: stderr.slice(0, 100) });
            }
        });
        
        ffprobe.on('error', (err) => {
            clearTimeout(timer);
            resolve({ success: false, error: err.message });
        });
    });
}

/**
 * Main discovery function - tries ONVIF first, then probes common paths
 */
async function inspectCamera(ip, username = '', password = '', options = {}) {
    const {
        onvifPort = 80,
        rtspPort = 554,
        probeTimeout = 8000
    } = options;
    
    console.log(`[Discovery] Starting inspection of ${ip}...`);
    
    const result = {
        ip: ip,
        success: false,
        method: null,
        manufacturer: null,
        model: null,
        firmware: null,
        profiles: [],
        workingPath: null,
        workingUrl: null,
        videoInfo: null,
        probed: []
    };
    
    // Step 1: Check if RTSP port is open
    const rtspOpen = await checkPort(ip, rtspPort);
    console.log(`[Discovery] RTSP port ${rtspPort}: ${rtspOpen ? 'OPEN' : 'CLOSED'}`);
    
    if (!rtspOpen) {
        result.error = `RTSP port ${rtspPort} is not responding`;
        return result;
    }
    
    // Step 2: Try ONVIF discovery
    const onvifResult = await tryOnvifDiscovery(ip, onvifPort, username, password);
    
    if (onvifResult.success) {
        result.success = true;
        result.method = 'ONVIF';
        result.manufacturer = onvifResult.manufacturer;
        result.model = onvifResult.model;
        result.firmware = onvifResult.firmware;
        result.profiles = onvifResult.profiles;
        
        // Use the first (main) profile as the working path
        if (onvifResult.profiles.length > 0) {
            result.workingPath = onvifResult.profiles[0].rtspPath;
        }
        
        console.log(`[Discovery] ONVIF success! ${result.manufacturer} ${result.model}`);
        return result;
    }
    
    // Step 3: ONVIF failed, probe common RTSP paths
    console.log(`[Discovery] ONVIF failed, probing common RTSP paths...`);
    
    for (const probe of COMMON_RTSP_PATHS) {
        console.log(`[Discovery] Probing ${probe.path}...`);
        
        const probeResult = await probeRtspPath(ip, rtspPort, probe.path, username, password, probeTimeout);
        result.probed.push({ ...probe, result: probeResult });
        
        if (probeResult.success) {
            result.success = true;
            result.method = 'Probe';
            result.manufacturer = probe.brand;
            result.workingPath = probe.path;
            result.workingUrl = probeResult.rtspUrl;
            result.videoInfo = {
                codec: probeResult.codec,
                width: probeResult.width,
                height: probeResult.height
            };
            
            // Add as a profile
            result.profiles.push({
                name: `${probe.quality} stream`,
                rtspPath: probe.path
            });
            
            console.log(`[Discovery] Found working path: ${probe.path} (${probe.brand})`);
            console.log(`[Discovery] Video: ${probeResult.codec} ${probeResult.width}x${probeResult.height}`);
            
            return result;
        }
    }
    
    // Nothing worked
    result.error = 'Could not find a working RTSP stream. Check username/password.';
    console.log(`[Discovery] No working RTSP path found`);
    
    return result;
}

module.exports = {
    inspectCamera,
    tryOnvifDiscovery,
    probeRtspPath,
    checkPort,
    COMMON_RTSP_PATHS
};
