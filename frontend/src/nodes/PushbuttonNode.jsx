// PushbuttonNode.jsx
import "../sockets.js"; // Runs the global patch (must be first)
import sockets from "../sockets.js"; // Import singleton sockets

import React, { useState, useEffect, useRef } from "react";
import { ClassicPreset } from "rete";
import { RefComponent } from "rete-react-plugin";
import "./PushbuttonNode.css";

export class PushbuttonNode extends ClassicPreset.Node {
    constructor(changeCallback) {
        super("Pushbutton");
        this.width = 250;
        this.changeCallback = changeCallback;

        this.properties = {
            state: false,
            pulseMode: false,
        };

        // Use singleton socket from sockets.js
        this.addOutput("state", new ClassicPreset.Output(sockets.boolean, "State"));
    }

    data(inputs) {
        return { state: this.properties.state };
    }

    triggerUpdate() {
        if (this.changeCallback) this.changeCallback();
    }
}

export function PushbuttonNodeComponent({ data, emit }) {
    const [state, setState] = useState(data.properties.state);
    const [pulseMode, setPulseMode] = useState(data.properties.pulseMode);
    const pulseTimeoutRef = useRef(null);

    useEffect(() => {
        data.changeCallback = () => {
            setState(data.properties.state);
            setPulseMode(data.properties.pulseMode);
        };
        return () => {
            data.changeCallback = null;
        };
    }, [data]);

    const handleToggle = () => {
        const newState = !state;
        data.properties.state = newState;
        setState(newState);
        data.triggerUpdate?.();

        if (pulseMode && newState) {
            if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
            pulseTimeoutRef.current = setTimeout(() => {
                data.properties.state = false;
                setState(false);
                data.triggerUpdate?.();
            }, 500);
        }
    };

    const handlePulseModeChange = (e) => {
        const newMode = e.target.checked;
        data.properties.pulseMode = newMode;
        setPulseMode(newMode);
        data.triggerUpdate?.();
    };

    useEffect(() => {
        return () => {
            if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
        };
    }, []);

    const outputs = Object.entries(data.outputs);

    return (
        <div className="pushbutton-node">
            {/* Removed onPointerDown from root — allows Rete drag on the node */}
            <div className="title">
                <span className="node-label">{data.label || "Pushbutton"}</span>

                {/* Output socket */}
                {outputs.map(([key, output]) => (
                    <div key={key} className="io-row">
                        <span className="output-label">{output.label}</span>
                        <RefComponent
                            init={(ref) =>
                                emit({
                                    type: "render",
                                    data: {
                                        type: "socket",
                                        element: ref,
                                        payload: output.socket,
                                        nodeId: data.id,
                                        side: "output",
                                        key,
                                    },
                                })
                            }
                            unmount={(ref) => emit({ type: "unmount", data: { element: ref } })}
                        />
                    </div>
                ))}
            </div>

            <div className="content" onPointerDown={(e) => e.stopPropagation()}>
                {/* stopPropagation on content only — prevents bubbling from button but allows node drag */}
                <button
                    className={`toggle-btn ${state ? "active" : "inactive"}`}
                    onClick={handleToggle}
                >
                    {state ? "ON" : "OFF"}
                </button>

                <div className="pulse-control">
                    <label>
                        <input
                            type="checkbox"
                            checked={pulseMode}
                            onChange={handlePulseModeChange}
                        />
                        <span>Pulse Mode (500ms)</span>
                    </label>
                </div>
            </div>
        </div>
    );
}