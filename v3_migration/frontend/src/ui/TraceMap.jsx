import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AreaExtensions } from 'rete-area-plugin';
import './TraceMap.css';

function channelName(value) {
  return String(value || '').replace(/^\[[^\]]+\]/, '').trim();
}

function buildTrace(editor, selectedNodeId, includeAll) {
  const nodes = editor?.getNodes?.() || [];
  const connections = editor?.getConnections?.() || [];
  const upstream = new Map(nodes.map((node) => [node.id, new Set()]));
  const wirelessLinks = [];

  const connect = (source, target, wireless = false) => {
    if (!upstream.has(source) || !upstream.has(target)) return;
    // Trace the decisions that can flow into the selected node, not every branch it can reach.
    upstream.get(target).add(source);
    if (wireless) wirelessLinks.push({ source, target });
  };

  connections.forEach(({ source, target }) => connect(source, target));

  const senders = nodes.filter((node) => node.label === 'Sender');
  const receivers = nodes.filter((node) => node.label === 'Receiver');
  senders.forEach((sender) => {
    const senderChannel = channelName(sender.properties?.bufferName);
    receivers.forEach((receiver) => {
      if (senderChannel && senderChannel === channelName(receiver.properties?.selectedBuffer)) {
        connect(sender.id, receiver.id, true);
      }
    });
  });

  if (includeAll || !selectedNodeId || !upstream.has(selectedNodeId)) {
    return { activeIds: new Set(nodes.map((node) => node.id)), wirelessLinks };
  }

  const activeIds = new Set([selectedNodeId]);
  const queue = [selectedNodeId];
  while (queue.length) {
    const nodeId = queue.shift();
    upstream.get(nodeId).forEach((sourceId) => {
      if (!activeIds.has(sourceId)) {
        activeIds.add(sourceId);
        queue.push(sourceId);
      }
    });
  }

  return {
    activeIds,
    wirelessLinks: wirelessLinks.filter(({ source, target }) => activeIds.has(source) && activeIds.has(target))
  };
}

export function TraceMap({ editor, area }) {
  const overlayRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [wirelessPaths, setWirelessPaths] = useState([]);
  const traceRef = useRef({ activeIds: new Set(), wirelessLinks: [] });

  const clearTrace = useCallback(() => {
    editor?.getNodes?.().forEach((node) => {
      const element = area?.nodeViews?.get(node.id)?.element;
      element?.classList.remove('trace-map-dim', 'trace-map-active');
    });
    traceRef.current = { activeIds: new Set(), wirelessLinks: [] };
    setWirelessPaths([]);
  }, [area, editor]);

  const refreshTrace = useCallback(() => {
    if (!isOpen || !editor || !area || !overlayRef.current) return;

    const trace = buildTrace(editor, selectedNodeId, showAll);
    traceRef.current = trace;
    const overlayRect = overlayRef.current.getBoundingClientRect();
    const centers = new Map();

    editor.getNodes().forEach((node) => {
      const element = area.nodeViews.get(node.id)?.element;
      if (!element) return;

      const isActive = trace.activeIds.has(node.id);
      element.classList.toggle('trace-map-active', isActive);
      element.classList.toggle('trace-map-dim', !isActive);

      const rect = element.getBoundingClientRect();
      centers.set(node.id, {
        x: rect.left - overlayRect.left + rect.width / 2,
        y: rect.top - overlayRect.top + rect.height / 2
      });
    });

    setWirelessPaths(trace.wirelessLinks.map(({ source, target }) => ({
      source: centers.get(source),
      target: centers.get(target),
      key: `${source}-${target}`
    })).filter(({ source, target }) => source && target));
  }, [area, editor, isOpen, selectedNodeId, showAll]);

  useEffect(() => {
    const onNodeSelected = (event) => {
      setSelectedNodeId(event.detail?.id || null);
      setShowAll(false);
    };
    const onNodeSelectionCleared = () => setSelectedNodeId(null);

    window.addEventListener('t2-node-selected', onNodeSelected);
    window.addEventListener('t2-node-selection-cleared', onNodeSelectionCleared);
    return () => {
      window.removeEventListener('t2-node-selected', onNodeSelected);
      window.removeEventListener('t2-node-selection-cleared', onNodeSelectionCleared);
    };
  }, []);

  useEffect(() => {
    refreshTrace();
    if (!isOpen) return undefined;
    const intervalId = window.setInterval(refreshTrace, 150);
    return () => window.clearInterval(intervalId);
  }, [isOpen, refreshTrace]);

  useEffect(() => () => clearTrace(), [clearTrace]);

  const openSelectedTrace = async () => {
    if (!editor || !area) return;
    setShowAll(false);
    setIsOpen(true);
    const trace = buildTrace(editor, selectedNodeId, false);
    const traceNodes = editor.getNodes().filter((node) => trace.activeIds.has(node.id));
    if (traceNodes.length > 0) await AreaExtensions.zoomAt(area, traceNodes, { scale: 0.82 });
  };

  const showFullGraph = async () => {
    if (!editor || !area) return;
    setShowAll(true);
    setIsOpen(true);
    const nodes = editor.getNodes();
    if (nodes.length > 0) await AreaExtensions.zoomAt(area, nodes, { scale: 0.72 });
  };

  const closeTrace = () => {
    setIsOpen(false);
    clearTrace();
  };

  return (
    <>
      <div className="trace-map-toolbar">
        <button className="trace-map-button" onClick={openSelectedTrace} title="Show nodes that can feed the selected node" type="button">
          Trace Map
        </button>
        <button className="trace-map-button" onClick={showFullGraph} title="Show every node and wireless channel" type="button">
          Show All
        </button>
      </div>
      {isOpen && (
        <>
          <svg aria-hidden="true" className="trace-map-links" ref={overlayRef}>
            {wirelessPaths.map(({ source, target, key }) => (
              <line key={key} x1={source.x} x2={target.x} y1={source.y} y2={target.y} />
            ))}
          </svg>
          <div className="trace-map-panel">
            <span>{showAll ? 'Full graph' : selectedNodeId ? 'Upstream path' : 'Full graph'}</span>
            <span className="trace-map-legend">Dashed lines: wireless channels</span>
            <button className="trace-map-clear" onClick={closeTrace} type="button">Clear</button>
          </div>
        </>
      )}
    </>
  );
}