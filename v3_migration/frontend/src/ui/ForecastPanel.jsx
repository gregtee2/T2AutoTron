import React, { useState, useEffect, useRef } from 'react';
import { socket } from '../socket';
import { apiUrl } from '../utils/apiBase';
import { authFetch } from '../auth/authClient';
import './ForecastPanel.css';

export function ForecastPanel({ dockSlotRef }) {
    const [expanded, setExpanded] = useState(true);
    const [devicesExpanded, setDevicesExpanded] = useState(true);
    const [forecastData, setForecastData] = useState(null);
    const [selectedDay, setSelectedDay] = useState(null);
    const [isConnected, setIsConnected] = useState(socket?.connected ?? false);
    const [haStatus, setHaStatus] = useState({ connected: false, wsConnected: false, deviceCount: 0 });
    const [activeDevices, setActiveDevices] = useState(new Map());
    const [panelWidth, setPanelWidth] = useState(() => parseInt(localStorage.getItem('forecastPanelWidth')) || 320);
    const [devicesHeight, setDevicesHeight] = useState(() => parseInt(localStorage.getItem('devicesOnHeight')) || 200);
    const [stationData, setStationData] = useState(null); // Live weather station data
    const [sensorConfig, setSensorConfig] = useState(null); // Configured HA sensors for forecast
    const [hourlyRainData, setHourlyRainData] = useState(null); // Hourly rain forecast for selected day
    const [loadingRain, setLoadingRain] = useState(false);
    const resizeRef = useRef(null);

    // Fetch sensor config from settings on mount
    useEffect(() => {
        const fetchSensorConfig = async () => {
            try {
                const res = await authFetch(apiUrl('/api/settings'));
                if (res.ok) {
                    const data = await res.json();
                    const config = {
                        tempSensor: data.FORECAST_TEMP_SENSOR || null,
                        windSensor: data.FORECAST_WIND_SENSOR || null,
                        windDirSensor: data.FORECAST_WIND_DIR_SENSOR || null,
                        rainSensor: data.FORECAST_RAIN_SENSOR || null
                    };
                    // Only set if at least one sensor is configured
                    if (config.tempSensor || config.windSensor || config.windDirSensor || config.rainSensor) {
                        setSensorConfig(config);
                        // Fetch initial values for configured sensors
                        fetchSensorValues(config);
                    }
                }
            } catch (err) {
                console.warn('Could not fetch forecast sensor config:', err);
            }
        };
        fetchSensorConfig();
    }, []);

    // Fetch current values from configured HA sensors
    const fetchSensorValues = async (config) => {
        if (!config) return;
        
        const newData = { source: 'ha-sensors' };
        
        try {
            if (config.tempSensor) {
                const res = await authFetch(apiUrl(`/api/lights/ha/${config.tempSensor}/state`));
                if (res.ok) {
                    const data = await res.json();
                    newData.temp = parseFloat(data.state);
                }
            }
            if (config.windSensor) {
                const res = await authFetch(apiUrl(`/api/lights/ha/${config.windSensor}/state`));
                if (res.ok) {
                    const data = await res.json();
                    newData.windSpeed = parseFloat(data.state);
                }
            }
            if (config.windDirSensor) {
                const res = await authFetch(apiUrl(`/api/lights/ha/${config.windDirSensor}/state`));
                if (res.ok) {
                    const data = await res.json();
                    newData.windDir = parseFloat(data.state);
                }
            }
            if (config.rainSensor) {
                const res = await authFetch(apiUrl(`/api/lights/ha/${config.rainSensor}/state`));
                if (res.ok) {
                    const data = await res.json();
                    newData.rainRate = parseFloat(data.state);
                }
            }
            
            if (newData.temp !== undefined) {
                setStationData(prev => ({ ...prev, ...newData }));
            }
        } catch (err) {
            console.warn('Error fetching sensor values:', err);
        }
    };

    useEffect(() => {
        if (!socket) return;

        const onConnect = () => {
            setIsConnected(true);
            socket.emit('request-ha-status');
        };
        const onDisconnect = () => {
            setIsConnected(false);
            setHaStatus({ connected: false, wsConnected: false, deviceCount: 0 });
        };
        const onHaStatus = (data) => {
            setHaStatus(data);
        };

        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);
        socket.on('ha-connection-status', onHaStatus);
        socket.on('forecast-update', (data) => {
            // Debug: console.log('Forecast received:', data);
            setForecastData(data);
        });
        
        // Listen for live weather station data (Ambient Weather or Open-Meteo) - fallback if no HA sensors configured
        const onWeatherUpdate = (data) => {
            // Skip if we're using HA sensors (check current state, not just config)
            setStationData(prev => {
                // If already using HA sensors, don't overwrite with weather-update
                if (prev?.source === 'ha-sensors') return prev;
                // Also skip if we have sensor config (it will load shortly)
                if (sensorConfig?.tempSensor) return prev;
                
                return {
                    temp: data.tempf,
                    humidity: data.humidity,
                    windSpeed: data.windspeedmph,
                    windDir: data.winddir,
                    rainRate: data.hourlyrainin,
                    dailyRain: data.dailyrainin,
                    source: data._source || 'ambient'
                };
            });
        };
        socket.on('weather-update', onWeatherUpdate);
        if (!sensorConfig?.tempSensor) {
            socket.emit('request-weather-update'); // Only request if not using HA sensors
        }
        
        // Listen for device state updates to track active devices AND configured weather sensors
        const onDeviceStateUpdate = (data) => {
            const { id, state, on, name } = data;
            if (!id) return;
            
            // Check if this is one of our configured weather sensors
            if (sensorConfig) {
                const entityId = id.replace('ha_', '');
                if (entityId === sensorConfig.tempSensor) {
                    const value = parseFloat(state);
                    if (!isNaN(value)) {
                        setStationData(prev => ({ ...prev, temp: value, source: 'ha-sensors' }));
                    }
                } else if (entityId === sensorConfig.windSensor) {
                    const value = parseFloat(state);
                    if (!isNaN(value)) {
                        setStationData(prev => ({ ...prev, windSpeed: value }));
                    }
                } else if (entityId === sensorConfig.windDirSensor) {
                    const value = parseFloat(state);
                    if (!isNaN(value)) {
                        setStationData(prev => ({ ...prev, windDir: value }));
                    }
                } else if (entityId === sensorConfig.rainSensor) {
                    const value = parseFloat(state);
                    if (!isNaN(value)) {
                        setStationData(prev => ({ ...prev, rainRate: value }));
                    }
                }
            }
            
            const currentOn = on !== undefined ? on : (state === 'on' || state === 'playing' || state === 'open');
            const deviceName = name || data.friendly_name || data.attributes?.friendly_name || 
                id.replace('ha_', '').replace('kasa_', '').replace(/\./g, ' ').replace(/_/g, ' ');
            
            // Only track lights and switches (not sensors)
            const isControllable = id.includes('light.') || id.includes('switch.') || id.startsWith('kasa_');
            if (!isControllable) return;
            
            setActiveDevices(prev => {
                const next = new Map(prev);
                if (currentOn) {
                    next.set(id, { name: deviceName, on: true });
                } else {
                    next.delete(id);
                }
                return next;
            });
        };
        socket.on('device-state-update', onDeviceStateUpdate);

        socket.emit('request-forecast');
        if (socket.connected) {
            setIsConnected(true);
            socket.emit('request-ha-status');
        }

        return () => {
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
            socket.off('ha-connection-status', onHaStatus);
            socket.off('forecast-update');
            socket.off('weather-update', onWeatherUpdate);
            socket.off('device-state-update', onDeviceStateUpdate);
        };
    }, [sensorConfig]); // Re-run when sensor config loads

    // Fetch hourly rain data when a day is selected
    useEffect(() => {
        if (!socket || selectedDay === null) {
            setHourlyRainData(null);
            return;
        }
        
        setLoadingRain(true);
        
        const onHourlyRainUpdate = (data) => {
            setLoadingRain(false);
            if (data.error) {
                console.warn('Hourly rain fetch error:', data.error);
                setHourlyRainData(null);
            } else {
                setHourlyRainData(data);
            }
        };
        
        socket.on('hourly-rain-update', onHourlyRainUpdate);
        socket.emit('request-hourly-rain', { dayOffset: selectedDay });
        
        return () => {
            socket.off('hourly-rain-update', onHourlyRainUpdate);
        };
    }, [selectedDay]);

    const refreshForecast = () => {
        socket?.emit('request-forecast');
        if (sensorConfig?.tempSensor) {
            fetchSensorValues(sensorConfig);
        } else {
            socket?.emit('request-weather-update');
        }
    };

    // Convert wind direction degrees to cardinal direction
    const getCardinalDirection = (degrees) => {
        if (degrees == null) return '';
        const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
        const index = Math.round(degrees / 22.5) % 16;
        return directions[index];
    };

    const getWeatherIcon = (condition) => {
        const lowerCondition = (condition || '').toLowerCase();
        
        // Clear/Sunny - golden sun with rays
        if (lowerCondition.includes('clear') || lowerCondition.includes('sun')) {
            return (
                <svg viewBox="0 0 24 24" fill="none" stroke="#FFD700" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="5"></circle>
                    <line x1="12" y1="1" x2="12" y2="3"></line>
                    <line x1="12" y1="21" x2="12" y2="23"></line>
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                    <line x1="1" y1="12" x2="3" y2="12"></line>
                    <line x1="21" y1="12" x2="23" y2="12"></line>
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                </svg>
            );
        }
        
        // Rain/Showers - cloud with rain drops
        if (lowerCondition.includes('rain') || lowerCondition.includes('drizzle') || lowerCondition.includes('shower')) {
            return (
                <svg viewBox="0 0 24 24" fill="none" stroke="#4facfe" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 16.2A4.5 4.5 0 0 0 17.5 8h-1.8A7 7 0 1 0 4 14.9"></path>
                    <line x1="8" y1="19" x2="8" y2="21"></line>
                    <line x1="8" y1="13" x2="8" y2="15"></line>
                    <line x1="16" y1="19" x2="16" y2="21"></line>
                    <line x1="16" y1="13" x2="16" y2="15"></line>
                    <line x1="12" y1="21" x2="12" y2="23"></line>
                    <line x1="12" y1="15" x2="12" y2="17"></line>
                </svg>
            );
        }
        
        // Partly cloudy - sun with cloud
        if (lowerCondition.includes('partly') || lowerCondition.includes('partial') || lowerCondition.includes('few')) {
            return (
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M13 2v2" stroke="#FFD700"></path>
                    <path d="M3 13h2" stroke="#FFD700"></path>
                    <path d="M20 13h2" stroke="#FFD700"></path>
                    <path d="M5.6 5.6l1.4 1.4" stroke="#FFD700"></path>
                    <path d="M18.4 5.6l-1.4 1.4" stroke="#FFD700"></path>
                    <circle cx="13" cy="9" r="4" stroke="#FFD700"></circle>
                    <path d="M17 17h-10a4 4 0 0 1 0-8h.5a5.5 5.5 0 0 1 10.5 3h.5a3 3 0 0 1 0 6z" stroke="#B0C4DE" fill="none"></path>
                </svg>
            );
        }
        
        // Snow
        if (lowerCondition.includes('snow') || lowerCondition.includes('flurr')) {
            return (
                <svg viewBox="0 0 24 24" fill="none" stroke="#B0E0E6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25"></path>
                    <line x1="8" y1="16" x2="8" y2="16.01"></line>
                    <line x1="8" y1="20" x2="8" y2="20.01"></line>
                    <line x1="12" y1="18" x2="12" y2="18.01"></line>
                    <line x1="12" y1="22" x2="12" y2="22.01"></line>
                    <line x1="16" y1="16" x2="16" y2="16.01"></line>
                    <line x1="16" y1="20" x2="16" y2="20.01"></line>
                </svg>
            );
        }
        
        // Thunderstorm
        if (lowerCondition.includes('thunder') || lowerCondition.includes('storm')) {
            return (
                <svg viewBox="0 0 24 24" fill="none" stroke="#9370DB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9"></path>
                    <polyline points="13 11 9 17 15 17 11 23" stroke="#FFD700" fill="none"></polyline>
                </svg>
            );
        }
        
        // Fog/Mist
        if (lowerCondition.includes('fog') || lowerCondition.includes('mist') || lowerCondition.includes('haze')) {
            return (
                <svg viewBox="0 0 24 24" fill="none" stroke="#A9A9A9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25"></path>
                    <line x1="3" y1="20" x2="21" y2="20"></line>
                    <line x1="3" y1="17" x2="21" y2="17"></line>
                </svg>
            );
        }
        
        // Default: cloudy
        return (
            <svg viewBox="0 0 24 24" fill="none" stroke="#B0C4DE" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"></path>
            </svg>
        );
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return { day: '', date: '' };
        let date;
        if (typeof dateStr === 'string' && dateStr.match(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/i)) {
            // Already formatted like "Mon, Dec 15" - parse it
            const parts = dateStr.match(/(\w+),\s*(\w+)\s*(\d+)/);
            if (parts) {
                return { day: `${parts[1]}, ${parts[2]}`, date: parts[3] };
            }
            return { day: dateStr, date: '' };
        }
        date = new Date(parseInt(dateStr) || dateStr);
        if (isNaN(date.getTime())) return { day: dateStr, date: '' };
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        // Use UTC methods to avoid timezone offset issues with date-only values
        // (Open-Meteo returns dates as "2024-12-17" which JS parses as midnight UTC)
        return { day: `${days[date.getUTCDay()]}, ${months[date.getUTCMonth()]}`, date: `${date.getUTCDate()}` };
    };

    const renderForecast = () => {
        if (!forecastData || !forecastData.length) {
            return <div className="forecast-empty">No forecast data</div>;
        }
        
        // If a day is selected, show the detail view
        if (selectedDay !== null) {
            const day = forecastData[selectedDay];
            const detailDate = formatDate(day.date || day.day);
            return (
                <div className="forecast-detail">
                    <div className="forecast-detail-header">
                        <button className="detail-back-btn" onClick={() => setSelectedDay(null)}>
                            ← Back
                        </button>
                        <span className="detail-date">{detailDate.day} {detailDate.date}</span>
                    </div>
                    <div className="detail-main">
                        <div className="detail-icon">{getWeatherIcon(day.conditions || day.condition)}</div>
                        <div className="detail-temps">
                            <div className="detail-high">{day.high}°</div>
                            <div className="detail-low">{day.low}°</div>
                        </div>
                        <div className="detail-condition">{day.conditions || day.condition || 'N/A'}</div>
                    </div>
                    {day.description && (
                        <div className="detail-description">{day.description}</div>
                    )}
                    <div className="detail-stats">
                        <div className="detail-stat">
                            <span className="stat-label">Precipitation</span>
                            <span className="stat-value">{day.precipitation || day.precip || '0%'}</span>
                        </div>
                        {day.humidity && (
                            <div className="detail-stat">
                                <span className="stat-label">Humidity</span>
                                <span className="stat-value">{day.humidity}%</span>
                            </div>
                        )}
                        {day.wind && (
                            <div className="detail-stat">
                                <span className="stat-label">Wind</span>
                                <span className="stat-value">{day.wind}</span>
                            </div>
                        )}
                        {(day.sunrise || day.sunset) && (
                            <div className="detail-sun-times">
                                {day.sunrise && (
                                    <div className="detail-stat">
                                        <span className="stat-label">🌅 Sunrise</span>
                                        <span className="stat-value">{day.sunrise}</span>
                                    </div>
                                )}
                                {day.sunset && (
                                    <div className="detail-stat">
                                        <span className="stat-label">🌇 Sunset</span>
                                        <span className="stat-value">{day.sunset}</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    
                    {/* Hourly Rain Timeline */}
                    <div className="rain-timeline-section">
                        <div className="rain-timeline-header">
                            <span className="rain-timeline-title">🌧️ Hourly Rain Forecast</span>
                        </div>
                        {loadingRain ? (
                            <div className="rain-timeline-loading">Loading...</div>
                        ) : hourlyRainData && hourlyRainData.hours ? (
                            <>
                                {hourlyRainData.summary && (
                                    <div className="rain-summary">{hourlyRainData.summary}</div>
                                )}
                                <div className="rain-timeline">
                                    {hourlyRainData.hours.map((hour, idx) => {
                                        const barHeight = Math.max(4, hour.probability);
                                        const intensity = hour.intensity || 'none';
                                        const timeLabel = hour.displayTime || `${hour.hour || 0}:00`;
                                        return (
                                            <div 
                                                key={idx} 
                                                className={`rain-bar-wrapper ${intensity !== 'none' ? 'has-rain' : ''}`}
                                                title={`${timeLabel}: ${hour.probability}% chance${hour.amountMm > 0 ? `, ${hour.amountMm}mm` : ''}`}
                                            >
                                                {idx % 4 === 0 && hour.probability > 0 && (
                                                    <span className="rain-prob-label">{hour.probability}%</span>
                                                )}
                                                <div 
                                                    className={`rain-bar rain-${intensity}`}
                                                    style={{ height: `${barHeight}%` }}
                                                />
                                                {idx % 4 === 0 && (
                                                    <span className="rain-hour-label">{timeLabel}</span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="rain-legend">
                                    <span className="rain-legend-item"><span className="legend-dot rain-none"></span>Dry</span>
                                    <span className="rain-legend-item"><span className="legend-dot rain-light"></span>Light</span>
                                    <span className="rain-legend-item"><span className="legend-dot rain-moderate"></span>Moderate</span>
                                    <span className="rain-legend-item"><span className="legend-dot rain-heavy"></span>Heavy</span>
                                </div>
                            </>
                        ) : (
                            <div className="rain-timeline-empty">No rain expected</div>
                        )}
                    </div>
                </div>
            );
        }
        
        // Show the 5-day overview
        return forecastData.slice(0, 5).map((day, i) => {
            const dateInfo = formatDate(day.date || day.day);
            const isToday = i === 0;
            
            return (
                <div key={i} className={`forecast-card ${isToday && stationData ? 'forecast-card-today' : ''}`} onClick={() => setSelectedDay(i)}>
                    <div className="forecast-row-top">
                        <div className="forecast-date">
                            <span className="date-day">{dateInfo.day}</span>
                            <span className="date-num">{dateInfo.date}</span>
                        </div>
                        <div className="forecast-icon">{getWeatherIcon(day.conditions || day.condition)}</div>
                    </div>
                    
                    {/* Show live station data on today's tile */}
                    {isToday && stationData && (
                        <div className="station-data">
                            <div className="station-current-temp">
                                {Math.round(stationData.temp)}°
                                <span className="station-label">now</span>
                            </div>
                            <div className="station-details">
                                <span className="station-detail" title="Wind">
                                    🌬️ {Math.round(stationData.windSpeed || 0)} mph {getCardinalDirection(stationData.windDir)}
                                </span>
                                {(stationData.rainRate > 0) && (
                                    <span className="station-detail station-rain" title="Rain Rate">
                                        🌧️ {stationData.rainRate.toFixed(2)}"/hr
                                    </span>
                                )}
                            </div>
                        </div>
                    )}
                    
                    <div className="forecast-row-bottom">
                        <span className="temp-low">{day.low}°</span>
                        <span className="temp-high">{day.high}°</span>
                        <span className="precip-group">
                            <svg className="precip-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M20 16.2A4.5 4.5 0 0 0 17.5 8h-1.8A7 7 0 1 0 4 14.9"></path>
                                <path d="M16 14v4"></path>
                                <path d="M8 14v4"></path>
                                <path d="M12 16v4"></path>
                            </svg>
                            <span className="precip-value">{day.precipitation || day.precip || '0%'}</span>
                        </span>
                    </div>
                </div>
            );
        });
    };

    const handleResizeMouseDown = (e) => {
        e.preventDefault();
        const startX = e.clientX;
        const startWidth = panelWidth;
        
        const onMouseMove = (moveEvent) => {
            const delta = startX - moveEvent.clientX;
            const newWidth = Math.max(250, Math.min(500, startWidth + delta));
            setPanelWidth(newWidth);
            localStorage.setItem('forecastPanelWidth', newWidth);
        };
        
        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
        
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    const handleDevicesResizeMouseDown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const startY = e.clientY;
        const startHeight = devicesHeight;
        
        const onMouseMove = (moveEvent) => {
            const delta = startY - moveEvent.clientY;
            const newHeight = Math.max(100, Math.min(500, startHeight + delta));
            setDevicesHeight(newHeight);
            localStorage.setItem('devicesOnHeight', newHeight);
        };
        
        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
        
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    return (
        <div className="forecast-panel" style={{ width: panelWidth }}>
            {/* Resize handle on left edge */}
            <div 
                className="forecast-resize-handle"
                ref={resizeRef}
                onMouseDown={handleResizeMouseDown}
            >
                <div className="forecast-resize-grip"></div>
            </div>
            
            <div className="forecast-panel-header" onClick={() => setExpanded(!expanded)}>
                <span>5-Day Forecast</span>
                <button onClick={(e) => { e.stopPropagation(); refreshForecast(); }} className="forecast-refresh-btn">
                    Refresh
                </button>
            </div>
            {expanded && (
                <div className="forecast-panel-content">
                    {renderForecast()}
                </div>
            )}

            {/* Optional slot for merging the Control Panel into this right-side panel */}
            <div className="forecast-dock-slot" ref={dockSlotRef} />
            
            {/* Active Devices Section */}
            <div className="devices-on-section" style={{ height: devicesExpanded ? devicesHeight : 'auto' }}>
                {/* Resize handle on top */}
                <div 
                    className="devices-resize-handle"
                    onMouseDown={handleDevicesResizeMouseDown}
                >
                    <div className="devices-resize-grip"></div>
                </div>
                <div className="devices-on-header" onClick={() => setDevicesExpanded(!devicesExpanded)}>
                    <span>Devices ON ({activeDevices.size})</span>
                    <span className="expand-icon">{devicesExpanded ? '▼' : '▶'}</span>
                </div>
                {devicesExpanded && (
                    <div className="devices-on-list">
                        {activeDevices.size === 0 ? (
                            <div className="no-devices">All devices off</div>
                        ) : (
                            Array.from(activeDevices.values())
                                .sort((a, b) => a.name.localeCompare(b.name))
                                .map((device, i) => (
                                    <div key={i} className="device-on-item">
                                        <span className="device-on-indicator"></span>
                                        <span className="device-on-name">{device.name}</span>
                                    </div>
                                ))
                        )}
                    </div>
                )}
            </div>
            
            <div className="status-indicators">
                <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
                    {isConnected ? 'Backend' : 'Backend X'}
                </div>
                <div className={`connection-status ${haStatus.connected ? 'connected' : 'disconnected'}`}>
                    {haStatus.connected ? `HA (${haStatus.deviceCount})` : 'HA X'}
                </div>
            </div>
        </div>
    );
}
