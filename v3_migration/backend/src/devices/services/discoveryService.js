/**
 * discoveryService.js - Network Device Discovery via mDNS/Bonjour
 * 
 * Scans the local network for smart home devices using mDNS.
 * Discovers: Shelly, WLED, ESPHome, Hue Bridges, Chromecast, etc.
 */

const Bonjour = require('bonjour-service').Bonjour;
const dgram = require('dgram');
const http = require('http');
const https = require('https');
const os = require('os');
const logger = require('../../logging/logger');

// Known mDNS service types for smart home devices
const SERVICE_TYPES = [
    { type: 'http', protocol: 'tcp', name: 'HTTP Devices', category: 'generic' },
    { type: 'hue', protocol: 'tcp', name: 'Philips Hue', category: 'hue' },
    { type: 'shelly', protocol: 'tcp', name: 'Shelly Devices', category: 'shelly' },
    { type: 'wled', protocol: 'tcp', name: 'WLED', category: 'wled' },
    { type: 'esphomelib', protocol: 'tcp', name: 'ESPHome', category: 'esphome' },
    { type: 'googlecast', protocol: 'tcp', name: 'Chromecast', category: 'chromecast' },
    { type: 'airplay', protocol: 'tcp', name: 'AirPlay', category: 'airplay' },
    { type: 'homekit', protocol: 'tcp', name: 'HomeKit', category: 'homekit' },
];

// Device type detection based on hostname/txt records
const DEVICE_PATTERNS = [
    { pattern: /shelly/i, type: 'shelly', name: 'Shelly Device' },
    { pattern: /wled/i, type: 'wled', name: 'WLED Controller' },
    { pattern: /esphome|esp32|esp8266/i, type: 'esphome', name: 'ESPHome Device' },
    { pattern: /philips.hue|hue.bridge/i, type: 'hue', name: 'Philips Hue Bridge' },
    { pattern: /tasmota/i, type: 'tasmota', name: 'Tasmota Device' },
    { pattern: /sonoff/i, type: 'sonoff', name: 'Sonoff Device' },
    { pattern: /chromecast|google/i, type: 'chromecast', name: 'Chromecast' },
];

// Known device port signatures for active scanning
const DEVICE_SIGNATURES = [
    { port: 80, path: '/shelly', type: 'shelly', detectFn: (body) => body.includes('shelly') || body.includes('Shelly') },
    { port: 80, path: '/json/info', type: 'wled', detectFn: (body) => body.includes('"brand":"WLED"') || body.includes('"ver"') },
    { port: 80, path: '/cm?cmnd=Status', type: 'tasmota', detectFn: (body) => body.includes('"Status"') && body.includes('"Module"') },
    { port: 80, path: '/api/config', type: 'hue', detectFn: (body) => body.includes('bridgeid') || body.includes('Philips hue') },
    { port: 443, path: '/api/config', type: 'hue', https: true, detectFn: (body) => body.includes('bridgeid') },
    { port: 80, path: '/', type: 'esphome', detectFn: (body) => body.includes('ESPHome') || body.includes('esphome') },
    { port: 80, path: '/status', type: 'generic', detectFn: () => true }, // Generic HTTP device
];

class DiscoveryService {
    constructor() {
        this.discoveredDevices = new Map();
        this.isScanning = false;
        this.bonjour = null;
        this.browsers = [];
    }

    /**
     * Start a network scan for devices
     * @param {number} timeout - Scan duration in milliseconds (default 5000)
     * @param {boolean} includeSubnetScan - Whether to do active IP scanning (default true)
     * @returns {Promise<Array>} - Array of discovered devices
     */
    async scan(timeout = 5000, includeSubnetScan = true) {
        if (this.isScanning) {
            logger.log('Discovery scan already in progress', 'warn');
            return Array.from(this.discoveredDevices.values());
        }

        this.isScanning = true;
        this.discoveredDevices.clear();
        
        logger.log(`Starting network discovery scan (${timeout}ms timeout)...`, 'info');

        try {
            // Initialize Bonjour
            this.bonjour = new Bonjour();

            // Start mDNS discovery for each service type
            const scanPromises = SERVICE_TYPES.map(service => 
                this.browseService(service, timeout)
            );

            // Also scan for Kasa devices (they use UDP broadcast, not mDNS)
            scanPromises.push(this.scanKasaDevices(timeout));

            // Active subnet scanning for devices that don't announce via mDNS
            if (includeSubnetScan) {
                scanPromises.push(this.scanSubnet(timeout));
            }

            // Wait for all scans to complete
            await Promise.all(scanPromises);

            // Stop all browsers
            this.stopBrowsers();

        } catch (error) {
            logger.log(`Discovery scan error: ${error.message}`, 'error');
        } finally {
            this.isScanning = false;
            if (this.bonjour) {
                this.bonjour.destroy();
                this.bonjour = null;
            }
        }

        const devices = Array.from(this.discoveredDevices.values());
        logger.log(`Discovery complete. Found ${devices.length} devices.`, 'info');
        
        return devices;
    }

