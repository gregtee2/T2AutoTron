// js/socket-handler.js - Socket Handler with Integrated DeviceControl

const SOCKET_CONFIG = {
    url: "http://localhost:3000",
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    randomizationFactor: 0.5,
    timeout: 10000
};

const EVENTS = {
    CONNECT: 'connect',
    CONNECT_ERROR: 'connect_error',
    RECONNECT_ATTEMPT: 'reconnect_attempt',
    DEVICE_STATE_UPDATE: 'device-state-update',
    WEATHER_UPDATE: 'weather-update',
    FORECAST_UPDATE: 'forecast-update',
    REQUEST_WEATHER_UPDATE: 'request-weather-update'
};

let lastStates = {};
let lastSolarRadiation = null;
let lastDailyRain = null;
let cachedWeatherText = "Loading weather...";

function getVendorLabel(deviceType) {
    if (!deviceType) return "Unknown";
    const lower = deviceType.toLowerCase();
    return lower.includes("kasa") ? "Kasa" :
        (lower.includes("extended color") || lower.includes("color light") || lower.includes("hue")) ? "Hue" :
            lower.includes("shelly") ? "Shelly" : "Unknown";
}

function toHSV(hueVal, satVal, briVal) {
    if (hueVal == null || satVal == null || briVal == null) return null;
    return {
        h: Math.round((hueVal / 65535) * 360),
        s: Math.round((satVal / 254) * 100),
        v: Math.round((briVal / 254) * 100)
    };
}

function getTimestamp() {
    return new Date().toLocaleTimeString("en-US", { hour12: false });
}

function sanitizeString(str) {
    return (str || '').replace(/[<>&"']/g, match => ({
        '<': '<',
        '>': '>',
        '&': '&',
        '"': '"',
        "'": "'"
    })[match]);
}

function throttle(func, limit) {
    let lastFunc;
    let lastRan;
    return function (...args) {
        if (!lastRan) {
            func.apply(this, args);
            lastRan = Date.now();
        } else {
            clearTimeout(lastFunc);
            lastFunc = setTimeout(() => {
                if ((Date.now() - lastRan) >= limit) {
                    func.apply(this, args);
                    lastRan = Date.now();
                }
            }, limit - (Date.now() - lastRan));
        }
    };
}

function validateDeviceState(newState) {
    if (!newState || typeof newState.id !== 'string') {
        console.warn('Invalid device state: Missing or invalid id', newState);
        return false;
    }
    if (typeof newState.on !== 'boolean') {
        return false;
    }
    if (newState.id.includes('sensor') || newState.id.includes('switch')) {
        return true;
    }
    if (newState.brightness !== undefined && newState.brightness !== null) {
        if (typeof newState.brightness !== 'number') {
            console.warn('Invalid device state: brightness must be a number', newState);
            return false;
        }
        newState.brightness = newState.brightness > 100 ? Math.round((newState.brightness / 255) * 100) : newState.brightness;
        if (newState.brightness < 0 || newState.brightness > 100) {
            console.warn('Invalid device state: brightness must be between 0 and 100 after scaling', newState);
            return false;
        }
    }
    if (newState.hue !== undefined && newState.saturation !== undefined) {
        if (typeof newState.hue !== 'number' || newState.hue < 0 || newState.hue > 360) {
            console.warn('Invalid device state: hue must be a number between 0 and 360, defaulting to 0', newState);
            newState.hue = 0;
        }
        if (typeof newState.saturation !== 'number' || newState.saturation < 0 || newState.saturation > 100) {
            console.warn('Invalid device state: saturation must be a number between 0 and 100, defaulting to 0', newState);
            newState.saturation = 0;
        }
    } else {
        newState.hue = 0;
        newState.saturation = 0;
    }
    if (newState.transitiontime !== undefined && (typeof newState.transitiontime !== 'number' || newState.transitiontime < 0)) {
        console.warn('Invalid device state: transitiontime must be a non-negative number', newState);
        return false;
    }
    return true;
}

function fetchWithTimeout(url, options = {}, timeout = 5000) {
    return Promise.race([
        fetch(url, options),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Fetch timeout")), timeout)
        )
    ]);
}

function updateDeviceState(device) {
    const onVal = device.state?.on ?? false;
    const hsvVal = toHSV(device.state?.hue, device.state?.sat, device.state?.bri);
    const vendorLabel = getVendorLabel(device.type || device.vendor);
    lastStates[device.id] = {
        on: onVal,
        hsv: hsvVal,
        vendor: vendorLabel,
        name: device.name
    };
    let initMsg = `[INIT ${getTimestamp()}] [${vendorLabel}] ${sanitizeString(device.name)} => ${onVal ? "ON" : "OFF"}`;
    if (hsvVal) initMsg += `, HSV=(${hsvVal.h},${hsvVal.s},${hsvVal.v})`;
    logEvent(initMsg);
}

