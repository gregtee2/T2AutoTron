/**
 * HueEffectNode.js - Trigger Hue light effects (candle, fire, sunrise, etc.)
 * 
 * Sends effect commands to Hue lights via Home Assistant.
 * Effects are built into newer Hue bulbs and add ambient animations.
 */
(function() {
    'use strict';

    // Check dependencies
    if (!window.Rete || !window.React || !window.sockets) {
        console.warn('[HueEffectNode] Missing dependencies, skipping registration');
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect, useRef } = React;
    const socket = window.socket;

    // Available Hue effects (from Hue bulb capabilities)
    const HUE_EFFECTS = [
        { value: 'off', label: '⬚ Off (solid color)' },
        { value: 'candle', label: '🕯️ Candle' },
        { value: 'fire', label: '🔥 Fire' },
        { value: 'prism', label: '🌈 Prism' },
        { value: 'sparkle', label: '✨ Sparkle' },
        { value: 'opal', label: '💎 Opal' },
        { value: 'glisten', label: '💧 Glisten' },
        { value: 'underwater', label: '🌊 Underwater' },
        { value: 'cosmos', label: '🌌 Cosmos' },
        { value: 'sunbeam', label: '☀️ Sunbeam' },
        { value: 'enchant', label: '🪄 Enchant' },
        { value: 'sunrise', label: '🌅 Sunrise' },
        { value: 'sunset', label: '🌇 Sunset' }
    ];

    // =========================================================================
    // NODE CLASS
    // =========================================================================
    class HueEffectNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("Hue Effect");
            this.width = 300;
            this.height = 360;
            this.changeCallback = changeCallback;

            this.properties = {
                entityIds: [],      // Array of HA entity_ids
                effect: 'candle',   // Selected effect
                lastTrigger: null,
                lastSentEffect: null,
                previousStates: {}  // Map of entityId -> captured state
            };

            // Inputs
            this.addInput('trigger', new ClassicPreset.Input(window.sockets.boolean, 'Trigger'));
            this.addInput('hsv_in', new ClassicPreset.Input(window.sockets.object, 'HSV In'));
            
            // Outputs
            this.addOutput('hsv_out', new ClassicPreset.Output(window.sockets.object, 'HSV Out'));
            this.addOutput('active', new ClassicPreset.Output(window.sockets.boolean, 'Active'));
            this.addOutput('applied', new ClassicPreset.Output(window.sockets.boolean, 'Applied'));
        }

        data(inputs) {
            const trigger = inputs.trigger?.[0];
            const hsvIn = inputs.hsv_in?.[0];
            const wasTriggered = this.properties.lastTrigger === true;
            const isTriggered = trigger === true;
            const hasLights = this.properties.entityIds && this.properties.entityIds.length > 0;
            
            // Build HSV output with exclusion metadata when effect is active
            const buildHsvOutput = (active) => {
                if (!hsvIn) return null;
                
                if (active && hasLights) {
                    // Pass HSV through but tell downstream to exclude our lights
                    // Merge with any existing exclusions from upstream HueEffectNodes
                    const existingExcludes = hsvIn._excludeDevices || [];
                    const ourExcludes = this.properties.entityIds || [];
                    const allExcludes = [...new Set([...existingExcludes, ...ourExcludes])];
                    
                    return {
                        ...hsvIn,
                        _excludeDevices: allExcludes
                    };
                }
                
                // Not active - pass through unchanged (preserve any upstream exclusions)
                return hsvIn;
            };
            
            // Detect rising edge (false→true) - activate effect
            if (isTriggered && !wasTriggered && hasLights && this.properties.effect) {
                this.captureStateAndSendEffect();
                this.properties.lastTrigger = trigger;
                return { hsv_out: buildHsvOutput(true), applied: true, active: true };
            }
            
            // Detect falling edge (true→false) - restore previous state
            if (!isTriggered && wasTriggered && hasLights) {
                this.restorePreviousState();
                this.properties.lastTrigger = trigger;
                return { hsv_out: buildHsvOutput(false), applied: false, active: false };
            }

            this.properties.lastTrigger = trigger;
            
            return { 
                hsv_out: buildHsvOutput(isTriggered), 
                applied: false, 
                active: isTriggered 
            };
        }

        async captureStateAndSendEffect() {
            const entityIds = this.properties.entityIds;
            const effect = this.properties.effect;

            if (!entityIds || entityIds.length === 0) return;

            // Capture state for each light
            this.properties.previousStates = {};
            
            const fetchFn = window.apiFetch || fetch;
            for (const entityId of entityIds) {
                try {
                    const stateResponse = await fetchFn(`/api/lights/ha/${entityId.replace('ha_', '')}/state`);
                    if (stateResponse.ok) {
                        const response = await stateResponse.json();
                        const state = response.state || response;
                        const attrs = state.attributes || {};
                        
                        this.properties.previousStates[entityId] = {
                            on: state.state === 'on' || state.on === true,
                            brightness: attrs.brightness ?? state.brightness,
                            hs_color: attrs.hs_color ?? state.hs_color,
                            rgb_color: attrs.rgb_color ?? state.rgb_color,
                            color_temp: attrs.color_temp ?? state.color_temp,
                            effect: attrs.effect ?? state.effect ?? 'none'
                        };
                    }
                } catch (err) {
                    console.warn(`[HueEffectNode] Could not capture state for ${entityId}:`, err);
                }
            }
            
            console.log(`[HueEffectNode] Captured states for ${Object.keys(this.properties.previousStates).length} lights`);

            // Send effect to all lights
            this.sendEffect();
        }

        async sendEffect() {
            const entityIds = this.properties.entityIds;
            const effect = this.properties.effect;

            if (!entityIds || entityIds.length === 0) {
                console.warn('[HueEffectNode] No lights selected');
                return;
            }

            console.log(`[HueEffectNode] Sending effect "${effect}" to ${entityIds.length} lights`);

            // Send to all lights in parallel
            const fetchFn = window.apiFetch || fetch;
            const results = await Promise.all(
                entityIds.map(async (entityId) => {
                    try {
                        const response = await fetchFn('/api/lights/ha/service', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                domain: 'light',
                                service: 'turn_on',
                                entity_id: entityId.replace('ha_', ''),
                                data: { effect: effect }
                            })
                        });
                        return response.ok;
                    } catch (err) {
                        console.error(`[HueEffectNode] Error sending to ${entityId}:`, err);
                        return false;
                    }
                })
            );

            const successCount = results.filter(Boolean).length;
            console.log(`[HueEffectNode] ✅ Effect sent to ${successCount}/${entityIds.length} lights`);
            this.properties.lastSentEffect = effect;
        }

        async restorePreviousState() {
            const entityIds = this.properties.entityIds;
            const prevStates = this.properties.previousStates;

            if (!entityIds || entityIds.length === 0 || !prevStates) {
                console.log('[HueEffectNode] No previous states to restore');
                return;
            }

            console.log(`[HueEffectNode] Restoring ${Object.keys(prevStates).length} lights`);

            // Restore all lights in parallel
            await Promise.all(
                entityIds.map(async (entityId) => {
                    const prev = prevStates[entityId];
                    if (!prev) return;

                    try {
                        // Build the service call data
                        const serviceData = { effect: 'off' };

                        if (prev.brightness !== undefined && prev.brightness !== null) {
                            serviceData.brightness = prev.brightness;
                        }

                        if (prev.hs_color && Array.isArray(prev.hs_color) && prev.hs_color.length === 2) {
                            serviceData.hs_color = prev.hs_color;
                        } else if (prev.rgb_color && Array.isArray(prev.rgb_color) && prev.rgb_color.length === 3) {
                            serviceData.rgb_color = prev.rgb_color;
                        } else if (prev.color_temp !== undefined && prev.color_temp !== null) {
                            serviceData.color_temp = prev.color_temp;
                        }

                        // If light was off, turn it off
                        const fetchFn = window.apiFetch || fetch;
                        if (!prev.on) {
                            await fetchFn('/api/lights/ha/service', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    domain: 'light',
                                    service: 'turn_off',
                                    entity_id: entityId.replace('ha_', '')
                                })
                            });
                            return;
                        }

                        // Restore state
                        await fetchFn('/api/lights/ha/service', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                domain: 'light',
                                service: 'turn_on',
                                entity_id: entityId.replace('ha_', ''),
                                data: serviceData
                            })
                        });
                    } catch (err) {
                        console.error(`[HueEffectNode] Error restoring ${entityId}:`, err);
                    }
                })
            );

            console.log('[HueEffectNode] ✅ All lights restored');
            this.properties.previousStates = {};
        }

        serialize() {
            return { ...this.properties };
        }

        restore(state) {
            if (state.properties) {
                Object.assign(this.properties, state.properties);
            }
        }
    }

    // =========================================================================
    // REACT COMPONENT
    // =========================================================================
    function HueEffectNodeComponent({ data, emit }) {
        const [selectedIds, setSelectedIds] = useState(data.properties.entityIds || []);
        const [effect, setEffect] = useState(data.properties.effect || 'candle');
        const [devices, setDevices] = useState([]);
        const [loading, setLoading] = useState(true);
        const [availableEffects, setAvailableEffects] = useState(null);
        const [expanded, setExpanded] = useState(false);
        const [seed, setSeed] = useState(0);

        // Sync changeCallback for re-renders
        useEffect(() => {
            data.changeCallback = () => setSeed(s => s + 1);
            return () => { data.changeCallback = null; };
        }, [data]);

        // Fetch HA lights and filter to only those that support effects
        useEffect(() => {
            const fetchDevices = async () => {
                const fetchFn = window.apiFetch || fetch;
                try {
                    const response = await fetchFn('/api/devices');
                    const devData = await response.json();
                    
                    // Get all HA lights
                    let haLights = [];
                    if (devData.devices && devData.devices['ha_'] && Array.isArray(devData.devices['ha_'])) {
                        haLights = devData.devices['ha_'].filter(d => 
                            d.id?.startsWith('ha_light.') || d.type === 'light'
                        );
                    }
                    
                    console.log('[HueEffectNode] Found HA lights:', haLights.length, '- checking effect support...');
                    
                    // Check each light for effect support (in parallel, max 10 at a time)
                    const effectCapableLights = [];
                    const batchSize = 10;
                    
                    for (let i = 0; i < haLights.length; i += batchSize) {
                        const batch = haLights.slice(i, i + batchSize);
                        const results = await Promise.all(
                            batch.map(async (light) => {
                                try {
                                    const stateRes = await fetchFn(`/api/lights/ha/${light.id.replace('ha_', '')}/state`);
                                    if (stateRes.ok) {
                                        const result = await stateRes.json();
                                        const attrs = (result.state || result).attributes || {};
                                        if (attrs.effect_list && Array.isArray(attrs.effect_list) && attrs.effect_list.length > 1) {
                                            return { ...light, effectList: attrs.effect_list };
                                        }
                                    }
                                } catch (e) {
                                    // Skip lights that error
                                }
                                return null;
                            })
                        );
                        effectCapableLights.push(...results.filter(Boolean));
                    }
                    
                    // Sort alphabetically by name
                    effectCapableLights.sort((a, b) => {
                        const nameA = (a.name || a.attributes?.friendly_name || a.entity_id || '').toLowerCase();
                        const nameB = (b.name || b.attributes?.friendly_name || b.entity_id || '').toLowerCase();
                        return nameA.localeCompare(nameB);
                    });
                    
                    console.log('[HueEffectNode] ✅ Effect-capable lights:', effectCapableLights.length);
                    setDevices(effectCapableLights);
                    setLoading(false);
                } catch (err) {
                    console.error('[HueEffectNode] Error fetching devices:', err);
                    setLoading(false);
                }
            };

            fetchDevices();
        }, []);

        // Build combined effect list from all selected lights
        useEffect(() => {
            if (selectedIds.length === 0) {
                setAvailableEffects(null);
                return;
            }
            
            const effectSets = selectedIds.map(id => {
                const light = devices.find(d => d.id === id);
                return new Set(light?.effectList || []);
            });
            
            if (effectSets.length === 0) {
                setAvailableEffects(null);
                return;
            }
            
            // Intersection of all effect sets
            let commonEffects = [...effectSets[0]];
            for (let i = 1; i < effectSets.length; i++) {
                commonEffects = commonEffects.filter(e => effectSets[i].has(e));
            }
            
            setAvailableEffects(commonEffects.length > 0 ? commonEffects : null);
        }, [selectedIds, devices]);

        // Sync state changes back to node
        useEffect(() => {
            data.properties.entityIds = selectedIds;
            data.properties.effect = effect;
        }, [selectedIds, effect, data.properties]);

        // Toggle a light in the selection
        const toggleLight = (id) => {
            setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
        };

        const handleTest = () => {
            if (selectedIds.length > 0 && effect) {
                data.sendEffect();
                if (window.T2Toast) {
                    window.T2Toast.success(`Sent "${effect}" to ${selectedIds.length} light(s)`);
                }
            }
        };

        // Get shared components
        const { HelpIcon } = window.T2Controls || {};
        const RefComponent = window.RefComponent;

        const tooltips = {
            node: "Triggers Hue light effects like candle, fire, sunrise, etc.\n\nSit this node INLINE in your color flow:\nTimeline → HueEffect → HA Device\n\nWhen active, selected lights are excluded from HSV commands - other lights continue normally.",
            lights: "Select one or more Hue lights.\nOnly effect-capable bulbs are shown.\n\nThese lights will be excluded from downstream HSV while effect is running.",
            effect: "The animation effect to play.\nCommon effects: candle, fire, prism, sunrise.",
            trigger: "TRUE = play effect\nFALSE = restore previous state\n\nConnect a button, time node, or sensor.",
            hsv_in: "Connect your color source here.\nTimeline, spline, or manual HSV.\n\nPasses through to HSV Out.",
            hsv_out: "Connect to HA Device node.\nHSV flows through with metadata telling downstream to skip effect lights.",
            active: "TRUE while the effect is running.",
            applied: "Pulses TRUE briefly when effect is first sent."
        };

        const inputs = Object.entries(data.inputs || {});
        const outputs = Object.entries(data.outputs || {});

        return React.createElement('div', { className: 'hue-effect-node' }, [
            // Header
            React.createElement('div', { key: 'header', className: 'hue-effect-header' }, [
                React.createElement('div', { key: 'title', className: 'hue-effect-title' }, [
                    React.createElement('span', { key: 'icon', className: 'hue-effect-title-icon' }, '🎆'),
                    React.createElement('span', { key: 'text' }, 'Hue Effect')
                ]),
                HelpIcon && React.createElement(HelpIcon, { key: 'help', text: tooltips.node, size: 14 })
            ]),

            // IO Section
            React.createElement('div', { key: 'io', className: 'hue-effect-io' }, [
                // Inputs
                React.createElement('div', { key: 'inputs', className: 'hue-effect-inputs' },
                    inputs.map(([key, input]) => 
                        React.createElement('div', { key, className: 'hue-effect-socket-row' }, [
                            React.createElement(RefComponent, {
                                key: 'socket',
                                init: ref => emit({ type: "render", data: { type: "socket", element: ref, payload: input.socket, nodeId: data.id, side: "input", key } }),
                                unmount: ref => emit({ type: "unmount", data: { element: ref } })
                            }),
                            React.createElement('span', { key: 'label', className: 'hue-effect-socket-label' }, input.label || key),
                            HelpIcon && tooltips[key] && React.createElement(HelpIcon, { key: 'help', text: tooltips[key], size: 10 })
                        ])
                    )
                ),
                // Outputs
                React.createElement('div', { key: 'outputs', className: 'hue-effect-outputs' },
                    outputs.map(([key, output]) => 
                        React.createElement('div', { key, className: 'hue-effect-socket-row output' }, [
                            HelpIcon && tooltips[key] && React.createElement(HelpIcon, { key: 'help', text: tooltips[key], size: 10 }),
                            React.createElement('span', { key: 'label', className: 'hue-effect-socket-label' }, output.label || key),
                            React.createElement(RefComponent, {
                                key: 'socket',
                                init: ref => emit({ type: "render", data: { type: "socket", element: ref, payload: output.socket, nodeId: data.id, side: "output", key } }),
                                unmount: ref => emit({ type: "unmount", data: { element: ref } })
                            })
                        ])
                    )
                )
            ]),

            // Controls Section
            React.createElement('div', { key: 'controls', className: 'hue-effect-controls' }, [
                // Light selector row
                React.createElement('div', { key: 'lights-row', className: 'hue-effect-row' }, [
                    React.createElement('span', { key: 'label', className: 'hue-effect-label' }, 'Lights'),
                    React.createElement('button', {
                        key: 'toggle',
                        className: 'hue-effect-light-toggle',
                        onClick: () => setExpanded(!expanded),
                        onPointerDown: (e) => e.stopPropagation()
                    }, [
                        React.createElement('span', { key: 'count' }, 
                            loading ? 'Loading...' : `${selectedIds.length} selected`
                        ),
                        React.createElement('span', { key: 'arrow', className: 'arrow' }, expanded ? '▲' : '▼')
                    ]),
                    HelpIcon && React.createElement(HelpIcon, { key: 'help', text: tooltips.lights, size: 12 })
                ]),

                // Collapsible light list
                React.createElement('div', { 
                    key: 'light-list', 
                    className: `hue-effect-light-list ${expanded ? 'expanded' : ''}`,
                    onWheel: (e) => e.stopPropagation()
                },
                    devices.map(d => {
                        const id = d.id || `ha_${d.entity_id}`;
                        const name = d.name || d.attributes?.friendly_name || d.entity_id;
                        const isSelected = selectedIds.includes(id);
                        return React.createElement('label', { 
                            key: id, 
                            className: `hue-effect-light-item ${isSelected ? 'selected' : ''}`,
                            onPointerDown: (e) => e.stopPropagation()
                        }, [
                            React.createElement('input', {
                                key: 'cb',
                                type: 'checkbox',
                                checked: isSelected,
                                onChange: () => toggleLight(id)
                            }),
                            React.createElement('span', { key: 'name' }, name)
                        ]);
                    })
                ),

                // Effect selector row
                React.createElement('div', { key: 'effect-row', className: 'hue-effect-row' }, [
                    React.createElement('span', { key: 'label', className: 'hue-effect-label' }, 'Effect'),
                    React.createElement('select', {
                        key: 'select',
                        className: 'hue-effect-select',
                        value: effect,
                        onChange: (e) => setEffect(e.target.value),
                        onPointerDown: (e) => e.stopPropagation()
                    },
                        (availableEffects || HUE_EFFECTS.map(e => e.value)).map(eff => {
                            const value = typeof eff === 'string' ? eff : eff.value;
                            const label = typeof eff === 'string' 
                                ? (HUE_EFFECTS.find(h => h.value === eff)?.label || eff)
                                : eff.label;
                            return React.createElement('option', { key: value, value }, label);
                        })
                    ),
                    HelpIcon && React.createElement(HelpIcon, { key: 'help', text: tooltips.effect, size: 12 })
                ]),

                // Test button
                React.createElement('button', {
                    key: 'test-btn',
                    className: 'hue-effect-test-btn',
                    onClick: handleTest,
                    onPointerDown: (e) => e.stopPropagation(),
                    disabled: selectedIds.length === 0
                }, '▶ Test Effect')
            ])
        ]);
    }

    // =========================================================================
    // REGISTRATION
    // =========================================================================
    if (window.nodeRegistry) {
        window.nodeRegistry.register('HueEffectNode', {
            label: "Hue Effect",
            category: "Home Assistant",
            nodeClass: HueEffectNode,
            component: HueEffectNodeComponent,
            factory: (cb) => new HueEffectNode(cb)
        });
        console.log('[HueEffectNode] ✅ Registered');
    }

})();
