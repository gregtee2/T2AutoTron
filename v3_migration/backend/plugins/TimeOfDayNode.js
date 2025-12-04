(function() {
    console.log("[TimeOfDayNode] Loading plugin...");

    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets || !window.luxon) {
        console.error("[TimeOfDayNode] Missing dependencies");
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
    const styleId = 'time-of-day-node-css';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.innerHTML = `
            .time-of-day-node {
                background: linear-gradient(180deg, #2a2a2a 0%, #1a1a1a 100%);
                border: 1px solid #4caf50;
                border-radius: 10px;
                box-shadow: 0 0 15px rgba(76, 175, 80, 0.2);
                color: #e0e0e0;
                min-width: 400px;
                font-family: 'Segoe UI', sans-serif;
                overflow: hidden;
            }
            .time-of-day-node .title {
                background: linear-gradient(90deg, rgba(76, 175, 80, 0.2) 0%, rgba(76, 175, 80, 0) 100%);
                padding: 10px 15px;
                font-size: 16px;
                font-weight: 600;
                color: #4caf50;
                border-bottom: 1px solid rgba(76, 175, 80, 0.3);
                text-transform: uppercase;
                letter-spacing: 1px;
            }
            .time-of-day-node .content { padding: 15px; }
            .time-of-day-node .section-header {
                color: #a5d6a7; font-size: 14px; font-weight: 600; margin-top: 15px; margin-bottom: 8px;
                padding-bottom: 4px; border-bottom: 1px solid rgba(76, 175, 80, 0.2); text-transform: uppercase; font-size: 0.85em;
            }
            .time-of-day-node .section-header:first-child { margin-top: 0; }
            .time-of-day-node .control-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
            .time-of-day-node .control-label { font-size: 13px; color: #cccccc; flex: 1; }
            .time-of-day-node input[type="text"], .time-of-day-node select, .time-of-day-node input[type="number"] {
                background: #333; border: 1px solid #555; color: #fff; padding: 4px 8px; border-radius: 4px; font-size: 13px; outline: none; transition: border-color 0.2s;
            }
            .time-of-day-node input[type="text"]:focus, .time-of-day-node select:focus, .time-of-day-node input[type="number"]:focus { border-color: #4caf50; }
            .time-of-day-node input[type="range"] { -webkit-appearance: none; width: 100%; height: 4px; background: #444; border-radius: 2px; outline: none; }
            .time-of-day-node input[type="range"]::-webkit-slider-thumb {
                -webkit-appearance: none; appearance: none; width: 16px; height: 16px; border-radius: 50%; background: #4caf50; cursor: pointer; transition: background 0.2s;
            }
            .time-of-day-node input[type="range"]::-webkit-slider-thumb:hover { background: #66bb6a; }
            .time-of-day-node input[type="checkbox"] { accent-color: #4caf50; width: 16px; height: 16px; cursor: pointer; }
            .time-of-day-node .status-text { font-size: 12px; margin-top: 5px; padding: 5px; border-radius: 4px; background: rgba(0, 0, 0, 0.2); text-align: center; }
            .time-of-day-node .status-text.error { color: #f44336; border: 1px solid rgba(244, 67, 54, 0.3); }
            .time-of-day-node .status-text.info { color: #2196f3; border: 1px solid rgba(33, 150, 243, 0.3); }
            .time-of-day-node .info-display { background: rgba(76, 175, 80, 0.05); border: 1px solid rgba(76, 175, 80, 0.1); border-radius: 6px; padding: 10px; margin-top: 15px; }
            .time-of-day-node .info-row { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 4px; }
            .time-of-day-node .info-label { color: #aaa; }
            .time-of-day-node .info-value { color: #a5d6a7; font-weight: 600; }
            .time-of-day-node .info-value.cycle { color: #ffeb3b; }
            .time-of-day-node .countdown { text-align: center; font-size: 14px; font-weight: bold; color: #4caf50; margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(76, 175, 80, 0.2); }
            .time-of-day-node .tod-outputs-section { display: flex; flex-direction: column; gap: 8px; padding: 10px 15px; border-bottom: 1px solid rgba(76, 175, 80, 0.2); background: rgba(76, 175, 80, 0.05); }
            .time-of-day-node .tod-output-row { display: flex; justify-content: flex-end; align-items: center; gap: 10px; }
            .time-of-day-node .tod-output-label { font-size: 12px; color: #a5d6a7; }
        `;
        document.head.appendChild(style);
    }

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
                start_hour: 8, start_minute: 0, start_ampm: "AM", start_enabled: true,
                stop_hour: 6, stop_minute: 0, stop_ampm: "PM", stop_enabled: true,
                cycle_hour: 4, cycle_minute: 45, cycle_ampm: "AM", cycle_duration: 10, cycle_enabled: false,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
                next_on_date: null, next_off_date: null, next_cycle_date: null,
                currentState: false, status: "Initializing...", debug: false, pulseMode: true
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
    }

    // -------------------------------------------------------------------------
    // COMPONENT
    // -------------------------------------------------------------------------
    function TimeOfDayNodeComponent(props) {
        const { data, emit } = props;
        const [state, setState] = useState(data.properties);
        const [countdown, setCountdown] = useState("Calculating...");

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

        const calculateTimes = useCallback(() => {
            const now = DateTime.local().setZone(data.properties.timezone);

            const getNextDate = (h, m, ampm) => {
                let h24 = h % 12;
                if (ampm === "PM") h24 += 12;
                let date = now.set({ hour: h24, minute: m, second: 0, millisecond: 0 });
                if (date <= now) date = date.plus({ days: 1 });
                return date;
            };

            let nextOn = data.properties.start_enabled ? getNextDate(data.properties.start_hour, data.properties.start_minute, data.properties.start_ampm) : null;
            let nextOff = data.properties.stop_enabled ? getNextDate(data.properties.stop_hour, data.properties.stop_minute, data.properties.stop_ampm) : null;
            let nextCycle = data.properties.cycle_enabled ? getNextDate(data.properties.cycle_hour, data.properties.cycle_minute, data.properties.cycle_ampm) : null;

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

                if (nextOn && now >= nextOn) { log("Hit Start Time!"); triggerPulse(); calculateTimes(); }
                if (nextOff && now >= nextOff) { log("Hit Stop Time!"); triggerPulse(); calculateTimes(); }
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

        useEffect(() => { calculateTimes(); }, []);

        const outputs = Object.entries(data.outputs).map(([key, output]) => ({ key, ...output }));

        return React.createElement('div', { className: 'time-of-day-node' }, [
            React.createElement('div', { key: 't', className: 'title' }, data.label),
            // Outputs Section
            React.createElement('div', { key: 'os', className: 'tod-outputs-section' },
                outputs.map(output => React.createElement('div', { key: output.key, className: 'tod-output-row' }, [
                    React.createElement('span', { key: 'l', className: 'tod-output-label' }, output.label),
                    React.createElement(RefComponent, { key: 'r', init: ref => emit({ type: 'render', data: { type: 'socket', element: ref, payload: output.socket, nodeId: data.id, side: 'output', key: output.key } }), unmount: ref => emit({ type: 'unmount', data: { element: ref } }) })
                ]))
            ),
            React.createElement('div', { key: 'c', className: 'content', onPointerDown: (e) => e.stopPropagation() }, [
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

    console.log("[TimeOfDayNode] Registered");
})();
