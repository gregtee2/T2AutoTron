import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Editor } from './Editor';
import { socket, connectSocket, disconnectSocket } from './socket';
import { onPluginProgress } from './registries/PluginLoader';
import ErrorBoundary from './ErrorBoundary';
import { ToastContainer, ToastExposer, useToast } from './ui/Toast';
import { LoadingOverlay } from './ui/LoadingOverlay';
import UpdateModal from './components/UpdateModal';
import { getStoredPin } from './auth/authClient';
import './App.css';
import './styles/performance-mode.css'; // Performance mode overrides

// Apply performance mode from localStorage on page load
const applyPerformanceModeFromStorage = () => {
  try {
    const performanceMode = localStorage.getItem('t2-performance-mode');
    if (performanceMode === 'true') {
      document.body.classList.add('performance-mode');
    }
  } catch (err) {
    console.warn('Failed to apply performance mode:', err);
  }
};
applyPerformanceModeFromStorage();

// Expose for Settings modal
window.setPerformanceMode = (enabled) => {
  if (enabled) {
    document.body.classList.add('performance-mode');
    localStorage.setItem('t2-performance-mode', 'true');
  } else {
    document.body.classList.remove('performance-mode');
    localStorage.setItem('t2-performance-mode', 'false');
  }
};
window.getPerformanceMode = () => document.body.classList.contains('performance-mode');

// Apply stored category theme colors to CSS variables on startup
const applyCategoryColorsFromStorage = () => {
  const hexToRgb = (hex) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `${r}, ${g}, ${b}`;
  };
  
  const prefixMap = {
    'Home Assistant': 'ha',
    'Weather': 'weather',
    'Logic': 'logic',
    'Timer/Event': 'timer',
    'Color': 'color',
    'Utility': 'utility',
    'Inputs': 'inputs',
    'CC_Control_Nodes': 'cc',
    'Other': 'other'
  };
  
  try {
    const stored = localStorage.getItem('t2category-overrides');
    if (stored) {
      const overrides = JSON.parse(stored);
      const root = document.documentElement;
      for (const [category, theme] of Object.entries(overrides)) {
        const prefix = prefixMap[category];
        if (prefix) {
          if (theme.accent) {
            root.style.setProperty(`--node-${prefix}-color`, theme.accent);
            root.style.setProperty(`--node-${prefix}-color-rgb`, hexToRgb(theme.accent));
          }
          if (theme.background) {
            root.style.setProperty(`--node-${prefix}-bg`, theme.background);
          }
        }
      }
    }
  } catch (err) {
    console.warn('Failed to apply stored category colors:', err);
  }
};

// Apply stored socket colors to CSS variables on startup
const applySocketColorsFromStorage = () => {
  const hexToRgb = (hex) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `${r}, ${g}, ${b}`;
  };
  
  const darkenColor = (hex, percent = 15) => {
    const num = parseInt(hex.slice(1), 16);
    const r = Math.max(0, (num >> 16) - Math.round(255 * percent / 100));
    const g = Math.max(0, ((num >> 8) & 0x00FF) - Math.round(255 * percent / 100));
    const b = Math.max(0, (num & 0x0000FF) - Math.round(255 * percent / 100));
    return `#${(1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1)}`;
  };
  
  const lightenColor = (hex, percent = 20) => {
    const num = parseInt(hex.slice(1), 16);
    const r = Math.min(255, (num >> 16) + Math.round(255 * percent / 100));
    const g = Math.min(255, ((num >> 8) & 0x00FF) + Math.round(255 * percent / 100));
    const b = Math.min(255, (num & 0x0000FF) + Math.round(255 * percent / 100));
    return `#${(1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1)}`;
  };
  
  const socketPrefixMap = {
    'Boolean': 'boolean',
    'Number': 'number',
    'String': 'string',
    'HSV Info': 'hsv',
    'Object/Any': 'object',
    'Light Info': 'light'
  };
  
  // Default colors (also defined in SettingsModal)
  const defaultSocketColors = {
    'Boolean': '#10b981',
    'Number': '#3b82f6',
    'String': '#f59e0b',
    'HSV Info': '#8b5cf6',
    'Object/Any': '#06b6d4',
    'Light Info': '#eab308'
  };
  
  try {
    const stored = localStorage.getItem('t2socket-colors');
    const overrides = stored ? JSON.parse(stored) : {};
    const root = document.documentElement;
    
    // Apply all socket colors (defaults + overrides)
    for (const [socketType, prefix] of Object.entries(socketPrefixMap)) {
      const color = overrides[socketType]?.color || defaultSocketColors[socketType];
      if (color) {
        root.style.setProperty(`--socket-${prefix}-color`, color);
        root.style.setProperty(`--socket-${prefix}-dark`, darkenColor(color));
        root.style.setProperty(`--socket-${prefix}-border`, lightenColor(color));
        root.style.setProperty(`--socket-${prefix}-rgb`, hexToRgb(color));
      }
    }
  } catch (err) {
    console.warn('Failed to apply stored socket colors:', err);
  }
};

