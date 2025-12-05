import React, { useState, useEffect } from 'react';
import { socket } from '../socket';
import './ForecastPanel.css';

export function ForecastPanel() {
    const [expanded, setExpanded] = useState(true);
    const [forecastData, setForecastData] = useState(null);
    const [selectedDay, setSelectedDay] = useState(null);
    const [isConnected, setIsConnected] = useState(socket?.connected ?? false);
    const [haStatus, setHaStatus] = useState({ connected: false, wsConnected: false, deviceCount: 0 });

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
            console.log('Forecast received:', data);
            setForecastData(data);
        });

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
        };
    }, []);

    const refreshForecast = () => {
        socket?.emit('request-forecast');
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
        if (!dateStr) return '';
        if (typeof dateStr === 'string' && dateStr.match(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/i)) {
            return dateStr;
        }
        const date = new Date(parseInt(dateStr) || dateStr);
        if (isNaN(date.getTime())) return dateStr;
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
    };

    const renderForecast = () => {
        if (!forecastData || !forecastData.length) {
            return <div className="forecast-empty">No forecast data</div>;
        }
        
        // If a day is selected, show the detail view
        if (selectedDay !== null) {
            const day = forecastData[selectedDay];
            return (
                <div className="forecast-detail">
                    <div className="forecast-detail-header">
                        <button className="detail-back-btn" onClick={() => setSelectedDay(null)}>
                            ← Back
                        </button>
                        <span className="detail-date">{formatDate(day.date || day.day)}</span>
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
                </div>
            );
        }
        
        // Show the 5-day overview
        return forecastData.slice(0, 5).map((day, i) => (
            <div key={i} className="forecast-card" onClick={() => setSelectedDay(i)}>
                <div className="forecast-date">{formatDate(day.date || day.day)}</div>
                <div className="forecast-icon">{getWeatherIcon(day.conditions || day.condition)}</div>
                <div className="forecast-temps">
                    <span className="temp-high">{day.high}°</span>
                    <span className="temp-low">{day.low}°</span>
                    <span className="precip">{day.precipitation || day.precip || '0%'}</span>
                </div>
            </div>
        ));
    };

    return (
        <div className="forecast-panel">
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
