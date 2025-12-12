import React, { useState, useEffect } from 'react';
import './UpdateModal.css';
import { authFetch } from '../auth/authClient';

/**
 * UpdateModal - Shows when a new version is available
 * Displays changelog and allows user to apply update or skip
 */
function UpdateModal({ updateInfo, onClose, onApplyUpdate }) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateStatus, setUpdateStatus] = useState('');

  if (!updateInfo || !updateInfo.hasUpdate) {
    return null;
  }

  const handleApplyUpdate = async () => {
    setIsUpdating(true);
    setUpdateStatus('Saving current graph...');
    
    // Trigger a graph save before updating so user doesn't lose their work
    try {
      if (window.triggerGraphSave) {
        await window.triggerGraphSave();
        setUpdateStatus('Graph saved! Starting update...');
      }
    } catch (err) {
      console.warn('Pre-update graph save failed:', err);
      // Continue with update anyway - localStorage may already have recent save
    }
    
    // Mark that we're updating so we auto-load graph after reload
    sessionStorage.setItem('justUpdated', 'true');
    sessionStorage.setItem('autoLoadAfterUpdate', 'true');
    
    try {
      const response = await authFetch('/api/update/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const result = await response.json();
      setUpdateStatus(result.message || 'Updating... The app will restart shortly.');
      
      // Show message then auto-reload after server restarts
      setTimeout(() => {
        setUpdateStatus('Update applied! Reloading page...');
        // Try to reload - if server is down, keep trying
        setTimeout(() => {
          const tryReload = () => {
            authFetch('/api/health', { method: 'GET' })
              .then(() => window.location.reload())
              .catch(() => setTimeout(tryReload, 2000));
          };
          tryReload();
        }, 3000);
      }, 2000);
      
    } catch (err) {
      // Server might have restarted already - try to reload
      if (err.message.includes('fetch') || err.message.includes('network')) {
        setUpdateStatus('Server restarting... Reloading page...');
        setTimeout(() => {
          const tryReload = () => {
            authFetch('/api/health', { method: 'GET' })
              .then(() => window.location.reload())
              .catch(() => setTimeout(tryReload, 2000));
          };
          tryReload();
        }, 3000);
      } else {
        setUpdateStatus(`Update failed: ${err.message}`);
        setIsUpdating(false);
      }
    }
  };

  const handleSkip = () => {
    // Store in sessionStorage so we don't show again this session
    sessionStorage.setItem('updateSkipped', updateInfo.newVersion);
    onClose();
  };

  return (
    <div className="update-modal-overlay">
      <div className="update-modal">
        <div className="update-modal-header">
          <span className="update-icon">🚀</span>
          <h2>Update Available!</h2>
        </div>
        
        <div className="update-modal-version">
          <span className="version-current">{updateInfo.currentVersion}</span>
          <span className="version-arrow">→</span>
          <span className="version-new">{updateInfo.newVersion}</span>
        </div>

        <div className="update-modal-content">
          <h3>What's New:</h3>
          <div className="changelog-content">
            <pre>{updateInfo.changelog || 'No changelog available.'}</pre>
          </div>
        </div>

        {updateStatus && (
          <div className="update-status">
            <span className="status-spinner">⏳</span>
            {updateStatus}
          </div>
        )}

        <div className="update-modal-actions">
          {!isUpdating ? (
            <>
              <button 
                className="update-btn update-btn-primary"
                onClick={handleApplyUpdate}
              >
                Update Now
              </button>
              <button 
                className="update-btn update-btn-secondary"
                onClick={handleSkip}
              >
                Later
              </button>
            </>
          ) : (
            <div className="updating-message">
              Please wait while the update is being applied...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default UpdateModal;
