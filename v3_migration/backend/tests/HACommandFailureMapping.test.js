const express = require('express');
const request = require('supertest');

jest.mock('../src/devices/managers/homeAssistantManager', () => ({
  getDevices: jest.fn(() => [{ id: 'ha_light.test' }]),
  updateState: jest.fn(),
  getState: jest.fn()
}));

jest.mock('../src/engine/commandTracker', () => ({
  logOutgoingCommand: jest.fn()
}));

jest.mock('../src/logging/logWithTimestamp', () => jest.fn());

jest.mock('../src/api/middleware/requireLocalOrPin', () => (req, res, next) => next());

const homeAssistantManager = require('../src/devices/managers/homeAssistantManager');
const createHaRoutes = require('../src/api/routes/haRoutes');

describe('HA command failure mapping', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/lights/ha', createHaRoutes({ emit: jest.fn() }));

  beforeEach(() => {
    homeAssistantManager.updateState.mockReset();
    homeAssistantManager.getState.mockReset();
  });

  test('maps temporary manager failure to retryable 503', async () => {
    homeAssistantManager.updateState.mockResolvedValue({
      success: false,
      error: 'Device marked unhealthy - skipping',
      retryable: true
    });

    const response = await request(app)
      .put('/api/lights/ha/light.test/state')
      .send({ on: false });

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      success: false,
      error: 'Device marked unhealthy - skipping',
      retryable: true
    });
  });

  test('preserves permanent HA request status without retrying', async () => {
    homeAssistantManager.updateState.mockResolvedValue({
      success: false,
      error: 'HA API error: 404',
      status: 404,
      retryable: false
    });

    const response = await request(app)
      .put('/api/lights/ha/light.missing/state')
      .send({ on: false });

    expect(response.status).toBe(404);
    expect(response.body.retryable).toBe(false);
  });

  test('fresh state request bypasses manager cache', async () => {
    homeAssistantManager.getState.mockResolvedValue({
      success: true,
      state: { state: 'off', on: false }
    });

    const response = await request(app)
      .get('/api/lights/ha/light.test-fresh/state?fresh=true');

    expect(response.status).toBe(200);
    expect(homeAssistantManager.getState).toHaveBeenCalledWith(
      'light.test-fresh',
      { forceRefresh: true }
    );
  });

  test('attributes graph node commands to their source node', async () => {
    const commandTracker = require('../src/engine/commandTracker');
    commandTracker.logOutgoingCommand.mockClear();
    homeAssistantManager.updateState.mockResolvedValue({ success: true });
    homeAssistantManager.getState.mockResolvedValue({ success: true, state: { state: 'on', on: true } });

    await request(app)
      .put('/api/lights/ha/light.test/state')
      .send({ on: true, t2Source: { nodeId: 'node-42', nodeType: 'HAGenericDeviceNode', reason: 'Porch Lights' } });

    expect(commandTracker.logOutgoingCommand).toHaveBeenCalledWith(expect.objectContaining({
      nodeId: 'node-42',
      reason: 'Porch Lights'
    }));
    expect(homeAssistantManager.updateState.mock.calls[0][1]).not.toHaveProperty('t2Source');
  });

  test('keeps direct UI commands labeled as manual control', async () => {
    const commandTracker = require('../src/engine/commandTracker');
    commandTracker.logOutgoingCommand.mockClear();
    homeAssistantManager.updateState.mockResolvedValue({ success: true });
    homeAssistantManager.getState.mockResolvedValue({ success: true, state: { state: 'on', on: true } });

    await request(app)
      .put('/api/lights/ha/light.test/state')
      .send({ on: true });

    expect(commandTracker.logOutgoingCommand).toHaveBeenCalledWith(expect.objectContaining({
      nodeId: 'API',
      reason: 'User triggered via UI'
    }));
  });
});