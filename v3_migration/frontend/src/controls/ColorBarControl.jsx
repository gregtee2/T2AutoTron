import React, { useState, useEffect } from "react";

export function ColorBarControlComponent(props) {
    // Force re-render when data changes by using a state counter
    const [, forceUpdate] = useState(0);
    
    // Subscribe to data changes via a simple polling mechanism
    // This is needed because Rete mutates control.data without triggering React
    useEffect(() => {
        let lastData = JSON.stringify(props.data.data || {});
        const interval = setInterval(() => {
            const currentData = JSON.stringify(props.data.data || {});
            if (currentData !== lastData) {
                lastData = currentData;
                forceUpdate(n => n + 1);
            }
        }, 100); // Check every 100ms
        return () => clearInterval(interval);
    }, [props.data]);
    
    // props.data is the Control instance. The actual data is in props.data.data
    const { brightness, hs_color, entityType, state, on } = props.data.data || {};

    // Calculate color
    let barColor = '#444';
    if (hs_color && hs_color.length === 2) {
        barColor = `hsl(${hs_color[0]}, ${hs_color[1]}%, 50%)`;
    } else if (entityType === 'light') {
        barColor = '#ffaa00'; // Default warm white
    }

    // Check if device is ON
    const isOn = state === 'on' || on === true;

    // Backend sends brightness as 0-100 percentage.
    // Some legacy paths may still provide 0-255, so normalize defensively.
    let widthPercent = (typeof brightness === 'number' && Number.isFinite(brightness)) ? brightness : 0;
    if (widthPercent > 100) widthPercent = (widthPercent / 255) * 100;
    widthPercent = Math.max(0, Math.min(100, widthPercent));
    
    // Only show brightness if device is on
    const displayWidth = isOn ? widthPercent : 0;

    return (
        <div
            className="color-bar-control"
            style={{
                width: '100%',
                height: '8px',
                backgroundColor: 'rgba(0, 20, 30, 0.6)',
                borderRadius: '4px',
                overflow: 'hidden',
                marginTop: '5px',
                border: '1px solid rgba(0, 243, 255, 0.2)'
            }}
            onPointerDown={(e) => e.stopPropagation()}
        >
            <div style={{
                width: `${displayWidth}%`,
                height: '100%',
                backgroundColor: barColor,
                transition: 'all 0.3s ease',
                boxShadow: displayWidth > 0 ? `0 0 10px ${barColor}` : 'none'
            }} />
        </div>
    );
}
