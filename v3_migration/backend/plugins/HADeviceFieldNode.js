/**
 * HADeviceFieldNode - Simple "pick a device, pick a field, get the value" node
 * 
 * 🦴 Caveman Version:
 * This is the easy button. Pick a device from the dropdown, pick what info you want
 * (state, brightness, temperature, etc.), and the value comes out the output.
 * No wires between nodes needed - it's all in one box.
 * 
 * Example: Want to know if your iPhone is home?
 * 1. Pick "person.greg" from device dropdown
 * 2. Pick "state" from field dropdown  
 * 3. Output gives you "home" or "not_home"
 */
(function() {
    'use strict';

    // Wait for dependencies
    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets || !window.T2Controls || !window.T2HAUtils) {
        console.warn('[HADeviceFieldNode] Missing dependencies, waiting for load...');
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect, useRef, useCallback } = React;

    // Get shared controls and utilities
    const { DropdownControl, HelpIcon } = window.T2Controls;
    const { filterTypeMap, filterDevices } = window.T2HAUtils;

    // Field options by domain
    const FIELD_OPTIONS = {
        light: [
            { value: 'state', label: 'State (on/off)' },
            { value: 'brightness', label: 'Brightness (0-100)' },
            { value: 'color_temp', label: 'Color Temperature' },
            { value: 'is_on', label: 'Is On (true/false)' }
        ],
        switch: [
            { value: 'state', label: 'State (on/off)' },
            { value: 'is_on', label: 'Is On (true/false)' }
        ],
        sensor: [
            { value: 'state', label: 'State (value)' },
            { value: 'unit', label: 'Unit of Measurement' }
        ],
        binary_sensor: [
            { value: 'state', label: 'State (on/off)' },
            { value: 'is_on', label: 'Is On (true/false)' }
        ],
        climate: [
            { value: 'state', label: 'State (mode)' },
            { value: 'temperature', label: 'Target Temperature' },
            { value: 'current_temperature', label: 'Current Temperature' }
        ],
        media_player: [
            { value: 'state', label: 'State (playing/paused/idle)' },
            { value: 'volume', label: 'Volume (0-100)' },
            { value: 'is_playing', label: 'Is Playing (true/false)' }
        ],
        cover: [
            { value: 'state', label: 'State (open/closed)' },
            { value: 'position', label: 'Position (0-100)' },
            { value: 'is_open', label: 'Is Open (true/false)' }
        ],
        fan: [
            { value: 'state', label: 'State (on/off)' },
            { value: 'percentage', label: 'Speed (0-100)' },
            { value: 'is_on', label: 'Is On (true/false)' }
        ],
        device_tracker: [
            { value: 'state', label: 'State (home/not_home/zone)' },
            { value: 'zone', label: 'Zone Name' },
            { value: 'is_home', label: 'Is Home (true/false)' }
        ],
        person: [
            { value: 'state', label: 'State (home/not_home/zone)' },
            { value: 'zone', label: 'Zone Name' },
            { value: 'is_home', label: 'Is Home (true/false)' }
        ],
        weather: [
            { value: 'state', label: 'Condition' },
            { value: 'temperature', label: 'Temperature' },
            { value: 'humidity', label: 'Humidity' }
        ],
        default: [
            { value: 'state', label: 'State' }
        ]
    };

    // Tooltips
    const tooltips = {
        node: "Simple device field reader. Pick a device, pick a field, get the value. No wires needed between nodes!",
        device: "Select the Home Assistant device/entity to read from.",
        field: "Select which piece of information you want from this device.",
        output: "The current value of the selected field. Updates in real-time."
    };

    /**
     * HADeviceFieldNode - Rete Node Class
     */
    class HADeviceFieldNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("HA Device Field");
            this.width = 320;
            this.height = 200;
            this.changeCallback = changeCallback;

            this.properties = {
                deviceId: '',
                deviceName: '',
                field: 'state',
                lastValue: null,
                filterType: 'All',
                letterFilter: 'All Letters'
            };

            this.devices = [];
            this.cachedDeviceState = null;

            // Add output
            this.addOutput('value', new ClassicPreset.Output(window.sockets.any, 'Value'));

            // Setup controls
            this.setupControls();
            this.initializeSocketIO();
            this.fetchDevices();
        }

        setupControls() {
            // Filter dropdown
            this.addControl("filter_type", new DropdownControl(
                "Filter",
                ["All", "Light", "Switch", "Sensor", "Binary Sensor", "Media Player", "Fan", "Cover", "Weather", "Device Tracker", "Person"],
                "All",
                (v) => { 
                    this.properties.filterType = v;
                    this.updateDeviceDropdown();
                    if (this.changeCallback) this.changeCallback();
                }
            ));

            // Letter filter dropdown
            this.addControl("letter_filter", new DropdownControl(
                "By Letter",
                ["All Letters", "ABC", "DEF", "GHI", "JKL", "MNO", "PQR", "STU", "VWX", "YZ"],
                "All Letters",
                (v) => { 
                    this.properties.letterFilter = v;
                    this.updateDeviceDropdown();
                    if (this.changeCallback) this.changeCallback();
                }
            ));

            // Device dropdown
            this.addControl("device_select", new DropdownControl(
                "Device",
                ["Loading..."],
                "Loading...",
                (v) => this.onDeviceSelected(v)
            ));

            // Field dropdown
            this.addControl("field_select", new DropdownControl(
                "Field",
                ["state"],
                "state",
                (v) => {
                    this.properties.field = v;
                    this.extractAndUpdateValue();
                    if (this.changeCallback) this.changeCallback();
                }
            ));
        }

        initializeSocketIO() {
            if (window.socket) {
                this._onDeviceStateUpdate = (data) => this.handleDeviceStateUpdate(data);
                this._onConnect = () => this.fetchDevices();
                this._onGraphLoadComplete = () => {
                    this.fetchDevices();
                    if (this.properties.deviceId) {
                        this.fetchDeviceState(this.properties.deviceId);
                    }
                };
                
                window.socket.on("device-state-update", this._onDeviceStateUpdate);
                window.socket.on("connect", this._onConnect);
                window.addEventListener("graphLoadComplete", this._onGraphLoadComplete);
            }
        }

        destroy() {
            if (window.socket) {
                if (this._onDeviceStateUpdate) window.socket.off("device-state-update", this._onDeviceStateUpdate);
                if (this._onConnect) window.socket.off("connect", this._onConnect);
            }
            if (this._onGraphLoadComplete) {
                window.removeEventListener("graphLoadComplete", this._onGraphLoadComplete);
            }
        }

        async fetchDevices() {
            if (typeof window !== 'undefined' && window.graphLoading) return;

            try {
                const fetchFn = window.apiFetch || fetch;
                const response = await fetchFn('/api/lights/ha/');
                const data = await response.json();
                
                if (data.success && data.devices) {
                    this.devices = data.devices.filter(d => 
                        ["light", "switch", "binary_sensor", "sensor", "media_player", "weather", "fan", "cover", "device_tracker", "person"].includes(d.type)
                    );
                    this.updateDeviceDropdown();
                }
            } catch (err) {
                console.error('[HADeviceFieldNode] Error fetching devices:', err);
            }
        }

        updateDeviceDropdown() {
            const control = this.controls.device_select;
            if (!control) return;

            // Filter devices by type
            const filterMap = {
                'All': null,
                'Light': 'light',
                'Switch': 'switch',
                'Sensor': 'sensor',
                'Binary Sensor': 'binary_sensor',
                'Media Player': 'media_player',
                'Fan': 'fan',
                'Cover': 'cover',
                'Weather': 'weather',
                'Device Tracker': 'device_tracker',
                'Person': 'person'
            };
            
            const typeFilter = filterMap[this.properties.filterType];
            let filtered = this.devices;
            if (typeFilter) {
                filtered = this.devices.filter(d => d.type === typeFilter);
            }

            // Apply letter filter
            const letterRanges = {
                'All Letters': null,
                'ABC': ['A', 'B', 'C'],
                'DEF': ['D', 'E', 'F'],
                'GHI': ['G', 'H', 'I'],
                'JKL': ['J', 'K', 'L'],
                'MNO': ['M', 'N', 'O'],
                'PQR': ['P', 'Q', 'R'],
                'STU': ['S', 'T', 'U'],
                'VWX': ['V', 'W', 'X'],
                'YZ': ['Y', 'Z']
            };
            const letterRange = letterRanges[this.properties.letterFilter];
            if (letterRange) {
                filtered = filtered.filter(d => {
                    const name = (d.friendly_name || d.name || d.id || '').toUpperCase();
                    return letterRange.some(letter => name.startsWith(letter));
                });
            }

            const options = filtered.length > 0 
                ? ["— Select —", ...filtered.map(d => d.friendly_name || d.name || d.id)]
                : ["No devices found"];
            
            control.values = options;
            
            // Set current selection if valid
            if (this.properties.deviceName && options.includes(this.properties.deviceName)) {
                control.value = this.properties.deviceName;
            } else {
                control.value = options[0];
            }
            
            // Trigger UI update
            if (control.updateDropdown) control.updateDropdown();
        }

        updateFieldDropdown() {
            const control = this.controls.field_select;
            if (!control) return;

            const domain = this.getDomain(this.properties.deviceId);
            const fields = FIELD_OPTIONS[domain] || FIELD_OPTIONS.default;
            
            control.values = fields.map(f => f.value);
            
            // Check if current field is valid for new domain
            if (!fields.find(f => f.value === this.properties.field)) {
                this.properties.field = 'state';
                control.value = 'state';
            } else {
                control.value = this.properties.field;
            }
            
            // Trigger UI update
            if (control.updateDropdown) control.updateDropdown();
        }

        getDomain(deviceId) {
            if (!deviceId) return 'default';
            const match = deviceId.match(/^ha_([^.]+)\./);
            return match ? match[1] : 'default';
        }

        onDeviceSelected(name) {
            if (name === "— Select —" || name === "No devices found" || name === "Loading...") {
                this.properties.deviceId = '';
                this.properties.deviceName = '';
                this.properties.lastValue = null;
                this.cachedDeviceState = null;
                if (this.changeCallback) this.changeCallback();
                return;
            }

            const device = this.devices.find(d => 
                (d.friendly_name || d.name || d.id) === name
            );
            
            if (device) {
                this.properties.deviceId = device.id;
                this.properties.deviceName = name;
                this.updateFieldDropdown();
                this.fetchDeviceState(device.id);
            }
            
            if (this.changeCallback) this.changeCallback();
        }

        async fetchDeviceState(deviceId) {
            if (!deviceId) return;

            try {
                const entityId = deviceId.replace(/^ha_/, '');
                const fetchFn = window.apiFetch || fetch;
                // Use the correct endpoint: /api/lights/ha/:id/state
                const response = await fetchFn(`/api/lights/ha/${entityId}/state`);
                
                if (response.ok) {
                    const data = await response.json();
                    if (data.success && data.state) {
                        this.cachedDeviceState = { 
                            id: deviceId, 
                            state: data.state.state,
                            ...data.state
                        };
                        this.extractAndUpdateValue();
                    }
                }
            } catch (err) {
                console.error('[HADeviceFieldNode] Error fetching state:', err);
            }
        }

        handleDeviceStateUpdate(data) {
            if (!this.properties.deviceId) return;
            
            const updateId = data.id || `ha_${data.entity_id}`;
            if (updateId === this.properties.deviceId) {
                this.cachedDeviceState = { 
                    id: this.properties.deviceId, 
                    state: data.state,
                    ...data.attributes,
                    ...data
                };
                this.extractAndUpdateValue();
            }
        }

        extractAndUpdateValue() {
            const device = this.cachedDeviceState;
            if (!device) {
                this.properties.lastValue = null;
                if (this.changeCallback) this.changeCallback();
                return;
            }

            const field = this.properties.field;
            let value = null;

            switch (field) {
                case 'state':
                    value = device.state || null;
                    break;
                case 'is_on':
                    value = device.state === 'on';
                    break;
                case 'is_home':
                    value = device.state === 'home';
                    break;
                case 'is_open':
                    value = device.state === 'open';
                    break;
                case 'is_playing':
                    value = device.state === 'playing';
                    break;
                case 'brightness':
                    if (device.brightness !== undefined) {
                        value = device.brightness > 1 ? Math.round(device.brightness / 2.55) : device.brightness;
                    }
                    break;
                case 'zone':
                    value = device.zone || device.state || null;
                    break;
                case 'temperature':
                case 'current_temperature':
                    value = device[field] ?? device.temperature ?? null;
                    break;
                case 'humidity':
                    value = device.humidity ?? null;
                    break;
                case 'volume':
                    value = device.volume_level !== undefined ? Math.round(device.volume_level * 100) : null;
                    break;
                case 'position':
                    value = device.current_position ?? device.position ?? null;
                    break;
                case 'percentage':
                    value = device.percentage ?? null;
                    break;
                case 'unit':
                    value = device.unit_of_measurement ?? null;
                    break;
                case 'color_temp':
                    value = device.color_temp ?? null;
                    break;
                default:
                    value = device[field] ?? device.state ?? null;
            }

            const oldValue = this.properties.lastValue;
            this.properties.lastValue = value;
            
            // Only trigger callback if value actually changed
            if (oldValue !== value && this.changeCallback) {
                this.changeCallback();
            }
        }

        data(inputs) {
            return {
                value: this.properties.lastValue
            };
        }

        serialize() {
            return { ...this.properties };
        }

        restore(state) {
            if (state) {
                Object.assign(this.properties, state);
                // Defer device fetch to avoid race conditions during graph load
                setTimeout(() => {
                    this.fetchDevices();
                    if (this.properties.deviceId) {
                        this.fetchDeviceState(this.properties.deviceId);
                    }
                }, 500);
            }
        }
    }

    /**
     * HADeviceFieldNode - React Component
     */
    function HADeviceFieldNodeComponent({ data, emit }) {
        const [currentValue, setCurrentValue] = useState(data.properties.lastValue);
        const [deviceName, setDeviceName] = useState(data.properties.deviceName || '');
        const [field, setField] = useState(data.properties.field || 'state');
        const mountedRef = useRef(true);

        // Sync with node properties
        useEffect(() => {
            mountedRef.current = true;
            
            const originalCallback = data.changeCallback;
            data.changeCallback = () => {
                if (mountedRef.current) {
                    setCurrentValue(data.properties.lastValue);
                    setDeviceName(data.properties.deviceName || '');
                    setField(data.properties.field || 'state');
                }
                if (originalCallback) originalCallback();
            };

            return () => {
                mountedRef.current = false;
                data.changeCallback = originalCallback;
            };
        }, [data]);

        // Get field display label
        const getFieldLabel = () => {
            const domain = data.getDomain ? data.getDomain(data.properties.deviceId) : 'default';
            const fields = FIELD_OPTIONS[domain] || FIELD_OPTIONS.default;
            const fieldInfo = fields.find(f => f.value === field);
            return fieldInfo ? fieldInfo.label : field;
        };

        // Format value for display
        const formatValue = (val) => {
            if (val === null || val === undefined) return '—';
            if (typeof val === 'boolean') return val ? '✓ true' : '✗ false';
            if (Array.isArray(val)) return val.join(', ');
            return String(val);
        };

        // Determine status color
        const getStatusColor = () => {
            if (currentValue === null || currentValue === undefined) return '#666';
            if (currentValue === true || currentValue === 'on' || currentValue === 'home') return '#4caf50';
            if (currentValue === false || currentValue === 'off' || currentValue === 'not_home') return '#f44336';
            return '#2196f3';
        };

        return React.createElement('div', {
            className: 'ha-device-field-node',
            style: { padding: '8px' }
        }, [
            // Header
            React.createElement('div', {
                key: 'header',
                className: 'node-header',
                style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '8px',
                    paddingBottom: '8px',
                    borderBottom: '1px solid rgba(255,255,255,0.1)'
                }
            }, [
                React.createElement('span', { key: 'icon', style: { fontSize: '16px' } }, '📊'),
                React.createElement('span', { 
                    key: 'title',
                    style: { flex: 1, fontWeight: 'bold', fontSize: '13px' }
                }, 'HA Device Field'),
                React.createElement('div', {
                    key: 'status',
                    title: currentValue !== null ? 'Connected' : 'No data',
                    style: {
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: getStatusColor(),
                        boxShadow: `0 0 4px ${getStatusColor()}`
                    }
                }),
                HelpIcon && React.createElement(HelpIcon, { 
                    key: 'help',
                    text: tooltips.node, 
                    size: 14 
                })
            ]),

            // Controls - iterate over data.controls and render each
            React.createElement('div', {
                key: 'controls',
                className: 'controls-container'
            }, Object.entries(data.controls).map(([key, control]) => 
                React.createElement('div', { 
                    key: key, 
                    className: 'control-row',
                    style: { marginBottom: '6px' }
                }, React.createElement(window.RefComponent, {
                    init: ref => emit({ type: 'render', data: { type: 'control', element: ref, payload: control } }),
                    unmount: ref => emit({ type: 'unmount', data: { element: ref } })
                }))
            )),

            // Current value display
            React.createElement('div', {
                key: 'value-display',
                className: 'value-display',
                style: {
                    margin: '12px 0 8px 0',
                    padding: '10px 12px',
                    backgroundColor: 'rgba(0,0,0,0.3)',
                    border: `1px solid ${getStatusColor()}40`,
                    borderRadius: '6px',
                    textAlign: 'center'
                }
            }, [
                React.createElement('div', {
                    key: 'value-label',
                    style: { fontSize: '10px', color: '#888', marginBottom: '4px', textTransform: 'uppercase' }
                }, getFieldLabel()),
                React.createElement('div', {
                    key: 'value',
                    style: { 
                        fontSize: '18px', 
                        fontWeight: 'bold',
                        color: getStatusColor()
                    }
                }, formatValue(currentValue))
            ]),

            // Output socket row
            React.createElement('div', {
                key: 'output-row',
                className: 'socket-row output',
                style: {
                    display: 'flex',
                    justifyContent: 'flex-end',
                    alignItems: 'center',
                    marginTop: '8px'
                }
            }, [
                React.createElement('span', {
                    key: 'output-label',
                    style: { marginRight: '8px', fontSize: '11px', color: '#aaa' }
                }, 'value'),
                React.createElement(window.RefComponent, {
                    key: 'output-ref',
                    init: ref => emit({ type: 'render', data: { type: 'socket', side: 'output', key: 'value', nodeId: data.id, element: ref, payload: data.outputs.value.socket } }),
                    unmount: ref => emit({ type: 'unmount', data: { element: ref } })
                })
            ])
        ]);
    }

    // Register the node
    if (window.nodeRegistry) {
        window.nodeRegistry.register('HADeviceFieldNode', {
            label: "HA Device Field",
            category: "Home Assistant",
            nodeClass: HADeviceFieldNode,
            component: HADeviceFieldNodeComponent,
            factory: (cb) => new HADeviceFieldNode(cb)
        });
        console.log('[HADeviceFieldNode] ✅ Registered');
    }

})();