// Apply on module load (before React renders)
applyCategoryColorsFromStorage();
applySocketColorsFromStorage();
applyThemeFromStorage();

// Apply theme preset or custom theme from storage
function applyThemeFromStorage() {
  const hexToRgb = (hex) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `${r}, ${g}, ${b}`;
  };
  
  try {
    const stored = localStorage.getItem('t2theme-overrides');
    if (stored) {
      const colors = JSON.parse(stored);
      const root = document.documentElement;
      
      Object.entries(colors).forEach(([key, value]) => {
        if (key === 'borderOpacity') {
          root.style.setProperty('--node-border-opacity', value / 100);
        } else if (typeof value === 'string' && value.startsWith('#')) {
          root.style.setProperty(`--theme-${key}`, value);
          root.style.setProperty(`--theme-${key}-rgb`, hexToRgb(value));
        }
      });
    }
  } catch (err) {
    console.warn('Failed to apply stored theme:', err);
  }
}

// Expose for Settings modal to call after saving
window.applyCategoryColors = applyCategoryColorsFromStorage;
window.applySocketColors = applySocketColorsFromStorage;
window.applyTheme = applyThemeFromStorage;

// Track commands sent by nodes (to distinguish app-triggered vs HA-triggered changes)
const pendingCommands = new Map(); // deviceId -> { nodeTitle, action, timestamp }
// Track last known state to detect actual changes (not just repeated updates)
const lastKnownState = new Map(); // deviceId -> { on: boolean, state: string }