function initializeDevices(socket, graph, updateStatusCallback) {
    fetchWithTimeout(`${SOCKET_CONFIG.url}/api/devices`)
        .then(res => {
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            return res.json();
        })
        .then(data => {
            if (!data?.success || !data?.devices) throw new Error("Invalid device data");
            const allDevices = [...(data.devices.hue || []), ...(data.devices.kasa || []), ...(data.devices.shelly || [])];
            allDevices.forEach(updateDeviceState);
            updateStatusCallback("Connected", graph._nodes.length, Object.keys(lastStates).length);
        })
        .catch(err => {
            console.error('Fetch error:', err.message);
            logEvent(`Error fetching devices: ${err.message}`, "error");
            updateStatusCallback("Disconnected", graph._nodes.length, 0);
        });
}

// DeviceControl Class Definition
function DeviceControl(socket) {
    this.socket = socket;
    this.maxRetries = 3;
    this.retryDelay = 1000;
}

DeviceControl.prototype.sendCommand = async function (deviceId, vendor, action, options = {}) {
    const command = action === 'on' ? 'turnOn' : 'turnOff';
    return new Promise((resolve, reject) => {
        const payload = {
            deviceId,
            vendor,
            action,
            transition: options.transition || 0,
            brightness: options.brightness,
            hue: options.hue,
            saturation: options.saturation
        };
        console.log(`Sending ${command} to ${vendor} device ${deviceId} with payload:`, payload);

        this.socket.emit('device-toggle', payload, (response) => {
            if (response && response.success) {
                console.log(`Command ${command} succeeded for ${vendor} device ${deviceId}:`, response);
                this.socket.emit('device-state-update', {
                    id: deviceId,
                    on: action === 'on',
                    brightness: options.brightness,
                    hue: options.hue,
                    saturation: options.saturation,
                    vendor
                });
                resolve(true);
            } else {
                const errorMsg = response?.error || 'Unknown error';
                console.error(`Error sending ${command} to ${vendor} device ${deviceId}:`, errorMsg);
                if (options.retries < this.maxRetries) {
                    console.log(`Retrying (${options.retries + 1}/${this.maxRetries})...`);
                    setTimeout(() => {
                        this.sendCommand(deviceId, vendor, action, { ...options, retries: options.retries + 1 })
                            .then(resolve)
                            .catch(reject);
                    }, this.retryDelay);
                } else {
                    reject(new Error(`Max retries exceeded: ${errorMsg}`));
                }
            }
        });
        setTimeout(() => reject(new Error('Command timeout')), 5000);
    });
};

DeviceControl.prototype.turnOn = async function (deviceId, vendor, options = { retries: 0 }) {
    return this.sendCommand(deviceId, vendor, 'on', options);
};

DeviceControl.prototype.turnOff = async function (deviceId, vendor, options = { retries: 0 }) {
    return this.sendCommand(deviceId, vendor, 'off', options);
};

// Helper function to get custom weather icon SVG
function getWeatherIconSVG(condition) {
    const lowerCondition = (condition || '').toLowerCase();

    // Sun icon for clear/sunny
    if (lowerCondition.includes('clear') || lowerCondition.includes('sun')) {
        return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFD700" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>';
    }

    // Rain icon
    if (lowerCondition.includes('rain') || lowerCondition.includes('drizzle') || lowerCondition.includes('shower')) {
        return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4facfe" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 16.2A4.5 4.5 0 0 0 17.5 8h-1.8A7 7 0 1 0 4 14.9"></path><line x1="8" y1="19" x2="8" y2="21"></line><line x1="8" y1="13" x2="8" y2="15"></line><line x1="16" y1="19" x2="16" y2="21"></line><line x1="16" y1="13" x2="16" y2="15"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="12" y1="15" x2="12" y2="17"></line></svg>';
    }

    // Partial sun/cloud icon
    if (lowerCondition.includes('partly') || lowerCondition.includes('partial') || lowerCondition.includes('few')) {
        return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFD700" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2v2"></path><path d="M3 13h2"></path><path d="M20 13h2"></path><path d="M5.6 5.6l1.4 1.4"></path><path d="M18.4 5.6l-1.4 1.4"></path><path d="M13 22a5 5 0 0 0 5-5H8a5 5 0 0 0 5 5z" stroke="#B0C4DE"></path><path d="M13 17a5 5 0 0 0 0-10 5.5 5.5 0 0 0-5.5 5.5" stroke="#B0C4DE"></path></svg>';
    }

    // Cloud icon for overcast/cloudy
    if (lowerCondition.includes('cloud') || lowerCondition.includes('overcast')) {
        return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#B0C4DE" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"></path></svg>';
    }

    // Default to cloud icon
    return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#B0C4DE" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"></path></svg>';
}

