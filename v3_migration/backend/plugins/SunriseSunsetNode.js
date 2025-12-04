(function() {
    console.log("[SunriseSunsetNode] Loading plugin...");

    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets || !window.luxon) {
        console.error("[SunriseSunsetNode] Missing dependencies");
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect, useCallback, useRef } = React;
    const RefComponent = window.RefComponent;
    const { DateTime } = window.luxon;

    // -------------------------------------------------------------------------
    // CSS INJECTION
    // -------------------------------------------------------------------------
    const styleId = 'sunrise-sunset-node-css';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.innerHTML = `
            .sunrise-sunset-node {
                background: linear-gradient(180deg, #2a2a2a 0%, #1a1a1a 100%);
                border: 1px solid #ff8c00;
                border-radius: 10px;
                box-shadow: 0 0 15px rgba(255, 140, 0, 0.2);
                color: #e0e0e0;
                min-width: 400px;
                font-family: 'Segoe UI', sans-serif;
                overflow: hidden;
            }
            .sunrise-sunset-node .title {
                background: linear-gradient(90deg, rgba(255, 140, 0, 0.2) 0%, rgba(255, 140, 0, 0) 100%);
                padding: 10px 15px;
                font-size: 16px;
                font-weight: 600;
                color: #ffa500;
                border-bottom: 1px solid rgba(255, 140, 0, 0.3);
                text-transform: uppercase;
                letter-spacing: 1px;
            }
            .sunrise-sunset-node .content { padding: 15px; }
            .sunrise-sunset-node .section-header {
                color: #ffb74d; font-size: 14px; font-weight: 600; margin-top: 15px; margin-bottom: 8px;
                padding-bottom: 4px; border-bottom: 1px solid rgba(255, 140, 0, 0.2); text-transform: uppercase; font-size: 0.85em;
            }
            .sunrise-sunset-node .section-header:first-child { margin-top: 0; }
            .sunrise-sunset-node .control-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
            .sunrise-sunset-node .control-label { font-size: 13px; color: #cccccc; flex: 1; }
            .sunrise-sunset-node input[type="text"], .sunrise-sunset-node select {
                background: #333; border: 1px solid #555; color: #fff; padding: 4px 8px; border-radius: 4px; font-size: 13px; outline: none; transition: border-color 0.2s;
            }
            .sunrise-sunset-node input[type="text"]:focus, .sunrise-sunset-node select:focus { border-color: #ff8c00; }
            .sunrise-sunset-node input[type="range"] { -webkit-appearance: none; width: 100%; height: 4px; background: #444; border-radius: 2px; outline: none; }
            .sunrise-sunset-node input[type="range"]::-webkit-slider-thumb {
                -webkit-appearance: none; appearance: none; width: 16px; height: 16px; border-radius: 50%; background: #ff8c00; cursor: pointer; transition: background 0.2s;
            }
            .sunrise-sunset-node input[type="range"]::-webkit-slider-thumb:hover { background: #ffa500; }
            .sunrise-sunset-node input[type="checkbox"] { accent-color: #ff8c00; width: 16px; height: 16px; cursor: pointer; }
            .sunrise-sunset-node .status-text { font-size: 12px; margin-top: 5px; padding: 5px; border-radius: 4px; background: rgba(0, 0, 0, 0.2); text-align: center; }
            .sunrise-sunset-node .status-text.error { color: #f44336; border: 1px solid rgba(244, 67, 54, 0.3); }
            .sunrise-sunset-node .status-text.info { color: #2196f3; border: 1px solid rgba(33, 150, 243, 0.3); }
            .sunrise-sunset-node .info-display { background: rgba(255, 140, 0, 0.05); border: 1px solid rgba(255, 140, 0, 0.1); border-radius: 6px; padding: 10px; margin-top: 15px; }
            .sunrise-sunset-node .info-row { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 4px; }
            .sunrise-sunset-node .info-label { color: #aaa; }
            .sunrise-sunset-node .info-value { color: #ffb74d; font-weight: 600; }
            .sunrise-sunset-node .countdown { text-align: center; font-size: 14px; font-weight: bold; color: #ffa500; margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255, 140, 0, 0.2); }
            .sunrise-sunset-node .ss-outputs-section { display: flex; flex-direction: column; gap: 8px; padding: 10px 15px; border-bottom: 1px solid rgba(255, 140, 0, 0.2); background: rgba(255, 140, 0, 0.05); }
            .sunrise-sunset-node .ss-output-row { display: flex; justify-content: flex-end; align-items: center; gap: 10px; }
            .sunrise-sunset-node .ss-output-label { font-size: 12px; color: #ffb74d; }
        `;
        document.head.appendChild(style);
    }

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
    }

    // -------------------------------------------------------------------------
    // COMPONENT
    // -------------------------------------------------------------------------
    function SunriseSunsetNodeComponent(props) {
        const { data, emit } = props;
        const [state, setState] = useState(data.properties);
        const [countdown, setCountdown] = useState("Calculating...");

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
                // Try to fetch from backend API if available, otherwise fallback
                // Since we are in a plugin, we can try fetching from our own backend route if we had one
                // For now, let's assume we can use a public API or just calculate locally if we had a library
                // But wait, we don't have suncalc here.
                // Let's try to fetch from the backend route /api/weather/sun if it exists, or just use a placeholder
                
                // Simulating fetch for now or using current time as base
                const now = DateTime.local();
                updateProperty('sunrise_time', now.set({ hour: 6, minute: 0 }).toJSDate());
                updateProperty('sunset_time', now.set({ hour: 18, minute: 0 }).toJSDate());
                updateProperty('status', "Sun times set (Default).");
                calculateTimes();

            } catch (error) {
                log(`Error fetching sun times: ${error.message}`, 'error');
                updateProperty('status', `Error: ${error.message}`);
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

        useEffect(() => { fetchSunTimes(); }, []);

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

    console.log("[SunriseSunsetNode] Registered");
})();
