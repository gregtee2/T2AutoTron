import React from "react";

export function StatusIndicatorControlComponent(props) {
    const { state, color } = props.data;
    const isOn = state === 'on' || state === 'open' || state === 'playing';

    // Determine color based on props or default to neon blue/orange
    const activeColor = color || (isOn ? '#00f3ff' : '#333');

    return (
        <div
            className="status-indicator-control"
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '5px',
                width: '100%'
            }}
            onPointerDown={(e) => e.stopPropagation()}
        >
            <div style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                backgroundColor: isOn ? activeColor : '#222',
                boxShadow: isOn ? `0 0 10px ${activeColor}, 0 0 20px ${activeColor}` : 'none',
                transition: 'all 0.3s ease',
                border: '1px solid #444',
                animation: isOn ? 'pulse 2s infinite' : 'none'
            }} />
            <style>{`
                @keyframes pulse {
                    0% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.7; transform: scale(0.9); }
                    100% { opacity: 1; transform: scale(1); }
                }
            `}</style>
        </div>
    );
}