// Socket Setup Function
window.setupSocket = function (graph, updateStatusCallback) {
    if (typeof window.io !== 'function') {
        console.error("Socket.IO library not loaded!");
        logEvent("Socket.IO library not loaded", "error");
        throw new Error("Socket.IO not available");
    }

    const socket = window.io(SOCKET_CONFIG.url, SOCKET_CONFIG);
    LiteGraph.LGraphNode.prototype.sharedSocket = socket;

    const originalEmit = socket.emit;
    socket.emit = function (event, ...args) {
        console.log(`Sending ${event}:`, ...args);
        return originalEmit.apply(socket, [event, ...args]);
    };

    const deviceControl = new DeviceControl(socket);
    window.deviceControl = deviceControl;
    LiteGraph.LGraphNode.prototype.deviceControl = deviceControl;
    console.log("DeviceControl initialized and set globally:", window.deviceControl);

    const weatherSpan = document.getElementById('weather-text');
    if (weatherSpan) weatherSpan.innerText = cachedWeatherText;

    socket.on(EVENTS.CONNECT, () => {
        console.log('Socket connected to server:', socket.id);
        document.getElementById('server-status').innerText = 'Server: Connected';
        document.getElementById('server-indicator').classList.add('connected');
        // Auto-authenticate for Electron
        const isElectron = navigator.userAgent.toLowerCase().indexOf(' electron/') > -1;
        if (isElectron) {
            socket.emit('authenticate', '2265');
            console.log('Electron: Auto-authenticating with PIN 2265...');
        }
        socket.emit(EVENTS.REQUEST_WEATHER_UPDATE);
        console.log('Requested weather update on connect');
    });

    socket.on('auth-success', (data) => {
        console.log('Authentication successful:', data);
        socket.emit('request-forecast');
    });

    socket.on('auth-failed', (data) => {
        console.error('Authentication failed:', data);
        document.getElementById('server-status').innerText = 'Auth Failed';
    });

    socket.on(EVENTS.CONNECT_ERROR, (error) => {
        console.error('Socket connection error:', error.message);
        logEvent(`Socket connection failed: ${error.message}`, 'error');
        document.getElementById('server-status').innerText = 'Server: Disconnected';
        document.getElementById('server-indicator').classList.remove('connected');
    });

    socket.on(EVENTS.RECONNECT_ATTEMPT, (attempt) => {
        console.log(`Reconnection attempt ${attempt}`);
        document.getElementById('server-status').innerText = `Reconnecting (Attempt ${attempt})...`;
        document.getElementById('server-indicator').classList.remove('connected');
    });

    initializeDevices(socket, graph, updateStatusCallback);

    const throttledUpdateDevices = throttle(() => {
        if (typeof window.updateDevicesOverview === "function" && window.graph) {
            window.updateDevicesOverview(window.graph);
            console.log("Devices Overview updated via throttled device-state-update");
        }
    }, 200);

    socket.on(EVENTS.DEVICE_STATE_UPDATE, (newState) => {
        if (!validateDeviceState(newState)) {
            return;
        }

        if (!lastStates[newState.id]) {
            lastStates[newState.id] = { on: null, hsv: null, vendor: "Unknown", name: newState.name || `Device ${newState.id}` };
            console.log(`Initialized lastStates[${newState.id}]:`, lastStates[newState.id]);
        }
        const oldState = { ...lastStates[newState.id] };
        const newHsv = toHSV(newState.hue, newState.saturation, newState.brightness);
        let changedFields = [];

        if (oldState.on !== newState.on) {
            changedFields.push(`Power => ${newState.on ? "ON" : "OFF"}`);
            lastStates[newState.id].on = newState.on;
        }

        if (JSON.stringify(oldState.hsv) !== JSON.stringify(newHsv)) {
            changedFields.push(newHsv ? `HSV => (${newHsv.h},${newHsv.s},${newHsv.v})` : `HSV => none`);
            lastStates[newState.id].hsv = newHsv;
        }

        if (newState.name && oldState.name !== newState.name) {
            changedFields.push(`Name => ${sanitizeString(newState.name)}`);
            lastStates[newState.id].name = newState.name;
        }

        if (newState.type || newState.vendor) {
            const vendorLabel = getVendorLabel(newState.type || newState.vendor);
            if (oldState.vendor !== vendorLabel) {
                changedFields.push(`Vendor => ${vendorLabel}`);
                lastStates[newState.id].vendor = vendorLabel;
            }
        }

        if (changedFields.length > 0) {
            const ts = getTimestamp();
            const deviceName = sanitizeString(newState.name) || `Device ${newState.id}`;
            const vendorLabel = lastStates[newState.id].vendor;
            logEvent(`[UPDATE ${ts}] [${vendorLabel}] ${deviceName} changed: ${changedFields.join("; ")}`);
            console.log(`Updated lastStates[${newState.id}]:`, lastStates[newState.id]);
            if (typeof window.updateDevicesOverview === "function" && window.graph) {
                window.updateDevicesOverview(window.graph);
                console.log("Devices Overview updated via device-state-update for:", deviceName);
            }
        }
    });

    socket.on(EVENTS.WEATHER_UPDATE, (data) => {
        if (!data || typeof data.tempf === 'undefined') {
            console.warn('Invalid weather data:', data);
            return;
        }

        console.log('Received weather-update event with data:', JSON.stringify(data));
        const weatherText = `Now: ${data.tempf}°F, ${data.humidity}% humidity, Wind: ${data.windspeedmph} mph from ${data.winddir}°, Solar: ${data.solarradiation} W/m², Rain Today: ${data.dailyrainin} in`;
        cachedWeatherText = weatherText;

        if (weatherSpan) {
            console.log('Updating weather banner to:', weatherText);
            weatherSpan.innerText = weatherText;
            const isLightTheme = document.body.classList.contains('light-theme');
            document.getElementById('weather-banner').classList.toggle('light-theme', isLightTheme);
        } else {
            console.warn('Weather banner element not found');
            logEvent('Weather banner element not found', 'warn');
        }

        if (data.solarradiation !== undefined && data.dailyrainin !== undefined) {
            lastSolarRadiation = data.solarradiation;
            lastDailyRain = data.dailyrainin;
        }
    });

    socket.on(EVENTS.FORECAST_UPDATE, (forecast) => {
        if (!Array.isArray(forecast)) {
            console.warn('Invalid forecast data:', forecast);
            return;
        }

        const forecastList = document.getElementById('forecast-list');
        if (!forecastList) {
            console.warn('Forecast list element not found');
            logEvent('Forecast list element not found', 'warn');
            return;
        }

        forecastList.innerHTML = '';
        forecast.forEach(day => {
            if (!day.date || day.low === undefined || day.high === undefined) return;

            const dateStr = new Date(day.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

            const forecastItem = document.createElement('div');
            forecastItem.className = 'forecast-item';
            forecastItem.innerHTML = [
                '<span class="forecast-day">',
                sanitizeString(dateStr),
                '</span>',
                '<span class="forecast-icon" style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;">',
                getWeatherIconSVG(day.condition),
                '</span>',
                '<div class="forecast-temps">',
                '<span class="forecast-low">',
                Math.round(day.low),
                '°</span>',
                '<div class="forecast-bar"></div>',
                '<span class="forecast-high">',
                Math.round(day.high),
                '°</span>',
                '</div>',
                '<span class="forecast-percent" style="display:flex;align-items:center;">',
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4facfe" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;">',
                '<path d="M20 16.2A4.5 4.5 0 0 0 17.5 8h-1.8A7 7 0 1 0 4 14.9"></path>',
                '<path d="M16 14v6"></path>',
                '<path d="M8 14v6"></path>',
                '<path d="M12 16v6"></path>',
                '</svg>',
                day.precip || 0,
                '%</span>'
            ].join('');
            const forecastBar = forecastItem.querySelector('.forecast-bar');
            const diff = Math.max(0, day.high - day.low);
            forecastBar.style.setProperty('--forecast-width', `${Math.min(100, diff * 5)}%`);
            forecastList.appendChild(forecastItem);
        });
    });

    socket.on('notification', (message) => {
        const match = message.match(/🔄 (?:Kasa|Hue) Update: (.*?)(?: is (ON|OFF)(?:, Brightness: (\d+))?)(?:, ID: (\S+))/);
        if (!match) {
            return;
        }

        const [, deviceName, powerState, brightness, deviceId] = match;
        if (!deviceId || !deviceId.match(/^(ha_|kasa_|shelly)/)) {
            console.warn(`Invalid or missing device ID in notification: ${deviceId}, message: ${message}`);
            return;
        }

        lastStates[deviceId] = {
            on: powerState === 'ON',
            hsv: brightness ? toHSV(null, null, parseInt(brightness, 10)) : null,
            vendor: message.includes('Kasa') ? 'Kasa' : message.includes('Hue') ? 'Hue' : 'Unknown',
            name: deviceName.trim()
        };
        console.log(`Updated lastStates[${deviceId}]:`, lastStates[deviceId]);

        if (typeof window.updateDevicesOverview === "function" && window.graph) {
            window.updateDevicesOverview(window.graph);
            console.log("Devices Overview updated via notification for:", deviceName);
        }
    });

    console.log("Socket initialized:", socket);
    return socket;
};

