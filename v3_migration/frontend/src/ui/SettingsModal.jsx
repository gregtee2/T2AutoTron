import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import './SettingsModal.css';
import { DiscoveryPanel } from './DiscoveryPanel';
import { authFetch, clearStoredPin, getPinRememberPreference, getStoredPin, setStoredPin } from '../auth/authClient';

// =============================================================================
// THEME PRESETS - Full UI themes that apply instantly
// =============================================================================
const THEME_PRESETS = {
    tron: {
        name: 'Tron (Default)',
        description: 'Cyan neon on dark - the classic T2 look',
        colors: {
            primary: '#5fb3b3',
            background: '#1e2428',
            surface: '#2a3238',
            surfaceLight: '#343d44',
            text: '#c5cdd3',
            textMuted: '#8a959e',
            success: '#5faa7d',
            warning: '#d4a054',
            error: '#c75f5f',
            borderOpacity: 25
        }
    },
    midnight: {
        name: 'Midnight Purple',
        description: 'Deep purple with pink accents',
        colors: {
            primary: '#b388ff',
            background: '#1a1a2e',
            surface: '#25253a',
            surfaceLight: '#32324a',
            text: '#e0d6ff',
            textMuted: '#9990b8',
            success: '#69f0ae',
            warning: '#ffab40',
            error: '#ff5252',
            borderOpacity: 30
        }
    },
    forest: {
        name: 'Forest',
        description: 'Natural greens with earth tones',
        colors: {
            primary: '#81c784',
            background: '#1b2420',
            surface: '#263530',
            surfaceLight: '#324540',
            text: '#d5e8d4',
            textMuted: '#8aa888',
            success: '#4caf50',
            warning: '#ffb74d',
            error: '#e57373',
            borderOpacity: 25
        }
    },
    ember: {
        name: 'Ember',
        description: 'Warm orange and red firelight',
        colors: {
            primary: '#ff7043',
            background: '#1f1510',
            surface: '#2d2018',
            surfaceLight: '#3d2d22',
            text: '#ffe0cc',
            textMuted: '#b08060',
            success: '#aed581',
            warning: '#ffc107',
            error: '#ff5722',
            borderOpacity: 30
        }
    },
    arctic: {
        name: 'Arctic',
        description: 'Cool blues with icy highlights',
        colors: {
            primary: '#4fc3f7',
            background: '#0d1b2a',
            surface: '#1b2838',
            surfaceLight: '#283848',
            text: '#e3f2fd',
            textMuted: '#78a5c8',
            success: '#26a69a',
            warning: '#ffca28',
            error: '#ef5350',
            borderOpacity: 25
        }
    },
    monochrome: {
        name: 'Monochrome',
        description: 'Clean grayscale - easy on the eyes',
        colors: {
            primary: '#90a4ae',
            background: '#1a1a1a',
            surface: '#252525',
            surfaceLight: '#333333',
            text: '#e0e0e0',
            textMuted: '#888888',
            success: '#a5d6a7',
            warning: '#ffe082',
            error: '#ef9a9a',
            borderOpacity: 20
        }
    }
};

// Theme settings configuration (stored in localStorage, not server)
// Organized into categories for better UX
const THEME_SETTINGS_CATEGORIES = {
    'Core Colors': {
        icon: '🎨',
        settings: [
            { key: 'primary', label: 'Primary Accent', type: 'color', default: '#5fb3b3' },
            { key: 'background', label: 'Background', type: 'color', default: '#1e2428' },
            { key: 'surface', label: 'Surface', type: 'color', default: '#2a3238' },
            { key: 'surfaceLight', label: 'Elevated Surface', type: 'color', default: '#343d44' },
            { key: 'text', label: 'Text', type: 'color', default: '#c5cdd3' },
            { key: 'textMuted', label: 'Muted Text', type: 'color', default: '#8a959e' },
        ]
    },
    'Status Colors': {
        icon: '🚦',
        settings: [
            { key: 'success', label: 'Success', type: 'color', default: '#5faa7d' },
            { key: 'warning', label: 'Warning', type: 'color', default: '#d4a054' },
            { key: 'error', label: 'Error', type: 'color', default: '#c75f5f' },
        ]
    },
    'Socket Colors': {
        icon: '🔌',
        settings: [
            { key: 'socketBoolean', label: 'Boolean', type: 'color', default: '#10b981', cssVar: 'socket-boolean-color' },
            { key: 'socketNumber', label: 'Number', type: 'color', default: '#3b82f6', cssVar: 'socket-number-color' },
            { key: 'socketString', label: 'String', type: 'color', default: '#f59e0b', cssVar: 'socket-string-color' },
            { key: 'socketHsv', label: 'HSV/Color', type: 'color', default: '#8b5cf6', cssVar: 'socket-hsv-color' },
            { key: 'socketObject', label: 'Object', type: 'color', default: '#6366f1', cssVar: 'socket-object-color' },
            { key: 'socketLight', label: 'Light/Device', type: 'color', default: '#eab308', cssVar: 'socket-light-color' },
        ]
    },
    'Node Glow Colors': {
        icon: '✨',
        settings: [
            { key: 'nodeHa', label: 'Home Assistant', type: 'color', default: '#00d4ff', cssVar: 'node-ha-glow' },
            { key: 'nodeLogic', label: 'Logic', type: 'color', default: '#8b5cf6', cssVar: 'node-logic-glow' },
            { key: 'nodeTimer', label: 'Timer/Event', type: 'color', default: '#f59e0b', cssVar: 'node-timer-glow' },
            { key: 'nodeColor', label: 'Color', type: 'color', default: '#ec4899', cssVar: 'node-color-glow' },
            { key: 'nodeUtility', label: 'Utility', type: 'color', default: '#14b8a6', cssVar: 'node-utility-glow' },
            { key: 'nodeDevice', label: 'Direct Device', type: 'color', default: '#22c55e', cssVar: 'node-device-glow' },
        ]
    },
    'Editor': {
        icon: '📐',
        settings: [
            { key: 'borderOpacity', label: 'Border Opacity', type: 'range', min: 0, max: 100, default: 25 },
            { key: 'glowIntensity', label: 'Glow Intensity', type: 'range', min: 0, max: 100, default: 50 },
            { key: 'gridOpacity', label: 'Grid Opacity', type: 'range', min: 0, max: 100, default: 30 },
        ]
    }
};

