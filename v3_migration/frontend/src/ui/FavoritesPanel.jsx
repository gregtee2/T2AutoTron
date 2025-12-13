import React from 'react';
import './FavoritesPanel.css';

export function FavoritesPanel({
  width = 180,
  panelRef,
  dropActive = false,
  favoriteGroups = [],
  onAddFavorite,
  onRemoveFavorite,
  onCreateNode
}) {

  const Tooltip = window.T2Controls?.Tooltip;
  const tooltipText =
    'Drag a node onto this panel to add it to Favorites.\n' +
    'Click a favorite to add that node to the canvas.\n' +
    'Right-click a favorite to remove it.';

  const totalFavorites = (favoriteGroups || []).reduce((sum, g) => sum + ((g?.labels || []).length), 0);

  const handleRemove = (label) => {
    const normalized = (label || '').toString().trim();
    if (!normalized) return;
    onRemoveFavorite?.(normalized);
  };

  return (
    <div
      ref={panelRef}
      className={`favorites-panel ${dropActive ? 'drop-active' : ''}`}
      style={{ width }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="favorites-header">
        <div className="favorites-header-row">
          <span className="favorites-title">⭐ Favorites</span>
          {Tooltip ? (
            <Tooltip text={tooltipText} position="bottom">
              <span className="favorites-help-fallback">?</span>
            </Tooltip>
          ) : (
            <span className="favorites-help-fallback" title={tooltipText}>?</span>
          )}
        </div>
      </div>

      <div className="favorites-list">
        {totalFavorites === 0 ? (
          <div className="favorites-empty">No favorites yet</div>
        ) : (
          favoriteGroups.map((group) => {
            const category = (group?.category || 'Other').toString();
            const labels = Array.isArray(group?.labels) ? group.labels : [];
            if (labels.length === 0) return null;

            return (
              <div key={category} className="favorites-group">
                <div className="favorites-divider">
                  <span className="favorites-divider-text">{category}</span>
                </div>
                {labels.map((label) => (
                  <button
                    key={`${category}:${label}`}
                    type="button"
                    className="favorites-item-btn"
                    onClick={() => onCreateNode?.(label)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleRemove(label);
                    }}
                    title="Click: add to canvas • Right-click: remove"
                  >
                    {label}
                  </button>
                ))}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