    /**
     * Browse for a specific mDNS service type
     */
    browseService(service, timeout) {
        return new Promise((resolve) => {
            try {
                const browser = this.bonjour.find({ type: service.type, protocol: service.protocol }, (foundService) => {
                    this.processDiscoveredService(foundService, service);
                });

                this.browsers.push(browser);

                // Stop after timeout
                setTimeout(() => {
                    resolve();
                }, timeout);

            } catch (error) {
                logger.log(`Error browsing ${service.type}: ${error.message}`, 'debug');
                resolve();
            }
        });
    }

    /**
     * Process a discovered mDNS service
     */
    processDiscoveredService(service, serviceType) {
        try {
            const ip = service.addresses?.find(addr => addr.includes('.')) || service.referer?.address;
            if (!ip) return;

            const deviceId = `${serviceType.category}_${ip.replace(/\./g, '_')}`;
            
            // Detect device type from name/host
            let detectedType = serviceType.category;
            let detectedName = service.name || service.host || 'Unknown Device';
            
            for (const pattern of DEVICE_PATTERNS) {
                if (pattern.pattern.test(service.name) || pattern.pattern.test(service.host)) {
                    detectedType = pattern.type;
                    break;
                }
            }

            const device = {
                id: deviceId,
                name: detectedName,
                type: detectedType,
                category: this.getCategoryLabel(detectedType),
                ip: ip,
                port: service.port || 80,
                host: service.host,
                protocol: 'http',
                discovered: true,
                discoveredAt: new Date().toISOString(),
                source: 'mdns',
                txt: service.txt || {},
                configured: false, // User needs to configure/add it
                capabilities: this.getDeviceCapabilities(detectedType)
            };

            // Don't duplicate
            if (!this.discoveredDevices.has(deviceId)) {
                this.discoveredDevices.set(deviceId, device);
                logger.log(`Discovered: ${device.name} (${device.type}) at ${ip}`, 'debug');
            }

        } catch (error) {
            logger.log(`Error processing service: ${error.message}`, 'debug');
        }
    }

    /**
     * Scan for TP-Link Kasa devices using UDP broadcast
     */
    scanKasaDevices(timeout) {
        return new Promise((resolve) => {
            try {
                const client = dgram.createSocket('udp4');
                
                // Kasa discovery message (encrypted)
                const discoveryMsg = Buffer.from([
                    0xd0, 0xf2, 0x81, 0xf8, 0x8b, 0xff, 0x9a, 0xf7,
                    0xd5, 0xef, 0x94, 0xb6, 0xd1, 0xb4, 0xc0, 0x9f,
                    0xec, 0x95, 0xe6, 0x8f, 0xe1, 0x87, 0xe8, 0xca,
                    0xf0, 0x8b, 0xf6, 0x8b, 0xf6, 0x8b, 0xf6
                ]);

                client.on('message', (msg, rinfo) => {
                    try {
                        // Decrypt Kasa response
                        const decrypted = this.decryptKasa(msg);
                        const data = JSON.parse(decrypted);
                        
                        if (data.system?.get_sysinfo) {
                            const info = data.system.get_sysinfo;
                            const deviceId = `kasa_${rinfo.address.replace(/\./g, '_')}`;
                            
                            const device = {
                                id: deviceId,
                                name: info.alias || info.dev_name || 'Kasa Device',
                                type: 'kasa',
                                category: 'TP-Link Kasa',
                                ip: rinfo.address,
                                port: 9999,
                                model: info.model || 'Unknown',
                                mac: info.mac,
                                discovered: true,
                                discoveredAt: new Date().toISOString(),
                                source: 'udp',
                                configured: false,
                                capabilities: this.getDeviceCapabilities('kasa', info)
                            };

                            if (!this.discoveredDevices.has(deviceId)) {
                                this.discoveredDevices.set(deviceId, device);
                                logger.log(`Discovered Kasa: ${device.name} at ${rinfo.address}`, 'debug');
                            }
                        }
                    } catch (e) {
                        // Not a Kasa device or parse error
                    }
                });

                client.on('error', () => {
                    client.close();
                    resolve();
                });

                client.bind(() => {
                    client.setBroadcast(true);
                    client.send(discoveryMsg, 9999, '255.255.255.255');
                });

                setTimeout(() => {
                    client.close();
                    resolve();
                }, timeout);

            } catch (error) {
                logger.log(`Kasa scan error: ${error.message}`, 'debug');
                resolve();
            }
        });
    }

