(function() {
    // Debug: console.log("[HSVControlNode] Loading plugin...");

    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets) {
        console.error("[HSVControlNode] Missing dependencies");
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
        console.error("[HSVControlNode] window.ColorUtils not found! Make sure 00_ColorUtilsPlugin.js loads first.");
    }
    const ColorUtils = window.ColorUtils;

    // -------------------------------------------------------------------------
    // NODE CLASS
    // -------------------------------------------------------------------------
    class HSVControlNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("HSV Control");
            this.width = 425;
            this.changeCallback = changeCallback;

            try {
                this.addInput("hsv_in", new ClassicPreset.Input(sockets.object || new ClassicPreset.Socket('object'), "HSV In"));
                this.addInput("scene_hsv", new ClassicPreset.Input(sockets.object || new ClassicPreset.Socket('object'), "Scene HSV"));
                this.addOutput("hsv_out", new ClassicPreset.Output(sockets.object || new ClassicPreset.Socket('object'), "HSV Info"));
            } catch (e) { console.error("[HSVControlNode] Error adding sockets:", e); }

            this.properties = {
                hueShift: 10, saturation: 20, brightness: 128,
                transitionTime: 0,
                enableCommand: false,
                autoTriggerInterval: 5000,
                showColorOptions: true,
                whiteAdjust: 4000
            };
        }

        data(inputs) {
            const scene = inputs.scene_hsv?.[0];
            if (scene) return { hsv_out: scene };

            const inputHSV = inputs.hsv_in?.[0];
            if (inputHSV) {
                // Logic to update properties from input if needed, but usually inputs drive the output directly or update state
                // For this node, inputs seem to override internal state in the 2.0 logic
                // We'll handle this in the component or just pass through if we want pure data flow
                // But the 2.0 node updates its internal sliders based on input.
                // We can't easily update React state from here without a callback loop.
                // For now, we'll return the internal state.
            }

            return {
                hsv_out: {
                    hue: this.properties.hueShift / 360,
                    saturation: this.properties.saturation / 100,
                    brightness: this.properties.brightness,
                    transition: this.properties.transitionTime
                }
            };
        }

        restore(state) {
            if (state.properties) Object.assign(this.properties, state.properties);
        }

        serialize() {
            return {
                hueShift: this.properties.hueShift,
                saturation: this.properties.saturation,
                brightness: this.properties.brightness,
                transitionTime: this.properties.transitionTime,
                enableCommand: this.properties.enableCommand,
                autoTriggerInterval: this.properties.autoTriggerInterval,
                showColorOptions: this.properties.showColorOptions,
                whiteAdjust: this.properties.whiteAdjust
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
        return React.createElement('div', { className: 'hsv-slider-container' }, [
            React.createElement('span', { key: 'label', className: 'hsv-slider-label' }, label),
            React.createElement('input', {
                key: 'input',
                type: 'range',
                min, max, step,
                value,
                onChange: (e) => onChange(Number(e.target.value)),
                className: 'hsv-range-input'
            }),
            React.createElement('span', { key: 'val', className: 'hsv-slider-value' }, value)
        ]);
    };

    function HSVControlNodeComponent({ data, emit }) {
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
            const limit = 100; // 100ms = 10 updates/sec max (was 50ms but caused lag)
            
            // Throttle: fire immediately if enough time passed, 
            // but DON'T cancel pending trailing update
            if (now - lastUpdateRef.current >= limit) {
                triggerEngineUpdate();
                lastUpdateRef.current = now;
            }
            
            // Always schedule a trailing update to catch the final value
            // Only one timeout at a time (clear previous, schedule new)
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            timeoutRef.current = setTimeout(() => {
                triggerEngineUpdate();
                lastUpdateRef.current = Date.now();
            }, limit);
        };

        useEffect(() => {
            return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
        }, []);

        // Auto Trigger Logic
        useEffect(() => {
            if (state.enableCommand) {
                const interval = setInterval(() => {
                    if (data.changeCallback) data.changeCallback();
                }, state.autoTriggerInterval);
                setAutoTimer(interval);
                return () => clearInterval(interval);
            } else {
                if (autoTimer) clearInterval(autoTimer);
                setAutoTimer(null);
            }
        }, [state.enableCommand, state.autoTriggerInterval]);

        // Kelvin Change
        const handleWhiteAdjust = (kelvin) => {
            const hsv = ColorUtils.kelvinToHSV(kelvin);
            updateState({
                whiteAdjust: kelvin,
                hueShift: hsv.hue,
                saturation: hsv.saturation
            });
        };

        // Palette Click
        const handlePaletteClick = (hex) => {
            const rgb = ColorUtils.hexToRgb(hex);
            const { hue, sat, val } = ColorUtils.rgbToHsv(rgb.r, rgb.g, rgb.b);
            updateState({
                hueShift: Math.round(hue * 360),
                saturation: Math.round(sat * 100),
                brightness: Math.round(val * 254) // 2.0 uses 254 max
            });
        };

        // Paste HSV
        const handlePasteHSV = async () => {
            try {
                const text = await navigator.clipboard.readText();
                const hsv = JSON.parse(text);
                if (typeof hsv.hue === 'number' && typeof hsv.saturation === 'number' && typeof hsv.brightness === 'number') {
                    updateState({
                        hueShift: Math.round(hsv.hue * 360),
                        saturation: Math.round(hsv.saturation * 100),
                        brightness: Math.round(hsv.brightness)
                    });
                    alert("HSV settings pasted successfully.");
                } else {
                    throw new Error("Invalid format");
                }
            } catch (err) {
                console.error("Paste failed:", err);
                const manual = prompt("Paste HSV JSON (e.g. {\"hue\":0.5,\"saturation\":1.0,\"brightness\":254})");
                if (manual) {
                    try {
                        const hsv = JSON.parse(manual);
                        updateState({
                            hueShift: Math.round(hsv.hue * 360),
                            saturation: Math.round(hsv.saturation * 100),
                            brightness: Math.round(hsv.brightness)
                        });
                    } catch (e) { alert("Invalid JSON"); }
                }
            }
        };

        // Reset
        const handleReset = () => {
            updateState({
                hueShift: 10, saturation: 20, brightness: 128,
                transitionTime: 0, whiteAdjust: 4000
            });
        };

        // Presets
        const applyPreset = (preset) => {
            updateState({
                hueShift: preset.hue,
                saturation: preset.saturation,
                brightness: preset.brightness
            });
        };

        const rgb = ColorUtils.hsvToRgb(state.hueShift / 360, state.saturation / 100, state.brightness / 254);
        const rgbString = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
        const paletteColors = ["#FF0000","#FFA500","#FFFF00","#00FF00","#0000FF","#00FFFF","#800080","#FFFFFF"];

        return React.createElement('div', { className: 'hsv-node-tron' }, [
            // Header
            React.createElement('div', { key: 'header', className: 'hsv-node-header' }, [
                React.createElement('div', { key: 'row', style: { display: "flex", alignItems: "center", gap: "8px", width: '100%' } }, [
                    React.createElement('div', { 
                        key: 'toggle',
                        style: { cursor: "pointer", fontSize: "12px", userSelect: "none", color: '#f48fb1' },
                        onPointerDown: (e) => { e.stopPropagation(); setIsCollapsed(!isCollapsed); }
                    }, isCollapsed ? "▶" : "▼"),
                    React.createElement('div', { key: 'title', className: 'hsv-node-title', style: { flex: 1, textAlign: 'center' } }, data.label)
                ])
            ]),

            // IO Ports
            React.createElement('div', { key: 'io', className: 'hsv-io-container' }, [
                React.createElement('div', { key: 'inputs', className: 'inputs' }, 
                    Object.entries(data.inputs).map(([key, input]) => 
                        React.createElement('div', { key: key, style: { display: "flex", alignItems: "center", gap: "8px", marginBottom: '4px' } }, [
                            React.createElement(RefComponent, {
                                key: 'ref',
                                init: ref => emit({ type: "render", data: { type: "socket", element: ref, payload: input.socket, nodeId: data.id, side: "input", key } }),
                                unmount: ref => emit({ type: "unmount", data: { element: ref } })
                            }),
                            React.createElement('span', { key: 'label', className: 'hsv-socket-label' }, input.label)
                        ])
                    )
                ),
                React.createElement('div', { key: 'outputs', className: 'outputs' }, 
                    Object.entries(data.outputs).map(([key, output]) => 
                        React.createElement('div', { key: key, style: { display: "flex", alignItems: "center", gap: "8px", justifyContent: 'flex-end', marginBottom: '4px' } }, [
                            React.createElement('span', { key: 'label', className: 'hsv-socket-label' }, output.label),
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
                className: 'hsv-controls-container', 
                onPointerDown: (e) => e.stopPropagation(),
                style: { cursor: "default" }
            }, [
                // Swatch
                React.createElement('div', { 
                    key: 'swatch', 
                    className: 'hsv-swatch', 
                    style: { background: rgbString } 
                }, `H:${state.hueShift} S:${state.saturation} B:${state.brightness}`),

                // Sliders
                React.createElement('div', { key: 'sliders', style: { borderBottom: "1px solid rgba(0, 243, 255, 0.1)", paddingBottom: "8px", marginBottom: "8px" } }, [
                    React.createElement('div', { key: 'h', className: 'hsv-section-header' }, 'HSV Control'),
                    React.createElement(Slider, { key: 'hue', label: "Hue Shift", value: state.hueShift, min: 0, max: 360, onChange: v => updateState({ hueShift: v }) }),
                    React.createElement(Slider, { key: 'sat', label: "Saturation", value: state.saturation, min: 0, max: 100, onChange: v => updateState({ saturation: v }) }),
                    React.createElement(Slider, { key: 'bri', label: "Brightness", value: state.brightness, min: 0, max: 254, onChange: v => updateState({ brightness: v }) }),
                    React.createElement(Slider, { key: 'white', label: "White (K)", value: state.whiteAdjust, min: 1800, max: 7500, step: 100, onChange: handleWhiteAdjust }),
                    React.createElement(Slider, { key: 'trans', label: "Trans (ms)", value: state.transitionTime, min: 0, max: 5000, step: 100, onChange: v => updateState({ transitionTime: v }) })
                ]),

                // Settings & Buttons
                React.createElement('div', { key: 'settings' }, [
                    React.createElement('div', { key: 'h', className: 'hsv-section-header' }, 'Settings'),
                    
                    // Auto Trigger
                    React.createElement('div', { key: 'auto', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' } }, [
                        React.createElement('label', { key: 'chk', className: 'hsv-checkbox-container' }, [
                            React.createElement('input', {
                                key: 'in',
                                type: 'checkbox',
                                className: 'hsv-checkbox',
                                checked: state.enableCommand,
                                onChange: e => updateState({ enableCommand: e.target.checked })
                            }),
                            React.createElement('span', { key: 'lbl' }, "Auto Trigger")
                        ]),
                        state.enableCommand && React.createElement('div', { key: 'int', style: { display: 'flex', alignItems: 'center', gap: '5px' } }, [
                            React.createElement('span', { key: 'l', className: 'hsv-slider-label', style: { width: 'auto' } }, "Interval (ms):"),
                            React.createElement('input', {
                                key: 'v',
                                type: 'number',
                                value: state.autoTriggerInterval,
                                onChange: e => updateState({ autoTriggerInterval: Number(e.target.value) }),
                                style: { width: '60px', background: 'rgba(0,0,0,0.3)', border: '1px solid #f48fb1', color: '#f48fb1', fontSize: '11px', padding: '2px 4px' }
                            })
                        ])
                    ]),

                    // Show Colors Toggle
                    React.createElement('div', { key: 'show', style: { marginTop: '8px' } }, [
                        React.createElement('label', { key: 'chk', className: 'hsv-checkbox-container' }, [
                            React.createElement('input', {
                                key: 'in',
                                type: 'checkbox',
                                className: 'hsv-checkbox',
                                checked: state.showColorOptions,
                                onChange: e => updateState({ showColorOptions: e.target.checked })
                            }),
                            React.createElement('span', { key: 'lbl' }, "Show Colors")
                        ])
                    ]),

                    // Buttons
                    React.createElement('div', { key: 'btns', className: 'hsv-btn-group' }, [
                        React.createElement('button', { key: 'rst', className: 'hsv-btn', onClick: handleReset }, "Reset"),
                        React.createElement('button', { key: 'pst', className: 'hsv-btn', onClick: handlePasteHSV }, "Paste HSV"),
                        React.createElement('button', { key: 'cb', className: 'hsv-btn', onClick: () => applyPreset({ hue: 240, saturation: 100, brightness: 200 }) }, "Cool Blue"),
                        React.createElement('button', { key: 'pr', className: 'hsv-btn', onClick: () => applyPreset({ hue: 0, saturation: 100, brightness: 254 }) }, "Party Red")
                    ])
                ]),

                // Palette
                state.showColorOptions && React.createElement('div', { key: 'pal', className: 'hsv-palette-container' }, 
                    paletteColors.map(col => 
                        React.createElement('div', {
                            key: col,
                            className: 'hsv-palette-item',
                            onPointerDown: (e) => e.stopPropagation(),
                            onClick: () => handlePaletteClick(col),
                            style: { background: col }
                        })
                    )
                )
            ])
        ]);
    }

    window.nodeRegistry.register('HSVControlNode', {
        label: "HSV Control",
        category: "Color",
        nodeClass: HSVControlNode,
        factory: (cb) => new HSVControlNode(cb),
        component: HSVControlNodeComponent
    });

    // console.log("[HSVControlNode] Registered");
})();
