(function() {
    // Debug: console.log("[TimeOfDayNode] Loading plugin...");

    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets || !window.luxon) {
        console.error("[TimeOfDayNode] Missing dependencies");
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
        node: "Time-based trigger that activates during specified hours.\n\nSet start and stop times to define an active window.\n\nModes:\n• Range Mode: TRUE during active window\n• Pulse Mode: Brief pulse at start/stop times",
        outputs: {
            state: "TRUE when current time is within active window.\nFALSE otherwise.",
            startTime: "Formatted start time string (e.g., '8:00 AM')",
            endTime: "Formatted stop time string (e.g., '6:00 PM')"
        },
        controls: {
            customName: "Optional name for this timer.\nUseful when you have multiple time nodes.",
            pulseMode: "Pulse: Brief signal at start/stop times\nRange: Continuous TRUE during active window",
            start: "Time when this node turns ON.\nUses 12-hour format with AM/PM.",
            stop: "Time when this node turns OFF.\nSupports overnight ranges (e.g., 10PM to 6AM).",
            cycle: "Optional recurring trigger during active window.\nUseful for periodic actions."
        }
    };

    // -------------------------------------------------------------------------
    // CSS is now loaded from node-styles.css via index.css
    // -------------------------------------------------------------------------

    // -------------------------------------------------------------------------
    // NODE CLASS
    // -------------------------------------------------------------------------
    class TimeOfDayNode extends ClassicPreset.Node {
        constructor(change) {
            super('Time of Day');
            this.width = 450;
            this.height = 950;
            this.change = change;

            try {
                this.addOutput('state', new ClassicPreset.Output(window.sockets.boolean || new ClassicPreset.Socket('boolean'), 'State'));
                this.addOutput('startTime', new ClassicPreset.Output(window.sockets.string || new ClassicPreset.Socket('string'), 'Start Time'));
                this.addOutput('endTime', new ClassicPreset.Output(window.sockets.string || new ClassicPreset.Socket('string'), 'End Time'));
            } catch (e) { console.error("[TimeOfDayNode] Error adding output:", e); }

            this.properties = {
                customName: '',
                start_hour: 8, start_minute: 0, start_ampm: "AM", start_enabled: true,
                stop_hour: 6, stop_minute: 0, stop_ampm: "PM", stop_enabled: true,
                cycle_hour: 4, cycle_minute: 45, cycle_ampm: "AM", cycle_duration: 10, cycle_enabled: false,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
                next_on_date: null, next_off_date: null, next_cycle_date: null,
                currentState: false, status: "Initializing...", debug: false, pulseMode: false
            };
        }

        data() {
            const formatTime = (hour, minute, ampm) => {
                const m = String(minute).padStart(2, '0');
                return `${hour}:${m} ${ampm}`;
            };
            const startTime = formatTime(this.properties.start_hour, this.properties.start_minute, this.properties.start_ampm);
            const endTime = formatTime(this.properties.stop_hour, this.properties.stop_minute, this.properties.stop_ampm);
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
                start_hour: this.properties.start_hour,
                start_minute: this.properties.start_minute,
                start_ampm: this.properties.start_ampm,
                start_enabled: this.properties.start_enabled,
                stop_hour: this.properties.stop_hour,
                stop_minute: this.properties.stop_minute,
                stop_ampm: this.properties.stop_ampm,
                stop_enabled: this.properties.stop_enabled,
                cycle_hour: this.properties.cycle_hour,
                cycle_minute: this.properties.cycle_minute,
                cycle_ampm: this.properties.cycle_ampm,
                cycle_duration: this.properties.cycle_duration,
                cycle_enabled: this.properties.cycle_enabled,
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
    function TimeOfDayNodeComponent(props) {
        const { data, emit } = props;
        const [state, setState] = useState(data.properties);
        const [countdown, setCountdown] = useState("Calculating...");
        const [isEditingTitle, setIsEditingTitle] = useState(false);
        const titleInputRef = useRef(null);
        const editingStartTitleRef = useRef(state.customName || "");

        const updateProperty = (key, value) => {
            data.properties[key] = value;
            setState(prev => ({ ...prev, [key]: value }));
            data.update();
            if ([
                'start_hour', 'start_minute', 'start_ampm', 'start_enabled',
                'stop_hour', 'stop_minute', 'stop_ampm', 'stop_enabled',
                'cycle_hour', 'cycle_minute', 'cycle_ampm', 'cycle_enabled',
                'timezone'
            ].includes(key)) {
                calculateTimes();
            }
        };

        useEffect(() => {
            if (isEditingTitle && titleInputRef.current) {
                titleInputRef.current.focus();
                titleInputRef.current.select();
            }
        }, [isEditingTitle]);

        const log = (message, level = 'info') => { if (state.debug || level === 'error') console.log(`[TimeOfDayNode] ${message}`); };

        const triggerPulse = useCallback(() => {
            log("Triggering Pulse...");
            if (data.properties.pulseMode) {
                data.properties.currentState = true;
                data.update();
                setTimeout(() => {
                    data.properties.currentState = false;
                    data.update();
                    log("Pulse complete.");
                }, 500);
            } else {
                data.properties.currentState = !data.properties.currentState;
                data.update();
            }
        }, [data]);

        // Helper to check if current time is within active window
        const updateActiveWindowState = useCallback((now) => {
            if (!data.properties.start_enabled || !data.properties.stop_enabled) return;
            
            // Convert 12-hour to 24-hour format
            const to24Hour = (h, ampm) => {
                let h24 = h % 12;
                if (ampm === "PM") h24 += 12;
                return h24;
            };
            
            const getTodayTime = (h, m, ampm) => {
                let h24 = to24Hour(h, ampm);
                return now.set({ hour: h24, minute: m, second: 0, millisecond: 0 });
            };
            
            const startTime = getTodayTime(data.properties.start_hour, data.properties.start_minute, data.properties.start_ampm);
            const stopTime = getTodayTime(data.properties.stop_hour, data.properties.stop_minute, data.properties.stop_ampm);
            
            let isInActiveWindow = false;
            
            if (startTime < stopTime) {
                // Same day: e.g., 8:00 AM to 6:00 PM
                isInActiveWindow = now >= startTime && now < stopTime;
            } else {
                // Overnight: e.g., 10:00 PM to 6:00 AM
                isInActiveWindow = now >= startTime || now < stopTime;
            }
            
            if (isInActiveWindow !== data.properties.currentState) {
                data.properties.currentState = isInActiveWindow;
                log(`State updated to ${isInActiveWindow ? 'ON' : 'OFF'} (in active window)`);
                data.update();
            }
        }, [data.properties]);

        const calculateTimes = useCallback(() => {
            const now = DateTime.local().setZone(data.properties.timezone);

            // Convert 12-hour to 24-hour format
            const to24Hour = (h, ampm) => {
                let h24 = h % 12;
                if (ampm === "PM") h24 += 12;
                return h24;
            };

            const getNextDate = (h, m, ampm) => {
                let h24 = to24Hour(h, ampm);
                let date = now.set({ hour: h24, minute: m, second: 0, millisecond: 0 });
                if (date <= now) date = date.plus({ days: 1 });
                return date;
            };

            // Get today's start and stop times (without adding a day)
            const getTodayTime = (h, m, ampm) => {
                let h24 = to24Hour(h, ampm);
                return now.set({ hour: h24, minute: m, second: 0, millisecond: 0 });
            };

            let nextOn = data.properties.start_enabled ? getNextDate(data.properties.start_hour, data.properties.start_minute, data.properties.start_ampm) : null;
            let nextOff = data.properties.stop_enabled ? getNextDate(data.properties.stop_hour, data.properties.stop_minute, data.properties.stop_ampm) : null;
            let nextCycle = data.properties.cycle_enabled ? getNextDate(data.properties.cycle_hour, data.properties.cycle_minute, data.properties.cycle_ampm) : null;

            // Calculate current state: are we currently between start and stop times?
            // This handles the case where start time has passed but stop time hasn't
            if (data.properties.start_enabled && data.properties.stop_enabled && !data.properties.pulseMode) {
                const startTime = getTodayTime(data.properties.start_hour, data.properties.start_minute, data.properties.start_ampm);
                const stopTime = getTodayTime(data.properties.stop_hour, data.properties.stop_minute, data.properties.stop_ampm);
                
                let isInActiveWindow = false;
                
                if (startTime < stopTime) {
                    // Same day: e.g., 8:00 AM to 6:00 PM
                    isInActiveWindow = now >= startTime && now < stopTime;
                } else {
                    // Overnight: e.g., 10:00 PM to 6:00 AM
                    isInActiveWindow = now >= startTime || now < stopTime;
                }
                
                if (isInActiveWindow !== data.properties.currentState) {
                    data.properties.currentState = isInActiveWindow;
                    log(`State updated to ${isInActiveWindow ? 'ON' : 'OFF'} (in active window: ${isInActiveWindow})`);
                    data.update();
                }
            }

            updateProperty('next_on_date', nextOn ? nextOn.toJSDate() : null);
            updateProperty('next_off_date', nextOff ? nextOff.toJSDate() : null);
            updateProperty('next_cycle_date', nextCycle ? nextCycle.toJSDate() : null);
        }, [data.properties]);

        useEffect(() => {
            const timer = setInterval(() => {
                const now = DateTime.local().setZone(data.properties.timezone);
                const nextOn = data.properties.next_on_date ? DateTime.fromJSDate(new Date(data.properties.next_on_date)).setZone(data.properties.timezone) : null;
                const nextOff = data.properties.next_off_date ? DateTime.fromJSDate(new Date(data.properties.next_off_date)).setZone(data.properties.timezone) : null;
                const nextCycle = data.properties.next_cycle_date ? DateTime.fromJSDate(new Date(data.properties.next_cycle_date)).setZone(data.properties.timezone) : null;

                // In pulse mode, trigger pulses at start/stop times
                if (data.properties.pulseMode) {
                    if (nextOn && now >= nextOn) { log("Hit Start Time!"); triggerPulse(); calculateTimes(); }
                    if (nextOff && now >= nextOff) { log("Hit Stop Time!"); triggerPulse(); calculateTimes(); }
                } else {
                    // In state mode, continuously check if we're in the active window
                    updateActiveWindowState(now);
                    // Still recalculate next times when events pass
                    if (nextOn && now >= nextOn) { calculateTimes(); }
                    if (nextOff && now >= nextOff) { calculateTimes(); }
                }
                
                if (nextCycle && now >= nextCycle) {
                    log("Hit Cycle Time!");
                    triggerPulse();
                    setTimeout(() => {
                        log("Cycle Duration Complete - Triggering ON");
                        triggerPulse();
                    }, data.properties.cycle_duration * 1000);
                    calculateTimes();
                }

                let target = null;
                let label = "";
                const events = [
                    { date: nextOn, label: "Until Start" },
                    { date: nextOff, label: "Until Stop" },
                    { date: nextCycle, label: "Until Cycle" }
                ].filter(e => e.date !== null).sort((a, b) => a.date - b.date);

                if (events.length > 0) { target = events[0].date; label = events[0].label; }

                if (target) {
                    const diff = target.diff(now, ['hours', 'minutes', 'seconds']).toObject();
                    setCountdown(`${label}: ${Math.floor(diff.hours)}h ${Math.floor(diff.minutes)}m ${Math.floor(diff.seconds)}s`);
                } else {
                    setCountdown("No events scheduled");
                }
            }, 1000);
            return () => clearInterval(timer);
        }, [data.properties.next_on_date, data.properties.next_off_date, data.properties.next_cycle_date, triggerPulse, calculateTimes]);

        useEffect(() => { 
            calculateTimes(); 
            // Also set initial state based on current time (for non-pulse mode)
            if (!data.properties.pulseMode) {
                const now = DateTime.local().setZone(data.properties.timezone);
                updateActiveWindowState(now);
            }
        }, []);

        // Register scheduled events with the global registry for the Upcoming Events panel
        useEffect(() => {
            if (window.registerScheduledEvents) {
                const events = [];
                const nodeName = data.properties.customName || 'Time of Day';
                
                if (data.properties.next_on_date) {
                    events.push({
                        time: data.properties.next_on_date,
                        action: 'on',
                        deviceName: `${nodeName} - Start`
                    });
                }
                if (data.properties.next_off_date) {
                    events.push({
                        time: data.properties.next_off_date,
                        action: 'off',
                        deviceName: `${nodeName} - Stop`
                    });
                }
                if (data.properties.next_cycle_date) {
                    events.push({
                        time: data.properties.next_cycle_date,
                        action: 'pulse',
                        deviceName: `${nodeName} - Cycle`
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
        }, [data.properties.next_on_date, data.properties.next_off_date, data.properties.next_cycle_date, data.properties.customName, data.id]);

        const outputs = Object.entries(data.outputs).map(([key, output]) => ({ key, ...output }));

        return React.createElement('div', { className: 'time-of-day-node' }, [
            React.createElement('div', { 
                key: 't', 
                className: 'title',
                style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' }
            }, [
                React.createElement('div', { key: 'label', style: { display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0 } }, [
                    React.createElement('span', { key: 'icon' }, '🕐'),
                    isEditingTitle
                        ? React.createElement('input', {
                            key: 'ti',
                            ref: titleInputRef,
                            type: 'text',
                            value: state.customName || "",
                            placeholder: data.label || 'Time of Day',
                            onChange: (e) => updateProperty('customName', e.target.value),
                            onBlur: () => setIsEditingTitle(false),
                            onKeyDown: (e) => {
                                if (e.key === 'Enter') setIsEditingTitle(false);
                                if (e.key === 'Escape') {
                                    updateProperty('customName', editingStartTitleRef.current || "");
                                    setIsEditingTitle(false);
                                }
                            },
                            onPointerDown: (e) => e.stopPropagation(),
                            style: { flex: 1, minWidth: 0 }
                        })
                        : React.createElement('div', {
                            key: 'ts',
                            style: { cursor: 'text', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
                            onDoubleClick: (e) => {
                                e.stopPropagation();
                                editingStartTitleRef.current = state.customName || "";
                                setIsEditingTitle(true);
                            },
                            title: 'Double-click to edit title'
                        }, state.customName || data.label)
                ]),
                HelpIcon && React.createElement(HelpIcon, { key: 'help', text: tooltips.node, size: 14 })
            ]),
            // Outputs Section
            React.createElement('div', { key: 'os', className: 'tod-outputs-section' },
                outputs.map(output => React.createElement('div', { key: output.key, className: 'tod-output-row' }, [
                    React.createElement('span', { key: 'l', className: 'tod-output-label' }, output.label),
                    React.createElement(RefComponent, { key: 'r', init: ref => emit({ type: 'render', data: { type: 'socket', element: ref, payload: output.socket, nodeId: data.id, side: 'output', key: output.key } }), unmount: ref => emit({ type: 'unmount', data: { element: ref } }) })
                ]))
            ),
            React.createElement('div', { key: 'c', className: 'content', onPointerDown: (e) => e.stopPropagation() }, [
                // Custom Name
                React.createElement('div', { key: 'cn', className: 'control-row' }, [
                    React.createElement('span', { key: 'l', className: 'control-label' }, "Name"),
                    React.createElement('input', { key: 'i', type: 'text', value: state.customName || '', onChange: (e) => updateProperty('customName', e.target.value), placeholder: "Timer Name", style: { width: '60%' } })
                ]),
                // Pulse Mode
                React.createElement('div', { key: 'pm', className: 'control-row' }, [
                    React.createElement('span', { key: 'l', className: 'control-label' }, "Pulse Mode"),
                    React.createElement('input', { key: 'i', type: 'checkbox', checked: state.pulseMode, onChange: (e) => updateProperty('pulseMode', e.target.checked) })
                ]),
                // Start Time
                React.createElement('div', { key: 'st', className: 'section-header' }, "Start Time"),
                React.createElement('div', { key: 'ste', className: 'control-row' }, [
                    React.createElement('span', { key: 'l', className: 'control-label' }, "Enabled"),
                    React.createElement('input', { key: 'i', type: 'checkbox', checked: state.start_enabled, onChange: (e) => updateProperty('start_enabled', e.target.checked) })
                ]),
                React.createElement('div', { key: 'sth', className: 'control-row' }, [
                    React.createElement('span', { key: 'l', className: 'control-label' }, `Hour: ${state.start_hour}`),
                    React.createElement('input', { key: 'i', type: 'range', min: 1, max: 12, value: state.start_hour, onChange: (e) => updateProperty('start_hour', parseInt(e.target.value)), disabled: !state.start_enabled, style: { width: '60%' } })
                ]),
                React.createElement('div', { key: 'stm', className: 'control-row' }, [
                    React.createElement('span', { key: 'l', className: 'control-label' }, `Minute: ${state.start_minute}`),
                    React.createElement('input', { key: 'i', type: 'range', min: 0, max: 59, value: state.start_minute, onChange: (e) => updateProperty('start_minute', parseInt(e.target.value)), disabled: !state.start_enabled, style: { width: '60%' } })
                ]),
                React.createElement('div', { key: 'sta', className: 'control-row' }, [
                    React.createElement('span', { key: 'l', className: 'control-label' }, "AM/PM"),
                    React.createElement('select', { key: 's', value: state.start_ampm, onChange: (e) => updateProperty('start_ampm', e.target.value), disabled: !state.start_enabled, style: { width: '60%' } }, [
                        React.createElement('option', { key: 'a', value: "AM" }, "AM"),
                        React.createElement('option', { key: 'p', value: "PM" }, "PM")
                    ])
                ]),
                // Stop Time
                React.createElement('div', { key: 'sp', className: 'section-header' }, "Stop Time"),
                React.createElement('div', { key: 'spe', className: 'control-row' }, [
                    React.createElement('span', { key: 'l', className: 'control-label' }, "Enabled"),
                    React.createElement('input', { key: 'i', type: 'checkbox', checked: state.stop_enabled, onChange: (e) => updateProperty('stop_enabled', e.target.checked) })
                ]),
                React.createElement('div', { key: 'sph', className: 'control-row' }, [
                    React.createElement('span', { key: 'l', className: 'control-label' }, `Hour: ${state.stop_hour}`),
                    React.createElement('input', { key: 'i', type: 'range', min: 1, max: 12, value: state.stop_hour, onChange: (e) => updateProperty('stop_hour', parseInt(e.target.value)), disabled: !state.stop_enabled, style: { width: '60%' } })
                ]),
                React.createElement('div', { key: 'spm', className: 'control-row' }, [
                    React.createElement('span', { key: 'l', className: 'control-label' }, `Minute: ${state.stop_minute}`),
                    React.createElement('input', { key: 'i', type: 'range', min: 0, max: 59, value: state.stop_minute, onChange: (e) => updateProperty('stop_minute', parseInt(e.target.value)), disabled: !state.stop_enabled, style: { width: '60%' } })
                ]),
                React.createElement('div', { key: 'spa', className: 'control-row' }, [
                    React.createElement('span', { key: 'l', className: 'control-label' }, "AM/PM"),
                    React.createElement('select', { key: 's', value: state.stop_ampm, onChange: (e) => updateProperty('stop_ampm', e.target.value), disabled: !state.stop_enabled, style: { width: '60%' } }, [
                        React.createElement('option', { key: 'a', value: "AM" }, "AM"),
                        React.createElement('option', { key: 'p', value: "PM" }, "PM")
                    ])
                ]),
                // Power Cycle
                React.createElement('div', { key: 'pc', className: 'section-header' }, "Power Cycle"),
                React.createElement('div', { key: 'pce', className: 'control-row' }, [
                    React.createElement('span', { key: 'l', className: 'control-label' }, "Enabled"),
                    React.createElement('input', { key: 'i', type: 'checkbox', checked: state.cycle_enabled, onChange: (e) => updateProperty('cycle_enabled', e.target.checked) })
                ]),
                React.createElement('div', { key: 'pch', className: 'control-row' }, [
                    React.createElement('span', { key: 'l', className: 'control-label' }, `Hour: ${state.cycle_hour}`),
                    React.createElement('input', { key: 'i', type: 'range', min: 1, max: 12, value: state.cycle_hour, onChange: (e) => updateProperty('cycle_hour', parseInt(e.target.value)), disabled: !state.cycle_enabled, style: { width: '60%' } })
                ]),
                React.createElement('div', { key: 'pcm', className: 'control-row' }, [
                    React.createElement('span', { key: 'l', className: 'control-label' }, `Minute: ${state.cycle_minute}`),
                    React.createElement('input', { key: 'i', type: 'range', min: 0, max: 59, value: state.cycle_minute, onChange: (e) => updateProperty('cycle_minute', parseInt(e.target.value)), disabled: !state.cycle_enabled, style: { width: '60%' } })
                ]),
                React.createElement('div', { key: 'pca', className: 'control-row' }, [
                    React.createElement('span', { key: 'l', className: 'control-label' }, "AM/PM"),
                    React.createElement('select', { key: 's', value: state.cycle_ampm, onChange: (e) => updateProperty('cycle_ampm', e.target.value), disabled: !state.cycle_enabled, style: { width: '60%' } }, [
                        React.createElement('option', { key: 'a', value: "AM" }, "AM"),
                        React.createElement('option', { key: 'p', value: "PM" }, "PM")
                    ])
                ]),
                React.createElement('div', { key: 'pcd', className: 'control-row' }, [
                    React.createElement('span', { key: 'l', className: 'control-label' }, "Duration (s)"),
                    React.createElement('input', { key: 'i', type: 'number', min: 1, value: state.cycle_duration, onChange: (e) => updateProperty('cycle_duration', parseInt(e.target.value)), disabled: !state.cycle_enabled, style: { width: '60%' } })
                ]),
                // Timezone
                React.createElement('div', { key: 'tz', className: 'section-header' }, "Timezone"),
                React.createElement('div', { key: 'tzc', className: 'control-row' }, [
                    React.createElement('select', { key: 's', value: state.timezone, onChange: (e) => updateProperty('timezone', e.target.value), style: { width: '100%' } }, 
                        Intl.supportedValuesOf('timeZone').map(tz => React.createElement('option', { key: tz, value: tz }, tz))
                    )
                ]),
                // Info
                React.createElement('div', { key: 'inf', className: 'info-display' }, [
                    React.createElement('div', { key: 'ns', className: 'info-row' }, [
                        React.createElement('span', { key: 'l', className: 'info-label' }, "Next Start:"),
                        React.createElement('span', { key: 'v', className: 'info-value' }, state.next_on_date ? DateTime.fromJSDate(new Date(state.next_on_date)).toFormat("hh:mm a") : "N/A")
                    ]),
                    React.createElement('div', { key: 'nst', className: 'info-row' }, [
                        React.createElement('span', { key: 'l', className: 'info-label' }, "Next Stop:"),
                        React.createElement('span', { key: 'v', className: 'info-value' }, state.next_off_date ? DateTime.fromJSDate(new Date(state.next_off_date)).toFormat("hh:mm a") : "N/A")
                    ]),
                    React.createElement('div', { key: 'nc', className: 'info-row' }, [
                        React.createElement('span', { key: 'l', className: 'info-label' }, "Next Cycle:"),
                        React.createElement('span', { key: 'v', className: 'info-value cycle' }, state.next_cycle_date ? DateTime.fromJSDate(new Date(state.next_cycle_date)).toFormat("hh:mm a") : "N/A")
                    ]),
                    React.createElement('div', { key: 'cd', className: 'countdown' }, countdown)
                ]),
                React.createElement('div', { key: 'status', className: `status-text ${state.status.includes('Error') ? 'error' : 'info'}` }, state.status)
            ])
        ]);
    }

    window.nodeRegistry.register('TimeOfDayNode', {
        label: "Time of Day",
        category: "Timer/Event",
        nodeClass: TimeOfDayNode,
        factory: (cb) => new TimeOfDayNode(cb),
        component: TimeOfDayNodeComponent
    });

    // console.log("[TimeOfDayNode] Registered");
})();
