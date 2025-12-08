import React, { useState, useEffect, useRef } from 'react';
import './Dock.css';
import { SettingsModal } from './SettingsModal';
import { KeyboardShortcutsModal } from './KeyboardShortcutsModal';
import { socket } from '../socket';
import { getLoadingState } from '../registries/PluginLoader';

export function Dock({ onSave, onLoad, onClear, onExport, onImport, hasUnsavedChanges }) {
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [shortcutsOpen, setShortcutsOpen] = useState(false);
    const [position, setPosition] = useState(() => {
        const saved = localStorage.getItem('dock-position');
        return saved ? JSON.parse(saved) : { x: 20, y: 20 };
    });
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [graphExpanded, setGraphExpanded] = useState(true);
    const [statusExpanded, setStatusExpanded] = useState(true);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [connectionStatus, setConnectionStatus] = useState({
        backend: socket.connected,
        ha: { connected: false, wsConnected: false, deviceCount: 0 },
        hue: { connected: false, deviceCount: 0 },
        kasa: { connected: false, deviceCount: 0 },
        shelly: { connected: false, deviceCount: 0 }
    });
    const [pluginStatus, setPluginStatus] = useState({ loaded: 0, failed: 0 });
    const dockRef = useRef(null);
    const fileInputRef = useRef(null);

    // Listen for "?" key to open shortcuts modal
    useEffect(() => {
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
        const onConnect = () => setConnectionStatus(prev => ({ ...prev, backend: true }));
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

        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);
        socket.on('ha-connection-status', onHaStatus);
        socket.on('device-counts', onDeviceCounts);
        
        // Initial status
        setConnectionStatus(prev => ({ ...prev, backend: socket.connected }));
        
        // Get initial plugin status
        const loadState = getLoadingState();
        setPluginStatus({ 
            loaded: loadState.loadedCount, 
            failed: loadState.failedPlugins?.length || 0 
        });

        return () => {
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
            socket.off('ha-connection-status', onHaStatus);
            socket.off('device-counts', onDeviceCounts);
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

    return (
        <div
            ref={dockRef}
            className="dock-container"
            style={{
                left: `${position.x}px`,
                top: `${position.y}px`,
                cursor: isDragging ? 'grabbing' : 'default'
            }}
            onMouseDown={handleMouseDown}
        >
            <div className="dock-header" style={{ cursor: 'grab' }}>
                <span className="dock-title">⚙️ Control Panel</span>
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
                        {connectionStatus.hue.deviceCount > 0 && (
                            <div className={`dock-status-item ${connectionStatus.hue.connected ? 'connected' : 'disconnected'}`}>
                                <span className="dock-status-dot"></span>
                                <span className="dock-status-label">Philips Hue</span>
                                <span className="dock-status-value">{connectionStatus.hue.deviceCount} lights</span>
                            </div>
                        )}
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
                                {pluginStatus.loaded} loaded{pluginStatus.failed > 0 ? ` (${pluginStatus.failed} failed)` : ''}
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* Settings Section */}
            <div className="dock-section">
                <div className="dock-section-content">
                    <button onClick={() => setSettingsOpen(true)} className="dock-btn dock-btn-settings">
                        🔧 Settings & API Keys
                    </button>
                    <button onClick={() => setShortcutsOpen(true)} className="dock-btn dock-btn-help">
                        ❓ Keyboard Shortcuts
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
