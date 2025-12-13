// ============================================================================
// 00_SharedControlsPlugin.js - Shared control classes for all T2AutoTron nodes
// This file MUST be loaded BEFORE other plugins (alphabetically first with 00_)
// Exposes window.T2Controls for use by all node plugins
// ============================================================================

(function() {
    // Debug: console.log("[SharedControlsPlugin] Loading shared...");

    // Dependency check
    if (!window.Rete || !window.React) {
        console.error("[SharedControlsPlugin] Missing dependencies: Rete or React not found");
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect } = React;

    // =========================================================================
    // THEME COLORS (centralized, DRY)
    // Softer, lower-contrast palette for reduced eye strain
    // Users can override via localStorage 't2theme-overrides'
    // =========================================================================
    
    // Default theme values
    const DEFAULT_THEME = {
        // Primary accent - softer teal instead of bright cyan
        primary: '#5fb3b3',
        
        // Backgrounds - warmer grays instead of pure black
        background: '#1e2428',
        surface: '#2a3238',       // Card/node surface
        surfaceLight: '#343d44',  // Elevated elements
        
        // Text - off-white instead of pure white/cyan
        text: '#c5cdd3',
        textMuted: '#8a959e',
        
        // Status colors - muted versions
        success: '#5faa7d',       // Softer green
        warning: '#d4a054',       // Softer amber
        error: '#c75f5f',         // Softer red
        
        // Border opacity (0-100)
        borderOpacity: 25
    };
    
    // Load user overrides from localStorage
    function loadThemeOverrides() {
        try {
            const stored = localStorage.getItem('t2theme-overrides');
            if (stored) {
                return JSON.parse(stored);
            }
        } catch (e) {
            console.warn('[SharedControlsPlugin] Failed to load theme overrides:', e);
        }
        return {};
    }
    
    // Merge defaults with overrides
    const userOverrides = loadThemeOverrides();
    const themeValues = { ...DEFAULT_THEME, ...userOverrides };
    
    // Build the THEME object with computed values
    const THEME = {
        primary: themeValues.primary,
        primaryRgba: (alpha) => {
            // Parse hex to rgba
            const hex = themeValues.primary.replace('#', '');
            const r = parseInt(hex.substr(0, 2), 16);
            const g = parseInt(hex.substr(2, 2), 16);
            const b = parseInt(hex.substr(4, 2), 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        },
        
        background: themeValues.background,
        backgroundAlt: 'rgba(30, 40, 50, 0.8)',
        surface: themeValues.surface,
        surfaceLight: themeValues.surfaceLight,
        
        text: themeValues.text,
        textMuted: themeValues.textMuted,
        textBright: '#e8edf0',
        
        success: themeValues.success,
        warning: themeValues.warning,
        error: themeValues.error,
        
        // Borders computed from primary color
        border: `rgba(95, 179, 179, ${themeValues.borderOpacity / 100})`,
        borderHover: `rgba(95, 179, 179, ${Math.min(100, themeValues.borderOpacity * 2) / 100})`,
        borderLight: 'rgba(200, 210, 220, 0.15)'
    };
    
    // =========================================================================
    // CATEGORY THEMES - Per-category accent colors
    // Each node category can have its own accent color while sharing base theme
    // =========================================================================
    
    const DEFAULT_CATEGORY_THEMES = {
        'Home Assistant': { accent: '#4fc3f7', icon: '🏠' },      // Light blue
        'Direct Devices': { accent: '#64b5f6', icon: '💡' },      // Blue - Hue, Kasa, etc.
        'Weather': { accent: '#ffb74d', icon: '🌤️' },             // Amber/orange
        'Logic': { accent: '#81c784', icon: '🔀' },               // Green
        'Timer/Event': { accent: '#ce93d8', icon: '⏱️' },         // Purple
        'Color': { accent: '#f48fb1', icon: '🎨' },               // Pink
        'Utility': { accent: '#90a4ae', icon: '🔧' },             // Gray-blue
        'Inputs': { accent: '#aed581', icon: '📥' }               // Light green
    };
    
    // Load category overrides from localStorage
    function loadCategoryOverrides() {
        try {
            const stored = localStorage.getItem('t2category-overrides');
            if (stored) {
                return JSON.parse(stored);
            }
        } catch (e) {
            console.warn('[SharedControlsPlugin] Failed to load category overrides:', e);
        }
        return {};
    }
    
    // Merge category defaults with overrides
    const categoryOverrides = loadCategoryOverrides();
    const categoryThemes = {};
    for (const [cat, defaults] of Object.entries(DEFAULT_CATEGORY_THEMES)) {
        const overrides = categoryOverrides[cat] || {};
        categoryThemes[cat] = { ...defaults, ...overrides };
    }
    
    // Helper to convert hex to rgba
    function hexToRgba(hex, alpha) {
        const cleanHex = hex.replace('#', '');
        const r = parseInt(cleanHex.substr(0, 2), 16);
        const g = parseInt(cleanHex.substr(2, 2), 16);
        const b = parseInt(cleanHex.substr(4, 2), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    
    // Get category theme with computed values
    function getCategory(categoryName) {
        const cat = categoryThemes[categoryName] || categoryThemes['Other'];
        return {
            accent: cat.accent,
            icon: cat.icon,
            // Computed values for easy use
            accentRgba: (alpha) => hexToRgba(cat.accent, alpha),
            headerBg: hexToRgba(cat.accent, 0.15),
            border: hexToRgba(cat.accent, 0.4),
            borderHover: hexToRgba(cat.accent, 0.6),
            glow: `0 0 10px ${hexToRgba(cat.accent, 0.3)}`
        };
    }
    
    // Attach to THEME object
    THEME.categories = categoryThemes;
    THEME.getCategory = getCategory;
    THEME.getCategoryNames = () => Object.keys(DEFAULT_CATEGORY_THEMES);
    
    // Function to update theme at runtime
    function updateTheme(overrides) {
        try {
            const current = loadThemeOverrides();
            const updated = { ...current, ...overrides };
            localStorage.setItem('t2theme-overrides', JSON.stringify(updated));
            // Theme changes take effect on page reload
            return true;
        } catch (e) {
            console.error('[SharedControlsPlugin] Failed to save theme:', e);
            return false;
        }
    }
    
    // Function to reset theme to defaults
    function resetTheme() {
        try {
            localStorage.removeItem('t2theme-overrides');
            return true;
        } catch (e) {
            console.error('[SharedControlsPlugin] Failed to reset theme:', e);
            return false;
        }
    }
    
    // Function to update category themes at runtime
    function updateCategoryTheme(categoryName, overrides) {
        try {
            const current = loadCategoryOverrides();
            current[categoryName] = { ...(current[categoryName] || {}), ...overrides };
            localStorage.setItem('t2category-overrides', JSON.stringify(current));
            return true;
        } catch (e) {
            console.error('[SharedControlsPlugin] Failed to save category theme:', e);
            return false;
        }
    }
    
    // Function to reset category themes to defaults
    function resetCategoryThemes() {
        try {
            localStorage.removeItem('t2category-overrides');
            return true;
        } catch (e) {
            console.error('[SharedControlsPlugin] Failed to reset category themes:', e);
            return false;
        }
    }
    
    // Expose theme functions globally for settings panel access
    window.T2ThemeUtils = {
        getDefaults: () => ({ ...DEFAULT_THEME }),
        getCurrent: () => ({ ...themeValues }),
        update: updateTheme,
        reset: resetTheme,
        // Category theme utilities
        getCategoryDefaults: () => JSON.parse(JSON.stringify(DEFAULT_CATEGORY_THEMES)),
        getCategoryThemes: () => JSON.parse(JSON.stringify(categoryThemes)),
        updateCategory: updateCategoryTheme,
        resetCategories: resetCategoryThemes
    };

    // =========================================================================
    // UTILITY FUNCTIONS
    // =========================================================================
    const stopPropagation = (e) => e.stopPropagation();

    const baseInputStyle = {
        width: "100%",
        background: THEME.surface,
        color: THEME.text,
        border: `1px solid ${THEME.border}`,
        padding: "6px",
        borderRadius: "4px",
        outline: "none",
        fontSize: "12px"
    };

    const labelStyle = {
        display: "block",
        fontSize: "10px",
        color: THEME.textMuted,
        marginBottom: "2px",
        textTransform: "uppercase",
        letterSpacing: "0.5px"
    };

    // =========================================================================
    // BUTTON CONTROL
    // =========================================================================
    class ButtonControl extends ClassicPreset.Control {
        constructor(label, onClick, options = {}) {
            super();
            this.label = label;
            this.onClick = onClick;
            this.variant = options.variant || 'primary'; // 'primary', 'success', 'warning', 'danger'
            this.disabled = options.disabled || false;
        }
    }

    function ButtonControlComponent({ data }) {
        const variantColors = {
            primary: THEME.primary,
            success: THEME.success,
            warning: THEME.warning,
            danger: THEME.error
        };
        const color = variantColors[data.variant] || THEME.primary;
        
        const baseStyle = {
            width: "100%",
            padding: "8px",
            marginBottom: "5px",
            background: `rgba(${color === THEME.primary ? '0, 243, 255' : color === THEME.success ? '0, 255, 136' : color === THEME.warning ? '255, 170, 0' : '255, 68, 68'}, 0.1)`,
            border: `1px solid ${color}`,
            color: color,
            borderRadius: "20px",
            cursor: data.disabled ? "not-allowed" : "pointer",
            fontWeight: "600",
            textTransform: "uppercase",
            fontSize: "12px",
            transition: "all 0.2s",
            opacity: data.disabled ? 0.5 : 1
        };

        return React.createElement('button', {
            onPointerDown: stopPropagation,
            onDoubleClick: stopPropagation,
            onClick: data.disabled ? null : data.onClick,
            style: baseStyle,
            onMouseOver: (e) => {
                if (!data.disabled) {
                    e.currentTarget.style.background = `rgba(${color === THEME.primary ? '0, 243, 255' : '0, 255, 136'}, 0.25)`;
                    e.currentTarget.style.boxShadow = `0 0 12px ${color}40`;
                }
            },
            onMouseOut: (e) => {
                e.currentTarget.style.background = baseStyle.background;
                e.currentTarget.style.boxShadow = "none";
            }
        }, data.label);
    }

    // =========================================================================
    // DROPDOWN CONTROL
    // =========================================================================
    class DropdownControl extends ClassicPreset.Control {
        constructor(label, values, initialValue, onChange) {
            super();
            this.label = label;
            this.values = values;
            this.value = initialValue;
            this.onChange = onChange;
        }
    }

    function DropdownControlComponent({ data }) {
        const [value, setValue] = useState(data.value);
        const [values, setValues] = useState(data.values);
        const [seed, setSeed] = useState(0);

        useEffect(() => {
            setValue(data.value);
            setValues(data.values);
        }, [data.value, data.values]);

        // Allow external updates to trigger re-render
        useEffect(() => {
            data.updateDropdown = () => {
                setValues([...data.values]);
                setValue(data.value);
                setSeed(s => s + 1);
            };
            return () => { data.updateDropdown = null; };
        }, [data]);

        const handleChange = (e) => {
            const val = e.target.value;
            setValue(val);
            data.value = val;
            if (data.onChange) data.onChange(val);
        };

        return React.createElement('div', { style: { marginBottom: "5px" } }, [
            data.label && React.createElement('label', { key: 'l', style: labelStyle }, data.label),
            React.createElement('select', {
                key: 's',
                value: value,
                onChange: handleChange,
                onPointerDown: stopPropagation,
                onDoubleClick: stopPropagation,
                style: baseInputStyle
            }, values.map(v => React.createElement('option', { 
                key: v, 
                value: v, 
                style: { background: THEME.background, color: THEME.primary } 
            }, v)))
        ]);
    }

    // =========================================================================
    // SWITCH/CHECKBOX CONTROL
    // =========================================================================
    class SwitchControl extends ClassicPreset.Control {
        constructor(label, initialValue, onChange) {
            super();
            this.label = label;
            this.value = initialValue;
            this.onChange = onChange;
        }
    }

    function SwitchControlComponent({ data }) {
        const [value, setValue] = useState(data.value);

        useEffect(() => {
            setValue(data.value);
        }, [data.value]);

        const handleChange = (e) => {
            const val = e.target.checked;
            setValue(val);
            data.value = val;
            if (data.onChange) data.onChange(val);
        };

        return React.createElement('div', { 
            style: { display: "flex", alignItems: "center", marginBottom: "5px" } 
        }, [
            React.createElement('input', {
                key: 'i',
                type: 'checkbox',
                checked: value,
                onChange: handleChange,
                onPointerDown: stopPropagation,
                onDoubleClick: stopPropagation,
                style: { accentColor: THEME.primary }
            }),
            React.createElement('span', { 
                key: 's', 
                style: { 
                    marginLeft: "5px", 
                    fontSize: "12px", 
                    color: THEME.primary, 
                    textTransform: "uppercase", 
                    letterSpacing: "0.5px" 
                } 
            }, data.label)
        ]);
    }

    // =========================================================================
    // NUMBER CONTROL
    // =========================================================================
    class NumberControl extends ClassicPreset.Control {
        constructor(label, initialValue, onChange, options = {}) {
            super();
            this.label = label;
            this.value = initialValue;
            this.onChange = onChange;
            this.options = options; // { min, max, step }
        }
    }

    function NumberControlComponent({ data }) {
        const [value, setValue] = useState(data.value);

        useEffect(() => {
            setValue(data.value);
        }, [data.value]);

        const handleChange = (e) => {
            const val = Number(e.target.value);
            setValue(val);
            data.value = val;
            if (data.onChange) data.onChange(val);
        };

        return React.createElement('div', { style: { marginBottom: "5px" } }, [
            data.label && React.createElement('label', { key: 'l', style: labelStyle }, data.label),
            React.createElement('input', {
                key: 'i',
                type: 'number',
                value: value,
                onChange: handleChange,
                min: data.options.min,
                max: data.options.max,
                step: data.options.step,
                onPointerDown: stopPropagation,
                onDoubleClick: stopPropagation,
                style: baseInputStyle
            })
        ]);
    }

    // =========================================================================
    // TEXT INPUT CONTROL
    // =========================================================================
    class InputControl extends ClassicPreset.Control {
        constructor(label, initialValue, onChange, options = {}) {
            super();
            this.label = label;
            this.value = initialValue;
            this.onChange = onChange;
            this.placeholder = options.placeholder || '';
            this.type = options.type || 'text'; // 'text', 'password', 'email'
        }
    }

    function InputControlComponent({ data }) {
        const [value, setValue] = useState(data.value);

        useEffect(() => {
            setValue(data.value);
        }, [data.value]);

        const handleChange = (e) => {
            const val = e.target.value;
            setValue(val);
            data.value = val;
            if (data.onChange) data.onChange(val);
        };

        return React.createElement('div', { style: { marginBottom: "5px" } }, [
            data.label && React.createElement('label', { key: 'l', style: labelStyle }, data.label),
            React.createElement('input', {
                key: 'i',
                type: data.type || 'text',
                value: value,
                onChange: handleChange,
                placeholder: data.placeholder,
                onPointerDown: stopPropagation,
                onDoubleClick: stopPropagation,
                style: baseInputStyle
            })
        ]);
    }

    // =========================================================================
    // STATUS INDICATOR CONTROL
    // =========================================================================
    class StatusIndicatorControl extends ClassicPreset.Control {
        constructor(data) {
            super();
            this.data = data;
        }
    }

    function StatusIndicatorControlComponent({ data }) {
        const { state, color } = data.data || {};
        const isOn = state === 'on' || state === 'open' || state === 'playing' || state === true;
        const activeColor = color || (isOn ? THEME.primary : '#333');

        return React.createElement('div', {
            style: { 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                padding: '5px', 
                width: '100%' 
            },
            onPointerDown: stopPropagation
        }, React.createElement('div', {
            style: {
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                backgroundColor: isOn ? activeColor : 'rgba(0, 20, 30, 0.8)',
                boxShadow: isOn ? `0 0 10px ${activeColor}, 0 0 20px ${activeColor}` : 'none',
                transition: 'all 0.3s ease',
                border: `1px solid ${THEME.border}`
            }
        }));
    }

    // =========================================================================
    // COLOR BAR CONTROL (for brightness displays)
    // =========================================================================
    class ColorBarControl extends ClassicPreset.Control {
        constructor(data) {
            super();
            this.data = data;
        }
    }

    function ColorBarControlComponent({ data }) {
        const { brightness, hs_color, entityType, state, on } = data.data || {};
        
        // Check if device is ON - must explicitly be 'on' or true
        // Default to OFF if state is undefined/unknown
        const isOn = state === 'on' || on === true;
        
        let barColor = '#444';
        
        if (hs_color && hs_color.length === 2) {
            barColor = `hsl(${hs_color[0]}, ${hs_color[1]}%, 50%)`;
        } else if (entityType === 'light') {
            barColor = THEME.warning;
        }
        
        // When device is off (or state unknown), show 0% width; when on, show brightness
        // Also handle Hue brightness which is 0-254, not 0-255
        const normalizedBrightness = brightness > 0 ? brightness : 0;
        const widthPercent = isOn ? (normalizedBrightness / 255) * 100 : 0;

        return React.createElement('div', {
            style: { 
                width: '100%', 
                height: '8px', 
                backgroundColor: THEME.backgroundAlt, 
                borderRadius: '4px', 
                overflow: 'hidden', 
                marginTop: '5px', 
                border: `1px solid ${THEME.primaryRgba(0.2)}` 
            },
            onPointerDown: stopPropagation
        }, React.createElement('div', {
            style: { 
                width: `${widthPercent}%`, 
                height: '100%', 
                backgroundColor: barColor, 
                transition: 'all 0.3s ease', 
                boxShadow: isOn && widthPercent > 0 ? `0 0 10px ${barColor}` : 'none' 
            }
        }));
    }

    // =========================================================================
    // POWER STATS CONTROL
    // =========================================================================
    class PowerStatsControl extends ClassicPreset.Control {
        constructor(data) {
            super();
            this.data = data;
        }
    }

    function PowerStatsControlComponent({ data }) {
        const { power, energy } = data.data || {};
        
        if (power === null && energy === null) {
            return React.createElement('div', { 
                style: { fontSize: '10px', color: '#777', marginTop: '5px', fontFamily: 'monospace' } 
            }, '-- W / -- kWh');
        }

        return React.createElement('div', {
            style: { 
                display: 'flex', 
                flexDirection: 'column', 
                fontSize: '10px', 
                color: THEME.text, 
                marginTop: '5px', 
                fontFamily: 'monospace' 
            },
            onPointerDown: stopPropagation
        }, [
            React.createElement('div', { 
                key: 'p', 
                style: { display: 'flex', justifyContent: 'space-between' } 
            }, [
                React.createElement('span', { key: 'l' }, 'PWR:'),
                React.createElement('span', { key: 'v', style: { color: THEME.primary } }, 
                    power !== null ? `${power} W` : '--')
            ]),
            energy !== null && React.createElement('div', { 
                key: 'e', 
                style: { display: 'flex', justifyContent: 'space-between' } 
            }, [
                React.createElement('span', { key: 'l' }, 'NRG:'),
                React.createElement('span', { key: 'v', style: { color: THEME.warning } }, `${energy} kWh`)
            ])
        ]);
    }

    // =========================================================================
    // SLIDER COMPONENT (reusable, not a Control class)
    // =========================================================================
    function SliderComponent({ label, value, min, max, onChange, step = 1, displayValue, disabled, className }) {
        return React.createElement('div', { className: className || 'hsv-slider-container' }, [
            React.createElement('span', { key: 'label', className: 'hsv-slider-label' }, label),
            React.createElement('input', {
                key: 'input',
                type: 'range',
                min, max, step,
                value,
                disabled,
                onChange: (e) => onChange(Number(e.target.value)),
                onPointerDown: stopPropagation,
                className: 'hsv-range-input'
            }),
            React.createElement('span', { key: 'val', className: 'hsv-slider-value' }, 
                displayValue !== undefined ? displayValue : value)
        ]);
    }

    // =========================================================================
    // CHECKBOX COMPONENT (reusable, not a Control class)
    // =========================================================================
    function CheckboxComponent({ label, checked, onChange, className }) {
        return React.createElement('label', { className: className || 'hsv-checkbox-container' }, [
            React.createElement('input', {
                key: 'input',
                type: 'checkbox',
                checked,
                onChange: (e) => onChange(e.target.checked),
                onPointerDown: stopPropagation,
                className: 'hsv-checkbox'
            }),
            React.createElement('span', { key: 'label' }, label)
        ]);
    }

    // =========================================================================
    // DEVICE STATE CONTROL (for HA device nodes)
    // =========================================================================
    class DeviceStateControl extends ClassicPreset.Control {
        constructor(deviceId, getState) {
            super();
            this.deviceId = deviceId;
            this.getState = getState;
        }
    }

    function DeviceStateControlComponent({ data }) {
        const state = data.getState ? data.getState(data.deviceId) : null;
        if (!state) {
            return React.createElement('div', { 
                style: { 
                    padding: "4px 8px", 
                    background: THEME.backgroundAlt, 
                    borderRadius: "4px", 
                    marginBottom: "4px", 
                    display: "flex", 
                    alignItems: "center", 
                    justifyContent: "space-between", 
                    minHeight: "24px", 
                    border: `1px solid ${THEME.primaryRgba(0.1)}` 
                } 
            }, 
                React.createElement('span', { 
                    style: { fontSize: "11px", color: THEME.primaryRgba(0.5) } 
                }, "No state data")
            );
        }
        const isOn = state.on || state.state === 'on';
        const brightness = state.brightness ? Math.round((state.brightness / 255) * 100) : 0;
        const hsColor = state.hs_color || [0, 0];
        const [hue, saturation] = hsColor;
        let color = THEME.error;
        if (isOn) {
            color = (saturation === 0) ? THEME.warning : `hsl(${hue}, ${saturation}%, 50%)`;
        }
        return React.createElement('div', { 
            style: { 
                padding: "6px 8px", 
                background: THEME.backgroundAlt, 
                borderRadius: "4px", 
                marginBottom: "4px", 
                border: `1px solid ${THEME.primaryRgba(0.2)}`, 
                display: "flex", 
                flexDirection: "column" 
            } 
        }, [
            React.createElement('div', { 
                key: 'top', 
                style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: isOn ? "4px" : "0" } 
            }, [
                React.createElement('div', { 
                    key: 'left', 
                    style: { display: "flex", alignItems: "center", flex: 1, overflow: "hidden" } 
                }, [
                    React.createElement('div', { 
                        key: 'ind', 
                        style: { 
                            width: "14px", 
                            height: "14px", 
                            borderRadius: "50%", 
                            background: color, 
                            border: "1px solid rgba(255,255,255,0.3)", 
                            marginRight: "8px", 
                            flexShrink: 0, 
                            boxShadow: isOn ? `0 0 5px ${color}` : "none" 
                        } 
                    }),
                    React.createElement('span', { 
                        key: 'name', 
                        style: { 
                            fontSize: "12px", 
                            color: THEME.text, 
                            whiteSpace: "nowrap", 
                            overflow: "hidden", 
                            textOverflow: "ellipsis", 
                            marginRight: "8px" 
                        } 
                    }, state.name || data.deviceId)
                ]),
                React.createElement('span', { 
                    key: 'val', 
                    style: { 
                        fontSize: "10px", 
                        color: THEME.primary, 
                        fontFamily: "monospace", 
                        whiteSpace: "nowrap" 
                    } 
                }, isOn ? `${brightness}%` : "Off")
            ]),
            isOn && React.createElement('div', { 
                key: 'bar', 
                style: { 
                    width: "100%", 
                    height: "4px", 
                    background: THEME.primaryRgba(0.1), 
                    borderRadius: "2px", 
                    overflow: "hidden" 
                } 
            }, 
                React.createElement('div', { 
                    style: { 
                        width: `${brightness}%`, 
                        height: "100%", 
                        background: `linear-gradient(90deg, ${THEME.primaryRgba(0.2)}, ${color})`, 
                        transition: "width 0.3s ease-out" 
                    } 
                })
            )
        ]);
    }

    // =========================================================================
    // EXPOSE TO WINDOW
    // =========================================================================

    // =========================================================================
    // TOOLTIP COMPONENT - Styled tooltip wrapper for any element
    // =========================================================================
    function Tooltip({ text, children, position = 'top' }) {
        const [visible, setVisible] = useState(false);

        if (!text) {
            // No tooltip text, just render children
            return children;
        }

        // Calculate position styles based on position prop
        const getPositionStyle = () => {
            switch (position) {
                case 'bottom':
                    return { top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: '6px' };
                case 'left':
                    return { right: '100%', top: '50%', transform: 'translateY(-50%)', marginRight: '6px' };
                case 'right':
                    return { left: '100%', top: '50%', transform: 'translateY(-50%)', marginLeft: '6px' };
                case 'top':
                default:
                    return { bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: '6px' };
            }
        };

        const tooltipStyle = {
            position: 'absolute',
            ...getPositionStyle(),
            background: 'rgba(0, 0, 0, 0.95)',
            border: `1px solid ${THEME.primary}`,
            borderRadius: '6px',
            padding: '8px 12px',
            color: THEME.text,
            fontSize: '11px',
            lineHeight: '1.4',
            minWidth: '150px',
            maxWidth: '250px',
            zIndex: 10000,
            pointerEvents: 'none',
            boxShadow: `0 4px 12px rgba(0, 0, 0, 0.5), 0 0 8px ${THEME.primaryRgba(0.3)}`,
            whiteSpace: 'pre-wrap',
            textAlign: 'left'
        };

        return React.createElement('div', {
            style: { display: 'inline-block', position: 'relative' },
            onMouseEnter: () => setVisible(true),
            onMouseLeave: () => setVisible(false)
        }, [
            children,
            visible && React.createElement('div', { key: 'tooltip', style: tooltipStyle }, text)
        ]);
    }

    // =========================================================================
    // HELP ICON - Small "?" icon that shows tooltip on hover
    // =========================================================================
    function HelpIcon({ text, size = 14 }) {
        const [visible, setVisible] = useState(false);

        const containerStyle = {
            position: 'relative',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center'
        };

        const iconStyle = {
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: `${size}px`,
            height: `${size}px`,
            borderRadius: '50%',
            background: THEME.primaryRgba(0.2),
            border: `1px solid ${THEME.primaryRgba(0.4)}`,
            color: THEME.primary,
            fontSize: `${size - 4}px`,
            fontWeight: 'bold',
            cursor: 'help',
            marginLeft: '4px',
            flexShrink: 0
        };

        const tooltipStyle = {
            position: 'absolute',
            left: '50%',
            bottom: '100%',
            transform: 'translateX(-50%)',
            marginBottom: '6px',
            background: 'rgba(0, 0, 0, 0.95)',
            border: `1px solid ${THEME.primary}`,
            borderRadius: '6px',
            padding: '8px 12px',
            color: THEME.text,
            fontSize: '11px',
            lineHeight: '1.4',
            minWidth: '180px',
            maxWidth: '250px',
            zIndex: 10000,
            pointerEvents: 'none',
            boxShadow: `0 4px 12px rgba(0, 0, 0, 0.5), 0 0 8px ${THEME.primaryRgba(0.3)}`,
            whiteSpace: 'pre-wrap',
            textAlign: 'left'
        };

        return React.createElement('span', {
            style: containerStyle,
            onMouseEnter: () => setVisible(true),
            onMouseLeave: () => setVisible(false)
        }, [
            React.createElement('span', { key: 'icon', style: iconStyle }, '?'),
            visible && React.createElement('div', { key: 'tip', style: tooltipStyle }, text)
        ]);
    }

    // =========================================================================
    // NODE HEADER WITH TOOLTIP - Reusable header component with node description
    // =========================================================================
    function NodeHeader({ icon, title, tooltip, statusDot, statusColor, className }) {
        // When className is provided, use CSS for styling (category-specific theming)
        // Otherwise, use inline styles with THEME fallback for backward compatibility
        const headerStyle = className ? {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
        } : {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '10px',
            paddingBottom: '8px',
            borderBottom: `1px solid ${THEME.border}`
        };

        const titleStyle = className ? {
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
        } : {
            color: THEME.primary,
            fontSize: '14px',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
        };

        const dotStyle = statusDot ? {
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: statusColor || '#555'
        } : null;

        return React.createElement('div', { className: className, style: headerStyle }, [
            React.createElement('div', { key: 'title', style: titleStyle }, [
                icon && React.createElement('span', { key: 'icon' }, icon),
                title,
                tooltip && React.createElement(HelpIcon, { key: 'help', text: tooltip })
            ]),
            statusDot && React.createElement('div', { key: 'status', style: dotStyle })
        ]);
    }

    // =========================================================================
    // LABELED ROW WITH TOOLTIP - Label + control + optional help icon
    // =========================================================================
    function LabeledRow({ label, tooltip, children }) {
        const rowStyle = {
            display: 'flex',
            alignItems: 'center',
            marginBottom: '8px',
            padding: '4px 0'
        };

        const labelContainerStyle = {
            display: 'flex',
            alignItems: 'center',
            width: '70px',
            flexShrink: 0
        };

        const labelTextStyle = {
            color: THEME.text,
            fontSize: '11px'
        };

        return React.createElement('div', { style: rowStyle }, [
            React.createElement('div', { key: 'label', style: labelContainerStyle }, [
                React.createElement('span', { key: 'text', style: labelTextStyle }, label),
                tooltip && React.createElement(HelpIcon, { key: 'help', text: tooltip, size: 12 })
            ]),
            React.createElement('div', { key: 'control', style: { flex: 1 } }, children)
        ]);
    }

    window.T2Controls = {
        // Control Classes
        ButtonControl,
        DropdownControl,
        SwitchControl,
        NumberControl,
        InputControl,
        StatusIndicatorControl,
        ColorBarControl,
        PowerStatsControl,
        DeviceStateControl,

        // Control Components (for custom rendering)
        ButtonControlComponent,
        DropdownControlComponent,
        SwitchControlComponent,
        NumberControlComponent,
        InputControlComponent,
        StatusIndicatorControlComponent,
        ColorBarControlComponent,
        PowerStatsControlComponent,
        DeviceStateControlComponent,

        // Reusable UI Components
        Slider: SliderComponent,
        Checkbox: CheckboxComponent,

        // Tooltip Components
        Tooltip,
        HelpIcon,
        NodeHeader,
        LabeledRow,

        // Theme constants
        THEME,

        // Utilities
        stopPropagation,
        baseInputStyle,
        labelStyle
    };

    // console.log("[SharedControlsPlugin] Registered window.T2Controls with", Object.keys(window.T2Controls).length, "exports");
})();
