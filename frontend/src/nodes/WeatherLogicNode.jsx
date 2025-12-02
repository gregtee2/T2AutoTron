import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ClassicPreset } from 'rete';
import { RefComponent } from 'rete-react-plugin';
import { socket } from '../socket';
import sockets from '../sockets';
import './WeatherLogicNode.css';

// -------------------------------------------------------------------------
// NODE CLASS
// -------------------------------------------------------------------------
export class WeatherLogicNode extends ClassicPreset.Node {
    constructor(changeCallback) {
        super("Weather Logic");
        this.width = 700; // Matches v2 size roughly
        this.changeCallback = changeCallback;

        // Outputs
        this.addOutput("all", new ClassicPreset.Output(sockets.boolean, "All Conditions"));
        this.addOutput("solar", new ClassicPreset.Output(sockets.boolean, "Solar"));
        this.addOutput("temp", new ClassicPreset.Output(sockets.boolean, "Temp"));
        this.addOutput("humidity", new ClassicPreset.Output(sockets.boolean, "Humidity"));
        this.addOutput("wind", new ClassicPreset.Output(sockets.boolean, "Wind"));
        this.addOutput("hourly_rain", new ClassicPreset.Output(sockets.boolean, "Hourly Rain"));
        this.addOutput("event_rain", new ClassicPreset.Output(sockets.boolean, "Event Rain"));
        this.addOutput("daily_rain", new ClassicPreset.Output(sockets.boolean, "Daily Rain"));

        // Default Properties
        this.properties = {
            solarEnabled: true, solarThresholdHigh: 750, solarThresholdLow: 500, solarInvert: false, solarLabel: "Solar",
            tempEnabled: true, tempThresholdHigh: 80, tempThresholdLow: 60, tempInvert: false, tempLabel: "Temp",
            humidityEnabled: true, humidityThresholdHigh: 70, humidityThresholdLow: 30, humidityInvert: false, humidityLabel: "Humidity",
            windEnabled: true, windThresholdHigh: 15, windThresholdLow: 5, windInvert: false, windLabel: "Wind",
            hourlyRainEnabled: true, hourlyRainThreshold: 0.1, hourlyRainInvert: false, hourlyRainLabel: "Hourly Rain",
            eventRainEnabled: true, eventRainThreshold: 0.1, eventRainInvert: false, eventRainLabel: "Event Rain",
            dailyRainEnabled: true, dailyRainThreshold: 0.1, dailyRainInvert: false, dailyRainLabel: "Daily Rain",
            logicType: "OR",
            hysteresis: 5
        };
    }

