(function() {
    console.log("[HSVModifierNode] Loading plugin...");

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
    // CSS INJECTION
    // -------------------------------------------------------------------------
    const styleId = 'hsv-modifier-node-css';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.innerHTML = `
            .hsv-mod-node-tron {
                background: rgba(15, 20, 25, 0.9) !important;
                backdrop-filter: blur(12px);
                border: 1px solid #b388ff;
                box-shadow: 0 0 15px rgba(179, 136, 255, 0.2), inset 0 0 20px rgba(179, 136, 255, 0.05);
                border-radius: 12px;
                color: #ede7f6;
                font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                min-width: 400px;
                display: flex;
                flex-direction: column;
                transition: all 0.3s ease;
                user-select: none;
            }
            .hsv-mod-node-tron:hover {
                box-shadow: 0 0 25px rgba(179, 136, 255, 0.4), inset 0 0 30px rgba(179, 136, 255, 0.1);
                border-color: #d1c4e9;
            }
            .hsv-mod-header {
                background: linear-gradient(90deg, rgba(179, 136, 255, 0.1), rgba(179, 136, 255, 0.0));
                padding: 10px 15px;
                border-bottom: 1px solid rgba(179, 136, 255, 0.3);
                display: flex;
                align-items: center;
                justify-content: space-between;
            }
            .hsv-mod-title {
                font-size: 16px;
                font-weight: 600;
                letter-spacing: 1px;
                text-transform: uppercase;
                color: #b388ff;
                text-shadow: 0 0 8px rgba(179, 136, 255, 0.6);
            }
            .hsv-mod-io {
                display: flex;
                justify-content: space-between;
                padding: 15px;
                background: rgba(0, 0, 0, 0.2);
            }
            .hsv-mod-socket-label {
                font-size: 11px;
                color: #d1c4e9;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            .hsv-mod-controls {
                padding: 15px;
                border-top: 1px solid rgba(179, 136, 255, 0.2);
                background: rgba(10, 15, 20, 0.4);
                display: flex;
                flex-direction: column;
                gap: 10px;
            }
            .hsv-mod-slider-row {
                display: flex;
                align-items: center;
                gap: 10px;
                margin-bottom: 8px;
            }
            .hsv-mod-slider-label {
                width: 90px;
                font-size: 11px;
                color: #d1c4e9;
                text-transform: uppercase;
                text-align: right;
            }
            .hsv-mod-slider-val {
                width: 40px;
                font-size: 11px;
                color: #b388ff;
                text-align: right;
                font-family: monospace;
            }
            .hsv-mod-range {
                -webkit-appearance: none;
                appearance: none;
                width: 100%;
                height: 4px;
                background: rgba(179, 136, 255, 0.2);
                border-radius: 2px;
                outline: none;
                flex: 1;
            }
            .hsv-mod-range::-webkit-slider-thumb {
                -webkit-appearance: none; appearance: none; width: 14px; height: 14px; border-radius: 50%;
                background: #0a0f14; border: 2px solid #b388ff; cursor: pointer;
                box-shadow: 0 0 8px rgba(179, 136, 255, 0.5); margin-top: -5px;
            }
            .hsv-mod-swatch-container {
                display: flex;
                gap: 10px;
                margin-bottom: 10px;
            }
            .hsv-mod-swatch {
                flex: 1;
                height: 40px;
                border-radius: 6px;
                border: 1px solid rgba(255, 255, 255, 0.2);
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 10px;
                color: #fff;
                text-shadow: 0 1px 2px rgba(0,0,0,0.8);
                background: #333;
                transition: background 0.2s;
            }
            .hsv-mod-btn {
                background: rgba(179, 136, 255, 0.1);
                border: 1px solid #b388ff;
                color: #b388ff;
                padding: 4px 8px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 10px;
                text-transform: uppercase;
                transition: all 0.2s;
            }
            .hsv-mod-btn:hover {
                background: rgba(179, 136, 255, 0.3);
                box-shadow: 0 0 8px rgba(179, 136, 255, 0.4);
            }
            .hsv-mod-checkbox {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 11px;
                color: #d1c4e9;
                cursor: pointer;
            }
            .hsv-mod-checkbox input {
                accent-color: #b388ff;
            }
            .hsv-mod-select-row {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 5px;
            }
            .hsv-mod-select {
                flex: 1;
                background: rgba(0, 0, 0, 0.3);
                border: 1px solid #b388ff;
                color: #d1c4e9;
                padding: 2px;
                border-radius: 4px;
                font-size: 11px;
            }
        `;
        document.head.appendChild(style);
    }

    // -------------------------------------------------------------------------
    // COLOR UTILS
    // -------------------------------------------------------------------------
    const ColorUtils = {
        hsvToRgb: (h, s, v) => {
            const i = Math.floor(h * 6);
            const f = h * 6 - i;
            const p = v * (1 - s);
            const q = v * (1 - f * s);
            const t = v * (1 - (1 - f) * s);
            let r, g, b;
            switch (i % 6) {
                case 0: r = v; g = t; b = p; break;
                case 1: r = q; g = v; b = p; break;
                case 2: r = p; g = v; b = t; break;
                case 3: r = p; g = q; b = v; break;
                case 4: r = t; g = p; b = v; break;
                case 5: r = v; g = p; b = q; break;
            }
            return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
        },
        rgbToHsv: (r, g, b) => {
            r /= 255; g /= 255; b /= 255;
            const max = Math.max(r, g, b), min = Math.min(r, g, b);
            const d = max - min;
            const s = max === 0 ? 0 : d / max;
            let h = 0;
            if (max !== min) {
                switch (max) {
                    case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                    case g: h = (b - r) / d + 2; break;
                    case b: h = (r - g) / d + 4; break;
                }
                h /= 6;
            }
            return { hue: h, saturation: s, brightness: max * 254 };
        }
    };

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
                React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
                    React.createElement('div', { 
                        key: 'toggle',
                        style: { cursor: "pointer", fontSize: "12px", color: '#b388ff' },
                        onPointerDown: (e) => { e.stopPropagation(); setIsCollapsed(!isCollapsed); }
                    }, isCollapsed ? "▶" : "▼"),
                    React.createElement('span', { className: 'hsv-mod-title' }, data.label)
                ]),
                React.createElement('label', { className: 'hsv-mod-checkbox' }, [
                    React.createElement('input', {
                        type: 'checkbox',
                        checked: state.enabled,
                        onChange: e => updateState({ enabled: e.target.checked })
                    }),
                    React.createElement('span', {}, "Enabled")
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
                            React.createElement('span', { className: 'hsv-mod-socket-label' }, input.label)
                        ])
                    )
                ),
                React.createElement('div', { key: 'out', style: { display: 'flex', flexDirection: 'column', gap: '5px', alignItems: 'flex-end' } }, 
                    Object.entries(data.outputs).map(([key, output]) => 
                        React.createElement('div', { key, style: { display: 'flex', alignItems: 'center', gap: '5px' } }, [
                            React.createElement('span', { className: 'hsv-mod-socket-label' }, output.label),
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
                    React.createElement('div', { className: 'hsv-mod-select-row' }, [
                        React.createElement('span', { className: 'hsv-mod-slider-label' }, "Enable Buf:"),
                        React.createElement('select', {
                            className: 'hsv-mod-select',
                            value: state.selectedBuffer,
                            onChange: e => updateState({ selectedBuffer: e.target.value })
                        }, [
                            React.createElement('option', { key: 'none', value: '' }, "None"),
                            ...availableBuffers.filter(b => b.startsWith('[Trigger]')).map(b => React.createElement('option', { key: b, value: b }, b))
                        ])
                    ]),
                    React.createElement('div', { className: 'hsv-mod-select-row' }, [
                        React.createElement('span', { className: 'hsv-mod-slider-label' }, "HSV Buf:"),
                        React.createElement('select', {
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
                    React.createElement('span', { className: 'hsv-mod-socket-label' }, "Presets:"),
                    React.createElement('select', {
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
