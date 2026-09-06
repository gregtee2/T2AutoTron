const crypto = require('crypto');
const path = require('path');
const fs = require('fs').promises;
const { normalizeGraphDocument } = require('./graphDocument');

function storageError(message, statusCode, code) {
  return Object.assign(new Error(message), { statusCode, code });
}

function graphFilename(filename) {
  if (typeof filename !== 'string' || !filename.trim()) {
    throw storageError('A non-empty graph filename is required', 400, 'INVALID_GRAPH_FILENAME');
  }
  // Validate instead of silently rewriting another filename. Strip the extension
  // BEFORE checking the stem, so foo.json never becomes foojson.json.
  const stem = filename.trim().replace(/\.json$/i, '');
  if (stem.toLowerCase() === 'cameras') {
    throw storageError('Camera configuration is not a graph file', 403, 'GRAPH_PATH_DENIED');
  }
  if (!/^[a-zA-Z0-9_-](?:[a-zA-Z0-9_ -]*[a-zA-Z0-9_-])?$/.test(stem) ||
      stem.length > 200 || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(stem)) {
    throw storageError('Invalid graph filename; use letters, numbers, spaces, underscores or hyphens', 400, 'INVALID_GRAPH_FILENAME');
  }
  return `${stem}.json`;
}

function assertContained(root, candidate) {
  const relative = path.relative(root, candidate);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw storageError('Access denied: graph path is outside the configured directory', 403, 'GRAPH_PATH_DENIED');
  }
}

async function resolveGraphPath(graphPath, graphsDir, { allowMissing = false } = {}) {
  const root = path.resolve(graphsDir);
  const candidate = path.isAbsolute(graphPath) ? path.resolve(graphPath) : path.resolve(root, graphPath);
  // A previous version placed camera credentials alongside graphs. Preserve
  // that legacy file for migration, but never expose or overwrite it as a graph.
  if (path.basename(candidate).toLowerCase() === 'cameras.json') {
    throw storageError('Camera configuration is not a graph file', 403, 'GRAPH_PATH_DENIED');
  }
  assertContained(root, candidate);
  const realRoot = await fs.realpath(root);
  const realParent = await fs.realpath(path.dirname(candidate));
  if (realParent !== realRoot) assertContained(realRoot, realParent);
  const destination = path.join(realParent, path.basename(candidate));
  try {
    const stats = await fs.lstat(destination);
    // Reject final symlinks (including broken links) for reads AND writes. A
    // directory link inside the root is allowed only if realpath stays inside.
    if (stats.isSymbolicLink()) {
      throw storageError('Access denied: graph files cannot be symbolic links', 403, 'GRAPH_PATH_DENIED');
    }
    if (!stats.isFile()) throw storageError('Graph path must refer to a file', 400, 'INVALID_GRAPH_PATH');
    const realPath = await fs.realpath(destination);
    assertContained(realRoot, realPath);
    return realPath;
  } catch (error) {
    if (allowMissing && error.code === 'ENOENT') return destination;
    throw error;
  }
}

async function readStoredGraph(filePath, graphsDir) {
  try {
    const resolved = await resolveGraphPath(filePath, graphsDir);
    const document = JSON.parse(await fs.readFile(resolved, 'utf8'));
    return normalizeGraphDocument(document);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    if (error instanceof SyntaxError) {
      throw storageError('Stored graph contains invalid JSON', 400, 'INVALID_GRAPH_DOCUMENT');
    }
    throw error;
  }
}

async function writeJsonAtomic(filePath, content) {
  // Same directory for atomic single-file replacement; NOT a multi-file
  // transaction. File data is synced, but directory/power-loss durability is
  // platform-dependent (no portable directory fsync on Windows).
  const temporaryPath = `${filePath}.${crypto.randomUUID()}.tmp`;
  let handle;
  let created = false;
  try {
    handle = await fs.open(temporaryPath, 'wx', 0o600);
    created = true;
    await handle.writeFile(content, 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.rename(temporaryPath, filePath);
  } catch (error) {
    // Cleanup failures must never hide the original write/sync/rename error.
    const cleanupErrors = [];
    if (handle) {
      try { await handle.close(); } catch (cleanupError) { cleanupErrors.push(cleanupError.message); }
    }
    if (created) {
      try { await fs.unlink(temporaryPath); } catch (cleanupError) {
        if (cleanupError.code !== 'ENOENT') cleanupErrors.push(cleanupError.message);
      }
    }
    if (cleanupErrors.length) error.cleanupErrors = cleanupErrors;
    throw error;
  }
}

module.exports = { graphFilename, resolveGraphPath, readStoredGraph, writeJsonAtomic };