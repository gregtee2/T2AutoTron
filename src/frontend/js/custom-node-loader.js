// Custom Node Loader Module
// Dynamically loads LiteGraph custom nodes from a manifest file
console.log('custom-node-loader.js loaded');

(function () {
    'use strict';

    async function loadAllCustomNodes() {
        try {
            console.log('📦 Loading custom nodes from manifest...');

            // Fetch the nodes manifest
            const response = await fetch('/api/custom-nodes');
            if (!response.ok) {
                throw new Error(`Failed to fetch custom nodes: ${response.statusText}`);
            }

            const nodeFiles = await response.json();
            console.log(`Found ${nodeFiles.length} custom node files`);

            // Load each node file sequentially
            let loaded = 0;
            let failed = 0;

            for (const file of nodeFiles) {
                try {
                    // Create script element and load it
                    await loadScript(file);
                    loaded++;
                } catch (err) {
                    console.error(`❌ Failed to load: ${file}`, err);
                    failed++;
                }
            }

            console.log(`✅ Custom nodes loaded: ${loaded} successful, ${failed} failed`);

            // Dispatch event to signal nodes are ready
            window.dispatchEvent(new CustomEvent('customNodesLoaded', {
                detail: { loaded, failed, total: nodeFiles.length }
            }));

        } catch (err) {
            console.error('❌ Failed to load custom node manifest:', err);
        }
    }

    // Helper to load a script dynamically
    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
            document.head.appendChild(script);
        });
    }

    // Make loader available globally
    window.loadAllCustomNodes = loadAllCustomNodes;

    // Note: We DON'T auto-load here - let main.js control when to load
    console.log('✅ Custom node loader ready (call window.loadAllCustomNodes() to load)');
})();
