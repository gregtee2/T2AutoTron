import * as React from "react";
import { ClassicPreset } from "rete";

export class ButtonControl extends ClassicPreset.Control {
    constructor(label, onClick) {
        super();
        this.label = label;
        this.onClick = onClick;
    }
}

export function ButtonControlComponent({ data }) {
    return (
        <button
            onPointerDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onClick={data.onClick}
            style={{ width: "100%", padding: "5px", marginBottom: "5px" }}
        >
            {data.label}
        </button>
    );
}