    /**
     * Decrypt Kasa protocol response
     */
    decryptKasa(buffer) {
        let key = 171;
        let result = '';
        for (let i = 0; i < buffer.length; i++) {
            const c = buffer[i] ^ key;
            key = buffer[i];
            result += String.fromCharCode(c);
        }
        return result;
    }

    /**
     * Get human-readable category label
     */
    getCategoryLabel(type) {
        const labels = {
            'shelly': 'Shelly',
            'wled': 'WLED',
            'esphome': 'ESPHome',
            'hue': 'Philips Hue',
            'kasa': 'TP-Link Kasa',
            'tasmota': 'Tasmota',
            'sonoff': 'Sonoff',
            'chromecast': 'Chromecast',
            'airplay': 'AirPlay',
            'homekit': 'HomeKit',
            'generic': 'Other',
            'http': 'HTTP Device'
        };
        return labels[type] || 'Unknown';
    }

    /**
     * Get device capabilities based on type
     */
    getDeviceCapabilities(type, info = {}) {
        const capabilities = {
            'shelly': ['switch', 'power_monitoring', 'http_api'],
            'wled': ['rgb', 'effects', 'http_api', 'ws_api'],
            'esphome': ['custom', 'http_api'],
            'hue': ['bridge', 'rgb', 'dimmer'],
            'kasa': ['switch', 'dimmer', 'power_monitoring'],
            'tasmota': ['switch', 'mqtt', 'http_api'],
            'sonoff': ['switch', 'mqtt'],
            'chromecast': ['media', 'cast'],
            'generic': ['http']
        };
        
        return capabilities[type] || ['unknown'];
    }

