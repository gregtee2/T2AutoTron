// custom_nodes/Logic/WeatherLogicNode.js
class WeatherLogicNode extends LiteGraph.LGraphNode {
    constructor() {
        super();
        this.title = "Weather Logic";
        this.size = []; // Will be set in onAdded
        this.bgcolor = "rgb(50, 68, 73)";
        this.instanceId = Math.random().toString(36).substr(2, 9); // Unique ID for this instance

        console.log('[WeatherLogicNode] Constructor size set to:', this.size, 'Instance ID:', this.instanceId);

        this.properties = {
            solarEnabled: true,
            solarThresholdHigh: 750,
            solarThresholdLow: 500,
            solarInvert: false,
            solarLabel: "Solar",
            tempEnabled: true,
            tempThresholdHigh: 80,
            tempThresholdLow: 60,
            tempInvert: false,
            tempLabel: "Temp",
            humidityEnabled: true,
            humidityThresholdHigh: 70,
            humidityThresholdLow: 30,
            humidityInvert: false,
            humidityLabel: "Humidity",
            windEnabled: true,
            windThresholdHigh: 15,
            windThresholdLow: 5,
            windInvert: false,
            windLabel: "Wind",
            hourlyRainEnabled: true,
            hourlyRainThreshold: 0.1,
            hourlyRainInvert: false,
            hourlyRainLabel: "Hourly Rain",
            eventRainEnabled: true,
            eventRainThreshold: 0.1,
            eventRainInvert: false,
            eventRainLabel: "Event Rain",
            dailyRainEnabled: true,
            dailyRainThreshold: 0.1,
            dailyRainInvert: false,
            dailyRainLabel: "Daily Rain",
            logicType: "OR",
            hysteresis: 5
        };

        this.addOutput("All", "boolean");
        this.addOutput(this.properties.solarLabel, "boolean");
        this.addOutput(this.properties.tempLabel, "boolean");
        this.addOutput(this.properties.humidityLabel, "boolean");
        this.addOutput(this.properties.windLabel, "boolean");
        this.addOutput(this.properties.hourlyRainLabel, "boolean");
        this.addOutput(this.properties.eventRainLabel, "boolean");
        this.addOutput(this.properties.dailyRainLabel, "boolean");

        this.spacer = this.addWidget("text", "", "", () => {}, { height: 200 });

        this.solarToggle = this.addWidget("toggle", "Solar Enabled", this.properties.solarEnabled, (v) => {
            this.properties.solarEnabled = v;
            console.log('[WeatherLogicNode] Solar Enabled set to:', v, 'Instance ID:', this.instanceId);
            this.evaluateWeather();
            this.setDirtyCanvas(true);
        });
        this.solarInvert = this.addWidget("toggle", "Invert Solar", this.properties.solarInvert, (v) => {
            this.properties.solarInvert = v;
            console.log('[WeatherLogicNode] Solar Invert set to:', v, 'Instance ID:', this.instanceId);
            this.evaluateWeather();
            this.setDirtyCanvas(true);
        });
        this.solarLabelWidget = this.addWidget("text", "Solar Label", this.properties.solarLabel, (v) => {
            this.properties.solarLabel = v;
            this.outputs[1].name = v;
            this.setDirtyCanvas(true);
        });
        this.solarHighSlider = this.addWidget("slider", "Solar High (W/m²)", this.properties.solarThresholdHigh, (v) => {
            this.properties.solarThresholdHigh = Math.round(v);
            this.evaluateWeather();
            this.setDirtyCanvas(true);
        }, { min: 0, max: 1000, step: 10 });
        this.solarLowSlider = this.addWidget("slider", "Solar Low (W/m²)", this.properties.solarThresholdLow, (v) => {
            this.properties.solarThresholdLow = Math.round(v);
            this.evaluateWeather();
            this.setDirtyCanvas(true);
        }, { min: 0, max: 1000, step: 10 });

        this.tempToggle = this.addWidget("toggle", "Temp Enabled", this.properties.tempEnabled, (v) => {
            this.properties.tempEnabled = v;
            console.log('[WeatherLogicNode] Temp Enabled set to:', v, 'Instance ID:', this.instanceId);
            this.evaluateWeather();
            this.setDirtyCanvas(true);
        });
        this.tempInvert = this.addWidget("toggle", "Invert Temp", this.properties.tempInvert, (v) => {
            this.properties.tempInvert = v;
            console.log('[WeatherLogicNode] Temp Invert set to:', v, 'Instance ID:', this.instanceId);
            this.evaluateWeather();
            this.setDirtyCanvas(true);
        });
        this.tempLabelWidget = this.addWidget("text", "Temp Label", this.properties.tempLabel, (v) => {
            this.properties.tempLabel = v;
            this.outputs[2].name = v;
            this.setDirtyCanvas(true);
        });
        this.tempHighSlider = this.addWidget("slider", "Temp High (°F)", this.properties.tempThresholdHigh, (v) => {
            this.properties.tempThresholdHigh = Math.round(v);
            this.evaluateWeather();
            this.setDirtyCanvas(true);
        }, { min: 0, max: 120, step: 1 });
        this.tempLowSlider = this.addWidget("slider", "Temp Low (°F)", this.properties.tempThresholdLow, (v) => {
            this.properties.tempThresholdLow = Math.round(v);
            this.evaluateWeather();
            this.setDirtyCanvas(true);
        }, { min: 0, max: 120, step: 1 });

        this.humidityToggle = this.addWidget("toggle", "Humidity Enabled", this.properties.humidityEnabled, (v) => {
            this.properties.humidityEnabled = v;
            console.log('[WeatherLogicNode] Humidity Enabled set to:', v, 'Instance ID:', this.instanceId);
            this.evaluateWeather();
            this.setDirtyCanvas(true);
        });
        this.humidityInvert = this.addWidget("toggle", "Invert Humidity", this.properties.humidityInvert, (v) => {
            this.properties.humidityInvert = v;
            console.log('[WeatherLogicNode] Humidity Invert set to:', v, 'Instance ID:', this.instanceId);
            this.evaluateWeather();
            this.setDirtyCanvas(true);
        });
        this.humidityLabelWidget = this.addWidget("text", "Humidity Label", this.properties.humidityLabel, (v) => {
            this.properties.humidityLabel = v;
            this.outputs[3].name = v;
            this.setDirtyCanvas(true);
        });
        this.humidityHighSlider = this.addWidget("slider", "Humidity High (%)", this.properties.humidityThresholdHigh, (v) => {
            this.properties.humidityThresholdHigh = Math.round(v);
            this.evaluateWeather();
            this.setDirtyCanvas(true);
        }, { min: 0, max: 100, step: 1 });
        this.humidityLowSlider = this.addWidget("slider", "Humidity Low (%)", this.properties.humidityThresholdLow, (v) => {
            this.properties.humidityThresholdLow = Math.round(v);
            this.evaluateWeather();
            this.setDirtyCanvas(true);
        }, { min: 0, max: 100, step: 1 });

        this.windToggle = this.addWidget("toggle", "Wind Enabled", this.properties.windEnabled, (v) => {
            this.properties.windEnabled = v;
            console.log('[WeatherLogicNode] Wind Enabled set to:', v, 'Instance ID:', this.instanceId);
            this.evaluateWeather();
            this.setDirtyCanvas(true);
        });
        this.windInvert = this.addWidget("toggle", "Invert Wind", this.properties.windInvert, (v) => {
            this.properties.windInvert = v;
            console.log('[WeatherLogicNode] Wind Invert set to:', v, 'Instance ID:', this.instanceId);
            this.evaluateWeather();
            this.setDirtyCanvas(true);
        });
        this.windLabelWidget = this.addWidget("text", "Wind Label", this.properties.windLabel, (v) => {
            this.properties.windLabel = v;
            this.outputs[4].name = v;
            this.setDirtyCanvas(true);
        });
        this.windHighSlider = this.addWidget("slider", "Wind High (mph)", this.properties.windThresholdHigh, (v) => {
            this.properties.windThresholdHigh = Math.round(v);
            this.evaluateWeather();
            this.setDirtyCanvas(true);
        }, { min: 0, max: 50, step: 1 });
        this.windLowSlider = this.addWidget("slider", "Wind Low (mph)", this.properties.windThresholdLow, (v) => {
            this.properties.windThresholdLow = Math.round(v);
            this.evaluateWeather();
            this.setDirtyCanvas(true);
        }, { min: 0, max: 50, step: 1 });

        this.hourlyRainToggle = this.addWidget("toggle", "Hourly Rain Enabled", this.properties.hourlyRainEnabled, (v) => {
            this.properties.hourlyRainEnabled = v;
            console.log('[WeatherLogicNode] Hourly Rain Enabled set to:', v, 'Instance ID:', this.instanceId);
            this.evaluateWeather();
            this.setDirtyCanvas(true);
        });
        this.hourlyRainInvert = this.addWidget("toggle", "Invert Hourly Rain", this.properties.hourlyRainInvert, (v) => {
            this.properties.hourlyRainInvert = v;
            console.log('[WeatherLogicNode] Hourly Rain Invert set to:', v, 'Instance ID:', this.instanceId);
            this.evaluateWeather();
            this.setDirtyCanvas(true);
        });
        this.hourlyRainLabelWidget = this.addWidget("text", "Hourly Rain Label", this.properties.hourlyRainLabel, (v) => {
            this.properties.hourlyRainLabel = v;
            this.outputs[5].name = v;
            this.setDirtyCanvas(true);
        });
        this.hourlyRainSlider = this.addWidget("slider", "Hourly Rain Threshold (in)", this.properties.hourlyRainThreshold, (v) => {
            this.properties.hourlyRainThreshold = parseFloat(v.toFixed(2));
            this.evaluateWeather();
            this.setDirtyCanvas(true);
        }, { min: 0, max: 2, step: 0.01 });

        this.eventRainToggle = this.addWidget("toggle", "Event Rain Enabled", this.properties.eventRainEnabled, (v) => {
            this.properties.eventRainEnabled = v;
            console.log('[WeatherLogicNode] Event Rain Enabled set to:', v, 'Instance ID:', this.instanceId);
            this.evaluateWeather();
            this.setDirtyCanvas(true);
        });
        this.eventRainInvert = this.addWidget("toggle", "Invert Event Rain", this.properties.eventRainInvert, (v) => {
            this.properties.eventRainInvert = v;
            console.log('[WeatherLogicNode] Event Rain Invert set to:', v, 'Instance ID:', this.instanceId);
            this.evaluateWeather();
            this.setDirtyCanvas(true);
        });
        this.eventRainLabelWidget = this.addWidget("text", "Event Rain Label", this.properties.eventRainLabel, (v) => {
            this.properties.eventRainLabel = v;
            this.outputs[6].name = v;
            this.setDirtyCanvas(true);
        });
        this.eventRainSlider = this.addWidget("slider", "Event Rain Threshold (in)", this.properties.eventRainThreshold, (v) => {
            this.properties.eventRainThreshold = parseFloat(v.toFixed(2));
            this.evaluateWeather();
            this.setDirtyCanvas(true);
        }, { min: 0, max: 2, step: 0.01 });

        this.dailyRainToggle = this.addWidget("toggle", "Daily Rain Enabled", this.properties.dailyRainEnabled, (v) => {
            this.properties.dailyRainEnabled = v;
            console.log('[WeatherLogicNode] Daily Rain Enabled set to:', v, 'Instance ID:', this.instanceId);
            this.evaluateWeather();
            this.setDirtyCanvas(true);
        });
        this.dailyRainInvert = this.addWidget("toggle", "Invert Daily Rain", this.properties.dailyRainInvert, (v) => {
            this.properties.dailyRainInvert = v;
            console.log('[WeatherLogicNode] Daily Rain Invert set to:', v, 'Instance ID:', this.instanceId);
            this.evaluateWeather();
            this.setDirtyCanvas(true);
        });
        this.dailyRainLabelWidget = this.addWidget("text", "Daily Rain Label", this.properties.dailyRainLabel, (v) => {
            this.properties.dailyRainLabel = v;
            this.outputs[7].name = v;
            this.setDirtyCanvas(true);
        });
        this.dailyRainSlider = this.addWidget("slider", "Daily Rain Threshold (in)", this.properties.dailyRainThreshold, (v) => {
            this.properties.dailyRainThreshold = parseFloat(v.toFixed(2));
            this.evaluateWeather();
            this.setDirtyCanvas(true);
        }, { min: 0, max: 2, step: 0.01 });

        this.logicTypeWidget = this.addWidget("combo", "Logic Type", this.properties.logicType, (v) => {
            this.properties.logicType = v;
            this.evaluateWeather();
            this.setDirtyCanvas(true);
        }, { values: ["AND", "OR"] });

        this.updateButton = this.addWidget("button", "Update Now", null, () => {
            if (this.socket) {
                console.log('[WeatherLogicNode] Manual update requested', 'Instance ID:', this.instanceId);
                this.socket.emit('request-weather-update');
            } else {
                console.log('[WeatherLogicNode] Socket not ready, cannot request update', 'Instance ID:', this.instanceId);
            }
        });

        this.lastSolar = null;
        this.lastTemp = null;
        this.lastHumidity = null;
        this.lastWind = null;
        this.lastHourlyRain = null;
        this.lastEventRain = null;
        this.lastDailyRain = null;
        this.lastUpdateTime = 0;
        this.lastEvalTime = 0;
        this.lastUpdateDate = null; // Track the last processed weather update date
        this.socket = null;
        this.conditionStates = {};
        this.statusColor = "gray";
        this.solarHistory = [];
        this.tempHistory = [];
        this.humidityHistory = [];
        this.windHistory = [];
        this.hourlyRainHistory = [];
        this.eventRainHistory = [];
        this.dailyRainHistory = [];

        console.log('[WeatherLogicNode] Initialized with defaults:', this.properties, 'Instance ID:', this.instanceId);
        this.initializeSocket();
    }

