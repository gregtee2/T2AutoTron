function channelName(value) {
  return String(value || '').replace(/^\[[^\]]+\]/, '').trim();
}

export function analyzeGraphHealth(nodes, connections, knownHaIds = null) {
  const issues = [];
  const byId = new Map(nodes.map(node => [node.id, node]));
  const senders = nodes.filter(node => node.label === 'Sender');
  const writers = new Map();

  for (const connection of connections) {
    const source = byId.get(connection.source);
    const target = byId.get(connection.target);
    if (!source || !target) continue;

    if (source.label === 'Receiver' && connection.sourceOutput === 'change'
        && target.label === 'HA Generic Device' && connection.targetInput === 'trigger'
        && (target.properties?.triggerMode || 'Follow') === 'Follow') {
      issues.push({
        severity: 'warning',
        title: 'Pulse wired to Follow',
        detail: 'Receiver.change briefly goes true, then false. Use Receiver.out for a lasting state.',
        nodeIds: [source.id, target.id]
      });
    }

    const output = source.outputs?.[connection.sourceOutput];
    const input = target.inputs?.[connection.targetInput];
    if (!output || !input) {
      issues.push({
        severity: 'error',
        title: 'Missing socket',
        detail: `${source.label}.${connection.sourceOutput} to ${target.label}.${connection.targetInput} no longer has a matching socket.`,
        nodeIds: [source.id, target.id]
      });
    } else if (output.socket && input.socket && output.socket.name !== 'any' && input.socket.name !== 'any'
        && output.socket.canConnectTo && !output.socket.canConnectTo(input.socket)) {
      issues.push({
        severity: 'error',
        title: 'Incompatible sockets',
        detail: `${source.label}.${connection.sourceOutput} cannot connect to ${target.label}.${connection.targetInput}.`,
        nodeIds: [source.id, target.id]
      });
    }
  }

  for (const node of nodes) {
    if (node.label === 'Receiver' && node.properties?.selectedBuffer) {
      const channel = channelName(node.properties.selectedBuffer);
      if (!senders.some(sender => channelName(sender.properties?.bufferName) === channel)) {
        issues.push({
          severity: 'warning',
          title: 'Wireless source not found',
          detail: `Receiver listens to ${node.properties.selectedBuffer}, but no Sender has that name.`,
          nodeIds: [node.id]
        });
      }
    }

    if (node.label !== 'HA Generic Device') continue;
    for (const deviceId of node.properties?.selectedDeviceIds || []) {
      if (!deviceId) continue;
      const canonicalId = deviceId.startsWith('ha_') ? deviceId : `ha_${deviceId}`;
      if (knownHaIds?.size && !knownHaIds.has(canonicalId)) {
        issues.push({
          severity: 'warning',
          title: 'Device not found',
          detail: `${deviceId} is not in the current Home Assistant device list. Check the selected device.`,
          nodeIds: [node.id]
        });
      }
      if (!writers.has(canonicalId)) writers.set(canonicalId, []);
      writers.get(canonicalId).push(node.id);
    }
  }

  for (const [deviceId, nodeIds] of writers) {
    if (nodeIds.length < 2) continue;
    issues.push({
      severity: 'warning',
      title: 'Multiple device writers',
      detail: `${deviceId} is selected by ${nodeIds.length} HA Generic Device nodes. Check whether their rules can conflict.`,
      nodeIds
    });
  }

  return issues;
}