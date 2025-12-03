(function() {
    console.log("[AllInOneColorNode] Loading plugin...");

    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets) {
        console.error("[AllInOneColorNode] Missing dependencies");
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect, useRef, useMemo, useCallback } = React;
    const RefComponent = window.RefComponent;
    const sockets = window.sockets;

    // -------------------------------------------------------------------------
    // CSS INJECTION
    // -------------------------------------------------------------------------
    const styleId = 'all-in-one-color-node-css';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.innerHTML = `
            /* Tron / Sci-Fi Node Design (HAGenericDeviceNode.css) */
            .ha-node-tron {
                background: rgba(10, 15, 20, 0.85) !important;
                backdrop-filter: blur(12px);
                border: 1px solid #00f3ff;
                box-shadow: 0 0 15px rgba(0, 243, 255, 0.2), inset 0 0 20px rgba(0, 243, 255, 0.05);
                border-radius: 12px;
                color: #e0f7fa;
                font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                min-width: 420px;
                display: flex;
                flex-direction: column;
                transition: all 0.3s ease;
                user-select: none;
            }
            .ha-node-tron:hover {
                box-shadow: 0 0 25px rgba(0, 243, 255, 0.4), inset 0 0 30px rgba(0, 243, 255, 0.1);
                border-color: #50ffff;
            }
            .ha-node-header {
                background: linear-gradient(90deg, rgba(0, 243, 255, 0.1), rgba(0, 243, 255, 0.0));
                padding: 10px 15px;
                border-bottom: 1px solid rgba(0, 243, 255, 0.3);
                display: flex;
                flex-direction: column;
                align-items: center;
            }
            .ha-node-title {
                font-size: 16px;
                font-weight: 600;
                letter-spacing: 1px;
                text-transform: uppercase;
                color: #00f3ff;
                text-shadow: 0 0 8px rgba(0, 243, 255, 0.6);
            }
            .ha-io-container {
                display: flex;
                justify-content: space-between;
                padding: 15px;
                background: rgba(0, 0, 0, 0.2);
            }
            .ha-socket-label {
                font-size: 11px;
                color: #b2ebf2;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            .ha-controls-container {
                padding: 15px;
                border-top: 1px solid rgba(0, 243, 255, 0.2);
                background: rgba(0, 10, 15, 0.4);
                display: flex;
                flex-direction: column;
                gap: 10px;
            }
            
            /* AllInOneColorNode.css */
            .aio-slider-container {
                display: flex;
                align-items: center;
                gap: 10px;
                margin-bottom: 8px;
            }
            .aio-slider-label {
                width: 70px;
                font-size: 11px;
                color: #b2ebf2;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                text-align: right;
            }
            .aio-slider-value {
                width: 35px;
                font-size: 11px;
                color: #00f3ff;
                text-align: right;
                font-family: 'Consolas', 'Monaco', monospace;
            }
            .aio-range-input {
                -webkit-appearance: none;
                appearance: none;
                width: 100%;
                height: 4px;
                background: rgba(0, 243, 255, 0.2);
                border-radius: 2px;
                outline: none;
                transition: background 0.2s;
                flex: 1;
            }
            .aio-range-input:hover {
                background: rgba(0, 243, 255, 0.3);
            }
            .aio-range-input::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: 14px;
                height: 14px;
                border-radius: 50%;
                background: #0a0f14;
                border: 2px solid #00f3ff;
                cursor: pointer;
                box-shadow: 0 0 8px rgba(0, 243, 255, 0.5);
                transition: all 0.2s ease;
                margin-top: -5px;
            }
            .aio-range-input::-webkit-slider-thumb:hover {
                background: #00f3ff;
                box-shadow: 0 0 12px rgba(0, 243, 255, 0.8);
                transform: scale(1.1);
            }
            .aio-section-header {
                font-size: 10px;
                color: #50ffff;
                text-transform: uppercase;
                letter-spacing: 1px;
                margin-bottom: 8px;
                margin-top: 4px;
                border-bottom: 1px solid rgba(0, 243, 255, 0.1);
                padding-bottom: 2px;
            }
            .aio-swatch {
                height: 50px;
                border-radius: 6px;
                border: 1px solid rgba(255, 255, 255, 0.2);
                margin: 10px 15px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-family: 'Consolas', monospace;
                font-size: 14px;
                text-shadow: 0 1px 3px rgba(0,0,0,0.8);
                box-shadow: inset 0 0 20px rgba(0,0,0,0.5);
                transition: background 0.1s;
            }
            .aio-palette-container {
                display: flex;
                gap: 6px;
                flex-wrap: wrap;
                padding: 5px 0;
            }
            .aio-palette-item {
                width: 24px;
                height: 24px;
                border-radius: 4px;
                cursor: pointer;
                border: 1px solid rgba(255,255,255,0.1);
                transition: transform 0.2s, border-color 0.2s;
            }
            .aio-palette-item:hover {
                transform: scale(1.1);
                border-color: #fff;
                box-shadow: 0 0 8px rgba(255,255,255,0.5);
            }
            .aio-checkbox-container {
                display: flex;
                align-items: center;
                gap: 8px;
                cursor: pointer;
                font-size: 11px;
                color: #b2ebf2;
            }
            .aio-checkbox {
                appearance: none;
                width: 14px;
                height: 14px;
                border: 1px solid #00f3ff;
                border-radius: 3px;
                background: rgba(0, 20, 30, 0.5);
                cursor: pointer;
                position: relative;
            }
            .aio-checkbox:checked {
                background: #00f3ff;
            }
            .aio-checkbox:checked::after {
                content: '✔';
                position: absolute;
                top: -2px;
                left: 1px;
                font-size: 10px;
                color: #000;
            }
        `;
        document.head.appendChild(style);
    }

    // -------------------------------------------------------------------------
    // COLOR UTILS
    // -------------------------------------------------------------------------
    const ColorUtils = {
        rgbToHsv: (r, g, b) => {
            r /= 255; g /= 255; b /= 255;
            const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
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
            return { hue: h, sat: s, val: max };
        },
        hsvToRgb: (h, s, v) => {
            const i = Math.floor(h * 6), f = h * 6 - i;
            const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
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
        kelvinToRGB: (kelvin) => {
            kelvin = Math.max(1000, Math.min(40000, kelvin));
            const t = kelvin / 100;
            let r, g, b;
            if (t <= 66) r = 255;
            else { r = t - 60; r = 329.698727446 * Math.pow(r, -0.1332047592); r = Math.max(0, Math.min(255, r)); }
            if (t <= 66) { g = 99.4708025861 * Math.log(t) - 161.1195681661; }
            else { g = 288.1221695283 * Math.pow(t - 60, -0.0755148492); }
            g = Math.max(0, Math.min(255, g));
            if (t >= 66) b = 255;
            else if (t <= 19) b = 0;
            else { b = 138.5177312231 * Math.log(t - 10) - 305.0447927307; }
            b = Math.max(0, Math.min(255, b));
            return { r: Math.round(r), g: Math.round(g), b: Math.round(b) };
        },
        hexToRgb: (hex) => {
            const s = hex.replace("#", "");
            return {
                r: parseInt(s.substr(0, 2), 16),
                g: parseInt(s.substr(2, 2), 16),
                b: parseInt(s.substr(4, 2), 16)
            };
        },
        interpolate: (v, minV, maxV, start, end) => {
            return start + ((v - minV) / (maxV - minV)) * (end - start);
        }
    };

    // -------------------------------------------------------------------------
    // NODE CLASS
    // -------------------------------------------------------------------------
    class AllInOneColorNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("All-in-One Color Control");
            this.width = 400;
            this.changeCallback = changeCallback;

            try {
                this.addInput("hsv_in", new ClassicPreset.Input(sockets.object || new ClassicPreset.Socket('object'), "HSV In"));
                this.addInput("scene_hsv", new ClassicPreset.Input(sockets.object || new ClassicPreset.Socket('object'), "Scene HSV"));
                this.addOutput("hsv_out", new ClassicPreset.Output(sockets.object || new ClassicPreset.Socket('object'), "HSV Info"));
            } catch (e) {
                console.error("[AllInOneColorNode] Error adding sockets:", e);
            }

            this.properties = {
                red: 128, green: 128, blue: 128,
                hueShift: 10, saturation: 20, brightness: 128,
                colorTemp: 4150, whiteAdjust: 4000,
                transitionTime: 0,
                enableAutoTrigger: false,
                autoInterval: 5000,
                showPalette: true,
                activeMode: 'color'
            };
        }

        data(inputs) {
            const scene = inputs.scene_hsv?.[0];
            if (scene) {
                return { hsv_out: scene };
            }

            const output = {
                hue: this.properties.hueShift / 360,
                saturation: this.properties.saturation / 100,
                brightness: this.properties.brightness,
                transition: this.properties.transitionTime,
                colorTemp: this.properties.colorTemp,
                mode: this.properties.activeMode,
                on: this.properties.brightness > 0,
                h: this.properties.hueShift,
                s: this.properties.saturation / 100,
                v: this.properties.brightness / 255
            };
            return { hsv_out: output };
        }
        
        restore(state) {
            if (state.properties) {
                Object.assign(this.properties, state.properties);
            }
        }
    }

    // -------------------------------------------------------------------------
    // COMPONENT
    // -------------------------------------------------------------------------
    const Slider = ({ label, value, min, max, onChange, step = 1 }) => {
        return React.createElement('div', { className: 'aio-slider-container' }, [
            React.createElement('span', { key: 'label', className: 'aio-slider-label' }, label),
            React.createElement('input', {
                key: 'input',
                type: 'range',
                min, max, step,
                value,
                onChange: (e) => onChange(Number(e.target.value)),
                className: 'aio-range-input'
            }),
            React.createElement('span', { key: 'val', className: 'aio-slider-value' }, value)
        ]);
    };

    function AllInOneColorNodeComponent({ data, emit }) {
        const [state, setState] = useState({ ...data.properties });
        const [isCollapsed, setIsCollapsed] = useState(false);
        const [autoTimer, setAutoTimer] = useState(null);
        
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
            const limit = 50; 

            if (now - lastUpdateRef.current >= limit) {
                triggerEngineUpdate();
                lastUpdateRef.current = now;
            } else {
                if (timeoutRef.current) clearTimeout(timeoutRef.current);
                timeoutRef.current = setTimeout(() => {
                    triggerEngineUpdate();
                    lastUpdateRef.current = Date.now();
                }, limit - (now - lastUpdateRef.current));
            }
        };

        useEffect(() => {
            return () => {
                if (timeoutRef.current) clearTimeout(timeoutRef.current);
            };
        }, []);

        useEffect(() => {
            if (state.enableAutoTrigger) {
                const interval = setInterval(() => {
                    if (data.changeCallback) data.changeCallback();
                }, state.autoInterval);
                setAutoTimer(interval);
                return () => clearInterval(interval);
            } else {
                if (autoTimer) clearInterval(autoTimer);
                setAutoTimer(null);
            }
        }, [state.enableAutoTrigger, state.autoInterval]);

        const calculateColorTemp = (r, b) => {
            const warmth = r - b;
            let temp = 4150;
            if (warmth > 50) temp = ColorUtils.interpolate(warmth, 50, 255, 3000, 1800);
            else if (warmth < -50) temp = ColorUtils.interpolate(warmth, -255, -50, 6500, 5000);
            temp = Math.round(temp);
            return Math.max(1800, Math.min(6500, temp));
        };

        const updateHSVFromRGB = (r, g, b) => {
            const { hue, sat, val } = ColorUtils.rgbToHsv(r, g, b);
            const newTemp = calculateColorTemp(r, b);
            updateState({
                red: r, green: g, blue: b,
                hueShift: Math.round(hue * 360),
                saturation: Math.round(sat * 100),
                brightness: Math.round(val * 255),
                colorTemp: newTemp,
                activeMode: 'color'
            });
        };

        const updateRGBFromHueSat = (h, s, v_byte) => {
            const v = v_byte / 255;
            const [r, g, b] = ColorUtils.hsvToRgb(h / 360, s / 100, v);
            const newTemp = calculateColorTemp(r, b);
            updateState({
                red: r, green: g, blue: b,
                hueShift: h, saturation: s, brightness: v_byte,
                colorTemp: newTemp,
                activeMode: 'color'
            });
        };

        const updateRGBFromTemp = (k, brightnessOverride = null) => {
            const bri = brightnessOverride !== null ? brightnessOverride : state.brightness;
            const target = ColorUtils.kelvinToRGB(k);
            const { hue, sat } = ColorUtils.rgbToHsv(target.r, target.g, target.b);
            const v = bri / 255;
            const [r, g, b] = ColorUtils.hsvToRgb(hue, sat, v);
            
            updateState({
                colorTemp: k,
                red: r, green: g, blue: b,
                hueShift: Math.round(hue * 360),
                saturation: Math.round(sat * 100),
                brightness: bri,
                activeMode: 'temp'
            });
        };

        const handleBrightnessChange = (newBri) => {
            if (state.activeMode === 'temp') {
                updateRGBFromTemp(state.colorTemp, newBri);
            } else {
                updateRGBFromHueSat(state.hueShift, state.saturation, newBri);
            }
        };

        const handlePaletteClick = (hex) => {
            const rgb = ColorUtils.hexToRgb(hex);
            updateHSVFromRGB(rgb.r, rgb.g, rgb.b);
        };

        const paletteColors = ["#FF0000","#FFA500","#FFFF00","#00FF00","#0000FF","#00FFFF","#800080","#FFFFFF"];
        const rgb = `rgb(${state.red},${state.green},${state.blue})`;

        return React.createElement('div', { className: 'ha-node-tron', style: { minWidth: '380px' } }, [
            // Header
            React.createElement('div', { key: 'header', className: 'ha-node-header' }, [
                React.createElement('div', { key: 'row', style: { display: "flex", alignItems: "center", gap: "8px", width: '100%' } }, [
                    React.createElement('div', { 
                        key: 'toggle',
                        style: { cursor: "pointer", fontSize: "12px", userSelect: "none", color: '#00f3ff' },
                        onPointerDown: (e) => { e.stopPropagation(); setIsCollapsed(!isCollapsed); }
                    }, isCollapsed ? "▶" : "▼"),
                    React.createElement('div', { key: 'title', className: 'ha-node-title', style: { flex: 1, textAlign: 'center' } }, data.label)
                ])
            ]),

            // IO Ports
            React.createElement('div', { key: 'io', className: 'ha-io-container' }, [
                React.createElement('div', { key: 'inputs', className: 'inputs' }, 
                    Object.entries(data.inputs).map(([key, input]) => 
                        React.createElement('div', { key: key, style: { display: "flex", alignItems: "center", gap: "8px", marginBottom: '4px' } }, [
                            React.createElement(RefComponent, {
                                key: 'ref',
                                init: ref => emit({ type: "render", data: { type: "socket", element: ref, payload: input.socket, nodeId: data.id, side: "input", key } }),
                                unmount: ref => emit({ type: "unmount", data: { element: ref } })
                            }),
                            React.createElement('span', { key: 'label', className: 'ha-socket-label' }, input.label)
                        ])
                    )
                ),
                React.createElement('div', { key: 'outputs', className: 'outputs' }, 
                    Object.entries(data.outputs).map(([key, output]) => 
                        React.createElement('div', { key: key, style: { display: "flex", alignItems: "center", gap: "8px", justifyContent: 'flex-end', marginBottom: '4px' } }, [
                            React.createElement('span', { key: 'label', className: 'ha-socket-label' }, output.label),
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
                className: 'ha-controls-container', 
                onPointerDown: (e) => e.stopPropagation(),
                style: { cursor: "default" }
            }, [
                // Swatch
                React.createElement('div', { 
                    key: 'swatch', 
                    className: 'aio-swatch', 
                    style: { background: rgb } 
                }, `${state.colorTemp}K (${state.activeMode})`),

                // RGB Sliders
                React.createElement('div', { key: 'rgb', style: { borderBottom: "1px solid rgba(0, 243, 255, 0.1)", paddingBottom: "8px", marginBottom: "8px" } }, [
                    React.createElement('div', { key: 'h', className: 'aio-section-header' }, 'RGB Channels'),
                    React.createElement(Slider, { key: 'r', label: "Red", value: state.red, min: 0, max: 255, onChange: v => updateHSVFromRGB(v, state.green, state.blue) }),
                    React.createElement(Slider, { key: 'g', label: "Green", value: state.green, min: 0, max: 255, onChange: v => updateHSVFromRGB(state.red, v, state.blue) }),
                    React.createElement(Slider, { key: 'b', label: "Blue", value: state.blue, min: 0, max: 255, onChange: v => updateHSVFromRGB(state.red, state.green, v) })
                ]),

                // HSV Sliders
                React.createElement('div', { key: 'hsv', style: { borderBottom: "1px solid rgba(0, 243, 255, 0.1)", paddingBottom: "8px", marginBottom: "8px" } }, [
                    React.createElement('div', { key: 'h', className: 'aio-section-header' }, 'HSV Control'),
                    React.createElement(Slider, { key: 'hue', label: "Hue", value: state.hueShift, min: 0, max: 360, onChange: v => updateRGBFromHueSat(v, state.saturation, state.brightness) }),
                    React.createElement(Slider, { key: 'sat', label: "Sat", value: state.saturation, min: 0, max: 100, onChange: v => updateRGBFromHueSat(state.hueShift, v, state.brightness) }),
                    React.createElement(Slider, { key: 'bri', label: "Bri", value: state.brightness, min: 0, max: 255, onChange: handleBrightnessChange })
                ]),

                // Temp Sliders
                React.createElement('div', { key: 'temp', style: { borderBottom: "1px solid rgba(0, 243, 255, 0.1)", paddingBottom: "8px", marginBottom: "8px" } }, [
                    React.createElement('div', { key: 'h', className: 'aio-section-header' }, 'Temperature'),
                    React.createElement(Slider, { key: 't', label: "Temp (K)", value: state.colorTemp, min: 1800, max: 6500, step: 50, onChange: v => updateRGBFromTemp(v) })
                ]),

                // Settings
                React.createElement('div', { key: 'settings' }, [
                    React.createElement('div', { key: 'h', className: 'aio-section-header' }, 'Settings'),
                    React.createElement(Slider, { key: 'trans', label: "Trans (ms)", value: state.transitionTime, min: 0, max: 5000, step: 100, onChange: v => updateState({ transitionTime: v }) }),
                    React.createElement('div', { key: 'auto', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' } }, [
                        React.createElement('label', { key: 'chk', className: 'aio-checkbox-container' }, [
                            React.createElement('input', {
                                key: 'in',
                                type: 'checkbox',
                                className: 'aio-checkbox',
                                checked: state.enableAutoTrigger,
                                onPointerDown: (e) => e.stopPropagation(),
                                onChange: e => updateState({ enableAutoTrigger: e.target.checked })
                            }),
                            React.createElement('span', { key: 'lbl' }, "Auto Trigger")
                        ]),
                        state.enableAutoTrigger && React.createElement('div', { key: 'int', style: { display: 'flex', alignItems: 'center', gap: '5px' } }, [
                            React.createElement('span', { key: 'l', className: 'aio-slider-label', style: { width: 'auto' } }, "Interval:"),
                            React.createElement('input', {
                                key: 'v',
                                type: 'number',
                                value: state.autoInterval,
                                onChange: e => updateState({ autoInterval: Number(e.target.value) }),
                                style: { width: '60px', background: 'rgba(0,0,0,0.3)', border: '1px solid #00f3ff', color: '#00f3ff', fontSize: '11px', padding: '2px 4px' }
                            })
                        ])
                    ])
                ]),

                // Palette
                state.showPalette && React.createElement('div', { key: 'pal', className: 'aio-palette-container' }, 
                    paletteColors.map(col => 
                        React.createElement('div', {
                            key: col,
                            className: 'aio-palette-item',
                            onPointerDown: (e) => e.stopPropagation(),
                            onClick: () => handlePaletteClick(col),
                            style: { background: col }
                        })
                    )
                )
            ])
        ]);
    }

    window.nodeRegistry.register('AllInOneColorNode', {
        label: "All-in-One Color Control",
        category: "CC_Control_Nodes",
        nodeClass: AllInOneColorNode,
        factory: (cb) => new AllInOneColorNode(cb),
        component: AllInOneColorNodeComponent
    });

    console.log("[AllInOneColorNode] Registered");
})();