    initializeSocket() {
        const checkSocket = () => {
            this.socket = LiteGraph.LGraphNode.prototype.sharedSocket;
            if (this.socket) {
                console.log('[WeatherLogicNode] Socket initialized:', this.socket.id, 'Instance ID:', this.instanceId);
                this.socket.on('weather-update', (data) => {
                    console.log('[WeatherLogicNode] Received weather-update at:', new Date().toISOString(), JSON.stringify(data), 'Instance ID:', this.instanceId);
                    // Check if this is a duplicate update based on the date
                    if (this.lastUpdateDate && data.date === this.lastUpdateDate) {
                        console.log('[WeatherLogicNode] Skipping duplicate weather-update with date:', data.date, 'Instance ID:', this.instanceId);
                        return;
                    }
                    this.lastUpdateDate = data.date;

                    const timestamp = Date.now();
                    this.lastSolar = this.validateNumber(data.solarradiation, this.lastSolar, 0, 1000);
                    this.lastTemp = this.validateNumber(data.tempf, this.lastTemp, -50, 150);
                    this.lastHumidity = this.validateNumber(data.humidity, this.lastHumidity, 0, 100);
                    this.lastWind = this.validateNumber(data.windspeedmph, this.lastWind, 0, 100);
                    this.lastHourlyRain = this.validateNumber(data.hourlyrainin, this.lastHourlyRain, 0, 10);
                    this.lastEventRain = this.validateNumber(data.eventrainin, this.lastEventRain, 0, 10);
                    this.lastDailyRain = this.validateNumber(data.dailyrainin, this.lastDailyRain, 0, 10);

                    console.log('[WeatherLogicNode] Updated last values - Solar:', this.lastSolar, 'Temp:', this.lastTemp, 'Humidity:', this.lastHumidity, 'Wind:', this.lastWind, 'Instance ID:', this.instanceId);

                    this.updateHistory(this.solarHistory, this.lastSolar, timestamp);
                    this.updateHistory(this.tempHistory, this.lastTemp, timestamp);
                    this.updateHistory(this.humidityHistory, this.lastHumidity, timestamp);
                    this.updateHistory(this.windHistory, this.lastWind, timestamp);
                    this.updateHistory(this.hourlyRainHistory, this.lastHourlyRain, timestamp);
                    this.updateHistory(this.eventRainHistory, this.lastEventRain, timestamp);
                    this.updateHistory(this.dailyRainHistory, this.lastDailyRain, timestamp);

                    console.log('[WeatherLogicNode] Updated solarHistory:', this.solarHistory, 'Instance ID:', this.instanceId);

                    this.saveHistoryToStorage();

                    console.log('[WeatherLogicNode] Updated values - Hourly Rain:', this.lastHourlyRain, 'Event Rain:', this.lastEventRain, 'Daily Rain:', this.lastDailyRain, 'Instance ID:', this.instanceId);
                    this.lastUpdateTime = timestamp;
                    this.statusColor = "green";
                    this.evaluateWeather();
                });
                this.socket.on('connect_error', () => {
                    this.statusColor = "red";
                    this.setDirtyCanvas(true);
                    console.log('[WeatherLogicNode] Socket connection error, retrying...', 'Instance ID:', this.instanceId);
                    setTimeout(checkSocket, 5000); // Retry every 5 seconds
                });
                this.socket.emit('request-weather-update');
                console.log('[WeatherLogicNode] Requested immediate weather update', 'Instance ID:', this.instanceId);
            } else {
                console.log('[WeatherLogicNode] Waiting for shared socket...', 'Instance ID:', this.instanceId);
                setTimeout(checkSocket, 500);
            }
        };
        checkSocket();
    }

