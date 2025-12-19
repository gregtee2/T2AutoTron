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
            this.width = 280;
            this.height = 200;
            this.changeCallback = changeCallback;

            this.properties = {
                entityId: '',       // HA entity_id of the light
                effect: 'candle',   // Selected effect
                lastTrigger: null,
                lastSentEffect: null
            };

            // Input: trigger to activate the effect
            this.addInput('trigger', new ClassicPreset.Input(window.sockets.boolean, 'Trigger'));
            
            // Output: confirmation that effect was applied
            this.addOutput('applied', new ClassicPreset.Output(window.sockets.boolean, 'Applied'));
        }

        data(inputs) {
            const trigger = inputs.trigger?.[0];
            
            // Detect rising edge (false→true)
            const shouldFire = trigger === true && this.properties.lastTrigger !== true;
            this.properties.lastTrigger = trigger;

            if (shouldFire && this.properties.entityId && this.properties.effect) {
                this.sendEffect();
                return { applied: true };
            }

            return { applied: false };
        }

        async sendEffect() {
            const entityId = this.properties.entityId;
            const effect = this.properties.effect;

            if (!entityId) {
                console.warn('[HueEffectNode] No entity selected');
                return;
            }

            console.log(`[HueEffectNode] Sending effect "${effect}" to ${entityId}`);

            try {
                // Use HA service call via our API
                const response = await fetch('/api/lights/ha/service', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        domain: 'light',
                        service: 'turn_on',
                        entity_id: entityId.replace('ha_', ''),  // Remove ha_ prefix
                        data: {
                            effect: effect === 'off' ? 'none' : effect
                        }
                    })
                });

                if (!response.ok) {
                    console.error('[HueEffectNode] Failed to send effect:', response.status);
                }

                this.properties.lastSentEffect = effect;
            } catch (err) {
                console.error('[HueEffectNode] Error sending effect:', err);
            }
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
        const [entityId, setEntityId] = useState(data.properties.entityId || '');
        const [effect, setEffect] = useState(data.properties.effect || 'candle');
        const [devices, setDevices] = useState([]);
        const [loading, setLoading] = useState(true);

        // Fetch available Hue lights from HA
        useEffect(() => {
            const fetchDevices = async () => {
                try {
                    const response = await fetch('/api/devices');
                    const allDevices = await response.json();
                    
                    // Filter to just lights (Hue effects only work on lights)
                    const lights = allDevices.filter(d => 
                        d.id?.startsWith('ha_light.') || 
                        d.entity_id?.startsWith('light.')
                    );
                    
                    setDevices(lights);
                    setLoading(false);
                } catch (err) {
                    console.error('[HueEffectNode] Error fetching devices:', err);
                    setLoading(false);
                }
            };

            fetchDevices();
        }, []);

        // Sync state changes back to node
        useEffect(() => {
            data.properties.entityId = entityId;
            data.properties.effect = effect;
        }, [entityId, effect, data.properties]);

        // Get shared components
        const { NodeHeader, HelpIcon } = window.T2Controls || {};

        const tooltips = {
            node: "Triggers Hue light effects like candle, fire, sunrise, etc. Effects are built into newer Hue bulbs.",
            device: "Select a Hue light. Effects only work on Hue bulbs that support them.",
            effect: "The animation effect to play on the light."
        };

        // Styles
        const containerStyle = {
            padding: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
        };

        const rowStyle = {
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
        };

        const labelStyle = {
            fontSize: '11px',
            color: '#aaa',
            minWidth: '50px'
        };

        const selectStyle = {
            flex: 1,
            padding: '6px 8px',
            borderRadius: '4px',
            border: '1px solid #444',
            backgroundColor: '#2a2a2a',
            color: '#fff',
            fontSize: '12px',
            cursor: 'pointer'
        };

        const testButtonStyle = {
            padding: '8px 16px',
            borderRadius: '4px',
            border: 'none',
            backgroundColor: '#4a9eff',
            color: '#fff',
            fontSize: '12px',
            cursor: 'pointer',
            marginTop: '4px'
        };

        const handleTest = () => {
            if (entityId && effect) {
                data.sendEffect();
                if (window.T2Toast) {
                    window.T2Toast.success(`Sent "${effect}" to light`);
                }
            }
        };

        return React.createElement('div', { style: containerStyle },
            // Header
            NodeHeader && React.createElement(NodeHeader, {
                icon: '🎆',
                title: 'Hue Effect',
                tooltip: tooltips.node
            }),

            // Device selector
            React.createElement('div', { style: rowStyle },
                React.createElement('span', { style: labelStyle }, 'Light:'),
                React.createElement('select', {
                    style: selectStyle,
                    value: entityId,
                    onChange: (e) => setEntityId(e.target.value),
                    onPointerDown: (e) => e.stopPropagation()
                },
                    React.createElement('option', { value: '' }, 
                        loading ? 'Loading...' : '-- Select Light --'
                    ),
                    ...devices.map(d => 
                        React.createElement('option', { 
                            key: d.id || d.entity_id, 
                            value: d.id || `ha_${d.entity_id}` 
                        }, d.name || d.attributes?.friendly_name || d.entity_id)
                    )
                ),
                HelpIcon && React.createElement(HelpIcon, { text: tooltips.device, size: 12 })
            ),

            // Effect selector
            React.createElement('div', { style: rowStyle },
                React.createElement('span', { style: labelStyle }, 'Effect:'),
                React.createElement('select', {
                    style: selectStyle,
                    value: effect,
                    onChange: (e) => setEffect(e.target.value),
                    onPointerDown: (e) => e.stopPropagation()
                },
                    ...HUE_EFFECTS.map(eff => 
                        React.createElement('option', { 
                            key: eff.value, 
                            value: eff.value 
                        }, eff.label)
                    )
                ),
                HelpIcon && React.createElement(HelpIcon, { text: tooltips.effect, size: 12 })
            ),

            // Test button
            React.createElement('button', {
                style: testButtonStyle,
                onClick: handleTest,
                onPointerDown: (e) => e.stopPropagation()
            }, '▶ Test Effect'),

            // Socket rendering
            React.createElement('div', { style: { marginTop: '8px' } },
                // Input socket
                data.inputs?.trigger && React.createElement(window.RefComponent, {
                    key: 'trigger-input',
                    init: ref => emit({ type: 'render', data: { type: 'socket', side: 'input', key: 'trigger', nodeId: data.id, element: ref, payload: data.inputs.trigger.socket } })
                }),
                // Output socket
                data.outputs?.applied && React.createElement(window.RefComponent, {
                    key: 'applied-output',
                    init: ref => emit({ type: 'render', data: { type: 'socket', side: 'output', key: 'applied', nodeId: data.id, element: ref, payload: data.outputs.applied.socket } })
                })
            )
        );
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
