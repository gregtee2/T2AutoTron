/**
 * Dependency order for both saved descriptors and live backend nodes.
 * Keep buffer naming identical to BufferNodes: strip the type prefix, but
 * preserve whitespace/case (those are part of the actual buffer key).
 */
function dependencyOrder(nodes, connections) {
  const dependencies = new Map(Array.from(nodes.keys(), id => [id, new Set()]));
  const sendersByName = new Map();
  const stripPrefix = name => name.replace(/^\[.+\]/, '');

  for (const connection of connections) {
    if (!nodes.has(connection.source) || !nodes.has(connection.target)) {
      throw new Error('Invalid graph: every connection must reference existing nodes');
    }
    dependencies.get(connection.target).add(connection.source);
  }

  const nodeType = node => node.type || node.constructor?.type || node.constructor?.name;
  for (const [id, node] of nodes) {
    if (nodeType(node) !== 'SenderNode') continue;
    const name = stripPrefix(node.properties?.bufferName || 'Default');
    if (!sendersByName.has(name)) sendersByName.set(name, []);
    sendersByName.get(name).push(id);
  }

  for (const [id, node] of nodes) {
    if (nodeType(node) !== 'ReceiverNode') continue;
    const name = node.properties?.selectedBuffer || node.properties?.bufferName;
    if (!name) continue;
    for (const sender of sendersByName.get(stripPrefix(name)) || []) {
      dependencies.get(id).add(sender);
    }
  }

  const visited = new Set();
  const visiting = new Set();
  const ancestry = [];
  const order = [];
  const visit = id => {
    if (visiting.has(id)) {
      const cycle = ancestry.slice(ancestry.indexOf(id)).concat(id);
      throw new Error(`Graph contains a cycle: ${cycle.join(' -> ')}`);
    }
    if (visited.has(id)) return;
    visiting.add(id);
    ancestry.push(id);
    for (const dependency of dependencies.get(id)) visit(dependency);
    ancestry.pop();
    visiting.delete(id);
    visited.add(id);
    order.push(id);
  };
  for (const id of nodes.keys()) visit(id);

  return { order, dependencies };
}

module.exports = dependencyOrder;