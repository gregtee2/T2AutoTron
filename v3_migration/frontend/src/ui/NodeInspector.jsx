import React, { useMemo } from 'react';
import './NodeInspector.css';

const HIDDEN_PROPERTIES = new Set([
  'haToken',
  'debug',
  'lastInputHSV',
  'lastOutputHSV',
  'previousStates',
  'perDeviceState'
]);

function formatPropertyValue(value) {
  if (value === null) return 'None';
  if (typeof value === 'boolean') return value ? 'On' : 'Off';
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'None';
  if (typeof value === 'object') return `${Object.keys(value).length} values`;
  return String(value);
}

function propertyLabel(key) {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/^./, char => char.toUpperCase());
}

export function NodeInspector({ node, onClose, onFocus }) {
  const properties = useMemo(() => {
    if (!node?.properties) return [];

    return Object.entries(node.properties)
      .filter(([key, value]) => !HIDDEN_PROPERTIES.has(key) && value !== undefined && typeof value !== 'function')
      .slice(0, 14);
  }, [node]);

  if (!node) return null;

  const title = node.properties?.customTitle || node.properties?.customName || node.label;

  return (
    <aside className="node-inspector" aria-label="Selected node inspector">
      <header className="node-inspector-header">
        <div>
          <div className="node-inspector-eyebrow">Selected Node</div>
          <h2>{title}</h2>
        </div>
        <button className="node-inspector-icon-button" onClick={onClose} title="Close inspector" aria-label="Close inspector">x</button>
      </header>

      <div className="node-inspector-meta">
        <span>{node.category || 'Other'}</span>
        <span>{node.label}</span>
      </div>

      <div className="node-inspector-actions">
        <button onClick={() => onFocus?.(node.id)}>Focus Node</button>
      </div>

      <section className="node-inspector-section">
        <h3>Configuration</h3>
        {properties.length === 0 ? (
          <p className="node-inspector-empty">This node has no saved settings.</p>
        ) : (
          <dl className="node-inspector-properties">
            {properties.map(([key, value]) => (
              <div key={key}>
                <dt>{propertyLabel(key)}</dt>
                <dd title={formatPropertyValue(value)}>{formatPropertyValue(value)}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>
    </aside>
  );
}
