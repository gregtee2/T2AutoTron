/**
 * StationScheduleNode.js
 * 
 * Schedule radio stations throughout the day. Add time entries with station
 * selections, and the node outputs the appropriate station number based on
 * current time. Wire the output to Audio Output's "📻 SpeakerName" input.
 * 
 * Uses same station registry as StationSelectorNode (T2StationRegistry).
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

    class StationScheduleNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("Station Schedule");
            this.changeCallback = changeCallback;
            this.width = 320;
            this.height = 280;

            this.properties = {
                stations: [...DEFAULT_STATIONS],
                // Schedule entries: [{ time: "06:00", stationIndex: 0, volume: 50 }, ...]
                schedule: [
                    { time: "06:00", stationIndex: 0, volume: 50 },
                    { time: "12:00", stationIndex: 1, volume: 50 },
                    { time: "18:00", stationIndex: 2, volume: 50 }
                ],
                lastOutputStation: null,
                lastOutputVolume: null,
                nodeWidth: 380,
                nodeHeight: 280
            };
            
            // Pulse mechanism for forcing station update
            this._pulseActive = false;
            this._lastActiveTime = null;  // Track when schedule entry changes

            // Outputs - wire to Audio Output's 📻 station and volume inputs
            this.addOutput('station', new ClassicPreset.Output(sockets.number, 'Station #'));
            this.addOutput('volume', new ClassicPreset.Output(sockets.number, 'Volume %'));
        }

        /**
         * Returns the station index that should be playing at the given time.
         * Finds the most recent schedule entry that has passed.
         */
        getCurrentStationIndex(schedule, currentTime) {
            if (!schedule || schedule.length === 0) return 0;

            // Parse current time
            const now = new Date();
            const currentMinutes = now.getHours() * 60 + now.getMinutes();

            // Sort schedule by time
            const sorted = [...schedule].sort((a, b) => {
                const [aH, aM] = a.time.split(':').map(Number);
                const [bH, bM] = b.time.split(':').map(Number);
                return (aH * 60 + aM) - (bH * 60 + bM);
            });

            // Find the most recent entry that has passed
            let activeEntry = sorted[sorted.length - 1]; // Default to last (wraps from previous day)
            
            for (const entry of sorted) {
                const [h, m] = entry.time.split(':').map(Number);
                const entryMinutes = h * 60 + m;
                if (entryMinutes <= currentMinutes) {
                    activeEntry = entry;
                }
            }

            return activeEntry.stationIndex;
        }

        data(inputs) {
            // If pulse is active, output null for one tick to create rising edge
            if (this._pulseActive) {
                this._pulseActive = false;
                // Schedule next tick to output real value
                setTimeout(() => {
                    if (this.changeCallback) this.changeCallback();
                }, 50);
                return { station: null, volume: null };
            }
            
            const activeEntry = this.getCurrentActiveEntry();
            const stationIndex = activeEntry?.stationIndex ?? 0;
            const volume = activeEntry?.volume ?? 50;
            
            // Detect when active schedule entry changes (for automatic edge)
            const activeTime = this.getActiveEntryTime();
            if (activeTime !== this._lastActiveTime) {
                this._lastActiveTime = activeTime;
                // Active entry changed - this naturally creates an edge if station changed
            }
            
            this.properties.lastOutputStation = stationIndex;
            this.properties.lastOutputVolume = volume;
            return { station: stationIndex, volume: volume };
        }
        
        // Get the full active schedule entry (including volume)
        getCurrentActiveEntry() {
            const schedule = this.properties.schedule;
            if (!schedule || schedule.length === 0) return null;
            
            const now = new Date();
            const currentMinutes = now.getHours() * 60 + now.getMinutes();
            
            const sorted = [...schedule].sort((a, b) => {
                const [aH, aM] = a.time.split(':').map(Number);
                const [bH, bM] = b.time.split(':').map(Number);
                return (aH * 60 + aM) - (bH * 60 + bM);
            });
            
            let activeEntry = sorted[sorted.length - 1];
            for (const entry of sorted) {
                const [h, m] = entry.time.split(':').map(Number);
                const entryMinutes = h * 60 + m;
                if (entryMinutes <= currentMinutes) {
                    activeEntry = entry;
                }
            }
            return activeEntry;
        }
        
        // Get the time of the currently active schedule entry
        getActiveEntryTime() {
            const schedule = this.properties.schedule;
            if (!schedule || schedule.length === 0) return null;
            
            const now = new Date();
            const currentMinutes = now.getHours() * 60 + now.getMinutes();
            
            const sorted = [...schedule].sort((a, b) => {
                const [aH, aM] = a.time.split(':').map(Number);
                const [bH, bM] = b.time.split(':').map(Number);
                return (aH * 60 + aM) - (bH * 60 + bM);
            });
            
            let activeEntry = sorted[sorted.length - 1];
            for (const entry of sorted) {
                const [h, m] = entry.time.split(':').map(Number);
                const entryMinutes = h * 60 + m;
                if (entryMinutes <= currentMinutes) {
                    activeEntry = entry;
                }
            }
            return activeEntry.time;
        }
        
        // Force a pulse to trigger connected Audio Output
        forcePlayNow() {
            console.log('[StationSchedule] ▶️ Play Now - sending pulse');
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
        }
    }

    function StationScheduleComponent({ data, emit }) {
        const [stations, setStations] = useState(data.properties.stations || [...DEFAULT_STATIONS]);
        const [schedule, setSchedule] = useState(data.properties.schedule || []);
        const [currentStation, setCurrentStation] = useState(null);
        const [nodeWidth, setNodeWidth] = useState(data.properties.nodeWidth || 320);
        const [nodeHeight, setNodeHeight] = useState(data.properties.nodeHeight || 280);
        
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

        // Update current station display every second
        useEffect(() => {
            const updateCurrent = () => {
                const idx = data.getCurrentStationIndex(data.properties.schedule, new Date());
                setCurrentStation(idx);
            };
            updateCurrent();
            const interval = setInterval(() => {
                updateCurrent();
                // Trigger re-evaluation so downstream nodes get updated
                if (data.changeCallback) data.changeCallback();
            }, 1000);
            return () => clearInterval(interval);
        }, [schedule]);

        const addEntry = () => {
            // Smart defaults: 1 hour after last entry, same station and volume
            let newTime = "12:00";
            let newStationIndex = 0;
            let newVolume = 50;
            
            if (schedule.length > 0) {
                // Find the latest entry by time
                const sorted = [...schedule].sort((a, b) => {
                    const [aH, aM] = a.time.split(':').map(Number);
                    const [bH, bM] = b.time.split(':').map(Number);
                    return (bH * 60 + bM) - (aH * 60 + aM); // Descending
                });
                const lastEntry = sorted[0];
                const [lastH, lastM] = lastEntry.time.split(':').map(Number);
                
                // Add 1 hour, wrap at 23:59
                let newH = lastH + 1;
                if (newH >= 24) newH = 23;
                newTime = `${String(newH).padStart(2, '0')}:${String(lastM).padStart(2, '0')}`;
                newStationIndex = lastEntry.stationIndex;
                newVolume = lastEntry.volume ?? 50;
            }
            
            const newSchedule = [...schedule, { time: newTime, stationIndex: newStationIndex, volume: newVolume }];
            setSchedule(newSchedule);
            data.properties.schedule = newSchedule;
            if (data.changeCallback) data.changeCallback();
        };

        const removeEntry = (index) => {
            const newSchedule = schedule.filter((_, i) => i !== index);
            setSchedule(newSchedule);
            data.properties.schedule = newSchedule;
            if (data.changeCallback) data.changeCallback();
        };

        const updateEntry = (index, field, value) => {
            const newSchedule = [...schedule];
            if (field === 'time') {
                newSchedule[index].time = value;
            } else if (field === 'stationIndex') {
                newSchedule[index].stationIndex = parseInt(value, 10);
            } else if (field === 'volume') {
                newSchedule[index].volume = Math.max(0, Math.min(100, parseInt(value, 10) || 50));
            }
            setSchedule(newSchedule);
            data.properties.schedule = newSchedule;
            if (data.changeCallback) data.changeCallback();
        };

        const outputs = Object.entries(data.outputs || {});
        const currentStationName = stations[currentStation]?.name || `Station ${currentStation}`;

        // Sort schedule for display
        const sortedSchedule = [...schedule].sort((a, b) => {
            const [aH, aM] = a.time.split(':').map(Number);
            const [bH, bM] = b.time.split(':').map(Number);
            return (aH * 60 + aM) - (bH * 60 + bM);
        });

        // Find which entry is currently active based on time
        const getActiveEntryTime = () => {
            if (sortedSchedule.length === 0) return null;
            const now = new Date();
            const currentMinutes = now.getHours() * 60 + now.getMinutes();
            
            let activeEntry = sortedSchedule[sortedSchedule.length - 1]; // Default to last
            for (const entry of sortedSchedule) {
                const [h, m] = entry.time.split(':').map(Number);
                const entryMinutes = h * 60 + m;
                if (entryMinutes <= currentMinutes) {
                    activeEntry = entry;
                }
            }
            return activeEntry.time;
        };
        const activeEntryTime = getActiveEntryTime();

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
                    // Play Now button - force send current station to Audio Output
                    el('button', {
                        key: 'play-now',
                        title: 'Send current station to Audio Output now',
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
                    }, `Now: ${currentStationName}`)
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
            }, sortedSchedule.map((entry, displayIndex) => {
                // Find the actual index in unsorted array
                const actualIndex = schedule.findIndex(e => e === entry);
                const isActive = entry.time === activeEntryTime;
                
                return el('div', { 
                    key: actualIndex, 
                    style: { 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '6px',
                        marginBottom: '4px',
                        padding: '4px',
                        background: isActive 
                            ? 'rgba(76, 175, 80, 0.15)' 
                            : 'transparent',
                        borderRadius: '4px',
                        border: isActive 
                            ? '2px solid #4caf50' 
                            : '1px solid transparent',
                        boxShadow: isActive 
                            ? '0 0 8px rgba(76, 175, 80, 0.3)' 
                            : 'none'
                    } 
                }, [
                    // Time input
                    el('input', {
                        key: 'time',
                        type: 'time',
                        value: entry.time,
                        onChange: (e) => updateEntry(actualIndex, 'time', e.target.value),
                        onPointerDown: (e) => e.stopPropagation(),
                        style: {
                            width: '80px',
                            padding: '4px',
                            borderRadius: '4px',
                            border: `1px solid ${THEME.border}`,
                            background: THEME.surface,
                            color: THEME.text,
                            fontSize: '11px'
                        }
                    }),
                    // Station dropdown
                    el('select', {
                        key: 'station',
                        value: entry.stationIndex,
                        onChange: (e) => updateEntry(actualIndex, 'stationIndex', e.target.value),
                        onPointerDown: (e) => e.stopPropagation(),
                        style: {
                            flex: 1,
                            padding: '4px',
                            borderRadius: '4px',
                            border: `1px solid ${THEME.border}`,
                            background: THEME.surface,
                            color: THEME.text,
                            fontSize: '11px'
                        }
                    }, stations.map((s, i) => el('option', { key: i, value: i }, `${i}: ${s.name}`))),
                    // Volume input
                    el('div', {
                        key: 'vol-container',
                        style: { display: 'flex', alignItems: 'center', gap: '2px' }
                    }, [
                        el('span', { key: 'vol-icon', style: { fontSize: '10px', opacity: 0.6 } }, '🔊'),
                        el('input', {
                            key: 'volume',
                            type: 'number',
                            min: 0,
                            max: 100,
                            value: entry.volume ?? 50,
                            onChange: (e) => updateEntry(actualIndex, 'volume', parseInt(e.target.value, 10) || 50),
                            onPointerDown: (e) => e.stopPropagation(),
                            style: {
                                width: '40px',
                                padding: '4px 2px',
                                borderRadius: '4px',
                                border: `1px solid ${THEME.border}`,
                                background: THEME.surface,
                                color: THEME.text,
                                fontSize: '10px',
                                textAlign: 'center'
                            }
                        })
                    ]),
                    // Remove button
                    el('button', {
                        key: 'remove',
                        onClick: () => removeEntry(actualIndex),
                        onPointerDown: (e) => e.stopPropagation(),
                        style: {
                            padding: '2px 6px',
                            borderRadius: '4px',
                            border: 'none',
                            background: 'rgba(224, 108, 117, 0.2)',
                            color: THEME.danger,
                            fontSize: '12px',
                            cursor: 'pointer'
                        }
                    }, '✕')
                ]);
            })),

            // Add entry button
            el('button', {
                key: 'add',
                onClick: addEntry,
                onPointerDown: (e) => e.stopPropagation(),
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
            }, '+ Add Entry'),

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
