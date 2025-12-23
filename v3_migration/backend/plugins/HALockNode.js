/**
 * HALockNode.js - HA Lock Control Node
 * 
 * Controls Home Assistant lock entities with lock/unlock buttons
 * and trigger input for automation.
 * 
 * Inputs:
 *   - trigger: Boolean (true = unlock, false = lock)
 * 
 * Outputs:
 *   - state: "locked" or "unlocked"
 *   - is_locked: true/false for logic gates
 */

(function() {
    // Dependency check
    if (!window.Rete || !window.React || !window.nodeRegistry || !window.T2Controls || !window.sockets) {
        console.warn('[HALockNode] Dependencies not ready, waiting...');
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect, useCallback } = React;

    // Get shared controls
    const { DropdownControl, InputControl, ButtonControl, HelpIcon, NodeHeader } = window.T2Controls;

    // Tooltips
    const tooltips = {
        node: "Control Home Assistant lock entities. Wire a trigger input for automation, or use the buttons for manual control.",
        trigger: "Boolean input: TRUE = unlock, FALSE = lock. Connect to presence sensors, time triggers, or buttons.",
        state: "Current lock state: 'locked' or 'unlocked'",
        isLocked: "Boolean output for logic gates: true when locked, false when unlocked"
    };

    /**
     * HALockNode - Rete Node Class
     */
    class HALockNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("HA Lock Control");
            this.width = 280;
            this.height = 260;  // Increased for retry options
            this.changeCallback = changeCallback;

            this.properties = {
                deviceId: '',
                deviceName: '',
                searchText: '',
                currentState: 'unknown',
                lastTrigger: null,
                triggerInitialized: false,  // Skip first value to prevent false triggers on load
                // Retry/Verify settings
                retryEnabled: true,         // Enable verify & retry
                retryDelay: 5000,           // Wait 5 seconds before checking
                maxRetries: 3,              // Try up to 3 times
                retryCount: 0,              // Current retry count
                lastCommandAction: null,    // 'lock' or 'unlock'
                lastCommandTime: null       // When command was sent
            };

            this.devices = [];
            this._retryTimer = null;

            // Add input for trigger
            this.addInput('trigger', new ClassicPreset.Input(window.sockets.boolean, 'Trigger'));

            // Add outputs
            this.addOutput('state', new ClassicPreset.Output(window.sockets.any, 'State'));
            this.addOutput('is_locked', new ClassicPreset.Output(window.sockets.boolean, 'Is Locked'));

            this.setupControls();
            this.initializeSocketIO();
            this.fetchDevices();
        }

        setupControls() {
            // Search field
            this.addControl("search", new InputControl(
                "🔍 Search",
                "",
                (v) => {
                    this.properties.searchText = v;
                    this.updateDeviceDropdown();
                },
                { placeholder: "Type to filter locks..." }
            ));

            // Device dropdown (locks only)
            this.addControl("device_select", new DropdownControl(
                "Lock",
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

            // Listen for graph load complete to fetch devices
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
            if (this._retryTimer) {
                clearTimeout(this._retryTimer);
                this._retryTimer = null;
            }
        }

        async fetchDevices() {
            if (typeof window !== 'undefined' && window.graphLoading) return;

            try {
                const fetchFn = window.apiFetch || fetch;
                const response = await fetchFn('/api/lights/ha/');
                const data = await response.json();
                
                if (data.success && data.devices) {
                    // Filter to locks only
                    this.devices = data.devices.filter(d => d.type === 'lock');
                    this.updateDeviceDropdown();
                }
            } catch (err) {
                console.error('[HALockNode] Error fetching devices:', err);
            }
        }

        updateDeviceDropdown() {
            const control = this.controls.device_select;
            if (!control) return;

            let filtered = this.devices;

            // Apply search filter
            const searchText = (this.properties.searchText || '').toLowerCase().trim();
            if (searchText) {
                filtered = filtered.filter(d => {
                    const name = (d.friendly_name || d.name || d.id || '').toLowerCase();
                    const entityId = (d.entity_id || d.id || '').toLowerCase();
                    return name.includes(searchText) || entityId.includes(searchText);
                });
            }

            const options = filtered.length > 0 
                ? ["— Select Lock —", ...filtered.map(d => d.friendly_name || d.name || d.id)]
                : ["No locks found"];
            
            control.values = options;
            
            if (this.properties.deviceName && options.includes(this.properties.deviceName)) {
                control.value = this.properties.deviceName;
            } else {
                control.value = options[0];
            }
            
            if (control.updateDropdown) control.updateDropdown();
            
            // Trigger re-render so UI updates
            if (this.changeCallback) this.changeCallback();
        }

        onDeviceSelected(name) {
            if (name === "— Select Lock —" || name === "No locks found" || name === "Loading...") {
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
                    this.properties.currentState = data.state.state || 'unknown';
                    if (this.changeCallback) this.changeCallback();
                }
            } catch (err) {
                console.error('[HALockNode] Error fetching state:', err);
            }
        }

        handleDeviceStateUpdate(data) {
            if (!data || !this.properties.deviceId) return;
            
            if (data.id === this.properties.deviceId) {
                this.properties.currentState = data.state || 'unknown';
                if (this.changeCallback) this.changeCallback();
            }
        }

        async sendLockCommand(action, isRetry = false) {
            if (!this.properties.deviceId) return;

            const entityId = this.properties.deviceId.replace('ha_', '');
            const service = action === 'lock' ? 'lock' : 'unlock';

            // Track the command for retry logic
            if (!isRetry) {
                this.properties.retryCount = 0;
                this.properties.lastCommandAction = action;
                this.properties.lastCommandTime = Date.now();
            }

            console.log(`[HALockNode] Sending ${action} command to ${entityId} (attempt ${this.properties.retryCount + 1}/${this.properties.maxRetries})`);

            try {
                const fetchFn = window.apiFetch || fetch;
                await fetchFn('/api/lights/ha/service', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        domain: 'lock',
                        service: service,
                        entity_id: entityId
                    })
                });
                
                // Optimistically update state
                this.properties.currentState = action === 'lock' ? 'locked' : 'unlocked';
                if (this.changeCallback) this.changeCallback();

                // Schedule verification if retry is enabled
                if (this.properties.retryEnabled) {
                    this.scheduleVerification(action);
                }
            } catch (err) {
                console.error(`[HALockNode] Error sending ${action} command:`, err);
            }
        }

        scheduleVerification(expectedAction) {
            // Clear any existing retry timer
            if (this._retryTimer) {
                clearTimeout(this._retryTimer);
            }

            this._retryTimer = setTimeout(async () => {
                this._retryTimer = null;
                await this.verifyAndRetry(expectedAction);
            }, this.properties.retryDelay);
        }

        async sendTelegramNotification(message) {
            try {
                const fetchFn = window.apiFetch || fetch;
                await fetchFn('/api/telegram/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message })
                });
                console.log('[HALockNode] Telegram notification sent');
            } catch (err) {
                console.error('[HALockNode] Telegram notification failed:', err.message);
            }
        }

        async verifyAndRetry(expectedAction) {
            if (!this.properties.deviceId) return;

            // Fetch fresh state from HA
            try {
                const entityId = this.properties.deviceId.replace('ha_', '');
                const fetchFn = window.apiFetch || fetch;
                const response = await fetchFn(`/api/lights/ha/${entityId}/state`);
                const data = await response.json();
                
                if (data.success && data.state) {
                    const actualState = data.state.state || 'unknown';
                    this.properties.currentState = actualState;
                    
                    const expectedState = expectedAction === 'lock' ? 'locked' : 'unlocked';
                    const deviceName = this.properties.deviceName || 'Lock';
                    const icon = expectedAction === 'lock' ? '🔒' : '🔓';
                    const time = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                    
                    if (actualState === expectedState) {
                        console.log(`[HALockNode] ✅ Verified: Lock is ${actualState} as expected`);
                        this.properties.retryCount = 0;  // Reset on success
                        
                        // Send Telegram notification on confirmed state change
                        this.sendTelegramNotification(`${icon} *${deviceName}* ${actualState} at ${time}`);
                    } else {
                        console.log(`[HALockNode] ❌ Mismatch: Expected ${expectedState}, got ${actualState}`);
                        
                        // Retry if we haven't exceeded max retries
                        if (this.properties.retryCount < this.properties.maxRetries - 1) {
                            this.properties.retryCount++;
                            console.log(`[HALockNode] 🔄 Retrying ${expectedAction} (attempt ${this.properties.retryCount + 1}/${this.properties.maxRetries})`);
                            await this.sendLockCommand(expectedAction, true);
                        } else {
                            console.error(`[HALockNode] ⚠️ Max retries (${this.properties.maxRetries}) exceeded. Lock may be stuck in ${actualState} state.`);
                            this.properties.retryCount = 0;  // Reset for next command
                            
                            // Send warning notification that lock failed
                            this.sendTelegramNotification(`⚠️ *${deviceName}* failed to ${expectedAction} after ${this.properties.maxRetries} attempts!`);
                        }
                    }
                    
                    if (this.changeCallback) this.changeCallback();
                }
            } catch (err) {
                console.error('[HALockNode] Error verifying state:', err);
            }
        }

        data(inputs) {
            // Handle trigger input
            const triggerInput = inputs.trigger?.[0];
            
            // Pulse Mode support:
            // - undefined → false/true = ACT (rising/falling edge from pulse)
            // - false/true → undefined = reset (pulse ended, ready for next)
            // - false → true or true → false = ACT (value change)
            
            if (triggerInput !== undefined) {
                // Got a real value (true or false)
                if (this.properties.lastTrigger !== triggerInput) {
                    // Value changed (or came from undefined) - ACT
                    console.log(`[HALockNode] Trigger changed: ${this.properties.lastTrigger} → ${triggerInput}`);
                    this.properties.lastTrigger = triggerInput;
                    
                    if (this.properties.deviceId) {
                        // true = unlock, false = lock
                        this.sendLockCommand(triggerInput ? 'unlock' : 'lock');
                    }
                }
            } else {
                // Input is undefined - reset for next pulse
                if (this.properties.lastTrigger !== undefined) {
                    console.log('[HALockNode] Trigger reset to undefined (ready for next pulse)');
                    this.properties.lastTrigger = undefined;
                }
            }

            const isLocked = this.properties.currentState === 'locked';

            return {
                state: this.properties.currentState,
                is_locked: isLocked
            };
        }

        serialize() {
            return {
                deviceId: this.properties.deviceId,
                deviceName: this.properties.deviceName,
                searchText: this.properties.searchText,
                currentState: this.properties.currentState,
                retryEnabled: this.properties.retryEnabled,
                retryDelay: this.properties.retryDelay,
                maxRetries: this.properties.maxRetries
            };
        }

        restore(state) {
            const props = state.properties || state;
            if (props) {
                Object.assign(this.properties, props);
                // Ensure retry settings have defaults if missing from old saves
                if (this.properties.retryEnabled === undefined) this.properties.retryEnabled = true;
                if (this.properties.retryDelay === undefined) this.properties.retryDelay = 5000;
                if (this.properties.maxRetries === undefined) this.properties.maxRetries = 3;
            }

            // Reset trigger detection - start with undefined so first pulse triggers action
            this.properties.lastTrigger = undefined;
            this.properties.retryCount = 0;

            // Restore dropdown value
            const control = this.controls.device_select;
            if (control && this.properties.deviceName) {
                control.value = this.properties.deviceName;
            }

            // Restore search
            const searchControl = this.controls.search;
            if (searchControl && this.properties.searchText) {
                searchControl.value = this.properties.searchText;
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
     * HALockNode React Component
     */
    function HALockNodeComponent({ data, emit }) {
        const [currentState, setCurrentState] = useState(data.properties?.currentState || 'unknown');
        const [deviceName, setDeviceName] = useState(data.properties?.deviceName || '');

        // Sync with node properties
        useEffect(() => {
            const syncState = () => {
                setCurrentState(data.properties?.currentState || 'unknown');
                setDeviceName(data.properties?.deviceName || '');
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

        const handleLock = useCallback(() => {
            data.sendLockCommand('lock');
        }, [data]);

        const handleUnlock = useCallback(() => {
            data.sendLockCommand('unlock');
        }, [data]);

        const isLocked = currentState === 'locked';
        const isUnlocked = currentState === 'unlocked';

        // Styles
        const containerStyle = {
            padding: '8px',
            fontFamily: 'monospace',
            fontSize: '11px'
        };

        const statusStyle = {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '12px',
            margin: '8px 0',
            background: isLocked ? 'rgba(95, 170, 125, 0.15)' : 
                        isUnlocked ? 'rgba(212, 160, 84, 0.15)' : 
                        'rgba(100, 100, 100, 0.15)',
            borderRadius: '6px',
            border: `1px solid ${isLocked ? 'rgba(95, 170, 125, 0.4)' : 
                                 isUnlocked ? 'rgba(212, 160, 84, 0.4)' : 
                                 'rgba(100, 100, 100, 0.4)'}`,
            fontSize: '14px',
            fontWeight: 'bold',
            color: isLocked ? '#5faa7d' : isUnlocked ? '#d4a054' : '#888'
        };

        const buttonContainerStyle = {
            display: 'flex',
            gap: '8px',
            justifyContent: 'center',
            marginTop: '8px'
        };

        const buttonStyle = (active, color) => ({
            flex: 1,
            padding: '10px 16px',
            border: `1px solid ${color}`,
            borderRadius: '6px',
            background: active ? color : 'transparent',
            color: active ? '#000' : color,
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 'bold',
            transition: 'all 0.2s'
        });

        // Border style based on lock state
        const borderStyle = isLocked 
            ? '1px solid rgba(95, 170, 125, 0.5)' 
            : isUnlocked 
            ? '1px solid rgba(212, 160, 84, 0.5)' 
            : '1px solid rgba(0, 243, 255, 0.3)';
        const boxShadowStyle = isLocked 
            ? '0 0 15px rgba(95, 170, 125, 0.3), inset 0 0 10px rgba(95, 170, 125, 0.1)' 
            : isUnlocked 
            ? '0 0 15px rgba(212, 160, 84, 0.3), inset 0 0 10px rgba(212, 160, 84, 0.1)' 
            : 'none';

        return React.createElement('div', { 
            className: 'ha-node-tron',
            style: {
                ...containerStyle,
                border: borderStyle,
                boxShadow: boxShadowStyle,
                transition: 'border 0.3s ease, box-shadow 0.3s ease'
            }
        }, [
            // Header
            NodeHeader && React.createElement(NodeHeader, {
                key: 'header',
                icon: '🔐',
                title: 'HA Lock Control',
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

            // Status display
            deviceName && React.createElement('div', { key: 'status', style: statusStyle }, [
                React.createElement('span', { key: 'icon' }, isLocked ? '🔒' : isUnlocked ? '🔓' : '❓'),
                React.createElement('span', { key: 'text' }, currentState.toUpperCase())
            ]),

            // Lock/Unlock buttons
            deviceName && React.createElement('div', { key: 'buttons', style: buttonContainerStyle }, [
                React.createElement('button', {
                    key: 'unlock',
                    style: buttonStyle(isUnlocked, '#d4a054'),
                    onClick: handleUnlock,
                    onPointerDown: (e) => e.stopPropagation(),
                    title: 'Unlock the door'
                }, '🔓 Unlock'),
                React.createElement('button', {
                    key: 'lock',
                    style: buttonStyle(isLocked, '#5faa7d'),
                    onClick: handleLock,
                    onPointerDown: (e) => e.stopPropagation(),
                    title: 'Lock the door'
                }, '🔒 Lock')
            ]),

            // Input socket
            React.createElement('div', { 
                key: 'input',
                style: { marginTop: '12px', display: 'flex', alignItems: 'center', gap: '4px' }
            }, [
                data.inputs?.trigger && React.createElement(window.RefComponent, {
                    key: 'trigger-socket',
                    init: (ref) => emit({ type: 'render', data: { type: 'socket', side: 'input', key: 'trigger', nodeId: data.id, element: ref, payload: data.inputs.trigger.socket } })
                }),
                React.createElement('span', { 
                    key: 'trigger-label',
                    style: { fontSize: '10px', color: '#8a959e', marginLeft: '4px' }
                }, 'Trigger (true=unlock)'),
                HelpIcon && React.createElement(HelpIcon, { key: 'trigger-help', text: tooltips.trigger, size: 10 })
            ]),

            // Output sockets
            React.createElement('div', { 
                key: 'outputs',
                style: { marginTop: '8px' }
            }, [
                // State output
                React.createElement('div', { 
                    key: 'state-row',
                    style: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px', marginBottom: '4px' }
                }, [
                    React.createElement('span', { 
                        key: 'state-label',
                        style: { fontSize: '10px', color: '#8a959e' }
                    }, 'state'),
                    data.outputs?.state && React.createElement(window.RefComponent, {
                        key: 'state-socket',
                        init: (ref) => emit({ type: 'render', data: { type: 'socket', side: 'output', key: 'state', nodeId: data.id, element: ref, payload: data.outputs.state.socket } })
                    })
                ]),
                // Is Locked output
                React.createElement('div', { 
                    key: 'locked-row',
                    style: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }
                }, [
                    React.createElement('span', { 
                        key: 'locked-label',
                        style: { fontSize: '10px', color: '#8a959e' }
                    }, 'is_locked'),
                    data.outputs?.is_locked && React.createElement(window.RefComponent, {
                        key: 'locked-socket',
                        init: (ref) => emit({ type: 'render', data: { type: 'socket', side: 'output', key: 'is_locked', nodeId: data.id, element: ref, payload: data.outputs.is_locked.socket } })
                    })
                ])
            ])
        ]);
    }

    // Register the node
    window.nodeRegistry.register('HALockNode', {
        label: "HA Lock Control",
        category: "Home Assistant",
        nodeClass: HALockNode,
        component: HALockNodeComponent,
        factory: (cb) => new HALockNode(cb)
    });

    console.log('[HALockNode] Registered successfully');
})();
