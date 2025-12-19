import { nodeRegistry } from './NodeRegistry';
import * as Rete from 'rete';
import * as React from 'react';
import { RefComponent } from 'rete-react-plugin';
import * as luxon from 'luxon';
import sockets from '../sockets';
import { socket } from '../socket';
import { apiUrl, getApiBase } from '../utils/apiBase';

// Expose dependencies globally for plugins
// This allows "Caveman-Simple" plugins to just use window.Rete, window.React, etc.
window.Rete = Rete;
window.React = React;
window.RefComponent = RefComponent;
window.luxon = luxon;
window.nodeRegistry = nodeRegistry;
window.sockets = sockets;
window.socket = socket;

// Expose API helpers for plugins to use (required for HA ingress compatibility)
window.apiUrl = apiUrl;
window.getApiBase = getApiBase;

// Helper function for plugins to make API calls that work through HA ingress
window.apiFetch = async function(path, options = {}) {
    const url = apiUrl(path);
    return fetch(url, options);
};

// Plugin loading state for UI feedback
let loadingState = {
    isLoading: false,
    progress: 0,
    status: 'Ready',
    loadedCount: 0,
    totalCount: 0,
    failedPlugins: [],
    error: null
};

// Callbacks for progress updates
const progressCallbacks = new Set();

export function onPluginProgress(callback) {
    progressCallbacks.add(callback);
    // Immediately send current state
    callback({ ...loadingState });
    return () => progressCallbacks.delete(callback);
}

function updateProgress(updates) {
    loadingState = { ...loadingState, ...updates };
    progressCallbacks.forEach(cb => cb({ ...loadingState }));
}

export function getLoadingState() {
    return { ...loadingState };
}

export async function loadPlugins() {
    updateProgress({ isLoading: true, progress: 0, status: 'Fetching plugin list...', error: null, failedPlugins: [] });
    
    try {
        const response = await fetch(apiUrl('/api/plugins'));
        if (!response.ok) throw new Error('Failed to fetch plugin list');
        
        const plugins = await response.json();
        const total = plugins.length;
        
        // Separate infrastructure plugins (00_*) from regular plugins
        // Infrastructure MUST load first and sequentially (they provide base classes)
        const infraPlugins = plugins.filter(p => p.includes('/00_'));
        const regularPlugins = plugins.filter(p => !p.includes('/00_'));
        
        updateProgress({ totalCount: total, status: `Loading ${infraPlugins.length} infrastructure + ${regularPlugins.length} node plugins...` });

        let loaded = 0;
        
        // Phase 1: Load infrastructure plugins SEQUENTIALLY (they depend on each other)
        for (const pluginUrl of infraPlugins) {
            const pluginName = pluginUrl.split('/').pop().replace('.js', '');
            updateProgress({ status: `Loading ${pluginName}...` });
            
            try {
                await loadScript(apiUrl(pluginUrl));
                loaded++;
                updateProgress({ 
                    loadedCount: loaded, 
                    progress: Math.round((loaded / total) * 100)
                });
            } catch (e) {
                console.error(`[PluginLoader] Failed to load infrastructure ${pluginUrl}`, e);
                loadingState.failedPlugins.push({ name: pluginName, error: e.message });
            }
        }
        
        // Phase 2: Load all regular plugins IN PARALLEL (much faster!)
        updateProgress({ status: `Loading ${regularPlugins.length} node plugins in parallel...` });
        
        const regularResults = await Promise.allSettled(
            regularPlugins.map(async (pluginUrl) => {
                const pluginName = pluginUrl.split('/').pop().replace('.js', '');
                try {
                    await loadScript(apiUrl(pluginUrl));
                    loaded++;
                    updateProgress({ 
                        loadedCount: loaded, 
                        progress: Math.round((loaded / total) * 100)
                    });
                    return { success: true, name: pluginName };
                } catch (e) {
                    console.error(`[PluginLoader] Failed to load ${pluginUrl}`, e);
                    loadingState.failedPlugins.push({ name: pluginName, error: e.message });
                    return { success: false, name: pluginName, error: e.message };
                }
            })
        );
        
        const failCount = loadingState.failedPlugins.length;
        updateProgress({ 
            isLoading: false, 
            progress: 100, 
            status: failCount > 0 
                ? `Loaded ${loaded} plugins (${failCount} failed)` 
                : `Loaded ${loaded} plugins`
        });
        
    } catch (e) {
        console.error('[PluginLoader] Error loading plugins:', e);
        updateProgress({ 
            isLoading: false, 
            error: e.message, 
            status: 'Failed to load plugins'
        });
    }
}

function loadScript(url) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        // Cache-bust plugin scripts so hotfixes (e.g. shared controls) actually load.
        // Without this, browsers/Electron may reuse an old cached plugin and show stale UI.
        const cacheBust = `v=${Date.now()}`;
        script.src = url.includes('?') ? `${url}&${cacheBust}` : `${url}?${cacheBust}`;
        // Note: NOT using async=true - scripts must load sequentially
        // so infrastructure plugins (00_*) load before node plugins
        script.onload = resolve;
        script.onerror = reject;
        document.body.appendChild(script);
    });
}
