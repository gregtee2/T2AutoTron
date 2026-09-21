const commandTracker = require('../src/engine/commandTracker');

describe('command tracker Event Log correlation', () => {
  const entityId = 'light.event_log_correlation_test';

  test('identifies a scheduled backend command as T2AutoTron', () => {
    commandTracker.logOutgoingCommand({
      entityId,
      action: 'turn_on',
      payload: { on: true },
      nodeId: 'scheduled-node',
      nodeType: 'HAGenericDeviceNode',
      reason: 'Office Lights schedule',
      inputs: { trigger: true }
    });

    const result = commandTracker.logIncomingStateChange({
      entityId,
      oldState: 'off',
      newState: 'on',
      context: {},
      attributes: {}
    });

    expect(result).toMatchObject({
      wasUs: true,
      source: 'T2AutoTron (confirmed)',
      sourceDetails: {
        nodeId: 'scheduled-node',
        reason: 'Office Lights schedule'
      }
    });
  });
});