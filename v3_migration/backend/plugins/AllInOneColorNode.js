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
    // INJECT GRADIENT SLIDER CSS (for addon compatibility)
    // -------------------------------------------------------------------------
    if (!document.getElementById('aio-gradient-slider-css')) {
        const style = document.createElement('style');
        style.id = 'aio-gradient-slider-css';
        style.textContent = `
            .aio-gradient-slider {
                background: transparent !important;
            }
            .aio-gradient-slider::-webkit-slider-runnable-track {
                background: transparent !important;
                height: 12px;
            }
            .aio-gradient-slider::-webkit-slider-thumb {
                width: 16px;
                height: 16px;
                margin-top: -2px;
                background: #ffffff !important;
                border: 2px solid #333 !important;
                box-shadow: 0 0 4px rgba(0,0,0,0.5), 0 0 8px rgba(255,255,255,0.3);
            }
            .aio-gradient-slider::-webkit-slider-thumb:hover {
                transform: scale(1.15);
            }
            .aio-gradient-slider::-moz-range-track {
                background: transparent !important;
                height: 12px;
            }
            .aio-gradient-slider::-moz-range-thumb {
                width: 16px;
                height: 16px;
                background: #ffffff !important;
                border: 2px solid #333 !important;
                border-radius: 50%;
            }
        `;
        document.head.appendChild(style);
    }

    // -------------------------------------------------------------------------
    // TOOLTIPS
    // -------------------------------------------------------------------------
    const tooltips = {
        node: "Complete color control node with Nuke-style Color Grade. Temperature shifts warm↔cool, Tint shifts green↔magenta. All sliders stay synced.",
        inputs: {
            hsv_in: "Incoming HSV color values from other nodes (e.g., Timeline Color, Spline). Overrides manual settings when connected.",
            scene_hsv: "Scene input - when connected, this output is passed through directly, bypassing all local controls. Use for scene switching."
        },
        outputs: {
            hsv_out: "Color output containing HSV, RGB, temperature, tint, transition time, and on/off state."
        },
        controls: {
            rgb: "Adjust Red, Green, Blue channels directly (0-255). Moving RGB sliders will update Temperature and Tint to match.",
            colorGrade: "Nuke-style color grading. Temperature: Orange(+)↔Blue(-). Tint: Magenta(+)↔Green(-). Moving these updates RGB sliders.",
            transition: "Transition time in milliseconds. How long the light takes to fade to the new color (0=instant, 1000=1 second).",
            autoTrigger: "When enabled, automatically sends output at the specified interval. Useful for keeping lights updated without manual triggers.",
            palette: "Quick color selection. Click any color swatch to instantly set that color."
        }
    };

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
                temperature: 0,   // -100 (blue/cool) to +100 (orange/warm)
                tint: 0,          // -100 (green) to +100 (magenta)
                kelvin: 5500,     // Color temperature in Kelvin (2000K-10000K)
                saturation: 50, brightness: 128,
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

            // Calculate HSV from current RGB
            const ColorUtils = window.ColorUtils;
            const { hue, sat, val } = ColorUtils ? ColorUtils.rgbToHsv(this.properties.red, this.properties.green, this.properties.blue) : { hue: 0, sat: 0, val: 0.5 };
            
            const output = {
                hue: hue,
                saturation: sat,
                brightness: this.properties.brightness,
                transition: this.properties.transitionTime,
                temperature: this.properties.temperature,
                tint: this.properties.tint,
                on: this.properties.brightness > 0,
                h: hue * 360,
                s: sat,
                v: this.properties.brightness / 255,
                rgb: { r: this.properties.red, g: this.properties.green, b: this.properties.blue }
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
                temperature: this.properties.temperature,
                tint: this.properties.tint,
                kelvin: this.properties.kelvin,
                saturation: this.properties.saturation,
                brightness: this.properties.brightness,
                transitionTime: this.properties.transitionTime,
                enableAutoTrigger: this.properties.enableAutoTrigger,
                autoInterval: this.properties.autoInterval,
                showPalette: this.properties.showPalette
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
    
    /**
     * Slider component with optional gradient background
     * @param {string} gradient - CSS linear-gradient string for the track background
     */
    const Slider = ({ label, value, min, max, onChange, step = 1, gradient }) => {
        // Calculate thumb position percentage for gradient sliders
        const percent = ((value - min) / (max - min)) * 100;
        
        // Create a unique style for gradient sliders
        const sliderStyle = gradient ? {
            background: gradient,
            height: '8px',
            borderRadius: '4px',
            WebkitAppearance: 'none',
            appearance: 'none',
            cursor: 'pointer'
        } : {};
        
        return React.createElement('div', { className: 'aio-slider-container' }, [
            React.createElement('span', { key: 'label', className: 'aio-slider-label' }, label),
            React.createElement('div', { 
                key: 'track',
                style: { 
                    flex: 1, 
                    position: 'relative',
                    background: gradient || 'transparent',
                    borderRadius: '4px',
                    height: gradient ? '12px' : 'auto',
                    display: 'flex',
                    alignItems: 'center'
                }
            }, [
                React.createElement('input', {
                    key: 'input',
                    type: 'range',
                    min, max, step,
                    value,
                    onChange: (e) => onChange(Number(e.target.value)),
                    onPointerDown: (e) => e.stopPropagation(),
                    className: gradient ? 'aio-range-input aio-gradient-slider' : 'aio-range-input',
                    style: gradient ? { 
                        background: 'transparent',
                        width: '100%',
                        height: '100%',
                        position: 'absolute',
                        top: 0,
                        left: 0
                    } : {}
                })
            ]),
            React.createElement('span', { key: 'val', className: 'aio-slider-value' }, value)
        ]);
    };

    // Gradient definitions for Color Grade sliders
    const GRADIENTS = {
        temperature: 'linear-gradient(to right, #FF8844, #888888, #4488FF)',  // Orange → Gray → Blue
        tint: 'linear-gradient(to right, #44FF44, #888888, #FF44FF)',         // Green → Gray → Magenta
        kelvin: 'linear-gradient(to right, #FF9329, #FFD4A3, #FFFFFF, #C9E2FF, #9DBFFF)',  // 2000K → 4000K → 5500K → 7000K → 10000K
        saturation: (r, g, b) => `linear-gradient(to right, #888888, rgb(${r},${g},${b}))`,  // Gray → Current color
        brightness: (r, g, b) => `linear-gradient(to right, #000000, rgb(${r},${g},${b}))`   // Black → Current color
    };

    function AllInOneColorNodeComponent({ data, emit }) {
        const [state, setState] = useState({ ...data.properties });
        const [isCollapsed, setIsCollapsed] = useState(false);
        const [autoTimer, setAutoTimer] = useState(null);
        
        const lastUpdateRef = useRef(0);
        const timeoutRef = useRef(null);

        // Get shared tooltip components
        const { NodeHeader, HelpIcon } = window.T2Controls || {};

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

        // =====================================================================
        // TMI COLOR GRADE MATH (Nuke-style Temperature/Tint)
        // =====================================================================
        // Gradient visual: Orange (left/-100) ↔ Gray (center/0) ↔ Blue (right/+100)
        // Gradient visual: Green (left/-100) ↔ Gray (center/0) ↔ Magenta (right/+100)

        /**
         * Calculate RGB from Temperature, Tint, Saturation, and Brightness
         * Uses ADDITIVE color offsets so both axes work independently
         * 
         * Temperature and Tint are treated as independent color axes:
         * - Center (0,0) = neutral gray/white
         * - Each axis adds/subtracts color independently
         * - Combined positions blend both contributions
         */
        const calculateRGBFromTMI = (temp, tint, sat, bri) => {
            const intensity = bri / 255;
            
            // Normalize to -1 to +1 range
            const t = -temp / 100;  // Flip: -100=warm(+1), +100=cool(-1)
            const m = tint / 100;   // -100=green(-1), +100=magenta(+1)
            
            // =====================================================
            // ADDITIVE COLOR MODEL
            // Each axis contributes independently to R, G, B
            // Starting from neutral (0.5, 0.5, 0.5) and offsetting
            // =====================================================
            
            // Temperature contribution (Orange ↔ Blue axis)
            // Warm (t>0): +R, +G(partial for orange), -B
            // Cool (t<0): -R, -G(partial), +B
            const tempR = t * 0.5;      // ±0.5 range
            const tempG = t * 0.25;     // Less G change (orange needs some green)
            const tempB = -t * 0.5;     // Opposite of R
            
            // Tint contribution (Green ↔ Magenta axis)
            // Magenta (m>0): +R, -G, +B
            // Green (m<0): -R, +G, -B
            const tintR = m * 0.5;
            const tintG = -m * 0.5;
            const tintB = m * 0.5;
            
            // Combine: start at 0.5 (neutral) and add both contributions
            let r = 0.5 + tempR + tintR;
            let g = 0.5 + tempG + tintG;
            let b = 0.5 + tempB + tintB;
            
            // Clamp to valid range
            r = Math.max(0, Math.min(1, r));
            g = Math.max(0, Math.min(1, g));
            b = Math.max(0, Math.min(1, b));
            
            // Apply saturation (expand/contract from gray)
            // At sat=0: everything becomes gray
            // At sat=100: full color range
            const satFactor = sat / 100;
            const gray = 0.5;
            r = gray + (r - gray) * satFactor;
            g = gray + (g - gray) * satFactor;
            b = gray + (b - gray) * satFactor;
            
            // Apply brightness (scale up from 0.5 base to full range)
            // Multiply by 2 because we're centered at 0.5
            r = Math.max(0, Math.min(255, Math.round(r * 2 * intensity * 255)));
            g = Math.max(0, Math.min(255, Math.round(g * 2 * intensity * 255)));
            b = Math.max(0, Math.min(255, Math.round(b * 2 * intensity * 255)));
            
            return { r, g, b };
        };

        /**
         * Calculate Temperature and Tint from RGB values
         * This allows RGB sliders to update the TMI sliders
         */
        const calculateTMIFromRGB = (r, g, b) => {
            // Normalize to 0-1
            const rn = r / 255, gn = g / 255, bn = b / 255;
            const max = Math.max(rn, gn, bn);
            const min = Math.min(rn, gn, bn);
            
            // Avoid division by zero for black/white
            if (max === 0) return { temp: 0, tint: 0, sat: 0, bri: 0 };
            
            // Temperature: based on normalized red-blue balance
            // Pure orange (1, 0.5, 0) → temp = -100
            // Pure blue (0, 0.7, 1) → temp = +100
            let temp = 0;
            if (rn > bn) {
                // Warm side: how much more red than blue
                temp = -((rn - bn) / max) * 100;
            } else if (bn > rn) {
                // Cool side: how much more blue than red
                temp = ((bn - rn) / max) * 100;
            }
            temp = Math.max(-100, Math.min(100, Math.round(temp)));
            
            // Tint: based on green vs average of R+B
            // Pure green (0, 1, 0) → tint = -100
            // Pure magenta (1, 0, 1) → tint = +100
            const avgRB = (rn + bn) / 2;
            let tint = 0;
            if (gn > avgRB) {
                // Green side
                tint = -((gn - avgRB) / max) * 100;
            } else if (avgRB > gn) {
                // Magenta side
                tint = ((avgRB - gn) / max) * 100;
            }
            tint = Math.max(-100, Math.min(100, Math.round(tint)));
            
            // Saturation: how far from gray (standard HSV saturation)
            const sat = max > 0 ? Math.round(((max - min) / max) * 100) : 0;
            
            // Brightness: max channel
            const bri = Math.round(max * 255);
            
            return { temp, tint, sat, bri };
        };

        /**
         * Update all values when RGB sliders change
         */
        const updateFromRGB = (r, g, b) => {
            const { temp, tint, sat, bri } = calculateTMIFromRGB(r, g, b);
            updateState({
                red: r, green: g, blue: b,
                temperature: temp,
                tint: tint,
                saturation: sat,
                brightness: bri
            });
        };

        /**
         * Update all values when Temperature/Tint sliders change
         */
        const updateFromTMI = (temp, tint, sat, bri) => {
            const { r, g, b } = calculateRGBFromTMI(temp, tint, sat, bri);
            updateState({
                red: r, green: g, blue: b,
                temperature: temp,
                tint: tint,
                saturation: sat,
                brightness: bri
            });
        };

        /**
         * Convert Kelvin color temperature to RGB
         * Uses Tanner Helland's algorithm (approximation of blackbody radiation)
         * Range: 2000K (warm candle) to 10000K (cool blue sky)
         */
        const kelvinToRGB = (kelvin) => {
            const temp = kelvin / 100;
            let r, g, b;
            
            // Red
            if (temp <= 66) {
                r = 255;
            } else {
                r = temp - 60;
                r = 329.698727446 * Math.pow(r, -0.1332047592);
                r = Math.max(0, Math.min(255, r));
            }
            
            // Green
            if (temp <= 66) {
                g = temp;
                g = 99.4708025861 * Math.log(g) - 161.1195681661;
                g = Math.max(0, Math.min(255, g));
            } else {
                g = temp - 60;
                g = 288.1221695283 * Math.pow(g, -0.0755148492);
                g = Math.max(0, Math.min(255, g));
            }
            
            // Blue
            if (temp >= 66) {
                b = 255;
            } else if (temp <= 19) {
                b = 0;
            } else {
                b = temp - 10;
                b = 138.5177312231 * Math.log(b) - 305.0447927307;
                b = Math.max(0, Math.min(255, b));
            }
            
            return { r: Math.round(r), g: Math.round(g), b: Math.round(b) };
        };

        /**
         * Update all values when Kelvin slider changes
         * Sets RGB directly from Kelvin, then derives Temperature/Tint
         */
        const updateFromKelvin = (kelvin) => {
            const { r, g, b } = kelvinToRGB(kelvin);
            const { temp, tint, sat, bri } = calculateTMIFromRGB(r, g, b);
            updateState({
                red: r, green: g, blue: b,
                temperature: temp,
                tint: tint,
                kelvin: kelvin,
                saturation: sat,
                brightness: bri
            });
        };

        const handlePaletteClick = (hex) => {
            const rgb = ColorUtils.hexToRgb(hex);
            updateFromRGB(rgb.r, rgb.g, rgb.b);
        };

        const paletteColors = ["#FF0000","#FFA500","#FFFF00","#00FF00","#0000FF","#00FFFF","#800080","#FFFFFF"];
        const rgb = `rgb(${state.red},${state.green},${state.blue})`;

        return React.createElement('div', { className: 'hsv-node-tron', style: { minWidth: '380px' } }, [
            // Header with tooltip
            NodeHeader 
                ? React.createElement(NodeHeader, { 
                    key: 'header',
                    icon: '🎨', 
                    title: data.label, 
                    tooltip: tooltips.node,
                    isCollapsed,
                    onToggleCollapse: () => setIsCollapsed(!isCollapsed)
                })
                : React.createElement('div', { key: 'header', className: 'hsv-node-header' }, [
                    React.createElement('div', { key: 'row', style: { display: "flex", alignItems: "center", gap: "8px", width: '100%' } }, [
                        React.createElement('div', { 
                            key: 'toggle',
                            style: { cursor: "pointer", fontSize: "12px", userSelect: "none", color: 'var(--node-color-color, #f48fb1)' },
                            onPointerDown: (e) => { e.stopPropagation(); setIsCollapsed(!isCollapsed); }
                        }, isCollapsed ? "▶" : "▼"),
                        React.createElement('div', { key: 'title', className: 'hsv-node-title', style: { flex: 1, textAlign: 'center' } }, data.label)
                    ])
                ]),

            // IO Ports with tooltips
            React.createElement('div', { key: 'io', className: 'ha-io-container' }, [
                React.createElement('div', { key: 'inputs', className: 'inputs' }, 
                    Object.entries(data.inputs).map(([key, input]) => 
                        React.createElement('div', { key: key, style: { display: "flex", alignItems: "center", gap: "8px", marginBottom: '4px' } }, [
                            React.createElement(RefComponent, {
                                key: 'ref',
                                init: ref => emit({ type: "render", data: { type: "socket", element: ref, payload: input.socket, nodeId: data.id, side: "input", key } }),
                                unmount: ref => emit({ type: "unmount", data: { element: ref } })
                            }),
                            React.createElement('span', { 
                                key: 'label', 
                                className: 'ha-socket-label',
                                title: tooltips.inputs[key] || ''
                            }, input.label)
                        ])
                    )
                ),
                React.createElement('div', { key: 'outputs', className: 'outputs' }, 
                    Object.entries(data.outputs).map(([key, output]) => 
                        React.createElement('div', { key: key, style: { display: "flex", alignItems: "center", gap: "8px", justifyContent: 'flex-end', marginBottom: '4px' } }, [
                            React.createElement('span', { 
                                key: 'label', 
                                className: 'ha-socket-label',
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
                className: 'ha-controls-container', 
                onPointerDown: (e) => e.stopPropagation(),
                style: { cursor: "default" }
            }, [
                // Swatch
                React.createElement('div', { 
                    key: 'swatch', 
                    className: 'aio-swatch', 
                    style: { background: rgb } 
                }, `T:${state.temperature} / M:${state.tint}`),

                // RGB Sliders
                React.createElement('div', { key: 'rgb', style: { borderBottom: "1px solid rgba(0, 243, 255, 0.1)", paddingBottom: "8px", marginBottom: "8px" } }, [
                    React.createElement('div', { key: 'h', className: 'aio-section-header', style: { display: 'flex', alignItems: 'center', gap: '6px' } }, [
                        React.createElement('span', { key: 'txt' }, 'RGB Channels'),
                        HelpIcon && React.createElement(HelpIcon, { key: 'help', text: tooltips.controls.rgb, size: 12 })
                    ]),
                    React.createElement(Slider, { key: 'r', label: "Red", value: state.red, min: 0, max: 255, onChange: v => updateFromRGB(v, state.green, state.blue) }),
                    React.createElement(Slider, { key: 'g', label: "Green", value: state.green, min: 0, max: 255, onChange: v => updateFromRGB(state.red, v, state.blue) }),
                    React.createElement(Slider, { key: 'b', label: "Blue", value: state.blue, min: 0, max: 255, onChange: v => updateFromRGB(state.red, state.green, v) })
                ]),

                // Color Grade (TMI - Temperature/Tint like Nuke)
                React.createElement('div', { key: 'tmi', style: { borderBottom: "1px solid rgba(0, 243, 255, 0.1)", paddingBottom: "8px", marginBottom: "8px" } }, [
                    React.createElement('div', { key: 'h', className: 'aio-section-header', style: { display: 'flex', alignItems: 'center', gap: '6px' } }, [
                        React.createElement('span', { key: 'txt' }, 'Color Grade'),
                        HelpIcon && React.createElement(HelpIcon, { key: 'help', text: "Kelvin: Real-world light temperature (2700K=warm bulb, 5500K=daylight, 6500K=cool). Temperature: Fine-tune Orange↔Blue. Tint: Green↔Magenta axis.", size: 12 })
                    ]),
                    React.createElement(Slider, { 
                        key: 'kelvin', 
                        label: "Kelvin", 
                        value: state.kelvin, 
                        min: 2000, 
                        max: 10000, 
                        step: 100,
                        onChange: v => updateFromKelvin(v),
                        gradient: GRADIENTS.kelvin
                    }),
                    React.createElement(Slider, { 
                        key: 'temp', 
                        label: "Temp", 
                        value: state.temperature, 
                        min: -100, 
                        max: 100, 
                        onChange: v => updateFromTMI(v, state.tint, state.saturation, state.brightness),
                        gradient: GRADIENTS.temperature
                    }),
                    React.createElement(Slider, { 
                        key: 'tint', 
                        label: "Tint", 
                        value: state.tint, 
                        min: -100, 
                        max: 100, 
                        onChange: v => updateFromTMI(state.temperature, v, state.saturation, state.brightness),
                        gradient: GRADIENTS.tint
                    }),
                    React.createElement(Slider, { 
                        key: 'sat', 
                        label: "Sat", 
                        value: state.saturation, 
                        min: 0, 
                        max: 100, 
                        onChange: v => updateFromTMI(state.temperature, state.tint, v, state.brightness),
                        gradient: GRADIENTS.saturation(state.red, state.green, state.blue)
                    }),
                    React.createElement(Slider, { 
                        key: 'bri', 
                        label: "Bri", 
                        value: state.brightness, 
                        min: 0, 
                        max: 255, 
                        onChange: v => updateFromTMI(state.temperature, state.tint, state.saturation, v),
                        gradient: GRADIENTS.brightness(state.red, state.green, state.blue)
                    })
                ]),

                // Settings
                React.createElement('div', { key: 'settings' }, [
                    React.createElement('div', { key: 'h', className: 'aio-section-header', style: { display: 'flex', alignItems: 'center', gap: '6px' } }, [
                        React.createElement('span', { key: 'txt' }, 'Settings')
                    ]),
                    React.createElement('div', { key: 'trans-row', style: { display: 'flex', alignItems: 'center', gap: '4px' } }, [
                        React.createElement('div', { key: 'slider', style: { flex: 1 } }, 
                            React.createElement(Slider, { label: "Trans (ms)", value: state.transitionTime, min: 0, max: 5000, step: 100, onChange: v => updateState({ transitionTime: v }) })
                        ),
                        HelpIcon && React.createElement(HelpIcon, { key: 'help', text: tooltips.controls.transition, size: 12 })
                    ]),
                    React.createElement('div', { key: 'auto', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' } }, [
                        React.createElement('label', { key: 'chk', className: 'aio-checkbox-container', title: tooltips.controls.autoTrigger }, [
                            React.createElement('input', {
                                key: 'in',
                                type: 'checkbox',
                                className: 'aio-checkbox',
                                checked: state.enableAutoTrigger,
                                onPointerDown: (e) => e.stopPropagation(),
                                onChange: e => updateState({ enableAutoTrigger: e.target.checked })
                            }),
                            React.createElement('span', { key: 'lbl' }, "Auto Trigger"),
                            HelpIcon && React.createElement(HelpIcon, { key: 'help', text: tooltips.controls.autoTrigger, size: 11 })
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
                state.showPalette && React.createElement('div', { key: 'pal' }, [
                    React.createElement('div', { 
                        key: 'pal-header', 
                        className: 'aio-section-header', 
                        style: { display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', marginBottom: '4px' } 
                    }, [
                        React.createElement('span', { key: 'txt' }, 'Quick Colors'),
                        HelpIcon && React.createElement(HelpIcon, { key: 'help', text: tooltips.controls.palette, size: 12 })
                    ]),
                    React.createElement('div', { key: 'colors', className: 'aio-palette-container' }, 
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
