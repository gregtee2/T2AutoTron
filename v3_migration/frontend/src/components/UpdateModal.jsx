import React, { useState, useEffect } from 'react';
import './UpdateModal.css';

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
    setUpdateStatus('Starting update...');
    
    try {
      const response = await fetch('/api/update/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const result = await response.json();
      setUpdateStatus(result.message || 'Updating... The app will restart shortly.');
      
      // Show message for a bit before closing
      setTimeout(() => {
        setUpdateStatus('Update applied! Restarting...');
      }, 2000);
      
    } catch (err) {
      setUpdateStatus(`Update failed: ${err.message}`);
      setIsUpdating(false);
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
