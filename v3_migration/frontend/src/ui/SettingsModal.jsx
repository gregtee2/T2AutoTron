import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import './SettingsModal.css';
import { DiscoveryPanel } from './DiscoveryPanel';

// Theme settings configuration (stored in localStorage, not server)
const THEME_SETTINGS = [
    { key: 'primary', label: 'Primary Accent Color', type: 'color', default: '#5fb3b3' },
    { key: 'background', label: 'Node Background', type: 'color', default: '#1e2428' },
    { key: 'surface', label: 'Node Surface', type: 'color', default: '#2a3238' },
    { key: 'surfaceLight', label: 'Elevated Surface', type: 'color', default: '#343d44' },
    { key: 'text', label: 'Text Color', type: 'color', default: '#c5cdd3' },
    { key: 'textMuted', label: 'Muted Text', type: 'color', default: '#8a959e' },
    { key: 'success', label: 'Success Color', type: 'color', default: '#5faa7d' },
    { key: 'warning', label: 'Warning Color', type: 'color', default: '#d4a054' },
    { key: 'error', label: 'Error Color', type: 'color', default: '#c75f5f' },
    { key: 'borderOpacity', label: 'Border Opacity (%)', type: 'range', min: 0, max: 100, default: 25 }
];

// Define the settings structure with metadata
const SETTINGS_CONFIG = [
    {
        category: 'Home Assistant',
        icon: '🏠',
        testable: 'ha',
        settings: [
            { key: 'HA_HOST', label: 'Home Assistant URL', placeholder: 'http://homeassistant.local:8123', type: 'text' },
            { key: 'HA_TOKEN', label: 'Long-Lived Access Token', placeholder: 'eyJ...', type: 'password', isSecret: true }
        ]
    },
    {
        category: 'Weather Services',
        icon: '🌤️',
        testable: 'weather',
        settings: [
            { key: 'OPENWEATHERMAP_API_KEY', label: 'OpenWeatherMap API Key', placeholder: 'Your API key', type: 'password', isSecret: true }
        ]
    },
    {
        category: 'Ambient Weather',
        icon: '🌡️',
        settings: [
            { key: 'AMBIENT_API_KEY', label: 'Ambient Weather API Key', placeholder: 'Your API key', type: 'password', isSecret: true },
            { key: 'AMBIENT_APPLICATION_KEY', label: 'Application Key', placeholder: 'Your app key', type: 'password', isSecret: true },
            { key: 'AMBIENT_MAC_ADDRESS', label: 'Device MAC Address', placeholder: 'XX:XX:XX:XX:XX:XX', type: 'text' }
        ]
    },
    {
        category: 'Philips Hue',
        icon: '💡',
        testable: 'hue',
        settings: [
            { key: 'HUE_BRIDGE_IP', label: 'Bridge IP Address', placeholder: '192.168.1.x', type: 'text' },
            { key: 'HUE_USERNAME', label: 'Bridge Username/Key', placeholder: 'Generated key', type: 'password', isSecret: true }
        ]
    },
    {
        category: 'Telegram Notifications',
        icon: '📱',
        testable: 'telegram',
        settings: [
            { key: 'TELEGRAM_BOT_TOKEN', label: 'Bot Token', placeholder: '123456:ABC-DEF...', type: 'password', isSecret: true },
            { key: 'TELEGRAM_CHAT_ID', label: 'Chat ID', placeholder: '123456789', type: 'text' }
        ]
    },
    {
        category: 'Location',
        icon: '📍',
        description: 'Your location for sunrise/sunset calculations and weather',
        settings: [
            { key: 'LOCATION_CITY', label: 'City', placeholder: 'Dallas, TX', type: 'text' },
            { key: 'LOCATION_LATITUDE', label: 'Latitude', placeholder: '32.7767', type: 'text' },
            { key: 'LOCATION_LONGITUDE', label: 'Longitude', placeholder: '-96.7970', type: 'text' },
            { key: 'LOCATION_TIMEZONE', label: 'Timezone', placeholder: 'America/Chicago', type: 'text' }
        ]
    },
    {
        category: 'Server Settings',
        icon: '⚙️',
        settings: [
            { key: 'PORT', label: 'Server Port', placeholder: '3000', type: 'number' },
            { key: 'LOG_LEVEL', label: 'Log Level', placeholder: 'info', type: 'select', options: ['debug', 'info', 'warn', 'error'] }
        ]
    }
];