    /**
     * Get the local network interface info
     * @returns {Object} - { ip, subnet, netmask }
     */
    getLocalNetworkInfo() {
        const interfaces = os.networkInterfaces();
        
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                // Skip loopback and non-IPv4
                if (iface.family === 'IPv4' && !iface.internal) {
                    const parts = iface.address.split('.');
                    const maskParts = iface.netmask.split('.');
                    
                    // Calculate subnet base
                    const subnet = parts.map((p, i) => 
                        (parseInt(p) & parseInt(maskParts[i])).toString()
                    ).join('.');
                    
                    return {
                        ip: iface.address,
                        subnet: subnet,
                        netmask: iface.netmask,
                        prefix: parts.slice(0, 3).join('.') // e.g., "192.168.1"
                    };
                }
            }
        }
        return null;
    }

    /**
     * Scan subnet by probing IP addresses directly
     * @param {number} timeout - Total scan time
     */
    async scanSubnet(timeout) {
        const networkInfo = this.getLocalNetworkInfo();
        if (!networkInfo) {
            logger.log('Could not determine local network interface', 'warn');
            return;
        }

        logger.log(`Scanning subnet ${networkInfo.prefix}.x for smart devices...`, 'info');

        const { prefix } = networkInfo;
        const probeTimeout = Math.min(1500, timeout / 2); // Per-IP timeout
        const concurrency = 50; // Scan 50 IPs at once
        
        // Generate IPs to scan (1-254, skip our own IP)
        const ipsToScan = [];
        const myLastOctet = parseInt(networkInfo.ip.split('.')[3]);
        
        for (let i = 1; i <= 254; i++) {
            if (i !== myLastOctet) {
                ipsToScan.push(`${prefix}.${i}`);
            }
        }

        // Scan in batches for better performance
        const batches = [];
        for (let i = 0; i < ipsToScan.length; i += concurrency) {
            batches.push(ipsToScan.slice(i, i + concurrency));
        }

        for (const batch of batches) {
            if (!this.isScanning) break; // Scan was cancelled
            
            await Promise.all(batch.map(ip => this.probeIP(ip, probeTimeout)));
        }
        
        logger.log(`Subnet scan complete`, 'debug');
    }

    /**
     * Probe a single IP address for known device signatures
     * @param {string} ip - IP address to probe
     * @param {number} timeout - Request timeout
     */
    async probeIP(ip, timeout) {
        // Try each device signature
        for (const sig of DEVICE_SIGNATURES) {
            // Skip if we already found this device
            const existingId = `${sig.type}_${ip.replace(/\./g, '_')}`;
            if (this.discoveredDevices.has(existingId)) continue;

            try {
                const result = await this.httpProbe(ip, sig.port, sig.path, timeout, sig.https);
                
                if (result.success && sig.detectFn(result.body)) {
                    // Found a device!
                    const deviceId = `${sig.type}_${ip.replace(/\./g, '_')}`;
                    
                    // Try to extract device name from response
                    let deviceName = this.extractDeviceName(result.body, sig.type) || `${sig.type} @ ${ip}`;
                    
                    const device = {
                        id: deviceId,
                        name: deviceName,
                        type: sig.type,
                        category: this.getCategoryLabel(sig.type),
                        ip: ip,
                        port: sig.port,
                        protocol: sig.https ? 'https' : 'http',
                        discovered: true,
                        discoveredAt: new Date().toISOString(),
                        source: 'subnet-scan',
                        configured: false,
                        capabilities: this.getDeviceCapabilities(sig.type)
                    };

                    this.discoveredDevices.set(deviceId, device);
                    logger.log(`Subnet scan found: ${device.name} (${sig.type}) at ${ip}`, 'info');
                    
                    // Found this device, no need to check other signatures
                    break;
                }
            } catch (e) {
                // Connection failed - IP not responding on this port
            }
        }
    }

    /**
     * Make an HTTP request to probe a device
     */
    httpProbe(ip, port, path, timeout, useHttps = false) {
        return new Promise((resolve) => {
            const protocol = useHttps ? https : http;
            
            const req = protocol.request({
                hostname: ip,
                port: port,
                path: path,
                method: 'GET',
                timeout: timeout,
                rejectUnauthorized: false, // Allow self-signed certs
                headers: {
                    'User-Agent': 'T2AutoTron-Discovery/1.0'
                }
            }, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    resolve({ success: res.statusCode < 400, body, statusCode: res.statusCode });
                });
            });

            req.on('error', () => resolve({ success: false, body: '', statusCode: 0 }));
            req.on('timeout', () => {
                req.destroy();
                resolve({ success: false, body: '', statusCode: 0 });
            });

            req.end();
        });
    }

    /**
     * Try to extract a device name from HTTP response
     */
    extractDeviceName(body, type) {
        try {
            // Try JSON first
            if (body.startsWith('{') || body.startsWith('[')) {
                const json = JSON.parse(body);
                
                // WLED
                if (json.info?.name) return json.info.name;
                if (json.name) return json.name;
                
                // Shelly
                if (json.device?.hostname) return json.device.hostname;
                if (json.hostname) return json.hostname;
                
                // Tasmota
                if (json.Status?.DeviceName) return json.Status.DeviceName;
                if (json.Status?.FriendlyName?.[0]) return json.Status.FriendlyName[0];
                
                // Hue
                if (json.name) return json.name;
                if (json.bridgeid) return `Hue Bridge ${json.bridgeid.slice(-6)}`;
            }
            
            // Try HTML title tag
            const titleMatch = body.match(/<title>([^<]+)<\/title>/i);
            if (titleMatch) return titleMatch[1];
            
        } catch (e) {
            // Ignore parse errors
        }
        return null;
    }

    /**
     * Stop all mDNS browsers
     */
    stopBrowsers() {
        for (const browser of this.browsers) {
            try {
                browser.stop();
            } catch (e) {
                // Ignore
            }
        }
        this.browsers = [];
    }

    /**
     * Get currently discovered devices (without rescanning)
     */
    getDiscoveredDevices() {
        return Array.from(this.discoveredDevices.values());
    }

    /**
     * Check if a scan is in progress
     */
    isScanInProgress() {
        return this.isScanning;
    }
}

// Export singleton
module.exports = new DiscoveryService();
