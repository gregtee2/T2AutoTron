# Rete.js Node Development Guide

## Critical Rules for Creating Nodes

### 1. Socket Rendering - DO NOT WRAP RefComponent

**❌ WRONG:**
```jsx
<div className="socket-wrapper">
    <RefComponent
        init={ref => emit({...})}
        unmount={ref => emit({...})}
    />
</div>
```

**✅ CORRECT:**
```jsx
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
```

**Why:** Wrapping `RefComponent` in any div blocks pointer events and prevents socket connections. Always render `RefComponent` directly in the parent container.

### 2. Preserving the Original changeCallback - CRITICAL!

When your component's `useEffect` needs to update local React state based on node properties, you MUST preserve and call the original `changeCallback` that was passed from the Editor.

**❌ WRONG - Overwrites the callback:**
```jsx
useEffect(() => {
    data.changeCallback = () => {
        setState(data.properties.someValue); // Only updates local state
    };
    return () => {
        data.changeCallback = null;
    };
}, [data]);
```

**✅ CORRECT - Preserves and chains the callback:**
```jsx
useEffect(() => {
    // Store the original callback passed from Editor
    const originalCallback = data.changeCallback;
    
    // Replace with a function that updates local state AND calls the original
    data.changeCallback = () => {
        setState(data.properties.someValue);
        // CRITICAL: Call the original callback to trigger engine processing
        if (originalCallback) originalCallback();
    };
    
    return () => {
        data.changeCallback = originalCallback; // Restore original on unmount
    };
}, [data]);
```

**Why:** The original `changeCallback` is `() => updateNode(nodeId)` which triggers both the visual update AND the dataflow engine re-processing. If you overwrite it without calling the original, clicking buttons or changing values will update the UI but won't propagate data through the graph.

### 3. Triggering Data Flow Updates

When a node's internal state changes (e.g., button click, user input), you must trigger the Rete engine to re-process the graph:

**✅ CORRECT:**
```jsx
const handleChange = () => {
    // Update internal state
    data.properties.someValue = newValue;
    
    // Trigger UI update
    if (data.changeCallback) data.changeCallback();
};
```

The `changeCallback` is passed to the node constructor and calls `updateNode(nodeId)` which:
1. Updates the visual representation (`area.update`)
2. Triggers the dataflow engine to re-process all nodes (`process()`)

**❌ WRONG:** Trying to call `data.process()` directly - this property doesn't exist on node instances.

### 4. Event Propagation

- **DO NOT** use `onPointerDown={(e) => e.stopPropagation()}` on containers that hold sockets
- **DO** use it on interactive elements like text boxes, buttons, or content areas where you want to prevent node dragging
- Sockets need to receive pointer events to allow wire connections

### 5. Node Structure Template

```jsx
export class MyNode extends ClassicPreset.Node {
    constructor(changeCallback) {
        super("My Node");
        this.changeCallback = changeCallback;
        
        this.properties = {
            // Your node's state
        };
        
        // Add sockets
        this.addInput("input", new ClassicPreset.Input(sockets.boolean, "Input"));
        this.addOutput("output", new ClassicPreset.Output(sockets.boolean, "Output"));
    }
    
    data(inputs) {
        // Process inputs and return outputs
        const inputValue = inputs.input?.[0];
        return { output: inputValue };
    }
}

export function MyNodeComponent({ data, emit }) {
    const [localState, setLocalState] = useState(data.properties.someValue);
    
    useEffect(() => {
        // CRITICAL: Preserve the original callback
        const originalCallback = data.changeCallback;
        
        data.changeCallback = () => {
            setLocalState(data.properties.someValue);
            if (originalCallback) originalCallback();
        };
        
        return () => {
            data.changeCallback = originalCallback;
        };
    }, [data]);
    
    const handleChange = (newValue) => {
        data.properties.someValue = newValue;
        setLocalState(newValue);
        if (data.changeCallback) data.changeCallback();
    };
    
    const inputs = Object.entries(data.inputs);
    const outputs = Object.entries(data.outputs);
    
    return (
        <div className="my-node">
            {/* Render sockets directly without wrappers */}
            {inputs.map(([key, input]) => (
                <div key={key}>
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
                    <span>{input.label}</span>
                </div>
            ))}
            
            {/* Your node content */}
        </div>
    );
}
```

## Common Issues

### Sockets Won't Connect
- Check if `RefComponent` is wrapped in any divs - remove the wrapper
- Check if parent container has `stopPropagation` - remove it from socket containers
- Verify socket types match (or use `sockets.any` for universal connections)

### Data Not Flowing
- Ensure you're calling `data.changeCallback()` after state changes
- Check that the node's `data()` method returns the correct output values
- Verify connections exist in the editor

### Node Won't Drag
- Make sure the root node div doesn't have `stopPropagation`
- Only use `stopPropagation` on specific interactive elements inside the node
