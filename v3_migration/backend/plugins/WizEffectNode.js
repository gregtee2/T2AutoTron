/**
 * WizEffectNode.js - Trigger WiZ light effects (Fireplace, Ocean, Party, etc.)
 * 
 * Sends effect commands to WiZ lights via Home Assistant.
 * WiZ bulbs have 35+ built-in scenes/effects.
 */
(function() {
    'use strict';

    // Check dependencies
    if (!window.Rete || !window.React || !window.sockets) {
        console.warn('[WizEffectNode] Missing dependencies, skipping registration');
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect, useRef } = React;
    const socket = window.socket;

    // Available WiZ effects (from pywizlight scenes.py)
    const WIZ_EFFECTS = [
        { value: 'Ocean', label: '🌊 Ocean' },
        { value: 'Romance', label: '💕 Romance' },
        { value: 'Sunset', label: '🌅 Sunset' },
        { value: 'Party', label: '🎉 Party' },
        { value: 'Fireplace', label: '🔥 Fireplace' },
        { value: 'Cozy', label: '🛋️ Cozy' },
        { value: 'Forest', label: '🌲 Forest' },
        { value: 'Pastel colors', label: '🎨 Pastel colors' },
        { value: 'Wake-up', label: '⏰ Wake-up' },
        { value: 'Bedtime', label: '😴 Bedtime' },
        { value: 'Warm white', label: '🌡️ Warm white' },
        { value: 'Daylight', label: '☀️ Daylight' },
        { value: 'Cool white', label: '❄️ Cool white' },
        { value: 'Night light', label: '🌙 Night light' },
        { value: 'Focus', label: '🎯 Focus' },
        { value: 'Relax', label: '😌 Relax' },
        { value: 'True colors', label: '🌈 True colors' },
        { value: 'TV time', label: '📺 TV time' },
        { value: 'Plantgrowth', label: '🌱 Plantgrowth' },
        { value: 'Spring', label: '🌸 Spring' },
        { value: 'Summer', label: '☀️ Summer' },
        { value: 'Fall', label: '🍂 Fall' },
        { value: 'Deep dive', label: '🤿 Deep dive' },
        { value: 'Jungle', label: '🌴 Jungle' },
        { value: 'Mojito', label: '🍹 Mojito' },
        { value: 'Club', label: '🕺 Club' },
        { value: 'Christmas', label: '🎄 Christmas' },
        { value: 'Halloween', label: '🎃 Halloween' },
        { value: 'Candlelight', label: '🕯️ Candlelight' },
        { value: 'Golden white', label: '✨ Golden white' },
        { value: 'Pulse', label: '💓 Pulse' },
        { value: 'Steampunk', label: '⚙️ Steampunk' },
        { value: 'Diwali', label: '🪔 Diwali' },
        { value: 'White', label: '⬜ White' },
        { value: 'Alarm', label: '🚨 Alarm' },
        { value: 'Snowy sky', label: '❄️ Snowy sky' },
        { value: 'Rhythm', label: '🎵 Rhythm' }
    ];

    // Effects that support speed adjustment (dynamic/animated effects)
    const SPEED_EFFECTS = [
        'Ocean', 'Party', 'Club', 'Christmas', 'Halloween', 'Fireplace', 
        'Candlelight', 'Pulse', 'Alarm', 'Romance', 'Forest', 'Deep dive',
        'Jungle', 'Mojito', 'Spring', 'Summer', 'Fall', 'Pastel colors',
        'Rhythm', 'Steampunk', 'Diwali', 'Snowy sky'
    ];

    // =========================================================================
    // NODE CLASS
    // =========================================================================
    class WizEffectNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("WiZ Effect");
            this.width = 300;
            this.height = 400;
            this.changeCallback = changeCallback;

            this.properties = {
                entityIds: [],       // Array of HA entity_ids
                effect: 'Fireplace', // Selected effect from dropdown (fallback)
                speed: 100,          // Effect speed 0-200 (100 = normal, 0 = slowest, 200 = fastest)
                lastTrigger: null,
                lastSentEffect: null,
                previousStates: {}   // Map of entityId -> captured state
            };

            // Inputs
            this.addInput('trigger', new ClassicPreset.Input(window.sockets.boolean, 'Trigger'));
            this.addInput('effect_name', new ClassicPreset.Input(window.sockets.any, 'Effect'));
            this.addInput('hsv_in', new ClassicPreset.Input(window.sockets.object, 'HSV In'));
            
            // Outputs
            this.addOutput('hsv_out', new ClassicPreset.Output(window.sockets.object, 'HSV Out'));
            this.addOutput('active', new ClassicPreset.Output(window.sockets.boolean, 'Active'));
            this.addOutput('applied', new ClassicPreset.Output(window.sockets.boolean, 'Applied'));
        }

        // Get current effect - input takes priority over dropdown
        getCurrentEffect(inputs) {
            const inputEffect = inputs?.effect_name?.[0];
            if (inputEffect && typeof inputEffect === 'string') {
                return inputEffect;
            }
            return this.properties.effect;
        }

        data(inputs) {
            const trigger = inputs.trigger?.[0];
            const hsvIn = inputs.hsv_in?.[0];
            const wasTriggered = this.properties.lastTrigger === true;
            const isTriggered = trigger === true;
            const hasLights = this.properties.entityIds && this.properties.entityIds.length > 0;
            const currentEffect = this.getCurrentEffect(inputs);
            
            // Build HSV output with exclusion metadata when effect is active
            const buildHsvOutput = (active) => {
                if (!hsvIn) return null;
                
                if (active && hasLights) {
                    // Pass HSV through but tell downstream to exclude our lights
                    const existingExcludes = hsvIn._excludeDevices || [];
                    const ourExcludes = this.properties.entityIds || [];
                    const allExcludes = [...new Set([...existingExcludes, ...ourExcludes])];
                    
                    return {
                        ...hsvIn,
                        _excludeDevices: allExcludes
                    };
                }
                
                return hsvIn;
            };
            
            // Detect rising edge (false→true) - activate effect
            if (isTriggered && !wasTriggered && hasLights && currentEffect) {
                this.captureStateAndSendEffect(currentEffect);
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

        async captureStateAndSendEffect(effectToSend) {
            const entityIds = this.properties.entityIds;
            const effect = effectToSend || this.properties.effect;

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
                            rgb_color: attrs.rgb_color ?? state.rgb_color,
                            color_temp: attrs.color_temp ?? state.color_temp,
                            effect: attrs.effect ?? state.effect ?? null
                        };
                    }
                } catch (err) {
                    console.warn(`[WizEffectNode] Could not capture state for ${entityId}:`, err);
                }
            }
            
            console.log(`[WizEffectNode] Captured states for ${Object.keys(this.properties.previousStates).length} lights`);

            // Send effect to all lights
            this.sendEffect(effect);
        }

        async sendEffect(effectToSend) {
            const entityIds = this.properties.entityIds;
            const effect = effectToSend || this.properties.effect;

            if (!entityIds || entityIds.length === 0) {
                console.warn('[WizEffectNode] No lights selected');
                return;
            }

            console.log(`[WizEffectNode] Sending effect "${effect}" to ${entityIds.length} lights`);

            // Check if this effect supports speed
            const supportsSpeed = SPEED_EFFECTS.includes(effect);
            const speed = this.properties.speed;

            // Send to all lights in parallel
            const fetchFn = window.apiFetch || fetch;
            const results = await Promise.all(
                entityIds.map(async (entityId) => {
                    try {
                        // Build service data - only include speed for supported effects
                        const serviceData = { effect: effect };
                        if (supportsSpeed && speed !== 100) {
                            // WiZ speed: 0-200 where 100 is normal
                            serviceData.speed = Math.round(speed);
                        }
                        
                        const response = await fetchFn('/api/lights/ha/service', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                domain: 'light',
                                service: 'turn_on',
                                entity_id: entityId.replace('ha_', ''),
                                data: serviceData
                            })
                        });
                        return response.ok;
                    } catch (err) {
                        console.error(`[WizEffectNode] Error sending to ${entityId}:`, err);
                        return false;
                    }
                })
            );

            const successCount = results.filter(Boolean).length;
            console.log(`[WizEffectNode] ✅ Effect sent to ${successCount}/${entityIds.length} lights`);
            this.properties.lastSentEffect = effect;
        }

        async restorePreviousState() {
            const entityIds = this.properties.entityIds;
            const prevStates = this.properties.previousStates;

            if (!entityIds || entityIds.length === 0 || !prevStates) {
                console.log('[WizEffectNode] No previous states to restore');
                return;
            }

            console.log(`[WizEffectNode] Restoring ${Object.keys(prevStates).length} lights`);

            // Restore all lights in parallel
            const fetchFn = window.apiFetch || fetch;
            await Promise.all(
                entityIds.map(async (entityId) => {
                    const prev = prevStates[entityId];
                    if (!prev) return;

                    try {
                        // If light was off, turn it off
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

                        // Build the service call data to restore state
                        const serviceData = {};

                        if (prev.brightness !== undefined && prev.brightness !== null) {
                            serviceData.brightness = prev.brightness;
                        }

                        if (prev.rgb_color && Array.isArray(prev.rgb_color) && prev.rgb_color.length === 3) {
                            serviceData.rgb_color = prev.rgb_color;
                        } else if (prev.color_temp !== undefined && prev.color_temp !== null) {
                            serviceData.color_temp = prev.color_temp;
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
                        console.error(`[WizEffectNode] Error restoring ${entityId}:`, err);
                    }
                })
            );

            console.log('[WizEffectNode] ✅ All lights restored');
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
    function WizEffectNodeComponent({ data, emit }) {
        const [selectedIds, setSelectedIds] = useState(data.properties.entityIds || []);
        const [effect, setEffect] = useState(data.properties.effect || 'Fireplace');
        const [speed, setSpeed] = useState(data.properties.speed ?? 100);
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

        // Fetch HA lights and filter to WiZ lights (those with WiZ-style effects)
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
                    
                    console.log('[WizEffectNode] Found HA lights:', haLights.length, '- checking for WiZ lights...');
                    
                    // Check each light for WiZ-style effect support (in parallel, max 10 at a time)
                    const wizLights = [];
                    const batchSize = 10;
                    
                    // WiZ-specific effects to look for
                    const wizIndicators = ['Fireplace', 'Ocean', 'Romance', 'Party', 'Club', 'Mojito', 'Jungle'];
                    
                    for (let i = 0; i < haLights.length; i += batchSize) {
                        const batch = haLights.slice(i, i + batchSize);
                        const results = await Promise.all(
                            batch.map(async (light) => {
                                try {
                                    const stateRes = await fetchFn(`/api/lights/ha/${light.id.replace('ha_', '')}/state`);
                                    if (stateRes.ok) {
                                        const result = await stateRes.json();
                                        const attrs = (result.state || result).attributes || {};
                                        if (attrs.effect_list && Array.isArray(attrs.effect_list)) {
                                            // Check if it has WiZ-style effects
                                            const hasWizEffects = wizIndicators.some(e => attrs.effect_list.includes(e));
                                            if (hasWizEffects) {
                                                return { ...light, effectList: attrs.effect_list };
                                            }
                                        }
                                    }
                                } catch (e) {
                                    // Skip lights that error
                                }
                                return null;
                            })
                        );
                        wizLights.push(...results.filter(Boolean));
                    }
                    
                    // Sort alphabetically by name
                    wizLights.sort((a, b) => {
                        const nameA = (a.name || a.attributes?.friendly_name || a.entity_id || '').toLowerCase();
                        const nameB = (b.name || b.attributes?.friendly_name || b.entity_id || '').toLowerCase();
                        return nameA.localeCompare(nameB);
                    });
                    
                    console.log('[WizEffectNode] ✅ WiZ lights found:', wizLights.length);
                    setDevices(wizLights);
                    setLoading(false);
                } catch (err) {
                    console.error('[WizEffectNode] Error fetching devices:', err);
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
            data.properties.speed = speed;
        }, [selectedIds, effect, speed, data.properties]);
        
        // Check if current effect supports speed
        const effectSupportsSpeed = SPEED_EFFECTS.includes(effect);

        // Toggle a light in the selection
        const toggleLight = (id) => {
            setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
        };

        const handleTest = () => {
            if (selectedIds.length > 0 && effect) {
                data.sendEffect(effect);
                if (window.T2Toast) {
                    window.T2Toast.success(`Sent "${effect}" to ${selectedIds.length} light(s)`);
                }
            }
        };
        
        // Check if effect_name input is connected
        const effectInputConnected = data.inputs?.effect_name?.connections?.length > 0;

        // Get shared components
        const { HelpIcon } = window.T2Controls || {};
        const RefComponent = window.RefComponent;

        const tooltips = {
            node: "Triggers WiZ light effects like Fireplace, Ocean, Party, Christmas, etc.\n\nConnect the 'Effect' input to dynamically choose effects (e.g., from a Switch node based on time).\n\nWhen active, selected lights are excluded from HSV commands.",
            lights: "Select one or more WiZ lights.\nOnly WiZ-capable bulbs are shown.\n\nThese lights will be excluded from downstream HSV while effect is running.",
            effect: "The scene/effect to play.\nWiZ has 35+ built-in effects!\n\nIf nothing connected to 'Effect' input, dropdown is used.",
            speed: "Adjust the animation speed for dynamic effects.\n\n🐢 Slow (0) → Normal (100) → Fast (200) 🐇\n\nOnly available for animated effects like Party, Ocean, Fireplace, etc.",
            trigger: "TRUE = play effect\nFALSE = restore previous state\n\nConnect a button, time node, or sensor.",
            effect_name: "Connect a string (effect name) here.\n\nExamples: 'Ocean', 'Fireplace', 'Party'\n\nUse a Switch node to pick effects based on time of day!",
            hsv_in: "Connect your color source here.\nTimeline, spline, or manual HSV.\n\nPasses through to HSV Out.",
            hsv_out: "Connect to HA Device node.\nHSV flows through with metadata telling downstream to skip effect lights.",
            active: "TRUE while the effect is running.",
            applied: "Pulses TRUE briefly when effect is first sent."
        };

        const inputs = Object.entries(data.inputs || {});
        const outputs = Object.entries(data.outputs || {});

        // Effect preview configurations - CSS animations for each effect type
        const effectPreviewConfig = {
            'Fireplace': { colors: ['#ff4500', '#ff6600', '#ff8c00', '#ffa500'], animation: 'flicker', speed: '0.3s' },
            'Ocean': { colors: ['#006994', '#40e0d0', '#00bfff', '#1e90ff'], animation: 'wave', speed: '2s' },
            'Romance': { colors: ['#ff69b4', '#ff1493', '#db7093', '#ffb6c1'], animation: 'pulse', speed: '1.5s' },
            'Sunset': { colors: ['#ff4500', '#ff6347', '#ff7f50', '#ffd700'], animation: 'gradient', speed: '3s' },
            'Party': { colors: ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff'], animation: 'strobe', speed: '0.5s' },
            'Cozy': { colors: ['#ffa07a', '#ffb347', '#ffd700'], animation: 'gentle', speed: '4s' },
            'Forest': { colors: ['#228b22', '#32cd32', '#006400', '#90ee90'], animation: 'sway', speed: '3s' },
            'Christmas': { colors: ['#ff0000', '#00ff00', '#ff0000', '#00ff00'], animation: 'alternate', speed: '1s' },
            'Halloween': { colors: ['#ff6600', '#8b00ff', '#ff6600', '#000000'], animation: 'spooky', speed: '0.8s' },
            'Candlelight': { colors: ['#ff9900', '#ffcc00', '#ff6600'], animation: 'flicker', speed: '0.4s' },
            'Club': { colors: ['#ff00ff', '#00ffff', '#ff0000', '#0000ff'], animation: 'strobe', speed: '0.3s' },
            'Deep dive': { colors: ['#000080', '#0000cd', '#4169e1', '#00008b'], animation: 'wave', speed: '2.5s' },
            'Jungle': { colors: ['#006400', '#228b22', '#32cd32', '#00ff00'], animation: 'sway', speed: '2s' },
            'Mojito': { colors: ['#00ff7f', '#98fb98', '#00fa9a', '#adff2f'], animation: 'gentle', speed: '2s' },
            'default': { colors: ['#4fc3f7', '#29b6f6', '#03a9f4'], animation: 'pulse', speed: '2s' }
        };

        // Get current effect for preview (uses cycle effect if in cycle mode)
        const currentPreview = effectPreviewConfig[effect] || effectPreviewConfig['default'];

        return React.createElement('div', { className: 'wiz-effect-node' }, [
            // Header
            React.createElement('div', { key: 'header', className: 'wiz-effect-header' }, [
                React.createElement('div', { key: 'title', className: 'wiz-effect-title' }, [
                    React.createElement('span', { key: 'icon', className: 'wiz-effect-title-icon' }, '💡'),
                    React.createElement('span', { key: 'text' }, 'WiZ Effect')
                ]),
                HelpIcon && React.createElement(HelpIcon, { key: 'help', text: tooltips.node, size: 14 })
            ]),

            // Effect Preview Bar
            React.createElement('div', { 
                key: 'preview', 
                className: `wiz-effect-preview wiz-anim-${currentPreview.animation}`,
                style: {
                    '--color1': currentPreview.colors[0],
                    '--color2': currentPreview.colors[1],
                    '--color3': currentPreview.colors[2] || currentPreview.colors[0],
                    '--color4': currentPreview.colors[3] || currentPreview.colors[1],
                    '--speed': currentPreview.speed
                }
            }),

            // IO Section
            React.createElement('div', { key: 'io', className: 'wiz-effect-io' }, [
                // Inputs
                React.createElement('div', { key: 'inputs', className: 'wiz-effect-inputs' },
                    inputs.map(([key, input]) => 
                        React.createElement('div', { key, className: 'wiz-effect-socket-row input' }, [
                            React.createElement(RefComponent, {
                                key: 'socket',
                                init: ref => emit({ type: "render", data: { type: "socket", element: ref, payload: input.socket, nodeId: data.id, side: "input", key } }),
                                unmount: ref => emit({ type: "unmount", data: { element: ref } })
                            }),
                            React.createElement('span', { key: 'label', className: 'wiz-effect-socket-label' }, input.label || key),
                            HelpIcon && tooltips[key] && React.createElement(HelpIcon, { key: 'help', text: tooltips[key], size: 10 })
                        ])
                    )
                ),
                // Outputs - socket on the RIGHT (after label)
                React.createElement('div', { key: 'outputs', className: 'wiz-effect-outputs' },
                    outputs.map(([key, output]) => 
                        React.createElement('div', { key, className: 'wiz-effect-socket-row output' }, [
                            HelpIcon && tooltips[key] && React.createElement(HelpIcon, { key: 'help', text: tooltips[key], size: 10 }),
                            React.createElement('span', { key: 'label', className: 'wiz-effect-socket-label' }, output.label || key),
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
            React.createElement('div', { key: 'controls', className: 'wiz-effect-controls' }, [
                // Light selector row
                React.createElement('div', { key: 'lights-row', className: 'wiz-effect-row' }, [
                    React.createElement('span', { key: 'label', className: 'wiz-effect-label' }, 'Lights'),
                    React.createElement('button', {
                        key: 'toggle',
                        className: 'wiz-effect-light-toggle',
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
                    className: `wiz-effect-light-list ${expanded ? 'expanded' : ''}`,
                    onWheel: (e) => e.stopPropagation()
                },
                    devices.map(d => {
                        const id = d.id || `ha_${d.entity_id}`;
                        const name = d.name || d.attributes?.friendly_name || d.entity_id;
                        const isSelected = selectedIds.includes(id);
                        return React.createElement('label', { 
                            key: id, 
                            className: `wiz-effect-light-item ${isSelected ? 'selected' : ''}`,
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

                // Effect selector row (shows "via input" when connected)
                React.createElement('div', { key: 'effect-row', className: 'wiz-effect-row' }, [
                    React.createElement('span', { key: 'label', className: 'wiz-effect-label' }, 'Effect'),
                    effectInputConnected 
                        ? React.createElement('div', { 
                            key: 'via-input', 
                            className: 'wiz-effect-via-input'
                          }, '← via input')
                        : React.createElement('select', {
                            key: 'select',
                            className: 'wiz-effect-select',
                            value: effect,
                            onChange: (e) => setEffect(e.target.value),
                            onPointerDown: (e) => e.stopPropagation()
                        },
                            (availableEffects || WIZ_EFFECTS.map(e => e.value)).map(eff => {
                                const value = typeof eff === 'string' ? eff : eff.value;
                                const label = typeof eff === 'string' 
                                    ? (WIZ_EFFECTS.find(h => h.value === eff)?.label || eff)
                                    : eff.label;
                                return React.createElement('option', { key: value, value }, label);
                            })
                        ),
                    HelpIcon && React.createElement(HelpIcon, { key: 'help', text: tooltips.effect, size: 12 })
                ]),
                
                // Speed slider row (only shown for effects that support speed)
                effectSupportsSpeed && React.createElement('div', { key: 'speed-row', className: 'wiz-effect-row wiz-effect-speed-row' }, [
                    React.createElement('span', { key: 'label', className: 'wiz-effect-label' }, 'Speed'),
                    React.createElement('div', { key: 'slider-container', className: 'wiz-effect-speed-container' }, [
                        React.createElement('span', { key: 'slow', className: 'wiz-effect-speed-label' }, '🐢'),
                        React.createElement('input', {
                            key: 'slider',
                            type: 'range',
                            className: 'wiz-effect-speed-slider',
                            min: 0,
                            max: 200,
                            value: speed,
                            onChange: (e) => setSpeed(parseInt(e.target.value, 10)),
                            onPointerDown: (e) => e.stopPropagation()
                        }),
                        React.createElement('span', { key: 'fast', className: 'wiz-effect-speed-label' }, '🐇')
                    ]),
                    React.createElement('span', { key: 'value', className: 'wiz-effect-speed-value' }, 
                        speed === 100 ? 'Normal' : (speed < 100 ? 'Slow' : 'Fast')
                    ),
                    HelpIcon && React.createElement(HelpIcon, { key: 'help', text: tooltips.speed, size: 12 })
                ]),

                // Test button
                React.createElement('button', {
                    key: 'test-btn',
                    className: 'wiz-effect-test-btn',
                    onClick: handleTest,
                    onPointerDown: (e) => e.stopPropagation(),
                    disabled: selectedIds.length === 0 || effectInputConnected
                }, effectInputConnected ? '(Use trigger input)' : '▶ Test Effect')
            ]),

            // Inline styles for the component
            React.createElement('style', { key: 'styles' }, `
                .wiz-effect-node {
                    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                    border-radius: 8px;
                    padding: 12px;
                    min-width: 280px;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    color: #e0e0e0;
                }
                .wiz-effect-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 12px;
                    padding-bottom: 8px;
                    border-bottom: 1px solid rgba(255,255,255,0.1);
                }
                .wiz-effect-title {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 14px;
                    font-weight: 600;
                    color: #4fc3f7;
                }
                .wiz-effect-title-icon {
                    font-size: 18px;
                }
                .wiz-effect-io {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 12px;
                }
                .wiz-effect-inputs, .wiz-effect-outputs {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }
                .wiz-effect-outputs {
                    align-items: flex-end;
                }
                .wiz-effect-socket-row {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 11px;
                    color: #aaa;
                }
                .wiz-effect-socket-row.input {
                    justify-content: flex-start;
                }
                .wiz-effect-socket-row.output {
                    justify-content: flex-end;
                }
                .wiz-effect-socket-label {
                    text-transform: capitalize;
                }
                .wiz-effect-controls {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }
                .wiz-effect-row {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .wiz-effect-label {
                    font-size: 11px;
                    color: #888;
                    min-width: 50px;
                }
                .wiz-effect-light-toggle {
                    flex: 1;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 6px 10px;
                    background: rgba(255,255,255,0.08);
                    border: 1px solid rgba(255,255,255,0.15);
                    border-radius: 4px;
                    color: #e0e0e0;
                    font-size: 12px;
                    cursor: pointer;
                    transition: background 0.2s;
                }
                .wiz-effect-light-toggle:hover {
                    background: rgba(255,255,255,0.12);
                }
                .wiz-effect-light-toggle .arrow {
                    font-size: 10px;
                    color: #888;
                }
                .wiz-effect-light-list {
                    max-height: 0;
                    overflow: hidden;
                    transition: max-height 0.3s ease;
                    background: rgba(0,0,0,0.2);
                    border-radius: 4px;
                }
                .wiz-effect-light-list.expanded {
                    max-height: 150px;
                    overflow-y: auto;
                    padding: 6px;
                    margin-top: 4px;
                }
                .wiz-effect-light-item {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 4px 6px;
                    font-size: 11px;
                    color: #ccc;
                    cursor: pointer;
                    border-radius: 3px;
                    transition: background 0.15s;
                }
                .wiz-effect-light-item:hover {
                    background: rgba(255,255,255,0.08);
                }
                .wiz-effect-light-item.selected {
                    background: rgba(79, 195, 247, 0.15);
                    color: #4fc3f7;
                }
                .wiz-effect-light-item input[type="checkbox"] {
                    accent-color: #4fc3f7;
                }
                .wiz-effect-select {
                    flex: 1;
                    padding: 6px 8px;
                    background: rgba(255,255,255,0.08);
                    border: 1px solid rgba(255,255,255,0.15);
                    border-radius: 4px;
                    color: #e0e0e0;
                    font-size: 12px;
                    cursor: pointer;
                }
                .wiz-effect-select option {
                    background: #1a1a2e;
                    color: #e0e0e0;
                }
                .wiz-effect-test-btn {
                    padding: 8px 12px;
                    background: linear-gradient(135deg, #4fc3f7 0%, #29b6f6 100%);
                    border: none;
                    border-radius: 4px;
                    color: #000;
                    font-size: 12px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: opacity 0.2s, transform 0.1s;
                }
                .wiz-effect-test-btn:hover:not(:disabled) {
                    opacity: 0.9;
                    transform: translateY(-1px);
                }
                .wiz-effect-test-btn:disabled {
                    opacity: 0.4;
                    cursor: not-allowed;
                }
                
                /* Via input indicator */
                .wiz-effect-via-input {
                    flex: 1;
                    padding: 6px 10px;
                    background: rgba(79, 195, 247, 0.15);
                    border: 1px dashed rgba(79, 195, 247, 0.4);
                    border-radius: 4px;
                    color: #4fc3f7;
                    font-size: 11px;
                    font-style: italic;
                    text-align: center;
                }
                
                /* Speed slider */
                .wiz-effect-speed-row {
                    margin-top: 4px;
                }
                .wiz-effect-speed-container {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
                .wiz-effect-speed-label {
                    font-size: 12px;
                    opacity: 0.7;
                }
                .wiz-effect-speed-slider {
                    flex: 1;
                    height: 4px;
                    -webkit-appearance: none;
                    appearance: none;
                    background: rgba(255,255,255,0.15);
                    border-radius: 2px;
                    outline: none;
                    cursor: pointer;
                }
                .wiz-effect-speed-slider::-webkit-slider-thumb {
                    -webkit-appearance: none;
                    width: 14px;
                    height: 14px;
                    background: #4fc3f7;
                    border-radius: 50%;
                    cursor: pointer;
                    box-shadow: 0 1px 4px rgba(0,0,0,0.3);
                }
                .wiz-effect-speed-slider::-moz-range-thumb {
                    width: 14px;
                    height: 14px;
                    background: #4fc3f7;
                    border-radius: 50%;
                    cursor: pointer;
                    border: none;
                }
                .wiz-effect-speed-value {
                    min-width: 45px;
                    font-size: 10px;
                    color: #888;
                    text-align: right;
                }

                /* Effect Preview Bar */
                .wiz-effect-preview {
                    height: 24px;
                    border-radius: 6px;
                    margin-bottom: 12px;
                    background: linear-gradient(90deg, var(--color1), var(--color2), var(--color3), var(--color4));
                    background-size: 300% 100%;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1);
                }

                /* Animation types */
                .wiz-anim-flicker {
                    animation: wizFlicker var(--speed) ease-in-out infinite;
                }
                .wiz-anim-wave {
                    animation: wizWave var(--speed) ease-in-out infinite;
                }
                .wiz-anim-pulse {
                    animation: wizPulse var(--speed) ease-in-out infinite;
                }
                .wiz-anim-gradient {
                    animation: wizGradient var(--speed) linear infinite;
                }
                .wiz-anim-strobe {
                    animation: wizStrobe var(--speed) steps(4) infinite;
                }
                .wiz-anim-gentle {
                    animation: wizGentle var(--speed) ease-in-out infinite;
                }
                .wiz-anim-sway {
                    animation: wizSway var(--speed) ease-in-out infinite;
                }
                .wiz-anim-alternate {
                    animation: wizAlternate var(--speed) steps(2) infinite;
                }
                .wiz-anim-spooky {
                    animation: wizSpooky var(--speed) ease-in-out infinite;
                }

                @keyframes wizFlicker {
                    0%, 100% { opacity: 1; filter: brightness(1); }
                    25% { opacity: 0.8; filter: brightness(0.9); }
                    50% { opacity: 1; filter: brightness(1.1); }
                    75% { opacity: 0.9; filter: brightness(0.95); }
                }
                @keyframes wizWave {
                    0%, 100% { background-position: 0% 50%; }
                    50% { background-position: 100% 50%; }
                }
                @keyframes wizPulse {
                    0%, 100% { transform: scaleY(1); opacity: 0.9; }
                    50% { transform: scaleY(1.1); opacity: 1; }
                }
                @keyframes wizGradient {
                    0% { background-position: 0% 50%; }
                    100% { background-position: 300% 50%; }
                }
                @keyframes wizStrobe {
                    0% { background-position: 0% 50%; filter: brightness(1.2); }
                    25% { background-position: 33% 50%; filter: brightness(0.8); }
                    50% { background-position: 66% 50%; filter: brightness(1.2); }
                    75% { background-position: 100% 50%; filter: brightness(0.8); }
                }
                @keyframes wizGentle {
                    0%, 100% { opacity: 0.85; filter: brightness(0.95); }
                    50% { opacity: 1; filter: brightness(1.05); }
                }
                @keyframes wizSway {
                    0%, 100% { background-position: 0% 50%; transform: translateX(0); }
                    50% { background-position: 50% 50%; transform: translateX(2px); }
                }
                @keyframes wizAlternate {
                    0%, 49% { background-position: 0% 50%; }
                    50%, 100% { background-position: 100% 50%; }
                }
                @keyframes wizSpooky {
                    0%, 100% { opacity: 1; filter: brightness(1) hue-rotate(0deg); }
                    25% { opacity: 0.7; filter: brightness(0.8) hue-rotate(-10deg); }
                    50% { opacity: 1; filter: brightness(1.1) hue-rotate(10deg); }
                    75% { opacity: 0.8; filter: brightness(0.9) hue-rotate(-5deg); }
                }
            `)
        ]);
    }

    // =========================================================================
    // REGISTRATION
    // =========================================================================
    if (window.nodeRegistry) {
        window.nodeRegistry.register('WizEffectNode', {
            label: "WiZ Effect",
            category: "Home Assistant",
            nodeClass: WizEffectNode,
            component: WizEffectNodeComponent,
            factory: (cb) => new WizEffectNode(cb)
        });
        console.log('[WizEffectNode] ✅ Registered');
    }

})();
