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

function displayAction(action) {
  return String(action || 'updated').replace(/_/g, ' ');
}

function formatBrightness(value) {
  const brightness = Number(value);
  if (!Number.isFinite(brightness)) return null;
  return `${Math.round(brightness > 100 ? (brightness / 255) * 100 : brightness)}%`;
}

function displayDetails(entry) {
  const values = entry.type === 'OUTGOING' ? entry.payload : entry.significantAttributes;
  if (!values || typeof values !== 'object') return '';

  const details = [];
  const brightness = formatBrightness(values.brightness ?? values.brightness_pct);
  if (brightness) details.push(`brightness ${brightness}`);
  if (Array.isArray(values.hs_color)) details.push(`color ${Math.round(values.hs_color[0])} degrees`);
  if (values.color_temp !== undefined) details.push(`color temp ${values.color_temp}`);
  if (values.effect) details.push(`effect ${values.effect}`);
  if (values.position !== undefined) details.push(`position ${values.position}%`);
  return details.join(' · ');
}

function buildTraceRuns(history) {
  const runs = [];

  for (const entry of [...history].reverse()) {
    if (entry.type === 'OUTGOING') {
      runs.push({ command: entry, confirmation: null });
      continue;
    }

    const nodeId = entry.sourceDetails?.nodeId;
    const matchingCommand = [...runs].reverse().find((run) => (
      run.command
      && !run.confirmation
      && run.command.entityId === entry.entityId
      && entry.source === 'T2AutoTron (confirmed)'
      && (!nodeId || run.command.nodeId === nodeId)
    ));

    if (matchingCommand) {
      matchingCommand.confirmation = entry;
    } else {
      runs.push({ observation: entry });
    }
  }

  return runs.reverse();
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

  const traceRuns = buildTraceRuns(history);

  return (
    <div className="command-timeline">
      <div className="command-timeline-header">
        <span>Automation Trace</span>
        {pending.length > 0 && <span className="command-timeline-pending">{pending.length} pending</span>}
      </div>
      {error ? (
        <div className="command-timeline-empty">History unavailable: {error}</div>
      ) : history.length === 0 ? (
        <div className="command-timeline-empty">No recent commands.</div>
      ) : (
        <div className="command-timeline-list">
          {traceRuns.map((run, index) => {
            const entry = run.command || run.observation;
            const isObserved = Boolean(run.observation);
            const nodeId = entry.sourceDetails?.nodeId || entry.nodeId;
            const reason = entry.sourceDetails?.reason || entry.reason;
            const commandDetails = run.command && displayDetails(run.command);
            const confirmationDetails = run.confirmation && displayDetails(run.confirmation);
            const isGraphNode = Boolean(nodeId && nodeId !== 'API');
            return (
              <article className={`command-trace-run${isObserved ? ' observed' : ''}`} key={`${entry.timestamp}-${entry.type}-${index}`}>
                <div className="command-trace-run-header">
                  <span className="command-trace-status">{isObserved ? 'Observed' : run.confirmation ? 'Completed' : 'Waiting'}</span>
                  <time>{formatTime(entry.timestamp)}</time>
                </div>
                {isObserved ? (
                  <div className="command-trace-step observation">
                    <span className="command-trace-step-label">Home Assistant</span>
                    <span className="command-trace-step-value">{entry.newState || entry.source || 'state updated'}</span>
                    <span className="command-trace-step-detail">{displayEntity(entry.entityId)} · {entry.source}</span>
                  </div>
                ) : (
                  <>
                    <button
                      className={`command-trace-step source${isGraphNode ? ' clickable' : ''}`}
                      disabled={!isGraphNode}
                      onClick={() => isGraphNode && onFocusNode?.(nodeId)}
                      title={isGraphNode ? 'Focus source node on graph' : 'This command was sent directly from the user interface'}
                      type="button"
                    >
                      <span className="command-trace-step-label">{isGraphNode ? 'Source node' : 'Source'}</span>
                      <span className="command-trace-step-value">{isGraphNode ? (entry.nodeType || 'Automation node') : 'Manual control'}</span>
                      {reason && <span className="command-trace-step-detail">{reason}</span>}
                    </button>
                    <div className="command-trace-connector" aria-hidden="true" />
                    <div className="command-trace-step command">
                      <span className="command-trace-step-label">{displayEntity(entry.entityId)}</span>
                      <span className="command-trace-step-value">{displayAction(entry.action)}</span>
                      {commandDetails && <span className="command-trace-step-detail">{commandDetails}</span>}
                    </div>
                    <div className="command-trace-connector" aria-hidden="true" />
                    <div className={`command-trace-step confirmation${run.confirmation ? '' : ' pending'}`}>
                      <span className="command-trace-step-label">Home Assistant</span>
                      <span className="command-trace-step-value">{run.confirmation ? `confirmed ${run.confirmation.newState}` : 'awaiting confirmation'}</span>
                      {confirmationDetails && <span className="command-trace-step-detail">{confirmationDetails}</span>}
                    </div>
                  </>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
