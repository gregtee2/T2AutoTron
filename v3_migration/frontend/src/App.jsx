import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Editor } from './Editor';
import { socket, connectSocket, disconnectSocket } from './socket';
import './App.css';
import './test-sockets.js'; // Test socket patch

function App() {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [haStatus, setHaStatus] = useState({ connected: false, wsConnected: false, deviceCount: 0 });
  const [eventLogs, setEventLogs] = useState([]);
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const eventLogRef = useRef(null);
  const maxLogEntries = 100;

  useEffect(() => {
    function onConnect() {
      setIsConnected(true);
      console.log('Socket connected');
      addEventLog('system', 'Socket connected to server');
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

    // Listen for device state changes
    function onDeviceStateChange(data) {
      const { deviceId, deviceName, state, source } = data;
      const stateStr = state?.on !== undefined ? (state.on ? 'ON' : 'OFF') : JSON.stringify(state);
      addEventLog('device', `${deviceName || deviceId}: ${stateStr}`, source);
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
    socket.on('device_state_change', onDeviceStateChange);
    socket.on('node_executed', onNodeExecuted);
    socket.on('scheduled_events', onScheduledEvents);
    socket.on('trigger_event', onTriggerEvent);

    connectSocket();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('ha-connection-status', onHaConnectionStatus);
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
    return () => {
      delete window.addEventLog;
      delete window.setUpcomingEvents;
      delete window.registerScheduledEvents;
      delete window.unregisterScheduledEvents;
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
      <div className="bottom-panels">
        <div className="panel event-log-panel">
          <div className="panel-header">
            <span className="panel-title">Event Log</span>
            <button className="panel-clear-btn" onClick={() => setEventLogs([])}>Clear</button>
          </div>
          <div className="panel-content" ref={eventLogRef}>
            {eventLogs.length === 0 ? (
              <div className="empty-message">No events yet...</div>
            ) : (
              eventLogs.map((log, index) => (
                <div key={index} className={`log-entry log-${log.type}`}>
                  <span className="log-time">{log.timestamp}</span>
                  <span className={`log-type-badge ${log.type}`}>{log.type}</span>
                  <span className="log-message">{log.message}</span>
                  {log.details && <span className="log-details">{typeof log.details === 'object' ? JSON.stringify(log.details) : log.details}</span>}
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

export default App;
