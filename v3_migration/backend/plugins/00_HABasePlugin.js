(function() {
    // Debug: console.log("[HABasePlugin] Loading shared...");

    // -------------------------------------------------------------------------
    // FILTER TYPE MAPPING - Normalizes filter dropdown values to entity types
    // -------------------------------------------------------------------------
    const filterTypeMap = {
        "All": "all",
        "Light": "light",
        "Switch": "switch",
        "Binary Sensor": "binary_sensor",
        "Sensor": "sensor",
        "Media Player": "media_player",
        "Weather": "weather",
        "Fan": "fan",
        "Cover": "cover"
    };

    // -------------------------------------------------------------------------
    // LETTER RANGES - For alphabetical filtering of device lists
    // -------------------------------------------------------------------------
    const letterRanges = {
        "All Letters": null,
        "ABC": ["A", "B", "C"],
        "DEF": ["D", "E", "F"],
        "GHI": ["G", "H", "I"],
        "JKL": ["J", "K", "L"],
        "MNO": ["M", "N", "O"],
        "PQR": ["P", "Q", "R"],
        "STU": ["S", "T", "U"],
        "VWX": ["V", "W", "X"],
        "YZ": ["Y", "Z"]
    };

    // -------------------------------------------------------------------------
    // FIELD MAPPING - Available fields per entity type for automation nodes
    // -------------------------------------------------------------------------
    const fieldMapping = {
        light: ["state", "hue", "saturation", "brightness"],
        switch: ["state", "open"],
        fan: ["state", "on", "percentage"],
        cover: ["state", "position"],
        media_player: ["state", "volume_level", "media_title", "media_content_type", "media_artist", "shuffle", "repeat", "supported_features"],
        binary_sensor: ["state", "battery"],
        sensor: ["value", "unit", "temperature", "pressure", "battery_level"],
        weather: ["temperature", "humidity", "condition", "pressure", "wind_speed"],
        device_tracker: ["state", "zone", "latitude", "longitude"],
        unknown: ["state"]
    };

    // -------------------------------------------------------------------------
    // AUXILIARY ENTITY PATTERNS - Patterns to filter out non-primary entities
    // -------------------------------------------------------------------------
    const auxiliaryPatterns = [
        // Name-based patterns (at end of name)
        / LED$/i,
        / Auto-update enabled$/i,
        / Firmware$/i,
        / Restart$/i,
        / Identify$/i,
        / Power on behavior$/i,
        / Signal strength$/i,
        / Uptime$/i,
        / Last seen$/i,
        / Battery$/i,
        / Temperature$/i,
        / Link quality$/i,
        / Update available$/i,
        / OTA Progress$/i,
        // entity_id patterns
        /_update$/i,
        /_led$/i,
        /_identify$/i,
        /_restart$/i,
        /_firmware$/i,
        // Broader patterns (anywhere in name)
        /\bLED\b/i,
        /\bAuto-update\b/i,
        /\bCloud connection\b/i,
        /\bOverheated\b/i,
        /\bSignal\s+level\b/i,
        /\bRestart\b/i,
        /\bFirmware\b/i,
        /\bSSID\b/i,
        /\bIP\s*Address\b/i,
        /\bMAC\s*Address\b/i,
        /\bUptime\b/i,
        /\bWi-?Fi\b/i
    ];

    // -------------------------------------------------------------------------
    // UTILITY FUNCTIONS
    // -------------------------------------------------------------------------

    /**
     * Check if a device name matches any auxiliary pattern
     * @param {string} name - Device name to check
     * @returns {boolean} - True if it's an auxiliary entity
     */
    function isAuxiliaryEntity(name) {
        if (!name) return false;
        return auxiliaryPatterns.some(pattern => pattern.test(name));
    }

    /**
     * Get the correct API endpoint and clean ID for a device based on prefix
     * @param {string} id - Device ID with prefix (ha_, kasa_, hue_, shelly_)
     * @returns {object|null} - { endpoint, cleanId } or null if invalid
     */
    function getDeviceApiInfo(id) {
        if (!id) return null;
        if (id.startsWith('ha_')) {
            return { endpoint: '/api/lights/ha', cleanId: id.replace('ha_', '') };
        } else if (id.startsWith('kasa_')) {
            return { endpoint: '/api/lights/kasa', cleanId: id.replace('kasa_', '') };
        } else if (id.startsWith('hue_')) {
            return { endpoint: '/api/lights/hue', cleanId: id.replace('hue_', '') };
        } else if (id.startsWith('shelly_')) {
            return { endpoint: '/api/lights/shelly', cleanId: id.replace('shelly_', '') };
        }
        // Default to HA endpoint for unrecognized prefixes
        return { endpoint: '/api/lights/ha', cleanId: id };
    }

    /**
     * Compare device names alphabetically (case-insensitive)
     * @param {string} a - First name
     * @param {string} b - Second name
     * @returns {number} - Comparison result
     */
    function compareNames(a = "", b = "") {
        return a.localeCompare(b, undefined, { sensitivity: "base" });
    }

    /**
     * Format UTC time to local time string
     * @param {string} utcTime - UTC time string
     * @returns {string} - Formatted local time
     */
    function formatTime(utcTime) {
        if (!utcTime || typeof utcTime !== "string") return "Invalid";
        try {
            const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            const date = new Date(utcTime.endsWith("Z") ? utcTime : `${utcTime}Z`);
            if (isNaN(date.getTime())) return "Invalid";
            return date.toLocaleTimeString("en-US", { 
                hour: "numeric", 
                minute: "numeric", 
                hour12: true, 
                timeZone: userTimeZone 
            });
        } catch (error) {
            return utcTime;
        }
    }

    /**
     * Filter devices by type and letter range
     * @param {Array} devices - Array of device objects with name and entityType
     * @param {string} filterType - Type filter (All, Light, Switch, etc.)
     * @param {string} letterFilter - Letter range filter (All Letters, ABC, etc.)
     * @param {boolean} includeAuxiliary - Whether to include auxiliary entities
     * @returns {Array} - Filtered devices
     */
    function filterDevices(devices, filterType = "All", letterFilter = "All Letters", includeAuxiliary = false) {
        if (!Array.isArray(devices)) return [];
        
        const normalizedFilterType = filterTypeMap[filterType] || "all";
        
        let filtered = devices.filter(device => {
            // Filter out auxiliary entities unless explicitly included
            if (!includeAuxiliary && isAuxiliaryEntity(device.name)) {
                return false;
            }
            
            // Type filter
            if (normalizedFilterType !== "all") {
                const deviceType = device.entityType || device.type || "unknown";
                
                // Special handling: Switch filter includes switch, plug, and light
                if (normalizedFilterType === "switch") {
                    if (!["switch", "plug", "light"].includes(deviceType)) {
                        return false;
                    }
                }
                // Light filter also includes switch and plug (for Kasa dimmers)
                else if (normalizedFilterType === "light") {
                    if (!["light", "switch", "plug"].includes(deviceType)) {
                        return false;
                    }
                }
                else if (deviceType !== normalizedFilterType) {
                    return false;
                }
            }
            
            return true;
        });
        
        // Letter filter
        if (letterFilter && letterFilter !== "All Letters") {
            const range = letterRanges[letterFilter];
            if (range) {
                filtered = filtered.filter(device => {
                    const firstLetter = (device.name || "").charAt(0).toUpperCase();
                    return range.includes(firstLetter);
                });
            }
        }
        
        return filtered;
    }

    /**
     * Normalize HA device data to consistent format
     * @param {object} device - Raw device from API
     * @returns {object} - Normalized device object
     */
    function normalizeHADevice(device) {
        const entityType = device.type || "unknown";
        let state = "unknown";
        let attributes = {};
        
        switch (entityType) {
            case "binary_sensor":
                state = device.state?.on ? "on" : "off";
                attributes = { battery: "unknown" };
                break;
            case "sensor":
                state = device.state?.value || device.state?.state || "unknown";
                attributes = { unit: device.state?.unit || "" };
                break;
            case "light":
            case "switch":
                state = device.state?.on ? "on" : "off";
                attributes = { 
                    brightness: device.state?.brightness || (device.state?.on ? 100 : 0), 
                    hs_color: device.state?.hs_color || [0, 0] 
                };
                break;
            case "media_player":
                state = device.state?.state || "off";
                attributes = { 
                    volume_level: device.state?.volume_level || 0, 
                    source: device.state?.source || null 
                };
                break;
            case "weather":
                state = device.state?.condition || "unknown";
                attributes = { 
                    temperature: device.state?.temperature || null, 
                    humidity: device.state?.humidity || null 
                };
                break;
            case "fan":
                state = device.state?.on ? "on" : "off";
                attributes = { percentage: device.state?.percentage || 0 };
                break;
            case "cover":
                state = device.state?.on ? "open" : "closed";
                attributes = { position: device.state?.position || 0 };
                break;
        }
        
        return {
            entity_id: device.id?.replace("ha_", "") || device.entity_id,
            id: device.id,
            name: (device.name || "").trim(),
            entityType,
            state,
            attributes
        };
    }

    /**
     * Get fields available for a given entity type
     * @param {string} entityType - Entity type (light, switch, etc.)
     * @returns {Array} - Array of available field names
     */
    function getFieldsForEntityType(entityType) {
        return fieldMapping[entityType] || fieldMapping.unknown;
    }

    /**
     * Create a debug logger function for a node
     * @param {string} nodeName - Name of the node for log prefix
     * @param {object} properties - Node properties object (checks properties.debug)
     * @returns {function} - Logger function (key, message, force)
     */
    function createLogger(nodeName, properties) {
        return function(key, message, force = false) {
            if (!properties.debug && !force) return;
            console.log(`[${nodeName}] ${key}: ${message}`);
        };
    }

    // -------------------------------------------------------------------------
    // SOCKET.IO HELPERS
    // -------------------------------------------------------------------------

    /**
     * Initialize socket.io listeners for device state updates
     * @param {object} node - The node instance
     * @param {function} onDeviceStateUpdate - Callback for device state updates
     * @param {function} onConnect - Callback for socket connect (usually fetchDevices)
     */
    function initializeSocketListeners(node, onDeviceStateUpdate, onConnect) {
        if (!window.socket) return;
        
        // Store handlers for cleanup
        node._onDeviceStateUpdate = onDeviceStateUpdate;
        node._onConnect = onConnect;
        
        window.socket.on("device-state-update", node._onDeviceStateUpdate);
        window.socket.on("connect", node._onConnect);
    }

    /**
     * Remove socket.io listeners (call in node destroy)
     * @param {object} node - The node instance
     */
    function removeSocketListeners(node) {
        if (!window.socket) return;
        
        if (node._onDeviceStateUpdate) {
            window.socket.off("device-state-update", node._onDeviceStateUpdate);
        }
        if (node._onConnect) {
            window.socket.off("connect", node._onConnect);
        }
    }

    // -------------------------------------------------------------------------
    // EXPORT TO GLOBAL SCOPE
    // -------------------------------------------------------------------------
    window.T2HAUtils = {
        // Constants
        filterTypeMap,
        letterRanges,
        fieldMapping,
        auxiliaryPatterns,
        
        // Utility functions
        isAuxiliaryEntity,
        getDeviceApiInfo,
        compareNames,
        formatTime,
        filterDevices,
        normalizeHADevice,
        getFieldsForEntityType,
        createLogger,
        
        // Socket.io helpers
        initializeSocketListeners,
        removeSocketListeners
    };

    // console.log("[HABasePlugin] T2HAUtils loaded with:", Object.keys(window.T2HAUtils).join(", "));
})();
