import React, { useState, useEffect } from 'react';
import './Toast.css'; // Shared styles

/**
 * Loading Overlay - Shows while plugins are loading
 * 
 * Props:
 * - isLoading: boolean - Whether to show the overlay
 * - progress: number (0-100) - Loading progress percentage
 * - status: string - Current loading status message
 * - loadedCount: number - Number of plugins loaded
 * - totalCount: number - Total number of plugins to load
 * - error: string|null - Error message if loading failed
 */
export function LoadingOverlay({ 
    isLoading, 
    progress = 0, 
    status = 'Initializing...', 
    loadedCount = 0, 
    totalCount = 0,
    error = null 
}) {
    const [fadeOut, setFadeOut] = useState(false);
    const [visible, setVisible] = useState(isLoading);

    useEffect(() => {
        if (!isLoading && visible) {
            // Start fade out animation
            setFadeOut(true);
            const timer = setTimeout(() => {
                setVisible(false);
                setFadeOut(false);
            }, 500);
            return () => clearTimeout(timer);
        } else if (isLoading && !visible) {
            setVisible(true);
        }
    }, [isLoading, visible]);

    if (!visible) return null;

    return (
        <div className={`loading-overlay ${fadeOut ? 'fade-out' : ''}`}>
            <div className="loading-logo">⚡</div>
            <div className="loading-title">T2 AutoTron</div>
            <div className="loading-subtitle">Visual Automation Editor</div>
            
            <div className="loading-progress-container">
                <div className="loading-progress-bar">
                    <div 
                        className="loading-progress-fill"
                        style={{ width: `${Math.min(100, progress)}%` }}
                    />
                </div>
            </div>
            
            <div className="loading-status">{status}</div>
            
            {totalCount > 0 && (
                <div className="loading-count">
                    {loadedCount} / {totalCount} plugins loaded
                </div>
            )}
            
            {error && (
                <div className="loading-error">
                    ⚠️ {error}
                </div>
            )}
        </div>
    );
}

export default LoadingOverlay;
