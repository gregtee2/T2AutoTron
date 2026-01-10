/**
 * HAThermostatNode.js - Control Home Assistant Climate/Thermostat entities
 * 
 * Supports: Nest, Ecobee, Honeywell, and any HA climate entity
 * 
 * Features:
 * - Visual temperature display with current/target
 * - Mode selector (Heat/Cool/Auto/Off)
 * - Temperature slider with configurable range
 * - Real-time state updates via Socket.IO
 * - Outputs for automation: current_temp, target_temp, hvac_action, etc.
 */

(function() {
    if (!window.Rete || !window.React || !window.nodeRegistry || !window.T2Controls || !window.sockets) {
        console.warn('[HAThermostatNode] Dependencies not ready, waiting...');
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect, useCallback } = React;

    // Get shared controls
    const { DropdownControl, HelpIcon, NodeHeader } = window.T2Controls;

    // Tooltips
    const tooltips = {
        node: "Control Home Assistant thermostats (Nest, Ecobee, Honeywell, etc.).\n\nWire target_temp input to automate setpoint.\nWire hvac_mode input to change modes.",
        target_temp: "Set target temperature. Connect a number value (e.g., 72 for 72°F).",
        hvac_mode: "Set mode: 'heat', 'cool', 'heat_cool', 'auto', or 'off'",
        current_temp: "Current temperature reading from thermostat",
        hvac_action: "What system is doing: heating, cooling, idle, or off"
    };

    // HVAC modes and labels
    const HVAC_MODES = ['off', 'heat', 'cool', 'heat_cool', 'auto'];
    const HVAC_MODE_LABELS = {
        'off': '⏹️ Off',
        'heat': '🔥 Heat',
        'cool': '❄️ Cool',
        'heat_cool': '⚡ Auto',
        'auto': '🤖 Smart'
    };
    const HVAC_ACTION_ICONS = {
        'heating': '🔥',
        'cooling': '❄️',
        'idle': '😴',
        'off': '⏹️'
    };

    /**
     * HAThermostatNode - Rete Node Class
     */
    class HAThermostatNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("HA Thermostat");
            this.width = 300;
            this.height = 360;
            this.changeCallback = changeCallback;

            this.properties = {
                deviceId: '',
                deviceName: '',
                currentTemp: null,
                targetTemp: null,
                hvacMode: 'off',
                hvacAction: 'idle',
                humidity: null,
                tempUnit: '°F',
                minTemp: 50,
                maxTemp: 90,
                supportedModes: HVAC_MODES
            };

            this.devices = [];

            // Add inputs
            this.addInput('target_temp', new ClassicPreset.Input(window.sockets.number, 'Target Temp'));
            this.addInput('hvac_mode', new ClassicPreset.Input(window.sockets.any, 'HVAC Mode'));

            // Add outputs
            this.addOutput('current_temp', new ClassicPreset.Output(window.sockets.number, 'Current Temp'));
            this.addOutput('target_temp_out', new ClassicPreset.Output(window.sockets.number, 'Target Temp'));
            this.addOutput('hvac_mode_out', new ClassicPreset.Output(window.sockets.any, 'Mode'));
            this.addOutput('hvac_action', new ClassicPreset.Output(window.sockets.any, 'Action'));
            this.addOutput('humidity', new ClassicPreset.Output(window.sockets.number, 'Humidity'));

            this.setupControls();
            this.initializeSocketIO();
            this.fetchDevices();
        }

        setupControls() {
            // Device dropdown only - no search needed for thermostats
            this.addControl("device_select", new DropdownControl(
                "Thermostat",
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

            // Listen for graph load complete
            this._onGraphLoadComplete = () => {
                this.fetchDevices();
                if (this.properties.deviceId) {
                    this.fetchCurrentState();
                }
            };
            window.addEventListener('graphLoadComplete', this._onGraphLoadComplete);
        }

        destroy() {
            if (window.socket) {
                if (this._onDeviceStateUpdate) window.socket.off('device-state-update', this._onDeviceStateUpdate);
                if (this._onConnect) window.socket.off('connect', this._onConnect);
            }
            if (this._onGraphLoadComplete) {
                window.removeEventListener('graphLoadComplete', this._onGraphLoadComplete);
            }
        }

        async fetchDevices() {
            if (typeof window !== 'undefined' && window.graphLoading) return;

            try {
                const fetchFn = window.apiFetch || fetch;
                const response = await fetchFn('/api/lights/ha/');
                const data = await response.json();
                
                if (data.success && data.devices) {
                    // Filter to climate entities only
                    this.devices = data.devices.filter(d => d.type === 'climate');
                    console.log('[HAThermostatNode] Found climate devices:', this.devices.length, this.devices.map(d => d.name || d.id));
                    this.updateDeviceDropdown();
                }
            } catch (err) {
                console.error('[HAThermostatNode] Error fetching devices:', err);
            }
        }

        updateDeviceDropdown() {
            const control = this.controls.device_select;
            if (!control) return;

            const options = this.devices.length > 0 
                ? ["— Select Thermostat —", ...this.devices.map(d => d.friendly_name || d.name || d.id)]
                : ["No thermostats found"];
            
            control.values = options;
            
            if (this.properties.deviceName && options.includes(this.properties.deviceName)) {
                control.value = this.properties.deviceName;
            } else {
                control.value = options[0];
            }
            
            if (control.updateDropdown) control.updateDropdown();
            if (this.changeCallback) this.changeCallback();
        }

        onDeviceSelected(name) {
            if (name === "— Select Thermostat —" || name === "No thermostats found" || name === "Loading...") {
                this.properties.deviceId = '';
                this.properties.deviceName = '';
                return;
            }

            const device = this.devices.find(d => 
                (d.friendly_name || d.name || d.id) === name
            );
            
            if (device) {
                this.properties.deviceId = device.id || `ha_${device.entity_id}`;
                this.properties.deviceName = name;
                this.fetchCurrentState();
            }

            if (this.changeCallback) this.changeCallback();
        }

        async fetchCurrentState() {
            if (!this.properties.deviceId) return;

            try {
                const entityId = this.properties.deviceId.replace('ha_', '');
                const fetchFn = window.apiFetch || fetch;
                const response = await fetchFn(`/api/lights/ha/${entityId}/state`);
                const data = await response.json();
                
                if (data.success && data.state) {
                    this.updateFromHAState(data.state);
                    if (this.changeCallback) this.changeCallback();
                }
            } catch (err) {
                console.error('[HAThermostatNode] Error fetching state:', err);
            }
        }

        updateFromHAState(state) {
            const attrs = state.attributes || {};
            
            this.properties.currentTemp = attrs.current_temperature ?? null;
            this.properties.targetTemp = attrs.temperature ?? null;
            this.properties.hvacMode = state.state || 'off';
            this.properties.hvacAction = attrs.hvac_action || 'idle';
            this.properties.humidity = attrs.current_humidity ?? null;
            this.properties.tempUnit = attrs.temperature_unit === 'C' ? '°C' : '°F';
            this.properties.minTemp = attrs.min_temp || 50;
            this.properties.maxTemp = attrs.max_temp || 90;
            this.properties.supportedModes = attrs.hvac_modes || HVAC_MODES;
        }

        handleDeviceStateUpdate(data) {
            if (!data || !this.properties.deviceId) return;
            
            if (data.id === this.properties.deviceId) {
                this.updateFromHAState(data);
                if (this.changeCallback) this.changeCallback();
            }
        }

        async setTemperature(temp) {
            if (!this.properties.deviceId) return;

            const entityId = this.properties.deviceId.replace('ha_', '');
            console.log(`[HAThermostatNode] Setting temperature to ${temp} for ${entityId}`);

            try {
                const fetchFn = window.apiFetch || fetch;
                await fetchFn('/api/lights/ha/service', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        domain: 'climate',
                        service: 'set_temperature',
                        entity_id: entityId,
                        data: { temperature: temp }
                    })
                });
                
                // Optimistic update
                this.properties.targetTemp = temp;
                if (this.changeCallback) this.changeCallback();
            } catch (err) {
                console.error('[HAThermostatNode] Error setting temperature:', err);
            }
        }

        async setHvacMode(mode) {
            if (!this.properties.deviceId) return;

            const entityId = this.properties.deviceId.replace('ha_', '');
            console.log(`[HAThermostatNode] Setting HVAC mode to ${mode} for ${entityId}`);

            try {
                const fetchFn = window.apiFetch || fetch;
                await fetchFn('/api/lights/ha/service', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        domain: 'climate',
                        service: 'set_hvac_mode',
                        entity_id: entityId,
                        data: { hvac_mode: mode }
                    })
                });
                
                // Optimistic update
                this.properties.hvacMode = mode;
                if (this.changeCallback) this.changeCallback();
            } catch (err) {
                console.error('[HAThermostatNode] Error setting HVAC mode:', err);
            }
        }

        data(inputs) {
            // Handle input-driven automation
            const targetTempInput = inputs.target_temp?.[0];
            const hvacModeInput = inputs.hvac_mode?.[0];

            if (targetTempInput !== undefined && targetTempInput !== null) {
                const temp = Number(targetTempInput);
                if (!isNaN(temp) && temp !== this.properties.targetTemp) {
                    this.setTemperature(temp);
                }
            }

            if (hvacModeInput && hvacModeInput !== this.properties.hvacMode) {
                if (HVAC_MODES.includes(hvacModeInput)) {
                    this.setHvacMode(hvacModeInput);
                }
            }

            return {
                current_temp: this.properties.currentTemp,
                target_temp_out: this.properties.targetTemp,
                hvac_mode_out: this.properties.hvacMode,
                hvac_action: this.properties.hvacAction,
                humidity: this.properties.humidity
            };
        }

        serialize() {
            return {
                deviceId: this.properties.deviceId,
                deviceName: this.properties.deviceName
            };
        }

        restore(state) {
            const props = state.properties || state;
            if (props) {
                if (props.deviceId) this.properties.deviceId = props.deviceId;
                if (props.deviceName) this.properties.deviceName = props.deviceName;
            }

            // Restore dropdown value
            const control = this.controls.device_select;
            if (control && this.properties.deviceName) {
                control.value = this.properties.deviceName;
            }

            // Defer device fetch
            setTimeout(() => {
                this.fetchDevices();
                if (this.properties.deviceId) {
                    this.fetchCurrentState();
                }
            }, 500);
        }
    }

    /**
     * HAThermostatNode React Component
     */
    function HAThermostatNodeComponent({ data, emit }) {
        const [props, setProps] = useState({ ...data.properties });

        // Sync with node properties
        useEffect(() => {
            const syncState = () => {
                setProps({ ...data.properties });
            };

            const originalCallback = data.changeCallback;
            data.changeCallback = () => {
                syncState();
                if (originalCallback) originalCallback();
            };

            syncState();

            return () => {
                data.changeCallback = originalCallback;
            };
        }, [data]);

        const handleSetTemp = useCallback((temp) => {
            data.setTemperature(temp);
        }, [data]);

        const handleSetMode = useCallback((mode) => {
            data.setHvacMode(mode);
        }, [data]);

        // Display values
        const currentTemp = props.currentTemp !== null ? Math.round(props.currentTemp) : '--';
        const targetTemp = props.targetTemp !== null ? Math.round(props.targetTemp) : '--';
        const actionIcon = HVAC_ACTION_ICONS[props.hvacAction] || '❓';

        // Ring color based on action
        const ringColor = props.hvacAction === 'heating' ? '#ff6b35' 
                        : props.hvacAction === 'cooling' ? '#4dabf7' 
                        : '#5faa7d';

        // Styles matching HALockNode
        const containerStyle = {
            padding: '8px',
            fontFamily: 'monospace',
            fontSize: '11px'
        };

        const ringContainerStyle = {
            display: 'flex',
            justifyContent: 'center',
            margin: '12px 0'
        };

        const ringStyle = {
            width: '120px',
            height: '120px',
            borderRadius: '50%',
            border: `4px solid ${ringColor}`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.3)',
            boxShadow: `0 0 15px ${ringColor}40`
        };

        const modeContainerStyle = {
            display: 'flex',
            gap: '4px',
            flexWrap: 'wrap',
            justifyContent: 'center',
            margin: '8px 0'
        };

        const modeButtonStyle = (active) => ({
            padding: '6px 10px',
            border: active ? '1px solid #00f3ff' : '1px solid rgba(255,255,255,0.2)',
            borderRadius: '4px',
            background: active ? 'rgba(0,243,255,0.2)' : 'transparent',
            color: active ? '#00f3ff' : '#aaa',
            cursor: 'pointer',
            fontSize: '11px',
            transition: 'all 0.2s'
        });

        const sliderContainerStyle = {
            margin: '12px 0',
            padding: '0 4px'
        };

        const sliderLabelsStyle = {
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '10px',
            color: '#888',
            marginBottom: '4px'
        };

        const humidityStyle = {
            textAlign: 'center',
            fontSize: '11px',
            color: '#888',
            marginTop: '8px'
        };

        return React.createElement('div', { 
            className: 'ha-node-tron',
            style: containerStyle
        }, [
            // Header
            NodeHeader && React.createElement(NodeHeader, {
                key: 'header',
                icon: '🌡️',
                title: 'HA Thermostat',
                tooltip: tooltips.node
            }),

            // Controls (search + dropdown)
            React.createElement('div', { key: 'controls', style: { marginBottom: '8px' } },
                Object.entries(data.controls || {}).map(([key, control]) =>
                    React.createElement(window.RefComponent, {
                        key: key,
                        init: ref => emit({ type: 'render', data: { type: 'control', element: ref, payload: control } })
                    })
                )
            ),

            // Temperature ring (only when device selected)
            props.deviceName && React.createElement('div', { key: 'ring', style: ringContainerStyle },
                React.createElement('div', { style: ringStyle }, [
                    React.createElement('div', {
                        key: 'current',
                        style: { fontSize: '28px', fontWeight: 'bold', color: '#fff' }
                    }, `${currentTemp}${props.tempUnit}`),
                    React.createElement('div', {
                        key: 'target',
                        style: { fontSize: '12px', color: 'rgba(255,255,255,0.6)', marginTop: '2px' }
                    }, `Target: ${targetTemp}${props.tempUnit}`),
                    React.createElement('div', {
                        key: 'action',
                        style: { fontSize: '11px', color: ringColor, marginTop: '4px' }
                    }, `${actionIcon} ${props.hvacAction || 'idle'}`)
                ])
            ),

            // Mode buttons (only when device selected)
            props.deviceName && React.createElement('div', { key: 'modes', style: modeContainerStyle },
                (props.supportedModes || HVAC_MODES).filter(m => HVAC_MODE_LABELS[m]).map(mode =>
                    React.createElement('button', {
                        key: mode,
                        style: modeButtonStyle(props.hvacMode === mode),
                        onClick: () => handleSetMode(mode),
                        onPointerDown: (e) => e.stopPropagation()
                    }, HVAC_MODE_LABELS[mode])
                )
            ),

            // Temperature slider (only when device selected and not off)
            props.deviceName && props.hvacMode !== 'off' && React.createElement('div', { 
                key: 'slider', 
                style: sliderContainerStyle 
            }, [
                React.createElement('div', { key: 'labels', style: sliderLabelsStyle }, [
                    React.createElement('span', { key: 'min' }, `${props.minTemp}${props.tempUnit}`),
                    React.createElement('span', { key: 'set' }, `Set: ${targetTemp}${props.tempUnit}`),
                    React.createElement('span', { key: 'max' }, `${props.maxTemp}${props.tempUnit}`)
                ]),
                React.createElement('input', {
                    key: 'range',
                    type: 'range',
                    min: props.minTemp || 50,
                    max: props.maxTemp || 90,
                    step: 1,
                    value: props.targetTemp || props.minTemp || 50,
                    onChange: (e) => handleSetTemp(Number(e.target.value)),
                    onPointerDown: (e) => e.stopPropagation(),
                    style: { 
                        width: '100%', 
                        accentColor: ringColor,
                        cursor: 'pointer'
                    }
                })
            ]),

            // Humidity (if available)
            props.deviceName && props.humidity !== null && React.createElement('div', {
                key: 'humidity',
                style: humidityStyle
            }, `💧 Humidity: ${Math.round(props.humidity)}%`),

            // Input sockets
            React.createElement('div', { 
                key: 'inputs',
                style: { marginTop: '12px' }
            }, [
                React.createElement('div', { 
                    key: 'temp-input',
                    style: { display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }
                }, [
                    data.inputs?.target_temp && React.createElement(window.RefComponent, {
                        key: 'temp-socket',
                        init: (ref) => emit({ type: 'render', data: { type: 'socket', side: 'input', key: 'target_temp', nodeId: data.id, element: ref, payload: data.inputs.target_temp.socket } })
                    }),
                    React.createElement('span', { 
                        key: 'temp-label',
                        style: { fontSize: '10px', color: '#8a959e', marginLeft: '4px' }
                    }, 'target_temp'),
                    HelpIcon && React.createElement(HelpIcon, { key: 'temp-help', text: tooltips.target_temp, size: 10 })
                ]),
                React.createElement('div', { 
                    key: 'mode-input',
                    style: { display: 'flex', alignItems: 'center', gap: '4px' }
                }, [
                    data.inputs?.hvac_mode && React.createElement(window.RefComponent, {
                        key: 'mode-socket',
                        init: (ref) => emit({ type: 'render', data: { type: 'socket', side: 'input', key: 'hvac_mode', nodeId: data.id, element: ref, payload: data.inputs.hvac_mode.socket } })
                    }),
                    React.createElement('span', { 
                        key: 'mode-label',
                        style: { fontSize: '10px', color: '#8a959e', marginLeft: '4px' }
                    }, 'hvac_mode'),
                    HelpIcon && React.createElement(HelpIcon, { key: 'mode-help', text: tooltips.hvac_mode, size: 10 })
                ])
            ]),

            // Output sockets
            React.createElement('div', { 
                key: 'outputs',
                style: { marginTop: '8px' }
            }, [
                // Current temp
                React.createElement('div', { 
                    key: 'current-row',
                    style: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px', marginBottom: '2px' }
                }, [
                    React.createElement('span', { 
                        key: 'current-label',
                        style: { fontSize: '10px', color: '#8a959e' }
                    }, 'current_temp'),
                    data.outputs?.current_temp && React.createElement(window.RefComponent, {
                        key: 'current-socket',
                        init: (ref) => emit({ type: 'render', data: { type: 'socket', side: 'output', key: 'current_temp', nodeId: data.id, element: ref, payload: data.outputs.current_temp.socket } })
                    })
                ]),
                // Target temp
                React.createElement('div', { 
                    key: 'target-row',
                    style: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px', marginBottom: '2px' }
                }, [
                    React.createElement('span', { 
                        key: 'target-label',
                        style: { fontSize: '10px', color: '#8a959e' }
                    }, 'target_temp'),
                    data.outputs?.target_temp_out && React.createElement(window.RefComponent, {
                        key: 'target-socket',
                        init: (ref) => emit({ type: 'render', data: { type: 'socket', side: 'output', key: 'target_temp_out', nodeId: data.id, element: ref, payload: data.outputs.target_temp_out.socket } })
                    })
                ]),
                // Mode
                React.createElement('div', { 
                    key: 'mode-row',
                    style: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px', marginBottom: '2px' }
                }, [
                    React.createElement('span', { 
                        key: 'mode-label',
                        style: { fontSize: '10px', color: '#8a959e' }
                    }, 'mode'),
                    data.outputs?.hvac_mode_out && React.createElement(window.RefComponent, {
                        key: 'mode-socket',
                        init: (ref) => emit({ type: 'render', data: { type: 'socket', side: 'output', key: 'hvac_mode_out', nodeId: data.id, element: ref, payload: data.outputs.hvac_mode_out.socket } })
                    })
                ]),
                // Action
                React.createElement('div', { 
                    key: 'action-row',
                    style: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px', marginBottom: '2px' }
                }, [
                    React.createElement('span', { 
                        key: 'action-label',
                        style: { fontSize: '10px', color: '#8a959e' }
                    }, 'action'),
                    data.outputs?.hvac_action && React.createElement(window.RefComponent, {
                        key: 'action-socket',
                        init: (ref) => emit({ type: 'render', data: { type: 'socket', side: 'output', key: 'hvac_action', nodeId: data.id, element: ref, payload: data.outputs.hvac_action.socket } })
                    })
                ]),
                // Humidity
                React.createElement('div', { 
                    key: 'humidity-row',
                    style: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }
                }, [
                    React.createElement('span', { 
                        key: 'humidity-label',
                        style: { fontSize: '10px', color: '#8a959e' }
                    }, 'humidity'),
                    data.outputs?.humidity && React.createElement(window.RefComponent, {
                        key: 'humidity-socket',
                        init: (ref) => emit({ type: 'render', data: { type: 'socket', side: 'output', key: 'humidity', nodeId: data.id, element: ref, payload: data.outputs.humidity.socket } })
                    })
                ])
            ])
        ]);
    }

    // Register the node
    window.nodeRegistry.register('HAThermostatNode', {
        label: "HA Thermostat",
        category: "Home Assistant",
        nodeClass: HAThermostatNode,
        component: HAThermostatNodeComponent,
        factory: (cb) => new HAThermostatNode(cb)
    });

    console.log('[HAThermostatNode] Registered successfully');
})();