// Flatten for backward compatibility
const THEME_SETTINGS = Object.values(THEME_SETTINGS_CATEGORIES).flatMap(cat => cat.settings);

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
        testable: 'ambient',
        settings: [
            { key: 'AMBIENT_API_KEY', label: 'Ambient Weather API Key', placeholder: 'Your API key', type: 'password', isSecret: true },
            { key: 'AMBIENT_APPLICATION_KEY', label: 'Application Key', placeholder: 'Your app key', type: 'password', isSecret: true },
            { key: 'AMBIENT_MAC_ADDRESS', label: 'Device MAC Address', placeholder: 'XX:XX:XX:XX:XX:XX', type: 'text' }
        ]
    },
    {
        category: 'Forecast Panel',
        icon: '📊',
        description: 'Configure HA sensors to display live weather data on the forecast panel (optional)',
        settings: [
            { key: 'FORECAST_TEMP_SENSOR', label: 'Temperature Sensor', placeholder: 'Select sensor...', type: 'sensor-select', hint: 'HA sensor for current temperature' },
            { key: 'FORECAST_WIND_SENSOR', label: 'Wind Speed Sensor', placeholder: 'Select sensor...', type: 'sensor-select', hint: 'HA sensor for wind speed' },
            { key: 'FORECAST_WIND_DIR_SENSOR', label: 'Wind Direction Sensor', placeholder: 'Select sensor...', type: 'sensor-select', hint: 'HA sensor for wind direction' },
            { key: 'FORECAST_RAIN_SENSOR', label: 'Rain Rate Sensor', placeholder: 'Select sensor...', type: 'sensor-select', hint: 'HA sensor for rain rate' }
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
        category: 'ElevenLabs TTS',
        icon: '🎙️',
        description: 'AI voice generation for TTS Announcement node',
        settings: [
            { key: 'ELEVENLABS_API_KEY', label: 'API Key', placeholder: 'Your ElevenLabs API key', type: 'password', isSecret: true, hint: 'Get one at elevenlabs.io' },
            { key: 'PUBLIC_URL', label: 'Public URL', placeholder: 'http://192.168.1.x:3000', type: 'text', hint: 'URL reachable by your speakers (for audio playback)' }
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

// Helper functions for socket color preview
const darkenColorPreview = (hex) => {
    try {
        const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - 40);
        const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - 40);
        const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - 40);
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    } catch { return hex; }
};

