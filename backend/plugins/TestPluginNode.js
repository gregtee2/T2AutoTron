(function() {
    console.log("[TestPluginNode] Loading plugin...");

    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets) {
        console.error("[TestPluginNode] Missing dependencies");
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const RefComponent = window.RefComponent;

    // -------------------------------------------------------------------------
    // CSS INJECTION
    // -------------------------------------------------------------------------
    const styleId = 'test-plugin-node-css';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.innerHTML = `
            .test-node {
                padding: 10px;
                background: #333;
                border: 2px solid #666;
                border-radius: 8px;
                color: white;
                font-family: sans-serif;
            }
            .test-node .title {
                margin-bottom: 10px;
                font-weight: bold;
            }
            .test-node .socket-row {
                display: flex;
                align-items: center;
            }
            .test-node .socket-row.output {
                justify-content: flex-end;
            }
            .test-node .socket-row.input {
                justify-content: flex-start;
            }
        `;
        document.head.appendChild(style);
    }

    // -------------------------------------------------------------------------
    // TEST SENDER NODE
    // -------------------------------------------------------------------------
    class TestSenderNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("Test Sender");
            this.width = 180;
            this.changeCallback = changeCallback;
            try {
                this.addOutput("out", new ClassicPreset.Output(window.sockets.boolean || new ClassicPreset.Socket('boolean'), "Boolean Out"));
            } catch (e) { console.error("[TestSenderNode] Error adding output:", e); }
        }
        data() { return { out: true }; }
    }

    function TestSenderNodeComponent({ data, emit }) {
        return React.createElement('div', { className: 'test-node' }, [
            React.createElement('div', { key: 't', className: 'title' }, "Test Sender"),
            React.createElement('div', { key: 'o', className: 'socket-row output' }, [
                React.createElement('span', { key: 'l', style: { marginRight: "10px" } }, "Out"),
                React.createElement(RefComponent, { 
                    key: 'r',
                    init: ref => emit({ type: "render", data: { type: "socket", element: ref, payload: data.outputs.out.socket, nodeId: data.id, side: "output", key: "out" } }), 
                    unmount: ref => emit({ type: "unmount", data: { element: ref } }) 
                })
            ])
        ]);
    }

    window.nodeRegistry.register('TestSenderNode', {
        label: "Test Sender",
        category: "Debug",
        nodeClass: TestSenderNode,
        factory: (cb) => new TestSenderNode(cb),
        component: TestSenderNodeComponent
    });

    // -------------------------------------------------------------------------
    // TEST RECEIVER NODE
    // -------------------------------------------------------------------------
    class TestReceiverNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("Test Receiver");
            this.width = 180;
            this.changeCallback = changeCallback;
            try {
                this.addInput("in", new ClassicPreset.Input(window.sockets.boolean || new ClassicPreset.Socket('boolean'), "Boolean In"));
            } catch (e) { console.error("[TestReceiverNode] Error adding input:", e); }
        }
        data(inputs) {
            const val = inputs.in?.[0];
            console.log("[TestReceiver] Received:", val);
            return {};
        }
    }

    function TestReceiverNodeComponent({ data, emit }) {
        return React.createElement('div', { className: 'test-node' }, [
            React.createElement('div', { key: 't', className: 'title' }, "Test Receiver"),
            React.createElement('div', { key: 'i', className: 'socket-row input' }, [
                React.createElement(RefComponent, { 
                    key: 'r',
                    init: ref => emit({ type: "render", data: { type: "socket", element: ref, payload: data.inputs.in.socket, nodeId: data.id, side: "input", key: "in" } }), 
                    unmount: ref => emit({ type: "unmount", data: { element: ref } }) 
                }),
                React.createElement('span', { key: 'l', style: { marginLeft: "10px" } }, "In")
            ])
        ]);
    }

    window.nodeRegistry.register('TestReceiverNode', {
        label: "Test Receiver",
        category: "Debug",
        nodeClass: TestReceiverNode,
        factory: (cb) => new TestReceiverNode(cb),
        component: TestReceiverNodeComponent
    });

    console.log("[TestPluginNode] Registered");
})();
