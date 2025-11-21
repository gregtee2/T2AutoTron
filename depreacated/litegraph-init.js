document.addEventListener("DOMContentLoaded", function() {
    const canvas = document.getElementById("graphcanvas");
    const context = canvas.getContext("2d");
    context.fillStyle = "red";
    context.fillRect(10, 10, 100, 100);
    console.log("Canvas test: drew a red square.");

    console.log("LiteGraph loaded");

    // Use the LiteGraph global object directly
    const graph = new LiteGraph.LGraph();
    const canvasGraph = new LiteGraph.LGraphCanvas("#graphcanvas", graph);
    console.log("Canvas initialized with LiteGraph");

    const node_const = LiteGraph.createNode("basic/const");
    node_const.pos = [50, 200];
    node_const.setValue(true);
    graph.add(node_const);
    console.log("Const node added");

    graph.start();
    console.log("Graph started");
});
