import * as React from "react";
import { ClassicPreset } from "rete";

export class TextControl extends ClassicPreset.Control {
    constructor(label, initialValue, onChange) {
        super();
        this.label = label;
        this.value = initialValue;
        this.onChange = onChange;
    }
}

export function TextControlComponent({ data }) {
    const [value, setValue] = React.useState(data.value);

    const handleChange = (e) => {
        const val = e.target.value;
        setValue(val);
        data.value = val;
        if (data.onChange) data.onChange(val);
    };

    return (
        <div style={{ marginBottom: "5px" }}>
            {data.label && <label style={{ display: "block", fontSize: "10px", color: "#ccc" }}>{data.label}</label>}
            <input
                type="text"
                value={value}
                onChange={handleChange}
                onPointerDown={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
                style={{ width: "100%" }}
            />
        </div>
    );
}
