const fs = require('fs');
const path = require('path');
const { Console } = require('console');

// Bypass the application's console overrides: a disk failure must never log
// through another file logger. Console also handles stderr errors (e.g. EPIPE).
const diagnostics = new Console({ stdout: process.stderr, stderr: process.stderr, ignoreErrors: true });

/**
 * Single-owner, asynchronous append/rotate writer. No synchronous disk I/O.
 * write() returns admission, NOT persistence; inspect status or await flush/close.
 * The byte/entry limits include the in-flight record. Whole records are rejected
 * on overload/oversize; they are never split across files or silently truncated.
 *
 * I/O failures are fail-stop (restart/recreate after fixing the disk). This avoids
 * retrying a possibly partial record. close() always resolves to status, even on
 * failure, so existing fire-and-forget callers cannot cause unhandled rejections.
 * One writer/process must exclusively own the active file and its .old backup.
 * No other writer or external rotation/truncation may modify them while open;
 * appends use explicit byte positions, not OS append mode (see _open).
 * Existing oversized active files deliberately fail-stop with ELOGSIZE, leaving
 * both files untouched. Move the active file to a separate, non-rotating archive
 * before restarting. Using .old would silently delete legacy data on the next
 * rotation; automatically accumulating archives would bypass bounded retention.
 * An existing .old is not modified until rotation replaces it. If rollback
 * fails, repair the incomplete tail before restarting/reusing the active log.
 * close() drains OS writes, not fsync; it is not a power-loss durability promise.
 */