    validateNumber(value, fallback, min, max) {
        if (value === undefined || value === null || isNaN(value)) return fallback;
        return Math.max(min, Math.min(max, value));
    }

    updateHistory(historyArray, value, timestamp) {
        if (!value && value !== 0) return;
        historyArray.push({ value, timestamp });
        const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
        while (historyArray.length > 0 && historyArray[0].timestamp < twentyFourHoursAgo) {
            historyArray.shift();
        }
    }

    saveHistoryToStorage() {
        const storageKey = `WeatherLogicNode_${this.id || 'default'}_history`;
        const historyData = {
            solarHistory: this.solarHistory,
            tempHistory: this.tempHistory,
            humidityHistory: this.humidityHistory,
            windHistory: this.windHistory,
            hourlyRainHistory: this.hourlyRainHistory,
            eventRainHistory: this.eventRainHistory,
            dailyRainHistory: this.dailyRainHistory,
            lastUpdateTime: this.lastUpdateTime
        };
        localStorage.setItem(storageKey, JSON.stringify(historyData));
        console.log('[WeatherLogicNode] Saved history to localStorage at:', new Date().toISOString(), storageKey, 'Instance ID:', this.instanceId);
    }

    loadHistoryFromStorage() {
        const storageKey = `WeatherLogicNode_${this.id || 'default'}_history`;
        const storedData = localStorage.getItem(storageKey);
        if (storedData) {
            const data = JSON.parse(storedData);
            const mergeHistory = (simulated, loaded) => {
                const merged = [...simulated];
                loaded.forEach(entry => {
                    if (entry.timestamp >= Date.now() - 24 * 60 * 60 * 1000) {
                        merged.push(entry);
                    }
                });
                merged.sort((a, b) => a.timestamp - b.timestamp);
                return merged.filter((entry, index, arr) =>
                    index === 0 || entry.timestamp !== arr[index - 1].timestamp
                );
            };

            this.solarHistory = mergeHistory(this.solarHistory, data.solarHistory || []);
            this.tempHistory = mergeHistory(this.tempHistory, data.tempHistory || []);
            this.humidityHistory = mergeHistory(this.humidityHistory, data.humidityHistory || []);
            this.windHistory = mergeHistory(this.windHistory, data.windHistory || []);
            this.hourlyRainHistory = mergeHistory(this.hourlyRainHistory, data.hourlyRainHistory || []);
            this.eventRainHistory = mergeHistory(this.eventRainHistory, data.eventRainHistory || []);
            this.dailyRainHistory = mergeHistory(this.dailyRainHistory, data.dailyRainHistory || []);
            this.lastUpdateTime = data.lastUpdateTime || 0;

            // Only update last values if the stored data is more recent
            const latestStoredSolar = this.solarHistory.length > 0 ? this.solarHistory[this.solarHistory.length - 1] : null;
            if (latestStoredSolar && (!this.lastSolar || latestStoredSolar.timestamp > this.lastUpdateTime)) {
                this.lastSolar = latestStoredSolar.value;
            }
            const latestStoredTemp = this.tempHistory.length > 0 ? this.tempHistory[this.tempHistory.length - 1] : null;
            if (latestStoredTemp && (!this.lastTemp || latestStoredTemp.timestamp > this.lastUpdateTime)) {
                this.lastTemp = latestStoredTemp.value;
            }
            const latestStoredHumidity = this.humidityHistory.length > 0 ? this.humidityHistory[this.humidityHistory.length - 1] : null;
            if (latestStoredHumidity && (!this.lastHumidity || latestStoredHumidity.timestamp > this.lastUpdateTime)) {
                this.lastHumidity = latestStoredHumidity.value;
            }
            const latestStoredWind = this.windHistory.length > 0 ? this.windHistory[this.windHistory.length - 1] : null;
            if (latestStoredWind && (!this.lastWind || latestStoredWind.timestamp > this.lastUpdateTime)) {
                this.lastWind = latestStoredWind.value;
            }
            const latestStoredHourlyRain = this.hourlyRainHistory.length > 0 ? this.hourlyRainHistory[this.hourlyRainHistory.length - 1] : null;
            if (latestStoredHourlyRain && (!this.lastHourlyRain || latestStoredHourlyRain.timestamp > this.lastUpdateTime)) {
                this.lastHourlyRain = latestStoredHourlyRain.value;
            }
            const latestStoredEventRain = this.eventRainHistory.length > 0 ? this.eventRainHistory[this.eventRainHistory.length - 1] : null;
            if (latestStoredEventRain && (!this.lastEventRain || latestStoredEventRain.timestamp > this.lastUpdateTime)) {
                this.lastEventRain = latestStoredEventRain.value;
            }
            const latestStoredDailyRain = this.dailyRainHistory.length > 0 ? this.dailyRainHistory[this.dailyRainHistory.length - 1] : null;
            if (latestStoredDailyRain && (!this.lastDailyRain || latestStoredDailyRain.timestamp > this.lastUpdateTime)) {
                this.lastDailyRain = latestStoredDailyRain.value;
            }

            console.log('[WeatherLogicNode] Loaded and merged history from localStorage:', storageKey, 'Instance ID:', this.instanceId);
            console.log('[WeatherLogicNode] Merged solarHistory:', this.solarHistory, 'Instance ID:', this.instanceId);
        }
    }

