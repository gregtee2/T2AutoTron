/**
 * HADeviceExplorerNode.js - HA Device Explorer Node
 * 
 * Shows ALL entities that belong to a single device.
 * Useful for devices like locks, thermostats, etc. that have many entities.
 * 
 * Select a device → see all its entities → pick which ones to output
 */

(function() {
    // Dependency check
    if (!window.Rete || !window.React || !window.nodeRegistry || !window.T2Controls || !window.sockets) {
        console.warn('[HADeviceExplorerNode] Dependencies not ready, waiting...');
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect, useCallback, useRef } = React;

    // Get shared controls
    const { DropdownControl, InputControl, ButtonControl, HelpIcon, NodeHeader } = window.T2Controls;

    // Tooltips
    const tooltips = {
        node: "Explore ALL entities belonging to a single device. Great for locks, thermostats, or other multi-entity devices.",
        device: "Select a device to see all its entities.",
        entity: "Each entity from the device becomes an output.",
    };

    /**
     * HADeviceExplorerNode - Rete Node Class
     */
    class HADeviceExplorerNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("HA Device Explorer");
            this.width = 340;
            this.height = 280;
            this.changeCallback = changeCallback;

            this.properties = {
                searchText: '',
                selectedDeviceId: '',
                selectedDeviceName: '',
                entities: [],         // All entities for selected device
                enabledEntities: [],  // Entity IDs that are enabled as outputs
                entityValues: {}      // Current values for each entity
            };

            this.devices = [];        // HA devices with their entity lists
            this.allEntities = [];    // All HA entities

            this.setupControls();
            this.initializeSocketIO();
            this.fetchDevices();
        }

        setupControls() {
            // Search field
            this.addControl("search", new InputControl(
                "🔍 Search Devices",
                "",
                (v) => {
                    this.properties.searchText = v;
                    this.updateDeviceDropdown();
                },
                { placeholder: "Type to filter..." }
            ));

            // Device dropdown
            this.addControl("device_select", new DropdownControl(
                "Device",
                ["Loading..."],
                "Loading...",
                (v) => this.onDeviceSelected(v)
            ));
        }

        initializeSocketIO() {
            if (window.socket) {
                this._onDeviceStateUpdate = (data) => this.handleDeviceStateUpdate(data);
                this._onConnect = () => this.fetchDevices();

                window.socket.on('device-state-update', this._onDeviceStateUpdate);
                window.socket.on('connect', this._onConnect);
            }
        }

        destroy() {
            if (window.socket) {
                if (this._onDeviceStateUpdate) window.socket.off('device-state-update', this._onDeviceStateUpdate);
                if (this._onConnect) window.socket.off('connect', this._onConnect);
            }
        }

        async fetchDevices() {
            if (typeof window !== 'undefined' && window.graphLoading) return;

            try {
                const fetchFn = window.apiFetch || fetch;
                const response = await fetchFn('/api/lights/ha/');
                const data = await response.json();
                
                if (data.success && data.devices) {
                    this.allEntities = data.devices;
                    
                    // Group entities by device_id or by name prefix
                    this.groupEntitiesByDevice();
                    this.updateDeviceDropdown();
                }
            } catch (err) {
                console.error('[HADeviceExplorerNode] Error fetching devices:', err);
            }
        }

        groupEntitiesByDevice() {
            // Group entities that share a common prefix or device_id
            const deviceMap = new Map();
            
            this.allEntities.forEach(entity => {
                // Try to extract device name from entity_id
                // e.g., "sensor.aura_reach_battery_2" -> "aura_reach"
                const entityId = entity.entity_id || entity.id?.replace('ha_', '') || '';
                const parts = entityId.split('.');
                if (parts.length < 2) return;
                
                const domain = parts[0];
                const name = parts[1];
                
                // Extract device prefix (before last underscore for numbered entities)
                // "aura_reach_battery_2" -> "aura_reach"
                // "aura_reach_auto_relock_time_2" -> "aura_reach"
                let devicePrefix = name;
                
                // Common patterns for device grouping
                const match = name.match(/^(.+?)(?:_battery|_firmware|_identify|_auto_relock|_wrong_code|_user_code|_sound_volume|_lock)?(?:_\d+)?$/);
                if (match) {
                    devicePrefix = match[1];
                }
                
                // Also check friendly_name for grouping
                const friendlyName = entity.friendly_name || entity.name || '';
                
                // Use device_id if available (from HA device registry)
                const deviceId = entity.device_id || devicePrefix;
                
                if (!deviceMap.has(deviceId)) {
                    deviceMap.set(deviceId, {
                        id: deviceId,
                        name: friendlyName.split(' ')[0] + ' ' + (friendlyName.split(' ')[1] || ''), // First two words
                        entities: []
                    });
                }
                
                deviceMap.get(deviceId).entities.push(entity);
            });
            
            // Filter to only devices with 2+ entities (likely multi-entity devices)
            this.devices = Array.from(deviceMap.values()).filter(d => d.entities.length >= 2);
            
            // Sort by entity count (most entities first)
            this.devices.sort((a, b) => b.entities.length - a.entities.length);
        }

        updateDeviceDropdown() {
            const control = this.controls.device_select;
            if (!control) return;

            let filtered = this.devices;

            // Apply search filter
            const searchText = (this.properties.searchText || '').toLowerCase().trim();
            if (searchText) {
                filtered = filtered.filter(d => {
                    const name = (d.name || '').toLowerCase();
                    const entities = d.entities.some(e => 
                        (e.friendly_name || e.entity_id || '').toLowerCase().includes(searchText)
                    );
                    return name.includes(searchText) || entities;
                });
            }

            const options = filtered.length > 0 
                ? ["— Select Device —", ...filtered.map(d => `${d.name} (${d.entities.length} entities)`)]
                : ["No multi-entity devices found"];
            
            control.values = options;
            
            if (this.properties.selectedDeviceName && options.some(o => o.includes(this.properties.selectedDeviceName))) {
                control.value = options.find(o => o.includes(this.properties.selectedDeviceName)) || options[0];
            } else {
                control.value = options[0];
            }

            if (control.updateDropdown) control.updateDropdown();
        }

        onDeviceSelected(value) {
            if (!value || value.startsWith("—") || value.startsWith("No ")) {
                this.properties.selectedDeviceId = '';
                this.properties.selectedDeviceName = '';
                this.properties.entities = [];
                this.clearDynamicOutputs();
                if (this.changeCallback) this.changeCallback();
                return;
            }

            // Find the selected device
            const device = this.devices.find(d => value.includes(d.name));
            if (!device) return;

            this.properties.selectedDeviceId = device.id;
            this.properties.selectedDeviceName = device.name;
            this.properties.entities = device.entities;

            // Create outputs for each entity
            this.createEntityOutputs(device.entities);
            
            // Fetch current values
            this.fetchEntityValues();

            if (this.changeCallback) this.changeCallback();
        }

        clearDynamicOutputs() {
            // Remove all dynamic outputs
            const outputKeys = Object.keys(this.outputs);
            outputKeys.forEach(key => {
                this.removeOutput(key);
            });
            this.properties.enabledEntities = [];
        }

        createEntityOutputs(entities) {
            this.clearDynamicOutputs();
            
            entities.forEach(entity => {
                const entityId = entity.entity_id || entity.id?.replace('ha_', '') || '';
                const domain = entityId.split('.')[0];
                const friendlyName = entity.friendly_name || entity.name || entityId;
                
                // Create short output name
                let shortName = friendlyName;
                if (shortName.length > 20) {
                    // Truncate but keep meaningful part
                    shortName = shortName.substring(0, 18) + '...';
                }

                // Socket type based on domain
                let socketType = window.sockets.any;
                if (domain === 'sensor' || domain === 'number') {
                    socketType = window.sockets.number;
                } else if (domain === 'binary_sensor' || domain === 'lock' || domain === 'switch') {
                    socketType = window.sockets.boolean;
                }

                this.addOutput(entityId, new ClassicPreset.Output(socketType, shortName));
                this.properties.enabledEntities.push(entityId);
            });

            // Update node height based on output count
            this.height = 280 + (entities.length * 30);
        }

        async fetchEntityValues() {
            const fetchFn = window.apiFetch || fetch;
            
            for (const entity of this.properties.entities) {
                const entityId = entity.entity_id || entity.id?.replace('ha_', '') || '';
                try {
                    const response = await fetchFn(`/api/lights/ha/${entityId}/state`);
                    const data = await response.json();
                    
                    if (data.success) {
                        this.properties.entityValues[entityId] = data.state?.state || data.state;
                    }
                } catch (err) {
                    // Silent fail - entity might not support state fetch
                }
            }
            
            if (this.changeCallback) this.changeCallback();
        }

        handleDeviceStateUpdate(data) {
            const entityId = data.entity_id || data.id?.replace('ha_', '') || '';
            
            // Check if this entity belongs to our selected device
            if (this.properties.enabledEntities.includes(entityId)) {
                this.properties.entityValues[entityId] = data.state;
                if (this.changeCallback) this.changeCallback();
            }
        }

        data(inputs) {
            const result = {};
            
            // Output current value for each enabled entity
            this.properties.enabledEntities.forEach(entityId => {
                const value = this.properties.entityValues[entityId];
                
                // Convert to appropriate type
                if (value === 'on' || value === 'unlocked' || value === 'home' || value === 'open') {
                    result[entityId] = true;
                } else if (value === 'off' || value === 'locked' || value === 'away' || value === 'closed') {
                    result[entityId] = false;
                } else if (!isNaN(parseFloat(value))) {
                    result[entityId] = parseFloat(value);
                } else {
                    result[entityId] = value;
                }
            });

            return result;
        }

        serialize() {
            return {
                searchText: this.properties.searchText,
                selectedDeviceId: this.properties.selectedDeviceId,
                selectedDeviceName: this.properties.selectedDeviceName,
                enabledEntities: this.properties.enabledEntities,
                entityValues: this.properties.entityValues
            };
        }

        restore(state) {
            const props = state.properties || state;
            if (props) {
                Object.assign(this.properties, props);
            }

            // Defer device fetch and selection restore
            setTimeout(() => {
                this.fetchDevices().then(() => {
                    if (this.properties.selectedDeviceName) {
                        const device = this.devices.find(d => 
                            d.name === this.properties.selectedDeviceName || 
                            d.id === this.properties.selectedDeviceId
                        );
                        if (device) {
                            this.properties.entities = device.entities;
                            this.createEntityOutputs(device.entities);
                            this.fetchEntityValues();
                        }
                    }
                });
            }, 500);
        }
    }

    /**
     * React Component for HADeviceExplorerNode
     */
    function HADeviceExplorerNodeComponent({ data, emit }) {
        const [, forceUpdate] = useState(0);
        const renderCount = useRef(0);
        renderCount.current++;

        useEffect(() => {
            const originalCallback = data.changeCallback;
            data.changeCallback = () => {
                forceUpdate(n => n + 1);
                if (originalCallback) originalCallback();
            };
            return () => { data.changeCallback = originalCallback; };
        }, [data]);

        // Get controls
        const searchControl = data.controls?.search;
        const deviceControl = data.controls?.device_select;

        // Render entity list
        const entities = data.properties?.entities || [];
        const entityValues = data.properties?.entityValues || {};

        return React.createElement('div', {
            className: 'ha-device-explorer-node',
            style: { 
                padding: '10px',
                fontFamily: 'Arial, sans-serif',
                minWidth: '320px'
            }
        }, [
            // Header
            NodeHeader && React.createElement(NodeHeader, {
                key: 'header',
                icon: '🔍',
                title: 'HA Device Explorer',
                tooltip: tooltips.node
            }),

            // Search Control
            searchControl && React.createElement('div', { 
                key: 'search', 
                style: { marginBottom: '8px' } 
            },
                React.createElement(window.RefComponent, {
                    key: 'search-ctrl',
                    init: (ref) => emit({ type: 'render', data: { type: 'control', element: ref, payload: searchControl } })
                })
            ),

            // Device Dropdown
            deviceControl && React.createElement('div', { 
                key: 'device', 
                style: { marginBottom: '12px' } 
            },
                React.createElement(window.RefComponent, {
                    key: 'device-ctrl',
                    init: (ref) => emit({ type: 'render', data: { type: 'control', element: ref, payload: deviceControl } })
                })
            ),

            // Entity count
            entities.length > 0 && React.createElement('div', {
                key: 'count',
                style: {
                    fontSize: '11px',
                    color: '#888',
                    marginBottom: '8px',
                    borderBottom: '1px solid #444',
                    paddingBottom: '6px'
                }
            }, `📋 ${entities.length} entities found`),

            // Entity list with values
            entities.length > 0 && React.createElement('div', {
                key: 'entities',
                style: {
                    maxHeight: '300px',
                    overflowY: 'auto',
                    fontSize: '11px'
                }
            }, entities.map((entity, idx) => {
                const entityId = entity.entity_id || entity.id?.replace('ha_', '') || '';
                const friendlyName = entity.friendly_name || entity.name || entityId;
                const value = entityValues[entityId];
                const domain = entityId.split('.')[0];

                // Domain icons
                const icons = {
                    lock: '🔐',
                    sensor: '📊',
                    binary_sensor: '🔘',
                    number: '🔢',
                    select: '📋',
                    button: '🔲',
                    switch: '💡',
                    update: '🔄'
                };
                const icon = icons[domain] || '📦';

                // Format value display
                let displayValue = value ?? '—';
                if (value === true || value === 'on' || value === 'unlocked') {
                    displayValue = '✅';
                } else if (value === false || value === 'off' || value === 'locked') {
                    displayValue = '🔒';
                } else if (value === 'unavailable') {
                    displayValue = '⚠️';
                }

                return React.createElement('div', {
                    key: entityId,
                    style: {
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '4px 6px',
                        backgroundColor: idx % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'transparent',
                        borderRadius: '3px',
                        marginBottom: '2px'
                    }
                }, [
                    React.createElement('span', {
                        key: 'name',
                        style: { 
                            flex: 1,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            color: '#ccc'
                        },
                        title: entityId
                    }, `${icon} ${friendlyName}`),
                    React.createElement('span', {
                        key: 'value',
                        style: {
                            marginLeft: '8px',
                            fontWeight: 'bold',
                            color: value === 'unavailable' ? '#ff6b6b' : '#4ecdc4'
                        }
                    }, displayValue)
                ]);
            })),

            // Socket outputs are rendered by Rete automatically
            // Instructions if no device selected
            entities.length === 0 && React.createElement('div', {
                key: 'instructions',
                style: {
                    color: '#666',
                    fontSize: '11px',
                    textAlign: 'center',
                    padding: '20px 10px'
                }
            }, '👆 Select a device to see all its entities')
        ]);
    }

    // Register the node
    window.nodeRegistry.register('HADeviceExplorerNode', {
        label: "HA Device Explorer",
        category: "Home Assistant",
        nodeClass: HADeviceExplorerNode,
        component: HADeviceExplorerNodeComponent,
        factory: (cb) => new HADeviceExplorerNode(cb)
    });

    console.log("[HADeviceExplorerNode] ✅ Registered");
})();
