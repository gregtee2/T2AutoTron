const mockSendMessage = jest.fn().mockResolvedValue(undefined);

jest.mock('node-telegram-bot-api', () => jest.fn(() => ({
  sendMessage: mockSendMessage
})));

describe('startup notification batching', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-11T16:00:00Z'));
    mockSendMessage.mockClear();
    process.env.TELEGRAM_BOT_TOKEN = 'test-token';
    process.env.TELEGRAM_CHAT_ID = 'test-chat';
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
  });

  test('reports only the latest state when a device changes both ways during startup', async () => {
    const { setupNotifications } = require('../src/notifications/notificationService');
    const emitter = setupNotifications({ emit: jest.fn() });
    emitter.startBatch();

    emitter.emit('notify', '*Bar Lamp* turned *ON*');
    emitter.emit('notify', '*Bar Lamp* turned *OFF*');

    jest.setSystemTime(new Date('2026-09-11T16:03:00Z'));
    emitter.flushBatch();
    await Promise.resolve();

    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    const summary = mockSendMessage.mock.calls[0][1];
    expect(summary).toContain('1 devices turned OFF');
    expect(summary).not.toContain('devices turned ON');
    expect(summary.match(/Bar Lamp/g)).toHaveLength(1);
  });
});