    get24HourRange(history) {
        if (!history || history.length === 0) return { min: 0, max: 0 }; // Return numeric defaults
        const values = history.map(entry => entry.value).filter(val => typeof val === 'number' && !isNaN(val));
        if (values.length === 0) return { min: 0, max: 0 }; // Return numeric defaults if no valid numbers
        return {
            min: Math.min(...values),
            max: Math.max(...values)
        };
    }

    onAdded() {
        this.initializeSocket();
        this.size = [650, 1100];
        this.setDirtyCanvas(true);
        console.log('[WeatherLogicNode] Added to graph, ID:', this.id, 'Forced size:', this.size, 'Instance ID:', this.instanceId);
        // Count instances
        const allNodes = this.graph ? this.graph._nodes : [];
        const weatherNodes = allNodes.filter(node => node.type === "Logic/WeatherLogic");
        console.log('[WeatherLogicNode] Total WeatherLogicNode instances in graph:', weatherNodes.length, 'Instance ID:', this.instanceId);
        this.loadHistoryFromStorage();
    }

    onExecute() {
        const now = Date.now();
        if (now - this.lastEvalTime < 1000) return;

        this.properties.solarThresholdHigh = Math.round(this.solarHighSlider.value);
        this.properties.solarThresholdLow = Math.round(this.solarLowSlider.value);
        this.properties.solarEnabled = this.solarToggle.value;
        this.properties.tempThresholdHigh = Math.round(this.tempHighSlider.value);
        this.properties.tempThresholdLow = Math.round(this.tempLowSlider.value);
        this.properties.tempEnabled = this.tempToggle.value;
        this.properties.humidityThresholdHigh = Math.round(this.humidityHighSlider.value);
        this.properties.humidityThresholdLow = Math.round(this.humidityLowSlider.value);
        this.properties.humidityEnabled = this.humidityToggle.value;
        this.properties.windThresholdHigh = Math.round(this.windHighSlider.value);
        this.properties.windThresholdLow = Math.round(this.windLowSlider.value);
        this.properties.windEnabled = this.windToggle.value;
        this.properties.hourlyRainThreshold = parseFloat(this.hourlyRainSlider.value.toFixed(2));
        this.properties.hourlyRainEnabled = this.hourlyRainToggle.value;
        this.properties.eventRainThreshold = parseFloat(this.eventRainSlider.value.toFixed(2));
        this.properties.eventRainEnabled = this.eventRainToggle.value;
        this.properties.dailyRainThreshold = parseFloat(this.dailyRainSlider.value.toFixed(2));
        this.properties.dailyRainEnabled = this.dailyRainToggle.value;
        this.properties.logicType = this.logicTypeWidget.value;

        if (this.lastSolar !== null && this.lastDailyRain !== null) {
            if (now - this.lastUpdateTime > 600000) {
                this.statusColor = "yellow";
            }
            this.evaluateWeather();
        }
        this.lastEvalTime = now;
    }

