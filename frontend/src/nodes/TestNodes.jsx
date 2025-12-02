import React from "react";
import { ClassicPreset } from "rete";
import { RefComponent } from "rete-react-plugin";
import sockets from "../sockets";

// --- Test Sender Node ---
export class TestSenderNode extends ClassicPreset.Node {
    constructor(changeCallback) {
        super("Test Sender");
        this.width = 180;
        this.changeCallback = changeCallback;
        // Output using the shared boolean socket
        this.addOutput("out", new ClassicPreset.Output(sockets.boolean, "Boolean Out"));
    }

    data() {
        return { out: true };
    }
}

export function TestSenderNodeComponent({ data, emit }) {
    return (
        <div style={{ padding: "10px", background: "#333", border: "2px solid #666", borderRadius: "8px", color: "white" }}>
            <div style={{ marginBottom: "10px", fontWeight: "bold" }}>Test Sender</div>
            <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
                <span style={{ marginRight: "10px" }}>Out</span>
                <RefComponent
                    init={ref => emit({ type: "render", data: { type: "socket", element: ref, payload: data.outputs.out.socket, nodeId: data.id, side: "output", key: "out" } })}
                    unmount={ref => emit({ type: "unmount", data: { element: ref } })}
                />
            </div>
        </div>
    );
}

// --- Test Receiver Node ---
export class TestReceiverNode extends ClassicPreset.Node {
    constructor(changeCallback) {
        super("Test Receiver");
        this.width = 180;
        this.changeCallback = changeCallback;
        // Input using the shared boolean socket
        this.addInput("in", new ClassicPreset.Input(sockets.boolean, "Boolean In"));
    }

    data(inputs) {
        const val = inputs.in?.[0];
        console.log("[TestReceiver] Received:", val);
        return {};
    }
}

export function TestReceiverNodeComponent({ data, emit }) {
    return (
        <div style={{ padding: "10px", background: "#333", border: "2px solid #666", borderRadius: "8px", color: "white" }}>
            <div style={{ marginBottom: "10px", fontWeight: "bold" }}>Test Receiver</div>
            <div style={{ display: "flex", justifyContent: "flex-start", alignItems: "center" }}>
                <RefComponent
                    init={ref => emit({ type: "render", data: { type: "socket", element: ref, payload: data.inputs.in.socket, nodeId: data.id, side: "input", key: "in" } })}
                    unmount={ref => emit({ type: "unmount", data: { element: ref } })}
                />
                <span style={{ marginLeft: "10px" }}>In</span>
            </div>
        </div>
    );
}
