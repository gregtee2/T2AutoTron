(function() {
    // Debug: console.log("[SunriseSunsetNode] Loading plugin...");

    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets || !window.luxon) {
        console.error("[SunriseSunsetNode] Missing dependencies");
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect, useCallback, useRef } = React;
    const RefComponent = window.RefComponent;
    const { DateTime } = window.luxon;
    const { HelpIcon } = window.T2Controls || {};

    // -------------------------------------------------------------------------
    // TOOLTIPS
    // -------------------------------------------------------------------------
    const tooltips = {
        node: "Triggers based on sunrise/sunset times for your location.\n\nCalculates actual solar times based on latitude/longitude.\n\nSupports offset (e.g., 30 min before sunset) and fixed override times.",
        outputs: {
            state: "TRUE during active window.\nFALSE otherwise.",
            startTime: "Calculated ON time (sunrise offset or fixed).",
            endTime: "Calculated OFF time (sunset offset or fixed)."
        },
        controls: {
            location: "Your latitude/longitude for accurate sunrise/sunset calculation.",
            offset: "Trigger before/after the solar event.\nExample: 30 min before sunset.",
            fixedTime: "Override solar time with a fixed time.\nUseful for consistent schedules."
        }
    };

    // -------------------------------------------------------------------------
    // CSS is now loaded from node-styles.css via index.css
    // -------------------------------------------------------------------------

    // -------------------------------------------------------------------------
    // NODE CLASS
    // -------------------------------------------------------------------------
    class SunriseSunsetNode extends ClassicPreset.Node {
        constructor(change) {
            super('Sunrise/Sunset Trigger');
            this.width = 450;
            this.height = 800;
            this.change = change;

            try {
                this.addOutput('state', new ClassicPreset.Output(window.sockets.boolean || new ClassicPreset.Socket('boolean'), 'State'));
                this.addOutput('startTime', new ClassicPreset.Output(window.sockets.string || new ClassicPreset.Socket('string'), 'Start Time'));
                this.addOutput('endTime', new ClassicPreset.Output(window.sockets.string || new ClassicPreset.Socket('string'), 'End Time'));
            } catch (e) { console.error("[SunriseSunsetNode] Error adding output:", e); }

            this.properties = {
                customName: '',
                on_offset_hours: 0, on_offset_minutes: 30, on_offset_direction: "Before", on_enabled: true,
                fixed_on_hour: 6, fixed_on_minute: 0, fixed_on_ampm: "PM", fixed_on_enabled: false,
                off_offset_hours: 0, off_offset_minutes: 0, off_offset_direction: "Before", off_enabled: true,
                fixed_stop_hour: 10, fixed_stop_minute: 30, fixed_stop_ampm: "PM", fixed_stop_enabled: true,
                latitude: 34.0522, longitude: -118.2437, city: "Los Angeles",
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
                haToken: "", sunrise_time: null, sunset_time: null, next_on_date: null, next_off_date: null,
                currentState: false, status: "Initializing...", debug: false, pulseMode: true
            };
        }

        data() {
            const formatTime = (date) => {
                if (!date) return '';
                const d = new Date(date);
                let hours = d.getHours();
                const minutes = String(d.getMinutes()).padStart(2, '0');
                const ampm = hours >= 12 ? 'PM' : 'AM';
                hours = hours % 12 || 12;
                return `${hours}:${minutes} ${ampm}`;
            };
            const startTime = formatTime(this.properties.next_on_date);
            const endTime = formatTime(this.properties.next_off_date);
            return { state: this.properties.currentState, startTime: startTime, endTime: endTime };
        }
        update() { if (this.change) this.change(); }

        restore(state) {
            if (state.properties) {
                Object.assign(this.properties, state.properties);
            }
        }

        serialize() {
            return {
                customName: this.properties.customName,
                on_offset_hours: this.properties.on_offset_hours,
                on_offset_minutes: this.properties.on_offset_minutes,
                on_offset_direction: this.properties.on_offset_direction,
                on_enabled: this.properties.on_enabled,
                fixed_on_hour: this.properties.fixed_on_hour,
                fixed_on_minute: this.properties.fixed_on_minute,
                fixed_on_ampm: this.properties.fixed_on_ampm,
                fixed_on_enabled: this.properties.fixed_on_enabled,
                off_offset_hours: this.properties.off_offset_hours,
                off_offset_minutes: this.properties.off_offset_minutes,
                off_offset_direction: this.properties.off_offset_direction,
                off_enabled: this.properties.off_enabled,
                fixed_stop_hour: this.properties.fixed_stop_hour,
                fixed_stop_minute: this.properties.fixed_stop_minute,
                fixed_stop_ampm: this.properties.fixed_stop_ampm,
                fixed_stop_enabled: this.properties.fixed_stop_enabled,
                latitude: this.properties.latitude,
                longitude: this.properties.longitude,
                city: this.properties.city,
                timezone: this.properties.timezone,
                debug: this.properties.debug,
                pulseMode: this.properties.pulseMode
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
    function SunriseSunsetNodeComponent(props) {
        const { data, emit } = props;
        const [state, setState] = useState(data.properties);
        const [countdown, setCountdown] = useState("Calculating...");
        const [citySearch, setCitySearch] = useState("");
        const [searchStatus, setSearchStatus] = useState("");

        const updateProperty = (key, value) => {
            data.properties[key] = value;
            setState(prev => ({ ...prev, [key]: value }));
            data.update();
            if (['on_offset_hours', 'on_offset_minutes', 'on_offset_direction', 'on_enabled',
                'fixed_on_hour', 'fixed_on_minute', 'fixed_on_ampm', 'fixed_on_enabled',
                'off_offset_hours', 'off_offset_minutes', 'off_offset_direction', 'off_enabled',
                'fixed_stop_hour', 'fixed_stop_minute', 'fixed_stop_ampm', 'fixed_stop_enabled',
                'latitude', 'longitude', 'timezone'].includes(key)) {
                calculateTimes();
            }
        };

        // City/Zip search using Nominatim (OpenStreetMap)
        const searchLocation = async () => {
            if (!citySearch.trim()) return;
            setSearchStatus("Searching...");
            try {
                const query = encodeURIComponent(citySearch.trim());
                const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`, {
                    headers: { 'User-Agent': 'T2AutoTron/2.1' }
                });
                const results = await response.json();
                if (results && results.length > 0) {
                    const { lat, lon, display_name } = results[0];
                    const cityName = display_name.split(',')[0];
                    updateProperty('latitude', parseFloat(lat));
                    updateProperty('longitude', parseFloat(lon));
                    updateProperty('city', cityName);
                    setSearchStatus(`Found: ${cityName}`);
                    fetchSunTimes();
                } else {
                    setSearchStatus("Location not found");
                }
            } catch (error) {
                setSearchStatus(`Error: ${error.message}`);
            }
        };

        // Use browser geolocation
        const useMyLocation = () => {
            if (!navigator.geolocation) {
                setSearchStatus("Geolocation not supported");
                return;
            }
            setSearchStatus("Getting location...");
            navigator.geolocation.getCurrentPosition(
                async (position) => {
                    const { latitude, longitude } = position.coords;
                    updateProperty('latitude', latitude);
                    updateProperty('longitude', longitude);
                    // Reverse geocode to get city name
                    try {
                        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`, {
                            headers: { 'User-Agent': 'T2AutoTron/2.1' }
                        });
                        const data = await response.json();
                        const city = data.address?.city || data.address?.town || data.address?.county || 'Your Location';
                        updateProperty('city', city);
                        setSearchStatus(`Found: ${city}`);
                    } catch {
                        updateProperty('city', 'Your Location');
                        setSearchStatus("Location set");
                    }
                    fetchSunTimes();
                },
                (error) => {
                    setSearchStatus(`Error: ${error.message}`);
                },
                { timeout: 10000 }
            );
        };

        const log = (message, level = 'info') => { if (state.debug || level === 'error') console.log(`[SunriseSunsetNode] ${message}`); };

        const triggerPulse = useCallback((type) => {
            log(`Triggering Event: ${type}`);
            if (data.properties.pulseMode) {
                data.properties.currentState = true;
                data.update();
                setTimeout(() => {
                    data.properties.currentState = false;
                    data.update();
                    log("Pulse complete.");
                }, 500);
            } else {
                // Explicitly set state based on event type
                if (type === 'on') {
                    data.properties.currentState = true;
                } else if (type === 'off') {
                    data.properties.currentState = false;
                }
                data.update();
            }
        }, [data]);

        const isCurrentTimeWithinRange = (now, nextOn, nextOff) => {
            // 1. Check if everything is disabled
            if (!data.properties.on_enabled && !data.properties.fixed_on_enabled && 
                !data.properties.off_enabled && !data.properties.fixed_stop_enabled) {
                return false;
            }

            // 2. Check Fixed Stop priority
            // In 2.0: if (this.properties.fixed_stop_enabled && todayOff && now >= todayOff)
            // Note: nextOff passed here is already "future" if calculated correctly, so now >= nextOff should be false usually.
            // However, if we haven't updated nextOff yet, it might be in the past.
            // But here we are passing the *newly calculated* nextOff which is guaranteed to be > now.
            // So this check might be redundant if nextOff is always future.
            // BUT, let's stick to the logic. If nextOff is somehow <= now (e.g. exact match), force off.
            if (data.properties.fixed_stop_enabled && nextOff && now >= nextOff) {
                return false;
            }

            // 3. Check if only Off is enabled
            if (!data.properties.on_enabled && !data.properties.fixed_on_enabled && 
                (data.properties.off_enabled || data.properties.fixed_stop_enabled) && nextOff) {
                return now < nextOff;
            }

            if (!nextOn) return false;

            if (nextOff) {
                if (nextOn < nextOff) {
                    // On is before Off (e.g. On 8am, Off 5pm). We are On if we are between them.
                    // But wait, nextOn is *future*.
                    // If nextOn < nextOff, it means the On event happens *sooner* than the Off event.
                    // e.g. Now 7am. On 8am. Off 5pm.
                    // We are currently OFF.
                    // 7am >= 8am (False) && ... -> False. Correct.
                    
                    // e.g. Now 9am. On is tomorrow 8am. Off is today 5pm.
                    // nextOn (Tom 8am) > nextOff (Today 5pm). This falls to 'else'.
                    return now >= nextOn && now < nextOff;
                } else {
                    // On is after Off (e.g. nextOn is tomorrow, nextOff is tonight).
                    // e.g. Now 9am. On Tom 8am. Off Today 5pm.
                    // 9am >= Tom 8am (False) || 9am < Today 5pm (True). -> True. Correct.
                    return now >= nextOn || now < nextOff;
                }
            }

            return now >= nextOn;
        };

        const calculateTimes = useCallback(() => {
            if (!data.properties.sunrise_time || !data.properties.sunset_time) return;
            const now = DateTime.local().setZone(data.properties.timezone);
            const todaySunrise = DateTime.fromJSDate(new Date(data.properties.sunrise_time)).setZone(data.properties.timezone).set({ year: now.year, month: now.month, day: now.day });
            const todaySunset = DateTime.fromJSDate(new Date(data.properties.sunset_time)).setZone(data.properties.timezone).set({ year: now.year, month: now.month, day: now.day });

            let nextOn;
            if (data.properties.fixed_on_enabled) {
                let h24 = data.properties.fixed_on_hour % 12;
                if (data.properties.fixed_on_ampm === "PM") h24 += 12;
                nextOn = now.set({ hour: h24, minute: data.properties.fixed_on_minute, second: 0, millisecond: 0 });
                while (nextOn <= now) nextOn = nextOn.plus({ days: 1 });
            } else if (data.properties.on_enabled) {
                nextOn = todaySunset.plus({
                    hours: data.properties.on_offset_direction === "After" ? data.properties.on_offset_hours : -data.properties.on_offset_hours,
                    minutes: data.properties.on_offset_direction === "After" ? data.properties.on_offset_minutes : -data.properties.on_offset_minutes
                });
                while (nextOn <= now) nextOn = nextOn.plus({ days: 1 });
            }

            let nextOff;
            if (data.properties.fixed_stop_enabled) {
                let h24 = data.properties.fixed_stop_hour % 12;
                if (data.properties.fixed_stop_ampm === "PM") h24 += 12;
                nextOff = now.set({ hour: h24, minute: data.properties.fixed_stop_minute, second: 0, millisecond: 0 });
                while (nextOff <= now) nextOff = nextOff.plus({ days: 1 });
            } else if (data.properties.off_enabled) {
                nextOff = todaySunrise.plus({
                    hours: data.properties.off_offset_direction === "After" ? data.properties.off_offset_hours : -data.properties.off_offset_hours,
                    minutes: data.properties.off_offset_direction === "After" ? data.properties.off_offset_minutes : -data.properties.off_offset_minutes
                });
                while (nextOff <= now) nextOff = nextOff.plus({ days: 1 });
            }

            // Determine current state if not in pulse mode
            if (!data.properties.pulseMode) {
                const newState = isCurrentTimeWithinRange(now, nextOn, nextOff);
                if (newState !== data.properties.currentState) {
                    data.properties.currentState = newState;
                    data.update();
                }
            }

            updateProperty('next_on_date', nextOn ? nextOn.toJSDate() : null);
            updateProperty('next_off_date', nextOff ? nextOff.toJSDate() : null);
        }, [data.properties]);

        const fetchSunTimes = useCallback(async () => {
            updateProperty('status', "Fetching sun times...");
            try {
                const lat = data.properties.latitude;
                const lon = data.properties.longitude;
                
                // Use sunrise-sunset.org API (free, no key required)
                const response = await fetch(
                    `https://api.sunrise-sunset.org/json?lat=${lat}&lng=${lon}&formatted=0`
                );
                
                if (response.ok) {
                    const result = await response.json();
                    if (result.status === 'OK' && result.results) {
                        // API returns times in UTC
                        const sunrise = new Date(result.results.sunrise);
                        const sunset = new Date(result.results.sunset);
                        
                        updateProperty('sunrise_time', sunrise);
                        updateProperty('sunset_time', sunset);
                        updateProperty('status', `${data.properties.city} - Updated`);
                        log(`Sun times for ${data.properties.city}: Sunrise ${sunrise.toLocaleTimeString()}, Sunset ${sunset.toLocaleTimeString()}`);
                        calculateTimes();
                        return;
                    }
                }
                
                // Fallback to estimated times if API fails
                const now = DateTime.local();
                updateProperty('sunrise_time', now.set({ hour: 6, minute: 30 }).toJSDate());
                updateProperty('sunset_time', now.set({ hour: 18, minute: 30 }).toJSDate());
                updateProperty('status', `${data.properties.city} - Estimated`);
                calculateTimes();

            } catch (error) {
                log(`Error fetching sun times: ${error.message}`, 'error');
                // Use fallback times
                const now = DateTime.local();
                updateProperty('sunrise_time', now.set({ hour: 6, minute: 30 }).toJSDate());
                updateProperty('sunset_time', now.set({ hour: 18, minute: 30 }).toJSDate());
                updateProperty('status', `Fallback times (API error)`);
                calculateTimes();
            }
        }, [state.latitude, state.longitude]);

        useEffect(() => {
            const timer = setInterval(() => {
                const now = DateTime.local().setZone(data.properties.timezone);
                const nextOn = data.properties.next_on_date ? DateTime.fromJSDate(new Date(data.properties.next_on_date)).setZone(data.properties.timezone) : null;
                const nextOff = data.properties.next_off_date ? DateTime.fromJSDate(new Date(data.properties.next_off_date)).setZone(data.properties.timezone) : null;

                if (nextOn && now >= nextOn) { log("Hit Next On Time!"); triggerPulse('on'); calculateTimes(); }
                if (nextOff && now >= nextOff) { log("Hit Next Off Time!"); triggerPulse('off'); calculateTimes(); }

                let target = null;
                let label = "";
                if (nextOn && nextOff) {
                    if (nextOn < nextOff) { target = nextOn; label = "Until On"; }
                    else { target = nextOff; label = "Until Off"; }
                } else if (nextOn) { target = nextOn; label = "Until On"; }
                else if (nextOff) { target = nextOff; label = "Until Off"; }

                if (target) {
                    const diff = target.diff(now, ['hours', 'minutes', 'seconds']).toObject();
                    setCountdown(`${label}: ${Math.floor(diff.hours)}h ${Math.floor(diff.minutes)}m ${Math.floor(diff.seconds)}s`);
                } else {
                    setCountdown("Waiting for schedule...");
                }
            }, 1000);
            return () => clearInterval(timer);
        }, [data.properties.next_on_date, data.properties.next_off_date, triggerPulse, calculateTimes]);

        useEffect(() => {
            // On mount, always fetch global location settings and apply them
            const fetchGlobalLocationAndSunTimes = async () => {
                try {
                    // Always fetch global settings - they override node settings
                    const response = await fetch('/api/settings');
                    if (response.ok) {
                        const result = await response.json();
                        const settings = result.settings || {};
                        
                        // If global location is configured, use it
                        if (settings.LOCATION_LATITUDE && settings.LOCATION_LONGITUDE) {
                            const lat = parseFloat(settings.LOCATION_LATITUDE);
                            const lon = parseFloat(settings.LOCATION_LONGITUDE);
                            
                            if (!isNaN(lat) && !isNaN(lon)) {
                                updateProperty('latitude', lat);
                                updateProperty('longitude', lon);
                                if (settings.LOCATION_CITY) {
                                    updateProperty('city', settings.LOCATION_CITY);
                                }
                                if (settings.LOCATION_TIMEZONE) {
                                    updateProperty('timezone', settings.LOCATION_TIMEZONE);
                                }
                                log(`Applied global location: ${settings.LOCATION_CITY || 'Custom'} (${lat}, ${lon})`);
                            }
                        }
                    }
                } catch (err) {
                    log(`Could not fetch global location settings: ${err.message}`, 'warn');
                }
                
                // Now fetch sun times with the (possibly updated) location
                fetchSunTimes();
            };
            
            fetchGlobalLocationAndSunTimes();
        }, []);

        // Register scheduled events with the global registry for the Upcoming Events panel
        useEffect(() => {
            if (window.registerScheduledEvents) {
                const events = [];
                const nodeName = data.properties.customName || 'Sunrise/Sunset';
                
                if (data.properties.next_on_date) {
                    events.push({
                        time: data.properties.next_on_date,
                        action: 'on',
                        deviceName: `${nodeName} - On`
                    });
                }
                if (data.properties.next_off_date) {
                    events.push({
                        time: data.properties.next_off_date,
                        action: 'off',
                        deviceName: `${nodeName} - Off`
                    });
                }
                
                window.registerScheduledEvents(data.id, events);
            }
            
            // Cleanup when component unmounts
            return () => {
                if (window.unregisterScheduledEvents) {
                    window.unregisterScheduledEvents(data.id);
                }
            };
        }, [data.properties.next_on_date, data.properties.next_off_date, data.properties.customName, data.id]);

        const isFixedOnActive = state.fixed_on_enabled;
        const isOnOffsetActive = !state.fixed_on_enabled && state.on_enabled;
        const isFixedOffActive = state.fixed_stop_enabled;
        const isOffOffsetActive = !state.fixed_stop_enabled && state.off_enabled;

        const activeStyle = {
            border: '1px solid #00FF00',
            borderRadius: '6px',
            padding: '8px',
            marginBottom: '10px',
            background: 'rgba(0, 255, 0, 0.05)'
        };
        
        const inactiveStyle = {
            border: '1px solid transparent',
            padding: '8px',
            marginBottom: '10px'
        };

        const outputs = Object.entries(data.outputs).map(([key, output]) => ({ key, ...output }));

        return React.createElement('div', { className: 'sunrise-sunset-node' }, [
            React.createElement('div', { key: 't', className: 'title' }, data.label),
            // Outputs Section
            React.createElement('div', { key: 'os', className: 'ss-outputs-section' },
                outputs.map(output => React.createElement('div', { key: output.key, className: 'ss-output-row' }, [
                    React.createElement('span', { key: 'l', className: 'ss-output-label' }, output.label),
                    React.createElement(RefComponent, { key: 'r', init: ref => emit({ type: 'render', data: { type: 'socket', element: ref, payload: output.socket, nodeId: data.id, side: 'output', key: output.key } }), unmount: ref => emit({ type: 'unmount', data: { element: ref } }) })
                ]))
            ),
            React.createElement('div', { key: 'c', className: 'content', onPointerDown: (e) => e.stopPropagation() }, [
                // Custom Name
                React.createElement('div', { key: 'cn', className: 'control-row' }, [
                    React.createElement('span', { key: 'l', className: 'control-label' }, "Name"),
                    React.createElement('input', { key: 'i', type: 'text', value: state.customName || '', onChange: (e) => updateProperty('customName', e.target.value), placeholder: "Trigger Name", style: { width: '60%' } })
                ]),
                // Pulse Mode
                React.createElement('div', { key: 'pm', className: 'control-row' }, [
                    React.createElement('span', { key: 'l', className: 'control-label' }, "Pulse Mode"),
                    React.createElement('input', { key: 'i', type: 'checkbox', checked: state.pulseMode, onChange: (e) => updateProperty('pulseMode', e.target.checked) })
                ]),
                // HA Token
                React.createElement('div', { key: 'ha', className: 'section-header' }, "Home Assistant"),
                React.createElement('div', { key: 'hat', className: 'control-row' }, [
                    React.createElement('span', { key: 'l', className: 'control-label' }, "HA Token"),
                    React.createElement('input', { key: 'i', type: 'text', value: state.haToken ? '********' : '', onChange: (e) => updateProperty('haToken', e.target.value), placeholder: "Enter Token", style: { width: '60%' } })
                ]),
                
                // On Offset
                React.createElement('div', { key: 'sec_oo', style: isOnOffsetActive ? activeStyle : inactiveStyle }, [
                    React.createElement('div', { key: 'oo', className: 'section-header', style: { marginTop: 0 } }, "On Offset (Sunset)"),
                    React.createElement('div', { key: 'ooe', className: 'control-row' }, [
                        React.createElement('span', { key: 'l', className: 'control-label' }, "Enabled"),
                        React.createElement('input', { key: 'i', type: 'checkbox', checked: state.on_enabled, onChange: (e) => updateProperty('on_enabled', e.target.checked) })
                    ]),
                    React.createElement('div', { key: 'ooh', className: 'control-row' }, [
                        React.createElement('span', { key: 'l', className: 'control-label' }, `Hours: ${state.on_offset_hours}`),
                        React.createElement('input', { key: 'i', type: 'range', min: 0, max: 23, value: state.on_offset_hours, onChange: (e) => updateProperty('on_offset_hours', parseInt(e.target.value)), disabled: !state.on_enabled, style: { width: '60%' } })
                    ]),
                    React.createElement('div', { key: 'oom', className: 'control-row' }, [
                        React.createElement('span', { key: 'l', className: 'control-label' }, `Minutes: ${state.on_offset_minutes}`),
                        React.createElement('input', { key: 'i', type: 'range', min: 0, max: 59, value: state.on_offset_minutes, onChange: (e) => updateProperty('on_offset_minutes', parseInt(e.target.value)), disabled: !state.on_enabled, style: { width: '60%' } })
                    ]),
                    React.createElement('div', { key: 'ood', className: 'control-row' }, [
                        React.createElement('span', { key: 'l', className: 'control-label' }, "Direction"),
                        React.createElement('select', { key: 's', value: state.on_offset_direction, onChange: (e) => updateProperty('on_offset_direction', e.target.value), disabled: !state.on_enabled, style: { width: '60%' } }, [
                            React.createElement('option', { key: 'b', value: "Before" }, "Before"),
                            React.createElement('option', { key: 'a', value: "After" }, "After")
                        ])
                    ])
                ]),

                // Fixed On
                React.createElement('div', { key: 'sec_fo', style: isFixedOnActive ? activeStyle : inactiveStyle }, [
                    React.createElement('div', { key: 'fo', className: 'section-header', style: { marginTop: 0 } }, "Fixed On Time"),
                    React.createElement('div', { key: 'foe', className: 'control-row' }, [
                        React.createElement('span', { key: 'l', className: 'control-label' }, "Enabled"),
                        React.createElement('input', { key: 'i', type: 'checkbox', checked: state.fixed_on_enabled, onChange: (e) => updateProperty('fixed_on_enabled', e.target.checked) })
                    ]),
                    React.createElement('div', { key: 'foh', className: 'control-row' }, [
                        React.createElement('span', { key: 'l', className: 'control-label' }, `Hour: ${state.fixed_on_hour}`),
                        React.createElement('input', { key: 'i', type: 'range', min: 1, max: 12, value: state.fixed_on_hour, onChange: (e) => updateProperty('fixed_on_hour', parseInt(e.target.value)), disabled: !state.fixed_on_enabled, style: { width: '60%' } })
                    ]),
                    React.createElement('div', { key: 'fom', className: 'control-row' }, [
                        React.createElement('span', { key: 'l', className: 'control-label' }, `Minute: ${state.fixed_on_minute}`),
                        React.createElement('input', { key: 'i', type: 'range', min: 0, max: 59, value: state.fixed_on_minute, onChange: (e) => updateProperty('fixed_on_minute', parseInt(e.target.value)), disabled: !state.fixed_on_enabled, style: { width: '60%' } })
                    ]),
                    React.createElement('div', { key: 'foa', className: 'control-row' }, [
                        React.createElement('span', { key: 'l', className: 'control-label' }, "AM/PM"),
                        React.createElement('select', { key: 's', value: state.fixed_on_ampm, onChange: (e) => updateProperty('fixed_on_ampm', e.target.value), disabled: !state.fixed_on_enabled, style: { width: '60%' } }, [
                            React.createElement('option', { key: 'a', value: "AM" }, "AM"),
                            React.createElement('option', { key: 'p', value: "PM" }, "PM")
                        ])
                    ])
                ]),

                // Off Offset
                React.createElement('div', { key: 'sec_of', style: isOffOffsetActive ? activeStyle : inactiveStyle }, [
                    React.createElement('div', { key: 'of', className: 'section-header', style: { marginTop: 0 } }, "Off Offset (Sunrise)"),
                    React.createElement('div', { key: 'ofe', className: 'control-row' }, [
                        React.createElement('span', { key: 'l', className: 'control-label' }, "Enabled"),
                        React.createElement('input', { key: 'i', type: 'checkbox', checked: state.off_enabled, onChange: (e) => updateProperty('off_enabled', e.target.checked) })
                    ]),
                    React.createElement('div', { key: 'ofh', className: 'control-row' }, [
                        React.createElement('span', { key: 'l', className: 'control-label' }, `Hours: ${state.off_offset_hours}`),
                        React.createElement('input', { key: 'i', type: 'range', min: 0, max: 23, value: state.off_offset_hours, onChange: (e) => updateProperty('off_offset_hours', parseInt(e.target.value)), disabled: !state.off_enabled, style: { width: '60%' } })
                    ]),
                    React.createElement('div', { key: 'ofm', className: 'control-row' }, [
                        React.createElement('span', { key: 'l', className: 'control-label' }, `Minutes: ${state.off_offset_minutes}`),
                        React.createElement('input', { key: 'i', type: 'range', min: 0, max: 59, value: state.off_offset_minutes, onChange: (e) => updateProperty('off_offset_minutes', parseInt(e.target.value)), disabled: !state.off_enabled, style: { width: '60%' } })
                    ]),
                    React.createElement('div', { key: 'ofd', className: 'control-row' }, [
                        React.createElement('span', { key: 'l', className: 'control-label' }, "Direction"),
                        React.createElement('select', { key: 's', value: state.off_offset_direction, onChange: (e) => updateProperty('off_offset_direction', e.target.value), disabled: !state.off_enabled, style: { width: '60%' } }, [
                            React.createElement('option', { key: 'b', value: "Before" }, "Before"),
                            React.createElement('option', { key: 'a', value: "After" }, "After")
                        ])
                    ])
                ]),

                // Fixed Stop
                React.createElement('div', { key: 'sec_fs', style: isFixedOffActive ? activeStyle : inactiveStyle }, [
                    React.createElement('div', { key: 'fs', className: 'section-header', style: { marginTop: 0 } }, "Fixed Stop Time"),
                    React.createElement('div', { key: 'fse', className: 'control-row' }, [
                        React.createElement('span', { key: 'l', className: 'control-label' }, "Enabled"),
                        React.createElement('input', { key: 'i', type: 'checkbox', checked: state.fixed_stop_enabled, onChange: (e) => updateProperty('fixed_stop_enabled', e.target.checked) })
                    ]),
                    React.createElement('div', { key: 'fsh', className: 'control-row' }, [
                        React.createElement('span', { key: 'l', className: 'control-label' }, `Hour: ${state.fixed_stop_hour}`),
                        React.createElement('input', { key: 'i', type: 'range', min: 1, max: 12, value: state.fixed_stop_hour, onChange: (e) => updateProperty('fixed_stop_hour', parseInt(e.target.value)), disabled: !state.fixed_stop_enabled, style: { width: '60%' } })
                    ]),
                    React.createElement('div', { key: 'fsm', className: 'control-row' }, [
                        React.createElement('span', { key: 'l', className: 'control-label' }, `Minute: ${state.fixed_stop_minute}`),
                        React.createElement('input', { key: 'i', type: 'range', min: 0, max: 59, value: state.fixed_stop_minute, onChange: (e) => updateProperty('fixed_stop_minute', parseInt(e.target.value)), disabled: !state.fixed_stop_enabled, style: { width: '60%' } })
                    ]),
                    React.createElement('div', { key: 'fsa', className: 'control-row' }, [
                        React.createElement('span', { key: 'l', className: 'control-label' }, "AM/PM"),
                        React.createElement('select', { key: 's', value: state.fixed_stop_ampm, onChange: (e) => updateProperty('fixed_stop_ampm', e.target.value), disabled: !state.fixed_stop_enabled, style: { width: '60%' } }, [
                            React.createElement('option', { key: 'a', value: "AM" }, "AM"),
                            React.createElement('option', { key: 'p', value: "PM" }, "PM")
                        ])
                    ])
                ]),

                // Location
                React.createElement('div', { key: 'loc', className: 'section-header' }, "Location"),
                React.createElement('div', { key: 'll', className: 'control-row' }, [
                    React.createElement('span', { key: 'la', className: 'control-label' }, `Lat: ${state.latitude}`),
                    React.createElement('span', { key: 'lo', className: 'control-label' }, `Lon: ${state.longitude}`)
                ]),
                React.createElement('div', { key: 'ci', className: 'control-row' }, [
                    React.createElement('span', { key: 'l', className: 'control-label' }, `City: ${state.city}`)
                ]),
                // Info
                React.createElement('div', { key: 'inf', className: 'info-display' }, [
                    React.createElement('div', { key: 'sr', className: 'info-row' }, [
                        React.createElement('span', { key: 'l', className: 'info-label' }, "Sunrise:"),
                        React.createElement('span', { key: 'v', className: 'info-value' }, state.sunrise_time ? DateTime.fromJSDate(new Date(state.sunrise_time)).toFormat("hh:mm a") : "N/A")
                    ]),
                    React.createElement('div', { key: 'ss', className: 'info-row' }, [
                        React.createElement('span', { key: 'l', className: 'info-label' }, "Sunset:"),
                        React.createElement('span', { key: 'v', className: 'info-value' }, state.sunset_time ? DateTime.fromJSDate(new Date(state.sunset_time)).toFormat("hh:mm a") : "N/A")
                    ]),
                    React.createElement('div', { key: 'no', className: 'info-row' }, [
                        React.createElement('span', { key: 'l', className: 'info-label' }, "Next On:"),
                        React.createElement('span', { key: 'v', className: 'info-value' }, state.next_on_date ? DateTime.fromJSDate(new Date(state.next_on_date)).toFormat("hh:mm a") : "N/A")
                    ]),
                    React.createElement('div', { key: 'nf', className: 'info-row' }, [
                        React.createElement('span', { key: 'l', className: 'info-label' }, "Next Off:"),
                        React.createElement('span', { key: 'v', className: 'info-value' }, state.next_off_date ? DateTime.fromJSDate(new Date(state.next_off_date)).toFormat("hh:mm a") : "N/A")
                    ]),
                    React.createElement('div', { key: 'cd', className: 'countdown' }, countdown)
                ]),
                React.createElement('div', { key: 'st', className: `status-text ${state.status.includes('Error') ? 'error' : 'info'}` }, state.status)
            ])
        ]);
    }

    window.nodeRegistry.register('SunriseSunsetNode', {
        label: "Sunrise/Sunset Trigger",
        category: "Timer/Event",
        nodeClass: SunriseSunsetNode,
        factory: (cb) => new SunriseSunsetNode(cb),
        component: SunriseSunsetNodeComponent
    });

    // console.log("[SunriseSunsetNode] Registered");
})();