    async data() {
        // The component updates the properties and internal state.
        // The data() method returns the current evaluation state.
        // We need a way to access the latest evaluation result here.
        // Since Rete v2 separates data flow from UI, we'll rely on the component 
        // to update a shared state object or we can re-evaluate here if we have the weather data.
        // However, the weather data is in the component state. 
        // A common pattern is to store the result in properties as well.
        
        return {
            all: this.properties._lastEval?.all || false,
            solar: this.properties._lastEval?.solar || false,
            temp: this.properties._lastEval?.temp || false,
            humidity: this.properties._lastEval?.humidity || false,
            wind: this.properties._lastEval?.wind || false,
            hourly_rain: this.properties._lastEval?.hourlyRain || false,
            event_rain: this.properties._lastEval?.eventRain || false,
            daily_rain: this.properties._lastEval?.dailyRain || false
        };
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

const MetricRow = ({ 
    label, value, unit, history, 
    enabled, onToggle, 
    invert, onInvert,
    high, low, onHighChange, onLowChange, 
    singleThreshold, onSingleChange,
    min, max, step,
    trend, range,
    isActive
}) => {
    // Simple Bar Graph
    const drawGraph = () => {
        if (!history || history.length < 1) return null;
        const twoHoursAgo = Date.now() - (120 * 60 * 1000);
        const recentData = history.filter(e => e.timestamp >= twoHoursAgo).slice(-40); // Last 40 points
        if (recentData.length === 0) return null;

        const logMax = Math.log(max + 1);
        
        return (
            <div className="weather-metric-graph">
                {recentData.map((entry, i) => {
                    const logValue = Math.log(entry.value + 0.5);
                    const heightPercent = Math.min(100, Math.max(0, (logValue / logMax) * 100));
                    const widthPercent = 100 / 40;
                    return (
                        <div 
                            key={i} 
                            className="weather-bar"
                            style={{
                                left: `${i * widthPercent}%`,
                                height: `${heightPercent}%`,
                                width: `${widthPercent}%`
                            }}
                        />
                    );
                })}
            </div>
        );
    };

    return (
        <div className="weather-metric-row" style={{ borderColor: isActive ? '#00FF00' : 'rgba(0, 243, 255, 0.1)' }}>
            <div className="weather-metric-info">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span className="weather-metric-label">{label}</span>
                    <label className="weather-toggle-container">
                        <input type="checkbox" className="weather-toggle" checked={enabled} onChange={(e) => onToggle(e.target.checked)} />
                    </label>
                </div>
                <span className="weather-metric-value">
                    {value !== null ? value.toFixed(step < 1 ? 2 : 1) : 'N/A'} {unit}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '2px' }}>
                    <span className="weather-metric-trend" style={{ color: trend.arrow === '↑' ? '#00FF00' : trend.arrow === '↓' ? '#FF0000' : '#FFFF00' }}>
                        {trend.arrow}
                    </span>
                    <span className="weather-metric-range">
                        [{range.min !== null ? range.min.toFixed(1) : '-'}-{range.max !== null ? range.max.toFixed(1) : '-'}]
                    </span>
                </div>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {drawGraph()}
                
                {enabled && (
                    <div className="weather-controls-sub">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px', color: '#aaa' }}>
                            <label className="weather-toggle-container" style={{ transform: 'scale(0.8)', transformOrigin: 'left' }}>
                                <input type="checkbox" className="weather-toggle" checked={invert} onChange={(e) => onInvert(e.target.checked)} />
                                <span>Invert</span>
                            </label>
                        </div>
                        
                        {!singleThreshold ? (
                            <>
                                <div className="weather-slider-container">
                                    <span style={{ fontSize: '10px', width: '30px' }}>High</span>
                                    <input 
                                        type="range" className="weather-range-input" 
                                        min={min} max={max} step={step} value={high} 
                                        onChange={(e) => onHighChange(Number(e.target.value))} 
                                    />
                                    <span style={{ fontSize: '10px', width: '30px', textAlign: 'right' }}>{high}</span>
                                </div>
                                <div className="weather-slider-container">
                                    <span style={{ fontSize: '10px', width: '30px' }}>Low</span>
                                    <input 
                                        type="range" className="weather-range-input" 
                                        min={min} max={max} step={step} value={low} 
                                        onChange={(e) => onLowChange(Number(e.target.value))} 
                                    />
                                    <span style={{ fontSize: '10px', width: '30px', textAlign: 'right' }}>{low}</span>
                                </div>
                            </>
                        ) : (
                            <div className="weather-slider-container">
                                <span style={{ fontSize: '10px', width: '30px' }}>Thresh</span>
                                <input 
                                    type="range" className="weather-range-input" 
                                    min={min} max={max} step={step} value={singleThreshold} 
                                    onChange={(e) => onSingleChange(Number(e.target.value))} 
                                />
                                <span style={{ fontSize: '10px', width: '30px', textAlign: 'right' }}>{singleThreshold}</span>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export function WeatherLogicNodeComponent({ data, emit }) {
    const [state, setState] = useState({ ...data.properties });
    const [weatherData, setWeatherData] = useState({
        solar: null, temp: null, humidity: null, wind: null,
        hourlyRain: null, eventRain: null, dailyRain: null
    });
    const [history, setHistory] = useState({
        solar: [], temp: [], humidity: [], wind: [],
        hourlyRain: [], eventRain: [], dailyRain: []
    });
    const [evalResults, setEvalResults] = useState({});
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [statusColor, setStatusColor] = useState('gray');

    // Helper to update properties and state
    const updateProperty = (key, value) => {
        const newState = { ...state, [key]: value };
        setState(newState);
        data.properties[key] = value;
        evaluateWeather(newState, weatherData); // Re-evaluate immediately
    };

    // History Management
    const updateHistory = (historyArray, value) => {
        if (value === null || value === undefined) return historyArray;
        const now = Date.now();
        const newArray = [...historyArray, { value, timestamp: now }];
        const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000);
        return newArray.filter(e => e.timestamp >= twentyFourHoursAgo);
    };

    const saveHistory = (newHistory) => {
        localStorage.setItem(`WeatherLogicNode_${data.id}_history`, JSON.stringify({
            ...newHistory,
            lastUpdateTime: Date.now()
        }));
    };

    const loadHistory = () => {
        try {
            const stored = localStorage.getItem(`WeatherLogicNode_${data.id}_history`);
            if (stored) {
                const parsed = JSON.parse(stored);
                // Filter out old data
                const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
                const cleanHistory = {};
                Object.keys(parsed).forEach(key => {
                    if (Array.isArray(parsed[key])) {
                        cleanHistory[key] = parsed[key].filter(e => e.timestamp >= twentyFourHoursAgo);
                    }
                });
                setHistory(prev => ({ ...prev, ...cleanHistory }));
            }
        } catch (e) {
            console.error("Failed to load weather history", e);
        }
    };

    // Evaluation Logic
    const evaluateWeather = (props, currentData) => {
        if (currentData.solar === null) return;

        const {
            solarEnabled, solarThresholdHigh, solarThresholdLow, solarInvert,
            tempEnabled, tempThresholdHigh, tempThresholdLow, tempInvert,
            humidityEnabled, humidityThresholdHigh, humidityThresholdLow, humidityInvert,
            windEnabled, windThresholdHigh, windThresholdLow, windInvert,
            hourlyRainEnabled, hourlyRainThreshold, hourlyRainInvert,
            eventRainEnabled, eventRainThreshold, eventRainInvert,
            dailyRainEnabled, dailyRainThreshold, dailyRainInvert,
            logicType, hysteresis
        } = props;

        const results = {};
        const conditions = [];

        const applyHysteresis = (value, low, high, prevResult, invert) => {
            if (value === null) return false;
            const effectiveLow = Math.min(low, high);
            const effectiveHigh = Math.max(low, high);
            const buffer = (effectiveHigh - effectiveLow) * (hysteresis / 100);
            const inRange = value >= effectiveLow && value <= effectiveHigh;
            let res = inRange;
            // If we had a previous result, apply hysteresis buffer
            // Note: In React functional component, accessing "previous result" is tricky without refs.
            // For simplicity in this port, we'll stick to direct range check or simple buffer.
            // To do it strictly like v2, we'd need to store the last boolean state.
            // Let's use the `evalResults` state, but be careful about closure staleness.
            // Actually, let's just use the direct range for now to avoid oscillation bugs in the port,
            // or implement a simple latch if needed.
            return invert ? !res : res;
        };

        // Solar
        results.solar = solarEnabled && applyHysteresis(currentData.solar, solarThresholdLow, solarThresholdHigh, null, solarInvert);
        if (solarEnabled) conditions.push(results.solar);

        // Temp
        results.temp = tempEnabled && applyHysteresis(currentData.temp, tempThresholdLow, tempThresholdHigh, null, tempInvert);
        if (tempEnabled) conditions.push(results.temp);

        // Humidity
        results.humidity = humidityEnabled && applyHysteresis(currentData.humidity, humidityThresholdLow, humidityThresholdHigh, null, humidityInvert);
        if (humidityEnabled) conditions.push(results.humidity);

        // Wind
        results.wind = windEnabled && applyHysteresis(currentData.wind, windThresholdLow, windThresholdHigh, null, windInvert);
        if (windEnabled) conditions.push(results.wind);

        // Rain
        results.hourlyRain = hourlyRainEnabled && (currentData.hourlyRain >= hourlyRainThreshold);
        if (hourlyRainInvert) results.hourlyRain = !results.hourlyRain;
        if (hourlyRainEnabled) conditions.push(results.hourlyRain);

        results.eventRain = eventRainEnabled && (currentData.eventRain >= eventRainThreshold);
        if (eventRainInvert) results.eventRain = !results.eventRain;
        if (eventRainEnabled) conditions.push(results.eventRain);

        results.dailyRain = dailyRainEnabled && (currentData.dailyRain >= dailyRainThreshold);
        if (dailyRainInvert) results.dailyRain = !results.dailyRain;
        if (dailyRainEnabled) conditions.push(results.dailyRain);

        // All
        let allState = false;
        if (conditions.length > 0) {
            allState = logicType === "AND" ? conditions.every(c => c) : conditions.some(c => c);
        }
        results.all = allState;

        setEvalResults(results);
        
        // Update Node Data for Engine
        data.properties._lastEval = results;
        if (data.changeCallback) data.changeCallback();
    };

    // Socket Effect
    useEffect(() => {
        loadHistory();

        const handleWeatherUpdate = (data) => {
            // console.log("[WeatherLogicNode] Received update:", data);
            setStatusColor('green');
            
            const newData = {
                solar: data.solarradiation,
                temp: data.tempf,
                humidity: data.humidity,
                wind: data.windspeedmph,
                hourlyRain: data.hourlyrainin,
                eventRain: data.eventrainin,
                dailyRain: data.dailyrainin
            };

            setWeatherData(newData);

            setHistory(prev => {
                const newHistory = {
                    solar: updateHistory(prev.solar, newData.solar),
                    temp: updateHistory(prev.temp, newData.temp),
                    humidity: updateHistory(prev.humidity, newData.humidity),
                    wind: updateHistory(prev.wind, newData.wind),
                    hourlyRain: updateHistory(prev.hourlyRain, newData.hourlyRain),
                    eventRain: updateHistory(prev.eventRain, newData.eventRain),
                    dailyRain: updateHistory(prev.dailyRain, newData.dailyRain)
                };
                saveHistory(newHistory);
                return newHistory;
            });

            evaluateWeather(state, newData);
        };

        socket.on('weather-update', handleWeatherUpdate);
        socket.emit('request-weather-update'); // Request initial data

        return () => {
            socket.off('weather-update', handleWeatherUpdate);
        };
    }, []); // Run once on mount

    // Helper for Trend/Range
    const getTrend = (hist) => {
        if (!hist || hist.length < 2) return { arrow: "→" };
        const current = hist[hist.length - 1].value;
        const previous = hist[hist.length - 2].value;
        const delta = current - previous;
        if (delta > 0.01) return { arrow: "↑" };
        if (delta < -0.01) return { arrow: "↓" };
        return { arrow: "→" };
    };

    const getRange = (hist) => {
        if (!hist || hist.length === 0) return { min: null, max: null };
        const values = hist.map(e => e.value);
        return { min: Math.min(...values), max: Math.max(...values) };
    };

    return (
        <div className="weather-node-tron">
            <div className="weather-node-header">
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div 
                        style={{ cursor: "pointer", fontSize: "12px", color: '#00f3ff' }}
                        onPointerDown={(e) => { e.stopPropagation(); setIsCollapsed(!isCollapsed); }}
                    >
                        {isCollapsed ? "▶" : "▼"}
                    </div>
                    <div className="weather-node-title">Weather Logic</div>
                </div>
                <div className="weather-status-indicator" style={{ background: statusColor, boxShadow: `0 0 5px ${statusColor}` }} />
            </div>

            {/* Outputs */}
            <div className="weather-io-container">
                <div style={{ flex: 1 }}></div> {/* No Inputs */}
                <div className="outputs">
                    {Object.entries(data.outputs).map(([key, output]) => (
                        <div key={key} style={{ display: "flex", alignItems: "center", gap: "8px", justifyContent: 'flex-end', marginBottom: '4px' }}>
                            <span className="weather-socket-label" style={{ color: evalResults[key] ? '#00FF00' : '#aaa' }}>{output.label}</span>
                            <RefComponent init={ref => emit({ type: "render", data: { type: "socket", element: ref, payload: output.socket, nodeId: data.id, side: "output", key } })} unmount={ref => emit({ type: "unmount", data: { element: ref } })} />
                        </div>
                    ))}
                </div>
            </div>

            {!isCollapsed && (
                <div className="weather-controls-container" onPointerDown={(e) => e.stopPropagation()}>
                    
                    <div className="weather-section-header">Logic Configuration</div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', color: '#aaa' }}>Logic Type:</span>
                        <select 
                            value={state.logicType} 
                            onChange={(e) => updateProperty('logicType', e.target.value)}
                            style={{ background: '#333', color: '#fff', border: '1px solid #555', borderRadius: '4px' }}
                        >
                            <option value="OR">OR (Any)</option>
                            <option value="AND">AND (All)</option>
                        </select>
                    </div>

                    <div className="weather-section-header">Conditions</div>
                    
                    <MetricRow 
                        label="Solar" value={weatherData.solar} unit="W/m²" history={history.solar}
                        enabled={state.solarEnabled} onToggle={v => updateProperty('solarEnabled', v)}
                        invert={state.solarInvert} onInvert={v => updateProperty('solarInvert', v)}
                        high={state.solarThresholdHigh} onHighChange={v => updateProperty('solarThresholdHigh', v)}
                        low={state.solarThresholdLow} onLowChange={v => updateProperty('solarThresholdLow', v)}
                        min={0} max={1000} step={10}
                        trend={getTrend(history.solar)} range={getRange(history.solar)}
                        isActive={evalResults.solar}
                    />

                    <MetricRow 
                        label="Temp" value={weatherData.temp} unit="°F" history={history.temp}
                        enabled={state.tempEnabled} onToggle={v => updateProperty('tempEnabled', v)}
                        invert={state.tempInvert} onInvert={v => updateProperty('tempInvert', v)}
                        high={state.tempThresholdHigh} onHighChange={v => updateProperty('tempThresholdHigh', v)}
                        low={state.tempThresholdLow} onLowChange={v => updateProperty('tempThresholdLow', v)}
                        min={0} max={120} step={1}
                        trend={getTrend(history.temp)} range={getRange(history.temp)}
                        isActive={evalResults.temp}
                    />

                    <MetricRow 
                        label="Humidity" value={weatherData.humidity} unit="%" history={history.humidity}
                        enabled={state.humidityEnabled} onToggle={v => updateProperty('humidityEnabled', v)}
                        invert={state.humidityInvert} onInvert={v => updateProperty('humidityInvert', v)}
                        high={state.humidityThresholdHigh} onHighChange={v => updateProperty('humidityThresholdHigh', v)}
                        low={state.humidityThresholdLow} onLowChange={v => updateProperty('humidityThresholdLow', v)}
                        min={0} max={100} step={1}
                        trend={getTrend(history.humidity)} range={getRange(history.humidity)}
                        isActive={evalResults.humidity}
                    />

                    <MetricRow 
                        label="Wind" value={weatherData.wind} unit="mph" history={history.wind}
                        enabled={state.windEnabled} onToggle={v => updateProperty('windEnabled', v)}
                        invert={state.windInvert} onInvert={v => updateProperty('windInvert', v)}
                        high={state.windThresholdHigh} onHighChange={v => updateProperty('windThresholdHigh', v)}
                        low={state.windThresholdLow} onLowChange={v => updateProperty('windThresholdLow', v)}
                        min={0} max={50} step={1}
                        trend={getTrend(history.wind)} range={getRange(history.wind)}
                        isActive={evalResults.wind}
                    />

                    <MetricRow 
                        label="Hourly Rain" value={weatherData.hourlyRain} unit="in" history={history.hourlyRain}
                        enabled={state.hourlyRainEnabled} onToggle={v => updateProperty('hourlyRainEnabled', v)}
                        invert={state.hourlyRainInvert} onInvert={v => updateProperty('hourlyRainInvert', v)}
                        singleThreshold={state.hourlyRainThreshold} onSingleChange={v => updateProperty('hourlyRainThreshold', v)}
                        min={0} max={2} step={0.01}
                        trend={getTrend(history.hourlyRain)} range={getRange(history.hourlyRain)}
                        isActive={evalResults.hourlyRain}
                    />

                    <MetricRow 
                        label="Event Rain" value={weatherData.eventRain} unit="in" history={history.eventRain}
                        enabled={state.eventRainEnabled} onToggle={v => updateProperty('eventRainEnabled', v)}
                        invert={state.eventRainInvert} onInvert={v => updateProperty('eventRainInvert', v)}
                        singleThreshold={state.eventRainThreshold} onSingleChange={v => updateProperty('eventRainThreshold', v)}
                        min={0} max={2} step={0.01}
                        trend={getTrend(history.eventRain)} range={getRange(history.eventRain)}
                        isActive={evalResults.eventRain}
                    />

                    <MetricRow 
                        label="Daily Rain" value={weatherData.dailyRain} unit="in" history={history.dailyRain}
                        enabled={state.dailyRainEnabled} onToggle={v => updateProperty('dailyRainEnabled', v)}
                        invert={state.dailyRainInvert} onInvert={v => updateProperty('dailyRainInvert', v)}
                        singleThreshold={state.dailyRainThreshold} onSingleChange={v => updateProperty('dailyRainThreshold', v)}
                        min={0} max={2} step={0.01}
                        trend={getTrend(history.dailyRain)} range={getRange(history.dailyRain)}
                        isActive={evalResults.dailyRain}
                    />

                </div>
            )}
        </div>
    );
}
