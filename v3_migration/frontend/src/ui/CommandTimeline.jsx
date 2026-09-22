import React, { useEffect, useState } from 'react';
import { apiUrl } from '../utils/apiBase';
import './CommandTimeline.css';

function formatTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function displayEntity(entityId) {
  return String(entityId || 'Unknown device')
    .replace(/^ha_/, '')
    .replace(/\./g, ' ')
    .replace(/_/g, ' ');
}

export function CommandTimeline({ onFocusNode }) {
  const [history, setHistory] = useState([]);
  const [pending, setPending] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let disposed = false;

    const load = async () => {
      try {
        const response = await fetch(apiUrl('/api/engine/commands?limit=24'));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = await response.json();
        if (disposed) return;
        setHistory(Array.isArray(result.history) ? result.history.slice().reverse() : []);
        setPending(Array.isArray(result.pendingCommands) ? result.pendingCommands : []);
        setError('');
      } catch (requestError) {
        if (!disposed) setError(requestError.message || 'Unavailable');
      }
    };

    load();
    const intervalId = setInterval(load, 10000);
    return () => {
      disposed = true;
      clearInterval(intervalId);
    };
  }, []);

  return (
    <div className="command-timeline">
      <div className="command-timeline-header">
        <span>Command Trail</span>
        {pending.length > 0 && <span className="command-timeline-pending">{pending.length} pending</span>}
      </div>
      {error ? (
        <div className="command-timeline-empty">History unavailable: {error}</div>
      ) : history.length === 0 ? (
        <div className="command-timeline-empty">No recent commands.</div>
      ) : (
        <div className="command-timeline-list">
          {history.map((entry, index) => {
            const isOutgoing = entry.type === 'OUTGOING';
            const reason = entry.sourceDetails?.reason || entry.reason;
            const nodeId = entry.sourceDetails?.nodeId || entry.nodeId;
            return (
              <button
                className={`command-timeline-entry ${isOutgoing ? 'outgoing' : 'incoming'}${nodeId ? ' clickable' : ''}`}
                key={`${entry.timestamp}-${entry.type}-${index}`}
                onClick={() => nodeId && onFocusNode?.(nodeId)}
                title={nodeId ? 'Focus source node' : ''}
                type="button"
              >
                <span className="command-timeline-marker">{isOutgoing ? 'Sent' : 'State'}</span>
                <span className="command-timeline-time">{formatTime(entry.timestamp)}</span>
                <span className="command-timeline-device">{displayEntity(entry.entityId)}</span>
                <span className="command-timeline-action">{entry.action || entry.newState || entry.source || 'updated'}</span>
                {reason && <span className="command-timeline-reason">{reason}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
