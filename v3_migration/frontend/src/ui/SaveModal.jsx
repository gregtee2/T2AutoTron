import React, { useState, useEffect, useRef } from 'react';
import './SaveModal.css';
import { apiUrl } from '../utils/apiBase';

/**
 * SaveModal - Dialog for saving graphs with custom filenames
 * Shows existing graphs and allows user to choose a new name or overwrite
 */
export function SaveModal({ isOpen, onClose, onSave, currentGraphData }) {
  const [filename, setFilename] = useState('');
  const [existingGraphs, setExistingGraphs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  // Fetch existing graphs when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchGraphs();
      // Focus input after a short delay
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const fetchGraphs = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(apiUrl('/api/engine/graphs'));
      const data = await response.json();
      if (data.success) {
        setExistingGraphs(data.graphs || []);
      } else {
        setError('Failed to load existing graphs');
      }
    } catch (err) {
      console.error('[SaveModal] Error fetching graphs:', err);
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!filename.trim()) {
      setError('Please enter a filename');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(apiUrl('/api/engine/save-graph'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: filename.trim(),
          graph: currentGraphData
        })
      });

      const data = await response.json();
      if (data.success) {
        if (window.T2Toast) {
          window.T2Toast.success(`Saved as "${data.filename}"`, 3000);
        }
        onSave?.(data.filename);
        onClose();
      } else {
        setError(data.error || 'Failed to save graph');
      }
    } catch (err) {
      console.error('[SaveModal] Error saving:', err);
      setError('Failed to save graph');
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !saving) {
      handleSave();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  const selectExisting = (graphName) => {
    // Remove .json extension for display
    const name = graphName.replace('.json', '');
    setFilename(name);
    inputRef.current?.focus();
  };

  if (!isOpen) return null;

  return (
    <div className="save-modal-overlay" onClick={onClose}>
      <div className="save-modal" onClick={e => e.stopPropagation()}>
        <div className="save-modal-header">
          <h2>💾 Save Graph</h2>
          <button className="save-modal-close" onClick={onClose}>×</button>
        </div>

        <div className="save-modal-content">
          <div className="save-modal-input-section">
            <label htmlFor="graph-filename">Filename:</label>
            <div className="save-modal-input-row">
              <input
                ref={inputRef}
                id="graph-filename"
                type="text"
                value={filename}
                onChange={e => setFilename(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="my_automation_graph"
                disabled={saving}
              />
              <span className="save-modal-extension">.json</span>
            </div>
          </div>

          {error && (
            <div className="save-modal-error">
              ⚠️ {error}
            </div>
          )}

          <div className="save-modal-existing">
            <h3>Existing Graphs {loading && <span className="save-modal-loading">loading...</span>}</h3>
            {existingGraphs.length === 0 && !loading ? (
              <p className="save-modal-empty">No saved graphs yet</p>
            ) : (
              <ul className="save-modal-list">
                {existingGraphs.map(graph => (
                  <li
                    key={graph.name}
                    onClick={() => selectExisting(graph.name)}
                    className={filename === graph.displayName ? 'selected' : ''}
                    title={`Click to overwrite. Modified: ${new Date(graph.modified).toLocaleString()}`}
                  >
                    <span className="graph-name">{graph.displayName}</span>
                    <span className="graph-date">
                      {new Date(graph.modified).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="save-modal-footer">
          <button 
            className="save-modal-btn save-modal-btn-cancel" 
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button 
            className="save-modal-btn save-modal-btn-save" 
            onClick={handleSave}
            disabled={saving || !filename.trim()}
          >
            {saving ? 'Saving...' : '💾 Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
