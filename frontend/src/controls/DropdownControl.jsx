import * as React from "react";
import { ClassicPreset } from "rete";

export class DropdownControl extends ClassicPreset.Control {
    constructor(label, values, initialValue, onChange) {
        super();
        this.label = label;
        this.values = values;
        this.value = initialValue;
        this.onChange = onChange;
    }

    setValue(val) {
        this.value = val;
        // We need to trigger a re-render here, usually handled by the editor update
        // For now, we rely on the parent to handle state updates if needed
    }
}

export function DropdownControlComponent({ data }) {
    const [value, setValue] = React.useState(data.value);

    React.useEffect(() => {
        setValue(data.value);
    }, [data.value]);

    const handleChange = (e) => {
        const val = e.target.value;
        setValue(val);
        data.setValue(val);
        if (data.onChange) data.onChange(val);
    };

    return (
        <div style={{ marginBottom: "5px" }}>
            {data.label && <label style={{ display: "block", fontSize: "10px", color: "#ccc" }}>{data.label}</label>}
            <select
                value={value}
                onChange={handleChange}
                onPointerDown={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
                style={{ width: "100%" }}
            >
                {data.values.map((v) => (
                    <option key={v} value={v}>
                        {v}
                    </option>
                ))}
            </select>
        </div>
    );
}