    evaluateWeather() {
        if (this.lastSolar === null || this.lastDailyRain === null) {
            console.log('[WeatherLogicNode] Waiting for initial weather data, skipping evaluation', 'Instance ID:', this.instanceId);
            return;
        }

        const {
            solarEnabled, solarThresholdHigh, solarThresholdLow, solarInvert,
            tempEnabled, tempThresholdHigh, tempThresholdLow, tempInvert,
            humidityEnabled, humidityThresholdHigh, humidityThresholdLow, humidityInvert,
            windEnabled, windThresholdHigh, windThresholdLow, windInvert,
            hourlyRainEnabled, hourlyRainThreshold, hourlyRainInvert,
            eventRainEnabled, eventRainThreshold, eventRainInvert,
            dailyRainEnabled, dailyRainThreshold, dailyRainInvert,
            logicType, hysteresis
        } = this.properties;

        const conditions = [];
        this.conditionStates = {};

        const applyHysteresis = (value, low, high, prevState, invert) => {
            const effectiveLow = Math.min(low, high);
            const effectiveHigh = Math.max(low, high);
            const buffer = (effectiveHigh - effectiveLow) * (hysteresis / 100);
            const inRange = value >= effectiveLow && value <= effectiveHigh;
            let state = inRange;
            if (prevState !== undefined) {
                state = prevState ? (value >= effectiveLow - buffer) : inRange;
            }
            return invert ? !state : state;
        };

        this.conditionStates.solar = solarEnabled && applyHysteresis(this.lastSolar, solarThresholdLow, solarThresholdHigh, this.conditionStates.solar, solarInvert);
        this.outputs[1].color_on = this.conditionStates.solar ? "#00FF00" : "#00AADD";
        if (solarEnabled) conditions.push(this.conditionStates.solar);
        this.setOutputData(1, this.conditionStates.solar);

        this.conditionStates.temp = tempEnabled && applyHysteresis(this.lastTemp, tempThresholdLow, tempThresholdHigh, this.conditionStates.temp, tempInvert);
        this.outputs[2].color_on = this.conditionStates.temp ? "#00FF00" : "#00AADD";
        if (tempEnabled) conditions.push(this.conditionStates.temp);
        this.setOutputData(2, this.conditionStates.temp);

        this.conditionStates.humidity = humidityEnabled && applyHysteresis(this.lastHumidity, humidityThresholdLow, humidityThresholdHigh, this.conditionStates.humidity, humidityInvert);
        this.outputs[3].color_on = this.conditionStates.humidity ? "#00FF00" : "#00AADD";
        if (humidityEnabled) conditions.push(this.conditionStates.humidity);
        this.setOutputData(3, this.conditionStates.humidity);

        this.conditionStates.wind = windEnabled && applyHysteresis(this.lastWind, windThresholdLow, windThresholdHigh, this.conditionStates.wind, windInvert);
        this.outputs[4].color_on = this.conditionStates.wind ? "#00FF00" : "#00AADD";
        if (windEnabled) conditions.push(this.conditionStates.wind);
        this.setOutputData(4, this.conditionStates.wind);

        this.conditionStates.hourlyRain = hourlyRainEnabled && (this.lastHourlyRain >= hourlyRainThreshold);
        if (hourlyRainInvert) this.conditionStates.hourlyRain = !this.conditionStates.hourlyRain;
        this.outputs[5].color_on = this.conditionStates.hourlyRain ? "#00FF00" : "#00AADD";
        if (hourlyRainEnabled) conditions.push(this.conditionStates.hourlyRain);
        this.setOutputData(5, this.conditionStates.hourlyRain);

        this.conditionStates.eventRain = eventRainEnabled && (this.lastEventRain >= eventRainThreshold);
        if (eventRainInvert) this.conditionStates.eventRain = !this.conditionStates.eventRain;
        this.outputs[6].color_on = this.conditionStates.eventRain ? "#00FF00" : "#00AADD";
        if (eventRainEnabled) conditions.push(this.conditionStates.eventRain);
        this.setOutputData(6, this.conditionStates.eventRain);

        this.conditionStates.dailyRain = dailyRainEnabled && (this.lastDailyRain >= dailyRainThreshold);
        if (dailyRainInvert) this.conditionStates.dailyRain = !this.conditionStates.dailyRain;
        this.outputs[7].color_on = this.conditionStates.dailyRain ? "#00FF00" : "#00AADD";
        if (dailyRainEnabled) conditions.push(this.conditionStates.dailyRain);
        this.setOutputData(7, this.conditionStates.dailyRain);

        let allState = false;
        if (conditions.length > 0) {
            allState = logicType === "AND" ? conditions.every(c => c) : conditions.some(c => c);
        }
        this.outputs[0].color_on = allState ? "#00FF00" : "#00AADD";
        this.setOutputData(0, allState);

        this.setDirtyCanvas(true, true);
    }

