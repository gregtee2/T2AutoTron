/**
 * StationScheduleNode.js
 * 
 * Schedule which station plays on which speakers, when, and how loud. Each row is
 * days + start/end time + speakers + station + volume + announcement volume.
 * The Program output drives Audio Output's single Program input. Lower rows win
 * when rows overlap for the same speaker. Rows without speakers still drive the
 * legacy Station #/Volume outputs.
 * 
 * Uses the station and speaker registry published by Audio Output (T2StationRegistry).
 */

(function() {
    'use strict';

    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets) {
        console.warn('[StationScheduleNode] Missing dependencies');
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect, useRef } = React;
    const sockets = window.sockets;
    const el = React.createElement;
    const RefComponent = window.RefComponent;

    const DEFAULT_STATIONS = [
        { name: 'Station 1', url: '' },
        { name: 'Station 2', url: '' },
        { name: 'Station 3', url: '' }
    ];

    const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

    function newRowId() {
        return `row_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    }

    function clampInput(value, fallback) {
        const number = parseInt(value, 10);
        return Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : fallback;
    }

    class StationScheduleNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("Station Schedule");
            this.changeCallback = changeCallback;
            this.width = 440;
            this.height = 320;

            this.properties = {
                stations: [...DEFAULT_STATIONS],
                // Rows: [{ id, days, start, end, speakers, stationIndex, volume, ttsVolume }]
                schedule: [],
                lastOutputStation: null,
                lastOutputVolume: null,
                nodeWidth: 440,
                nodeHeight: 320
            };

            // Pulse mechanism for forcing a legacy station update
            this._pulseActive = false;
            // Bumped by the Play button so Audio Output re-applies the current program
            this._revision = 0;

            this.addOutput('program', new ClassicPreset.Output(sockets.object || new ClassicPreset.Socket('object'), 'Program'));
            // Legacy outputs - wire to Audio Output's 📻 station and 🔊 volume inputs
            this.addOutput('station', new ClassicPreset.Output(sockets.number, 'Station #'));
            this.addOutput('volume', new ClassicPreset.Output(sockets.number, 'Volume %'));
        }

        // Rows in the current format; converts old start-time-only schedules on first use.
        getRows() {
            const logic = window.T2SharedLogic || {};
            if (logic.isLegacySchedule && logic.isLegacySchedule(this.properties.schedule)) {
                this.properties.schedule = logic.migrateLegacySchedule(this.properties.schedule);
            }
            return Array.isArray(this.properties.schedule) ? this.properties.schedule : [];
        }

        data() {
            const logic = window.T2SharedLogic || {};
            // Until shared logic loads, send nothing so Audio Output doesn't baseline an empty program.
            if (!logic.buildAudioProgram) return { program: undefined, station: null, volume: null };

            const rows = this.getRows();
            const now = new Date();
            const program = { ...logic.buildAudioProgram(rows, this.properties.stations, now), revision: this._revision };

            // Legacy pulse: output null for one tick to create a rising edge on station inputs
            if (this._pulseActive) {
                this._pulseActive = false;
                setTimeout(() => {
                    if (this.changeCallback) this.changeCallback();
                }, 50);
                return { program, station: null, volume: null };
            }

            const legacy = logic.getLegacyStationOutput(rows, now);
            this.properties.lastOutputStation = legacy.station;
            this.properties.lastOutputVolume = legacy.volume;
            return { program, station: legacy.station, volume: legacy.volume };
        }

        // Play button: re-send the current schedule to Audio Output now
        forcePlayNow() {
            this._revision++;
            this._pulseActive = true;
            if (this.changeCallback) this.changeCallback();
        }

        serialize() {
            return {
                stations: this.properties.stations,
                schedule: this.properties.schedule,
                nodeWidth: this.properties.nodeWidth,
                nodeHeight: this.properties.nodeHeight
            };
        }

        restore(state) {
            const props = state.properties || state;
            if (props.stations !== undefined) this.properties.stations = props.stations;
            if (props.schedule !== undefined) this.properties.schedule = props.schedule;
            if (props.nodeWidth !== undefined) this.properties.nodeWidth = props.nodeWidth;
            if (props.nodeHeight !== undefined) this.properties.nodeHeight = props.nodeHeight;
            this.getRows();
        }
    }

    function StationScheduleComponent({ data, emit }) {
        const [stations, setStations] = useState(data.properties.stations || [...DEFAULT_STATIONS]);
        const [schedule, setSchedule] = useState(() => data.getRows());
        const [speakers, setSpeakers] = useState(window.T2StationRegistry?.speakers || []);
        const [now, setNow] = useState(() => new Date());
        const draggedEntryIndexRef = useRef(null);
        const [nodeWidth, setNodeWidth] = useState(data.properties.nodeWidth || 440);
        const [nodeHeight, setNodeHeight] = useState(data.properties.nodeHeight || 320);
        
        const THEME = window.T2Controls?.THEME || {
            surface: '#1e2530',
            surfaceLight: '#2a3441',
            text: '#e0e0e0',
            textMuted: '#888',
            border: 'rgba(95, 179, 179, 0.3)',
            accent: '#5fb3b3',
            danger: '#e06c75'
        };

        // Resize handler
        const handleResizeStart = (e) => {
            e.stopPropagation();
            e.preventDefault();
            
            const target = e.currentTarget;
            target.setPointerCapture(e.pointerId);
            
            const startX = e.clientX;
            const startY = e.clientY;
            const startWidth = nodeWidth;
            const startHeight = nodeHeight;
            const pointerId = e.pointerId;

            // Get zoom scale from parent transform
            const getScale = () => {
                let el = target;
                while (el && el !== document.body) {
                    const transform = window.getComputedStyle(el).transform;
                    if (transform && transform !== 'none') {
                        const matrix = new DOMMatrix(transform);
                        if (matrix.a !== 1) return matrix.a;
                    }
                    el = el.parentElement;
                }
                return 1;
            };
            const scale = getScale();

            const handleMove = (moveEvent) => {
                if (moveEvent.pointerId !== pointerId) return;
                moveEvent.preventDefault();
                moveEvent.stopPropagation();

                const deltaX = (moveEvent.clientX - startX) / scale;
                const deltaY = (moveEvent.clientY - startY) / scale;

                const newWidth = Math.max(280, Math.min(500, startWidth + deltaX));
                const newHeight = Math.max(180, Math.min(600, startHeight + deltaY));

                setNodeWidth(newWidth);
                setNodeHeight(newHeight);
                data.properties.nodeWidth = newWidth;
                data.properties.nodeHeight = newHeight;
            };

            const handleUp = (upEvent) => {
                if (upEvent.pointerId !== pointerId) return;
                target.releasePointerCapture(pointerId);
                target.removeEventListener('pointermove', handleMove);
                target.removeEventListener('pointerup', handleUp);
                target.removeEventListener('pointercancel', handleUp);
                if (data.changeCallback) data.changeCallback();
            };

            target.addEventListener('pointermove', handleMove);
            target.addEventListener('pointerup', handleUp);
            target.addEventListener('pointercancel', handleUp);
        };

        // Refresh stations from registry
        const refreshStations = () => {
            if (window.T2StationRegistry?.stations?.length > 0) {
                const registryStations = window.T2StationRegistry.stations;
                setStations([...registryStations]);
                data.properties.stations = [...registryStations];
                console.log('[StationSchedule] Refreshed stations:', registryStations.length);
            } else {
                console.log('[StationSchedule] No stations in registry yet');
            }
        };

        // Sync stations from Audio Output's global registry
        useEffect(() => {
            // Check immediately
            if (window.T2StationRegistry?.stations?.length > 0) {
                const registryStations = window.T2StationRegistry.stations;
                if (registryStations.length !== stations.length) {
                    setStations([...registryStations]);
                    data.properties.stations = [...registryStations];
                }
            }
            
            // Listen for registry updates (fired by Audio Output)
            const handleRegistryUpdate = () => {
                if (window.T2StationRegistry?.stations?.length > 0) {
                    const registryStations = window.T2StationRegistry.stations;
                    setStations([...registryStations]);
                    data.properties.stations = [...registryStations];
                }
            };
            window.addEventListener('t2-station-registry-update', handleRegistryUpdate);
            
            // Also poll in case event was missed
            const interval = setInterval(() => {
                if (window.T2StationRegistry?.stations?.length > 0) {
                    const registryStations = window.T2StationRegistry.stations;
                    if (registryStations.length !== stations.length) {
                        setStations([...registryStations]);
                        data.properties.stations = [...registryStations];
                    }
                }
            }, 3000);
            
            return () => {
                window.removeEventListener('t2-station-registry-update', handleRegistryUpdate);
                clearInterval(interval);
            };
        }, [stations.length]);

        // Speakers come from Audio Output's selected speakers
        useEffect(() => {
            const syncSpeakers = () => {
                const registrySpeakers = window.T2StationRegistry?.speakers || [];
                setSpeakers(prev => (JSON.stringify(prev) === JSON.stringify(registrySpeakers) ? prev : [...registrySpeakers]));
            };
            syncSpeakers();
            window.addEventListener('t2-station-registry-update', syncSpeakers);
            const interval = setInterval(syncSpeakers, 3000);
            return () => {
                window.removeEventListener('t2-station-registry-update', syncSpeakers);
                clearInterval(interval);
            };
        }, []);

        // Tick every second so rows start and stop on time
        useEffect(() => {
            const interval = setInterval(() => {
                const rows = data.getRows();
                setSchedule(prev => (prev === rows ? prev : rows));
                setNow(new Date());
                if (data.changeCallback) data.changeCallback();
            }, 1000);
            return () => clearInterval(interval);
        }, []);

        const commitRows = (rows) => {
            setSchedule(rows);
            data.properties.schedule = rows;
            if (data.changeCallback) data.changeCallback();
        };

        const addRow = () => {
            const last = schedule[schedule.length - 1];
            const row = last
                ? { ...last, id: newRowId(), days: [...(last.days || [])], speakers: [...(last.speakers || [])] }
                : { id: newRowId(), days: [], start: '18:00', end: '21:00', speakers: speakers[0] ? [speakers[0].id] : [], stationIndex: 0, volume: 40, ttsVolume: null };
            commitRows([...schedule, row]);
        };

        const removeRow = (index) => commitRows(schedule.filter((_, i) => i !== index));

        const updateRow = (index, changes) => commitRows(schedule.map((row, i) => (i === index ? { ...row, ...changes } : row)));

        const toggleDay = (index, day) => {
            const current = schedule[index].days?.length ? schedule[index].days : ALL_DAYS;
            const next = current.includes(day) ? current.filter(d => d !== day) : [...current, day].sort((a, b) => a - b);
            if (next.length === 0) return;
            updateRow(index, { days: next.length === 7 ? [] : next });
        };

        const toggleSpeaker = (index, speakerId) => {
            const current = schedule[index].speakers || [];
            updateRow(index, { speakers: current.includes(speakerId) ? current.filter(id => id !== speakerId) : [...current, speakerId] });
        };

        const moveRow = (fromIndex, toIndex) => {
            if (fromIndex === toIndex || fromIndex === null || toIndex === null) return;
            const rows = [...schedule];
            const [row] = rows.splice(fromIndex, 1);
            rows.splice(toIndex, 0, row);
            commitRows(rows);
        };

        const outputs = Object.entries(data.outputs || {});
        const logic = window.T2SharedLogic || {};
        const activeRows = logic.getActiveOccurrence ? schedule.filter(row => logic.getActiveOccurrence(row, now)) : [];
        const activeRowIds = new Set(activeRows.map(row => row.id));
        const nowSummary = activeRows.length === 0
            ? 'Now: nothing scheduled'
            : activeRows.length === 1
                ? `Now: ${stations[activeRows[0].stationIndex]?.name || 'station'}`
                : `Now: ${activeRows.length} rows`;

        const stop = (e) => e.stopPropagation();
        const lineStyle = { display: 'flex', alignItems: 'center', gap: '5px' };
        const fieldStyle = {
            padding: '3px 4px',
            borderRadius: '4px',
            border: `1px solid ${THEME.border}`,
            background: THEME.surface,
            color: THEME.text,
            fontSize: '11px'
        };
        const timeStyle = { ...fieldStyle, width: '82px' };
        const numberStyle = { ...fieldStyle, width: '40px', textAlign: 'center', fontSize: '10px' };
        const iconStyle = { fontSize: '10px', opacity: 0.7 };
        const chipStyle = (on, width) => ({
            width: width || 'auto',
            padding: width ? '2px 0' : '2px 7px',
            borderRadius: '10px',
            border: `1px solid ${on ? THEME.accent : THEME.border}`,
            background: on ? 'rgba(95, 179, 179, 0.25)' : 'transparent',
            color: on ? THEME.text : THEME.textMuted,
            fontSize: '10px',
            lineHeight: 1.2,
            cursor: 'pointer'
        });

        // Calculate dynamic height for schedule list based on node height
        const scheduleListHeight = Math.max(80, nodeHeight - 150);

        return el('div', { 
            className: 'station-schedule-node node-bg-gradient',
            style: { 
                borderRadius: '8px',
                padding: '10px',
                width: nodeWidth + 'px',
                minWidth: '280px',
                maxWidth: '500px',
                minHeight: nodeHeight + 'px',
                color: THEME.text,
                position: 'relative'
            } 
        }, [
            // Header
            el('div', { 
                key: 'header', 
                style: { 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    marginBottom: '8px',
                    borderBottom: `1px solid ${THEME.border}`,
                    paddingBottom: '6px'
                } 
            }, [
                el('div', { key: 'title-area', style: { display: 'flex', alignItems: 'center', gap: '6px' } }, [
                    el('span', { key: 'icon' }, '📻'),
                    el('span', { key: 'title', style: { fontWeight: '600', fontSize: '12px' } }, 'Station Schedule')
                ]),
                // Play Now, Refresh button and current station indicator
                el('div', { 
                    key: 'right-header', 
                    style: { display: 'flex', alignItems: 'center', gap: '6px' } 
                }, [
                    // Play Now button - re-send the current schedule to Audio Output
                    el('button', {
                        key: 'play-now',
                        title: 'Apply the current schedule to Audio Output now',
                        onClick: () => data.forcePlayNow(),
                        onPointerDown: (e) => e.stopPropagation(),
                        style: {
                            background: 'rgba(76, 175, 80, 0.2)',
                            border: '1px solid rgba(76, 175, 80, 0.4)',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '10px',
                            padding: '2px 6px',
                            color: '#4caf50'
                        }
                    }, '▶️ Play'),
                    // Refresh button
                    el('button', {
                        key: 'refresh',
                        title: 'Refresh stations from Audio Output',
                        onClick: refreshStations,
                        onPointerDown: (e) => e.stopPropagation(),
                        style: {
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '12px',
                            padding: '2px',
                            opacity: 0.7
                        }
                    }, '🔄'),
                    // Current station indicator
                    el('div', { 
                        key: 'current', 
                        style: { 
                            fontSize: '10px', 
                            color: THEME.accent,
                            background: 'rgba(95, 179, 179, 0.15)',
                            padding: '2px 6px',
                            borderRadius: '4px'
                        } 
                    }, nowSummary)
                ])
            ]),

            // Schedule entries
            el('div', { 
                key: 'schedule', 
                onPointerDown: (e) => e.stopPropagation(),
                onWheel: (e) => e.stopPropagation(),
                style: { 
                    maxHeight: scheduleListHeight + 'px', 
                    overflowY: 'auto',
                    marginBottom: '8px',
                    paddingRight: '4px'
                } 
            }, schedule.map((row, index) => {
                const isActive = activeRowIds.has(row.id);
                const rowSpeakers = Array.isArray(row.speakers) ? row.speakers : [];
                const rowDays = Array.isArray(row.days) && row.days.length > 0 ? row.days : ALL_DAYS;
                const speakerChoices = [
                    ...speakers,
                    ...rowSpeakers
                        .filter(id => !speakers.some(speaker => speaker.id === id))
                        .map(id => ({ id, name: id.replace('media_player.', '') }))
                ];

                return el('div', {
                    key: row.id || index,
                    onDragOver: (e) => e.preventDefault(),
                    onDrop: (e) => {
                        e.preventDefault();
                        moveRow(draggedEntryIndexRef.current, index);
                        draggedEntryIndexRef.current = null;
                    },
                    style: {
                        marginBottom: '6px',
                        padding: '6px',
                        borderRadius: '6px',
                        background: isActive ? 'rgba(76, 175, 80, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                        border: isActive ? '1px solid #4caf50' : `1px solid ${THEME.border}`
                    }
                }, [
                    // When: drag handle, days, start-end, remove
                    el('div', { key: 'when', style: lineStyle }, [
                        el('span', {
                            key: 'drag-handle',
                            draggable: true,
                            title: 'Drag to reorder (lower rows win when they overlap)',
                            onDragStart: (e) => {
                                e.stopPropagation();
                                e.dataTransfer.effectAllowed = 'move';
                                draggedEntryIndexRef.current = index;
                            },
                            onDragEnd: () => { draggedEntryIndexRef.current = null; },
                            onPointerDown: stop,
                            style: { cursor: 'grab', color: THEME.textMuted, fontSize: '14px', lineHeight: 1, userSelect: 'none' }
                        }, '⋮⋮'),
                        el('div', { key: 'days', style: { display: 'flex', gap: '2px' } }, DAY_LABELS.map((label, day) => el('button', {
                            key: day,
                            title: DAY_NAMES[day],
                            onClick: () => toggleDay(index, day),
                            onPointerDown: stop,
                            style: chipStyle(rowDays.includes(day), '18px')
                        }, label))),
                        el('input', {
                            key: 'start',
                            type: 'time',
                            title: 'Start',
                            value: row.start || '',
                            onChange: (e) => updateRow(index, { start: e.target.value }),
                            onPointerDown: stop,
                            style: timeStyle
                        }),
                        el('span', { key: 'to', style: { color: THEME.textMuted, fontSize: '11px' } }, '–'),
                        el('input', {
                            key: 'end',
                            type: 'time',
                            title: 'End (speakers stop)',
                            value: row.end || '',
                            onChange: (e) => updateRow(index, { end: e.target.value }),
                            onPointerDown: stop,
                            style: timeStyle
                        }),
                        el('button', {
                            key: 'remove',
                            title: 'Remove row',
                            onClick: () => removeRow(index),
                            onPointerDown: stop,
                            style: {
                                marginLeft: 'auto',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                border: 'none',
                                background: 'rgba(224, 108, 117, 0.2)',
                                color: THEME.danger,
                                fontSize: '12px',
                                cursor: 'pointer'
                            }
                        }, '✕')
                    ]),
                    // Where: speakers
                    el('div', {
                        key: 'speakers',
                        title: rowSpeakers.length === 0 ? 'No speakers: this row only drives the Station #/Volume outputs' : '',
                        style: { display: 'flex', flexWrap: 'wrap', gap: '3px', margin: '5px 0' }
                    }, speakerChoices.length > 0
                        ? speakerChoices.map(speaker => el('button', {
                            key: speaker.id,
                            title: speaker.id,
                            onClick: () => toggleSpeaker(index, speaker.id),
                            onPointerDown: stop,
                            style: chipStyle(rowSpeakers.includes(speaker.id))
                        }, speaker.name))
                        : [el('span', { key: 'hint', style: { fontSize: '10px', color: THEME.textMuted } }, 'Select speakers in Audio Output to schedule them')]
                    ),
                    // What: station, volume, announcement volume
                    el('div', { key: 'what', style: lineStyle }, [
                        el('select', {
                            key: 'station',
                            value: row.stationIndex ?? 0,
                            onChange: (e) => updateRow(index, { stationIndex: parseInt(e.target.value, 10) }),
                            onPointerDown: stop,
                            style: { ...fieldStyle, flex: 1, minWidth: 0 }
                        }, stations.map((s, i) => el('option', { key: i, value: i }, `${i}: ${s.name}`))),
                        el('span', { key: 'vol-icon', title: 'Station volume', style: iconStyle }, '🔊'),
                        el('input', {
                            key: 'volume',
                            type: 'number',
                            min: 0,
                            max: 100,
                            title: 'Station volume %',
                            value: row.volume ?? 50,
                            onChange: (e) => updateRow(index, { volume: clampInput(e.target.value, 50) }),
                            onPointerDown: stop,
                            style: numberStyle
                        }),
                        el('span', { key: 'tts-icon', title: 'Announcement volume', style: iconStyle }, '🗣'),
                        el('input', {
                            key: 'tts-volume',
                            type: 'number',
                            min: 0,
                            max: 100,
                            placeholder: 'auto',
                            title: 'Announcement volume % (blank = Audio Output setting)',
                            value: row.ttsVolume ?? '',
                            onChange: (e) => updateRow(index, { ttsVolume: e.target.value === '' ? null : clampInput(e.target.value, null) }),
                            onPointerDown: stop,
                            style: numberStyle
                        })
                    ])
                ]);
            })),

            // Add row button
            el('button', {
                key: 'add',
                onClick: addRow,
                onPointerDown: stop,
                style: {
                    width: '100%',
                    padding: '6px',
                    borderRadius: '4px',
                    border: `1px dashed ${THEME.border}`,
                    background: 'transparent',
                    color: THEME.textMuted,
                    fontSize: '11px',
                    cursor: 'pointer',
                    marginBottom: '8px'
                }
            }, '+ Add Row'),

            // Output sockets - stacked vertically
            el('div', { 
                key: 'outputs', 
                style: { 
                    display: 'flex', 
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                    gap: '4px',
                    borderTop: `1px solid ${THEME.border}`,
                    paddingTop: '8px'
                } 
            }, outputs.map(([key, output]) =>
                el('div', { 
                    key, 
                    style: { display: 'flex', alignItems: 'center', gap: '4px' } 
                }, [
                    el('span', { 
                        key: 'label', 
                        style: { fontSize: '10px', color: THEME.textMuted } 
                    }, output.label || key),
                    el(RefComponent, {
                        key: 'socket',
                        init: ref => emit({ 
                            type: 'render', 
                            data: { 
                                type: 'socket', 
                                side: 'output', 
                                key, 
                                nodeId: data.id, 
                                element: ref, 
                                payload: output.socket 
                            } 
                        })
                    })
                ])
            )),

            // Resize handle (bottom-right corner)
            el('div', {
                key: 'resize-handle',
                style: {
                    position: 'absolute',
                    bottom: '4px',
                    right: '4px',
                    width: '16px',
                    height: '16px',
                    cursor: 'nwse-resize',
                    opacity: 0.6,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    color: THEME.accent,
                    userSelect: 'none'
                },
                onPointerDown: handleResizeStart,
                title: 'Drag to resize node'
            }, '⤡')
        ]);
    }

    if (window.nodeRegistry) {
        window.nodeRegistry.register('StationScheduleNode', {
            label: "Station Schedule",
            category: "Media",
            nodeClass: StationScheduleNode,
            component: StationScheduleComponent,
            factory: (cb) => new StationScheduleNode(cb)
        });
        console.log('[StationScheduleNode] ✅ Registered');
    }

})();
