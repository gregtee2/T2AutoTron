// ============================================================================
// 00_BaseNodePlugin.js - Base node class with common lifecycle methods
// This file MUST be loaded BEFORE other plugins (alphabetically first with 00_)
// Exposes window.T2Node for use by all node plugins
// ============================================================================

(function() {
    // Debug: console.log("[BaseNodePlugin] Loading base...");

    // Dependency check
    if (!window.Rete) {
        console.error("[BaseNodePlugin] Missing dependency: Rete not found");
        return;
    }

    const { ClassicPreset } = window.Rete;

    // =========================================================================
    // BASE T2 NODE CLASS
    // Provides common serialization, restore, and lifecycle methods
    // =========================================================================
    class BaseT2Node extends ClassicPreset.Node {
        constructor(label, changeCallback) {
            super(label);
            this.changeCallback = changeCallback;
            this.properties = {};
        }

        /**
         * Restore node state from saved data
         * Override in subclass if you need custom restore logic
         */
        restore(state) {
            if (state.properties) {
                Object.assign(this.properties, state.properties);
            }
        }

        /**
         * Serialize node properties for saving
         * By default, returns a shallow copy of properties
         * Override in subclass for custom serialization
         */
        serialize() {
            return { ...this.properties };
        }

        /**
         * Full JSON representation of the node
         * Includes id, label, and properties
         */
        toJSON() {
            return {
                id: this.id,
                label: this.label,
                properties: this.serialize()
            };
        }

        /**
         * Trigger the engine to re-process the graph
         */
        triggerUpdate() {
            if (this.changeCallback) {
                this.changeCallback();
            }
        }

        /**
         * Helper to log debug messages (respects properties.debug flag)
         */
        log(message, ...args) {
            if (this.properties.debug) {
                console.log(`[${this.label}]`, message, ...args);
            }
        }

        /**
         * Helper to log errors (always logged)
         */
        logError(message, ...args) {
            console.error(`[${this.label}]`, message, ...args);
        }
    }

    // =========================================================================
    // SOCKET HELPERS
    // Get sockets with fallback creation
    // =========================================================================
    const getSocket = (type) => {
        const sockets = window.sockets;
        if (sockets && sockets[type]) {
            return sockets[type];
        }
        // Fallback: create a new socket
        return new ClassicPreset.Socket(type);
    };

    // Common socket types
    const SocketTypes = {
        boolean: () => getSocket('boolean'),
        number: () => getSocket('number'),
        string: () => getSocket('string'),
        object: () => getSocket('object'),
        lightInfo: () => getSocket('lightInfo'),
        any: () => getSocket('any')
    };

    // =========================================================================
    // REFCOMPONENT HELPERS
    // Simplify socket rendering in node components
    // =========================================================================
    const createSocketRef = (emit, socket, nodeId, side, key) => {
        const RefComponent = window.RefComponent;
        if (!RefComponent) {
            console.error("[BaseNodePlugin] RefComponent not found");
            return null;
        }
        
        return window.React.createElement(RefComponent, {
            init: ref => emit({ 
                type: "render", 
                data: { 
                    type: "socket", 
                    element: ref, 
                    payload: socket, 
                    nodeId, 
                    side, 
                    key 
                } 
            }),
            unmount: ref => emit({ 
                type: "unmount", 
                data: { element: ref } 
            })
        });
    };

    // =========================================================================
    // NODE REGISTRATION HELPER
    // Simplified node registration with defaults
    // =========================================================================
    const registerNode = (name, NodeClass, Component, category, label) => {
        if (!window.nodeRegistry) {
            console.error("[BaseNodePlugin] nodeRegistry not found");
            return false;
        }

        window.nodeRegistry.register(name, {
            label: label || name.replace(/Node$/, '').replace(/([A-Z])/g, ' $1').trim(),
            category: category,
            nodeClass: NodeClass,
            factory: (changeCallback) => new NodeClass(changeCallback),
            component: Component
        });

        return true;
    };

    // =========================================================================
    // THROTTLED UPDATE HELPER
    // Prevent too many updates in rapid succession
    // =========================================================================
    const createThrottledUpdater = (callback, limit = 50) => {
        let lastUpdate = 0;
        let pendingTimeout = null;

        return () => {
            const now = Date.now();

            if (now - lastUpdate >= limit) {
                callback();
                lastUpdate = now;
            } else {
                if (pendingTimeout) clearTimeout(pendingTimeout);
                pendingTimeout = setTimeout(() => {
                    callback();
                    lastUpdate = Date.now();
                }, limit - (now - lastUpdate));
            }
        };
    };

    // =========================================================================
    // COMMON CONTROL BUILDERS
    // Factory functions for quickly creating controls
    // =========================================================================
    const ControlBuilders = {
        button: (label, onClick, options) => {
            const T2 = window.T2Controls;
            return T2 ? new T2.ButtonControl(label, onClick, options) : null;
        },

        dropdown: (label, values, initial, onChange) => {
            const T2 = window.T2Controls;
            return T2 ? new T2.DropdownControl(label, values, initial, onChange) : null;
        },

        switch: (label, initial, onChange) => {
            const T2 = window.T2Controls;
            return T2 ? new T2.SwitchControl(label, initial, onChange) : null;
        },

        number: (label, initial, onChange, options) => {
            const T2 = window.T2Controls;
            return T2 ? new T2.NumberControl(label, initial, onChange, options) : null;
        },

        input: (label, initial, onChange, options) => {
            const T2 = window.T2Controls;
            return T2 ? new T2.InputControl(label, initial, onChange, options) : null;
        },

        status: (data) => {
            const T2 = window.T2Controls;
            return T2 ? new T2.StatusIndicatorControl(data) : null;
        },

        colorBar: (data) => {
            const T2 = window.T2Controls;
            return T2 ? new T2.ColorBarControl(data) : null;
        },

        powerStats: (data) => {
            const T2 = window.T2Controls;
            return T2 ? new T2.PowerStatsControl(data) : null;
        }
    };

    // =========================================================================
    // DEPENDENCY CHECK HELPER
    // Standard dependency validation for plugins
    // =========================================================================
    const checkDependencies = (pluginName, required = ['Rete', 'React', 'RefComponent', 'sockets']) => {
        const missing = required.filter(dep => !window[dep]);
        
        if (missing.length > 0) {
            console.error(`[${pluginName}] Missing dependencies:`, missing.join(', '));
            return false;
        }
        
        return true;
    };

    // =========================================================================
    // EXPOSE TO WINDOW
    // =========================================================================
    window.T2Node = {
        // Base class
        BaseT2Node,

        // Socket utilities
        getSocket,
        SocketTypes,

        // Component helpers
        createSocketRef,

        // Registration
        registerNode,

        // Update throttling
        createThrottledUpdater,

        // Control builders
        controls: ControlBuilders,

        // Dependency checking
        checkDependencies
    };

    // console.log("[BaseNodePlugin] Registered window.T2Node with base class and utilities");
})();
