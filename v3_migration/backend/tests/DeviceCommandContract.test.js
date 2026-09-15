const {
  DEVICE_COMMAND_PHASES,
  createDeviceCommandState,
  setDesiredDeviceState,
  recordObservedDeviceState,
  isExternalDeviceOverride,
  adoptObservedDeviceState,
  rearmDeviceCommandState,
  beginDeviceCommand,
  normalizeDeviceCommandResult,
  isRetryableHttpStatus,
  normalizeObservedPowerState,
  recordDeviceCommandResult,
  shouldIssueDeviceCommand
} = require('../../shared/logic/DeviceLogic');

describe('device command contract', () => {
  test('missing desired input remains idle and never means off', () => {
    const state = setDesiredDeviceState(createDeviceCommandState(), undefined, 1);
    expect(state).toMatchObject({
      desiredState: null,
      pendingCommand: null,
      phase: DEVICE_COMMAND_PHASES.IDLE
    });
  });

  test('desired false remains pending while an on state is observed', () => {
    let state = recordObservedDeviceState(createDeviceCommandState(), true, 1);
    state = setDesiredDeviceState(state, false, 2);
    expect(state).toMatchObject({
      desiredState: false,
      observedState: true,
      pendingCommand: false,
      phase: DEVICE_COMMAND_PHASES.PENDING
    });
  });

  test('accepted command remains pending until observation confirms it', () => {
    let state = setDesiredDeviceState(createDeviceCommandState(), false, 1);
    state = recordDeviceCommandResult(state, { success: true }, 2);
    expect(state.phase).toBe(DEVICE_COMMAND_PHASES.PENDING);
    expect(state.confirmationDueAt).toBe(2502);
    expect(shouldIssueDeviceCommand(state, 2501)).toBe(false);
    expect(shouldIssueDeviceCommand(state, 2502)).toBe(true);
    state = recordObservedDeviceState(state, false, 3);
    expect(state).toMatchObject({
      observedState: false,
      pendingCommand: null,
      phase: DEVICE_COMMAND_PHASES.CONFIRMED
    });
  });

  test('late HTTP completion cannot demote an already confirmed observation', () => {
    let state = setDesiredDeviceState(createDeviceCommandState(), false, 1);
    state = recordObservedDeviceState(state, false, 2);
    state = recordDeviceCommandResult(state, { success: true }, 3);
    expect(state.phase).toBe(DEVICE_COMMAND_PHASES.CONFIRMED);
    expect(state.pendingCommand).toBeNull();
  });

  test('confirmed opposite observation can be adopted as an external override', () => {
    let state = recordObservedDeviceState(createDeviceCommandState(), true, 1);
    state = setDesiredDeviceState(state, true, 2);
    expect(state.phase).toBe(DEVICE_COMMAND_PHASES.CONFIRMED);
    expect(isExternalDeviceOverride(state, false)).toBe(true);

    state = adoptObservedDeviceState(state, false, 3);
    expect(state).toMatchObject({
      desiredState: null,
      observedState: false,
      pendingCommand: null,
      phase: DEVICE_COMMAND_PHASES.IDLE
    });
    expect(shouldIssueDeviceCommand(state, 10000)).toBe(false);
  });

  test('external override adoption is symmetric for manual ON', () => {
    let state = recordObservedDeviceState(createDeviceCommandState(), false, 1);
    state = setDesiredDeviceState(state, false, 2);
    expect(isExternalDeviceOverride(state, true)).toBe(true);

    state = adoptObservedDeviceState(state, true, 3);
    expect(state).toMatchObject({
      desiredState: null,
      observedState: true,
      pendingCommand: null,
      phase: DEVICE_COMMAND_PHASES.IDLE
    });
  });

  test('stale observations preserve in-flight deadlines and terminal phases', () => {
    let pending = setDesiredDeviceState(
      recordObservedDeviceState(createDeviceCommandState(), true, 1),
      false,
      2
    );
    pending = recordDeviceCommandResult(pending, { success: true }, 3);
    const stalePending = recordObservedDeviceState(pending, true, 4);
    expect(stalePending.phase).toBe(DEVICE_COMMAND_PHASES.PENDING);
    expect(stalePending.confirmationDueAt).toBe(2503);

    let retrying = recordDeviceCommandResult(pending, {
      success: false,
      retryable: true,
      reason: 'temporary'
    }, 5);
    const staleRetry = recordObservedDeviceState(retrying, true, 6);
    expect(staleRetry.phase).toBe(DEVICE_COMMAND_PHASES.RETRYING);
    expect(staleRetry.nextRetryAt).toBe(retrying.nextRetryAt);

    const failed = recordDeviceCommandResult(pending, {
      success: false,
      retryable: false,
      reason: 'permanent'
    }, 7);
    expect(recordObservedDeviceState(failed, true, 8).phase).toBe(DEVICE_COMMAND_PHASES.FAILED);

    const delegated = recordDeviceCommandResult(pending, { success: true, skipped: true }, 9);
    expect(recordObservedDeviceState(delegated, true, 10).phase).toBe(DEVICE_COMMAND_PHASES.DELEGATED);
  });

  test('superseded accepted command forces a compensating latest command', () => {
    let state = recordObservedDeviceState(createDeviceCommandState(), false, 1);
    state = setDesiredDeviceState(state, true, 2);
    const oldCommand = beginDeviceCommand(state, 3);
    state = oldCommand.state;

    state = setDesiredDeviceState(state, false, 4);
    expect(state.phase).toBe(DEVICE_COMMAND_PHASES.PENDING);
    expect(state.mustCompensate).toBe(true);
    expect(shouldIssueDeviceCommand(state, 4)).toBe(false);

    state = recordDeviceCommandResult(state, {
      success: true,
      commandToken: oldCommand.command
    }, 5);
    expect(state.mustCompensate).toBe(true);
    expect(shouldIssueDeviceCommand(state, 5)).toBe(true);

    const newCommand = beginDeviceCommand(state, 6);
    expect(newCommand.command.desiredState).toBe(false);
    state = recordDeviceCommandResult(newCommand.state, {
      success: true,
      commandToken: newCommand.command
    }, 7);
    expect(state.phase).toBe(DEVICE_COMMAND_PHASES.PENDING);
  });

  test('active command blocks duplicate issue attempts', () => {
    const desired = setDesiredDeviceState(createDeviceCommandState(), true, 1);
    const { state } = beginDeviceCommand(desired, 2);
    expect(shouldIssueDeviceCommand(state, 10000)).toBe(false);
  });

  test('retryable failure retains desired state and increments attempt', () => {
    let state = setDesiredDeviceState(createDeviceCommandState(), false, 1);
    state = recordDeviceCommandResult(state, { success: false, error: 'HTTP 503' }, 2);
    expect(state).toMatchObject({
      desiredState: false,
      pendingCommand: false,
      phase: DEVICE_COMMAND_PHASES.RETRYING,
      attempt: 1,
      nextRetryAt: 2002,
      lastError: 'HTTP 503'
    });
    expect(shouldIssueDeviceCommand(state, 2001)).toBe(false);
    expect(shouldIssueDeviceCommand(state, 2002)).toBe(true);

    const unchanged = setDesiredDeviceState(state, false, 100);
    expect(unchanged.phase).toBe(DEVICE_COMMAND_PHASES.RETRYING);
    expect(unchanged.nextRetryAt).toBe(2002);
  });

  test('non-retryable failure is visible and does not loop', () => {
    let state = setDesiredDeviceState(createDeviceCommandState(), true, 1);
    state = recordDeviceCommandResult(state, { success: false, retryable: false, reason: 'read_only' }, 2);
    expect(state).toMatchObject({
      desiredState: true,
      pendingCommand: null,
      phase: DEVICE_COMMAND_PHASES.FAILED,
      lastError: 'read_only'
    });
  });

  test('normalizes skipped ownership commands as non-retryable locally', () => {
    expect(normalizeDeviceCommandResult({ success: true, skipped: true })).toEqual({
      success: true,
      skipped: true,
      retryable: false,
      reason: null
    });

    const state = recordDeviceCommandResult(
      setDesiredDeviceState(createDeviceCommandState(), false, 1),
      { success: true, skipped: true },
      2
    );
    expect(state.phase).toBe(DEVICE_COMMAND_PHASES.DELEGATED);
    expect(shouldIssueDeviceCommand(state, 10000)).toBe(false);

    const rearmed = rearmDeviceCommandState(state, 3);
    expect(rearmed.phase).toBe(DEVICE_COMMAND_PHASES.PENDING);
    expect(shouldIssueDeviceCommand(rearmed, 3)).toBe(true);
  });

  test('retries temporary HTTP failures but not permanent request errors', () => {
    expect(isRetryableHttpStatus(503)).toBe(true);
    expect(isRetryableHttpStatus(429)).toBe(true);
    expect(isRetryableHttpStatus(408)).toBe(true);
    expect(isRetryableHttpStatus(400)).toBe(false);
    expect(isRetryableHttpStatus(401)).toBe(false);
    expect(isRetryableHttpStatus(404)).toBe(false);
  });

  test('does not mistake unavailable or unknown for confirmed off', () => {
    expect(normalizeObservedPowerState({ state: 'on', on: true })).toBe(true);
    expect(normalizeObservedPowerState({ state: 'off', on: false })).toBe(false);
    expect(normalizeObservedPowerState({ state: 'playing' })).toBe(true);
    expect(normalizeObservedPowerState({ state: 'idle' })).toBe(false);
    expect(normalizeObservedPowerState({ state: 'unavailable', on: false })).toBeNull();
    expect(normalizeObservedPowerState({ state: 'unknown', on: false })).toBeNull();
  });
});