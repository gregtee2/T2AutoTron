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
            style={{
                width: "100%",
                padding: "8px",
                marginBottom: "5px",
                background: "rgba(0, 243, 255, 0.1)",
                border: "1px solid rgba(0, 243, 255, 0.4)",
                color: "#00f3ff",
                borderRadius: "20px",
                cursor: "pointer",
                fontWeight: "600",
                textTransform: "uppercase",
                fontSize: "12px",
                transition: "all 0.2s"
            }}
            onMouseOver={(e) => {
                e.currentTarget.style.background = "rgba(0, 243, 255, 0.25)";
                e.currentTarget.style.boxShadow = "0 0 12px rgba(0, 243, 255, 0.4)";
            }}
            onMouseOut={(e) => {
                e.currentTarget.style.background = "rgba(0, 243, 255, 0.1)";
                e.currentTarget.style.boxShadow = "none";
            }}
        >
            {data.label}
        </button>
    );
}
