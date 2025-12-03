import React from "react";

export function ColorBarControlComponent(props) {
    // props.data is the Control instance. The actual data is in props.data.data
    const { brightness, hs_color, entityType } = props.data.data || {};

    // Calculate color
    let barColor = '#444';
    if (hs_color && hs_color.length === 2) {
        barColor = `hsl(${hs_color[0]}, ${hs_color[1]}%, 50%)`;
    } else if (entityType === 'light') {
        barColor = '#ffaa00'; // Default warm white
    }

    // Calculate width based on brightness (0-255) or percentage
    const widthPercent = brightness ? (brightness / 255) * 100 : 0;

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
                width: `${widthPercent}%`,
                height: '100%',
                backgroundColor: barColor,
                transition: 'all 0.3s ease',
                boxShadow: `0 0 10px ${barColor}`
            }} />
        </div>
    );
}
