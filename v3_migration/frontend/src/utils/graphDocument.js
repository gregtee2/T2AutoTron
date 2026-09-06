export const CURRENT_GRAPH_SCHEMA_VERSION = 1;

// The revision belongs to this tab's document, not another tab's last save.
let projectId = null;
let revision = 0;

export function getProjectId() {
    projectId ||= globalThis.crypto?.randomUUID?.() ||
        `project-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return projectId;
}

export function getGraphRevision() {
    return revision;
}

export function recordGraphSaveResponse(response, snapshot) {
    if (!Number.isSafeInteger(response?.revision) || response.revision < 0) return;
    revision = response.revision;
    if (typeof response.projectId === 'string' && response.projectId) projectId = response.projectId;
    if (snapshot) {
        const saved = { ...snapshot, revision, baseRevision: revision, projectId: getProjectId() };
        try { localStorage.setItem('saved-graph', JSON.stringify(saved)); } catch { /* Optional browser backup. */ }
    }
}

export function normalizeGraphDocument(graphData) {
    if (!graphData || typeof graphData !== 'object' || Array.isArray(graphData) || !Array.isArray(graphData.nodes)) {
        throw new Error('Graph document must contain a nodes array');
    }
    if (graphData.connections !== undefined && !Array.isArray(graphData.connections)) {
        throw new Error('Graph connections must be an array');
    }
    const version = graphData.schemaVersion ?? 0;
    if (!Number.isSafeInteger(version) || version < 0 || version > CURRENT_GRAPH_SCHEMA_VERSION) {
        throw new Error(`Unsupported graph schema version: ${version}`);
    }
    for (const field of ['revision', 'baseRevision']) {
        if (graphData[field] !== undefined && (!Number.isSafeInteger(graphData[field]) || graphData[field] < 0)) {
            throw new Error(`Invalid graph ${field}`);
        }
    }

    return {
        ...graphData,
        schemaVersion: CURRENT_GRAPH_SCHEMA_VERSION,
        projectId: typeof graphData.projectId === 'string' && graphData.projectId.trim()
            ? graphData.projectId.trim()
            : getProjectId(),
        revision: graphData.revision ?? 0,
        baseRevision: graphData.baseRevision ?? graphData.revision ?? revision,
        connections: graphData.connections || []
    };
}

export function createGraphDocument({ nodes, connections, viewport, ...metadata }) {
    return normalizeGraphDocument({
        ...metadata,
        schemaVersion: CURRENT_GRAPH_SCHEMA_VERSION,
        projectId: getProjectId(),
        revision,
        baseRevision: revision,
        nodes,
        connections: connections ?? [],
        viewport: viewport || { x: 0, y: 0, k: 1 }
    });
}

export function graphContentKey(graph) {
    return JSON.stringify({ nodes: graph.nodes, connections: graph.connections, viewport: graph.viewport });
}