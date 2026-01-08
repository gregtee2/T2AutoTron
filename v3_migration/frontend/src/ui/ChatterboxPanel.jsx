import React, { useState, useEffect, useCallback } from 'react';

// Local Agent URL - runs on the same machine as the browser
const AGENT_URL = 'http://localhost:5050';

/**
 * ChatterboxPanel - Control for local Chatterbox TTS server
 * Communicates with the T2 Local Agent running on the user's desktop
 */
export function ChatterboxPanel({ isExpanded, onToggle }) {
    const [status, setStatus] = useState({ running: false, checking: true });
    const [actionPending, setActionPending] = useState(false);
    const [agentAvailable, setAgentAvailable] = useState(null); // null = unknown, true/false = checked

    // Check agent and Chatterbox status
    const checkStatus = useCallback(async () => {
        try {
            const response = await fetch(`${AGENT_URL}/chatterbox/status`, {
                method: 'GET',
                signal: AbortSignal.timeout(3000)
            });
            if (response.ok) {
                const data = await response.json();
                setAgentAvailable(true);
                setStatus({ running: data.running, checking: false, managed: data.processManaged });
            } else {
                setAgentAvailable(false);
                setStatus({ running: false, checking: false });
            }
        } catch (err) {
            // Agent not running or not reachable
            setAgentAvailable(false);
            setStatus({ running: false, checking: false });
        }
    }, []);

    // Check status on mount and periodically
    useEffect(() => {
        checkStatus();
        const interval = setInterval(checkStatus, 10000); // Check every 10 seconds
        return () => clearInterval(interval);
    }, [checkStatus]);

    // Start Chatterbox
    const handleStart = async () => {
        setActionPending(true);
        try {
            const response = await fetch(`${AGENT_URL}/chatterbox/start`, {
                method: 'POST',
                signal: AbortSignal.timeout(5000)
            });
            if (response.ok) {
                // Wait a bit then check status
                setTimeout(checkStatus, 5000);
            }
        } catch (err) {
            console.error('Failed to start Chatterbox:', err);
        } finally {
            setActionPending(false);
        }
    };

    // Stop Chatterbox
    const handleStop = async () => {
        setActionPending(true);
        try {
            const response = await fetch(`${AGENT_URL}/chatterbox/stop`, {
                method: 'POST',
                signal: AbortSignal.timeout(3000)
            });
            if (response.ok) {
                setTimeout(checkStatus, 1000);
            }
        } catch (err) {
            console.error('Failed to stop Chatterbox:', err);
        } finally {
            setActionPending(false);
        }
    };

    // Don't show panel if agent is definitely not available
    if (agentAvailable === false) {
        return (
            <div className="dock-section chatterbox-panel">
                <div 
                    className="dock-section-header dock-section-header-collapsible"
                    onClick={onToggle}
                    title="Click to expand/collapse"
                >
                    <span>🗣️ Chatterbox TTS</span>
                    <span className="dock-section-toggle">{isExpanded ? '▼' : '▶'}</span>
                </div>
                
                {isExpanded && (
                    <div className="dock-section-content chatterbox-content">
                        <div className="chatterbox-status stopped">
                            <span className="status-dot stopped"></span>
                            Agent not running
                        </div>
                        <div className="chatterbox-hint">
                            To control Chatterbox from T2, download and run the Local Agent on your desktop:
                        </div>
                        <div className="chatterbox-actions">
                            <a 
                                href="/api/agent/download/t2_agent.py"
                                className="dock-btn"
                                download
                            >
                                📥 t2_agent.py
                            </a>
                            <a 
                                href="/api/agent/download/start_agent.bat"
                                className="dock-btn"
                                download
                            >
                                📥 .bat
                            </a>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="dock-section chatterbox-panel">
            <div 
                className="dock-section-header dock-section-header-collapsible"
                onClick={onToggle}
                title="Click to expand/collapse"
            >
                <span>🗣️ Chatterbox TTS</span>
                <span className="dock-section-toggle">{isExpanded ? '▼' : '▶'}</span>
            </div>
            
            {isExpanded && (
                <div className="dock-section-content chatterbox-content">
                    {status.checking ? (
                        <div className="chatterbox-status checking">
                            <span className="status-dot checking"></span>
                            Checking...
                        </div>
                    ) : (
                        <>
                            <div className={`chatterbox-status ${status.running ? 'running' : 'stopped'}`}>
                                <span className={`status-dot ${status.running ? 'running' : 'stopped'}`}></span>
                                {status.running ? 'Running on :8100' : 'Stopped'}
                            </div>
                            
                            <div className="chatterbox-actions">
                                {status.running ? (
                                    <button 
                                        className="dock-btn dock-btn-stop"
                                        onClick={handleStop}
                                        disabled={actionPending}
                                    >
                                        {actionPending ? '⏳' : '⏹️'} Stop
                                    </button>
                                ) : (
                                    <button 
                                        className="dock-btn dock-btn-start"
                                        onClick={handleStart}
                                        disabled={actionPending}
                                    >
                                        {actionPending ? '⏳' : '▶️'} Start
                                    </button>
                                )}
                            </div>
                            
                            {status.managed && (
                                <div className="chatterbox-note">
                                    Started by agent
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
