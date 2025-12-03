// PushbuttonNode.jsx
import "../sockets.js"; // Runs the global patch (must be first)
import sockets from "../sockets.js"; // Import singleton sockets

import React, { useState, useEffect, useRef } from "react";
import { ClassicPreset } from "rete";
import { RefComponent } from "rete-react-plugin";

// Inline styles to match Tron theme
const styles = {
    node: {
        background: "#0a0f14",
        border: "1px solid #00f3ff",
        borderRadius: "10px",
        boxShadow: "0 0 15px rgba(0, 243, 255, 0.2)",
        color: "#e0f7fa",
        minWidth: "200px",
        fontFamily: "monospace",
        overflow: "hidden",
        textAlign: "center",
        display: "flex",
        flexDirection: "column"
    },
    header: {
        background: "linear-gradient(90deg, rgba(0, 243, 255, 0.1), rgba(0, 243, 255, 0.0))",
        padding: "8px 12px",
        fontSize: "14px",
        fontWeight: "bold",
        color: "#00f3ff",
        borderBottom: "1px solid rgba(0, 243, 255, 0.3)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
    },
    content: {
        padding: "15px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "15px",
        background: "rgba(0, 20, 30, 0.4)"
    },
    button: (active) => ({
        width: "80px",
        height: "80px",
        borderRadius: "50%",
        border: `3px solid ${active ? "#00f3ff" : "rgba(0, 243, 255, 0.3)"}`,
        background: active ? "rgba(0, 243, 255, 0.2)" : "rgba(0, 0, 0, 0.3)",
        color: active ? "#fff" : "rgba(0, 243, 255, 0.5)",
        fontSize: "18px",
        fontWeight: "bold",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "all 0.2s ease",
        boxShadow: active ? "0 0 20px rgba(0, 243, 255, 0.4)" : "none",
        outline: "none"
    }),
    pulseControl: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        fontSize: "12px",
        color: "#00f3ff"
    },
    ioRow: {
        display: "flex",
        alignItems: "center",
        gap: "8px"
    }
};

export class PushbuttonNode extends ClassicPreset.Node {
    constructor(changeCallback) {
        super("Pushbutton");
        this.width = 220;
        this.changeCallback = changeCallback;

        this.properties = {
            state: false,
            pulseMode: false, // Default to Latch mode (Pulse Off)
            lastCommand: false, // Track last command for display
        };

        this.addOutput("state", new ClassicPreset.Output(sockets.boolean, "State"));
    }

    data(inputs) {
        return { state: this.properties.state };
    }

    triggerUpdate() {
        if (this.changeCallback) this.changeCallback();
    }

    triggerUpdate() {
        if (this.changeCallback) this.changeCallback();
    }
}

export function PushbuttonNodeComponent({ data, emit }) {
    const [displayState, setDisplayState] = useState(data.properties.lastCommand);
    const [pulseMode, setPulseMode] = useState(data.properties.pulseMode);
    const pulseTimeoutRef = useRef(null);

    useEffect(() => {
        const originalCallback = data.changeCallback;
        data.changeCallback = () => {
            setDisplayState(data.properties.lastCommand);
            setPulseMode(data.properties.pulseMode);
            if (originalCallback) originalCallback();
        };
        return () => { data.changeCallback = originalCallback; };
    }, [data]);

    const handleToggle = (e) => {
        e.stopPropagation(); // Prevent node selection when clicking button
        
        const newState = !displayState;

        if (pulseMode) {
            // Pulse Mode: Flash ON then OFF
            data.properties.lastCommand = true; // Update lastCommand so the callback doesn't revert UI
            setDisplayState(true);
            data.properties.state = true;
            data.triggerUpdate?.();

            if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
            pulseTimeoutRef.current = setTimeout(() => {
                data.properties.lastCommand = false; // Revert lastCommand
                setDisplayState(false);
                data.properties.state = false;
                data.triggerUpdate?.();
            }, 500);
        } else {
            // Latch Mode: Toggle State
            data.properties.lastCommand = newState;
            data.properties.state = newState;
            setDisplayState(newState);
            data.triggerUpdate?.();
        }
    };

    const handlePulseModeChange = (e) => {
        const newMode = e.target.checked;
        data.properties.pulseMode = newMode;
        setPulseMode(newMode);
        
        // Reset state when switching modes
        if (newMode) {
            data.properties.state = false;
            setDisplayState(false);
        }
        data.triggerUpdate?.();
    };

    const inputs = Object.entries(data.inputs);
    const outputs = Object.entries(data.outputs);

    return (
        <div style={styles.node}>
            <div style={styles.header}>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <span>{data.label}</span>
                </div>

                {/* Outputs */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
                    {outputs.map(([key, output]) => (
                        <div key={key} style={styles.ioRow}>
                            <span style={{ fontSize: "10px", opacity: 0.7 }}>{output.label}</span>
                            <RefComponent
                                init={ref => emit({ type: "render", data: { type: "socket", element: ref, payload: output.socket, nodeId: data.id, side: "output", key } })}
                                unmount={ref => emit({ type: "unmount", data: { element: ref } })}
                            />
                        </div>
                    ))}
                </div>
            </div>

            <div style={styles.content} onPointerDown={(e) => e.stopPropagation()}>
                <button
                    style={styles.button(displayState)}
                    onClick={handleToggle}
                >
                    {pulseMode ? (displayState ? "TRIG" : "PUSH") : (displayState ? "ON" : "OFF")}
                </button>

                <div style={styles.pulseControl}>
                    <input
                        type="checkbox"
                        checked={pulseMode}
                        onChange={handlePulseModeChange}
                        style={{ accentColor: "#00f3ff" }}
                    />
                    <span>Pulse Mode</span>
                </div>
            </div>
        </div>
    );
}