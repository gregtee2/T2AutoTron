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
            let hsvIn = inputs.hsv_in?.[0];
            const enableIn = inputs.enable?.[0];

            // 1. Check HSV Buffer Override
            if (this.properties.selectedHsvBuffer && window.AutoTronBuffer) {
                const bufferVal = window.AutoTronBuffer.get(this.properties.selectedHsvBuffer);
                if (bufferVal && typeof bufferVal === 'object' && 'hue' in bufferVal) {
                    hsvIn = bufferVal;
                }
            }

            // Update internal state for UI visualization
            if (hsvIn) {
                this.properties.lastInputHSV = hsvIn;
            }

            // 2. Check Enable Buffer Override
            let isEnabled = (enableIn !== undefined) ? !!enableIn : this.properties.enabled;
            if (this.properties.selectedBuffer && window.AutoTronBuffer) {
                const bufferVal = window.AutoTronBuffer.get(this.properties.selectedBuffer);
                if (bufferVal !== undefined) {
                    isEnabled = !!bufferVal;
                }
            }

            if (!isEnabled || !hsvIn) {
                return { hsv_out: hsvIn || { hue: 0, saturation: 0, brightness: 0 } };
            }

            // Logic from v2 modifyHSV
            let hue = (hsvIn.hue * 360 + this.properties.hueShift) % 360;
            if (hue < 0) hue += 360;
            
            // v2 logic: overwrites saturation/brightness with slider values
            const saturation = Math.max(0, Math.min(1, this.properties.saturationScale));
            const brightness = Math.max(0, Math.min(254, this.properties.brightnessScale));

            return {
                hsv_out: {
                    hue: hue / 360,
                    saturation: saturation,
                    brightness: brightness
                }
            };
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
    const Slider = ({ label, value, min, max, step, onChange, disabled }) => {
        return React.createElement('div', { className: 'hsv-mod-slider-row', style: { opacity: disabled ? 0.5 : 1, pointerEvents: disabled ? 'none' : 'auto' } }, [
            React.createElement('span', { key: 'l', className: 'hsv-mod-slider-label' }, label),
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

        // Calculate Colors
        const inputHSV = state.lastInputHSV || { hue: 0, saturation: 0, brightness: 0 };
        const inputRGB = ColorUtils.hsvToRgb(inputHSV.hue, inputHSV.saturation, inputHSV.brightness / 254);
        const inputColor = `rgb(${inputRGB[0]},${inputRGB[1]},${inputRGB[2]})`;

        let outputColor = inputColor;
        // Determine effective enabled state
        let isEnabled = state.enabled;
        if (state.selectedBuffer && window.AutoTronBuffer) {
            const bufVal = window.AutoTronBuffer.get(state.selectedBuffer);
            if (bufVal !== undefined) isEnabled = !!bufVal;
        }

        if (isEnabled) {
            let h = (inputHSV.hue * 360 + state.hueShift) % 360;
            if (h < 0) h += 360;
            const s = Math.max(0, Math.min(1, state.saturationScale));
            const v = Math.max(0, Math.min(254, state.brightnessScale));
            const outRGB = ColorUtils.hsvToRgb(h / 360, s, v / 254);
            outputColor = `rgb(${outRGB[0]},${outRGB[1]},${outRGB[2]})`;
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

        return React.createElement('div', { className: 'hsv-mod-node-tron' }, [
            // Header
            React.createElement('div', { key: 'header', className: 'hsv-mod-header' }, [
                React.createElement('div', { key: 'left', style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
                    React.createElement('div', { 
                        key: 'toggle',
                        style: { cursor: "pointer", fontSize: "12px", color: '#b388ff' },
                        onPointerDown: (e) => { e.stopPropagation(); setIsCollapsed(!isCollapsed); }
                    }, isCollapsed ? "▶" : "▼"),
                    React.createElement('span', { key: 'title', className: 'hsv-mod-title' }, data.label)
                ]),
                React.createElement('label', { key: 'right', className: 'hsv-mod-checkbox' }, [
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
                            React.createElement('span', { key: 'lbl', className: 'hsv-mod-socket-label' }, input.label)
                        ])
                    )
                ),
                React.createElement('div', { key: 'out', style: { display: 'flex', flexDirection: 'column', gap: '5px', alignItems: 'flex-end' } }, 
                    Object.entries(data.outputs).map(([key, output]) => 
                        React.createElement('div', { key, style: { display: 'flex', alignItems: 'center', gap: '5px' } }, [
                            React.createElement('span', { key: 'lbl', className: 'hsv-mod-socket-label' }, output.label),
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
                        React.createElement('span', { key: 'lbl', className: 'hsv-mod-slider-label' }, "Enable Buf:"),
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
                        React.createElement('span', { key: 'lbl', className: 'hsv-mod-slider-label' }, "HSV Buf:"),
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

                // Sliders
                React.createElement(Slider, { 
                    key: 'hue', label: "Hue Shift", value: state.hueShift, min: -360, max: 360, step: 1, 
                    onChange: v => updateState({ hueShift: v }), disabled: !isEnabled 
                }),
                React.createElement(Slider, { 
                    key: 'sat', label: "Saturation", value: state.saturationScale, min: 0, max: 1, step: 0.01, 
                    onChange: v => updateState({ saturationScale: v }), disabled: !isEnabled 
                }),
                React.createElement(Slider, { 
                    key: 'bri', label: "Brightness", value: state.brightnessScale, min: 0, max: 254, step: 1, 
                    onChange: v => updateState({ brightnessScale: v }), disabled: !isEnabled 
                }),

                // Buttons
                React.createElement('div', { key: 'btns', style: { display: 'flex', gap: '5px', marginTop: '5px', flexWrap: 'wrap' } }, [
                    React.createElement('button', { key: 'rst', className: 'hsv-mod-btn', onClick: handleReset }, "Reset"),
                    React.createElement('button', { key: 'inv', className: 'hsv-mod-btn', onClick: handleInvertHue }, "Inv Hue"),
                    React.createElement('button', { key: 'dbl', className: 'hsv-mod-btn', onClick: handleDoubleBrightness }, "2x Bri"),
                    React.createElement('button', { key: 'save', className: 'hsv-mod-btn', onClick: savePreset }, "Save Preset")
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
        category: "CC_Control_Nodes",
        nodeClass: HSVModifierNode,
        factory: (cb) => new HSVModifierNode(cb),
        component: HSVModifierNodeComponent
    });

    console.log("[HSVModifierNode] Registered");
})();