class BoundedLogWriter {
  constructor({
    filePath,
    maxFileBytes,
    maxPendingBytes = 1024 * 1024,
    maxPendingEntries = 2048,
    fs: io = fs.promises,
    warn = message => diagnostics.warn(message),
    now = Date.now,
    warnIntervalMs = 60000
  }) {
    if (typeof filePath !== 'string' || !filePath) throw new TypeError('filePath is required');
    for (const [name, value] of Object.entries({ maxFileBytes, maxPendingBytes, maxPendingEntries })) {
      if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${name} must be a positive integer`);
    }
    if (!Number.isFinite(warnIntervalMs) || warnIntervalMs < 0) throw new RangeError('Invalid warnIntervalMs');
    this.filePath = filePath;
    this.backupPath = `${filePath}.old`;
    this.maxFileBytes = maxFileBytes;
    this.maxPendingBytes = maxPendingBytes;
    this.maxPendingEntries = maxPendingEntries;
    this._fs = io;
    this._warn = warn;
    this._now = now;
    this._warnIntervalMs = warnIntervalMs;
    this._lastWarningAt = -Infinity;
    this._warningActive = false;
    this._queue = [];
    this._pendingBytes = 0;
    this._peakPendingBytes = 0;
    this._handle = null;
    this._fileBytes = 0;
    this._running = false;
    this._closing = false;
    this._closed = false;
    this._failed = false;
    this._drainPromise = Promise.resolve();
    this._closePromise = null;
    this._acceptedEntries = 0;
    this._writtenEntries = 0;
    this._writtenBytes = 0;
    this._rotations = 0;
    this._droppedEntries = 0;
    this._droppedBytes = 0;
    this._drops = { queueFull: 0, oversized: 0, failed: 0, closed: 0 };
    this._errorCount = 0;
    this._firstError = null;
    this._lastError = null;
    this._rollbackFailures = 0;
    this._lastRollbackError = null;
  }

  write(record) {
    if (typeof record !== 'string' && !Buffer.isBuffer(record)) {
      throw new TypeError('Log records must be strings or Buffers');
    }
    const bytes = Buffer.byteLength(record);
    if (this._closing) return this._drop(1, bytes, 'closed');
    if (this._failed) return this._drop(1, bytes, 'failed');
    if (bytes > this.maxFileBytes) return this._drop(1, bytes, 'oversized');
    if (this._pendingBytes + bytes > this.maxPendingBytes || this._queue.length >= this.maxPendingEntries) {
      return this._drop(1, bytes, 'queueFull');
    }

    // Copy only AFTER admission, including Buffers so callers cannot mutate a
    // queued record. Entry count also bounds overhead for tiny/empty records.
    this._queue.push(Buffer.from(record));
    this._pendingBytes += bytes;
    this._peakPendingBytes = Math.max(this._peakPendingBytes, this._pendingBytes);
    this._acceptedEntries++;
    if (!this._running) {
      this._running = true;
      this._drainPromise = this._drain();
    }
    return true;
  }

  getStatus() {
    return {
      filePath: this.filePath,
      state: this._failed ? 'failed' : this._closed ? 'closed' : this._closing ? 'closing' : this._running ? 'writing' : 'idle',
      accepting: !this._closing && !this._failed,
      closeComplete: this._closed,
      handleOpen: this._handle !== null,
      maxFileBytes: this.maxFileBytes,
      maxPendingBytes: this.maxPendingBytes,
      maxPendingEntries: this.maxPendingEntries,
      fileBytes: this._fileBytes,
      pendingBytes: this._pendingBytes,
      pendingEntries: this._queue.length,
      peakPendingBytes: this._peakPendingBytes,
      acceptedEntries: this._acceptedEntries,
      writtenEntries: this._writtenEntries,
      writtenBytes: this._writtenBytes,
      rotations: this._rotations,
      droppedEntries: this._droppedEntries,
      droppedBytes: this._droppedBytes,
      drops: { ...this._drops },
      errorCount: this._errorCount,
      firstError: this._firstError && { ...this._firstError },
      lastError: this._lastError && { ...this._lastError },
      rollbackFailures: this._rollbackFailures,
      lastRollbackError: this._lastRollbackError && { ...this._lastRollbackError }
    };
  }

  async flush() {
    await this._drainPromise;
    return this.getStatus();
  }

  close() {
    if (!this._closePromise) {
      this._closing = true;
      this._closePromise = this._finishClose();
    }
    return this._closePromise;
  }

  async _finishClose() {
    await this._drainPromise;
    try {
      await this._closeHandle();
    } catch (error) {
      this._fail(error);
    }
    this._closed = true;
    return this.getStatus();
  }

  async _drain() {
    try {
      while (this._queue.length) {
        const record = this._queue[0];
        await this._writeRecord(record);
        this._queue.shift();
        this._pendingBytes -= record.length;
        this._writtenEntries++;
        this._writtenBytes += record.length;
      }
    } catch (error) {
      this._fail(error);
      // The head (possibly partially written) is still counted in this queue.
      this._drop(this._queue.length, this._pendingBytes, 'failed');
      this._queue = [];
      this._pendingBytes = 0;
      try {
        await this._closeHandle();
      } catch (closeError) {
        this._fail(closeError);
      }
    } finally {
      this._running = false;
    }
  }

  async _open() {
    await this._fs.mkdir(path.dirname(this.filePath), { recursive: true });
    // Windows append-only handles ('a'/O_APPEND) may lack FILE_WRITE_DATA,
    // which truncate needs for rollback. O_WRONLY | O_CREAT grants write access
    // without truncating existing data or requiring read permission. Since this
    // is NOT append mode, every write below must specify the known EOF position.
    this._handle = await this._fs.open(this.filePath, fs.constants.O_WRONLY | fs.constants.O_CREAT);
    this._fileBytes = (await this._handle.stat()).size;
    if (this._fileBytes > this.maxFileBytes) {
      const error = new Error('Existing log exceeds maxFileBytes; move it to a separate archive (not .old) before restarting the logger');
      error.code = 'ELOGSIZE';
      throw error;
    }
  }

  async _closeHandle() {
    if (!this._handle) return;
    await this._handle.close();
    this._handle = null;
  }

  async _writeRecord(record) {
    if (!this._handle) await this._open();
    if (this._fileBytes + record.length > this.maxFileBytes) {
      // ALL writes and the handle close finish before renaming (Windows-safe).
      await this._closeHandle();
      try {
        await this._fs.unlink(this.backupPath);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      await this._fs.rename(this.filePath, this.backupPath);
      this._rotations++;
      this._fileBytes = 0;
      await this._open();
    }

    const start = this._fileBytes;
    let offset = 0;
    try {
      while (offset < record.length) {
        const { bytesWritten } = await this._handle.write(record, offset, record.length - offset, start + offset);
        if (!Number.isInteger(bytesWritten) || bytesWritten <= 0 || bytesWritten > record.length - offset) {
          const error = new Error('Log write made invalid progress');
          error.code = 'EIO';
          throw error;
        }
        offset += bytesWritten;
        this._fileBytes += bytesWritten;
      }
    } catch (error) {
      // A partial JSON/text record must not be mistaken for a complete entry.
      // Best effort only: ENOSPC/EIO can prevent rollback too; expose that fact.
      try {
        await this._handle.truncate(start);
        this._fileBytes = start;
      } catch (rollbackError) {
        this._rollbackFailures++;
        this._lastRollbackError = this._errorDetails(rollbackError);
      }
      throw error;
    }
  }

  _errorDetails(error) {
    return { code: error?.code || 'EIO', message: String(error?.message || error).slice(0, 500), at: this._now() };
  }

  _fail(error) {
    this._failed = true;
    this._errorCount++;
    this._lastError = this._errorDetails(error);
    if (!this._firstError) this._firstError = this._lastError;
    this._warning(`file logging stopped (${this._lastError.code}: ${this._lastError.message}); fix the disk and restart`);
  }

  _drop(entries, bytes, reason) {
    this._droppedEntries += entries;
    this._droppedBytes += bytes;
    this._drops[reason] += entries;
    if (entries) this._warning(`records rejected (${reason})`);
    return false;
  }

  _warning(reason) {
    const now = this._now();
    if (this._warningActive || (now >= this._lastWarningAt && now - this._lastWarningAt < this._warnIntervalMs)) return;
    this._lastWarningAt = now;
    this._warningActive = true;
    try {
      const repair = this._rollbackFailures ? ' Partial-record rollback failed; repair the log tail before restarting.' : '';
      const message = `[BoundedLogWriter:${path.basename(this.filePath)}] ${reason}; dropped=${this._droppedEntries} (${this._droppedBytes} bytes), pending=${this._pendingBytes} bytes.${repair} Inspect getWriterStatus().`;
      // Also contain a rejected promise from a custom diagnostic sink.
      Promise.resolve(this._warn(message)).catch(() => {});
    } catch (_) {
      // Never recurse through a logger to report a diagnostic sink failure.
    } finally {
      this._warningActive = false;
    }
  }
}

module.exports = BoundedLogWriter;