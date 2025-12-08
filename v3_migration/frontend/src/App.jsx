import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Editor } from './Editor';
import { socket, connectSocket, disconnectSocket } from './socket';
import ErrorBoundary from './ErrorBoundary';
import './App.css';
import './test-sockets.js'; // Test socket patch

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
  const eventLogRef = useRef(null);
  const resizeRef = useRef(null);
  const maxLogEntries = 100;

  useEffect(() => {
    function onConnect() {
      setIsConnected(true);
      console.log('Socket connected');
      addEventLog('system', 'Socket connected to server');
      // Clear state tracking on reconnect to get fresh data
      lastKnownState.clear();
      // Request HA status when we connect
      socket.emit('request-ha-status');
    }

    function onDisconnect() {
      setIsConnected(false);
      setHaStatus({ connected: false, wsConnected: false, deviceCount: 0 });
      console.log('Socket disconnected');
      addEventLog('system', 'Socket disconnected from server');
    }

    function onHaConnectionStatus(data) {
      setHaStatus(data);
      console.log('HA connection status:', data);
    }

    // Listen for device state changes from backend (real-time HA WebSocket updates)
    function onDeviceStateUpdate(data) {
      const { id, state, on, name } = data;
      if (!id) return;
      
      // Determine current state
      const lastState = lastKnownState.get(id);
      const currentOn = on !== undefined ? on : (state === 'on' || state === 'playing' || state === 'open');
      // Get friendly name from various possible fields
      const deviceName = name || data.friendly_name || data.attributes?.friendly_name || 
        id.replace('ha_', '').replace('kasa_', '').replace(/\./g, ' ').replace(/_/g, ' ');
      
      // Check if state actually changed (filter out repeated updates for logging)
      if (lastState && lastState.on === currentOn) {
        return; // State hasn't changed, skip logging
      }
      
      // Update last known state
      lastKnownState.set(id, { on: currentOn, state });
      
      // Log the state change
      const pending = pendingCommands.get(id);
      const stateStr = currentOn ? 'ON' : 'OFF';
      
      if (pending && (Date.now() - pending.timestamp) < 5000) {
        // This change was triggered by a node in the app
        addEventLog('device', `${deviceName} → ${stateStr}`, { source: 'app', triggeredBy: pending.nodeTitle });
        pendingCommands.delete(id);
      } else {
        // This change came from HA (physical switch, other automation, etc.)
        addEventLog('trigger', `${deviceName} → ${stateStr}`, { source: 'HA' });
      }
    }

    // Legacy handler for device_state_change (keep for compatibility)
    function onDeviceStateChange(data) {
      // Handled by onDeviceStateUpdate now
    }

    // Listen for node execution events
    function onNodeExecuted(data) {
      const { nodeId, nodeLabel, result } = data;
      addEventLog('node', `${nodeLabel || nodeId} executed`, result);
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

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('ha-connection-status', onHaConnectionStatus);
    socket.on('device-state-update', onDeviceStateUpdate);
    socket.on('device_state_change', onDeviceStateChange);
    socket.on('node_executed', onNodeExecuted);
    socket.on('scheduled_events', onScheduledEvents);
    socket.on('trigger_event', onTriggerEvent);

    connectSocket();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('ha-connection-status', onHaConnectionStatus);
      socket.off('device-state-update', onDeviceStateUpdate);
      socket.off('device_state_change', onDeviceStateChange);
      socket.off('node_executed', onNodeExecuted);
      socket.off('scheduled_events', onScheduledEvents);
      socket.off('trigger_event', onTriggerEvent);
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
    scheduledEventsRegistry.current[nodeId] = events;
    
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

  // Expose addEventLog globally for nodes to use
  useEffect(() => {
    window.addEventLog = addEventLog;
    window.setUpcomingEvents = setUpcomingEvents;
    window.registerScheduledEvents = registerScheduledEvents;
    window.unregisterScheduledEvents = unregisterScheduledEvents;
    // Expose pending commands tracker for nodes to register their commands
    window.registerPendingCommand = (deviceId, nodeTitle, action) => {
      pendingCommands.set(deviceId, { nodeTitle, action, timestamp: Date.now() });
    };
    return () => {
      delete window.addEventLog;
      delete window.setUpcomingEvents;
      delete window.registerScheduledEvents;
      delete window.unregisterScheduledEvents;
      delete window.registerPendingCommand;
    };
  }, [registerScheduledEvents, unregisterScheduledEvents]);

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

  return (
    <div className="app-container">
      <div className="status-indicators">
        <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
          {isConnected ? 'Backend' : 'Backend ✕'}
        </div>
        <div className={`connection-status ha-status ${haStatus.connected ? 'connected' : 'disconnected'}`}>
          {haStatus.connected ? `HA (${haStatus.deviceCount})` : 'HA ✕'}
        </div>
      </div>
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
            <div className="panel-controls">
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
              eventLogs.map((log, index) => (
                <div key={index} className={`log-entry log-${log.type}`} title={log.details?.triggeredBy ? `Triggered by: ${log.details.triggeredBy}` : (log.details?.source === 'HA' ? 'Triggered externally (HA, physical switch, etc.)' : '')}>
                  <span className="log-time">{log.timestamp}</span>
                  <span className={`log-type-badge ${log.type}`}>{log.type === 'trigger' ? 'external' : log.type}</span>
                  <span className="log-message">{log.message}</span>
                  {log.details?.triggeredBy && <span className="log-source app-source">via {log.details.triggeredBy}</span>}
                  {log.details?.source === 'HA' && !log.details?.triggeredBy && <span className="log-source external-source">via HA</span>}
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
                <div key={index} className={`event-entry event-${event.action || 'unknown'}`}>
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

// Wrap App with ErrorBoundary for crash protection
function AppWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

export default AppWithErrorBoundary;
