import React, { useState, useCallback } from 'react';
import { apiFetch } from '../auth/authClient';

/**
 * DiscoveryPanel - Network Device Discovery UI Component
 * 
 * Scans the local network for smart home devices using mDNS/Bonjour
 * and displays discovered devices with their connection status.
 */

const DEVICE_TYPE_INFO = {
    shelly: { icon: '🔌', color: '#ff9800', label: 'Shelly' },
    wled: { icon: '💡', color: '#e040fb', label: 'WLED' },
    esphome: { icon: '📡', color: '#00bcd4', label: 'ESPHome' },
    hue: { icon: '🌉', color: '#ffc107', label: 'Philips Hue' },
    kasa: { icon: '🔋', color: '#4caf50', label: 'TP-Link Kasa' },
    tasmota: { icon: '⚡', color: '#ff5722', label: 'Tasmota' },
    chromecast: { icon: '📺', color: '#5c6bc0', label: 'Chromecast' },
    homekit: { icon: '🏠', color: '#607d8b', label: 'HomeKit' },
    airplay: { icon: '🎵', color: '#9c27b0', label: 'AirPlay' },
    generic: { icon: '📦', color: '#78909c', label: 'HTTP Device' },
    http: { icon: '🌐', color: '#78909c', label: 'HTTP Device' }
};

