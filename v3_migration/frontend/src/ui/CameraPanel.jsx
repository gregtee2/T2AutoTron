import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
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
    const [editCreds, setEditCreds] = useState({ username: '', password: '', name: '', rtspPath: '' });
    const [rtspPresets, setRtspPresets] = useState({}); // RTSP path presets from server
    const [credentials, setCredentials] = useState({ username: '', password: '' });
    const [newCameraName, setNewCameraName] = useState('');
    const [refreshInterval, setRefreshInterval] = useState(5000);
    const [selectedCamera, setSelectedCamera] = useState(null);
    const [popoutWindow, setPopoutWindow] = useState(null); // { camera, x, y, width, height }
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const refreshTimerRef = useRef(null);
    const popoutRef = useRef(null);
    const [cameraTimestamps, setCameraTimestamps] = useState({});
    const [gridColumns, setGridColumns] = useState(2); // 1, 2, 3, or 4 columns
    const [contextMenu, setContextMenu] = useState(null); // { x, y, camera }
    const [useMjpeg, setUseMjpeg] = useState(true);  // NEW: Use MJPEG streams by default (true = live, false = snapshots)
    const [isLiveMode, setIsLiveMode] = useState(false); // Toggle snapshot vs live stream (for popout HLS)
    const [streamLoading, setStreamLoading] = useState(false);
    const [streamError, setStreamError] = useState(null);
    const [inspecting, setInspecting] = useState(false); // Camera inspection in progress
    const [inspectResult, setInspectResult] = useState(null); // Last inspection result
    const [multiCamPopout, setMultiCamPopout] = useState(null); // { x, y, width, height } - multi-camera grid popout
    const [focusedCamera, setFocusedCamera] = useState(null); // Camera IP for full-screen within popout
    const [popoutGridColumns, setPopoutGridColumns] = useState(2); // Grid columns in popout
    const videoRef = useRef(null);
    const hlsRef = useRef(null);
    const multiCamRef = useRef(null);
    const [popoutFrameTimestamp, setPopoutFrameTimestamp] = useState(Date.now()); // Fast refresh for single popout

    // Load HLS.js library dynamically
    useEffect(() => {
        if (!window.Hls) {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest';
            script.async = true;
            script.onload = () => console.log('[CameraPanel] HLS.js loaded');
            document.head.appendChild(script);
        }
    }, []);

    // Track current streaming camera IP to prevent duplicate viewer counts
    const streamingCameraRef = useRef(null);
    const popoutLoadingRef = useRef(false); // Prevent request pileup

    // Request next frame only after current one loads (prevents pileup)
    const requestNextPopoutFrame = () => {
        if (popoutWindow && !isLiveMode && !popoutLoadingRef.current) {
            popoutLoadingRef.current = true;
            // Small delay to maintain frame rate, then trigger next load
            setTimeout(() => {
                setPopoutFrameTimestamp(Date.now());
            }, 33); // ~30fps max
        }
    };

    const onPopoutFrameLoad = () => {
        popoutLoadingRef.current = false;
        requestNextPopoutFrame();
    };

    // Start the frame loading loop when popout opens
    useEffect(() => {
        if (popoutWindow && !isLiveMode) {
            popoutLoadingRef.current = false;
            setPopoutFrameTimestamp(Date.now()); // Trigger first frame
        }
    }, [popoutWindow, isLiveMode]);

    // Clean up HLS AND notify server when popout closes or camera changes
    useEffect(() => {
        // Store the camera IP when stream starts
        if (isLiveMode && popoutWindow?.camera?.ip) {
            streamingCameraRef.current = popoutWindow.camera.ip;
        }
        
        return () => {
            // Destroy HLS.js instance
            if (hlsRef.current) {
                hlsRef.current.destroy();
                hlsRef.current = null;
            }
            
            // Notify server to decrement viewer count
            const streamingIp = streamingCameraRef.current;
            if (streamingIp) {
                console.log('[CameraPanel] Cleanup: stopping stream for', streamingIp);
                // Fire and forget - can't await in cleanup
                fetch(`/api/cameras/stream/${streamingIp}/stop`, { method: 'POST' })
                    .catch(err => console.warn('[CameraPanel] Cleanup stop failed:', err));
                streamingCameraRef.current = null;
            }
        };
    }, [popoutWindow?.camera?.ip, isLiveMode]);

    // Start live stream
    const startLiveStream = async (camera) => {
        if (!camera?.ip) return;
        
        // If we're already streaming this camera, don't start again
        if (streamingCameraRef.current === camera.ip && isLiveMode) {
            console.log('[CameraPanel] Already streaming', camera.ip);
            return;
        }
        
        // If streaming a different camera, stop that first
        if (streamingCameraRef.current && streamingCameraRef.current !== camera.ip) {
            console.log('[CameraPanel] Switching cameras, stopping', streamingCameraRef.current);
            try {
                await apiFetch(`/api/cameras/stream/${streamingCameraRef.current}/stop`, { method: 'POST' });
            } catch (err) {
                console.warn('[CameraPanel] Failed to stop previous stream:', err);
            }
            streamingCameraRef.current = null;
        }
        
        setStreamLoading(true);
        setStreamError(null);
        setIsLiveMode(true);  // Set FIRST so video element renders
        
        try {
            // Request server to start FFmpeg transcoding
            const response = await apiFetch(`/api/cameras/stream/${camera.ip}/start`, {
                method: 'POST'
            });
            
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to start stream');
            }
            
            const data = await response.json();
            console.log('[CameraPanel] Stream started:', data);
            
            // Record that we're now streaming this camera
            streamingCameraRef.current = camera.ip;
            
            // Wait for first segments AND for video element to mount
            await new Promise(resolve => setTimeout(resolve, 2500));
            
            // Connect HLS.js to video element
            if (!videoRef.current) {
                console.error('[CameraPanel] Video element not found!');
                setStreamError('Video element not ready');
                setStreamLoading(false);
                return;
            }
            
            if (!window.Hls) {
                console.error('[CameraPanel] HLS.js not loaded!');
                setStreamError('HLS.js not loaded');
                setStreamLoading(false);
                return;
            }
            
            // Convert IP to safe folder name (dots → underscores)
            const safeId = camera.ip.replace(/\./g, '_');
            const streamUrl = `/streams/${safeId}/index.m3u8`;
            console.log('[CameraPanel] Loading HLS stream from:', streamUrl);
            
            if (window.Hls.isSupported()) {
                const hls = new window.Hls({
                    debug: false,
                    enableWorker: true,
                    lowLatencyMode: true,
                    backBufferLength: 10
                });
                
                hls.loadSource(streamUrl);
                hls.attachMedia(videoRef.current);
                
                hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
                    console.log('[CameraPanel] HLS manifest parsed, starting playback');
                    videoRef.current.play().catch(e => console.log('[CameraPanel] Autoplay blocked:', e));
                    setStreamLoading(false);
                });
                
                hls.on(window.Hls.Events.ERROR, (event, data) => {
                    console.error('[CameraPanel] HLS error:', data);
                    if (data.fatal) {
                        setStreamError(`Stream error: ${data.type}`);
                        setStreamLoading(false);
                    }
                });
                
                hlsRef.current = hls;
            } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
                // Safari native HLS support
                videoRef.current.src = streamUrl;
                videoRef.current.addEventListener('loadedmetadata', () => {
                    videoRef.current.play().catch(e => console.log('[CameraPanel] Autoplay blocked:', e));
                    setStreamLoading(false);
                });
            } else {
                setStreamError('HLS not supported in this browser');
                setStreamLoading(false);
            }
        } catch (err) {
            console.error('[CameraPanel] Failed to start stream:', err);
            setStreamError(err.message);
            setStreamLoading(false);
            setIsLiveMode(false);  // Revert to snapshot mode on error
        }
    };

    // Stop live stream
    const stopLiveStream = async (camera) => {
        // Destroy HLS instance
        if (hlsRef.current) {
            hlsRef.current.destroy();
            hlsRef.current = null;
        }
        
        // Clear the streaming ref
        streamingCameraRef.current = null;
        
        // Tell server to stop FFmpeg
        if (camera?.ip) {
            try {
                await apiFetch(`/api/cameras/stream/${camera.ip}/stop`, {
                    method: 'POST'
                });
                console.log('[CameraPanel] Stream stopped');
            } catch (err) {
                console.warn('[CameraPanel] Failed to stop stream:', err);
            }
        }
        
        setIsLiveMode(false);
        setStreamLoading(false);
        setStreamError(null);
    };

    // Fetch cameras on mount
    useEffect(() => {
        fetchCameras();
        return () => {
            if (refreshTimerRef.current) {
                clearInterval(refreshTimerRef.current);
            }
        };
    }, []);

    // Close context menu on click outside
    useEffect(() => {
        const handleClickOutside = () => setContextMenu(null);
        if (contextMenu) {
            document.addEventListener('click', handleClickOutside);
            return () => document.removeEventListener('click', handleClickOutside);
        }
    }, [contextMenu]);

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
            // Also fetch RTSP presets
            const presetsRes = await apiFetch('/api/cameras/rtsp-presets');
            if (presetsRes.ok) {
                const presetsData = await presetsRes.json();
                setRtspPresets(presetsData.presets || {});
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
            // Determine final RTSP path
            const rtspPath = creds?.rtspPath === 'custom' 
                ? creds?.customRtspPath 
                : (creds?.rtspPath || 'amcrest-main');
            
            await apiFetch('/api/cameras', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ip,
                    name: name || `Camera ${ip.split('.').pop()}`,
                    username: creds?.username || credentials.username,
                    password: creds?.password || credentials.password,
                    rtspPath: rtspPath
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
            // Determine final RTSP path
            const rtspPath = editCreds.rtspPath === 'custom' 
                ? editCreds.customRtspPath 
                : editCreds.rtspPath;
            
            await apiFetch('/api/cameras', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ip: editCamera,
                    name: editCreds.name,
                    username: editCreds.username,
                    password: editCreds.password,
                    rtspPath: rtspPath
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

    // Inspect camera to auto-detect make/model and RTSP path (like Blue Iris "Find/Inspect")
    const inspectCamera = async () => {
        if (!editCamera) return;
        
        setInspecting(true);
        setInspectResult(null);
        setError(null);
        
        try {
            // Get current credentials (from form or existing camera)
            const existingCam = cameras.find(c => c.ip === editCamera);
            const username = editCreds.username || existingCam?.username || credentials.username || '';
            const password = editCreds.password || existingCam?.password || credentials.password || '';
            
            console.log(`[CameraPanel] Inspecting ${editCamera} with user=${username}`);
            
            const response = await apiFetch('/api/cameras/inspect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ip: editCamera,
                    username,
                    password
                })
            });
            
            const result = await response.json();
            setInspectResult(result);
            
            if (result.success) {
                // Auto-fill detected info
                if (result.manufacturer && result.model) {
                    setEditCreds(prev => ({
                        ...prev,
                        name: prev.name || `${result.manufacturer} ${result.model}`,
                        rtspPath: result.workingPath || prev.rtspPath
                    }));
                } else if (result.workingPath) {
                    setEditCreds(prev => ({
                        ...prev,
                        rtspPath: result.workingPath
                    }));
                }
                
                if (window.T2Toast) {
                    window.T2Toast.success(`Found: ${result.manufacturer || 'Camera'} ${result.model || ''} - ${result.method}`);
                }
            } else {
                if (window.T2Toast) {
                    window.T2Toast.error(result.error || 'Could not detect camera settings');
                }
            }
        } catch (err) {
            console.error('[CameraPanel] Inspect error:', err);
            setError('Failed to inspect camera');
        } finally {
            setInspecting(false);
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
            gridTemplateColumns: `repeat(${gridColumns}, 1fr)`,
            gap: '10px'
        },
        gridSelector: {
            display: 'flex',
            gap: '4px',
            alignItems: 'center',
            marginLeft: 'auto'
        },
        gridBtn: {
            background: 'rgba(0, 0, 0, 0.3)',
            border: '1px solid rgba(0, 200, 255, 0.2)',
            borderRadius: '4px',
            padding: '4px 8px',
            color: '#8899aa',
            cursor: 'pointer',
            fontSize: '11px',
            minWidth: '32px',
            textAlign: 'center'
        },
        gridBtnActive: {
            background: 'rgba(0, 200, 255, 0.2)',
            borderColor: 'rgba(0, 200, 255, 0.5)',
            color: '#00d4ff'
        },
        contextMenu: {
            position: 'fixed',
            background: 'rgba(20, 30, 45, 0.98)',
            border: '1px solid rgba(0, 200, 255, 0.3)',
            borderRadius: '8px',
            padding: '4px 0',
            minWidth: '160px',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
            zIndex: 10001
        },
        contextMenuItem: {
            padding: '8px 16px',
            color: '#b8e6ea',
            fontSize: '12px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
        },
        contextMenuDivider: {
            height: '1px',
            background: 'rgba(0, 200, 255, 0.15)',
            margin: '4px 0'
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
            top: '8px',
            right: '8px',
            background: 'rgba(255, 80, 80, 0.8)',
            border: 'none',
            color: '#fff',
            padding: '4px 10px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
            zIndex: 10
        },
        popoutWindow: {
            position: 'fixed',
            background: 'linear-gradient(180deg, rgba(15, 25, 40, 0.98) 0%, rgba(10, 18, 30, 0.98) 100%)',
            border: '1px solid rgba(0, 200, 255, 0.4)',
            borderRadius: '8px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
            overflow: 'hidden',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column'
        },
        popoutHeader: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            background: 'linear-gradient(90deg, rgba(0, 150, 200, 0.2), transparent)',
            borderBottom: '1px solid rgba(0, 200, 255, 0.2)',
            cursor: 'move',
            userSelect: 'none'
        },
        popoutTitle: {
            color: '#00d4ff',
            fontSize: '13px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
        },
        popoutControls: {
            display: 'flex',
            gap: '6px'
        },
        popoutBtn: {
            background: 'rgba(0, 0, 0, 0.3)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            color: '#aaa',
            width: '24px',
            height: '24px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
        },
        popoutCloseBtn: {
            background: 'rgba(255, 80, 80, 0.3)',
            borderColor: 'rgba(255, 80, 80, 0.3)',
            color: '#ff8888'
        },
        popoutContent: {
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#000',
            position: 'relative',
            overflow: 'hidden'
        },
        popoutImage: {
            width: '100%',
            height: '100%',
            objectFit: 'contain'
        },
        resizeHandle: {
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: '16px',
            height: '16px',
            cursor: 'se-resize',
            background: 'linear-gradient(135deg, transparent 50%, rgba(0, 200, 255, 0.4) 50%)',
            borderRadius: '0 0 8px 0'
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

    // Get thumbnail URL - from frame service (always-on) or fallback to snapshot
    const getThumbnailUrl = (ip) => {
        if (useMjpeg) {
            // Use MJPEG streaming for smooth real-time playback
            // Browser maintains persistent HTTP connection
            // Lower FPS for thumbnails (5fps) to reduce bandwidth
            return `/api/cameras/mjpeg/${ip}?fps=5`;
        } else {
            // Snapshot mode - direct camera request (slower)
            const timestamp = cameraTimestamps[ip] || Date.now();
            return `/api/cameras/snapshot/${ip}?t=${timestamp}`;
        }
    };
    
    // Legacy function name for compatibility
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {/* Pop Out All Cameras Button */}
                    {cameras.length > 0 && (
                        <button
                            style={{
                                background: 'rgba(0, 200, 255, 0.2)',
                                border: '1px solid rgba(0, 200, 255, 0.4)',
                                color: '#00d4ff',
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                cursor: 'pointer'
                            }}
                            onClick={(e) => {
                                e.stopPropagation();
                                // Open multi-camera popout
                                const width = Math.min(1200, window.innerWidth - 100);
                                const height = Math.min(800, window.innerHeight - 100);
                                setMultiCamPopout({
                                    x: (window.innerWidth - width) / 2,
                                    y: (window.innerHeight - height) / 2,
                                    width,
                                    height
                                });
                                setFocusedCamera(null);
                            }}
                            title="Open all cameras in floating window"
                        >
                            ⬚ Pop Out
                        </button>
                    )}
                    <span style={{ color: '#00d4ff' }}>{isExpanded ? '▼' : '▶'}</span>
                </div>
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
                        
                        {/* Live/Snapshot Toggle */}
                        <div style={styles.gridSelector}>
                            <button
                                style={{
                                    ...styles.gridBtn,
                                    ...(useMjpeg ? styles.gridBtnActive : {}),
                                    minWidth: '50px'
                                }}
                                onClick={() => setUseMjpeg(true)}
                                title="Live frames from always-on capture service (faster)"
                            >
                                🔴 Live
                            </button>
                            <button
                                style={{
                                    ...styles.gridBtn,
                                    ...(!useMjpeg ? styles.gridBtnActive : {}),
                                    minWidth: '50px'
                                }}
                                onClick={() => setUseMjpeg(false)}
                                title="Direct camera snapshots (slower, fallback)"
                            >
                                📸 Snap
                            </button>
                        </div>
                        
                        {/* Grid Layout Selector */}
                        <div style={styles.gridSelector}>
                            <span style={{ color: '#667788', fontSize: '10px', marginRight: '4px' }}>Grid:</span>
                            {[1, 2, 3, 4].map(cols => (
                                <button
                                    key={cols}
                                    style={{
                                        ...styles.gridBtn,
                                        ...(gridColumns === cols ? styles.gridBtnActive : {})
                                    }}
                                    onClick={() => setGridColumns(cols)}
                                    title={`${cols}x${cols} grid`}
                                >
                                    {cols}×{cols}
                                </button>
                            ))}
                        </div>
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
                                            setEditCreds({ username: '', password: '', name: '', rtspPath: '' });
                                            return;
                                        }
                                        // Check if it's an existing camera or a discovered one
                                        const existing = cameras.find(c => c.ip === ip);
                                        if (existing) {
                                            setEditCamera(ip);
                                            setEditCreds({
                                                name: existing.name || '',
                                                username: existing.username || '',
                                                password: '',
                                                rtspPath: existing.rtspPath || 'amcrest-main'
                                            });
                                        } else {
                                            // It's a newly discovered camera
                                            setEditCamera(ip);
                                            setEditCreds({
                                                name: `Camera ${ip.split('.').pop()}`,
                                                username: credentials.username || '',
                                                password: credentials.password || '',
                                                rtspPath: 'amcrest-main'
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
                                    
                                    {/* Find/Inspect Button - like Blue Iris */}
                                    <div style={{ marginBottom: '12px' }}>
                                        <button 
                                            style={{
                                                ...styles.btn,
                                                width: '100%',
                                                justifyContent: 'center',
                                                background: inspecting 
                                                    ? 'rgba(255, 193, 7, 0.3)' 
                                                    : 'linear-gradient(180deg, rgba(0, 150, 255, 0.3) 0%, rgba(0, 100, 200, 0.3) 100%)',
                                                border: '1px solid rgba(0, 150, 255, 0.5)'
                                            }}
                                            onClick={inspectCamera}
                                            disabled={inspecting || !editCamera}
                                        >
                                            {inspecting ? '🔍 Inspecting...' : '🔍 Find/Inspect Camera'}
                                        </button>
                                        <div style={{ fontSize: '11px', color: '#888', marginTop: '4px', textAlign: 'center' }}>
                                            Auto-detects camera make/model and RTSP settings
                                        </div>
                                    </div>
                                    
                                    {/* Inspection Result */}
                                    {inspectResult && (
                                        <div style={{
                                            background: inspectResult.success 
                                                ? 'rgba(76, 175, 80, 0.15)' 
                                                : 'rgba(244, 67, 54, 0.15)',
                                            border: `1px solid ${inspectResult.success ? 'rgba(76, 175, 80, 0.4)' : 'rgba(244, 67, 54, 0.4)'}`,
                                            borderRadius: '6px',
                                            padding: '10px',
                                            marginBottom: '12px',
                                            fontSize: '12px'
                                        }}>
                                            {inspectResult.success ? (
                                                <>
                                                    <div style={{ fontWeight: 'bold', marginBottom: '6px', color: '#4caf50' }}>
                                                        ✅ Camera Detected via {inspectResult.method}
                                                    </div>
                                                    {inspectResult.manufacturer && (
                                                        <div>Make: <strong>{inspectResult.manufacturer}</strong></div>
                                                    )}
                                                    {inspectResult.model && (
                                                        <div>Model: <strong>{inspectResult.model}</strong></div>
                                                    )}
                                                    {inspectResult.workingPath && (
                                                        <div>RTSP Path: <code style={{ background: '#222', padding: '2px 6px', borderRadius: '3px' }}>{inspectResult.workingPath}</code></div>
                                                    )}
                                                    {inspectResult.videoInfo && (
                                                        <div>Video: {inspectResult.videoInfo.codec} {inspectResult.videoInfo.width}x{inspectResult.videoInfo.height}</div>
                                                    )}
                                                    {inspectResult.profiles?.length > 1 && (
                                                        <div style={{ marginTop: '6px' }}>
                                                            <strong>Available Profiles:</strong>
                                                            <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                                                                {inspectResult.profiles.map((p, i) => (
                                                                    <li key={i}>{p.name}: <code>{p.rtspPath}</code></li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    )}
                                                </>
                                            ) : (
                                                <div style={{ color: '#f44336' }}>
                                                    ❌ {inspectResult.error || 'Could not detect camera'}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    
                                    <div style={styles.inputGroup}>
                                        <label style={styles.label}>RTSP Path (for live streaming)</label>
                                        <select
                                            style={{...styles.input, cursor: 'pointer'}}
                                            value={editCreds.rtspPath || ''}
                                            onChange={(e) => setEditCreds(p => ({...p, rtspPath: e.target.value}))}
                                        >
                                            <option value="">-- Select or detect --</option>
                                            {/* Show detected path if it doesn't match a preset */}
                                            {editCreds.rtspPath && editCreds.rtspPath.startsWith('/') && (
                                                <option value={editCreds.rtspPath}>
                                                    ✅ Detected: {editCreds.rtspPath}
                                                </option>
                                            )}
                                            <optgroup label="Common Presets">
                                                {Object.entries(rtspPresets).map(([key, path]) => (
                                                    <option key={key} value={key}>
                                                        {key.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} ({path})
                                                    </option>
                                                ))}
                                            </optgroup>
                                            <option value="custom">Custom Path...</option>
                                        </select>
                                        {editCreds.rtspPath === 'custom' && (
                                            <input
                                                type="text"
                                                style={{...styles.input, marginTop: '4px'}}
                                                value={editCreds.customRtspPath || ''}
                                                onChange={(e) => setEditCreds(p => ({...p, customRtspPath: e.target.value}))}
                                                placeholder="/cam/realmonitor?channel=1&subtype=0"
                                            />
                                        )}
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
                                    onClick={() => {
                                        // Open as popout window - center on screen
                                        const width = 640;
                                        const height = 480;
                                        setPopoutWindow({
                                            camera,
                                            x: Math.max(50, (window.innerWidth - width) / 2),
                                            y: Math.max(50, (window.innerHeight - height) / 2),
                                            width,
                                            height
                                        });
                                    }}
                                    onContextMenu={(e) => {
                                        e.preventDefault();
                                        setContextMenu({ x: e.clientX, y: e.clientY, camera });
                                    }}
                                >
                                    <img 
                                        src={getThumbnailUrl(camera.ip)}
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

            {/* Popout Camera Window - rendered via Portal to body for true floating */}
            {popoutWindow && ReactDOM.createPortal(
                <>
                    <div 
                        ref={popoutRef}
                        style={{
                            ...styles.popoutWindow,
                            left: popoutWindow.x,
                            top: popoutWindow.y,
                            width: popoutWindow.width,
                            height: popoutWindow.height
                        }}
                    >
                        {/* Draggable Header */}
                        <div 
                            style={styles.popoutHeader}
                            onMouseDown={(e) => {
                                if (e.target.tagName === 'BUTTON') return;
                                setIsDragging(true);
                                setDragOffset({
                                    x: e.clientX - popoutWindow.x,
                                    y: e.clientY - popoutWindow.y
                                });
                            }}
                        >
                            <div style={styles.popoutTitle}>
                                📹 {popoutWindow.camera.name}
                                {isLiveMode && <span style={{ marginLeft: '8px', color: '#f44336', fontWeight: 'bold' }}>● LIVE</span>}
                            </div>
                            <div style={styles.popoutControls}>
                                {/* Live/Snapshot Toggle */}
                                <button 
                                    style={{
                                        ...styles.popoutBtn,
                                        backgroundColor: isLiveMode ? '#f44336' : '#4caf50',
                                        color: 'white',
                                        fontWeight: 'bold',
                                        minWidth: '60px'
                                    }}
                                    onClick={() => {
                                        if (isLiveMode) {
                                            stopLiveStream(popoutWindow.camera);
                                        } else {
                                            startLiveStream(popoutWindow.camera);
                                        }
                                    }}
                                    title={isLiveMode ? "Stop live stream" : "Start live stream"}
                                    disabled={streamLoading}
                                >
                                    {streamLoading ? '⏳' : isLiveMode ? '⏹ Stop' : '▶ Live'}
                                </button>
                                <button 
                                    style={styles.popoutBtn}
                                    onClick={() => {
                                        // Refresh snapshot
                                        setCameraTimestamps(prev => ({ 
                                            ...prev, 
                                            [popoutWindow.camera.ip]: Date.now() 
                                        }));
                                    }}
                                    title="Refresh"
                                    disabled={isLiveMode}
                                >
                                    🔄
                                </button>
                                <button 
                                    style={styles.popoutBtn}
                                    onClick={() => {
                                        // Open in new browser tab
                                        window.open(getSnapshotUrl(popoutWindow.camera.ip), '_blank');
                                    }}
                                    title="Open in new tab"
                                >
                                    ↗
                                </button>
                                <button 
                                    style={{...styles.popoutBtn, ...styles.popoutCloseBtn}}
                                    onClick={() => {
                                        // Clean up stream before closing
                                        if (isLiveMode) {
                                            stopLiveStream(popoutWindow.camera);
                                        }
                                        setPopoutWindow(null);
                                    }}
                                    title="Close"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>
                        
                        {/* Camera Image or Live Video */}
                        <div style={styles.popoutContent}>
                            {streamError && (
                                <div style={{
                                    position: 'absolute',
                                    top: '50%',
                                    left: '50%',
                                    transform: 'translate(-50%, -50%)',
                                    background: 'rgba(244, 67, 54, 0.9)',
                                    color: 'white',
                                    padding: '12px 20px',
                                    borderRadius: '8px',
                                    zIndex: 10
                                }}>
                                    ⚠️ {streamError}
                                </div>
                            )}
                            {streamLoading && (
                                <div style={{
                                    position: 'absolute',
                                    top: '50%',
                                    left: '50%',
                                    transform: 'translate(-50%, -50%)',
                                    background: 'rgba(0,0,0,0.7)',
                                    color: 'white',
                                    padding: '12px 20px',
                                    borderRadius: '8px',
                                    zIndex: 10
                                }}>
                                    ⏳ Starting stream...
                                </div>
                            )}
                            {isLiveMode ? (
                                <video 
                                    ref={videoRef}
                                    style={styles.popoutImage}
                                    autoPlay
                                    muted
                                    playsInline
                                />
                            ) : (
                                <img 
                                    src={`/api/cameras/frame/${popoutWindow.camera.ip}?t=${popoutFrameTimestamp}`}
                                    alt={popoutWindow.camera.name}
                                    style={styles.popoutImage}
                                    draggable={false}
                                    onLoad={onPopoutFrameLoad}
                                    onError={onPopoutFrameLoad}
                                />
                            )}
                        </div>
                        
                        {/* Resize Handle */}
                        <div 
                            style={styles.resizeHandle}
                            onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setIsResizing(true);
                            }}
                        />
                    </div>
                    
                    {/* Mouse move/up handlers for drag/resize */}
                    {(isDragging || isResizing) && (
                        <div 
                            style={{
                                position: 'fixed',
                                top: 0,
                                left: 0,
                                right: 0,
                                bottom: 0,
                                zIndex: 10000,
                                cursor: isDragging ? 'move' : 'se-resize'
                            }}
                            onMouseMove={(e) => {
                                if (isDragging && popoutWindow) {
                                    setPopoutWindow(prev => ({
                                        ...prev,
                                        x: e.clientX - dragOffset.x,
                                        y: e.clientY - dragOffset.y
                                    }));
                                } else if (isResizing && popoutWindow) {
                                    const newWidth = Math.max(200, e.clientX - popoutWindow.x);
                                    const newHeight = Math.max(150, e.clientY - popoutWindow.y);
                                    setPopoutWindow(prev => ({
                                        ...prev,
                                        width: newWidth,
                                        height: newHeight
                                    }));
                                }
                            }}
                            onMouseUp={() => {
                                setIsDragging(false);
                                setIsResizing(false);
                            }}
                        />
                    )}
                </>,
                document.body
            )}

            {/* Right-click Context Menu */}
            {contextMenu && (
                <div 
                    style={{ ...styles.contextMenu, left: contextMenu.x, top: contextMenu.y }}
                    onClick={() => setContextMenu(null)}
                >
                    <div 
                        style={styles.contextMenuItem}
                        onClick={() => {
                            const width = 640;
                            const height = 480;
                            setPopoutWindow({
                                camera: contextMenu.camera,
                                x: Math.max(50, (window.innerWidth - width) / 2),
                                y: Math.max(50, (window.innerHeight - height) / 2),
                                width,
                                height
                            });
                        }}
                        onMouseEnter={(e) => e.target.style.background = 'rgba(0, 200, 255, 0.1)'}
                        onMouseLeave={(e) => e.target.style.background = 'transparent'}
                    >
                        🔍 Open in Window
                    </div>
                    <div 
                        style={styles.contextMenuItem}
                        onClick={() => {
                            // Force refresh this camera
                            setCameraTimestamps(prev => ({ ...prev, [contextMenu.camera.ip]: Date.now() }));
                        }}
                        onMouseEnter={(e) => e.target.style.background = 'rgba(0, 200, 255, 0.1)'}
                        onMouseLeave={(e) => e.target.style.background = 'transparent'}
                    >
                        🔄 Refresh Snapshot
                    </div>
                    <div 
                        style={styles.contextMenuItem}
                        onClick={() => {
                            // Open snapshot in new tab
                            window.open(getSnapshotUrl(contextMenu.camera.ip), '_blank');
                        }}
                        onMouseEnter={(e) => e.target.style.background = 'rgba(0, 200, 255, 0.1)'}
                        onMouseLeave={(e) => e.target.style.background = 'transparent'}
                    >
                        📷 Open in New Tab
                    </div>
                    <div style={styles.contextMenuDivider} />
                    <div 
                        style={styles.contextMenuItem}
                        onClick={() => {
                            setShowSettings(true);
                            setEditCamera(contextMenu.camera.ip);
                            setEditCreds({
                                name: contextMenu.camera.name || '',
                                username: contextMenu.camera.username || '',
                                password: ''
                            });
                        }}
                        onMouseEnter={(e) => e.target.style.background = 'rgba(0, 200, 255, 0.1)'}
                        onMouseLeave={(e) => e.target.style.background = 'transparent'}
                    >
                        ⚙️ Edit Camera
                    </div>
                    <div 
                        style={styles.contextMenuItem}
                        onClick={() => {
                            navigator.clipboard.writeText(contextMenu.camera.ip);
                            if (window.T2Toast) window.T2Toast.success('IP copied to clipboard');
                        }}
                        onMouseEnter={(e) => e.target.style.background = 'rgba(0, 200, 255, 0.1)'}
                        onMouseLeave={(e) => e.target.style.background = 'transparent'}
                    >
                        📋 Copy IP Address
                    </div>
                    <div style={styles.contextMenuDivider} />
                    <div 
                        style={{...styles.contextMenuItem, color: '#ff6b6b'}}
                        onClick={() => {
                            if (confirm(`Remove camera ${contextMenu.camera.name}?`)) {
                                removeCamera(contextMenu.camera.ip);
                            }
                        }}
                        onMouseEnter={(e) => e.target.style.background = 'rgba(255, 100, 100, 0.1)'}
                        onMouseLeave={(e) => e.target.style.background = 'transparent'}
                    >
                        🗑️ Remove Camera
                    </div>
                </div>
            )}

            {/* Multi-Camera Popout Window */}
            {multiCamPopout && ReactDOM.createPortal(
                <MultiCameraPopout 
                    cameras={cameras}
                    popout={multiCamPopout}
                    setPopout={setMultiCamPopout}
                    focusedCamera={focusedCamera}
                    setFocusedCamera={setFocusedCamera}
                    gridColumns={popoutGridColumns}
                    setGridColumns={setPopoutGridColumns}
                    getThumbnailUrl={getThumbnailUrl}
                    cameraTimestamps={cameraTimestamps}
                    setCameraTimestamps={setCameraTimestamps}
                    multiCamRef={multiCamRef}
                />,
                document.body
            )}
        </div>
    );
}

/**
 * MultiCameraPopout - Floating window showing all cameras in a grid
 * Double-click on a camera to focus it full-screen
 * Press ESC or click back button to return to grid view
 */
function MultiCameraPopout({
    cameras,
    popout,
    setPopout,
    focusedCamera,
    setFocusedCamera,
    gridColumns,
    setGridColumns,
    getThumbnailUrl,
    cameraTimestamps,
    setCameraTimestamps,
    multiCamRef
}) {
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [zoomLevel, setZoomLevel] = useState(1);
    const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const [panStart, setPanStart] = useState({ x: 0, y: 0 });
    const [refreshRate, setRefreshRate] = useState(67); // ms between frames (67 = 15fps)
    
    // Convert refreshRate (ms) to FPS for MJPEG stream
    const streamFps = Math.round(1000 / refreshRate);
    
    // Use MJPEG streaming for live video - FPS controlled by server
    const getLiveThumbnailUrl = (ip) => {
        return `/api/cameras/mjpeg/${ip}?fps=${streamFps}`;
    };
    
    // Reset zoom when changing cameras
    useEffect(() => {
        setZoomLevel(1);
        setPanOffset({ x: 0, y: 0 });
    }, [focusedCamera]);
    
    // Handle ESC key to exit focused view or close popout
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                if (focusedCamera) {
                    setFocusedCamera(null);
                } else {
                    setPopout(null);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [focusedCamera, setFocusedCamera, setPopout]);

    const focusedCamData = focusedCamera ? cameras.find(c => c.ip === focusedCamera) : null;

    const styles = {
        container: {
            position: 'fixed',
            left: popout.x,
            top: popout.y,
            width: popout.width,
            height: popout.height,
            background: 'linear-gradient(180deg, rgba(15, 25, 40, 0.98) 0%, rgba(10, 18, 30, 0.98) 100%)',
            border: '1px solid rgba(0, 200, 255, 0.4)',
            borderRadius: '8px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
            overflow: 'hidden',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column'
        },
        header: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            background: 'linear-gradient(90deg, rgba(0, 150, 200, 0.2), transparent)',
            borderBottom: '1px solid rgba(0, 200, 255, 0.2)',
            cursor: 'move',
            userSelect: 'none'
        },
        title: {
            color: '#00d4ff',
            fontSize: '14px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
        },
        controls: {
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
        },
        gridBtn: {
            background: 'rgba(0, 0, 0, 0.3)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            color: '#aaa',
            padding: '4px 8px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '11px'
        },
        gridBtnActive: {
            background: 'rgba(0, 200, 255, 0.2)',
            borderColor: 'rgba(0, 200, 255, 0.4)',
            color: '#00d4ff'
        },
        closeBtn: {
            background: 'rgba(255, 80, 80, 0.3)',
            border: '1px solid rgba(255, 80, 80, 0.3)',
            color: '#ff8888',
            width: '28px',
            height: '28px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
        },
        backBtn: {
            background: 'rgba(0, 200, 255, 0.2)',
            border: '1px solid rgba(0, 200, 255, 0.4)',
            color: '#00d4ff',
            padding: '4px 12px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
        },
        content: {
            flex: 1,
            overflow: 'hidden',
            padding: '4px',
            background: '#000'
        },
        grid: {
            display: 'grid',
            gridTemplateColumns: `repeat(${gridColumns}, 1fr)`,
            gridTemplateRows: `repeat(${Math.ceil(cameras.length / gridColumns)}, 1fr)`,
            gap: '2px',
            height: '100%',
            width: '100%'
        },
        cameraCard: {
            position: 'relative',
            background: '#000',
            overflow: 'hidden',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
        },
        cameraCardHover: {
            outline: '2px solid rgba(0, 200, 255, 0.6)'
        },
        cameraImage: {
            width: '100%',
            height: '100%',
            objectFit: 'contain'
        },
        cameraLabel: {
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
            color: '#fff',
            padding: '16px 8px 4px',
            fontSize: '11px',
            fontWeight: 500,
            textShadow: '0 1px 2px rgba(0,0,0,0.8)'
        },
        focusedView: {
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#000',
            position: 'relative',
            overflow: 'hidden'
        },
        focusedImage: {
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
            transformOrigin: 'center center'
        },
        resizeHandle: {
            position: 'absolute',
            right: 0,
            bottom: 0,
            width: '16px',
            height: '16px',
            cursor: 'se-resize',
            background: 'linear-gradient(135deg, transparent 50%, rgba(0, 200, 255, 0.3) 50%)'
        }
    };

    return (
        <>
            <div ref={multiCamRef} style={styles.container}>
                {/* Header */}
                <div 
                    style={styles.header}
                    onMouseDown={(e) => {
                        if (e.target.tagName === 'BUTTON') return;
                        setIsDragging(true);
                        setDragOffset({
                            x: e.clientX - popout.x,
                            y: e.clientY - popout.y
                        });
                    }}
                >
                    <div style={styles.title}>
                        {focusedCamera ? (
                            <>
                                <button 
                                    style={styles.backBtn}
                                    onClick={() => setFocusedCamera(null)}
                                    title="Back to grid (ESC)"
                                >
                                    ← Back
                                </button>
                                <span>📹 {focusedCamData?.name || focusedCamera}</span>
                            </>
                        ) : (
                            <>
                                <span>📹 All Cameras</span>
                                <span style={{ color: '#667788', fontSize: '12px' }}>({cameras.length})</span>
                            </>
                        )}
                    </div>
                    <div style={styles.controls}>
                        {/* Grid selector - only show when in grid view */}
                        {!focusedCamera && (
                            <div style={{ display: 'flex', gap: '4px', marginRight: '8px' }}>
                                <span style={{ color: '#667788', fontSize: '10px', marginRight: '4px' }}>Grid:</span>
                                {[1, 2, 3, 4].map(cols => (
                                    <button
                                        key={cols}
                                        style={{
                                            ...styles.gridBtn,
                                            ...(gridColumns === cols ? styles.gridBtnActive : {})
                                        }}
                                        onClick={() => setGridColumns(cols)}
                                    >
                                        {cols}×{cols}
                                    </button>
                                ))}
                            </div>
                        )}
                        {/* FPS selector */}
                        <select
                            style={{
                                background: 'rgba(0, 0, 0, 0.4)',
                                border: '1px solid rgba(255, 255, 255, 0.2)',
                                color: '#aaa',
                                padding: '4px 6px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                cursor: 'pointer'
                            }}
                            value={refreshRate}
                            onChange={(e) => setRefreshRate(Number(e.target.value))}
                            onPointerDown={(e) => e.stopPropagation()}
                            title="Frame rate (higher = more bandwidth)"
                        >
                            <option value={33}>30 fps</option>
                            <option value={67}>15 fps</option>
                            <option value={100}>10 fps</option>
                            <option value={200}>5 fps</option>
                            <option value={500}>2 fps</option>
                            <option value={1000}>1 fps</option>
                        </select>
                        {/* Close */}
                        <button 
                            style={styles.closeBtn}
                            onClick={() => setPopout(null)}
                            title="Close (ESC)"
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {/* Content - Grid View or Focused View */}
                {focusedCamera ? (
                    <div 
                        style={styles.focusedView}
                        onDoubleClick={() => setFocusedCamera(null)}
                        onWheel={(e) => {
                            e.preventDefault();
                            const delta = e.deltaY > 0 ? -0.1 : 0.1;
                            setZoomLevel(prev => Math.max(0.5, Math.min(5, prev + delta)));
                        }}
                        onMouseDown={(e) => {
                            if (zoomLevel > 1) {
                                setIsPanning(true);
                                setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
                            }
                        }}
                        onMouseMove={(e) => {
                            if (isPanning) {
                                setPanOffset({
                                    x: e.clientX - panStart.x,
                                    y: e.clientY - panStart.y
                                });
                            }
                        }}
                        onMouseUp={() => setIsPanning(false)}
                        onMouseLeave={() => setIsPanning(false)}
                    >
                        <img 
                            src={getLiveThumbnailUrl(focusedCamera)}
                            alt={focusedCamData?.name || focusedCamera}
                            style={{
                                ...styles.focusedImage,
                                transform: `scale(${zoomLevel}) translate(${panOffset.x / zoomLevel}px, ${panOffset.y / zoomLevel}px)`,
                                cursor: zoomLevel > 1 ? (isPanning ? 'grabbing' : 'grab') : 'default',
                                transition: isPanning ? 'none' : 'transform 0.1s'
                            }}
                            draggable={false}
                        />
                        {/* Zoom indicator */}
                        {zoomLevel !== 1 && (
                            <div style={{
                                position: 'absolute',
                                top: '10px',
                                right: '10px',
                                background: 'rgba(0,0,0,0.7)',
                                color: '#00d4ff',
                                padding: '4px 10px',
                                borderRadius: '4px',
                                fontSize: '12px'
                            }}>
                                {Math.round(zoomLevel * 100)}%
                            </div>
                        )}
                        <div style={{
                            position: 'absolute',
                            bottom: '10px',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            background: 'rgba(0,0,0,0.6)',
                            color: '#888',
                            padding: '4px 12px',
                            borderRadius: '4px',
                            fontSize: '11px'
                        }}>
                            Scroll to zoom • Drag to pan • Double-click or ESC to return
                        </div>
                    </div>
                ) : (
                    <div style={styles.content}>
                        <div style={styles.grid}>
                            {cameras.map(camera => (
                                <CameraGridCard 
                                    key={camera.ip}
                                    camera={camera}
                                    thumbnailUrl={getLiveThumbnailUrl(camera.ip)}
                                    onDoubleClick={() => setFocusedCamera(camera.ip)}
                                    styles={styles}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {/* Resize Handle */}
                <div 
                    style={styles.resizeHandle}
                    onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsResizing(true);
                    }}
                />
            </div>

            {/* Drag/Resize overlay */}
            {(isDragging || isResizing) && (
                <div 
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        zIndex: 10000,
                        cursor: isDragging ? 'move' : 'se-resize'
                    }}
                    onMouseMove={(e) => {
                        if (isDragging) {
                            setPopout(prev => ({
                                ...prev,
                                x: e.clientX - dragOffset.x,
                                y: e.clientY - dragOffset.y
                            }));
                        } else if (isResizing) {
                            const newWidth = Math.max(400, e.clientX - popout.x);
                            const newHeight = Math.max(300, e.clientY - popout.y);
                            setPopout(prev => ({
                                ...prev,
                                width: newWidth,
                                height: newHeight
                            }));
                        }
                    }}
                    onMouseUp={() => {
                        setIsDragging(false);
                        setIsResizing(false);
                    }}
                />
            )}
        </>
    );
}

/**
 * CameraGridCard - Individual camera tile in the grid
 */
function CameraGridCard({ camera, thumbnailUrl, onDoubleClick, styles }) {
    const [isHovered, setIsHovered] = useState(false);

    return (
        <div 
            style={{
                ...styles.cameraCard,
                ...(isHovered ? styles.cameraCardHover : {})
            }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onDoubleClick={onDoubleClick}
            title={`Double-click to expand ${camera.name}`}
        >
            <img 
                src={thumbnailUrl}
                alt={camera.name}
                style={styles.cameraImage}
                draggable={false}
            />
            <div style={styles.cameraLabel}>
                {camera.name || camera.ip}
            </div>
        </div>
    );
}

export default CameraPanel;