    getTrend(history) {
        if (history.length < 2) {
            return { state: "Stable", arrow: "→" };
        }
        const current = history[history.length - 1].value;
        const previous = history[history.length - 2].value;
        const delta = current - previous;
        if (delta > 0.01) return { state: "Rising", arrow: "↑" };
        if (delta < -0.01) return { state: "Falling", arrow: "↓" };
        return { state: "Stable", arrow: "→" };
    }

    onDrawForeground(ctx) {
        if (this.flags.collapsed) return;

        const allState = this.getOutputData(0) || false;
        ctx.lineWidth = 4;
        ctx.strokeStyle = this.statusColor;
        ctx.strokeRect(0, 0, this.size[0], this.size[1]);

        ctx.font = "14px Arial";
        ctx.textAlign = "left";

        const drawBarGraph = (history, xStart, yStart, width, height, maxValue) => {
            if (!history || history.length < 1) return;

            const twoHoursAgo = Date.now() - (120 * 60 * 1000);
            const recentHistory = history.filter(entry => entry.timestamp >= twoHoursAgo);
            const numBars = 40;
            const recentData = recentHistory.slice(-numBars);

            const barWidth = width / numBars;
            ctx.fillStyle = "#00AADD";

            const logMax = Math.log(maxValue + 1);
            recentData.forEach((entry, i) => {
                const logValue = Math.log(entry.value + 0.5);
                const barHeight = Math.max(0, (logValue / logMax) * height);
                const x = xStart + i * barWidth;
                const y = yStart + height - barHeight;
                ctx.fillRect(x, y, barWidth - 0.5, barHeight);
            });
        };

        const metrics = [
            { history: this.solarHistory, label: `Solar: ${this.lastSolar !== null ? this.lastSolar.toFixed(1) : 'N/A'} W/m²`, maxValue: 1000, outputIndex: 1 },
            { history: this.tempHistory, label: `Temp: ${this.lastTemp !== null ? this.lastTemp.toFixed(1) : 'N/A'} °F`, maxValue: 120, outputIndex: 2 },
            { history: this.humidityHistory, label: `Humidity: ${this.lastHumidity !== null ? this.lastHumidity.toFixed(0) : 'N/A'} %`, maxValue: 100, outputIndex: 3 },
            { history: this.windHistory, label: `Wind: ${this.lastWind !== null ? this.lastWind.toFixed(1) : 'N/A'} mph`, maxValue: 50, outputIndex: 4 },
            { history: this.hourlyRainHistory, label: `Hourly Rain: ${this.lastHourlyRain !== null ? this.lastHourlyRain.toFixed(2) : 'N/A'} in`, maxValue: 2, outputIndex: 5 },
            { history: this.eventRainHistory, label: `Event Rain: ${this.lastEventRain !== null ? this.lastEventRain.toFixed(2) : 'N/A'} in`, maxValue: 2, outputIndex: 6 },
            { history: this.dailyRainHistory, label: `Daily Rain: ${this.lastDailyRain !== null ? this.lastDailyRain.toFixed(2) : 'N/A'} in`, maxValue: 2, outputIndex: 7 }
        ];

        metrics.forEach((metric, index) => {
            const slotPosY = this.getConnectionPos(false, metric.outputIndex)[1] - this.pos[1];
            const textY = slotPosY + 4;

            const trend = this.getTrend(metric.history);
            const range = this.get24HourRange(metric.history);

            ctx.fillStyle = "#FFFFFF";
            ctx.font = "14px Arial";
            ctx.fillText(`${metric.label} ${trend.state}`, 10, textY);

            ctx.font = "18px Arial";
            ctx.fillStyle = trend.arrow === "↑" ? "#00FF00" : trend.arrow === "↓" ? "#FF0000" : "#FFFF00";
            ctx.fillText(trend.arrow, 220, textY);

            ctx.font = "14px Arial";
            ctx.fillStyle = "#FFFFFF";
            // Format range with appropriate decimals, ensuring min/max are numbers
            const minDisplay = typeof range.min === 'number' ? range.min.toFixed(index < 4 ? 1 : 2) : 'N/A';
            const maxDisplay = typeof range.max === 'number' ? range.max.toFixed(index < 4 ? 1 : 2) : 'N/A';
            ctx.fillText(`[${minDisplay}-${maxDisplay}]`, 260, textY);

            drawBarGraph(metric.history, 340, textY - 12, 100, 15, metric.maxValue);
        });

        for (let i = 0; i < this.outputs.length; i++) {
            const value = this.getOutputData(i) || false;
            const isEnabled = [
                this.properties.solarEnabled,
                this.properties.tempEnabled,
                this.properties.humidityEnabled,
                this.properties.windEnabled,
                this.properties.hourlyRainEnabled,
                this.properties.eventRainEnabled,
                this.properties.dailyRainEnabled
            ][i - 1] || true;
            if (value && isEnabled) {
                const slotPosY = this.getConnectionPos(false, i)[1] - this.pos[1];
                const textX = this.size[0] - 120;
                const textY = slotPosY + 4;
                ctx.fillStyle = "#00FF00";
                ctx.fillText(this.outputs[i].name, textX, textY);
            }
        }
    }

