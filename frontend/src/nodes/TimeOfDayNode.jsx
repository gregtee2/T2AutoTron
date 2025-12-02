import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ClassicPreset } from 'rete';
import { RefComponent } from "rete-react-plugin";
import { DateTime } from 'luxon';
import './TimeOfDayNode.css';

export class TimeOfDayNode extends ClassicPreset.Node {
    constructor(change) {
        super('Time of Day');
        this.width = 450;
        this.height = 950; // Slightly taller for extra controls
        this.change = change;

        // Outputs
        this.addOutput('state', new ClassicPreset.Output(new ClassicPreset.Socket('boolean'), 'State'));

        // Properties (State)
        this.properties = {
            start_hour: 8,
            start_minute: 0,
            start_ampm: "AM",
            start_enabled: true,
            stop_hour: 6,
            stop_minute: 0,
            stop_ampm: "PM",
            stop_enabled: true,
            cycle_hour: 4,
            cycle_minute: 45,
            cycle_ampm: "AM",
            cycle_duration: 10,
            cycle_enabled: false,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
            next_on_date: null,
            next_off_date: null,
            next_cycle_date: null,
            currentState: false,
            status: "Initializing...",
            debug: false,
            pulseMode: true // Default to pulse mode
        };
    }

    data() {
        return { state: this.properties.currentState };
    }

    update() {
        if (this.change) this.change();
    }
}

