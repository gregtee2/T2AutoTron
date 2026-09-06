/**
 * Shared camera configuration. Importing this module performs no file I/O.
 * load() reads without migrating; initialize() is the application-startup hook.
 * Tests must inject temporary paths/filesystems, never load the user's config.
 */
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const URI_FIELDS = ['snapshotPath', 'rtspPath', 'rtspUrl', 'mjpegPath'];
const LEGACY_PATH = path.join(__dirname, '../../config/cameras.json');
const clone = value => JSON.parse(JSON.stringify(value));
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function defaults() {
    return {
        cameras: [],
        defaultCredentials: { username: '', password: '' },
        subnet: '192.168.1.', rangeStart: 1, rangeEnd: 254
    };
}

function validateConfig(value) {
    // Retain support for the old CameraService's bare-array format.
    const config = Array.isArray(value) ? { cameras: value } : value;
    if (!isRecord(config) || !Array.isArray(config.cameras)) {
        throw new Error('Invalid camera configuration');
    }
    for (const camera of config.cameras) {
        if (!isRecord(camera) || typeof camera.ip !== 'string' || !camera.ip.trim()) {
            throw new Error('Invalid camera configuration');
        }
        for (const field of ['name', 'username', 'password', ...URI_FIELDS]) {
            if (camera[field] !== undefined &&
                !(URI_FIELDS.includes(field) && camera[field] === null) &&
                typeof camera[field] !== 'string') {
                throw new Error('Invalid camera configuration');
            }
        }
    }
    const credentials = config.defaultCredentials;
    if (credentials !== undefined && (!isRecord(credentials) ||
        ['username', 'password'].some(field => credentials[field] !== undefined &&
            typeof credentials[field] !== 'string'))) {
        throw new Error('Invalid camera configuration');
    }
    return clone({ ...defaults(), ...config, defaultCredentials: {
        ...defaults().defaultCredentials, ...credentials
    } });
}

function resolveCameraConfigPaths({ env = process.env, legacyPath = LEGACY_PATH,
    fsImpl = fs, pathImpl = path } = {}) {
    const graphDir = env.GRAPH_SAVE_PATH && pathImpl.resolve(env.GRAPH_SAVE_PATH);
    let current;
    if (env.CAMERA_CONFIG_PATH) {
        const explicit = pathImpl.resolve(env.CAMERA_CONFIG_PATH);
        let isDirectory;
        try {
            isDirectory = fsImpl.statSync(explicit).isDirectory();
        } catch (error) {
            if (error.code !== 'ENOENT') throw new Error('Cannot access camera configuration');
            // Existing extensionless files and directories with dots work via stat.
            isDirectory = /[\\/]$/.test(env.CAMERA_CONFIG_PATH) || !pathImpl.extname(explicit);
        }
        current = isDirectory ? pathImpl.join(explicit, 'cameras.json') : explicit;
    } else if (env.SUPERVISOR_TOKEN) {
        current = graphDir
            ? pathImpl.join(pathImpl.dirname(graphDir), 'config', 'cameras.json')
            : pathImpl.join('/data', 'config', 'cameras.json');
    } else {
        // A desktop graph-directory override must not move its camera settings.
        current = legacyPath;
    }
    return {
        current,
        candidates: [...new Set([current,
            ...(graphDir ? [pathImpl.join(graphDir, 'cameras.json')] : []), legacyPath])]
    };
}

