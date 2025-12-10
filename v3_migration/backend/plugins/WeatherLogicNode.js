(function() {
    // Debug: console.log("[WeatherLogicNode] Loading plugin...");

    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets || !window.socket) {
        console.error("[WeatherLogicNode] Missing dependencies");
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect, useCallback, useRef, useMemo } = React;
    const RefComponent = window.RefComponent;
    const socket = window.socket;

    // -------------------------------------------------------------------------
    // CSS is now loaded from node-styles.css via index.css
    // -------------------------------------------------------------------------

    // -------------------------------------------------------------------------
    // NODE CLASS
    // -------------------------------------------------------------------------
    class WeatherLogicNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("Weather Logic");
            this.width = 700;
            this.changeCallback = changeCallback;

            try {
                this.addOutput("all", new ClassicPreset.Output(window.sockets.boolean || new ClassicPreset.Socket('boolean'), "All Conditions"));
                this.addOutput("solar", new ClassicPreset.Output(window.sockets.boolean || new ClassicPreset.Socket('boolean'), "Solar"));
                this.addOutput("temp", new ClassicPreset.Output(window.sockets.boolean || new ClassicPreset.Socket('boolean'), "Temp"));
                this.addOutput("humidity", new ClassicPreset.Output(window.sockets.boolean || new ClassicPreset.Socket('boolean'), "Humidity"));
                this.addOutput("wind", new ClassicPreset.Output(window.sockets.boolean || new ClassicPreset.Socket('boolean'), "Wind"));
                this.addOutput("hourly_rain", new ClassicPreset.Output(window.sockets.boolean || new ClassicPreset.Socket('boolean'), "Hourly Rain"));
                this.addOutput("event_rain", new ClassicPreset.Output(window.sockets.boolean || new ClassicPreset.Socket('boolean'), "Event Rain"));
                this.addOutput("daily_rain", new ClassicPreset.Output(window.sockets.boolean || new ClassicPreset.Socket('boolean'), "Daily Rain"));
            } catch (e) { console.error("[WeatherLogicNode] Error adding outputs:", e); }

            this.properties = {
                solarEnabled: true, solarThresholdHigh: 750, solarThresholdLow: 500, solarInvert: false, solarLabel: "Solar",
                tempEnabled: true, tempThresholdHigh: 80, tempThresholdLow: 60, tempInvert: false, tempLabel: "Temp",
                humidityEnabled: true, humidityThresholdHigh: 70, humidityThresholdLow: 30, humidityInvert: false, humidityLabel: "Humidity",
                windEnabled: true, windThresholdHigh: 15, windThresholdLow: 5, windInvert: false, windLabel: "Wind",
                hourlyRainEnabled: true, hourlyRainThreshold: 0.1, hourlyRainInvert: false, hourlyRainLabel: "Hourly Rain",
                eventRainEnabled: true, eventRainThreshold: 0.1, eventRainInvert: false, eventRainLabel: "Event Rain",
                dailyRainEnabled: true, dailyRainThreshold: 0.1, dailyRainInvert: false, dailyRainLabel: "Daily Rain",
                logicType: "OR",
                hysteresis: 5,
                _lastEval: {}
            };
        }

        data() {
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

        serialize() {
            return {
                solarEnabled: this.properties.solarEnabled,
                solarThresholdHigh: this.properties.solarThresholdHigh,
                solarThresholdLow: this.properties.solarThresholdLow,
                solarInvert: this.properties.solarInvert,
                solarLabel: this.properties.solarLabel,
                tempEnabled: this.properties.tempEnabled,
                tempThresholdHigh: this.properties.tempThresholdHigh,
                tempThresholdLow: this.properties.tempThresholdLow,
                tempInvert: this.properties.tempInvert,
                tempLabel: this.properties.tempLabel,
                humidityEnabled: this.properties.humidityEnabled,
                humidityThresholdHigh: this.properties.humidityThresholdHigh,
                humidityThresholdLow: this.properties.humidityThresholdLow,
                humidityInvert: this.properties.humidityInvert,
                humidityLabel: this.properties.humidityLabel,
                windEnabled: this.properties.windEnabled,
                windThresholdHigh: this.properties.windThresholdHigh,
                windThresholdLow: this.properties.windThresholdLow,
                windInvert: this.properties.windInvert,
                windLabel: this.properties.windLabel,
                hourlyRainEnabled: this.properties.hourlyRainEnabled,
                hourlyRainThreshold: this.properties.hourlyRainThreshold,
                hourlyRainInvert: this.properties.hourlyRainInvert,
                hourlyRainLabel: this.properties.hourlyRainLabel,
                eventRainEnabled: this.properties.eventRainEnabled,
                eventRainThreshold: this.properties.eventRainThreshold,
                eventRainInvert: this.properties.eventRainInvert,
                eventRainLabel: this.properties.eventRainLabel,
                dailyRainEnabled: this.properties.dailyRainEnabled,
                dailyRainThreshold: this.properties.dailyRainThreshold,
                dailyRainInvert: this.properties.dailyRainInvert,
                dailyRainLabel: this.properties.dailyRainLabel,
                logicType: this.properties.logicType,
                hysteresis: this.properties.hysteresis
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
    const MetricRow = ({ 
        label, value, unit, history, 
        enabled, onToggle, 
        invert, onInvert,
        high, low, onHighChange, onLowChange, 
        singleThreshold, onSingleChange,
        min, max, step,
        trend, range,
        isActive,
        socketKey, output, emit, nodeId,
        secondaryInfo
    }) => {
        const drawGraph = () => {
            if (!history || history.length < 1) return React.createElement('div', { className: "weather-metric-graph", style: { opacity: 0.3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px' } }, "No Data");
            const twoHoursAgo = Date.now() - (120 * 60 * 1000);
            const recentData = history.filter(e => e.timestamp >= twoHoursAgo).slice(-40);
            if (recentData.length === 0 && history.length > 0) recentData.push(history[history.length - 1]);

            const logMax = Math.log(max + 1);
            
            return React.createElement('div', { className: "weather-metric-graph" }, 
                recentData.map((entry, i) => {
                    const logValue = Math.log(entry.value + 0.5);
                    const heightPercent = Math.min(100, Math.max(0, (logValue / logMax) * 100));
                    const totalPoints = Math.max(recentData.length, 40); 
                    const widthPercent = 100 / totalPoints;
                    const leftPercent = i * widthPercent;

                    return React.createElement('div', { 
                        key: i, 
                        className: "weather-bar",
                        style: { left: `${leftPercent}%`, height: `${heightPercent}%`, width: `${widthPercent}%` }
                    });
                })
            );
        };

        return React.createElement('div', { className: "weather-metric-row", style: { borderColor: isActive ? '#4caf50' : 'rgba(255, 140, 0, 0.15)' } }, [
            React.createElement('div', { key: 'info', className: "weather-metric-info" }, [
                React.createElement('div', { key: 'h', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } }, [
                    React.createElement('span', { key: 'l', className: "weather-metric-label" }, label),
                    React.createElement('label', { key: 't', className: "weather-toggle-container" }, [
                        React.createElement('input', { key: 'i', type: "checkbox", className: "weather-toggle", checked: enabled, onChange: (e) => onToggle(e.target.checked) })
                    ])
                ]),
                React.createElement('span', { key: 'v', className: "weather-metric-value" }, [
                    value !== null ? value.toFixed(step < 1 ? 2 : 1) : 'N/A', " ", unit,
                    secondaryInfo && React.createElement('span', { key: 'si', style: { marginLeft: '6px', color: '#ffb74d', fontSize: '0.9em' } }, secondaryInfo)
                ]),
                React.createElement('div', { key: 'tr', style: { display: 'flex', alignItems: 'center', gap: '5px', marginTop: '2px' } }, [
                    React.createElement('span', { key: 't', className: "weather-metric-trend", style: { color: trend.arrow === '↑' ? '#4caf50' : trend.arrow === '↓' ? '#f44336' : '#ffb74d' } }, trend.arrow),
                    React.createElement('span', { key: 'r', className: "weather-metric-range" }, `[${range.min !== null ? range.min.toFixed(1) : '-'}-${range.max !== null ? range.max.toFixed(1) : '-'}]`)
                ])
            ]),
            React.createElement('div', { key: 'mid', style: { flex: 1, display: 'flex', flexDirection: 'column', gap: '5px', minWidth: '200px' } }, [
                React.createElement('div', { key: 'graph' }, drawGraph()),
                enabled && React.createElement('div', { key: 'ctrl', className: "weather-controls-sub" }, [
                    React.createElement('div', { key: 'inv', style: { display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', color: '#aaa' } }, [
                        React.createElement('label', { key: 'l', className: "weather-toggle-container", style: { transform: 'scale(0.9)', transformOrigin: 'left' } }, [
                            React.createElement('input', { key: 'i', type: "checkbox", className: "weather-toggle", checked: invert, onChange: (e) => onInvert(e.target.checked) }),
                            React.createElement('span', { key: 's' }, "Invert")
                        ])
                    ]),
                    ...(!singleThreshold ? [
                        React.createElement('div', { key: 'h', className: "weather-slider-container" }, [
                            React.createElement('span', { key: 'l', style: { fontSize: '11px', width: '30px' } }, "High"),
                            React.createElement('input', { key: 'i', type: "range", className: "weather-range-input", min: min, max: max, step: step, value: high, onChange: (e) => onHighChange(Number(e.target.value)) }),
                            React.createElement('span', { key: 'v', style: { fontSize: '11px', width: '30px', textAlign: 'right' } }, high)
                        ]),
                        React.createElement('div', { key: 'l', className: "weather-slider-container" }, [
                            React.createElement('span', { key: 'l', style: { fontSize: '11px', width: '30px' } }, "Low"),
                            React.createElement('input', { key: 'i', type: "range", className: "weather-range-input", min: min, max: max, step: step, value: low, onChange: (e) => onLowChange(Number(e.target.value)) }),
                            React.createElement('span', { key: 'v', style: { fontSize: '11px', width: '30px', textAlign: 'right' } }, low)
                        ])
                    ] : [React.createElement('div', { key: 's', className: "weather-slider-container" }, [
                        React.createElement('span', { key: 'l', style: { fontSize: '11px', width: '30px' } }, "Thresh"),
                        React.createElement('input', { key: 'i', type: "range", className: "weather-range-input", min: min, max: max, step: step, value: singleThreshold, onChange: (e) => onSingleChange(Number(e.target.value)) }),
                        React.createElement('span', { key: 'v', style: { fontSize: '11px', width: '30px', textAlign: 'right' } }, singleThreshold)
                    ])])
                ])
            ]),
            React.createElement('div', { key: 'sock', style: { display: "flex", alignItems: "center", justifyContent: 'center', width: '40px' } }, [
                React.createElement(RefComponent, { 
                    init: ref => emit({ type: "render", data: { type: "socket", element: ref, payload: output.socket, nodeId: nodeId, side: "output", key: socketKey } }), 
                    unmount: ref => emit({ type: "unmount", data: { element: ref } }) 
                })
            ])
        ]);
    };

    function WeatherLogicNodeComponent({ data, emit }) {
        const [state, setState] = useState({ ...data.properties });
        const [weatherData, setWeatherData] = useState({
            solar: null, temp: null, humidity: null, wind: null, windDir: null,
            hourlyRain: null, eventRain: null, dailyRain: null, _source: null
        });
        const [history, setHistory] = useState({
            solar: [], temp: [], humidity: [], wind: [],
            hourlyRain: [], eventRain: [], dailyRain: []
        });
        const [evalResults, setEvalResults] = useState({});
        const [isCollapsed, setIsCollapsed] = useState(false);
        const [statusColor, setStatusColor] = useState('gray');

        const updateProperty = (key, value) => {
            const newState = { ...state, [key]: value };
            setState(newState);
            data.properties[key] = value;
            evaluateWeather(newState, weatherData);
        };

        const updateHistory = (historyArray, value) => {
            if (value === null || value === undefined) return historyArray;
            const now = Date.now();
            const newArray = [...historyArray, { value, timestamp: now }];
            const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000);
            return newArray.filter(e => e.timestamp >= twentyFourHoursAgo);
        };

        const saveHistory = (newHistory) => {
            localStorage.setItem(`WeatherLogicNode_${data.id}_history`, JSON.stringify({ ...newHistory, lastUpdateTime: Date.now() }));
        };

        const loadHistory = () => {
            try {
                const stored = localStorage.getItem(`WeatherLogicNode_${data.id}_history`);
                if (stored) {
                    const parsed = JSON.parse(stored);
                    const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
                    const cleanHistory = {};
                    Object.keys(parsed).forEach(key => {
                        if (Array.isArray(parsed[key])) {
                            cleanHistory[key] = parsed[key].filter(e => e.timestamp >= twentyFourHoursAgo);
                        }
                    });
                    setHistory(prev => ({ ...prev, ...cleanHistory }));
                }
            } catch (e) { console.error("Failed to load weather history", e); }
        };

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
                const inRange = value >= effectiveLow && value <= effectiveHigh;
                let res = inRange;
                return invert ? !res : res;
            };

            results.solar = solarEnabled && applyHysteresis(currentData.solar, solarThresholdLow, solarThresholdHigh, null, solarInvert);
            if (solarEnabled) conditions.push(results.solar);

            results.temp = tempEnabled && applyHysteresis(currentData.temp, tempThresholdLow, tempThresholdHigh, null, tempInvert);
            if (tempEnabled) conditions.push(results.temp);

            results.humidity = humidityEnabled && applyHysteresis(currentData.humidity, humidityThresholdLow, humidityThresholdHigh, null, humidityInvert);
            if (humidityEnabled) conditions.push(results.humidity);

            results.wind = windEnabled && applyHysteresis(currentData.wind, windThresholdLow, windThresholdHigh, null, windInvert);
            if (windEnabled) conditions.push(results.wind);

            results.hourlyRain = hourlyRainEnabled && (currentData.hourlyRain >= hourlyRainThreshold);
            if (hourlyRainInvert) results.hourlyRain = !results.hourlyRain;
            if (hourlyRainEnabled) conditions.push(results.hourlyRain);

            results.eventRain = eventRainEnabled && (currentData.eventRain >= eventRainThreshold);
            if (eventRainInvert) results.eventRain = !results.eventRain;
            if (eventRainEnabled) conditions.push(results.eventRain);

            results.dailyRain = dailyRainEnabled && (currentData.dailyRain >= dailyRainThreshold);
            if (dailyRainInvert) results.dailyRain = !results.dailyRain;
            if (dailyRainEnabled) conditions.push(results.dailyRain);

            let allState = false;
            if (conditions.length > 0) {
                allState = logicType === "AND" ? conditions.every(c => c) : conditions.some(c => c);
            }
            results.all = allState;

            setEvalResults(results);
            data.properties._lastEval = results;
            if (data.changeCallback) data.changeCallback();
        };

        useEffect(() => {
            loadHistory();
            const handleWeatherUpdate = (data) => {
                setStatusColor('green');
                const newData = {
                    solar: data.solarradiation,
                    temp: data.tempf,
                    humidity: data.humidity,
                    wind: data.windspeedmph,
                    windDir: data.winddir,
                    hourlyRain: data.hourlyrainin,
                    eventRain: data.eventrainin,
                    dailyRain: data.dailyrainin,
                    _source: data._source || 'ambient' // Track weather data source
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
            socket.emit('request-weather-update');

            return () => {
                socket.off('weather-update', handleWeatherUpdate);
            };
        }, []);

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

        const getCardinalDirection = (angle) => {
            if (angle === null || angle === undefined) return '';
            const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
            const index = Math.round(angle / 22.5) % 16;
            return directions[index];
        };

        return React.createElement('div', { className: "weather-node-tron" }, [
            React.createElement('div', { key: 'h', className: "weather-node-header" }, [
                React.createElement('div', { key: 't', style: { display: "flex", alignItems: "center", gap: "8px" } }, [
                    React.createElement('div', { 
                        key: 'c',
                        style: { cursor: "pointer", fontSize: "14px", color: '#ffb74d' },
                        onPointerDown: (e) => { e.stopPropagation(); setIsCollapsed(!isCollapsed); }
                    }, isCollapsed ? "▶" : "▼"),
                    React.createElement('div', { key: 'l', className: "weather-node-title" }, "Weather Logic"),
                    // Show weather source badge
                    weatherData._source && React.createElement('span', {
                        key: 'src',
                        title: weatherData._source === 'open-meteo' 
                            ? 'Using Open-Meteo (free fallback). Configure Ambient Weather API for more data.' 
                            : 'Using Ambient Weather personal station',
                        style: {
                            fontSize: '9px',
                            padding: '2px 6px',
                            borderRadius: '8px',
                            background: weatherData._source === 'open-meteo' ? 'rgba(255, 152, 0, 0.3)' : 'rgba(76, 175, 80, 0.3)',
                            color: weatherData._source === 'open-meteo' ? '#ffb74d' : '#4caf50',
                            border: `1px solid ${weatherData._source === 'open-meteo' ? 'rgba(255, 152, 0, 0.5)' : 'rgba(76, 175, 80, 0.5)'}`
                        }
                    }, weatherData._source === 'open-meteo' ? '☁️ Open-Meteo' : '📡 Ambient')
                ]),
                React.createElement('div', { key: 's', className: "weather-status-indicator", style: { background: statusColor, boxShadow: `0 0 5px ${statusColor}` } })
            ]),
            !isCollapsed && React.createElement('div', { key: 'content', className: "weather-controls-container", onPointerDown: (e) => e.stopPropagation() }, [
                React.createElement('div', { key: 'logic', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', padding: '5px', background: 'rgba(0,0,0,0.3)', borderRadius: '4px' } }, [
                    React.createElement('div', { key: 'l', style: { display: 'flex', gap: '10px', alignItems: 'center' } }, [
                        React.createElement('span', { key: 's', style: { fontSize: '13px', color: '#aaa' } }, "Logic Type:"),
                        React.createElement('select', { key: 'sel', value: state.logicType, onChange: (e) => updateProperty('logicType', e.target.value), style: { background: '#333', color: '#fff', border: '1px solid #555', borderRadius: '4px', fontSize: '13px' } }, [
                            React.createElement('option', { key: 'or', value: "OR" }, "OR (Any)"),
                            React.createElement('option', { key: 'and', value: "AND" }, "AND (All)")
                        ])
                    ]),
                    React.createElement('div', { key: 'out', style: { display: "flex", alignItems: "center", gap: "8px" } }, [
                        React.createElement('span', { key: 'l', className: "weather-socket-label", style: { color: evalResults.all ? '#4caf50' : '#aaa', fontWeight: 'bold' } }, "All Conditions"),
                        React.createElement(RefComponent, { 
                            key: 'r',
                            init: ref => emit({ type: "render", data: { type: "socket", element: ref, payload: data.outputs.all.socket, nodeId: data.id, side: "output", key: "all" } }), 
                            unmount: ref => emit({ type: "unmount", data: { element: ref } }) 
                        })
                    ])
                ]),
                React.createElement('div', { key: 'sh', className: "weather-section-header" }, "Conditions"),
                React.createElement(MetricRow, { 
                    key: 'solar', label: "Solar", value: weatherData.solar, unit: "W/m²", history: history.solar,
                    enabled: state.solarEnabled, onToggle: v => updateProperty('solarEnabled', v),
                    invert: state.solarInvert, onInvert: v => updateProperty('solarInvert', v),
                    high: state.solarThresholdHigh, onHighChange: v => updateProperty('solarThresholdHigh', v),
                    low: state.solarThresholdLow, onLowChange: v => updateProperty('solarThresholdLow', v),
                    min: 0, max: 1000, step: 10, trend: getTrend(history.solar), range: getRange(history.solar),
                    isActive: evalResults.solar, socketKey: "solar", output: data.outputs.solar, emit, nodeId: data.id
                }),
                React.createElement(MetricRow, { 
                    key: 'temp', label: "Temp", value: weatherData.temp, unit: "°F", history: history.temp,
                    enabled: state.tempEnabled, onToggle: v => updateProperty('tempEnabled', v),
                    invert: state.tempInvert, onInvert: v => updateProperty('tempInvert', v),
                    high: state.tempThresholdHigh, onHighChange: v => updateProperty('tempThresholdHigh', v),
                    low: state.tempThresholdLow, onLowChange: v => updateProperty('tempThresholdLow', v),
                    min: 0, max: 120, step: 1, trend: getTrend(history.temp), range: getRange(history.temp),
                    isActive: evalResults.temp, socketKey: "temp", output: data.outputs.temp, emit, nodeId: data.id
                }),
                React.createElement(MetricRow, { 
                    key: 'humidity', label: "Humidity", value: weatherData.humidity, unit: "%", history: history.humidity,
                    enabled: state.humidityEnabled, onToggle: v => updateProperty('humidityEnabled', v),
                    invert: state.humidityInvert, onInvert: v => updateProperty('humidityInvert', v),
                    high: state.humidityThresholdHigh, onHighChange: v => updateProperty('humidityThresholdHigh', v),
                    low: state.humidityThresholdLow, onLowChange: v => updateProperty('humidityThresholdLow', v),
                    min: 0, max: 100, step: 1, trend: getTrend(history.humidity), range: getRange(history.humidity),
                    isActive: evalResults.humidity, socketKey: "humidity", output: data.outputs.humidity, emit, nodeId: data.id
                }),
                React.createElement(MetricRow, { 
                    key: 'wind', label: "Wind", value: weatherData.wind, unit: "mph", history: history.wind,
                    enabled: state.windEnabled, onToggle: v => updateProperty('windEnabled', v),
                    invert: state.windInvert, onInvert: v => updateProperty('windInvert', v),
                    high: state.windThresholdHigh, onHighChange: v => updateProperty('windThresholdHigh', v),
                    low: state.windThresholdLow, onLowChange: v => updateProperty('windThresholdLow', v),
                    min: 0, max: 50, step: 1, trend: getTrend(history.wind), range: getRange(history.wind),
                    isActive: evalResults.wind, socketKey: "wind", output: data.outputs.wind, emit, nodeId: data.id,
                    secondaryInfo: weatherData.windDir !== null ? getCardinalDirection(weatherData.windDir) : ''
                }),
                React.createElement(MetricRow, { 
                    key: 'hourlyRain', label: "Hourly Rain", value: weatherData.hourlyRain, unit: "in", history: history.hourlyRain,
                    enabled: state.hourlyRainEnabled, onToggle: v => updateProperty('hourlyRainEnabled', v),
                    invert: state.hourlyRainInvert, onInvert: v => updateProperty('hourlyRainInvert', v),
                    singleThreshold: state.hourlyRainThreshold, onSingleChange: v => updateProperty('hourlyRainThreshold', v),
                    min: 0, max: 2, step: 0.01, trend: getTrend(history.hourlyRain), range: getRange(history.hourlyRain),
                    isActive: evalResults.hourlyRain, socketKey: "hourly_rain", output: data.outputs.hourly_rain, emit, nodeId: data.id
                }),
                React.createElement(MetricRow, { 
                    key: 'eventRain', label: "Event Rain", value: weatherData.eventRain, unit: "in", history: history.eventRain,
                    enabled: state.eventRainEnabled, onToggle: v => updateProperty('eventRainEnabled', v),
                    invert: state.eventRainInvert, onInvert: v => updateProperty('eventRainInvert', v),
                    singleThreshold: state.eventRainThreshold, onSingleChange: v => updateProperty('eventRainThreshold', v),
                    min: 0, max: 2, step: 0.01, trend: getTrend(history.eventRain), range: getRange(history.eventRain),
                    isActive: evalResults.eventRain, socketKey: "event_rain", output: data.outputs.event_rain, emit, nodeId: data.id
                }),
                React.createElement(MetricRow, { 
                    key: 'dailyRain', label: "Daily Rain", value: weatherData.dailyRain, unit: "in", history: history.dailyRain,
                    enabled: state.dailyRainEnabled, onToggle: v => updateProperty('dailyRainEnabled', v),
                    invert: state.dailyRainInvert, onInvert: v => updateProperty('dailyRainInvert', v),
                    singleThreshold: state.dailyRainThreshold, onSingleChange: v => updateProperty('dailyRainThreshold', v),
                    min: 0, max: 2, step: 0.01, trend: getTrend(history.dailyRain), range: getRange(history.dailyRain),
                    isActive: evalResults.dailyRain, socketKey: "daily_rain", output: data.outputs.daily_rain, emit, nodeId: data.id
                })
            ]),
            isCollapsed && React.createElement('div', { key: 'collapsed', className: "weather-io-container" }, [
                React.createElement('div', { key: 'spacer', style: { flex: 1 } }),
                React.createElement('div', { key: 'outs', className: "outputs" }, 
                    Object.entries(data.outputs).map(([key, output]) => 
                        React.createElement('div', { key: key, style: { display: "flex", alignItems: "center", gap: "8px", justifyContent: 'flex-end', marginBottom: '4px' } }, [
                            React.createElement('span', { key: 'l', className: "weather-socket-label", style: { color: evalResults[key] ? '#4caf50' : '#aaa' } }, output.label),
                            React.createElement(RefComponent, { 
                                key: 'r',
                                init: ref => emit({ type: "render", data: { type: "socket", element: ref, payload: output.socket, nodeId: data.id, side: "output", key } }), 
                                unmount: ref => emit({ type: "unmount", data: { element: ref } }) 
                            })
                        ])
                    )
                )
            ])
        ]);
    }

    window.nodeRegistry.register('WeatherLogicNode', {
        label: "Weather Logic",
        category: "Weather",
        nodeClass: WeatherLogicNode,
        factory: (cb) => new WeatherLogicNode(cb),
        component: WeatherLogicNodeComponent
    });

    // console.log("[WeatherLogicNode] Registered");
})();
