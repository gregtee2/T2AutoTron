const { constants, promises: fs } = require('fs');
const os = require('os');
const path = require('path');
const BoundedLogWriter = require('../src/logging/BoundedLogWriter');

const diskError = code => Object.assign(new Error(`Injected ${code}`), { code });
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

// All real I/O is below an isolated OS temp directory, never application logs.
describe('BoundedLogWriter', () => {
  let dir;
  let writers;
  let engineLogger;

  function makeWriter(options = {}) {
    const writer = new BoundedLogWriter({
      filePath: path.join(dir, 'nested', 'events.log'),
      maxFileBytes: 128,
      maxPendingBytes: 4096,
      maxPendingEntries: 256,
      warn: jest.fn(),
      ...options
    });
    writers.push(writer);
    return writer;
  }

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 't2-bounded-writer-'));
    writers = [];
    engineLogger = null;
  });

  afterEach(async () => {
    if (engineLogger) await engineLogger.close();
    await Promise.all(writers.map(writer => writer.close()));
    jest.dontMock('../src/logging/BoundedLogWriter');
    jest.restoreAllMocks();
    await fs.rm(dir, { recursive: true, force: true });
  });

  test('unused writer closes without creating a directory or opening a file', async () => {
    const io = { mkdir: jest.fn(), open: jest.fn() };
    const writer = makeWriter({ fs: io });
    await expect(writer.close()).resolves.toMatchObject({ state: 'closed', handleOpen: false });
    expect(io.mkdir).not.toHaveBeenCalled();
    expect(io.open).not.toHaveBeenCalled();
    expect(await fs.readdir(dir)).toEqual([]);
  });

  test('creates a missing file and drains ordered UTF-8 records on idempotent close', async () => {
    const writer = makeWriter();
    const records = ['first\n', '💡 café\n', '{"ok":true}\n'];
    records.forEach(record => expect(writer.write(record)).toBe(true));
    const closing = writer.close();
    expect(closing).toBeInstanceOf(Promise);
    expect(writer.close()).toBe(closing);
    await expect(closing).resolves.toMatchObject({
      state: 'closed', closeComplete: true, handleOpen: false,
      writtenEntries: 3, droppedEntries: 0, errorCount: 0,
      pendingEntries: 0, pendingBytes: 0,
      writtenBytes: Buffer.byteLength(records.join(''))
    });
    expect(await fs.readFile(writer.filePath, 'utf8')).toBe(records.join(''));
    expect(writer.write('too late\n')).toBe(false);
    expect(writer.getStatus().drops.closed).toBe(1);
    expect(await fs.readFile(writer.filePath, 'utf8')).toBe(records.join(''));
  });

  test('rotates for an incoming overflow even when existing size is below the cap', async () => {
    const writer = makeWriter({ maxFileBytes: 12 });
    await fs.mkdir(path.dirname(writer.filePath), { recursive: true });
    await fs.writeFile(writer.filePath, '123456789\n'); // 10, not > 12
    await fs.writeFile(writer.backupPath, 'stale\n');
    writer.write('ab\n'); // 10 + 3 must rotate
    await writer.close();
    expect(await fs.readFile(writer.backupPath, 'utf8')).toBe('123456789\n');
    expect(await fs.readFile(writer.filePath, 'utf8')).toBe('ab\n');
    expect(writer.getStatus()).toMatchObject({ rotations: 1, errorCount: 0 });
    expect((await fs.readdir(path.dirname(writer.filePath))).sort()).toEqual(['events.log', 'events.log.old']);
  });

  test('allows the exact byte cap and rotates before the next multi-byte record', async () => {
    const writer = makeWriter({ maxFileBytes: 10 });
    writer.write('💡\n'); // 5 UTF-8 bytes, not 3
    writer.write('💡\n');
    await writer.flush();
    expect((await fs.stat(writer.filePath)).size).toBe(10);
    await expect(fs.stat(writer.backupPath)).rejects.toMatchObject({ code: 'ENOENT' });
    writer.write('💡\n');
    await writer.close();
    expect((await fs.stat(writer.backupPath)).size).toBe(10);
    expect((await fs.stat(writer.filePath)).size).toBe(5);
    expect(writer.getStatus()).toMatchObject({ rotations: 1, writtenEntries: 3, droppedEntries: 0 });
  });

  test('appends to existing content when the complete next record fits', async () => {
    const writer = makeWriter({ maxFileBytes: 10 });
    await fs.mkdir(path.dirname(writer.filePath), { recursive: true });
    await fs.writeFile(writer.filePath, 'old\n');
    writer.write('new\n');
    await writer.close();
    expect(await fs.readFile(writer.filePath, 'utf8')).toBe('old\nnew\n');
    expect(writer.getStatus()).toMatchObject({ fileBytes: 8, rotations: 0, errorCount: 0 });
  });

  test('many writes across a continuous run stay ordered and bounded through every rotation', async () => {
    const cap = 128;
    const archives = [];
    const observedSizes = [];
    const handlesAtRename = [];
    let handles = 0;
    let openCalls = 0;
    let statCalls = 0;
    let writesInFlight = 0;
    let maxWritesInFlight = 0;
    const io = {
      ...fs,
      open: async (...args) => {
        const handle = await fs.open(...args);
        openCalls++;
        handles++;
        return {
          stat: () => { statCalls++; return handle.stat(); },
          truncate: size => handle.truncate(size),
          close: async () => { await handle.close(); handles--; },
          write: async (...writeArgs) => {
            maxWritesInFlight = Math.max(maxWritesInFlight, ++writesInFlight);
            try {
              const result = await handle.write(...writeArgs);
              observedSizes.push((await fs.stat(args[0])).size);
              return result;
            } finally {
              writesInFlight--;
            }
          }
        };
      },
      rename: async (from, to) => {
        handlesAtRename.push(handles);
        await fs.rename(from, to);
        const archive = await fs.readFile(to, 'utf8');
        archives.push(archive);
        observedSizes.push(Buffer.byteLength(archive));
      }
    };
    const writer = makeWriter({ fs: io, maxFileBytes: cap });
    const records = [];
    for (let batch = 0; batch < 6; batch++) {
      for (let n = 0; n < 40; n++) {
        const record = `${JSON.stringify({ n: batch * 40 + n, label: '💡' })}\n`;
        records.push(record);
        expect(writer.write(record)).toBe(true);
      }
      await writer.flush();
      expect(writer.getStatus().accepting).toBe(true);
    }
    await writer.close();
    const active = await fs.readFile(writer.filePath, 'utf8');
    const retained = await fs.readFile(writer.backupPath, 'utf8');
    expect(archives.join('') + active).toBe(records.join(''));
    expect(retained).toBe(archives[archives.length - 1]);
    for (const text of [...archives, active]) {
      text.trim().split('\n').forEach(line => expect(() => JSON.parse(line)).not.toThrow());
    }
    expect(Math.max(...observedSizes)).toBeLessThanOrEqual(cap);
    expect(archives.length).toBeGreaterThan(10);
    expect(handlesAtRename.every(count => count === 0)).toBe(true);
    expect(maxWritesInFlight).toBe(1);
    expect(handles).toBe(0);
    expect(statCalls).toBe(openCalls); // No per-entry size lookup by the writer
    expect(openCalls).toBe(archives.length + 1);
    expect(writer.getStatus()).toMatchObject({ writtenEntries: 240, droppedEntries: 0, errorCount: 0 });
    expect((await fs.readdir(path.dirname(writer.filePath))).sort()).toEqual(['events.log', 'events.log.old']);
  });

  test('waits for an asynchronous handle close before rename/reopen and final close', async () => {
    const entered = deferred();
    const release = deferred();
    const events = [];
    let closeCalls = 0;
    const io = {
      ...fs,
      open: async (...args) => {
        events.push('open');
        const handle = await fs.open(...args);
        return {
          stat: () => handle.stat(),
          truncate: size => handle.truncate(size),
          write: (...writeArgs) => handle.write(...writeArgs),
          close: async () => {
            events.push('close-start');
            if (++closeCalls === 1) {
              entered.resolve();
              await release.promise;
            }
            await handle.close();
            events.push('close-finished');
          }
        };
      },
      rename: async (...args) => { events.push('rename'); await fs.rename(...args); }
    };
    const writer = makeWriter({ fs: io, maxFileBytes: 10 });
    try {
      writer.write('123456\n');
      await writer.flush();
      writer.write('abcd\n');
      writer.write('z\n');
      let settled = false;
      const closing = writer.close();
      closing.then(() => { settled = true; });
      await entered.promise;
      expect(settled).toBe(false);
      expect(events).toEqual(['open', 'close-start']);
      expect(writer.getStatus().pendingEntries).toBe(2);
      release.resolve();
      await closing;
      expect(events).toEqual(['open', 'close-start', 'close-finished', 'rename', 'open', 'close-start', 'close-finished']);
      expect(await fs.readFile(writer.backupPath, 'utf8')).toBe('123456\n');
      expect(await fs.readFile(writer.filePath, 'utf8')).toBe('abcd\nz\n');
      expect(writer.getStatus()).toMatchObject({ state: 'closed', handleOpen: false });
    } finally {
      release.resolve();
    }
  });

  test('bounds pending bytes INCLUDING in-flight I/O, counts drops, and accepts again after draining', async () => {
    const entered = deferred();
    const release = deferred();
    let now = 1000;
    const warn = jest.fn();
    const io = {
      ...fs,
      open: async (...args) => {
        entered.resolve();
        await release.promise;
        return fs.open(...args);
      }
    };
    const writer = makeWriter({ fs: io, maxPendingBytes: 8, warn, now: () => now });
    try {
      expect(writer.write('123\n')).toBe(true);
      await entered.promise;
      expect(writer.write('456\n')).toBe(true);
      expect(writer.write('789\n')).toBe(false);
      expect(writer.write('789\n')).toBe(false);
      expect(warn).toHaveBeenCalledTimes(1);
      now += 60000;
      expect(writer.write('789\n')).toBe(false);
      expect(warn).toHaveBeenCalledTimes(2);
      expect(writer.getStatus()).toMatchObject({
        pendingBytes: 8, pendingEntries: 2, peakPendingBytes: 8,
        droppedEntries: 3, droppedBytes: 12, drops: { queueFull: 3 }
      });
      release.resolve();
      await writer.flush();
      expect(writer.write('z\n')).toBe(true);
      await writer.close();
      expect(await fs.readFile(writer.filePath, 'utf8')).toBe('123\n456\nz\n');
      expect(writer.getStatus()).toMatchObject({ writtenEntries: 3, pendingBytes: 0, peakPendingBytes: 8 });
    } finally {
      release.resolve();
    }
  });

  test('entry-count bound also prevents an unbounded queue of empty records', async () => {
    const writer = makeWriter({ maxPendingEntries: 2 });
    expect(writer.write('')).toBe(true);
    expect(writer.write('')).toBe(true);
    expect(writer.write('')).toBe(false);
    expect(writer.getStatus()).toMatchObject({ pendingEntries: 2, pendingBytes: 0, droppedEntries: 1 });
    await writer.close();
    expect(writer.getStatus().writtenEntries).toBe(2);
  });

  test('rejects oversized records whole and copies admitted Buffers', async () => {
    const writer = makeWriter({ maxFileBytes: 8 });
    expect(writer.write('💡💡\n')).toBe(false); // 9 bytes
    const record = Buffer.from('💡\n');
    expect(writer.write(record)).toBe(true);
    record.fill(120);
    await writer.close();
    expect(await fs.readFile(writer.filePath, 'utf8')).toBe('💡\n');
    expect(writer.getStatus()).toMatchObject({ droppedEntries: 1, droppedBytes: 9, drops: { oversized: 1 } });
  });

  test.each(['mkdir', 'open'])('%s failure is contained, reported, and closes without an unhandled rejection', async operation => {
    const io = { ...fs, [operation]: jest.fn().mockRejectedValue(diskError('EACCES')) };
    const warn = jest.fn();
    const writer = makeWriter({ fs: io, warn });
    writer.write('one\n');
    writer.write('two\n');
    await writer.flush();
    expect(writer.write('three\n')).toBe(false);
    await expect(writer.close()).resolves.toMatchObject({
      state: 'failed', closeComplete: true, handleOpen: false,
      pendingBytes: 0, pendingEntries: 0, droppedEntries: 3,
      firstError: { code: 'EACCES' }, errorCount: 1
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(io[operation]).toHaveBeenCalledTimes(1); // No retry storm
  });

  test('stat failure after creation still closes the opened handle', async () => {
    const close = jest.fn().mockResolvedValue();
    const io = {
      mkdir: jest.fn().mockResolvedValue(),
      open: jest.fn().mockResolvedValue({ stat: jest.fn().mockRejectedValue(diskError('EIO')), close })
    };
    const writer = makeWriter({ fs: io });
    writer.write('entry\n');
    await writer.close();
    expect(close).toHaveBeenCalledTimes(1);
    expect(writer.getStatus()).toMatchObject({ state: 'failed', handleOpen: false, droppedEntries: 1 });
  });

  test.each(['', 'seed 💡\n'])('uses rollback-capable handles and explicit byte offsets for short writes after %j', async existing => {
    const positions = [];
    const io = {
      ...fs,
      open: jest.fn(async (...args) => {
        const handle = await fs.open(...args);
        return {
          stat: () => handle.stat(), close: () => handle.close(), truncate: size => handle.truncate(size),
          write: (buffer, offset, length, position) => {
            positions.push(position);
            return handle.write(buffer, offset, Math.min(2, length), position);
          }
        };
      })
    };
    const writer = makeWriter({ fs: io });
    if (existing) {
      await fs.mkdir(path.dirname(writer.filePath), { recursive: true });
      await fs.writeFile(writer.filePath, existing);
    }
    const records = ['💡 first\n', 'second\n'];
    const expectedPositions = [];
    let end = Buffer.byteLength(existing);
    for (const record of records) {
      const bytes = Buffer.byteLength(record);
      for (let offset = 0; offset < bytes; offset += 2) expectedPositions.push(end + offset);
      end += bytes;
      writer.write(record);
    }
    await writer.close();
    // Assert flags even on POSIX, where append-mode truncation can succeed and
    // O_APPEND can mask missing/wrong explicit write positions.
    expect(io.open).toHaveBeenCalledTimes(1);
    expect(io.open).toHaveBeenCalledWith(writer.filePath, constants.O_WRONLY | constants.O_CREAT);
    expect(positions).toEqual(expectedPositions);
    expect(await fs.readFile(writer.filePath, 'utf8')).toBe(existing + records.join(''));
    expect(writer.getStatus()).toMatchObject({ fileBytes: end, writtenEntries: 2, errorCount: 0 });
  });

  test.each([false, true])('ENOSPC drops queued records and exposes partial-record rollback failure=%s', async failRollback => {
    let failing = false;
    let fragments = 0;
    const positions = [];
    const rollbackSizes = [];
    const warn = jest.fn();
    const io = {
      ...fs,
      open: async (...args) => {
        const handle = await fs.open(...args);
        return {
          stat: () => handle.stat(), close: () => handle.close(),
          truncate: size => {
            rollbackSizes.push(size);
            // The success branch MUST exercise the real OS handle, especially
            // on Windows, where an append-only handle can reject truncate.
            return failRollback ? Promise.reject(diskError('EIO')) : handle.truncate(size);
          },
          write: (buffer, offset, length, position) => {
            positions.push(position);
            if (!failing) return handle.write(buffer, offset, length, position);
            if (++fragments === 1) return handle.write(buffer, offset, 2, position);
            return Promise.reject(diskError('ENOSPC'));
          }
        };
      }
    };
    const writer = makeWriter({ fs: io, warn });
    writer.write('ok\n');
    await writer.flush();
    failing = true;
    writer.write('broken\n');
    writer.write('queued\n');
    await writer.flush();
    expect(positions).toEqual([0, 3, 5]);
    expect(rollbackSizes).toEqual([3]);
    expect(await fs.readFile(writer.filePath, 'utf8')).toBe(failRollback ? 'ok\nbr' : 'ok\n');
    expect(writer.getStatus()).toMatchObject({
      state: 'failed', accepting: false, handleOpen: false,
      writtenEntries: 1, droppedEntries: 2, droppedBytes: 14,
      pendingBytes: 0, pendingEntries: 0, firstError: { code: 'ENOSPC' },
      lastError: { code: 'ENOSPC' }, errorCount: 1,
      fileBytes: failRollback ? 5 : 3,
      rollbackFailures: failRollback ? 1 : 0
    });
    if (failRollback) {
      expect(writer.getStatus().lastRollbackError.code).toBe('EIO');
      expect(warn.mock.calls[0][0]).toContain('repair the log tail');
    } else {
      expect(writer.getStatus().lastRollbackError).toBeNull();
    }
    expect(writer.write('later\n')).toBe(false);
    await expect(writer.close()).resolves.toMatchObject({ state: 'failed', droppedEntries: 3, closeComplete: true });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  test('rolls back unreported partial bytes in an existing log before a new owner appends', async () => {
    const existing = 'saved 💡\n';
    const start = Buffer.byteLength(existing);
    const positions = [];
    const rollbackSizes = [];
    const io = {
      ...fs,
      open: async (...args) => {
        const handle = await fs.open(...args);
        return {
          stat: () => handle.stat(), close: () => handle.close(),
          truncate: size => { rollbackSizes.push(size); return handle.truncate(size); },
          write: async (buffer, offset, length, position) => {
            positions.push(position);
            await handle.write(buffer, offset, Math.min(2, length), position);
            // I/O may change disk contents and then reject without reporting
            // bytesWritten. Rollback must still target the pre-record EOF.
            throw diskError('ENOSPC');
          }
        };
      }
    };
    const writer = makeWriter({ fs: io });
    await fs.mkdir(path.dirname(writer.filePath), { recursive: true });
    await fs.writeFile(writer.filePath, existing);
    writer.write('broken\n');
    writer.write('queued\n');
    await expect(writer.close()).resolves.toMatchObject({
      state: 'failed', closeComplete: true, handleOpen: false,
      fileBytes: start, writtenEntries: 0, droppedEntries: 2,
      pendingBytes: 0, pendingEntries: 0, rollbackFailures: 0,
      firstError: { code: 'ENOSPC' }
    });
    expect(positions).toEqual([start]);
    expect(rollbackSizes).toEqual([start]);
    expect(await fs.readFile(writer.filePath, 'utf8')).toBe(existing);

    // The previous owner is fully closed; never open concurrent writers.
    const replacement = makeWriter();
    replacement.write('recovered\n');
    await expect(replacement.close()).resolves.toMatchObject({ state: 'closed', writtenEntries: 1, errorCount: 0 });
    expect(await fs.readFile(writer.filePath, 'utf8')).toBe(existing + 'recovered\n');
  });

  test.each(['unlink', 'rename'])('rotation %s failure preserves the active log and stops further writes', async operation => {
    const io = { ...fs, [operation]: jest.fn().mockRejectedValue(diskError('EPERM')) };
    const writer = makeWriter({ fs: io, maxFileBytes: 8 });
    writer.write('first\n');
    await writer.flush();
    writer.write('last\n');
    await writer.close();
    expect(await fs.readFile(writer.filePath, 'utf8')).toBe('first\n');
    expect(writer.getStatus()).toMatchObject({
      state: 'failed', handleOpen: false, writtenEntries: 1, droppedEntries: 1,
      firstError: { code: 'EPERM' }, fileBytes: 6
    });
  });

  test('close rejection is visible in status instead of rejecting an ignored promise', async () => {
    const close = jest.fn().mockRejectedValue(diskError('EIO'));
    const io = {
      mkdir: jest.fn().mockResolvedValue(),
      open: jest.fn().mockResolvedValue({
        stat: jest.fn().mockResolvedValue({ size: 0 }),
        write: jest.fn().mockResolvedValue({ bytesWritten: 2 }),
        close
      })
    };
    const writer = makeWriter({ fs: io });
    writer.write('x\n');
    await expect(writer.close()).resolves.toMatchObject({
      state: 'failed', closeComplete: true, handleOpen: true,
      writtenEntries: 1, pendingBytes: 0, firstError: { code: 'EIO' }
    });
    expect(close).toHaveBeenCalledTimes(1);
  });

  test('rotation never renames or reopens if the previous handle failed to close', async () => {
    const io = {
      mkdir: jest.fn().mockResolvedValue(),
      open: jest.fn().mockResolvedValue({
        stat: jest.fn().mockResolvedValue({ size: 7 }),
        close: jest.fn().mockRejectedValue(diskError('EIO'))
      }),
      unlink: jest.fn(),
      rename: jest.fn()
    };
    const writer = makeWriter({ fs: io, maxFileBytes: 8 });
    writer.write('x\n');
    await writer.close();
    expect(io.open).toHaveBeenCalledTimes(1);
    expect(io.unlink).not.toHaveBeenCalled();
    expect(io.rename).not.toHaveBeenCalled();
    expect(writer.getStatus()).toMatchObject({ state: 'failed', handleOpen: true, droppedEntries: 1, rotations: 0 });
  });

  test('reopen failure after rotation leaves a complete bounded backup', async () => {
    let opens = 0;
    const io = {
      ...fs,
      open: (...args) => ++opens === 1 ? fs.open(...args) : Promise.reject(diskError('ENOSPC'))
    };
    const writer = makeWriter({ fs: io, maxFileBytes: 8 });
    writer.write('first\n');
    await writer.flush();
    writer.write('last\n');
    await writer.close();
    expect(await fs.readFile(writer.backupPath, 'utf8')).toBe('first\n');
    await expect(fs.stat(writer.filePath)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(writer.getStatus()).toMatchObject({
      state: 'failed', handleOpen: false, fileBytes: 0, rotations: 1,
      writtenEntries: 1, droppedEntries: 1, firstError: { code: 'ENOSPC' }
    });
  });

  test('a zero-progress write fails rather than spinning forever', async () => {
    const write = jest.fn().mockResolvedValue({ bytesWritten: 0 });
    const truncate = jest.fn().mockResolvedValue();
    const io = {
      mkdir: jest.fn().mockResolvedValue(),
      open: jest.fn().mockResolvedValue({
        stat: jest.fn().mockResolvedValue({ size: 0 }), write, truncate,
        close: jest.fn().mockResolvedValue()
      })
    };
    const writer = makeWriter({ fs: io });
    writer.write('x\n');
    await writer.close();
    expect(write).toHaveBeenCalledTimes(1);
    expect(truncate).toHaveBeenCalledWith(0);
    expect(writer.getStatus()).toMatchObject({ state: 'failed', firstError: { code: 'EIO' }, droppedEntries: 1 });
  });

  test.each([false, true])('requires a separate legacy archive without modifying oversized active data or backup (backup=%s)', async hasBackup => {
    const io = { ...fs, unlink: jest.fn(fs.unlink), rename: jest.fn(fs.rename) };
    const warn = jest.fn();
    const writer = makeWriter({ fs: io, maxFileBytes: 8, warn });
    await fs.mkdir(path.dirname(writer.filePath), { recursive: true });
    await fs.writeFile(writer.filePath, 'legacy oversized data\n');
    if (hasBackup) await fs.writeFile(writer.backupPath, 'previous legacy backup\n');
    writer.write('x\n');
    await writer.close();
    expect(await fs.readFile(writer.filePath, 'utf8')).toBe('legacy oversized data\n');
    if (hasBackup) {
      expect(await fs.readFile(writer.backupPath, 'utf8')).toBe('previous legacy backup\n');
    } else {
      await expect(fs.stat(writer.backupPath)).rejects.toMatchObject({ code: 'ENOENT' });
    }
    expect(io.unlink).not.toHaveBeenCalled();
    expect(io.rename).not.toHaveBeenCalled();
    expect(writer.getStatus()).toMatchObject({
      state: 'failed', handleOpen: false, closeComplete: true,
      firstError: { code: 'ELOGSIZE', message: expect.stringContaining('separate archive (not .old)') },
      writtenEntries: 0, droppedEntries: 1, rotations: 0
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('separate archive (not .old)');
  });

  test('warning sinks cannot recurse or throw back into the writer', async () => {
    let writer;
    const warn = jest.fn(() => {
      writer.write('reentrant\n');
      throw new Error('Diagnostic sink failed');
    });
    writer = makeWriter({ maxPendingBytes: 4, warn });
    writer.write('abc\n');
    expect(() => writer.write('no\n')).not.toThrow();
    await writer.close();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(writer.getStatus()).toMatchObject({ droppedEntries: 2, writtenEntries: 1, errorCount: 0 });
  });

  test('also contains rejected promises from a diagnostic sink', async () => {
    const warn = jest.fn().mockRejectedValue(new Error('Async diagnostic failed'));
    const writer = makeWriter({ maxPendingBytes: 4, warn });
    writer.write('abc\n');
    writer.write('no\n');
    await writer.close();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(writer.getStatus().writtenEntries).toBe(1);
  });

  test('engineLogger retains text/session formatting and forwards awaitable close/status', async () => {
    // Redirect its constructor before importing it; it NEVER opens LOG_FILE.
    jest.doMock('../src/logging/BoundedLogWriter', () => function TestWriter(options) {
      return makeWriter({ ...options, filePath: path.join(dir, 'engine-test.log') });
    });
    jest.isolateModules(() => { engineLogger = require('../src/engine/engineLogger'); });
    engineLogger.log('TEST', 'message', { ok: true });
    const closing = engineLogger.close();
    expect(engineLogger.close()).toBe(closing);
    await closing;
    const text = await fs.readFile(path.join(dir, 'engine-test.log'), 'utf8');
    expect(text.match(/ENGINE SESSION STARTED:/g)).toHaveLength(1);
    expect(text.match(/ENGINE SESSION ENDED:/g)).toHaveLength(1);
    expect(text).toMatch(/\[\d{4}-\d{2}-\d{2}T[^\]]+\] \[[^\]]+\] \[TEST\] message \| \{"ok":true\}\n/);
    expect(engineLogger.getWriterStatus()).toMatchObject({ state: 'closed', writtenEntries: 3, errorCount: 0 });
    engineLogger.log('TEST', 'after close');
    expect(engineLogger.getWriterStatus().drops.closed).toBe(1);
    expect(await fs.readFile(path.join(dir, 'engine-test.log'), 'utf8')).toBe(text);
  });
});