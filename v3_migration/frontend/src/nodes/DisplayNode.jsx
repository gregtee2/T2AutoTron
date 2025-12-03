// DisplayNode.jsx
import "../sockets.js";
import sockets from "../sockets.js";
import React, { useState, useEffect } from "react";
import { ClassicPreset } from "rete";
import { RefComponent } from "rete-react-plugin";
import "./DisplayNode.css";

export class DisplayNode extends ClassicPreset.Node {
    constructor(changeCallback) {
        super("Display");
        this.width = 200;
        this.changeCallback = changeCallback;

        this.properties = {
            value: "Waiting for data..."
        };

        this.addInput("input", new ClassicPreset.Input(sockets.boolean, "Input"));
    }

    data(inputs) {
        const value = inputs.input?.[0];
        console.log("[DisplayNode] Received value:", value);

        // Only update and trigger re-render if value actually changed
        if (this.properties.value !== value) {
            this.properties.value = value !== undefined ? value : "No Data";
            if (this.changeCallback) this.changeCallback();
        }

        return {};
    }
}

export function DisplayNodeComponent({ data, emit }) {
    const [value, setValue] = useState(data.properties.value);

    useEffect(() => {
        data.changeCallback = () => {
            setValue(data.properties.value);
        };
        return () => {
            data.changeCallback = null;
        };
    }, [data]);

    const inputs = Object.entries(data.inputs);

    return (
        <div className="display-node">
            <div className="header">Display</div>

            <div className="content">
                {inputs.map(([key, input]) => (
                    <div key={key} className="io-row input-row">
                        <RefComponent
                            init={ref => emit({
                                type: "render",
                                data: {
                                    type: "socket",
                                    element: ref,
                                    payload: input.socket,
                                    nodeId: data.id,
                                    side: "input",
                                    key
                                }
                            })}
                            unmount={ref => emit({ type: "unmount", data: { element: ref } })}
                        />
                        <span className="input-label">{input.label || key}</span>
                    </div>
                ))}

                <div className="display-box" onPointerDown={(e) => e.stopPropagation()}>
                    {value === undefined || value === null
                        ? "No Data"
                        : typeof value === 'object'
                            ? JSON.stringify(value, null, 2)
                            : String(value)
                    }
                </div>
            </div>
        </div>
    );
}
