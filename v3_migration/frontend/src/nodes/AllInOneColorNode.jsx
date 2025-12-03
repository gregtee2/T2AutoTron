import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ClassicPreset } from 'rete';
import { RefComponent, Drag } from 'rete-react-plugin';
import sockets from '../sockets';
import './HAGenericDeviceNode.css'; // Import shared Tron theme
import './AllInOneColorNode.css'; // Import specific slider styles

// -------------------------------------------------------------------------
// COLOR CONVERSION HELPERS (Ported from v2.0)
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

    kelvinToHSV: (k) => {
        const { r, g, b } = ColorUtils.kelvinToRGB(k);
        const { hue, sat } = ColorUtils.rgbToHsv(r, g, b);
        return { hue: Math.round(hue * 360), saturation: Math.round(sat * 100) };
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
export class AllInOneColorNode extends ClassicPreset.Node {
    constructor(changeCallback) {
        super("All-in-One Color Control");
        this.width = 400; // Slightly wider for sliders
        this.changeCallback = changeCallback;

        this.addInput("hsv_in", new ClassicPreset.Input(sockets.object, "HSV In"));
        this.addInput("scene_hsv", new ClassicPreset.Input(sockets.object, "Scene HSV"));
        this.addOutput("hsv_out", new ClassicPreset.Output(sockets.object, "HSV Info"));

        this.properties = {
            red: 128, green: 128, blue: 128,
            hueShift: 10, saturation: 20, brightness: 128,
            colorTemp: 4150, whiteAdjust: 4000,
            transitionTime: 0,
            enableAutoTrigger: false,
            autoInterval: 5000,
            showPalette: true,
            activeMode: 'color' // 'color' or 'temp'
        };
    }

    async data(inputs) {
        // Process inputs if needed, but mostly this node is UI-driven
        // The component will update properties, and we return the current state
        
        // If Scene HSV is present, pass it through (override)
        const scene = inputs.scene_hsv?.[0];
        if (scene) {
            return { hsv_out: scene };
        }

        // If HSV In is present, update internal state (this logic needs to be in the component or shared)
        // For now, we just return the current properties as HSV
        const output = {
            hue: this.properties.hueShift / 360,
            saturation: this.properties.saturation / 100,
            brightness: this.properties.brightness,
            transition: this.properties.transitionTime,
            colorTemp: this.properties.colorTemp,
            mode: this.properties.activeMode,
            on: this.properties.brightness > 0,
            // Compatibility for HAGenericDeviceNode
            h: this.properties.hueShift, // 0-360
            s: this.properties.saturation / 100, // 0-1
            v: this.properties.brightness / 255 // 0-1
        };
        // console.log("[AllInOneColorNode] Generating Output:", output);
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

// Helper Components (Defined outside to prevent re-mounting on render)
const Slider = ({ label, value, min, max, onChange, step = 1 }) => (
    <div className="aio-slider-container">
        <span className="aio-slider-label">{label}</span>
        <input 
            type="range" 
            min={min} max={max} step={step} 
            value={value} 
            // onPointerDown is handled by the parent container
            onChange={(e) => onChange(Number(e.target.value))}
            className="aio-range-input"
        />
        <span className="aio-slider-value">{value}</span>
    </div>
);

export function AllInOneColorNodeComponent({ data, emit }) {
    const [state, setState] = useState({ ...data.properties });
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [autoTimer, setAutoTimer] = useState(null);
    
    // Throttling for Engine Updates (Network/Flow)
    const lastUpdateRef = useRef(0);
    const timeoutRef = useRef(null);

    const triggerEngineUpdate = useCallback(() => {
        if (data.changeCallback) data.changeCallback();
    }, [data]);

    // Helper to update both React state and Node properties synchronously
    const updateState = (updates) => {
        const newState = { ...state, ...updates };
        
        // 1. Update React State (Visuals) - Instant
        // This ensures the slider handle moves immediately
        setState(newState);
        
        // 2. Update Node Properties (Data) - Instant
        Object.assign(data.properties, newState);
        
        // 3. Trigger Engine Update (Flow) - Throttled to ~20 FPS (50ms)
        // This prevents flooding the network/engine while dragging
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

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, []);

    // Auto Trigger Logic
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

    // Handlers
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
        // updateHSVFromRGB already sets activeMode to 'color'
    };

    const paletteColors = ["#FF0000","#FFA500","#FFFF00","#00FF00","#0000FF","#00FFFF","#800080","#FFFFFF"];

    const rgb = useMemo(() => `rgb(${state.red},${state.green},${state.blue})`, [state.red, state.green, state.blue]);

    return (
        <div className="ha-node-tron" style={{ minWidth: '380px' }}>
            <div className="ha-node-header">
                <div style={{ display: "flex", alignItems: "center", gap: "8px", width: '100%' }}>
                    <div 
                        style={{ cursor: "pointer", fontSize: "12px", userSelect: "none", color: '#00f3ff' }}
                        onPointerDown={(e) => { e.stopPropagation(); setIsCollapsed(!isCollapsed); }}
                    >
                        {isCollapsed ? "▶" : "▼"}
                    </div>
                    <div className="ha-node-title" style={{ flex: 1, textAlign: 'center' }}>{data.label}</div>
                </div>
            </div>

            {/* IO Ports */}
            <div className="ha-io-container">
                <div className="inputs">
                    {Object.entries(data.inputs).map(([key, input]) => (
                        <div key={key} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: '4px' }}>
                            <RefComponent init={ref => emit({ type: "render", data: { type: "socket", element: ref, payload: input.socket, nodeId: data.id, side: "input", key } })} unmount={ref => emit({ type: "unmount", data: { element: ref } })} />
                            <span className="ha-socket-label">{input.label}</span>
                        </div>
                    ))}
                </div>
                <div className="outputs">
                    {Object.entries(data.outputs).map(([key, output]) => (
                        <div key={key} style={{ display: "flex", alignItems: "center", gap: "8px", justifyContent: 'flex-end', marginBottom: '4px' }}>
                            <span className="ha-socket-label">{output.label}</span>
                            <RefComponent init={ref => emit({ type: "render", data: { type: "socket", element: ref, payload: output.socket, nodeId: data.id, side: "output", key } })} unmount={ref => emit({ type: "unmount", data: { element: ref } })} />
                        </div>
                    ))}
                </div>
            </div>

            {!isCollapsed && (
                <div className="ha-controls-container" onPointerDown={(e) => e.stopPropagation()} style={{ cursor: "default" }}>
                    {/* Swatch */}
                    <div className="aio-swatch" style={{ background: rgb }}>
                        {state.colorTemp}K ({state.activeMode})
                    </div>

                    {/* RGB Sliders */}
                    <div style={{ borderBottom: "1px solid rgba(0, 243, 255, 0.1)", paddingBottom: "8px", marginBottom: "8px" }}>
                        <div className="aio-section-header">RGB Channels</div>
                        <Slider label="Red" value={state.red} min={0} max={255} onChange={v => updateHSVFromRGB(v, state.green, state.blue)} />
                        <Slider label="Green" value={state.green} min={0} max={255} onChange={v => updateHSVFromRGB(state.red, v, state.blue)} />
                        <Slider label="Blue" value={state.blue} min={0} max={255} onChange={v => updateHSVFromRGB(state.red, state.green, v)} />
                    </div>

                    {/* HSV Sliders */}
                    <div style={{ borderBottom: "1px solid rgba(0, 243, 255, 0.1)", paddingBottom: "8px", marginBottom: "8px" }}>
                        <div className="aio-section-header">HSV Control</div>
                        <Slider label="Hue" value={state.hueShift} min={0} max={360} onChange={v => updateRGBFromHueSat(v, state.saturation, state.brightness)} />
                        <Slider label="Sat" value={state.saturation} min={0} max={100} onChange={v => updateRGBFromHueSat(state.hueShift, v, state.brightness)} />
                        <Slider label="Bri" value={state.brightness} min={0} max={255} onChange={handleBrightnessChange} />
                    </div>

                    {/* Temp Sliders */}
                    <div style={{ borderBottom: "1px solid rgba(0, 243, 255, 0.1)", paddingBottom: "8px", marginBottom: "8px" }}>
                        <div className="aio-section-header">Temperature</div>
                        <Slider label="Temp (K)" value={state.colorTemp} min={1800} max={6500} step={50} onChange={v => updateRGBFromTemp(v)} />
                    </div>

                    {/* Transition & Auto */}
                    <div>
                        <div className="aio-section-header">Settings</div>
                        <Slider label="Trans (ms)" value={state.transitionTime} min={0} max={5000} step={100} onChange={v => updateState({ transitionTime: v })} />
                        
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                            <label className="aio-checkbox-container">
                                <input 
                                    type="checkbox" 
                                    className="aio-checkbox"
                                    checked={state.enableAutoTrigger} 
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onChange={e => updateState({ enableAutoTrigger: e.target.checked })} 
                                />
                                <span>Auto Trigger</span>
                            </label>
                            
                            {state.enableAutoTrigger && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <span className="aio-slider-label" style={{ width: 'auto' }}>Interval:</span>
                                    <input 
                                        type="number" 
                                        value={state.autoInterval}
                                        onChange={e => updateState({ autoInterval: Number(e.target.value) })}
                                        style={{ width: '60px', background: 'rgba(0,0,0,0.3)', border: '1px solid #00f3ff', color: '#00f3ff', fontSize: '11px', padding: '2px 4px' }}
                                    />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Palette */}
                    {state.showPalette && (
                        <div className="aio-palette-container">
                            {paletteColors.map(col => (
                                <div 
                                    key={col}
                                    className="aio-palette-item"
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onClick={() => handlePaletteClick(col)}
                                    style={{ background: col }}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}