    onConfigure(info) {
        console.log('[WeatherLogicNode] Configuring from saved state:', info.properties, 'Size before:', this.size, 'Instance ID:', this.instanceId);
        this.properties = Object.assign(this.properties, info.properties);
        this.size = [650, 1100];
        this.loadHistoryFromStorage();
        this.syncWidgets();
        this.evaluateWeather();
        console.log('[WeatherLogicNode] Size after configure:', this.size, 'Instance ID:', this.instanceId);
    }

    syncWidgets() {
        this.solarToggle.value = this.properties.solarEnabled;
        this.solarInvert.value = this.properties.solarInvert;
        this.solarLabelWidget.value = this.properties.solarLabel;
        this.solarHighSlider.value = this.properties.solarThresholdHigh;
        this.solarLowSlider.value = this.properties.solarThresholdLow;
        this.tempToggle.value = this.properties.tempEnabled;
        this.tempInvert.value = this.properties.tempInvert;
        this.tempLabelWidget.value = this.properties.tempLabel;
        this.tempHighSlider.value = this.properties.tempThresholdHigh;
        this.tempLowSlider.value = this.properties.tempThresholdLow;
        this.humidityToggle.value = this.properties.humidityEnabled;
        this.humidityInvert.value = this.properties.humidityInvert;
        this.humidityLabelWidget.value = this.properties.humidityLabel;
        this.humidityHighSlider.value = this.properties.humidityThresholdHigh;
        this.humidityLowSlider.value = this.properties.humidityThresholdLow;
        this.windToggle.value = this.properties.windEnabled;
        this.windInvert.value = this.properties.windInvert;
        this.windLabelWidget.value = this.properties.windLabel;
        this.windHighSlider.value = this.properties.windThresholdHigh;
        this.windLowSlider.value = this.properties.windThresholdLow;
        this.hourlyRainToggle.value = this.properties.hourlyRainEnabled;
        this.hourlyRainInvert.value = this.properties.hourlyRainInvert;
        this.hourlyRainLabelWidget.value = this.properties.hourlyRainLabel;
        this.hourlyRainSlider.value = this.properties.hourlyRainThreshold;
        this.eventRainToggle.value = this.properties.eventRainEnabled;
        this.eventRainInvert.value = this.properties.eventRainInvert;
        this.eventRainLabelWidget.value = this.properties.eventRainLabel;
        this.eventRainSlider.value = this.properties.eventRainThreshold;
        this.dailyRainToggle.value = this.properties.dailyRainEnabled;
        this.dailyRainInvert.value = this.properties.dailyRainInvert;
        this.dailyRainLabelWidget.value = this.properties.dailyRainLabel;
        this.dailyRainSlider.value = this.properties.dailyRainThreshold;
        this.logicTypeWidget.value = this.properties.logicType;

        this.outputs[1].name = this.properties.solarLabel;
        this.outputs[2].name = this.properties.tempLabel;
        this.outputs[3].name = this.properties.humidityLabel;
        this.outputs[4].name = this.properties.windLabel;
        this.outputs[5].name = this.properties.hourlyRainLabel;
        this.outputs[6].name = this.properties.eventRainLabel;
        this.outputs[7].name = this.properties.dailyRainLabel;
    }
}

LiteGraph.registerNodeType("Logic/WeatherLogic", WeatherLogicNode);
console.log("WeatherLogicNode registered successfully under 'Logic' category");