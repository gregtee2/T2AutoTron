import React, { useState, useEffect, useRef } from 'react';
import './Dock.css';
import { SettingsModal } from './SettingsModal';
import { KeyboardShortcutsModal } from './KeyboardShortcutsModal';
import { CameraPanel } from './CameraPanel';
import { socket } from '../socket';
import { getLoadingState } from '../registries/PluginLoader';
import { onPluginProgress } from '../registries/PluginLoader';
import { useToast } from './Toast';
import { authFetch } from '../auth/authClient';

export function Dock({ onSave, onLoad, onClear, onExport, onImport, hasUnsavedChanges, isMerged = false, onToggleMerged }) {
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [shortcutsOpen, setShortcutsOpen] = useState(false);
    const [checkingUpdate, setCheckingUpdate] = useState(false);
    const [checkingPlugins, setCheckingPlugins] = useState(false);
    const toast = useToast();
    const [position, setPosition] = useState(() => {
        const saved = localStorage.getItem('dock-position');
        return saved ? JSON.parse(saved) : { x: 20, y: 20 };
    });
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [graphExpanded, setGraphExpanded] = useState(true);
    const [statusExpanded, setStatusExpanded] = useState(true);
    const [camerasExpanded, setCamerasExpanded] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [connectionStatus, setConnectionStatus] = useState({
        backend: socket.connected,
        ha: { connected: false, wsConnected: false, deviceCount: 0 },
        hue: { connected: false, deviceCount: 0 },
        kasa: { connected: false, deviceCount: 0 },
        shelly: { connected: false, deviceCount: 0 }
    });
    const [pluginStatus, setPluginStatus] = useState({ loaded: 0, failed: 0, total: 0 });
    let unsubscribePlugin;
    const dockRef = useRef(null);
    const fileInputRef = useRef(null);

    // Listen for "?" key to open shortcuts modal
    useEffect(() => {
                // Subscribe to plugin progress updates for live plugin count
                unsubscribePlugin = onPluginProgress((loadState) => {
                    // Debug logging disabled - enable if needed for troubleshooting
                    // console.log('[Dock] Plugin progress update:', loadState);
                    let loadedPlugins = 0;
                    let totalPlugins = loadState.totalCount || 0;
                    if (window.nodeRegistry && typeof window.nodeRegistry.getAll === 'function') {
                        loadedPlugins = window.nodeRegistry.getAll().length;
                        if (!totalPlugins || loadedPlugins > totalPlugins) totalPlugins = loadedPlugins;
                    } else {
                        loadedPlugins = loadState.loadedCount;
                    }
                    setPluginStatus({
                        loaded: loadedPlugins,
                        failed: loadState.failedPlugins?.length || 0,
                        total: totalPlugins
                    });
                });
        const handleKeyDown = (e) => {
            // Ignore if typing in an input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
            // "?" key (Shift + /)
            if (e.key === '?' || (e.shiftKey && e.code === 'Slash')) {
                e.preventDefault();
                setShortcutsOpen(true);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Subscribe to connection status updates
    useEffect(() => {
        const onConnect = () => {
            setConnectionStatus(prev => ({ ...prev, backend: true }));
            socket.emit('request-hue-status');
        };
        const onDisconnect = () => setConnectionStatus(prev => ({ ...prev, backend: false }));
        const onHaStatus = (data) => setConnectionStatus(prev => ({ 
            ...prev, 
            ha: { connected: data.connected, wsConnected: data.wsConnected, deviceCount: data.deviceCount || 0 }
        }));

        // Listen for device counts from various integrations
        const onDeviceCounts = (data) => {
            if (data.hue) setConnectionStatus(prev => ({ ...prev, hue: data.hue }));
            if (data.kasa) setConnectionStatus(prev => ({ ...prev, kasa: data.kasa }));
            if (data.shelly) setConnectionStatus(prev => ({ ...prev, shelly: data.shelly }));
        };

        // Listen for hue connection status
        const onHueStatus = (data) => {
            setConnectionStatus(prev => ({
                ...prev,
                hue: {
                    connected: data.connected,
                    deviceCount: data.deviceCount || 0,
                    bridgeIp: data.bridgeIp || null
                }
            }));
        };

        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);
        socket.on('ha-connection-status', onHaStatus);
        socket.on('device-counts', onDeviceCounts);
        socket.on('hue-connection-status', onHueStatus);

        // Initial status
        setConnectionStatus(prev => ({ ...prev, backend: socket.connected }));

        // Request initial hue status if already connected
        if (socket.connected) {
            socket.emit('request-hue-status');
        }

        // Get initial plugin status
        const loadState = getLoadingState();
        // Use nodeRegistry for actual loaded plugin count
        let loadedPlugins = 0;
        let totalPlugins = loadState.totalCount || 0;
        if (window.nodeRegistry && typeof window.nodeRegistry.getAll === 'function') {
            loadedPlugins = window.nodeRegistry.getAll().length;
            // If totalCount is missing or less than loaded, use loadedPlugins as total
            if (!totalPlugins || loadedPlugins > totalPlugins) totalPlugins = loadedPlugins;
        } else {
            loadedPlugins = loadState.loadedCount;
        }
        setPluginStatus({ 
            loaded: loadedPlugins, 
            failed: loadState.failedPlugins?.length || 0,
            total: totalPlugins
        });

        return () => {
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
            socket.off('ha-connection-status', onHaStatus);
            socket.off('device-counts', onDeviceCounts);
            socket.off('hue-connection-status', onHueStatus);
            if (unsubscribePlugin) unsubscribePlugin();
        };
    }, []);

    // Update time every second
    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date());
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    // Format date and time
    const formatDateTime = () => {
        const options = { 
            weekday: 'short',
            month: 'short', 
            day: 'numeric',
            hour: '2-digit', 
            minute: '2-digit',
            second: '2-digit'
        };
        return currentTime.toLocaleDateString('en-US', options);
    };

    useEffect(() => {
        localStorage.setItem('dock-position', JSON.stringify(position));
    }, [position]);

    const handleMouseDown = (e) => {
        if (isMerged) return;
        if (e.target.closest('.dock-header')) {
            setIsDragging(true);
            setDragOffset({
                x: e.clientX - position.x,
                y: e.clientY - position.y
            });
        }
    };

    const handleMouseMove = (e) => {
        if (isDragging) {
            setPosition({
                x: e.clientX - dragOffset.x,
                y: e.clientY - dragOffset.y
            });
        }
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            return () => {
                window.removeEventListener('mousemove', handleMouseMove);
                window.removeEventListener('mouseup', handleMouseUp);
            };
        }
    }, [isDragging, dragOffset]);

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const json = JSON.parse(event.target.result);
                    onImport(json);
                } catch (err) {
                    console.error('Failed to parse JSON:', err);
                    alert('Invalid JSON file');
                }
            };
            reader.readAsText(file);
        }
        // Reset input value to allow selecting the same file again
        e.target.value = '';
    };
    
    // Check for updates on demand
    const handleCheckForUpdates = async () => {
        if (checkingUpdate) return;
        
        setCheckingUpdate(true);
        try {
            const response = await authFetch('/api/update/check?force=true');
            if (!response.ok) {
                const text = await response.text();
                throw new Error(text || `HTTP ${response.status}`);
            }
            const data = await response.json();
            
            if (data.hasUpdate) {
                // Show update modal via App.jsx by emitting socket event
                // or using a callback - for now we'll show toast with action
                toast.info(`🚀 Update available: ${data.currentVersion} → ${data.newVersion}`, {
                    duration: 0,
                    actionLabel: 'View Details',
                    action: () => {
                        // Emit event that App.jsx listens for
                        socket.emit('request-show-update-modal', data);
                        // Also dispatch window event as backup
                        window.dispatchEvent(new CustomEvent('showUpdateModal', { detail: data }));
                    }
                });
            } else {
                toast.success(`✓ You're up to date! (v${data.currentVersion})`, 4000);
            }
        } catch (err) {
            console.error('Failed to check for updates:', err);
            toast.error('Failed to check for updates: ' + err.message, 5000);
        } finally {
            setCheckingUpdate(false);
        }
    };
    
    // Check and apply plugin updates (hot update, no restart needed)
    const handlePluginUpdate = async () => {
        if (checkingPlugins) return;
        
        setCheckingPlugins(true);
        try {
            // First check for updates
            const checkResponse = await authFetch('/api/update/plugins/check');
            if (!checkResponse.ok) {
                throw new Error(`HTTP ${checkResponse.status}`);
            }
            const checkData = await checkResponse.json();
            
            if (!checkData.hasUpdates) {
                toast.success('🔌 Plugins are up to date!', 3000);
                return;
            }
            
            // Show what's available and ask to update
            const updateCount = (checkData.newPlugins?.length || 0) + (checkData.modifiedPlugins?.length || 0);
            toast.info(`🔌 ${updateCount} plugin update(s) available. Downloading...`, 3000);
            
            // Apply the updates
            const updateResponse = await authFetch('/api/update/plugins', { method: 'POST' });
            if (!updateResponse.ok) {
                throw new Error(`HTTP ${updateResponse.status}`);
            }
            const updateData = await updateResponse.json();
            
            if (updateData.success && updateData.updated?.length > 0) {
                toast.success(`✅ Updated ${updateData.updated.length} plugin(s). Refresh page to load them.`, {
                    duration: 0,
                    actionLabel: 'Refresh Now',
                    action: () => window.location.reload()
                });
            } else if (updateData.updated?.length === 0) {
                toast.info('No plugins needed updating', 3000);
            } else {
                toast.error('Plugin update failed: ' + (updateData.error || 'Unknown error'), 5000);
            }
        } catch (err) {
            console.error('Failed to update plugins:', err);
            toast.error('Failed to update plugins: ' + err.message, 5000);
        } finally {
            setCheckingPlugins(false);
        }
    };

    return (
        <div
            ref={dockRef}
            className={`dock-container ${isMerged ? 'dock-merged' : ''}`}
            style={{
                ...(isMerged
                    ? { cursor: 'default' }
                    : {
                        left: `${position.x}px`,
                        top: `${position.y}px`,
                        cursor: isDragging ? 'grabbing' : 'default'
                    })
            }}
            onMouseDown={handleMouseDown}
        >
            <div className="dock-header" style={{ cursor: isMerged ? 'default' : 'grab' }}>
                <div className="dock-header-row">
                    <span className="dock-title">⚙️ Control Panel</span>
                    <button
                        type="button"
                        className="dock-btn-small"
                        onClick={(e) => { e.stopPropagation(); onToggleMerged?.(); }}
                        onMouseDown={(e) => e.stopPropagation()}
                        title={isMerged ? 'Pop Control Panel back out' : 'Merge Control Panel into the Forecast panel'}
                    >
                        {isMerged ? 'Pop out' : 'Merge'}
                    </button>
                </div>
                <span className="dock-datetime">{formatDateTime()}</span>
            </div>

            {/* Graph Tools Section */}
            <div className="dock-section">
                <div
                    className="dock-section-header"
                    onClick={() => setGraphExpanded(!graphExpanded)}
                >
                    <span>{graphExpanded ? '▼' : '▶'} Graph Tools {hasUnsavedChanges && <span className="unsaved-dot" title="Unsaved changes">●</span>}</span>
                </div>
                {graphExpanded && (
                    <div className="dock-section-content">
                        <button onClick={onSave} className={`dock-btn ${hasUnsavedChanges ? 'dock-btn-unsaved' : ''}`}>
                            💾 Save {hasUnsavedChanges && '*'}
                        </button>
                        <button onClick={onLoad} className="dock-btn">↻ Load Last</button>
                        <button onClick={handleImportClick} className="dock-btn">📂 Import File</button>
                        <button onClick={onClear} className="dock-btn">🗑️ Clear</button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".json"
                            style={{ display: 'none' }}
                            onChange={handleFileChange}
                        />
                    </div>
                )}
            </div>

            {/* Connection Status Section */}
            <div className="dock-section">
                <div
                    className="dock-section-header"
                    onClick={() => setStatusExpanded(!statusExpanded)}
                >
                    <span>{statusExpanded ? '▼' : '▶'} Connection Status</span>
                </div>
                {statusExpanded && (
                    <div className="dock-section-content dock-status-grid">
                        <div className={`dock-status-item ${connectionStatus.backend ? 'connected' : 'disconnected'}`}>
                            <span className="dock-status-dot"></span>
                            <span className="dock-status-label">Backend</span>
                            <span className="dock-status-value">{connectionStatus.backend ? 'Connected' : 'Offline'}</span>
                        </div>
                        <div className={`dock-status-item ${connectionStatus.ha.connected ? 'connected' : 'disconnected'}`}>
                            <span className="dock-status-dot"></span>
                            <span className="dock-status-label">Home Assistant</span>
                            <span className="dock-status-value">
                                {connectionStatus.ha.connected 
                                    ? `${connectionStatus.ha.deviceCount} devices` 
                                    : 'Offline'}
                            </span>
                        </div>
                        {/* Always show Hue bridge status */}
                        <div className={`dock-status-item ${connectionStatus.hue.connected ? 'connected' : 'disconnected'}`}> 
                            <span className="dock-status-dot"></span>
                            <span className="dock-status-label">Philips Hue</span>
                            <span className="dock-status-value">
                                {connectionStatus.hue.connected
                                    ? `${connectionStatus.hue.deviceCount || 0} lights${connectionStatus.hue.bridgeIp ? ` (${connectionStatus.hue.bridgeIp})` : ''}`
                                    : 'Offline'}
                            </span>
                        </div>
                        {connectionStatus.kasa.deviceCount > 0 && (
                            <div className={`dock-status-item ${connectionStatus.kasa.connected ? 'connected' : 'disconnected'}`}>
                                <span className="dock-status-dot"></span>
                                <span className="dock-status-label">Kasa</span>
                                <span className="dock-status-value">{connectionStatus.kasa.deviceCount} devices</span>
                            </div>
                        )}
                        <div className="dock-status-item plugins">
                            <span className="dock-status-dot" style={{ background: pluginStatus.failed > 0 ? '#f59e0b' : '#10b981' }}></span>
                            <span className="dock-status-label">Plugins</span>
                            <span className="dock-status-value">
                                {pluginStatus.total > 0
                                    ? `${pluginStatus.loaded} / ${pluginStatus.total} loaded${pluginStatus.failed > 0 ? ` (${pluginStatus.failed} failed)` : ''}`
                                    : `${pluginStatus.loaded} loaded`}
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* Camera Panel */}
            <CameraPanel 
                isExpanded={camerasExpanded} 
                onToggle={() => setCamerasExpanded(!camerasExpanded)} 
            />

            {/* Settings Section */}
            <div className="dock-section">
                <div className="dock-section-content">
                    <button onClick={() => setSettingsOpen(true)} className="dock-btn dock-btn-settings">
                        🔧 Settings & API Keys
                    </button>
                    <button onClick={() => setShortcutsOpen(true)} className="dock-btn dock-btn-help">
                        ❓ Keyboard Shortcuts
                    </button>
                    <button 
                        onClick={handleCheckForUpdates} 
                        disabled={checkingUpdate}
                        className="dock-btn dock-btn-update"
                        title="Check for available updates (full rebuild)"
                    >
                        {checkingUpdate ? '⏳ Checking...' : '🔄 Check for Updates'}
                    </button>
                    <button 
                        onClick={handlePluginUpdate} 
                        disabled={checkingPlugins}
                        className="dock-btn dock-btn-plugins"
                        title="Hot-update plugins without restart"
                    >
                        {checkingPlugins ? '⏳ Updating...' : '🔌 Update Plugins'}
                    </button>
                </div>
            </div>

            {/* Settings Modal */}
            <SettingsModal 
                isOpen={settingsOpen} 
                onClose={() => setSettingsOpen(false)} 
            />
            
            {/* Keyboard Shortcuts Modal */}
            <KeyboardShortcutsModal
                isOpen={shortcutsOpen}
                onClose={() => setShortcutsOpen(false)}
            />
        </div>
    );
}
