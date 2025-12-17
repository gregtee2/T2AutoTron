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

// Detect if running as HA add-on (via ingress path)
const IS_HA_ADDON = window.location.pathname.includes('/api/hassio/ingress/');

export function Dock({ onSave, onLoad, onLoadExample, onClear, onExport, onImport, hasUnsavedChanges, isMerged = false, onToggleMerged }) {
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [shortcutsOpen, setShortcutsOpen] = useState(false);
    const [serverGraphsOpen, setServerGraphsOpen] = useState(false);
    const [serverGraphs, setServerGraphs] = useState([]);
    const [loadingGraphs, setLoadingGraphs] = useState(false);
    const [checkingUpdate, setCheckingUpdate] = useState(false);
    const [checkingPlugins, setCheckingPlugins] = useState(false);
    const [appVersion, setAppVersion] = useState(null);
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
        kasa: { connected: false, deviceCount: 0 }
    });
    const [pluginStatus, setPluginStatus] = useState({ loaded: 0, failed: 0, total: 0 });
    const [engineStatus, setEngineStatus] = useState({ 
        running: false, 
        nodeCount: 0, 
        tickCount: 0,
        registeredNodeTypes: 0
    });
    let unsubscribePlugin;
    const dockRef = useRef(null);
    const fileInputRef = useRef(null);

    // Fetch version on mount
    useEffect(() => {
        const fetchVersion = async () => {
            try {
                const response = await fetch('/api/version');
                if (response.ok) {
                    const data = await response.json();
                    setAppVersion(data.version);
                }
            } catch (err) {
                // Silently fail - version display is non-critical
            }
        };
        fetchVersion();
    }, []);

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

        // Engine status handlers
        const onEngineStatus = (data) => setEngineStatus(data);
        const onEngineStarted = (data) => setEngineStatus(prev => ({ ...prev, ...data, running: true }));
        const onEngineStopped = (data) => setEngineStatus(prev => ({ ...prev, ...data, running: false }));
        
        socket.on('engine-status', onEngineStatus);
        socket.on('engine-started', onEngineStarted);
        socket.on('engine-stopped', onEngineStopped);

        // Initial status
        setConnectionStatus(prev => ({ ...prev, backend: socket.connected }));

        // Request initial hue status if already connected
        if (socket.connected) {
            socket.emit('request-hue-status');
            socket.emit('request-engine-status');
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
            socket.off('engine-status', onEngineStatus);
            socket.off('engine-started', onEngineStarted);
            socket.off('engine-stopped', onEngineStopped);
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

    // Open server graphs modal and fetch list
    const handleOpenServerGraphs = async () => {
        setServerGraphsOpen(true);
        setLoadingGraphs(true);
        try {
            const response = await authFetch('/api/engine/graphs');
            if (response.ok) {
                const data = await response.json();
                setServerGraphs(data.graphs || []);
            } else {
                toast.error('Failed to load graphs list');
                setServerGraphs([]);
            }
        } catch (err) {
            console.error('Failed to fetch server graphs:', err);
            toast.error('Failed to connect to server');
            setServerGraphs([]);
        } finally {
            setLoadingGraphs(false);
        }
    };

    // Load a specific graph from server
    const handleLoadServerGraph = async (graphName) => {
        try {
            const response = await authFetch(`/api/engine/graphs/${encodeURIComponent(graphName)}`);
            if (response.ok) {
                const data = await response.json();
                if (data.graph) {
                    onImport(data.graph);
                    setServerGraphsOpen(false);
                    toast.success(`Loaded: ${graphName.replace('.json', '')}`);
                }
            } else {
                toast.error('Failed to load graph');
            }
        } catch (err) {
            console.error('Failed to load graph:', err);
            toast.error('Failed to load graph');
        }
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
            
            // Don't show update prompts in HA add-on
            if (data.isAddon) {
                toast.info('📦 Add-on updates are available through Home Assistant → Settings → Add-ons → T2AutoTron', { duration: 6000 });
                return;
            }
            
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
                        <button onClick={handleOpenServerGraphs} className="dock-btn" title="Load a saved graph from the server">📁 Saved Graphs</button>
                        <button onClick={onLoadExample} className="dock-btn" title="Load a starter graph to see how things work">📚 Load Example</button>
                        <button onClick={handleImportClick} className="dock-btn">📂 Import File</button>
                        <button onClick={onClear} className="dock-btn">🗑️ Clear</button>
                        <button 
                            onClick={() => socket.emit(engineStatus.running ? 'stop-engine' : 'start-engine')}
                            className={`dock-btn ${engineStatus.running ? 'dock-btn-active' : ''}`}
                            title={engineStatus.running ? 'Stop backend engine' : 'Start backend engine (runs automations 24/7)'}
                        >
                            {engineStatus.running ? '⏹️ Stop Engine' : '▶️ Start Engine'}
                        </button>
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
                        <div className={`dock-status-item ${engineStatus.running ? 'connected' : 'disconnected'}`}>
                            <span className="dock-status-dot" style={{ background: engineStatus.running ? '#10b981' : '#6b7280' }}></span>
                            <span className="dock-status-label">Engine</span>
                            <span className="dock-status-value">
                                {engineStatus.running 
                                    ? `Running (${engineStatus.nodeCount} nodes)` 
                                    : 'Stopped'}
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
                        onClick={async () => {
                            // Fetch version fresh to ensure it's current
                            let version = appVersion || 'unknown';
                            try {
                                const resp = await fetch('/api/version');
                                if (resp.ok) {
                                    const data = await resp.json();
                                    version = data.version || version;
                                }
                            } catch (e) { /* use cached */ }
                            
                            // Gather debug info
                            const debugInfo = {
                                version,
                                userAgent: navigator.userAgent,
                                isAddon: IS_HA_ADDON,
                                backend: connectionStatus.backend,
                                ha: connectionStatus.ha.connected,
                                engine: engineStatus.running,
                                plugins: pluginStatus.loaded
                            };
                            const infoStr = Object.entries(debugInfo)
                                .map(([k, v]) => `- **${k}**: ${v}`)
                                .join('\n');
                            
                            // Open GitHub issue with pre-filled info
                            const url = new URL('https://github.com/gregtee2/T2AutoTron/issues/new');
                            url.searchParams.set('template', 'bug_report.md');
                            url.searchParams.set('title', '[Bug]: ');
                            url.searchParams.set('body', `## 🖥️ Environment (auto-filled)\n${infoStr}\n\n## 🐛 Bug Description\n<!-- Describe what went wrong -->\n\n`);
                            window.open(url.toString(), '_blank');
                        }}
                        className="dock-btn dock-btn-bug"
                        title="Report a bug on GitHub"
                    >
                        🐛 Report Bug
                    </button>
                    {IS_HA_ADDON ? (
                        /* HA Add-on: Updates come from HA Supervisor, not git */
                        <button 
                            onClick={() => toast.info('📦 Add-on updates are available through Home Assistant → Settings → Add-ons → T2AutoTron → Update', { duration: 8000 })}
                            className="dock-btn dock-btn-update"
                            title="Updates are managed by Home Assistant Supervisor"
                        >
                            ℹ️ Update via HA
                        </button>
                    ) : (
                        /* Desktop/Electron: Git-based updates */
                        <button 
                            onClick={handleCheckForUpdates} 
                            disabled={checkingUpdate}
                            className="dock-btn dock-btn-update"
                            title="Check for available updates (full rebuild)"
                        >
                            {checkingUpdate ? '⏳ Checking...' : '🔄 Check for Updates'}
                        </button>
                    )}
                    <button 
                        onClick={handlePluginUpdate} 
                        disabled={checkingPlugins}
                        className="dock-btn dock-btn-plugins"
                        title="Hot-update plugins without restart"
                    >
                        {checkingPlugins ? '⏳ Updating...' : '🔌 Update Plugins'}
                    </button>
                </div>
                {appVersion && (
                    <div className="dock-version" title="T2AutoTron version">
                        v{appVersion}
                    </div>
                )}
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

            {/* Server Graphs Modal */}
            {serverGraphsOpen && (
                <div className="modal-overlay" onClick={() => setServerGraphsOpen(false)}>
                    <div className="modal server-graphs-modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>📁 Saved Graphs</h2>
                            <button className="modal-close" onClick={() => setServerGraphsOpen(false)}>×</button>
                        </div>
                        <div className="modal-body">
                            {loadingGraphs ? (
                                <div className="loading-message">Loading graphs...</div>
                            ) : serverGraphs.length === 0 ? (
                                <div className="empty-message">
                                    <p>No saved graphs found.</p>
                                    <p style={{ fontSize: '0.9em', opacity: 0.7 }}>
                                        Create a graph and click "Save" to save it to the server.
                                    </p>
                                </div>
                            ) : (
                                <div className="graphs-list">
                                    {serverGraphs.map((graph, index) => (
                                        <div 
                                            key={index}
                                            className="graph-item"
                                            onClick={() => handleLoadServerGraph(graph.name)}
                                        >
                                            <span className="graph-name">{graph.displayName}</span>
                                            <span className="graph-date">
                                                {new Date(graph.modified).toLocaleDateString()}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
