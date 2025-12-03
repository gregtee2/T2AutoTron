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

export async function loadPlugins() {
    try {
        const response = await fetch('/api/plugins');
        if (!response.ok) throw new Error('Failed to fetch plugin list');
        
        const plugins = await response.json();
        console.log('[PluginLoader] Found plugins:', plugins);

        for (const pluginUrl of plugins) {
            try {
                await loadScript(pluginUrl);
                console.log(`[PluginLoader] Loaded ${pluginUrl}`);
            } catch (e) {
                console.error(`[PluginLoader] Failed to load ${pluginUrl}`, e);
            }
        }
    } catch (e) {
        console.error('[PluginLoader] Error loading plugins:', e);
    }
}

function loadScript(url) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = url;
        script.async = true;
        script.onload = resolve;
        script.onerror = reject;
        document.body.appendChild(script);
    });
}
