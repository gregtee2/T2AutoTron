import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AreaExtensions } from 'rete-area-plugin';
import { analyzeGraphHealth } from '../utils/graphHealth';
import { apiUrl } from '../utils/apiBase';
import './GraphHealth.css';

export function GraphHealth({ editor, area }) {
  const [open, setOpen] = useState(false);
  const [issues, setIssues] = useState([]);
  const highlightedElements = useRef([]);

  const clearHighlight = useCallback(() => {
    highlightedElements.current.forEach(element => element.classList.remove('graph-health-highlight'));
    highlightedElements.current = [];
  }, []);

  useEffect(() => () => clearHighlight(), [clearHighlight]);

  const scan = useCallback(async () => {
    if (!editor) return;
    let knownHaIds = null;
    try {
      const response = await fetch(apiUrl('/api/devices'));
      if (response.ok) {
        const result = await response.json();
        const haDevices = result.devices?.ha_;
        if (result.success && Array.isArray(haDevices) && haDevices.length > 0) {
          knownHaIds = new Set(haDevices.map(device => device.id.startsWith('ha_') ? device.id : `ha_${device.id}`));
        }
      }
    } catch {
      // The local wiring checks still work when the device service is unavailable.
    }
    setIssues(analyzeGraphHealth(editor.getNodes(), editor.getConnections(), knownHaIds));
  }, [editor]);

  useEffect(() => {
    if (!open || !editor) return undefined;
    const onGraphLoad = () => scan();
    window.addEventListener('graphLoadComplete', onGraphLoad);
    window.addEventListener('t2-backdrops-changed', onGraphLoad);
    return () => {
      window.removeEventListener('graphLoadComplete', onGraphLoad);
      window.removeEventListener('t2-backdrops-changed', onGraphLoad);
    };
  }, [open, editor, scan]);

  const focusIssue = async (issue) => {
    if (!editor || !area) return;
    clearHighlight();
    const nodes = issue.nodeIds.map(id => editor.getNode(id)).filter(Boolean);
    if (!nodes.length) return;
    await AreaExtensions.zoomAt(area, nodes, { scale: 1 });
    highlightedElements.current = nodes.map(node => area.nodeViews.get(node.id)?.element).filter(Boolean);
    highlightedElements.current.forEach(element => element.classList.add('graph-health-highlight'));
    setOpen(false);
  };

  return (
    <div className="graph-health">
      <button
        className="graph-health-toggle"
        onClick={() => {
          clearHighlight();
          if (!open) scan();
          setOpen(!open);
        }}
        title="Check graph wiring and device writers"
        type="button"
      >
        Graph Health{open && issues.length > 0 ? ` (${issues.length})` : ''}
      </button>
      {open && (
        <div className="graph-health-panel">
          <div className="graph-health-header">
            <strong>Graph Health</strong>
            <button onClick={scan} title="Recheck current graph" type="button">Scan</button>
            <button onClick={() => { clearHighlight(); setOpen(false); }} title="Close Graph Health" type="button">Close</button>
          </div>
          <div className="graph-health-list">
            {issues.length === 0 ? (
              <p className="graph-health-empty">No wiring warnings found.</p>
            ) : issues.map((issue, index) => (
              <div className={`graph-health-issue ${issue.severity}`} key={`${issue.title}-${issue.nodeIds.join('-')}-${index}`}>
                <strong>{issue.title}</strong>
                <span>{issue.detail}</span>
                <button onClick={() => focusIssue(issue)} type="button">Focus nodes</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}