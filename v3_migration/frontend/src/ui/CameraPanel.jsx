import React, { useState, useEffect, useRef, useCallback } from 'react';
import { apiFetch } from '../auth/authClient';

/**
 * CameraPanel - Dock panel for viewing IP camera feeds
 * Displays camera snapshots that refresh periodically
 * @version 1.1.0 - Added unified dropdown selector for camera configuration
 */
export function CameraPanel({ isExpanded, onToggle }) {
    const [cameras, setCameras] = useState([]);
    const [discoveredIPs, setDiscoveredIPs] = useState([]); // IPs found but not yet configured
    const [loading, setLoading] = useState(true);
    const [discovering, setDiscovering] = useState(false);
    const [error, setError] = useState(null);
    const [showSettings, setShowSettings] = useState(false);
    const [showAddCamera, setShowAddCamera] = useState(null); // IP being configured
    const [editCamera, setEditCamera] = useState(null); // Camera being edited
    const [editCreds, setEditCreds] = useState({ username: '', password: '', name: '' });
    const [credentials, setCredentials] = useState({ username: '', password: '' });
    const [newCameraName, setNewCameraName] = useState('');
    const [refreshInterval, setRefreshInterval] = useState(5000);
    const [selectedCamera, setSelectedCamera] = useState(null);
    const refreshTimerRef = useRef(null);
    const [cameraTimestamps, setCameraTimestamps] = useState({});

    // Fetch cameras on mount
    useEffect(() => {
        fetchCameras();
        return () => {
            if (refreshTimerRef.current) {
                clearInterval(refreshTimerRef.current);
            }
        };
    }, []);

    // Set up refresh timer
    useEffect(() => {
        if (refreshTimerRef.current) {
            clearInterval(refreshTimerRef.current);
        }
        
        if (isExpanded && cameras.length > 0 && refreshInterval > 0) {
            refreshTimerRef.current = setInterval(() => {
                // Update timestamps to force image refresh
                setCameraTimestamps(prev => {
                    const updated = { ...prev };
                    cameras.forEach(cam => {
                        updated[cam.ip] = Date.now();
                    });
                    return updated;
                });
            }, refreshInterval);
        }
        
        return () => {
            if (refreshTimerRef.current) {
                clearInterval(refreshTimerRef.current);
            }
        };
    }, [isExpanded, cameras, refreshInterval]);

    const fetchCameras = async () => {
        try {
            setLoading(true);
            const response = await apiFetch('/api/cameras');
            if (response.ok) {
                const data = await response.json();
                setCameras(data.cameras || []);
                if (data.defaultCredentials) {
                    setCredentials(prev => ({
                        ...prev,
                        username: data.defaultCredentials.username || ''
                    }));
                }
            }
        } catch (err) {
            setError('Failed to load cameras');
        } finally {
            setLoading(false);
        }
    };

    const discoverCameras = async () => {
        setDiscovering(true);
        setError(null);
        
        try {
            const response = await apiFetch('/api/cameras/discover', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            
            if (response.ok) {
                const data = await response.json();
                
                if (data.found && data.found.length > 0) {
                    // Filter out already configured cameras
                    const configuredIPs = cameras.map(c => c.ip);
                    const newIPs = data.found.filter(cam => !configuredIPs.includes(cam.ip));
                    
                    setDiscoveredIPs(newIPs);
                    
                    if (window.T2Toast) {
                        if (newIPs.length > 0) {
                            window.T2Toast.success(`Found ${newIPs.length} new camera(s)! Click to configure.`);
                        } else {
                            window.T2Toast.info(`Found ${data.found.length} cameras, all already configured.`);
                        }
                    }
                } else {
                    setDiscoveredIPs([]);
                    if (window.T2Toast) {
                        window.T2Toast.info('No cameras found on network');
                    }
                }
            }
        } catch (err) {
            setError('Discovery failed');
        } finally {
            setDiscovering(false);
        }
    };

    const saveCredentials = async () => {
        try {
            await apiFetch('/api/cameras/credentials', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(credentials)
            });
            
            if (window.T2Toast) {
                window.T2Toast.success('Credentials saved');
            }
        } catch (err) {
            setError('Failed to save credentials');
        }
    };

    const addCamera = async (ip, name, creds) => {
        try {
            await apiFetch('/api/cameras', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ip,
                    name: name || `Camera ${ip.split('.').pop()}`,
                    username: creds?.username || credentials.username,
                    password: creds?.password || credentials.password
                })
            });
            // Remove from discovered list
            setDiscoveredIPs(prev => prev.filter(d => d.ip !== ip));
            setShowAddCamera(null);
            setNewCameraName('');
            await fetchCameras();
            
            if (window.T2Toast) {
                window.T2Toast.success(`Camera ${ip} added!`);
            }
        } catch (err) {
            setError('Failed to add camera');
        }
    };

    const removeCamera = async (ip) => {
        try {
            await fetch(`/api/cameras/${ip}`, { method: 'DELETE' });
            await fetchCameras();
            if (selectedCamera === ip) {
                setSelectedCamera(null);
            }
        } catch (err) {
            setError('Failed to remove camera');
        }
    };

    const updateCamera = async () => {
        if (!editCamera) return;
        try {
            await apiFetch('/api/cameras', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ip: editCamera,
                    name: editCreds.name,
                    username: editCreds.username,
                    password: editCreds.password
                })
            });
            setEditCamera(null);
            // Force refresh of this camera's snapshot
            setCameraTimestamps(prev => ({ ...prev, [editCamera]: Date.now() }));
            await fetchCameras();
            
            if (window.T2Toast) {
                window.T2Toast.success(`Camera ${editCamera} updated!`);
            }
        } catch (err) {
            setError('Failed to update camera');
        }
    };

    const styles = {
        container: {
            background: 'linear-gradient(180deg, rgba(12, 20, 35, 0.95) 0%, rgba(8, 15, 28, 0.98) 100%)',
            borderRadius: '12px',
            border: '1px solid rgba(0, 200, 255, 0.2)',
            overflow: 'hidden',
            marginBottom: '8px'
        },
        header: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            background: 'linear-gradient(90deg, rgba(0, 150, 200, 0.15), transparent)',
            borderBottom: '1px solid rgba(0, 200, 255, 0.1)',
            cursor: 'pointer'
        },
        title: {
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: '#00d4ff',
            fontSize: '14px',
            fontWeight: 600
        },
        icon: {
            fontSize: '16px'
        },
        badge: {
            background: 'rgba(0, 200, 255, 0.2)',
            color: '#00d4ff',
            padding: '2px 8px',
            borderRadius: '10px',
            fontSize: '11px'
        },
        content: {
            padding: isExpanded ? '12px' : '0',
            maxHeight: isExpanded ? '400px' : '0',
            overflow: 'auto',
            transition: 'all 0.3s ease'
        },
        grid: {
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
            gap: '10px'
        },
        cameraCard: {
            background: 'rgba(0, 0, 0, 0.3)',
            borderRadius: '8px',
            overflow: 'hidden',
            border: '1px solid rgba(0, 200, 255, 0.15)',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
        },
        cameraCardSelected: {
            border: '2px solid #00d4ff',
            boxShadow: '0 0 10px rgba(0, 200, 255, 0.3)'
        },
        cameraImage: {
            width: '100%',
            height: '100px',
            objectFit: 'cover',
            background: '#111'
        },
        cameraInfo: {
            padding: '6px 8px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
        },
        cameraName: {
            color: '#b8e6ea',
            fontSize: '11px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
        },
        deleteBtn: {
            background: 'rgba(255, 80, 80, 0.2)',
            border: 'none',
            color: '#ff6b6b',
            padding: '2px 6px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '10px'
        },
        toolbar: {
            display: 'flex',
            gap: '8px',
            marginBottom: '10px',
            flexWrap: 'wrap'
        },
        btn: {
            background: 'rgba(0, 200, 255, 0.15)',
            border: '1px solid rgba(0, 200, 255, 0.3)',
            color: '#00d4ff',
            padding: '6px 12px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
        },
        btnActive: {
            background: 'rgba(0, 200, 255, 0.3)'
        },
        settings: {
            background: 'rgba(0, 0, 0, 0.2)',
            borderRadius: '8px',
            padding: '12px',
            marginBottom: '10px'
        },
        inputGroup: {
            marginBottom: '8px'
        },
        label: {
            color: '#8899aa',
            fontSize: '11px',
            marginBottom: '4px',
            display: 'block'
        },
        input: {
            width: '100%',
            background: 'rgba(0, 0, 0, 0.3)',
            border: '1px solid rgba(0, 200, 255, 0.2)',
            borderRadius: '4px',
            padding: '6px 10px',
            color: '#fff',
            fontSize: '12px',
            boxSizing: 'border-box'
        },
        fullView: {
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.9)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000
        },
        fullImage: {
            maxWidth: '90vw',
            maxHeight: '80vh',
            objectFit: 'contain'
        },
        closeBtn: {
            position: 'absolute',
            top: '20px',
            right: '20px',
            background: 'rgba(255, 255, 255, 0.1)',
            border: 'none',
            color: '#fff',
            padding: '10px 20px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '14px'
        },
        emptyState: {
            textAlign: 'center',
            padding: '20px',
            color: '#667788'
        },
        refreshSelect: {
            background: 'rgba(0, 0, 0, 0.3)',
            border: '1px solid rgba(0, 200, 255, 0.2)',
            borderRadius: '4px',
            padding: '6px',
            color: '#fff',
            fontSize: '11px'
        }
    };

    const getSnapshotUrl = (ip) => {
        const timestamp = cameraTimestamps[ip] || Date.now();
        return `/api/cameras/snapshot/${ip}?t=${timestamp}`;
    };

    return (
        <div style={styles.container}>
            <div style={styles.header} onClick={onToggle}>
                <div style={styles.title}>
                    <span style={styles.icon}>📹</span>
                    <span>Cameras</span>
                    {cameras.length > 0 && (
                        <span style={styles.badge}>{cameras.length}</span>
                    )}
                </div>
                <span style={{ color: '#00d4ff' }}>{isExpanded ? '▼' : '▶'}</span>
            </div>
            
            {isExpanded && (
                <div style={styles.content}>
                    {/* Toolbar */}
                    <div style={styles.toolbar}>
                        <button 
                            style={{...styles.btn, ...(discovering ? styles.btnActive : {})}}
                            onClick={discoverCameras}
                            disabled={discovering}
                        >
                            {discovering ? '🔄 Scanning...' : '🔍 Discover'}
                        </button>
                        <button 
                            style={{...styles.btn, ...(showSettings ? styles.btnActive : {})}}
                            onClick={() => setShowSettings(!showSettings)}
                        >
                            ⚙️ Settings
                        </button>
                        <select 
                            style={styles.refreshSelect}
                            value={refreshInterval}
                            onChange={(e) => setRefreshInterval(Number(e.target.value))}
                            title="Refresh interval"
                        >
                            <option value={0}>Manual</option>
                            <option value={2000}>2s</option>
                            <option value={5000}>5s</option>
                            <option value={10000}>10s</option>
                            <option value={30000}>30s</option>
                        </select>
                    </div>

                    {/* Settings Panel */}
                    {showSettings && (
                        <div style={styles.settings}>
                            {/* Camera Selector Dropdown */}
                            <div style={styles.inputGroup}>
                                <label style={styles.label}>Select Camera to Configure</label>
                                <select
                                    style={{...styles.input, cursor: 'pointer'}}
                                    value={editCamera || ''}
                                    onChange={(e) => {
                                        const ip = e.target.value;
                                        if (!ip) {
                                            setEditCamera(null);
                                            setEditCreds({ username: '', password: '', name: '' });
                                            return;
                                        }
                                        // Check if it's an existing camera or a discovered one
                                        const existing = cameras.find(c => c.ip === ip);
                                        if (existing) {
                                            setEditCamera(ip);
                                            setEditCreds({
                                                name: existing.name || '',
                                                username: existing.username || '',
                                                password: ''
                                            });
                                        } else {
                                            // It's a newly discovered camera
                                            setEditCamera(ip);
                                            setEditCreds({
                                                name: `Camera ${ip.split('.').pop()}`,
                                                username: credentials.username || '',
                                                password: credentials.password || ''
                                            });
                                        }
                                    }}
                                >
                                    <option value="">-- Select a camera --</option>
                                    {cameras.length > 0 && (
                                        <optgroup label="📹 Configured Cameras">
                                            {cameras.map(cam => (
                                                <option key={cam.ip} value={cam.ip}>
                                                    {cam.name} ({cam.ip})
                                                </option>
                                            ))}
                                        </optgroup>
                                    )}
                                    {discoveredIPs.length > 0 && (
                                        <optgroup label="📡 Discovered (Not Configured)">
                                            {discoveredIPs.map(cam => (
                                                <option key={cam.ip} value={cam.ip}>
                                                    {cam.ip} (Ports: {cam.ports.join(', ')})
                                                </option>
                                            ))}
                                        </optgroup>
                                    )}
                                </select>
                            </div>

                            {/* Camera Config Form - shows when a camera is selected */}
                            {editCamera && (
                                <div style={{
                                    background: 'rgba(0, 0, 0, 0.2)',
                                    borderRadius: '6px',
                                    padding: '10px',
                                    marginTop: '8px'
                                }}>
                                    <div style={styles.inputGroup}>
                                        <label style={styles.label}>Camera Name</label>
                                        <input 
                                            type="text"
                                            style={styles.input}
                                            value={editCreds.name}
                                            onChange={(e) => setEditCreds(p => ({...p, name: e.target.value}))}
                                            placeholder="Front Door"
                                        />
                                    </div>
                                    <div style={styles.inputGroup}>
                                        <label style={styles.label}>Username</label>
                                        <input 
                                            type="text"
                                            style={styles.input}
                                            value={editCreds.username}
                                            onChange={(e) => setEditCreds(p => ({...p, username: e.target.value}))}
                                            placeholder="admin"
                                        />
                                    </div>
                                    <div style={styles.inputGroup}>
                                        <label style={styles.label}>Password {cameras.find(c => c.ip === editCamera) ? '(leave blank to keep current)' : ''}</label>
                                        <input 
                                            type="password"
                                            style={styles.input}
                                            value={editCreds.password}
                                            onChange={(e) => setEditCreds(p => ({...p, password: e.target.value}))}
                                            placeholder="••••••••"
                                        />
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                                        <button 
                                            style={{...styles.btn, flex: 1, justifyContent: 'center'}}
                                            onClick={() => {
                                                const isNew = !cameras.find(c => c.ip === editCamera);
                                                if (isNew) {
                                                    addCamera(editCamera, editCreds.name, editCreds);
                                                } else {
                                                    updateCamera();
                                                }
                                            }}
                                        >
                                            {cameras.find(c => c.ip === editCamera) ? '💾 Save Changes' : '➕ Add Camera'}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Default credentials section */}
                            <div style={{ 
                                borderTop: '1px solid rgba(0, 200, 255, 0.15)', 
                                marginTop: '12px', 
                                paddingTop: '12px' 
                            }}>
                                <div style={{ color: '#8899aa', fontSize: '11px', marginBottom: '8px' }}>
                                    Default credentials (used for new cameras)
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <input 
                                        type="text"
                                        style={{...styles.input, flex: 1}}
                                        value={credentials.username}
                                        onChange={(e) => setCredentials(p => ({...p, username: e.target.value}))}
                                        placeholder="Username"
                                    />
                                    <input 
                                        type="password"
                                        style={{...styles.input, flex: 1}}
                                        value={credentials.password}
                                        onChange={(e) => setCredentials(p => ({...p, password: e.target.value}))}
                                        placeholder="Password"
                                    />
                                    <button style={styles.btn} onClick={saveCredentials} title="Save as default">
                                        💾
                                    </button>
                                </div>
                            </div>

                            {/* Manual IP add */}
                            <div style={{ 
                                borderTop: '1px solid rgba(0, 200, 255, 0.15)', 
                                marginTop: '12px', 
                                paddingTop: '12px' 
                            }}>
                                <div style={{ color: '#8899aa', fontSize: '11px', marginBottom: '8px' }}>
                                    Add camera by IP (if not discovered)
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <input 
                                        type="text"
                                        id="addCameraIp"
                                        style={{...styles.input, flex: 1}}
                                        placeholder="192.168.1.100"
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && e.target.value) {
                                                // Add to discovered list for configuration
                                                const ip = e.target.value;
                                                if (!discoveredIPs.find(d => d.ip === ip) && !cameras.find(c => c.ip === ip)) {
                                                    setDiscoveredIPs(prev => [...prev, { ip, ports: ['manual'] }]);
                                                }
                                                setEditCamera(ip);
                                                setEditCreds({
                                                    name: `Camera ${ip.split('.').pop()}`,
                                                    username: credentials.username || '',
                                                    password: credentials.password || ''
                                                });
                                                e.target.value = '';
                                            }
                                        }}
                                    />
                                    <button 
                                        style={styles.btn}
                                        onClick={() => {
                                            const input = document.getElementById('addCameraIp');
                                            const ip = input?.value;
                                            if (ip) {
                                                if (!discoveredIPs.find(d => d.ip === ip) && !cameras.find(c => c.ip === ip)) {
                                                    setDiscoveredIPs(prev => [...prev, { ip, ports: ['manual'] }]);
                                                }
                                                setEditCamera(ip);
                                                setEditCreds({
                                                    name: `Camera ${ip.split('.').pop()}`,
                                                    username: credentials.username || '',
                                                    password: credentials.password || ''
                                                });
                                                input.value = '';
                                            }
                                        }}
                                    >
                                        Configure
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Error Display */}
                    {error && (
                        <div style={{ color: '#ff6b6b', padding: '8px', fontSize: '12px' }}>
                            ⚠️ {error}
                        </div>
                    )}

                    {/* Camera Grid */}
                    {loading ? (
                        <div style={styles.emptyState}>Loading cameras...</div>
                    ) : cameras.length === 0 && discoveredIPs.length === 0 ? (
                        <div style={styles.emptyState}>
                            <p>No cameras configured</p>
                            <p style={{ fontSize: '11px' }}>Click Discover to scan your network</p>
                        </div>
                    ) : (
                        <div style={styles.grid}>
                            {cameras.map(camera => (
                                <div 
                                    key={camera.ip}
                                    style={{
                                        ...styles.cameraCard,
                                        ...(selectedCamera === camera.ip ? styles.cameraCardSelected : {})
                                    }}
                                    onClick={() => setSelectedCamera(camera.ip)}
                                >
                                    <img 
                                        src={getSnapshotUrl(camera.ip)}
                                        alt={camera.name}
                                        style={styles.cameraImage}
                                        onError={(e) => {
                                            e.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23222" width="100" height="100"/><text x="50" y="55" text-anchor="middle" fill="%23666" font-size="12">No Signal</text></svg>';
                                        }}
                                    />
                                    <div style={styles.cameraInfo}>
                                        <span style={styles.cameraName} title={camera.ip}>
                                            {camera.name}
                                        </span>
                                        <div style={{ display: 'flex', gap: '4px' }}>
                                            <button 
                                                style={{...styles.deleteBtn, background: 'rgba(0, 150, 255, 0.2)', color: '#00aaff'}}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    // Open settings panel and select this camera
                                                    setShowSettings(true);
                                                    setEditCamera(camera.ip);
                                                    setEditCreds({
                                                        name: camera.name || '',
                                                        username: camera.username || '',
                                                        password: ''
                                                    });
                                                }}
                                                title="Edit credentials"
                                            >
                                                ✎
                                            </button>
                                            <button 
                                                style={styles.deleteBtn}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    removeCamera(camera.ip);
                                                }}
                                                title="Remove camera"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Full-screen view */}
            {selectedCamera && (
                <div style={styles.fullView} onClick={() => setSelectedCamera(null)}>
                    <img 
                        src={getSnapshotUrl(selectedCamera)}
                        alt="Camera feed"
                        style={styles.fullImage}
                    />
                    <button style={styles.closeBtn} onClick={() => setSelectedCamera(null)}>
                        ✕ Close
                    </button>
                    <div style={{ color: '#fff', marginTop: '10px' }}>
                        {cameras.find(c => c.ip === selectedCamera)?.name || selectedCamera}
                    </div>
                </div>
            )}
        </div>
    );
}

export default CameraPanel;
