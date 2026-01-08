/**
 * 00_SharedLogicLoader.js
 * 
 * Loads shared logic files from the server and makes them available
 * to frontend plugins via window.T2SharedLogic.
 * 
 * This enables frontend plugins to use the SAME calculation functions
 * as the backend engine, eliminating logic duplication.
 * 
 * Usage in plugins:
 *   const { calculateTimeRange } = window.T2SharedLogic || {};
 *   if (calculateTimeRange) {
 *       const result = calculateTimeRange(this.properties);
 *   }
 */

(function() {
    'use strict';
    
    // Initialize the shared logic container
    window.T2SharedLogic = window.T2SharedLogic || {};
    
    const MODULES = [
        'TimeRangeLogic',
        'AndGateLogic', 
        'DelayLogic',
        'LogicGateLogic',
        'ColorLogic',
        'UtilityLogic',
        'DeviceLogic'
    ];
    
    /**
     * Load a shared logic module from the server
     */
    async function loadModule(name) {
        try {
            const apiUrl = window.T2_API_URL || '';
            const response = await fetch(`${apiUrl}/api/shared-logic/${name}`);
            
            if (!response.ok) {
                console.warn(`[SharedLogicLoader] Failed to load ${name}: ${response.status}`);
                return;
            }
            
            const code = await response.text();
            
            // The modules use IIFE pattern that exports to window.T2SharedLogic
            // Execute the code to register the exports
            eval(code);
            
            // console.log(`[SharedLogicLoader] Loaded: ${name}`);
        } catch (err) {
            console.warn(`[SharedLogicLoader] Error loading ${name}:`, err.message);
        }
    }
    
    /**
     * Load all shared logic modules
     */
    async function loadAllModules() {
        // Load modules in parallel
        await Promise.all(MODULES.map(loadModule));
        
        // Log what's available
        const loaded = Object.keys(window.T2SharedLogic);
        if (loaded.length > 0) {
            console.log(`[SharedLogicLoader] ✅ Loaded ${loaded.length} shared functions:`, loaded.join(', '));
        }
    }
    
    // Load immediately
    loadAllModules();
    
    // Also expose loader for manual refresh
    window.T2SharedLogic._reload = loadAllModules;
    
})();
