async function loadNodes() {
    try {
        const response = await fetch('http://localhost:3000/api/custom-nodes');
        if (!response.ok) {
            throw new Error(`Failed to fetch node files: ${response.statusText}`);
        }
        const nodeFiles = await response.json();
        for (const file of nodeFiles) {
            try {
                const nodeModule = await import(`http://localhost:3000/${file}`);
                const nodes = nodeModule.default || [];
                nodes.forEach(node => {
                    if (node.type && node.constructor) {
                        LiteGraph.registerNodeType(node.type, node.constructor);
                        console.log(`Loaded LiteGraph node: ${node.type}`);
                    } else {
                        console.warn(`Invalid node in ${file}: ${JSON.stringify(node)}`);
                    }
                });
            } catch (error) {
                console.error(`Failed to load node file ${file}: ${error.message}`);
            }
        }
    } catch (error) {
        console.error(`Error loading nodes: ${error.message}`);
    }
}

loadNodes();