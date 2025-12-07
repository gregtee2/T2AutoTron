import React, { useState, useEffect, useRef } from 'react';
import './SettingsModal.css';

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

    return (
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
                                            
                                            {category.settings.map(setting => (
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
        </div>
    );
}
