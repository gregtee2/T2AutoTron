const EventEmitter = require('events');

jest.mock('child_process', () => ({ spawn: jest.fn() }));

function fakeProcess() {
  const proc = new EventEmitter();
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = jest.fn();
  return proc;
}

describe('AudioMixer restart behavior', () => {
  let audioMixer;
  let spawn;
  let warn;
  let log;

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    spawn = require('child_process').spawn;
    spawn.mockReset();
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    log = jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    audioMixer = require('../src/services/audioMixerService');
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('stops retrying and warns once when FFmpeg is not installed', () => {
    const proc = fakeProcess();
    spawn.mockReturnValue(proc);

    audioMixer.start();
    proc.emit('error', Object.assign(new Error('spawn ffmpeg ENOENT'), { code: 'ENOENT' }));
    proc.emit('close', -2);
    jest.advanceTimersByTime(60 * 60 * 1000);

    expect(spawn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(audioMixer.getStatus()).toMatchObject({ running: false, available: false });
  });

  test('rejects stream clients once FFmpeg is known to be missing', () => {
    const proc = fakeProcess();
    spawn.mockReturnValue(proc);
    audioMixer.start();
    proc.emit('error', Object.assign(new Error('spawn ffmpeg ENOENT'), { code: 'ENOENT' }));

    const res = { status: jest.fn().mockReturnThis(), json: jest.fn(), setHeader: jest.fn() };
    audioMixer.addClient(res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  test('backs off repeated FFmpeg failures instead of retrying every 5 seconds', () => {
    spawn.mockImplementation(() => fakeProcess());

    audioMixer.start();
    spawn.mock.results[0].value.emit('close', 1);
    jest.advanceTimersByTime(5000);
    expect(spawn).toHaveBeenCalledTimes(2);

    spawn.mock.results[1].value.emit('close', 1);
    jest.advanceTimersByTime(5000);
    expect(spawn).toHaveBeenCalledTimes(2);
    jest.advanceTimersByTime(5000);
    expect(spawn).toHaveBeenCalledTimes(3);

    const exitLogs = log.mock.calls.filter(([message]) => String(message).includes('FFmpeg exited'));
    expect(exitLogs).toHaveLength(1);
  });
});
