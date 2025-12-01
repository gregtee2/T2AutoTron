import * as React from "react";
import { ClassicPreset } from "rete";

export class NumberControl extends ClassicPreset.Control {
    constructor(label, initialValue, onChange, options = {}) {
        super();
        this.label = label;
        this.value = initialValue;
        this.onChange = onChange;
        this.options = options;
    }
}

export function NumberControlComponent({ data }) {
    const [value, setValue] = React.useState(data.value);

    const handleChange = (e) => {
        const val = Number(e.target.value);
        setValue(val);
        data.value = val;
        if (data.onChange) data.onChange(val);
    };

    return (
        <div style={{ marginBottom: "5px" }}>
            {data.label && <label style={{ display: "block", fontSize: "10px", color: "#ccc" }}>{data.label}</label>}
            <input
                type="number"
                value={value}
                onChange={handleChange}
                min={data.options.min}
                max={data.options.max}
                step={data.options.step}
                onPointerDown={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
                style={{ width: "100%" }}
            />
        </div>
    );
}
