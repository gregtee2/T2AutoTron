(function() {
    // Debug: console.log("[AllInOneColorNode] Loading plugin...");

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
    // CSS is now loaded from node-styles.css via index.css
    // -------------------------------------------------------------------------

    // -------------------------------------------------------------------------
    // COLOR UTILS - Use shared ColorUtilsPlugin (window.ColorUtils)
    // -------------------------------------------------------------------------
    if (!window.ColorUtils) {
        console.error("[AllInOneColorNode] window.ColorUtils not found! Make sure 00_ColorUtilsPlugin.js loads first.");
    }
    const ColorUtils = window.ColorUtils;

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

        serialize() {
            return {
                red: this.properties.red,
                green: this.properties.green,
                blue: this.properties.blue,
                hueShift: this.properties.hueShift,
                saturation: this.properties.saturation,
                brightness: this.properties.brightness,
                colorTemp: this.properties.colorTemp,
                whiteAdjust: this.properties.whiteAdjust,
                transitionTime: this.properties.transitionTime,
                enableAutoTrigger: this.properties.enableAutoTrigger,
                autoInterval: this.properties.autoInterval,
                showPalette: this.properties.showPalette,
                activeMode: this.properties.activeMode
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

        return React.createElement('div', { className: 'hsv-node-tron', style: { minWidth: '380px' } }, [
            // Header
            React.createElement('div', { key: 'header', className: 'hsv-node-header' }, [
                React.createElement('div', { key: 'row', style: { display: "flex", alignItems: "center", gap: "8px", width: '100%' } }, [
                    React.createElement('div', { 
                        key: 'toggle',
                        style: { cursor: "pointer", fontSize: "12px", userSelect: "none", color: 'var(--node-color-color, #f48fb1)' },
                        onPointerDown: (e) => { e.stopPropagation(); setIsCollapsed(!isCollapsed); }
                    }, isCollapsed ? "▶" : "▼"),
                    React.createElement('div', { key: 'title', className: 'hsv-node-title', style: { flex: 1, textAlign: 'center' } }, data.label)
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
                                style: { width: '60px', background: 'rgba(0,0,0,0.3)', border: '1px solid #f48fb1', color: '#f48fb1', fontSize: '11px', padding: '2px 4px' }
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
        category: "Color",
        nodeClass: AllInOneColorNode,
        factory: (cb) => new AllInOneColorNode(cb),
        component: AllInOneColorNodeComponent
    });

    // console.log("[AllInOneColorNode] Registered");
})();
