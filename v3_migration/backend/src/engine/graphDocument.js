const crypto = require('crypto');

// Document format version, deliberately independent of the application release.
const CURRENT_SCHEMA_VERSION = 1;

function isInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function invalidGraph(message) {
  const error = new Error(message);
  error.code = 'INVALID_GRAPH_DOCUMENT';
  error.statusCode = 400;
  return error;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isId(value) {
  // Older imports may use positive numeric IDs. References must match exactly.
  return isText(value) || (Number.isSafeInteger(value) && value > 0);
}

function validateGraphShape(document) {
  if (!isObject(document)) throw invalidGraph('Graph document must be an object');
  if (!Array.isArray(document.nodes)) throw invalidGraph('Graph document must contain a nodes array');
  if (document.connections !== undefined && !Array.isArray(document.connections)) {
    throw invalidGraph('Graph document connections must be an array');
  }

  const nodeIds = new Set();
  for (const node of document.nodes) {
    if (!isObject(node) || !isId(node.id)) {
      throw invalidGraph('Every node must be an object with a non-empty string or positive integer id');
    }
    if (nodeIds.has(node.id)) throw invalidGraph(`Duplicate node id: ${node.id}`);
    nodeIds.add(node.id);
    // Accept plugin/UI-only descriptors without consulting the runtime registry.
    if (![node.name, node.type, node.label].some(isText)) {
      throw invalidGraph(`Node ${node.id} must have a name, type or label`);
    }
    for (const key of ['name', 'type', 'label']) {
      if (node[key] !== undefined && !isText(node[key])) {
        throw invalidGraph(`Node ${node.id} ${key} must be a non-empty string`);
      }
    }
    if ((node.properties !== undefined && !isObject(node.properties)) ||
        (node.data !== undefined && !isObject(node.data)) ||
        (node.data?.properties !== undefined && !isObject(node.data.properties))) {
      throw invalidGraph(`Node ${node.id} data and properties must be objects`);
    }
  }

  const connectionIds = new Set();
  for (const connection of document.connections || []) {
    if (!isObject(connection) || !nodeIds.has(connection.source) || !nodeIds.has(connection.target)) {
      throw invalidGraph('Every connection must reference existing source and target node ids');
    }
    for (const key of ['sourceOutput', 'targetInput']) {
      if (!isText(connection[key]) || ['__proto__', 'constructor', 'prototype'].includes(connection[key])) {
        throw invalidGraph(`Connection ${key} must be a non-empty, non-reserved socket name`);
      }
    }
    if (connection.id !== undefined) {
      if (!isId(connection.id) || connectionIds.has(connection.id)) {
        throw invalidGraph('Connection ids must be valid and unique when supplied');
      }
      connectionIds.add(connection.id);
    }
  }
}

function getRevision(document) {
  return isInteger(document?.revision) ? document.revision : 0;
}

function normalizeGraphDocument(document) {
  validateGraphShape(document);
  if (document.schemaVersion !== undefined &&
      (!isInteger(document.schemaVersion) || document.schemaVersion > CURRENT_SCHEMA_VERSION)) {
    throw invalidGraph(`Unsupported graph schemaVersion; maximum supported is ${CURRENT_SCHEMA_VERSION}`);
  }
  for (const key of ['revision', 'baseRevision']) {
    if (document[key] !== undefined && !isInteger(document[key])) {
      throw invalidGraph(`Graph ${key} must be a non-negative safe integer`);
    }
  }
  if (document.projectId !== undefined && !isText(document.projectId)) {
    throw invalidGraph('Graph projectId must be a non-empty string');
  }

  return {
    ...document,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    projectId: typeof document.projectId === 'string' && document.projectId.trim()
      ? document.projectId.trim()
      : crypto.randomUUID(),
    revision: getRevision(document),
    connections: document.connections || []
  };
}

function createConflictError(expectedRevision, actualRevision) {
  const error = new Error(
    `Graph revision conflict: expected ${expectedRevision}, current ${actualRevision}`
  );
  error.code = 'GRAPH_REVISION_CONFLICT';
  error.statusCode = 409;
  error.expectedRevision = expectedRevision;
  error.actualRevision = actualRevision;
  return error;
}

function prepareGraphForSave(document, currentDocument = null) {
  const normalized = normalizeGraphDocument(document);
  // Invalid stored metadata must not silently reset the conflict counter to zero.
  const current = currentDocument === null ? null : normalizeGraphDocument(currentDocument);
  const currentRevision = getRevision(current);
  const hasExpectedRevision = Object.prototype.hasOwnProperty.call(document, 'baseRevision');

  // Explicit contract: embedded revision describes the imported document, NOT
  // permission to replace the active document. Clients must send baseRevision.
  if (currentRevision > 0 && !hasExpectedRevision) {
    const error = new Error('baseRevision is required to replace a stored graph; read the current revision first');
    error.code = 'GRAPH_REVISION_REQUIRED';
    error.statusCode = 428;
    error.actualRevision = currentRevision;
    throw error;
  }
  if (hasExpectedRevision) {
    if (!isInteger(document.baseRevision)) {
      throw invalidGraph('Graph baseRevision must be a non-negative safe integer');
    }
    if (document.baseRevision !== currentRevision) {
      throw createConflictError(document.baseRevision, currentRevision);
    }
  }

  if (currentRevision === Number.MAX_SAFE_INTEGER) {
    throw invalidGraph('Graph revision limit reached');
  }
  const persisted = { ...normalized };
  delete persisted.baseRevision;
  if (document.projectId === undefined && current?.projectId) persisted.projectId = current.projectId;
  persisted.revision = currentRevision + 1;
  persisted.savedAt = new Date().toISOString();

  return persisted;
}

module.exports = {
  CURRENT_SCHEMA_VERSION,
  getRevision,
  normalizeGraphDocument,
  prepareGraphForSave
};