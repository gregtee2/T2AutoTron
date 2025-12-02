import React from "react";

export function PowerStatsControlComponent(props) {
    // props.data is the Control instance. The actual data is in props.data.data
    const { power, energy } = props.data.data || {};

    // If both are null, show a placeholder so the user knows the control is there but waiting for data
    if (power === null && energy === null) {
        return (
            <div className="power-stats-control" style={{ fontSize: '10px', color: '#777', marginTop: '5px', fontFamily: 'monospace' }}>
                -- W / -- kWh
            </div>
        );
    }

    return (
        <div
            className="power-stats-control"
            style={{
                display: 'flex',
                flexDirection: 'column',
                fontSize: '10px',
                color: '#e0f7fa',
                marginTop: '5px',
                fontFamily: 'monospace'
            }}
            onPointerDown={(e) => e.stopPropagation()}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>PWR:</span>
                <span style={{ color: '#00f3ff' }}>{power !== null ? `${power} W` : '--'}</span>
            </div>
            {energy !== null && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>NRG:</span>
                    <span style={{ color: '#ffaa00' }}>{energy} kWh</span>
                </div>
            )}
        </div>
    );
}