export function SettingsModal({ isOpen, onClose }) {
    const [settings, setSettings] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [showSecrets, setShowSecrets] = useState({});
    const [expandedCategories, setExpandedCategories] = useState({});
    const [testResults, setTestResults] = useState({});
    const [testing, setTesting] = useState({});
    const fileInputRef = useRef(null);
    
    // Theme settings state (stored in localStorage)
    const [themeSettings, setThemeSettings] = useState(() => {
        // Load from localStorage or use defaults
        try {
            const stored = localStorage.getItem('t2theme-overrides');
            const overrides = stored ? JSON.parse(stored) : {};
            const defaults = {};
            THEME_SETTINGS.forEach(s => { defaults[s.key] = s.default; });
            return { ...defaults, ...overrides };
        } catch {
            const defaults = {};
            THEME_SETTINGS.forEach(s => { defaults[s.key] = s.default; });
            return defaults;
        }
    });
    const [themeChanged, setThemeChanged] = useState(false);
    
    // Category theme settings state
    const DEFAULT_CATEGORY_THEMES = {
        'Home Assistant': { accent: '#4fc3f7', background: '#0a1520', icon: '🏠' },
        'Weather': { accent: '#ffb74d', background: '#1a1510', icon: '🌤️' },
        'Logic': { accent: '#81c784', background: '#0a140a', icon: '🔀' },
        'Timer/Event': { accent: '#ce93d8', background: '#140a14', icon: '⏱️' },
        'Color': { accent: '#f48fb1', background: '#140a10', icon: '🎨' },
        'Utility': { accent: '#90a4ae', background: '#0a0f14', icon: '🔧' },
        'Inputs': { accent: '#aed581', background: '#0f140a', icon: '📥' },
        'CC_Control_Nodes': { accent: '#64b5f6', background: '#0a1018', icon: '🎛️' },
        'Other': { accent: '#b0bec5', background: '#0a0f14', icon: '📦' }
    };
    
    const [categoryThemes, setCategoryThemes] = useState(() => {
        try {
            const stored = localStorage.getItem('t2category-overrides');
            const overrides = stored ? JSON.parse(stored) : {};
            const merged = {};
            for (const [cat, defaults] of Object.entries(DEFAULT_CATEGORY_THEMES)) {
                merged[cat] = { ...defaults, ...(overrides[cat] || {}) };
            }
            return merged;
        } catch {
            return { ...DEFAULT_CATEGORY_THEMES };
        }
    });
    const [categoryChanged, setCategoryChanged] = useState(false);
    
    // Socket color settings
    const DEFAULT_SOCKET_COLORS = {
        'Boolean': { color: '#10b981', icon: '🟢', description: 'True/False values' },
        'Number': { color: '#3b82f6', icon: '🔵', description: 'Numeric values' },
        'String': { color: '#f59e0b', icon: '🟠', description: 'Text values' },
        'HSV Info': { color: '#8b5cf6', icon: '🟣', description: 'Color HSV data' },
        'Object/Any': { color: '#06b6d4', icon: '🔷', description: 'Generic objects' },
        'Light Info': { color: '#eab308', icon: '🟡', description: 'Light state data' }
    };
    
    const socketTypeToCssPrefix = {
        'Boolean': 'boolean',
        'Number': 'number',
        'String': 'string',
        'HSV Info': 'hsv',
        'Object/Any': 'object',
        'Light Info': 'light'
    };
    
    const [socketColors, setSocketColors] = useState(() => {
        try {
            const stored = localStorage.getItem('t2socket-colors');
            const overrides = stored ? JSON.parse(stored) : {};
            const merged = {};
            for (const [type, defaults] of Object.entries(DEFAULT_SOCKET_COLORS)) {
                merged[type] = { ...defaults, ...(overrides[type] || {}) };
            }
            return merged;
        } catch {
            return { ...DEFAULT_SOCKET_COLORS };
        }
    });
    const [socketColorsChanged, setSocketColorsChanged] = useState(false);
    
    // City search state for Location settings
    const [searchingCity, setSearchingCity] = useState(false);
    const [citySearchError, setCitySearchError] = useState(null);

    // Fetch current settings on mount
    useEffect(() => {
        if (isOpen) {
            fetchSettings();
            setExpandedCategories({ 'Home Assistant': true });
            setTestResults({});
        }
    }, [isOpen]);

    const fetchSettings = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch('/api/settings');
            if (!response.ok) throw new Error('Failed to fetch settings');
            const data = await response.json();
            setSettings(data.settings || {});
        } catch (err) {
            setError('Failed to load settings: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        setSuccess(null);
        try {
            const response = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ settings })
            });
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to save settings');
            }
            setSuccess('Settings saved! Some changes may require a server restart.');
            setTimeout(() => setSuccess(null), 5000);
        } catch (err) {
            setError('Failed to save: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleChange = (key, value) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };
    
    // City search handler - uses OpenStreetMap Nominatim for geocoding
    const handleCitySearch = async () => {
        const cityName = settings.LOCATION_CITY;
        if (!cityName || cityName.trim().length < 2) {
            setCitySearchError('Please enter a city name first');
            return;
        }
        
        setSearchingCity(true);
        setCitySearchError(null);
        
        try {
            // Use OpenStreetMap Nominatim API (free, no API key required)
            const response = await fetch(
                `https://nominatim.openstreetmap.org/search?` +
                `q=${encodeURIComponent(cityName)}&format=json&limit=1&addressdetails=1`,
                {
                    headers: {
                        'User-Agent': 'T2AutoTron/2.1 (Home Automation App)'
                    }
                }
            );
            
            if (!response.ok) {
                throw new Error('Geocoding service unavailable');
            }
            
            const data = await response.json();
            
            if (data.length === 0) {
                setCitySearchError(`Could not find "${cityName}". Try adding state/country (e.g., "Dallas, TX, USA")`);
                return;
            }
            
            const result = data[0];
            const lat = parseFloat(result.lat).toFixed(4);
            const lon = parseFloat(result.lon).toFixed(4);
            
            // Build a nice display name
            const displayName = result.address ? 
                [result.address.city || result.address.town || result.address.village || result.name,
                 result.address.state,
                 result.address.country].filter(Boolean).join(', ') :
                result.display_name.split(',').slice(0, 3).join(',');
            
            // Determine timezone based on US state, country, or longitude
            let suggestedTz = 'UTC';
            const state = result.address?.state?.toLowerCase() || '';
            const country = result.address?.country?.toLowerCase() || '';
            
            // Country-based timezone detection for common countries
            if (country.includes('portugal')) {
                suggestedTz = 'Europe/Lisbon';
            } else if (country.includes('spain')) {
                suggestedTz = 'Europe/Madrid';
            } else if (country.includes('france')) {
                suggestedTz = 'Europe/Paris';
            } else if (country.includes('germany')) {
                suggestedTz = 'Europe/Berlin';
            } else if (country.includes('italy')) {
                suggestedTz = 'Europe/Rome';
            } else if (country.includes('united kingdom') || country.includes('ireland')) {
                suggestedTz = 'Europe/London';
            } else if (country.includes('netherlands')) {
                suggestedTz = 'Europe/Amsterdam';
            } else if (country.includes('belgium')) {
                suggestedTz = 'Europe/Brussels';
            } else if (country.includes('australia')) {
                suggestedTz = 'Australia/Sydney';
            } else if (country.includes('japan')) {
                suggestedTz = 'Asia/Tokyo';
            } else if (country.includes('china')) {
                suggestedTz = 'Asia/Shanghai';
            } else if (country.includes('india')) {
                suggestedTz = 'Asia/Kolkata';
            } else if (country.includes('brazil')) {
                suggestedTz = 'America/Sao_Paulo';
            } else if (country.includes('canada')) {
                // Canadian provinces
                if (state.includes('british columbia')) suggestedTz = 'America/Vancouver';
                else if (state.includes('alberta')) suggestedTz = 'America/Edmonton';
                else if (state.includes('saskatchewan')) suggestedTz = 'America/Regina';
                else if (state.includes('manitoba')) suggestedTz = 'America/Winnipeg';
                else if (state.includes('ontario')) suggestedTz = 'America/Toronto';
                else if (state.includes('quebec')) suggestedTz = 'America/Montreal';
                else suggestedTz = 'America/Toronto';
            } else if (country.includes('united states') || country.includes('usa')) {
                // US state-based timezone detection
                if (state.includes('hawaii')) {
                    suggestedTz = 'Pacific/Honolulu';
                } else if (state.includes('alaska')) {
                    suggestedTz = 'America/Anchorage';
                } else if (['california', 'nevada', 'oregon', 'washington'].some(s => state.includes(s))) {
                    suggestedTz = 'America/Los_Angeles';
                } else if (['arizona'].some(s => state.includes(s))) {
                    suggestedTz = 'America/Phoenix';
                } else if (['colorado', 'montana', 'wyoming', 'utah', 'new mexico', 'idaho'].some(s => state.includes(s))) {
                    suggestedTz = 'America/Denver';
                } else if (['texas', 'oklahoma', 'kansas', 'nebraska', 'south dakota', 'north dakota', 
                            'minnesota', 'iowa', 'missouri', 'arkansas', 'louisiana', 'wisconsin', 
                            'illinois', 'mississippi', 'alabama', 'tennessee'].some(s => state.includes(s))) {
                    suggestedTz = 'America/Chicago';
                } else {
                    suggestedTz = 'America/New_York';
                }
            } else {
                // Fallback to longitude-based for other locations
                const lonNum = parseFloat(lon);
                if (lonNum >= -125 && lonNum < -115) suggestedTz = 'America/Los_Angeles';
                else if (lonNum >= -115 && lonNum < -102) suggestedTz = 'America/Denver';
                else if (lonNum >= -102 && lonNum < -87) suggestedTz = 'America/Chicago';
                else if (lonNum >= -87 && lonNum < -67) suggestedTz = 'America/New_York';
                else if (lonNum >= -10 && lonNum < 3) suggestedTz = 'Europe/London';
                else if (lonNum >= 3 && lonNum < 15) suggestedTz = 'Europe/Paris';
                else if (lonNum >= 15 && lonNum < 30) suggestedTz = 'Europe/Berlin';
            }
            
            // Update settings - ALWAYS update timezone when searching
            setSettings(prev => ({
                ...prev,
                LOCATION_CITY: displayName,
                LOCATION_LATITUDE: lat,
                LOCATION_LONGITUDE: lon,
                LOCATION_TIMEZONE: suggestedTz
            }));
            
            setSuccess(`Found: ${displayName} (${lat}, ${lon})`);
            setTimeout(() => setSuccess(null), 5000);
            
        } catch (err) {
            setCitySearchError('Search failed: ' + err.message);
        } finally {
            setSearchingCity(false);
        }
    };
    
    // Theme settings handlers
    const handleThemeChange = (key, value) => {
        setThemeSettings(prev => ({ ...prev, [key]: value }));
        setThemeChanged(true);
    };
    
    const handleApplyTheme = () => {
        try {
            localStorage.setItem('t2theme-overrides', JSON.stringify(themeSettings));
            setSuccess('Theme saved! Refresh the page to apply changes.');
            setThemeChanged(false);
            setTimeout(() => setSuccess(null), 5000);
        } catch (err) {
            setError('Failed to save theme: ' + err.message);
        }
    };
    
    const handleResetTheme = () => {
        const defaults = {};
        THEME_SETTINGS.forEach(s => { defaults[s.key] = s.default; });
        setThemeSettings(defaults);
        localStorage.removeItem('t2theme-overrides');
        setSuccess('Theme reset to defaults! Refresh the page to apply.');
        setThemeChanged(false);
        setTimeout(() => setSuccess(null), 5000);
    };
    
    // Category theme handlers
    const handleCategoryChange = (category, field, value) => {
        setCategoryThemes(prev => ({
            ...prev,
            [category]: { ...prev[category], [field]: value }
        }));
        setCategoryChanged(true);
    };
    
    // Helper to convert hex to RGB for CSS variables
    const hexToRgb = (hex) => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `${r}, ${g}, ${b}`;
    };
    
    // Map category names to CSS variable prefixes
    const categoryToCssPrefix = {
        'Home Assistant': 'ha',
        'Weather': 'weather',
        'Logic': 'logic',
        'Timer/Event': 'timer',
        'Color': 'color',
        'Utility': 'utility',
        'Inputs': 'inputs',
        'CC_Control_Nodes': 'cc',
        'Other': 'other'
    };
    
    // Apply category colors to CSS variables in real-time
    const applyCategoryColorsToCSS = (themes) => {
        const root = document.documentElement;
        for (const [category, theme] of Object.entries(themes)) {
            const prefix = categoryToCssPrefix[category];
            if (prefix) {
                root.style.setProperty(`--node-${prefix}-color`, theme.accent);
                root.style.setProperty(`--node-${prefix}-color-rgb`, hexToRgb(theme.accent));
                if (theme.background) {
                    root.style.setProperty(`--node-${prefix}-bg`, theme.background);
                }
            }
        }
    };
    
    const handleApplyCategories = () => {
        try {
            // Store both accent and background overrides
            const overrides = {};
            for (const [cat, theme] of Object.entries(categoryThemes)) {
                const defaults = DEFAULT_CATEGORY_THEMES[cat];
                const catOverride = {};
                if (theme.accent !== defaults.accent) {
                    catOverride.accent = theme.accent;
                }
                if (theme.background !== defaults.background) {
                    catOverride.background = theme.background;
                }
                if (Object.keys(catOverride).length > 0) {
                    overrides[cat] = catOverride;
                }
            }
            if (Object.keys(overrides).length > 0) {
                localStorage.setItem('t2category-overrides', JSON.stringify(overrides));
            } else {
                localStorage.removeItem('t2category-overrides');
            }
            
            // Apply immediately to CSS variables
            applyCategoryColorsToCSS(categoryThemes);
            
            setSuccess('Category colors applied!');
            setCategoryChanged(false);
            setTimeout(() => setSuccess(null), 3000);
        } catch (err) {
            setError('Failed to save category colors: ' + err.message);
        }
    };
    
    const handleResetCategories = () => {
        setCategoryThemes({ ...DEFAULT_CATEGORY_THEMES });
        localStorage.removeItem('t2category-overrides');
        
        // Apply defaults immediately to CSS
        applyCategoryColorsToCSS(DEFAULT_CATEGORY_THEMES);
        
        setSuccess('Category colors reset to defaults!');
        setCategoryChanged(false);
        setTimeout(() => setSuccess(null), 3000);
    };
    
    // Socket color handlers
    const handleSocketColorChange = (socketType, color) => {
        setSocketColors(prev => ({
            ...prev,
            [socketType]: { ...prev[socketType], color }
        }));
        setSocketColorsChanged(true);
    };
    
    // Helper to darken a color for gradient
    const darkenColor = (hex, percent = 20) => {
        const num = parseInt(hex.slice(1), 16);
        const r = Math.max(0, (num >> 16) - Math.round(255 * percent / 100));
        const g = Math.max(0, ((num >> 8) & 0x00FF) - Math.round(255 * percent / 100));
        const b = Math.max(0, (num & 0x0000FF) - Math.round(255 * percent / 100));
        return `#${(1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1)}`;
    };
    
    // Helper to lighten a color for border
    const lightenColor = (hex, percent = 20) => {
        const num = parseInt(hex.slice(1), 16);
        const r = Math.min(255, (num >> 16) + Math.round(255 * percent / 100));
        const g = Math.min(255, ((num >> 8) & 0x00FF) + Math.round(255 * percent / 100));
        const b = Math.min(255, (num & 0x0000FF) + Math.round(255 * percent / 100));
        return `#${(1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1)}`;
    };
    
    // Apply socket colors to CSS variables
    const applySocketColorsToCSS = (colors) => {
        const root = document.documentElement;
        for (const [socketType, config] of Object.entries(colors)) {
            const prefix = socketTypeToCssPrefix[socketType];
            if (prefix) {
                root.style.setProperty(`--socket-${prefix}-color`, config.color);
                root.style.setProperty(`--socket-${prefix}-dark`, darkenColor(config.color, 15));
                root.style.setProperty(`--socket-${prefix}-border`, lightenColor(config.color, 20));
                root.style.setProperty(`--socket-${prefix}-rgb`, hexToRgb(config.color));
            }
        }
    };
    
    const handleApplySocketColors = () => {
        try {
            const overrides = {};
            for (const [type, config] of Object.entries(socketColors)) {
                const defaults = DEFAULT_SOCKET_COLORS[type];
                if (config.color !== defaults.color) {
                    overrides[type] = { color: config.color };
                }
            }
            if (Object.keys(overrides).length > 0) {
                localStorage.setItem('t2socket-colors', JSON.stringify(overrides));
            } else {
                localStorage.removeItem('t2socket-colors');
            }
            
            applySocketColorsToCSS(socketColors);
            
            setSuccess('Socket colors applied!');
            setSocketColorsChanged(false);
            setTimeout(() => setSuccess(null), 3000);
        } catch (err) {
            setError('Failed to save socket colors: ' + err.message);
        }
    };
    
    const handleResetSocketColors = () => {
        setSocketColors({ ...DEFAULT_SOCKET_COLORS });
        localStorage.removeItem('t2socket-colors');
        applySocketColorsToCSS(DEFAULT_SOCKET_COLORS);
        
        setSuccess('Socket colors reset to defaults!');
        setSocketColorsChanged(false);
        setTimeout(() => setSuccess(null), 3000);
    };

    const toggleCategory = (category) => {
        setExpandedCategories(prev => ({
            ...prev,
            [category]: !prev[category]
        }));
    };

    const toggleShowSecret = (key) => {
        setShowSecrets(prev => ({ ...prev, [key]: !prev[key] }));
    };

    // Test connection for a service
    const handleTestConnection = async (service) => {
        setTesting(prev => ({ ...prev, [service]: true }));
        setTestResults(prev => ({ ...prev, [service]: null }));
        
        try {
            const response = await fetch('/api/settings/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ service, settings })
            });
            const data = await response.json();
            
            setTestResults(prev => ({
                ...prev,
                [service]: {
                    success: data.success,
                    message: data.message || (data.success ? 'Connection successful!' : 'Connection failed'),
                    details: data.details
                }
            }));
        } catch (err) {
            setTestResults(prev => ({
                ...prev,
                [service]: { success: false, message: 'Test failed: ' + err.message }
            }));
        } finally {
            setTesting(prev => ({ ...prev, [service]: false }));
        }
    };

    // Export settings backup
    const handleExportBackup = () => {
        const backup = {
            version: '1.0',
            timestamp: new Date().toISOString(),
            settings: settings
        };
        
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `t2autotron-settings-backup-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        setSuccess('Settings exported successfully!');
        setTimeout(() => setSuccess(null), 3000);
    };

    // Import settings backup
    const handleImportBackup = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const backup = JSON.parse(event.target.result);
                
                if (!backup.settings || typeof backup.settings !== 'object') {
                    throw new Error('Invalid backup file format');
                }
                
                setSettings(prev => ({ ...prev, ...backup.settings }));
                setSuccess(`Imported ${Object.keys(backup.settings).length} settings from backup. Click Save to apply.`);
                setTimeout(() => setSuccess(null), 5000);
            } catch (err) {
                setError('Failed to import backup: ' + err.message);
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    if (!isOpen) return null;

    // Use portal to render modal at document.body level, 
    // escaping any parent transforms that break fixed positioning
    return ReactDOM.createPortal(
        <div className="settings-modal-overlay" onClick={onClose}>
            <div className="settings-modal" onClick={e => e.stopPropagation()}>
                <div className="settings-header">
                    <h2>🔧 Settings & API Keys</h2>
                    <button className="settings-close-btn" onClick={onClose}>✕</button>
                </div>

                <div className="settings-content">
                    {loading ? (
                        <div className="settings-loading">Loading settings...</div>
                    ) : (
                        <>
                            {error && <div className="settings-error">{error}</div>}
                            {success && <div className="settings-success">{success}</div>}

                            <div className="settings-warning">
                                ⚠️ API keys are stored in the server's .env file. Keep this secure!
                            </div>

                            {/* Backup/Restore Section */}
                            <div className="settings-backup-section">
                                <span className="settings-backup-label">📦 Backup & Restore</span>
                                <div className="settings-backup-buttons">
                                    <button 
                                        className="settings-btn-small settings-btn-export"
                                        onClick={handleExportBackup}
                                    >
                                        ⬇️ Export Backup
                                    </button>
                                    <button 
                                        className="settings-btn-small settings-btn-import"
                                        onClick={() => fileInputRef.current?.click()}
                                    >
                                        ⬆️ Import Backup
                                    </button>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept=".json"
                                        style={{ display: 'none' }}
                                        onChange={handleImportBackup}
                                    />
                                </div>
                            </div>

                            {/* Network Discovery Section */}
                            <div className="settings-category">
                                <div 
                                    className="settings-category-header"
                                    onClick={() => toggleCategory('Discovery')}
                                >
                                    <span>
                                        {expandedCategories['Discovery'] ? '▼' : '▶'} 
                                        📡 Network Device Discovery
                                    </span>
                                </div>
                                
                                {expandedCategories['Discovery'] && (
                                    <div className="settings-category-content">
                                        <DiscoveryPanel />
                                    </div>
                                )}
                            </div>

                            {/* Theme Settings Section */}
                            <div className="settings-category">
                                <div 
                                    className="settings-category-header"
                                    onClick={() => toggleCategory('Theme')}
                                >
                                    <span>
                                        {expandedCategories['Theme'] ? '▼' : '▶'} 
                                        🎨 Node Theme Settings
                                    </span>
                                    {themeChanged && (
                                        <span style={{ fontSize: '10px', color: '#d4a054' }}>• unsaved</span>
                                    )}
                                </div>
                                
                                {expandedCategories['Theme'] && (
                                    <div className="settings-category-content">
                                        <div className="settings-info" style={{ 
                                            fontSize: '11px', 
                                            color: '#8a959e', 
                                            marginBottom: '12px',
                                            padding: '8px',
                                            background: 'rgba(95, 179, 179, 0.1)',
                                            borderRadius: '4px'
                                        }}>
                                            💡 Theme settings are stored locally. Refresh the page after saving to apply changes.
                                        </div>
                                        
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                            {THEME_SETTINGS.map(setting => (
                                                <div key={setting.key} className="settings-field" style={{ marginBottom: '8px' }}>
                                                    <label className="settings-label" style={{ fontSize: '10px' }}>
                                                        {setting.label}
                                                    </label>
                                                    {setting.type === 'color' ? (
                                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                            <input
                                                                type="color"
                                                                value={themeSettings[setting.key] || setting.default}
                                                                onChange={e => handleThemeChange(setting.key, e.target.value)}
                                                                style={{ 
                                                                    width: '40px', 
                                                                    height: '30px', 
                                                                    border: 'none',
                                                                    borderRadius: '4px',
                                                                    cursor: 'pointer',
                                                                    background: 'transparent'
                                                                }}
                                                            />
                                                            <input
                                                                type="text"
                                                                value={themeSettings[setting.key] || setting.default}
                                                                onChange={e => handleThemeChange(setting.key, e.target.value)}
                                                                className="settings-input"
                                                                style={{ flex: 1, fontFamily: 'monospace', fontSize: '11px' }}
                                                            />
                                                        </div>
                                                    ) : setting.type === 'range' ? (
                                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                            <input
                                                                type="range"
                                                                min={setting.min}
                                                                max={setting.max}
                                                                value={themeSettings[setting.key] || setting.default}
                                                                onChange={e => handleThemeChange(setting.key, parseInt(e.target.value))}
                                                                style={{ flex: 1 }}
                                                            />
                                                            <span style={{ 
                                                                minWidth: '35px', 
                                                                textAlign: 'right',
                                                                color: '#c5cdd3',
                                                                fontSize: '12px'
                                                            }}>
                                                                {themeSettings[setting.key] || setting.default}%
                                                            </span>
                                                        </div>
                                                    ) : null}
                                                </div>
                                            ))}
                                        </div>
                                        
                                        {/* Preview swatch */}
                                        <div style={{ 
                                            marginTop: '12px', 
                                            padding: '12px', 
                                            background: themeSettings.background,
                                            borderRadius: '8px',
                                            border: `1px solid rgba(95, 179, 179, ${(themeSettings.borderOpacity || 25) / 100})`
                                        }}>
                                            <div style={{ 
                                                fontSize: '10px', 
                                                color: themeSettings.textMuted,
                                                marginBottom: '8px'
                                            }}>
                                                PREVIEW
                                            </div>
                                            <div style={{ 
                                                display: 'flex', 
                                                gap: '8px', 
                                                flexWrap: 'wrap',
                                                alignItems: 'center'
                                            }}>
                                                <div style={{ 
                                                    padding: '8px 12px',
                                                    background: themeSettings.surface,
                                                    color: themeSettings.text,
                                                    borderRadius: '4px',
                                                    fontSize: '12px'
                                                }}>
                                                    Surface
                                                </div>
                                                <div style={{ 
                                                    padding: '8px 12px',
                                                    background: themeSettings.surfaceLight,
                                                    color: themeSettings.text,
                                                    borderRadius: '4px',
                                                    fontSize: '12px'
                                                }}>
                                                    Elevated
                                                </div>
                                                <span style={{ color: themeSettings.primary }}>Primary</span>
                                                <span style={{ color: themeSettings.success }}>Success</span>
                                                <span style={{ color: themeSettings.warning }}>Warning</span>
                                                <span style={{ color: themeSettings.error }}>Error</span>
                                            </div>
                                        </div>
                                        
                                        {/* Theme action buttons */}
                                        <div style={{ 
                                            display: 'flex', 
                                            gap: '10px', 
                                            marginTop: '12px',
                                            justifyContent: 'flex-end'
                                        }}>
                                            <button
                                                className="settings-btn-small"
                                                onClick={handleResetTheme}
                                                style={{ 
                                                    background: 'rgba(199, 95, 95, 0.15)',
                                                    borderColor: 'rgba(199, 95, 95, 0.5)',
                                                    color: '#c75f5f'
                                                }}
                                            >
                                                Reset to Defaults
                                            </button>
                                            <button
                                                className="settings-btn-small"
                                                onClick={handleApplyTheme}
                                                style={{ 
                                                    background: 'rgba(95, 170, 125, 0.15)',
                                                    borderColor: 'rgba(95, 170, 125, 0.5)',
                                                    color: '#5faa7d'
                                                }}
                                            >
                                                💾 Save Theme
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                            
                            {/* Category Accent Colors */}
                            <div className="settings-category">
                                <div 
                                    className="settings-category-header"
                                    onClick={() => toggleCategory('CategoryColors')}
                                >
                                    <span>
                                        {expandedCategories['CategoryColors'] ? '▼' : '▶'} 
                                        🏷️ Category Accent Colors
                                    </span>
                                    {categoryChanged && (
                                        <span style={{ fontSize: '10px', color: '#d4a054' }}>• unsaved</span>
                                    )}
                                </div>
                                
                                {expandedCategories['CategoryColors'] && (
                                    <div className="settings-category-content">
                                        <div className="settings-info" style={{ 
                                            fontSize: '11px', 
                                            color: '#8a959e', 
                                            marginBottom: '12px',
                                            padding: '8px',
                                            background: 'rgba(95, 179, 179, 0.1)',
                                            borderRadius: '4px'
                                        }}>
                                            💡 Set accent (border/header) and background colors for each node category.
                                        </div>
                                        
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                            {Object.entries(categoryThemes).map(([category, theme]) => (
                                                <div key={category} style={{ 
                                                    display: 'flex', 
                                                    alignItems: 'center', 
                                                    gap: '6px',
                                                    padding: '6px 8px',
                                                    background: theme.background || '#0a0f14',
                                                    borderRadius: '4px',
                                                    border: `1px solid ${theme.accent}55`
                                                }}>
                                                    {/* Accent color picker */}
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                                                        <input
                                                            type="color"
                                                            value={theme.accent}
                                                            onChange={e => handleCategoryChange(category, 'accent', e.target.value)}
                                                            title="Accent color (borders, headers)"
                                                            style={{ 
                                                                width: '24px', 
                                                                height: '24px', 
                                                                border: 'none',
                                                                borderRadius: '4px',
                                                                cursor: 'pointer',
                                                                background: 'transparent'
                                                            }}
                                                        />
                                                        <span style={{ fontSize: '8px', color: '#666' }}>Accent</span>
                                                    </div>
                                                    {/* Background color picker */}
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                                                        <input
                                                            type="color"
                                                            value={theme.background || '#0a0f14'}
                                                            onChange={e => handleCategoryChange(category, 'background', e.target.value)}
                                                            title="Background color"
                                                            style={{ 
                                                                width: '24px', 
                                                                height: '24px', 
                                                                border: '1px solid #333',
                                                                borderRadius: '4px',
                                                                cursor: 'pointer',
                                                                background: 'transparent'
                                                            }}
                                                        />
                                                        <span style={{ fontSize: '8px', color: '#666' }}>BG</span>
                                                    </div>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ 
                                                            fontSize: '11px', 
                                                            color: theme.accent,
                                                            fontWeight: '600',
                                                            whiteSpace: 'nowrap',
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis'
                                                        }}>
                                                            {theme.icon} {category}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        
                                        {/* Category action buttons */}
                                        <div style={{ 
                                            display: 'flex', 
                                            gap: '10px', 
                                            marginTop: '12px',
                                            justifyContent: 'flex-end'
                                        }}>
                                            <button
                                                className="settings-btn-small"
                                                onClick={handleResetCategories}
                                                style={{ 
                                                    background: 'rgba(199, 95, 95, 0.15)',
                                                    borderColor: 'rgba(199, 95, 95, 0.5)',
                                                    color: '#c75f5f'
                                                }}
                                            >
                                                Reset to Defaults
                                            </button>
                                            <button
                                                className="settings-btn-small"
                                                onClick={handleApplyCategories}
                                                style={{ 
                                                    background: 'rgba(95, 170, 125, 0.15)',
                                                    borderColor: 'rgba(95, 170, 125, 0.5)',
                                                    color: '#5faa7d'
                                                }}
                                            >
                                                💾 Save Category Colors
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                            
                            {/* Socket Colors */}
                            <div className="settings-category">
                                <div 
                                    className="settings-category-header"
                                    onClick={() => toggleCategory('SocketColors')}
                                >
                                    <span>
                                        {expandedCategories['SocketColors'] ? '▼' : '▶'} 
                                        🔌 Socket Colors
                                    </span>
                                    {socketColorsChanged && (
                                        <span style={{ fontSize: '10px', color: '#d4a054' }}>• unsaved</span>
                                    )}
                                </div>
                                
                                {expandedCategories['SocketColors'] && (
                                    <div className="settings-category-content">
                                        <div className="settings-info" style={{ 
                                            fontSize: '11px', 
                                            color: '#8a959e', 
                                            marginBottom: '12px',
                                            padding: '8px',
                                            background: 'rgba(95, 130, 179, 0.1)',
                                            borderRadius: '4px'
                                        }}>
                                            🔌 Customize socket connector colors by data type. These appear on all nodes.
                                        </div>
                                        
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                            {Object.entries(socketColors).map(([socketType, config]) => (
                                                <div key={socketType} style={{ 
                                                    display: 'flex', 
                                                    alignItems: 'center', 
                                                    gap: '8px',
                                                    padding: '8px 10px',
                                                    background: '#0a0f14',
                                                    borderRadius: '4px',
                                                    border: `1px solid ${config.color}55`
                                                }}>
                                                    <input
                                                        type="color"
                                                        value={config.color}
                                                        onChange={e => handleSocketColorChange(socketType, e.target.value)}
                                                        title={`${socketType} socket color`}
                                                        style={{ 
                                                            width: '28px', 
                                                            height: '28px', 
                                                            border: 'none',
                                                            borderRadius: '50%',
                                                            cursor: 'pointer',
                                                            background: 'transparent'
                                                        }}
                                                    />
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ 
                                                            fontSize: '12px', 
                                                            color: config.color,
                                                            fontWeight: '600'
                                                        }}>
                                                            {config.icon} {socketType}
                                                        </div>
                                                        <div style={{ 
                                                            fontSize: '9px', 
                                                            color: '#666',
                                                            marginTop: '2px'
                                                        }}>
                                                            {config.description}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        
                                        {/* Socket color action buttons */}
                                        <div style={{ 
                                            display: 'flex', 
                                            gap: '10px', 
                                            marginTop: '12px',
                                            justifyContent: 'flex-end'
                                        }}>
                                            <button
                                                className="settings-btn-small"
                                                onClick={handleResetSocketColors}
                                                style={{ 
                                                    background: 'rgba(199, 95, 95, 0.15)',
                                                    borderColor: 'rgba(199, 95, 95, 0.5)',
                                                    color: '#c75f5f'
                                                }}
                                            >
                                                Reset to Defaults
                                            </button>
                                            <button
                                                className="settings-btn-small"
                                                onClick={handleApplySocketColors}
                                                style={{ 
                                                    background: 'rgba(95, 170, 125, 0.15)',
                                                    borderColor: 'rgba(95, 170, 125, 0.5)',
                                                    color: '#5faa7d'
                                                }}
                                            >
                                                💾 Save Socket Colors
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {SETTINGS_CONFIG.map(category => (
                                <div key={category.category} className="settings-category">
                                    <div 
                                        className="settings-category-header"
                                        onClick={() => toggleCategory(category.category)}
                                    >
                                        <span>
                                            {expandedCategories[category.category] ? '▼' : '▶'} 
                                            {category.icon} {category.category}
                                        </span>
                                        {category.testable && expandedCategories[category.category] && (
                                            <button
                                                className={`settings-test-btn ${testResults[category.testable]?.success ? 'success' : testResults[category.testable]?.success === false ? 'error' : ''}`}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleTestConnection(category.testable);
                                                }}
                                                disabled={testing[category.testable]}
                                            >
                                                {testing[category.testable] ? '⏳ Testing...' : '🔌 Test Connection'}
                                            </button>
                                        )}
                                    </div>
                                    
                                    {expandedCategories[category.category] && (
                                        <div className="settings-category-content">
                                            {/* Show test result if available */}
                                            {testResults[category.testable] && (
                                                <div className={`settings-test-result ${testResults[category.testable].success ? 'success' : 'error'}`}>
                                                    {testResults[category.testable].success ? '✅' : '❌'} {testResults[category.testable].message}
                                                    {testResults[category.testable].details && (
                                                        <div className="settings-test-details">
                                                            {testResults[category.testable].details}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            
                                            {/* Special handling for Location category - City Search */}
                                            {category.category === 'Location' && (
                                                <div className="settings-location-search">
                                                    <p style={{ fontSize: '0.85rem', color: '#aaa', margin: '0 0 10px 0' }}>
                                                        📍 Enter your city name and click "Search" to auto-fill coordinates.
                                                    </p>
                                                    <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                                                        <input
                                                            type="text"
                                                            className="settings-input"
                                                            value={settings.LOCATION_CITY || ''}
                                                            onChange={e => handleChange('LOCATION_CITY', e.target.value)}
                                                            placeholder="e.g., Dallas, TX, USA"
                                                            style={{ flex: 1 }}
                                                            onKeyDown={e => { if (e.key === 'Enter') handleCitySearch(); }}
                                                        />
                                                        <button
                                                            className="settings-test-btn"
                                                            onClick={handleCitySearch}
                                                            disabled={searchingCity}
                                                            style={{ whiteSpace: 'nowrap' }}
                                                        >
                                                            {searchingCity ? '⏳ Searching...' : '🔍 Search City'}
                                                        </button>
                                                    </div>
                                                    {citySearchError && (
                                                        <div className="settings-test-result error" style={{ marginBottom: '10px' }}>
                                                            ❌ {citySearchError}
                                                        </div>
                                                    )}
                                                    {/* Show lat/lon/timezone as read-only or editable */}
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                                        <div className="settings-field">
                                                            <label className="settings-label">Latitude</label>
                                                            <input
                                                                type="text"
                                                                className="settings-input"
                                                                value={settings.LOCATION_LATITUDE || ''}
                                                                onChange={e => handleChange('LOCATION_LATITUDE', e.target.value)}
                                                                placeholder="32.7767"
                                                            />
                                                        </div>
                                                        <div className="settings-field">
                                                            <label className="settings-label">Longitude</label>
                                                            <input
                                                                type="text"
                                                                className="settings-input"
                                                                value={settings.LOCATION_LONGITUDE || ''}
                                                                onChange={e => handleChange('LOCATION_LONGITUDE', e.target.value)}
                                                                placeholder="-96.7970"
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="settings-field" style={{ marginTop: '10px' }}>
                                                        <label className="settings-label">Timezone</label>
                                                        <input
                                                            type="text"
                                                            className="settings-input"
                                                            value={settings.LOCATION_TIMEZONE || ''}
                                                            onChange={e => handleChange('LOCATION_TIMEZONE', e.target.value)}
                                                            placeholder="America/Chicago"
                                                        />
                                                        <span className="settings-key-hint">
                                                            Common: America/New_York, America/Chicago, America/Denver, America/Los_Angeles
                                                        </span>
                                                    </div>
                                                </div>
                                            )}
                                            
                                            {/* Regular settings fields (skip for Location since we have custom UI) */}
                                            {category.category !== 'Location' && category.settings.map(setting => (
                                                <div key={setting.key} className="settings-field">
                                                    <label className="settings-label">
                                                        {setting.label}
                                                        {setting.isSecret && (
                                                            <button 
                                                                className="settings-show-btn"
                                                                onClick={() => toggleShowSecret(setting.key)}
                                                                type="button"
                                                            >
                                                                {showSecrets[setting.key] ? '🙈 Hide' : '👁️ Show'}
                                                            </button>
                                                        )}
                                                    </label>
                                                    {setting.type === 'select' ? (
                                                        <select
                                                            className="settings-input"
                                                            value={settings[setting.key] || ''}
                                                            onChange={e => handleChange(setting.key, e.target.value)}
                                                        >
                                                            <option value="">Select...</option>
                                                            {setting.options.map(opt => (
                                                                <option key={opt} value={opt}>{opt}</option>
                                                            ))}
                                                        </select>
                                                    ) : (
                                                        <input
                                                            type={setting.isSecret && !showSecrets[setting.key] ? 'password' : 'text'}
                                                            className="settings-input"
                                                            value={settings[setting.key] || ''}
                                                            onChange={e => handleChange(setting.key, e.target.value)}
                                                            placeholder={setting.placeholder}
                                                        />
                                                    )}
                                                    <span className="settings-key-hint">{setting.key}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </>
                    )}
                </div>

                <div className="settings-footer">
                    <button className="settings-btn settings-btn-secondary" onClick={onClose}>
                        Cancel
                    </button>
                    <button 
                        className="settings-btn settings-btn-primary" 
                        onClick={handleSave}
                        disabled={saving || loading}
                    >
                        {saving ? 'Saving...' : '💾 Save Settings'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
