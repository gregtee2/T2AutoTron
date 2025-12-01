import React from "react";

export function PowerStatsControlComponent(props) {
    const { power, energy } = props.data;

    if (power === null && energy === null) return null;

    return (
        <div
            className="power-stats-control"
            style={{
                display: 'flex',
                flexDirection: 'column',
                fontSize: '10px',
                color: '#aaa',
                marginTop: '5px',
                fontFamily: 'monospace'
            }}
            onPointerDown={(e) => e.stopPropagation()}
        >
            {power !== null && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>PWR:</span>
                    <span style={{ color: '#00f3ff' }}>{power} W</span>
                </div>
            )}
            {energy !== null && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>NRG:</span>
                    <span style={{ color: '#ffaa00' }}>{energy} kWh</span>
                </div>
            )}
        </div>
    );
}
