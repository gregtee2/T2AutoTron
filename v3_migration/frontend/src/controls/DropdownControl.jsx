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
    // Use a ref to track the current options and force updates when they change
    const [, forceUpdate] = React.useReducer(x => x + 1, 0);
    
    // Track current value in state for controlled input
    const [value, setValue] = React.useState(data.value);

    // Sync value from data when it changes externally
    React.useEffect(() => {
        setValue(data.value);
    }, [data.value]);

    // Force re-render when component mounts or data changes
    // This ensures we always read the latest data.values
    React.useEffect(() => {
        forceUpdate();
    }, [data]);

    const handleChange = (e) => {
        const val = e.target.value;
        setValue(val);
        // Safely call setValue if it exists
        if (typeof data.setValue === 'function') {
            data.setValue(val);
        } else {
            // Fallback: just set the value directly on the data object
            data.value = val;
        }
        if (data.onChange) data.onChange(val);
    };

    // Always read options directly from data.values to get latest
    const options = data.values || [];

    return (
        <div style={{ marginBottom: "5px" }}>
            {data.label && <label style={{ display: "block", fontSize: "10px", color: "#00f3ff", marginBottom: "2px", textTransform: "uppercase", letterSpacing: "0.5px" }}>{data.label}</label>}
            <select
                value={value}
                onChange={handleChange}
                onPointerDown={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
                style={{
                    width: "100%",
                    background: "#0a0f14",
                    color: "#00f3ff",
                    border: "1px solid rgba(0, 243, 255, 0.3)",
                    padding: "6px",
                    borderRadius: "4px",
                    outline: "none",
                    fontSize: "12px"
                }}
            >
                {options.map((v, i) => (
                    <option key={`${i}-${v}`} value={v} style={{ background: "#0a0f14", color: "#00f3ff" }}>
                        {v}
                    </option>
                ))}
            </select>
        </div>
    );
}
