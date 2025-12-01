import * as React from "react";
import { ClassicPreset } from "rete";

export class SwitchControl extends ClassicPreset.Control {
    constructor(label, initialValue, onChange) {
        super();
        this.label = label;
        this.value = initialValue;
        this.onChange = onChange;
    }
}

export function SwitchControlComponent({ data }) {
    const [value, setValue] = React.useState(data.value);

    const handleChange = (e) => {
        const val = e.target.checked;
        setValue(val);
        data.value = val;
        if (data.onChange) data.onChange(val);
    };

    return (
        <div style={{ display: "flex", alignItems: "center", marginBottom: "5px" }}>
            <input
                type="checkbox"
                checked={value}
                onChange={handleChange}
                onPointerDown={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
            />
            <span style={{ marginLeft: "5px", fontSize: "12px", color: "#fff" }}>{data.label}</span>
        </div>
    );
}
