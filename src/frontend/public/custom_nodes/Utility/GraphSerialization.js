// File: GraphSerialization.js

console.log("Loaded GraphSerialization.js successfully");

(function() {
    // Save references to original LiteGraph methods
    const originalSerialize = LiteGraph.LGraph.prototype.serialize;
    const originalConfigure = LiteGraph.LGraph.prototype.configure;

    /**
     * Ensure we have a real SharedBuffer instance on the graph.
     */
    LiteGraph.LGraph.prototype.initializeSharedBuffer = function() {
        if (!this.sharedBuffer || !(this.sharedBuffer instanceof SharedBuffer)) {
            this.sharedBuffer = new SharedBuffer();
            console.log("GraphSerialization: Initialized new SharedBuffer instance on the graph.");
        }
    };

    /**
     * Overrides the graph's serialize method to include sharedBuffer data.
     */
    LiteGraph.LGraph.prototype.serialize = function() {
        this.initializeSharedBuffer(); // ensure we have a real instance
        const data = originalSerialize.call(this);

        // store the internal data of sharedBuffer
        data.sharedBuffer = this.sharedBuffer.serialize();
        console.log("GraphSerialization: serialized sharedBuffer ->", data.sharedBuffer);
        return data;
    };

    /**
     * Overrides the graph's configure method to restore sharedBuffer data,
     * then configure all nodes so that they can access the restored sharedBuffer.
     */
    LiteGraph.LGraph.prototype.configure = function(data) {
        // Ensure we have a valid SharedBuffer instance, so we can .deserialize()
        this.initializeSharedBuffer();

        if (data && data.sharedBuffer) {
            this.sharedBuffer.deserialize(data.sharedBuffer);
        }

        // Now configure nodes
        originalConfigure.call(this, data);
        console.log("GraphSerialization: Configured graph. sharedBuffer =", this.sharedBuffer);
    };
})();