export function TimeOfDayNodeComponent(props) {
    const { data, emit } = props;
    const [state, setState] = useState(data.properties);
    const [countdown, setCountdown] = useState("Calculating...");
    
    // Sync state with node properties
    const updateProperty = (key, value) => {
        data.properties[key] = value;
        setState(prev => ({ ...prev, [key]: value }));
        data.update();

        // Trigger recalculations if needed
        if ([
            'start_hour', 'start_minute', 'start_ampm', 'start_enabled',
            'stop_hour', 'stop_minute', 'stop_ampm', 'stop_enabled',
            'cycle_hour', 'cycle_minute', 'cycle_ampm', 'cycle_enabled',
            'timezone'
        ].includes(key)) {
            calculateTimes();
        }
    };

    const log = (message, level = 'info') => {
        if (state.debug || level === 'error') {
            console.log(`[TimeOfDayNode] ${message}`);
        }
    };

    const triggerPulse = useCallback(() => {
        log("Triggering Pulse...");
        
        if (data.properties.pulseMode) {
            // Pulse Mode: True -> Wait -> False
            data.properties.currentState = true;
            data.update();
            
            setTimeout(() => {
                data.properties.currentState = false;
                data.update();
                log("Pulse complete.");
            }, 500);
        } else {
            // Steady State: Toggle
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

    // Countdown Timer & Trigger Check
    useEffect(() => {
        const timer = setInterval(() => {
            const now = DateTime.local().setZone(data.properties.timezone);
            const nextOn = data.properties.next_on_date ? DateTime.fromJSDate(data.properties.next_on_date).setZone(data.properties.timezone) : null;
            const nextOff = data.properties.next_off_date ? DateTime.fromJSDate(data.properties.next_off_date).setZone(data.properties.timezone) : null;
            const nextCycle = data.properties.next_cycle_date ? DateTime.fromJSDate(data.properties.next_cycle_date).setZone(data.properties.timezone) : null;

            // Check for triggers
            if (nextOn && now >= nextOn) {
                log("Hit Start Time!");
                triggerPulse();
                calculateTimes();
            }
            
            if (nextOff && now >= nextOff) {
                log("Hit Stop Time!");
                triggerPulse();
                calculateTimes();
            }

            if (nextCycle && now >= nextCycle) {
                log("Hit Cycle Time!");
                // Cycle Logic: Trigger -> Wait Duration -> Trigger
                triggerPulse(); // First toggle (Off)
                
                setTimeout(() => {
                    log("Cycle Duration Complete - Triggering ON");
                    triggerPulse(); // Second toggle (On)
                }, data.properties.cycle_duration * 1000);

                calculateTimes();
            }

            // Determine next event for countdown
            let target = null;
            let label = "";
            
            // Simple logic to find the earliest next event
            const events = [
                { date: nextOn, label: "Until Start" },
                { date: nextOff, label: "Until Stop" },
                { date: nextCycle, label: "Until Cycle" }
            ].filter(e => e.date !== null).sort((a, b) => a.date - b.date);

            if (events.length > 0) {
                target = events[0].date;
                label = events[0].label;
            }

            if (target) {
                const diff = target.diff(now, ['hours', 'minutes', 'seconds']).toObject();
                setCountdown(`${label}: ${Math.floor(diff.hours)}h ${Math.floor(diff.minutes)}m ${Math.floor(diff.seconds)}s`);
            } else {
                setCountdown("No events scheduled");
            }

        }, 1000);
        return () => clearInterval(timer);
    }, [data.properties.next_on_date, data.properties.next_off_date, data.properties.next_cycle_date, triggerPulse, calculateTimes]);

    // Initial Calculation
    useEffect(() => {
        calculateTimes();
    }, []);

    const outputs = Object.entries(data.outputs).map(([key, output]) => ({ key, ...output }));

    return (
        <div className="time-of-day-node">
            <div className="title">
                {data.label}
                <div style={{ float: 'right', display: 'flex', alignItems: 'center' }}>
                    {outputs.map(output => (
                        <div key={output.key} style={{ display: "flex", alignItems: "center", gap: "8px" }} data-testid="output">
                            <div className="output-label" style={{ fontSize: '12px', marginRight: '5px' }}>{output.label}</div>
                            <RefComponent
                                init={(ref) => emit({
                                    type: 'render',
                                    data: { type: 'socket', element: ref, payload: output.socket, nodeId: data.id, side: 'output', key: output.key }
                                })}
                                unmount={(ref) => emit({ type: 'unmount', data: { element: ref } })}
                            />
                        </div>
                    ))}
                </div>
            </div>
            <div className="content" onPointerDown={(e) => e.stopPropagation()}>

                {/* Pulse Mode Control */}
                <div className="control-row">
                    <span className="control-label">Pulse Mode</span>
                    <input
                        type="checkbox"
                        checked={state.pulseMode}
                        onChange={(e) => updateProperty('pulseMode', e.target.checked)}
                    />
                </div>

                {/* Start Time Section */}
                <div className="section-header">Start Time</div>
                <div className="control-row">
                    <span className="control-label">Enabled</span>
                    <input
                        type="checkbox"
                        checked={state.start_enabled}
                        onChange={(e) => updateProperty('start_enabled', e.target.checked)}
                    />
                </div>
                <div className="control-row">
                    <span className="control-label">Hour: {state.start_hour}</span>
                    <input
                        type="range" min="1" max="12"
                        value={state.start_hour}
                        onChange={(e) => updateProperty('start_hour', parseInt(e.target.value))}
                        disabled={!state.start_enabled}
                        style={{ width: '60%' }}
                    />
                </div>
                <div className="control-row">
                    <span className="control-label">Minute: {state.start_minute}</span>
                    <input
                        type="range" min="0" max="59"
                        value={state.start_minute}
                        onChange={(e) => updateProperty('start_minute', parseInt(e.target.value))}
                        disabled={!state.start_enabled}
                        style={{ width: '60%' }}
                    />
                </div>
                <div className="control-row">
                    <span className="control-label">AM/PM</span>
                    <select
                        value={state.start_ampm}
                        onChange={(e) => updateProperty('start_ampm', e.target.value)}
                        disabled={!state.start_enabled}
                        style={{ width: '60%' }}
                    >
                        <option value="AM">AM</option>
                        <option value="PM">PM</option>
                    </select>
                </div>

                {/* Stop Time Section */}
                <div className="section-header">Stop Time</div>
                <div className="control-row">
                    <span className="control-label">Enabled</span>
                    <input
                        type="checkbox"
                        checked={state.stop_enabled}
                        onChange={(e) => updateProperty('stop_enabled', e.target.checked)}
                    />
                </div>
                <div className="control-row">
                    <span className="control-label">Hour: {state.stop_hour}</span>
                    <input
                        type="range" min="1" max="12"
                        value={state.stop_hour}
                        onChange={(e) => updateProperty('stop_hour', parseInt(e.target.value))}
                        disabled={!state.stop_enabled}
                        style={{ width: '60%' }}
                    />
                </div>
                <div className="control-row">
                    <span className="control-label">Minute: {state.stop_minute}</span>
                    <input
                        type="range" min="0" max="59"
                        value={state.stop_minute}
                        onChange={(e) => updateProperty('stop_minute', parseInt(e.target.value))}
                        disabled={!state.stop_enabled}
                        style={{ width: '60%' }}
                    />
                </div>
                <div className="control-row">
                    <span className="control-label">AM/PM</span>
                    <select
                        value={state.stop_ampm}
                        onChange={(e) => updateProperty('stop_ampm', e.target.value)}
                        disabled={!state.stop_enabled}
                        style={{ width: '60%' }}
                    >
                        <option value="AM">AM</option>
                        <option value="PM">PM</option>
                    </select>
                </div>

                {/* Power Cycle Section */}
                <div className="section-header">Power Cycle</div>
                <div className="control-row">
                    <span className="control-label">Enabled</span>
                    <input
                        type="checkbox"
                        checked={state.cycle_enabled}
                        onChange={(e) => updateProperty('cycle_enabled', e.target.checked)}
                    />
                </div>
                <div className="control-row">
                    <span className="control-label">Hour: {state.cycle_hour}</span>
                    <input
                        type="range" min="1" max="12"
                        value={state.cycle_hour}
                        onChange={(e) => updateProperty('cycle_hour', parseInt(e.target.value))}
                        disabled={!state.cycle_enabled}
                        style={{ width: '60%' }}
                    />
                </div>
                <div className="control-row">
                    <span className="control-label">Minute: {state.cycle_minute}</span>
                    <input
                        type="range" min="0" max="59"
                        value={state.cycle_minute}
                        onChange={(e) => updateProperty('cycle_minute', parseInt(e.target.value))}
                        disabled={!state.cycle_enabled}
                        style={{ width: '60%' }}
                    />
                </div>
                <div className="control-row">
                    <span className="control-label">AM/PM</span>
                    <select
                        value={state.cycle_ampm}
                        onChange={(e) => updateProperty('cycle_ampm', e.target.value)}
                        disabled={!state.cycle_enabled}
                        style={{ width: '60%' }}
                    >
                        <option value="AM">AM</option>
                        <option value="PM">PM</option>
                    </select>
                </div>
                <div className="control-row">
                    <span className="control-label">Duration (s)</span>
                    <input
                        type="number"
                        min="1"
                        value={state.cycle_duration}
                        onChange={(e) => updateProperty('cycle_duration', parseInt(e.target.value))}
                        disabled={!state.cycle_enabled}
                        style={{ width: '60%' }}
                    />
                </div>

                {/* Timezone Section */}
                <div className="section-header">Timezone</div>
                <div className="control-row">
                    <select
                        value={state.timezone}
                        onChange={(e) => updateProperty('timezone', e.target.value)}
                        style={{ width: '100%' }}
                    >
                        {Intl.supportedValuesOf('timeZone').map(tz => (
                            <option key={tz} value={tz}>{tz}</option>
                        ))}
                    </select>
                </div>

                {/* Status & Info */}
                <div className="info-display">
                    <div className="info-row">
                        <span className="info-label">Next Start:</span>
                        <span className="info-value">{state.next_on_date ? DateTime.fromJSDate(state.next_on_date).toFormat("hh:mm a") : "N/A"}</span>
                    </div>
                    <div className="info-row">
                        <span className="info-label">Next Stop:</span>
                        <span className="info-value">{state.next_off_date ? DateTime.fromJSDate(state.next_off_date).toFormat("hh:mm a") : "N/A"}</span>
                    </div>
                    <div className="info-row">
                        <span className="info-label">Next Cycle:</span>
                        <span className="info-value cycle">{state.next_cycle_date ? DateTime.fromJSDate(state.next_cycle_date).toFormat("hh:mm a") : "N/A"}</span>
                    </div>
                    <div className="countdown">{countdown}</div>
                </div>

                <div className={`status-text ${state.status.includes('Error') ? 'error' : 'info'}`}>
                    {state.status}
                </div>

            </div>
        </div>
    );
}
