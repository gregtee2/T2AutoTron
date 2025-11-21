let graph;
let canvas;

export function initializeGraph() {
    graph = new LiteGraph.LGraph();
    window.graph = graph;
    canvas = new LiteGraph.LGraphCanvas("#graphcanvas", graph);
    adjustCanvasResolution(canvas.canvas);
    console.log("Canvas initialized with LiteGraph");
    graph.start();
    console.log("Graph started");

    canvas.canvas.addEventListener("contextmenu", function(e) {
        e.preventDefault();
        showContextMenu(e);
        return false;
    });

    canvas.canvas.addEventListener("mouseup", function(e) {
        graph.sendEventToAllNodes("onMouseUp", e);
    });

    canvas.canvas.addEventListener("mousemove", function(e) {
        graph.sendEventToAllNodes("onMouseMove", e);
    });

    window.addEventListener("keydown", function(e) {
        if (e.key === "Delete" || e.key === "Del") {
            const selectedNodes = canvas.selected_nodes;
            if (selectedNodes) {
                for (let node_id in selectedNodes) {
                    graph.remove(selectedNodes[node_id]);
                }
                canvas.selected_nodes = {};
            }
        }
    });
}

function showContextMenu(event) {
    const x = event.clientX;
    const y = event.clientY;

    const options = [
        {
            content: "Test",
            has_submenu: true,
            submenu: {
                options: [
                    { content: "Light Function Basic", value: "custom/light_function_basic" },
                    { content: "Const", value: "basic/const" },
                    { content: "Use Evolved Sampling", value: "custom/use_evolved_sampling" },
                    { content: "Apply Motion Model", value: "custom/apply_motion_model" },
                    { content: "Execute", value: "custom/execute" },
                    { content: "On Off", value: "custom/on_off" }
                ].map(option => ({
                    content: option.content,
                    callback: () => {
                        const node = LiteGraph.createNode(option.value);
                        if (node) {
                            node.pos = [canvas.convertOffsetX(x + 50), canvas.convertOffsetY(y)];
                            graph.add(node);
                            console.log(`${option.value} node added`);
                            node.onExecute();
                        }
                    }
                }))
            }
        }
    ];

    const menu = new LiteGraph.ContextMenu(options, {
        event: { clientX: x, clientY: y },
        callback: function(item) {
            if (item && item.callback) {
                item.callback();
            }
        },
        parentMenu: null,
        left: x,
        top: y
    });

    menu.on_show_submenu = function(submenu, options, e) {
        submenu.root.style.left = (x + menu.root.offsetWidth) + 'px';
        submenu.root.style.top = y + 'px';
    };
}

export function addNode(type) {
    const node = LiteGraph.createNode(type);
    if (node) {
        node.pos = [canvas.canvas.width / 2, canvas.canvas.height / 2];
        graph.add(node);
        console.log(`${type} node added`);
        node.onExecute();
    }
}

export function fetchLights() {
    fetch('http://127.0.0.1:5000/api/lights')
    .then(response => response.json())
    .then(data => {
        console.log('Lights:', data);
        displayLights(data);
    })
    .catch((error) => {
        console.error('Error:', error);
        alert('Failed to fetch lights. Please ensure the server is running.');
    });
}

function adjustCanvasResolution(canvas) {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    canvas.getContext('2d').scale(dpr, dpr);
}

function displayLights(lights) {
    const lightListDiv = document.getElementById('lightList');
    lightListDiv.innerHTML = '';
    for (const [name, id] of Object.entries(lights)) {
        const lightDiv = document.createElement('div');
        lightDiv.textContent = `${name} (ID: ${id})`;
        lightDiv.style.cursor = 'pointer';
        lightDiv.onclick = () => createLightNode(name, id);
        lightListDiv.appendChild(lightDiv);
    }
}

function createLightNode(name, id) {
    const node = LiteGraph.createNode("basic/const");
    if (node) {
        node.pos = [canvas.canvas.width / 2, canvas.canvas.height / 2];
        node.properties.value = id;
        node.addOutput("Light", "LIGHT");
        node.title = `Light: ${name} (ID: ${id})`;
        graph.add(node);
        console.log(`Light Node added for Light: ${name}`);
    }
}

window.addNode = addNode;
window.fetchLights = fetchLights;