function redactUri(value) {
    if (typeof value !== 'string') return value;
    return value
        .replace(/(\/\/)[^/?#@\s]+@/g, '$1redacted:redacted@')
        .replace(/([?&](?:user(?:name)?|usr|password|passwd|pwd|pass|token|access_token|api_?key|auth)=)[^&#\s]*/gi, '$1redacted');
}

function isRedactionPlaceholder(value) {
    if (typeof value !== 'string') return false;
    try { value = decodeURIComponent(value); } catch { /* May contain literal %. */ }
    return /^(?:redacted|\[redacted\]|<redacted>|\*{3,})$/i.test(value);
}

function hasRedaction(value) {
    if (typeof value !== 'string') return false;
    if (isRedactionPlaceholder(value)) return true;
    // Check credential slots, not substrings of genuine passwords or path names.
    const userInfo = [...value.matchAll(/\/\/([^/?#@\s]+)@/g)]
        .flatMap(match => match[1].split(':'));
    const queryValues = [...value.matchAll(/[?&][^=&#]*=([^&#]*)/g)].map(match => match[1]);
    return [...userInfo, ...queryValues].some(isRedactionPlaceholder);
}

function mergeCameraUpdate(existing, update) {
    if (!isRecord(update)) throw new Error('Invalid camera settings');
    const changes = { ...update };
    delete changes.hasPassword; // Response-only metadata, never persisted.
    for (const field of URI_FIELDS) {
        const value = changes[field];
        if (value === undefined) continue;
        const original = existing?.[field];
        // Also recognize the exact redacted form emitted by the previous API.
        const previousRedaction = typeof original === 'string' ? original
            .replace(/(\/\/)[^/@\s]+:[^/@\s]+@/g, '$1redacted:redacted@')
            .replace(/([?&](?:password|passwd|pwd|pass|token)=)[^&#]*/gi, '$1redacted') : original;
        if (typeof original === 'string' && value !== original &&
            (value === redactUri(original) || value === previousRedaction)) {
            delete changes[field];
        } else if (hasRedaction(value)) {
            throw new Error('Replace redacted connection settings with real values');
        }
    }
    if (isRedactionPlaceholder(changes.password)) throw new Error('Invalid camera password');
    return { ...existing, ...changes };
}

// Used for dynamic discovery/worker results as well as saved cameras. Never
// forward dependency error text: ffmpeg/curl errors can contain full credentials.
function redactResponse(value) {
    if (typeof value === 'string') return redactUri(value);
    if (Array.isArray(value)) return value.map(redactResponse);
    if (!isRecord(value)) return value;
    return Object.fromEntries(Object.entries(value).flatMap(([key, entry]) => {
        if (/^(?:password|passwd|pwd|pass|token|access_token|api_?key|authorization)$/i.test(key)) {
            return key === 'password' ? [['hasPassword', Boolean(entry)]] : [];
        }
        if (/^(?:error|lastError)$/i.test(key) && entry) return [[key, 'Camera operation failed']];
        return [[key, redactResponse(entry)]];
    }));
}

function createCameraConfigStore(options = {}) {
    const fsImpl = options.fsImpl || fs;
    const logger = options.logger || console;
    let paths;
    let persisted;
    let sourcePath;
    let startupInitialized = false;

    function getPaths() {
        if (!paths) paths = resolveCameraConfigPaths(options);
        return paths;
    }

    function load() {
        if (persisted) return clone(persisted);
        try {
            for (const candidate of getPaths().candidates) {
                let text;
                try {
                    text = fsImpl.readFileSync(candidate, 'utf8');
                } catch (error) {
                    if (error.code === 'ENOENT') continue;
                    throw error;
                }
                // Invalid/unreadable higher-priority files fail closed. Do not
                // silently replace them with stale credentials or empty defaults.
                persisted = validateConfig(JSON.parse(text));
                sourcePath = candidate;
                return clone(persisted);
            }
            persisted = defaults();
            return clone(persisted);
        } catch {
            logger.error('[Cameras] Could not read camera configuration');
            throw new Error('Could not read camera configuration');
        }
    }

    function save(config) {
        load(); // Refuse to overwrite an unreadable configuration.
        const next = validateConfig(config);
        for (const camera of next.cameras) {
            if (URI_FIELDS.some(field => hasRedaction(camera[field])) || isRedactionPlaceholder(camera.password)) {
                throw new Error('Redacted values cannot be saved');
            }
        }
        if (isRedactionPlaceholder(next.defaultCredentials.password)) throw new Error('Redacted values cannot be saved');
        const target = getPaths().current;
        const temporaryPath = `${target}.${randomUUID()}.tmp`;
        let created = false;
        try {
            fsImpl.mkdirSync(path.dirname(target), { recursive: true });
            // Exclusive creation and owner-only permissions on platforms that
            // support them. Rename publishes the complete file, never half JSON.
            const fd = fsImpl.openSync(temporaryPath, 'wx', 0o600);
            created = true;
            try {
                fsImpl.writeFileSync(fd, JSON.stringify(next, null, 2), 'utf8');
                fsImpl.fsyncSync(fd);
            } finally {
                fsImpl.closeSync(fd);
            }
            fsImpl.renameSync(temporaryPath, target);
        } catch {
            if (created) {
                try { fsImpl.unlinkSync(temporaryPath); } catch { /* Best effort. */ }
            }
            logger.error('[Cameras] Could not save camera configuration');
            throw new Error('Could not save camera configuration');
        }
        // Callers only receive detached copies. A failure leaves the last
        // persisted snapshot intact for BOTH the router and CameraService.
        persisted = next;
        sourcePath = target;
        return clone(persisted);
    }

    function initialize() {
        const config = load();
        if (!startupInitialized) {
            startupInitialized = true;
            if (sourcePath && sourcePath !== getPaths().current) {
                try { save(config); } catch {
                    // Keep reading the legacy snapshot; never delete the old file.
                    logger.warn('[Cameras] Configuration migration failed; previous configuration retained');
                }
            }
        }
        return load();
    }

    return { load, save, initialize, getPaths };
}

const cameraConfigStore = createCameraConfigStore();
module.exports = { cameraConfigStore, createCameraConfigStore, resolveCameraConfigPaths,
    validateConfig, mergeCameraUpdate, redactResponse, redactUri, URI_FIELDS };