const lightenColorPreview = (hex) => {
    try {
        const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + 50);
        const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + 50);
        const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + 50);
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    } catch { return hex; }
};

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
    const [haSensors, setHaSensors] = useState([]); // HA sensors for forecast panel dropdown
    const [sensorsLoading, setSensorsLoading] = useState(false);
    const sensorsFetchedRef = useRef(false); // Track if we've fetched sensors
    const fileInputRef = useRef(null);

    // Local (client-side) PIN auth
    const [pinInput, setPinInput] = useState('');
    const [rememberPin, setRememberPin] = useState(() => getPinRememberPreference());
    const [hasStoredPin, setHasStoredPin] = useState(() => !!getStoredPin());
    const [showPin, setShowPin] = useState(false);
    
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
    
    // Active theme preset (detected from current settings or explicitly set)
    const [activePreset, setActivePreset] = useState(() => {
        try {
            return localStorage.getItem('t2theme-preset') || 'tron';
        } catch {
            return 'tron';
        }
    });
    
    // Custom user themes (stored in localStorage)
    const [customThemes, setCustomThemes] = useState(() => {
        try {
            const stored = localStorage.getItem('t2-custom-themes');
            return stored ? JSON.parse(stored) : {};
        } catch {
            return {};
        }
    });
    const [saveThemeModalOpen, setSaveThemeModalOpen] = useState(false);
    const [newThemeName, setNewThemeName] = useState('');
    
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
    
    // HA Add-on mode detection
    const [isAddon, setIsAddon] = useState(false);
    const [haConfigLoaded, setHaConfigLoaded] = useState(false);

    // Fetch current settings on mount
    useEffect(() => {
        if (isOpen) {
            fetchSettings();
            setExpandedCategories({ 'Security': true, 'Home Assistant': true });
            setTestResults({});
            setRememberPin(getPinRememberPreference());
            setHasStoredPin(!!getStoredPin());
            setPinInput('');
            
            // Pre-fetch HA sensors for the Forecast Panel dropdown
            if (!sensorsFetchedRef.current) {
                sensorsFetchedRef.current = true;
                
                // Fetch sensors via HTTP
                (async () => {
                    console.log('[SettingsModal] Fetching HA sensors via HTTP...');
                    setSensorsLoading(true);
                    
                    try {
                        const response = await authFetch('/api/lights/ha/');
                        console.log('[SettingsModal] Response status:', response.status);
                        
                        if (!response.ok) {
                            console.warn('[SettingsModal] Failed to fetch HA devices:', response.status);
                            setSensorsLoading(false);
                            return;
                        }
                        
                        const devices = await response.json();
                        console.log('[SettingsModal] HA devices received:', devices?.length);
                        
                        if (!devices || !Array.isArray(devices)) {
                            console.warn('[SettingsModal] No devices array received');
                            setSensorsLoading(false);
                            return;
                        }
                        
                        // Filter to only sensors
                        const sensors = devices
                            .filter(d => {
                                const id = d.id || d.entity_id || '';
                                return id.includes('sensor.');
                            })
                            .map(d => ({
                                id: (d.id || d.entity_id || '').replace('ha_', ''),
                                name: d.name || d.friendly_name || d.id || d.entity_id
                            }))
                            .sort((a, b) => a.name.localeCompare(b.name));
                        
                        console.log('[SettingsModal] Filtered sensors:', sensors.length);
                        setHaSensors(sensors);
                        setSensorsLoading(false);
                    } catch (err) {
                        console.warn('[SettingsModal] Error fetching HA sensors:', err);
                        setSensorsLoading(false);
                    }
                })();
            }
        } else {
            // Reset fetch flag when modal closes
            sensorsFetchedRef.current = false;
        }
    }, [isOpen]);
    
    // Fetch HA sensors via HTTP API (same approach as HADeviceFieldNode)
    const fetchHaSensorsViaHttp = async () => {
        console.log('[SettingsModal] Fetching HA sensors via HTTP...');
        setSensorsLoading(true);
        
        try {
            const response = await authFetch('/api/lights/ha/');
            if (!response.ok) {
                console.warn('[SettingsModal] Failed to fetch HA devices:', response.status);
                setSensorsLoading(false);
                return;
            }
            
            const devices = await response.json();
            console.log('[SettingsModal] HA devices received:', devices?.length);
            
            if (!devices || !Array.isArray(devices)) {
                console.warn('[SettingsModal] No devices array received');
                setSensorsLoading(false);
                return;
            }
            
            // Filter to only sensors
            const sensors = devices
                .filter(d => {
                    const id = d.id || d.entity_id || '';
                    return id.includes('sensor.');
                })
                .map(d => ({
                    id: (d.id || d.entity_id || '').replace('ha_', ''),
                    name: d.name || d.friendly_name || d.id || d.entity_id
                }))
                .sort((a, b) => a.name.localeCompare(b.name));
            
            console.log('[SettingsModal] Filtered sensors:', sensors.length);
            setHaSensors(sensors);
            setSensorsLoading(false);
        } catch (err) {
            console.warn('[SettingsModal] Error fetching HA sensors:', err);
            setSensorsLoading(false);
        }
    };

    const fetchSettings = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await authFetch('/api/settings');
            if (!response.ok) throw new Error('Failed to fetch settings');
            const data = await response.json();
            const loadedSettings = data.settings || {};
            setSettings(loadedSettings);
            
            // Try to fetch HA config for location auto-fill (works best in add-on mode)
            try {
                const configRes = await authFetch('/api/config');
                if (configRes.ok) {
                    const configData = await configRes.json();
                    if (configData.success) {
                        setIsAddon(configData.isAddon || false);
                        setHaConfigLoaded(true);
                        
                        // Auto-fill location fields if they're empty
                        const needsCity = !loadedSettings.LOCATION_CITY;
                        const needsLat = !loadedSettings.LOCATION_LATITUDE;
                        const needsLon = !loadedSettings.LOCATION_LONGITUDE;
                        const needsTz = !loadedSettings.LOCATION_TIMEZONE;
                        
                        if (needsCity || needsLat || needsLon || needsTz) {
                            setSettings(prev => ({
                                ...prev,
                                ...(needsCity && configData.locationName ? { LOCATION_CITY: configData.locationName } : {}),
                                ...(needsLat && configData.latitude ? { LOCATION_LATITUDE: String(configData.latitude) } : {}),
                                ...(needsLon && configData.longitude ? { LOCATION_LONGITUDE: String(configData.longitude) } : {}),
                                ...(needsTz && configData.timezone ? { LOCATION_TIMEZONE: configData.timezone } : {})
                            }));
                            console.log('[Settings] Auto-filled location from Home Assistant config');
                        }
                    }
                }
            } catch (configErr) {
                // HA config fetch failed - that's OK, user can enter manually
                console.log('[Settings] Could not fetch HA config for location auto-fill:', configErr.message);
            }
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
            const response = await authFetch('/api/settings', {
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
    
    // Helper function to apply a single theme setting to CSS variables
    const applyThemeCssVar = (key, value) => {
        const settingConfig = THEME_SETTINGS.find(s => s.key === key);
        const root = document.documentElement;
        
        if (key === 'borderOpacity') {
            root.style.setProperty('--node-border-opacity', value / 100);
        } else if (key === 'glowIntensity') {
            root.style.setProperty('--node-glow-intensity', value / 100);
        } else if (key === 'gridOpacity') {
            root.style.setProperty('--editor-grid-opacity', value / 100);
        } else if (settingConfig?.cssVar) {
            const cssVar = settingConfig.cssVar;
            root.style.setProperty(`--${cssVar}`, value);
            if (typeof value === 'string' && value.startsWith('#')) {
                const r = parseInt(value.slice(1, 3), 16);
                const g = parseInt(value.slice(3, 5), 16);
                const b = parseInt(value.slice(5, 7), 16);
                root.style.setProperty(`--${cssVar.replace('-color', '-rgb').replace('-glow', '-rgb')}`, `${r}, ${g}, ${b}`);
                const darkR = Math.max(0, r - 40);
                const darkG = Math.max(0, g - 40);
                const darkB = Math.max(0, b - 40);
                root.style.setProperty(`--${cssVar.replace('-color', '-dark').replace('-glow', '-dark')}`, `rgb(${darkR}, ${darkG}, ${darkB})`);
                const borderR = Math.min(255, r + 40);
                const borderG = Math.min(255, g + 40);
                const borderB = Math.min(255, b + 40);
                root.style.setProperty(`--${cssVar.replace('-color', '-border').replace('-glow', '-border')}`, `rgb(${borderR}, ${borderG}, ${borderB})`);
            }
        } else {
            root.style.setProperty(`--theme-${key}`, value);
            if (typeof value === 'string' && value.startsWith('#')) {
                const r = parseInt(value.slice(1, 3), 16);
                const g = parseInt(value.slice(3, 5), 16);
                const b = parseInt(value.slice(5, 7), 16);
                root.style.setProperty(`--theme-${key}-rgb`, `${r}, ${g}, ${b}`);
            }
        }
    };
    
    // Theme settings handlers - apply immediately to CSS variables
    const handleThemeChange = (key, value) => {
        setThemeSettings(prev => ({ ...prev, [key]: value }));
        setThemeChanged(true);
        setActivePreset('custom'); // User is customizing
        
        // Apply immediately using the shared helper
        applyThemeCssVar(key, value);
        
        // Save to localStorage for persistence
        const newSettings = { ...themeSettings, [key]: value };
        localStorage.setItem('t2theme-overrides', JSON.stringify(newSettings));
        localStorage.setItem('t2theme-preset', 'custom');
    };
    
    // Apply a theme preset instantly (no refresh needed)
    const applyThemePreset = (presetKey) => {
        const preset = THEME_PRESETS[presetKey];
        if (!preset) return;
        
        // Apply each color using the shared helper
        Object.entries(preset.colors).forEach(([key, value]) => {
            applyThemeCssVar(key, value);
        });
        
        // Update shared controls THEME if available
        if (window.T2Controls?.THEME) {
            Object.assign(window.T2Controls.THEME, preset.colors);
        }
        
        // Save to localStorage
        localStorage.setItem('t2theme-preset', presetKey);
        localStorage.setItem('t2theme-overrides', JSON.stringify(preset.colors));
        
        // Update state
        setThemeSettings(preset.colors);
        setActivePreset(presetKey);
        setThemeChanged(false);
        
        setSuccess(`Theme "${preset.name}" applied!`);
        setTimeout(() => setSuccess(null), 3000);
    };
    
    // Apply a custom user theme
    const applyCustomTheme = (themeKey) => {
        const theme = customThemes[themeKey];
        if (!theme) return;
        
        // Apply each color using the shared helper
        Object.entries(theme.colors).forEach(([key, value]) => {
            applyThemeCssVar(key, value);
        });
        
        if (window.T2Controls?.THEME) {
            Object.assign(window.T2Controls.THEME, theme.colors);
        }
        
        localStorage.setItem('t2theme-preset', `custom:${themeKey}`);
        localStorage.setItem('t2theme-overrides', JSON.stringify(theme.colors));
        
        setThemeSettings(theme.colors);
        setActivePreset(`custom:${themeKey}`);
        setThemeChanged(false);
        
        setSuccess(`Theme "${theme.name}" applied!`);
        setTimeout(() => setSuccess(null), 3000);
    };
    
    // Save current theme settings as a new custom theme
    const handleSaveCustomTheme = () => {
        if (!newThemeName.trim()) {
            setError('Please enter a theme name');
            return;
        }
        
        const themeKey = newThemeName.trim().toLowerCase().replace(/\s+/g, '-');
        
        // Check if name conflicts with built-in presets
        if (THEME_PRESETS[themeKey]) {
            setError('Cannot use a built-in theme name');
            return;
        }
        
        const newTheme = {
            name: newThemeName.trim(),
            colors: { ...themeSettings }
        };
        
        const updatedThemes = { ...customThemes, [themeKey]: newTheme };
        setCustomThemes(updatedThemes);
        
        try {
            localStorage.setItem('t2-custom-themes', JSON.stringify(updatedThemes));
            localStorage.setItem('t2theme-preset', `custom:${themeKey}`);
            setActivePreset(`custom:${themeKey}`);
            setSaveThemeModalOpen(false);
            setNewThemeName('');
            setThemeChanged(false);
            setSuccess(`Custom theme "${newThemeName.trim()}" saved!`);
            setTimeout(() => setSuccess(null), 3000);
        } catch (err) {
            setError('Failed to save custom theme: ' + err.message);
        }
    };
    
    // Delete a custom theme
    const handleDeleteCustomTheme = (themeKey, event) => {
        event.stopPropagation();
        const themeName = customThemes[themeKey]?.name || themeKey;
        
        if (!window.confirm(`Delete custom theme "${themeName}"?`)) return;
        
        const { [themeKey]: removed, ...remaining } = customThemes;
        setCustomThemes(remaining);
        
        try {
            localStorage.setItem('t2-custom-themes', JSON.stringify(remaining));
            
            // If the deleted theme was active, switch to Tron
            if (activePreset === `custom:${themeKey}`) {
                applyThemePreset('tron');
            }
            
            setSuccess(`Theme "${themeName}" deleted`);
            setTimeout(() => setSuccess(null), 3000);
        } catch (err) {
            setError('Failed to delete theme: ' + err.message);
        }
    };
    
    const handleApplyTheme = () => {
        try {
            localStorage.setItem('t2theme-overrides', JSON.stringify(themeSettings));
            localStorage.setItem('t2theme-preset', 'custom');
            setActivePreset('custom');
            setSuccess('Theme saved! Refresh the page to apply changes.');
            setThemeChanged(false);
            setTimeout(() => setSuccess(null), 5000);
        } catch (err) {
            setError('Failed to save theme: ' + err.message);
        }
    };
    
    const handleResetTheme = () => {
        // Reset to Tron (default) preset
        applyThemePreset('tron');
        localStorage.removeItem('t2theme-overrides');
        localStorage.removeItem('t2theme-preset');
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
        
        // Fetch HA sensors when Forecast Panel is expanded (if not already loaded)
        if (category === 'Forecast Panel' && !expandedCategories[category] && haSensors.length === 0) {
            fetchHaSensorsViaHttp();
        }
    };

    const toggleShowSecret = (key) => {
        setShowSecrets(prev => ({ ...prev, [key]: !prev[key] }));
    };

    // Test connection for a service
    const handleTestConnection = async (service) => {
        setTesting(prev => ({ ...prev, [service]: true }));
        setTestResults(prev => ({ ...prev, [service]: null }));
        
        try {
            const response = await authFetch('/api/settings/test', {
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
                                ⚠️ These settings are stored on the server (managed by this app). Keep the server secure.
                            </div>

                            {/* Security (PIN) Section */}
                            <div className="settings-category">
                                <div
                                    className="settings-category-header"
                                    onClick={() => toggleCategory('Security')}
                                    style={{ background: 'linear-gradient(135deg, rgba(0, 243, 255, 0.12), rgba(0, 150, 200, 0.08))' }}
                                >
                                    <span>
                                        {expandedCategories['Security'] ? '▼' : '▶'}
                                        🔒 Security (This Device)
                                    </span>
                                    {hasStoredPin && (
                                        <span style={{ fontSize: '10px', color: rememberPin ? '#00c896' : '#ffaa00' }}>
                                            ● {rememberPin ? 'REMEMBERED' : 'SESSION'}
                                        </span>
                                    )}
                                </div>

                                {expandedCategories['Security'] && (
                                    <div className="settings-category-content">
                                        <div className="settings-info" style={{
                                            fontSize: '11px',
                                            color: '#8a959e',
                                            marginBottom: '10px',
                                            padding: '8px',
                                            background: 'rgba(0, 243, 255, 0.06)',
                                            borderRadius: '4px'
                                        }}>
                                            Used to authorize protected actions (Settings tests, Updates) when accessing the server from another device.
                                        </div>

                                        <div className="settings-field">
                                            <label className="settings-label">
                                                App PIN
                                                <button
                                                    className="settings-show-btn"
                                                    onClick={() => setShowPin(v => !v)}
                                                    type="button"
                                                >
                                                    {showPin ? '🙈 Hide' : '👁️ Show'}
                                                </button>
                                            </label>
                                            <input
                                                type={showPin ? 'text' : 'password'}
                                                className="settings-input"
                                                value={pinInput}
                                                onChange={(e) => setPinInput(e.target.value)}
                                                placeholder={hasStoredPin ? 'Enter new PIN (leave blank to keep current)' : 'Enter PIN'}
                                                autoComplete="off"
                                            />
                                            <div style={{ display: 'flex', gap: '10px', marginTop: '10px', alignItems: 'center' }}>
                                                <label style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '12px', color: '#88ddff' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={rememberPin}
                                                        onChange={(e) => {
                                                            const next = e.target.checked;
                                                            setRememberPin(next);
                                                            const existing = getStoredPin();
                                                            if (existing) setStoredPin(existing, { remember: next });
                                                        }}
                                                    />
                                                    Remember PIN on this device
                                                </label>
                                                <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px' }}>
                                                    <button
                                                        className="settings-btn-small"
                                                        type="button"
                                                        onClick={() => {
                                                            const trimmed = pinInput.trim();
                                                            if (trimmed) {
                                                                setStoredPin(trimmed, { remember: rememberPin });
                                                                setHasStoredPin(true);
                                                                setPinInput('');
                                                                (async () => {
                                                                    try {
                                                                        const resp = await authFetch('/api/settings', {
                                                                            method: 'POST',
                                                                            headers: { 'Content-Type': 'application/json' },
                                                                            body: JSON.stringify({ settings: { APP_PIN: trimmed } })
                                                                        });
                                                                        if (!resp.ok) {
                                                                            const text = await resp.text();
                                                                            throw new Error(text || `HTTP ${resp.status}`);
                                                                        }
                                                                        setSuccess('PIN saved (server + this device).');
                                                                        setTimeout(() => setSuccess(null), 3000);
                                                                    } catch (e) {
                                                                        // Still useful: local PIN is saved for this device.
                                                                        setSuccess('PIN saved on this device. Server PIN update failed.');
                                                                        setTimeout(() => setSuccess(null), 4000);
                                                                    } finally {
                                                                        fetchSettings();
                                                                    }
                                                                })();
                                                            }
                                                        }}
                                                        style={{
                                                            background: 'rgba(0, 200, 150, 0.1)',
                                                            borderColor: 'rgba(0, 200, 150, 0.4)',
                                                            color: '#00c896'
                                                        }}
                                                        disabled={!pinInput.trim()}
                                                    >
                                                        💾 Save PIN
                                                    </button>
                                                    <button
                                                        className="settings-btn-small"
                                                        type="button"
                                                        onClick={() => {
                                                            clearStoredPin();
                                                            setHasStoredPin(false);
                                                            setPinInput('');
                                                            setRememberPin(false);
                                                            setSuccess('PIN cleared.');
                                                            setTimeout(() => setSuccess(null), 3000);
                                                        }}
                                                        style={{
                                                            background: 'rgba(199, 95, 95, 0.12)',
                                                            borderColor: 'rgba(199, 95, 95, 0.45)',
                                                            color: '#c75f5f'
                                                        }}
                                                        disabled={!hasStoredPin}
                                                    >
                                                        Clear
                                                    </button>
                                                </div>
                                            </div>
                                            <div style={{ marginTop: '8px', fontSize: '11px', color: '#666' }}>
                                                {hasStoredPin ? `PIN is saved (${rememberPin ? 'remembered' : 'this session'}).` : 'No PIN saved.'}
                                            </div>
                                        </div>
                                    </div>
                                )}
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

                            {/* Performance Mode Section */}
                            <div className="settings-category">
                                <div 
                                    className="settings-category-header"
                                    onClick={() => toggleCategory('Performance')}
                                    style={{ background: 'linear-gradient(135deg, rgba(255, 170, 0, 0.15), rgba(255, 100, 50, 0.1))' }}
                                >
                                    <span>
                                        {expandedCategories['Performance'] ? '▼' : '▶'} 
                                        ⚡ Performance Mode
                                    </span>
                                    {window.getPerformanceMode?.() && (
                                        <span style={{ fontSize: '10px', color: '#10b981' }}>● ACTIVE</span>
                                    )}
                                </div>
                                
                                {expandedCategories['Performance'] && (
                                    <div className="settings-category-content">
                                        <div className="settings-info" style={{ 
                                            fontSize: '11px', 
                                            color: '#ffaa00', 
                                            marginBottom: '12px',
                                            padding: '10px',
                                            background: 'rgba(255, 170, 0, 0.1)',
                                            borderRadius: '4px',
                                            border: '1px solid rgba(255, 170, 0, 0.2)'
                                        }}>
                                            ⚠️ <strong>Enable this if you experience lag or high GPU usage with many nodes.</strong>
                                            <br /><br />
                                            Performance Mode disables:
                                            <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
                                                <li>Backdrop blur effects on nodes (biggest impact)</li>
                                                <li>Complex glow shadows</li>
                                                <li>Infinite pulse/glow animations</li>
                                                <li>Transition effects on nodes</li>
                                            </ul>
                                        </div>
                                        
                                        <div style={{ 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            justifyContent: 'space-between',
                                            padding: '12px',
                                            background: 'rgba(0, 0, 0, 0.3)',
                                            borderRadius: '6px'
                                        }}>
                                            <div>
                                                <div style={{ color: '#e0e0e0', fontSize: '13px', fontWeight: '500' }}>
                                                    Performance Mode
                                                </div>
                                                <div style={{ color: '#888', fontSize: '11px', marginTop: '2px' }}>
                                                    Recommended for 40+ nodes
                                                </div>
                                            </div>
                                            <label style={{ 
                                                position: 'relative', 
                                                display: 'inline-block',
                                                width: '50px',
                                                height: '26px'
                                            }}>
                                                <input 
                                                    type="checkbox"
                                                    checked={window.getPerformanceMode?.() || false}
                                                    onChange={(e) => {
                                                        window.setPerformanceMode?.(e.target.checked);
                                                        // Force re-render
                                                        setExpandedCategories(prev => ({ ...prev }));
                                                    }}
                                                    style={{ opacity: 0, width: 0, height: 0 }}
                                                />
                                                <span style={{
                                                    position: 'absolute',
                                                    cursor: 'pointer',
                                                    top: 0, left: 0, right: 0, bottom: 0,
                                                    background: window.getPerformanceMode?.() ? '#10b981' : '#444',
                                                    transition: 'background 0.2s',
                                                    borderRadius: '26px'
                                                }}>
                                                    <span style={{
                                                        position: 'absolute',
                                                        content: '',
                                                        height: '20px',
                                                        width: '20px',
                                                        left: window.getPerformanceMode?.() ? '26px' : '3px',
                                                        bottom: '3px',
                                                        background: '#fff',
                                                        transition: 'left 0.2s',
                                                        borderRadius: '50%'
                                                    }} />
                                                </span>
                                            </label>
                                        </div>
                                        
                                        <div style={{ 
                                            marginTop: '12px', 
                                            fontSize: '10px', 
                                            color: '#666',
                                            textAlign: 'center'
                                        }}>
                                            Changes apply immediately. Look for ⚡ indicator in bottom-left when active.
                                        </div>
                                    </div>
                                )}
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
                                        {/* Theme Presets Dropdown */}
                                        <div style={{ 
                                            marginBottom: '16px',
                                            padding: '12px',
                                            background: 'rgba(95, 179, 179, 0.08)',
                                            borderRadius: '8px',
                                            border: '1px solid rgba(95, 179, 179, 0.2)'
                                        }}>
                                            <label className="settings-label" style={{ fontSize: '12px', marginBottom: '8px', display: 'block' }}>
                                                🎭 Built-in Themes
                                            </label>
                                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                                {Object.entries(THEME_PRESETS).map(([key, preset]) => (
                                                    <button
                                                        key={key}
                                                        onClick={() => applyThemePreset(key)}
                                                        style={{
                                                            padding: '8px 14px',
                                                            borderRadius: '6px',
                                                            border: activePreset === key 
                                                                ? `2px solid ${preset.colors.primary}` 
                                                                : '1px solid rgba(255,255,255,0.2)',
                                                            background: activePreset === key 
                                                                ? `linear-gradient(135deg, ${preset.colors.surface}, ${preset.colors.background})`
                                                                : preset.colors.surface,
                                                            color: preset.colors.text,
                                                            cursor: 'pointer',
                                                            transition: 'all 0.2s',
                                                            fontSize: '11px',
                                                            fontWeight: activePreset === key ? '600' : '400',
                                                            boxShadow: activePreset === key 
                                                                ? `0 0 12px ${preset.colors.primary}40`
                                                                : 'none'
                                                        }}
                                                        title={preset.description}
                                                    >
                                                        <span style={{ 
                                                            display: 'inline-block',
                                                            width: '10px',
                                                            height: '10px',
                                                            borderRadius: '50%',
                                                            background: preset.colors.primary,
                                                            marginRight: '6px',
                                                            boxShadow: `0 0 6px ${preset.colors.primary}`
                                                        }} />
                                                        {preset.name}
                                                    </button>
                                                ))}
                                            </div>
                                            
                                            {/* Custom User Themes Section */}
                                            {Object.keys(customThemes).length > 0 && (
                                                <>
                                                    <label className="settings-label" style={{ fontSize: '12px', marginTop: '16px', marginBottom: '8px', display: 'block' }}>
                                                        💾 Your Saved Themes
                                                    </label>
                                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                                        {Object.entries(customThemes).map(([key, theme]) => (
                                                            <button
                                                                key={key}
                                                                onClick={() => applyCustomTheme(key)}
                                                                style={{
                                                                    padding: '8px 14px',
                                                                    borderRadius: '6px',
                                                                    border: activePreset === `custom:${key}`
                                                                        ? `2px solid ${theme.colors.primary}` 
                                                                        : '1px solid rgba(255,255,255,0.2)',
                                                                    background: activePreset === `custom:${key}`
                                                                        ? `linear-gradient(135deg, ${theme.colors.surface}, ${theme.colors.background})`
                                                                        : theme.colors.surface,
                                                                    color: theme.colors.text,
                                                                    cursor: 'pointer',
                                                                    transition: 'all 0.2s',
                                                                    fontSize: '11px',
                                                                    fontWeight: activePreset === `custom:${key}` ? '600' : '400',
                                                                    boxShadow: activePreset === `custom:${key}`
                                                                        ? `0 0 12px ${theme.colors.primary}40`
                                                                        : 'none',
                                                                    position: 'relative',
                                                                    paddingRight: '28px'
                                                                }}
                                                                title={`Custom theme: ${theme.name}`}
                                                            >
                                                                <span style={{ 
                                                                    display: 'inline-block',
                                                                    width: '10px',
                                                                    height: '10px',
                                                                    borderRadius: '50%',
                                                                    background: theme.colors.primary,
                                                                    marginRight: '6px',
                                                                    boxShadow: `0 0 6px ${theme.colors.primary}`
                                                                }} />
                                                                {theme.name}
                                                                <span 
                                                                    onClick={(e) => handleDeleteCustomTheme(key, e)}
                                                                    style={{
                                                                        position: 'absolute',
                                                                        right: '6px',
                                                                        top: '50%',
                                                                        transform: 'translateY(-50%)',
                                                                        fontSize: '12px',
                                                                        opacity: 0.6,
                                                                        cursor: 'pointer'
                                                                    }}
                                                                    title="Delete this theme"
                                                                >
                                                                    ✕
                                                                </span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </>
                                            )}
                                            
                                            <div style={{ 
                                                marginTop: '8px', 
                                                fontSize: '10px', 
                                                color: '#8a959e',
                                                fontStyle: 'italic'
                                            }}>
                                                {activePreset.startsWith('custom:') && customThemes[activePreset.replace('custom:', '')]
                                                    ? `Custom theme: ${customThemes[activePreset.replace('custom:', '')].name}`
                                                    : activePreset !== 'custom' && THEME_PRESETS[activePreset] 
                                                        ? THEME_PRESETS[activePreset].description 
                                                        : 'Custom theme - you\'ve modified individual colors'}
                                            </div>
                                        </div>
                                        
                                        <div className="settings-info" style={{ 
                                            fontSize: '11px', 
                                            color: '#8a959e', 
                                            marginBottom: '12px',
                                            padding: '8px',
                                            background: 'rgba(95, 179, 179, 0.1)',
                                            borderRadius: '4px'
                                        }}>
                                            💡 Click a preset to apply instantly, or customize individual colors below.
                                        </div>
                                        
                                        {/* Categorized theme settings */}
                                        {Object.entries(THEME_SETTINGS_CATEGORIES).map(([categoryName, category]) => (
                                            <div key={categoryName} style={{ marginBottom: '16px' }}>
                                                <div style={{ 
                                                    fontSize: '11px', 
                                                    fontWeight: '600', 
                                                    color: themeSettings.primary || '#5fb3b3',
                                                    marginBottom: '8px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '6px'
                                                }}>
                                                    <span>{category.icon}</span>
                                                    <span>{categoryName}</span>
                                                </div>
                                                <div style={{ 
                                                    display: 'grid', 
                                                    gridTemplateColumns: 'repeat(3, 1fr)', 
                                                    gap: '8px',
                                                    padding: '8px',
                                                    background: 'rgba(0,0,0,0.2)',
                                                    borderRadius: '6px'
                                                }}>
                                                    {category.settings.map(setting => (
                                                        <div key={setting.key} className="settings-field" style={{ marginBottom: '4px' }}>
                                                            <label className="settings-label" style={{ fontSize: '9px', marginBottom: '4px' }}>
                                                                {setting.label}
                                                            </label>
                                                            {setting.type === 'color' ? (
                                                                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                                                    <input
                                                                        type="color"
                                                                        value={themeSettings[setting.key] || setting.default}
                                                                        onChange={e => handleThemeChange(setting.key, e.target.value)}
                                                                        style={{ 
                                                                            width: '32px', 
                                                                            height: '24px', 
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
                                                                        style={{ flex: 1, fontFamily: 'monospace', fontSize: '9px', padding: '4px' }}
                                                                    />
                                                                </div>
                                                            ) : setting.type === 'range' ? (
                                                                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                                                    <input
                                                                        type="range"
                                                                        min={setting.min}
                                                                        max={setting.max}
                                                                        value={themeSettings[setting.key] ?? setting.default}
                                                                        onChange={e => handleThemeChange(setting.key, parseInt(e.target.value))}
                                                                        style={{ flex: 1 }}
                                                                    />
                                                                    <span style={{ 
                                                                        minWidth: '28px', 
                                                                        textAlign: 'right',
                                                                        color: '#c5cdd3',
                                                                        fontSize: '10px'
                                                                    }}>
                                                                        {themeSettings[setting.key] ?? setting.default}%
                                                                    </span>
                                                                </div>
                                                            ) : null}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                        
                                        {/* Preview swatch */}
                                        <div style={{ 
                                            marginTop: '16px', 
                                            padding: '12px', 
                                            background: themeSettings.background || '#1e2428',
                                            borderRadius: '8px',
                                            border: `1px solid rgba(95, 179, 179, ${(themeSettings.borderOpacity || 25) / 100})`
                                        }}>
                                            <div style={{ 
                                                fontSize: '10px', 
                                                color: themeSettings.textMuted || '#8a959e',
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
                                                onClick={() => setSaveThemeModalOpen(true)}
                                                style={{ 
                                                    background: 'rgba(95, 140, 220, 0.15)',
                                                    borderColor: 'rgba(95, 140, 220, 0.5)',
                                                    color: '#5f8adc'
                                                }}
                                                title="Save current colors as a named custom theme"
                                            >
                                                ⭐ Save as Custom Theme
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
                                                💾 Apply Changes
                                            </button>
                                        </div>
                                        
                                        {/* Save Custom Theme Modal */}
                                        {saveThemeModalOpen && (
                                            <div style={{
                                                position: 'fixed',
                                                top: 0,
                                                left: 0,
                                                right: 0,
                                                bottom: 0,
                                                background: 'rgba(0,0,0,0.7)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                zIndex: 10000
                                            }}>
                                                <div style={{
                                                    background: 'var(--theme-surface, #2a3238)',
                                                    padding: '24px',
                                                    borderRadius: '12px',
                                                    border: '1px solid rgba(95, 179, 179, 0.3)',
                                                    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                                                    minWidth: '300px'
                                                }}>
                                                    <h3 style={{ 
                                                        margin: '0 0 16px 0', 
                                                        color: 'var(--theme-text, #c5cdd3)',
                                                        fontSize: '16px'
                                                    }}>
                                                        ⭐ Save Custom Theme
                                                    </h3>
                                                    <p style={{ 
                                                        margin: '0 0 16px 0', 
                                                        color: 'var(--theme-textMuted, #8a959e)',
                                                        fontSize: '12px'
                                                    }}>
                                                        Give your theme a name to save it for later use.
                                                    </p>
                                                    <input
                                                        type="text"
                                                        value={newThemeName}
                                                        onChange={(e) => setNewThemeName(e.target.value)}
                                                        placeholder="My Awesome Theme"
                                                        style={{
                                                            width: '100%',
                                                            padding: '10px 12px',
                                                            borderRadius: '6px',
                                                            border: '1px solid rgba(95, 179, 179, 0.3)',
                                                            background: 'var(--theme-background, #1e2428)',
                                                            color: 'var(--theme-text, #c5cdd3)',
                                                            fontSize: '14px',
                                                            marginBottom: '16px',
                                                            boxSizing: 'border-box'
                                                        }}
                                                        autoFocus
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') handleSaveCustomTheme();
                                                            if (e.key === 'Escape') {
                                                                setSaveThemeModalOpen(false);
                                                                setNewThemeName('');
                                                            }
                                                        }}
                                                    />
                                                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                                                        <button
                                                            onClick={() => {
                                                                setSaveThemeModalOpen(false);
                                                                setNewThemeName('');
                                                            }}
                                                            style={{
                                                                padding: '8px 16px',
                                                                borderRadius: '6px',
                                                                border: '1px solid rgba(255,255,255,0.2)',
                                                                background: 'transparent',
                                                                color: 'var(--theme-text, #c5cdd3)',
                                                                cursor: 'pointer',
                                                                fontSize: '12px'
                                                            }}
                                                        >
                                                            Cancel
                                                        </button>
                                                        <button
                                                            onClick={handleSaveCustomTheme}
                                                            style={{
                                                                padding: '8px 16px',
                                                                borderRadius: '6px',
                                                                border: '1px solid rgba(95, 179, 179, 0.5)',
                                                                background: 'rgba(95, 179, 179, 0.2)',
                                                                color: '#5fb3b3',
                                                                cursor: 'pointer',
                                                                fontSize: '12px',
                                                                fontWeight: '600'
                                                            }}
                                                        >
                                                            💾 Save Theme
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
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
                                        
                                        {/* Live Preview Node */}
                                        <div style={{
                                            background: 'linear-gradient(145deg, #1e2428, #2a3238)',
                                            border: '1px solid rgba(95, 179, 179, 0.3)',
                                            borderRadius: '8px',
                                            padding: '12px',
                                            marginBottom: '16px',
                                            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)'
                                        }}>
                                            <div style={{
                                                fontSize: '11px',
                                                color: '#5fb3b3',
                                                marginBottom: '10px',
                                                fontWeight: '600',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px'
                                            }}>
                                                <span>📦</span> Preview Node
                                            </div>
                                            
                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                {/* Inputs side */}
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                    {Object.entries(socketColors).slice(0, 3).map(([type, config]) => (
                                                        <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <div style={{
                                                                width: '14px',
                                                                height: '14px',
                                                                borderRadius: '50%',
                                                                background: `linear-gradient(145deg, ${config.color}, ${darkenColorPreview(config.color)})`,
                                                                border: `2px solid ${lightenColorPreview(config.color)}`,
                                                                boxShadow: `0 0 8px ${config.color}80`
                                                            }} />
                                                            <span style={{ fontSize: '10px', color: '#8a959e' }}>{type}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                                
                                                {/* Outputs side */}
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
                                                    {Object.entries(socketColors).slice(3).map(([type, config]) => (
                                                        <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <span style={{ fontSize: '10px', color: '#8a959e' }}>{type}</span>
                                                            <div style={{
                                                                width: '14px',
                                                                height: '14px',
                                                                borderRadius: '50%',
                                                                background: `linear-gradient(145deg, ${config.color}, ${darkenColorPreview(config.color)})`,
                                                                border: `2px solid ${lightenColorPreview(config.color)}`,
                                                                boxShadow: `0 0 8px ${config.color}80`
                                                            }} />
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
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
                                                    {/* Show auto-filled notice for add-on users */}
                                                    {haConfigLoaded && isAddon && (
                                                        <div style={{ 
                                                            background: 'rgba(76, 175, 80, 0.15)', 
                                                            border: '1px solid rgba(76, 175, 80, 0.4)',
                                                            borderRadius: '6px',
                                                            padding: '8px 12px',
                                                            marginBottom: '12px',
                                                            fontSize: '0.85rem',
                                                            color: '#81c784'
                                                        }}>
                                                            ✅ Location auto-filled from Home Assistant configuration
                                                        </div>
                                                    )}
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
                                                    ) : setting.type === 'sensor-select' ? (
                                                        <select
                                                            className="settings-input"
                                                            value={settings[setting.key] || ''}
                                                            onChange={e => handleChange(setting.key, e.target.value)}
                                                            disabled={sensorsLoading}
                                                        >
                                                            <option value="">{sensorsLoading ? 'Loading sensors...' : 'None (disabled)'}</option>
                                                            {haSensors.map(sensor => (
                                                                <option key={sensor.id} value={sensor.id}>{sensor.name}</option>
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
