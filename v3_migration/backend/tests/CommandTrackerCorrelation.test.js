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

  test('keeps follow-up attribute echoes attributed to the same command', () => {
    const echoEntity = 'light.echo_correlation_test';
    commandTracker.logOutgoingCommand({
      entityId: echoEntity,
      action: 'turn_on',
      payload: { on: true, brightness: 112 },
      nodeId: 'porch-node',
      nodeType: 'HAGenericDeviceNode',
      reason: 'Porch Lights'
    });

    commandTracker.logIncomingStateChange({ entityId: echoEntity, oldState: 'off', newState: 'on', context: {}, attributes: {} });
    const echo = commandTracker.logIncomingStateChange({
      entityId: echoEntity,
      oldState: 'on',
      newState: 'on',
      context: { user_id: 'token-owner' },
      attributes: { brightness: 112 }
    });

    expect(echo).toMatchObject({ wasUs: true, sourceDetails: { nodeId: 'porch-node' } });
  });

  test('does not claim an opposite physical switch change as a T2 command', () => {
    const switchEntity = 'light.physical_switch_test';
    commandTracker.logOutgoingCommand({
      entityId: switchEntity,
      action: 'turn_on',
      payload: { on: true },
      nodeId: 'hall-node',
      nodeType: 'HAGenericDeviceNode',
      reason: 'Hall Lights'
    });

    const result = commandTracker.logIncomingStateChange({
      entityId: switchEntity,
      oldState: 'on',
      newState: 'off',
      context: { id: 'switch-context' },
      attributes: {}
    });

    expect(result).toMatchObject({ wasUs: false, source: 'External (device/integration)' });
  });
});