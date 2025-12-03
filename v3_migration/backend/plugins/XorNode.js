(function() {
    console.log("[XorNode] Loading plugin...");

    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets) {
        console.error("[XorNode] Missing dependencies");
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const RefComponent = window.RefComponent;
    const sockets = window.sockets;

    // -------------------------------------------------------------------------
    // NODE CLASS
    // -------------------------------------------------------------------------
    class XorNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("XOR Gate");
            this.changeCallback = changeCallback;
            this.width = 180;

            this.addInput("in1", new ClassicPreset.Input(sockets.boolean || new ClassicPreset.Socket('boolean'), "Input 1"));
            this.addInput("in2", new ClassicPreset.Input(sockets.boolean || new ClassicPreset.Socket('boolean'), "Input 2"));
            
            this.addOutput("result", new ClassicPreset.Output(sockets.boolean || new ClassicPreset.Socket('boolean'), "Result"));
        }

        data(inputs) {
            const val1 = !!inputs.in1?.[0];
            const val2 = !!inputs.in2?.[0];

            const result = val1 !== val2;

            return {
                result: result
            };
        }
    }

    // -------------------------------------------------------------------------
    // COMPONENT
    // -------------------------------------------------------------------------
    function XorNodeComponent({ data, emit }) {
        const inputs = Object.entries(data.inputs);
        const outputs = Object.entries(data.outputs);

        return React.createElement('div', { className: 'logic-node' }, [
            React.createElement('div', { className: 'header' }, data.label),
            
            React.createElement('div', { className: 'io-container' }, 
                inputs.map(([key, input]) => React.createElement('div', { key: key, className: 'socket-row' }, [
                    React.createElement(RefComponent, {
                        init: ref => emit({ type: "render", data: { type: "socket", element: ref, payload: input.socket, nodeId: data.id, side: "input", key } }),
                        unmount: ref => emit({ type: "unmount", data: { element: ref } })
                    }),
                    React.createElement('span', { style: { marginLeft: '10px', fontSize: '12px' } }, input.label)
                ]))
            ),

            React.createElement('div', { className: 'io-container' }, 
                outputs.map(([key, output]) => React.createElement('div', { key: key, className: 'socket-row', style: { justifyContent: 'flex-end' } }, [
                    React.createElement('span', { style: { marginRight: '10px', fontSize: '12px' } }, output.label),
                    React.createElement(RefComponent, {
                        init: ref => emit({ type: "render", data: { type: "socket", element: ref, payload: output.socket, nodeId: data.id, side: "output", key } }),
                        unmount: ref => emit({ type: "unmount", data: { element: ref } })
                    })
                ]))
            )
        ]);
    }

    window.nodeRegistry.register('XorNode', {
        label: "XOR Gate",
        category: "Logic",
        nodeClass: XorNode,
        factory: (cb) => new XorNode(cb),
        component: XorNodeComponent
    });

    console.log("[XorNode] Registered");
})();
