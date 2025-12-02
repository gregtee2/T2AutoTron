(function() {
    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const nodeRegistry = window.nodeRegistry;
    const sockets = window.sockets;

    class TestPluginNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("Test Plugin Node");
            this.width = 200;
            this.height = 150;
            // Use standard sockets
            this.addOutput("out", new ClassicPreset.Output(sockets.any, "Output"));
            this.addInput("in", new ClassicPreset.Input(sockets.any, "Input"));
        }
        
        data() {
            return { out: "Hello from Plugin" };
        }
    }

    function TestPluginComponent({ data, emit }) {
        // Simple React component
        return React.createElement('div', { 
            className: 'test-plugin-node',
            style: { 
                padding: '10px', 
                background: '#222', 
                border: '2px solid #0f0', 
                color: '#fff',
                borderRadius: '8px',
                boxShadow: '0 0 10px #0f0'
            } 
        }, [
            React.createElement('div', { key: 'title', style: { marginBottom: '10px', fontWeight: 'bold', textAlign: 'center' } }, "PLUGIN LOADED"),
            React.createElement('div', { key: 'content', style: { fontSize: '12px' } }, "This node was loaded dynamically from the /plugins folder!")
        ]);
    }

    nodeRegistry.register({
        label: "Test Plugin Node",
        factory: (cb) => new TestPluginNode(cb),
        component: TestPluginComponent,
        updateStrategy: 'default'
    });

    console.log("TestPluginNode registered from external file!");
})();