export function DiscoveryPanel() {
    const [devices, setDevices] = useState([]);
    const [scanning, setScanning] = useState(false);
    const [error, setError] = useState(null);
    const [lastScan, setLastScan] = useState(null);
    const [scanTimeout, setScanTimeout] = useState(5000);
    const [expandedDevice, setExpandedDevice] = useState(null);

    const handleScan = useCallback(async () => {
        setScanning(true);
        setError(null);
        
        try {
            const response = await apiFetch('/api/discovery/scan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ timeout: scanTimeout })
            });
            
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || `Scan failed (${response.status})`);
            }
            
            const data = await response.json();
            setDevices(data.devices || []);
            setLastScan(new Date());
            
        } catch (err) {
            console.error('[Discovery] Scan error:', err);
            setError(err.message);
        } finally {
            setScanning(false);
        }
    }, [scanTimeout]);

    const getDeviceTypeInfo = (type) => {
        return DEVICE_TYPE_INFO[type] || DEVICE_TYPE_INFO.generic;
    };

    const formatTimestamp = (isoString) => {
        if (!isoString) return '';
        const date = new Date(isoString);
        return date.toLocaleTimeString();
    };

    const groupDevicesByType = (devices) => {
        const groups = {};
        for (const device of devices) {
            const type = device.type || 'generic';
            if (!groups[type]) groups[type] = [];
            groups[type].push(device);
        }
        return groups;
    };

    const deviceGroups = groupDevicesByType(devices);

    return (
        <div className="discovery-panel">
            {/* Header with scan button */}
            <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                marginBottom: '16px'
            }}>
                <div>
                    <div style={{ fontSize: '11px', color: '#8a959e', marginBottom: '4px' }}>
                        Scan your network for smart home devices
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <label style={{ fontSize: '11px', color: '#8a959e' }}>Timeout:</label>
                        <select 
                            value={scanTimeout}
                            onChange={(e) => setScanTimeout(Number(e.target.value))}
                            disabled={scanning}
                            style={{
                                background: '#2a3238',
                                color: '#c5cdd3',
                                border: '1px solid rgba(95, 179, 179, 0.3)',
                                borderRadius: '4px',
                                padding: '4px 8px',
                                fontSize: '11px'
                            }}
                        >
                            <option value={3000}>3 seconds</option>
                            <option value={5000}>5 seconds</option>
                            <option value={10000}>10 seconds</option>
                            <option value={15000}>15 seconds</option>
                        </select>
                    </div>
                </div>
                
                <button
                    onClick={handleScan}
                    disabled={scanning}
                    style={{
                        padding: '10px 20px',
                        background: scanning ? 'rgba(95, 179, 179, 0.2)' : 'rgba(95, 179, 179, 0.15)',
                        border: '1px solid rgba(95, 179, 179, 0.5)',
                        borderRadius: '6px',
                        color: scanning ? '#8a959e' : '#5fb3b3',
                        cursor: scanning ? 'not-allowed' : 'pointer',
                        fontSize: '13px',
                        fontWeight: 500,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        transition: 'all 0.2s'
                    }}
                >
                    {scanning ? (
                        <>
                            <span className="discovery-spinner">⏳</span>
                            Scanning...
                        </>
                    ) : (
                        <>
                            🔍 Scan Network
                        </>
                    )}
                </button>
            </div>

            {/* Error message */}
            {error && (
                <div style={{
                    padding: '10px 14px',
                    background: 'rgba(199, 95, 95, 0.15)',
                    border: '1px solid rgba(199, 95, 95, 0.3)',
                    borderRadius: '6px',
                    color: '#c75f5f',
                    fontSize: '12px',
                    marginBottom: '12px'
                }}>
                    ❌ {error}
                </div>
            )}

            {/* Last scan info */}
            {lastScan && (
                <div style={{
                    fontSize: '10px',
                    color: '#8a959e',
                    marginBottom: '12px'
                }}>
                    Last scan: {lastScan.toLocaleTimeString()} • Found {devices.length} device(s)
                </div>
            )}

            {/* Results */}
            {devices.length === 0 && !scanning && lastScan && (
                <div style={{
                    padding: '30px',
                    textAlign: 'center',
                    color: '#8a959e',
                    background: 'rgba(0, 0, 0, 0.2)',
                    borderRadius: '8px'
                }}>
                    <div style={{ fontSize: '24px', marginBottom: '8px' }}>📡</div>
                    <div>No devices found on your network.</div>
                    <div style={{ fontSize: '11px', marginTop: '8px' }}>
                        Try increasing the timeout or check if your devices are online.
                    </div>
                </div>
            )}

            {/* Device groups */}
            {Object.entries(deviceGroups).map(([type, typeDevices]) => {
                const typeInfo = getDeviceTypeInfo(type);
                return (
                    <div key={type} style={{ marginBottom: '16px' }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            marginBottom: '8px',
                            paddingBottom: '6px',
                            borderBottom: '1px solid rgba(95, 179, 179, 0.15)'
                        }}>
                            <span style={{ fontSize: '16px' }}>{typeInfo.icon}</span>
                            <span style={{ 
                                color: typeInfo.color, 
                                fontSize: '13px', 
                                fontWeight: 500 
                            }}>
                                {typeInfo.label}
                            </span>
                            <span style={{ 
                                color: '#8a959e', 
                                fontSize: '11px',
                                background: 'rgba(0, 0, 0, 0.2)',
                                padding: '2px 8px',
                                borderRadius: '10px'
                            }}>
                                {typeDevices.length}
                            </span>
                        </div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {typeDevices.map((device) => (
                                <div
                                    key={device.id}
                                    style={{
                                        background: expandedDevice === device.id 
                                            ? 'rgba(95, 179, 179, 0.1)' 
                                            : 'rgba(0, 0, 0, 0.15)',
                                        border: '1px solid rgba(95, 179, 179, 0.15)',
                                        borderRadius: '6px',
                                        padding: '10px 14px',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s'
                                    }}
                                    onClick={() => setExpandedDevice(
                                        expandedDevice === device.id ? null : device.id
                                    )}
                                >
                                    <div style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }}>
                                        <div>
                                            <div style={{ 
                                                color: '#c5cdd3', 
                                                fontSize: '13px',
                                                fontWeight: 500 
                                            }}>
                                                {device.name}
                                            </div>
                                            <div style={{ 
                                                color: '#8a959e', 
                                                fontSize: '11px',
                                                fontFamily: 'monospace'
                                            }}>
                                                {device.ip}:{device.port}
                                            </div>
                                        </div>
                                        <div style={{ 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            gap: '8px' 
                                        }}>
                                            {device.configured ? (
                                                <span style={{
                                                    background: 'rgba(95, 170, 125, 0.2)',
                                                    color: '#5faa7d',
                                                    padding: '3px 8px',
                                                    borderRadius: '4px',
                                                    fontSize: '10px'
                                                }}>
                                                    Configured
                                                </span>
                                            ) : (
                                                <span style={{
                                                    background: 'rgba(212, 160, 84, 0.2)',
                                                    color: '#d4a054',
                                                    padding: '3px 8px',
                                                    borderRadius: '4px',
                                                    fontSize: '10px'
                                                }}>
                                                    New
                                                </span>
                                            )}
                                            <span style={{ 
                                                color: '#8a959e',
                                                fontSize: '12px'
                                            }}>
                                                {expandedDevice === device.id ? '▼' : '▶'}
                                            </span>
                                        </div>
                                    </div>
                                    
                                    {/* Expanded details */}
                                    {expandedDevice === device.id && (
                                        <div style={{
                                            marginTop: '12px',
                                            paddingTop: '12px',
                                            borderTop: '1px solid rgba(95, 179, 179, 0.1)',
                                            fontSize: '11px',
                                            color: '#8a959e'
                                        }}>
                                            <div style={{ 
                                                display: 'grid', 
                                                gridTemplateColumns: '100px 1fr',
                                                gap: '6px 12px'
                                            }}>
                                                <span>Host:</span>
                                                <span style={{ color: '#c5cdd3', fontFamily: 'monospace' }}>
                                                    {device.host || 'N/A'}
                                                </span>
                                                
                                                <span>Source:</span>
                                                <span style={{ color: '#c5cdd3' }}>
                                                    {device.source === 'mdns' ? 'mDNS/Bonjour' : 
                                                     device.source === 'udp' ? 'UDP Broadcast' : device.source}
                                                </span>
                                                
                                                <span>Discovered:</span>
                                                <span style={{ color: '#c5cdd3' }}>
                                                    {formatTimestamp(device.discoveredAt)}
                                                </span>
                                                
                                                {device.capabilities && device.capabilities.length > 0 && (
                                                    <>
                                                        <span>Capabilities:</span>
                                                        <span style={{ color: '#5fb3b3' }}>
                                                            {device.capabilities.join(', ')}
                                                        </span>
                                                    </>
                                                )}
                                                
                                                {device.model && (
                                                    <>
                                                        <span>Model:</span>
                                                        <span style={{ color: '#c5cdd3' }}>
                                                            {device.model}
                                                        </span>
                                                    </>
                                                )}
                                            </div>
                                            
                                            {/* Action buttons */}
                                            <div style={{
                                                display: 'flex',
                                                gap: '8px',
                                                marginTop: '12px'
                                            }}>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        window.open(`http://${device.ip}:${device.port}`, '_blank');
                                                    }}
                                                    style={{
                                                        padding: '6px 12px',
                                                        background: 'rgba(95, 179, 179, 0.15)',
                                                        border: '1px solid rgba(95, 179, 179, 0.3)',
                                                        borderRadius: '4px',
                                                        color: '#5fb3b3',
                                                        cursor: 'pointer',
                                                        fontSize: '11px'
                                                    }}
                                                >
                                                    🌐 Open Web UI
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        navigator.clipboard.writeText(device.ip);
                                                    }}
                                                    style={{
                                                        padding: '6px 12px',
                                                        background: 'rgba(95, 179, 179, 0.1)',
                                                        border: '1px solid rgba(95, 179, 179, 0.2)',
                                                        borderRadius: '4px',
                                                        color: '#8a959e',
                                                        cursor: 'pointer',
                                                        fontSize: '11px'
                                                    }}
                                                >
                                                    📋 Copy IP
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })}

            {/* Scanning animation styles */}
            <style>{`
                .discovery-spinner {
                    display: inline-block;
                    animation: spin 1s linear infinite;
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}

export default DiscoveryPanel;
