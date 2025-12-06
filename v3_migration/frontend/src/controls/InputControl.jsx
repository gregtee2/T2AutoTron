import * as React from "react";
import { ClassicPreset } from "rete";

/**
 * InputControl - A flexible input control that supports both text and number types.
 * This matches the InputControl class defined in plugin nodes like LogicOperationsNode.
 */
export class InputControl extends ClassicPreset.Control {
    constructor(label, initialValue, onChange, type = "text") {
        super();
        this.label = label;
        this.value = initialValue;
        this.onChange = onChange;
        this.type = type;
    }
}

export function InputControlComponent({ data }) {
    const [value, setValue] = React.useState(data.value);

    React.useEffect(() => {
        setValue(data.value);
    }, [data.value]);

    const handleChange = (e) => {
        let val = e.target.value;
        // Convert to number if type is number
        if (data.type === "number") {
            val = Number(val);
        }
        setValue(val);
        data.value = val;
        if (data.onChange) data.onChange(val);
    };

    return (
        <div style={{ marginBottom: "5px" }}>
            {data.label && (
                <label style={{ 
                    display: "block", 
                    fontSize: "10px", 
                    color: "#00f3ff", 
                    marginBottom: "2px", 
                    textTransform: "uppercase", 
                    letterSpacing: "0.5px" 
                }}>
                    {data.label}
                </label>
            )}
            <input
                type={data.type || "text"}
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
            />
        </div>
    );
}
