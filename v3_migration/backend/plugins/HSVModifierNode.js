(function() {
    // Debug: console.log("[HSVModifierNode] Loading plugin...");

    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets) {
        console.error("[HSVModifierNode] Missing dependencies");
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect, useRef, useCallback } = React;
    const RefComponent = window.RefComponent;
    const sockets = window.sockets;

    // -------------------------------------------------------------------------
    // CSS is now loaded from node-styles.css via index.css
    // -------------------------------------------------------------------------

    // -------------------------------------------------------------------------
    // COLOR UTILS - Use shared ColorUtilsPlugin (window.ColorUtils)
    // -------------------------------------------------------------------------
    if (!window.ColorUtils) {
        console.error("[HSVModifierNode] window.ColorUtils not found! Make sure 00_ColorUtilsPlugin.js loads first.");
    }
    const ColorUtils = window.ColorUtils;

    // -------------------------------------------------------------------------
    // NODE CLASS
    // -------------------------------------------------------------------------
    class HSVModifierNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("HSV Modifier");
            this.width = 400;
            this.changeCallback = changeCallback;

            this.addInput("hsv_in", new ClassicPreset.Input(sockets.object || new ClassicPreset.Socket('object'), "HSV In"));
            this.addInput("enable", new ClassicPreset.Input(sockets.boolean || new ClassicPreset.Socket('boolean'), "Enable"));
            this.addOutput("hsv_out", new ClassicPreset.Output(sockets.object || new ClassicPreset.Socket('object'), "HSV Out"));

            this.properties = {
                hueShift: 0,
                saturationScale: 1.0,
                brightnessScale: 254,
                enabled: true,
                presets: [],
                lastInputHSV: null,
                selectedBuffer: "", // For Enable
                selectedHsvBuffer: "" // For HSV Override
            };
        }

        data(inputs) {
            const hsvIn = inputs.hsv_in?.[0];
            const enableIn = inputs.enable?.[0];

            // Update internal state for UI visualization (always track socket input)
            if (hsvIn) {
                this.properties.lastInputHSV = hsvIn;
            }

            // 1. Determine if HSV Buffer override is enabled
            // Priority: Enable Buffer > Socket input > Checkbox
            let hsvBufferEnabled = this.properties.enabled;
            if (enableIn !== undefined) {
                hsvBufferEnabled = !!enableIn;
            }
            if (this.properties.selectedBuffer && window.AutoTronBuffer) {
                const bufferVal = window.AutoTronBuffer.get(this.properties.selectedBuffer);
                if (bufferVal !== undefined) {
                    hsvBufferEnabled = !!bufferVal;
                }
            }

            // 2. If HSV Buffer override is enabled AND HSV Buffer is selected, OUTPUT HSV BUFFER DIRECTLY (bypass sliders)
            if (hsvBufferEnabled && this.properties.selectedHsvBuffer && window.AutoTronBuffer) {
                const bufferVal = window.AutoTronBuffer.get(this.properties.selectedHsvBuffer);
                if (bufferVal && typeof bufferVal === 'object' && 'hue' in bufferVal) {
                    // Store for UI to show in output swatch
                    this.properties.lastOutputHSV = bufferVal;
                    return { hsv_out: bufferVal };
                }
            }

            // 3. No input? Return default
            if (!hsvIn) {
                const passthrough = { hue: 0, saturation: 0, brightness: 0 };
                this.properties.lastOutputHSV = passthrough;
                return { hsv_out: passthrough };
            }

            // 4. Apply slider modifications (ALWAYS when we have input and no HSV buffer override)
            let hue = (hsvIn.hue * 360 + this.properties.hueShift) % 360;
            if (hue < 0) hue += 360;
            
            const saturation = Math.max(0, Math.min(1, this.properties.saturationScale));
            const brightness = Math.max(0, Math.min(254, this.properties.brightnessScale));

            const output = {
                hue: hue / 360,
                saturation: saturation,
                brightness: brightness
            };
            this.properties.lastOutputHSV = output;
            return { hsv_out: output };
        }

        restore(state) {
            if (state.properties) {
                Object.assign(this.properties, state.properties);
            }
        }

        serialize() {
            return {
                hueShift: this.properties.hueShift,
                saturationScale: this.properties.saturationScale,
                brightnessScale: this.properties.brightnessScale,
                enabled: this.properties.enabled,
                presets: this.properties.presets,
                selectedBuffer: this.properties.selectedBuffer,
                selectedHsvBuffer: this.properties.selectedHsvBuffer
            };
        }

        toJSON() {
            return {
                id: this.id,
                label: this.label,
                properties: this.serialize()
            };
        }
    }

    // -------------------------------------------------------------------------
    // COMPONENT
    // -------------------------------------------------------------------------
    
    // Tooltips - define all help text in one place
    const tooltips = {
        node: "Modifies HSV (Hue, Saturation, Brightness) color values. Can shift hue, adjust saturation/brightness, or pass through an HSV buffer directly.",
        inputs: {
            hsv_in: "HSV object input: { hue: 0-1, saturation: 0-1, brightness: 0-254 }",
            enable: "Boolean: When false, HSV Buffer override is disabled"
        },
        outputs: {
            hsv_out: "Modified HSV object. Shows Input→Modified or Buffer value"
        },
        controls: {
            enabled: "Master enable. Can be overridden by Enable socket or Enable Buffer",
            enableBuffer: "Select a Trigger buffer to control the Enable state remotely",
            hsvBuffer: "When enabled + HSV Buffer selected: outputs buffer value directly, bypassing sliders",
            hueShift: "Rotate hue by degrees (-360 to +360). 180 = complementary color",
            saturation: "Color intensity (0 = gray, 1 = full color)",
            brightness: "Light intensity (0 = off, 254 = max)",
            reset: "Reset all sliders to defaults (0, 1.0, 254)",
            invertHue: "Shift hue by 180° (complementary color)",
            doubleBri: "Double the brightness (capped at 254)",
            savePreset: "Save current slider values as a named preset"
        }
    };
    
    // Get HelpIcon from shared controls
    const HelpIcon = window.T2Controls?.HelpIcon;
    
    const Slider = ({ label, value, min, max, step, onChange, disabled, tooltip, HelpIcon }) => {
        return React.createElement('div', { className: 'hsv-mod-slider-row', style: { opacity: disabled ? 0.5 : 1, pointerEvents: disabled ? 'none' : 'auto' } }, [
            React.createElement('div', { key: 'lbl-wrap', style: { display: 'flex', alignItems: 'center', gap: '4px' } }, [
                React.createElement('span', { key: 'l', className: 'hsv-mod-slider-label' }, label),
                tooltip && HelpIcon && React.createElement(HelpIcon, { key: 'help', text: tooltip, size: 12 })
            ]),
            React.createElement('input', {
                key: 'i',
                type: 'range',
                className: 'hsv-mod-range',
                min, max, step,
                value,
                onChange: (e) => onChange(Number(e.target.value))
            }),
            React.createElement('span', { key: 'v', className: 'hsv-mod-slider-val' }, value)
        ]);
    };

    function HSVModifierNodeComponent({ data, emit }) {
        const [state, setState] = useState({ ...data.properties });
        const [isCollapsed, setIsCollapsed] = useState(false);
        const [availableBuffers, setAvailableBuffers] = useState([]);
        const lastUpdateRef = useRef(0);
        const timeoutRef = useRef(null);

        const triggerEngineUpdate = useCallback(() => {
            if (data.changeCallback) data.changeCallback();
        }, [data]);

        const updateState = (updates) => {
            const newState = { ...state, ...updates };
            setState(newState);
            Object.assign(data.properties, newState);

            const now = Date.now();
            if (now - lastUpdateRef.current >= 50) {
                triggerEngineUpdate();
                lastUpdateRef.current = now;
            } else {
                if (timeoutRef.current) clearTimeout(timeoutRef.current);
                timeoutRef.current = setTimeout(() => {
                    triggerEngineUpdate();
                    lastUpdateRef.current = Date.now();
                }, 50 - (now - lastUpdateRef.current));
            }
        };

        // Buffer Subscription
        useEffect(() => {
            if (!window.AutoTronBuffer) return;
            const updateList = () => {
                setAvailableBuffers(Object.keys(window.AutoTronBuffer.data).sort());
            };
            updateList();
            const unsubscribe = window.AutoTronBuffer.subscribe((key) => {
                updateList();
                // If the updated key matches one of our selected buffers, trigger update
                if (key === state.selectedBuffer || key === state.selectedHsvBuffer) {
                    triggerEngineUpdate();
                }
            });
            return unsubscribe;
        }, [state.selectedBuffer, state.selectedHsvBuffer, triggerEngineUpdate]);

        // Poll for input changes
        useEffect(() => {
            const interval = setInterval(() => {
                if (data.properties.lastInputHSV !== state.lastInputHSV) {
                    setState(s => ({ ...s, lastInputHSV: data.properties.lastInputHSV }));
                }
            }, 200);
            return () => clearInterval(interval);
        }, [data.properties.lastInputHSV]);

        // Poll for output changes too
        const [lastOutputHSV, setLastOutputHSV] = useState(data.properties.lastOutputHSV || null);
        useEffect(() => {
            const interval = setInterval(() => {
                if (data.properties.lastOutputHSV !== lastOutputHSV) {
                    setLastOutputHSV(data.properties.lastOutputHSV);
                }
            }, 200);
            return () => clearInterval(interval);
        }, [data.properties.lastOutputHSV, lastOutputHSV]);

        // Calculate Colors
        // Input swatch: always show the HSV IN socket value
        const inputHSV = state.lastInputHSV || { hue: 0, saturation: 0, brightness: 0 };
        const inputRGB = ColorUtils.hsvToRgb(inputHSV.hue, inputHSV.saturation, inputHSV.brightness / 254);
        const inputColor = `rgb(${inputRGB[0]},${inputRGB[1]},${inputRGB[2]})`;

        // Output swatch: show actual output (could be HSV buffer, modified, or passthrough)
        const outputHSV = lastOutputHSV || inputHSV;
        const outRGB = ColorUtils.hsvToRgb(outputHSV.hue, outputHSV.saturation, outputHSV.brightness / 254);
        const outputColor = `rgb(${outRGB[0]},${outRGB[1]},${outRGB[2]})`;

        // Determine if HSV Buffer override is active (for disabling sliders)
        let hsvBufferEnabled = state.enabled;
        if (state.selectedBuffer && window.AutoTronBuffer) {
            const bufVal = window.AutoTronBuffer.get(state.selectedBuffer);
            if (bufVal !== undefined) hsvBufferEnabled = !!bufVal;
        }
        
        // Check if HSV buffer override is actually active
        let hsvBufferOverrideActive = false;
        if (hsvBufferEnabled && state.selectedHsvBuffer && window.AutoTronBuffer) {
            const bufVal = window.AutoTronBuffer.get(state.selectedHsvBuffer);
            if (bufVal && typeof bufVal === 'object' && 'hue' in bufVal) {
                hsvBufferOverrideActive = true;
            }
        }

        const handleReset = () => {
            updateState({ hueShift: 0, saturationScale: 1.0, brightnessScale: 254 });
        };

        const handleInvertHue = () => {
            const newShift = (state.hueShift + 180) % 360;
            updateState({ hueShift: newShift });
        };

        const handleDoubleBrightness = () => {
            updateState({ brightnessScale: Math.min(254, state.brightnessScale * 2) });
        };

        const savePreset = () => {
            const name = prompt("Preset Name:");
            if (name) {
                const newPreset = { name, hueShift: state.hueShift, saturationScale: state.saturationScale, brightnessScale: state.brightnessScale };
                const newPresets = [...(state.presets || []), newPreset];
                updateState({ presets: newPresets });
            }
        };

        const loadPreset = (e) => {
            const name = e.target.value;
            const preset = state.presets.find(p => p.name === name);
            if (preset) {
                updateState({
                    hueShift: preset.hueShift,
                    saturationScale: preset.saturationScale,
                    brightnessScale: preset.brightnessScale
                });
            }
        };

        // Determine status for indicator
        let statusColor = '#888';  // gray = idle/no input
        let statusText = 'No Input';
        const hasInput = !!(state.lastInputHSV && (state.lastInputHSV.hue || state.lastInputHSV.saturation || state.lastInputHSV.brightness));
        
        if (hsvBufferOverrideActive) {
            statusColor = '#ff9800';  // orange = override active
            statusText = 'Override';
        } else if (hasInput) {
            statusColor = '#4caf50';  // green = modifying
            statusText = 'Modifying';
        }

        return React.createElement('div', { className: 'hsv-mod-node-tron' }, [
            // Header
            React.createElement('div', { key: 'header', className: 'hsv-mod-header' }, [
                React.createElement('div', { key: 'left', style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
                    React.createElement('div', { 
                        key: 'toggle',
                        style: { cursor: "pointer", fontSize: "12px", color: '#b388ff' },
                        onPointerDown: (e) => { e.stopPropagation(); setIsCollapsed(!isCollapsed); }
                    }, isCollapsed ? "▶" : "▼"),
                    // Status indicator dot
                    React.createElement('div', {
                        key: 'status',
                        title: statusText,
                        style: {
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            backgroundColor: statusColor,
                            boxShadow: `0 0 4px ${statusColor}`,
                            transition: 'background-color 0.3s, box-shadow 0.3s'
                        }
                    }),
                    React.createElement('span', { key: 'title', className: 'hsv-mod-title' }, data.label),
                    HelpIcon && React.createElement(HelpIcon, { key: 'help', text: tooltips.node, size: 14 })
                ]),
                React.createElement('label', { key: 'right', className: 'hsv-mod-checkbox', title: tooltips.controls.enabled }, [
                    React.createElement('input', {
                        key: 'cb',
                        type: 'checkbox',
                        checked: state.enabled,
                        onChange: e => updateState({ enabled: e.target.checked })
                    }),
                    React.createElement('span', { key: 'lbl' }, "Enabled")
                ])
            ]),

            // IO
            React.createElement('div', { key: 'io', className: 'hsv-mod-io' }, [
                React.createElement('div', { key: 'in', style: { display: 'flex', flexDirection: 'column', gap: '5px' } }, 
                    Object.entries(data.inputs).map(([key, input]) => 
                        React.createElement('div', { key, style: { display: 'flex', alignItems: 'center', gap: '5px' } }, [
                            React.createElement(RefComponent, {
                                key: 'ref',
                                init: ref => emit({ type: "render", data: { type: "socket", element: ref, payload: input.socket, nodeId: data.id, side: "input", key } }),
                                unmount: ref => emit({ type: "unmount", data: { element: ref } })
                            }),
                            React.createElement('span', { 
                                key: 'lbl', 
                                className: 'hsv-mod-socket-label',
                                title: tooltips.inputs[key] || ''
                            }, input.label),
                            tooltips.inputs[key] && HelpIcon && React.createElement(HelpIcon, { key: 'help', text: tooltips.inputs[key], size: 10 })
                        ])
                    )
                ),
                React.createElement('div', { key: 'out', style: { display: 'flex', flexDirection: 'column', gap: '5px', alignItems: 'flex-end' } }, 
                    Object.entries(data.outputs).map(([key, output]) => 
                        React.createElement('div', { key, style: { display: 'flex', alignItems: 'center', gap: '5px' } }, [
                            tooltips.outputs[key] && HelpIcon && React.createElement(HelpIcon, { key: 'help', text: tooltips.outputs[key], size: 10 }),
                            React.createElement('span', { 
                                key: 'lbl', 
                                className: 'hsv-mod-socket-label',
                                title: tooltips.outputs[key] || ''
                            }, output.label),
                            React.createElement(RefComponent, {
                                key: 'ref',
                                init: ref => emit({ type: "render", data: { type: "socket", element: ref, payload: output.socket, nodeId: data.id, side: "output", key } }),
                                unmount: ref => emit({ type: "unmount", data: { element: ref } })
                            })
                        ])
                    )
                )
            ]),

            // Controls
            !isCollapsed && React.createElement('div', { 
                key: 'controls', 
                className: 'hsv-mod-controls',
                onPointerDown: (e) => e.stopPropagation()
            }, [
                // Buffer Selectors
                React.createElement('div', { key: 'bufs', style: { marginBottom: '10px', borderBottom: '1px solid rgba(179, 136, 255, 0.2)', paddingBottom: '5px' } }, [
                    React.createElement('div', { key: 'enableRow', className: 'hsv-mod-select-row' }, [
                        React.createElement('div', { key: 'lblContainer', style: { display: 'flex', alignItems: 'center', gap: '4px' } }, [
                            React.createElement('span', { key: 'lbl', className: 'hsv-mod-slider-label' }, "Enable Buf:"),
                            HelpIcon && React.createElement(HelpIcon, { key: 'help', text: tooltips.controls.enableBuffer, size: 12 })
                        ]),
                        React.createElement('select', {
                            key: 'sel',
                            className: 'hsv-mod-select',
                            value: state.selectedBuffer,
                            onChange: e => updateState({ selectedBuffer: e.target.value })
                        }, [
                            React.createElement('option', { key: 'none', value: '' }, "None"),
                            ...availableBuffers.filter(b => b.startsWith('[Trigger]')).map(b => React.createElement('option', { key: b, value: b }, b))
                        ])
                    ]),
                    React.createElement('div', { key: 'hsvRow', className: 'hsv-mod-select-row' }, [
                        React.createElement('div', { key: 'lblContainer', style: { display: 'flex', alignItems: 'center', gap: '4px' } }, [
                            React.createElement('span', { key: 'lbl', className: 'hsv-mod-slider-label' }, "HSV Buf:"),
                            HelpIcon && React.createElement(HelpIcon, { key: 'help', text: tooltips.controls.hsvBuffer, size: 12 })
                        ]),
                        React.createElement('select', {
                            key: 'sel',
                            className: 'hsv-mod-select',
                            value: state.selectedHsvBuffer,
                            onChange: e => updateState({ selectedHsvBuffer: e.target.value })
                        }, [
                            React.createElement('option', { key: 'none', value: '' }, "None"),
                            ...availableBuffers.filter(b => b.startsWith('[HSV]')).map(b => React.createElement('option', { key: b, value: b }, b))
                        ])
                    ])
                ]),

                // Swatches
                React.createElement('div', { key: 'swatches', className: 'hsv-mod-swatch-container' }, [
                    React.createElement('div', { key: 'in', className: 'hsv-mod-swatch', style: { background: inputColor } }, "Input"),
                    React.createElement('div', { key: 'out', className: 'hsv-mod-swatch', style: { background: outputColor } }, "Output")
                ]),

                // Sliders - disabled when HSV Buffer override is active
                React.createElement(Slider, { 
                    key: 'hue', label: "Hue Shift", value: state.hueShift, min: -360, max: 360, step: 1, 
                    onChange: v => updateState({ hueShift: v }), disabled: hsvBufferOverrideActive,
                    tooltip: tooltips.controls.hueShift, HelpIcon: HelpIcon
                }),
                React.createElement(Slider, { 
                    key: 'sat', label: "Saturation", value: state.saturationScale, min: 0, max: 1, step: 0.01, 
                    onChange: v => updateState({ saturationScale: v }), disabled: hsvBufferOverrideActive,
                    tooltip: tooltips.controls.saturation, HelpIcon: HelpIcon
                }),
                React.createElement(Slider, { 
                    key: 'bri', label: "Brightness", value: state.brightnessScale, min: 0, max: 254, step: 1, 
                    onChange: v => updateState({ brightnessScale: v }), disabled: hsvBufferOverrideActive,
                    tooltip: tooltips.controls.brightness, HelpIcon: HelpIcon
                }),

                // Buttons
                React.createElement('div', { key: 'btns', style: { display: 'flex', gap: '5px', marginTop: '5px', flexWrap: 'wrap' } }, [
                    React.createElement('button', { key: 'rst', className: 'hsv-mod-btn', onClick: handleReset, title: tooltips.controls.reset }, "Reset"),
                    React.createElement('button', { key: 'inv', className: 'hsv-mod-btn', onClick: handleInvertHue, title: tooltips.controls.invertHue }, "Inv Hue"),
                    React.createElement('button', { key: 'dbl', className: 'hsv-mod-btn', onClick: handleDoubleBrightness, title: tooltips.controls.doubleBri }, "2x Bri"),
                    React.createElement('button', { key: 'save', className: 'hsv-mod-btn', onClick: savePreset, title: tooltips.controls.savePreset }, "Save Preset")
                ]),

                // Presets
                React.createElement('div', { key: 'presets', style: { marginTop: '10px', display: 'flex', alignItems: 'center', gap: '10px' } }, [
                    React.createElement('span', { key: 'lbl', className: 'hsv-mod-socket-label' }, "Presets:"),
                    React.createElement('select', {
                        key: 'sel',
                        style: { flex: 1, background: 'rgba(0,0,0,0.3)', border: '1px solid #b388ff', color: '#d1c4e9', padding: '2px', borderRadius: '4px' },
                        onChange: loadPreset
                    }, [
                        React.createElement('option', { key: 'none', value: '' }, "Select..."),
                        ...(state.presets || []).map(p => React.createElement('option', { key: p.name, value: p.name }, p.name))
                    ])
                ])
            ])
        ]);
    }

    window.nodeRegistry.register('HSVModifierNode', {
        label: "HSV Modifier",
        category: "Color",
        nodeClass: HSVModifierNode,
        factory: (cb) => new HSVModifierNode(cb),
        component: HSVModifierNodeComponent
    });

    // console.log("[HSVModifierNode] Registered");
})();
