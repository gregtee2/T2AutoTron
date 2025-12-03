import React, { useState, useEffect } from 'react';
import { socket } from '../socket';
import './ForecastPanel.css';

export function ForecastPanel() {
    const [expanded, setExpanded] = useState(true);
    const [forecastData, setForecastData] = useState(null);

    useEffect(() => {
        if (!socket) return;

        socket.on('forecast-update', (data) => {
            console.log('Forecast received:', data);
            setForecastData(data);
        });

        // Request initial forecast
        socket.emit('request-forecast');

        return () => {
            socket.off('forecast-update');
        };
    }, []);

    const refreshForecast = () => {
        socket?.emit('request-forecast');
    };

    const getWeatherIcon = (condition) => {
        if (!condition) return '☁️';
        const cond = condition.toLowerCase();
        if (cond.includes('rain') || cond.includes('shower')) return '🌧️';
        if (cond.includes('cloud')) return '☁️';
        if (cond.includes('sun') || cond.includes('clear')) return '☀️';
        if (cond.includes('snow')) return '❄️';
        if (cond.includes('storm') || cond.includes('thunder')) return '⛈️';
        return '☁️';
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '';

        // If it's already a day name, return it
        if (typeof dateStr === 'string' && dateStr.match(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/i)) {
            return dateStr;
        }

        // Try to parse as timestamp or date string
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

        return forecastData.slice(0, 5).map((day, i) => (
            <div key={i} className="forecast-card">
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
            <div
                className="forecast-panel-header"
                onClick={() => setExpanded(!expanded)}
            >
                <span>5-Day Forecast</span>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        refreshForecast();
                    }}
                    className="forecast-refresh-btn"
                >
                    Refresh
                </button>
            </div>
            {expanded && (
                <div className="forecast-panel-content">
                    {renderForecast()}
                </div>
            )}
        </div>
    );
}
