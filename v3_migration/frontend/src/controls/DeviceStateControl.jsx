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

    // Check if performance mode is active
    const isPerformanceMode = document.body.classList.contains('performance-mode');

    if (!state) {
        return (
            <div style={{
                padding: "4px 8px",
                background: "rgba(0, 20, 30, 0.6)",
                borderRadius: "4px",
                marginBottom: "4px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                minHeight: "24px",
                border: "1px solid rgba(0, 243, 255, 0.1)"
            }}>
                <span style={{ fontSize: "11px", color: "rgba(0, 243, 255, 0.5)" }}>No state data</span>
            </div>
        );
    }

    const isOn = state.on || state.state === 'on';

    // Brightness is expected to be 0-100 from backend normalization.
    // Some sources may still provide 0-255, so normalize defensively.
    const attrBrightness = (state.attributes && typeof state.attributes.brightness === 'number')
        ? Number(state.attributes.brightness)
        : null;

    let brightness = 0;
    if (attrBrightness !== null && Number.isFinite(attrBrightness) && attrBrightness > 100) {
        // HA raw brightness (0-255)
        brightness = Math.round((attrBrightness / 255) * 100);
    } else if (typeof state.brightness === 'number' && Number.isFinite(state.brightness)) {
        brightness = state.brightness > 100
            ? Math.round((state.brightness / 255) * 100)
            : Math.round(state.brightness);
    } else if (attrBrightness !== null && Number.isFinite(attrBrightness)) {
        // attributes.brightness might already be percent (0-100)
        brightness = Math.round(attrBrightness);
    }
    brightness = Math.max(0, Math.min(100, brightness));
    
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

    // Status Indicator Style - disable animation in performance mode
    const indicatorStyle = {
        width: "14px",
        height: "14px",
        borderRadius: "50%",
        background: color,
        border: "1px solid rgba(255,255,255,0.3)",
        // Only animate if NOT in performance mode
        animation: (isOn && !isPerformanceMode) ? "flash-pulse 2s infinite ease-in-out" : "none",
        color: color, // Used by currentColor in keyframes
        marginRight: "8px",
        flexShrink: 0,
        boxShadow: isOn ? `0 0 5px ${color}` : "none"
    };

    return (
        <div style={{
            padding: "6px 8px",
            background: "rgba(0, 20, 30, 0.6)",
            borderRadius: "4px",
            marginBottom: "4px",
            border: "1px solid rgba(0, 243, 255, 0.2)",
            display: "flex",
            flexDirection: "column"
        }}>
            {/* Top Row: Indicator, Name, Info */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: isOn ? "4px" : "0" }}>
                <div style={{ display: "flex", alignItems: "center", flex: 1, overflow: "hidden" }}>
                    <div style={indicatorStyle} />
                    <span style={{
                        fontSize: "12px",
                        color: "#e0f7fa",
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
                    color: "#00f3ff",
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
                    background: "rgba(0, 243, 255, 0.1)",
                    borderRadius: "2px",
                    overflow: "hidden"
                }}>
                    <div style={{
                        width: `${brightness}%`,
                        height: "100%",
                        background: `linear-gradient(90deg, rgba(0, 243, 255, 0.2), ${color})`,
                        transition: "width 0.3s ease-out"
                    }} />
                </div>
            )}
        </div>
    );
}
