import { nodeRegistry } from './NodeRegistry';
import * as Rete from 'rete';
import * as React from 'react';
import { RefComponent } from 'rete-react-plugin';
import * as luxon from 'luxon';
import sockets from '../sockets';
import { socket } from '../socket';

// Expose dependencies globally for plugins
// This allows "Caveman-Simple" plugins to just use window.Rete, window.React, etc.
window.Rete = Rete;
window.React = React;
window.RefComponent = RefComponent;
window.luxon = luxon;
window.nodeRegistry = nodeRegistry;
window.sockets = sockets;
window.socket = socket;

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
        const response = await fetch('/api/plugins');
        if (!response.ok) throw new Error('Failed to fetch plugin list');
        
        const plugins = await response.json();
        const total = plugins.length;
        
        updateProgress({ totalCount: total, status: `Loading ${total} plugins...` });

        let loaded = 0;
        for (const pluginUrl of plugins) {
            const pluginName = pluginUrl.split('/').pop().replace('.js', '');
            updateProgress({ status: `Loading ${pluginName}...` });
            
            try {
                await loadScript(pluginUrl);
                loaded++;
                updateProgress({ 
                    loadedCount: loaded, 
                    progress: Math.round((loaded / total) * 100)
                });
            } catch (e) {
                console.error(`[PluginLoader] Failed to load ${pluginUrl}`, e);
                loadingState.failedPlugins.push({ name: pluginName, error: e.message });
            }
        }
        
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
        script.src = url;
        // Note: NOT using async=true - scripts must load sequentially
        // so infrastructure plugins (00_*) load before node plugins
        script.onload = resolve;
        script.onerror = reject;
        document.body.appendChild(script);
    });
}