function App() {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [haStatus, setHaStatus] = useState({ connected: false, wsConnected: false, deviceCount: 0 });
  const [eventLogs, setEventLogs] = useState([]);
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [panelHeight, setPanelHeight] = useState(() => parseInt(localStorage.getItem('panelHeight')) || 150);
  const [panelFontSize, setPanelFontSize] = useState(() => parseInt(localStorage.getItem('panelFontSize')) || 11);
  const [pluginLoading, setPluginLoading] = useState({ isLoading: true, progress: 0, status: 'Starting...', loadedCount: 0, totalCount: 0, error: null });
  const [updateInfo, setUpdateInfo] = useState(null);  // For update notifications
  // Ticker for live countdown updates in Upcoming Events (increments every 30s to force re-render)
  const [countdownTicker, setCountdownTicker] = useState(0);
  // Event log filter: 'all', 'app', 'ha'
  const [eventLogFilter, setEventLogFilter] = useState(() => localStorage.getItem('eventLogFilter') || 'all');
  // Backdrop groups for quick navigation buttons
  const [backdropGroups, setBackdropGroups] = useState([]);
  const eventLogRef = useRef(null);
  const resizeRef = useRef(null);
  const authStateRef = useRef({ authenticated: false, invalidPinNotified: false });
  const maxLogEntries = 100;
  const toast = useToast();

  // Live countdown timer - update every 30 seconds to refresh relative time display
  useEffect(() => {
    const intervalId = setInterval(() => {
      setCountdownTicker(t => t + 1);
    }, 30000); // 30 seconds
    return () => clearInterval(intervalId);
  }, []);

  // Refresh backdrop groups from editor (for quick navigation buttons)
  const refreshBackdropGroups = useCallback(() => {
    const editor = window._t2Editor;
    if (!editor) return;
    
    const nodes = editor.getNodes();
    const backdrops = nodes
      .filter(n => {
        // Check multiple ways to identify a BackdropNode
        return n.label === 'Backdrop' || 
               n.constructor?.name === 'BackdropNode' ||
               (n.properties?.width !== undefined && n.properties?.height !== undefined && n.properties?.title !== undefined);
      })
      .map(n => ({
        id: n.id,
        title: n.properties?.title || 'Group',
        color: n.properties?.customColor || 
          (window.BackdropColorPalette?.[n.properties?.colorIndex]?.border || '#888')
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
    
    setBackdropGroups(backdrops);
  }, []);

  // Listen for graph load/change events to refresh backdrop groups
  useEffect(() => {
    const onGraphLoadComplete = () => {
      // Delay slightly to ensure nodes are fully rendered
      setTimeout(refreshBackdropGroups, 200);
    };
    
    window.addEventListener('graphLoadComplete', onGraphLoadComplete);
    // Also expose refresh function for manual updates (e.g., when backdrop is created/deleted)
    window.refreshBackdropGroups = refreshBackdropGroups;
    
    // Initial refresh after a short delay (in case graph is already loaded)
    const initialRefresh = setTimeout(refreshBackdropGroups, 500);
    
    return () => {
      window.removeEventListener('graphLoadComplete', onGraphLoadComplete);
      delete window.refreshBackdropGroups;
      clearTimeout(initialRefresh);
    };
  }, [refreshBackdropGroups]);

  // Subscribe to plugin loading progress
  useEffect(() => {
    const unsubscribe = onPluginProgress((state) => {
      setPluginLoading(state);
      // Show toast on completion
      if (!state.isLoading && state.progress === 100) {
        if (state.failedPlugins?.length > 0) {
          toast.warning(`Loaded ${state.loadedCount} plugins (${state.failedPlugins.length} failed)`);
        }
      }
      if (state.error) {
        toast.error(`Plugin loading failed: ${state.error}`);
      }
    });
    return unsubscribe;
  }, [toast]);

  useEffect(() => {
    function onConnect() {
      setIsConnected(true);
      // Debug: console.log('Socket connected');
      toast.success('Connected to server');
      addEventLog('system', 'Socket connected to server');
      // Clear state tracking on reconnect to get fresh data
      lastKnownState.clear();

      const pin = getStoredPin();
      if (pin) socket.emit('authenticate', pin);

      // Tell backend that frontend editor is active (pauses engine device commands)
      socket.emit('editor-active');

      // Request HA status when we connect
      socket.emit('request-ha-status');
    }

    function onDisconnect() {
      setIsConnected(false);
      setHaStatus({ connected: false, wsConnected: false, deviceCount: 0 });
      authStateRef.current.authenticated = false;
      // Debug: console.log('Socket disconnected');
      toast.warning('Disconnected from server - reconnecting...');
      addEventLog('system', 'Socket disconnected from server');
    }

    function onReconnect(attemptNumber) {
      // Debug: console.log('Socket reconnected after', attemptNumber, 'attempts');
      addEventLog('system', `Socket reconnected after ${attemptNumber} attempt(s)`);
    }

    function onReconnectAttempt(attemptNumber) {
      // Only log every 5th attempt to avoid spam
      if (attemptNumber % 5 === 0) {
        addEventLog('system', `Reconnection attempt ${attemptNumber}...`);
      }
    }

    function onReconnectError(error) {
      // Debug: console.log('Reconnect error:', error);
      addEventLog('system', 'Reconnection failed, retrying...');
    }

    function onHaConnectionStatus(data) {
      setHaStatus(data);
      // Debug: console.log('HA connection status:', data);
    }

    function onAuthSuccess() {
      if (authStateRef.current.authenticated) return;
      authStateRef.current.authenticated = true;
      authStateRef.current.invalidPinNotified = false;
      toast.success('Authenticated');
    }

    function onAuthFailed(data) {
      authStateRef.current.authenticated = false;
      const errText = (data?.error || '').toString();
      if (errText.toLowerCase().includes('invalid pin')) {
        if (!authStateRef.current.invalidPinNotified) {
          authStateRef.current.invalidPinNotified = true;
          toast.error('Stored PIN is invalid. Update it in Settings → Security.');
        }
        return;
      }

      const msg = errText ? `Authentication failed: ${errText}` : 'Authentication failed';
      toast.error(msg);
    }

    function onPinChanged() {
      if (!socket.connected) return;
      authStateRef.current.invalidPinNotified = false;
      const pin = getStoredPin();
      if (pin) socket.emit('authenticate', pin);
    }

    // Listen for device state changes from backend (real-time updates from HA, Hue, Kasa)
    function onDeviceStateUpdate(data) {
      const { id, state, on, name, vendor } = data;
      if (!id) return;
      
      // Determine current state
      const lastState = lastKnownState.get(id);
      const currentOn = on !== undefined ? on : (state === 'on' || state === 'playing' || state === 'open');
      // Get friendly name from various possible fields
      const deviceName = name || data.friendly_name || data.attributes?.friendly_name || 
        id.replace('ha_', '').replace('kasa_', '').replace('hue_', '').replace(/\./g, ' ').replace(/_/g, ' ');
      
      // Check if state actually changed (filter out repeated updates for logging)
      if (lastState && lastState.on === currentOn) {
        return; // State hasn't changed, skip logging
      }
      
      // Update last known state
      lastKnownState.set(id, { on: currentOn, state });
      
      // Log the state change
      const pending = pendingCommands.get(id);
      const stateStr = currentOn ? 'ON' : 'OFF';
      
      // Determine the source/vendor for display
      // Priority: explicit vendor field > infer from ID prefix > default to 'External'
      let source = vendor || 'External';
      if (!vendor) {
        if (id.startsWith('ha_')) source = 'HA';
        else if (id.startsWith('hue_')) source = 'Hue';
        else if (id.startsWith('kasa_')) source = 'Kasa';
      }
      
      if (pending && (Date.now() - pending.timestamp) < 5000) {
        // This change was triggered by a node in the app
        addEventLog('device', `${deviceName} → ${stateStr}`, { source: 'app', triggeredBy: pending.nodeTitle, nodeId: pending.nodeId });
        pendingCommands.delete(id);
      } else {
        // This change came externally (physical switch, other automation, etc.)
        addEventLog('trigger', `${deviceName} → ${stateStr}`, { source });
      }
    }

    // Legacy handler for device_state_change (keep for compatibility)
    function onDeviceStateChange(data) {
      // Handled by onDeviceStateUpdate now
    }

    // Listen for node execution events
    function onNodeExecuted(data) {
      const { nodeId, nodeLabel, result } = data;
      addEventLog('node', `${nodeLabel || nodeId} executed`, { ...result, nodeId });
    }

    // Listen for scheduled events updates
    function onScheduledEvents(data) {
      if (Array.isArray(data)) {
        setUpcomingEvents(data.slice(0, 20)); // Show up to 20 upcoming events
      }
    }

    // Listen for trigger events
    function onTriggerEvent(data) {
      const { type, name, value } = data;
      addEventLog('trigger', `${type}: ${name}`, value);
    }

    // Listen for update available notifications
    function onUpdateAvailable(data) {
      // Don't show update prompts in HA add-on - updates come from HA Supervisor
      if (data.isAddon || window.location.pathname.includes('/api/hassio/ingress/')) {
        console.log('[Update] Ignoring update notification in HA add-on environment');
        return;
      }
      // Don't show if we just applied an update (prevents double-update issue)
      if (sessionStorage.getItem('justUpdated') === 'true') {
        sessionStorage.removeItem('justUpdated');
        return;
      }
      // Don't show if user already skipped this version this session
      const skippedVersion = sessionStorage.getItem('updateSkipped');
      if (skippedVersion === data.newVersion) {
        return;
      }
      
      // Show toast notification with "View Details" action
      toast.info(`🚀 Update available: ${data.currentVersion} → ${data.newVersion}`, {
        duration: 0, // Don't auto-dismiss
        actionLabel: 'View Details',
        action: () => setUpdateInfo(data)
      });
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('reconnect', onReconnect);
    socket.on('reconnect_attempt', onReconnectAttempt);
    socket.on('reconnect_error', onReconnectError);
    socket.on('auth-success', onAuthSuccess);
    socket.on('auth-failed', onAuthFailed);
    socket.on('ha-connection-status', onHaConnectionStatus);
    socket.on('device-state-update', onDeviceStateUpdate);
    socket.on('device_state_change', onDeviceStateChange);
    socket.on('node_executed', onNodeExecuted);
    socket.on('scheduled_events', onScheduledEvents);
    socket.on('trigger_event', onTriggerEvent);
    socket.on('update-available', onUpdateAvailable);

    window.addEventListener('t2-pin-changed', onPinChanged);

    // Signal editor is closing when page unloads (so engine can resume)
    const onBeforeUnload = () => {
      if (socket.connected) {
        socket.emit('editor-inactive');
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);

    connectSocket();

    // Send heartbeat every 30 seconds to keep frontend-active status alive
    // This prevents stale "frontend active" status if browser crashes without disconnect
    const heartbeatInterval = setInterval(() => {
      if (socket.connected) {
        socket.emit('editor-heartbeat');
      }
    }, 30000);

    return () => {
      // Tell backend editor is closing before disconnecting
      if (socket.connected) {
        socket.emit('editor-inactive');
      }
      clearInterval(heartbeatInterval);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('reconnect', onReconnect);
      socket.off('reconnect_attempt', onReconnectAttempt);
      socket.off('reconnect_error', onReconnectError);
      socket.off('auth-success', onAuthSuccess);
      socket.off('auth-failed', onAuthFailed);
      socket.off('ha-connection-status', onHaConnectionStatus);
      socket.off('device-state-update', onDeviceStateUpdate);
      socket.off('device_state_change', onDeviceStateChange);
      socket.off('node_executed', onNodeExecuted);
      socket.off('scheduled_events', onScheduledEvents);
      socket.off('trigger_event', onTriggerEvent);
      socket.off('update-available', onUpdateAvailable);
      window.removeEventListener('t2-pin-changed', onPinChanged);
      window.removeEventListener('beforeunload', onBeforeUnload);
      disconnectSocket();
    };
  }, []);

  // Helper to add event log entries
  const addEventLog = (type, message, details = null) => {
    const timestamp = new Date().toLocaleTimeString();
    setEventLogs(prev => {
      const newLogs = [{ timestamp, type, message, details }, ...prev];
      return newLogs.slice(0, maxLogEntries);
    });
  };

  // Global registry for scheduled events from nodes
  const scheduledEventsRegistry = useRef({});

  // Function for nodes to register their scheduled events
  const registerScheduledEvents = useCallback((nodeId, events) => {
    // events should be array of { time: Date, action: string, deviceName: string }
    // We add nodeId to each event so we can navigate to it when clicked
    const eventsWithNodeId = events.map(e => ({ ...e, nodeId }));
    scheduledEventsRegistry.current[nodeId] = eventsWithNodeId;
    
    // Aggregate all events from all nodes, sort by time, and update state
    const allEvents = [];
    Object.values(scheduledEventsRegistry.current).forEach(nodeEvents => {
      if (Array.isArray(nodeEvents)) {
        allEvents.push(...nodeEvents);
      }
    });
    
    // Sort by time (soonest first) and filter out past events
    const now = new Date();
    const futureEvents = allEvents
      .filter(e => e.time && new Date(e.time) > now)
      .sort((a, b) => new Date(a.time) - new Date(b.time))
      .slice(0, 20);
    
    setUpcomingEvents(futureEvents);
  }, []);

  // Function to unregister events when a node is removed
  const unregisterScheduledEvents = useCallback((nodeId) => {
    delete scheduledEventsRegistry.current[nodeId];
    // Re-aggregate
    registerScheduledEvents(nodeId, []);
  }, [registerScheduledEvents]);

  // Function to get current upcoming events (for UpcomingEventsNode)
  const getUpcomingEvents = useCallback(() => {
    return upcomingEvents || [];
  }, [upcomingEvents]);

  // Expose addEventLog and toast globally for nodes to use
  useEffect(() => {
    window.addEventLog = addEventLog;
    window.setUpcomingEvents = setUpcomingEvents;
    window.getUpcomingEvents = getUpcomingEvents;
    window.registerScheduledEvents = registerScheduledEvents;
    window.unregisterScheduledEvents = unregisterScheduledEvents;
    // Expose toast for plugins: window.T2Toast.success('message'), .error(), .warning(), .info()
    window.T2Toast = toast;
    // Expose pending commands tracker for nodes to register their commands
    // nodeId is optional - if provided, clicking the event log entry will focus that node
    window.registerPendingCommand = (deviceId, nodeTitle, action, nodeId) => {
      pendingCommands.set(deviceId, { nodeTitle, action, nodeId, timestamp: Date.now() });
    };
    return () => {
      delete window.addEventLog;
      delete window.setUpcomingEvents;
      delete window.getUpcomingEvents;
      delete window.registerScheduledEvents;
      delete window.unregisterScheduledEvents;
      delete window.registerPendingCommand;
      delete window.T2Toast;
    };
  }, [registerScheduledEvents, unregisterScheduledEvents, getUpcomingEvents, toast]);

  // Format time for upcoming events - shows relative time and absolute time
  const formatEventTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = date - now;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    let relative = '';
    if (diffDays > 0) {
      relative = `${diffDays}d ${diffHours % 24}h`;
    } else if (diffHours > 0) {
      relative = `${diffHours}h ${diffMins % 60}m`;
    } else if (diffMins > 0) {
      relative = `${diffMins}m`;
    } else {
      relative = '<1m';
    }
    
    const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `${time} (${relative})`;
  };

  // Focus on a specific node in the editor (pan/zoom to it)
  const focusNode = useCallback(async (nodeId) => {
    if (!nodeId) return;
    
    const area = window._t2Area;
    const editor = window._t2Editor;
    
    if (!area || !editor) {
      console.warn('[focusNode] Editor not ready');
      return;
    }
    
    const node = editor.getNode(nodeId);
    if (!node) {
      console.warn('[focusNode] Node not found:', nodeId);
      return;
    }
    
    try {
      // Import AreaExtensions dynamically to use zoomAt
      const { AreaExtensions } = await import('rete-area-plugin');
      await AreaExtensions.zoomAt(area, [node], { scale: 1.0 });
    } catch (err) {
      console.warn('[focusNode] Failed to zoom to node:', err);
    }
  }, []);

  // Focus on a backdrop group (zoom to fit the backdrop in view)
  const focusBackdrop = useCallback(async (backdropId) => {
    if (!backdropId) return;
    
    const area = window._t2Area;
    const editor = window._t2Editor;
    
    if (!area || !editor) {
      console.warn('[focusBackdrop] Editor not ready');
      return;
    }
    
    const backdrop = editor.getNode(backdropId);
    if (!backdrop) {
      console.warn('[focusBackdrop] Backdrop not found:', backdropId);
      return;
    }
    
    try {
      // Get backdrop position and dimensions
      const nodeView = area.nodeViews.get(backdropId);
      if (!nodeView) {
        console.warn('[focusBackdrop] Node view not found');
        return;
      }
      
      const pos = nodeView.position;
      const width = backdrop.properties?.width || backdrop.width || 400;
      const height = backdrop.properties?.height || backdrop.height || 300;
      
      // Calculate center of backdrop
      const centerX = pos.x + width / 2;
      const centerY = pos.y + height / 2;
      
      // Get container dimensions
      const container = area.container;
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;
      
      // Calculate zoom to fit backdrop with padding (0.85 = 15% padding)
      const scaleX = (containerWidth * 0.85) / width;
      const scaleY = (containerHeight * 0.85) / height;
      const scale = Math.min(scaleX, scaleY, 1.5); // Cap at 1.5x zoom
      
      // Calculate translation to center backdrop
      const tx = containerWidth / 2 - centerX * scale;
      const ty = containerHeight / 2 - centerY * scale;
      
      // Apply transform
      await area.area.zoom(scale, 0, 0);
      await area.area.translate(tx, ty);
    } catch (err) {
      console.warn('[focusBackdrop] Failed to zoom to backdrop:', err);
    }
  }, []);

  // Zoom to fit all nodes in the viewport (zoom extents)
  const zoomExtents = useCallback(async () => {
    const area = window._t2Area;
    const editor = window._t2Editor;
    
    if (!area || !editor) {
      console.warn('[zoomExtents] Editor not ready');
      return;
    }
    
    const allNodes = editor.getNodes();
    if (allNodes.length === 0) {
      console.warn('[zoomExtents] No nodes in graph');
      return;
    }
    
    try {
      const { AreaExtensions } = await import('rete-area-plugin');
      // Use 0.7 scale to ensure all nodes fit with padding
      await AreaExtensions.zoomAt(area, allNodes, { scale: 0.7 });
    } catch (err) {
      console.warn('[zoomExtents] Failed to zoom:', err);
    }
  }, []);

  return (
    <div className="app-container">
      {/* Update Modal - shows when update is available */}
      {updateInfo && updateInfo.hasUpdate && (
        <UpdateModal 
          updateInfo={updateInfo}
          onClose={() => setUpdateInfo(null)}
        />
      )}
      
      {/* Loading Overlay - shows during plugin loading */}
      <LoadingOverlay 
        isLoading={pluginLoading.isLoading}
        progress={pluginLoading.progress}
        status={pluginLoading.status}
        loadedCount={pluginLoading.loadedCount}
        totalCount={pluginLoading.totalCount}
        error={pluginLoading.error}
      />
      
      <div className="editor-wrapper">
        <Editor />
      </div>
      <div 
        className="resize-handle" 
        ref={resizeRef}
        onMouseDown={(e) => {
          e.preventDefault();
          const startY = e.clientY;
          const startHeight = panelHeight;
          const onMouseMove = (moveEvent) => {
            const delta = startY - moveEvent.clientY;
            const newHeight = Math.max(80, Math.min(400, startHeight + delta));
            setPanelHeight(newHeight);
            localStorage.setItem('panelHeight', newHeight);
          };
          const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
          };
          document.addEventListener('mousemove', onMouseMove);
          document.addEventListener('mouseup', onMouseUp);
        }}
      >
        <div className="resize-handle-grip"></div>
      </div>
      <div className="bottom-panels" style={{ height: panelHeight, fontSize: panelFontSize }}>
        <div className="panel event-log-panel">
          <div className="panel-header">
            <span className="panel-title">Event Log</span>
            {/* Group navigation: All button + Backdrop groups */}
            <div className="group-nav-buttons">
              <button
                className="group-nav-btn group-nav-all"
                onClick={zoomExtents}
                title="Zoom to fit all nodes (F key)"
              >
                ⊞ All
              </button>
              {backdropGroups.map(group => (
                <button
                  key={group.id}
                  className="group-nav-btn"
                  style={{ borderColor: group.color }}
                  onClick={() => focusBackdrop(group.id)}
                  title={`Zoom to "${group.title}" group`}
                >
                  {group.title}
                </button>
              ))}
            </div>
            <div className="panel-controls">
              <div className="filter-buttons">
                <button className={`filter-btn ${eventLogFilter === 'all' ? 'active' : ''}`} onClick={() => { setEventLogFilter('all'); localStorage.setItem('eventLogFilter', 'all'); }}>All</button>
                <button className={`filter-btn ${eventLogFilter === 'app' ? 'active' : ''}`} onClick={() => { setEventLogFilter('app'); localStorage.setItem('eventLogFilter', 'app'); }}>App</button>
                <button className={`filter-btn ${eventLogFilter === 'ha' ? 'active' : ''}`} onClick={() => { setEventLogFilter('ha'); localStorage.setItem('eventLogFilter', 'ha'); }}>HA</button>
              </div>
              <button className="font-size-btn" onClick={() => { const s = Math.max(8, panelFontSize - 1); setPanelFontSize(s); localStorage.setItem('panelFontSize', s); }}>A-</button>
              <span className="font-size-label">{panelFontSize}px</span>
              <button className="font-size-btn" onClick={() => { const s = Math.min(16, panelFontSize + 1); setPanelFontSize(s); localStorage.setItem('panelFontSize', s); }}>A+</button>
              <button className="panel-clear-btn" onClick={() => setEventLogs([])}>Clear</button>
            </div>
          </div>
          <div className="panel-content" ref={eventLogRef}>
            {eventLogs.length === 0 ? (
              <div className="empty-message">No events yet...</div>
            ) : (
              eventLogs
                .filter(log => {
                  if (eventLogFilter === 'all') return true;
                  // App filter: device changes from nodes, node execution events, system events
                  if (eventLogFilter === 'app') {
                    return log.details?.triggeredBy || 
                           log.details?.source === 'app' || 
                           log.type === 'node' || 
                           log.type === 'device' ||
                           log.type === 'system';
                  }
                  // HA filter: external triggers from HA/Hue/Kasa (not from app nodes)
                  if (eventLogFilter === 'ha') {
                    return log.type === 'trigger' || 
                           (log.details?.source && log.details.source !== 'app' && !log.details?.triggeredBy);
                  }
                  return true;
                })
                .map((log, index) => (
                <div 
                  key={index} 
                  className={`log-entry log-${log.type}${log.details?.nodeId ? ' clickable' : ''}`} 
                  title={log.details?.nodeId ? 'Click to jump to this node' : (log.details?.triggeredBy ? `Triggered by: ${log.details.triggeredBy}` : (log.details?.source && log.details.source !== 'app' ? `Triggered externally via ${log.details.source}` : ''))}
                  onClick={() => log.details?.nodeId && focusNode(log.details.nodeId)}
                  style={log.details?.nodeId ? { cursor: 'pointer' } : {}}
                >
                  <span className="log-time">{log.timestamp}</span>
                  <span className={`log-type-badge ${log.type}`}>{log.type === 'trigger' ? 'external' : log.type}</span>
                  <span className="log-message">{log.message}</span>
                  {log.details?.triggeredBy && <span className="log-source app-source">via {log.details.triggeredBy}</span>}
                  {log.details?.source && log.details.source !== 'app' && !log.details?.triggeredBy && <span className="log-source external-source">via {log.details.source}</span>}
                </div>
              ))
            )}
          </div>
        </div>
        <div className="panel upcoming-events-panel">
          <div className="panel-header">
            <span className="panel-title">Upcoming Events</span>
          </div>
          <div className="panel-content">
            {upcomingEvents.length === 0 ? (
              <div className="empty-message">No scheduled events...</div>
            ) : (
              upcomingEvents.map((event, index) => (
                <div 
                  key={index} 
                  className={`event-entry event-${event.action || 'unknown'}${event.nodeId ? ' clickable' : ''}`}
                  onClick={() => event.nodeId && focusNode(event.nodeId)}
                  title={event.nodeId ? 'Click to jump to this node' : ''}
                  style={event.nodeId ? { cursor: 'pointer' } : {}}
                >
                  <span className="event-time">{formatEventTime(event.time)}</span>
                  <span className={`event-action ${event.action}`}>{event.action || 'event'}</span>
                  <span className="event-device">{event.deviceName || event.device || 'Unknown'}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Wrap App with ErrorBoundary and ToastContainer for crash protection and notifications
function AppWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <ToastContainer>
        <ToastExposer />
        <App />
      </ToastContainer>
    </ErrorBoundary>
  );
}

export default AppWithErrorBoundary;
