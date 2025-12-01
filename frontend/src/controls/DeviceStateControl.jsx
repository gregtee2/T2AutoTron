import React from "react";
import { ClassicPreset } from "rete";

// Control class for Rete
export class DeviceStateControl extends ClassicPreset.Control {
    constructor(deviceId, getState) {
        super();
        this.deviceId = deviceId;
        this.getState = getState;
    }
}

// React component for rendering
export function DeviceStateControlComponent({ data }) {
    const state = data.getState ? data.getState(data.deviceId) : null;

    // Define keyframes for flashing animation
    React.useEffect(() => {
        const style = document.createElement('style');
        style.innerHTML = `
            @keyframes flash-pulse {
                0% { opacity: 1; box-shadow: 0 0 5px currentColor; }
                50% { opacity: 0.6; box-shadow: 0 0 2px currentColor; }
                100% { opacity: 1; box-shadow: 0 0 5px currentColor; }
            }
        `;
        document.head.appendChild(style);
        return () => document.head.removeChild(style);
    }, []);

    if (!state) {
        return (
            <div style={{
                padding: "4px 8px",
                background: "#2c3e50",
                borderRadius: "4px",
                marginBottom: "4px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                minHeight: "24px"
            }}>
                <span style={{ fontSize: "11px", color: "#95a5a6" }}>No state data</span>
            </div>
        );
    }

    const isOn = state.on || state.state === 'on';
    const brightness = state.brightness ? Math.round((state.brightness / 255) * 100) : 0;
    const hsColor = state.hs_color || [0, 0];
    const [hue, saturation] = hsColor;

    // Calculate color
    let color = "#e74c3c"; // Default red for off
    if (isOn) {
        if (saturation === 0) {
            color = "#f1c40f"; // Warm white/yellow for non-colored lights
        } else {
            color = `hsl(${hue}, ${saturation}%, 50%)`;
        }
    }

    // Status Indicator Style
    const indicatorStyle = {
        width: "14px",
        height: "14px",
        borderRadius: "50%",
        background: color,
        border: "1px solid rgba(255,255,255,0.3)",
        animation: isOn ? "flash-pulse 2s infinite ease-in-out" : "none",
        color: color, // Used by currentColor in keyframes
        marginRight: "8px",
        flexShrink: 0,
        boxShadow: isOn ? `0 0 5px ${color}` : "none"
    };

    return (
        <div style={{
            padding: "6px 8px",
            background: "#2c3e50",
            borderRadius: "4px",
            marginBottom: "4px",
            border: "1px solid #34495e",
            display: "flex",
            flexDirection: "column"
        }}>
            {/* Top Row: Indicator, Name, Info */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: isOn ? "4px" : "0" }}>
                <div style={{ display: "flex", alignItems: "center", flex: 1, overflow: "hidden" }}>
                    <div style={indicatorStyle} />
                    <span style={{
                        fontSize: "12px",
                        color: "#ecf0f1",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        marginRight: "8px"
                    }}>
                        {state.name || data.deviceId}
                    </span>
                </div>

                <span style={{
                    fontSize: "10px",
                    color: "#bdc3c7",
                    fontFamily: "monospace",
                    whiteSpace: "nowrap"
                }}>
                    {isOn ? `${brightness}%` : "Off"}
                </span>
            </div>

            {/* Bottom Row: Brightness Bar (Only if ON) */}
            {isOn && (
                <div style={{
                    width: "100%",
                    height: "4px",
                    background: "#34495e",
                    borderRadius: "2px",
                    overflow: "hidden"
                }}>
                    <div style={{
                        width: `${brightness}%`,
                        height: "100%",
                        background: `linear-gradient(90deg, #34495e, ${color})`,
                        transition: "width 0.3s ease-out"
                    }} />
                </div>
            )}
        </div>
    );
}
